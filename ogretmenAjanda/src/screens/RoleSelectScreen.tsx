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
import { apiRequest, saveAuthToken, getBaseApiUrl, setBaseApiUrl, DEFAULT_API_URL } from '../services/apiClient';
import { DEFAULT_GEMINI_API_KEY, DEFAULT_GEMINI_MODEL, setGeminiApiKey, setGeminiModel } from '../utils/geminiScheduleService';
import {
  getSavedInstitution,
  saveInstitution,
  clearSavedInstitution,
  verifyInstitutionOnline,
  getRememberMeSetting,
  setRememberMeSetting,
  InstitutionInfo,
} from '../services/institutionService';

interface RoleSelectScreenProps {
  onRoleSelected: (role: UserRole) => void;
  navigation?: any;
}

export const RoleSelectScreen: React.FC<RoleSelectScreenProps> = ({ onRoleSelected, navigation }) => {
  const insets = useSafeAreaInsets();

  // --- KURUM (INSTITUTION / TENANT) STATE ---
  const [activeInstitution, setActiveInstitution] = useState<InstitutionInfo | null>(null);
  const [institutionLoading, setInstitutionLoading] = useState(true);
  const [kurumInput, setKurumInput] = useState('');
  const [verifyingKurum, setVerifyingKurum] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isEditingKurum, setIsEditingKurum] = useState(false);

  // Okul Admini Modal & State
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  // Öğretmen Giriş Modalı (Okul Kodu + Kullanıcı Adı + Şifre)
  const [showTeacherLoginModal, setShowTeacherLoginModal] = useState(false);
  const [teacherSchoolCode, setTeacherSchoolCode] = useState('');
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherLoading, setTeacherLoading] = useState(false);

  // Süper Admin Modal
  const [superAdminModalVisible, setSuperAdminModalVisible] = useState(false);
  const [superAdminUsername, setSuperAdminUsername] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminLoading, setSuperAdminLoading] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const saved = await getSavedInstitution();
        const rem = await getRememberMeSetting();
        setRememberMe(rem);
        if (saved && (saved.name || saved.code)) {
          setActiveInstitution(saved);
          setKurumInput(saved.name || saved.code);
          setIsEditingKurum(false);
        } else {
          setIsEditingKurum(true);
        }
      } catch (e) {
        console.warn('Kurum bilgisi yüklenemedi:', e);
      } finally {
        setInstitutionLoading(false);
      }
    })();
  }, []);

  const handleToggleRememberMe = async () => {
    const nextVal = !rememberMe;
    setRememberMe(nextVal);
    await setRememberMeSetting(nextVal);
    if (nextVal) {
      const cur = (kurumInput || '').trim();
      if (cur) {
        const info: InstitutionInfo = activeInstitution || {
          code: cur.toLowerCase().replace(/\s+/g, '-'),
          name: cur,
          isActive: true,
        };
        await saveInstitution(info);
      }
    } else {
      await clearSavedInstitution();
    }
  };

  const handleVerifyKurum = async (customCode?: string): Promise<boolean> => {
    const codeToTest = (customCode || kurumInput || '').trim();
    if (!codeToTest) {
      Alert.alert('Uyarı', 'Lütfen kurum adını veya kodunu giriniz.');
      return false;
    }
    setVerifyingKurum(true);
    try {
      const res = await verifyInstitutionOnline(codeToTest);
      if (res.success && res.data) {
        setActiveInstitution(res.data);
        setIsEditingKurum(false);
        if (rememberMe) {
          await saveInstitution(res.data);
        }
        return true;
      } else {
        // Sunucuda özel tenant bulunamadıysa bile girilen kurum adını yerel olarak koru
        const fallbackInfo: InstitutionInfo = {
          code: codeToTest.toLowerCase().replace(/\s+/g, '-'),
          name: codeToTest,
          isActive: true,
        };
        setActiveInstitution(fallbackInfo);
        setIsEditingKurum(false);
        if (rememberMe) {
          await saveInstitution(fallbackInfo);
        }
        return true;
      }
    } catch (e: any) {
      const fallbackInfo: InstitutionInfo = {
        code: codeToTest.toLowerCase().replace(/\s+/g, '-'),
        name: codeToTest,
        isActive: true,
      };
      setActiveInstitution(fallbackInfo);
      setIsEditingKurum(false);
      if (rememberMe) {
        await saveInstitution(fallbackInfo);
      }
      return true;
    } finally {
      setVerifyingKurum(false);
    }
  };

  const handleSwitchInstitution = async () => {
    setIsEditingKurum(true);
  };

  const handleClearInstitution = async () => {
    await clearSavedInstitution();
    setActiveInstitution(null);
    setIsEditingKurum(true);
  };

  // Sunucu Bağlantı Ayarları Modalı
  const [serverSettingsModalVisible, setServerSettingsModalVisible] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [testingServerUrl, setTestingServerUrl] = useState(false);
  const [testServerResult, setTestServerResult] = useState<{ success: boolean; msg: string } | null>(null);

  const handleOpenServerSettings = async () => {
    const current = await getBaseApiUrl();
    setServerUrlInput(current);
    setTestServerResult(null);
    setServerSettingsModalVisible(true);
  };

  const handleTestServerConnection = async () => {
    if (!serverUrlInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen geçerli bir sunucu adresi giriniz.');
      return;
    }
    setTestingServerUrl(true);
    setTestServerResult(null);
    try {
      const clean = serverUrlInput.trim().replace(/\/+$/, '');
      const healthUrl = clean.endsWith('/api') ? clean.replace(/\/api$/, '/health') : `${clean}/health`;
      const res = await fetch(healthUrl, { method: 'GET' });
      if (res.ok) {
        setTestServerResult({ success: true, msg: 'Bağlantı Başarılı! Sunucu yanıt veriyor.' });
      } else {
        setTestServerResult({ success: false, msg: `Sunucu yanıt verdi ancak durum kodu: ${res.status}` });
      }
    } catch (e: any) {
      setTestServerResult({ success: false, msg: `Bağlantı Başarısız: ${e.message || 'Sunucuya ulaşılamadı'}` });
    } finally {
      setTestingServerUrl(false);
    }
  };

  const handleSaveServerUrl = async () => {
    if (!serverUrlInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen geçerli bir sunucu adresi giriniz.');
      return;
    }
    await setBaseApiUrl(serverUrlInput.trim());
    setServerSettingsModalVisible(false);
    Alert.alert('Başarılı', 'Sunucu bağlantı adresi kaydedildi.');
  };

  const handleResetServerUrl = () => {
    setServerUrlInput(DEFAULT_API_URL);
    setTestServerResult(null);
  };

  // Okul Admini Giriş Butonu
  const handleSelectAdmin = async () => {
    if (!activeInstitution) {
      const codeToTest = (kurumInput || '').trim();
      if (!codeToTest) {
        Alert.alert(
          'Kurum Belirtilmedi',
          'Okul admini girişi için lütfen yukarıdaki kutucuğa kurum adınızı/kodunu giriniz veya deneme kurumunu (zafer-egitim) seçiniz.'
        );
        setIsEditingKurum(true);
        return;
      }
      const ok = await handleVerifyKurum(codeToTest);
      if (!ok) return;
    }
    setShowAdminLoginModal(true);
  };

  const handleConfirmAdmin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen kullanıcı adı ve şifre girin.');
      return;
    }

    const cleanInst = (activeInstitution?.code || kurumInput || '').trim().toLowerCase();
    const cleanUsername = adminUsername.trim().toLowerCase();
    const isSuperAdminTrigger = (cleanInst === 'ogretmenajanda' || cleanInst === 'ogretmen ajanda') && cleanUsername === 'mehmetsuper';

    setAdminLoading(true);
    try {
      const res = await apiRequest('auth/login', 'POST', {
        username: adminUsername.trim(),
        password: adminPassword.trim(),
        institutionCode: activeInstitution?.code || (kurumInput || '').trim(),
      });

      if (res.success && res.data) {
        const returnedRole = (res.data.role || '').toUpperCase();
        if (returnedRole === 'STUDENT' || returnedRole === 'PARENT') {
          Alert.alert(
            'Yetkisiz Giriş Engellendi',
            'Bu giriş alanı yalnızca okul idaresi ve yöneticiler içindir. Öğrenci veya veli girişi için lütfen ana ekrandaki "Öğrenci / Veli Girişi" butonunu kullanınız.'
          );
          setAdminLoading(false);
          return;
        }
        if (returnedRole === 'TEACHER') {
          Alert.alert(
            'Öğretmen Hesabı',
            'Bu hesap öğretmen rolüne sahiptir. Lütfen ana ekrandaki "Öğretmen Girişi" seçeneğini kullanınız.'
          );
          setAdminLoading(false);
          return;
        }
        if (
          returnedRole !== 'SUPERADMIN' &&
          returnedRole !== 'ADMIN' &&
          returnedRole !== 'SCHOOL_ADMIN' &&
          returnedRole !== 'STAFF' &&
          returnedRole !== 'INSTITUTION_ADMIN'
        ) {
          Alert.alert('Yetkisiz Giriş', 'Bu hesap yönetici yetkisine sahip değildir.');
          setAdminLoading(false);
          return;
        }

        const instToSave: InstitutionInfo = {
          code: res.data?.customerId || activeInstitution?.code || (kurumInput || '').trim() || 'mg-egitim',
          name: activeInstitution?.name || res.data?.schoolName || (kurumInput || '').trim() || 'Kurum',
          isActive: true,
        };
        if (rememberMe) {
          await saveInstitution(instToSave);
          await setRememberMeSetting(true);
        } else {
          await clearSavedInstitution();
          await setRememberMeSetting(false);
        }

        await saveAuthToken(res.data.token, res.data);
        setShowAdminLoginModal(false);
        const isSuper = res.data.role === 'SUPERADMIN' || isSuperAdminTrigger;
        const nextRole = isSuper ? 'superadmin' : (res.data.role === 'STAFF' ? 'staff' : 'admin');
        await setActiveUserRole(nextRole);
        onRoleSelected(nextRole);
      } else {
        // Özel Gizli Süper Admin Girişi (ogretmenajanda + mehmetsuper / 1234)
        if (isSuperAdminTrigger && (adminPassword.trim() === '1234' || adminPassword.trim() === '123456')) {
          setShowAdminLoginModal(false);
          await setActiveUserRole('superadmin');
          onRoleSelected('superadmin');
          return;
        }

        // Çevrimdışı / Yerel Test Modu Fallback (mehmetadmin / 1234)
        if (adminUsername.trim() === 'mehmetadmin' && adminPassword.trim() === '1234') {
          const instToSave: InstitutionInfo = activeInstitution || {
            code: (kurumInput || '').trim() || 'zafer-egitim',
            name: (kurumInput || '').trim() || 'Zafer Eğitim Kurumları',
            isActive: true,
          };
          if (rememberMe) {
            await saveInstitution(instToSave);
            await setRememberMeSetting(true);
          }
          setShowAdminLoginModal(false);
          await setActiveUserRole('admin');
          onRoleSelected('admin');
        } else {
          Alert.alert('Giriş Başarısız', res.error || 'Kullanıcı adı veya şifre hatalı.');
        }
      }
    } catch (e: any) {
      if (adminUsername.trim() === 'mehmetadmin' && adminPassword.trim() === '1234') {
        const instToSave: InstitutionInfo = activeInstitution || {
          code: (kurumInput || '').trim() || 'zafer-egitim',
          name: (kurumInput || '').trim() || 'Zafer Eğitim Kurumları',
          isActive: true,
        };
        if (rememberMe) {
          await saveInstitution(instToSave);
          await setRememberMeSetting(true);
        }
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
  const handleSelectTeacher = async () => {
    const raw = (kurumInput || '').trim();
    if (raw) {
      if (!activeInstitution) {
        await handleVerifyKurum(raw);
      } else if (rememberMe) {
        await saveInstitution(activeInstitution);
      }
    }
    setShowTeacherLoginModal(true);
  };

  const handleConfirmTeacher = async () => {
    if (!teacherUsername.trim() || !teacherPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen kullanıcı adı ve şifrenizi giriniz.');
      return;
    }

    const instCode = (activeInstitution?.code || kurumInput.trim() || 'mg-egitim').trim();

    setTeacherLoading(true);
    try {
      // Kurumsal Giriş (Kurum Kodu ile)
      const res = await apiRequest('auth/login', 'POST', {
        username: teacherUsername.trim(),
        password: teacherPassword.trim(),
        institutionCode: instCode,
        schoolCode: teacherSchoolCode.trim() || undefined,
      });

      if (res.success && res.data) {
        const returnedRole = (res.data.role || '').toUpperCase();
        if (returnedRole === 'STUDENT' || returnedRole === 'PARENT') {
          Alert.alert(
            'Yetkisiz Giriş Engellendi',
            'Bu giriş alanı yalnızca öğretmenler ve eğitimciler içindir. Öğrenci veya veli girişi için lütfen ana ekrandaki "Öğrenci / Veli Girişi" butonunu kullanınız.'
          );
          setTeacherLoading(false);
          return;
        }

        const instToSave: InstitutionInfo = {
          code: res.data?.customerId || res.data?.relationId || activeInstitution?.code || instCode,
          name: activeInstitution?.name || res.data?.schoolName || (kurumInput || '').trim() || instCode,
          isActive: true,
        };
        if (rememberMe) {
          await saveInstitution(instToSave);
          await setRememberMeSetting(true);
        } else {
          await clearSavedInstitution();
          await setRememberMeSetting(false);
        }

        await saveAuthToken(res.data.token, res.data);
        const displayName = res.data.fullName || teacherUsername.trim();
        await setActiveTeacherName(displayName);

        const isStaffRole = res.data.role === 'STAFF';
        const nextRole = isStaffRole ? 'staff' : 'teacher';
        await setActiveUserRole(nextRole);

        // KURUMSAL OKULLARI YEREL VERİTABANINA SENKRONİZE ET VE AKTİF OKULU BELİRLE:
        const affSchools = res.data.affiliatedSchools && res.data.affiliatedSchools.length > 0
          ? res.data.affiliatedSchools
          : (res.data.schoolName ? [{ name: res.data.schoolName, code: res.data.schoolCode || 'OKL-10001', geminiApiKey: res.data.geminiApiKey }] : []);

        const targetSchoolCode = res.data.schoolCode || affSchools[0]?.code || 'OKL-10001';

        if (affSchools.length > 0) {
          await syncAffiliatedSchools(affSchools, targetSchoolCode);
        } else if (res.data.geminiApiKey) {
          await setGeminiApiKey(res.data.geminiApiKey);
        }

        // OTOMATİK VERİ SENKRONİZASYONU:
        try {
          const { syncScheduleFromSchool } = await import('../services/scheduleSyncService');
          const { syncTeacherAssignedClassesAndStudents } = await import('../services/studentSyncService');
          const { syncYearlyPlansFromSchool } = await import('../services/yearlyPlanSyncService');

          if (targetSchoolCode) {
            await syncScheduleFromSchool(targetSchoolCode);
            await syncTeacherAssignedClassesAndStudents(targetSchoolCode);
            await syncYearlyPlansFromSchool({ providedSchoolCode: targetSchoolCode });
          }
        } catch (syncErr) {
          console.warn('Auto-sync on teacher login error:', syncErr);
        }

        setShowTeacherLoginModal(false);
        onRoleSelected(nextRole);
      } else {
        // Çevrimdışı test fallback: mehmetogretmen / 1234
        if (teacherUsername.trim() === 'mehmetogretmen' && teacherPassword.trim() === '1234') {
          const instToSave: InstitutionInfo = activeInstitution || {
            code: instCode,
            name: (kurumInput || '').trim() || 'Zafer Eğitim Kurumları',
            isActive: true,
          };
          if (rememberMe) {
            await saveInstitution(instToSave);
            await setRememberMeSetting(true);
          }

          const defaultSchools = [
            { name: 'Atatürk Anadolu Lisesi', code: 'OKL-10001', geminiApiKey: DEFAULT_GEMINI_API_KEY, geminiModel: DEFAULT_GEMINI_MODEL },
          ];
          await syncAffiliatedSchools(defaultSchools, 'OKL-10001');
          await setGeminiApiKey(DEFAULT_GEMINI_API_KEY);
          await setGeminiModel(DEFAULT_GEMINI_MODEL);
          await saveAuthToken('offline_token', {
            userId: 'offline-teacher',
            username: 'mehmetogretmen',
            fullName: 'Mehmet Öğretmen (Fizik)',
            role: 'TEACHER',
            schoolCode: 'OKL-10001',
            schoolName: 'Atatürk Anadolu Lisesi',
            geminiApiKey: DEFAULT_GEMINI_API_KEY,
            geminiModel: DEFAULT_GEMINI_MODEL,
            affiliatedSchools: defaultSchools.map(s => ({ id: s.code, name: s.name, code: s.code, geminiApiKey: s.geminiApiKey, geminiModel: s.geminiModel })),
          });
          await setActiveTeacherName('Mehmet Öğretmen (Fizik)');
          await setActiveUserRole('teacher');
          setShowTeacherLoginModal(false);
          onRoleSelected('teacher');
        } else {
          Alert.alert('Giriş Başarısız', res.error || 'Kullanıcı adı veya şifre hatalı.');
        }
      }
    } catch (e: any) {
      if (teacherUsername.trim() === 'mehmetogretmen' && teacherPassword.trim() === '1234') {
        const instToSave: InstitutionInfo = activeInstitution || {
          code: instCode,
          name: (kurumInput || '').trim() || 'Zafer Eğitim Kurumları',
          isActive: true,
        };
        if (rememberMe) {
          await saveInstitution(instToSave);
          await setRememberMeSetting(true);
        }

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

  const handleSelectParent = async () => {
    await setActiveUserRole('parent');
    onRoleSelected('parent');
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

  if (institutionLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.serverSettingsBtn}
          onPress={handleOpenServerSettings}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="server-outline" size={20} color="#64748B" />
        </TouchableOpacity>
        <View style={styles.brandIconWrap}>
          <Ionicons name="school" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.brandTitle}>Öğretmen Ajanda</Text>
        <Text style={styles.brandSub}>
          Kurumsal, hibrit ve çok rollü eğitim platformu
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <View style={styles.brandMetaBadge}>
            <Ionicons name="sparkles-outline" size={12} color="#4F46E5" />
            <Text style={styles.brandMetaEmail}>v1.0.10</Text>
          </View>
          <View style={styles.brandMetaBadge}>
            <Ionicons name="mail-outline" size={12} color="#4F46E5" />
            <Text style={styles.brandMetaEmail}>gundoner@yahoo.com</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contentWrap} showsVerticalScrollIndicator={false}>
        {/* BÖLÜM 1: ENTEGRE KURUM ALANI (GİRİŞ VEYA AKTİF KURUM KARTI) */}
        {activeInstitution && !isEditingKurum ? (
          /* Aktif Doğrulanmış Kurum Kartı */
          <View style={styles.activeInstBanner}>
            <View style={styles.activeInstIcon}>
              <Ionicons name="business" size={22} color="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.activeInstName}>{activeInstitution.name}</Text>
                <View style={styles.activeInstBadge}>
                  <Text style={styles.activeInstBadgeText}>{activeInstitution.code}</Text>
                </View>
              </View>
              <Text style={styles.activeInstQuota}>
                Lisans Aktif • {activeInstitution.maxSchoolCount} Okul Kotası
              </Text>
            </View>
            <TouchableOpacity
              style={styles.switchInstBtn}
              onPress={() => setIsEditingKurum(true)}
            >
              <Ionicons name="create-outline" size={14} color="#6D28D9" />
              <Text style={styles.switchInstBtnText}>Kurumu Değiştir</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Kurum Adı / Kodu Girme Kartı (Rol Ekranıyla Bütünleşik) */
          <View style={styles.instPromptCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.instIconWrapSmall}>
                  <Ionicons name="business" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.instTitleSmall}>Kurum Bilgisi (Adı veya Kodu)</Text>
              </View>
              {activeInstitution && (
                <TouchableOpacity onPress={() => setIsEditingKurum(false)} style={styles.cancelEditBtn}>
                  <Text style={styles.cancelEditBtnText}>Vazgeç</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.instDescSmall}>
              Lisanslı kurumunuza ait adı veya kurum kodunu yazınız:
            </Text>

            <View style={styles.instInputWrap}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#6366F1" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.instTextInput}
                placeholder="Kurum Adı veya Kodu"
                placeholderTextColor={Colors.textMuted}
                value={kurumInput}
                onChangeText={(text) => {
                  setKurumInput(text);
                  if (activeInstitution) {
                    setActiveInstitution({
                      ...activeInstitution,
                      name: text,
                      code: text.toLowerCase().replace(/\s+/g, '-'),
                    });
                  }
                }}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => handleVerifyKurum()}
              />
            </View>

            <View style={styles.instActionRow}>
              {/* Beni Hatırla Switch / Checkbox */}
              <TouchableOpacity
                style={styles.rememberRow}
                activeOpacity={0.8}
                onPress={handleToggleRememberMe}
              >
                <Ionicons
                  name={rememberMe ? 'checkbox' : 'square-outline'}
                  size={19}
                  color={rememberMe ? '#4F46E5' : Colors.textMuted}
                />
                <Text style={styles.rememberText}>Bu kurum adını hatırla</Text>
              </TouchableOpacity>

              {/* Kurumu Doğrula Butonu */}
              <TouchableOpacity
                style={styles.instSubmitBtnSmall}
                onPress={() => handleVerifyKurum()}
                disabled={verifyingKurum}
              >
                {verifyingKurum ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="checkmark-circle" size={15} color="#fff" />
                    <Text style={styles.instSubmitBtnTextSmall}>Kurumu Bağla</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* BÖLÜM 2: ROL SEÇİMİ BÖLÜMÜ */}
        <View style={{ marginTop: 14 }}>
          <Text style={styles.sectionTitle}>Lütfen Rolünüzü Seçiniz:</Text>
          <Text style={styles.sectionDesc}>
            Giriş yapmak istediğiniz paneli veya çalışma modunu seçiniz:
          </Text>

          {/* Rol Ayrımı Bilgilendirme Kutusu */}
          <View style={styles.roleTipCard}>
            <Ionicons name="information-circle" size={20} color="#4F46E5" />
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

          {/* 3. ÖĞRENCİ KARTI */}
          <TouchableOpacity style={styles.roleCard} onPress={handleSelectStudent} activeOpacity={0.85}>
            <View style={[styles.roleIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="school" size={28} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.roleCardTitle}>Öğrenci Paneli</Text>
                <View style={[styles.popBadge, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={[styles.popBadgeText, { color: '#065F46' }]}>Öğrenci</Text>
                </View>
              </View>
              <Text style={styles.roleCardDesc}>
                Ödev teslimleri, quizler, sınıf haftalık ders programı ve öğrenci bildirimleri.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* 4. VELİ KARTI */}
          <TouchableOpacity style={styles.roleCard} onPress={handleSelectParent} activeOpacity={0.85}>
            <View style={[styles.roleIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="people" size={28} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.roleCardTitle}>Veli Portalı</Text>
                <View style={[styles.popBadge, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={[styles.popBadgeText, { color: '#1E40AF' }]}>Veli Takip</Text>
                </View>
              </View>
              <Text style={styles.roleCardDesc}>
                Öğrenci gelişim takibi, pedagojik öğretmen görüşleri, ders programı ve veli anonsları.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Telif Hakları & İletişim Footer */}
          <View style={styles.footerCopyrightBox}>
            <Text style={styles.footerCopyrightText}>
              © {new Date().getFullYear()} Öğretmen Ajanda v1.0.10 • Tüm hakları saklıdır.
            </Text>
            <View style={styles.footerContactRow}>
              <Ionicons name="mail-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.footerContactText}>Geliştirici: gundoner@yahoo.com</Text>
            </View>
          </View>
        </View>
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

            {(activeInstitution || (kurumInput && kurumInput.trim())) ? (
              <View style={styles.modalInstBadge}>
                <Ionicons name="business" size={14} color="#4338CA" />
                <Text style={styles.modalInstBadgeText}>
                  Kurum: <Text style={{ fontWeight: '800' }}>{activeInstitution?.name || activeInstitution?.code || kurumInput.trim()}</Text>
                </Text>
              </View>
            ) : null}

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı"
              placeholderTextColor={Colors.textMuted}
              value={adminUsername}
              onChangeText={setAdminUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Şifre</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Şifre"
              placeholderTextColor={Colors.textMuted}
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
            />

            {/* Beni Hatırla Checkbox */}
            <TouchableOpacity
              style={styles.modalRememberRow}
              activeOpacity={0.8}
              onPress={handleToggleRememberMe}
            >
              <Ionicons
                name={rememberMe ? 'checkbox' : 'square-outline'}
                size={18}
                color={rememberMe ? '#4F46E5' : Colors.textMuted}
              />
              <Text style={styles.modalRememberText}>Beni Hatırla (Oturumu açık tut)</Text>
            </TouchableOpacity>

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

            {(activeInstitution || (kurumInput && kurumInput.trim())) ? (
              <View style={styles.modalInstBadge}>
                <Ionicons name="business" size={14} color="#4338CA" />
                <Text style={styles.modalInstBadgeText}>
                  Kurum: <Text style={{ fontWeight: '800' }}>{activeInstitution?.name || activeInstitution?.code || kurumInput.trim()}</Text>
                </Text>
              </View>
            ) : null}

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı"
              placeholderTextColor={Colors.textMuted}
              value={teacherUsername}
              onChangeText={setTeacherUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 8 }]}>Şifre</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Şifre"
              placeholderTextColor={Colors.textMuted}
              value={teacherPassword}
              onChangeText={setTeacherPassword}
              secureTextEntry
            />

            {/* Beni Hatırla Checkbox */}
            <TouchableOpacity
              style={styles.modalRememberRow}
              activeOpacity={0.8}
              onPress={handleToggleRememberMe}
            >
              <Ionicons
                name={rememberMe ? 'checkbox' : 'square-outline'}
                size={18}
                color={rememberMe ? '#4F46E5' : Colors.textMuted}
              />
              <Text style={styles.modalRememberText}>Beni Hatırla (Oturumu açık tut)</Text>
            </TouchableOpacity>

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

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Kullanıcı Adı"
              placeholderTextColor={Colors.textMuted}
              value={superAdminUsername}
              onChangeText={setSuperAdminUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Şifre</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Şifre"
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

      {/* Sunucu Bağlantı Ayarları Modalı */}
      <Modal visible={serverSettingsModalVisible} animationType="fade" transparent>
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="server" size={22} color="#4F46E5" />
                <Text style={styles.promptTitle}>Sunucu Bağlantısı</Text>
              </View>
              <TouchableOpacity onPress={() => setServerSettingsModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.promptDesc}>
              Mobil uygulamanın bağlandığı API sunucu adresini buradan değiştirebilirsiniz.
            </Text>

            <Text style={styles.inputLabel}>API Sunucu URL'i</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="http://ogretmenajanda.runasp.net/api"
              placeholderTextColor={Colors.textMuted}
              value={serverUrlInput}
              onChangeText={setServerUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {testServerResult && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: testServerResult.success ? '#DCFCE7' : '#FEE2E2',
                }}
              >
                <Ionicons
                  name={testServerResult.success ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={testServerResult.success ? '#16A34A' : '#DC2626'}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: testServerResult.success ? '#166534' : '#991B1B',
                    flex: 1,
                  }}
                >
                  {testServerResult.msg}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1, backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                onPress={handleTestServerConnection}
                disabled={testingServerUrl}
              >
                {testingServerUrl ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Text style={[styles.cancelBtnText, { color: '#4F46E5' }]}>Bağlantıyı Test Et</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={handleResetServerUrl}
              >
                <Text style={styles.cancelBtnText}>Varsayılana Dön</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setServerSettingsModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Kapat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#4F46E5' }]}
                onPress={handleSaveServerUrl}
              >
                <Text style={styles.confirmBtnText}>Kaydet</Text>
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
    position: 'relative',
    width: '100%',
  },
  serverSettingsBtn: {
    position: 'absolute',
    right: 0,
    top: 4,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 10,
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
  brandMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  brandMetaEmail: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    letterSpacing: 0.2,
  },
  footerCopyrightBox: {
    marginTop: 22,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  footerCopyrightText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  footerContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerContactText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
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
  // Kurum Doğrulama & Multi-Tenant Stilleri
  instPromptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  instIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  instTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  instDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  instInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  instTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 14,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 12,
    color: '#3730A3',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  rememberText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  instSubmitBtn: {
    width: '100%',
    height: 50,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  instSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  activeInstBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  activeInstIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activeInstName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  activeInstBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  activeInstBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4338CA',
  },
  activeInstQuota: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  switchInstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginLeft: 6,
  },
  switchInstBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  modalInstBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  modalInstBadgeText: {
    fontSize: 12,
    color: '#3730A3',
  },
  modalRememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  modalRememberText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  instIconWrapSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instTitleSmall: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  instDescSmall: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 16,
  },
  cancelEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  cancelEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  instActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  instSubmitBtnSmall: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  instSubmitBtnTextSmall: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
