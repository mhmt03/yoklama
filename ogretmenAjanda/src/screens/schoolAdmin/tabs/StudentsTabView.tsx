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
import { SchoolAdminCtx, styles, HtmlSelect } from '../schoolAdminStyles';

export function StudentsTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    filteredStudents,
    students,
    handleDeleteAllStudents,
    handleDownloadStudentTemplate,
    handlePickAndUploadBulkPhotos,
    handlePickPdfAndExtractPhotos,
    handlePickAndExtractPhotosWithAi,
    handlePickAndParseExcel,
    handlePickAndParseExcelWithAi,
    setAddStudentModalVisible,
    selectedClassFilter,
    setSelectedClassFilter,
    classes,
    setClassFilterModalVisible,
    studentSearch,
    setStudentSearch,
    studentVisibleCount,
    serverBaseUrl,
    photoUploadingId,
    handleOpenStudentDetail,
    handlePickAndUploadPhoto,
    handleOpenCredentialsModal,
    handleShareViaWhatsApp,
    setEditingStudent,
    setEditStudentModalVisible,
    handleDeleteStudent,
    setStudentVisibleCount
  } = ctx;

  return (
    <View>
                <View style={{ marginBottom: 12 }}>
                  {/* Başlık Satırı */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="people" size={18} color="#4F46E5" />
                      <Text style={[styles.sectionTitle, { fontSize: 15 }]}>
                        Kayıtlı Öğrenciler ({filteredStudents.length}/{students.length})
                      </Text>
                    </View>
                  </View>

                  {/* Butonlar Satırı */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {students.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllStudents}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#475569' }]}
                      onPress={handleDownloadStudentTemplate}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Şablon</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#7C3AED' }]}
                      onPress={handlePickAndUploadBulkPhotos}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="images-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Toplu Foto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#4338CA' }]}
                      onPress={handlePickPdfAndExtractPhotos}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="document-attach-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>PDF'den Foto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#9333EA' }]}
                      onPress={handlePickAndExtractPhotosWithAi}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>AI ile Foto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#059669' }]}
                      onPress={handlePickAndParseExcel}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="document-text" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Excel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#8B5CF6' }]}
                      onPress={handlePickAndParseExcelWithAi}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>AI ile Excel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddStudentModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="person-add" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 🏫 Şube / Sınıf Filtresi (Listbox / Dropdown) */}
                <View style={styles.classSelectContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="filter" size={14} color="#4F46E5" />
                      <Text style={styles.classSelectHeaderTitle}>Şube / Sınıf Filtresi (Listbox):</Text>
                    </View>
                    {selectedClassFilter !== 'all' && (
                      <TouchableOpacity
                        onPress={() => setSelectedClassFilter('all')}
                        style={styles.clearFilterChip}
                      >
                        <Ionicons name="close-circle" size={13} color="#4F46E5" />
                        <Text style={styles.clearFilterChipText}>Tüm Sınıfları Göster ({students.length})</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {Platform.OS === 'web' ? (
                    <View style={styles.webSelectWrapper}>
                      <Ionicons name="school" size={16} color="#4F46E5" style={styles.webSelectIcon} />
                      <HtmlSelect
                        value={selectedClassFilter}
                        onChange={(e: any) => setSelectedClassFilter(e.target.value)}
                        style={styles.webSelectBox}
                      >
                        <option value="all">🏫 Tüm Sınıflar ve Şubeler ({students.length} Kayıtlı Öğrenci)</option>
                        {classes.map((c: any) => {
                          const tag = c.className || `${c.grade}-${c.section}`;
                          const count = students.filter(
                            (s: any) =>
                              `${s.grade}-${s.section}` === tag ||
                              s.className === tag ||
                              (String(s.grade) === String(c.grade) && String(s.section).toUpperCase() === String(c.section).toUpperCase())
                          ).length;
                          return (
                            <option key={c.id} value={tag}>
                              📚 {tag} Şubesi ({count} Öğrenci)
                            </option>
                          );
                        })}
                      </HtmlSelect>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.mobileSelectPickerBtn}
                      onPress={() => setClassFilterModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name="school" size={16} color="#4F46E5" />
                        <Text style={styles.mobileSelectPickerText}>
                          {selectedClassFilter === 'all'
                            ? `Tüm Sınıflar (${students.length} Öğrenci)`
                            : `${selectedClassFilter} Şubesi`}
                        </Text>
                      </View>
                      <Ionicons name="chevron-down" size={16} color="#64748B" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Öğrenci Arama Çubuğu */}
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Öğrenci adı veya numarası ile ara..."
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                    placeholderTextColor={Colors.textMuted}
                  />
                  {studentSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setStudentSearch('')}>
                      <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {filteredStudents.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="id-card-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Bu filtreye uygun öğrenci bulunamadı.</Text>
                  </View>
                ) : (
                  filteredStudents.slice(0, studentVisibleCount).map((student: any) => {
                    const photoUrl = student.photoPath ? `${serverBaseUrl}${student.photoPath}` : null;
                    const isUploading = photoUploadingId === student.id;

                    return (
                      <View key={student.id} style={styles.studentCard}>
                        <TouchableOpacity
                          style={styles.studentCardTop}
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
                                <Text style={styles.studentInitials}>{student.fullName.slice(0, 2).toUpperCase()}</Text>
                              </View>
                            )}
                            <View style={styles.cameraBadge}>
                              <Ionicons name="camera" size={12} color="#fff" />
                            </View>
                          </TouchableOpacity>

                          {/* Bilgiler */}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={styles.studentName}>{student.fullName}</Text>
                              <View style={styles.studentClassTag}>
                                <Text style={styles.studentClassTagText}>{student.grade}-{student.section}</Text>
                              </View>
                            </View>

                            <Text style={styles.studentNoText}>Okul No: {student.studentNumber}</Text>

                            {student.parentName && (
                              <Text style={styles.parentText}>
                                👨‍👩‍👧 Veli: {student.parentName} {student.parentPhone ? `(${student.parentPhone})` : ''}
                              </Text>
                            )}
                            {student.studentPhone && (
                              <Text style={[styles.parentText, { color: '#0369A1', marginTop: 2 }]}>
                                📱 Öğr Tel: {student.studentPhone}
                              </Text>
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
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A', fontWeight: '600' }]}>Veli WhatsApp</Text>
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
                  })
                )}
                {filteredStudents.length > studentVisibleCount && (
                  <TouchableOpacity
                    style={{ alignItems: 'center', paddingVertical: 14, marginVertical: 8, borderRadius: 12, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}
                    onPress={() => setStudentVisibleCount((c: any) => c + 40)}
                  >
                    <Text style={{ color: '#4F46E5', fontWeight: '800', fontSize: 13 }}>
                      Daha fazla göster ({filteredStudents.length - studentVisibleCount} öğrenci daha)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
  );
}
