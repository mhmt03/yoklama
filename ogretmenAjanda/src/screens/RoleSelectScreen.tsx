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
import { getActiveSchool } from '../database/operations/schoolOperations';
import { apiRequest, saveAuthToken } from '../services/apiClient';

interface RoleSelectScreenProps {
  onRoleSelected: (role: UserRole) => void;
  navigation?: any;
}

export const RoleSelectScreen: React.FC<RoleSelectScreenProps> = ({ onRoleSelected, navigation }) => {
  const insets = useSafeAreaInsets();
  const [selectedRoleForPin, setSelectedRoleForPin] = useState<'admin' | null>(null);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [teacherNameInput, setTeacherNameInput] = useState('');
  const [showTeacherNameModal, setShowTeacherNameModal] = useState(false);

  // Süper Admin Modal
  const [superAdminModalVisible, setSuperAdminModalVisible] = useState(false);
  const [superAdminUsername, setSuperAdminUsername] = useState('mehmet');
  const [superAdminPassword, setSuperAdminPassword] = useState('123456');
  const [superAdminLoading, setSuperAdminLoading] = useState(false);

  // Öğretmen Okul Kodu Modalı
  const [showTeacherSchoolCodeModal, setShowTeacherSchoolCodeModal] = useState(false);
  const [schoolCodeInput, setSchoolCodeInput] = useState('');

  const handleSelectAdmin = () => {
    setAdminPinInput('');
    setSelectedRoleForPin('admin');
  };

  const handleConfirmAdminPin = async () => {
    // Okul admini ekranına doğrudan yönlendirilebilir veya yerel admin yapılabilir
    await setActiveUserRole('admin');
    setSelectedRoleForPin(null);
    onRoleSelected('admin');
  };

  const handleSelectTeacher = () => {
    setTeacherNameInput('');
    setShowTeacherNameModal(true);
  };

  const handleConfirmTeacher = async () => {
    const finalName = teacherNameInput.trim() || 'Öğretmen';
    await setActiveTeacherName(finalName);
    await setActiveUserRole('teacher');
    setShowTeacherNameModal(false);
    onRoleSelected('teacher');
  };

  const handleSelectStudent = async () => {
    await setActiveUserRole('student');
    onRoleSelected('student');
  };

  // Süper Admin Girişi (mehmet / 123456)
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
        // Çevrimdışı / İlk test modu: şifre mehmet / 123456 ise doğrudan izin ver
        if (superAdminUsername.trim() === 'mehmet' && superAdminPassword.trim() === '123456') {
          setSuperAdminModalVisible(false);
          await setActiveUserRole('superadmin');
          onRoleSelected('superadmin');
        } else {
          Alert.alert('Giriş Başarısız', res.error || 'Kullanıcı adı veya şifre hatalı.');
        }
      }

    } catch (e: any) {
      Alert.alert('Hata', e.message);
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

        {/* 1. ÖĞRETMEN KARTI */}
        <TouchableOpacity style={styles.roleCard} onPress={handleSelectTeacher} activeOpacity={0.85}>
          <View style={[styles.roleIconWrap, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="person" size={28} color="#4F46E5" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.roleCardTitle}>Ben Öğretmenim</Text>
              <View style={styles.popBadge}>
                <Text style={styles.popBadgeText}>Ana Modül</Text>
              </View>
            </View>
            <Text style={styles.roleCardDesc}>
              Canlı ders kokpiti, yoklama, ödev takibi, hazır ders programı ve öğrenci değerlendirme.
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
            <Text style={styles.roleCardTitle}>Okul Admini & İdare</Text>
            <Text style={styles.roleCardDesc}>
              Okul kodu üretme, AI ile çarşaf ders programından okul kurma ve öğretmen yetkileri.
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

      {/* Admin PIN Prompt Modal */}
      {selectedRoleForPin && (
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={[styles.promptIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="lock-closed" size={24} color="#D97706" />
            </View>
            <Text style={styles.promptTitle}>Yönetici Doğrulaması</Text>
            <Text style={styles.promptDesc}>
              Okul yöneticisi paneline erişmek için PIN kodunuzu giriniz. (Varsayılan PIN: 1234)
            </Text>

            <TextInput
              style={styles.pinInput}
              placeholder="PIN Kodu (1234)"
              placeholderTextColor={Colors.textMuted}
              value={adminPinInput}
              onChangeText={setAdminPinInput}
              keyboardType="numeric"
              secureTextEntry
              maxLength={8}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSelectedRoleForPin(null)}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirmAdminPin}
              >
                <Text style={styles.confirmBtnText}>Giriş Yap</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Teacher Name Input Modal */}
      {showTeacherNameModal && (
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={[styles.promptIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="person" size={24} color="#4F46E5" />
            </View>
            <Text style={styles.promptTitle}>Öğretmen Adınız</Text>
            <Text style={styles.promptDesc}>
              Sınıf ve ders atamalarınızda kullanılmak üzere adınızı ve soyadınızı giriniz.
            </Text>

            <TextInput
              style={styles.nameInput}
              placeholder="Örn: Mehmet Yılmaz"
              placeholderTextColor={Colors.textMuted}
              value={teacherNameInput}
              onChangeText={setTeacherNameInput}
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowTeacherNameModal(false)}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#4F46E5' }]}
                onPress={handleConfirmTeacher}
              >
                <Text style={styles.confirmBtnText}>Devam Et</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Süper Admin Giriş Modalı */}
      <Modal visible={superAdminModalVisible} animationType="slide" transparent>
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={[styles.promptIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="key" size={24} color="#4F46E5" />
            </View>
            <Text style={styles.promptTitle}>Süper Admin Girişi</Text>
            <Text style={styles.promptDesc}>
              Sistem lisanslarını ve okulları yönetmek için giriş yapın.
            </Text>

            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı (mehmet)"
              placeholderTextColor={Colors.textMuted}
              value={superAdminUsername}
              onChangeText={setSuperAdminUsername}
              autoCapitalize="none"
            />

            <TextInput
              style={[styles.nameInput, { marginTop: 8 }]}
              placeholder="Şifre (123456)"
              placeholderTextColor={Colors.textMuted}
              value={superAdminPassword}
              onChangeText={setSuperAdminPassword}
              secureTextEntry
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
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
    marginBottom: 16,
    lineHeight: 18,
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
});
