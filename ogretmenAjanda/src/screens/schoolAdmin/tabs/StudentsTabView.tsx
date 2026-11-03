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
    handleClearAllStudentPhotos,
    handleDownloadStudentTemplate,
    handlePickAndUploadBulkPhotos,
    handlePickWordAndExtractPhotos,
    handlePickPdfAndExtractPhotos,
    handlePickAndExtractPhotosWithAi,
    handlePickAndParseExcel,
    handlePickAndParseExcelWithAi,
    setAddStudentModalVisible,
    selectedClassFilter,
    setSelectedClassFilter,
    selectedGradeFilter,
    setSelectedGradeFilter,
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

  const availableGrades = useMemo(() => {
    const grades = new Set<string>();
    classes.forEach((c: any) => {
      if (c.grade !== undefined && c.grade !== null && String(c.grade).trim()) {
        grades.add(String(c.grade).trim());
      }
    });
    students.forEach((s: any) => {
      if (s.grade !== undefined && s.grade !== null && String(s.grade).trim()) {
        grades.add(String(s.grade).trim());
      }
    });
    return Array.from(grades).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b, 'tr');
    });
  }, [classes, students]);

  const getGradeCount = useCallback((g: string) => {
    return students.filter((s: any) => String(s.grade || '').trim() === g).length;
  }, [students]);

  const getGradeLabel = (g: string) => {
    const s = String(g).trim();
    if (s === '10') return '10\'lar';
    if (s.endsWith('9') || s.endsWith('6')) return s + "\'lar";
    return s + "\'ler";
  };

  const isFiltered = (selectedClassFilter && selectedClassFilter !== 'all') ||
    (selectedGradeFilter && selectedGradeFilter !== 'all') ||
    (studentSearch && studentSearch.trim().length > 0);

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
              style={[
                styles.dangerHeaderBtn,
                isFiltered && { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }
              ]}
              onPress={handleDeleteAllStudents}
            >
              <Ionicons name="trash-outline" size={13} color="#DC2626" />
              <Text style={[styles.dangerHeaderBtnText, isFiltered && { fontWeight: '800', color: '#DC2626' }]}>
                {isFiltered ? `Filtrelenenleri Sil (${filteredStudents.length})` : `Tümünü Sil (${students.length})`}
              </Text>
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
            style={[styles.primaryAddBtn, { backgroundColor: '#2563EB' }]}
            onPress={handlePickWordAndExtractPhotos}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={13} color="#fff" />
            <Text style={styles.primaryAddBtnText}>Word'den Foto (.docx)</Text>
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

      {/* 🏷️ Hızlı Kademe Filtresi (9'lar, 10'lar...) */}
      {availableGrades.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            <TouchableOpacity
              style={[
                styles.gradeFilterChip,
                selectedGradeFilter === 'all' && styles.gradeFilterChipActive
              ]}
              onPress={() => setSelectedGradeFilter('all')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.gradeFilterChipText,
                selectedGradeFilter === 'all' && styles.gradeFilterChipTextActive
              ]}>
                Tümü ({students.length})
              </Text>
            </TouchableOpacity>
            {availableGrades.map((g) => {
              const count = getGradeCount(g);
              const active = selectedGradeFilter === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.gradeFilterChip,
                    active && styles.gradeFilterChipActive
                  ]}
                  onPress={() => {
                    if (selectedGradeFilter === g) {
                      setSelectedGradeFilter('all');
                    } else {
                      setSelectedGradeFilter(g);
                      if (selectedClassFilter !== 'all') {
                        setSelectedClassFilter('all');
                      }
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.gradeFilterChipText,
                    active && styles.gradeFilterChipTextActive
                  ]}>
                    {getGradeLabel(g)} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 🏫 Şube / Sınıf Filtresi (Listbox / Dropdown) */}
      <View style={styles.classSelectContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="filter" size={14} color="#4F46E5" />
            <Text style={styles.classSelectHeaderTitle}>Şube / Sınıf Filtresi :</Text>
          </View>
          {(selectedClassFilter !== 'all' || selectedGradeFilter !== 'all') && (
            <TouchableOpacity
              onPress={() => {
                setSelectedClassFilter('all');
                setSelectedGradeFilter('all');
              }}
              style={styles.clearFilterChip}
            >
              <Ionicons name="close-circle" size={13} color="#4F46E5" />
              <Text style={styles.clearFilterChipText}>Filtreyi Temizle ({students.length})</Text>
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
