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
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function ReportsTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    teachers,
    students,
    classes,
    lessons,
    handleExportConsolidatedMaster,
    exportingReportType,
    reportTeacherBranch,
    setReportTeacherBranch,
    reportTeacherRole,
    setReportTeacherRole,
    reportTeacherActive,
    setReportTeacherActive,
    handleExportTeachersExcel,
    reportStudentSearch,
    setReportStudentSearch,
    reportStudentGrade,
    setReportStudentGrade,
    reportStudentSection,
    setReportStudentSection,
    handleExportStudentsExcel,
    reportClassGrade,
    setReportClassGrade,
    handleExportClassesExcel,
    reportLessonPlanStatus,
    setReportLessonPlanStatus,
    handleExportLessonsExcel,
    reportScheduleDay,
    setReportScheduleDay,
    handleExportScheduleExcel,
    reportSelectedPlanLessonId,
    schoolYearlyPlans,
    setReportSelectedPlanLessonId,
    handleExportYearlyPlanDetailsExcel,
    reportAuditRole,
    setReportAuditRole,
    reportAuditAction,
    setReportAuditAction,
    handleExportAuditLogsExcel,
    handleExportTeacherCredentials,
    handleExportStudentCredentials,
    handleExportParentCredentials
  } = ctx;

  return (
    <View style={styles.reportsContainer}>
                {/* Hero / Dashboard Banner */}
                <View style={styles.reportHeroCard}>
                  <View style={styles.reportHeroTop}>
                    <View style={styles.reportHeroIconWrap}>
                      <Ionicons name="stats-chart" size={26} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportHeroTitle}>Kurumsal Excel Raporlama Merkezi</Text>
                      <Text style={styles.reportHeroSubtitle}>
                        Okulunuza ait tüm verileri filtreleyin, hazır Excel tabloları halinde anında indirin veya paylaşın.
                      </Text>
                    </View>
                  </View>

                  {/* Okul Mini Sayaçları */}
                  <View style={styles.reportHeroStatsGrid}>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{teachers.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Öğretmen</Text>
                    </View>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{students.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Öğrenci</Text>
                    </View>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{classes.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Şube</Text>
                    </View>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{lessons.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Ders</Text>
                    </View>
                  </View>

                  {/* Konsolide Okul Veritabanı Master Butonu */}
                  <TouchableOpacity
                    style={styles.masterExportBtn}
                    onPress={handleExportConsolidatedMaster}
                    disabled={exportingReportType === 'consolidated_master'}
                    activeOpacity={0.88}
                  >
                    {exportingReportType === 'consolidated_master' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download" size={20} color="#fff" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.masterExportBtnTitle}>
                            🌟 Tek Tıkla Konsolide Okul Veritabanı (Multi-Sheet Excel)
                          </Text>
                          <Text style={styles.masterExportBtnSub}>
                            Öğretmenler, öğrenciler, sınıflar, dersler ve haftalık programı tek bir Excel kitabında toplar.
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#C7D2FE" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 1. ÖĞRETMENLER RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="people" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>👨‍🏫 Öğretmen Kadrosu & Görev Dağılımı</Text>
                      <Text style={styles.reportCardDesc}>
                        Branş, atanan sınıflar, iletişim, yetkiler ve ders dağılımı listesi.
                      </Text>
                    </View>
                  </View>

                  {/* Filtre: Branş */}
                  <Text style={styles.reportFilterLabel}>Branş Filtresi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportTeacherBranch === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportTeacherBranch('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportTeacherBranch === 'all' && styles.reportFilterChipTextActive]}>Tüm Branşlar ({teachers.length})</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(teachers.map((t: any) => t.branch).filter(Boolean))).map((branch: any) => (
                      <TouchableOpacity
                        key={branch}
                        style={[styles.reportFilterChip, reportTeacherBranch === branch && styles.reportFilterChipActive]}
                        onPress={() => setReportTeacherBranch(branch)}
                      >
                        <Text style={[styles.reportFilterChipText, reportTeacherBranch === branch && styles.reportFilterChipTextActive]}>
                          {branch} ({teachers.filter((t: any) => t.branch === branch).length})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Filtre: Rol & Durum */}
                  <View style={styles.reportFilterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportFilterLabel}>Kullanıcı Rolü</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'TEACHER', label: 'Öğretmen' },
                          { id: 'STAFF', label: 'İdareci' },
                        ].map((item: any) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportTeacherRole === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportTeacherRole(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportTeacherRole === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.reportFilterLabel}>Durum</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'active', label: 'Aktif' },
                          { id: 'passive', label: 'Pasif' },
                        ].map((item: any) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportTeacherActive === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportTeacherActive(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportTeacherActive === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.exportActionBtn}
                    onPress={handleExportTeachersExcel}
                    disabled={exportingReportType === 'teachers'}
                  >
                    {exportingReportType === 'teachers' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-text-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Öğretmen Kadro Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 2. ÖĞRENCİLER RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#F0FDF4' }]}>
                      <Ionicons name="school" size={20} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>👨‍🎓 Öğrenci Künye ve İletişim Raporu</Text>
                      <Text style={styles.reportCardDesc}>
                        Öğrenci numarası, sınıfı, veli isimleri ve telefon numaraları listesi.
                      </Text>
                    </View>
                  </View>

                  {/* Arama Kutusu */}
                  <View style={styles.reportSearchWrap}>
                    <Ionicons name="search" size={15} color="#64748B" />
                    <TextInput
                      style={styles.reportSearchInput}
                      placeholder="Öğrenci adı, no veya veli adı ile filtrele..."
                      value={reportStudentSearch}
                      onChangeText={setReportStudentSearch}
                    />
                    {!!reportStudentSearch && (
                      <TouchableOpacity onPress={() => setReportStudentSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filtre: Kademe */}
                  <Text style={styles.reportFilterLabel}>Sınıf Kademesi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportStudentGrade === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportStudentGrade('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportStudentGrade === 'all' && styles.reportFilterChipTextActive]}>Tüm Kademeler</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(students.map((s: any) => String(s.grade)).filter(Boolean))).sort((a: any, b: any) => Number(a) - Number(b)).map((gr: any) => (
                      <TouchableOpacity
                        key={gr}
                        style={[styles.reportFilterChip, reportStudentGrade === gr && styles.reportFilterChipActive]}
                        onPress={() => setReportStudentGrade(gr)}
                      >
                        <Text style={[styles.reportFilterChipText, reportStudentGrade === gr && styles.reportFilterChipTextActive]}>{gr}. Sınıf</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Filtre: Şube */}
                  <Text style={styles.reportFilterLabel}>Şube</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportStudentSection === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportStudentSection('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportStudentSection === 'all' && styles.reportFilterChipTextActive]}>Tüm Şubeler</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(students.map((s: any) => (s.section || '').toUpperCase()).filter(Boolean))).sort().map((sec: any) => (
                      <TouchableOpacity
                        key={sec}
                        style={[styles.reportFilterChip, reportStudentSection === sec && styles.reportFilterChipActive]}
                        onPress={() => setReportStudentSection(sec)}
                      >
                        <Text style={[styles.reportFilterChipText, reportStudentSection === sec && styles.reportFilterChipTextActive]}>{sec} Şubesi</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#16A34A' }]}
                    onPress={handleExportStudentsExcel}
                    disabled={exportingReportType === 'students'}
                  >
                    {exportingReportType === 'students' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Öğrenci Listesi İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 3. SINIFLAR VE ŞUBELER RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#FEF3C7' }]}>
                      <Ionicons name="grid" size={20} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>🏫 Sınıflar & Şubeler Kapasite Raporu</Text>
                      <Text style={styles.reportCardDesc}>
                        Şube mevcutları, kayıtlı öğrenci sayıları ve sınıf listesi dökümü.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportFilterLabel}>Kademe Filtresi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportClassGrade === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportClassGrade('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportClassGrade === 'all' && styles.reportFilterChipTextActive]}>Tüm Kademeler ({classes.length} Şube)</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(classes.map((c: any) => String(c.grade)).filter(Boolean))).sort((a: any, b: any) => Number(a) - Number(b)).map((gr: any) => (
                      <TouchableOpacity
                        key={gr}
                        style={[styles.reportFilterChip, reportClassGrade === gr && styles.reportFilterChipActive]}
                        onPress={() => setReportClassGrade(gr)}
                      >
                        <Text style={[styles.reportFilterChipText, reportClassGrade === gr && styles.reportFilterChipTextActive]}>{gr}. Sınıflar</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#D97706' }]}
                    onPress={handleExportClassesExcel}
                    disabled={exportingReportType === 'classes'}
                  >
                    {exportingReportType === 'classes' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="albums-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Sınıf & Şube Kapasite Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 4. DERSLER VE YILLIK PLAN DURUMU RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#F0F9FF' }]}>
                      <Ionicons name="book" size={20} color="#0284C7" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📚 Okul Dersleri & Yıllık Plan Durumu</Text>
                      <Text style={styles.reportCardDesc}>
                        Okuldaki derslerin haftalık saatleri ve yıllık plan yükleme durumları.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportFilterLabel}>Plan Yükleme Durumu</Text>
                  <View style={styles.reportSegmentRow}>
                    {[
                      { id: 'all', label: 'Tüm Dersler' },
                      { id: 'has_plan', label: '✅ Planı Yüklü' },
                      { id: 'no_plan', label: '⚠️ Plan Eksik' },
                    ].map((item: any) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.reportSegmentBtn, reportLessonPlanStatus === item.id && styles.reportSegmentBtnActive]}
                        onPress={() => setReportLessonPlanStatus(item.id as any)}
                      >
                        <Text style={[styles.reportSegmentText, reportLessonPlanStatus === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#0284C7' }]}
                    onPress={handleExportLessonsExcel}
                    disabled={exportingReportType === 'lessons'}
                  >
                    {exportingReportType === 'lessons' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="calendar-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Dersler ve Plan Durum Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 5. DERS PROGRAMI VE ÇARŞAF MATRİSİ RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#FAF5FF' }]}>
                      <Ionicons name="calendar" size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📅 Haftalık Ders Programı & Çarşaf Matrisi</Text>
                      <Text style={styles.reportCardDesc}>
                        Sınıf bazlı matris çarşafı ve öğretmenlerin haftalık ders dağılım tablosu.
                      </Text>
                    </View>
                  </View>

                  {/* Gün Filtresi */}
                  <Text style={styles.reportFilterLabel}>Gün Filtresi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    {[
                      { day: 0, label: 'Tüm Hafta (Pzt-Cum)' },
                      { day: 1, label: 'Pazartesi' },
                      { day: 2, label: 'Salı' },
                      { day: 3, label: 'Çarşamba' },
                      { day: 4, label: 'Perşembe' },
                      { day: 5, label: 'Cuma' },
                    ].map((d: any) => (
                      <TouchableOpacity
                        key={d.day}
                        style={[styles.reportFilterChip, reportScheduleDay === d.day && styles.reportFilterChipActive]}
                        onPress={() => setReportScheduleDay(d.day)}
                      >
                        <Text style={[styles.reportFilterChipText, reportScheduleDay === d.day && styles.reportFilterChipTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={handleExportScheduleExcel}
                    disabled={exportingReportType === 'schedules'}
                  >
                    {exportingReportType === 'schedules' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="grid-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Ders Programı & Çarşaf Matrisi İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 6. DERSİN DETAYLI YILLIK KAZANIM PLANI RAPORU */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#FFF7ED' }]}>
                      <Ionicons name="ribbon" size={20} color="#EA580C" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📖 Detaylı Yıllık Müfredat & Kazanım Planı</Text>
                      <Text style={styles.reportCardDesc}>
                        Seçilen dersin 36 haftalık konu, defter metni ve MEB kazanım tablosu.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportFilterLabel}>Ders Seçiniz</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    {lessons.map((lesson: any) => {
                      const isSel = reportSelectedPlanLessonId === lesson.id;
                      const hasPlan = schoolYearlyPlans.some((p: any) => (p.lessonName || '').toLowerCase() === (lesson.name || '').toLowerCase());
                      return (
                        <TouchableOpacity
                          key={lesson.id}
                          style={[styles.reportFilterChip, isSel && styles.reportFilterChipActive]}
                          onPress={() => setReportSelectedPlanLessonId(lesson.id)}
                        >
                          <Text style={[styles.reportFilterChipText, isSel && styles.reportFilterChipTextActive]}>
                            {hasPlan ? '✅ ' : '⚠️ '}{lesson.name} ({lesson.grade ? `${lesson.grade}. Snf` : 'Tüm'})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#EA580C' }]}
                    onPress={() => handleExportYearlyPlanDetailsExcel()}
                    disabled={exportingReportType?.startsWith('plan_')}
                  >
                    {exportingReportType?.startsWith('plan_') ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-attach-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Seçili Dersin Yıllık Planını İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 7. İŞLEM & GÜVENLİK DENETİM LOGLARI RAPORU */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons name="shield-checkmark" size={20} color="#334155" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📜 Sistem Denetim & Güvenlik Logları</Text>
                      <Text style={styles.reportCardDesc}>
                        Oturum açma, güncelleme ve silme hareketlerinin IP ve tarihli dökümü.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.reportFilterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportFilterLabel}>Rol Filtresi</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'SCHOOL_ADMIN', label: 'Admin' },
                          { id: 'TEACHER', label: 'Öğretmen' },
                        ].map((item: any) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportAuditRole === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportAuditRole(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportAuditRole === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.reportFilterLabel}>İşlem Türü</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'LOGIN', label: 'Giriş' },
                          { id: 'UPDATE', label: 'Düzenleme' },
                        ].map((item: any) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportAuditAction === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportAuditAction(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportAuditAction === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#334155' }]}
                    onPress={handleExportAuditLogsExcel}
                    disabled={exportingReportType === 'audit_logs'}
                  >
                    {exportingReportType === 'audit_logs' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="newspaper-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Denetim Logları Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 7. ŞİFRE VE SİSTEM ERİŞİM RAPORLARI KARTI */}
                <View style={[styles.reportSectionCard, { borderColor: '#818CF8', borderWidth: 1.5 }]}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="key" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.reportCardTitle}>🔐 Şifre ve Sistem Erişim Raporları</Text>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>YENİ</Text>
                        </View>
                      </View>
                      <Text style={styles.reportCardDesc}>
                        Öğretmenler, öğrenciler ve veliler için sistem giriş kimlikleri, okul kodları ve başlangıç şifre dökümleri.
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 10, marginTop: 6 }}>
                    {/* Öğretmen Şifreleri */}
                    <TouchableOpacity
                      style={[styles.exportActionBtn, { backgroundColor: '#4F46E5', paddingVertical: 12 }]}
                      onPress={handleExportTeacherCredentials}
                      disabled={exportingReportType === 'teacher_credentials'}
                      activeOpacity={0.88}
                    >
                      {exportingReportType === 'teacher_credentials' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="person-circle-outline" size={20} color="#fff" />
                          <View style={{ flex: 1, marginLeft: 4 }}>
                            <Text style={styles.exportActionBtnText}>Öğretmen Şifre Excel Raporu (.xlsx)</Text>
                            <Text style={{ fontSize: 10, color: '#C7D2FE', marginTop: 1 }}>Kullanıcı adı, okul kodu, branş ve başlangıç şifresi (1234)</Text>
                          </View>
                          <Ionicons name="download-outline" size={17} color="#fff" />
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Öğrenci Şifreleri */}
                    <TouchableOpacity
                      style={[styles.exportActionBtn, { backgroundColor: '#059669', paddingVertical: 12 }]}
                      onPress={handleExportStudentCredentials}
                      disabled={exportingReportType === 'student_credentials'}
                      activeOpacity={0.88}
                    >
                      {exportingReportType === 'student_credentials' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="school-outline" size={20} color="#fff" />
                          <View style={{ flex: 1, marginLeft: 4 }}>
                            <Text style={styles.exportActionBtnText}>Öğrenci Şifre Excel Raporu (.xlsx)</Text>
                            <Text style={{ fontSize: 10, color: '#A7F3D0', marginTop: 1 }}>Öğrenci no, sınıf-şube, okul kodu ve portal şifresi (aaaa_no)</Text>
                          </View>
                          <Ionicons name="download-outline" size={17} color="#fff" />
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Veli Şifreleri */}
                    <TouchableOpacity
                      style={[styles.exportActionBtn, { backgroundColor: '#D97706', paddingVertical: 12 }]}
                      onPress={handleExportParentCredentials}
                      disabled={exportingReportType === 'parent_credentials'}
                      activeOpacity={0.88}
                    >
                      {exportingReportType === 'parent_credentials' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="people-outline" size={20} color="#fff" />
                          <View style={{ flex: 1, marginLeft: 4 }}>
                            <Text style={styles.exportActionBtnText}>Veli Bilgilendirme & Şifre Excel Raporu (.xlsx)</Text>
                            <Text style={{ fontSize: 10, color: '#FDE68A', marginTop: 1 }}>Veli adı, telefon, öğrenci no ve veli erişim şifresi dökümü</Text>
                          </View>
                          <Ionicons name="download-outline" size={17} color="#fff" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
  );
}
