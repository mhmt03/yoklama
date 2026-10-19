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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { apiRequest } from '../services/apiClient';

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
  adminUsername?: string;
  createdAt: string;
  licenseExpiresAt?: string;
  isActive: boolean;
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
  const [activeTab, setActiveTab] = useState<'institutions' | 'schools' | 'logs'>('institutions');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
  const [editMaxSchool, setEditMaxSchool] = useState('2');
  const [editContactName, setEditContactName] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
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
    setEditMaxSchool(String(inst.maxSchoolCount));
    setEditContactName(inst.contactName || '');
    setEditContactPhone(inst.contactPhone || '');
    setEditContactEmail(inst.contactEmail || '');
    setEditIsActive(inst.isActive);
    setShowEditModal(true);
  };

  // Kurum Güncelleme
  const handleUpdateInstitution = async () => {
    if (!editingInst) return;
    if (!editName.trim()) {
      Alert.alert('Uyarı', 'Lütfen kurum adını giriniz.');
      return;
    }

    setUpdatingInst(true);
    try {
      const res = await apiRequest(`superadmin/institutions/${editingInst.id}`, 'PUT', {
        name: editName.trim(),
        maxSchoolCount: parseInt(editMaxSchool, 10) || 1,
        contactName: editContactName.trim(),
        contactPhone: editContactPhone.trim(),
        contactEmail: editContactEmail.trim(),
        isActive: editIsActive,
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Kurum bilgileri ve okul kotası güncellendi.');
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

        {/* Tab Seçimi */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'institutions' && styles.tabButtonActive]}
            onPress={() => setActiveTab('institutions')}
          >
            <Text style={[styles.tabText, activeTab === 'institutions' && styles.tabTextActive]}>
              🏛️ Kurumlar ({institutions.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'schools' && styles.tabButtonActive]}
            onPress={() => setActiveTab('schools')}
          >
            <Text style={[styles.tabText, activeTab === 'schools' && styles.tabTextActive]}>
              🏫 Okullar ({schools.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'logs' && styles.tabButtonActive]}
            onPress={() => setActiveTab('logs')}
          >
            <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>
              📜 Günlük ({auditLogs.length})
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

              return (
                <View key={inst.id} style={styles.customerCard}>
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

                  <Text style={styles.customerName}>{inst.name}</Text>
                  <Text style={styles.customerUser}>
                    Yönetici: @{inst.adminUsername || 'atanmamış'} • İletişim:{' '}
                    {inst.contactName || 'Belirtilmedi'}{' '}
                    {inst.contactPhone ? `(${inst.contactPhone})` : ''}
                  </Text>

                  {/* Alt Meta Bilgisi */}
                  <View style={styles.schoolMetaRow}>
                    <Text style={styles.metaItem}>
                      🏫 Açılan Okul: {inst.currentSchoolCount} / {inst.maxSchoolCount}
                    </Text>
                    <Text style={styles.metaItem}>
                      📅 Bitiş: {expiresDate ? expiresDate.toLocaleDateString('tr-TR') : 'Süresiz'}
                    </Text>
                  </View>

                  {/* Aksiyon Butonları */}
                  <View style={styles.instActionRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                      onPress={() => handleOpenEdit(inst)}
                    >
                      <Ionicons name="settings-outline" size={15} color="#4338CA" />
                      <Text style={[styles.smallBtnText, { color: '#4338CA' }]}>Kotayı & Bilgileri Düzenle</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                      onPress={() => handleExtendInstitutionLicense(inst)}
                    >
                      <Ionicons name="time-outline" size={15} color="#059669" />
                      <Text style={[styles.smallBtnText, { color: '#059669' }]}>+1 Yıl</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                      onPress={() => handleDeleteInstitution(inst)}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      <Text style={[styles.smallBtnText, { color: '#DC2626' }]}>Sil</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : activeTab === 'schools' ? (
          <View>
            {/* Arama */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Okul adı, kodu veya kurum ara..."
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Okul Listesi */}
            {filteredSchools.map((school) => {
              const expiresDate = school.licenseExpiresAt ? new Date(school.licenseExpiresAt) : null;
              const isExpired = expiresDate ? expiresDate < new Date() : false;

              return (
                <View key={school.id} style={styles.schoolCard}>
                  <View style={styles.schoolCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.schoolName}>{school.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeText}>Kod: {school.code}</Text>
                        </View>
                        {school.customerId && (
                          <View style={[styles.codeBadge, { backgroundColor: '#EEF2FF' }]}>
                            <Text style={[styles.codeText, { color: '#4338CA' }]}>
                              Kurum: {school.customerId}
                            </Text>
                          </View>
                        )}
                        {school.dailyLessonHours && (
                          <View style={[styles.codeBadge, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.codeText, { color: '#B45309' }]}>
                              Ders: {school.dailyLessonHours} Saat
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        isExpired ? styles.statusExpired : styles.statusActive,
                      ]}
                    >
                      <Text style={styles.statusText}>{isExpired ? 'Süresi Doldu' : 'Aktif'}</Text>
                    </View>
                  </View>

                  <View style={styles.schoolMetaRow}>
                    <Text style={styles.metaItem}>👨‍🏫 {school.teacherCount} Öğretmen</Text>
                    <Text style={styles.metaItem}>🎓 {school.studentCount} Öğrenci</Text>
                    <Text style={styles.metaItem}>
                      📅 Bitiş: {expiresDate ? expiresDate.toLocaleDateString('tr-TR') : '1 Yıl'}
                    </Text>
                  </View>

                  <View style={styles.schoolActionRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                      onPress={() => handleExtendSchoolLicense(school)}
                    >
                      <Ionicons name="time-outline" size={15} color="#059669" />
                      <Text style={[styles.smallBtnText, { color: '#059669' }]}>+1 Yıl Uzat</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', marginLeft: 8 }]}
                      onPress={() => handleDeleteSchool(school)}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      <Text style={[styles.smallBtnText, { color: '#DC2626' }]}>Okulu Sil</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
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

      {/* KURUM DÜZENLEME & KOTA DEĞİŞTİRME MODALI */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="settings" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Kurum Düzenle & Kota Belirle</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {editingInst && (
              <View style={styles.editInstBadge}>
                <Text style={styles.editInstBadgeText}>
                  Kurum Kodu: <Text style={{ fontWeight: '800' }}>{editingInst.code}</Text>
                </Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.inputLabel}>Kurum Adı</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
              />

              <Text style={styles.inputLabel}>İzin Verilen Okul Kotası (Maksimum)</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: '#4F46E5', borderWidth: 2 }]}
                value={editMaxSchool}
                onChangeText={setEditMaxSchool}
                keyboardType="numeric"
              />
              <Text style={styles.inputHint}>
                💡 Süper Admin olarak bu kurumun en fazla kaç okul açabileceğini buradan belirleyebilirsiniz.
              </Text>

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
});
