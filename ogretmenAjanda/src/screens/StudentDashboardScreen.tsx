import React, { useState, useEffect } from 'react';
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

interface StudentDashboardScreenProps {
  onLogout: () => void;
}

export function StudentDashboardScreen({ onLogout }: StudentDashboardScreenProps) {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Giriş Form State (KVKK Uyumlu)
  const [schoolCode, setSchoolCode] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Portal Verileri
  const [feed, setFeed] = useState<{
    student: any;
    assignments: any[];
    evaluations: any[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'assignments' | 'evaluations' | 'messages'>('assignments');

  // Şifre Değiştirme Modalı
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    setLoading(true);
    const active = await getActiveUserSession();
    if (active && active.role === 'STUDENT') {
      setSession(active);
      await loadPortalData(active.userId);
    }
    setLoading(false);
  };

  const loadPortalData = async (studentId: string) => {
    try {
      const data = await fetchStudentPortalFeed(studentId);
      setFeed(data);
    } catch (e: any) {
      console.warn('Portal verisi çekilemedi:', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  // KVKK Uyumlu Giriş: Okul Kodu + OgrenciNo + aaaa_ogrencino
  const handleStudentLogin = async () => {
    if (!schoolCode.trim()) {
      Alert.alert('Uyarı', 'Lütfen Okul Kodunuzu giriniz.');
      return;
    }
    if (!studentNumber.trim()) {
      Alert.alert('Uyarı', 'Lütfen Öğrenci Numaranızı giriniz.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Uyarı', 'Lütfen Şifrenizi giriniz. (Varsayılan: aaaa_öğrencino)');
      return;
    }

    setLoggingIn(true);
    const res = await apiRequest('auth/student-login', 'POST', {
      schoolCode: schoolCode.trim(),
      studentNumber: studentNumber.trim(),
      password: password.trim(),
    });

    if (res.success && res.data) {
      await saveAuthToken(res.data.token, res.data);
      setSession(res.data);
      await loadPortalData(res.data.userId);
    } else {
      Alert.alert('Giriş Başarısız', res.error || 'Bilgilerinizi kontrol ediniz.');
    }
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      await logoutUserRole();
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
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: doLogout,
        },
      ]);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword.trim() || !newPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen mevcut ve yeni şifrenizi girin.');
      return;
    }

    setChangingPass(true);
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
    setChangingPass(false);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // 1. GİRİŞ YAPILMAMIŞSA: KVKK Uyumlu Sade Giriş Ekranı
  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loginHeader}>
          <View style={styles.brandBadge}>
            <Ionicons name="school" size={32} color="#fff" />
          </View>
          <Text style={styles.brandTitle}>Öğrenci & Veli Girişi</Text>
          <Text style={styles.brandSubtitle}>
            Ödevlerinizi ve öğretmen görüşlerinizi takip edin
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.loginCard} keyboardShouldPersistTaps="handled">
          <Text style={styles.inputLabel}>Okul Kodu</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Örn: OKL-8F3A2"
            placeholderTextColor={Colors.textMuted}
            value={schoolCode}
            onChangeText={setSchoolCode}
            autoCapitalize="characters"
          />

          <Text style={styles.inputLabel}>Öğrenci Numarası</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Örn: 45 veya 1042"
            placeholderTextColor={Colors.textMuted}
            value={studentNumber}
            onChangeText={(val) => {
              setStudentNumber(val);
              // Otomatik varsayılan şifre önerisi
              if (!password) setPassword(`aaaa_${val.trim()}`);
            }}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Şifre</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Varsayılan: aaaa_öğrencino"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.kvkkNote}>
            🛡️ KVKK Güvencesi: Sistemde TC Kimlik No tutulmamaktadır. İlk girişinizde şifreniz "aaaa_öğrencino" olarak belirlenmiştir.
          </Text>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleStudentLogin}
            disabled={loggingIn}
          >
            {loggingIn ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Giriş Yap</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backRoleButton} onPress={onLogout}>
            <Ionicons name="arrow-back" size={16} color={Colors.textMuted} />
            <Text style={styles.backRoleText}>Rol Seçimine Geri Dön</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // 2. GİRİŞ YAPILMIŞSA: Öğrenci Portalı & Bildirim Akışı
  const student = feed?.student;
  const assignments = feed?.assignments || [];
  const evaluations = feed?.evaluations || [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar & Profil Özeti */}
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
            <Text style={styles.portalStudentName}>{session.fullName}</Text>
            <Text style={styles.portalStudentSub}>
              {session.schoolName} • No: {student?.studentNumber || session.username}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setChangePasswordModal(true)} style={styles.settingsIconBtn}>
            <Ionicons name="key-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.settingsIconBtn}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Tab Seçimi */}
        <View style={styles.portalTabs}>
          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'assignments' && styles.portalTabActive]}
            onPress={() => setActiveTab('assignments')}
          >
            <Text style={[styles.portalTabText, activeTab === 'assignments' && styles.portalTabTextActive]}>
              Ödevlerim ({assignments.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portalTab, activeTab === 'evaluations' && styles.portalTabActive]}
            onPress={() => setActiveTab('evaluations')}
          >
            <Text style={[styles.portalTabText, activeTab === 'evaluations' && styles.portalTabTextActive]}>
              Öğretmen Görüşleri ({evaluations.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
        {activeTab === 'assignments' ? (
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
                          : styles.statusPillMissing,
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
        ) : (
          /* Öğretmen Görüşleri */
          evaluations.length === 0 ? (
            <View style={styles.emptyPortal}>
              <Ionicons name="chatbubble-ellipses-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyPortalTitle}>Henüz Görüş Yok</Text>
              <Text style={styles.emptyPortalSub}>Öğretmenleriniz görüş paylaştığında burada görünecektir.</Text>
            </View>
          ) : (
            evaluations.map((evalItem) => (
              <View key={evalItem.id} style={styles.evalCard}>
                <View style={styles.evalCardHeader}>
                  <Text style={styles.evalTeacherName}>👨‍🏫 {evalItem.teacherName}</Text>
                  <Text style={styles.evalDateText}>
                    {new Date(evalItem.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Text style={styles.evalBody}>{evalItem.content}</Text>
                {evalItem.score !== undefined && evalItem.score !== null && (
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreText}>Quiz / Sınav Notu: {evalItem.score}</Text>
                  </View>
                )}
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Şifre Değiştirme Modalı */}
      <Modal visible={changePasswordModal} animationType="fade" transparent onRequestClose={() => setChangePasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şifremi Değiştir</Text>
              <TouchableOpacity onPress={() => setChangePasswordModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Mevcut Şifre"
              placeholderTextColor={Colors.textMuted}
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Yeni Şifre"
              placeholderTextColor={Colors.textMuted}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginHeader: { alignItems: 'center', marginTop: 24, marginBottom: 20 },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  brandSubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  loginCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 6, marginTop: 10 },
  inputField: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: Colors.text,
  },
  kvkkNote: { fontSize: 11, color: '#059669', marginTop: 14, lineHeight: 16, fontWeight: '600' },
  loginButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  backRoleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, padding: 8 },
  backRoleText: { fontSize: 13, color: Colors.textMuted, marginLeft: 6 },
  portalHeader: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
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
  portalStudentName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  portalStudentSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  settingsIconBtn: { padding: 8 },
  portalTabs: { flexDirection: 'row', gap: 12 },
  portalTab: { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', marginRight: 16 },
  portalTabActive: { borderBottomColor: '#059669' },
  portalTabText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  portalTabTextActive: { color: '#059669' },
  portalContent: { padding: 16, paddingBottom: 40 },
  emptyPortal: { alignItems: 'center', paddingVertical: 60 },
  emptyPortalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 14 },
  emptyPortalSub: { fontSize: 13, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  assignmentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
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
  statusPillText: { fontSize: 11, fontWeight: '700' },
  assignmentTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  assignmentDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  assignmentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 12,
    paddingTop: 8,
  },
  footerTeacher: { fontSize: 11, color: Colors.textSecondary },
  footerDue: { fontSize: 11, color: '#DC2626', fontWeight: '600' },
  evalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  evalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  evalTeacherName: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  evalDateText: { fontSize: 11, color: Colors.textMuted },
  evalBody: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  scoreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },
  scoreText: { fontSize: 12, fontWeight: '800', color: '#D97706' },
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
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    fontSize: 14,
    color: Colors.text,
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
