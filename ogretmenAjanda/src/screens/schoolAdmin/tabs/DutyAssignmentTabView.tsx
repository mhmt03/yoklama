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
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../../../utils/counselorService';
import { SchoolAdminCtx } from '../schoolAdminStyles';

export function DutyAssignmentTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    handlePrintDutySchedule,
    dutyAssignDay,
    setDutyAssignDay,
    absentTeachers,
    setAbsentTeachers,
    absentTeacherSearch,
    setAbsentTeacherSearch,
    sortedTeachers,
    allSchoolSchedules,
    dutiesList,
    hiddenDutyTeachersBySlot,
    setHiddenDutyTeachersBySlot
  } = ctx;

  return (
    <View style={{ gap: 14 }}>
                {/* 1. Üst Banner & Açıklama Kartı */}
                <View style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 6,
                  elevation: 2,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="shield-checkmark" size={24} color="#4F46E5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                          Nöbetçi Atama & Telafi Dersi Dağıtımı
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 17 }}>
                          Bugün gelmeyen veya izinli olan öğretmenleri seçin. O günkü dersleri saat saat listelenir ve yanlarında boşta olan nöbetçi öğretmenler aday olarak gösterilir.
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handlePrintDutySchedule}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#4F46E5',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                        shadowColor: '#4F46E5',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 2,
                      }}
                    >
                      <Ionicons name="print-outline" size={17} color="#FFFFFF" />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                        Çizelgeyi Yazdır / PDF
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 2. Gün Seçim Çubuğu */}
                <View style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 8 }}>
                    📅 İşlem Yapılacak Günü Seçin:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[
                      { day: 1, name: 'Pazartesi' },
                      { day: 2, name: 'Salı' },
                      { day: 3, name: 'Çarşamba' },
                      { day: 4, name: 'Perşembe' },
                      { day: 5, name: 'Cuma' },
                    ].map((d: any) => {
                      const isSelected = dutyAssignDay === d.day;
                      return (
                        <TouchableOpacity
                          key={d.day}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            borderRadius: 10,
                            backgroundColor: isSelected ? '#4F46E5' : '#F8FAFC',
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
                          }}
                          onPress={() => setDutyAssignDay(d.day)}
                        >
                          <Ionicons
                            name="calendar"
                            size={14}
                            color={isSelected ? '#FFFFFF' : '#64748B'}
                          />
                          <Text style={{
                            fontSize: 12,
                            fontWeight: '800',
                            color: isSelected ? '#FFFFFF' : '#334155',
                          }}>
                            {d.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 3. Gelmeyen Öğretmenleri Seçin Kartı (Checkbox Listesi) */}
                <View style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkbox" size={18} color="#DC2626" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                        🚫 Bugün Gelmeyen Öğretmenleri Seçin
                      </Text>
                      {absentTeachers.length > 0 && (
                        <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#FCA5A5' }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>
                            {absentTeachers.length} Kişi Seçildi
                          </Text>
                        </View>
                      )}
                    </View>

                    {absentTeachers.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setAbsentTeachers([])}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
                      >
                        <Ionicons name="trash-outline" size={13} color="#64748B" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>Seçimleri Temizle</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Arama Kutusu */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    paddingHorizontal: 10,
                    height: 38,
                    marginBottom: 10,
                  }}>
                    <Ionicons name="search" size={16} color="#94A3B8" />
                    <TextInput
                      style={{ flex: 1, marginLeft: 8, fontSize: 12, color: '#0F172A' }}
                      placeholder="Öğretmen adı veya branş ara..."
                      placeholderTextColor="#94A3B8"
                      value={absentTeacherSearch}
                      onChangeText={setAbsentTeacherSearch}
                    />
                    {absentTeacherSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setAbsentTeacherSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Öğretmen Checkbox Seçim Alanı */}
                  <ScrollView
                    nestedScrollEnabled
                    style={{ maxHeight: 220 }}
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {(() => {
                      const q = absentTeacherSearch.trim().toLowerCase();
                      const list = sortedTeachers.filter((t: any) => {
                        if (!q) return true;
                        return (t.fullName || '').toLowerCase().includes(q) || (t.branch || '').toLowerCase().includes(q);
                      });

                      if (list.length === 0) {
                        return (
                          <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', paddingVertical: 14 }}>
                            Aramaya uygun öğretmen bulunamadı.
                          </Text>
                        );
                      }

                      return (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {list.map((t: any) => {
                            const isAbsent = absentTeachers.includes(t.fullName);
                            return (
                              <TouchableOpacity
                                key={t.id || t.fullName}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8,
                                  backgroundColor: isAbsent ? '#FEF2F2' : '#FFFFFF',
                                  borderWidth: 1.5,
                                  borderColor: isAbsent ? '#EF4444' : '#E2E8F0',
                                  paddingHorizontal: 10,
                                  paddingVertical: 7,
                                  borderRadius: 8,
                                  minWidth: 160,
                                }}
                                onPress={() => {
                                  setAbsentTeachers((prev: any) =>
                                    prev.includes(t.fullName)
                                      ? prev.filter((name: any) => name !== t.fullName)
                                      : [...prev, t.fullName]
                                  );
                                }}
                              >
                                <Ionicons
                                  name={isAbsent ? 'checkbox' : 'square-outline'}
                                  size={18}
                                  color={isAbsent ? '#EF4444' : '#94A3B8'}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: isAbsent ? '#DC2626' : '#1E293B' }} numberOfLines={1}>
                                    {t.fullName}
                                  </Text>
                                  {t.branch && (
                                    <Text style={{ fontSize: 10, color: isAbsent ? '#B91C1C' : '#64748B' }} numberOfLines={1}>
                                      {t.branch}
                                    </Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })()}
                  </ScrollView>
                </View>

                {/* 4. Ders Programı ve Eşleştirme Kartları (Gelmeyen Öğretmen Dersi ➔ Müsait Nöbetçi) */}
                <View style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="git-compare-outline" size={18} color="#4F46E5" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                        Ders Dağıtım & Nöbetçi Eşleştirme Çizelgesi
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handlePrintDutySchedule}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: '#EEF2FF',
                        borderWidth: 1.5,
                        borderColor: '#C7D2FE',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}
                    >
                      <Ionicons name="print" size={14} color="#4F46E5" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#4338CA' }}>
                        Yazdır / PDF
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {absentTeachers.length === 0 ? (
                    <View style={{ paddingVertical: 36, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person-remove-outline" size={44} color="#CBD5E1" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B', marginTop: 10 }}>
                        Henüz Gelmeyen Öğretmen Seçilmedi
                      </Text>
                      <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, maxWidth: 360 }}>
                        Yukarıdaki listeden bugün gelmeyen öğretmenleri işaretleyin. O günkü dersleri ve yerine girebilecek müsait nöbetçiler burada yan yana gösterilecektir.
                      </Text>
                    </View>
                  ) : (() => {
                    // Seçilen gelmeyen öğretmenlerin seçilen gündeki dersleri
                    const absentDaySchedules = (allSchoolSchedules || [])
                      .filter((s: any) => {
                        const sDay = Number(s.dayOfWeek);
                        if (sDay !== dutyAssignDay) return false;
                        return absentTeachers.some((absentName: any) => isSameTeacher(absentName, s.teacherName));
                      })
                      .sort((a: any, b: any) => Number(a.lessonHour || 0) - Number(b.lessonHour || 0));

                    if (absentDaySchedules.length === 0) {
                      const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
                      return (
                        <View style={{ paddingVertical: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <Ionicons name="checkmark-done-circle" size={40} color="#10B981" />
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B', marginTop: 8 }}>
                            Seçilen Öğretmenlerin Bu Gün Dersi Yok
                          </Text>
                          <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                            Seçtiğiniz öğretmenlerin {dayNames[dutyAssignDay]} gününde boşluğu bulunmaktadır.
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View style={{ gap: 12 }}>
                        {absentDaySchedules.map((slotItem: any, sIdx: any) => {
                          const lHour = Number(slotItem.lessonHour || (sIdx + 1));
                          const slotKey = `${dutyAssignDay}_${lHour}_${normalizeTeacherName(slotItem.teacherName)}`;
                          const allAvailableDuty = getAvailableDutyTeachersForHour(
                            dutyAssignDay,
                            lHour,
                            dutiesList,
                            allSchoolSchedules,
                            absentTeachers
                          );
                          const hiddenList = hiddenDutyTeachersBySlot[slotKey] || [];
                          const visibleDutyTeachers = allAvailableDuty.filter((d: any) => !hiddenList.includes(d.teacherName));
                          const hiddenDutyTeachers = allAvailableDuty.filter((d: any) => hiddenList.includes(d.teacherName));

                          const classNameText = slotItem.className || (slotItem.grade && slotItem.section ? `${slotItem.grade}-${slotItem.section}` : slotItem.grade || slotItem.section || '—');

                          return (
                            <View
                              key={slotKey + '_' + sIdx}
                              style={{
                                backgroundColor: '#F8FAFC',
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                                borderRadius: 12,
                                padding: 12,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap', gap: 10 }}>
                                {/* SOL KART: GELMEYEN ÖĞRETMEN VE DERS */}
                                <View style={{
                                  flex: 1,
                                  minWidth: 260,
                                  backgroundColor: '#FFF1F2',
                                  borderWidth: 1.5,
                                  borderColor: '#FECDD3',
                                  borderRadius: 10,
                                  padding: 12,
                                  justifyContent: 'space-between',
                                }}>
                                  <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
                                      <View style={{ backgroundColor: '#E11D48', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
                                          ⏰ {lHour}. Ders Saati
                                        </Text>
                                      </View>
                                      <View style={{ backgroundColor: '#FFE4E6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FDA4AF' }}>
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#BE123C' }}>
                                          🏫 Şube: {classNameText}
                                        </Text>
                                      </View>
                                    </View>

                                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#881337', marginBottom: 4 }}>
                                      📚 {slotItem.lessonName || 'Ders'}
                                    </Text>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#9F1239' }}>
                                      ❌ Gelmeyen: {slotItem.teacherName}
                                    </Text>
                                  </View>

                                  <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#FFE4E6', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name="arrow-forward-circle" size={14} color="#E11D48" />
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#E11D48' }}>
                                      Yerine Nöbetçi Görevlendirilecek ➔
                                    </Text>
                                  </View>
                                </View>

                                {/* SAĞ KART: MÜSAİT NÖBETÇİ ÖĞRETMENLER */}
                                <View style={{
                                  flex: 1.2,
                                  minWidth: 280,
                                  backgroundColor: '#F0FDF4',
                                  borderWidth: 1.5,
                                  borderColor: '#BBF7D0',
                                  borderRadius: 10,
                                  padding: 12,
                                }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                      <Ionicons name="shield-checkmark" size={16} color="#16A34A" />
                                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                                        Bu Saatte Müsait Nöbetçiler ({visibleDutyTeachers.length})
                                      </Text>
                                    </View>
                                    {hiddenDutyTeachers.length > 0 && (
                                      <TouchableOpacity
                                        onPress={() => {
                                          setHiddenDutyTeachersBySlot((prev: any) => {
                                            const copy = { ...prev };
                                            delete copy[slotKey];
                                            return copy;
                                          });
                                        }}
                                        style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}
                                      >
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803D' }}>
                                          Gizlenenleri Aç ({hiddenDutyTeachers.length})
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>

                                  {visibleDutyTeachers.length === 0 ? (
                                    <View style={{ paddingVertical: 14, alignItems: 'center', justifyContent: 'center' }}>
                                      <Ionicons name="alert-circle-outline" size={24} color="#D97706" />
                                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309', marginTop: 4, textAlign: 'center' }}>
                                        {allAvailableDuty.length === 0
                                          ? 'Bu ders saatinde dersi boş olan nöbetçi öğretmen bulunmuyor.'
                                          : 'Tüm nöbetçi öğretmenler gizlendi.'}
                                      </Text>
                                    </View>
                                  ) : (
                                    <ScrollView
                                      horizontal
                                      showsHorizontalScrollIndicator={false}
                                      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                                    >
                                      {visibleDutyTeachers.map((d: any, dIdx: any) => (
                                        <View
                                          key={d.teacherName + '_' + dIdx}
                                          style={{
                                            backgroundColor: '#FFFFFF',
                                            borderWidth: 1.5,
                                            borderColor: '#86EFAC',
                                            borderRadius: 8,
                                            padding: 8,
                                            minWidth: 145,
                                            maxWidth: 180,
                                            justifyContent: 'space-between',
                                            elevation: 1,
                                            shadowColor: '#000',
                                            shadowOffset: { width: 0, height: 1 },
                                            shadowOpacity: 0.05,
                                            shadowRadius: 2,
                                          }}
                                        >
                                          {/* Üst Satır: Öğretmen Adı ve Minik Göz Simgesi */}
                                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', flex: 1 }} numberOfLines={1}>
                                              {d.teacherName}
                                            </Text>
                                            {/* 👁️ Minik Göz Simgesi (Tıklayınca Gizle / Sağa At) */}
                                            <TouchableOpacity
                                              onPress={() => {
                                                setHiddenDutyTeachersBySlot((prev: any) => {
                                                  const curr = prev[slotKey] || [];
                                                  return { ...prev, [slotKey]: [...curr, d.teacherName] };
                                                });
                                              }}
                                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                              style={{
                                                backgroundColor: '#EEF2FF',
                                                padding: 3,
                                                borderRadius: 6,
                                                borderWidth: 1,
                                                borderColor: '#C7D2FE',
                                              }}
                                              accessibilityLabel="Kartı gizle / en sağa at"
                                            >
                                              <Ionicons name="eye-off-outline" size={13} color="#4F46E5" />
                                            </TouchableOpacity>
                                          </View>

                                          <View style={{ marginTop: 6 }}>
                                            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' }}>
                                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534' }} numberOfLines={1}>
                                                📍 {d.dutyPlace}
                                              </Text>
                                            </View>
                                          </View>

                                          <View style={{ marginTop: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                                            <Text style={{ fontSize: 9, color: '#15803D', fontWeight: '800' }}>
                                              ✓ Bu saat dersi BOŞ
                                            </Text>
                                          </View>
                                        </View>
                                      ))}
                                    </ScrollView>
                                  )}
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              </View>
  );
}
