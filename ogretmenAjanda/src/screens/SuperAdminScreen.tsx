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
  teacherCount: number;
  studentCount: number;
}

interface CustomerItem {
  id: string;
  customerId: string;
  relationId: string;
  fullName: string;
  username: string;
  phone?: string;
  email?: string;
  createdAt: string;
  licenseExpiresAt?: string;
  isActive: boolean;
  schoolCount: number;
  schoolNames: string[];
  teacherCount: number;
  studentCount: number;
}

interface SystemStats {
  totalSchools: number;
  totalCustomers?: number;
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalAssignments: number;
}

export function SuperAdminScreen({ navigation }: any) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'customers' | 'schools' | 'logs'>('customers');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, customersRes, schoolsRes, logsRes] = await Promise.all([
        apiRequest<SystemStats>('superadmin/stats'),
        apiRequest<CustomerItem[]>('superadmin/customers'),
        apiRequest<SchoolItem[]>('superadmin/schools'),
        apiRequest<any[]>('superadmin/audit-logs?limit=50'),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (customersRes.success && customersRes.data) setCustomers(customersRes.data);
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

  const handleExtendCustomerLicense = async (customer: CustomerItem) => {
    Alert.alert(
      'Müşteri Lisans Uzatma',
      `${customer.fullName} (${customer.customerId}) ve yönettiği ${customer.schoolCount} okul için lisansı 1 yıl uzatmak istiyor musunuz?\n\n(Tüm bağlı öğretmen ve öğrencilerin lisansı otomatik yenilenecektir)`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '+1 Yıl Uzat',
          onPress: async () => {
            const res = await apiRequest('superadmin/extend-license', 'POST', {
              targetId: customer.id,
              additionalYears: 1,
              isActive: true,
            });
            if (res.success) {
              Alert.alert('Başarılı 🎉', res.data?.message || 'Müşteri lisansı 1 yıl uzatıldı.');
              loadData();
            } else {
              Alert.alert('Hata', res.error || 'İşlem başarısız.');
            }
          },
        },
      ]
    );
  };

  const handleExtendLicense = async (school: SchoolItem) => {
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
              Alert.alert('Başarılı', res.data?.message || 'Lisans 1 yıl uzatıldı.');
              loadData();
            } else {
              Alert.alert('Hata', res.error || 'İşlem başarısız.');
            }
          },
        },
      ]
    );
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.relationId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSchools = schools.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.customerId && s.customerId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.relationId && s.relationId.toLowerCase().includes(searchQuery.toLowerCase()))
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
          <Text style={styles.headerSubtitle}>Müşteri & Lisans Yönetimi</Text>
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
              <Text style={styles.statValue}>{stats.totalCustomers || customers.length}</Text>
              <Text style={styles.statLabel}>Müşteri Admin</Text>
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

        {/* Tab Seçimi (Müşteriler, Okullar, Denetim Günlüğü) */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'customers' && styles.tabButtonActive]}
            onPress={() => setActiveTab('customers')}
          >
            <Text style={[styles.tabText, activeTab === 'customers' && styles.tabTextActive]}>
              👥 Müşteriler ({customers.length})
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
        ) : activeTab === 'customers' ? (
          <View>
            {/* Arama */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Müşteri adı, Müşteri ID veya İlişki ID ara..."
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Müşteri Listesi */}
            {filteredCustomers.map((customer) => {
              const expiresDate = customer.licenseExpiresAt ? new Date(customer.licenseExpiresAt) : null;
              const isExpired = expiresDate ? expiresDate < new Date() : false;

              return (
                <View key={customer.id} style={styles.customerCard}>
                  {/* Üst Kimlik Rozetleri */}
                  <View style={styles.badgeRow}>
                    <View style={styles.customerIdBadge}>
                      <Ionicons name="key" size={12} color="#4338CA" />
                      <Text style={styles.customerIdText}>Müşteri No: {customer.customerId}</Text>
                    </View>
                    <View style={styles.relationIdBadge}>
                      <Ionicons name="git-network-outline" size={12} color="#7C3AED" />
                      <Text style={styles.relationIdText}>İlişki ID: {customer.relationId}</Text>
                    </View>
                    <View style={[styles.statusBadge, isExpired ? styles.statusExpired : styles.statusActive, { marginLeft: 'auto' }]}>
                      <Text style={styles.statusText}>{isExpired ? 'Süresi Doldu' : '1 Yıl Aktif'}</Text>
                    </View>
                  </View>

                  <Text style={styles.customerName}>{customer.fullName}</Text>
                  <Text style={styles.customerUser}>@{customer.username} • {customer.phone || 'Telefon Yok'}</Text>

                  {/* Yönettiği Okullar */}
                  <View style={styles.managedSchoolsBox}>
                    <Text style={styles.managedSchoolsTitle}>
                      🏫 Yönettiği Okullar ({customer.schoolCount}):
                    </Text>
                    {customer.schoolNames && customer.schoolNames.length > 0 ? (
                      customer.schoolNames.map((sn, idx) => (
                        <Text key={idx} style={styles.managedSchoolItem}>• {sn}</Text>
                      ))
                    ) : (
                      <Text style={styles.noSchoolText}>Henüz okul tanımlanmamış</Text>
                    )}
                  </View>

                  {/* Alt İstatistik & Bitiş Tarihi */}
                  <View style={styles.schoolMetaRow}>
                    <Text style={styles.metaItem}>👨‍🏫 {customer.teacherCount} Öğretmen</Text>
                    <Text style={styles.metaItem}>🎓 {customer.studentCount} Öğrenci</Text>
                    <Text style={styles.metaItem}>
                      📅 Bitiş: {expiresDate ? expiresDate.toLocaleDateString('tr-TR') : '1 Yıl'}
                    </Text>
                  </View>

                  {/* Lisans Uzat Aksiyonu */}
                  <View style={styles.schoolActionRow}>
                    <TouchableOpacity
                      style={[styles.extendButton, { backgroundColor: '#059669' }]}
                      onPress={() => handleExtendCustomerLicense(customer)}
                    >
                      <Ionicons name="add-circle" size={18} color="#fff" />
                      <Text style={styles.extendButtonText}>+1 Yıl Lisans Uzat (Tüm Okullarıyla)</Text>
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
                placeholder="Okul adı, kodu veya Müşteri ID ara..."
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
                            <Text style={[styles.codeText, { color: '#4338CA' }]}>Müşteri: {school.customerId}</Text>
                          </View>
                        )}
                        {school.relationId && (
                          <View style={[styles.codeBadge, { backgroundColor: '#F3E8FF' }]}>
                            <Text style={[styles.codeText, { color: '#7E22CE' }]}>İlişki: {school.relationId}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={[styles.statusBadge, isExpired ? styles.statusExpired : styles.statusActive]}>
                      <Text style={styles.statusText}>{isExpired ? 'Süresi Doldu' : 'Aktif Lisans'}</Text>
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
                      style={styles.extendButton}
                      onPress={() => handleExtendLicense(school)}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#fff" />
                      <Text style={styles.extendButtonText}>+1 Yıl Lisans Uzat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          /* Denetim Günlüğü (Audit Log) Listesi */
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
  schoolMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 8 },
  metaItem: { fontSize: 12, color: Colors.textSecondary },
  schoolActionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  extendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  extendButtonText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 6 },
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
  relationIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  relationIdText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6D28D9',
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
  managedSchoolsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  managedSchoolsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  managedSchoolItem: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 4,
    marginTop: 2,
  },
  noSchoolText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
