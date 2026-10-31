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
import { PermissionsManagementModal } from '../../../components/PermissionsManagementModal';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function PhotoAndSystemModals({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    bulkPhotoModalVisible,
    bulkPhotoProgress,
    photoReviewModalVisible,
    savingReviewPhotos,
    setPhotoReviewModalVisible,
    reviewPhotos,
    reviewAvailablePages,
    rescanningPage,
    handleRescanCurrentPage,
    reviewPageFilter,
    setReviewPageFilter,
    getPhotoMatchStatus,
    setReviewMatchFilter,
    reviewMatchFilter,
    reviewSearchQuery,
    setReviewSearchQuery,
    handleShiftPhotos,
    photoHistoryStack,
    handleUndoShift,
    initialReviewPhotos,
    handleResetToInitial,
    filteredReviewPhotos,
    handleOpenPhotoPicker,
    handleShiftPhotosFromIndex,
    handleRemovePhotoMatch,
    handleOpenStudentPicker,
    handleSaveConfirmedPhotos,
    studentPickerVisible,
    setStudentPickerVisible,
    studentPickerSearch,
    setStudentPickerSearch,
    filteredPickerStudents,
    getPickerStudentInfo,
    handleAssignStudentToPhoto,
    photoPickerVisible,
    setPhotoPickerVisible,
    photoPickerSearch,
    setPhotoPickerSearch,
    handleAssignPhotoToTarget,
    singleStudentPdfModalVisible,
    singleStudentPdfUploading,
    setSingleStudentPdfModalVisible,
    setSingleStudentPdfTarget,
    singleStudentPdfTarget,
    cachedPdfPhotos,
    handlePickNewPdfForSingleStudent,
    singleStudentPdfSearch,
    setSingleStudentPdfSearch,
    handleSelectPdfPhotoForStudent,
    menuDrawerVisible,
    setMenuDrawerVisible,
    selectedSchool,
    setSchoolSelectModalVisible,
    schools,
    navigation,
    isStaff,
    setPermissionsModalVisible,
    handleOpenEditSchool,
    setCreateModalVisible,
    handleDeleteSchool,
    handleOpenAdminCredentials,
    setLicenseModalVisible,
    setActiveTab,
    allSchoolSchedules,
    loadAllSchedules,
    dutiesList,
    loadDuties,
    loadAuditLogs,
    logStats,
    loadSchoolMessages,
    handleSwitchToTeacher,
    handleLogout,
    logPurgeModalVisible,
    setLogPurgeModalVisible,
    purgeStartDate,
    setPurgeStartDate,
    purgeEndDate,
    setPurgeEndDate,
    isPurgingLogs,
    handlePurgeLogs,
    licenseModalVisible,
    permissionsModalVisible,
    loadSchools,
    radarClassModalVisible,
    setRadarClassModalVisible,
    radarClassSearch,
    setRadarClassSearch,
    radarClassGradeFilter,
    setRadarClassGradeFilter,
    classes,
    radarClass,
    setRadarClass,
    dutyPlacesModalVisible,
    setDutyPlacesModalVisible,
    newCustomPlaceInput,
    setNewCustomPlaceInput,
    customDutyPlaces,
    setCustomDutyPlaces,
    allKnownDutyPlaces,
    classFilterModalVisible,
    setClassFilterModalVisible,
    selectedClassFilter,
    setSelectedClassFilter,
    students
  } = ctx;

  return (
    <>
      <Modal visible={bulkPhotoModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 28 }]}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B', marginTop: 16 }}>
              Toplu Fotoğraf Yükleniyor
            </Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}>
              {bulkPhotoProgress || 'Lütfen bekleyin...'}
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={photoReviewModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!savingReviewPhotos) setPhotoReviewModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 680, width: '95%', maxHeight: '92%', padding: 0, overflow: 'hidden' }]}>
            {/* Modal Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="images" size={20} color="#4F46E5" />
                  <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F172A' }}>
                    PDF Fotoğraf İnceleme & Eşleştirme
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {reviewPhotos.length} vesikalık fotoğraf bulundu •{' '}
                  <Text style={{ color: '#059669', fontWeight: '700' }}>
                    {reviewPhotos.filter((p: any) => p.matchedStudent !== null).length} eşleşti
                  </Text>
                  {reviewPhotos.filter((p: any) => p.matchedStudent === null).length > 0 && (
                    <Text style={{ color: '#D97706', fontWeight: '700' }}>
                      {' '}• {reviewPhotos.filter((p: any) => p.matchedStudent === null).length} eşleşmedi
                    </Text>
                  )}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !savingReviewPhotos && setPhotoReviewModalVisible(false)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: '#E2E8F0' }}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Bilgilendirme Kutusu */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#DBEAFE', paddingHorizontal: 16, paddingVertical: 10 }}>
              <Ionicons name="information-circle" size={18} color="#2563EB" />
              <Text style={{ flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 16 }}>
                Fotoğraflar PDF içerisindeki sayfa sırasına ve öğrenci numaralarına göre eşleştirildi. Hatalı olanları "Hatalı / Kaldır" ile çıkarabilir, yanlış olanları "Öğrenci Değiştir" ile düzeltebilirsiniz.
              </Text>
            </View>

            {/* Filtre ve Arama Alanı */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              {/* Sayfa Filtresi ve Yeniden Tarama */}
              {reviewAvailablePages.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                      📄 Sayfa Seçimi:
                    </Text>
                    <TouchableOpacity
                      disabled={rescanningPage}
                      onPress={handleRescanCurrentPage}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: '#F0FDF4',
                        paddingHorizontal: 8,
                        paddingVertical: 3.5,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#86EFAC',
                      }}
                    >
                      {rescanningPage ? (
                        <ActivityIndicator size="small" color="#16A34A" />
                      ) : (
                        <Ionicons name="reload" size={12} color="#16A34A" />
                      )}
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D' }}>
                        {reviewPageFilter === 'all' ? 'Tüm Belgeyi Tekrar Tara' : `Sayfa ${reviewPageFilter}'i Tekrar Tara`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => setReviewPageFilter('all')}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 16,
                        backgroundColor: reviewPageFilter === 'all' ? '#4F46E5' : '#F1F5F9',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: reviewPageFilter === 'all' ? '#fff' : '#475569' }}>
                        Tüm Sayfalar ({reviewPhotos.length})
                      </Text>
                    </TouchableOpacity>
                    {reviewAvailablePages.map((page: any) => {
                      const countOnPage = reviewPhotos.filter((p: any) => p.pageNumber === page).length;
                      const isSelected = reviewPageFilter === page;
                      return (
                        <TouchableOpacity
                          key={page}
                          onPress={() => setReviewPageFilter(page)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 5,
                            borderRadius: 16,
                            backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : '#475569' }}>
                            Sayfa {page} ({countOnPage})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Durum Filtreleri ve Arama */}
              {(() => {
                const fullCount = reviewPhotos.filter((p: any) => getPhotoMatchStatus(p).status === 'full').length;
                const numOnlyCount = reviewPhotos.filter((p: any) => getPhotoMatchStatus(p).status === 'number_only').length;
                const noneCount = reviewPhotos.filter((p: any) => getPhotoMatchStatus(p).status === 'none').length;

                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => setReviewMatchFilter('all')}
                        style={{
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          borderRadius: 12,
                          backgroundColor: reviewMatchFilter === 'all' ? '#0F172A' : '#F1F5F9',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: reviewMatchFilter === 'all' ? '#fff' : '#475569' }}>
                          Tümü ({reviewPhotos.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setReviewMatchFilter('full')}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          borderRadius: 12,
                          backgroundColor: reviewMatchFilter === 'full' ? '#15803D' : '#F0FDF4',
                          borderWidth: 1,
                          borderColor: '#86EFAC',
                        }}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: reviewMatchFilter === 'full' ? '#fff' : '#15803D' }} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: reviewMatchFilter === 'full' ? '#fff' : '#15803D' }}>
                          Tam Eşleşen ({fullCount})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setReviewMatchFilter('number_only')}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          borderRadius: 12,
                          backgroundColor: reviewMatchFilter === 'number_only' ? '#B45309' : '#FFFBEB',
                          borderWidth: 1,
                          borderColor: '#FCD34D',
                        }}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: reviewMatchFilter === 'number_only' ? '#fff' : '#B45309' }} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: reviewMatchFilter === 'number_only' ? '#fff' : '#B45309' }}>
                          Yalnızca No ({numOnlyCount})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setReviewMatchFilter('unmatched')}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          borderRadius: 12,
                          backgroundColor: reviewMatchFilter === 'unmatched' ? '#B91C1C' : '#FEF2F2',
                          borderWidth: 1,
                          borderColor: '#FCA5A5',
                        }}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: reviewMatchFilter === 'unmatched' ? '#fff' : '#B91C1C' }} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: reviewMatchFilter === 'unmatched' ? '#fff' : '#B91C1C' }}>
                          Eşleşmeyen ({noneCount})
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Arama Inputu */}
                    <View style={{ flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 8, height: 32 }}>
                      <Ionicons name="search" size={14} color="#64748B" style={{ marginRight: 6 }} />
                      <TextInput
                        style={{ flex: 1, fontSize: 12, color: '#0F172A', paddingVertical: 0 }}
                        placeholder="Ad, no veya şube ara..."
                        placeholderTextColor="#94A3B8"
                        value={reviewSearchQuery}
                        onChangeText={setReviewSearchQuery}
                      />
                      {reviewSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setReviewSearchQuery('')}>
                          <Ionicons name="close-circle" size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Hızlı Dizi Kayması Düzeltme Aracı */}
                    <View style={{ width: '100%', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="swap-horizontal" size={14} color="#6366F1" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>
                            Dizi Kayması:
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            onPress={() => handleShiftPhotos(-1)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: '#EEF2FF',
                              borderWidth: 1,
                              borderColor: '#C7D2FE',
                            }}
                          >
                            <Ionicons name="arrow-back-outline" size={12} color="#4F46E5" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                              1 Geri Kaydır (-1)
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleShiftPhotos(1)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: '#EEF2FF',
                              borderWidth: 1,
                              borderColor: '#C7D2FE',
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                              1 İleri Kaydır (+1)
                            </Text>
                            <Ionicons name="arrow-forward-outline" size={12} color="#4F46E5" />
                          </TouchableOpacity>

                          {photoHistoryStack.length > 0 && (
                            <TouchableOpacity
                              onPress={handleUndoShift}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                                paddingHorizontal: 7,
                                paddingVertical: 4,
                                borderRadius: 6,
                                backgroundColor: '#FEF3C7',
                                borderWidth: 1,
                                borderColor: '#FDE68A',
                              }}
                            >
                              <Ionicons name="arrow-undo" size={12} color="#D97706" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>
                                Geri Al
                              </Text>
                            </TouchableOpacity>
                          )}

                          {initialReviewPhotos.length > 0 && (
                            <TouchableOpacity
                              onPress={handleResetToInitial}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                                paddingHorizontal: 7,
                                paddingVertical: 4,
                                borderRadius: 6,
                                backgroundColor: '#FEE2E2',
                                borderWidth: 1,
                                borderColor: '#FECACA',
                              }}
                            >
                              <Ionicons name="refresh" size={12} color="#DC2626" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                                Sıfırla
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Fotoğraflar Listesi */}
            <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 12, gap: 10 }}>
              {filteredReviewPhotos.length === 0 ? (
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                  <Ionicons name="search-outline" size={36} color="#94A3B8" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748B', marginTop: 8 }}>
                    Filtreye uygun fotoğraf bulunamadı.
                  </Text>
                </View>
              ) : (
                filteredReviewPhotos.map((item: any, idx: any) => {
                  const matched: any = item.matchedStudent;
                  const matchInfo = getPhotoMatchStatus(item);

                  const pdfNo = item.detectedNumber && item.detectedNumber.trim() ? item.detectedNumber.trim() : 'Okunamadı';
                  const pdfName = item.detectedName && item.detectedName.trim() ? item.detectedName.trim() : 'İsim Yok';

                  return (
                    <View
                      key={item.id || idx}
                      style={{
                        flexDirection: 'row',
                        backgroundColor: matchInfo.bgColor,
                        borderRadius: 14,
                        padding: 10,
                        borderWidth: 1.5,
                        borderColor: matchInfo.borderColor,
                        shadowColor: '#000',
                        shadowOpacity: 0.04,
                        shadowRadius: 5,
                        elevation: 2,
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      {/* Vesikalık Görsel (Dokunarak Değiştirilebilir) */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleOpenPhotoPicker(item.id)}
                        style={{ position: 'relative' }}
                      >
                        {item.tempUri ? (
                          <Image
                            source={{ uri: item.tempUri }}
                            style={{
                              width: 76,
                              height: 98,
                              borderRadius: 8,
                              backgroundColor: '#E2E8F0',
                              borderWidth: 1.5,
                              borderColor: matchInfo.borderColor,
                            }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: 76,
                              height: 98,
                              borderRadius: 8,
                              backgroundColor: '#F8FAFC',
                              borderWidth: 1.5,
                              borderColor: '#CBD5E1',
                              borderStyle: 'dashed',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Ionicons name="camera-outline" size={24} color="#94A3B8" />
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#64748B', marginTop: 4 }}>
                              Foto Seç
                            </Text>
                          </View>
                        )}
                        <View
                          style={{
                            position: 'absolute',
                            top: 3,
                            left: 3,
                            backgroundColor: 'rgba(15, 23, 42, 0.75)',
                            borderRadius: 4,
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          <Ionicons name="camera" size={9} color="#fff" />
                          <Text style={{ fontSize: 8.5, fontWeight: '700', color: '#fff' }}>Seç</Text>
                        </View>
                        {item.pageNumber ? (
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 2,
                              right: 2,
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                              borderRadius: 4,
                              paddingHorizontal: 4,
                              paddingVertical: 1,
                            }}
                          >
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>
                              S.{item.pageNumber}
                            </Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>

                      {/* Bilgiler ve Karşılaştırma Alanı */}
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        {/* Sıra & Durum Rozeti */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                            #{item.index + 1}. Fotoğraf {item.pageNumber ? `(Sayfa ${item.pageNumber})` : ''}
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: matchInfo.badgeBg,
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: matchInfo.borderColor,
                            }}
                          >
                            <Ionicons
                              name={
                                matchInfo.status === 'full'
                                  ? 'checkmark-circle'
                                  : matchInfo.status === 'number_only'
                                    ? 'alert-circle'
                                    : 'close-circle'
                              }
                              size={12}
                              color={matchInfo.badgeText}
                            />
                            <Text style={{ fontSize: 10.5, fontWeight: '800', color: matchInfo.badgeText }}>
                              {matchInfo.badgeLabel}
                            </Text>
                          </View>
                        </View>

                        {/* Karşılaştırma Kutusu (PDF vs Sistem - Alt Üst Stacked Bloklar) */}
                        <View style={{ gap: 6 }}>
                          {/* 1. Blok: PDF'ten Okunan Veri */}
                          <View
                            style={{
                              backgroundColor: '#EEF2FF',
                              borderRadius: 8,
                              padding: 6,
                              borderWidth: 1,
                              borderColor: '#C7D2FE',
                              gap: 2,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="document-text" size={12} color="#4F46E5" />
                                <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#4338CA', textTransform: 'uppercase' }}>
                                  PDF'ten Okunan:
                                </Text>
                              </View>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#312E81' }}>
                                Okul No: <Text style={{ fontWeight: '800', color: '#1E1B4B' }}>{pdfNo}</Text>
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: '#1E293B',
                                paddingLeft: 16,
                              }}
                              numberOfLines={1}
                            >
                              {pdfName}
                            </Text>
                          </View>

                          {/* 2. Blok: Sistemdeki Öğrenci Kaydı */}
                          <View
                            style={{
                              backgroundColor: matched ? '#F0FDF4' : '#FEF2F2',
                              borderRadius: 8,
                              padding: 6,
                              borderWidth: 1,
                              borderColor: matched ? '#86EFAC' : '#FCA5A5',
                              gap: 2,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="person" size={12} color={matched ? '#15803D' : '#DC2626'} />
                                <Text
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: '800',
                                    color: matched ? '#15803D' : '#DC2626',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  Sistemdeki Kayıt:
                                </Text>
                              </View>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: matched ? '#14532D' : '#7F1D1D' }}>
                                Okul No: <Text style={{ fontWeight: '800', color: matched ? '#0F172A' : '#DC2626' }}>{matchInfo.sysNumber}</Text>
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16 }}>
                              <Text
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: '800',
                                  color: matched ? '#0F172A' : '#DC2626',
                                  flex: 1,
                                }}
                                numberOfLines={1}
                              >
                                {matched ? matchInfo.sysFullName : 'Eşleşen Öğrenci Yok'}
                              </Text>
                              {matched && matchInfo.sysClassName !== '-' && (
                                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#15803D' }}>
                                    {matchInfo.sysClassName}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>

                        {/* Bu Öğrenciden İtibaren Sonrakileri Kaydır */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC',
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                            borderRadius: 7,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            marginTop: 6,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="shuffle-outline" size={12} color="#6366F1" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569' }}>
                              Buradan Sonrasını Kaydır:
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 5 }}>
                            <TouchableOpacity
                              onPress={() => handleShiftPhotosFromIndex(item.id, -1)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 2,
                                backgroundColor: '#EEF2FF',
                                borderWidth: 1,
                                borderColor: '#C7D2FE',
                                paddingHorizontal: 7,
                                paddingVertical: 2.5,
                                borderRadius: 5,
                              }}
                            >
                              <Ionicons name="arrow-back" size={10} color="#4F46E5" />
                              <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4F46E5' }}>
                                1 Geri (-1)
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => handleShiftPhotosFromIndex(item.id, 1)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 2,
                                backgroundColor: '#EEF2FF',
                                borderWidth: 1,
                                borderColor: '#C7D2FE',
                                paddingHorizontal: 7,
                                paddingVertical: 2.5,
                                borderRadius: 5,
                              }}
                            >
                              <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4F46E5' }}>
                                1 İleri (+1)
                              </Text>
                              <Ionicons name="arrow-forward" size={10} color="#4F46E5" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Satır İçi İşlem Butonları */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                          {matched && (
                            <TouchableOpacity
                              onPress={() => handleRemovePhotoMatch(item.id)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                                backgroundColor: '#FEE2E2',
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 6,
                              }}
                            >
                              <Ionicons name="close-circle-outline" size={12} color="#DC2626" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                                Kaldır
                              </Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            onPress={() => handleOpenPhotoPicker(item.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              backgroundColor: '#F1F5F9',
                              borderWidth: 1,
                              borderColor: '#CBD5E1',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}
                          >
                            <Ionicons name="images-outline" size={12} color="#334155" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>
                              Fotoğraf Değiştir
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleOpenStudentPicker(item.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              backgroundColor: '#EEF2FF',
                              borderWidth: 1,
                              borderColor: '#C7D2FE',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}
                          >
                            <Ionicons name="person-add-outline" size={12} color="#4F46E5" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                              {matched ? 'Öğrenci Değiştir' : 'Öğrenci Seç'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Alt İşlem Butonları */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' }}>
              <TouchableOpacity
                disabled={savingReviewPhotos}
                onPress={() => setPhotoReviewModalVisible(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={savingReviewPhotos || reviewPhotos.filter((p: any) => p.matchedStudent !== null).length === 0}
                onPress={handleSaveConfirmedPhotos}
                style={{
                  flex: 2,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: reviewPhotos.filter((p: any) => p.matchedStudent !== null).length === 0 ? '#94A3B8' : '#059669',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  shadowColor: '#059669',
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                {savingReviewPhotos ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Sunucuya Kaydediliyor...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={16} color="#fff" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                      Onayla ve Kaydet ({reviewPhotos.filter((p: any) => p.matchedStudent !== null).length})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={studentPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setStudentPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500, width: '90%', maxHeight: '80%', padding: 0, overflow: 'hidden' }]}>
            {/* Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                  Öğrenci Seç / Değiştir
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Fotoğrafa atamak istediğiniz öğrenciye dokunun
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setStudentPickerVisible(false)}
                style={{ padding: 4, borderRadius: 6, backgroundColor: '#E2E8F0' }}
              >
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Arama Inputu */}
            <View style={{ padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, height: 38 }}>
                <Ionicons name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 0 }}
                  placeholder="Öğrenci adı, soyadı, no veya şube..."
                  placeholderTextColor="#94A3B8"
                  value={studentPickerSearch}
                  onChangeText={setStudentPickerSearch}
                  autoFocus
                />
                {studentPickerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setStudentPickerSearch('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Öğrenci Listesi */}
            <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 8 }}>
              {filteredPickerStudents.length === 0 ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>Eşleşen öğrenci bulunamadı.</Text>
                </View>
              ) : (
                filteredPickerStudents.map((std: any, sIdx: any) => {
                  const info = getPickerStudentInfo(std);
                  return (
                    <TouchableOpacity
                      key={std.id || sIdx}
                      onPress={() => handleAssignStudentToPhoto(std)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: '#F1F5F9',
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#4F46E5' }}>
                          {info.fullName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                          {info.fullName}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                          No: <Text style={{ fontWeight: '700', color: '#334155' }}>{info.number || '-'}</Text> • Sınıf/Şube: <Text style={{ fontWeight: '700', color: '#334155' }}>{info.className || '-'}</Text>
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={photoPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPhotoPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 640, width: '95%', maxHeight: '85%', padding: 0, overflow: 'hidden' }]}>
            {/* Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="images" size={18} color="#4F46E5" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                    PDF Fotoğraf Galerisi
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Öğrenciye atamak istediğiniz fotoğrafa dokunun ({reviewPhotos.length} fotoğraf mevcut)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPhotoPickerVisible(false)}
                style={{ padding: 4, borderRadius: 6, backgroundColor: '#E2E8F0' }}
              >
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Arama Inputu */}
            <View style={{ padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, height: 36 }}>
                <Ionicons name="search" size={15} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 12, color: '#0F172A', paddingVertical: 0 }}
                  placeholder="Fotoğraf no, sayfa veya tespit edilen isim..."
                  placeholderTextColor="#94A3B8"
                  value={photoPickerSearch}
                  onChangeText={setPhotoPickerSearch}
                />
                {photoPickerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPhotoPickerSearch('')}>
                    <Ionicons name="close-circle" size={15} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Fotoğraf Galerisi Izgarası */}
            <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                {reviewPhotos
                  .filter((p: any) => {
                    if (!photoPickerSearch.trim()) return true;
                    const q = photoPickerSearch.toLowerCase().trim();
                    const no = String(p.index + 1);
                    const pg = String(p.pageNumber || '');
                    const det = String(p.detectedNumber || '').toLowerCase();
                    const detNm = String(p.detectedName || '').toLowerCase();
                    return no.includes(q) || pg.includes(q) || det.includes(q) || detNm.includes(q);
                  })
                  .map((pItem: any, pIdx: any) => (
                    <TouchableOpacity
                      key={pItem.id || pIdx}
                      activeOpacity={0.7}
                      onPress={() => handleAssignPhotoToTarget(pItem)}
                      style={{
                        width: 100,
                        backgroundColor: '#fff',
                        borderRadius: 10,
                        padding: 6,
                        borderWidth: 1.5,
                        borderColor: '#E2E8F0',
                        alignItems: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.04,
                        shadowRadius: 3,
                        elevation: 1,
                      }}
                    >
                      <Image
                        source={{ uri: pItem.tempUri }}
                        style={{
                          width: 86,
                          height: 110,
                          borderRadius: 6,
                          backgroundColor: '#E2E8F0',
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F172A', marginTop: 4 }}>
                        #{pItem.index + 1}
                      </Text>
                      {pItem.pageNumber ? (
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#6366F1' }}>
                          Sayfa {pItem.pageNumber}
                        </Text>
                      ) : null}
                      {pItem.detectedNumber ? (
                        <Text style={{ fontSize: 9, color: '#059669', fontWeight: '700' }} numberOfLines={1}>
                          No: {pItem.detectedNumber}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={singleStudentPdfModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!singleStudentPdfUploading) {
            setSingleStudentPdfModalVisible(false);
            setSingleStudentPdfTarget(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 640, width: '95%', maxHeight: '88%', padding: 0, overflow: 'hidden' }]}>
            {/* Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="document-text" size={18} color="#4F46E5" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                    PDF Albümünden Fotoğraf Seç
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Hedef: <Text style={{ fontWeight: '800', color: '#1E293B' }}>{singleStudentPdfTarget?.fullName}</Text> (No: {singleStudentPdfTarget?.studentNumber}) • Toplam {cachedPdfPhotos.length} fotoğraf
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={handlePickNewPdfForSingleStudent}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#EEF2FF',
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: '#C7D2FE',
                  }}
                >
                  <Ionicons name="folder-open-outline" size={12} color="#4F46E5" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Farklı PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={singleStudentPdfUploading}
                  onPress={() => {
                    setSingleStudentPdfModalVisible(false);
                    setSingleStudentPdfTarget(null);
                  }}
                  style={{ padding: 4, borderRadius: 6, backgroundColor: '#E2E8F0' }}
                >
                  <Ionicons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Arama Inputu */}
            <View style={{ padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, height: 36 }}>
                <Ionicons name="search" size={15} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 12, color: '#0F172A', paddingVertical: 0 }}
                  placeholder="Fotoğraf no, sayfa veya isim ara..."
                  placeholderTextColor="#94A3B8"
                  value={singleStudentPdfSearch}
                  onChangeText={setSingleStudentPdfSearch}
                />
                {singleStudentPdfSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setSingleStudentPdfSearch('')}>
                    <Ionicons name="close-circle" size={15} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Fotoğraf Izgarası */}
            <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 12 }}>
              {singleStudentPdfUploading ? (
                <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color="#4F46E5" />
                  <Text style={{ marginTop: 12, fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
                    Fotoğraf sunucuya yükleniyor...
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {cachedPdfPhotos
                    .filter((p: any) => {
                      if (!singleStudentPdfSearch.trim()) return true;
                      const q = singleStudentPdfSearch.toLowerCase().trim();
                      const no = String(p.index + 1);
                      const pg = String(p.pageNumber || '');
                      const det = String(p.detectedNumber || '').toLowerCase();
                      const detNm = String(p.detectedName || '').toLowerCase();
                      return no.includes(q) || pg.includes(q) || det.includes(q) || detNm.includes(q);
                    })
                    .map((pItem: any, pIdx: any) => (
                      <TouchableOpacity
                        key={pItem.id || pIdx}
                        activeOpacity={0.7}
                        onPress={() => handleSelectPdfPhotoForStudent(pItem)}
                        style={{
                          width: 105,
                          backgroundColor: '#fff',
                          borderRadius: 10,
                          padding: 6,
                          borderWidth: 1.5,
                          borderColor: '#E2E8F0',
                          alignItems: 'center',
                          shadowColor: '#000',
                          shadowOpacity: 0.04,
                          shadowRadius: 3,
                          elevation: 1,
                        }}
                      >
                        <Image
                          source={{ uri: pItem.tempUri }}
                          style={{
                            width: 90,
                            height: 115,
                            borderRadius: 6,
                            backgroundColor: '#E2E8F0',
                          }}
                          resizeMode="cover"
                        />
                        <View style={{ width: '100%', marginTop: 5, alignItems: 'center' }}>
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#1E293B' }} numberOfLines={1}>
                            #{pItem.index + 1} {pItem.pageNumber ? `(S.${pItem.pageNumber})` : ''}
                          </Text>
                          {pItem.detectedNumber ? (
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#4F46E5' }} numberOfLines={1}>
                              No: {pItem.detectedNumber}
                            </Text>
                          ) : null}
                          {pItem.detectedName ? (
                            <Text style={{ fontSize: 9, color: '#64748B' }} numberOfLines={1}>
                              {pItem.detectedName}
                            </Text>
                          ) : null}
                          <View
                            style={{
                              marginTop: 4,
                              backgroundColor: '#EEF2FF',
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: '#C7D2FE',
                              width: '100%',
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4F46E5' }}>Seç ve Ata</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={menuDrawerVisible} animationType="fade" transparent onRequestClose={() => setMenuDrawerVisible(false)}>
        <TouchableOpacity
          style={styles.hamburgerModalOverlay}
          activeOpacity={1}
          onPress={() => setMenuDrawerVisible(false)}
        >
          <View style={styles.hamburgerDrawerContent} onStartShouldSetResponder={() => true}>
            <View style={styles.hamburgerDrawerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hamburgerDrawerTitle}>Yönetim Menüsü</Text>
                <Text style={styles.hamburgerDrawerSubtitle} numberOfLines={1}>{selectedSchool?.name || 'Okul Paneli'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMenuDrawerVisible(false)}
                style={styles.hamburgerDrawerCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
              {/* 0. Aktif Okulu Değiştir */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setSchoolSelectModalVisible(true);
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="swap-horizontal" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Aktif Okulu Değiştir</Text>
                  <Text style={styles.hamburgerMenuSub}>{schools.length > 0 ? `${schools.length} kayıtlı okul arasında geçiş yapın` : 'Okul seçimi yapın'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 0.1 Yazılı Sınav Oturma Planı (Kelebek & Salon Dağıtımı) */}
              <TouchableOpacity
                style={[styles.hamburgerMenuItem, { backgroundColor: '#F5F3FF', borderRadius: 12, paddingVertical: 12 }]}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  if (navigation?.openExamPlanner) {
                    navigation.openExamPlanner();
                  } else if (navigation?.navigate) {
                    navigation.navigate('ExamPlanner');
                  }
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="grid" size={20} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.hamburgerMenuLabel, { color: '#6D28D9', fontWeight: '800' }]}>
                      Yazılı Oturma Planı
                    </Text>
                    <View style={{ backgroundColor: '#7C3AED', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>YENİ</Text>
                    </View>
                  </View>
                  <Text style={[styles.hamburgerMenuSub, { color: '#7C3AED' }]}>
                    Kelebek dağıtım, salon ve ders saati gözetmen planı
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#7C3AED" />
              </TouchableOpacity>

              {/* 1. Yetki & Erişim Yönetimi (Sadece Kurum Admini) */}
              {!isStaff && (
                <TouchableOpacity
                  style={styles.hamburgerMenuItem}
                  onPress={() => {
                    setMenuDrawerVisible(false);
                    setPermissionsModalVisible(true);
                  }}
                >
                  <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EDE9FE' }]}>
                    <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.hamburgerMenuLabel, { color: '#7C3AED' }]}>Yetki & Erişim Yönetimi</Text>
                    <Text style={styles.hamburgerMenuSub}>İdarecilerin ve öğretmenlerin yetki ve okul atamaları</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              )}

              {/* 1.1 Okul Bilgilerini Düzenle (Sadece Kurum Admini) */}
              {!isStaff && (
                <TouchableOpacity
                  style={styles.hamburgerMenuItem}
                  onPress={() => {
                    setMenuDrawerVisible(false);
                    if (selectedSchool) {
                      handleOpenEditSchool(selectedSchool);
                    }
                  }}
                >
                  <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="pencil" size={18} color="#4F46E5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hamburgerMenuLabel}>Okul Bilgilerini Düzenle</Text>
                    <Text style={styles.hamburgerMenuSub}>Okul adı, adres ve iletişim bilgilerini güncelle</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              )}

              {/* 2. Yeni Okul Ekle (Sadece yetkili) */}
              {!isStaff && (
                <TouchableOpacity
                  style={styles.hamburgerMenuItem}
                  onPress={() => {
                    setMenuDrawerVisible(false);
                    setCreateModalVisible(true);
                  }}
                >
                  <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="add" size={18} color="#166534" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hamburgerMenuLabel}>Yeni Okul Tanımla</Text>
                    <Text style={styles.hamburgerMenuSub}>Sisteme yeni bir okul kurumu ekleyin</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              )}

              {/* 2.1 Okulu Sil (Sadece yetkili ve birden fazla okul varsa) */}
              {!isStaff && schools.length > 1 && (
                <TouchableOpacity
                  style={styles.hamburgerMenuItem}
                  onPress={() => {
                    setMenuDrawerVisible(false);
                    if (selectedSchool) {
                      handleDeleteSchool(selectedSchool);
                    }
                  }}
                >
                  <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.hamburgerMenuLabel, { color: '#DC2626' }]}>Okulu Sistemden Sil</Text>
                    <Text style={styles.hamburgerMenuSub}>{selectedSchool?.name || 'Seçili okul'} kurumunu sil</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              )}

              {/* 3. İdareci & Şifre Yönetimi */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  handleOpenAdminCredentials();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="key" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>İdareci Şifre Değiştir</Text>
                  <Text style={styles.hamburgerMenuSub}>Yönetim paneli giriş şifrenizi yenileyin</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 4. Müşteri & Lisans Bilgileri (Derine taşınan alan) */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setLicenseModalVisible(true);
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Müşteri & Lisans Detayları</Text>
                  <Text style={styles.hamburgerMenuSub}>Müşteri No, İlişki ID ve Lisans durumu</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              <View style={styles.hamburgerMenuDivider} />

              {/* Canlı Konum, Boş Ders Radarı & Nöbet */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('radar');
                  if (allSchoolSchedules.length === 0) {
                    loadAllSchedules();
                  }
                  if (dutiesList.length === 0) {
                    loadDuties();
                  }
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="compass" size={18} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Canlı Konum & Boş Ders Radarı</Text>
                  <Text style={styles.hamburgerMenuSub}>Personel nerede, şubede kim var, anlık boş dersler ve nöbetçiler</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              <View style={styles.hamburgerMenuDivider} />

              {/* 5. Denetim Logları */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('logs');
                  loadAuditLogs();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="document-text" size={18} color="#475569" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Denetim Logları</Text>
                  <Text style={styles.hamburgerMenuSub}>Kullanıcı işlem ve güvenlik kayıtları</Text>
                </View>
                {logStats.total > 0 && (
                  <View style={styles.hamburgerMenuTag}>
                    <Text style={styles.hamburgerMenuTagText}>{logStats.total}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* 6. Okul Mesajları */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('messages');
                  loadSchoolMessages();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="chatbubbles" size={18} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Okul İçi Mesajlar</Text>
                  <Text style={styles.hamburgerMenuSub}>Öğretmenlere duyuru ve bildirim iletin</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 7. Raporlar */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('reports');
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="stats-chart" size={18} color="#B45309" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Raporlar & İstatistikler</Text>
                  <Text style={styles.hamburgerMenuSub}>Yoklama ve katılım grafikleri</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 8. AI & API Ayarları */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('ai_settings');
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="hardware-chip" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>AI & API Ayarları</Text>
                  <Text style={styles.hamburgerMenuSub}>Gemini API anahtarı, model ve kota durumu</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              <View style={styles.hamburgerMenuDivider} />

              {/* 9. Rol Değiştir: Öğretmen Moduna Geç */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  handleSwitchToTeacher();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="school" size={18} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.hamburgerMenuLabel, { color: '#16A34A' }]}>Öğretmen Moduna Geç</Text>
                  <Text style={styles.hamburgerMenuSub}>Ajanda ve sınıf kokpit görünümüne geçiş yap</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 10. Çıkış Yap / Rol Seçimine Dön */}
              <TouchableOpacity
                style={[styles.hamburgerMenuItem, { marginBottom: 16 }]}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  handleLogout();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="log-out" size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.hamburgerMenuLabel, { color: '#DC2626' }]}>Oturumu Kapat / Rol Değiştir</Text>
                  <Text style={styles.hamburgerMenuSub}>Giriş ve rol seçimi ekranına dön</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={logPurgeModalVisible} animationType="fade" transparent onRequestClose={() => setLogPurgeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 460 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="trash-bin" size={22} color="#DC2626" />
                <Text style={[styles.modalTitle, { color: '#991B1B' }]}>Log Kayıtlarını Temizle</Text>
              </View>
              <TouchableOpacity onPress={() => setLogPurgeModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ marginVertical: 10 }}>
              <View style={{ backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', marginBottom: 14 }}>
                <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '700', lineHeight: 18 }}>
                  ⚠️ Veritabanı şişmesini önlemek amacıyla seçilen tarih aralığındaki log kayıtları veritabanından silinir.
                </Text>
                <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 4, lineHeight: 16 }}>
                  🛡️ Güvenlik ve denetim amacıyla tüm işlemlerin fiziksel .log metin dosyaları sunucu diskinde süresiz korunur.
                </Text>
              </View>

              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Başlangıç Tarihi (YYYY-AA-GG):</Text>
              <TextInput
                style={[styles.modalInput, { marginBottom: 12 }]}
                value={purgeStartDate}
                onChangeText={setPurgeStartDate}
                placeholder="2026-01-01"
              />

              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Bitiş Tarihi (YYYY-AA-GG):</Text>
              <TextInput
                style={[styles.modalInput, { marginBottom: 16 }]}
                value={purgeEndDate}
                onChangeText={setPurgeEndDate}
                placeholder={new Date().toISOString().split('T')[0]}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { flex: 1 }]}
                  onPress={() => setLogPurgeModalVisible(false)}
                  disabled={isPurgingLogs}
                >
                  <Text style={styles.modalCancelBtnText}>Vazgeç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, { flex: 1.3, backgroundColor: '#DC2626' }]}
                  onPress={handlePurgeLogs}
                  disabled={isPurgingLogs}
                >
                  {isPurgingLogs ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Veritabanından Temizle</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={licenseModalVisible} animationType="slide" transparent onRequestClose={() => setLicenseModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Müşteri & Lisans Bilgileri</Text>
              </View>
              <TouchableOpacity onPress={() => setLicenseModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 8 }}>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 18 }}>
                Kurumunuza ait müşteri tanımlayıcıları, kurumsal ilişki kodu ve lisans geçerlilik durumu aşağıda listelenmiştir.
              </Text>

              <View style={styles.licenseDetailCard}>
                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="finger-print" size={16} color="#4F46E5" />
                    <Text style={styles.licenseDetailLabel}>Müşteri No (Customer ID)</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.customerId || 'MST-10001'}</Text>
                </View>

                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="git-network-outline" size={16} color="#4F46E5" />
                    <Text style={styles.licenseDetailLabel}>İlişki Kimliği (Relation ID)</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.relationId || 'ILK-10001'}</Text>
                </View>

                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="school" size={16} color="#4F46E5" />
                    <Text style={styles.licenseDetailLabel}>Okul Kodu</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.code}</Text>
                </View>

                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#166534" />
                    <Text style={styles.licenseDetailLabel}>Lisans Durumu</Text>
                  </View>
                  <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534' }}>
                      {selectedSchool?.licenseExpiresAt
                        ? `1 Yıl Lisans (${new Date(selectedSchool.licenseExpiresAt).toLocaleDateString('tr-TR')})`
                        : '1 Yıl Deneme Lisansı'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.licenseDetailRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="call" size={16} color="#64748B" />
                    <Text style={styles.licenseDetailLabel}>İletişim Telefonu</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.phone || 'Belirtilmedi'}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.createSubmitButton, { marginTop: 16 }]}
                onPress={() => setLicenseModalVisible(false)}
              >
                <Text style={styles.createSubmitText}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PermissionsManagementModal
        visible={permissionsModalVisible}
        onClose={() => setPermissionsModalVisible(false)}
        onPermissionsUpdated={() => {
          loadSchools();
        }}
      />

      <Modal visible={radarClassModalVisible} animationType="slide" transparent onRequestClose={() => setRadarClassModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 520, width: '92%', maxHeight: '82%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="school" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Sınıf / Şube Seçiniz</Text>
              </View>
              <TouchableOpacity onPress={() => setRadarClassModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Arama Kutusu */}
            <View style={[styles.searchBarContainer, { marginHorizontal: 0, marginTop: 8, marginBottom: 8 }]}>
              <Ionicons name="search" size={16} color="#64748B" />
              <TextInput
                style={[styles.searchBarInput, { fontSize: 13 }]}
                placeholder="Şube ara (Örn: 9/A, 11-C, 12)..."
                placeholderTextColor="#94A3B8"
                value={radarClassSearch}
                onChangeText={setRadarClassSearch}
              />
              {radarClassSearch.length > 0 && (
                <TouchableOpacity onPress={() => setRadarClassSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Kademe Filtre Çipleri */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {[
                { id: 'all', label: 'Tümü' },
                { id: '9', label: '9. Sınıf' },
                { id: '10', label: '10. Sınıf' },
                { id: '11', label: '11. Sınıf' },
                { id: '12', label: '12. Sınıf' },
              ].map((f: any) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.reportSegmentBtn, radarClassGradeFilter === f.id && styles.reportSegmentBtnActive, { flex: 1, paddingVertical: 6 }]}
                  onPress={() => setRadarClassGradeFilter(f.id as any)}
                >
                  <Text style={[styles.reportSegmentText, radarClassGradeFilter === f.id && styles.reportSegmentTextActive, { fontSize: 11 }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Şube Kartları Listesi */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {(() => {
                const query = radarClassSearch.trim().toLowerCase();
                const filtered = classes.filter((c: any) => {
                  const cName = `${c.grade || ''}/${c.section || c.name || ''}`.trim();
                  const matchesSearch = !query || cName.toLowerCase().includes(query) || (c.name || '').toLowerCase().includes(query);
                  const matchesGrade = radarClassGradeFilter === 'all' || String(c.grade) === radarClassGradeFilter;
                  return matchesSearch && matchesGrade;
                });

                if (filtered.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                      <Ionicons name="search-outline" size={32} color="#94A3B8" />
                      <Text style={{ fontSize: 13, color: '#64748B', marginTop: 8 }}>Eşleşen şube bulunamadı.</Text>
                    </View>
                  );
                }

                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {filtered.map((c: any) => {
                      const cName = c.name || `${c.grade}/${c.section}`;
                      const isSelected = (radarClass || '').trim().toLowerCase() === cName.trim().toLowerCase();
                      return (
                        <TouchableOpacity
                          key={c.id || cName}
                          style={{
                            width: '31%',
                            backgroundColor: isSelected ? '#4F46E5' : '#F8FAFC',
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 8,
                            alignItems: 'center',
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#4338CA' : '#E2E8F0',
                          }}
                          onPress={() => {
                            setRadarClass(cName);
                            setRadarClassModalVisible(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={isSelected ? "checkmark-circle" : "school-outline"} size={16} color={isSelected ? "#fff" : "#4F46E5"} />
                          <Text style={{ fontSize: 14, fontWeight: '800', color: isSelected ? '#fff' : '#1E293B', marginTop: 4 }}>
                            {cName}
                          </Text>
                          {c.studentCount ? (
                            <Text style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.8)' : '#64748B', marginTop: 2 }}>
                              {c.studentCount} Öğrenci
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={dutyPlacesModalVisible} animationType="slide" transparent onRequestClose={() => setDutyPlacesModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 540, width: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="location" size={22} color="#7C3AED" />
                <Text style={styles.modalTitle}>Okul Nöbet Alanları</Text>
              </View>
              <TouchableOpacity onPress={() => setDutyPlacesModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, gap: 14 }}>
              {/* Bilgilendirme Kutusu */}
              <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD6FE' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="information-circle" size={18} color="#7C3AED" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#5B21B6' }}>Nöbet Alanları Nasıl Belirlenir?</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#4C1D95', lineHeight: 18 }}>
                  • <Text style={{ fontWeight: '700' }}>Excel Şablonu Üzerinden:</Text> "Şablon İndir" butonuyla indireceğiniz Excel'deki "Haftalık Nöbet Çizelgesi" tablosunda en sol sütuna okulunuzun nöbet yerlerini (örn: Bahçe, Kantin, 1. Kat vb.) satır satır yazabilirsiniz. Excel'i yüklediğinizde sistem bu alanları ve öğretmenleri birebir otomatik olarak algılar.{"\n\n"}
                  • <Text style={{ fontWeight: '700' }}>Uygulama İçinden:</Text> Aşağıdaki hazır alanları kullanabilir veya "Yeni Alan Ekle" bölümünden okulunuza özel nöbet yeri tanımlayabilirsiniz.
                </Text>
              </View>

              {/* Yeni Alan Ekleme */}
              <View>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1E293B', marginBottom: 6 }}>Yeni Nöbet Alanı Tanımla:</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Örn: Pansiyon, Doğu Merdivenleri, Spor Salonu..."
                    placeholderTextColor="#94A3B8"
                    value={newCustomPlaceInput}
                    onChangeText={setNewCustomPlaceInput}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => {
                      if (newCustomPlaceInput.trim()) {
                        const val = newCustomPlaceInput.trim();
                        if (!customDutyPlaces.includes(val)) {
                          setCustomDutyPlaces((prev: any) => [...prev, val]);
                        }
                        setNewCustomPlaceInput('');
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tanımlı Alanlar */}
              <View>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>
                  Mevcut Nöbet Alanları ({allKnownDutyPlaces.length}):
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {allKnownDutyPlaces.map((p: any, idx: any) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Ionicons name="pin" size={13} color="#7C3AED" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155' }}>{p}</Text>
                      {customDutyPlaces.includes(p) && (
                        <TouchableOpacity
                          onPress={() => setCustomDutyPlaces((prev: any) => prev.filter((x: any) => x !== p))}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle" size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSubmitButton, { marginTop: 12, backgroundColor: '#7C3AED' }]}
              onPress={() => setDutyPlacesModalVisible(false)}
            >
              <Text style={styles.createSubmitText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={classFilterModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setClassFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setClassFilterModalVisible(false)}
        >
          <View style={[styles.modalContent, { maxHeight: '80%', width: Platform.OS === 'web' ? 450 : '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="school" size={20} color="#4F46E5" />
                <Text style={styles.modalTitle}>Şube / Sınıf Seçiniz</Text>
              </View>
              <TouchableOpacity onPress={() => setClassFilterModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={true}>
              <TouchableOpacity
                style={[
                  styles.classFilterModalItem,
                  selectedClassFilter === 'all' && styles.classFilterModalItemSelected,
                ]}
                onPress={() => {
                  setSelectedClassFilter('all');
                  setClassFilterModalVisible(false);
                }}
              >
                <Ionicons
                  name={selectedClassFilter === 'all' ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={selectedClassFilter === 'all' ? '#4F46E5' : '#94A3B8'}
                />
                <Text
                  style={[
                    styles.classFilterModalItemText,
                    selectedClassFilter === 'all' && styles.classFilterModalItemTextSelected,
                  ]}
                >
                  🏫 Tüm Sınıflar ve Şubeler ({students.length} Kayıtlı Öğrenci)
                </Text>
              </TouchableOpacity>

              {classes.map((c: any) => {
                const tag = c.className || `${c.grade}-${c.section}`;
                const isSel = selectedClassFilter === tag;
                const count = students.filter(
                  (s: any) =>
                    `${s.grade}-${s.section}` === tag ||
                    s.className === tag ||
                    (String(s.grade) === String(c.grade) && String(s.section).toUpperCase() === String(c.section).toUpperCase())
                ).length;

                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.classFilterModalItem,
                      isSel && styles.classFilterModalItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedClassFilter(tag);
                      setClassFilterModalVisible(false);
                    }}
                  >
                    <Ionicons
                      name={isSel ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={isSel ? '#4F46E5' : '#94A3B8'}
                    />
                    <Text
                      style={[
                        styles.classFilterModalItemText,
                        isSel && styles.classFilterModalItemTextSelected,
                      ]}
                    >
                      📚 {tag} Şubesi ({count} Öğrenci)
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
