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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { ClassItem, Student, Assignment } from '../types';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getClasses } from '../database/operations/classOperations';
import { getStudentsByClass } from '../database/operations/studentOperations';
import { getAssignments } from '../database/operations/assignmentOperations';
import {
  getStudentSessionProfile,
  setStudentSessionProfile,
  logoutUserRole,
  StudentProfileData,
} from '../utils/roleService';
import { getDB } from '../database/db';

interface StudentDashboardScreenProps {
  onLogout: () => void;
}

export const StudentDashboardScreen: React.FC<StudentDashboardScreenProps> = ({ onLogout }) => {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup / Login state if no profile
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [studentNoInput, setStudentNoInput] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Student Dashboard data
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'schedule'>('pending');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentStatuses, setAssignmentStatuses] = useState<Record<number, string>>({});
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    setLoading(true);
    const existing = await getStudentSessionProfile();
    if (existing) {
      setProfile(existing);
      await loadStudentAssignments(existing.classId, existing.studentId);
    } else {
      await loadClassesForSelection();
    }
    setLoading(false);
  };

  const loadClassesForSelection = async () => {
    try {
      const clsList = await getClasses();
      setClasses(clsList);
      if (clsList.length > 0) {
        setSelectedClassId(clsList[0].id);
      }
    } catch (e) {
      console.warn('Sınıflar yüklenemedi:', e);
    }
  };

  const handleStudentLogin = async () => {
    if (!selectedClassId) {
      Alert.alert('Uyarı', 'Lütfen sınıfınızı seçiniz.');
      return;
    }
    if (!studentNoInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci numaranızı yazınız.');
      return;
    }

    setVerifying(true);
    try {
      const classStudents = await getStudentsByClass(selectedClassId);
      const matched = classStudents.find(
        (s) => s.student_number.trim() === studentNoInput.trim()
      );

      if (!matched) {
        Alert.alert(
          'Öğrenci Bulunamadı',
          `Seçilen sınıfta ${studentNoInput} numaralı bir öğrenci bulunamadı. Lütfen okul numaranızı kontrol ediniz.`
        );
        return;
      }

      const selectedClass = classes.find((c) => c.id === selectedClassId);
      const newProfile: StudentProfileData = {
        studentId: matched.id,
        studentNumber: matched.student_number,
        fullName: matched.full_name || `${matched.first_name} ${matched.last_name}`,
        classId: selectedClassId,
        className: selectedClass?.name || 'Sınıf',
        studentPhone: matched.student_phone || undefined,
        parentName: matched.parent_name || undefined,
        parentPhone: matched.parent_phone || undefined,
      };

      await setStudentSessionProfile(newProfile);
      setProfile(newProfile);
      await loadStudentAssignments(newProfile.classId, newProfile.studentId);
    } catch (err: any) {
      Alert.alert('Hata', 'Giriş yapılırken bir hata oluştu: ' + (err?.message || ''));
    } finally {
      setVerifying(false);
    }
  };

  const loadStudentAssignments = async (classId: number, studentId: number) => {
    setLoadingData(true);
    try {
      const db = await getDB();
      const assList = await getAssignments(classId);
      setAssignments(assList);

      // Öğrencinin bireysel durumlarını çek
      const statusRows = await db.getAllAsync<{ assignment_id: number; status: string }>(
        'SELECT assignment_id, status FROM assignment_students WHERE student_id = ?',
        studentId
      );

      const statusMap: Record<number, string> = {};
      statusRows.forEach((r) => {
        statusMap[r.assignment_id] = r.status || 'bekliyor';
      });
      setAssignmentStatuses(statusMap);
    } catch (e) {
      console.warn('Ödev verileri yüklenemedi:', e);
    } finally {
      setLoadingData(false);
    }
  };

  const handleToggleAssignmentStatus = async (assignmentId: number) => {
    if (!profile) return;
    const current = assignmentStatuses[assignmentId] || 'bekliyor';
    const nextStatus = current === 'yapildi' ? 'bekliyor' : 'yapildi';

    try {
      const db = await getDB();
      await db.runAsync(
        `INSERT INTO assignment_students (assignment_id, student_id, status)
         VALUES (?, ?, ?)
         ON CONFLICT(assignment_id, student_id) DO UPDATE SET status = excluded.status`,
        assignmentId,
        profile.studentId,
        nextStatus
      );

      setAssignmentStatuses((prev) => ({
        ...prev,
        [assignmentId]: nextStatus,
      }));

      Alert.alert(
        nextStatus === 'yapildi' ? 'Harika! 🎉' : 'Güncellendi',
        nextStatus === 'yapildi'
          ? 'Ödevi tamamladığınızı belirttiniz. Öğretmeniniz bu durumu görecektir.'
          : 'Ödev durumu tekrar bekliyor olarak işaretlendi.'
      );
    } catch {
      Alert.alert('Hata', 'Ödev durumu kaydedilemedi.');
    }
  };

  const handleLogoutStudent = () => {
    Alert.alert('Çıkış Yap', 'Farklı bir öğrenci seçmek veya role dönmek istiyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await logoutUserRole();
          setProfile(null);
          onLogout();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // --- EĞER PROFİL HENÜZ SEÇİLMEDİYSE (GİRİŞ EKRANI) ---
  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        <View style={styles.loginHeader}>
          <View style={styles.loginIconWrap}>
            <Ionicons name="school" size={32} color="#16A34A" />
          </View>
          <Text style={styles.loginTitle}>Öğrenci & Veli Girişi</Text>
          <Text style={styles.loginSub}>
            Şifreye gerek yok! Sadece sınıfınızı seçin ve numaranızı yazın.
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            {/* 1. Sınıf Seçimi */}
            <Text style={styles.inputHeading}>1. Sınıfını Seç:</Text>
            <View style={styles.classesGrid}>
              {classes.map((cls) => (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.classSelectBtn,
                    selectedClassId === cls.id && styles.classSelectBtnActive,
                  ]}
                  onPress={() => setSelectedClassId(cls.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.classSelectBtnText,
                      selectedClassId === cls.id && styles.classSelectBtnTextActive,
                    ]}
                  >
                    {cls.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 2. Öğrenci Numarası */}
            <Text style={[styles.inputHeading, { marginTop: 16 }]}>2. Okul Numaranı Yaz:</Text>
            <TextInput
              style={styles.noTextInput}
              placeholder="Örn: 105"
              placeholderTextColor={Colors.textMuted}
              value={studentNoInput}
              onChangeText={setStudentNoInput}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={styles.loginActionBtn}
              onPress={handleStudentLogin}
              disabled={verifying}
              activeOpacity={0.85}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="arrow-forward-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.loginActionBtnText}>Ödevlerimi Göster</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backToRolesBtn} onPress={onLogout}>
              <Text style={styles.backToRolesBtnText}>← Farklı Giriş Yap (Öğretmen / Admin)</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // --- ÖĞRENCİ PANELİ (ÖDEVLER VE DURUM) ---
  const pendingList = assignments.filter(
    (a) => (assignmentStatuses[a.id] || 'bekliyor') !== 'yapildi'
  );
  const completedList = assignments.filter(
    (a) => (assignmentStatuses[a.id] || 'bekliyor') === 'yapildi'
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 8 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Profil Kartı */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {profile.fullName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName} numberOfLines={1}>
            {profile.fullName}
          </Text>
          <Text style={styles.profileMeta}>
            Sınıf: <Text style={{ fontWeight: '700' }}>{profile.className}</Text> • No:{' '}
            <Text style={{ fontWeight: '700' }}>{profile.studentNumber}</Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutSmallBtn} onPress={handleLogoutStudent}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        </TouchableOpacity>
      </View>

      {/* Büyük İki Sekme */}
      <View style={styles.tabNavRow}>
        <TouchableOpacity
          style={[styles.bigTabBtn, activeTab === 'pending' && styles.bigTabBtnActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'pending' ? '#DC2626' : Colors.textSecondary}
          />
          <Text style={[styles.bigTabText, activeTab === 'pending' && styles.bigTabTextActive]}>
            Yapılacaklar ({pendingList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bigTabBtn, activeTab === 'completed' && styles.bigTabBtnActiveGreen]}
          onPress={() => setActiveTab('completed')}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={18}
            color={activeTab === 'completed' ? '#16A34A' : Colors.textSecondary}
          />
          <Text
            style={[styles.bigTabText, activeTab === 'completed' && styles.bigTabTextActiveGreen]}
          >
            Tamamlananlar ({completedList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Ödev Kartları Listesi */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {loadingData ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : activeTab === 'pending' ? (
          pendingList.length === 0 ? (
            <View style={styles.allDoneBox}>
              <Ionicons name="sparkles" size={48} color="#16A34A" />
              <Text style={styles.allDoneTitle}>Tebrikler! 🎉</Text>
              <Text style={styles.allDoneDesc}>
                Bekleyen hiçbir ödevin yok. Tüm ödevlerini başarıyla tamamladın!
              </Text>
            </View>
          ) : (
            pendingList.map((item) => (
              <View key={item.id} style={styles.assignmentCard}>
                <View style={styles.assHeader}>
                  <View style={styles.classBadge}>
                    <Text style={styles.classBadgeText}>{profile.className}</Text>
                  </View>
                  <View style={styles.dueDateBadge}>
                    <Ionicons name="calendar-outline" size={13} color="#D97706" />
                    <Text style={styles.dueDateText}>Son Teslim: {item.due_date}</Text>
                  </View>
                </View>

                <Text style={styles.assTitle}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.assDesc}>{item.description}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.doneActionBtn}
                  onPress={() => handleToggleAssignmentStatus(item.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.doneActionBtnText}>Ödevi Yaptım / Tamamladım</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        ) : completedList.length === 0 ? (
          <View style={styles.allDoneBox}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.allDoneTitle}>Henüz Tamamlanan Ödev Yok</Text>
            <Text style={styles.allDoneDesc}>
              Yapılacaklar listesinden ödevlerini tamamladıkça buraya eklenecektir.
            </Text>
          </View>
        ) : (
          completedList.map((item) => (
            <View key={item.id} style={[styles.assignmentCard, styles.assignmentCardDone]}>
              <View style={styles.assHeader}>
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark" size={13} color="#16A34A" />
                  <Text style={styles.completedBadgeText}>TAMAMLANDI</Text>
                </View>
                <Text style={styles.dueDateTextMuted}>Teslim: {item.due_date}</Text>
              </View>

              <Text style={styles.assTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.assDesc}>{item.description}</Text> : null}

              <TouchableOpacity
                style={styles.undoBtn}
                onPress={() => handleToggleAssignmentStatus(item.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.undoBtnText}>Tekrar Yapılacaklara Al</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginHeader: {
    alignItems: 'center',
    marginVertical: 20,
  },
  loginIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  loginSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  inputHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  classesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  classSelectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  classSelectBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  classSelectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  classSelectBtnTextActive: {
    color: '#15803D',
  },
  noTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  loginActionBtn: {
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  loginActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  backToRolesBtn: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  backToRolesBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#16A34A',
  },
  profileName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  profileMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  logoutSmallBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  tabNavRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bigTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  bigTabBtnActive: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  bigTabBtnActiveGreen: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  bigTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  bigTabTextActive: {
    color: '#DC2626',
  },
  bigTabTextActiveGreen: {
    color: '#16A34A',
  },
  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  assignmentCardDone: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  assHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  classBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dueDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
  },
  dueDateTextMuted: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  assTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  assDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  doneActionBtn: {
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  doneActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
  },
  undoBtnText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  allDoneBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  allDoneTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  allDoneDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
