import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';

import { apiRequest, saveAuthToken, getActiveUserSession, clearAuthSession } from '../services/apiClient';
import { logoutUserRole } from '../utils/roleService';
import { fetchStudentPortalFeed } from '../services/syncService';
import { markMessageAsRead, markAllMessagesAsRead, setCachedUnreadCount } from '../services/messageNotificationService';
import { FloatingMessageBubble } from '../components/FloatingMessageBubble';
import { fetchStudentExamSeatings } from '../database/operations/examPlannerOperations';
import { OptikModuleView } from '../components/OptikModuleView';

interface StudentDashboardScreenProps {
  onLogout: () => void;
  initialMode?: 'student' | 'parent';
}

type PortalTab = 'schedule' | 'exam_seatings' | 'optik_results' | 'teachers' | 'assignments' | 'quizzes' | 'evaluations' | 'messages';

const DAYS = [
  { day: 1, label: 'Pazartesi' },
  { day: 2, label: 'Salı' },
  { day: 3, label: 'Çarşamba' },
  { day: 4, label: 'Perşembe' },
  { day: 5, label: 'Cuma' },
];

export function StudentDashboardScreen({ onLogout, initialMode = 'student' }: StudentDashboardScreenProps) {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Giriş Modu: 'student' veya 'parent'
  const [loginMode, setLoginMode] = useState<'student' | 'parent'>(initialMode);
  const [schoolCode, setSchoolCode] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Portal Verileri
  const [feed, setFeed] = useState<{
    student: any;
    assignments: any[];
    evaluations: any[];
    schedules?: any[];
    teachers?: any[];
    announcements?: any[];
    unreadCount?: number;
  } | null>(null);

  // Aktif Sekme
  const [activeTab, setActiveTab] = useState<PortalTab>('schedule');

  // Gün Seçici (1: Pzt ... 5: Cum)
  const currentDayIndex = new Date().getDay(); // 0: Pzr, 1: Pzt ... 5: Cum, 6: Cts
  const defaultDay = currentDayIndex >= 1 && currentDayIndex <= 5 ? currentDayIndex : 1;
  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);

  // Şifre Değiştirme Modalı
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Yazılı Sınav Oturma Yerleri State
  const [examSeatings, setExamSeatings] = useState<any[]>([]);

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    setLoading(true);
    try {
      const active = await getActiveUserSession();
      if (active && (active.role === 'STUDENT' || active.role === 'PARENT')) {
        setSession(active);
        await loadPortalData(active.userId, active.role);
        if (active.schoolId && active.username) {
          fetchStudentExamSeatings(active.schoolId, active.username).then(setExamSeatings);
        }
      }
    } catch (e) {
      console.warn('Oturum denetimi hatası:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPortalData = async (studentId: string, role?: string) => {
    try {
      const activeRole = role || session?.role || (loginMode === 'parent' ? 'PARENT' : 'STUDENT');
      const data = await fetchStudentPortalFeed(studentId, activeRole);
      setFeed(data);
      if (data?.student?.studentNumber && (session?.schoolId || data?.student?.schoolId)) {
        const sId = session?.schoolId || data.student.schoolId;
        const seatings = await fetchStudentExamSeatings(sId, data.student.studentNumber);
        setExamSeatings(seatings);
      }
    } catch (e: any) {
      console.warn('Portal verisi çekilemedi:', e?.message || e);
    } finally {
      setRefreshing(false);
    }
  };

  // KVKK Uyumlu Giriş: Okul Kodu + OgrenciNo veya Veli Tel + Şifre
  const handleStudentLogin = async () => {
    if (!schoolCode.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen Okul Kodunuzu giriniz.');
      return;
    }
    if (!studentNumber.trim()) {
      Alert.alert(
        'Eksik Bilgi',
        loginMode === 'parent'
          ? 'Lütfen Veli Telefon Numarası veya Öğrenci Numarasını giriniz.'
          : 'Lütfen Öğrenci Numaranızı giriniz.'
      );
      return;
    }
    if (!password.trim()) {
      const defHint = loginMode === 'parent' ? 'vvv_öğrencino' : 'ooo_öğrencino';
      Alert.alert('Eksik Bilgi', `Lütfen şifrenizi giriniz. (Varsayılan: ${defHint})`);
      return;
    }

    setLoggingIn(true);
    try {
      const res = await apiRequest('auth/student-login', 'POST', {
        schoolCode: schoolCode.trim(),
        studentNumber: studentNumber.trim(),
        password: password.trim(),
        loginType: loginMode === 'parent' ? 'PARENT' : 'STUDENT',
      });

      if (res.success && res.data) {
        await saveAuthToken(res.data.token, res.data);
        setSession(res.data);
        await loadPortalData(res.data.userId, res.data.role);
      } else {
        Alert.alert('Giriş Başarısız', res.error || 'Girdiğiniz bilgileri kontrol ediniz.');
      }
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e?.message || 'Giriş yapılırken bir hata oluştu.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      await logoutUserRole();
      await clearAuthSession();
      setSession(null);
      setFeed(null);
      onLogout();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
      }
    };

    if (Platform.OS === 'web') {
      await doLogout();
    } else {
      Alert.alert('Çıkış Yap', 'Oturumunuz kapatılacaktır, emin misiniz?', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Çıkış Yap', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword.trim() || !newPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen mevcut ve yeni şifrenizi girin.');
      return;
    }

    setChangingPass(true);
    try {
      const res = await apiRequest('auth/change-password', 'POST', {
        oldPassword: oldPassword.trim(),
        newPassword: newPassword.trim(),
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Şifreniz başarıyla güncellendi.');
        setChangePasswordModal(false);
        setOldPassword('');
        setNewPassword('');
      } else {
        Alert.alert('Hata', res.error || 'Şifre değiştirilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Şifre değiştirilirken hata oluştu.');
    } finally {
      setChangingPass(false);
    }
  };

  // Mesajı okundu işaretle
  const handleMarkMessageRead = async (messageId: string) => {
    await markMessageAsRead(messageId);
    if (feed && feed.announcements) {
      const updated = feed.announcements.map((a) =>
        a.id === messageId ? { ...a, isRead: true } : a
      );
      const newUnread = updated.filter((a) => !a.isRead).length;
      setFeed({
        ...feed,
        announcements: updated,
        unreadCount: newUnread,
      });
      setCachedUnreadCount(newUnread);
    }
  };

  // Tüm mesajları okundu yap
  const handleMarkAllMessagesRead = async (silent: boolean = false) => {
    const sId = session?.schoolId || feed?.student?.schoolId;
    await markAllMessagesAsRead(sId ? String(sId) : undefined);
    setCachedUnreadCount(0);
    if (feed && feed.announcements) {
      setFeed((prev: any) =>
        prev
          ? {
              ...prev,
              announcements: prev.announcements?.map((a: any) => ({ ...a, isRead: true })) || [],
              unreadCount: 0,
            }
          : prev
      );
    }
    if (!silent) {
      Alert.alert('Başarılı', 'Tüm mesajlar okundu olarak işaretlendi.');
    }
  };

  // Mesajlar sekmesine geçildiğinde tüm mesajları otomatik okundu yap
  useEffect(() => {
    if (activeTab === 'messages') {
      handleMarkAllMessagesRead(true);
    }
  }, [activeTab]);

  // Filtrelemeler
  const student = feed?.student;
  const assignments = feed?.assignments || [];
  const evaluations = feed?.evaluations || [];
  const rawSchedules = feed?.schedules || [];
  const teachers = feed?.teachers || [];
  const announcements = feed?.announcements || [];

  // Quizler (Type == 'QUIZ' veya Score tanımlı olanlar)
  const quizzes = useMemo(() => {
    return evaluations.filter(
      (e) => String(e.type || '').toUpperCase() === 'QUIZ' || (e.score !== undefined && e.score !== null)
    );
  }, [evaluations]);

  // Öğretmen Görüşleri (Pedagojik Notlar)
  const teacherNotes = useMemo(() => {
    return evaluations.filter((e) => String(e.type || '').toUpperCase() !== 'QUIZ');
  }, [evaluations]);

  // Seçili günün dersleri
  const dayLessons = useMemo(() => {
    return rawSchedules
      .filter((s) => Number(s.dayOfWeek || s.day_of_week) === selectedDay)
      .sort((a, b) => Number(a.lessonHour || a.lesson_hour) - Number(b.lessonHour || b.lesson_hour));
  }, [rawSchedules, selectedDay]);

  // Okunmamış mesaj sayısı
  const unreadCount = useMemo(() => {
    const listCount = announcements.filter((a) => !a.isRead).length;
    return typeof feed?.unreadCount === 'number' ? feed.unreadCount : listCount;
  }, [announcements, feed?.unreadCount]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
          Portal Yükleniyor...
        </Text>
      </View>
    );
  }

  // ==========================================
  // 1. GİRİŞ EKRANI (ÖĞRENCİ & VELİ)
  // ==========================================
  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loginHeader}>
          <View style={styles.brandBadge}>
            <Ionicons name="school" size={32} color="#fff" />
          </View>
          <Text style={styles.brandTitle}>Öğrenci & Veli Portalı</Text>
          <Text style={styles.brandSubtitle}>
            Ders programı, ödevler, quizler, öğretmen görüşleri ve okul anonsları
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.loginCard} keyboardShouldPersistTaps="handled">
          {/* Giriş Modu Seçici (Öğrenci / Veli) */}
          <View style={styles.modeSwitchWrap}>
            <TouchableOpacity
              style={[styles.modeSwitchBtn, loginMode === 'student' && styles.modeSwitchBtnActive]}
              onPress={() => setLoginMode('student')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="school-outline"
                size={16}
                color={loginMode === 'student' ? '#059669' : '#64748B'}
              />
              <Text style={[styles.modeSwitchText, loginMode === 'student' && styles.modeSwitchTextActive]}>
                Öğrenci Girişi
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeSwitchBtn, loginMode === 'parent' && styles.modeSwitchBtnActive]}
              onPress={() => setLoginMode('parent')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color={loginMode === 'parent' ? '#059669' : '#64748B'}
              />
              <Text style={[styles.modeSwitchText, loginMode === 'parent' && styles.modeSwitchTextActive]}>
                Veli Girişi
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Okul Kodu</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Örn: OKL-10001"
            placeholderTextColor="#94A3B8"
            value={schoolCode}
            onChangeText={setSchoolCode}
            autoCapitalize="characters"
          />

          <Text style={styles.inputLabel}>
            {loginMode === 'parent' ? 'Veli Telefon No veya Öğrenci No' : 'Öğrenci Numarası'}
          </Text>
          <TextInput
            style={styles.inputField}
            placeholder={loginMode === 'parent' ? 'Örn: 0532... veya 1042' : 'Örn: 1042'}
            placeholderTextColor="#94A3B8"
            value={studentNumber}
            onChangeText={(val) => {
              setStudentNumber(val);
              if (!password) setPassword(`aaaa_${val.trim()}`);
            }}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Şifre</Text>
          <TextInput
            style={styles.inputField}
            placeholder={loginMode === 'parent' ? 'Varsayılan: vvv_öğrencino' : 'Varsayılan: ooo_öğrencino'}
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <View style={styles.kvkkBox}>
            <Ionicons name="shield-checkmark" size={16} color="#059669" style={{ marginTop: 1 }} />
            <Text style={styles.kvkkText}>
              <Text style={{ fontWeight: '700' }}>KVKK Güvencesi: </Text>
              Sistemde TC Kimlik No tutulmamaktadır. İlk giriş şifreniz okulunuz tarafından {loginMode === 'parent' ? '"vvv_öğrencino"' : '"ooo_öğrencino"'} olarak tanımlanmıştır.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleStudentLogin}
            disabled={loggingIn}
            activeOpacity={0.85}
          >
            {loggingIn ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>
                {loginMode === 'parent' ? 'Veli Portalı Girişi' : 'Öğrenci Portalı Girişi'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backRoleButton} onPress={onLogout} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={16} color="#64748B" />
            <Text style={styles.backRoleText}>Rol Seçimine Geri Dön</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ==========================================
  // 2. PORTAL ANA EKRANI (DASHBOARD)
  // ==========================================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Profil Başlığı */}
      <View style={styles.portalHeader}>
        <View style={styles.profileRow}>
          <View style={styles.studentAvatarWrap}>
            {student?.photoPath ? (
              <Image source={{ uri: student.photoPath }} style={styles.studentAvatarImg} />
            ) : (
              <View style={styles.studentAvatarPlaceholder}>
                <Text style={styles.avatarLetter}>{session.fullName?.[0] || 'Ö'}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.portalStudentName}>
                {session.role === 'PARENT'
                  ? (student?.parentName || session.fullName || `${student?.fullName || 'Öğrenci'} Velisi`)
                  : (student?.fullName || session.fullName)}
              </Text>
              <View
                style={[
                  styles.roleBadgePill,
                  session.role === 'PARENT' && { backgroundColor: '#DBEAFE' },
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgePillText,
                    session.role === 'PARENT' && { color: '#1E40AF' },
                  ]}
                >
                  {session.role === 'PARENT' ? '👨‍👩‍👧 Veli Portalı' : '🎓 Öğrenci'}
                </Text>
              </View>
            </View>
            <Text style={styles.portalStudentSub}>
              {session.role === 'PARENT'
                ? `Öğrenci: ${student?.fullName || ''} (${student?.grade ? `${student.grade}-${student.section || ''} • ` : ''}No: ${student?.studentNumber || session.username})`
                : `${student?.grade ? `${student.grade}-${student.section || ''} Şubesi • ` : ''}No: ${student?.studentNumber || session.username}`}
            </Text>
            <Text style={styles.portalSchoolName} numberOfLines={1}>
              🏫 {session.schoolName || 'Kurum Okulu'}
            </Text>
          </View>

          {/* Aksiyon İkonları (Mesaj Baloncuğu + Şifre + Çıkış) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              onPress={() => setActiveTab('messages')}
              style={styles.settingsIconBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'messages' ? 'chatbubbles' : 'chatbubbles-outline'}
                size={22}
                color={unreadCount > 0 ? '#4F46E5' : '#64748B'}
              />
              {unreadCount > 0 && (
                <View style={styles.unreadHeaderBadge}>
                  <Text style={styles.unreadHeaderBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setChangePasswordModal(true)}
              style={styles.settingsIconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="key-outline" size={20} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogout} style={styles.settingsIconBtn} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 💬 OKUNMAMIŞ MESAJ UYARI BALONCUĞU / BİLDİRİMİ */}
        {unreadCount > 0 && activeTab !== 'messages' && (
          <TouchableOpacity
            style={styles.unreadNotificationCard}
            onPress={() => setActiveTab('messages')}
            activeOpacity={0.85}
          >
            <View style={styles.unreadNotificationBadgeIcon}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.unreadNotificationTitle}>
                  {unreadCount} Yeni Okunmamış İdare Anonsu / Mesajınız Var!
                </Text>
                <View style={styles.livePulseDot} />
              </View>
              <Text style={styles.unreadNotificationSubtitle}>
                Okul yönetimi ve öğretmenlerden gelen duyuruları okumak için dokunun.
              </Text>
            </View>
            <View style={styles.unreadNotificationActionBtn}>
              <Text style={styles.unreadNotificationActionText}>Gör</Text>
              <Ionicons name="chevron-forward" size={14} color="#4F46E5" />
            </View>
          </TouchableOpacity>
        )}

        {/* YATAY KAYDIRILABİLİR PORTAL SEKME ÇUBUĞU */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.portalTabsScroll}
        >
          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'schedule' && styles.portalTabActive]}
            onPress={() => setActiveTab('schedule')}
          >
            <Ionicons
              name={activeTab === 'schedule' ? 'calendar' : 'calendar-outline'}
              size={16}
              color={activeTab === 'schedule' ? '#059669' : '#64748B'}
            />
            <Text style={[styles.portalTabText, activeTab === 'schedule' && styles.portalTabTextActive]}>
              Ders Programı
            </Text>
          </TouchableOpacity>

          {/* 📝 YAZILI SINAV OTURMA YERLERİ SEKMESİ */}
          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'exam_seatings' && styles.portalTabActive]}
            onPress={() => setActiveTab('exam_seatings')}
          >
            <Ionicons
              name={activeTab === 'exam_seatings' ? 'school' : 'school-outline'}
              size={16}
              color={activeTab === 'exam_seatings' ? '#7C3AED' : '#64748B'}
            />
            <Text
              style={[
                styles.portalTabText,
                activeTab === 'exam_seatings' && { color: '#7C3AED', fontWeight: '800' },
              ]}
            >
              Sınav Yerlerim {examSeatings.length > 0 ? `(${examSeatings.length})` : ''}
            </Text>
          </TouchableOpacity>

          {/* 🎯 OPTİK DENEME SINAVI SONUÇLARI & KAZANIM KARNESİ SEKMESİ */}
          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'optik_results' && styles.portalTabActive]}
            onPress={() => setActiveTab('optik_results')}
          >
            <Ionicons
              name={activeTab === 'optik_results' ? 'analytics' : 'analytics-outline'}
              size={16}
              color={activeTab === 'optik_results' ? '#2563EB' : '#64748B'}
            />
            <Text
              style={[
                styles.portalTabText,
                activeTab === 'optik_results' && { color: '#2563EB', fontWeight: '800' },
              ]}
            >
              🎯 Deneme & Optik Karnem
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'teachers' && styles.portalTabActive]}
            onPress={() => setActiveTab('teachers')}
          >
            <Ionicons
              name={activeTab === 'teachers' ? 'people' : 'people-outline'}
              size={16}
              color={activeTab === 'teachers' ? '#059669' : '#64748B'}
            />
            <Text style={[styles.portalTabText, activeTab === 'teachers' && styles.portalTabTextActive]}>
              Öğretmenler ({teachers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'assignments' && styles.portalTabActive]}
            onPress={() => setActiveTab('assignments')}
          >
            <Ionicons
              name={activeTab === 'assignments' ? 'document-text' : 'document-text-outline'}
              size={16}
              color={activeTab === 'assignments' ? '#059669' : '#64748B'}
            />
            <Text style={[styles.portalTabText, activeTab === 'assignments' && styles.portalTabTextActive]}>
              Ödevler ({assignments.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'quizzes' && styles.portalTabActive]}
            onPress={() => setActiveTab('quizzes')}
          >
            <Ionicons
              name={activeTab === 'quizzes' ? 'trophy' : 'trophy-outline'}
              size={16}
              color={activeTab === 'quizzes' ? '#059669' : '#64748B'}
            />
            <Text style={[styles.portalTabText, activeTab === 'quizzes' && styles.portalTabTextActive]}>
              Quiz & Sınavlar ({quizzes.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'evaluations' && styles.portalTabActive]}
            onPress={() => setActiveTab('evaluations')}
          >
            <Ionicons
              name={activeTab === 'evaluations' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={16}
              color={activeTab === 'evaluations' ? '#059669' : '#64748B'}
            />
            <Text style={[styles.portalTabText, activeTab === 'evaluations' && styles.portalTabTextActive]}>
              Görüşler ({teacherNotes.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'messages' && styles.portalTabActive]}
            onPress={() => setActiveTab('messages')}
          >
            <Ionicons
              name={activeTab === 'messages' ? 'megaphone' : 'megaphone-outline'}
              size={16}
              color={activeTab === 'messages' ? '#4F46E5' : '#64748B'}
            />
            <Text
              style={[
                styles.portalTabText,
                activeTab === 'messages' && { color: '#4F46E5', fontWeight: '800' },
              ]}
            >
              Anons & Mesajlar ({announcements.length})
            </Text>
            {unreadCount > 0 && (
              <View style={styles.tabBadgeBubble}>
                <Text style={styles.tabBadgeBubbleText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* PORTAL İÇERİK ALANI */}
      <ScrollView
        contentContainerStyle={styles.portalContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadPortalData(session.userId);
            }}
          />
        }
      >
        {/* ===================================== */}
        {/* TAB 1: KENDİ SINIFINA AİT DERS PROGRAMI */}
        {/* ===================================== */}
        {activeTab === 'schedule' && (
          <View>
            {/* Ortak Yazılı Sınav Oturma Yeri Hızlı Bilgi Kartı */}
            {examSeatings.length > 0 && (
              <TouchableOpacity
                style={{
                  backgroundColor: '#F5F3FF',
                  borderWidth: 1.5,
                  borderColor: '#DDD6FE',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() => setActiveTab('exam_seatings')}
                activeOpacity={0.85}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#EDE9FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="school" size={24} color="#7C3AED" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#6D28D9' }}>
                      Ortak Yazılı Sınavı Oturma Yeriniz Belli Oldu!
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#7C3AED', marginTop: 2 }}>
                    {examSeatings[0].examName} • {examSeatings[0].roomName} Salonu, Sıra: {examSeatings[0].seatNumber}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
              </TouchableOpacity>
            )}

            {/* Gün Seçici Çubuk */}
            <View style={styles.daySelectorRow}>
              {DAYS.map((d) => {
                const isSelected = selectedDay === d.day;
                return (
                  <TouchableOpacity
                    key={d.day}
                    style={[styles.dayTab, isSelected && styles.dayTabActive]}
                    onPress={() => setSelectedDay(d.day)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayTabText, isSelected && styles.dayTabTextActive]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sınıf Bilgisi */}
            <View style={styles.scheduleInfoBanner}>
              <Ionicons name="information-circle" size={16} color="#059669" />
              <Text style={styles.scheduleInfoBannerText}>
                {student?.grade ? `${student.grade}-${student.section || ''} Sınıfı ` : ''}
                Haftalık Ders Çizelgesi
              </Text>
            </View>

            {/* Ders Listesi */}
            {dayLessons.length === 0 ? (
              <View style={styles.emptyPortal}>
                <Ionicons name="calendar-outline" size={52} color="#94A3B8" />
                <Text style={styles.emptyPortalTitle}>Bu Gün İçin Ders Yok</Text>
                <Text style={styles.emptyPortalSub}>
                  {DAYS.find((d) => d.day === selectedDay)?.label} gününde kayıtlı ders bulunamadı.
                </Text>
              </View>
            ) : (
              dayLessons.map((lesson, idx) => (
                <View key={lesson.id || idx} style={styles.scheduleCard}>
                  <View style={styles.lessonHourBadge}>
                    <Text style={styles.lessonHourText}>{lesson.lessonHour || idx + 1}. Ders</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.scheduleLessonName}>
                      {lesson.lessonName || 'Ders'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <Text style={styles.scheduleTeacherName}>
                        👨‍🏫 {lesson.teacherName || 'Öğretmen Belirtilmedi'}
                      </Text>
                      {lesson.classroom ? (
                        <View style={styles.classroomBadge}>
                          <Ionicons name="location-outline" size={11} color="#64748B" />
                          <Text style={styles.classroomText}>{lesson.classroom}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ===================================== */}
        {/* TAB 1.5: YAZILI SINAV OTURMA YERLERİ */}
        {/* ===================================== */}
        {activeTab === 'exam_seatings' && (
          <View>
            <View style={styles.sectionHeaderCard}>
              <Text style={styles.sectionHeaderTitle}>📋 Ortak Yazılı Sınavı Oturma Yerleri</Text>
              <Text style={styles.sectionHeaderSub}>
                Okul yönetimi tarafından kelebek sistemiyle belirlenmiş güncel sınav salonu ve sıra numaranız.
              </Text>
            </View>

            {examSeatings.length === 0 ? (
              <View style={styles.emptyPortal}>
                <Ionicons name="school-outline" size={52} color="#94A3B8" />
                <Text style={styles.emptyPortalTitle}>Tanımlı Sınav Oturma Yeri Bulunamadı</Text>
                <Text style={styles.emptyPortalSub}>
                  Şu an için adınıza tanımlanmış aktif bir ortak yazılı sınav oturma yeri bulunmuyor. İdareniz planlamayı tamamladığında burada görüntülenecektir.
                </Text>
              </View>
            ) : (
              examSeatings.map((seat: any, idx: number) => (
                <View
                  key={seat.id || idx}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 14,
                    borderWidth: 1.5,
                    borderColor: '#DDD6FE',
                    shadowColor: '#7C3AED',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#7C3AED' }}>{seat.examName}</Text>
                    </View>
                    <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>
                        📅 {seat.examDate} ({seat.dayOfWeekStr})
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}>
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        backgroundColor: '#7C3AED',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#EDE9FE' }}>SIRA NO</Text>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF' }}>{seat.seatNumber}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                        🚪 {seat.roomName} Salonu
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#4F46E5', marginTop: 2 }}>
                        📖 {seat.lessonName}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        ⏰ {seat.lessonHour} {seat.startTime ? `(${seat.startTime})` : ''}
                      </Text>
                    </View>
                  </View>

                  {seat.proctorTeacherName ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 12,
                        paddingTop: 10,
                        borderTopWidth: 1,
                        borderTopColor: '#F1F5F9',
                      }}
                    >
                      <Ionicons name="person-circle-outline" size={16} color="#64748B" />
                      <Text style={{ fontSize: 12, color: '#64748B' }}>Salon Gözetmeni:</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                        {seat.proctorTeacherName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        )}

        {/* ======================================================= */}
        {/* TAB: OPTİK DENEME SINAVI SONUÇLARI & KAZANIM KARNESİ    */}
        {/* ======================================================= */}
        {activeTab === 'optik_results' && (
          <OptikModuleView
            schoolId={session?.schoolId || student?.schoolId}
            mode="student"
            studentNumber={student?.studentNumber || session?.username}
          />
        )}

        {/* ===================================== */}
        {/* TAB 2: DERS ÖĞRETMENLERİ KADROSU     */}
        {/* ===================================== */}
        {activeTab === 'teachers' && (
          <View>
            <View style={styles.sectionHeaderCard}>
              <Text style={styles.sectionHeaderTitle}>👨‍🏫 Sınıf Ders Öğretmenleri</Text>
              <Text style={styles.sectionHeaderSub}>
                {student?.grade ? `${student.grade}-${student.section || ''} sınıfına ` : 'Sınıfınıza '}
                giren tüm branş öğretmenleri listelenmektedir.
              </Text>
            </View>

            {teachers.length === 0 ? (
              <View style={styles.emptyPortal}>
                <Ionicons name="people-outline" size={52} color="#94A3B8" />
                <Text style={styles.emptyPortalTitle}>Öğretmen Bilgisi Bulunamadı</Text>
                <Text style={styles.emptyPortalSub}>
                  Ders programından öğretmen kadrosu otomatik eşleştirilecektir.
                </Text>
              </View>
            ) : (
              teachers.map((t, idx) => (
                <View key={idx} style={styles.teacherCard}>
                  <View style={styles.teacherAvatarCircle}>
                    <Text style={styles.teacherAvatarLetter}>
                      {t.teacherName?.[0] || 'Ö'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.teacherCardName}>{t.teacherName}</Text>
                    <View style={styles.teacherLessonsPill}>
                      <Ionicons name="book-outline" size={12} color="#4F46E5" />
                      <Text style={styles.teacherLessonsText}>{t.lessons || 'Ders'}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ===================================== */}
        {/* TAB 3: ÖDEVLER                        */}
        {/* ===================================== */}
        {activeTab === 'assignments' && (
          assignments.length === 0 ? (
            <View style={styles.emptyPortal}>
              <Ionicons name="checkmark-circle-outline" size={56} color="#10B981" />
              <Text style={styles.emptyPortalTitle}>Tebrikler!</Text>
              <Text style={styles.emptyPortalSub}>Şu anda bekleyen ödeviniz bulunmuyor.</Text>
            </View>
          ) : (
            assignments.map((item) => {
              const status = item.submission?.status;
              const isDone = status === 'DONE';
              const isNotDone = status === 'NOT_DONE';
              const isMissing = status === 'MISSING';

              return (
                <View key={item.id} style={styles.assignmentCard}>
                  <View style={styles.assignmentHeader}>
                    <View style={styles.lessonTag}>
                      <Text style={styles.lessonTagText}>{item.lessonName}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        isDone
                          ? styles.statusPillDone
                          : isNotDone
                          ? styles.statusPillNotDone
                          : isMissing
                          ? styles.statusPillMissing
                          : { backgroundColor: '#F1F5F9' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          isDone && { color: '#059669' },
                          isNotDone && { color: '#DC2626' },
                          isMissing && { color: '#D97706' },
                        ]}
                      >
                        {isDone ? 'Yapıldı' : isNotDone ? 'Yapılmadı' : isMissing ? 'Eksik' : 'Bekliyor'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.assignmentTitle}>{item.title}</Text>
                  {item.description && (
                    <Text style={styles.assignmentDesc}>{item.description}</Text>
                  )}

                  {item.submission?.feedback && (
                    <View style={styles.feedbackBox}>
                      <Text style={styles.feedbackTitle}>💬 Öğretmen Geri Bildirimi:</Text>
                      <Text style={styles.feedbackText}>{item.submission.feedback}</Text>
                    </View>
                  )}

                  <View style={styles.assignmentFooter}>
                    <Text style={styles.footerTeacher}>👨‍🏫 {item.teacherName}</Text>
                    <Text style={styles.footerDue}>
                      📅 Son: {new Date(item.dueDate).toLocaleDateString('tr-TR')}
                    </Text>
                  </View>
                </View>
              );
            })
          )
        )}

        {/* ===================================== */}
        {/* TAB 4: QUİZ & SINAVLAR (ÖĞRETMEN İZİNLİ) */}
        {/* ===================================== */}
        {activeTab === 'quizzes' && (
          quizzes.length === 0 ? (
            <View style={styles.emptyPortal}>
              <Ionicons name="trophy-outline" size={56} color="#94A3B8" />
              <Text style={styles.emptyPortalTitle}>Henüz Quiz / Sınav Notu Yok</Text>
              <Text style={styles.emptyPortalSub}>
                Öğretmeniniz quiz ve sınav sonuçlarını sizinle paylaştığında burada listelenecektir.
              </Text>
            </View>
          ) : (
            quizzes.map((quiz) => (
              <View key={quiz.id} style={styles.quizCard}>
                <View style={styles.quizHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quizTitle}>{quiz.title || 'Quiz / Sınav Değerlendirmesi'}</Text>
                    <Text style={styles.quizTeacher}>👨‍🏫 {quiz.teacherName}</Text>
                  </View>
                  {quiz.score !== undefined && quiz.score !== null && (
                    <View style={styles.quizScoreBadge}>
                      <Text style={styles.quizScoreText}>{quiz.score} Puan</Text>
                    </View>
                  )}
                </View>

                {quiz.content ? (
                  <Text style={styles.quizContent}>{quiz.content}</Text>
                ) : null}

                <View style={styles.quizFooter}>
                  <Text style={styles.quizDate}>
                    📅 {new Date(quiz.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
              </View>
            ))
          )
        )}

        {/* ===================================== */}
        {/* TAB 5: ÖĞRETMEN GÖRÜŞLERİ             */}
        {/* ===================================== */}
        {activeTab === 'evaluations' && (
          teacherNotes.length === 0 ? (
            <View style={styles.emptyPortal}>
              <Ionicons name="chatbubble-ellipses-outline" size={56} color="#94A3B8" />
              <Text style={styles.emptyPortalTitle}>Henüz Öğretmen Görüşü Yok</Text>
              <Text style={styles.emptyPortalSub}>
                Öğretmenleriniz veli ve öğrenciyle paylaştığı pedagojik görüşler burada görüntülenecektir.
              </Text>
            </View>
          ) : (
            teacherNotes.map((evalItem) => (
              <View key={evalItem.id} style={styles.evalCard}>
                <View style={styles.evalCardHeader}>
                  <Text style={styles.evalTeacherName}>👨‍🏫 {evalItem.teacherName}</Text>
                  <Text style={styles.evalDateText}>
                    {new Date(evalItem.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Text style={styles.evalBody}>{evalItem.content}</Text>
              </View>
            ))
          )
        )}

        {/* ===================================== */}
        {/* TAB 6: İDARE ANONSLARI & MESAJLAR     */}
        {/* ===================================== */}
        {activeTab === 'messages' && (
          <View>
            {/* Üst İşlem Butonları */}
            {announcements.length > 0 && unreadCount > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                <TouchableOpacity
                  style={styles.markAllReadBtn}
                  onPress={() => handleMarkAllMessagesRead()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-done" size={15} color="#4F46E5" />
                  <Text style={styles.markAllReadText}>Tümünü Okundu İşaretle</Text>
                </TouchableOpacity>
              </View>
            )}

            {announcements.length === 0 ? (
              <View style={styles.emptyPortal}>
                <Ionicons name="mail-outline" size={56} color="#94A3B8" />
                <Text style={styles.emptyPortalTitle}>Henüz Mesaj veya Duyuru Yok</Text>
                <Text style={styles.emptyPortalSub}>
                  Okul idaresi veya öğretmenlerinizden gelen anonslar burada gösterilecektir.
                </Text>
              </View>
            ) : (
              announcements.map((msg) => {
                const isUnread = !msg.isRead;
                return (
                  <TouchableOpacity
                    key={msg.id}
                    style={[styles.messageCard, isUnread && styles.messageCardUnread]}
                    onPress={() => isUnread && handleMarkMessageRead(msg.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.messageCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View
                          style={[
                            styles.senderIconCircle,
                            msg.senderRole === 'ADMIN' ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#EEF2FF' },
                          ]}
                        >
                          <Ionicons
                            name={msg.senderRole === 'ADMIN' ? 'megaphone' : 'chatbubble-ellipses'}
                            size={16}
                            color={msg.senderRole === 'ADMIN' ? '#DC2626' : '#4F46E5'}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.messageSenderName}>
                            {msg.senderName || (msg.senderRole === 'ADMIN' ? 'Okul İdaresi' : 'Öğretmen')}
                          </Text>
                          <Text style={styles.messageSenderRole}>
                            {msg.senderRole === 'ADMIN' ? '📢 Okul İdaresi Duyurusu' : '👨‍🏫 Öğretmen Mesajı'}
                          </Text>
                        </View>
                      </View>

                      {isUnread && (
                        <View style={styles.unreadTagPill}>
                          <Text style={styles.unreadTagText}>YENİ</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.messageBody}>{msg.content}</Text>

                    <View style={styles.messageFooter}>
                      <Text style={styles.messageTargetText}>
                        🎯 Hedef: {msg.targetDescription || msg.targetRole || 'Kurum'}
                      </Text>
                      <Text style={styles.messageDateText}>
                        {new Date(msg.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ŞİFRE DEĞİŞTİRME MODALI */}
      <Modal visible={changePasswordModal} animationType="fade" transparent onRequestClose={() => setChangePasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons
                  name={session?.role === 'PARENT' ? 'people' : 'school'}
                  size={20}
                  color={session?.role === 'PARENT' ? '#2563EB' : '#059669'}
                />
                <Text style={styles.modalTitle}>
                  {session?.role === 'PARENT' ? 'Veli Şifresini Değiştir' : 'Öğrenci Şifresini Değiştir'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setChangePasswordModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.kvkkBox, { backgroundColor: session?.role === 'PARENT' ? '#EFF6FF' : '#ECFDF5', marginBottom: 12, marginTop: 4 }]}>
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={session?.role === 'PARENT' ? '#2563EB' : '#059669'}
                style={{ marginTop: 1 }}
              />
              <Text style={[styles.kvkkText, { color: session?.role === 'PARENT' ? '#1D4ED8' : '#047857' }]}>
                {session?.role === 'PARENT'
                  ? 'Bu şifre yalnızca Veli Portalı girişi için geçerlidir. Öğrencinin şifresini kesinlikle etkilemez.'
                  : 'Bu şifre yalnızca Öğrenci Portalı girişi için geçerlidir. Velinizin şifresini kesinlikle etkilemez.'}
              </Text>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Mevcut Şifre"
              placeholderTextColor="#94A3B8"
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Yeni Şifre"
              placeholderTextColor="#94A3B8"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleChangePassword}
              disabled={changingPass}
            >
              {changingPass ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Şifreyi Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 💬 Okunmamış Mesajlar Yüzen Bildirim Baloncuğu */}
      {activeTab !== 'messages' && (
        <FloatingMessageBubble
          onPress={() => setActiveTab('messages')}
          schoolId={feed?.student?.schoolId || session?.schoolId}
          bottomOffset={76}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },

  // GİRİŞ EKRANI
  loginHeader: { alignItems: 'center', marginTop: 16, marginBottom: 16, paddingHorizontal: 20 },
  brandBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  brandTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 12 },
  brandSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, textAlign: 'center', lineHeight: 18 },
  loginCard: { paddingHorizontal: 20, paddingBottom: 30 },
  modeSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  modeSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  modeSwitchBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeSwitchText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  modeSwitchTextActive: { color: '#059669' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  inputField: {
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    fontSize: 14,
    color: '#0F172A',
  },
  kvkkBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  kvkkText: { flex: 1, fontSize: 11.5, color: '#047857', lineHeight: 16 },
  loginButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  backRoleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
    paddingVertical: 8,
  },
  backRoleText: { color: '#64748B', fontSize: 13, fontWeight: '600' },

  // PORTAL BAŞLIĞI
  portalHeader: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  studentAvatarWrap: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  studentAvatarImg: { width: '100%', height: '100%' },
  studentAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: '#059669' },
  portalStudentName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  roleBadgePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  roleBadgePillText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  portalStudentSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  portalSchoolName: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  settingsIconBtn: { padding: 8, position: 'relative' },
  unreadHeaderBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  unreadHeaderBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // OKUNMAMIŞ MESAJ UYARI KARTI
  unreadNotificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    padding: 10,
    marginBottom: 10,
  },
  unreadNotificationBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadNotificationTitle: { fontSize: 12.5, fontWeight: '800', color: '#312E81' },
  unreadNotificationSubtitle: { fontSize: 11, color: '#4338CA', marginTop: 1 },
  livePulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  unreadNotificationActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 2,
    marginLeft: 6,
  },
  unreadNotificationActionText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },

  // TAB ÇUBUĞU
  portalTabsScroll: { gap: 10, paddingBottom: 6 },
  portalTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  portalTabActive: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  portalTabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  portalTabTextActive: { color: '#059669', fontWeight: '800' },
  tabBadgeBubble: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeBubbleText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // İÇERİK ALANI
  portalContent: { padding: 16, paddingBottom: 40 },
  emptyPortal: { alignItems: 'center', paddingVertical: 50 },
  emptyPortalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  emptyPortalSub: { fontSize: 12.5, color: '#64748B', marginTop: 4, textAlign: 'center' },

  // DERS PROGRAMI
  daySelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  dayTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  dayTabActive: {
    backgroundColor: '#059669',
  },
  dayTabText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  dayTabTextActive: { color: '#fff', fontWeight: '800' },
  scheduleInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  scheduleInfoBannerText: { fontSize: 11.5, fontWeight: '700', color: '#047857' },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lessonHourBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  lessonHourText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  scheduleLessonName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  scheduleTeacherName: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  classroomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  classroomText: { fontSize: 10.5, color: '#64748B', fontWeight: '600' },

  // DERS ÖĞRETMENLERİ
  sectionHeaderCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  sectionHeaderTitle: { fontSize: 14, fontWeight: '800', color: '#312E81' },
  sectionHeaderSub: { fontSize: 11.5, color: '#4338CA', marginTop: 2 },
  teacherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teacherAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherAvatarLetter: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  teacherCardName: { fontSize: 14.5, fontWeight: '800', color: '#0F172A' },
  teacherLessonsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  teacherLessonsText: { fontSize: 11.5, color: '#4F46E5', fontWeight: '700' },

  // ÖDEVLER
  assignmentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assignmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lessonTag: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  lessonTagText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusPillDone: { backgroundColor: '#ECFDF5' },
  statusPillNotDone: { backgroundColor: '#FEF2F2' },
  statusPillMissing: { backgroundColor: '#FEF3C7' },
  statusPillText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  assignmentTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  assignmentDesc: { fontSize: 13, color: '#475569', marginTop: 6, lineHeight: 18 },
  feedbackBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
  },
  feedbackTitle: { fontSize: 11, fontWeight: '800', color: '#047857' },
  feedbackText: { fontSize: 12, color: '#334155', marginTop: 2 },
  assignmentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 12,
    paddingTop: 8,
  },
  footerTeacher: { fontSize: 11, color: '#64748B' },
  footerDue: { fontSize: 11, color: '#DC2626', fontWeight: '600' },

  // QUİZ & SINAVLAR
  quizCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quizTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  quizTeacher: { fontSize: 12, color: '#64748B', marginTop: 2 },
  quizScoreBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  quizScoreText: { fontSize: 14, fontWeight: '900', color: '#B45309' },
  quizContent: { fontSize: 13, color: '#334155', marginTop: 8, lineHeight: 18 },
  quizFooter: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  quizDate: { fontSize: 11, color: '#94A3B8' },

  // ÖĞRETMEN GÖRÜŞLERİ
  evalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  evalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  evalTeacherName: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  evalDateText: { fontSize: 11, color: '#94A3B8' },
  evalBody: { fontSize: 13.5, color: '#1E293B', lineHeight: 20 },

  // DUYURU & MESAJLAR
  markAllReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  markAllReadText: { fontSize: 11.5, fontWeight: '700', color: '#4F46E5' },
  messageCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  messageCardUnread: {
    borderColor: '#818CF8',
    backgroundColor: '#FAFAFF',
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  messageCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  senderIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  messageSenderName: { fontSize: 13.5, fontWeight: '800', color: '#0F172A' },
  messageSenderRole: { fontSize: 11, color: '#64748B' },
  unreadTagPill: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unreadTagText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  messageBody: { fontSize: 13.5, color: '#1E293B', lineHeight: 20 },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  messageTargetText: { fontSize: 11, color: '#64748B' },
  messageDateText: { fontSize: 11, color: '#94A3B8' },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  modalSubmitBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
