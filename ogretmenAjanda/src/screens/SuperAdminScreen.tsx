import React, { useEffect, useState } from 'react';
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
  Switch,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { apiRequest } from '../services/apiClient';
import { BackupModuleView } from '../components/BackupModuleView';

interface SchoolItem {
  id: string;
  name: string;
  code: string;
  phone?: string;
  customerId?: string;
  relationId?: string;
  createdAt: string;
  licenseExpiresAt?: string;
  isActive: boolean;
  dailyLessonHours?: number;
  teacherCount: number;
  studentCount: number;
}

interface InstitutionItem {
  id: string;
  code: string;
  name: string;
  maxSchoolCount: number;
  currentSchoolCount: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  adminUserId?: string;
  adminUsername?: string;
  adminFullName?: string;
  adminPassword?: string;
  totalTeachers?: number;
  totalStudents?: number;
  createdAt: string;
  licenseExpiresAt?: string;
  isActive: boolean;
}

interface InstitutionDetails {
  institution: InstitutionItem;
  adminUser?: {
    id: string;
    username: string;
    fullName: string;
    email?: string;
    phone?: string;
    role: string;
    rawPassword?: string;
  };
  schools: SchoolItem[];
  teachers: Array<{
    id: string;
    fullName: string;
    username: string;
    branch?: string;
    schoolName?: string;
    lastLoginAt?: string;
    isActive: boolean;
  }>;
  students: Array<{
    id: string;
    fullName: string;
    studentNumber?: string;
    gradeSection?: string;
    schoolName?: string;
  }>;
  auditLogs: Array<any>;
  stats: {
    totalSchools: number;
    maxSchools: number;
    totalTeachers: number;
    totalStudents: number;
    totalLogs: number;
  };
}

interface SystemStats {
  totalSchools: number;
  totalInstitutions?: number;
  totalCustomers?: number;
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalAssignments: number;
}

export function SuperAdminScreen({ navigation }: any) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionItem[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'institutions' | 'logs' | 'backups'>('institutions');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Hiyerarşik Seçili Kurum Detayları
  const [expandedInstId, setExpandedInstId] = useState<string | null>(null);
  const [instDetails, setInstDetails] = useState<Record<string, InstitutionDetails>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [instSubTab, setInstSubTab] = useState<'schools' | 'teachers' | 'students' | 'logs'>('schools');
  const [showAdminPassMap, setShowAdminPassMap] = useState<Record<string, boolean>>({});

  // Yeni Kurum Modalı
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newMaxSchool, setNewMaxSchool] = useState('2');
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('1234');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newDurationYears, setNewDurationYears] = useState('1');
  const [savingInstitution, setSavingInstitution] = useState(false);

  // Kurum Düzenleme Modalı
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInst, setEditingInst] = useState<InstitutionItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editMaxSchool, setEditMaxSchool] = useState('2');
  const [editContactName, setEditContactName] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editExpiresDate, setEditExpiresDate] = useState('');
  const [editAdminUsername, setEditAdminUsername] = useState('');
  const [editAdminPassword, setEditAdminPassword] = useState('');
  const [showEditAdminPass, setShowEditAdminPass] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [updatingInst, setUpdatingInst] = useState(false);

  const loadData = async () => {
    try {
      const [statsRes, instRes, schoolsRes, logsRes] = await Promise.all([
        apiRequest<SystemStats>('superadmin/stats'),
        apiRequest<InstitutionItem[]>('superadmin/institutions'),
        apiRequest<SchoolItem[]>('superadmin/schools'),
        apiRequest<any[]>('superadmin/audit-logs?limit=50'),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (instRes.success && instRes.data) setInstitutions(instRes.data);
      if (schoolsRes.success && schoolsRes.data) setSchools(schoolsRes.data);
      if (logsRes.success && logsRes.data) setAuditLogs(logsRes.data);

      // Eğer şu an genişletilmiş bir kurum varsa detayını da yenile
      if (expandedInstId) {
        fetchInstitutionDetails(expandedInstId);
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Veriler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Kurum Detayı Çekme
  const fetchInstitutionDetails = async (instId: string) => {
    setLoadingDetailsId(instId);
    try {
      const res = await apiRequest<InstitutionDetails>(`superadmin/institutions/${instId}/details`);
      if (res.success && res.data) {
        setInstDetails((prev) => ({ ...prev, [instId]: res.data! }));
      } else {
        Alert.alert('Hata', res.error || 'Kurum detayları yüklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Detaylar alınırken hata oluştu.');
    } finally {
      setLoadingDetailsId(null);
    }
  };

  // Kurum Kartına Tıklanması (Genişlet / Kapat)
  const handleToggleInstitution = (instId: string) => {
    if (expandedInstId === instId) {
      setExpandedInstId(null);
    } else {
      setExpandedInstId(instId);
      if (!instDetails[instId]) {
        fetchInstitutionDetails(instId);
      }
    }
  };

  // Yeni Kurum Oluşturma
  const handleCreateInstitution = async () => {
    if (!newCode.trim() || !newName.trim() || !newAdminUser.trim() || !newAdminPass.trim()) {
      Alert.alert('Uyarı', 'Lütfen Kurum Kodu, Adı, Yönetici Kullanıcı Adı ve Şifresini doldurunuz.');
      return;
    }

    setSavingInstitution(true);
    try {
      const res = await apiRequest('superadmin/institutions', 'POST', {
        code: newCode.trim(),
        name: newName.trim(),
        maxSchoolCount: parseInt(newMaxSchool, 10) || 2,
        adminUsername: newAdminUser.trim(),
        adminPassword: newAdminPass.trim(),
        contactName: newContactName.trim(),
        contactPhone: newContactPhone.trim(),
        contactEmail: newContactEmail.trim(),
        licenseDurationYears: parseInt(newDurationYears, 10) || 1,
      });

      if (res.success) {
        Alert.alert('Başarılı 🎉', 'Yeni kurum ve admin hesabı başarıyla tanımlandı.');
        setShowAddModal(false);
        setNewCode('');
        setNewName('');
        setNewMaxSchool('2');
        setNewAdminUser('');
        setNewAdminPass('1234');
        setNewContactName('');
        setNewContactPhone('');
        setNewContactEmail('');
        loadData();
      } else {
        Alert.alert('Hata', res.error || 'Kurum oluşturulamadı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSavingInstitution(false);
    }
  };

  // Kurum Düzenleme Aç
  const handleOpenEdit = (inst: InstitutionItem) => {
    setEditingInst(inst);
    setEditName(inst.name);
    setEditCode(inst.code);
    setEditMaxSchool(String(inst.maxSchoolCount));
    setEditContactName(inst.contactName || '');
    setEditContactPhone(inst.contactPhone || '');
    setEditContactEmail(inst.contactEmail || '');
    setEditIsActive(inst.isActive);
    setEditAdminUsername(inst.adminUsername || '');
    setEditAdminPassword(inst.adminPassword || '');
    setShowEditAdminPass(false);

    if (inst.licenseExpiresAt) {
      try {
        const d = new Date(inst.licenseExpiresAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setEditExpiresDate(`${yyyy}-${mm}-${dd}`);
      } catch {
        setEditExpiresDate('');
      }
    } else {
      setEditExpiresDate('');
    }

    setShowEditModal(true);
  };

  // Tarih Ekleme Yardımcısı (Presetler için)
  const addMonthsToDate = (months: number) => {
    let base = editExpiresDate ? new Date(editExpiresDate) : new Date();
    if (isNaN(base.getTime())) base = new Date();
    base.setMonth(base.getMonth() + months);
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    setEditExpiresDate(`${yyyy}-${mm}-${dd}`);
  };

  // Kurum Güncelleme
  const handleUpdateInstitution = async () => {
    if (!editingInst) return;
    if (!editName.trim()) {
      Alert.alert('Uyarı', 'Lütfen kurum adını giriniz.');
      return;
    }
    if (!editCode.trim()) {
      Alert.alert('Uyarı', 'Lütfen kurum kodunu giriniz.');
      return;
    }

    setUpdatingInst(true);
    try {
      const res = await apiRequest(`superadmin/institutions/${editingInst.id}`, 'PUT', {
        name: editName.trim(),
        code: editCode.trim().toLowerCase(),
        maxSchoolCount: parseInt(editMaxSchool, 10) || 1,
        contactName: editContactName.trim(),
        contactPhone: editContactPhone.trim(),
        contactEmail: editContactEmail.trim(),
        licenseExpiresAt: editExpiresDate ? editExpiresDate.trim() : null,
        adminUsername: editAdminUsername ? editAdminUsername.trim() : undefined,
        adminPassword: editAdminPassword ? editAdminPassword.trim() : undefined,
        isActive: editIsActive,
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Kurum bilgileri, lisans tarihi ve yönetici güncellendi.');
        setShowEditModal(false);
        loadData();
      } else {
        Alert.alert('Hata', res.error || 'Güncelleme yapılamadı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUpdatingInst(false);
    }
  };

  // Kurum Silme
  const handleDeleteInstitution = (inst: InstitutionItem) => {
    Alert.alert(
      'Kurumu Sil',
      `"${inst.name}" (${inst.code}) kurumunu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`superadmin/institutions/${inst.id}`, 'DELETE');
            if (res.success) {
              Alert.alert('Başarılı', 'Kurum silindi.');
              loadData();
            } else {
              Alert.alert('Hata', res.error || 'Kurum silinemedi.');
            }
          },
        },
      ]
    );
  };

  // Kurum Lisansını 1 Yıl Uzatma
  const handleExtendInstitutionLicense = async (inst: InstitutionItem) => {
    Alert.alert(
      'Lisans Uzatma',
      `${inst.name} (${inst.code}) kurumunun lisansını 1 yıl uzatmak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '+1 Yıl Uzat',
          onPress: async () => {
            const res = await apiRequest('superadmin/extend-license', 'POST', {
              targetId: inst.id,
              additionalYears: 1,
              isActive: true,
            });
            if (res.success) {
              Alert.alert('Başarılı 🎉', 'Kurum lisansı 1 yıl uzatıldı.');
              loadData();
            } else {
              Alert.alert('Hata', res.error || 'İşlem başarısız.');
            }
          },
        },
      ]
    );
  };

  // Okul Lisansını Uzatma
  const handleExtendSchoolLicense = async (school: SchoolItem) => {
    Alert.alert(
      'Okul Lisans Uzatma',
      `${school.name} okulu için lisansı 1 yıl uzatmak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '+1 Yıl Uzat',
          onPress: async () => {
            const res = await apiRequest('superadmin/extend-license', 'POST', {
              targetId: school.id,
              additionalYears: 1,
              isActive: true,
            });
            if (res.success) {
              Alert.alert('Başarılı', 'Okul lisansı 1 yıl uzatıldı.');
              loadData();
            } else {
              Alert.alert('Hata', res.error || 'İşlem başarısız.');
            }
          },
        },
      ]
    );
  };

  // Okulu Silme
  const handleDeleteSchool = (school: SchoolItem) => {
    Alert.alert(
      'Okulu Sil',
      `"${school.name}" (${school.code}) okulunu silmek istediğinizden emin misiniz? Bağlı sınıflar ve ders programları silinecektir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`superadmin/schools/${school.id}`, 'DELETE');
            if (res.success) {
              Alert.alert('Başarılı', 'Okul silindi.');
              loadData();
            } else {
              Alert.alert('Hata', res.error || 'Okul silinemedi.');
            }
          },
        },
      ]
    );
  };

  const filteredInstitutions = institutions.filter(
    (i) =>
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (i.adminUsername && i.adminUsername.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.contactName && i.contactName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredSchools = schools.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.customerId && s.customerId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Süper Admin Paneli</Text>
          <Text style={styles.headerSubtitle}>Kurum, Lisans & Kota Yönetimi</Text>
        </View>
        <TouchableOpacity onPress={loadData} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
      >
        {/* İstatistik Sayaçları */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="business" size={24} color="#6366F1" />
              <Text style={styles.statValue}>{stats.totalInstitutions || institutions.length}</Text>
              <Text style={styles.statLabel}>Kurum</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="school" size={24} color="#4F46E5" />
              <Text style={styles.statValue}>{stats.totalSchools}</Text>
              <Text style={styles.statLabel}>Okul</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="people" size={24} color="#059669" />
              <Text style={styles.statValue}>{stats.totalTeachers}</Text>
              <Text style={styles.statLabel}>Öğretmen</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="school-outline" size={24} color="#D97706" />
              <Text style={styles.statValue}>{stats.totalStudents}</Text>
              <Text style={styles.statLabel}>Öğrenci</Text>
            </View>
          </View>
        )}

        {/* Tab Seçimi (Üst sekmelerde ayrı okullar sekmesi kaldırıldı, kurum detayına taşındı) */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'institutions' && styles.tabButtonActive]}
            onPress={() => setActiveTab('institutions')}
          >
            <Text style={[styles.tabText, activeTab === 'institutions' && styles.tabTextActive]}>
              🏛️ Kurumlar & Okullar ({institutions.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'logs' && styles.tabButtonActive]}
            onPress={() => setActiveTab('logs')}
          >
            <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>
              📜 Sistem Günlüğü ({auditLogs.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'backups' && styles.tabButtonActive]}
            onPress={() => setActiveTab('backups')}
          >
            <Text style={[styles.tabText, activeTab === 'backups' && styles.tabTextActive]}>
              💾 Tam Sistem Yedeği
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : activeTab === 'institutions' ? (
          <View>
            {/* Yeni Kurum Ekle Butonu */}
            <TouchableOpacity
              style={styles.addInstBtn}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={20} color="#FFFFFF" />
              <Text style={styles.addInstBtnText}>Yeni Kurum & Lisans Tanımla</Text>
            </TouchableOpacity>

            {/* Arama */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Kurum adı, kodu veya admin ara..."
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Kurum Listesi */}
            {filteredInstitutions.map((inst) => {
              const expiresDate = inst.licenseExpiresAt ? new Date(inst.licenseExpiresAt) : null;
              const isExpired = expiresDate ? expiresDate < new Date() : false;
              const isFullQuota = inst.currentSchoolCount >= inst.maxSchoolCount;
              const isExpanded = expandedInstId === inst.id;
              const details = instDetails[inst.id];
              const isLoadingDetails = loadingDetailsId === inst.id;
              const showPassword = !!showAdminPassMap[inst.id];
              const adminPass = inst.adminPassword || details?.institution?.adminPassword || details?.adminUser?.rawPassword || '1234';

              return (
                <View
                  key={inst.id}
                  style={[
                    styles.customerCard,
                    isExpanded && styles.customerCardExpanded,
                  ]}
                >
                  {/* Tıklanabilir Üst Alan */}
                  <TouchableOpacity
                    onPress={() => handleToggleInstitution(inst.id)}
                    activeOpacity={0.7}
                  >
                    {/* Üst Kimlik Rozetleri */}
                    <View style={styles.badgeRow}>
                      <View style={styles.customerIdBadge}>
                        <Ionicons name="business" size={12} color="#4338CA" />
                        <Text style={styles.customerIdText}>Kod: {inst.code}</Text>
                      </View>
                      <View
                        style={[
                          styles.quotaBadge,
                          isFullQuota ? styles.quotaBadgeFull : styles.quotaBadgeOpen,
                        ]}
                      >
                        <Ionicons
                          name="layers-outline"
                          size={12}
                          color={isFullQuota ? '#B45309' : '#047857'}
                        />
                        <Text
                          style={[
                            styles.quotaBadgeText,
                            { color: isFullQuota ? '#B45309' : '#047857' },
                          ]}
                        >
                          Okul Kotası: {inst.currentSchoolCount} / {inst.maxSchoolCount}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          isExpired || !inst.isActive ? styles.statusExpired : styles.statusActive,
                          { marginLeft: 'auto' },
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {!inst.isActive ? 'Pasif' : isExpired ? 'Süresi Doldu' : 'Lisans Aktif'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.customerName}>{inst.name}</Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up-circle' : 'chevron-down-circle'}
                        size={22}
                        color={isExpanded ? Colors.primary : Colors.textMuted}
                      />
                    </View>

                    <Text style={styles.customerUser}>
                      Yönetici: @{inst.adminUsername || 'atanmamış'} • İletişim:{' '}
                      {inst.contactName || 'Belirtilmedi'}{' '}
                      {inst.contactPhone ? `(${inst.contactPhone})` : ''}
                    </Text>

                    {/* Alt Meta Bilgisi */}
                    <View style={styles.schoolMetaRow}>
                      <Text style={styles.metaItem}>
                        🏫 Okul: {inst.currentSchoolCount} / {inst.maxSchoolCount}
                      </Text>
                      <Text style={styles.metaItem}>
                        👨‍🏫 Öğretmen: {inst.totalTeachers ?? details?.stats.totalTeachers ?? 0}
                      </Text>
                      <Text style={styles.metaItem}>
                        🎓 Öğrenci: {inst.totalStudents ?? details?.stats.totalStudents ?? 0}
                      </Text>
                      <Text style={styles.metaItem}>
                        📅 Bitiş: {expiresDate ? expiresDate.toLocaleDateString('tr-TR') : 'Süresiz'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Aksiyon Butonları */}
                  <View style={styles.instActionRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                      onPress={() => handleOpenEdit(inst)}
                    >
                      <Ionicons name="settings-outline" size={15} color="#4338CA" />
                      <Text style={[styles.smallBtnText, { color: '#4338CA' }]}>Kota, Tarih & Admin Düzenle</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                      onPress={() => handleExtendInstitutionLicense(inst)}
                    >
                      <Ionicons name="time-outline" size={15} color="#059669" />
                      <Text style={[styles.smallBtnText, { color: '#059669' }]}>+1 Yıl</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.smallBtn,
                        {
                          backgroundColor: isExpanded ? '#F1F5F9' : '#EDE9FE',
                          borderColor: isExpanded ? '#CBD5E1' : '#DDD6FE',
                        },
                      ]}
                      onPress={() => handleToggleInstitution(inst.id)}
                    >
                      <Ionicons
                        name={isExpanded ? 'contract-outline' : 'expand-outline'}
                        size={15}
                        color={isExpanded ? '#475569' : '#6D28D9'}
                      />
                      <Text
                        style={[
                          styles.smallBtnText,
                          { color: isExpanded ? '#475569' : '#6D28D9' },
                        ]}
                      >
                        {isExpanded ? 'Detayları Kapat' : 'Alt Detaylar & Okullar'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', marginLeft: 'auto' }]}
                      onPress={() => handleDeleteInstitution(inst)}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      <Text style={[styles.smallBtnText, { color: '#DC2626' }]}>Sil</Text>
                    </TouchableOpacity>
                  </View>

                  {/* GENİŞLETİLMİŞ KURUM ALANI: ADMİN BİLGİLERİ VE 4 ALT SEKME */}
                  {isExpanded && (
                    <View style={styles.expandedContainer}>
                      {isLoadingDetails && !details ? (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
                      ) : (
                        <>
                          {/* 1. Kurum Admin Bilgileri Kartı (Kullanıcı Adı & Şifre) */}
                          <View style={styles.adminCredentialsCard}>
                            <View style={styles.adminCardHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="shield-checkmark" size={18} color="#4338CA" />
                                <Text style={styles.adminCardTitle}>Kurum Yöneticisi (Admin Hesabı)</Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleOpenEdit(inst)}
                                style={styles.adminCardEditBtn}
                              >
                                <Ionicons name="create-outline" size={14} color="#4338CA" />
                                <Text style={styles.adminCardEditText}>Düzenle</Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.adminCredentialsGrid}>
                              <View style={styles.credentialItem}>
                                <Text style={styles.credentialLabel}>Yetkili Adı</Text>
                                <Text style={styles.credentialValue}>
                                  {inst.adminFullName || details?.adminUser?.fullName || inst.contactName || 'Belirtilmedi'}
                                </Text>
                              </View>

                              <View style={styles.credentialItem}>
                                <Text style={styles.credentialLabel}>Kullanıcı Adı</Text>
                                <Text style={[styles.credentialValue, { color: '#4F46E5', fontWeight: '800' }]}>
                                  @{inst.adminUsername || details?.adminUser?.username || 'atanmamış'}
                                </Text>
                              </View>

                              <View style={[styles.credentialItem, { flex: 1.2 }]}>
                                <Text style={styles.credentialLabel}>Giriş Şifresi</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  <Text
                                    style={[
                                      styles.credentialValue,
                                      {
                                        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                                        color: '#B91C1C',
                                        fontWeight: '800',
                                        fontSize: 14,
                                      },
                                    ]}
                                  >
                                    {showPassword ? adminPass : '••••••••'}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() =>
                                      setShowAdminPassMap((prev) => ({
                                        ...prev,
                                        [inst.id]: !prev[inst.id],
                                      }))
                                    }
                                    style={styles.eyeBtn}
                                  >
                                    <Ionicons
                                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                      size={16}
                                      color="#6366F1"
                                    />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          </View>

                          {/* 2. 4 Alt Sekme Başlıkları */}
                          <View style={styles.instSubTabRow}>
                            <TouchableOpacity
                              style={[
                                styles.instSubTabBtn,
                                instSubTab === 'schools' && styles.instSubTabBtnActive,
                              ]}
                              onPress={() => setInstSubTab('schools')}
                            >
                              <Text
                                style={[
                                  styles.instSubTabText,
                                  instSubTab === 'schools' && styles.instSubTabTextActive,
                                ]}
                              >
                                🏫 Okullar ({details?.schools?.length ?? inst.currentSchoolCount})
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.instSubTabBtn,
                                instSubTab === 'teachers' && styles.instSubTabBtnActive,
                              ]}
                              onPress={() => setInstSubTab('teachers')}
                            >
                              <Text
                                style={[
                                  styles.instSubTabText,
                                  instSubTab === 'teachers' && styles.instSubTabTextActive,
                                ]}
                              >
                                👨‍🏫 Öğretmen ({details?.stats?.totalTeachers ?? inst.totalTeachers ?? 0})
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.instSubTabBtn,
                                instSubTab === 'students' && styles.instSubTabBtnActive,
                              ]}
                              onPress={() => setInstSubTab('students')}
                            >
                              <Text
                                style={[
                                  styles.instSubTabText,
                                  instSubTab === 'students' && styles.instSubTabTextActive,
                                ]}
                              >
                                🎓 Öğrenci ({details?.stats?.totalStudents ?? inst.totalStudents ?? 0})
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.instSubTabBtn,
                                instSubTab === 'logs' && styles.instSubTabBtnActive,
                              ]}
                              onPress={() => setInstSubTab('logs')}
                            >
                              <Text
                                style={[
                                  styles.instSubTabText,
                                  instSubTab === 'logs' && styles.instSubTabTextActive,
                                ]}
                              >
                                📊 Günlük ({details?.auditLogs?.length ?? 0})
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* 3. Alt Sekme İçerikleri */}
                          {instSubTab === 'schools' && (
                            <View style={styles.subTabContentArea}>
                              {(!details?.schools || details.schools.length === 0) ? (
                                <View style={styles.emptySubState}>
                                  <Ionicons name="school-outline" size={32} color={Colors.textMuted} />
                                  <Text style={styles.emptySubStateText}>
                                    Bu kuruma bağlı henüz açılmış okul bulunmuyor.
                                  </Text>
                                </View>
                              ) : (
                                details.schools.map((school) => {
                                  const schExpires = school.licenseExpiresAt ? new Date(school.licenseExpiresAt) : null;
                                  const schExpired = schExpires ? schExpires < new Date() : false;
                                  return (
                                    <View key={school.id} style={styles.nestedSchoolCard}>
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <View style={{ flex: 1 }}>
                                          <Text style={styles.nestedSchoolName}>{school.name}</Text>
                                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                            <View style={styles.codeBadge}>
                                              <Text style={styles.codeText}>Kod: {school.code}</Text>
                                            </View>
                                            {school.dailyLessonHours && (
                                              <View style={[styles.codeBadge, { backgroundColor: '#FEF3C7' }]}>
                                                <Text style={[styles.codeText, { color: '#B45309' }]}>
                                                  {school.dailyLessonHours} Saat / Gün
                                                </Text>
                                              </View>
                                            )}
                                          </View>
                                        </View>
                                        <View
                                          style={[
                                            styles.statusBadge,
                                            schExpired ? styles.statusExpired : styles.statusActive,
                                          ]}
                                        >
                                          <Text style={styles.statusText}>{schExpired ? 'Süresi Doldu' : 'Aktif'}</Text>
                                        </View>
                                      </View>

                                      <View style={styles.schoolMetaRow}>
                                        <Text style={styles.metaItem}>👨‍🏫 {school.teacherCount} Öğretmen</Text>
                                        <Text style={styles.metaItem}>🎓 {school.studentCount} Öğrenci</Text>
                                        <Text style={styles.metaItem}>
                                          📅 {schExpires ? schExpires.toLocaleDateString('tr-TR') : 'Süresiz'}
                                        </Text>
                                      </View>

                                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                                        <TouchableOpacity
                                          style={[styles.smallBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                                          onPress={async () => {
                                            await handleExtendSchoolLicense(school);
                                            fetchInstitutionDetails(inst.id);
                                          }}
                                        >
                                          <Ionicons name="time-outline" size={14} color="#059669" />
                                          <Text style={[styles.smallBtnText, { color: '#059669' }]}>+1 Yıl</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                          style={[styles.smallBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                                          onPress={async () => {
                                            await handleDeleteSchool(school);
                                            fetchInstitutionDetails(inst.id);
                                          }}
                                        >
                                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                                          <Text style={[styles.smallBtnText, { color: '#DC2626' }]}>Okulu Sil</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  );
                                })
                              )}
                            </View>
                          )}

                          {instSubTab === 'teachers' && (
                            <View style={styles.subTabContentArea}>
                              {(!details?.teachers || details.teachers.length === 0) ? (
                                <View style={styles.emptySubState}>
                                  <Ionicons name="people-outline" size={32} color={Colors.textMuted} />
                                  <Text style={styles.emptySubStateText}>
                                    Bu kuruma bağlı okullarda henüz kayıtlı öğretmen bulunmuyor.
                                  </Text>
                                </View>
                              ) : (
                                details.teachers.map((t) => (
                                  <View key={t.id} style={styles.subListItem}>
                                    <View style={styles.subListIcon}>
                                      <Ionicons name="person" size={16} color="#059669" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.subListTitle}>{t.fullName}</Text>
                                      <Text style={styles.subListSubtitle}>
                                        @{t.username} • {t.branch || 'Branş Belirtilmedi'}
                                      </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                      <Text style={styles.subListTag}>{t.schoolName || 'Okul'}</Text>
                                      <Text style={styles.subListDate}>
                                        {t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleDateString('tr-TR') : 'Hiç girmedi'}
                                      </Text>
                                    </View>
                                  </View>
                                ))
                              )}
                            </View>
                          )}

                          {instSubTab === 'students' && (
                            <View style={styles.subTabContentArea}>
                              {(!details?.students || details.students.length === 0) ? (
                                <View style={styles.emptySubState}>
                                  <Ionicons name="school-outline" size={32} color={Colors.textMuted} />
                                  <Text style={styles.emptySubStateText}>
                                    Bu kuruma bağlı okullarda kayıtlı öğrenci bulunmuyor.
                                  </Text>
                                </View>
                              ) : (
                                details.students.map((s) => (
                                  <View key={s.id} style={styles.subListItem}>
                                    <View style={[styles.subListIcon, { backgroundColor: '#FEF3C7' }]}>
                                      <Ionicons name="school" size={16} color="#D97706" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.subListTitle}>{s.fullName}</Text>
                                      <Text style={styles.subListSubtitle}>
                                        No: {s.studentNumber || '-'} • Sınıf: {s.gradeSection || '-'}
                                      </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                      <Text style={[styles.subListTag, { backgroundColor: '#FEF3C7', color: '#92400E' }]}>
                                        {s.schoolName || 'Okul'}
                                      </Text>
                                    </View>
                                  </View>
                                ))
                              )}
                            </View>
                          )}

                          {instSubTab === 'logs' && (
                            <View style={styles.subTabContentArea}>
                              {/* Hızlı Özet Kartları */}
                              <View style={styles.subStatsRow}>
                                <View style={styles.subStatBox}>
                                  <Text style={styles.subStatBoxVal}>{details?.stats.totalSchools ?? 0}</Text>
                                  <Text style={styles.subStatBoxLbl}>Okul</Text>
                                </View>
                                <View style={styles.subStatBox}>
                                  <Text style={styles.subStatBoxVal}>{details?.stats.totalTeachers ?? 0}</Text>
                                  <Text style={styles.subStatBoxLbl}>Öğretmen</Text>
                                </View>
                                <View style={styles.subStatBox}>
                                  <Text style={styles.subStatBoxVal}>{details?.stats.totalStudents ?? 0}</Text>
                                  <Text style={styles.subStatBoxLbl}>Öğrenci</Text>
                                </View>
                                <View style={styles.subStatBox}>
                                  <Text style={styles.subStatBoxVal}>{details?.auditLogs?.length ?? 0}</Text>
                                  <Text style={styles.subStatBoxLbl}>İşlem</Text>
                                </View>
                              </View>

                              {(!details?.auditLogs || details.auditLogs.length === 0) ? (
                                <View style={styles.emptySubState}>
                                  <Ionicons name="time-outline" size={32} color={Colors.textMuted} />
                                  <Text style={styles.emptySubStateText}>
                                    Bu kuruma ait denetim günlüğü kaydı bulunmuyor.
                                  </Text>
                                </View>
                              ) : (
                                details.auditLogs.map((log) => (
                                  <View key={log.id} style={styles.subLogItem}>
                                    <View style={styles.logHeader}>
                                      <Text style={styles.logAction}>{log.actionType}</Text>
                                      <Text style={styles.logTime}>
                                        {new Date(log.timestamp).toLocaleDateString('tr-TR')}{' '}
                                        {new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                      </Text>
                                    </View>
                                    <Text style={styles.logUser}>Rol: {log.userRole}</Text>
                                    {log.detailsJson && <Text style={styles.logDetails}>{log.detailsJson}</Text>}
                                  </View>
                                ))
                              )}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : activeTab === 'backups' ? (
          <BackupModuleView isSuperAdmin={true} />
        ) : (
          /* Denetim Günlüğü Listesi */
          <View style={styles.logsList}>
            {auditLogs.map((log) => (
              <View key={log.id} style={styles.logCard}>
                <View style={styles.logHeader}>
                  <Text style={styles.logAction}>{log.actionType}</Text>
                  <Text style={styles.logTime}>
                    {new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.logUser}>Rol: {log.userRole}</Text>
                {log.detailsJson && <Text style={styles.logDetails}>{log.detailsJson}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* YENİ KURUM TANIMLAMA MODALI */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="business" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Yeni Kurum & Lisans Tanımla</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              <Text style={styles.formSectionTitle}>1. Kurum Bilgileri</Text>
              <Text style={styles.inputLabel}>Benzersiz Kurum Kodu (Küçük harf, tireli)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: zafer-egitim"
                placeholderTextColor={Colors.textMuted}
                value={newCode}
                onChangeText={setNewCode}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Kurum Adı</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Zafer Eğitim Kurumları"
                placeholderTextColor={Colors.textMuted}
                value={newName}
                onChangeText={setNewName}
              />

              <Text style={styles.inputLabel}>İzin Verilen Okul Kotası (Maksimum Okul Sayısı)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: 2"
                placeholderTextColor={Colors.textMuted}
                value={newMaxSchool}
                onChangeText={setNewMaxSchool}
                keyboardType="numeric"
              />

              <Text style={styles.formSectionTitle}>2. Kurum Yöneticisi (Admin)</Text>
              <Text style={styles.inputLabel}>Yönetici Kullanıcı Adı</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: zaferadmin"
                placeholderTextColor={Colors.textMuted}
                value={newAdminUser}
                onChangeText={setNewAdminUser}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Yönetici Şifresi</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Şifre (örn: 1234)"
                placeholderTextColor={Colors.textMuted}
                value={newAdminPass}
                onChangeText={setNewAdminPass}
                secureTextEntry
              />

              <Text style={styles.formSectionTitle}>3. İletişim & Lisans</Text>
              <Text style={styles.inputLabel}>Yetkili Adı & Soyadı</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Ahmet Şahin"
                placeholderTextColor={Colors.textMuted}
                value={newContactName}
                onChangeText={setNewContactName}
              />

              <Text style={styles.inputLabel}>Yetkili Telefonu</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="05xx xxx xx xx"
                placeholderTextColor={Colors.textMuted}
                value={newContactPhone}
                onChangeText={setNewContactPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Lisans Süresi (Yıl)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="1"
                placeholderTextColor={Colors.textMuted}
                value={newDurationYears}
                onChangeText={setNewDurationYears}
                keyboardType="numeric"
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelModalBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleCreateInstitution}
                disabled={savingInstitution}
              >
                {savingInstitution ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitModalBtnText}>Kurumu Oluştur</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* KURUM DÜZENLEME & LİSANS BİTİŞ TARİHİ & KOTA MODALI */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="settings" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Kurum, Lisans & Yönetici Düzenle</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              <Text style={styles.formSectionTitle}>1. Kurum Kimlik Bilgileri</Text>
              <Text style={styles.inputLabel}>Kurum Kodu (Küçük harf, tireli)</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: '#4F46E5', borderWidth: 1.5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}
                value={editCode}
                onChangeText={setEditCode}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Örn: zafer-egitim"
              />

              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Kurum Adı (Görünen Resmi Unvan)</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Örn: Zafer Eğitim Kurumları"
              />

              <Text style={styles.formSectionTitle}>2. Manuel Lisans Bitiş Tarihi</Text>
              <Text style={styles.inputLabel}>Lisans Bitiş Tarihi (YYYY-AA-GG)</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: '#059669', borderWidth: 1.5, fontWeight: '700' }]}
                value={editExpiresDate}
                onChangeText={setEditExpiresDate}
                placeholder="Örn: 2027-10-21"
              />
              <Text style={styles.inputHint}>
                💡 Belirlediğiniz tarih bu kuruma bağlı tüm okulların ve kullanıcıların lisans bitişine de otomatik yansıtılır.
              </Text>

              {/* Hızlı Süre Ekleme Preset Butonları */}
              <View style={styles.presetDateRow}>
                <TouchableOpacity style={styles.presetDateBtn} onPress={() => addMonthsToDate(1)}>
                  <Text style={styles.presetDateBtnText}>+1 Ay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetDateBtn} onPress={() => addMonthsToDate(6)}>
                  <Text style={styles.presetDateBtnText}>+6 Ay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetDateBtn} onPress={() => addMonthsToDate(12)}>
                  <Text style={styles.presetDateBtnText}>+1 Yıl</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetDateBtn} onPress={() => addMonthsToDate(24)}>
                  <Text style={styles.presetDateBtnText}>+2 Yıl</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.presetDateBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                  onPress={() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    setEditExpiresDate(`${yyyy}-${mm}-${dd}`);
                  }}
                >
                  <Text style={[styles.presetDateBtnText, { color: '#B45309' }]}>Bugün+1 Yıl</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.formSectionTitle}>3. Kurum Yöneticisi (Admin Girişi)</Text>
              <Text style={styles.inputLabel}>Admin Kullanıcı Adı</Text>
              <TextInput
                style={styles.modalInput}
                value={editAdminUsername}
                onChangeText={setEditAdminUsername}
                autoCapitalize="none"
                placeholder="Örn: zaferadmin"
              />

              <Text style={styles.inputLabel}>Admin Giriş Şifresi</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, borderWidth: 0 }]}
                  value={editAdminPassword}
                  onChangeText={setEditAdminPassword}
                  placeholder="Yönetici şifresi"
                  secureTextEntry={!showEditAdminPass}
                />
                <TouchableOpacity
                  onPress={() => setShowEditAdminPass(!showEditAdminPass)}
                  style={{ padding: 10 }}
                >
                  <Ionicons
                    name={showEditAdminPass ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6366F1"
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.formSectionTitle}>4. Okul Kotası & İletişim</Text>
              <Text style={styles.inputLabel}>İzin Verilen Okul Kotası (Maksimum)</Text>
              <TextInput
                style={styles.modalInput}
                value={editMaxSchool}
                onChangeText={setEditMaxSchool}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Yetkili Kişi</Text>
              <TextInput
                style={styles.modalInput}
                value={editContactName}
                onChangeText={setEditContactName}
              />

              <Text style={styles.inputLabel}>Yetkili Telefonu</Text>
              <TextInput
                style={styles.modalInput}
                value={editContactPhone}
                onChangeText={setEditContactPhone}
                keyboardType="phone-pad"
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Kurum Lisansı Aktif mi?</Text>
                <Switch
                  value={editIsActive}
                  onValueChange={setEditIsActive}
                  trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                  thumbColor={editIsActive ? '#4F46E5' : '#F1F5F9'}
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelModalBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleUpdateInstitution}
                disabled={updatingInst}
              >
                {updatingInst ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitModalBtnText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: { padding: 4 },
  headerTitleContainer: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  headerSubtitle: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  refreshButton: { padding: 8 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 4 },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 10, padding: 3, marginBottom: 16 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabButtonActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  addInstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addInstBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: Colors.text },
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  customerIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  customerIdText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3730A3',
  },
  quotaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  quotaBadgeOpen: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  quotaBadgeFull: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  quotaBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  customerName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  customerUser: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 10,
  },
  schoolMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  metaItem: { fontSize: 12, color: Colors.textSecondary },
  instActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  schoolCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  schoolCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  codeBadge: {
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  codeText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusActive: { backgroundColor: '#ECFDF5' },
  statusExpired: { backgroundColor: '#FEF2F2' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  schoolActionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  logsList: { marginTop: 4 },
  logCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  logAction: { fontSize: 13, fontWeight: '700', color: Colors.text },
  logTime: { fontSize: 11, color: Colors.textMuted },
  logUser: { fontSize: 11, color: '#4F46E5', fontWeight: '600', marginTop: 2 },
  logDetails: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  formSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
    marginTop: 10,
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: 6,
  },
  inputHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  cancelModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  submitModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editInstBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  editInstBadgeText: {
    fontSize: 12,
    color: '#3730A3',
  },
  customerCardExpanded: {
    borderColor: '#818CF8',
    borderWidth: 2,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  expandedContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  adminCredentialsCard: {
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 14,
  },
  adminCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4338CA',
  },
  adminCardEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  adminCardEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  adminCredentialsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  credentialItem: {
    flex: 1,
    minWidth: 90,
  },
  credentialLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  credentialValue: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '600',
    marginTop: 2,
  },
  eyeBtn: {
    padding: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
  },
  instSubTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  instSubTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  instSubTabBtnActive: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  instSubTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  instSubTabTextActive: {
    color: '#FFFFFF',
  },
  subTabContentArea: {
    marginTop: 4,
  },
  emptySubState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptySubStateText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  nestedSchoolCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  nestedSchoolName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  subListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  subListIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subListTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  subListSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  subListTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  subListDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  subStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  subStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subStatBoxVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4F46E5',
  },
  subStatBoxLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 2,
  },
  subLogItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  presetDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  presetDateBtn: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetDateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingRight: 4,
  },
});
