import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
  Image,
  Linking,
  Platform,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../theme/colors';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function LessonPlanAndExcelModals({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    excelModalVisible,
    setExcelModalVisible,
    excelParsing,
    parsedExcelStudents,
    excelSchoolName,
    detectedExcelClasses,
    handleConfirmAndSaveExcelStudents,
    excelSaving,
    teacherExcelModalVisible,
    setTeacherExcelModalVisible,
    teacherExcelParsing,
    parsedExcelTeachers,
    teachers,
    handleConfirmAndSaveExcelTeachers,
    teacherExcelSaving,
    aiStudentModalVisible,
    setAiStudentModalVisible,
    aiStudentParsing,
    aiStudentResult,
    handleConfirmAndSaveAiStudents,
    aiStudentSaving,
    classStudentsModalVisible,
    setClassStudentsModalVisible,
    selectedClassForStudents,
    students,
    setNewStudentGrade,
    setNewStudentSection,
    setAddStudentModalVisible,
    setSelectedClassFilter,
    setActiveTab,
    serverBaseUrl,
    photoUploadingId,
    handleOpenStudentDetail,
    handlePickAndUploadPhoto,
    handleOpenCredentialsModal,
    handleShareViaWhatsApp,
    setEditingStudent,
    setEditStudentModalVisible,
    handleDeleteStudent,
    adminCredentialsModalVisible,
    setAdminCredentialsModalVisible,
    adminNewUsername,
    setAdminNewUsername,
    adminOldPassword,
    setAdminOldPassword,
    adminNewPassword,
    setAdminNewPassword,
    adminConfirmPassword,
    setAdminConfirmPassword,
    handleSaveAdminCredentials,
    savingAdminCredentials,
    editLessonModalVisible,
    setEditLessonModalVisible,
    editLessonName,
    setEditLessonName,
    editLessonCode,
    setEditLessonCode,
    editLessonGrade,
    setEditLessonGrade,
    editLessonHours,
    setEditLessonHours,
    handleSaveLessonEdit,
    updatingLesson,
    planSheetPickerVisible,
    setPlanSheetPickerVisible,
    planSheetPickerLesson,
    planSheetPickerAsset,
    planSheetPickerSheets,
    handleProceedWithPlanSheet,
    yearlyPlanModalVisible,
    selectedLessonForPlan,
    setYearlyPlanModalVisible,
    analyzingPlanFile,
    docAnalysis,
    setPlanSheetPickerSheets,
    handleSwitchPlanSheet,
    selectedMapping,
    setSelectedMapping,
    handleDownloadYearlyPlanTemplate,
    handleConfirmAndSaveYearlyPlan,
    savingPlanRows,
    viewPlanModalVisible,
    viewPlanItems,
    selectedLessonForViewPlan,
    setViewPlanModalVisible,
    planSearch,
    setPlanSearch,
    handlePickYearlyPlanFile,
    handleDeleteYearlyPlan,
    deletingPlan,
    loadingViewPlan,
    scheduleResetModalVisible,
    setScheduleResetModalVisible,
    handleClearAllSchedules,
    allSchoolSchedules,
    handleClearCurrentClassSchedule,
    selectedClassForEditor,
    classes,
    handleClearCurrentTeacherSchedule,
    selectedTeacherForEditor,
    handleDeleteAllTeachers,
    handleDeleteAllClasses,
    teacherScheduleModalVisible,
    selectedTeacherForSchedule,
    setTeacherScheduleModalVisible,
    handlePickSingleTeacherSchedulePhoto,
    handleOpenSlotModal,
    editingCounselorClass,
    savingCounselorClass,
    handleSaveTeacherCounselorClass,
    loadingTeacherSchedule,
    teacherScheduleItems,
    slotModalVisible,
    editingSlotData,
    setSlotModalVisible,
    slotConflictItems,
    setEditingSlotData,
    handleDeleteSpecificConflictItem,
    slotLessonSearchQuery,
    setSlotLessonSearchQuery,
    filteredSlotLessons,
    normalizeSearchStr,
    slotTeacherSearchQuery,
    setSlotTeacherSearchQuery,
    filteredSlotTeachers,
    normalizeTeacherMatch,
    handleSaveSlot,
    savingSlot,
    handleDeleteSlot,
    singleTeacherModalVisible,
    singleTeacherPreview,
    setSingleTeacherModalVisible,
    setSingleTeacherPreview,
    singleTeacherParsing,
    handleSaveSingleTeacherSchedule,
    savingSingleTeacher
  } = ctx;

  return (
    <>
      <Modal visible={excelModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Excel Öğrenci Aktarımı</Text>
              <TouchableOpacity onPress={() => setExcelModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {excelParsing ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.aiLoadingText}>Excel dosyası inceleniyor...</Text>
                <Text style={styles.aiLoadingSub}>e-Okul sınıf listesi ve öğrenci kayıtları ayrıştırılıyor.</Text>
              </View>
            ) : parsedExcelStudents.length > 0 ? (
              <View style={styles.parsedPreview}>
                <Text style={styles.previewSuccessTitle}>🎉 Excel Ayrıştırma Başarılı!</Text>

                {excelSchoolName && (
                  <View style={{ backgroundColor: '#F0FDF4', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#BBF7D0' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', textAlign: 'center' }}>
                      🏫 {excelSchoolName}
                    </Text>
                  </View>
                )}

                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{parsedExcelStudents.length}</Text>
                    <Text style={styles.previewLbl}>Öğrenci</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{detectedExcelClasses.length}</Text>
                    <Text style={styles.previewLbl}>Sınıf / Şube</Text>
                  </View>
                </View>

                <Text style={styles.previewNote}>
                  Tespit edilen {detectedExcelClasses.length} şube ve {parsedExcelStudents.length} öğrenci doğrudan okulunuzun sunucu veritabanına tek seferde aktarılacak.
                </Text>

                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#059669' }]}
                  onPress={handleConfirmAndSaveExcelStudents}
                  disabled={excelSaving}
                >
                  {excelSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.confirmSaveText}>Onayla & Sunucuya Aktar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={teacherExcelModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Excel Öğretmen Kadrosu Aktarımı</Text>
              <TouchableOpacity onPress={() => setTeacherExcelModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {teacherExcelParsing ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.aiLoadingText}>Öğretmen Excel dosyası inceleniyor...</Text>
                <Text style={styles.aiLoadingSub}>Öğretmen kadrosu, branş ve unvan kayıtları ayrıştırılıyor.</Text>
              </View>
            ) : parsedExcelTeachers.length > 0 ? (
              <View style={styles.parsedPreview}>
                <Text style={styles.previewSuccessTitle}>🎉 Excel Ayrıştırma Başarılı!</Text>

                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{parsedExcelTeachers.length}</Text>
                    <Text style={styles.previewLbl}>Toplam Öğretmen</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#2563EB' }]}>
                      {parsedExcelTeachers.filter((t: any) => teachers.some((et: any) => (t.username && et.username?.toLowerCase() === t.username.toLowerCase()) || et.fullName?.toLowerCase() === t.fullName?.toLowerCase())).length}
                    </Text>
                    <Text style={styles.previewLbl}>Güncellenecek</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#7C3AED' }]}>
                      {parsedExcelTeachers.filter((t: any) => !teachers.some((et: any) => (t.username && et.username?.toLowerCase() === t.username.toLowerCase()) || et.fullName?.toLowerCase() === t.fullName?.toLowerCase())).length}
                    </Text>
                    <Text style={styles.previewLbl}>Yeni Eklenecek</Text>
                  </View>
                </View>

                <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginVertical: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="shield-checkmark" size={16} color="#059669" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>Kullanıcı Giriş Güvenliği Korunur</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#475569', lineHeight: 17 }}>
                    Mevcut öğretmenlerin şifresi ve kullanıcı adı kesinlikle korunur, asla sıfırlanmaz. Yeni eklenen öğretmenlere sistem otomatik kullanıcı adı ve varsayılan 1234 şifresi tanımlar.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#059669' }]}
                  onPress={handleConfirmAndSaveExcelTeachers}
                  disabled={teacherExcelSaving}
                >
                  {teacherExcelSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.confirmSaveText}>Onayla & Kadroya Aktar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={aiStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', width: Platform.OS === 'web' ? 700 : '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={22} color="#8B5CF6" />
                <Text style={styles.modalTitle}>✨ AI ile Excel Öğrenci Aktarımı</Text>
              </View>
              <TouchableOpacity onPress={() => setAiStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {aiStudentParsing ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.aiLoadingText}>Yapay Zeka Excel Tablosunu Çözümlüyor...</Text>
                <Text style={styles.aiLoadingSub}>
                  Sütunlar (Okul No, Ad Soyad, Sınıf, Şube vb.) haritalandırılıyor, boş ve gereksiz satırlar eleniyor.
                </Text>
              </View>
            ) : aiStudentResult && aiStudentResult.students.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                {/* AI Başlık ve Model Rozeti */}
                <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#DDD6FE', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#6D28D9' }}>
                      🤖 {aiStudentResult.modelUsed || 'Gemini Flash'} ile Çözümlendi
                    </Text>
                    {aiStudentResult.schoolName && (
                      <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#5B21B6' }}>
                          🏫 {aiStudentResult.schoolName}
                        </Text>
                      </View>
                    )}
                  </View>
                  {aiStudentResult.aiReason && (
                    <Text style={{ fontSize: 12, color: '#4C1D95', lineHeight: 18 }}>
                      {aiStudentResult.aiReason}
                    </Text>
                  )}
                </View>

                {/* İstatistik Sayaçları */}
                <View style={[styles.previewGrid, { marginBottom: 12 }]}>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#8B5CF6' }]}>{aiStudentResult.students.length}</Text>
                    <Text style={styles.previewLbl}>Öğrenci</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{aiStudentResult.detectedClasses.length}</Text>
                    <Text style={styles.previewLbl}>Sınıf / Şube</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#D97706' }]}>{aiStudentResult.skippedRowsCount}</Text>
                    <Text style={styles.previewLbl}>Atlanan Satır</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#64748B' }]}>{aiStudentResult.totalRawRows}</Text>
                    <Text style={styles.previewLbl}>Toplam Satır</Text>
                  </View>
                </View>

                {/* Tespit Edilen Sınıflar Rozetleri */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 }}>
                  Tespit Edilen Sınıflar ({aiStudentResult.detectedClasses.length}):
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {aiStudentResult.detectedClasses.map((cls: any) => (
                    <View key={cls} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#4338CA' }}>{cls}</Text>
                    </View>
                  ))}
                </View>

                {/* İlk 6 Öğrenci Önizleme Listesi */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 }}>
                  Örnek Öğrenci Önizlemesi (İlk {Math.min(aiStudentResult.students.length, 6)} Kayıt):
                </Text>
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 8, marginBottom: 14 }}>
                  {aiStudentResult.students.slice(0, 6).map((s: any, idx: any) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 6,
                        borderBottomWidth: idx < 5 && idx < (aiStudentResult?.students.length ?? 0) - 1 ? 1 : 0,
                        borderBottomColor: '#F1F5F9',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#6D28D9' }}>{s.studentNumber}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, flex: 1 }} numberOfLines={1}>
                          {s.fullName}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369A1' }}>
                            {s.grade}-{s.section}
                          </Text>
                        </View>
                        {s.gender && (
                          <Text style={{ fontSize: 11, color: Colors.textMuted }}>{s.gender}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#8B5CF6' }]}
                  onPress={handleConfirmAndSaveAiStudents}
                  disabled={aiStudentSaving}
                >
                  {aiStudentSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.confirmSaveText}>
                        {aiStudentResult.students.length} Öğrenciyi Onayla & Sunucuya Aktar
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={classStudentsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setClassStudentsModalVisible(false)}
      >
        <View style={styles.topDownOverlay}>
          <View style={styles.topDownCard}>
            {/* Modal Başlığı */}
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.classBadge}>
                    <Text style={styles.classBadgeText}>
                      {selectedClassForStudents?.className || `${selectedClassForStudents?.grade}-${selectedClassForStudents?.section}`}
                    </Text>
                  </View>
                  <Text style={styles.topDownTitle}>
                    Sınıfı Öğrencileri
                  </Text>
                </View>
                <Text style={styles.topDownSub}>
                  👥 Toplam {students.filter((s: any) => s.grade === selectedClassForStudents?.grade && s.section === selectedClassForStudents?.section).length} kayıtlı öğrenci
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setClassStudentsModalVisible(false)}
                style={styles.topDownCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Üst Eylem Butonları */}
            <View style={styles.classModalActionRow}>
              <TouchableOpacity
                style={styles.classModalAddBtn}
                onPress={() => {
                  if (selectedClassForStudents) {
                    setNewStudentGrade(selectedClassForStudents.grade);
                    setNewStudentSection(selectedClassForStudents.section);
                  }
                  setAddStudentModalVisible(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add" size={15} color="#fff" />
                <Text style={styles.classModalAddBtnText}>+ Bu Sınıfa Öğrenci Ekle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.classModalFilterBtn}
                onPress={() => {
                  if (selectedClassForStudents) {
                    setSelectedClassFilter(selectedClassForStudents.className || `${selectedClassForStudents.grade}-${selectedClassForStudents.section}`);
                    setClassStudentsModalVisible(false);
                    setActiveTab('students');
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="filter" size={15} color="#4F46E5" />
                <Text style={styles.classModalFilterBtnText}>Öğrenciler Sekmesinde Filtrele</Text>
              </TouchableOpacity>
            </View>

            {/* Sınıftaki Öğrenci Listesi */}
            <ScrollView style={styles.classStudentsListScroll} showsVerticalScrollIndicator={false}>
              {(() => {
                const classStudents = students.filter(
                  (s: any) => s.grade === selectedClassForStudents?.grade && s.section === selectedClassForStudents?.section
                );

                if (classStudents.length === 0) {
                  return (
                    <View style={styles.classEmptyStudentsBox}>
                      <Ionicons name="people-outline" size={44} color="#94A3B8" />
                      <Text style={styles.classEmptyStudentsTitle}>Bu sınıfta henüz kayıtlı öğrenci yok</Text>
                      <Text style={styles.classEmptyStudentsSub}>
                        Yukarıdaki "+ Bu Sınıfa Öğrenci Ekle" butonuna dokunarak doğrudan bu şubeye öğrenci ekleyebilirsiniz.
                      </Text>
                    </View>
                  );
                }

                return classStudents.map((student: any) => {
                  const photoUrl = student.photoPath ? `${serverBaseUrl}${student.photoPath}` : null;
                  const isUploading = photoUploadingId === student.id;

                  return (
                    <View key={student.id} style={styles.classStudentItemCard}>
                      <TouchableOpacity
                        style={styles.classStudentItemTop}
                        onPress={() => handleOpenStudentDetail(student)}
                        activeOpacity={0.7}
                      >
                        {/* Fotoğraf / Avatar */}
                        <TouchableOpacity
                          style={styles.studentPhotoContainer}
                          onPress={() => handlePickAndUploadPhoto(student)}
                          activeOpacity={0.8}
                        >
                          {isUploading ? (
                            <ActivityIndicator size="small" color="#4F46E5" />
                          ) : photoUrl ? (
                            <Image source={{ uri: photoUrl }} style={styles.studentPhoto} />
                          ) : (
                            <View style={styles.studentPhotoPlaceholder}>
                              <Text style={styles.studentInitials}>
                                {student.fullName.slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.cameraBadge}>
                            <Ionicons name="camera" size={11} color="#fff" />
                          </View>
                        </TouchableOpacity>

                        {/* Bilgiler */}
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.studentName}>{student.fullName}</Text>
                            <Text style={styles.studentNoBadge}>No: {student.studentNumber}</Text>
                          </View>

                          {student.parentName && (
                            <Text style={styles.parentText}>
                              👨‍👩‍👧 Veli: {student.parentName} {student.parentPhone ? `(${student.parentPhone})` : ''}
                            </Text>
                          )}
                          {student.studentPhone && (
                            <Text style={styles.contactText}>📱 Öğrenci Tel: {student.studentPhone}</Text>
                          )}

                          {/* Giriş Bilgileri Önizleme */}
                          <View style={styles.cardCredPreviewBox}>
                            <View style={styles.cardCredItem}>
                              <Ionicons name="school" size={11} color="#059669" />
                              <Text style={styles.cardCredLabel}>Öğr:</Text>
                              <Text style={[styles.cardCredValue, { color: '#059669' }]}>ooo_{student.studentNumber}</Text>
                            </View>
                            <View style={styles.cardCredDivider} />
                            <View style={styles.cardCredItem}>
                              <Ionicons name="people" size={11} color="#2563EB" />
                              <Text style={styles.cardCredLabel}>Veli:</Text>
                              <Text style={[styles.cardCredValue, { color: '#2563EB' }]}>vvv_{student.studentNumber}</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Aksiyon Butonları */}
                      <View style={styles.studentActionsRow}>
                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}
                          onPress={() => handleOpenStudentDetail(student)}
                        >
                          <Ionicons name="person-circle" size={13} color="#059669" />
                          <Text style={[styles.cardActionBtnText, { color: '#059669', fontWeight: '700' }]}>Detay & Notlar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#818CF8', backgroundColor: '#EEF2FF' }]}
                          onPress={() => handleOpenCredentialsModal(student)}
                        >
                          <Ionicons name="key" size={13} color="#4F46E5" />
                          <Text style={[styles.cardActionBtnText, { color: '#4F46E5', fontWeight: '700' }]}>Giriş & Şifre</Text>
                        </TouchableOpacity>

                        {student.parentPhone && (
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                            onPress={() => handleShareViaWhatsApp(student)}
                          >
                            <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                            <Text style={[styles.cardActionBtnText, { color: '#16A34A', fontWeight: '600' }]}>WhatsApp</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => handlePickAndUploadPhoto(student)}
                        >
                          <Ionicons name="camera-outline" size={13} color="#4F46E5" />
                          <Text style={styles.cardActionBtnText}>Fotoğraf</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => {
                            setEditingStudent({ ...student });
                            setEditStudentModalVisible(true);
                          }}
                        >
                          <Ionicons name="pencil" size={13} color="#4F46E5" />
                          <Text style={styles.cardActionBtnText}>Düzenle</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                          onPress={() => handleDeleteStudent(student.id, student.fullName)}
                        >
                          <Ionicons name="trash-outline" size={13} color="#DC2626" />
                          <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={adminCredentialsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔐 Yönetici Giriş Bilgileri</Text>
              <TouchableOpacity onPress={() => setAdminCredentialsModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Yeni Kullanıcı Adı (İsteğe bağlı)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni kullanıcı adı"
              value={adminNewUsername}
              onChangeText={setAdminNewUsername}
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Mevcut Şifreniz (* Zorunlu)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Mevcut yönetici şifreniz"
              value={adminOldPassword}
              onChangeText={setAdminOldPassword}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Yeni Şifre (İsteğe bağlı)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni şifreniz"
              value={adminNewPassword}
              onChangeText={setAdminNewPassword}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Yeni Şifre (Tekrar)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni şifrenizi tekrar girin"
              value={adminConfirmPassword}
              onChangeText={setAdminConfirmPassword}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleSaveAdminCredentials}
              disabled={savingAdminCredentials}
            >
              {savingAdminCredentials ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Bilgileri Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editLessonModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ Dersi Düzenle</Text>
              <TouchableOpacity onPress={() => setEditLessonModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Ders Adı (* Şube/Saat Ayrımı Yazabilirsiniz)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Matematik (5-A, 3 Saat)"
              value={editLessonName}
              onChangeText={setEditLessonName}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Kısa Kod</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: MAT, BYL"
              value={editLessonCode}
              onChangeText={setEditLessonCode}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Kademe (Sınıf Düzeyi - Müfredat Planı Bu Düzeyle Eşleşir)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {['9', '10', '11', '12', 'Tüm Kademeler'].map((g: any) => (
                <TouchableOpacity
                  key={g}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: editLessonGrade === g ? '#4F46E5' : '#CBD5E1',
                    backgroundColor: editLessonGrade === g ? '#EEF2FF' : '#FFFFFF',
                  }}
                  onPress={() => setEditLessonGrade(g)}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: editLessonGrade === g ? '#4F46E5' : '#64748B' }}>
                    {g.includes('Tüm') ? g : `${g}. Sınıf`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 11 veya Tüm Kademeler"
              value={editLessonGrade}
              onChangeText={setEditLessonGrade}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Haftalık Ders Saati</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 2, 3, 4"
              value={editLessonHours}
              onChangeText={setEditLessonHours}
              keyboardType="numeric"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#4F46E5' }]}
              onPress={handleSaveLessonEdit}
              disabled={updatingLesson}
            >
              {updatingLesson ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Ders Bilgilerini Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={planSheetPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPlanSheetPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="layers" size={22} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { fontSize: 16 }]}>Çalışma Sayfası (Sheet) Seçin</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                    {planSheetPickerLesson?.name} ({planSheetPickerLesson?.grade ? `${planSheetPickerLesson.grade}. Sınıf` : 'Tüm Kademeler'}) • {planSheetPickerAsset?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setPlanSheetPickerVisible(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', padding: 10, borderRadius: 8, marginVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="information-circle" size={16} color="#16A34A" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                  Bu Excel dosyasında {planSheetPickerSheets.length} adet çalışma sayfası bulundu.
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: '#15803D', marginTop: 3, lineHeight: 16 }}>
                Yıllık plan konularını ve kazanımlarını aktarmak istediğiniz sayfayı listeden seçiniz:
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: 320, marginVertical: 4 }}
              contentContainerStyle={{ gap: 8, paddingBottom: 6 }}
              showsVerticalScrollIndicator={true}
            >
              {planSheetPickerSheets.map((sheetName: any, sIdx: any) => (
                <TouchableOpacity
                  key={sIdx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                  onPress={() => handleProceedWithPlanSheet(sheetName)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-text-outline" size={17} color="#4F46E5" />
                    </View>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#1E293B' }} numberOfLines={1}>
                      {sheetName}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Seç</Text>
                    <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={{
                marginTop: 10,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#CBD5E1',
                backgroundColor: '#F8FAFC',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() => setPlanSheetPickerVisible(false)}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>İptal / Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={yearlyPlanModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📋 Yıllık Plan Yükle & Eşleştir</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  <Text style={[styles.headerSubtitle, { fontWeight: '800', color: '#1E293B' }]} numberOfLines={1}>
                    {selectedLessonForPlan?.name}
                  </Text>
                  <View style={{
                    backgroundColor: '#EEF2FF',
                    borderColor: '#C7D2FE',
                    borderWidth: 1,
                    paddingHorizontal: 7,
                    paddingVertical: 1.5,
                    borderRadius: 4,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#4338CA' }}>
                      🎯 Hedef Kademe: {selectedLessonForPlan?.grade && selectedLessonForPlan.grade !== 'Tüm Kademeler' ? `${selectedLessonForPlan.grade}. Sınıf` : 'Tüm Kademeler'}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setYearlyPlanModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {analyzingPlanFile ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                  Dosya analiz ediliyor ve tablo sütunları okunuyor...
                </Text>
              </View>
            ) : docAnalysis ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 📑 Çalışma Sayfası (Sheet) Seçici Barı (Çok Sheet'li Excel Dosyaları İçin) */}
                {docAnalysis.availableSheets && docAnalysis.availableSheets.length > 1 ? (
                  <View style={{
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 12,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="layers" size={17} color="#4F46E5" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                          Çalışma Sayfası (Sheet) Seçimi:
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setPlanSheetPickerSheets(docAnalysis.availableSheets || []);
                          setPlanSheetPickerVisible(true);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#EEF2FF',
                          paddingHorizontal: 8,
                          paddingVertical: 3.5,
                          borderRadius: 6,
                        }}
                      >
                        <Ionicons name="swap-horizontal" size={13} color="#4F46E5" />
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#4F46E5' }}>Tüm Sayfalar ({docAnalysis.availableSheets.length})</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                      {docAnalysis.availableSheets.map((sName: any) => {
                        const isActive = docAnalysis.sheetName === sName;
                        return (
                          <TouchableOpacity
                            key={sName}
                            onPress={() => handleSwitchPlanSheet(sName)}
                            activeOpacity={0.7}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 8,
                              backgroundColor: isActive ? '#4F46E5' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: isActive ? '#4338CA' : '#CBD5E1',
                            }}
                          >
                            {isActive && <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />}
                            <Text style={{
                              fontSize: 12.5,
                              fontWeight: isActive ? '800' : '600',
                              color: isActive ? '#FFFFFF' : '#334155',
                            }}>
                              {sName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : docAnalysis.sheetName ? (
                  <View style={{
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="layers-outline" size={16} color="#4F46E5" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                        Çalışma Sayfası (Sheet): <Text style={{ color: '#4F46E5', fontWeight: '800' }}>{docAnalysis.sheetName}</Text>
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#4338CA' }}>Tek Sayfa (Otomatik Seçildi)</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.mappingInfoBox}>
                  <Ionicons name="information-circle" size={18} color="#4F46E5" />
                  <Text style={styles.mappingInfoText}>
                    Excel/Word dosyanızdan {docAnalysis.sheetName ? `"${docAnalysis.sheetName}" sayfasında ` : ''}{docAnalysis.rawRows.length} satır tespit edildi. Sütunların yıllık plan alanlarıyla doğru eşleştiğini kontrol edip gerekiyorsa değiştiriniz:
                  </Text>
                </View>

                {/* Yapay Zeka Gerekçesi (Varsa) */}
                {docAnalysis.aiReason ? (
                  <View style={styles.mappingAiReasonCard}>
                    <Ionicons name="sparkles" size={16} color="#7C3AED" />
                    <Text style={styles.mappingAiReasonText}>
                      {docAnalysis.aiReason}
                    </Text>
                  </View>
                ) : null}

                {/* 🧮 Ders Saati ve Hafta Matematiği Bilgilendirme Kartı */}
                {docAnalysis.detectedTotalHours && docAnalysis.detectedWeeklyHours ? (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0', padding: 10, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="calculator-outline" size={16} color="#16A34A" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                        MEB Müfredat Saati Matematiği:
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#15803D', marginTop: 3, lineHeight: 16 }}>
                      Belgede tespit edilen: Yıllık Toplam <Text style={{ fontWeight: '800' }}>{docAnalysis.detectedTotalHours} Saat</Text> ÷ Haftalık <Text style={{ fontWeight: '800' }}>{docAnalysis.detectedWeeklyHours} Saat</Text> = <Text style={{ fontWeight: '800', color: '#166534' }}>{docAnalysis.calculatedWeeks || Math.round(docAnalysis.detectedTotalHours / docAnalysis.detectedWeeklyHours)} Hafta</Text>
                    </Text>
                  </View>
                ) : null}

                {/* 🌴 Dönem Arası Tatiller Bilgilendirme Kartı */}
                {docAnalysis.detectedHolidays && docAnalysis.detectedHolidays.length > 0 ? (
                  <View style={{ backgroundColor: '#FFFBEB', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', padding: 10, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sunny-outline" size={16} color="#D97706" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>
                        Dönem Arası Tatiller Tespit Edildi ({docAnalysis.detectedHolidays.length} Ara/Tatil):
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#92400E', marginTop: 3, lineHeight: 16 }}>
                      {docAnalysis.detectedHolidays.join(' • ')}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#B45309', marginTop: 3, fontStyle: 'italic' }}>
                      Tatil haftaları eğitim dersi sayımından hariç tutularak hafta numaraları eksiksiz ve tutarlı şekilde dengelendi.
                    </Text>
                  </View>
                ) : null}

                {/* Sütun Eşleştirme Kartları */}
                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>🎯 Konu Sütunu (Zorunlu):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col: any) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.topicColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, topicColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.topicColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {selectedMapping.topicColIndex !== null && docAnalysis.columns[selectedMapping.topicColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.topicColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
                </View>

                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>💡 Kazanım / Açıklama Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col: any) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.outcomesColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, outcomesColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.outcomesColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {selectedMapping.outcomesColIndex !== null && docAnalysis.columns[selectedMapping.outcomesColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.outcomesColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
                </View>

                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>📅 Tarih Aralığı Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col: any) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.dateColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, dateColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.dateColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {selectedMapping.dateColIndex !== null && docAnalysis.columns[selectedMapping.dateColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.dateColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
                </View>

                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>🔢 Hafta Numarası Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col: any) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.weekColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, weekColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.weekColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {selectedMapping.weekColIndex !== null && docAnalysis.columns[selectedMapping.weekColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.weekColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
                </View>

                {/* Şablon İndirme Kısayolu */}
                <TouchableOpacity
                  style={styles.mappingTemplateDownloadBtn}
                  onPress={() => handleDownloadYearlyPlanTemplate(selectedLessonForPlan?.name, selectedLessonForPlan?.grade)}
                >
                  <Ionicons name="download-outline" size={14} color="#0284C7" />
                  <Text style={styles.mappingTemplateDownloadText}>
                    Bu ders için standart Excel şablonu indir
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.createSubmitButton, { backgroundColor: '#059669', marginVertical: 14 }]}
                  onPress={handleConfirmAndSaveYearlyPlan}
                  disabled={savingPlanRows}
                >
                  {savingPlanRows ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.createSubmitText}>Yıllık Planı Sunucuya Kaydet</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={viewPlanModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%', height: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalTitle}>📖 Yıllık Müfredat Planı</Text>
                  <View style={styles.planCountBadge}>
                    <Text style={styles.planCountBadgeText}>{viewPlanItems.length} Hafta</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {selectedLessonForViewPlan?.name} • {selectedLessonForViewPlan?.grade ? `${selectedLessonForViewPlan.grade}. Sınıf` : 'Tüm Kademeler'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewPlanModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Arama & Hızlı Aksiyon Barı */}
            <View style={styles.planActionBar}>
              <View style={styles.planSearchInputWrap}>
                <Ionicons name="search" size={16} color="#64748B" />
                <TextInput
                  style={styles.planSearchInput}
                  placeholder="Hafta, konu veya kazanım ara..."
                  value={planSearch}
                  onChangeText={setPlanSearch}
                />
                {!!planSearch && (
                  <TouchableOpacity onPress={() => setPlanSearch('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={[styles.planActionMiniBtn, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                  onPress={() => handleDownloadYearlyPlanTemplate(selectedLessonForViewPlan?.name, selectedLessonForViewPlan?.grade)}
                >
                  <Ionicons name="download-outline" size={13} color="#0284C7" />
                  <Text style={[styles.planActionMiniText, { color: '#0284C7' }]}>Şablon İndir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.planActionMiniBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                  onPress={() => {
                    setViewPlanModalVisible(false);
                    handlePickYearlyPlanFile(selectedLessonForViewPlan);
                  }}
                >
                  <Ionicons name="cloud-upload-outline" size={13} color="#16A34A" />
                  <Text style={[styles.planActionMiniText, { color: '#16A34A' }]}>Planı Güncelle</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.planActionMiniBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                  onPress={() => handleDeleteYearlyPlan(selectedLessonForViewPlan)}
                  disabled={deletingPlan}
                >
                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                  <Text style={[styles.planActionMiniText, { color: '#DC2626' }]}>Planı Sil</Text>
                </TouchableOpacity>
              </View>
            </View>

            {loadingViewPlan ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 10, fontSize: 13, color: '#64748B' }}>Yıllık plan satırları yükleniyor...</Text>
              </View>
            ) : (() => {
              const q = planSearch.trim().toLowerCase();
              const filtered = viewPlanItems.filter((item: any) => {
                if (!q) return true;
                const matchWeek = String(item.weekNumber).includes(q);
                const matchSubject = (item.subject || '').toLowerCase().includes(q);
                const matchOutcomes = (item.learningOutcomes || '').toLowerCase().includes(q);
                return matchWeek || matchSubject || matchOutcomes;
              });

              if (filtered.length === 0) {
                return (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Ionicons name="document-text-outline" size={40} color="#94A3B8" />
                    <Text style={{ marginTop: 10, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                      {viewPlanItems.length === 0 ? 'Bu derse ait henüz yıllık plan yüklenmedi.' : 'Aramaya uygun plan satırı bulunamadı.'}
                    </Text>
                  </View>
                );
              }

              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  {filtered.map((item: any, idx: any) => (
                    <View key={item.id || idx} style={styles.planRowCard}>
                      <View style={styles.planRowCardHeader}>
                        <View style={styles.planWeekBadge}>
                          <Text style={styles.planWeekBadgeText}>{item.weekNumber}. Hafta</Text>
                        </View>
                        {(item.startDate || item.endDate || item.dateRange) && (
                          <View style={styles.planDateBadge}>
                            <Ionicons name="calendar-outline" size={12} color="#64748B" />
                            <Text style={styles.planDateBadgeText}>
                              {item.dateRange || (item.startDate ? `${new Date(item.startDate).toLocaleDateString('tr-TR')} - ${item.endDate ? new Date(item.endDate).toLocaleDateString('tr-TR') : ''}` : '')}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.planSubjectBox}>
                        <Text style={styles.planSubjectLabel}>📌 Konu (Deftere Yazılacak):</Text>
                        <Text style={styles.planSubjectText}>{item.subject}</Text>
                      </View>

                      {!!item.learningOutcomes && (
                        <View style={styles.planOutcomesBox}>
                          <Text style={styles.planOutcomesLabel}>🎯 Kazanımlar / Açıklamalar:</Text>
                          <Text style={styles.planOutcomesText}>{item.learningOutcomes}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Modal visible={scheduleResetModalVisible} animationType="fade" transparent onRequestClose={() => setScheduleResetModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 540 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.sanityHeaderIconBox, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="trash" size={20} color="#DC2626" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Program & Kadro Sıfırlama</Text>
                  <Text style={styles.modalSubTitle}>İstediğiniz veri grubunu temizleyerek artık verilerden arının.</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setScheduleResetModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460, marginTop: 12 }}>
              {/* Seçenek 1: Tüm Okul Ders Programını Sil */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={handleClearAllSchedules}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="calendar-outline" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetActionTitle}>🗑️ Tüm Okul Ders Programını Sil</Text>
                  <Text style={styles.resetActionDesc}>
                    Tüm şubelerin ve tüm öğretmenlerin haftalık ders saatlerini tamamen siler ({allSchoolSchedules.length} saat). Şube ve öğretmen isimleri korunur.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 2: Yalnızca Seçili Şubeyi Boşalt */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={handleClearCurrentClassSchedule}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="school-outline" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetActionTitle}>
                    🏫 Seçili Şubenin Programını Sil ({selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : 'Şube')})
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Yalnızca bu şubeye ait haftalık ders saatlerini boşaltır. İlgili öğretmenlerin saatlerinden de düşer.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 3: Yalnızca Seçili Öğretmeni Boşalt */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={handleClearCurrentTeacherSchedule}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#E0E7FF' }]}>
                  <Ionicons name="person-outline" size={22} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetActionTitle}>
                    👨‍🏫 Seçili Öğretmenin Programını Sil ({selectedTeacherForEditor || (teachers[0] ? teachers[0].fullName : 'Öğretmen')})
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Yalnızca bu öğretmenin haftalık ders saatlerini boşaltır. İlgili şubelerin saatlerinden de kaldırılır.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 4: Tüm Öğretmen Kadrosunu Sil */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={() => {
                  setScheduleResetModalVisible(false);
                  handleDeleteAllTeachers();
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="people-outline" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resetActionTitle, { color: '#DC2626' }]}>
                    👥 Tüm Öğretmen Kadrosunu Sil ({teachers.length} Öğretmen)
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Sisteme kayıtlı öğretmen kullanıcılarını tamamen siler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 5: Tüm Şubeleri Sil */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={() => {
                  setScheduleResetModalVisible(false);
                  handleDeleteAllClasses();
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="business-outline" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resetActionTitle, { color: '#DC2626' }]}>
                    🏢 Tüm Şubeleri ve Sınıfları Sil ({classes.length} Şube)
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Sisteme kayıtlı sınıf ve şube tanımlarını tamamen siler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { marginTop: 16 }]}
              onPress={() => setScheduleResetModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={teacherScheduleModalVisible} animationType="slide" transparent>
        <View style={styles.topDownOverlay}>
          <View style={[styles.topDownCard, { maxHeight: '92%' }]}>
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topDownTitle}>
                  📅 {selectedTeacherForSchedule?.fullName}
                </Text>
                <Text style={styles.topDownSub}>
                  Haftalık Ders Programı & Girdiği Şubeler (Çarşaf Kaydı)
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topDownCloseBtn}
                onPress={() => setTeacherScheduleModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Hızlı Aksiyon Butonları (Fotoğraftan AI ile Oku veya Elle Ekle) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 }}>
              <TouchableOpacity
                style={styles.singleTeacherAiBtnMini}
                onPress={() => handlePickSingleTeacherSchedulePhoto(selectedTeacherForSchedule)}
              >
                <Ionicons name="camera" size={14} color="#4F46E5" />
                <Text style={styles.singleTeacherAiBtnMiniText}>📷 Fotoğraftan Güncelle (AI)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.singleTeacherAddBtnMini}
                onPress={() =>
                  handleOpenSlotModal({
                    dayOfWeek: 1,
                    lessonHour: 1,
                    teacherName: selectedTeacherForSchedule?.fullName,
                  })
                }
              >
                <Ionicons name="add-circle" size={14} color="#16A34A" />
                <Text style={styles.singleTeacherAddBtnMiniText}>+ Elle Ders Ekle</Text>
              </TouchableOpacity>
            </View>

            {/* 🎯 Sınıf Rehber Öğretmenliği Yönetim Paneli */}
            <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="ribbon" size={18} color="#16A34A" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#166534' }}>
                    Sınıf Rehber Öğretmenliği:
                  </Text>
                  <View style={{ backgroundColor: editingCounselorClass ? '#DCFCE7' : '#F1F5F9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: editingCounselorClass ? '#86EFAC' : '#CBD5E1' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: editingCounselorClass ? '#15803D' : '#64748B' }}>
                      {editingCounselorClass ? `${editingCounselorClass} Şubesi` : 'Atanmamış (Yok)'}
                    </Text>
                  </View>
                </View>

                {savingCounselorClass && (
                  <ActivityIndicator size="small" color="#16A34A" />
                )}
              </View>

              <Text style={{ fontSize: 11, color: '#475569', marginTop: 6, marginBottom: 8, lineHeight: 16 }}>
                💡 Bu öğretmen için haftalık programdaki "Rehberlik" dersinden sınıf otomatik tespit edilir. Dilerseniz aşağıdan şubeyi manuel seçip değiştirebilir veya kaldırabilirsiniz:
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingVertical: 2 }}>
                {editingCounselorClass ? (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
                    onPress={() => handleSaveTeacherCounselorClass('')}
                    disabled={savingCounselorClass}
                  >
                    <Ionicons name="close-circle" size={14} color="#DC2626" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>Rehberliği Kaldır</Text>
                  </TouchableOpacity>
                ) : null}

                {classes.map((cls: any) => {
                  const cName = cls.className || `${cls.grade}-${cls.section}`;
                  const isSelected = editingCounselorClass.trim().toLowerCase() === cName.trim().toLowerCase();
                  return (
                    <TouchableOpacity
                      key={cls.id}
                      style={{
                        backgroundColor: isSelected ? '#16A34A' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: isSelected ? '#16A34A' : '#CBD5E1',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                      }}
                      onPress={() => handleSaveTeacherCounselorClass(cName)}
                      disabled={savingCounselorClass}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: isSelected ? '#FFFFFF' : '#334155' }}>
                        {isSelected ? `✓ ${cName}` : cName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {loadingTeacherSchedule ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 10, fontSize: 13, color: '#64748B' }}>Ders programı getiriliyor...</Text>
              </View>
            ) : teacherScheduleItems.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', paddingHorizontal: 20 }}>
                <Ionicons name="calendar-outline" size={48} color="#94A3B8" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569', marginTop: 12 }}>
                  Ders Programı Bulunamadı
                </Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                  Bu öğretmen için henüz kayıtlı bir ders programı yok. Çarşafı baştan okutmak yerine doğrudan öğretmenin ders çizelgesi fotoğrafını okutabilir veya elle ders ekleyebilirsiniz.
                </Text>

                <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={styles.slotSaveBtn}
                    onPress={() => handlePickSingleTeacherSchedulePhoto(selectedTeacherForSchedule)}
                  >
                    <Ionicons name="camera" size={16} color="#fff" />
                    <Text style={styles.slotSaveBtnText}>📷 Fotoğraftan Program Oku</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                {[
                  { dayNum: 1, name: 'Pazartesi' },
                  { dayNum: 2, name: 'Salı' },
                  { dayNum: 3, name: 'Çarşamba' },
                  { dayNum: 4, name: 'Perşembe' },
                  { dayNum: 5, name: 'Cuma' }
                ].map(({ dayNum, name: day }) => {
                  const dayItems = (teacherScheduleItems || [])
                    .filter((i: any) => {
                      if (Number(i.dayOfWeek) === dayNum) return true;
                      const dStr = String(i.dayName || '').toLowerCase();
                      return dStr.includes(day.toLowerCase().slice(0, 3));
                    })
                    .sort((a: any, b: any) => Number(a.lessonHour || a.periodNumber || 0) - Number(b.lessonHour || b.periodNumber || 0));

                  return (
                    <View key={day} style={styles.scheduleDayCard}>
                      <View style={styles.scheduleDayHeader}>
                        <Text style={styles.scheduleDayTitle}>{day}</Text>
                        <Text style={styles.scheduleDayCount}>{dayItems.length} Ders</Text>
                      </View>

                      {dayItems.length === 0 ? (
                        <Text style={styles.scheduleDayEmpty}>Bu gün dersi bulunmuyor</Text>
                      ) : (
                        dayItems.map((item: any, idx: any) => (
                          <TouchableOpacity
                            key={idx}
                            style={styles.scheduleItemRowClickable}
                            onPress={() =>
                              handleOpenSlotModal({
                                dayOfWeek: dayNum,
                                lessonHour: Number(item.lessonHour || item.periodNumber || (idx + 1)),
                                teacherName: selectedTeacherForSchedule?.fullName,
                                existingItem: item,
                              })
                            }
                            activeOpacity={0.7}
                          >
                            <View style={styles.schedulePeriodBadge}>
                              <Text style={styles.schedulePeriodText}>{item.lessonHour || item.periodNumber || idx + 1}. Ders</Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.scheduleLessonName}>{item.lessonName || 'Ders'}</Text>
                              <Text style={styles.scheduleClassText}>
                                🏫 Sınıf: {item.className || `${item.grade || ''}-${item.section || ''}`}
                                {item.classroom ? ` • Derslik: ${item.classroom}` : ''}
                              </Text>
                            </View>
                            <Ionicons name="pencil" size={14} color="#6366F1" style={{ marginLeft: 6 }} />
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={slotModalVisible} animationType="slide" transparent>
        <View style={styles.topDownOverlay}>
          <View style={[styles.topDownCard, { maxHeight: '90%' }]}>
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topDownTitle}>
                  {editingSlotData?.id ? '✏️ Ders Saatini Düzenle' : '➕ Yeni Ders Saati Ata'}
                </Text>
                <Text style={styles.topDownSub}>
                  {editingSlotData ? `${['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'][editingSlotData.dayOfWeek - 1] || `${editingSlotData.dayOfWeek}. Gün`} - ${editingSlotData.lessonHour}. Ders Saati` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topDownCloseBtn}
                onPress={() => setSlotModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              {/* Çift Yönlü Otomatik Senkronizasyon Bilgi Notu */}
              <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, padding: 10, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
                <Ionicons name="sync-circle" size={22} color="#4F46E5" />
                <Text style={{ fontSize: 11.5, color: '#3730A3', flex: 1, fontWeight: '500', lineHeight: 16 }}>
                  Bu ders hücresini kaydettiğinizde veya sildiğinizde; hem <Text style={{ fontWeight: '700' }}>{editingSlotData?.grade || '?'}-{editingSlotData?.section || '?'} şubesinin</Text> hem de <Text style={{ fontWeight: '700' }}>{editingSlotData?.teacherName || 'ilgili öğretmenin'}</Text> programı otomatik olarak güncellenir.
                </Text>
              </View>

              {/* Çakışma Varsa: Çakışan Dersleri Göster ve Seçmeli Sil */}
              {slotConflictItems.length > 1 && (
                <View style={styles.conflictResolutionBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="warning" size={18} color="#DC2626" />
                    <Text style={styles.conflictResolutionTitle}>
                      Bu Saatte {slotConflictItems.length} Farklı Ders Çakışıyor!
                    </Text>
                  </View>
                  <Text style={styles.conflictResolutionDesc}>
                    Bu şubede aynı saatte birden fazla ders tanımlanmış. Doğru olan dersi seçebilir, yanlış olanı tek tıkla silebilirsiniz:
                  </Text>

                  <View style={{ gap: 8, marginTop: 10 }}>
                    {slotConflictItems.map((cItem: any, cIdx: any) => {
                      const isCurrentSelected = editingSlotData?.id === cItem.id;
                      return (
                        <View
                          key={cItem.id || cIdx}
                          style={[
                            styles.conflictResolutionItem,
                            isCurrentSelected && styles.conflictResolutionItemActive,
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.conflictResolutionItemLesson}>
                              {cItem.lessonName} {cItem.lessonCode ? `(${cItem.lessonCode})` : ''}
                            </Text>
                            <Text style={styles.conflictResolutionItemTeacher}>
                              👨‍🏫 {cItem.teacherName || 'Öğretmen Belirtilmedi'} • 🏫 {cItem.grade}-{cItem.section}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={[styles.conflictSelectBtn, isCurrentSelected && styles.conflictSelectBtnActive]}
                              onPress={() => {
                                setEditingSlotData({
                                  id: cItem.id,
                                  dayOfWeek: cItem.dayOfWeek,
                                  lessonHour: cItem.lessonHour,
                                  grade: cItem.grade,
                                  section: cItem.section,
                                  teacherName: cItem.teacherName || '',
                                  lessonName: cItem.lessonName || '',
                                  lessonCode: cItem.lessonCode || '',
                                  classroom: cItem.classroom || '',
                                });
                              }}
                            >
                              <Text style={[styles.conflictSelectBtnText, isCurrentSelected && { color: '#4F46E5', fontWeight: '800' }]}>
                                {isCurrentSelected ? '✓ Seçili' : 'Seç'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.conflictDeleteBtn}
                              onPress={() => handleDeleteSpecificConflictItem(cItem)}
                            >
                              <Ionicons name="trash" size={13} color="#DC2626" />
                              <Text style={styles.conflictDeleteBtnText}>Sil</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Gün ve Saat Seçimi */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotModalLabel}>Haftanın Günü</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {['Pzt', 'Sal', 'Çar', 'Per', 'Cum'].map((dName: any, dIdx: any) => (
                      <TouchableOpacity
                        key={dName}
                        style={[styles.slotDayChip, editingSlotData?.dayOfWeek === dIdx + 1 && styles.slotDayChipActive]}
                        onPress={() => setEditingSlotData((prev: any) => prev ? { ...prev, dayOfWeek: dIdx + 1 } : null)}
                      >
                        <Text style={[styles.slotDayChipText, editingSlotData?.dayOfWeek === dIdx + 1 && styles.slotDayChipTextActive]}>
                          {dName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={{ width: 100 }}>
                  <Text style={styles.slotModalLabel}>Ders Saati</Text>
                  <TextInput
                    style={styles.slotModalInput}
                    value={String(editingSlotData?.lessonHour || 1)}
                    keyboardType="number-pad"
                    onChangeText={(val: any) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num > 0) {
                        setEditingSlotData((prev: any) => prev ? { ...prev, lessonHour: num } : null);
                      }
                    }}
                  />
                </View>
              </View>

              {/* Sınıf / Şube */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.slotModalLabel}>Şube Seçimi (Kademe & Şube)</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TextInput
                    style={[styles.slotModalInput, { flex: 1 }]}
                    placeholder="Kademe (örn: 9)"
                    value={editingSlotData?.grade || ''}
                    onChangeText={(val: any) => setEditingSlotData((prev: any) => prev ? { ...prev, grade: val } : null)}
                  />
                  <TextInput
                    style={[styles.slotModalInput, { flex: 1 }]}
                    placeholder="Şube (örn: A)"
                    autoCapitalize="characters"
                    value={editingSlotData?.section || ''}
                    onChangeText={(val: any) => setEditingSlotData((prev: any) => prev ? { ...prev, section: val.toUpperCase() } : null)}
                  />
                </View>
                {/* Hızlı Şube Seçici */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {classes.map((cls: any) => {
                    const isSel = editingSlotData?.grade === String(cls.grade) && editingSlotData?.section === cls.section;
                    return (
                      <TouchableOpacity
                        key={cls.id}
                        style={[styles.slotQuickChip, isSel && styles.slotQuickChipActive]}
                        onPress={() => setEditingSlotData((prev: any) => prev ? { ...prev, grade: String(cls.grade), section: cls.section } : null)}
                      >
                        <Text style={[styles.slotQuickChipText, isSel && styles.slotQuickChipTextActive]}>
                          {cls.grade}-{cls.section}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 1. DERS SEÇİMİ (ALFABETİK LİSTBOX & ARAMA) */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.slotModalLabel}>📚 Ders Seçimi (Alfabetik Liste)</Text>
                  {editingSlotData?.lessonName ? (
                    <View style={styles.listboxSelectedBadge}>
                      <Text style={styles.listboxSelectedBadgeText} numberOfLines={1}>
                        Seçili: {editingSlotData.lessonName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Ders Arama Çubuğu */}
                <View style={styles.listboxSearchWrap}>
                  <Ionicons name="search" size={15} color="#64748B" style={{ marginLeft: 8 }} />
                  <TextInput
                    style={styles.listboxSearchInput}
                    placeholder="Ders ara (örn: Matematik, Fizik, Biyoloji...)"
                    value={slotLessonSearchQuery}
                    onChangeText={setSlotLessonSearchQuery}
                    placeholderTextColor="#94A3B8"
                  />
                  {!!slotLessonSearchQuery && (
                    <TouchableOpacity onPress={() => setSlotLessonSearchQuery('')} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dikey Alfabetik Listbox */}
                <View style={styles.listboxContainer}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ maxHeight: 145 }}
                    showsVerticalScrollIndicator={true}
                  >
                    {filteredSlotLessons.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>Eşleşen ders bulunamadı.</Text>
                        {!!slotLessonSearchQuery.trim() && (
                          <TouchableOpacity
                            style={styles.listboxAddCustomBtn}
                            onPress={() => {
                              setEditingSlotData((prev: any) => prev ? { ...prev, lessonName: slotLessonSearchQuery.trim() } : null);
                              setSlotLessonSearchQuery('');
                            }}
                          >
                            <Text style={styles.listboxAddCustomBtnText}>
                              + "{slotLessonSearchQuery.trim()}" dersini seç
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      filteredSlotLessons.map((lsnName: any, idx: any) => {
                        const isSelected = normalizeSearchStr(editingSlotData?.lessonName) === normalizeSearchStr(lsnName);
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.listboxItem, isSelected && styles.listboxItemSelected]}
                            onPress={() => {
                              setEditingSlotData((prev: any) => prev ? { ...prev, lessonName: lsnName } : null);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <View style={[styles.listboxItemDot, isSelected && styles.listboxItemDotSelected]}>
                                <Text style={[styles.listboxItemDotText, isSelected && { color: '#fff' }]}>
                                  {lsnName.charAt(0).toLocaleUpperCase('tr-TR')}
                                </Text>
                              </View>
                              <Text style={[styles.listboxItemText, isSelected && styles.listboxItemTextSelected]} numberOfLines={1}>
                                {lsnName}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={18} color="#4F46E5" />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* 2. ÖĞRETMEN SEÇİMİ (ALFABETİK LİSTBOX & ARAMA) */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.slotModalLabel}>👨‍🏫 Öğretmen Seçimi (Alfabetik Liste)</Text>
                  {editingSlotData?.teacherName ? (
                    <View style={[styles.listboxSelectedBadge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                      <Text style={[styles.listboxSelectedBadgeText, { color: '#16A34A' }]} numberOfLines={1}>
                        Seçili: {editingSlotData.teacherName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Öğretmen Arama Çubuğu */}
                <View style={styles.listboxSearchWrap}>
                  <Ionicons name="search" size={15} color="#64748B" style={{ marginLeft: 8 }} />
                  <TextInput
                    style={styles.listboxSearchInput}
                    placeholder="Öğretmen ara (örn: Ahmet, Ayşe, Mehmet...)"
                    value={slotTeacherSearchQuery}
                    onChangeText={setSlotTeacherSearchQuery}
                    placeholderTextColor="#94A3B8"
                  />
                  {!!slotTeacherSearchQuery && (
                    <TouchableOpacity onPress={() => setSlotTeacherSearchQuery('')} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dikey Alfabetik Listbox */}
                <View style={styles.listboxContainer}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ maxHeight: 155 }}
                    showsVerticalScrollIndicator={true}
                  >
                    {filteredSlotTeachers.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>Eşleşen öğretmen bulunamadı.</Text>
                        {!!slotTeacherSearchQuery.trim() && (
                          <TouchableOpacity
                            style={[styles.listboxAddCustomBtn, { backgroundColor: '#10B981' }]}
                            onPress={() => {
                              setEditingSlotData((prev: any) => prev ? { ...prev, teacherName: slotTeacherSearchQuery.trim() } : null);
                              setSlotTeacherSearchQuery('');
                            }}
                          >
                            <Text style={styles.listboxAddCustomBtnText}>
                              + "{slotTeacherSearchQuery.trim()}" öğretmenini ata
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      filteredSlotTeachers.map((tchName: any, idx: any) => {
                        const isSelected = normalizeTeacherMatch(editingSlotData?.teacherName, tchName);
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.listboxItem, isSelected && styles.listboxItemSelected]}
                            onPress={() => {
                              setEditingSlotData((prev: any) => prev ? { ...prev, teacherName: tchName } : null);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <View style={[styles.listboxItemDot, isSelected ? { backgroundColor: '#10B981' } : { backgroundColor: '#E0E7FF' }]}>
                                <Text style={[styles.listboxItemDotText, isSelected ? { color: '#fff' } : { color: '#4338CA' }]}>
                                  {tchName.charAt(0).toLocaleUpperCase('tr-TR')}
                                </Text>
                              </View>
                              <Text style={[styles.listboxItemText, isSelected && styles.listboxItemTextSelected]} numberOfLines={1}>
                                {tchName}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* Derslik / Oda (Opsiyonel) */}
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.slotModalLabel}>Derslik / Sınıf Odası (İsteğe Bağlı)</Text>
                <TextInput
                  style={[styles.slotModalInput, { marginTop: 4 }]}
                  placeholder="örn: Lab 1, Spor Salonu, 204..."
                  value={editingSlotData?.classroom || ''}
                  onChangeText={(val: any) => setEditingSlotData((prev: any) => prev ? { ...prev, classroom: val } : null)}
                />
              </View>

              {/* Kaydet ve Sil Butonları */}
              <View style={{ gap: 10, marginBottom: 20 }}>
                <TouchableOpacity
                  style={styles.slotSaveBtn}
                  onPress={handleSaveSlot}
                  disabled={savingSlot}
                >
                  {savingSlot ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.slotSaveBtnText}>Değişiklikleri Kaydet</Text>
                    </>
                  )}
                </TouchableOpacity>

                {editingSlotData?.id && (
                  <TouchableOpacity
                    style={styles.slotDeleteBtn}
                    onPress={handleDeleteSlot}
                    disabled={savingSlot}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={styles.slotDeleteBtnText}>Bu Saati Programdan Kaldır (Boşalt)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={singleTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.topDownOverlay}>
          <View style={[styles.topDownCard, { maxHeight: '92%' }]}>
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topDownTitle}>
                  📷 Öğretmen Programı (AI Önizleme)
                </Text>
                <Text style={styles.topDownSub}>
                  {singleTeacherPreview?.teacherName || 'Öğretmen programı inceleniyor...'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topDownCloseBtn}
                onPress={() => {
                  setSingleTeacherModalVisible(false);
                  setSingleTeacherPreview(null);
                }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {singleTeacherParsing ? (
              <View style={{ paddingVertical: 50, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: '#1E293B' }}>
                  Yapay Zeka Programı Çözümlüyor...
                </Text>
                <Text style={{ marginTop: 6, fontSize: 13, color: '#64748B', textAlign: 'center', paddingHorizontal: 20 }}>
                  Fotoğraftaki haftalık ders saatleri, şubeler ve branşlar tespit ediliyor. Lütfen bekleyin.
                </Text>
              </View>
            ) : singleTeacherPreview ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
                <View style={styles.singleTeacherAlert}>
                  <Ionicons name="information-circle" size={20} color="#4F46E5" />
                  <Text style={styles.singleTeacherAlertText}>
                    Bu işlem sadece <Text style={{ fontWeight: '800' }}>{singleTeacherPreview.teacherName}</Text> öğretmeninin haftalık programını günceller. Okulun diğer öğretmenlerinin ve şubelerinin programı aynen korunur.
                  </Text>
                </View>

                <View style={styles.singleTeacherStatsRow}>
                  <View style={styles.singleTeacherStatBox}>
                    <Text style={styles.singleTeacherStatVal}>{singleTeacherPreview.items?.length || 0}</Text>
                    <Text style={styles.singleTeacherStatLbl}>Toplam Ders Saati</Text>
                  </View>
                  <View style={styles.singleTeacherStatBox}>
                    <Text style={styles.singleTeacherStatVal}>
                      {Array.from(new Set(singleTeacherPreview.items?.map((i: any) => `${i.grade}-${i.section}`))).length}
                    </Text>
                    <Text style={styles.singleTeacherStatLbl}>Farklı Şube</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginVertical: 8 }}>
                  Tespit Edilen Ders Saatleri:
                </Text>

                {singleTeacherPreview.items?.map((slot: any, sIdx: number) => {
                  const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
                  return (
                    <View key={sIdx} style={styles.singleTeacherItemCard}>
                      <View style={styles.singleTeacherDayBadge}>
                        <Text style={styles.singleTeacherDayText}>
                          {dayNames[slot.dayOfWeek] || `${slot.dayOfWeek}. Gün`}
                        </Text>
                        <Text style={styles.singleTeacherHourText}>
                          {slot.lessonHour}. Ders
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.singleTeacherLessonName}>{slot.lessonName}</Text>
                        <Text style={styles.singleTeacherClassName}>
                          🏫 {slot.grade}-{slot.section}
                          {slot.classroom ? ` • Derslik: ${slot.classroom}` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                <View style={{ gap: 10, marginTop: 16, marginBottom: 24 }}>
                  <TouchableOpacity
                    style={styles.slotSaveBtn}
                    onPress={handleSaveSingleTeacherSchedule}
                    disabled={savingSingleTeacher}
                  >
                    {savingSingleTeacher ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={18} color="#fff" />
                        <Text style={styles.slotSaveBtnText}>Onayla ve Programa Aktar</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.slotCancelBtn}
                    onPress={() => {
                      setSingleTeacherModalVisible(false);
                      setSingleTeacherPreview(null);
                    }}
                  >
                    <Text style={styles.slotCancelBtnText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
