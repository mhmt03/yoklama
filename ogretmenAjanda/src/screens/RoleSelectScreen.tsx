import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { UserRole, setActiveUserRole, setActiveTeacherName } from '../utils/roleService';
import { getActiveSchool, syncAffiliatedSchools } from '../database/operations/schoolOperations';
import { apiRequest, saveAuthToken } from '../services/apiClient';

interface RoleSelectScreenProps {
  onRoleSelected: (role: UserRole) => void;
  navigation?: any;
}

export const RoleSelectScreen: React.FC<RoleSelectScreenProps> = ({ onRoleSelected, navigation }) => {
  const insets = useSafeAreaInsets();
  // Okul Admini Modal & State
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('mehmetadmin');
  const [adminPassword, setAdminPassword] = useState('1234');
  const [adminLoading, setAdminLoading] = useState(false);

  // Öğretmen Giriş Modalı (Okul Kodu + Kullanıcı Adı + Şifre)
  const [showTeacherLoginModal, setShowTeacherLoginModal] = useState(false);
  const [teacherSchoolCode, setTeacherSchoolCode] = useState('OKL-10001');
  const [teacherUsername, setTeacherUsername] = useState('mehmetogretmen');
  const [teacherPassword, setTeacherPassword] = useState('1234');
  const [teacherLoading, setTeacherLoading] = useState(false);

  // Süper Admin Modal
  const [superAdminModalVisible, setSuperAdminModalVisible] = useState(false);
  const [superAdminUsername, setSuperAdminUsername] = useState('mehmetsuper');
  const [superAdminPassword, setSuperAdminPassword] = useState('1234');
  const [superAdminLoading, setSuperAdminLoading] = useState(false);

  // Okul Admini Giriş Butonu
  const handleSelectAdmin = () => {
    setShowAdminLoginModal(true);
  };

  const handleConfirmAdmin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen kullanıcı adı ve şifre girin.');
      return;
    }

    setAdminLoading(true);
    try {
      const res = await apiRequest('auth/login', 'POST', {
        username: adminUsername.trim(),
        password: adminPassword.trim(),
      });

      if (res.success && res.data) {
        await saveAuthToken(res.data.token, res.data);
        setShowAdminLoginModal(false);
        await setActiveUserRole('admin');
        onRoleSelected('admin');
      } else {
        // Çevrimdışı / Yerel Test Modu Fallback (mehmetadmin / 1234)
        if (adminUsername.trim() === 'mehmetadmin' && adminPassword.trim() === '1234') {
          setShowAdminLoginModal(false);
          await setActiveUserRole('admin');
          onRoleSelected('admin');
        } else {
          Alert.alert('Giriş Başarısız', res.error || 'Kullanıcı adı veya şifre hatalı.');
        }
      }
    } catch (e: any) {
      if (adminUsername.trim() === 'mehmetadmin' && adminPassword.trim() === '1234') {
        setShowAdminLoginModal(false);
        await setActiveUserRole('admin');
        onRoleSelected('admin');
      } else {
        Alert.alert('Hata', e.message);
      }
    } finally {
      setAdminLoading(false);
    }
  };

  // Öğretmen Giriş Butonu
  const handleSelectTeacher = () => {
    setShowTeacherLoginModal(true);
  };

  const handleConfirmTeacher = async () => {
    if (!teacherUsername.trim() || !teacherPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen kullanıcı adı ve şifrenizi giriniz.');
      return;
    }

    const schoolCodeClean = teacherSchoolCode.trim();
    const isIndividual = schoolCodeClean === '';

    setTeacherLoading(true);
    try {
      if (!isIndividual) {
        // 1. Kurumsal Okul Girişi (Okul Kodu Mevcut)
        const res = await apiRequest('auth/login', 'POST', {
          username: teacherUsername.trim(),
          password: teacherPassword.trim(),
          schoolCode: schoolCodeClean,
        });

        if (res.success && res.data) {
          await saveAuthToken(res.data.token, res.data);
          const displayName = res.data.fullName || teacherUsername.trim();
          await setActiveTeacherName(displayName);
          await setActiveUserRole('teacher');

          // KURUMSAL OKULLARI YEREL VERİTABANINA SENKRONİZE ET VE AKTİF OKULU BELİRLE:
          const affSchools = res.data.affiliatedSchools && res.data.affiliatedSchools.length > 0
            ? res.data.affiliatedSchools
            : (res.data.schoolName ? [{ name: res.data.schoolName, code: schoolCodeClean }] : []);
          
          if (affSchools.length > 0) {
            await syncAffiliatedSchools(affSchools, schoolCodeClean);
          }

          setShowTeacherLoginModal(false);
          onRoleSelected('teacher');
        } else {
          // Çevrimdışı test fallback: mehmetogretmen / 1234
          if (teacherUsername.trim() === 'mehmetogretmen' && teacherPassword.trim() === '1234') {
            const defaultSchools = [
              { name: 'Atatürk Anadolu Lisesi', code: 'OKL-10001' },
              { name: 'Cumhuriyet Fen Lisesi', code: 'OKL-10002' },
            ];
            await syncAffiliatedSchools(defaultSchools, schoolCodeClean || 'OKL-10001');
            await saveAuthToken('offline_token', {
              userId: 'offline-teacher',
              username: 'mehmetogretmen',
              fullName: 'Mehmet Öğretmen (Fizik)',
              role: 'TEACHER',
              schoolCode: schoolCodeClean || 'OKL-10001',
              schoolName: schoolCodeClean === 'OKL-10002' ? 'Cumhuriyet Fen Lisesi' : 'Atatürk Anadolu Lisesi',
              affiliatedSchools: defaultSchools.map(s => ({ id: s.code, name: s.name, code: s.code })),
            });
            await setActiveTeacherName('Mehmet Öğretmen (Fizik)');
            await setActiveUserRole('teacher');
            setShowTeacherLoginModal(false);
            onRoleSelected('teacher');
          } else {
            Alert.alert('Giriş Başarısız', res.error || 'Okul kodu, kullanıcı adı veya şifre hatalı.');
          }
        }
      } else {
        // 2. Bireysel Mod (Okul Kodu Boş)
        // Kurum içi iletişim kapalıdır, plan ve programı öğretmen kendisi yönetir.
        const displayName = teacherUsername.trim() === 'mehmetogretmen' 
          ? 'Mehmet Öğretmen (Fizik)' 
          : teacherUsername.trim();
        
        await saveAuthToken('individual_offline_token', {
          userId: 'individual',
          username: teacherUsername.trim(),
          fullName: displayName,
          role: 'TEACHER',
          schoolId: undefined,
          schoolCode: undefined,
        });

        await setActiveTeacherName(displayName);
        await setActiveUserRole('teacher');
        setShowTeacherLoginModal(false);

        Alert.alert(
          'Bireysel Mod Açıldı 📌',
          'Okul kodu girmeden bireysel modda giriş yaptınız. Ders programınızı ve yıllık planlarınızı kendiniz oluşturabilirsiniz. Kurum içi iletişim özellikleri okul koduna bağlı öğretmenler içindir.',
          [{ text: 'Anladım, Başla', onPress: () => onRoleSelected('teacher') }]
        );
      }
    } catch (e: any) {
      if (teacherUsername.trim() === 'mehmetogretmen' && teacherPassword.trim() === '1234') {
        await setActiveTeacherName('Mehmet Öğretmen (Fizik)');
        await setActiveUserRole('teacher');
        setShowTeacherLoginModal(false);
        onRoleSelected('teacher');
      } else {
        Alert.alert('Hata', e.message);
      }
    } finally {
      setTeacherLoading(false);
    }
  };

  const handleSelectStudent = async () => {
    await setActiveUserRole('student');
    onRoleSelected('student');
  };

  // Süper Admin Girişi (mehmetsuper / 1234)
  const handleSuperAdminLogin = async () => {
    if (!superAdminUsername.trim() || !superAdminPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen kullanıcı adı ve şifre girin.');
      return;
    }

    setSuperAdminLoading(true);
    try {
      const res = await apiRequest('auth/login', 'POST', {
        username: superAdminUsername.trim(),
        password: superAdminPassword.trim(),
      });

      if (res.success && res.data) {
        await saveAuthToken(res.data.token, res.data);
        setSuperAdminModalVisible(false);
        await setActiveUserRole('superadmin');
        onRoleSelected('superadmin');
      } else {
        // Çevrimdışı / İlk test modu: mehmetsuper / 1234 veya mehmet / 123456
        if (
          (superAdminUsername.trim() === 'mehmetsuper' && superAdminPassword.trim() === '1234') ||
          (superAdminUsername.trim() === 'mehmet' && superAdminPassword.trim() === '123456')
        ) {
          setSuperAdminModalVisible(false);
          await setActiveUserRole('superadmin');
          onRoleSelected('superadmin');
        } else {
          Alert.alert('Giriş Başarısız', res.error || 'Kullanıcı adı veya şifre hatalı.');
        }
      }
    } catch (e: any) {
      if (
        (superAdminUsername.trim() === 'mehmetsuper' && superAdminPassword.trim() === '1234') ||
        (superAdminUsername.trim() === 'mehmet' && superAdminPassword.trim() === '123456')
      ) {
        setSuperAdminModalVisible(false);
        await setActiveUserRole('superadmin');
        onRoleSelected('superadmin');
      } else {
        Alert.alert('Hata', e.message);
      }
    } finally {
      setSuperAdminLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandIconWrap}>
          <Ionicons name="school" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.brandTitle}>Öğretmen Ajanda</Text>
        <Text style={styles.brandSub}>
          Kurumsal, hibrit ve çok rollü eğitim platformu
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contentWrap} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Lütfen Rolünüzü Seçiniz:</Text>
        <Text style={styles.sectionDesc}>
          Seçiminiz cihazınızda hatırlanacak ve doğrudan ilgili panel açılacaktır.
        </Text>

        {/* Rol Ayrımı Bilgilendirme Kutusu */}
        <View style={styles.roleTipCard}>
          <Ionicons name="information-circle" size={22} color="#4F46E5" />
          <Text style={styles.roleTipText}>
            <Text style={{ fontWeight: '700', color: '#1E1B4B' }}>Rol Ayrımı: </Text>
            Bir kişi hem Fizik Öğretmeni hem de Okul Admini olabilir. Bu oturumda hangi işi yapacaksanız o rolü seçin. Paneller arasında dilediğiniz an tek tıkla geçiş yapabilirsiniz.
          </Text>
        </View>

        {/* 1. ÖĞRETMEN KARTI */}
        <TouchableOpacity style={styles.roleCard} onPress={handleSelectTeacher} activeOpacity={0.85}>
          <View style={[styles.roleIconWrap, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="person" size={28} color="#4F46E5" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.roleCardTitle}>Öğretmen (Branş / Sınıf)</Text>
              <View style={styles.popBadge}>
                <Text style={styles.popBadgeText}>Ders Modülü</Text>
              </View>
            </View>
            <Text style={styles.roleCardDesc}>
              Fizik vb. branş dersleriniz, canlı ders kokpiti, yoklama, ödev kontrolü ve öğrenci 360° veli görüşmesi.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* 2. OKUL ADMİNİ / İDARECİ KARTI */}
        <TouchableOpacity style={styles.roleCard} onPress={handleSelectAdmin} activeOpacity={0.85}>
          <View style={[styles.roleIconWrap, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="shield-checkmark" size={28} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.roleCardTitle}>Okul Admini (İdareci)</Text>
              <View style={[styles.popBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.popBadgeText, { color: '#B45309' }]}>Yönetim</Text>
              </View>
            </View>
            <Text style={styles.roleCardDesc}>
              Öğretmenlik dışı idari işlemler: Okul kodu yönetimi, AI ile çarşaf program analizi ve öğretmen onayları.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* 3. ÖĞRENCİ & VELİ KARTI */}
        <TouchableOpacity style={styles.roleCard} onPress={handleSelectStudent} activeOpacity={0.85}>
          <View style={[styles.roleIconWrap, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="school" size={28} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleCardTitle}>Öğrenci & Veli Paneli</Text>
            <Text style={styles.roleCardDesc}>
              Ödev bildirimleri, teslim durumları, ders programı ve öğretmen görüşleri.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* 4. SÜPER ADMİN (GİZLİ SİSTEM SAHİBİ GİRİŞİ) */}
        <TouchableOpacity
          style={styles.superAdminTrigger}
          onPress={() => setSuperAdminModalVisible(true)}
        >
          <Ionicons name="key-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.superAdminTriggerText}>Süper Admin Girişi (Lisans Yönetimi)</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Okul Admini Giriş Modalı */}
      <Modal visible={showAdminLoginModal} animationType="fade" transparent>
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={[styles.promptIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="shield-checkmark" size={24} color="#D97706" />
            </View>
            <Text style={styles.promptTitle}>Okul Admini Girişi</Text>
            <Text style={styles.promptDesc}>
              Okul tanımlama, öğretmen ekleme ve çarşaf program yönetimi için giriş yapınız.
            </Text>

            <View style={styles.trialInfoBox}>
              <Ionicons name="information-circle" size={16} color="#D97706" />
              <Text style={styles.trialInfoText}>Deneme Hesabı: mehmetadmin / 1234</Text>
            </View>

            <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı (mehmetadmin)"
              placeholderTextColor={Colors.textMuted}
              value={adminUsername}
              onChangeText={setAdminUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Şifre</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Şifre (1234)"
              placeholderTextColor={Colors.textMuted}
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAdminLoginModal(false)}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#D97706' }]}
                onPress={handleConfirmAdmin}
                disabled={adminLoading}
              >
                {adminLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Admin Girişi</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Öğretmen Giriş Modalı (Okul Kodu + Kullanıcı Adı + Şifre) */}
      <Modal visible={showTeacherLoginModal} animationType="fade" transparent>
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={[styles.promptIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="person" size={24} color="#4F46E5" />
            </View>
            <Text style={styles.promptTitle}>Öğretmen Girişi</Text>
            <Text style={styles.promptDesc}>
              Kurumsal veya bireysel olarak derslerinizi yönetin.
            </Text>

            <View style={styles.trialInfoBoxBlue}>
              <Ionicons name="information-circle" size={16} color="#4F46E5" />
              <Text style={styles.trialInfoTextBlue}>
                Deneme: mehmetogretmen / 1234 (Fizik Öğretmeni)
              </Text>
            </View>

            <Text style={styles.inputLabel}>Okul Kodu (Kurumsal Giriş İçin)</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Örn: OKL-10001 (Bireysel için boş bırakın)"
              placeholderTextColor={Colors.textMuted}
              value={teacherSchoolCode}
              onChangeText={setTeacherSchoolCode}
              autoCapitalize="characters"
            />
            <Text style={styles.fieldHint}>
              💡 Bireysel kullanım için boş bırakabilirsiniz. Kurumsal kod girerseniz okulunuzun ders ve yıllık planları otomatik yüklenir.
            </Text>

            <Text style={[styles.inputLabel, { marginTop: 8 }]}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı (mehmetogretmen)"
              placeholderTextColor={Colors.textMuted}
              value={teacherUsername}
              onChangeText={setTeacherUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 8 }]}>Şifre</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Şifre (1234)"
              placeholderTextColor={Colors.textMuted}
              value={teacherPassword}
              onChangeText={setTeacherPassword}
              secureTextEntry
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowTeacherLoginModal(false)}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#4F46E5' }]}
                onPress={handleConfirmTeacher}
                disabled={teacherLoading}
              >
                {teacherLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    {teacherSchoolCode.trim() ? 'Okula Giriş Yap' : 'Bireysel Giriş Yap'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Süper Admin Giriş Modalı */}
      <Modal visible={superAdminModalVisible} animationType="fade" transparent>
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={[styles.promptIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="key" size={24} color="#4F46E5" />
            </View>
            <Text style={styles.promptTitle}>Süper Admin Girişi</Text>
            <Text style={styles.promptDesc}>
              Sistem lisanslarını ve tüm okulları yönetmek için giriş yapın.
            </Text>

            <View style={styles.trialInfoBox}>
              <Ionicons name="information-circle" size={16} color="#D97706" />
              <Text style={styles.trialInfoText}>Deneme Hesabı: mehmetsuper / 1234</Text>
            </View>

            <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı (mehmetsuper)"
              placeholderTextColor={Colors.textMuted}
              value={superAdminUsername}
              onChangeText={setSuperAdminUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Şifre</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Şifre (1234)"
              placeholderTextColor={Colors.textMuted}
              value={superAdminPassword}
              onChangeText={setSuperAdminPassword}
              secureTextEntry
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSuperAdminModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#4F46E5' }]}
                onPress={handleSuperAdminLogin}
                disabled={superAdminLoading}
              >
                {superAdminLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Giriş Yap</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 10,
  },
  brandIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
  },
  brandSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  contentWrap: {
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  roleTipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 10,
  },
  roleTipText: {
    flex: 1,
    fontSize: 12,
    color: '#3730A3',
    lineHeight: 17,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  roleIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  roleCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  roleCardDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  popBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  superAdminTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 12,
  },
  superAdminTriggerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginLeft: 6,
  },
  promptOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  promptCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  promptIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  promptDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  pinInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 8,
    color: Colors.text,
  },
  nameInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  trialInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  trialInfoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  trialInfoBoxBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  trialInfoTextBlue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
  inputLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  fieldHint: {
    alignSelf: 'flex-start',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
});
