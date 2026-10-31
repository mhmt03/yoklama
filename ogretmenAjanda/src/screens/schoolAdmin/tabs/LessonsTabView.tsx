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

export function LessonsTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    filteredLessons,
    lessons,
    handleDeleteAllLessons,
    handleDownloadYearlyPlanTemplate,
    setAddLessonModalVisible,
    uniqueLessonsCount,
    lessonSearchQuery,
    setLessonSearchQuery,
    lessonGradeFilter,
    setLessonGradeFilter,
    schoolYearlyPlans,
    handleOpenViewYearlyPlan,
    handlePickYearlyPlanFile,
    handleOpenEditLesson,
    handleDeleteLesson
  } = ctx;

  return (
    <View>
                <View style={{ marginBottom: 12 }}>
                  <View style={[styles.sectionHeader, { flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }]}>
                    <Text style={styles.sectionTitle}>
                      Okul Müfredat Dersleri ({filteredLessons.length}/{lessons.length})
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {lessons.length > 0 && (
                        <TouchableOpacity
                          style={styles.dangerHeaderBtn}
                          onPress={handleDeleteAllLessons}
                        >
                          <Ionicons name="trash-outline" size={13} color="#DC2626" />
                          <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.primaryAddBtn, { backgroundColor: '#0284C7' }]}
                        onPress={() => handleDownloadYearlyPlanTemplate()}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="download-outline" size={14} color="#fff" />
                        <Text style={styles.primaryAddBtnText}>Plan Şablonu</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.primaryAddBtn}
                        onPress={() => setAddLessonModalVisible(true)}
                      >
                        <Ionicons name="book" size={15} color="#fff" />
                        <Text style={styles.primaryAddBtnText}>+ Ders Ekle</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                    Okulunuzda <Text style={{ fontWeight: '800', color: '#1E293B' }}>{uniqueLessonsCount} farklı ders</Text> bulunmaktadır (kademelere göre ayrılmış toplam {lessons.length} müfredat kaydı).
                  </Text>
                </View>

                {/* Arama & Kademe Filtreleri */}
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  {/* Arama Inputu */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 8 }}>
                    <Ionicons name="search" size={16} color="#94A3B8" />
                    <TextInput
                      style={{ flex: 1, marginLeft: 8, fontSize: 13, color: '#1E293B', padding: 0 }}
                      placeholder="Ders adı, kısa kod veya kademe ara (örn: Seçmeli Fizik, S.FZK, 11)..."
                      placeholderTextColor="#94A3B8"
                      value={lessonSearchQuery}
                      onChangeText={setLessonSearchQuery}
                    />
                    {lessonSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setLessonSearchQuery('')}>
                        <Ionicons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Kademe Filtre Butonları */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <TouchableOpacity
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                        lessonGradeFilter === 'all' && { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }
                      ]}
                      onPress={() => setLessonGradeFilter('all')}
                    >
                      <Text style={[{ fontSize: 12, fontWeight: '700', color: '#475569' }, lessonGradeFilter === 'all' && { color: '#FFFFFF' }]}>
                        Tüm Kademeler ({lessons.length} Kademe / {uniqueLessonsCount} Ders)
                      </Text>
                    </TouchableOpacity>

                    {['9', '10', '11', '12'].map((g: any) => {
                      const count = lessons.filter((l: any) => String(l.grade || '').trim() === g || String(l.grade || '').trim().startsWith(g)).length;
                      const isActive = lessonGradeFilter === g;
                      return (
                        <TouchableOpacity
                          key={g}
                          style={[
                            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                            isActive && { backgroundColor: '#0284C7', borderColor: '#0284C7' }
                          ]}
                          onPress={() => setLessonGradeFilter(g as any)}
                        >
                          <Text style={[{ fontSize: 12, fontWeight: '700', color: '#475569' }, isActive && { color: '#FFFFFF' }]}>
                            {g}. Sınıf ({count})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                        lessonGradeFilter === 'common' && { backgroundColor: '#64748B', borderColor: '#64748B' }
                      ]}
                      onPress={() => setLessonGradeFilter('common')}
                    >
                      <Text style={[{ fontSize: 12, fontWeight: '700', color: '#475569' }, lessonGradeFilter === 'common' && { color: '#FFFFFF' }]}>
                        Ortak / Genel ({lessons.filter((l: any) => !l.grade || l.grade === 'Tüm Kademeler' || l.grade === 'Ortak').length})
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>

                {filteredLessons.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {lessons.length === 0 ? 'Henüz okulunuza kayıtlı ders bulunmuyor.' : 'Seçilen filtreye uygun ders bulunamadı.'}
                    </Text>
                  </View>
                ) : (
                  filteredLessons.map((lesson: any) => {
                    const lessonPlans = schoolYearlyPlans.filter((p: any) => {
                      const pName = (p.lessonName || '').trim().toLowerCase();
                      const lName = (lesson.name || '').trim().toLowerCase();
                      const nameMatch = pName === lName || pName.includes(lName) || lName.includes(pName);
                      if (!nameMatch) return false;
                      if (lesson.grade && p.grade && p.grade !== 'Tüm Kademeler') {
                        return String(p.grade).trim() === String(lesson.grade).trim();
                      }
                      return true;
                    });
                    const hasPlan = lessonPlans.length > 0;

                    // Kademe Renk Rozeti
                    const gradeNum = String(lesson.grade || '').trim();
                    const isGrade9 = gradeNum === '9';
                    const isGrade10 = gradeNum === '10';
                    const isGrade11 = gradeNum === '11';
                    const isGrade12 = gradeNum === '12';
                    const badgeBg = isGrade9 ? '#DCFCE7' : isGrade10 ? '#E0F2FE' : isGrade11 ? '#EEF2FF' : isGrade12 ? '#F5F3FF' : '#F1F5F9';
                    const badgeBorder = isGrade9 ? '#86EFAC' : isGrade10 ? '#7DD3FC' : isGrade11 ? '#C7D2FE' : isGrade12 ? '#DDD6FE' : '#CBD5E1';
                    const badgeTextColor = isGrade9 ? '#15803D' : isGrade10 ? '#0369A1' : isGrade11 ? '#4338CA' : isGrade12 ? '#6D28D9' : '#475569';

                    return (
                      <View key={lesson.id} style={styles.lessonCard}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {/* Belirgin Kademe Rozeti */}
                            <View style={{
                              backgroundColor: badgeBg,
                              borderColor: badgeBorder,
                              borderWidth: 1.5,
                              paddingHorizontal: 8,
                              paddingVertical: 2.5,
                              borderRadius: 6,
                            }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: badgeTextColor }}>
                                {lesson.grade && lesson.grade !== 'Tüm Kademeler' ? `${lesson.grade}. Sınıf` : 'Tüm Kademeler'}
                              </Text>
                            </View>

                            <Text style={[styles.lessonName, { fontSize: 15, fontWeight: '800' }]}>{lesson.name}</Text>
                            {lesson.shortCode && (
                              <View style={styles.shortCodeTag}>
                                <Text style={styles.shortCodeText}>{lesson.shortCode}</Text>
                              </View>
                            )}
                          </View>

                          <Text style={[styles.lessonSub, { marginTop: 4 }]}>
                            Haftalık Ders Yükü: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{lesson.weeklyHours || 2} Saat / Hafta</Text>
                          </Text>

                          {/* Yıllık Plan Durum Göstergesi */}
                          {hasPlan ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                              <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#16A34A' }}>
                                Yıllık Plan Yüklü ({lessonPlans.length} Hafta)
                              </Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="alert-circle-outline" size={14} color="#D97706" />
                              <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#D97706' }}>
                                Plan Yüklenmedi ({lesson.grade ? `${lesson.grade}. Sınıf Planı Bekleniyor` : 'Genel Plan Bekleniyor'})
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {hasPlan ? (
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                              onPress={() => handleOpenViewYearlyPlan(lesson, lessonPlans)}
                            >
                              <Ionicons name="eye-outline" size={13} color="#16A34A" />
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Planı Gör</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                              onPress={() => handlePickYearlyPlanFile(lesson)}
                            >
                              <Ionicons name="cloud-upload-outline" size={13} color="#16A34A" />
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Plan Yükle</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={[styles.cardActionBtn, { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' }]}
                            onPress={() => handleOpenEditLesson(lesson)}
                          >
                            <Ionicons name="pencil-outline" size={13} color="#4F46E5" />
                            <Text style={[styles.cardActionBtnText, { color: '#4F46E5' }]}>Düzenle</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.deleteMiniBtn}
                            onPress={() => handleDeleteLesson(lesson.id, `${lesson.name} (${lesson.grade || 'Tüm Kademeler'})`)}
                          >
                            <Ionicons name="trash-outline" size={15} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
  );
}
