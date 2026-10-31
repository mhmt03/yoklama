import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../../../theme/colors';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { formatDateToTR, getCurrentDateTimeString } from '../../../utils/dateUtils';
import { ClassDetailCtx, styles } from '../classDetailStyles';

export function StudentDetailAndGradeModals({ ctx }: { ctx: ClassDetailCtx }) {
  const {
    detailModalVisible,
    setDetailModalVisible,
    detailStudentIndex,
    handleNavigateDetailStudent,
    detailStudent,
    className,
    classCounselorTeacher,
    students,
    searchQuery,
    handleOpenPhotoOptions,
    getDisplayPhotoUri,
    handleSendParentMessage,
    gradebookData,
    activeTerm,
    handleOpenEditGrade,
    activeLesson,
    newNoteText,
    setNewNoteText,
    savingNote,
    handleAddNoteFromDetail,
    studentNotesList,
    loadingNotes,
    handleOpenEditNote,
    handleDeleteNoteFromDetail,
    insets,
    navigation,
    classId,
    editNoteModalVisible,
    editingNote,
    setEditNoteModalVisible,
    setEditingNote,
    setEditingNoteText,
    editingNoteText,
    savingEditNote,
    handleSaveEditNote,
    editGradeModalVisible,
    editingGradeRow,
    setEditGradeModalVisible,
    gradeInputs,
    setGradeInputs,
    handleSaveSingleGrade,
    savingSingleGrade,
    quizModalVisible,
    setQuizModalVisible,
    quizTitleInput,
    setQuizTitleInput,
    handleSaveNewQuiz,
    savingQuiz,
    pdfExtracting,
    classNoteModalVisible,
    setClassNoteModalVisible,
    editingClassNote,
    classNoteDateInput,
    setClassNoteDateInput,
    currentActiveLesson,
    setClassNoteLessonInput,
    classNoteLessonInput,
    classNoteInput,
    setClassNoteInput,
    savingClassNote,
    handleSaveClassNote
  } = ctx;

  return (
    <>
      <Modal
        visible={detailModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContainer}>
            {/* Header with Prev/Next navigation */}
            <View style={styles.detailModalHeader}>
              <TouchableOpacity
                style={[
                  styles.detailNavBtn,
                  detailStudentIndex <= 0 && styles.detailNavBtnDisabled,
                ]}
                onPress={() => handleNavigateDetailStudent('prev')}
                disabled={detailStudentIndex <= 0}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={detailStudentIndex <= 0 ? Colors.textMuted : Colors.primary}
                />
              </TouchableOpacity>

              <View style={[styles.detailHeaderInfo, { flex: 1, alignItems: 'center' }]}>
                <Text style={styles.detailModalTitle} numberOfLines={1}>
                  {detailStudent?.first_name} {detailStudent?.last_name}
                </Text>
                <Text style={styles.detailModalSubTitle}>
                  {className} • No: {detailStudent?.student_number || '-'}
                </Text>
                {!!classCounselorTeacher && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: '#A7F3D0' }}>
                    <Ionicons name="ribbon-outline" size={12} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>
                      Sınıf Rehberi: {classCounselorTeacher}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.detailNavBtn,
                  detailStudentIndex >= (students.filter((s: any) => searchQuery ? (s.first_name + ' ' + s.last_name).toLowerCase().includes(searchQuery.toLowerCase()) || (s.student_number || '').toLowerCase().includes(searchQuery.toLowerCase()) : true).length - 1) && styles.detailNavBtnDisabled,
                ]}
                onPress={() => handleNavigateDetailStudent('next')}
                disabled={detailStudentIndex >= (students.filter((s: any) => searchQuery ? (s.first_name + ' ' + s.last_name).toLowerCase().includes(searchQuery.toLowerCase()) || (s.student_number || '').toLowerCase().includes(searchQuery.toLowerCase()) : true).length - 1)}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={detailStudentIndex >= (students.filter((s: any) => searchQuery ? (s.first_name + ' ' + s.last_name).toLowerCase().includes(searchQuery.toLowerCase()) || (s.student_number || '').toLowerCase().includes(searchQuery.toLowerCase()) : true).length - 1) ? Colors.textMuted : Colors.primary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.detailModalCloseBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.detailModalBody}
              contentContainerStyle={{ paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Photo & Basic Info Banner */}
              <View style={styles.detailStudentCard}>
                {/* Large Centered Photo Wrap */}
                <View style={styles.detailPhotoWrap}>
                  <TouchableOpacity
                    onPress={() => {
                      if (detailStudent) handleOpenPhotoOptions(detailStudent);
                    }}
                    activeOpacity={0.85}
                    style={styles.detailPhotoTouchWrap}
                  >
                    {getDisplayPhotoUri(detailStudent?.photo_uri) ? (
                      <Image
                        source={{ uri: getDisplayPhotoUri(detailStudent?.photo_uri) }}
                        style={styles.detailPhotoLarge}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.detailPhotoPlaceholder}>
                        <Ionicons name="person" size={80} color={Colors.textMuted} />
                        <Text style={styles.detailPlaceholderNo}>
                          #{detailStudent?.student_number || '-'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailPhotoActionOverlay}>
                      <Ionicons name="camera" size={14} color="#FFFFFF" />
                      <Text style={styles.detailPhotoActionOverlayText}>Fotoğraf Değiştir</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Info Under Photo */}
                <View style={styles.detailStudentMetaUnder}>
                  {/* Name and Surname */}
                  <Text style={styles.detailStudentFullName}>
                    {detailStudent?.first_name} {detailStudent?.last_name}
                  </Text>

                  {/* Badges for No and Class */}
                  <View style={styles.detailBadgesRow}>
                    <View style={styles.detailNumberBadge}>
                      <Ionicons name="id-card-outline" size={13} color={Colors.primary} />
                      <Text style={styles.detailNumberBadgeText}>
                        No: {detailStudent?.student_number || '-'}
                      </Text>
                    </View>

                    <View style={styles.detailClassBadge}>
                      <Ionicons name="school-outline" size={13} color={Colors.successDark} />
                      <Text style={styles.detailClassBadgeText}>{className}</Text>
                    </View>
                  </View>

                  {/* Optional Notes */}
                  {detailStudent?.notes ? (
                    <View style={styles.detailNotesCard}>
                      <View style={styles.detailNotesHeader}>
                        <Ionicons name="document-text-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.detailNotesLabel}>Öğrenci Notu / Açıklama</Text>
                      </View>
                      <Text style={styles.detailNotesText}>{detailStudent.notes}</Text>
                    </View>
                  ) : null}

                  {/* Veli ve İletişim Bilgileri Kartı */}
                  <View style={styles.detailParentCard}>
                    <View style={styles.detailParentHeader}>
                      <Ionicons name="people-circle" size={17} color={Colors.primary} />
                      <Text style={styles.detailParentTitle}>Veli ve İletişim Bilgileri</Text>
                    </View>

                    <View style={styles.detailParentContent}>
                      <View style={styles.detailParentRow}>
                        <Text style={styles.detailParentLabel}>Veli Ad Soyad:</Text>
                        <Text style={styles.detailParentValue} numberOfLines={1}>
                          {detailStudent?.parent_name || 'Belirtilmemiş'}
                        </Text>
                      </View>

                      <View style={styles.detailParentRow}>
                        <Text style={styles.detailParentLabel}>Veli Telefonu:</Text>
                        <Text
                          style={[
                            styles.detailParentValue,
                            detailStudent?.parent_phone ? { color: '#047857', fontWeight: '800' } : null,
                          ]}
                        >
                          {detailStudent?.parent_phone || 'Telefon Yok'}
                        </Text>
                      </View>

                      {detailStudent?.student_phone ? (
                        <View style={styles.detailParentRow}>
                          <Text style={styles.detailParentLabel}>Öğrenci Tel:</Text>
                          <Text style={styles.detailParentValue}>{detailStudent.student_phone}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Veli Bilgilendirme ve Mesaj Butonları */}
                    <View style={styles.parentActionButtonsWrap}>
                      <TouchableOpacity
                        style={[styles.parentActionBtn, { backgroundColor: '#25D366' }]}
                        onPress={() => handleSendParentMessage('direct')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-whatsapp" size={13} color="#FFFFFF" />
                        <Text style={styles.parentActionBtnText}>Veliye Mesaj Yolla</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.parentActionBtn, { backgroundColor: '#4F46E5' }]}
                        onPress={() => handleSendParentMessage('notes')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="chatbubbles" size={13} color="#FFFFFF" />
                        <Text style={styles.parentActionBtnText}>Görüşleri Veliye Yolla</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.parentActionBtn, { backgroundColor: '#0284C7' }]}
                        onPress={() => handleSendParentMessage('grades')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="stats-chart" size={13} color="#FFFFFF" />
                        <Text style={styles.parentActionBtnText}>Notları Veliye Yolla</Text>
                      </TouchableOpacity>

                      {detailStudent?.parent_phone ? (
                        <TouchableOpacity
                          style={[styles.parentActionBtn, { backgroundColor: '#059669', flex: 0, paddingHorizontal: 12 }]}
                          onPress={() => handleSendParentMessage('call')}
                          activeOpacity={0.8}
                          accessibilityLabel="Veliyi Ara"
                        >
                          <Ionicons name="call" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>

              {/* Student Term Grade Summary */}
              {(() => {
                const currentGradeRow = gradebookData.students.find(
                  (r: any) => r.student_id === detailStudent?.id
                );
                return (
                  <View style={styles.detailGradeSection}>
                    <View style={styles.sectionHeaderRowBetween}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="calculator-outline" size={16} color={Colors.primary} />
                        <Text style={styles.detailSectionTitle}>
                          Not Durumu ({activeTerm}. Dönem)
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.detailGradeEditBtn}
                        onPress={() => {
                          if (currentGradeRow) {
                            handleOpenEditGrade(currentGradeRow);
                          } else if (detailStudent) {
                            handleOpenEditGrade({
                              student_id: detailStudent.id,
                              student_number: detailStudent.student_number,
                              first_name: detailStudent.first_name,
                              last_name: detailStudent.last_name,
                              quizScores: {},
                            });
                          }
                        }}
                      >
                        <Ionicons name="pencil" size={12} color={Colors.primary} />
                        <Text style={styles.detailGradeEditBtnText}>Not Gir / Düzenle</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.detailGradeGrid}>
                      <View style={styles.detailGradeBox}>
                        <Text style={styles.detailGradeBoxLabel}>Yazılılar</Text>
                        <Text style={styles.detailGradeBoxVal}>
                          {currentGradeRow?.exam1 ?? '-'} / {currentGradeRow?.exam2 ?? '-'} /{' '}
                          {currentGradeRow?.exam3 ?? '-'}
                        </Text>
                        <Text style={styles.detailGradeBoxSub}>
                          Ort: {currentGradeRow?.examAvg ?? '-'}
                        </Text>
                      </View>
                      <View style={styles.detailGradeBox}>
                        <Text style={styles.detailGradeBoxLabel}>Performans</Text>
                        <Text style={styles.detailGradeBoxVal}>
                          {currentGradeRow?.perf1 ?? '-'} / {currentGradeRow?.perf2 ?? '-'} /{' '}
                          {currentGradeRow?.perf3 ?? '-'}
                        </Text>
                        <Text style={styles.detailGradeBoxSub}>
                          Ort: {currentGradeRow?.perfAvg ?? '-'}
                        </Text>
                      </View>
                      <View style={styles.detailGradeBox}>
                        <Text style={styles.detailGradeBoxLabel}>Quizler</Text>
                        <Text style={styles.detailGradeBoxVal}>
                          {gradebookData.quizzes.length} Adet
                        </Text>
                        <Text style={styles.detailGradeBoxSub}>
                          Ort: {currentGradeRow?.quizAvg ?? '-'}
                        </Text>
                      </View>
                      <View style={[styles.detailGradeBox, styles.detailGradeBoxOverall]}>
                        <Text style={styles.detailGradeBoxLabelOverall}>Genel Ort.</Text>
                        <Text style={styles.detailGradeBoxValOverall}>
                          {currentGradeRow?.overallAvg ?? '-'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* Custom Note Input */}
              {/* Custom Note Input */}
              <View style={styles.detailSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                  <Text style={styles.detailSectionTitle}>Özel Görüş / Gözlem Yaz</Text>
                </View>

                {/* Lesson & Time Indicator */}
                {activeLesson ? (
                  <View style={styles.activeLessonBanner}>
                    <View style={styles.activeDot} />
                    <Ionicons name="school" size={13} color="#047857" />
                    <Text style={styles.activeLessonBannerText}>
                      Şu anki ders: <Text style={{ fontWeight: '800' }}>{activeLesson.fullText}</Text>{' '}
                      ({activeLesson.startTime} - {activeLesson.endTime})
                    </Text>
                  </View>
                ) : (
                  <View style={styles.timeBanner}>
                    <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.timeBannerText}>
                      Tarih: {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}, {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} (Ders dışı)
                    </Text>
                  </View>
                )}

                <View style={styles.customNoteInputWrap}>
                  <Input
                    placeholder="Öğrenci hakkında gözlem veya görüşünüz..."
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    multiline
                    style={styles.customNoteInput}
                  />
                  <Button
                    title="Görüşü Kaydet"
                    icon="add-circle"
                    size="sm"
                    loading={savingNote}
                    disabled={!newNoteText.trim() || savingNote}
                    onPress={() => handleAddNoteFromDetail()}
                    style={{ marginTop: 8 }}
                  />
                </View>
              </View>

              {/* Existing Notes List */}
              <View style={styles.detailSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="chatbubbles-outline" size={16} color={Colors.textPrimary} />
                  <Text style={styles.detailSectionTitle}>
                    Kayıtlı Görüşler ({studentNotesList.length})
                  </Text>
                </View>

                {loadingNotes ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
                ) : studentNotesList.length === 0 ? (
                  <View style={styles.emptyNotesBox}>
                    <Text style={styles.emptyNotesText}>Henüz bu öğrenci için kaydedilmiş bir görüş yok.</Text>
                  </View>
                ) : (
                  studentNotesList.map((n: any) => (
                    <View key={n.id} style={styles.noteItemCard}>
                      <View style={styles.noteItemContent}>
                        <Text style={styles.noteItemText}>{n.note}</Text>
                        <View style={styles.noteMetaRow}>
                          <View style={styles.noteDateWrap}>
                            <Ionicons name="calendar-outline" size={11} color={Colors.textSecondary} />
                            <Text style={styles.noteItemDate}>
                              {formatDateToTR(n.note_date || n.created_at)}
                            </Text>
                          </View>
                          {n.lesson_info ? (
                            <View style={styles.noteLessonBadge}>
                              <Ionicons name="school" size={10} color="#047857" />
                              <Text style={styles.noteLessonBadgeText}>{n.lesson_info}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.noteActionsRow}>
                        <TouchableOpacity
                          style={styles.editNoteBtn}
                          onPress={() => handleOpenEditNote(n)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Görüşü Düzenle"
                        >
                          <Ionicons name="pencil" size={14} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteNoteBtn}
                          onPress={() => handleDeleteNoteFromDetail(n.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Görüşü Sil"
                        >
                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Navigate to full notes history tab */}
              <TouchableOpacity
                style={[
                  styles.fullHistoryBtn,
                  { marginBottom: Math.max(40, insets.bottom + 24) },
                ]}
                onPress={() => {
                  setDetailModalVisible(false);
                  if (detailStudent) {
                    navigation.navigate('StudentNotesTab', {
                      initialClassId: classId,
                      initialStudentId: detailStudent.id,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="journal-outline" size={16} color={Colors.primary} />
                <Text style={styles.fullHistoryBtnText}>Tüm Görüş Geçmişi Sayfasına Git</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={editNoteModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Görüşü Düzenle</Text>
                <Text style={styles.modalSubtitle}>
                  {detailStudent?.first_name} {detailStudent?.last_name}
                  {editingNote?.lesson_info ? ` • ${editingNote.lesson_info}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setEditNoteModalVisible(false);
                  setEditingNote(null);
                  setEditingNoteText('');
                }}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder="Görüş metnini düzenleyin..."
              value={editingNoteText}
              onChangeText={setEditingNoteText}
              multiline
              numberOfLines={4}
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />

            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  setEditNoteModalVisible(false);
                  setEditingNote(null);
                  setEditingNoteText('');
                }}
              />
              <Button
                title="Güncelle"
                icon="checkmark"
                loading={savingEditNote}
                disabled={!editingNoteText.trim() || savingEditNote}
                style={{ flex: 1 }}
                onPress={handleSaveEditNote}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editGradeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Not Girişi ({activeTerm}. Dönem)</Text>
                <Text style={styles.modalSubtitle}>
                  {editingGradeRow?.student_number ? `No: ${editingGradeRow.student_number} • ` : ''}
                  {editingGradeRow?.first_name} {editingGradeRow?.last_name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditGradeModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Yazılı Sınavlar */}
              <View style={styles.gradeModalSection}>
                <View style={styles.gradeModalSectionTitleRow}>
                  <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                  <Text style={styles.gradeModalSectionTitle}>Yazılı Sınav Notları (0 - 100)</Text>
                </View>
                <View style={styles.gradeModalInputRow}>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>1. Yazılı</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.exam1}
                      onChangeText={(t: any) => setGradeInputs((prev: any) => ({ ...prev, exam1: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>2. Yazılı</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.exam2}
                      onChangeText={(t: any) => setGradeInputs((prev: any) => ({ ...prev, exam2: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>3. Yazılı</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.exam3}
                      onChangeText={(t: any) => setGradeInputs((prev: any) => ({ ...prev, exam3: t }))}
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>

              {/* Performans Notları */}
              <View style={styles.gradeModalSection}>
                <View style={styles.gradeModalSectionTitleRow}>
                  <Ionicons name="ribbon-outline" size={16} color={Colors.successDark} />
                  <Text style={styles.gradeModalSectionTitle}>Performans Notları (0 - 100)</Text>
                </View>
                <View style={styles.gradeModalInputRow}>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>1. Perf</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.perf1}
                      onChangeText={(t: any) => setGradeInputs((prev: any) => ({ ...prev, perf1: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>2. Perf</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.perf2}
                      onChangeText={(t: any) => setGradeInputs((prev: any) => ({ ...prev, perf2: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>3. Perf</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.perf3}
                      onChangeText={(t: any) => setGradeInputs((prev: any) => ({ ...prev, perf3: t }))}
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>

              {/* Quiz Notları */}
              <View style={styles.gradeModalSection}>
                <View style={styles.gradeModalSectionTitleRow}>
                  <Ionicons name="flash-outline" size={16} color={Colors.warningDark} />
                  <Text style={styles.gradeModalSectionTitle}>Ders İçi Quizler ({gradebookData.quizzes.length})</Text>
                </View>
                {gradebookData.quizzes.length === 0 ? (
                  <Text style={styles.noQuizHint}>
                    Bu dönem için henüz quiz eklenmemiş. Not çizelgesi üzerindeki "+ Quiz" butonuyla dilediğiniz kadar quiz tanımlayabilirsiniz.
                  </Text>
                ) : (
                  <View style={styles.quizInputsGrid}>
                    {gradebookData.quizzes.map((q: any) => (
                      <View key={q.id} style={styles.quizInputItem}>
                        <Text style={styles.gradeInputLabel} numberOfLines={1}>{q.title}</Text>
                        <TextInput
                          style={styles.gradeScoreInput}
                          keyboardType="numeric"
                          placeholder="-"
                          placeholderTextColor={Colors.textMuted}
                          value={gradeInputs.quizScores[q.id] || ''}
                          onChangeText={(t: any) =>
                            setGradeInputs((prev: any) => ({
                              ...prev,
                              quizScores: { ...prev.quizScores, [q.id]: t },
                            }))
                          }
                          maxLength={5}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="İptal"
                variant="outline"
                onPress={() => setEditGradeModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Notları Kaydet"
                onPress={handleSaveSingleGrade}
                loading={savingSingleGrade}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={quizModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Quiz Ekle ({activeTerm}. Dönem)</Text>
              <TouchableOpacity onPress={() => setQuizModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.quizModalHint}>
              Ders içinde yaptığınız kısa sınav, kelime testi, tarama vb. için bir başlık belirleyin. Sınıfın tüm öğrencilerine bu sütun eklenecektir.
            </Text>

            <Input
              label="Quiz / Tarama Başlığı"
              placeholder="Örn: Quiz 1, 1. Ünite Taraması..."
              value={quizTitleInput}
              onChangeText={setQuizTitleInput}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                onPress={() => setQuizModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Quiz Oluştur"
                onPress={handleSaveNewQuiz}
                loading={savingQuiz}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pdfExtracting} transparent animationType="fade">
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 28,
            alignItems: 'center',
            width: '85%',
            maxWidth: 340,
            ...Shadows.large,
          }}>
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: 18 }} />
            <Text style={{
              fontSize: 17,
              fontWeight: '700',
              color: Colors.textPrimary,
              textAlign: 'center',
              marginBottom: 8,
            }}>
              PDF İşleniyor...
            </Text>
            <Text style={{
              fontSize: 13,
              color: Colors.textSecondary,
              textAlign: 'center',
              lineHeight: 18,
            }}>
              PDF dosyasındaki öğrenci resimleri ayıklanıyor ve eşleştiriliyor, lütfen bekleyiniz.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={classNoteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setClassNoteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editingClassNote ? 'Sınıf Görüşünü Düzenle' : 'Yeni Sınıf Görüşü Ekle'}
                </Text>
                <Text style={styles.modalSubtitle}>{className} Şubesi Genel Görüşü</Text>
              </View>
              <TouchableOpacity onPress={() => setClassNoteModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 8 }}>
              {/* Tarih & Saat */}
              <View style={{ marginBottom: 12 }}>
                <Input
                  label="Tarih & Saat"
                  value={classNoteDateInput}
                  onChangeText={setClassNoteDateInput}
                  placeholder="YYYY-MM-DD HH:mm"
                  icon="calendar"
                  style={{ height: 40 }}
                />
              </View>

              {/* Ders Bilgisi (İsteğe Bağlı) */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.classNoteInputLabel}>Ders Bilgisi (İsteğe Bağlı)</Text>
                  {currentActiveLesson && (
                    <TouchableOpacity
                      onPress={() => setClassNoteLessonInput(`${currentActiveLesson.fullText} (${currentActiveLesson.startTime} - ${currentActiveLesson.endTime})`)}
                    >
                      <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>
                        Şu Anki Dersi Ekle
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Input
                  value={classNoteLessonInput}
                  onChangeText={setClassNoteLessonInput}
                  placeholder="Örn: Pazartesi, 3. Ders • Fizik"
                  icon="time"
                  style={{ height: 40 }}
                />
              </View>

              {/* Görüş / Not Metni */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.classNoteInputLabel}>Şube Hakkındaki Görüşünüz *</Text>
                <TextInput
                  style={styles.classNoteTextArea}
                  value={classNoteInput}
                  onChangeText={setClassNoteInput}
                  placeholder="Örn: Yaramaz öğrenci sayısı fazla olduğu için derste otorite kurmak zor oluyor. Tahta kullanımı ve birebir soru çözümü daha etkili..."
                  placeholderTextColor={Colors.textMuted}
                  multiline={true}
                  numberOfLines={5}
                  textAlignVertical="top"
                />
              </View>

              {/* Hızlı Şablon Cümleler (Öneri Hapları) */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.classNoteInputLabel, { marginBottom: 6 }]}>Hızlı Görüş Şablonları:</Text>
                <View style={styles.quickTemplateWrap}>
                  {[
                    'Yaramaz öğrenci sayısı fazla olduğu için derste otorite kurmak zor oluyor.',
                    'Sınıfın derse ilgisi ve katılım düzeyi oldukça yüksek.',
                    'Ödev hazırlığı ve materyal getirme oranı çok başarılı.',
                    'Derste odaklanma ve gürültü problemi yaşanıyor.',
                    'Grup çalışmalarında öğrenciler uyumlu ve verimli çalıştı.',
                    'Konu kavrama ve soru çözüm performansları gayet iyi.',
                  ].map((templateText: any, idx: any) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.quickTemplateChip}
                      onPress={() => {
                        if (!classNoteInput.trim()) {
                          setClassNoteInput(templateText);
                        } else {
                          setClassNoteInput((prev: any) => `${prev} ${templateText}`);
                        }
                      }}
                    >
                      <Text style={styles.quickTemplateChipText} numberOfLines={1}>
                        + {templateText}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Actions */}
            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                onPress={() => setClassNoteModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={savingClassNote ? 'Kaydediliyor...' : editingClassNote ? 'Güncelle' : 'Kaydet'}
                onPress={handleSaveClassNote}
                loading={savingClassNote}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
