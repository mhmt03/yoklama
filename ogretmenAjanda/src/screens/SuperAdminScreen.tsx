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
  createdAt: string;
  licenseExpiresAt?: string;
  isActive: boolean;
  teacherCount: number;
  studentCount: number;
}

interface SystemStats {
  totalSchools: number;
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalAssignments: number;
}

export function SuperAdminScreen({ navigation }: any) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'schools' | 'logs'>('schools');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, schoolsRes, logsRes] = await Promise.all([
        apiRequest<SystemStats>('superadmin/stats'),
        apiRequest<SchoolItem[]>('superadmin/schools'),
        apiRequest<any[]>('superadmin/audit-logs?limit=50'),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data);
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

  const handleExtendLicense = async (school: SchoolItem) => {
    Alert.alert(
      'Lisans Uzatma',
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

  const filteredSchools = schools.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase())
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
          <Text style={styles.headerSubtitle}>Sistem Sahibi (Mehmet)</Text>
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
            <View style={styles.statCard}>
              <Ionicons name="document-text" size={24} color="#DC2626" />
              <Text style={styles.statValue}>{stats.totalAssignments}</Text>
              <Text style={styles.statLabel}>Ödev</Text>
            </View>
          </View>
        )}

        {/* Tab Seçimi */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'schools' && styles.tabButtonActive]}
            onPress={() => setActiveTab('schools')}
          >
            <Text style={[styles.tabText, activeTab === 'schools' && styles.tabTextActive]}>
              Okul & Lisans Yönetimi ({schools.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'logs' && styles.tabButtonActive]}
            onPress={() => setActiveTab('logs')}
          >
            <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>
              Denetim Günlüğü ({auditLogs.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : activeTab === 'schools' ? (
          <View>
            {/* Arama */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Okul adı veya kodu ara..."
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
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeText}>Kod: {school.code}</Text>
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
                      📅 Bitiş: {expiresDate ? expiresDate.toLocaleDateString('tr-TR') : 'Süresiz'}
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
  logUser: { fontSize: 11, color: Colors.primary, marginTop: 2, fontWeight: '600' },
  logDetails: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
});
