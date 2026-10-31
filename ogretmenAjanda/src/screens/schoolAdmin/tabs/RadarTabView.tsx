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

export function RadarTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    radarSubTab,
    tabPressTimestampRef,
    setRadarSubTab,
    radarTeacherSearch,
    setRadarTeacherSearch,
    filteredRadarTeachers,
    radarTeacher,
    sortedTeachers,
    setRadarTeacher,
    teachers,
    normalizeTeacherMatch,
    getTeacherTotalHours,
    dutiesList,
    scheduleDailyHours,
    normalizeDayNumber,
    activeRadarTeacherScheduleMap,
    classes,
    allSchoolSchedules,
    radarClass,
    setRadarClassSearch,
    setRadarClassGradeFilter,
    setRadarClassModalVisible,
    setRadarClass,
    radarDay,
    setRadarDay,
    radarHour,
    setRadarHour,
    freeTeachersList,
    handleOpenTeacherSchedule,
    handleDownloadDutyTemplate,
    downloadingDutyTemplate,
    handlePickAndParseDutyExcel,
    importingDutyExcel,
    setDutyPlacesModalVisible,
    setAddDutyModalVisible,
    dutyFilterDay,
    setDutyFilterDay,
    loadingDuties,
    handleDeleteDuty
  } = ctx;

  return (
    <View style={styles.radarContainer}>
                {/* Radar Hero Banner */}
                <View style={styles.radarHeaderCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="compass" size={24} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B' }}>
                        Canlı Personel Konumu & Boş Ders Radarı
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        Öğretmenlerin nerede olduğunu görün, şubedeki dersi takip edin, anlık boş öğretmenleri ve nöbetçileri listeleyin.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Sub Tab Navigation */}
                <View style={styles.radarSubTabsRow}>
                  {[
                    { id: 'teacher', label: '👤 Öğretmen Nerede?', icon: 'person' },
                    { id: 'class', label: '🏫 Şubede Kim Var?', icon: 'school' },
                    { id: 'free_teachers', label: '⚡ Anlık Boş Ders Radarı', icon: 'flash' },
                    { id: 'duty', label: '🚨 Nöbetçi Öğretmenler', icon: 'shield-checkmark' },
                  ].map((tab: any) => (
                    <TouchableOpacity
                      key={tab.id}
                      style={[styles.radarSubTabBtn, radarSubTab === tab.id && styles.radarSubTabBtnActive]}
                      onPress={() => {
                        tabPressTimestampRef.current = Date.now();
                        setRadarSubTab(tab.id as any);
                      }}
                    >
                      <Ionicons name={tab.icon as any} size={15} color={radarSubTab === tab.id ? '#FFFFFF' : '#475569'} />
                      <Text style={[styles.radarSubTabText, radarSubTab === tab.id && styles.radarSubTabTextActive]}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* SUB-TAB 1: ÖĞRETMEN NEREDE? (PERSONEL MATRİSİ) */}
                {radarSubTab === 'teacher' && (
                  <View>
                    {/* Öğretmen Arama & Seçim */}
                    <View style={styles.radarGridCard}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 }}>
                        Öğretmen Seçiniz / Arayınız:
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
                        <Ionicons name="search" size={16} color="#64748B" />
                        <TextInput
                          style={{ flex: 1, marginLeft: 8, fontSize: 13, color: '#0F172A' }}
                          placeholder="Öğretmen adı veya branş yazın..."
                          placeholderTextColor="#94A3B8"
                          value={radarTeacherSearch}
                          onChangeText={setRadarTeacherSearch}
                        />
                        {radarTeacherSearch.length > 0 && (
                          <TouchableOpacity onPress={() => setRadarTeacherSearch('')}>
                            <Ionicons name="close-circle" size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Öğretmen Dikey Listbox (Listeden Seçim) */}
                      <View style={{
                        maxHeight: 180,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        overflow: 'hidden',
                      }}>
                        <ScrollView
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ padding: 4 }}
                        >
                          {filteredRadarTeachers
                            .map((t: any) => {
                              const isSel = (radarTeacher || sortedTeachers[0]?.fullName) === t.fullName;
                              return (
                                <TouchableOpacity
                                  key={t.id || t.fullName}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: 8,
                                    marginBottom: 3,
                                    backgroundColor: isSel ? '#EEF2FF' : 'transparent',
                                    borderWidth: 1,
                                    borderColor: isSel ? '#C7D2FE' : 'transparent',
                                  }}
                                  onPress={() => setRadarTeacher(t.fullName)}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <View style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: 13,
                                      backgroundColor: isSel ? '#4F46E5' : '#F1F5F9',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginRight: 9,
                                    }}>
                                      <Ionicons name="person" size={13} color={isSel ? '#FFFFFF' : '#64748B'} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{
                                        fontSize: 13,
                                        fontWeight: isSel ? '700' : '600',
                                        color: isSel ? '#312E81' : '#1E293B',
                                      }} numberOfLines={1}>
                                        {t.fullName}
                                      </Text>
                                      {t.branch ? (
                                        <Text style={{ fontSize: 11, color: isSel ? '#4F46E5' : '#64748B' }} numberOfLines={1}>
                                          {t.branch}
                                        </Text>
                                      ) : null}
                                    </View>
                                  </View>
                                  {isSel ? (
                                    <View style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 10,
                                      backgroundColor: '#4F46E5',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}>
                                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                                    </View>
                                  ) : (
                                    <View style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 9,
                                      borderWidth: 1.5,
                                      borderColor: '#CBD5E1',
                                    }} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                        </ScrollView>
                      </View>
                    </View>

                    {/* Seçilen Öğretmen Bilgi Kartı */}
                    {(() => {
                      const activeTName = radarTeacher || sortedTeachers[0]?.fullName || '';
                      const activeTObj = teachers.find((t: any) => normalizeTeacherMatch(t.fullName, activeTName));
                      const totalHours = getTeacherTotalHours(activeTName);
                      const tDuties = dutiesList.filter((d: any) => normalizeTeacherMatch(d.teacherName, activeTName));
                      const dayLabels: Record<number, string> = { 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma' };

                      return (
                        <View style={styles.radarGridCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 10, marginBottom: 12 }}>
                            <View>
                              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                                {activeTName || 'Öğretmen Seçilmedi'}
                              </Text>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>
                                Branş: {activeTObj?.branch || 'Belirtilmedi'} • Haftalık Ders: <Text style={{ fontWeight: '700', color: '#4F46E5' }}>{totalHours} Saat</Text>
                              </Text>
                            </View>
                            {tDuties.length > 0 && (
                              <View style={styles.radarDutyBadgeRed}>
                                <Ionicons name="shield-checkmark" size={14} color="#DC2626" />
                                <Text style={styles.radarDutyBadgeRedText}>
                                  NÖBET GÜNLERİ: {tDuties.map((d: any) => `${dayLabels[d.dayOfWeek] || d.dayOfWeek} (${d.dutyPlace})`).join(', ')}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* 5 Günlük Haftalık Konum / Sınıf Tablosu */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                            <View style={styles.radarTable}>
                              {/* Header: Saatler */}
                              <View style={styles.radarTableHeaderRow}>
                                <View style={[styles.radarTableHeadCell, { width: 95 }]}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>GÜNLER</Text>
                                </View>
                                {Array.from({ length: scheduleDailyHours }, (_: any, i: any) => i + 1).map((h: any) => (
                                  <View key={h} style={[styles.radarTableHeadCell, { width: 90 }]}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{h}. Ders</Text>
                                  </View>
                                ))}
                              </View>

                              {/* Rows: Pazartesi -> Cuma */}
                              {[1, 2, 3, 4, 5].map((day: any) => {
                                const dayDuty = tDuties.find((d: any) => normalizeDayNumber(d.dayOfWeek) === day);
                                return (
                                  <View key={day} style={styles.radarTableRow}>
                                    <View style={[styles.radarTableCell, { width: 95, backgroundColor: '#F8FAFC' }]}>
                                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                                        {dayLabels[day]}
                                      </Text>
                                      {dayDuty && (
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626', marginTop: 2 }}>
                                          🚨 {dayDuty.dutyPlace}
                                        </Text>
                                      )}
                                    </View>
                                    {Array.from({ length: scheduleDailyHours }, (_: any, i: any) => i + 1).map((hour: any) => {
                                      const slot = activeRadarTeacherScheduleMap.get(`${day}_${hour}`);
                                      const slotBranch = slot
                                        ? (slot.className || (slot.grade && slot.section ? `${slot.grade}-${slot.section}` : slot.grade || slot.section || ''))
                                        : '';
                                      return (
                                        <View key={hour} style={[styles.radarTableCell, { width: 90 }]}>
                                          {slot ? (
                                            <View style={styles.radarCellOccupied}>
                                              <Text style={styles.radarCellOccupiedText} numberOfLines={1}>
                                                {slotBranch || slot.lessonCode || 'Ders'}
                                              </Text>
                                              <Text style={styles.radarCellSubText} numberOfLines={1}>
                                                {slot.lessonName || '-'}
                                              </Text>
                                            </View>
                                          ) : (
                                            <View style={styles.radarCellEmpty}>
                                              <Text style={styles.radarCellEmptyText}>— BOŞ —</Text>
                                            </View>
                                          )}
                                        </View>
                                      );
                                    })}
                                  </View>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>
                      );
                    })()}
                  </View>
                )}

                {/* SUB-TAB 2: ŞUBEDE KİM VAR? (SINIF / ŞUBE PROGRAMI) */}
                {radarSubTab === 'class' && (
                  <View>
                    {(() => {
                      const getFormattedClassName = (cls: any): string => {
                        if (!cls) return '';
                        if (typeof cls === 'string') return cls.trim();
                        if (cls.className) return String(cls.className).trim();
                        if (cls.name) return String(cls.name).trim();
                        if (cls.grade && cls.section) return `${cls.grade}-${cls.section}`.trim();
                        return String(cls.grade || cls.section || '').trim();
                      };

                      const isScheduleMatchingClass = (s: any, targetClassName: string): boolean => {
                        if (!s || !targetClassName) return false;
                        const target = targetClassName.trim().toLowerCase().replace('/', '-');
                        const sCls = (s.className || (s.grade && s.section ? `${s.grade}-${s.section}` : `${s.grade || ''}-${s.section || ''}`)).trim().toLowerCase().replace('/', '-');
                        if (sCls === target) return true;
                        const parts = target.split('-');
                        if (parts.length === 2) {
                          const [tGrade, tSection] = parts;
                          if (String(s.grade).trim().toLowerCase() === tGrade && String(s.section).trim().toLowerCase() === tSection) {
                            return true;
                          }
                        }
                        return false;
                      };

                      // Hem classes listesinden hem de programdaki tüm şubelerden eksiksiz liste oluştur
                      const radarAvailableClasses: Array<{ id: string; name: string; grade: number; section: string }> = [];
                      const seen = new Set<string>();

                      (classes || []).forEach((c: any) => {
                        const cName = getFormattedClassName(c);
                        if (cName && !seen.has(cName.toLowerCase())) {
                          seen.add(cName.toLowerCase());
                          const gNum = parseInt(String(c.grade || cName).replace(/\D/g, '') || '0', 10);
                          radarAvailableClasses.push({ id: c.id || cName, name: cName, grade: gNum, section: String(c.section || '') });
                        }
                      });

                      (allSchoolSchedules || []).forEach((s: any) => {
                        const sName = getFormattedClassName(s);
                        if (sName && !seen.has(sName.toLowerCase())) {
                          seen.add(sName.toLowerCase());
                          const gNum = parseInt(String(s.grade || sName).replace(/\D/g, '') || '0', 10);
                          radarAvailableClasses.push({ id: sName, name: sName, grade: gNum, section: String(s.section || '') });
                        }
                      });

                      radarAvailableClasses.sort((a: any, b: any) => {
                        if (a.grade !== b.grade) return a.grade - b.grade;
                        return a.name.localeCompare(b.name, 'tr');
                      });

                      const activeCName = radarClass || radarAvailableClasses[0]?.name || '';
                      const dayLabels: Record<number, string> = { 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma' };

                      return (
                        <View>
                          {/* Sınıf Seçimi - Dropdown */}
                          <View style={styles.radarGridCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>
                                Sınıf / Şube Seçiniz:
                              </Text>
                              <Text style={{ fontSize: 11, color: '#64748B' }}>
                                Toplam {radarAvailableClasses.length} Şube
                              </Text>
                            </View>

                            {radarAvailableClasses.length === 0 ? (
                              <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 4 }}>
                                Henüz kayıtlı sınıf/şube verisi bulunamadı.
                              </Text>
                            ) : (
                              <>
                                <TouchableOpacity
                                  style={styles.radarDropdownButton}
                                  onPress={() => {
                                    setRadarClassSearch('');
                                    setRadarClassGradeFilter('all');
                                    setRadarClassModalVisible(true);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <View style={styles.radarDropdownIconWrap}>
                                      <Ionicons name="school" size={18} color="#4F46E5" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#64748B' }}>
                                        Görüntülenen Şube
                                      </Text>
                                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>
                                        {activeCName ? `${activeCName} Şubesi` : 'Şube Seçmek İçin Dokunun...'}
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={styles.radarDropdownActionTag}>
                                    <Text style={styles.radarDropdownActionText}>Şube Değiştir</Text>
                                    <Ionicons name="chevron-down" size={15} color="#4F46E5" />
                                  </View>
                                </TouchableOpacity>

                                {/* Hızlı Sık Kullanılan Şubeler Şeridi */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                                  {radarAvailableClasses.slice(0, 8).map((c: any) => {
                                    const isSel = activeCName.trim().toLowerCase() === c.name.trim().toLowerCase();
                                    return (
                                      <TouchableOpacity
                                        key={c.id || c.name}
                                        style={[styles.reportFilterChip, isSel && styles.reportFilterChipActive]}
                                        onPress={() => setRadarClass(c.name)}
                                      >
                                        <Text style={[styles.reportFilterChipText, isSel && styles.reportFilterChipTextActive]}>
                                          {c.name}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                  {radarAvailableClasses.length > 8 && (
                                    <TouchableOpacity
                                      style={[styles.reportFilterChip, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                                      onPress={() => {
                                        setRadarClassSearch('');
                                        setRadarClassGradeFilter('all');
                                        setRadarClassModalVisible(true);
                                      }}
                                    >
                                      <Text style={[styles.reportFilterChipText, { color: '#4F46E5', fontWeight: '800' }]}>
                                        +{radarAvailableClasses.length - 8} Diğer...
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </ScrollView>
                              </>
                            )}
                          </View>

                          {/* Sınıf Haftalık Programı */}
                          <View style={styles.radarGridCard}>
                            <View style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 10, marginBottom: 12 }}>
                              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                                {activeCName ? `${activeCName} Şubesi Haftalık Ders Dağılımı` : 'Şube Seçilmedi'}
                              </Text>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>
                                Her saatte sınıfta hangi öğretmenin bulunduğunu ve dersi canlı görüntüleyin.
                              </Text>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                              <View style={styles.radarTable}>
                                <View style={styles.radarTableHeaderRow}>
                                  <View style={[styles.radarTableHeadCell, { width: 95 }]}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>GÜNLER</Text>
                                  </View>
                                  {Array.from({ length: scheduleDailyHours }, (_: any, i: any) => i + 1).map((h: any) => (
                                    <View key={h} style={[styles.radarTableHeadCell, { width: 105 }]}>
                                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{h}. Ders</Text>
                                    </View>
                                  ))}
                                </View>
                                {(() => {
                                  const classScheduleMap = new Map<string, any>();
                                  for (let i = 0; i < allSchoolSchedules.length; i++) {
                                    const s = allSchoolSchedules[i];
                                    if (isScheduleMatchingClass(s, activeCName)) {
                                      classScheduleMap.set(`${s.dayOfWeek}_${s.lessonHour}`, s);
                                    }
                                  }
                                  return [1, 2, 3, 4, 5].map((day: any) => (
                                    <View key={day} style={styles.radarTableRow}>
                                      <View style={[styles.radarTableCell, { width: 95, backgroundColor: '#F8FAFC' }]}>
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                                          {dayLabels[day]}
                                        </Text>
                                      </View>
                                      {Array.from({ length: scheduleDailyHours }, (_: any, i: any) => i + 1).map((hour: any) => {
                                        const slot = classScheduleMap.get(`${day}_${hour}`);
                                        return (
                                          <View key={hour} style={[styles.radarTableCell, { width: 105 }]}>
                                            {slot ? (
                                              <View style={[styles.radarCellOccupied, { backgroundColor: '#F0FDF4' }]}>
                                                <Text style={[styles.radarCellOccupiedText, { color: '#166534' }]} numberOfLines={1}>
                                                  {slot.teacherName || 'Öğretmen'}
                                                </Text>
                                                <Text style={[styles.radarCellSubText, { color: '#15803D' }]} numberOfLines={1}>
                                                  {slot.lessonName || '-'}
                                                </Text>
                                              </View>
                                            ) : (
                                              <View style={styles.radarCellEmpty}>
                                                <Text style={styles.radarCellEmptyText}>— BOŞ —</Text>
                                              </View>
                                            )}
                                          </View>
                                        );
                                      })}
                                    </View>
                                  ));
                                })()}
                              </View>
                            </ScrollView>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}

                {/* SUB-TAB 3: ANLIK BOŞ DERS RADARI (KİMİN DERSİ BOŞ?) */}
                {radarSubTab === 'free_teachers' && (
                  <View>
                    {/* Gün ve Saat Seçimi */}
                    <View style={styles.radarGridCard}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 }}>
                        Hedef Günü Seçiniz:
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {[
                          { day: 1, label: 'Pazartesi' },
                          { day: 2, label: 'Salı' },
                          { day: 3, label: 'Çarşamba' },
                          { day: 4, label: 'Perşembe' },
                          { day: 5, label: 'Cuma' },
                        ].map((d: any) => (
                          <TouchableOpacity
                            key={d.day}
                            style={[styles.reportSegmentBtn, radarDay === d.day && styles.reportSegmentBtnActive]}
                            onPress={() => {
                              tabPressTimestampRef.current = Date.now();
                              setRadarDay(d.day);
                            }}
                          >
                            <Text style={[styles.reportSegmentText, radarDay === d.day && styles.reportSegmentTextActive]}>
                              {d.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 }}>
                        Ders Saatini Seçiniz:
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {Array.from({ length: scheduleDailyHours }, (_: any, i: any) => i + 1).map((h: any) => (
                          <TouchableOpacity
                            key={h}
                            style={[
                              styles.reportFilterChip,
                              radarHour === h && { backgroundColor: '#4F46E5', borderColor: '#4338CA' },
                              { paddingHorizontal: 14 }
                            ]}
                            onPress={() => {
                              tabPressTimestampRef.current = Date.now();
                              setRadarHour(h);
                            }}
                          >
                            <Text style={[styles.reportFilterChipText, radarHour === h && { color: '#FFFFFF', fontWeight: '800' }]}>
                              {h}. Saat
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Boş Olan Öğretmenler Listesi */}
                    {(() => {
                      const dayLabels: Record<number, string> = { 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma' };
                      const dutyCount = freeTeachersList.filter((t: any) => t.duty).length;
                      const inSchoolCount = freeTeachersList.filter((t: any) => !t.duty && t.todayLessons > 0).length;
                      const allDayFreeCount = freeTeachersList.filter((t: any) => !t.duty && t.todayLessons === 0).length;

                      return (
                        <View>
                          {/* İstatistik Çubuğu */}
                          <View style={[styles.radarGridCard, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                              <View>
                                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E1B4B' }}>
                                  {dayLabels[radarDay]} • {radarHour}. Saat Boş Öğretmenler ({freeTeachersList.length})
                                </Text>
                                <Text style={{ fontSize: 12, color: '#4338CA', marginTop: 2 }}>
                                  {dutyCount > 0 ? `🚨 ${dutyCount} Nöbetçi • ` : ''}
                                  {inSchoolCount > 0 ? `🏫 ${inSchoolCount} Okulda Dersi Olan • ` : ''}
                                  {allDayFreeCount > 0 ? `🏠 ${allDayFreeCount} Bugün Dersi Olmayan` : ''}
                                </Text>
                              </View>
                              {dutyCount > 0 && (
                                <View style={styles.radarDutyBadgeRed}>
                                  <Ionicons name="alert-circle" size={14} color="#DC2626" />
                                  <Text style={styles.radarDutyBadgeRedText}>
                                    {dutyCount} NÖBETÇİ ÖĞRETMEN MÜSAİT
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Kartlar */}
                          {freeTeachersList.length === 0 ? (
                            <View style={[styles.radarGridCard, { alignItems: 'center', paddingVertical: 32 }]}>
                              <Ionicons name="checkmark-done-circle" size={40} color="#10B981" />
                              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B', marginTop: 8 }}>
                                Tüm Öğretmenler Derste
                              </Text>
                              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                                Seçilen gün ve saatte okuldaki tüm personelin aktif dersi bulunmaktadır.
                              </Text>
                            </View>
                          ) : (
                            freeTeachersList.map((t: any) => {
                              const isAllDayFree = t.todayLessons === 0;
                              return (
                                <TouchableOpacity
                                  key={t.id || t.fullName}
                                  activeOpacity={0.72}
                                  onPress={() => handleOpenTeacherSchedule(t)}
                                  style={[
                                    styles.radarFreeCard,
                                    t.duty && styles.radarFreeCardDuty,
                                    isAllDayFree && !t.duty && { opacity: 0.88, backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
                                    { position: 'relative' }
                                  ]}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                    <View style={{ flex: 1 }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <Text style={[{ fontSize: 15, fontWeight: '800' }, isAllDayFree && !t.duty ? { color: '#475569' } : { color: '#0F172A' }]}>
                                          {t.fullName}
                                        </Text>
                                        {t.duty ? (
                                          <View style={styles.radarDutyBadgeRed}>
                                            <Ionicons name="shield-checkmark" size={12} color="#DC2626" />
                                            <Text style={styles.radarDutyBadgeRedText}>
                                              NÖBETÇİ: {t.duty.dutyPlace}
                                            </Text>
                                          </View>
                                        ) : isAllDayFree ? (
                                          <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' }}>
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>
                                              🏠 Bugün Dersi Yok (Okulda Olmayabilir)
                                            </Text>
                                          </View>
                                        ) : (
                                          <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534' }}>
                                              ✅ Okulda / Bu Saat Boş
                                            </Text>
                                          </View>
                                        )}
                                      </View>
                                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                                        Branş: {t.branch || 'Genel'}
                                        {t.duty?.notes ? ` • Not: ${t.duty.notes}` : ''}
                                      </Text>
                                    </View>

                                    <View style={{ alignItems: 'flex-end' }}>
                                      {isAllDayFree ? (
                                        <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                                            Tüm Gün Boş
                                          </Text>
                                        </View>
                                      ) : (
                                        <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>
                                            Bugün Boş: <Text style={{ color: '#4F46E5' }}>{t.todayFreeHours} Saat</Text>
                                          </Text>
                                        </View>
                                      )}
                                      <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                                        Bugünkü Dersi: {t.todayLessons} Saat
                                      </Text>
                                    </View>
                                  </View>

                                  {/* Tıklama İpucu & Hızlı Program Buton Çubuğu */}
                                  <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Ionicons name="calendar" size={13} color="#4F46E5" />
                                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                                        Haftalık Ders Programını Gör
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                      <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>Detay Çizelge</Text>
                                      <Ionicons name="chevron-forward" size={13} color="#94A3B8" />
                                    </View>
                                  </View>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      );
                    })()}
                  </View>
                )}

                {/* SUB-TAB 4: NÖBETÇİ ÖĞRETMEN YÖNETİMİ */}
                {radarSubTab === 'duty' && (
                  <View>
                    {/* Eylemler ve Butonlar */}
                    <View style={styles.radarGridCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>
                            Okul Nöbetçi Öğretmen Çizelgesi
                          </Text>
                          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                            Haftalık nöbet yerlerini (Bahçe, 1. Kat vb.) Excel ile toplu aktarın veya manuel ekleyin.
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            style={[styles.exportActionBtn, { backgroundColor: '#0284C7', paddingVertical: 8, paddingHorizontal: 12 }]}
                            onPress={handleDownloadDutyTemplate}
                            disabled={downloadingDutyTemplate}
                          >
                            {downloadingDutyTemplate ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="download-outline" size={16} color="#fff" />
                                <Text style={[styles.exportActionBtnText, { fontSize: 12 }]}>Şablon İndir</Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.exportActionBtn, { backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 12 }]}
                            onPress={handlePickAndParseDutyExcel}
                            disabled={importingDutyExcel}
                          >
                            {importingDutyExcel ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="document-text-outline" size={16} color="#fff" />
                                <Text style={[styles.exportActionBtnText, { fontSize: 12 }]}>Excel ile Nöbet Yükle</Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.exportActionBtn, { backgroundColor: '#7C3AED', paddingVertical: 8, paddingHorizontal: 12 }]}
                            onPress={() => setDutyPlacesModalVisible(true)}
                          >
                            <Ionicons name="location" size={16} color="#fff" />
                            <Text style={[styles.exportActionBtnText, { fontSize: 12 }]}>Nöbet Alanları</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.exportActionBtn, { backgroundColor: '#4F46E5', paddingVertical: 8, paddingHorizontal: 12 }]}
                            onPress={() => setAddDutyModalVisible(true)}
                          >
                            <Ionicons name="add" size={16} color="#fff" />
                            <Text style={[styles.exportActionBtnText, { fontSize: 12 }]}>Yeni Nöbetçi</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Gün Filtresi */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {[
                          { day: 0, label: 'Tüm Hafta' },
                          { day: 1, label: 'Pazartesi' },
                          { day: 2, label: 'Salı' },
                          { day: 3, label: 'Çarşamba' },
                          { day: 4, label: 'Perşembe' },
                          { day: 5, label: 'Cuma' },
                        ].map((d: any) => (
                          <TouchableOpacity
                            key={d.day}
                            style={[styles.reportSegmentBtn, dutyFilterDay === d.day && styles.reportSegmentBtnActive]}
                            onPress={() => setDutyFilterDay(d.day)}
                          >
                            <Text style={[styles.reportSegmentText, dutyFilterDay === d.day && styles.reportSegmentTextActive]}>
                              {d.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Nöbetçi Listesi */}
                    {loadingDuties ? (
                      <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 24 }} />
                    ) : (
                      (() => {
                        const dayLabels: Record<number, string> = { 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma', 6: 'Cumartesi', 7: 'Pazar' };
                        const filteredDuties = dutiesList.filter((d: any) => dutyFilterDay === 0 || normalizeDayNumber(d.dayOfWeek) === dutyFilterDay);

                        if (filteredDuties.length === 0) {
                          return (
                            <View style={[styles.radarGridCard, { alignItems: 'center', paddingVertical: 32 }]}>
                              <Ionicons name="shield-outline" size={40} color="#94A3B8" />
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 8 }}>
                                Kayıtlı Nöbetçi Bulunamadı
                              </Text>
                              <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4, maxWidth: 300 }}>
                                Okulunuzun nöbet listesini Excel tablosu (.xlsx) olarak yükleyebilir veya "Yeni Nöbetçi" butonuyla ekleyebilirsiniz.
                              </Text>
                            </View>
                          );
                        }

                        return (
                          <View style={{ gap: 8 }}>
                            {filteredDuties.map((d: any) => (
                              <View key={d.id} style={styles.radarGridCard}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>
                                        {d.teacherName}
                                      </Text>
                                      <View style={styles.radarDutyBadgeRed}>
                                        <Ionicons name="location" size={12} color="#DC2626" />
                                        <Text style={styles.radarDutyBadgeRedText}>
                                          {d.dutyPlace}
                                        </Text>
                                      </View>
                                    </View>
                                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                                      {dayLabels[d.dayOfWeek] || `${d.dayOfWeek}. Gün`}
                                      {d.notes ? ` • ${d.notes}` : ''}
                                    </Text>
                                  </View>

                                  <TouchableOpacity
                                    onPress={() => handleDeleteDuty(d.id, d.teacherName)}
                                    style={{ padding: 8, borderRadius: 8, backgroundColor: '#FEE2E2' }}
                                  >
                                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                          </View>
                        );
                      })()
                    )}
                  </View>
                )}
              </View>
  );
}
