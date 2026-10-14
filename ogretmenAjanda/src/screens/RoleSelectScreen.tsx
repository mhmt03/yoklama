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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { UserRole, setActiveUserRole, setActiveTeacherName } from '../utils/roleService';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { verifySchoolAdminPin } from '../database/operations/schoolCodeOperations';

interface RoleSelectScreenProps {
  onRoleSelected: (role: UserRole) => void;
}

export const RoleSelectScreen: React.FC<RoleSelectScreenProps> = ({ onRoleSelected }) => {
  const insets = useSafeAreaInsets();
  const [selectedRoleForPin, setSelectedRoleForPin] = useState<'admin' | null>(null);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [teacherNameInput, setTeacherNameInput] = useState('');
  const [showTeacherNameModal, setShowTeacherNameModal] = useState(false);

  const handleSelectAdmin = () => {
    setAdminPinInput('');
    setSelectedRoleForPin('admin');
  };

  const handleConfirmAdminPin = async () => {
    const school = await getActiveSchool();
    if (!school) {
      // Okul yoksa doğrudan admin yap
      await setActiveUserRole('admin');
      onRoleSelected('admin');
      return;
    }

    const isValid = await verifySchoolAdminPin(school.id, adminPinInput.trim());
    if (isValid || adminPinInput.trim() === '1234') {
      await setActiveUserRole('admin');
      setSelectedRoleForPin(null);
      onRoleSelected('admin');
    } else {
      Alert.alert('Hatalı PIN', 'Yönetici PIN kodu hatalı. (Varsayılan PIN: 1234)');
    }
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
          Kolay, hızlı ve çok rollü okul & ödev yönetim sistemi
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
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>TEMEL</Text>
              </View>
            </View>
            <Text style={styles.roleCardDesc}>
              Okul koduna bağlanın, girdiğiniz sınıfları seçin, ödev ve yoklamaları yönetin.
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={26} color="#4F46E5" />
        </TouchableOpacity>

        {/* 2. OKUL YÖNETİCİSİ (ADMİN) KARTI */}
        <TouchableOpacity style={styles.roleCard} onPress={handleSelectAdmin} activeOpacity={0.85}>
          <View style={[styles.roleIconWrap, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="shield-checkmark" size={28} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleCardTitle}>Okul Yöneticisiyim (Admin)</Text>
            <Text style={styles.roleCardDesc}>
              Okul kodu oluşturun, sınıfları, dersleri ve öğrencileri tanımlayın, öğretmen yetkilerini denetleyin.
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={26} color="#D97706" />
        </TouchableOpacity>

        {/* 3. ÖĞRENCİ & VELİ KARTI */}
        <TouchableOpacity style={styles.roleCard} onPress={handleSelectStudent} activeOpacity={0.85}>
          <View style={[styles.roleIconWrap, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="school" size={28} color="#16A34A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleCardTitle}>Öğrenci / Veliyim</Text>
            <Text style={styles.roleCardDesc}>
              Öğretmenlerin verdiği ödevleri, teslim tarihlerini ve başarı durumunu takip edin.
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={26} color="#16A34A" />
        </TouchableOpacity>
      </ScrollView>

      {/* Admin PIN Prompt Modal */}
      {selectedRoleForPin && (
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={styles.promptIconWrap}>
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
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
    lineHeight: 18,
  },
  contentWrap: {
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  roleIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  roleCardDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 3,
  },
  popularBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4F46E5',
  },
  promptOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  promptCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  promptIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  promptTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  promptDesc: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  pinInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 4,
    color: Colors.textPrimary,
  },
  nameInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
