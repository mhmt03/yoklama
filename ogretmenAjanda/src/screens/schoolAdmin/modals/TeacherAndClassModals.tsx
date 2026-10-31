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
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../../theme/colors';
import {
  DEFAULT_GEMINI_API_KEY,
  DEFAULT_GEMINI_MODEL,
  PRESET_GEMINI_MODELS,
  fetchAvailableGeminiModels,
  testGeminiApiKey,
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
  getGeminiUsageStats,
  resetGeminiUsageStats,
  GeminiUsageStats,
} from '../../../utils/geminiScheduleService';
import { formatDateToTR } from '../../../utils/dateUtils';
import {
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../../../utils/counselorService';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function TeacherAndClassModals({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    addDutyModalVisible,
    setAddDutyModalVisible,
    newDutyTeacher,
    setNewDutyTeacher,
    sortedTeachers,
    newDutyDay,
    setNewDutyDay,
    newDutyPlace,
    setNewDutyPlace,
    allKnownDutyPlaces,
    newDutyNotes,
    setNewDutyNotes,
    handleSaveDuty,
    savingDuty,
    modelDropdownModalVisible,
    setModelDropdownModalVisible,
    modelSearchQuery,
    setModelSearchQuery,
    selectedGeminiModel,
    setSelectedGeminiModel,
    availableLiveModels,
    addTeacherModalVisible,
    setAddTeacherModalVisible,
    newTeacherRole,
    setNewTeacherRole,
    teacherFullName,
    setTeacherFullName,
    teacherBranch,
    setTeacherBranch,
    teacherPhone,
    setTeacherPhone,
    teacherEmail,
    setTeacherEmail,
    handleCreateTeacher,
    addingTeacher,
    editTeacherModalVisible,
    setEditTeacherModalVisible,
    editingTeacher,
    setEditingTeacher,
    classes,
    handleOpenTeacherSchedule,
    handleUpdateTeacher,
    createdTeacherResult,
    selectedSchool,
    handleCopyTeacherCredentials,
    setCreatedTeacherResult,
    addClassModalVisible,
    setAddClassModalVisible,
    newClassGrade,
    setNewClassGrade,
    newClassSection,
    setNewClassSection,
    handleCreateClass,
    addingClass,
    addLessonModalVisible,
    setAddLessonModalVisible,
    newLessonName,
    setNewLessonName,
    newLessonShortCode,
    setNewLessonShortCode,
    newLessonGrade,
    setNewLessonGrade,
    newLessonHours,
    setNewLessonHours,
    handleCreateLesson,
    addingLesson,
    addStudentModalVisible,
    setAddStudentModalVisible,
    newStudentNo,
    setNewStudentNo,
    newStudentName,
    setNewStudentName,
    newStudentGrade,
    setNewStudentGrade,
    newStudentSection,
    setNewStudentSection,
    newStudentParentName,
    setNewStudentParentName,
    newStudentParentPhone,
    setNewStudentParentPhone,
    newStudentPhone,
    setNewStudentPhone,
    handleCreateStudent,
    addingStudent,
    editStudentModalVisible,
    setEditStudentModalVisible,
    editingStudent,
    setEditingStudent,
    handleUpdateStudent,
    updatingStudent,
    adminStudentModalVisible,
    selectedAdminStudent,
    teachers,
    allSchoolSchedules,
    setAdminStudentModalVisible,
    loadingStudentDetail,
    serverBaseUrl,
    handlePickAndUploadPhoto,
    handleSendMessageToParent,
    handleSendMessageToStudent,
    studentEvaluations,
    studentLocalNotes,
    studentLocalGrades,
    studentLocalQuizzes,
    credentialsModalVisible,
    setCredentialsModalVisible,
    selectedStudentForCreds,
    showCredPassword,
    setShowCredPassword,
    handleResetStudentPassword,
    resettingPassword,
    customResetPassInput,
    setCustomResetPassInput,
    showParentCredPassword,
    setShowParentCredPassword,
    handleResetParentPassword,
    resettingParentPassword,
    customParentResetPassInput,
    setCustomParentResetPassInput,
    handleShareViaWhatsApp,
    handleShareViaSms,
    handleCopyCredentialsMessage
  } = ctx;

  return (
    <>
      <Modal visible={addDutyModalVisible} animationType="slide" transparent onRequestClose={() => setAddDutyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 520, width: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Yeni Nöbetçi Öğretmen Ekle</Text>
              </View>
              <TouchableOpacity onPress={() => setAddDutyModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, gap: 14 }}>
              <View>
                <Text style={styles.reportFilterLabel}>Öğretmen Adı:</Text>
                <TextInput
                  style={[styles.input, { marginTop: 4 }]}
                  placeholder="Öğretmen adı yazın..."
                  placeholderTextColor="#94A3B8"
                  value={newDutyTeacher}
                  onChangeText={setNewDutyTeacher}
                />
                {/* Hızlı öğretmen seçici */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
                  {sortedTeachers.slice(0, 15).map((t: any) => (
                    <TouchableOpacity
                      key={t.id || t.fullName}
                      style={[styles.reportSegmentBtn, newDutyTeacher === t.fullName && styles.reportSegmentBtnActive]}
                      onPress={() => setNewDutyTeacher(t.fullName)}
                    >
                      <Text style={[styles.reportSegmentText, newDutyTeacher === t.fullName && styles.reportSegmentTextActive]}>
                        {t.fullName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View>
                <Text style={styles.reportFilterLabel}>Nöbet Günü:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {[
                    { day: 1, label: 'Pazartesi' },
                    { day: 2, label: 'Salı' },
                    { day: 3, label: 'Çarşamba' },
                    { day: 4, label: 'Perşembe' },
                    { day: 5, label: 'Cuma' },
                  ].map((d: any) => (
                    <TouchableOpacity
                      key={d.day}
                      style={[styles.reportSegmentBtn, newDutyDay === d.day && styles.reportSegmentBtnActive]}
                      onPress={() => setNewDutyDay(d.day)}
                    >
                      <Text style={[styles.reportSegmentText, newDutyDay === d.day && styles.reportSegmentTextActive]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.reportFilterLabel}>Nöbet Yeri / Kat:</Text>
                <TextInput
                  style={[styles.input, { marginTop: 4 }]}
                  placeholder="Örn: Bahçe, 1. Kat, 2. Kat, Zemin..."
                  placeholderTextColor="#94A3B8"
                  value={newDutyPlace}
                  onChangeText={setNewDutyPlace}
                />
                {/* Hızlı yer butonları */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {allKnownDutyPlaces.map((place: any) => (
                    <TouchableOpacity
                      key={place}
                      style={[styles.reportFilterChip, newDutyPlace === place && styles.reportFilterChipActive]}
                      onPress={() => setNewDutyPlace(place)}
                    >
                      <Text style={[styles.reportFilterChipText, newDutyPlace === place && styles.reportFilterChipTextActive]}>
                        {place}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.reportFilterLabel}>Açıklama / Not (Opsiyonel):</Text>
                <TextInput
                  style={[styles.input, { marginTop: 4 }]}
                  placeholder="Ek not..."
                  placeholderTextColor="#94A3B8"
                  value={newDutyNotes}
                  onChangeText={setNewDutyNotes}
                />
              </View>

              <TouchableOpacity
                style={[styles.exportActionBtn, { backgroundColor: '#4F46E5', marginTop: 10 }]}
                onPress={handleSaveDuty}
                disabled={savingDuty}
              >
                {savingDuty ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.exportActionBtnText}>Nöbetçiyi Kaydet</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modelDropdownModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="hardware-chip" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Gemini Modeli Seçin</Text>
              </View>
              <TouchableOpacity onPress={() => setModelDropdownModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Model Arama Filtresi */}
            <View style={styles.modelSearchWrap}>
              <Ionicons name="search" size={16} color="#64748B" />
              <TextInput
                style={styles.modelSearchInput}
                placeholder="Model ara (örn: 2.5, flash, pro)..."
                value={modelSearchQuery}
                onChangeText={setModelSearchQuery}
                placeholderTextColor="#94A3B8"
              />
              {!!modelSearchQuery && (
                <TouchableOpacity onPress={() => setModelSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 1. Önerilen & Hazır Modeller */}
              <Text style={styles.modelCategoryTitle}>ÖNERİLEN MODELLER</Text>
              {PRESET_GEMINI_MODELS
                .filter((m: any) => !modelSearchQuery.trim() || m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                .map((m: any) => {
                  const isSelected = selectedGeminiModel === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.modelDropdownItem, isSelected && styles.modelDropdownItemSelected]}
                      onPress={() => {
                        setSelectedGeminiModel(m.id);
                        setModelDropdownModalVisible(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.modelDropdownItemName, isSelected && styles.modelDropdownItemNameSelected]}>
                            {m.name}
                          </Text>
                          {m.isRecommended && (
                            <View style={styles.recommendedBadge}>
                              <Text style={styles.recommendedBadgeText}>ÖNERİLEN</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modelDropdownItemId}>{m.id}</Text>
                        <Text style={styles.modelDropdownItemDesc} numberOfLines={2}>{m.description}</Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={isSelected ? '#4F46E5' : '#CBD5E1'}
                      />
                    </TouchableOpacity>
                  );
                })}

              {/* 2. Google API Canlı Modeller */}
              {availableLiveModels.filter((lm: any) => !PRESET_GEMINI_MODELS.some((pm: any) => pm.id === lm)).length > 0 && (
                <>
                  <Text style={[styles.modelCategoryTitle, { marginTop: 16 }]}>
                    GOOGLE API CANLI MODELLERİ ({availableLiveModels.filter((lm: any) => !PRESET_GEMINI_MODELS.some((pm: any) => pm.id === lm)).length})
                  </Text>
                  {availableLiveModels
                    .filter((lm: any) => !PRESET_GEMINI_MODELS.some((pm: any) => pm.id === lm))
                    .filter((lm: any) => !modelSearchQuery.trim() || lm.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                    .map((liveModel: any) => {
                      const isSelected = selectedGeminiModel === liveModel;
                      return (
                        <TouchableOpacity
                          key={liveModel}
                          style={[styles.modelDropdownItem, isSelected && styles.modelDropdownItemSelected]}
                          onPress={() => {
                            setSelectedGeminiModel(liveModel);
                            setModelDropdownModalVisible(false);
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.modelDropdownItemName, isSelected && styles.modelDropdownItemNameSelected]}>
                              {liveModel}
                            </Text>
                            <Text style={styles.modelDropdownItemId}>API Canlı Model</Text>
                          </View>
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={isSelected ? '#4F46E5' : '#CBD5E1'}
                          />
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={addTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👨‍🏫 Yeni Öğretmen Tanımla</Text>
              <TouchableOpacity onPress={() => setAddTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Kullanıcı Rolü</Text>
            <View style={styles.segmentedRoleRow}>
              <TouchableOpacity
                style={[styles.segmentedRoleBtn, newTeacherRole === 'TEACHER' && styles.segmentedRoleBtnActiveTeacher]}
                onPress={() => setNewTeacherRole('TEACHER')}
              >
                <Ionicons name="school" size={16} color={newTeacherRole === 'TEACHER' ? '#0284C7' : '#64748B'} />
                <Text style={[styles.segmentedRoleText, newTeacherRole === 'TEACHER' && styles.segmentedRoleTextActiveTeacher]}>
                  👨‍🏫 Öğretmen
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentedRoleBtn, newTeacherRole === 'STAFF' && styles.segmentedRoleBtnActiveStaff]}
                onPress={() => setNewTeacherRole('STAFF')}
              >
                <Ionicons name="shield-checkmark" size={16} color={newTeacherRole === 'STAFF' ? '#7C3AED' : '#64748B'} />
                <Text style={[styles.segmentedRoleText, newTeacherRole === 'STAFF' && styles.segmentedRoleTextActiveStaff]}>
                  🛡️ İdareci (Md. Yrd.)
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Adı Soyadı (Örn: Ahmet Kaya)"
              value={teacherFullName}
              onChangeText={setTeacherFullName}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Branş (Örn: Fizik, Matematik)"
              value={teacherBranch}
              onChangeText={setTeacherBranch}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Telefon Numarası (Opsiyonel)"
              value={teacherPhone}
              onChangeText={setTeacherPhone}
              keyboardType="phone-pad"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="E-posta Adresi (Opsiyonel)"
              value={teacherEmail}
              onChangeText={setTeacherEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleCreateTeacher}
              disabled={addingTeacher}
            >
              {addingTeacher ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Öğretmeni Kaydet & Şifre Üret</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>✏️ Öğretmen Bilgilerini & Yetkilerini Düzenle</Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Rol ve erişim izinlerini okul kurallarına göre yapılandırın.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              {/* Rol Seçimi */}
              <Text style={styles.inputLabel}>Kullanıcı Rolü & Panel Erişimi</Text>
              <View style={styles.segmentedRoleRow}>
                <TouchableOpacity
                  style={[styles.segmentedRoleBtn, editingTeacher?.role !== 'STAFF' && styles.segmentedRoleBtnActiveTeacher]}
                  onPress={() => setEditingTeacher({ ...editingTeacher, role: 'TEACHER' })}
                >
                  <Ionicons name="school" size={16} color={editingTeacher?.role !== 'STAFF' ? '#0284C7' : '#64748B'} />
                  <Text style={[styles.segmentedRoleText, editingTeacher?.role !== 'STAFF' && styles.segmentedRoleTextActiveTeacher]}>
                    👨‍🏫 Öğretmen
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentedRoleBtn, editingTeacher?.role === 'STAFF' && styles.segmentedRoleBtnActiveStaff]}
                  onPress={() => setEditingTeacher({ ...editingTeacher, role: 'STAFF' })}
                >
                  <Ionicons name="shield-checkmark" size={16} color={editingTeacher?.role === 'STAFF' ? '#7C3AED' : '#64748B'} />
                  <Text style={[styles.segmentedRoleText, editingTeacher?.role === 'STAFF' && styles.segmentedRoleTextActiveStaff]}>
                    🛡️ İdareci (Md. Yrd.)
                  </Text>
                </TouchableOpacity>
              </View>

              {editingTeacher?.role === 'STAFF' && (
                <View style={styles.roleExplainBox}>
                  <Text style={styles.roleExplainText}>
                    🛡️ <Text style={{ fontWeight: '800' }}>İdareci Yetkisi:</Text> Bu öğretmen okul yönetim paneline erişebilir. Sınıfları, öğrencileri, işlem loglarını ve mesajlaşmaları denetleyebilir. Okul ekleyemez veya diğer okulları göremez. AI API anahtarını değiştiremez. Lisansı ana yöneticiye bağlı çalışır.
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Sistem Kullanıcı Adı (Giriş için)</Text>
              <View style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 10, marginBottom: 4 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="person" size={16} color="#4F46E5" />
                  <TextInput
                    style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#1E293B', paddingVertical: 6 }}
                    value={editingTeacher?.username ?? ''}
                    onChangeText={(val: any) => setEditingTeacher({ ...editingTeacher, username: val.trim().toLowerCase() })}
                    placeholder="kullanici.adi"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const u = (editingTeacher?.username || '').trim();
                    if (u) {
                      Clipboard.setStringAsync(u);
                      Alert.alert('Kopyalandı', `"${u}" kullanıcı adı panoya kopyalandı.`);
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="copy-outline" size={18} color="#4F46E5" />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 12 }}>
                💡 Giriş kullanıcı adıdır. Değiştirdiğinizde sistem veritabanında benzersizlik kontrolü yapılır.
              </Text>

              <Text style={styles.inputLabel}>Adı Soyadı</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Adı Soyadı"
                value={editingTeacher?.fullName || ''}
                onChangeText={(t: any) => setEditingTeacher({ ...editingTeacher, fullName: t })}
              />

              <Text style={styles.inputLabel}>Branşı (Ders Alanı)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Matematik, Fizik, Türkçe..."
                value={editingTeacher?.branch || ''}
                onChangeText={(t: any) => setEditingTeacher({ ...editingTeacher, branch: t })}
              />

              <Text style={styles.inputLabel}>Telefon Numarası</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Telefon Numarası"
                value={editingTeacher?.phone || ''}
                onChangeText={(t: any) => setEditingTeacher({ ...editingTeacher, phone: t })}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>E-posta</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="E-posta"
                value={editingTeacher?.email || ''}
                onChangeText={(t: any) => setEditingTeacher({ ...editingTeacher, email: t })}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* YETKİ VE KISITLAMA AYARLARI */}
              <Text style={styles.permissionSectionTitle}>🔒 Yetki ve Özellik Kısıtlamaları</Text>

              {/* Mesajlaşma İzinleri */}
              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Öğrencilere Mesaj Gönderebilir</Text>
                  <Text style={styles.permissionSublabel}>Öğrencilere duyuru ve bilgilendirme mesajı atabilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canMessageStudents !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canMessageStudents: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canMessageStudents !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canMessageStudents !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Öğretmenlere Mesaj Gönderebilir</Text>
                  <Text style={styles.permissionSublabel}>Diğer öğretmen arkadaşlarına mesaj yazabilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canMessageTeachers !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canMessageTeachers: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canMessageTeachers !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canMessageTeachers !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Velilere Mesaj Gönderebilir</Text>
                  <Text style={styles.permissionSublabel}>Öğrenci velilerine doğrudan mesaj iletebilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canMessageParents !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canMessageParents: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canMessageParents !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canMessageParents !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              {/* Şube ve Sınıf Görünürlüğü */}
              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Tüm Okul Şubelerini Görebilir</Text>
                  <Text style={styles.permissionSublabel}>Kapalı ise öğretmen yalnızca atandığı şubeleri görür.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canViewAllClasses !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canViewAllClasses: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canViewAllClasses !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canViewAllClasses !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              {/* Şube Seçimi Çipleri */}
              {editingTeacher?.permissions?.canViewAllClasses === false && (
                <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', marginBottom: 4 }}>
                    Erişebileceği Şubeleri Seçin:
                  </Text>
                  <View style={styles.classesChipsContainer}>
                    {classes.map((cls: any) => {
                      const clsName = `${cls.grade}-${cls.section}`;
                      const currentList: string[] = (editingTeacher?.assignedClassesJson || '')
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                      const isAssigned = currentList.includes(clsName);
                      return (
                        <TouchableOpacity
                          key={cls.id || clsName}
                          style={[styles.classSelectChip, isAssigned && styles.classSelectChipActive]}
                          onPress={() => {
                            let updated: string[];
                            if (isAssigned) {
                              updated = currentList.filter((s: string) => s !== clsName);
                            } else {
                              updated = [...currentList, clsName];
                            }
                            setEditingTeacher({
                              ...editingTeacher,
                              assignedClassesJson: updated.join(', '),
                            });
                          }}
                        >
                          <Text style={[styles.classSelectChipText, isAssigned && styles.classSelectChipTextActive]}>
                            {isAssigned ? '✓ ' : '+ '}{clsName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.inputLabel}>Girdiği Şubeler / Sınıflar (Metin)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: 9-A, 10-B, 11-C"
                value={editingTeacher?.assignedClassesJson || ''}
                onChangeText={(t: any) => setEditingTeacher({ ...editingTeacher, assignedClassesJson: t })}
              />

              {/* Ek Modül Kısıtlamaları */}
              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Yapay Zeka (AI) ve OCR Kullanabilir</Text>
                  <Text style={styles.permissionSublabel}>Okulun ortak Gemini kotasıyla AI asistanını çalıştırır.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canUseAiAssistant !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canUseAiAssistant: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canUseAiAssistant !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canUseAiAssistant !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Rapor ve Excel / PDF İndirebilir</Text>
                  <Text style={styles.permissionSublabel}>Yoklama, not ve öğrenci raporlarını dışa aktarabilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canExportReports !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canExportReports: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canExportReports !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canExportReports !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Yoklama Değiştirme / Silme</Text>
                  <Text style={styles.permissionSublabel}>Geçmiş yoklama kayıtlarını düzenleyebilir veya silebilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canManageAttendance !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canManageAttendance: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canManageAttendance !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canManageAttendance !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Öğrenci Profil & Fotoğraf Düzenleme</Text>
                  <Text style={styles.permissionSublabel}>Öğrenci bilgilerini ve fotoğraflarını güncelleyebilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canEditStudents === true;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canEditStudents: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canEditStudents === true ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canEditStudents === true ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#4F46E5', marginTop: 10, marginBottom: 8, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}
              onPress={() => {
                setEditTeacherModalVisible(false);
                handleOpenTeacherSchedule(editingTeacher);
              }}
            >
              <Ionicons name="calendar-outline" size={16} color="#fff" />
              <Text style={styles.createSubmitText}>📅 Haftalık Ders Programını Aç</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.createSubmitButton, { backgroundColor: '#059669' }]} onPress={handleUpdateTeacher}>
              <Text style={styles.createSubmitText}>Değişiklikleri Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!createdTeacherResult} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center' }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle" size={36} color="#059669" />
            </View>

            <Text style={styles.successTitle}>Öğretmen Hesabı Hazır! 🎉</Text>
            <Text style={styles.successSub}>
              {createdTeacherResult?.fullName} için sisteme giriş bilgileri otomatik üretildi.
            </Text>

            <View style={styles.credentialsBox}>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>Okul Kodu:</Text>
                <Text style={styles.credValCode}>{createdTeacherResult?.schoolCode || selectedSchool?.code}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>Kullanıcı Adı:</Text>
                <Text style={styles.credVal}>{createdTeacherResult?.username}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>Geçici Şifre:</Text>
                <Text style={styles.credValPass}>{createdTeacherResult?.password || '1234'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#059669', width: '100%', flexDirection: 'row', gap: 8, justifyContent: 'center' }]}
              onPress={handleCopyTeacherCredentials}
            >
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={styles.createSubmitText}>Giriş Bilgilerini Kopyala (WhatsApp)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 12, paddingVertical: 8 }}
              onPress={() => setCreatedTeacherResult(null)}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textMuted }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={addClassModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏫 Yeni Sınıf / Şube Ekle</Text>
              <TouchableOpacity onPress={() => setAddClassModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Kademe (Sınıf Düzeyi)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 9, 10, 11, 12 veya 1, 2, 3..."
              value={newClassGrade}
              onChangeText={setNewClassGrade}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Şube Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: A, B, C, Fen, Say..."
              value={newClassSection}
              onChangeText={setNewClassSection}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleCreateClass}
              disabled={addingClass}
            >
              {addingClass ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Sınıfı Sunucuya Ekle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={addLessonModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📚 Yeni Ders Tanımla</Text>
              <TouchableOpacity onPress={() => setAddLessonModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Ders Adı (Örn: Biyoloji, Seçmeli Fizik)"
              value={newLessonName}
              onChangeText={setNewLessonName}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Kısa Kod (Örn: BYL, S.FZK)"
              value={newLessonShortCode}
              onChangeText={setNewLessonShortCode}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Sınıf Düzeyi / Kademe (Her düzeyin planı ayrı yüklenir):
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {['9', '10', '11', '12', 'Tüm Kademeler'].map((g: any) => (
                  <TouchableOpacity
                    key={g}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: newLessonGrade === g ? '#4F46E5' : '#CBD5E1',
                      backgroundColor: newLessonGrade === g ? '#EEF2FF' : '#FFFFFF',
                    }}
                    onPress={() => setNewLessonGrade(g)}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: newLessonGrade === g ? '#4F46E5' : '#64748B' }}>
                      {g.includes('Tüm') ? g : `${g}. Sınıf`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Kademe (Örn: 11 veya Tüm Kademeler)"
                value={newLessonGrade}
                onChangeText={setNewLessonGrade}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Haftalık Saat (Örn: 2, 4)"
              value={newLessonHours}
              onChangeText={setNewLessonHours}
              keyboardType="numeric"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleCreateLesson}
              disabled={addingLesson}
            >
              {addingLesson ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Dersi Sunucuya Kaydet</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={addStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎓 Yeni Öğrenci Ekle</Text>
              <TouchableOpacity onPress={() => setAddStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Numarası (Örn: 105)"
                value={newStudentNo}
                onChangeText={setNewStudentNo}
                keyboardType="numeric"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Adı Soyadı (Örn: Zeynep Kaya)"
                value={newStudentName}
                onChangeText={setNewStudentName}
                placeholderTextColor={Colors.textMuted}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Kademe (Örn: 9)"
                  value={newStudentGrade}
                  onChangeText={setNewStudentGrade}
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Şube (Örn: A)"
                  value={newStudentSection}
                  onChangeText={setNewStudentSection}
                  autoCapitalize="characters"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Adı Soyadı (Örn: Mehmet Kaya)"
                value={newStudentParentName}
                onChangeText={setNewStudentParentName}
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Telefonu (Örn: 0555 123 4567)"
                value={newStudentParentPhone}
                onChangeText={setNewStudentParentPhone}
                keyboardType="phone-pad"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Telefonu (Opsiyonel)"
                value={newStudentPhone}
                onChangeText={setNewStudentPhone}
                keyboardType="phone-pad"
                placeholderTextColor={Colors.textMuted}
              />

              <TouchableOpacity
                style={styles.createSubmitButton}
                onPress={handleCreateStudent}
                disabled={addingStudent}
              >
                {addingStudent ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Öğrenciyi Doğrudan Sunucuya Kaydet</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={editStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ Öğrenci Bilgilerini Düzenle</Text>
              <TouchableOpacity onPress={() => setEditStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci No"
                value={editingStudent?.studentNumber || ''}
                onChangeText={(t: any) => setEditingStudent({ ...editingStudent, studentNumber: t })}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Adı Soyadı"
                value={editingStudent?.fullName || ''}
                onChangeText={(t: any) => setEditingStudent({ ...editingStudent, fullName: t })}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Kademe"
                  value={editingStudent?.grade || ''}
                  onChangeText={(t: any) => setEditingStudent({ ...editingStudent, grade: t })}
                />
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Şube"
                  value={editingStudent?.section || ''}
                  onChangeText={(t: any) => setEditingStudent({ ...editingStudent, section: t })}
                  autoCapitalize="characters"
                />
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Adı"
                value={editingStudent?.parentName || ''}
                onChangeText={(t: any) => setEditingStudent({ ...editingStudent, parentName: t })}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Telefonu"
                value={editingStudent?.parentPhone || ''}
                onChangeText={(t: any) => setEditingStudent({ ...editingStudent, parentPhone: t })}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Telefonu"
                value={editingStudent?.studentPhone || ''}
                onChangeText={(t: any) => setEditingStudent({ ...editingStudent, studentPhone: t })}
                keyboardType="phone-pad"
              />

              <TouchableOpacity
                style={styles.createSubmitButton}
                onPress={handleUpdateStudent}
                disabled={updatingStudent}
              >
                {updatingStudent ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Sunucuda Güncelle</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={adminStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%', padding: 16 }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="person-circle" size={24} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {selectedAdminStudent?.fullName || 'Öğrenci Profili'}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                    Okul No: {selectedAdminStudent?.studentNumber} • {selectedAdminStudent?.grade}-{selectedAdminStudent?.section}
                  </Text>
                  {(() => {
                    const sClass = selectedAdminStudent?.className || (selectedAdminStudent?.grade && selectedAdminStudent?.section ? `${selectedAdminStudent.grade}-${selectedAdminStudent.section}` : '');
                    const counselor = getClassCounselorTeacher(sClass, teachers, allSchoolSchedules);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 3, borderWidth: 1, borderColor: '#A7F3D0', alignSelf: 'flex-start' }}>
                        <Ionicons name="ribbon-outline" size={11} color="#059669" style={{ marginRight: 3 }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#047857' }}>
                          Sınıf Rehberi: {counselor || 'Atanmadı'}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setAdminStudentModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {loadingStudentDetail ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 12, fontSize: 13, color: Colors.textMuted, fontWeight: '600' }}>
                  Öğrenci detayları, görüşler ve notlar yükleniyor...
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* 1. BÜYÜK FOTOĞRAF VE ÖĞRENCİ BİLGİLERİ */}
                {(() => {
                  const rawPhoto = selectedAdminStudent?.photoPath || selectedAdminStudent?.photo_uri;
                  const photoUri = rawPhoto
                    ? (rawPhoto.startsWith('http') || rawPhoto.startsWith('file://') || rawPhoto.startsWith('data:image')
                      ? rawPhoto
                      : `${serverBaseUrl}${rawPhoto.startsWith('/') ? '' : '/'}${rawPhoto}`)
                    : null;

                  return (
                    <View style={styles.adminDetailProfileCard}>
                      <View style={styles.adminDetailPhotoWrap}>
                        {photoUri ? (
                          <Image source={{ uri: photoUri }} style={styles.adminDetailBigPhoto} />
                        ) : (
                          <View style={styles.adminDetailBigPhotoPlaceholder}>
                            <Text style={styles.adminDetailBigPhotoInitial}>
                              {(selectedAdminStudent?.fullName || 'ÖG').slice(0, 2).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.adminDetailCameraBadge}
                          onPress={() => handlePickAndUploadPhoto(selectedAdminStudent)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="camera" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>

                      <View style={{ alignItems: 'center', marginTop: 10 }}>
                        <Text style={styles.adminDetailNameText}>{selectedAdminStudent?.fullName}</Text>

                        <View style={styles.adminDetailBadgeRow}>
                          <View style={styles.adminDetailTag}>
                            <Ionicons name="id-card-outline" size={12} color="#4F46E5" />
                            <Text style={styles.adminDetailTagText}>No: {selectedAdminStudent?.studentNumber}</Text>
                          </View>
                          <View style={[styles.adminDetailTag, { backgroundColor: '#F0FDF4' }]}>
                            <Ionicons name="school-outline" size={12} color="#16A34A" />
                            <Text style={[styles.adminDetailTagText, { color: '#16A34A' }]}>
                              {selectedAdminStudent?.grade}-{selectedAdminStudent?.section} Şubesi
                            </Text>
                          </View>
                          {selectedSchool?.name && (
                            <View style={[styles.adminDetailTag, { backgroundColor: '#F8FAFC' }]}>
                              <Ionicons name="business-outline" size={12} color="#64748B" />
                              <Text style={[styles.adminDetailTagText, { color: '#64748B' }]} numberOfLines={1}>
                                {selectedSchool.name}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* İletişim & Veli Bilgi Kartı */}
                      <View style={styles.adminDetailContactBox}>
                        <View style={styles.adminDetailContactItem}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="people" size={14} color="#4F46E5" />
                            <Text style={styles.adminDetailContactLabel}>Veli Adı & Telefonu:</Text>
                          </View>
                          <Text style={styles.adminDetailContactValue}>
                            {selectedAdminStudent?.parentName || 'Tanımlı Değil'} {selectedAdminStudent?.parentPhone ? `(${selectedAdminStudent.parentPhone})` : ''}
                          </Text>
                        </View>

                        <View style={styles.adminDetailContactDivider} />

                        <View style={styles.adminDetailContactItem}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="call" size={14} color="#059669" />
                            <Text style={styles.adminDetailContactLabel}>Öğrenci Telefonu:</Text>
                          </View>
                          <Text style={styles.adminDetailContactValue}>
                            {selectedAdminStudent?.studentPhone || 'Kayıtlı Değil'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* 2. DOĞRUDAN MESAJ ATMA BUTONLARI */}
                <View style={styles.adminDetailMessagingRow}>
                  <TouchableOpacity
                    style={[styles.adminDetailMsgBtn, { backgroundColor: '#16A34A' }]}
                    onPress={() => handleSendMessageToParent(selectedAdminStudent)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.adminDetailMsgBtnText}>Veliye Mesaj Yolla</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.adminDetailMsgBtn, { backgroundColor: '#4F46E5' }]}
                    onPress={() => handleSendMessageToStudent(selectedAdminStudent)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
                    <Text style={styles.adminDetailMsgBtnText}>Öğrenciye Mesaj Yolla</Text>
                  </TouchableOpacity>
                </View>

                {/* 3. ÖĞRETMEN GÖRÜŞLERİ VE GÖZLEMLERİ */}
                {(() => {
                  const combinedObservations: Array<{
                    id: string;
                    author: string;
                    date: string;
                    content: string;
                    title?: string;
                  }> = [];

                  for (const e of studentEvaluations) {
                    if (e.type !== 'QUIZ') {
                      combinedObservations.push({
                        id: `srv_${e.id}`,
                        author: e.teacherName || 'Öğretmen',
                        date: e.createdAt,
                        content: e.content,
                        title: e.title,
                      });
                    }
                  }

                  for (const n of studentLocalNotes) {
                    if (!combinedObservations.some((x: any) => x.content?.trim() === n.note?.trim())) {
                      combinedObservations.push({
                        id: `loc_${n.id}`,
                        author: n.lesson_info || n.class_name || 'Ders Öğretmeni',
                        date: n.note_date || n.created_at,
                        content: n.note,
                      });
                    }
                  }

                  return (
                    <View style={styles.adminSectionCard}>
                      <View style={styles.adminSectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="chatbox-ellipses" size={16} color="#4F46E5" />
                          <Text style={styles.adminSectionTitle}>Girilen Görüşler & Gözlemler</Text>
                        </View>
                        <View style={styles.adminSectionCountBadge}>
                          <Text style={styles.adminSectionCountText}>{combinedObservations.length}</Text>
                        </View>
                      </View>

                      {combinedObservations.length === 0 ? (
                        <View style={styles.adminDetailEmptyBox}>
                          <Ionicons name="document-text-outline" size={28} color="#94A3B8" />
                          <Text style={styles.adminDetailEmptyText}>Bu öğrenciye henüz bir görüş veya gözlem notu girilmemiş.</Text>
                        </View>
                      ) : (
                        combinedObservations.map((obs: any) => (
                          <View key={obs.id} style={styles.adminObservationItem}>
                            {obs.title && (
                              <Text style={styles.adminObservationTitle}>📌 {obs.title}</Text>
                            )}
                            <Text style={styles.adminObservationContent}>{obs.content}</Text>
                            <View style={styles.adminObservationMetaRow}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="person" size={12} color="#4F46E5" />
                                <Text style={styles.adminObservationAuthor}>
                                  Kimin Girdiği: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{obs.author}</Text>
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="time-outline" size={12} color="#64748B" />
                                <Text style={styles.adminObservationDate}>{formatDateToTR(obs.date)}</Text>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  );
                })()}

                {/* 4. DERS VE SINAV NOTLARI (YAZILI & PERFORMANS) */}
                {(() => {
                  const grades = studentLocalGrades;
                  const validMainGrades = [
                    grades?.exam1,
                    grades?.exam2,
                    grades?.exam3,
                    grades?.perf1,
                    grades?.perf2,
                    grades?.perf3,
                  ].filter((n: any): n is number => n !== null && n !== undefined && !isNaN(n));

                  const calcAvg = (items: (number | null | undefined)[]) => {
                    const valid = items.filter((n: any): n is number => n !== null && n !== undefined && !isNaN(n));
                    if (valid.length === 0) return null;
                    const sum = valid.reduce((a: any, b: any) => a + b, 0);
                    return Math.round((sum / valid.length) * 10) / 10;
                  };

                  const examAvg = calcAvg([grades?.exam1, grades?.exam2, grades?.exam3]);
                  const perfAvg = calcAvg([grades?.perf1, grades?.perf2, grades?.perf3]);
                  const overallAvg = calcAvg(validMainGrades);

                  return (
                    <View style={styles.adminSectionCard}>
                      <View style={styles.adminSectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="school" size={16} color="#059669" />
                          <Text style={styles.adminSectionTitle}>Ders Notları (Yazılı & Performans)</Text>
                        </View>
                        {overallAvg !== null && (
                          <View style={[styles.adminSectionCountBadge, { backgroundColor: '#ECFDF5' }]}>
                            <Text style={[styles.adminSectionCountText, { color: '#059669' }]}>Ort: {overallAvg}</Text>
                          </View>
                        )}
                      </View>

                      {!grades && validMainGrades.length === 0 ? (
                        <View style={styles.adminDetailEmptyBox}>
                          <Ionicons name="bar-chart-outline" size={28} color="#94A3B8" />
                          <Text style={styles.adminDetailEmptyText}>Bu öğrenciye ait kayıtlı yazılı veya performans notu bulunamadı.</Text>
                        </View>
                      ) : (
                        <View>
                          <View style={styles.adminGradeGrid}>
                            <View style={styles.adminGradeCell}>
                              <Text style={styles.adminGradeCellLabel}>1. Yazılı</Text>
                              <Text style={[styles.adminGradeCellValue, grades?.exam1 !== null && grades?.exam1 !== undefined && { color: '#4F46E5' }]}>
                                {grades?.exam1 ?? '-'}
                              </Text>
                            </View>
                            <View style={styles.adminGradeCell}>
                              <Text style={styles.adminGradeCellLabel}>2. Yazılı</Text>
                              <Text style={[styles.adminGradeCellValue, grades?.exam2 !== null && grades?.exam2 !== undefined && { color: '#4F46E5' }]}>
                                {grades?.exam2 ?? '-'}
                              </Text>
                            </View>
                            <View style={styles.adminGradeCell}>
                              <Text style={styles.adminGradeCellLabel}>3. Yazılı</Text>
                              <Text style={[styles.adminGradeCellValue, grades?.exam3 !== null && grades?.exam3 !== undefined && { color: '#4F46E5' }]}>
                                {grades?.exam3 ?? '-'}
                              </Text>
                            </View>
                            <View style={styles.adminGradeCell}>
                              <Text style={styles.adminGradeCellLabel}>1. Perf.</Text>
                              <Text style={[styles.adminGradeCellValue, grades?.perf1 !== null && grades?.perf1 !== undefined && { color: '#059669' }]}>
                                {grades?.perf1 ?? '-'}
                              </Text>
                            </View>
                            <View style={styles.adminGradeCell}>
                              <Text style={styles.adminGradeCellLabel}>2. Perf.</Text>
                              <Text style={[styles.adminGradeCellValue, grades?.perf2 !== null && grades?.perf2 !== undefined && { color: '#059669' }]}>
                                {grades?.perf2 ?? '-'}
                              </Text>
                            </View>
                            <View style={styles.adminGradeCell}>
                              <Text style={styles.adminGradeCellLabel}>3. Perf.</Text>
                              <Text style={[styles.adminGradeCellValue, grades?.perf3 !== null && grades?.perf3 !== undefined && { color: '#059669' }]}>
                                {grades?.perf3 ?? '-'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.adminGradeSummaryRow}>
                            <View style={styles.adminGradeSummaryItem}>
                              <Text style={styles.adminGradeSummaryLabel}>Yazılı Ortalaması</Text>
                              <Text style={[styles.adminGradeSummaryVal, { color: '#4F46E5' }]}>{examAvg ?? '-'}</Text>
                            </View>
                            <View style={styles.adminGradeSummaryDivider} />
                            <View style={styles.adminGradeSummaryItem}>
                              <Text style={styles.adminGradeSummaryLabel}>Performans Ort.</Text>
                              <Text style={[styles.adminGradeSummaryVal, { color: '#059669' }]}>{perfAvg ?? '-'}</Text>
                            </View>
                            <View style={styles.adminGradeSummaryDivider} />
                            <View style={styles.adminGradeSummaryItem}>
                              <Text style={styles.adminGradeSummaryLabel}>Genel Ortalama</Text>
                              <Text style={[styles.adminGradeSummaryVal, { color: '#7C3AED' }]}>{overallAvg ?? '-'}</Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* 5. QUİZ VE TEST NOTLARI */}
                {(() => {
                  const combinedQuizzes: Array<{
                    id: string;
                    title: string;
                    score: number | string;
                    date?: string;
                    teacherName?: string;
                  }> = [];

                  for (const e of studentEvaluations) {
                    if (e.type === 'QUIZ') {
                      combinedQuizzes.push({
                        id: `srv_q_${e.id}`,
                        title: e.title || 'Quiz',
                        score: e.score !== null && e.score !== undefined ? e.score : '-',
                        date: e.createdAt,
                        teacherName: e.teacherName,
                      });
                    }
                  }

                  for (const q of studentLocalQuizzes) {
                    if (!combinedQuizzes.some((x: any) => x.title === q.title && String(x.score) === String(q.score))) {
                      combinedQuizzes.push({
                        id: `loc_q_${q.title}_${q.date}`,
                        title: q.title || 'Quiz',
                        score: q.score !== null && q.score !== undefined ? q.score : '-',
                        date: q.date,
                        teacherName: q.class_name,
                      });
                    }
                  }

                  return (
                    <View style={styles.adminSectionCard}>
                      <View style={styles.adminSectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="checkbox" size={16} color="#7C3AED" />
                          <Text style={styles.adminSectionTitle}>Quiz & Test Notları</Text>
                        </View>
                        <View style={[styles.adminSectionCountBadge, { backgroundColor: '#F3E8FF' }]}>
                          <Text style={[styles.adminSectionCountText, { color: '#7C3AED' }]}>{combinedQuizzes.length}</Text>
                        </View>
                      </View>

                      {combinedQuizzes.length === 0 ? (
                        <View style={styles.adminDetailEmptyBox}>
                          <Ionicons name="help-circle-outline" size={28} color="#94A3B8" />
                          <Text style={styles.adminDetailEmptyText}>Bu öğrenciye ait kayıtlı bir quiz veya test notu bulunmuyor.</Text>
                        </View>
                      ) : (
                        combinedQuizzes.map((quiz: any) => {
                          const numScore = Number(quiz.score);
                          const scoreColor = isNaN(numScore)
                            ? '#64748B'
                            : numScore >= 85
                              ? '#059669'
                              : numScore >= 70
                                ? '#2563EB'
                                : numScore >= 50
                                  ? '#D97706'
                                  : '#DC2626';

                          return (
                            <View key={quiz.id} style={styles.adminQuizItem}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.adminQuizTitle}>{quiz.title}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                  {quiz.teacherName && (
                                    <Text style={styles.adminQuizSub}>👤 {quiz.teacherName}</Text>
                                  )}
                                  {quiz.date && (
                                    <Text style={styles.adminQuizSub}>🕒 {formatDateToTR(quiz.date)}</Text>
                                  )}
                                </View>
                              </View>
                              <View style={[styles.adminQuizScoreBadge, { backgroundColor: `${scoreColor}15`, borderColor: scoreColor }]}>
                                <Text style={[styles.adminQuizScoreText, { color: scoreColor }]}>
                                  {quiz.score} Puan
                                </Text>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  );
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={credentialsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="key" size={20} color="#4F46E5" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Giriş & Şifre Bilgileri</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                    Öğrenci & Veli Portalı Erişim Kartı
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setCredentialsModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {selectedStudentForCreds && (
                <>
                  {/* Öğrenci Bilgi Özeti Çipi */}
                  <View style={styles.credStudentCardBanner}>
                    <View style={styles.credAvatarWrap}>
                      <Text style={styles.credAvatarText}>
                        {selectedStudentForCreds.fullName?.slice(0, 2).toUpperCase() || 'ÖG'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.credStudentName}>{selectedStudentForCreds.fullName}</Text>
                      <Text style={styles.credStudentSub}>
                        {selectedStudentForCreds.grade}-{selectedStudentForCreds.section} Şubesi • Okul No: {selectedStudentForCreds.studentNumber}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        🏫 {selectedSchool?.name || 'Okul'}
                      </Text>
                    </View>
                  </View>

                  {/* KART 1: ÖĞRENCİ VE VELİ SİSTEM GİRİŞ BİLGİLERİ */}
                  <View style={styles.credSectionBox}>
                    <View style={styles.credSectionHeaderRow}>
                      <Ionicons name="school-outline" size={16} color="#4F46E5" />
                      <Text style={styles.credSectionTitle}>Portal Giriş Bilgileri</Text>
                    </View>

                    {/* Okul Kodu */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>Okul Kodu</Text>
                        <Text style={styles.credFieldValueBold}>{selectedSchool?.code || '-'}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.credCopyBtn}
                        onPress={() => {
                          Clipboard.setStringAsync(selectedSchool?.code || '');
                          Alert.alert('Kopyalandı', 'Okul kodu panoya kopyalandı.');
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#4F46E5" />
                        <Text style={styles.credCopyBtnText}>Kopyala</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Kullanıcı Adı */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>🎓 Öğrenci Kullanıcı Adı (Okul No)</Text>
                        <Text style={styles.credFieldValueBold}>{selectedStudentForCreds.studentNumber}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.credCopyBtn}
                        onPress={() => {
                          Clipboard.setStringAsync(selectedStudentForCreds.studentNumber);
                          Alert.alert('Kopyalandı', 'Öğrenci kullanıcı adı panoya kopyalandı.');
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#4F46E5" />
                        <Text style={styles.credCopyBtnText}>Kopyala</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Öğrenci Giriş Şifresi */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>🎓 Öğrenci Şifresi</Text>
                        <Text style={[styles.credFieldValueBold, { color: '#059669' }]}>
                          {showCredPassword
                            ? (selectedStudentForCreds.studentCustomPassword || `ooo_${selectedStudentForCreds.studentNumber}`)
                            : '••••••••••••'}
                        </Text>
                        <Text style={styles.credFieldHint}>* Varsayılan format: ooo_öğrencino</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.credIconBtn}
                          onPress={() => setShowCredPassword(!showCredPassword)}
                        >
                          <Ionicons name={showCredPassword ? "eye-off-outline" : "eye-outline"} size={16} color="#64748B" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.credCopyBtn}
                          onPress={() => {
                            const p = selectedStudentForCreds.studentCustomPassword || `ooo_${selectedStudentForCreds.studentNumber}`;
                            Clipboard.setStringAsync(p);
                            Alert.alert('Kopyalandı', 'Öğrenci şifresi panoya kopyalandı.');
                          }}
                        >
                          <Ionicons name="copy-outline" size={14} color="#4F46E5" />
                          <Text style={styles.credCopyBtnText}>Kopyala</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Öğrenci Şifre Sıfırlama */}
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                      <TouchableOpacity
                        style={[styles.credResetDefaultBtn, { backgroundColor: '#059669', marginBottom: 6 }]}
                        onPress={() => handleResetStudentPassword()}
                        disabled={resettingPassword}
                        activeOpacity={0.85}
                      >
                        {resettingPassword ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="refresh" size={15} color="#fff" />
                            <Text style={styles.credResetDefaultBtnText}>
                              Varsayılan Öğrenci Şifresine Döndür (ooo_{selectedStudentForCreds.studentNumber})
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <TextInput
                          style={[styles.modalInput, { flex: 1, marginBottom: 0, backgroundColor: '#fff', fontSize: 12, height: 38 }]}
                          placeholder="Özel yeni öğrenci şifresi..."
                          value={customResetPassInput}
                          onChangeText={setCustomResetPassInput}
                          placeholderTextColor={Colors.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.credCustomPassSaveBtn, { backgroundColor: '#059669' }, (!customResetPassInput.trim() || resettingPassword) && { opacity: 0.5 }]}
                          onPress={() => {
                            if (!customResetPassInput.trim()) return;
                            handleResetStudentPassword(customResetPassInput.trim());
                          }}
                          disabled={!customResetPassInput.trim() || resettingPassword}
                        >
                          <Ionicons name="checkmark" size={15} color="#fff" />
                          <Text style={styles.credCustomPassSaveBtnText}>Uygula</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* KART 2: VELİ GİRİŞ VE ŞİFRE BİLGİLERİ */}
                  <View style={[styles.credSectionBox, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                    <View style={styles.credSectionHeaderRow}>
                      <Ionicons name="people" size={16} color="#2563EB" />
                      <Text style={[styles.credSectionTitle, { color: '#1E40AF' }]}>👨‍👩‍👧 Veli Portalı Giriş Bilgileri</Text>
                    </View>

                    {/* Veli Kullanıcı Adı */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>👨‍👩‍👧 Veli Kullanıcı Adı</Text>
                        <Text style={[styles.credFieldValueBold, { color: '#1E40AF' }]}>
                          {selectedStudentForCreds.studentNumber}
                          {selectedStudentForCreds.parentPhone ? ` (veya ${selectedStudentForCreds.parentPhone})` : ''}
                        </Text>
                        <Text style={styles.credFieldHint}>* Veli portala öğrenci no veya kayıtlı veli telefonuyla girer.</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.credCopyBtn, { borderColor: '#93C5FD' }]}
                        onPress={() => {
                          Clipboard.setStringAsync(selectedStudentForCreds.studentNumber);
                          Alert.alert('Kopyalandı', 'Veli kullanıcı adı panoya kopyalandı.');
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#2563EB" />
                        <Text style={[styles.credCopyBtnText, { color: '#2563EB' }]}>Kopyala</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Veli Giriş Şifresi */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>🔑 Veli Giriş Şifresi</Text>
                        <Text style={[styles.credFieldValueBold, { color: '#2563EB' }]}>
                          {showParentCredPassword
                            ? (selectedStudentForCreds.parentCustomPassword || `vvv_${selectedStudentForCreds.studentNumber}`)
                            : '••••••••••••'}
                        </Text>
                        <Text style={styles.credFieldHint}>* Varsayılan format: vvv_öğrencino</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.credIconBtn}
                          onPress={() => setShowParentCredPassword(!showParentCredPassword)}
                        >
                          <Ionicons name={showParentCredPassword ? "eye-off-outline" : "eye-outline"} size={16} color="#64748B" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.credCopyBtn, { borderColor: '#93C5FD' }]}
                          onPress={() => {
                            const p = selectedStudentForCreds.parentCustomPassword || `vvv_${selectedStudentForCreds.studentNumber}`;
                            Clipboard.setStringAsync(p);
                            Alert.alert('Kopyalandı', 'Veli giriş şifresi panoya kopyalandı.');
                          }}
                        >
                          <Ionicons name="copy-outline" size={14} color="#2563EB" />
                          <Text style={[styles.credCopyBtnText, { color: '#2563EB' }]}>Kopyala</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Veli Şifre Sıfırlama */}
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#DBEAFE' }}>
                      <TouchableOpacity
                        style={[styles.credResetDefaultBtn, { backgroundColor: '#2563EB', marginBottom: 6 }]}
                        onPress={() => handleResetParentPassword()}
                        disabled={resettingParentPassword}
                        activeOpacity={0.85}
                      >
                        {resettingParentPassword ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="refresh" size={15} color="#fff" />
                            <Text style={styles.credResetDefaultBtnText}>
                              Varsayılan Veli Şifresine Döndür (vvv_{selectedStudentForCreds.studentNumber})
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <TextInput
                          style={[styles.modalInput, { flex: 1, marginBottom: 0, backgroundColor: '#fff', fontSize: 12, height: 38 }]}
                          placeholder="Özel yeni veli şifresi..."
                          value={customParentResetPassInput}
                          onChangeText={setCustomParentResetPassInput}
                          placeholderTextColor={Colors.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.credCustomPassSaveBtn, { backgroundColor: '#2563EB' }, (!customParentResetPassInput.trim() || resettingParentPassword) && { opacity: 0.5 }]}
                          onPress={() => {
                            if (!customParentResetPassInput.trim()) return;
                            handleResetParentPassword(customParentResetPassInput.trim());
                          }}
                          disabled={!customParentResetPassInput.trim() || resettingParentPassword}
                        >
                          <Ionicons name="checkmark" size={15} color="#fff" />
                          <Text style={styles.credCustomPassSaveBtnText}>Uygula</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* KART 3: VELİ İLETİŞİMİ VE TEK TIKLA PAYLAŞIM */}
                  <View style={[styles.credSectionBox, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
                    <View style={styles.credSectionHeaderRow}>
                      <Ionicons name="chatbubbles-outline" size={16} color="#16A34A" />
                      <Text style={[styles.credSectionTitle, { color: '#166534' }]}>📱 Veliye Giriş Bilgilerini Gönder</Text>
                    </View>

                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.credParentInfoText}>
                        👤 <Text style={{ fontWeight: '700' }}>Veli Adı:</Text> {selectedStudentForCreds.parentName || 'Tanımlanmamış'}
                      </Text>
                      <Text style={styles.credParentInfoText}>
                        📱 <Text style={{ fontWeight: '700' }}>Veli Telefonu:</Text> {selectedStudentForCreds.parentPhone || 'Tanımlanmamış'}
                      </Text>
                    </View>

                    {/* Paylaşım Butonları */}
                    <View style={{ gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.credShareBtn, { backgroundColor: '#16A34A' }]}
                        onPress={() => handleShareViaWhatsApp(selectedStudentForCreds)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                        <Text style={styles.credShareBtnText}>WhatsApp ile Veliye Gönder</Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.credShareBtn, { flex: 1, backgroundColor: '#2563EB' }]}
                          onPress={() => handleShareViaSms(selectedStudentForCreds)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
                          <Text style={styles.credShareBtnText}>SMS ile Gönder</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.credShareBtn, { flex: 1, backgroundColor: '#475569' }]}
                          onPress={() => handleCopyCredentialsMessage(selectedStudentForCreds)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="copy-outline" size={16} color="#fff" />
                          <Text style={styles.credShareBtnText}>Tümünü Kopyala</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#64748B', marginTop: 10 }]}
              onPress={() => setCredentialsModalVisible(false)}
            >
              <Text style={styles.createSubmitText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
