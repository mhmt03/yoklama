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
import {
  parseMasterScheduleWithAi,
  saveMasterScheduleToServer,
  ParsedScheduleResult,
  TeacherScheduleVerification,
  readUriAsBase64,
  ScheduleBatchItem,
  mergeScheduleBatches,
  saveScheduleBatchesToStorage,
  loadScheduleBatchesFromStorage,
  clearScheduleBatchesFromStorage,
  saveCachedScheduleFile,
  loadCachedScheduleFile,
  clearCachedScheduleFile,
  saveParsedScheduleDraft,
  loadParsedScheduleDraft,
  clearParsedScheduleDraft,
  CachedScheduleDocInfo,
} from '../../../services/aiScheduleParser';
import {
  inspectExcelWorkbook,
  parseInitialExcelSchedule,
  ExcelInspectionResult,
} from '../../../services/excelScheduleParser';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function ScheduleAndSchoolModals({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    editModalVisible,
    setEditModalVisible,
    editingSchoolObj,
    selectedSchool,
    handleCopyCode,
    editSchoolName,
    setEditSchoolName,
    editSchoolPhone,
    setEditSchoolPhone,
    editSchoolAddress,
    setEditSchoolAddress,
    editSchoolDailyHours,
    setEditSchoolDailyHours,
    isStaff,
    editSchoolApiKey,
    setEditSchoolApiKey,
    handleUpdateSchool,
    updatingSchool,
    schools,
    handleDeleteSchool,
    createModalVisible,
    setCreateModalVisible,
    newSchoolName,
    setNewSchoolName,
    newSchoolPhone,
    setNewSchoolPhone,
    newSchoolApiKey,
    setNewSchoolApiKey,
    newSchoolDailyHours,
    setNewSchoolDailyHours,
    handleCreateSchool,
    schoolSelectModalVisible,
    setSchoolSelectModalVisible,
    handleSelectSchool,
    handleOpenEditSchool,
    excelPreviewModalVisible,
    setExcelPreviewModalVisible,
    excelInspection,
    selectedExcelSheet,
    setSelectedExcelSheet,
    setParsedSchedule,
    setCachedScheduleDraft,
    setAiModalVisible,
    schedulePreOptionsModalVisible,
    setSchedulePreOptionsModalVisible,
    pendingScheduleFile,
    optExtractTeachers,
    optExtractClasses,
    optExtractLessons,
    optExtractScheduleItems,
    setOptExtractTeachers,
    setOptExtractClasses,
    setOptExtractLessons,
    setOptExtractScheduleItems,
    optAutoHealBlocks,
    setOptAutoHealBlocks,
    teachers,
    classes,
    lessons,
    countingPdfPages,
    pdfTotalPages,
    pdfPageRangeMode,
    setPdfPageRangeMode,
    setPdfStartPage,
    setPdfEndPage,
    pdfStartPage,
    pdfEndPage,
    startScheduleAnalysisWithOptions,
    aiModalVisible,
    cancelScheduleAnalysis,
    aiParsing,
    aiElapsedSeconds,
    aiActiveModel,
    aiStageText,
    parsedSchedule,
    excludedTeachers,
    excludedClasses,
    excludedLessons,
    handleOpenTeacherScheduleInspector,
    scheduleSaveMode,
    setScheduleSaveMode,
    setSaveTeachersChecked,
    saveTeachersChecked,
    setShowTeachersList,
    showTeachersList,
    setAllTeachersExcluded,
    toggleExcludeTeacher,
    setSaveClassesChecked,
    saveClassesChecked,
    setShowClassesList,
    showClassesList,
    setAllClassesExcluded,
    toggleExcludeClass,
    setSaveLessonsChecked,
    saveLessonsChecked,
    setShowLessonsList,
    showLessonsList,
    setAllLessonsExcluded,
    toggleExcludeLesson,
    setSaveScheduleChecked,
    saveScheduleChecked,
    handleAddCurrentToBatches,
    scheduleBatches,
    handleMergeAllBatches,
    executeSaveSchedule,
    aiSaving,
    inspectTeacherModalVisible,
    inspectingTeacher,
    setInspectTeacherModalVisible,
    inspectingVerification,
    inspectingItems,
    cachedScheduleDoc,
    teacherRescanHint,
    setTeacherRescanHint,
    reScanningTeacher,
    handleRescanTeacherFromDocument,
    editingExpectedHours,
    tempExpectedHours,
    setTempExpectedHours,
    handleSaveExpectedHours,
    setEditingExpectedHours,
    editingCellSlot,
    setEditingCellSlot,
    inspectDayTab,
    setInspectDayTab,
    setInspectingItems,
    handleSaveCellSlot,
    handleShiftLessonHour,
    handlePromptMoveLessonHour,
    handleStartEditCell,
    handleDeleteCellSlot,
    handleApplyTeacherInspectorChanges,
    batchPoolModalVisible,
    setBatchPoolModalVisible,
    handlePickAndAnalyzeSchedule,
    handleRemoveBatch,
    handleClearAllBatches
  } = ctx;

  return (
    <>
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pencil" size={20} color="#4F46E5" />
                <Text style={styles.modalTitle}>Okul Bilgilerini Güncelle</Text>
              </View>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Okul Kodu Kartı */}
              {(editingSchoolObj?.code || selectedSchool?.code) && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#EEF2FF',
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#C7D2FE',
                  marginBottom: 12,
                }}>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#4338CA' }}>ÖĞRETMEN BAĞLANTI KODU</Text>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#312E81', marginTop: 1 }}>
                      {editingSchoolObj?.code || selectedSchool?.code}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleCopyCode(editingSchoolObj?.code || selectedSchool?.code)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#FFFFFF',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                    }}
                  >
                    <Ionicons name="copy-outline" size={13} color="#4F46E5" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Kopyala</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Okul / Kurum Adı *
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Atatürk Anadolu Lisesi"
                value={editSchoolName}
                onChangeText={setEditSchoolName}
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                İletişim Telefonu
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: 0312 000 00 00"
                value={editSchoolPhone}
                onChangeText={setEditSchoolPhone}
                keyboardType="phone-pad"
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Okul Adresi
              </Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Okulun açık adresi (İsteğe bağlı)"
                value={editSchoolAddress}
                onChangeText={setEditSchoolAddress}
                multiline
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Okul Günlük Ders Saati (Örn: 7, 8, 9, 10 Saat)
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {[6, 7, 8, 9, 10].map((h: any) => {
                  const isSelected = String(h) === String(editSchoolDailyHours);
                  return (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setEditSchoolDailyHours(String(h))}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isSelected ? '#4338CA' : '#CBD5E1',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#fff' : '#475569' }}>
                        {h} Saat
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TextInput
                  style={[styles.modalInput, { width: 65, marginBottom: 0, textAlign: 'center', fontWeight: '700' }]}
                  placeholder="8"
                  value={editSchoolDailyHours}
                  onChangeText={setEditSchoolDailyHours}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              {!isStaff && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                    Kurumsal Gemini API Anahtarı
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="AI API Key (İsteğe bağlı)"
                    value={editSchoolApiKey}
                    onChangeText={setEditSchoolApiKey}
                    autoCapitalize="none"
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.createSubmitButton, { marginTop: 8 }]}
                onPress={handleUpdateSchool}
                disabled={updatingSchool}
              >
                {updatingSchool ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Değişiklikleri Kaydet</Text>
                )}
              </TouchableOpacity>

              {/* Okul Silme Butonu */}
              {!isStaff && (
                <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                  {schools.length > 1 ? (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FEE2E2',
                        borderWidth: 1,
                        borderColor: '#FECACA',
                        borderRadius: 10,
                        paddingVertical: 10,
                        gap: 6,
                      }}
                      onPress={() => handleDeleteSchool(editingSchoolObj || selectedSchool)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                        Bu Okulu Sistemden Sil
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
                        ℹ️ Sistemde en az 1 okul kalmalıdır. Son kalan okul silinemez.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>➕ Yeni Okul Oluştur</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Okul Adı"
              value={newSchoolName}
              onChangeText={setNewSchoolName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Okul Telefonu (İsteğe bağlı)"
              value={newSchoolPhone}
              onChangeText={setNewSchoolPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Gemini API Anahtarı (İsteğe bağlı)"
              value={newSchoolApiKey}
              onChangeText={setNewSchoolApiKey}
              autoCapitalize="none"
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
              Okul Günlük Ders Saati
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[6, 7, 8, 9, 10].map((h: any) => {
                const isSelected = String(h) === String(newSchoolDailyHours);
                return (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setNewSchoolDailyHours(String(h))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: isSelected ? '#4338CA' : '#CBD5E1',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#fff' : '#475569' }}>
                      {h} Saat
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TextInput
                style={[styles.modalInput, { width: 65, marginBottom: 0, textAlign: 'center', fontWeight: '700' }]}
                placeholder="8"
                value={newSchoolDailyHours}
                onChangeText={setNewSchoolDailyHours}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>

            <TouchableOpacity style={styles.createSubmitButton} onPress={handleCreateSchool}>
              <Text style={styles.createSubmitText}>Okulu Oluştur</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={schoolSelectModalVisible} animationType="slide" transparent onRequestClose={() => setSchoolSelectModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="business" size={24} color="#4F46E5" />
                <Text style={styles.modalTitle}>Okul Seç & Değiştir</Text>
              </View>
              <TouchableOpacity onPress={() => setSchoolSelectModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
              Yönettiğiniz okullar arasında geçiş yapabilir veya yeni bir okul kurumu tanımlayabilirsiniz.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {schools.map((s: any) => {
                const isSelected = selectedSchool?.id === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      handleSelectSchool(s);
                      setSchoolSelectModalVisible(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
                      backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                      marginBottom: 10,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark' : 'business-outline'}
                        size={20}
                        color={isSelected ? '#FFFFFF' : '#64748B'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? '#312E81' : Colors.text,
                        }}
                      >
                        {s.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>
                          Kod: <Text style={{ fontWeight: '700', color: '#4F46E5' }}>{s.code}</Text>
                        </Text>
                        {isSelected && (
                          <View
                            style={{
                              backgroundColor: '#DCFCE7',
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 4,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534' }}>ŞU AN AKTİF</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        onPress={(e: any) => {
                          e.stopPropagation?.();
                          setSchoolSelectModalVisible(false);
                          handleOpenEditSchool(s);
                        }}
                        style={{ padding: 6, borderRadius: 8, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel={`${s.name} Düzenle`}
                      >
                        <Ionicons name="pencil" size={15} color="#4F46E5" />
                      </TouchableOpacity>
                      {schools.length > 1 && (
                        <TouchableOpacity
                          onPress={(e: any) => {
                            e.stopPropagation?.();
                            handleDeleteSchool(s);
                          }}
                          style={{ padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityLabel={`${s.name} Sil`}
                        >
                          <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={isSelected ? '#4F46E5' : '#CBD5E1'}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
              {schools.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#64748B', fontSize: 13 }}>Henüz kayıtlı bir okulunuz bulunmuyor.</Text>
                </View>
              )}
            </ScrollView>

            {!isStaff && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1.5,
                  borderColor: '#86EFAC',
                  borderRadius: 12,
                  paddingVertical: 12,
                  marginTop: 10,
                  gap: 8,
                }}
                onPress={() => {
                  setSchoolSelectModalVisible(false);
                  setCreateModalVisible(true);
                }}
              >
                <Ionicons name="add-circle" size={20} color="#166534" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>
                  Yeni Okul Tanımla
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={excelPreviewModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="grid-outline" size={24} color="#10B981" />
                <Text style={styles.modalTitle}>Excel Çarşaf Ön İnceleme</Text>
              </View>
              <TouchableOpacity onPress={() => setExcelPreviewModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Dosya Bilgi Kartı */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#ECFDF5',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#A7F3D0',
              }}>
                <Ionicons name="document-text" size={32} color="#059669" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }} numberOfLines={1}>
                    {excelInspection?.fileName || 'carsaf.xlsx'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>
                    📊 {excelInspection?.sheetNames?.length || 0} Sayfa • Toplam {excelInspection?.totalRows || 0} Satır Bulundu
                  </Text>
                </View>
              </View>

              {/* Bilgilendirme Notu */}
              <View style={{
                backgroundColor: '#F0FDF4',
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
                borderLeftWidth: 4,
                borderLeftColor: '#10B981',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
                  💡 Excel Çarşaf Okuma Altyapısı Hazırlandı!
                </Text>
                <Text style={{ fontSize: 11, color: '#047857', marginTop: 4, lineHeight: 16 }}>
                  Örnek Excel çarşafınızı oluşturduktan sonra bize sunduğunuzda hücre ve sütun eşleştirmesi (öğretmenler, ders saatleri, sınıflar) tam otomatik hale getirilecektir. Şimdilik bulunan sayfaları inceleyebilir ve şablonu taslak düzenleyiciye aktarabilirsiniz.
                </Text>
              </View>

              {/* Sayfa Seçici Sekmeler (Varsa birden fazla sayfa) */}
              {(excelInspection?.sheetNames?.length || 0) > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 }}>
                    Görüntülenen Sayfa:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {excelInspection?.sheets.map((s: any) => {
                      const isSelected = selectedExcelSheet === s.name;
                      return (
                        <TouchableOpacity
                          key={s.name}
                          onPress={() => setSelectedExcelSheet(s.name)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: isSelected ? '#10B981' : '#F1F5F9',
                            borderWidth: 1,
                            borderColor: isSelected ? '#059669' : '#CBD5E1',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : '#475569' }}>
                            {s.name} ({s.rowCount} satır)
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Seçilen Sayfa Önizleme Tablosu */}
              {(() => {
                const curSheet = excelInspection?.sheets.find((s: any) => s.name === selectedExcelSheet) || excelInspection?.sheets?.[0];
                if (!curSheet) return null;
                const sampleRows = curSheet.sampleRows || [];

                return (
                  <View style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    padding: 10,
                    marginBottom: 16,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                        Sayfa: {curSheet.name} (İlk {sampleRows.length} Satır)
                      </Text>
                      <Text style={{ fontSize: 10, color: '#64748B' }}>
                        {curSheet.colCount} Sütun • {curSheet.rowCount} Satır
                      </Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                      <View>
                        {sampleRows.map((row: any, rIdx: any) => (
                          <View
                            key={rIdx}
                            style={{
                              flexDirection: 'row',
                              backgroundColor: rIdx === 0 ? '#F8FAFC' : (rIdx % 2 === 0 ? '#FAFAFA' : '#FFFFFF'),
                              borderBottomWidth: 1,
                              borderBottomColor: '#F1F5F9',
                              paddingVertical: 5,
                            }}
                          >
                            <View style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '700' }}>{rIdx + 1}</Text>
                            </View>
                            {row.map((cell: any, cIdx: number) => (
                              <View
                                key={cIdx}
                                style={{
                                  width: 100,
                                  paddingHorizontal: 6,
                                  justifyContent: 'center',
                                  borderRightWidth: 1,
                                  borderRightColor: '#F1F5F9',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: rIdx === 0 ? '700' : '400',
                                    color: rIdx === 0 ? '#1E293B' : '#334155',
                                  }}
                                  numberOfLines={2}
                                >
                                  {cell !== null && cell !== undefined ? String(cell) : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })()}

              {/* Aksiyon Butonları */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#10B981',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14,
                  borderRadius: 12,
                  gap: 8,
                  marginBottom: 10,
                }}
                onPress={() => {
                  if (!excelInspection || !selectedSchool) return;
                  const parsed = parseInitialExcelSchedule(excelInspection, selectedSchool.name);
                  setParsedSchedule(parsed);
                  saveParsedScheduleDraft(selectedSchool.id, parsed);
                  setCachedScheduleDraft(parsed);
                  setExcelPreviewModalVisible(false);
                  setAiModalVisible(true);
                  Alert.alert(
                    'Excel Taslağı Hazırlandı 📊',
                    `Excel dosyasından ${parsed.classes.length} sınıf ve ${excelInspection.totalRows} satır tespit edildi. Canlı düzenleyici ekranında açıldı.`
                  );
                }}
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
                  Taslak Olarak Aç & Canlı Düzenle ➔
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                }}
                onPress={() => setExcelPreviewModalVisible(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={schedulePreOptionsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options-outline" size={24} color="#4F46E5" />
                <Text style={styles.modalTitle}>Çarşaf Program Seçenekleri</Text>
              </View>
              <TouchableOpacity onPress={() => setSchedulePreOptionsModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Seçilen Belge Bilgisi */}
              <View style={styles.preOptFileCard}>
                <Ionicons name="document-text" size={28} color="#4F46E5" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.preOptFileName} numberOfLines={1}>
                    {pendingScheduleFile?.name || 'Seçilen Çarşaf Belgesi'}
                  </Text>
                  <Text style={styles.preOptFileDesc}>
                    Çarşaf belgeler çok sayfalı ve yoğun veri içerir. İhtiyacınıza göre verileri parça parça veya toplu alabilirsiniz.
                  </Text>
                </View>
              </View>

              {/* Hızlı Şablon Butonları */}
              <Text style={styles.preOptSectionTitle}>⚡ Hızlı Şablonlar</Text>
              <View style={styles.preOptPresetsRow}>
                <TouchableOpacity
                  style={[
                    styles.preOptPresetBtn,
                    optExtractTeachers && optExtractClasses && optExtractLessons && !optExtractScheduleItems && styles.preOptPresetBtnActive,
                  ]}
                  onPress={() => {
                    setOptExtractTeachers(true);
                    setOptExtractClasses(true);
                    setOptExtractLessons(true);
                    setOptExtractScheduleItems(false);
                  }}
                >
                  <Ionicons name="flash-outline" size={16} color={optExtractTeachers && optExtractClasses && optExtractLessons && !optExtractScheduleItems ? '#FFFFFF' : '#4F46E5'} />
                  <Text
                    style={[
                      styles.preOptPresetBtnText,
                      optExtractTeachers && optExtractClasses && optExtractLessons && !optExtractScheduleItems && styles.preOptPresetBtnTextActive,
                    ]}
                  >
                    Hızlı Kadro, Sınıf & Ders (~10 sn)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.preOptPresetBtn,
                    !optExtractTeachers && !optExtractClasses && !optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnActive,
                  ]}
                  onPress={() => {
                    setOptExtractTeachers(false);
                    setOptExtractClasses(false);
                    setOptExtractLessons(false);
                    setOptExtractScheduleItems(true);
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={!optExtractTeachers && !optExtractClasses && !optExtractLessons && optExtractScheduleItems ? '#FFFFFF' : '#4F46E5'} />
                  <Text
                    style={[
                      styles.preOptPresetBtnText,
                      !optExtractTeachers && !optExtractClasses && !optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnTextActive,
                    ]}
                  >
                    Sadece Ders Dağılımı (Program)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.preOptPresetBtn,
                    optExtractTeachers && optExtractClasses && optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnActive,
                  ]}
                  onPress={() => {
                    setOptExtractTeachers(true);
                    setOptExtractClasses(true);
                    setOptExtractLessons(true);
                    setOptExtractScheduleItems(true);
                  }}
                >
                  <Ionicons name="sparkles" size={16} color={optExtractTeachers && optExtractClasses && optExtractLessons && optExtractScheduleItems ? '#FFFFFF' : '#4F46E5'} />
                  <Text
                    style={[
                      styles.preOptPresetBtnText,
                      optExtractTeachers && optExtractClasses && optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnTextActive,
                    ]}
                  >
                    Tümünü Çöz (Tam Otonom)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Seçim Onay Kutuları */}
              <Text style={[styles.preOptSectionTitle, { marginTop: 14 }]}>📋 Çekilecek Veri Türleri</Text>

              {/* 1. Öğretmenler */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractTeachers && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractTeachers(!optExtractTeachers)}
              >
                <Ionicons
                  name={optExtractTeachers ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractTeachers ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>👨‍🏫 Öğretmen Kadrosu</Text>
                    <Text style={styles.preOptBadgeSpeed}>Çok Hızlı ⚡</Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Sayfa yer imleri ve başlıklarından tüm öğretmen isimlerini ve branşları toplar.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 2. Şubeler / Sınıflar */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractClasses && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractClasses(!optExtractClasses)}
              >
                <Ionicons
                  name={optExtractClasses ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractClasses ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>🏫 Şubeler ve Sınıflar</Text>
                    <Text style={styles.preOptBadgeSpeed}>Çok Hızlı ⚡</Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Öğretmen ders tablolarından tüm şubeleri (örn: 9-A, 10-B, 11-C) standartlaştırarak çıkarır.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 3. Ders İsimleri */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractLessons && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractLessons(!optExtractLessons)}
              >
                <Ionicons
                  name={optExtractLessons ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractLessons ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>📚 Ders Tam Adları</Text>
                    <Text style={styles.preOptBadgeSpeed}>Çok Hızlı ⚡</Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Ders kodları (MAT, FİZ) ile açık adları (Matematik, Fizik) eşleştirir.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 4. Haftalık Ders Dağılımı (Program Hücreleri) */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractScheduleItems && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractScheduleItems(!optExtractScheduleItems)}
              >
                <Ionicons
                  name={optExtractScheduleItems ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractScheduleItems ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>📅 Haftalık Ders Dağılımı (Program)</Text>
                    <Text style={[styles.preOptBadgeSpeed, { backgroundColor: '#FEF3C7', color: '#B45309' }]}>
                      Kapsamlı Analiz
                    </Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Hücre hücre gün ve saatleri çözer. Her öğretmenin hangi şubeye hangi dersi okuttuğunu eşleştirir.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 5. Otomatik Akıllı Blok Dengeleme (İsteğe Bağlı) */}
              {optExtractScheduleItems && (
                <TouchableOpacity
                  style={[styles.preOptItemCard, optAutoHealBlocks && styles.preOptItemCardChecked, { borderColor: optAutoHealBlocks ? '#4F46E5' : '#E2E8F0' }]}
                  onPress={() => setOptAutoHealBlocks(!optAutoHealBlocks)}
                >
                  <Ionicons
                    name={optAutoHealBlocks ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={optAutoHealBlocks ? '#4F46E5' : '#94A3B8'}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.preOptItemTitle}>⚡ Akıllı Blok Dengeleme (İsteğe Bağlı)</Text>
                      <Text style={[styles.preOptBadgeSpeed, { backgroundColor: optAutoHealBlocks ? '#EEF2FF' : '#F1F5F9', color: optAutoHealBlocks ? '#4F46E5' : '#64748B' }]}>
                        {optAutoHealBlocks ? 'Aktif' : 'Devre Dışı (Önerilen)'}
                      </Text>
                    </View>
                    <Text style={styles.preOptItemSub}>
                      Çarşaf programı parça parça veya 2 kerede yüklüyorsanız KAPALI tutunuz. Öğretmenin eksik dersleri diğer sayfalarda olabilir. Tüm sayfalar yüklendikten sonra "Program Denetimi" ekranından tek tuşla dilediğiniz zaman dengeleyebilirsiniz.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Sistem Mevcut Durum Kartı */}
              <View style={styles.preOptSystemStatusBox}>
                <Ionicons name="information-circle" size={20} color="#0284C7" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.preOptSystemStatusTitle}>Okulun Sistemdeki Mevcut Kayıtları:</Text>
                  <Text style={styles.preOptSystemStatusText}>
                    • {teachers.length} Öğretmen  |  • {classes.length} Şube  |  • {lessons.length} Ders
                  </Text>
                  {optExtractScheduleItems && classes.length === 0 && !optExtractClasses && (
                    <Text style={styles.preOptWarningText}>
                      ⚠️ Dikkat: Sistemde kayıtlı şube yok! Lütfen yukarıdaki "Şubeler ve Sınıflar" kutusunu da işaretleyiniz.
                    </Text>
                  )}
                  {optExtractScheduleItems && teachers.length === 0 && !optExtractTeachers && (
                    <Text style={styles.preOptWarningText}>
                      ⚠️ Dikkat: Sistemde kayıtlı öğretmen yok! Lütfen yukarıdaki "Öğretmen Kadrosu" kutusunu da işaretleyiniz.
                    </Text>
                  )}
                </View>
              </View>
              {/* 5. PDF Sayfa Aralığı / Parça Parça Okuma Kartı */}
              {pendingScheduleFile?.name?.toLowerCase().endsWith('.pdf') && (
                <View style={styles.preOptPageRangeCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="documents" size={18} color="#4F46E5" />
                      <Text style={styles.preOptPageRangeTitle}>📄 PDF Sayfa Aralığı Seçimi</Text>
                    </View>
                    {countingPdfPages ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <ActivityIndicator size="small" color="#4F46E5" />
                        <Text style={{ fontSize: 11, color: '#64748B' }}>Sayfalar taranıyor...</Text>
                      </View>
                    ) : pdfTotalPages > 0 ? (
                      <View style={styles.preOptPageBadge}>
                        <Text style={styles.preOptPageBadgeText}>Toplam {pdfTotalPages} Sayfa</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.preOptPageRangeSub}>
                    {pdfTotalPages > 35
                      ? '💡 Belgeniz çok sayfalı. Token tavanına takılmamak ve %100 eksiksiz okuma için parçalara bölmeniz önerilir.'
                      : 'İhtiyaca göre belgenin sadece belirli sayfalarını (örn: 1-25) okutabilirsiniz.'}
                  </Text>

                  {/* Hızlı Seçim Butonları */}
                  {pdfTotalPages > 1 && (
                    <View style={styles.pdfRangePresetRow}>
                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'all' && styles.pdfRangePresetBtnActive]}
                        onPress={() => {
                          setPdfPageRangeMode('all');
                          setPdfStartPage('1');
                          setPdfEndPage(String(pdfTotalPages));
                        }}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'all' && styles.pdfRangePresetTextActive]}>
                          Tümü (1-{pdfTotalPages})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'half1' && styles.pdfRangePresetBtnActive]}
                        onPress={() => {
                          setPdfPageRangeMode('half1');
                          setPdfStartPage('1');
                          setPdfEndPage(String(Math.ceil(pdfTotalPages / 2)));
                        }}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'half1' && styles.pdfRangePresetTextActive]}>
                          1. Yarı (1-{Math.ceil(pdfTotalPages / 2)})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'half2' && styles.pdfRangePresetBtnActive]}
                        onPress={() => {
                          setPdfPageRangeMode('half2');
                          setPdfStartPage(String(Math.ceil(pdfTotalPages / 2) + 1));
                          setPdfEndPage(String(pdfTotalPages));
                        }}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'half2' && styles.pdfRangePresetTextActive]}>
                          2. Yarı ({Math.ceil(pdfTotalPages / 2) + 1}-{pdfTotalPages})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'custom' && styles.pdfRangePresetBtnActive]}
                        onPress={() => setPdfPageRangeMode('custom')}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'custom' && styles.pdfRangePresetTextActive]}>
                          Özel Aralık
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Sayfa Giriş Kutuları */}
                  <View style={styles.pdfRangeInputsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pdfRangeInputLabel}>Başlangıç:</Text>
                      <TextInput
                        style={styles.pdfRangeInput}
                        keyboardType="numeric"
                        value={pdfStartPage}
                        onChangeText={(txt: any) => {
                          setPdfStartPage(txt);
                          setPdfPageRangeMode('custom');
                        }}
                      />
                    </View>

                    <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>—</Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pdfRangeInputLabel}>Bitiş:</Text>
                      <TextInput
                        style={styles.pdfRangeInput}
                        keyboardType="numeric"
                        value={pdfEndPage}
                        onChangeText={(txt: any) => {
                          setPdfEndPage(txt);
                          setPdfPageRangeMode('custom');
                        }}
                      />
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Butonlar */}
            <View style={styles.preOptActionsRow}>
              <TouchableOpacity
                style={styles.preOptCancelBtn}
                onPress={() => setSchedulePreOptionsModalVisible(false)}
              >
                <Text style={styles.preOptCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preOptSubmitBtn}
                onPress={startScheduleAnalysisWithOptions}
              >
                <Ionicons name="rocket-outline" size={20} color="#FFFFFF" />
                <Text style={styles.preOptSubmitBtnText}>Analizi Başlat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={aiModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🪄 AI Çarşaf Program Analizi</Text>
              <TouchableOpacity onPress={cancelScheduleAnalysis}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {aiParsing ? (
              <View style={styles.aiLoadingContainer}>
                {/* Süre Rozeti */}
                <View style={styles.aiTimerBadge}>
                  <Ionicons name="timer-outline" size={15} color="#4F46E5" />
                  <Text style={styles.aiTimerBadgeText}>
                    İşlem Sürüyor: {Math.floor(aiElapsedSeconds / 60) > 0 ? `${Math.floor(aiElapsedSeconds / 60)} dk ${aiElapsedSeconds % 60} sn` : `${aiElapsedSeconds} sn`}
                  </Text>
                </View>

                {/* Mod Bilgisi */}
                {!optExtractScheduleItems ? (
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>⚡ Hızlı Liste Modu: Program hücreleri çözümlenmiyor</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>🗓️ Tam Dağılım Modu: Haftalık program hücreleri taranıyor</Text>
                  </View>
                )}

                {/* Spinner & Ana Başlık */}
                <ActivityIndicator size="large" color="#4F46E5" style={{ marginVertical: 10 }} />
                <Text style={styles.aiLoadingText}>Gemini AI Çarşaf Programı İnceliyor</Text>
                {!!aiActiveModel && (
                  <View style={[styles.aiTimerBadge, { marginTop: 4, marginBottom: 6 }]}>
                    <Ionicons name="hardware-chip-outline" size={15} color="#4F46E5" />
                    <Text style={styles.aiTimerBadgeText}>Kullanılan Model: {aiActiveModel}</Text>
                  </View>
                )}

                {/* Anlık Aşama Kartı */}
                <View style={styles.aiStageCard}>
                  <View style={styles.aiStageDot} />
                  <Text style={styles.aiStageText}>{aiStageText}</Text>
                </View>

                {/* Adım Listesi (Sadece kullanıcının seçtiği kategorileri gösterir) */}
                <View style={styles.aiStepsContainer}>
                  {optExtractTeachers && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                      <Text style={styles.aiStepDoneText}>• Öğretmen kadrosu taranıyor (sayfa yer imleri & başlıklar)</Text>
                    </View>
                  )}
                  {optExtractClasses && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                      <Text style={styles.aiStepDoneText}>• Şubeler ve sınıflar tespit ediliyor</Text>
                    </View>
                  )}
                  {optExtractLessons && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                      <Text style={styles.aiStepDoneText}>• Ders adları ve branşlar ayıklanıyor</Text>
                    </View>
                  )}
                  {optExtractScheduleItems && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="time-outline" size={16} color="#4F46E5" />
                      <Text style={styles.aiStepActiveText}>
                        • Hücrelere bölünmüş haftalık ders tablolarından tüm program omurgası çıkarılıyor
                      </Text>
                    </View>
                  )}
                </View>

                {/* İptal Butonu */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FEE2E2',
                    borderWidth: 1,
                    borderColor: '#FCA5A5',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    marginTop: 12,
                    gap: 6,
                  }}
                  onPress={cancelScheduleAnalysis}
                  activeOpacity={0.7}
                >
                  <Ionicons name="stop-circle-outline" size={18} color="#DC2626" />
                  <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>Analizi Durdur / İptal Et</Text>
                </TouchableOpacity>

                {/* Bilgilendirme Kutusu */}
                <View style={styles.aiProgressInfoBox}>
                  <Ionicons name="information-circle-outline" size={18} color="#166534" />
                  <Text style={styles.aiProgressInfoBoxText}>
                    {optExtractScheduleItems
                      ? 'Tam program çözümlemesi çok sayfalı tablolarda birkaç dakika sürebilir. İstemediğiniz kategorileri analiz öncesi seçeneklerden kapatarak işlemi saniyeler içinde tamamlayabilirsiniz.'
                      : 'Hızlı mod seçildiği için ders programı hücreleri çözümlenmeyecek; sadece öğretmen, sınıf ve ders listeleri hızla toplanacaktır.'}
                  </Text>
                </View>
              </View>
            ) : parsedSchedule ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {(() => {
                  const teachersList = parsedSchedule.teachers || [];
                  const classesList = parsedSchedule.classes || [];
                  const lessonsList = parsedSchedule.lessons || [];
                  const scheduleItemsList = parsedSchedule.scheduleItems || [];
                  const bellScheduleList = parsedSchedule.bellSchedule || [];

                  const activeTeachersCount = teachersList.length - excludedTeachers.length;
                  const activeClassesCount = classesList.length - excludedClasses.length;
                  const activeLessonsCount = lessonsList.length - excludedLessons.length;
                  const activeScheduleItemsCount = scheduleItemsList.filter((item: any) => {
                    if (!item) return false;
                    if (item.teacherName && excludedTeachers.includes(item.teacherName)) return false;
                    const sec = item.section ? String(item.section).toUpperCase() : '';
                    const clsName = `${item.grade}-${sec}`;
                    if (excludedClasses.includes(clsName)) return false;
                    if (item.lessonName && excludedLessons.includes(item.lessonName)) return false;
                    return true;
                  }).length;

                  // 🛡️ Çapraz Çakışmaları Hesapla:
                  const slotMap = new Map<string, Array<{ teacherName: string; lessonName: string }>>();
                  for (const item of scheduleItemsList) {
                    if (!item || !item.teacherName) return null;
                    const grade = item.grade ? String(item.grade).trim() : '';
                    const section = item.section ? String(item.section).trim().toUpperCase() : '';
                    if (!grade || !section) continue;
                    const clsKey = `${grade}-${section}`;
                    const slotKey = `${item.dayOfWeek}_${item.lessonHour}_${clsKey}`;
                    if (!slotMap.has(slotKey)) {
                      slotMap.set(slotKey, []);
                    }
                    slotMap.get(slotKey)!.push({
                      teacherName: item.teacherName.trim(),
                      lessonName: item.lessonName || item.lessonCode || 'Ders',
                    });
                  }

                  const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
                  const conflictsList: Array<{
                    dayOfWeek: number;
                    lessonHour: number;
                    className: string;
                    teachers: Array<{ teacherName: string; lessonName: string }>;
                  }> = [];
                  const teacherConflictsCountMap: Record<string, number> = {};

                  for (const [slotKey, items] of slotMap.entries()) {
                    const distinctTeachers = Array.from(new Set(items.map((it: any) => it.teacherName.toLowerCase())));
                    if (distinctTeachers.length > 1) {
                      const parts = slotKey.split('_');
                      const dayOfWeek = parseInt(parts[0], 10);
                      const lessonHour = parseInt(parts[1], 10);
                      const className = parts[2];
                      conflictsList.push({
                        dayOfWeek,
                        lessonHour,
                        className,
                        teachers: items,
                      });
                      for (const it of items) {
                        const tNorm = it.teacherName.toLowerCase();
                        teacherConflictsCountMap[tNorm] = (teacherConflictsCountMap[tNorm] || 0) + 1;
                      }
                    }
                  }

                  return (
                    <>
                      <Text style={styles.previewSuccessTitle}>🎉 Çarşaf Program Ayrıştırıldı!</Text>

                      {/* Özet Grid Kartları */}
                      <View style={styles.previewGrid}>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeTeachersCount}
                            {excludedTeachers.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{teachersList.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Öğretmen {excludedTeachers.length > 0 ? `(${excludedTeachers.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeClassesCount}
                            {excludedClasses.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{classesList.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Sınıf / Şube {excludedClasses.length > 0 ? `(${excludedClasses.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeLessonsCount}
                            {excludedLessons.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{lessonsList.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Ders {excludedLessons.length > 0 ? `(${excludedLessons.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeScheduleItemsCount}
                            {scheduleItemsList.length > 0 && activeScheduleItemsCount !== scheduleItemsList.length && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{scheduleItemsList.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>Ders Saati</Text>
                        </View>
                      </View>

                      {/* 🚨 ÇAKIŞMA UYARI KARTI VE İNTERAKTİF ÇAKIŞMA LİSTESİ */}
                      {conflictsList.length > 0 ? (
                        <View style={{
                          backgroundColor: '#FEF2F2',
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: '#FECACA',
                          padding: 12,
                          marginBottom: 14,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons name="alert-circle" size={20} color="#DC2626" />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#991B1B' }}>
                                ⚠️ Tespit Edilen Çakışmalar ({conflictsList.length} Saat)
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                                {Object.keys(teacherConflictsCountMap).length} Öğretmen Etkileniyor
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: '#B91C1C', marginBottom: 10 }}>
                            Aynı şubede aynı gün ve saatte birden fazla öğretmenin dersi görünmektedir. Düzeltmek istediğiniz öğretmenin yanındaki butona basarak doğrudan çizelgesini açabilir, "Güne Taşı" ile tüm günü aktarabilir veya elle düzenleyebilirsiniz:
                          </Text>

                          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6 }}>
                            {conflictsList.map((c: any, cIdx: any) => (
                              <View
                                key={cIdx}
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  borderRadius: 8,
                                  padding: 8,
                                  borderWidth: 1,
                                  borderColor: '#FCA5A5',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>{c.className}</Text>
                                    </View>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                                      {dayNames[c.dayOfWeek] || `${c.dayOfWeek}. Gün`}, {c.lessonHour}. Ders
                                    </Text>
                                  </View>
                                </View>

                                <View style={{ gap: 4 }}>
                                  {c.teachers.map((t: any, tIdx: any) => (
                                    <View key={tIdx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                      <Text style={{ fontSize: 11, color: '#334155', flex: 1, marginRight: 6 }} numberOfLines={1}>
                                        <Text style={{ fontWeight: '700', color: '#0F172A' }}>{t.teacherName}</Text> ({t.lessonName})
                                      </Text>
                                      <TouchableOpacity
                                        onPress={() => handleOpenTeacherScheduleInspector(t.teacherName)}
                                        style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}
                                      >
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>✏️ İncele & Taşı</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      ) : (
                        <View style={{
                          backgroundColor: '#F0FDF4',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#BBF7D0',
                          padding: 10,
                          marginBottom: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}>
                          <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                            🛡️ 0 Çakışma: Tüm sınıfların ve öğretmenlerin ders saatleri kusursuz şekilde uyumlu!
                          </Text>
                        </View>
                      )}

                      {/* Okul Ders & Giriş-Çıkış Saatleri (Varsa) */}
                      {bellScheduleList && bellScheduleList.length > 0 && (
                        <View style={[styles.scheduleOptionSection, { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Ionicons name="time" size={16} color="#4F46E5" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                              ⏰ TESPİT EDİLEN OKUL GİRİŞ - ÇIKIŞ SAATLERİ ({bellScheduleList.length} Ders):
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {bellScheduleList.map((b: any) => (
                              <View key={b.period} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                                  {b.period}. Ders: <Text style={{ fontWeight: '600', color: '#1E293B' }}>{b.time}</Text>
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Öğretmen Haftalık Saat (HS) Doğrulama & Çizelge Sağlaması */}
                      {parsedSchedule.teacherVerifications && parsedSchedule.teacherVerifications.length > 0 && (
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', padding: 12, marginBottom: 14 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons name="shield-checkmark" size={17} color="#4F46E5" />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                                ⚖️ Öğretmen Haftalık Ders Saati (HS) Sağlaması
                              </Text>
                            </View>
                            <View style={{
                              backgroundColor: parsedSchedule.teacherVerifications.every((v: any) => v.isConsistent) ? '#DCFCE7' : '#FEF3C7',
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}>
                              <Text style={{
                                fontSize: 11,
                                fontWeight: '800',
                                color: parsedSchedule.teacherVerifications.every((v: any) => v.isConsistent) ? '#15803D' : '#B45309'
                              }}>
                                {parsedSchedule.teacherVerifications.every((v: any) => v.isConsistent)
                                  ? '✅ Tüm Kadro Tam Tutarlı'
                                  : `⚠️ ${parsedSchedule.teacherVerifications.filter((v: any) => !v.isConsistent).length} Öğretmende Saat Farkı`}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                            Çarşafın altındaki resmî ders dağılım çizelgesindeki toplam saat (HS) ile ızgaradan çıkarılan dersler karşılaştırıldı (Bir öğretmene dokunarak programını inceleyebilir ve kağıda bakarak eksik saatleri elle düzeltebilirsiniz):
                          </Text>

                          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6 }}>
                            {parsedSchedule.teacherVerifications.map((v: any, vIdx: any) => (
                              <TouchableOpacity
                                key={vIdx}
                                activeOpacity={0.7}
                                onPress={() => handleOpenTeacherScheduleInspector(v.teacherName)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  backgroundColor: teacherConflictsCountMap[v.teacherName.toLowerCase()]
                                    ? '#FFF5F5'
                                    : v.isConsistent ? '#FFFFFF' : '#FFFBEB',
                                  paddingHorizontal: 10,
                                  paddingVertical: 8,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: teacherConflictsCountMap[v.teacherName.toLowerCase()]
                                    ? '#FCA5A5'
                                    : v.isConsistent ? '#E2E8F0' : '#FCD34D'
                                }}
                              >
                                <View style={{ flex: 1, marginRight: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>{v.teacherName}</Text>
                                    {teacherConflictsCountMap[v.teacherName.toLowerCase()] ? (
                                      <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#FECACA' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626' }}>
                                          ⚠️ {teacherConflictsCountMap[v.teacherName.toLowerCase()]} Çakışma
                                        </Text>
                                      </View>
                                    ) : null}
                                    <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 10, color: '#4F46E5', fontWeight: '700' }}>✏️ İncele & Düzenle</Text>
                                    </View>
                                  </View>
                                  <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                                    Çizelgedeki Saat: {v.expectedWeeklyHours != null ? `${v.expectedWeeklyHours} Saat` : '—'} • Çıkarılan: {v.extractedWeeklyHours} Saat
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{
                                    backgroundColor: v.isConsistent ? '#F0FDF4' : '#FEF2F2',
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    borderColor: v.isConsistent ? '#BBF7D0' : '#FECACA'
                                  }}>
                                    <Text style={{
                                      fontSize: 10,
                                      fontWeight: '800',
                                      color: v.isConsistent ? '#166534' : '#DC2626'
                                    }}>
                                      {v.isConsistent ? `✅ ${v.extractedWeeklyHours}/${v.expectedWeeklyHours || v.extractedWeeklyHours} Saat` : `⚠️ ${v.extractedWeeklyHours}/${v.expectedWeeklyHours} Saat`}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                                </View>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {/* Derslerin Gerçek Haftalık Saatleri (HS) */}
                      {parsedSchedule.lessonDetails && parsedSchedule.lessonDetails.some((l: any) => (l.weeklyHours || 0) > 0) && (
                        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0', padding: 10, marginBottom: 14 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="checkmark-done-circle" size={16} color="#16A34A" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                              📚 Çizelgeden Okunan Gerçek Haftalık Ders Saatleri (HS):
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {parsedSchedule.lessonDetails.filter((l: any) => (l.weeklyHours || 0) > 0).map((l: any, lIdx: any) => (
                              <View key={lIdx} style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#86EFAC' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>
                                  {l.name}: <Text style={{ fontWeight: '800', color: '#166534' }}>{l.weeklyHours} Saat</Text>
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* 1. İşlem / Kayıt Modu Seçimi */}
                      <View style={styles.scheduleOptionSection}>
                        <Text style={styles.scheduleOptionSectionTitle}>1. KAYIT MODU SEÇİN:</Text>

                        {/* Mod A: Merge / Update */}
                        <TouchableOpacity
                          style={[
                            styles.scheduleModeCard,
                            scheduleSaveMode === 'merge' && styles.scheduleModeCardActiveMerge,
                          ]}
                          onPress={() => setScheduleSaveMode('merge')}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={scheduleSaveMode === 'merge' ? 'radio-button-on' : 'radio-button-off'}
                            size={20}
                            color={scheduleSaveMode === 'merge' ? '#059669' : '#94A3B8'}
                          />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={[styles.scheduleModeTitle, scheduleSaveMode === 'merge' && { color: '#059669' }]}>
                              🔄 Mevcutları Koru & Güncelle (Önerilen)
                            </Text>
                            <Text style={styles.scheduleModeDesc}>
                              Var olan öğretmen, sınıf ve ders programı silinmez. Sadece yeni veya değişen veriler eklenir/güncellenir.
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Mod B: Overwrite */}
                        <TouchableOpacity
                          style={[
                            styles.scheduleModeCard,
                            scheduleSaveMode === 'overwrite' && styles.scheduleModeCardActiveOverwrite,
                          ]}
                          onPress={() => setScheduleSaveMode('overwrite')}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={scheduleSaveMode === 'overwrite' ? 'radio-button-on' : 'radio-button-off'}
                            size={20}
                            color={scheduleSaveMode === 'overwrite' ? '#DC2626' : '#94A3B8'}
                          />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={[styles.scheduleModeTitle, scheduleSaveMode === 'overwrite' && { color: '#DC2626' }]}>
                              ⚠️ Sıfırdan Temiz Kurulum (Mevcut Programı Sil)
                            </Text>
                            <Text style={styles.scheduleModeDesc}>
                              Okuldaki tüm mevcut haftalık ders dağılım saatleri silinir ve bu çarşaf program sıfırdan yazılır. Sistemde kayıtlı öğretmenlerin kullanıcı adı, şifre ve hesapları KESİNLİKLE silinmez ve korunur.
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* 2. Sisteme Yazılacak Veriler (Checkboxes & Tıklanabilir Pasif/Aktif Öğeler) */}
                      <View style={styles.scheduleOptionSection}>
                        <Text style={styles.scheduleOptionSectionTitle}>2. SİSTEME YAZILACAK VERİLERİ SEÇİN:</Text>

                        {/* Öğretmenler */}
                        <View style={styles.scheduleCheckboxContainer}>
                          <View style={styles.scheduleCheckboxRow}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                              onPress={() => setSaveTeachersChecked(!saveTeachersChecked)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={saveTeachersChecked ? 'checkbox' : 'square-outline'}
                                size={22}
                                color={saveTeachersChecked ? '#4F46E5' : '#94A3B8'}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.scheduleCheckboxTitle}>
                                  👨‍🏫 Öğretmen Kadrosu ({activeTeachersCount}/{teachersList.length} Aktif)
                                </Text>
                                <Text style={styles.scheduleCheckboxSub}>
                                  Bulunan öğretmenleri okul kadrosuna ekler / eşleştirir.
                                </Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.scheduleToggleBtn}
                              onPress={() => setShowTeachersList(!showTeachersList)}
                            >
                              <Ionicons name={showTeachersList ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
                            </TouchableOpacity>
                          </View>

                          {showTeachersList && (
                            <View style={styles.chipsWrapper}>
                              <View style={styles.chipActionsBar}>
                                <Text style={styles.chipHelpText}>
                                  💡 Hatalı veya mükerrer adların üzerine dokunarak <Text style={{ fontWeight: '800', color: '#EF4444' }}>Pasif</Text> yapabilirsiniz (sisteme kaydedilmez):
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <TouchableOpacity
                                    onPress={() => setAllTeachersExcluded(false)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Aktif Et</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setAllTeachersExcluded(true)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Bırak</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              <View style={styles.chipsContainer}>
                                {teachersList.map((t: any, idx: any) => {
                                  const isExcluded = excludedTeachers.includes(t);
                                  return (
                                    <View
                                      key={idx}
                                      style={[styles.itemChip, isExcluded && styles.itemChipExcluded, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                                    >
                                      <TouchableOpacity
                                        onPress={() => toggleExcludeTeacher(t)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                      >
                                        <Ionicons
                                          name={isExcluded ? 'close-circle' : 'checkmark-circle'}
                                          size={14}
                                          color={isExcluded ? '#EF4444' : '#16A34A'}
                                        />
                                        <Text style={[styles.itemChipText, isExcluded && styles.itemChipTextExcluded]}>
                                          {t}
                                        </Text>
                                        {isExcluded && <Text style={styles.excludedBadgeText}>(Pasif)</Text>}
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={() => handleOpenTeacherScheduleInspector(t)}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        style={{ paddingLeft: 3 }}
                                      >
                                        <Ionicons name="create-outline" size={13} color={isExcluded ? '#94A3B8' : '#4F46E5'} />
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })}
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Sınıflar & Şubeler */}
                        <View style={styles.scheduleCheckboxContainer}>
                          <View style={styles.scheduleCheckboxRow}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                              onPress={() => setSaveClassesChecked(!saveClassesChecked)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={saveClassesChecked ? 'checkbox' : 'square-outline'}
                                size={22}
                                color={saveClassesChecked ? '#4F46E5' : '#94A3B8'}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.scheduleCheckboxTitle}>
                                  🏫 Sınıflar & Şubeler ({activeClassesCount}/{classesList.length} Aktif)
                                </Text>
                                <Text style={styles.scheduleCheckboxSub}>
                                  Belirlenen şubeleri okulun sınıf listesine kaydeder.
                                </Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.scheduleToggleBtn}
                              onPress={() => setShowClassesList(!showClassesList)}
                            >
                              <Ionicons name={showClassesList ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
                            </TouchableOpacity>
                          </View>

                          {showClassesList && (
                            <View style={styles.chipsWrapper}>
                              <View style={styles.chipActionsBar}>
                                <Text style={styles.chipHelpText}>
                                  💡 Kaydedilmesini istemediğiniz şubelerin üzerine dokunarak pasif yapabilirsiniz:
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <TouchableOpacity
                                    onPress={() => setAllClassesExcluded(false)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Aktif Et</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setAllClassesExcluded(true)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Bırak</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              <View style={styles.chipsContainer}>
                                {classesList.map((c: any, idx: any) => {
                                  const isExcluded = excludedClasses.includes(c);
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      style={[
                                        styles.itemChip,
                                        { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' },
                                        isExcluded && styles.itemChipExcluded,
                                      ]}
                                      onPress={() => toggleExcludeClass(c)}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons
                                        name={isExcluded ? 'close-circle' : 'checkmark-circle'}
                                        size={14}
                                        color={isExcluded ? '#EF4444' : '#7C3AED'}
                                      />
                                      <Text
                                        style={[
                                          styles.itemChipText,
                                          { color: '#6D28D9' },
                                          isExcluded && styles.itemChipTextExcluded,
                                        ]}
                                      >
                                        {c}
                                      </Text>
                                      {isExcluded && <Text style={styles.excludedBadgeText}>(Pasif)</Text>}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Ders Havuzu */}
                        <View style={styles.scheduleCheckboxContainer}>
                          <View style={styles.scheduleCheckboxRow}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                              onPress={() => setSaveLessonsChecked(!saveLessonsChecked)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={saveLessonsChecked ? 'checkbox' : 'square-outline'}
                                size={22}
                                color={saveLessonsChecked ? '#4F46E5' : '#94A3B8'}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.scheduleCheckboxTitle}>
                                  📚 Ders Havuzu ({activeLessonsCount}/{lessonsList.length} Aktif)
                                </Text>
                                <Text style={styles.scheduleCheckboxSub}>
                                  Bulunan dersleri okulun dersler havuzuna ekler.
                                </Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.scheduleToggleBtn}
                              onPress={() => setShowLessonsList(!showLessonsList)}
                            >
                              <Ionicons name={showLessonsList ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
                            </TouchableOpacity>
                          </View>

                          {showLessonsList && (
                            <View style={styles.chipsWrapper}>
                              <View style={styles.chipActionsBar}>
                                <Text style={styles.chipHelpText}>
                                  💡 Okul ders havuzuna eklenmesini istemediğiniz derslere dokunarak pasif yapabilirsiniz:
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <TouchableOpacity
                                    onPress={() => setAllLessonsExcluded(false)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Aktif Et</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setAllLessonsExcluded(true)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Bırak</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              <View style={styles.chipsContainer}>
                                {lessonsList.map((l: any, idx: any) => {
                                  const isExcluded = excludedLessons.includes(l);
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      style={[
                                        styles.itemChip,
                                        { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                                        isExcluded && styles.itemChipExcluded,
                                      ]}
                                      onPress={() => toggleExcludeLesson(l)}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons
                                        name={isExcluded ? 'close-circle' : 'checkmark-circle'}
                                        size={14}
                                        color={isExcluded ? '#EF4444' : '#059669'}
                                      />
                                      <Text
                                        style={[
                                          styles.itemChipText,
                                          { color: '#047857' },
                                          isExcluded && styles.itemChipTextExcluded,
                                        ]}
                                      >
                                        {l}
                                      </Text>
                                      {isExcluded && <Text style={styles.excludedBadgeText}>(Pasif)</Text>}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Haftalık Ders Programı */}
                        <View style={styles.scheduleCheckboxContainer}>
                          <View style={styles.scheduleCheckboxRow}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                              onPress={() => setSaveScheduleChecked(!saveScheduleChecked)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={saveScheduleChecked ? 'checkbox' : 'square-outline'}
                                size={22}
                                color={saveScheduleChecked ? '#4F46E5' : '#94A3B8'}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.scheduleCheckboxTitle}>
                                  📅 Haftalık Ders Programı ({activeScheduleItemsCount}/{scheduleItemsList.length} Ders Saati Aktif)
                                </Text>
                                <Text style={styles.scheduleCheckboxSub}>
                                  Haftalık gün ve saat bazında tüm ders eşleştirmelerini yazar.
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </>
                  );
                })()}

                {/* Aksiyon Butonları */}
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {/* Havuza Ekle Butonu */}
                    <TouchableOpacity
                      style={[styles.batchSaveToPoolBtn, { flex: 1 }]}
                      onPress={handleAddCurrentToBatches}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="archive-outline" size={17} color="#059669" />
                      <Text style={styles.batchSaveToPoolBtnText}>📥 Havuza Ekle</Text>
                    </TouchableOpacity>

                    {/* Havuzdaki Diğer Parçalarla Birleştir Butonu (Varsa) */}
                    {scheduleBatches.length > 0 && (
                      <TouchableOpacity
                        style={[styles.batchMergeBtn, { flex: 1 }]}
                        onPress={handleMergeAllBatches}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="git-merge-outline" size={17} color="#4F46E5" />
                        <Text style={styles.batchMergeBtnText}>
                          🧩 Havuzla Birleştir ({scheduleBatches.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.scheduleActionButtonsRow}>
                    <TouchableOpacity
                      style={styles.cancelUploadButton}
                      onPress={() => {
                        setParsedSchedule(null);
                        setAiModalVisible(false);
                      }}
                    >
                      <Text style={styles.cancelUploadText}>Vazgeç</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.confirmSaveButton, { flex: 2 }]}
                      onPress={executeSaveSchedule}
                      disabled={aiSaving}
                    >
                      {aiSaving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload" size={18} color="#fff" />
                          <Text style={styles.confirmSaveText}>Seçilenleri Sunucuya Kaydet</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={inspectTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%', paddingBottom: 16 }]}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="person-circle" size={26} color="#4F46E5" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>{inspectingTeacher}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Çarşaf Program İnceleme & Eksik Saat Tamamlama
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setInspectTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
              {/* Durum / Sağlama Kartı */}
              {(() => {
                const expectedHours = inspectingVerification?.expectedWeeklyHours;
                const currentHours = inspectingItems.length;
                const diff = expectedHours != null ? expectedHours - currentHours : 0;
                const isMatched = expectedHours != null && diff === 0;

                return (
                  <View style={{
                    backgroundColor: isMatched ? '#F0FDF4' : diff > 0 ? '#FFFBEB' : '#FEF2F2',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isMatched ? '#BBF7D0' : diff > 0 ? '#FCD34D' : '#FECACA',
                    padding: 12,
                    marginBottom: 12,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                        ⚖️ Haftalık Ders Yükü Durumu
                      </Text>
                      <View style={{
                        backgroundColor: isMatched ? '#DCFCE7' : diff > 0 ? '#FEF3C7' : '#FEE2E2',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: isMatched ? '#15803D' : diff > 0 ? '#B45309' : '#DC2626',
                        }}>
                          {expectedHours == null
                            ? `${currentHours} Saat Yerleşti`
                            : isMatched
                              ? `✅ Tam Tutarlı (${currentHours}/${expectedHours} Saat)`
                              : diff > 0
                                ? `⚠️ ${diff} Saat Eksik (${currentHours}/${expectedHours} Saat)`
                                : `⚠️ ${Math.abs(diff)} Saat Fazla (${currentHours}/${expectedHours} Saat)`}
                        </Text>
                      </View>
                    </View>

                    {(pendingScheduleFile || cachedScheduleDoc) && (
                      <View style={{ marginBottom: 8 }}>
                        {/* İPUCU / DÜZELTME GİRDİ ALANI */}
                        <View style={{
                          backgroundColor: '#F8FAFC',
                          borderWidth: 1,
                          borderColor: '#E2E8F0',
                          borderRadius: 8,
                          padding: 8,
                          marginBottom: 6,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="bulb-outline" size={13} color="#D97706" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>
                                AI İpucu / Düzeltme Notu (İsteğe Bağlı)
                              </Text>
                            </View>
                            {teacherRescanHint.length > 0 && (
                              <TouchableOpacity onPress={() => setTeacherRescanHint('')}>
                                <Text style={{ fontSize: 10, color: '#94A3B8' }}>Temizle</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <TextInput
                            placeholder="Örn: Salı günü tamamen boş, dersler Çarşamba günüdür..."
                            placeholderTextColor="#94A3B8"
                            value={teacherRescanHint}
                            onChangeText={setTeacherRescanHint}
                            style={{
                              backgroundColor: '#FFFFFF',
                              borderWidth: 1,
                              borderColor: '#CBD5E1',
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                              fontSize: 11,
                              color: '#1E293B',
                            }}
                          />
                        </View>

                        <TouchableOpacity
                          disabled={reScanningTeacher}
                          onPress={() => handleRescanTeacherFromDocument()}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            backgroundColor: teacherRescanHint.trim() ? '#4338CA' : '#EEF2FF',
                            borderWidth: 1,
                            borderColor: teacherRescanHint.trim() ? '#3730A3' : '#C7D2FE',
                            borderRadius: 8,
                            paddingVertical: 8,
                          }}
                        >
                          {reScanningTeacher ? (
                            <ActivityIndicator size="small" color={teacherRescanHint.trim() ? '#fff' : '#4F46E5'} />
                          ) : (
                            <Ionicons name="flash" size={14} color={teacherRescanHint.trim() ? '#fff' : '#4F46E5'} />
                          )}
                          <Text style={{ fontSize: 11, fontWeight: '700', color: teacherRescanHint.trim() ? '#fff' : '#4338CA' }}>
                            {reScanningTeacher
                              ? 'Öğretmen Belgeden Taranıyor...'
                              : teacherRescanHint.trim()
                                ? '⚡ İpucuyla Belgeden Yeniden Oku'
                                : '⚡ Bu Öğretmeni Belgeden Yeniden Oku'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Kağıttaki Beklenen Saat Ayarı (Gerekirse düzeltme) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, marginTop: 4, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Ionicons name="document-text-outline" size={15} color="#4F46E5" />
                        <Text style={{ fontSize: 11, color: '#475569' }}>
                          Kağıttaki Resmi Saat (HS): <Text style={{ fontWeight: '800', color: '#1E293B' }}>{expectedHours ?? 'Belirtilmemiş'} Saat</Text>
                        </Text>
                      </View>
                      {editingExpectedHours ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TextInput
                            style={{
                              borderWidth: 1,
                              borderColor: '#4F46E5',
                              borderRadius: 6,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              fontSize: 11,
                              fontWeight: '700',
                              width: 44,
                              textAlign: 'center',
                              backgroundColor: '#fff',
                            }}
                            keyboardType="numeric"
                            value={tempExpectedHours}
                            onChangeText={setTempExpectedHours}
                          />
                          <TouchableOpacity onPress={handleSaveExpectedHours} style={{ backgroundColor: '#4F46E5', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingExpectedHours(false)} style={{ backgroundColor: '#94A3B8', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
                            <Ionicons name="close" size={12} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => setEditingExpectedHours(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                          <Ionicons name="pencil" size={11} color="#4F46E5" />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>Düzelt</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 6, lineHeight: 14 }}>
                      {diff > 0
                        ? '💡 Kağıttaki programa göre eksik kalan dersler var. Aşağıdan ilgili güne gidip boş saatlere ders ekleyebilirsiniz.'
                        : diff < 0
                          ? '⚠️ Kağıttan fazla ders girilmiş görünüyor. Mükerrer dersleri çöp kutusu simgesine basarak silebilirsiniz.'
                          : '🎉 Bu öğretmenin haftalık ders programı kağıttaki çizelgeyle tam olarak örtüşüyor.'}
                    </Text>
                  </View>
                );
              })()}

              {/* Alt tablodan okunan ders yükü dökümü - TIKLANABİLİR HIZLI DOLDURMA KARTLARI */}
              {inspectingVerification?.workloadItems && inspectingVerification.workloadItems.length > 0 && (
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#CBD5E1', padding: 10, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>
                      📄 Kağıdın Alt Tablosundaki Ders Dağılımı:
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1' }}>
                      ⚡ Dokunarak Saate Otomatik Doldur
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {inspectingVerification.workloadItems.map((wi: any, wIdx: any) => {
                      const cleanCls = wi.className.replace('/', '-').trim().toUpperCase();
                      const parts = cleanCls.split('-');
                      const lName = wi.lessonName || wi.lessonCode || 'Ders';
                      const currentEditCls = editingCellSlot ? `${editingCellSlot.grade}-${editingCellSlot.section}`.toUpperCase() : '';
                      const isSelected = editingCellSlot && currentEditCls === cleanCls && (
                        editingCellSlot.lessonName.toUpperCase() === lName.toUpperCase() ||
                        editingCellSlot.lessonName.toUpperCase() === (wi.lessonCode || '').toUpperCase()
                      );

                      return (
                        <TouchableOpacity
                          key={wIdx}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (editingCellSlot) {
                              setEditingCellSlot({
                                ...editingCellSlot,
                                grade: parts[0] || '9',
                                section: parts[1] || 'A',
                                lessonName: lName,
                              });
                            } else {
                              // Aktif gündeki ilk boş saati bulup otomatik düzenlemeye al
                              const maxH = Math.max(8, ...inspectingItems.map((it: any) => it.lessonHour));
                              const allHours = Array.from({ length: maxH }, (_: any, i: any) => i + 1);
                              const firstEmpty = allHours.find((h: any) => !inspectingItems.some((it: any) => it.dayOfWeek === inspectDayTab && it.lessonHour === h)) || 1;
                              setEditingCellSlot({
                                dayOfWeek: inspectDayTab,
                                lessonHour: firstEmpty,
                                grade: parts[0] || '9',
                                section: parts[1] || 'A',
                                lessonName: lName,
                              });
                            }
                          }}
                          style={{
                            backgroundColor: isSelected ? '#4F46E5' : '#FFFFFF',
                            borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#3730A3' : '#94A3B8',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            shadowColor: isSelected ? '#4F46E5' : '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: isSelected ? 0.2 : 0.05,
                            shadowRadius: 2,
                            elevation: isSelected ? 2 : 1,
                          }}
                        >
                          {isSelected && <Ionicons name="checkmark-circle" size={13} color="#fff" />}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#fff' : '#1E293B' }}>
                            {cleanCls} {wi.lessonCode || wi.lessonName}
                          </Text>
                          <View style={{
                            backgroundColor: isSelected ? '#3730A3' : '#EEF2FF',
                            borderRadius: 5,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                          }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: isSelected ? '#C7D2FE' : '#4F46E5' }}>
                              {wi.weeklyHours} Saat
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Gün Seçici Sekmeler (Pazartesi .. Cuma) */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {[
                  { id: 1, name: 'Pazartesi', short: 'Pzt' },
                  { id: 2, name: 'Salı', short: 'Sal' },
                  { id: 3, name: 'Çarşamba', short: 'Çar' },
                  { id: 4, name: 'Perşembe', short: 'Per' },
                  { id: 5, name: 'Cuma', short: 'Cum' },
                ].map((d: any) => {
                  const dayLessons = inspectingItems.filter((it: any) => it.dayOfWeek === d.id);
                  const dayCount = dayLessons.length;
                  const isActive = inspectDayTab === d.id;

                  // Bu günde bu öğretmenin başka öğretmenle çakışan dersi var mı?
                  const hasDayConflict = dayLessons.some((it: any) => {
                    const itemClass = `${it.grade}-${it.section}`.toUpperCase().trim();
                    return (parsedSchedule?.scheduleItems || []).some((ot: any) =>
                      (ot.teacherName || '').trim().toLowerCase() !== inspectingTeacher.trim().toLowerCase() &&
                      ot.dayOfWeek === d.id &&
                      ot.lessonHour === it.lessonHour &&
                      `${ot.grade}-${ot.section}`.toUpperCase().trim() === itemClass
                    );
                  });

                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setInspectDayTab(d.id);
                        setEditingCellSlot(null);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        backgroundColor: isActive
                          ? (hasDayConflict ? '#DC2626' : '#4F46E5')
                          : (hasDayConflict ? '#FEF2F2' : '#F1F5F9'),
                        borderWidth: hasDayConflict ? 1.5 : 1,
                        borderColor: isActive
                          ? (hasDayConflict ? '#B91C1C' : '#4F46E5')
                          : (hasDayConflict ? '#EF4444' : '#CBD5E1'),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: isActive
                            ? '#FFFFFF'
                            : (hasDayConflict ? '#DC2626' : '#475569'),
                        }}
                      >
                        {hasDayConflict ? `⚠️ ${d.short}` : d.short}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: isActive
                            ? (hasDayConflict ? '#FEE2E2' : '#C7D2FE')
                            : (hasDayConflict ? '#EF4444' : '#94A3B8'),
                          marginTop: 2,
                        }}
                      >
                        {dayCount} Saat {hasDayConflict ? '(!)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Aktif Gün Hızlı İşlemler (Boşalt veya Başka Güne Taşı) */}
              {(() => {
                const currentDayLessons = inspectingItems.filter((it: any) => it.dayOfWeek === inspectDayTab);
                const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
                const currentDayName = dayNames[inspectDayTab - 1] || 'Gün';

                if (currentDayLessons.length === 0) return null;

                return (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    marginBottom: 10,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Ionicons name="information-circle" size={16} color="#DC2626" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#991B1B' }}>
                        {currentDayName}: {currentDayLessons.length} ders
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const otherDays = [
                            { id: 1, name: 'Pazartesi' },
                            { id: 2, name: 'Salı' },
                            { id: 3, name: 'Çarşamba' },
                            { id: 4, name: 'Perşembe' },
                            { id: 5, name: 'Cuma' },
                          ].filter((d: any) => d.id !== inspectDayTab);

                          Alert.alert(
                            'Dersleri Başka Güne Taşı',
                            `${currentDayName} günündeki ${currentDayLessons.length} dersi hangi güne aktarmak istiyorsunuz?`,
                            [
                              ...otherDays.map((d: any) => ({
                                text: d.name,
                                onPress: () => {
                                  setInspectingItems((prev: any) => {
                                    return prev.map((it: any) => {
                                      if (it.dayOfWeek === inspectDayTab) {
                                        return { ...it, dayOfWeek: d.id };
                                      }
                                      return it;
                                    });
                                  });
                                  setInspectDayTab(d.id);
                                }
                              })),
                              { text: 'Vazgeç', style: 'cancel' }
                            ]
                          );
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#4F46E5',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Ionicons name="arrow-forward-circle-outline" size={13} color="#fff" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Güne Taşı</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Günü Boşalt',
                            `${currentDayName} günündeki ${currentDayLessons.length} dersi silip günü tamamen boşaltmak istiyor musunuz?`,
                            [
                              { text: 'Vazgeç', style: 'cancel' },
                              {
                                text: 'Günü Boşalt',
                                style: 'destructive',
                                onPress: () => {
                                  setInspectingItems((prev: any) => prev.filter((it: any) => it.dayOfWeek !== inspectDayTab));
                                }
                              }
                            ]
                          );
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#DC2626',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Ionicons name="trash-bin-outline" size={13} color="#fff" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Günü Boşalt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {/* Hücre Düzenleme / Ekleme Kartı (Varsa Açık) */}
              {editingCellSlot && (
                <View style={{
                  backgroundColor: '#EEF2FF',
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#818CF8',
                  padding: 12,
                  marginBottom: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#312E81' }}>
                      ✏️ {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'][editingCellSlot.dayOfWeek - 1]} - {editingCellSlot.lessonHour}. Ders Saati
                    </Text>
                    <TouchableOpacity onPress={() => setEditingCellSlot(null)}>
                      <Ionicons name="close-circle" size={18} color="#6366F1" />
                    </TouchableOpacity>
                  </View>

                  {/* 0. DERS SAATİ NUMARASI SEÇİMİ */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                        ⏰ Ders Saati Numarası:
                      </Text>
                      <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#1E40AF' }}>
                          {editingCellSlot.lessonHour}. Ders Saati
                        </Text>
                      </View>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                        {Array.from(
                          { length: Math.max(10, ...inspectingItems.map((it: any) => it.lessonHour), editingCellSlot.lessonHour) },
                          (_: any, i: any) => i + 1
                        ).map((h: any) => {
                          const isSel = editingCellSlot.lessonHour === h;
                          const isOccupied = inspectingItems.some((it: any) =>
                            it.dayOfWeek === editingCellSlot.dayOfWeek &&
                            it.lessonHour === h &&
                            !(it.dayOfWeek === (editingCellSlot.originDayOfWeek ?? editingCellSlot.dayOfWeek) &&
                              it.lessonHour === (editingCellSlot.originLessonHour ?? editingCellSlot.lessonHour))
                          );

                          return (
                            <TouchableOpacity
                              key={h}
                              onPress={() => setEditingCellSlot({ ...editingCellSlot, lessonHour: h })}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                                backgroundColor: isSel ? '#4F46E5' : (isOccupied ? '#FEF3C7' : '#FFFFFF'),
                                borderWidth: 1.5,
                                borderColor: isSel ? '#4338CA' : (isOccupied ? '#F59E0B' : '#CBD5E1'),
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#FFFFFF' : (isOccupied ? '#92400E' : '#1E293B') }}>
                                {h}. Saat
                              </Text>
                              {isOccupied && !isSel && (
                                <Text style={{ fontSize: 8, fontWeight: '700', color: '#B45309' }}>Dolu</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>

                  {/* Listbox Seçim Alanı: Öğretmenin Kendi Dersleri ve Sınıfları */}
                  {(() => {
                    // 1. Öğretmenin Kendi Ders Listesi:
                    const teacherLessonsMap = new Map<string, { name: string; code?: string; weeklyHours?: number }>();
                    (inspectingVerification?.workloadItems || []).forEach((wi: any) => {
                      const key = (wi.lessonName || wi.lessonCode || '').trim();
                      if (key) {
                        teacherLessonsMap.set(key.toUpperCase(), {
                          name: wi.lessonName || wi.lessonCode || key,
                          code: wi.lessonCode,
                          weeklyHours: wi.weeklyHours,
                        });
                      }
                      if (wi.lessonCode && wi.lessonName && wi.lessonCode !== wi.lessonName) {
                        teacherLessonsMap.set(wi.lessonCode.toUpperCase(), {
                          name: wi.lessonName,
                          code: wi.lessonCode,
                          weeklyHours: wi.weeklyHours,
                        });
                      }
                    });

                    inspectingItems.forEach((it: any) => {
                      if (it.lessonName) {
                        const key = it.lessonName.trim().toUpperCase();
                        if (!teacherLessonsMap.has(key)) {
                          teacherLessonsMap.set(key, {
                            name: it.lessonName,
                            code: it.lessonCode,
                          });
                        }
                      }
                    });

                    const teacherLessons = Array.from(teacherLessonsMap.values());

                    // Diğer Okul Dersleri:
                    const otherLessons = (parsedSchedule?.lessons || []).filter((lsn: any) => {
                      const upper = lsn.trim().toUpperCase();
                      return !teacherLessonsMap.has(upper) && !Array.from(teacherLessonsMap.values()).some((tl: any) => tl.name.toUpperCase() === upper || tl.code?.toUpperCase() === upper);
                    });

                    // 2. Öğretmenin Kendi Sınıfları:
                    const teacherClassesSet = new Set<string>();
                    (inspectingVerification?.workloadItems || []).forEach((wi: any) => {
                      if (wi.className) teacherClassesSet.add(wi.className.replace('/', '-').toUpperCase().trim());
                    });
                    inspectingItems.forEach((it: any) => {
                      teacherClassesSet.add(`${it.grade}-${it.section}`.toUpperCase().trim());
                    });
                    const teacherClasses = Array.from(teacherClassesSet);

                    // Diğer Okul Şubeleri:
                    const otherClasses = (parsedSchedule?.classes || []).filter((cls: any) => !teacherClassesSet.has(cls.toUpperCase().trim()));

                    const currentClass = `${editingCellSlot.grade}-${editingCellSlot.section}`.toUpperCase();

                    return (
                      <View style={{ gap: 10 }}>
                        {/* ⚡ Hızlı Paket Seçimi: Kağıdın Alt Tablosundaki Dağılım Çipleri */}
                        {inspectingVerification?.workloadItems && inspectingVerification.workloadItems.length > 0 && (
                          <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#4338CA', marginBottom: 5 }}>
                              ⚡ Kağıttaki Ders Paketiyle 1-Tıkla Doldur:
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                {inspectingVerification.workloadItems.map((wi: any, wIdx: any) => {
                                  const cleanCls = wi.className.replace('/', '-').toUpperCase();
                                  const parts = cleanCls.split('-');
                                  const lName = wi.lessonName || wi.lessonCode || 'Ders';
                                  const isSelected = currentClass === cleanCls && (editingCellSlot.lessonName.toUpperCase() === lName.toUpperCase() || editingCellSlot.lessonName.toUpperCase() === (wi.lessonCode || '').toUpperCase());

                                  return (
                                    <TouchableOpacity
                                      key={wIdx}
                                      onPress={() => {
                                        setEditingCellSlot({
                                          ...editingCellSlot,
                                          grade: parts[0] || '9',
                                          section: parts[1] || 'A',
                                          lessonName: lName,
                                        });
                                      }}
                                      style={{
                                        backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: isSelected ? '#4338CA' : '#CBD5E1',
                                        paddingHorizontal: 8,
                                        paddingVertical: 5,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                    >
                                      {isSelected && <Ionicons name="checkmark-circle" size={12} color="#fff" />}
                                      <Text style={{ fontSize: 11, fontWeight: '800', color: isSelected ? '#fff' : '#1E293B' }}>
                                        {cleanCls} • {wi.lessonCode || wi.lessonName}
                                      </Text>
                                      <View style={{ backgroundColor: isSelected ? '#3730A3' : '#E2E8F0', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: isSelected ? '#C7D2FE' : '#475569' }}>
                                          {wi.weeklyHours}s
                                        </Text>
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </ScrollView>
                          </View>
                        )}

                        {/* 1. ŞUBE SEÇİM LİSTBOX'I (Elle yazma kaldırıldı) */}
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                              🏫 Şube Seçimi:
                            </Text>
                            <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '900', color: '#1E40AF' }}>
                                Seçili: {currentClass}
                              </Text>
                            </View>
                          </View>

                          {/* Öğretmenin Şubeleri */}
                          <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '700', marginBottom: 3 }}>
                            Öğretmenin Girdiği Sınıflar:
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                            {teacherClasses.map((cls: any, cIdx: any) => {
                              const isSel = currentClass === cls;
                              const parts = cls.split('-');
                              return (
                                <TouchableOpacity
                                  key={cIdx}
                                  onPress={() => setEditingCellSlot({
                                    ...editingCellSlot,
                                    grade: parts[0] || '9',
                                    section: parts[1] || 'A',
                                  })}
                                  style={{
                                    backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? '#4338CA' : '#CBD5E1',
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#fff' : '#1E293B' }}>
                                    {cls}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Diğer Okul Şubeleri (Gerekirse) */}
                          {otherClasses.length > 0 && (
                            <>
                              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', marginBottom: 3 }}>
                                Diğer Okul Şubeleri:
                              </Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                  {otherClasses.map((cls: any, cIdx: any) => {
                                    const isSel = currentClass === cls;
                                    const parts = cls.split('-');
                                    return (
                                      <TouchableOpacity
                                        key={cIdx}
                                        onPress={() => setEditingCellSlot({
                                          ...editingCellSlot,
                                          grade: parts[0] || '9',
                                          section: parts[1] || 'A',
                                        })}
                                        style={{
                                          backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                          paddingHorizontal: 8,
                                          paddingVertical: 4,
                                          borderRadius: 6,
                                          borderWidth: 1,
                                          borderColor: isSel ? '#4338CA' : '#E2E8F0',
                                        }}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? '#fff' : '#64748B' }}>
                                          {cls}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </ScrollView>
                            </>
                          )}
                        </View>

                        {/* 2. DERS ADI SEÇİM LİSTBOX'I (Elle yazma kaldırıldı) */}
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                              📚 Ders Seçimi:
                            </Text>
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, maxWidth: '65%' }}>
                              <Text style={{ fontSize: 11, fontWeight: '900', color: '#92400E' }} numberOfLines={1}>
                                Seçili: {editingCellSlot.lessonName || 'Seçilmedi'}
                              </Text>
                            </View>
                          </View>

                          {/* Öğretmenin Resmî Dersleri */}
                          <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '700', marginBottom: 4 }}>
                            Öğretmenin Resmî Dersleri:
                          </Text>
                          <View style={{ gap: 5, marginBottom: 6 }}>
                            {teacherLessons.map((tl: any, lIdx: any) => {
                              const isSel = editingCellSlot.lessonName.toUpperCase() === tl.name.toUpperCase() ||
                                (tl.code && editingCellSlot.lessonName.toUpperCase() === tl.code.toUpperCase());

                              return (
                                <TouchableOpacity
                                  key={lIdx}
                                  onPress={() => setEditingCellSlot({ ...editingCellSlot, lessonName: tl.name })}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? '#4338CA' : '#CBD5E1',
                                    paddingHorizontal: 10,
                                    paddingVertical: 7,
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Ionicons
                                      name={isSel ? "radio-button-on" : "radio-button-off"}
                                      size={16}
                                      color={isSel ? "#fff" : "#94A3B8"}
                                    />
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#fff' : '#1E293B', flex: 1 }} numberOfLines={1}>
                                      {tl.name}
                                    </Text>
                                  </View>
                                  {tl.code && (
                                    <View style={{ backgroundColor: isSel ? '#3730A3' : '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: '800', color: isSel ? '#C7D2FE' : '#475569' }}>
                                        {tl.code}
                                      </Text>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Diğer Okul Dersleri (Gerekirse) */}
                          {otherLessons.length > 0 && (
                            <>
                              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', marginBottom: 3 }}>
                                Diğer Okul Dersleri ({otherLessons.length}):
                              </Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                  {otherLessons.map((lsn: any, lIdx: any) => {
                                    const isSel = editingCellSlot.lessonName.toUpperCase() === lsn.toUpperCase();
                                    return (
                                      <TouchableOpacity
                                        key={lIdx}
                                        onPress={() => setEditingCellSlot({ ...editingCellSlot, lessonName: lsn })}
                                        style={{
                                          backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                          paddingHorizontal: 8,
                                          paddingVertical: 4,
                                          borderRadius: 6,
                                          borderWidth: 1,
                                          borderColor: isSel ? '#4338CA' : '#E2E8F0',
                                        }}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? '#fff' : '#64748B' }}>
                                          {lsn}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </ScrollView>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })()}

                  {/* Ekle / Vazgeç Butonları */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setEditingCellSlot(null)}
                      style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#E2E8F0', alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Vazgeç</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveCellSlot}
                      style={{ flex: 2, paddingVertical: 6, borderRadius: 6, backgroundColor: '#4F46E5', alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>💾 Saate Yerleştir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Seçili Günün Saatleri (1 .. maxPeriod) */}
              {(() => {
                const maxPeriod = Math.max(8, ...inspectingItems.map((it: any) => it.lessonHour));
                const hoursList = Array.from({ length: maxPeriod }, (_: any, i: any) => i + 1);

                return (
                  <View style={{ gap: 6 }}>
                    {hoursList.map((period: any) => {
                      const item = inspectingItems.find((it: any) => it.dayOfWeek === inspectDayTab && it.lessonHour === period);

                      if (item) {
                        const itemClass = `${item.grade}-${item.section}`.toUpperCase().trim();
                        const conflictItem = (parsedSchedule?.scheduleItems || []).find((ot: any) =>
                          (ot.teacherName || '').trim().toLowerCase() !== inspectingTeacher.trim().toLowerCase() &&
                          ot.dayOfWeek === inspectDayTab &&
                          ot.lessonHour === period &&
                          `${ot.grade}-${ot.section}`.toUpperCase().trim() === itemClass
                        );

                        return (
                          <View
                            key={period}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: conflictItem ? '#FEF2F2' : '#FFFFFF',
                              borderRadius: 10,
                              padding: 10,
                              borderWidth: 1,
                              borderColor: conflictItem ? '#FCA5A5' : '#CBD5E1',
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <View style={{
                                width: 28,
                                height: 28,
                                borderRadius: 7,
                                backgroundColor: conflictItem ? '#DC2626' : '#4F46E5',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{period}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                                    {item.grade}-{item.section}
                                  </Text>
                                  {conflictItem && (
                                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626' }}>⚠️ ÇAKIŞMA</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                                  {item.lessonName}
                                </Text>
                                {conflictItem && (
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#B91C1C', marginTop: 2 }}>
                                    ⚠️ {conflictItem.teacherName} da bu saatte {item.grade}-{item.section}'de!
                                  </Text>
                                )}
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {/* 🔼 Yukarı Kaydır Butonu */}
                              <TouchableOpacity
                                onPress={() => handleShiftLessonHour(inspectDayTab, period, period - 1)}
                                disabled={period <= 1}
                                style={{
                                  backgroundColor: period <= 1 ? '#F1F5F9' : '#EEF2FF',
                                  padding: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: period <= 1 ? '#E2E8F0' : '#C7D2FE',
                                }}
                              >
                                <Ionicons name="chevron-up" size={13} color={period <= 1 ? '#CBD5E1' : '#4F46E5'} />
                              </TouchableOpacity>

                              {/* 🔽 Aşağı Kaydır Butonu */}
                              <TouchableOpacity
                                onPress={() => handleShiftLessonHour(inspectDayTab, period, period + 1)}
                                disabled={period >= maxPeriod}
                                style={{
                                  backgroundColor: period >= maxPeriod ? '#F1F5F9' : '#EEF2FF',
                                  padding: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: period >= maxPeriod ? '#E2E8F0' : '#C7D2FE',
                                }}
                              >
                                <Ionicons name="chevron-down" size={13} color={period >= maxPeriod ? '#CBD5E1' : '#4F46E5'} />
                              </TouchableOpacity>

                              {/* 🔀 Saate Taşı / Değiş Tokuş Butonu */}
                              <TouchableOpacity
                                onPress={() => handlePromptMoveLessonHour(inspectDayTab, period, maxPeriod)}
                                style={{
                                  backgroundColor: '#F0FDF4',
                                  paddingHorizontal: 6,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: '#BBF7D0',
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A' }}>Taşı ➔</Text>
                              </TouchableOpacity>

                              {conflictItem && (
                                <TouchableOpacity
                                  onPress={() => handleOpenTeacherScheduleInspector(conflictItem.teacherName)}
                                  style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}
                                >
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#4F46E5' }}>Diğerini Aç ➔</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => handleStartEditCell(inspectDayTab, period)}
                                style={{ backgroundColor: '#EEF2FF', padding: 6, borderRadius: 6 }}
                              >
                                <Ionicons name="pencil" size={14} color="#4F46E5" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeleteCellSlot(inspectDayTab, period)}
                                style={{ backgroundColor: '#FEF2F2', padding: 6, borderRadius: 6 }}
                              >
                                <Ionicons name="trash-outline" size={14} color="#DC2626" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      }

                      return (
                        <TouchableOpacity
                          key={period}
                          onPress={() => handleStartEditCell(inspectDayTab, period)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC',
                            borderRadius: 10,
                            padding: 10,
                            borderWidth: 1,
                            borderStyle: 'dashed',
                            borderColor: '#CBD5E1',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              backgroundColor: '#E2E8F0',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B' }}>{period}</Text>
                            </View>
                            <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>
                              Boş Ders Saati
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Ionicons name="add" size={14} color="#059669" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>+ Ders Ekle</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
            </ScrollView>

            {/* Modal Alt Aksiyon Butonları */}
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
              <TouchableOpacity
                onPress={() => setInspectTeacherModalVisible(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleApplyTeacherInspectorChanges}
                style={{
                  flex: 2,
                  flexDirection: 'row',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: '#059669',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-done" size={17} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                  Değişiklikleri Programa Aktar ({inspectingItems.length} Saat)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={batchPoolModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="file-tray-full" size={24} color="#059669" />
                <View>
                  <Text style={styles.modalTitle}>📦 Çarşaf Parça Havuzu</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Çok sayfalı PDF'leri parça parça biriktirin ve tek seferde kayıpsız kurun
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setBatchPoolModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
              {scheduleBatches.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                  <Ionicons name="file-tray-outline" size={48} color="#94A3B8" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#475569', marginTop: 12 }}>
                    Havuzda Henüz Parça Bulunmuyor
                  </Text>
                  <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                    Büyük PDF'inizi 2 parça halinde (Örn: 1. Yarı ve 2. Yarı) yüklerken, her analiz sonrası "📥 Havuza Ekle" butonuna basarak verileri burada biriktirebilirsiniz.{'\n\n'}
                    Tüm parçalar biriktiğinde PDF okutmaya gerek kalmadan tek tıkla birleştirip sıfırdan kurulum yapabilirsiniz.
                  </Text>
                  <TouchableOpacity
                    style={[styles.confirmSaveButton, { marginTop: 20, paddingHorizontal: 20 }]}
                    onPress={() => {
                      setBatchPoolModalVisible(false);
                      handlePickAndAnalyzeSchedule();
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={styles.confirmSaveText}>İlk Parçayı Yükle</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>
                      💡 Bilgi: Havuzda {scheduleBatches.length} parça depolandı
                    </Text>
                    <Text style={{ fontSize: 12, color: '#15803D', marginTop: 3 }}>
                      "Tüm Parçaları Birleştir" butonuna basarak tüm öğretmenleri ve ders saatlerini tek bir program halinde birleştirebilirsiniz.
                    </Text>
                  </View>

                  {scheduleBatches.map((batch: any, index: any) => {
                    const tCount = batch.data?.teachers?.length || 0;
                    const cCount = batch.data?.classes?.length || 0;
                    const lCount = batch.data?.lessons?.length || 0;
                    const sCount = batch.data?.scheduleItems?.length || 0;
                    const dateStr = new Date(batch.createdAt).toLocaleString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <View key={batch.id} style={styles.batchCard}>
                        <View style={styles.batchCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.batchCardTitle}>{batch.name}</Text>
                            <Text style={styles.batchCardDate}>Kayıt: {dateStr}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemoveBatch(batch.id)}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.batchCardStatsRow}>
                          <View style={styles.batchCardStatBadge}>
                            <Text style={styles.batchCardStatText}>👨‍🏫 {tCount} Öğretmen</Text>
                          </View>
                          <View style={styles.batchCardStatBadge}>
                            <Text style={styles.batchCardStatText}>🏫 {cCount} Şube</Text>
                          </View>
                          <View style={styles.batchCardStatBadge}>
                            <Text style={styles.batchCardStatText}>📚 {lCount} Ders</Text>
                          </View>
                          <View style={[styles.batchCardStatBadge, { backgroundColor: '#EEF2FF' }]}>
                            <Text style={[styles.batchCardStatText, { color: '#4F46E5' }]}>
                              📅 {sCount} Ders Saati
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {scheduleBatches.length > 0 && (
              <View style={{ gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#4F46E5', width: '100%' }]}
                  onPress={handleMergeAllBatches}
                >
                  <Ionicons name="git-merge" size={18} color="#fff" />
                  <Text style={styles.confirmSaveText}>
                    🧩 Tüm Parçaları Birleştir ve İncele / Kur
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.cancelUploadButton, { flex: 1, backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                    onPress={handleClearAllBatches}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={[styles.cancelUploadText, { color: '#DC2626' }]}>Havuzu Temizle</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelUploadButton, { flex: 1 }]}
                    onPress={() => {
                      setBatchPoolModalVisible(false);
                      handlePickAndAnalyzeSchedule();
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#475569" />
                    <Text style={styles.cancelUploadText}>➕ Yeni Parça Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
