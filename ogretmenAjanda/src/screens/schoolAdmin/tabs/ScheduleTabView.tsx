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
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function ScheduleTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    cachedScheduleDraft,
    setParsedSchedule,
    setAiModalVisible,
    selectedSchool,
    setCachedScheduleDraft,
    cachedScheduleDoc,
    setPendingScheduleFile,
    setPdfTotalPages,
    setPdfPageRangeMode,
    setPdfStartPage,
    setPdfEndPage,
    setSchedulePreOptionsModalVisible,
    handlePickAndAnalyzeSchedule,
    scheduleBatches,
    setBatchPoolModalVisible,
    handleLoadActiveScheduleToDraft,
    setScheduleResetModalVisible,
    loadScheduleStats,
    loadAllSchedules,
    loadingScheduleStats,
    classes,
    scheduleStats,
    teachers,
    handleOpenEditSchool,
    scheduleDailyHours,
    allSchoolSchedules,
    handleChangeDailyHours,
    conflictSearchQuery,
    setConflictSearchQuery,
    setScheduleSubView,
    setScheduleEditorMode,
    setSelectedClassForEditor,
    setSelectedTeacherForEditor,
    selectedClassForEditor,
    scheduleSubView,
    scheduleEditorMode,
    handleClearCurrentClassSchedule,
    handleClearCurrentTeacherSchedule,
    currentActiveTeacher,
    getTeacherTotalHours,
    handleSelectPrevTeacher,
    handleSelectNextTeacher,
    teacherListBoxSearch,
    setTeacherListBoxSearch,
    filteredTeachersForListBox,
    selectedTeacherForEditor,
    normalizeTeacherMatch,
    handleOpenSlotModal,
    analyticsSearchQuery,
    setAnalyticsSearchQuery,
    analyticsFilterType,
    setAnalyticsFilterType,
    filteredTeacherWorkloads,
    filteredClassFullness,
    filteredCourseAllocations
  } = ctx;

  return (
    <View>
                {/* 0.1 KAYDEDİLMEMİŞ SON ÇARŞAF ANALİZİ TASLAĞI (VARSA) */}
                {cachedScheduleDraft && (
                  <View style={{
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1.5,
                    borderColor: '#86EFAC',
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Ionicons name="document-text" size={18} color="#16A34A" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#166534' }}>
                          💾 Kaydedilmemiş Son Çarşaf Analizi
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#15803D' }}>
                        {(cachedScheduleDraft.teachers || []).length} Öğretmen, {(cachedScheduleDraft.scheduleItems || []).length} Ders Saati hafızada hazır.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setParsedSchedule(cachedScheduleDraft);
                          setAiModalVisible(true);
                        }}
                        style={{
                          backgroundColor: '#16A34A',
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Taslağı Aç ➔</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          if (selectedSchool) await clearParsedScheduleDraft(selectedSchool.id);
                          setCachedScheduleDraft(null);
                        }}
                        style={{
                          backgroundColor: '#FEE2E2',
                          paddingHorizontal: 8,
                          paddingVertical: 7,
                          borderRadius: 8,
                        }}
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 0.2 SON YÜKLENEN BELGE İLE HIZLI TEKRAR TARA (VARSA) */}
                {cachedScheduleDoc && (
                  <TouchableOpacity
                    onPress={() => {
                      setPendingScheduleFile({
                        name: cachedScheduleDoc.name,
                        uri: cachedScheduleDoc.uri,
                        mimeType: cachedScheduleDoc.mimeType,
                        size: cachedScheduleDoc.size,
                      });
                      setPdfTotalPages(cachedScheduleDoc.totalPages || 0);
                      setPdfPageRangeMode('all');
                      setPdfStartPage('1');
                      setPdfEndPage(String(cachedScheduleDoc.totalPages || 1));
                      setSchedulePreOptionsModalVisible(true);
                    }}
                    style={{
                      backgroundColor: '#EEF2FF',
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="document-attach" size={20} color="#4F46E5" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#312E81' }} numberOfLines={1}>
                          📄 Son Belge: {cachedScheduleDoc.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#6366F1' }}>
                          {cachedScheduleDoc.totalPages ? `${cachedScheduleDoc.totalPages} Sayfa • ` : ''}Dosya seçmeden hızlıca tekrar tara
                        </Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#4F46E5', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Hızlı Tara ➔</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* 1. ÇARŞAF PROGRAM YÜKLEME SEÇENEKLERİ (PDF & EXCEL) */}
                <View style={{ marginBottom: 12, gap: 10 }}>
                  {/* A) AI ile PDF / Fotoğraf Yükleme Butonu */}
                  <TouchableOpacity
                    style={[styles.aiBanner, { marginBottom: 0 }]}
                    onPress={() => handlePickAndAnalyzeSchedule('pdf')}
                  >
                    <View style={styles.aiBannerIcon}>
                      <Ionicons name="sparkles" size={26} color="#fff" />
                    </View>
                    <View style={styles.aiBannerTextContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.aiBannerTitle}>PDF / Fotoğraf ile Çarşaf Yükle</Text>
                        <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#4F46E5' }}>AI OCR</Text>
                        </View>
                      </View>
                      <Text style={styles.aiBannerDesc}>
                        PDF veya fotoğraf çarşafını yükleyin; öğretmenler, sınıflar ve dersler yapay zeka ile otomatik taranıp kurulsun.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                  </TouchableOpacity>

                  {/* B) Excel (.xlsx, .xls) ile Çarşaf Yükleme Butonu */}
                  <TouchableOpacity
                    style={[
                      styles.aiBanner,
                      {
                        marginBottom: 0,
                        borderColor: '#A7F3D0',
                        backgroundColor: '#F0FDF4',
                      },
                    ]}
                    onPress={() => handlePickAndAnalyzeSchedule('excel')}
                  >
                    <View style={[styles.aiBannerIcon, { backgroundColor: '#10B981' }]}>
                      <Ionicons name="grid" size={24} color="#fff" />
                    </View>
                    <View style={styles.aiBannerTextContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.aiBannerTitle, { color: '#065F46' }]}>Excel Tablosu (.xlsx) ile Çarşaf Yükle</Text>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669' }}>YENİ</Text>
                        </View>
                      </View>
                      <Text style={[styles.aiBannerDesc, { color: '#047857' }]}>
                        Excel çarşaf tablonuzu yükleyin; sayfaları ve satırları inceleyip doğrudan taslak programa dönüştürün.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#10B981" />
                  </TouchableOpacity>
                </View>

                {/* 1.1 ÇARŞAF PARÇA HAVUZU BANNERI */}
                <TouchableOpacity
                  style={[
                    styles.batchPoolBanner,
                    scheduleBatches.length > 0 && styles.batchPoolBannerActive,
                  ]}
                  onPress={() => setBatchPoolModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.batchPoolIcon, scheduleBatches.length > 0 && { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons
                      name="file-tray-full"
                      size={22}
                      color={scheduleBatches.length > 0 ? '#16A34A' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.batchPoolTitle}>Çarşaf Parça Havuzu & Yeniden Yerleştir</Text>
                      <View style={[styles.batchPoolCountBadge, scheduleBatches.length > 0 && { backgroundColor: '#16A34A' }]}>
                        <Text style={styles.batchPoolCountBadgeText}>{scheduleBatches.length} Parça</Text>
                      </View>
                    </View>
                    <Text style={styles.batchPoolDesc}>
                      {scheduleBatches.length > 0
                        ? `${scheduleBatches.length} parça depolandı. PDF okumaya gerek kalmadan tek tıkla birleştirip sıfırdan kurun.`
                        : 'Büyük PDF’leri 2 veya daha fazla parça halinde yükleyip burada biriktirebilirsiniz.'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>

                {/* 1.2 AKTİF PROGRAMI İNCELEME & DÜZENLEME TASLAĞINA AL */}
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={handleLoadActiveScheduleToDraft}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{ backgroundColor: '#EEF2FF', padding: 10, borderRadius: 12 }}>
                      <Ionicons name="clipboard" size={22} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                        📋 Kayıtlı Programı Taslak Olarak Aç & Canlı Düzenle
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        Sistemdeki tüm kayıtlı programı görsel inceleme ekranına geri yükler; çakışmaları elle veya tek tek AI ile düzeltebilirsiniz.
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* 2. DOĞRULUK, DOLULUK VE SAĞLAMLIK DENETİM KARTI (Sanity Check) */}
                <View style={styles.sanityCard}>
                  <View style={styles.sanityCardHeader}>
                    <View style={styles.sanityHeaderIconBox}>
                      <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sanityCardTitle}>Program Doğruluk & Sağlamlık Denetimi</Text>
                      <Text style={styles.sanityCardSub}>
                        Çarşaf okumasında eksik şube, boş kalan saat veya çakışma olup olmadığını denetler.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.sanityResetMenuBtn}
                        onPress={() => setScheduleResetModalVisible(true)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.sanityResetMenuBtnText}>Sıfırla / Temizle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.sanityRefreshBtn}
                        onPress={() => {
                          loadScheduleStats();
                          loadAllSchedules();
                        }}
                        disabled={loadingScheduleStats}
                      >
                        {loadingScheduleStats ? (
                          <ActivityIndicator size="small" color="#4F46E5" />
                        ) : (
                          <Ionicons name="refresh" size={16} color="#4F46E5" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 4'lü Sayaç Kutusu */}
                  <View style={styles.sanityGrid}>
                    <View style={styles.sanityBox}>
                      <Text style={styles.sanityBoxVal}>{classes.length}</Text>
                      <Text style={styles.sanityBoxLbl}>Okul Şubesi</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleStats?.classesWithSchedule || 0} Şubede Ders Var
                      </Text>
                    </View>
                    <View style={styles.sanityBox}>
                      <Text style={styles.sanityBoxVal}>{teachers.length}</Text>
                      <Text style={styles.sanityBoxLbl}>Öğretmen Kadrosu</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleStats?.teachersWithSchedule || 0} Öğretmen Atandı
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.sanityBox, { borderColor: '#818CF8', backgroundColor: '#EEF2FF' }]}
                      onPress={() => handleOpenEditSchool(selectedSchool)}
                      activeOpacity={0.7}
                      accessibilityLabel="Günlük ders saatini değiştir"
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.sanityBoxVal, { color: '#4F46E5' }]}>{scheduleDailyHours}</Text>
                        <Ionicons name="pencil-sharp" size={12} color="#4F46E5" />
                      </View>
                      <Text style={[styles.sanityBoxLbl, { color: '#4338CA' }]}>Günlük Ders Saati</Text>
                      <Text style={[styles.sanityBoxSub, { color: '#6366F1' }]}>
                        {scheduleDailyHours * 5} Saat/Hafta (Değiştir)
                      </Text>
                    </TouchableOpacity>
                    <View style={[styles.sanityBox, { borderColor: (scheduleStats?.overallFillPercent || 0) >= 95 ? '#BBF7D0' : '#FED7AA' }]}>
                      <Text style={[styles.sanityBoxVal, { color: (scheduleStats?.overallFillPercent || 0) >= 95 ? '#16A34A' : '#EA580C' }]}>
                        %{scheduleStats?.overallFillPercent ?? 0}
                      </Text>
                      <Text style={styles.sanityBoxLbl}>Genel Doluluk</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleStats?.totalActualSlots || allSchoolSchedules.length} / {scheduleStats?.totalExpectedSlots || (classes.length * scheduleDailyHours * 5)} Saat
                      </Text>
                    </View>
                  </View>

                  {/* Doluluk İlerleme Çubuğu */}
                  <View style={styles.sanityProgressWrap}>
                    <View
                      style={[
                        styles.sanityProgressBar,
                        {
                          width: `${Math.min(100, Math.max(3, scheduleStats?.overallFillPercent || 0))}%`,
                          backgroundColor: (scheduleStats?.overallFillPercent || 0) >= 95 ? '#10B981' : (scheduleStats?.overallFillPercent || 0) >= 70 ? '#F59E0B' : '#EF4444',
                        },
                      ]}
                    />
                  </View>

                  {/* Hızlı Günlük Saat Ayarlayıcı */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    marginTop: 8,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="time-outline" size={16} color="#4F46E5" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                        Okul Günlük Ders Saati:
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {[6, 7, 8, 9, 10].map((h: any) => {
                        const isActive = scheduleDailyHours === h;
                        return (
                          <TouchableOpacity
                            key={h}
                            onPress={() => handleChangeDailyHours(h)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: isActive ? '#4F46E5' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: isActive ? '#4338CA' : '#CBD5E1',
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isActive ? '#FFFFFF' : '#475569' }}>
                              {h} Saat
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Çakışma Uyarıları Bölümü (Conflicts - ListBox Formatında) */}
                  {scheduleStats?.conflictsCount > 0 ? (
                    (() => {
                      const q = (conflictSearchQuery || '').trim().toLowerCase();
                      const filteredConflicts = (scheduleStats.conflicts || []).filter((c: any) => {
                        if (!q) return true;
                        return (
                          (c.description || '').toLowerCase().includes(q) ||
                          (c.className || '').toLowerCase().includes(q) ||
                          (c.teacherName || '').toLowerCase().includes(q) ||
                          (c.title || '').toLowerCase().includes(q)
                        );
                      });

                      return (
                        <View style={styles.conflictAlertBanner}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons name="warning" size={18} color="#DC2626" />
                              <Text style={styles.conflictAlertTitle}>
                                ⚠️ {scheduleStats.conflictsCount} Çakışma Tespit Edildi
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: '#B91C1C' }}>
                                {filteredConflicts.length} gösteriliyor
                              </Text>
                            </View>
                          </View>

                          {/* Hızlı Filtre / Arama Girişi */}
                          {scheduleStats.conflicts.length > 5 && (
                            <View style={styles.listboxSearchWrap}>
                              <Ionicons name="search" size={14} color="#94A3B8" style={{ marginLeft: 8 }} />
                              <TextInput
                                style={styles.listboxSearchInput}
                                placeholder="Şube veya öğretmen ara (örn: 10-A, Ahmet)..."
                                placeholderTextColor="#94A3B8"
                                value={conflictSearchQuery}
                                onChangeText={setConflictSearchQuery}
                              />
                              {!!conflictSearchQuery && (
                                <TouchableOpacity onPress={() => setConflictSearchQuery('')} style={{ padding: 6 }}>
                                  <Ionicons name="close-circle" size={15} color="#94A3B8" />
                                </TouchableOpacity>
                              )}
                            </View>
                          )}

                          {/* Kaydırılabilir Çakışma ListBox */}
                          <ScrollView
                            nestedScrollEnabled={true}
                            style={{ maxHeight: 260, marginTop: 4 }}
                            contentContainerStyle={{ gap: 6, paddingRight: 2 }}
                            showsVerticalScrollIndicator={true}
                          >
                            {filteredConflicts.length === 0 ? (
                              <View style={{ padding: 12, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600' }}>
                                  Arama kriterine uygun çakışma bulunamadı.
                                </Text>
                              </View>
                            ) : (
                              filteredConflicts.map((c: any, cIdx: number) => (
                                <TouchableOpacity
                                  key={cIdx}
                                  style={styles.conflictItemBox}
                                  activeOpacity={0.7}
                                  onPress={() => {
                                    if (c.className) {
                                      setScheduleSubView('editor');
                                      setScheduleEditorMode('class');
                                      setSelectedClassForEditor(c.className);
                                    } else if (c.teacherName) {
                                      setScheduleSubView('editor');
                                      setScheduleEditorMode('teacher');
                                      setSelectedTeacherForEditor(c.teacherName);
                                    }
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Text style={styles.conflictItemType}>
                                        {c.type === 'TEACHER_CONFLICT' ? '👨‍🏫 Öğretmen' : '🏫 Şube'}:
                                      </Text>
                                      <View style={{ backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#991B1B' }}>
                                          {c.dayOfWeek}. Gün {c.lessonHour}. Ders
                                        </Text>
                                      </View>
                                    </View>
                                    <Text style={{ fontSize: 11, color: '#4F46E5', fontWeight: '700' }}>
                                      {c.className || c.teacherName} Düzenle ➔
                                    </Text>
                                  </View>
                                  <Text style={styles.conflictItemDesc}>{c.description}</Text>
                                </TouchableOpacity>
                              ))
                            )}
                          </ScrollView>
                        </View>
                      );
                    })()
                  ) : (
                    <View style={[{ gap: 8 }] as any}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0' } as any}>
                        <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534', flex: 1 } as any}>
                          Harika! Ders saatlerinde veya öğretmen çizelgelerinde hiçbir çakışma bulunmuyor.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Şube Bazlı Doluluk Durumları */}
                  {scheduleStats?.classFullness && scheduleStats.classFullness.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.classFullnessHeaderLabel}>Şube Bazlı Doluluk Durumları</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classFullnessScroll}>
                        {scheduleStats.classFullness.map((cf: any, idx: number) => {
                          const isFull = cf.isFullyFilled;
                          const isSelected = selectedClassForEditor === cf.className;
                          return (
                            <TouchableOpacity
                              key={idx}
                              style={[
                                styles.classFullnessBadge,
                                isFull ? styles.classFullnessBadgeFull : styles.classFullnessBadgeMissing,
                                isSelected && styles.classFullnessBadgeSelected,
                              ]}
                              onPress={() => {
                                setScheduleEditorMode('class');
                                setSelectedClassForEditor(cf.className);
                              }}
                            >
                              <Text style={[styles.classFullnessBadgeText, isFull ? { color: '#166534' } : { color: '#9A3412' }]}>
                                {cf.className}: {cf.filledCount}/{cf.expectedCount} Saat
                              </Text>
                              <Text style={[styles.classFullnessBadgeSub, isFull ? { color: '#15803D' } : { color: '#C2410C' }]}>
                                {isFull ? '✅ %100 Dolu' : `⚠️ ${cf.missingCount} Saat Boş`}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* 3. GÖRÜNÜM GEÇİŞ SEKMESİ (Canlı Düzenleyici vs İstatistik & Dağılım) */}
                <View style={styles.scheduleSubTabSegment}>
                  <TouchableOpacity
                    style={[styles.scheduleSubTabBtn, scheduleSubView === 'editor' && styles.scheduleSubTabBtnActive]}
                    onPress={() => setScheduleSubView('editor')}
                  >
                    <Ionicons name="create-outline" size={16} color={scheduleSubView === 'editor' ? '#FFFFFF' : '#4F46E5'} />
                    <Text style={[styles.scheduleSubTabBtnText, scheduleSubView === 'editor' && styles.scheduleSubTabBtnTextActive]}>
                      ✏️ Canlı Program Düzenleyici
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.scheduleSubTabBtn, scheduleSubView === 'analytics' && styles.scheduleSubTabBtnActive]}
                    onPress={() => {
                      setScheduleSubView('analytics');
                      if (!scheduleStats?.teacherWorkloads) {
                        loadScheduleStats();
                      }
                    }}
                  >
                    <Ionicons name="stats-chart" size={16} color={scheduleSubView === 'analytics' ? '#FFFFFF' : '#4F46E5'} />
                    <Text style={[styles.scheduleSubTabBtnText, scheduleSubView === 'analytics' && styles.scheduleSubTabBtnTextActive]}>
                      📊 Detaylı Dağılım & İstatistikler
                    </Text>
                  </TouchableOpacity>
                </View>

                {scheduleSubView === 'editor' && (
                  <View style={styles.interactiveEditorCard}>
                    <View style={styles.interactiveHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.interactiveTitle}>✏️ Canlı Ders Programı Düzenleyici</Text>
                        <Text style={styles.interactiveSub}>
                          Hatalı saatlere dokunarak anında ders atayın, öğretmeni değiştirin veya boşaltın.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editorClearScopeBtn}
                        onPress={() => {
                          if (scheduleEditorMode === 'class') {
                            handleClearCurrentClassSchedule();
                          } else {
                            handleClearCurrentTeacherSchedule();
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.editorClearScopeBtnText}>
                          {scheduleEditorMode === 'class' ? 'Bu Şubeyi Boşalt' : 'Bu Öğretmeni Boşalt'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Mod Seçici (Şube vs Öğretmen) */}
                    <View style={styles.editorModeSegment}>
                      <TouchableOpacity
                        style={[styles.editorModeBtn, scheduleEditorMode === 'class' && styles.editorModeBtnActive]}
                        onPress={() => setScheduleEditorMode('class')}
                      >
                        <Ionicons name="school" size={14} color={scheduleEditorMode === 'class' ? '#4F46E5' : '#64748B'} />
                        <Text style={[styles.editorModeBtnText, scheduleEditorMode === 'class' && styles.editorModeBtnTextActive]}>
                          🏫 Şube Programı
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.editorModeBtn, scheduleEditorMode === 'teacher' && styles.editorModeBtnActive]}
                        onPress={() => setScheduleEditorMode('teacher')}
                      >
                        <Ionicons name="person" size={14} color={scheduleEditorMode === 'teacher' ? '#4F46E5' : '#64748B'} />
                        <Text style={[styles.editorModeBtnText, scheduleEditorMode === 'teacher' && styles.editorModeBtnTextActive]}>
                          👨‍🏫 Öğretmen Programı
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Şube veya Öğretmen Seçici Çipler */}
                    {scheduleEditorMode === 'class' ? (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.editorSelectorLabel}>Düzenlenecek Şubeyi Seçin:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorChipsScroll}>
                          {classes.map((cls: any) => {
                            const clsName = `${cls.grade}-${cls.section}`;
                            const isSel = (selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : '')) === clsName;
                            return (
                              <TouchableOpacity
                                key={cls.id}
                                style={[styles.editorChip, isSel && styles.editorChipActive]}
                                onPress={() => setSelectedClassForEditor(clsName)}
                              >
                                <Text style={[styles.editorChipText, isSel && styles.editorChipTextActive]}>
                                  {clsName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : (
                      <View style={styles.editorTeacherListBoxWrap}>
                        {/* Üst Başlık & Aktif Öğretmen Özeti */}
                        <View style={styles.editorTeacherHeaderRow}>
                          <View style={{ flex: 1, minWidth: 200 }}>
                            <Text style={styles.editorSelectorLabel}>Düzenlenecek Öğretmen (Listbox):</Text>
                            {currentActiveTeacher && (
                              <View style={styles.editorActiveTeacherBanner}>
                                <View style={styles.editorActiveTeacherAvatar}>
                                  <Ionicons name="person" size={16} color="#4F46E5" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={styles.editorActiveTeacherName}>
                                      {currentActiveTeacher.fullName}
                                    </Text>
                                    {currentActiveTeacher.branch && (
                                      <View style={styles.editorTeacherBranchBadge}>
                                        <Text style={styles.editorTeacherBranchBadgeText}>
                                          {currentActiveTeacher.branch}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.editorActiveTeacherMeta}>
                                    Haftalık Ders Yükü: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{getTeacherTotalHours(currentActiveTeacher.fullName)} Saat</Text>
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>

                          {/* Hızlı Önceki / Sonraki Butonları */}
                          <View style={styles.editorTeacherNavButtons}>
                            <TouchableOpacity
                              style={styles.editorTeacherNavBtn}
                              onPress={handleSelectPrevTeacher}
                              accessibilityLabel="Önceki Öğretmen"
                            >
                              <Ionicons name="chevron-back" size={16} color="#4F46E5" />
                              <Text style={styles.editorTeacherNavBtnText}>Önceki</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.editorTeacherNavBtn}
                              onPress={handleSelectNextTeacher}
                              accessibilityLabel="Sonraki Öğretmen"
                            >
                              <Text style={styles.editorTeacherNavBtnText}>Sonraki</Text>
                              <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Arama ve Dikey Listbox */}
                        <View style={styles.editorListBoxContainer}>
                          {/* Arama Çubuğu */}
                          <View style={styles.editorListBoxSearchRow}>
                            <Ionicons name="search" size={16} color="#64748B" style={{ marginLeft: 8 }} />
                            <TextInput
                              style={styles.editorListBoxSearchInput}
                              placeholder="Öğretmen veya branş ara... (örn: Matematik, Ayşe)"
                              placeholderTextColor="#94A3B8"
                              value={teacherListBoxSearch}
                              onChangeText={setTeacherListBoxSearch}
                            />
                            {teacherListBoxSearch.length > 0 && (
                              <TouchableOpacity
                                onPress={() => setTeacherListBoxSearch('')}
                                style={{ padding: 6, marginRight: 4 }}
                              >
                                <Ionicons name="close-circle" size={16} color="#94A3B8" />
                              </TouchableOpacity>
                            )}
                            <View style={styles.editorListBoxCountBadge}>
                              <Text style={styles.editorListBoxCountBadgeText}>
                                {filteredTeachersForListBox.length} / {teachers.length}
                              </Text>
                            </View>
                          </View>

                          {/* Dikey Kaydırılabilir Öğretmen Listbox */}
                          <ScrollView
                            nestedScrollEnabled={true}
                            style={styles.editorListBoxScrollView}
                            contentContainerStyle={styles.editorListBoxScrollContent}
                            showsVerticalScrollIndicator={true}
                          >
                            {filteredTeachersForListBox.length === 0 ? (
                              <View style={styles.editorListBoxEmptyWrap}>
                                <Ionicons name="search-outline" size={24} color="#94A3B8" />
                                <Text style={styles.editorListBoxEmptyText}>
                                  "{teacherListBoxSearch}" aramasına uygun öğretmen bulunamadı.
                                </Text>
                              </View>
                            ) : (
                              filteredTeachersForListBox.map((tch: any, idx: number) => {
                                const isSel = (currentActiveTeacher?.fullName || '') === tch.fullName;
                                const tchHours = getTeacherTotalHours(tch.fullName);

                                return (
                                  <TouchableOpacity
                                    key={tch.id || tch.fullName || idx}
                                    style={[
                                      styles.editorListBoxItem,
                                      isSel && styles.editorListBoxItemActive,
                                    ]}
                                    onPress={() => setSelectedTeacherForEditor(tch.fullName)}
                                    activeOpacity={0.7}
                                  >
                                    {/* Sol: İkon & İsim */}
                                    <View style={styles.editorListBoxItemLeft}>
                                      <View
                                        style={[
                                          styles.editorListBoxItemIcon,
                                          isSel && styles.editorListBoxItemIconActive,
                                        ]}
                                      >
                                        <Ionicons
                                          name="person"
                                          size={13}
                                          color={isSel ? '#FFFFFF' : '#64748B'}
                                        />
                                      </View>
                                      <View style={{ flex: 1 }}>
                                        <Text
                                          style={[
                                            styles.editorListBoxItemName,
                                            isSel && styles.editorListBoxItemNameActive,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {tch.fullName}
                                        </Text>
                                        {tch.branch && (
                                          <Text
                                            style={[
                                              styles.editorListBoxItemBranch,
                                              isSel && styles.editorListBoxItemBranchActive,
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {tch.branch}
                                          </Text>
                                        )}
                                      </View>
                                    </View>

                                    {/* Sağ: Ders Saati & Seçim Durumu */}
                                    <View style={styles.editorListBoxItemRight}>
                                      <View
                                        style={[
                                          styles.editorListBoxHourBadge,
                                          isSel && styles.editorListBoxHourBadgeActive,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.editorListBoxHourBadgeText,
                                            isSel && styles.editorListBoxHourBadgeTextActive,
                                          ]}
                                        >
                                          {tchHours}s
                                        </Text>
                                      </View>
                                      <Ionicons
                                        name={isSel ? 'radio-button-on' : 'radio-button-off'}
                                        size={18}
                                        color={isSel ? '#4F46E5' : '#CBD5E1'}
                                      />
                                    </View>
                                  </TouchableOpacity>
                                );
                              })
                            )}
                          </ScrollView>
                        </View>
                      </View>
                    )}

                    {/* 5 Günlük Haftalık Çizelge Matrisi */}
                    <View style={styles.timetableWrap}>
                      {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map((dayName: any, dIdx: any) => {
                        const dayNumber = dIdx + 1;
                        const activeClass = selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : '9-A');
                        const activeTeacher = selectedTeacherForEditor || (teachers[0] ? teachers[0].fullName : '');

                        return (
                          <View key={dayName} style={styles.timetableDayBox}>
                            <View style={styles.timetableDayHeader}>
                              <Text style={styles.timetableDayTitle}>{dayName}</Text>
                            </View>

                            <View style={styles.timetableHoursGrid}>
                              {Array.from({ length: scheduleDailyHours }, (_: any, hIdx: any) => {
                                const lessonHour = hIdx + 1;

                                // İlgili hücreyi allSchoolSchedules içinden bul
                                let matchedItems: any[] = [];
                                if (scheduleEditorMode === 'class') {
                                  const [g, sec] = activeClass.split('-');
                                  matchedItems = allSchoolSchedules.filter(
                                    (s: any) =>
                                      String(s.grade) === String(g) &&
                                      (s.section || '').trim().toUpperCase() === (sec || '').trim().toUpperCase() &&
                                      s.dayOfWeek === dayNumber &&
                                      s.lessonHour === lessonHour
                                  );
                                } else {
                                  matchedItems = allSchoolSchedules.filter(
                                    (s: any) =>
                                      normalizeTeacherMatch(s.teacherName, activeTeacher) &&
                                      s.dayOfWeek === dayNumber &&
                                      s.lessonHour === lessonHour
                                  );
                                }

                                const matchedItem = matchedItems[0] || null;
                                const hasConflict = matchedItems.length > 1;
                                const isFilled = !!matchedItem && !!matchedItem.lessonName;

                                return (
                                  <TouchableOpacity
                                    key={lessonHour}
                                    style={[
                                      styles.slotCell,
                                      isFilled ? styles.slotCellFilled : styles.slotCellEmpty,
                                      hasConflict && { borderColor: '#EF4444', borderWidth: 1.5, backgroundColor: '#FEF2F2' },
                                    ]}
                                    onPress={() => {
                                      if (scheduleEditorMode === 'class') {
                                        const [g, sec] = activeClass.split('-');
                                        handleOpenSlotModal({
                                          dayOfWeek: dayNumber,
                                          lessonHour,
                                          grade: g,
                                          section: sec,
                                          existingItem: matchedItem,
                                          conflictingItems: matchedItems,
                                        });
                                      } else {
                                        handleOpenSlotModal({
                                          dayOfWeek: dayNumber,
                                          lessonHour,
                                          teacherName: activeTeacher,
                                          existingItem: matchedItem,
                                          conflictingItems: matchedItems,
                                        });
                                      }
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <View style={styles.slotCellTop}>
                                      <View style={[styles.slotHourBadge, isFilled && styles.slotHourBadgeFilled, hasConflict && { backgroundColor: '#FEE2E2' }]}>
                                        <Text style={[styles.slotHourText, isFilled && styles.slotHourTextFilled, hasConflict && { color: '#DC2626' }]}>
                                          {lessonHour}. Ders
                                        </Text>
                                      </View>
                                      {hasConflict ? (
                                        <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>⚠️ Çakışma</Text>
                                        </View>
                                      ) : (
                                        <Ionicons
                                          name={isFilled ? 'pencil' : 'add-circle-outline'}
                                          size={12}
                                          color={isFilled ? '#4F46E5' : '#94A3B8'}
                                        />
                                      )}
                                    </View>

                                    {isFilled ? (
                                      <View style={styles.slotContentBox}>
                                        <Text style={[styles.slotLessonTitle, hasConflict && { color: '#B91C1C' }]} numberOfLines={1}>
                                          {matchedItem.lessonName}{matchedItem.lessonCode ? ` (${matchedItem.lessonCode})` : ''}
                                        </Text>
                                        <Text style={styles.slotSubDetail} numberOfLines={1}>
                                          {scheduleEditorMode === 'class'
                                            ? (matchedItem.teacherName || 'Öğretmen Atanmadı')
                                            : `${matchedItem.grade}-${matchedItem.section}`}
                                        </Text>
                                        {hasConflict && (
                                          <Text style={{ fontSize: 9, color: '#DC2626', fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                                            +{matchedItems.length - 1} çakışan ders!
                                          </Text>
                                        )}
                                        {!!matchedItem.classroom && !hasConflict && (
                                          <Text style={styles.slotRoomText} numberOfLines={1}>
                                            📍 {matchedItem.classroom}
                                          </Text>
                                        )}
                                      </View>
                                    ) : (
                                      <View style={styles.slotEmptyBox}>
                                        <Text style={styles.slotEmptyText}>+ Ders Ata</Text>
                                      </View>
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* 4. DETAYLI DERS & ÖĞRETMEN DAĞILIMI VE İSTATİSTİK ANALİZ GÖRÜNÜMÜ */}
                {scheduleSubView === 'analytics' && (
                  <View style={styles.interactiveEditorCard}>
                    {/* Başlık ve Yenile */}
                    <View style={styles.interactiveHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.interactiveTitle}>📊 Haftalık Ders Dağılımı & Öğretmen İstatistikleri</Text>
                        <Text style={styles.interactiveSub}>
                          Tüm şubelerin ders doluluklarını, öğretmenlerin haftalık toplam ders saatlerini ve ders dağılım matrisini inceleyin.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.sanityRefreshBtn}
                        onPress={() => loadScheduleStats()}
                        disabled={loadingScheduleStats}
                      >
                        {loadingScheduleStats ? (
                          <ActivityIndicator size="small" color="#4F46E5" />
                        ) : (
                          <Ionicons name="refresh" size={16} color="#4F46E5" />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Arama Kutusu */}
                    <View style={styles.analyticsSearchWrap}>
                      <Ionicons name="search" size={18} color="#94A3B8" />
                      <TextInput
                        style={styles.analyticsSearchInput}
                        placeholder="Öğretmen, ders veya şube ara (örn: Matematik, 9-A, Ahmet)..."
                        placeholderTextColor="#94A3B8"
                        value={analyticsSearchQuery}
                        onChangeText={setAnalyticsSearchQuery}
                      />
                      {analyticsSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setAnalyticsSearchQuery('')}>
                          <Ionicons name="close-circle" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Filtre Butonları */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsFilterScroll}>
                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'all' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('all')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'all' && styles.analyticsFilterBtnTextActive]}>
                          Tümü ({scheduleStats?.totalActualSlots || allSchoolSchedules.length} Saat)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'teachers' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('teachers')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'teachers' && styles.analyticsFilterBtnTextActive]}>
                          👨‍🏫 Öğretmen Yükleri ({filteredTeacherWorkloads.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'missing' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('missing')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'missing' && styles.analyticsFilterBtnTextActive]}>
                          🏫 Şube Dolulukları ({filteredClassFullness.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'courses' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('courses')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'courses' && styles.analyticsFilterBtnTextActive]}>
                          📚 Ders Dağılım Matrisi ({filteredCourseAllocations.length})
                        </Text>
                      </TouchableOpacity>

                      {(scheduleStats?.conflictsCount || 0) > 0 && (
                        <TouchableOpacity
                          style={[styles.analyticsFilterBtn, analyticsFilterType === 'conflicts' && styles.analyticsFilterBtnActive, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                          onPress={() => setAnalyticsFilterType('conflicts')}
                        >
                          <Text style={[styles.analyticsFilterBtnText, { color: '#DC2626', fontWeight: 'bold' }]}>
                            ⚠️ Çakışmalar ({scheduleStats?.conflictsCount})
                          </Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>

                    {/* 1. ÇAKIŞMA DETAYLARI (Eğer Varsa) */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'conflicts') && scheduleStats?.conflictsCount > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.analyticsSectionLabel}>⚠️ Tespit Edilen Çakışmalar ({scheduleStats.conflictsCount})</Text>
                        <ScrollView
                          nestedScrollEnabled={true}
                          style={{ maxHeight: 280, marginTop: 6 }}
                          contentContainerStyle={{ gap: 8, paddingRight: 2 }}
                          showsVerticalScrollIndicator={true}
                        >
                          {scheduleStats.conflicts
                            .filter((c: any) => {
                              if (!analyticsSearchQuery) return true;
                              const q = analyticsSearchQuery.toLowerCase();
                              return (
                                (c.description || '').toLowerCase().includes(q) ||
                                (c.title || '').toLowerCase().includes(q) ||
                                (c.className || '').toLowerCase().includes(q) ||
                                (c.teacherName || '').toLowerCase().includes(q)
                              );
                            })
                            .map((c: any, cIdx: number) => (
                              <View key={cIdx} style={styles.analyticsConflictCard}>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="warning" size={16} color="#DC2626" />
                                    <Text style={styles.analyticsConflictTitle}>{c.title}</Text>
                                    <Text style={styles.analyticsConflictHourBadge}>{c.dayOfWeek}. Gün {c.lessonHour}. Ders</Text>
                                  </View>
                                  <Text style={styles.analyticsConflictDesc}>{c.description}</Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.analyticsFixBtn}
                                  onPress={() => {
                                    if (c.className) {
                                      setScheduleEditorMode('class');
                                      setSelectedClassForEditor(c.className);
                                    } else if (c.teacherName) {
                                      setScheduleEditorMode('teacher');
                                      setSelectedTeacherForEditor(c.teacherName);
                                    }
                                    setScheduleSubView('editor');
                                  }}
                                >
                                  <Ionicons name="pencil" size={13} color="#FFFFFF" />
                                  <Text style={styles.analyticsFixBtnText}>Düzenle</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* 2. ÖĞRETMEN DERS YÜKLERİ (Teacher Workload) */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'teachers') && (
                      <View style={{ marginTop: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.analyticsSectionLabel}>
                            👨‍🏫 Öğretmen Haftalık Ders Saatleri ({filteredTeacherWorkloads.length})
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>Ders saatine göre sıralı</Text>
                        </View>

                        {filteredTeacherWorkloads.length === 0 ? (
                          <View style={styles.analyticsEmptyBox}>
                            <Text style={styles.analyticsEmptyText}>Eşleşen öğretmen bulunamadı.</Text>
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            {filteredTeacherWorkloads.map((t: any, idx: number) => {
                              const isHeavy = t.totalHours >= 24;
                              const isMedium = t.totalHours >= 15;
                              return (
                                <View key={idx} style={styles.teacherWorkloadCard}>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <Text style={styles.teacherWorkloadName}>{t.teacherName}</Text>
                                      <View style={[styles.teacherHoursBadge, isHeavy ? styles.hoursBadgeHigh : isMedium ? styles.hoursBadgeNormal : styles.hoursBadgeLow]}>
                                        <Text style={[styles.teacherHoursText, isHeavy ? { color: '#047857' } : isMedium ? { color: '#1D4ED8' } : { color: '#B45309' }]}>
                                          {t.totalHours} Saat/Hafta
                                        </Text>
                                      </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                      {t.classes?.map((cls: string, cIdx: number) => (
                                        <View key={cIdx} style={styles.workloadChipClass}>
                                          <Text style={styles.workloadChipClassText}>{cls}</Text>
                                        </View>
                                      ))}
                                      {t.lessons?.map((les: string, lIdx: number) => (
                                        <View key={lIdx} style={styles.workloadChipLesson}>
                                          <Text style={styles.workloadChipLessonText}>{les}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>

                                  <TouchableOpacity
                                    style={styles.analyticsGoEditorBtn}
                                    onPress={() => {
                                      setScheduleEditorMode('teacher');
                                      setSelectedTeacherForEditor(t.teacherName);
                                      setScheduleSubView('editor');
                                    }}
                                  >
                                    <Ionicons name="create-outline" size={14} color="#4F46E5" />
                                    <Text style={styles.analyticsGoEditorText}>Program</Text>
                                  </TouchableOpacity>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    )}

                    {/* 3. ŞUBELERİN DERS DOLULUKLARI */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'missing') && (
                      <View style={{ marginTop: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.analyticsSectionLabel}>
                            🏫 Şube Haftalık Ders Dolulukları ({filteredClassFullness.length})
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {filteredClassFullness.map((cf: any, idx: number) => {
                            const isFull = cf.isFullyFilled;
                            return (
                              <TouchableOpacity
                                key={idx}
                                style={[styles.classFullnessDetailCard, isFull ? styles.cardBorderGreen : styles.cardBorderOrange]}
                                onPress={() => {
                                  setScheduleEditorMode('class');
                                  setSelectedClassForEditor(cf.className);
                                  setScheduleSubView('editor');
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={styles.classFullnessCardTitle}>{cf.className}</Text>
                                  <Text style={[styles.classFullnessCardPercent, isFull ? { color: '#166534' } : { color: '#EA580C' }]}>
                                    %{cf.percent}
                                  </Text>
                                </View>
                                <Text style={styles.classFullnessCardSub}>
                                  {cf.filledCount} / {cf.expectedCount} Saat
                                </Text>
                                <Text style={[styles.classFullnessCardStatus, isFull ? { color: '#15803D' } : { color: '#C2410C' }]}>
                                  {isFull ? '✅ Tam Dolu' : `⚠️ ${cf.missingCount} Saat Boş`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* 4. DERS DAĞILIM MATRİSİ (Hangi Dersi Kim Hangi Sınıfa Kaç Saat Veriyor) */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'courses') && (
                      <View style={{ marginTop: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.analyticsSectionLabel}>
                            📚 Ders Dağılım Matrisi ({filteredCourseAllocations.length})
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>Ders - Şube - Öğretmen Eşleşmeleri</Text>
                        </View>

                        {filteredCourseAllocations.length === 0 ? (
                          <View style={styles.analyticsEmptyBox}>
                            <Text style={styles.analyticsEmptyText}>Eşleşen ders dağılımı bulunamadı.</Text>
                          </View>
                        ) : (
                          <View style={{ gap: 6 }}>
                            {filteredCourseAllocations.map((item: any, idx: number) => (
                              <View key={idx} style={styles.courseAllocRow}>
                                <View style={styles.courseAllocClassBadge}>
                                  <Text style={styles.courseAllocClassText}>{item.className}</Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                  <Text style={styles.courseAllocLessonName}>{item.lessonName}</Text>
                                  <Text style={styles.courseAllocTeacherName}>👨‍🏫 {item.teacherName}</Text>
                                </View>
                                <View style={styles.courseAllocHoursBadge}>
                                  <Text style={styles.courseAllocHoursText}>{item.hours} Saat</Text>
                                </View>
                                <TouchableOpacity
                                  style={{ padding: 6, marginLeft: 4 }}
                                  onPress={() => {
                                    setScheduleEditorMode('class');
                                    setSelectedClassForEditor(item.className);
                                    setScheduleSubView('editor');
                                  }}
                                >
                                  <Ionicons name="pencil" size={15} color="#4F46E5" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
  );
}
