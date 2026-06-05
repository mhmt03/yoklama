import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Dimensions } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { db } from '../database';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// Premium Status Button Component
const StatusButton = ({ selected, onPress, label, color, icon }: any) => (
  <TouchableOpacity
    style={[
      styles.statusBtn,
      selected ? { backgroundColor: color, borderColor: color } : { backgroundColor: '#fff', borderColor: '#E5E7EB' }
    ]}
    onPress={onPress}
  >
    <Ionicons name={icon} size={16} color={selected ? '#fff' : '#6B7280'} />
    <Text style={[styles.statusLabel, selected ? { color: '#fff' } : { color: '#6B7280' }]}>{label}</Text>
  </TouchableOpacity>
);

const StudentItem = memo(({ item, onUpdate }: { item: any; onUpdate: (id: number, status: string) => void }) => (
  <View style={styles.studentCard}>
    <View style={styles.cardHeader}>
      <View style={styles.studentMainInfo}>
        <Text style={styles.studentName}>{item.adSoyad || 'İsimsiz Öğrenci'}</Text>
        <Text style={styles.studentNo}>
          NO: {item.ogrenciNo}  •  {item.sinifDüzey}-{item.sube}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: item.salon ? '#EEF2FF' : '#F3F4F6' }]}>
        <Text style={styles.badgeText}>{item.salon} / {item.sira}</Text>
      </View>
    </View>

    <View style={styles.cardDivider} />

    <View style={styles.statusGroup}>
      <StatusButton
        label="VAR"
        icon="checkmark-circle"
        color="#10B981"
        selected={item.geldiMi === 'var'}
        onPress={() => onUpdate(item.id, 'var')}
      />
      <StatusButton
        label="YOK"
        icon="close-circle"
        color="#EF4444"
        selected={item.geldiMi === 'yok'}
        onPress={() => onUpdate(item.id, 'yok')}
      />
      <StatusButton
        label="GEÇ"
        icon="time"
        color="#F59E0B"
        selected={item.geldiMi === 'geç'}
        onPress={() => onUpdate(item.id, 'geç')}
      />
      <StatusButton
        label="Belirsiz"
        icon="refresh-circle"
        color="#6B7280"
        selected={item.geldiMi === 'kontrol edilmedi'}
        onPress={() => onUpdate(item.id, 'kontrol edilmedi')}
      />
    </View>
  </View>
));

export default function AttendanceScreen({ route, navigation }: any) {
  const { exam } = route.params;
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [subeFilter, setSubeFilter] = useState('hepsi');
  const [salonFilter, setSalonFilter] = useState('hepsi');
  const [noFilter, setNoFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');

  // Dropdown Options
  const [subeList, setSubeList] = useState<string[]>([]);
  const [salonList, setSalonList] = useState<string[]>([]);

  const fetchStudents = useCallback(() => {
    try {
      let query = `
        SELECT 
          sl.id, 
          sl.ogrenciNo, 
          sl.salon AS salon, 
          sl.sira AS sira, 
          sl.geldiMi,
          ol.sinifDüzey, 
          ol.sube, 
          ol.adSoyad
        FROM tbl_salonlisteleri sl
        LEFT JOIN tbl_ogrenciListe ol ON sl.ogrenciNo = ol.ogrenciNo
        WHERE sl.sinavId = ?
      `;
      const params: any[] = [exam.sinavId];

      if (subeFilter !== 'hepsi') {
        query += ` AND ol.sube = ?`;
        params.push(subeFilter);
      }
      if (salonFilter !== 'hepsi') {
        query += ` AND sl.salon = ?`;
        params.push(salonFilter);
      }
      if (noFilter) {
        query += ` AND sl.ogrenciNo LIKE ?`;
        params.push(`%${noFilter}%`);
      }
      if (nameFilter) {
        query += ` AND ol.adSoyad LIKE ?`;
        params.push(`%${nameFilter}%`);
      }

      query += ` ORDER BY sl.salon ASC, sl.sira ASC`;

      const result = db.getAllSync(query, params);
      setStudents(result);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }, [exam.sinavId, subeFilter, salonFilter, noFilter, nameFilter]);

  useEffect(() => {
    try {
      const allData: any[] = db.getAllSync(`
        SELECT DISTINCT sl.salon, ol.sube 
        FROM tbl_salonlisteleri sl
        LEFT JOIN tbl_ogrenciListe ol ON sl.ogrenciNo = ol.ogrenciNo
        WHERE sl.sinavId = ?
      `, [exam.sinavId]);

      const salons = new Set<string>();
      const subes = new Set<string>();

      allData.forEach(item => {
        if (item.salon) salons.add(item.salon);
        if (item.sube) subes.add(item.sube);
      });

      setSalonList(Array.from(salons).sort());
      setSubeList(Array.from(subes).sort());
    } catch (e) {
      console.error(e);
    }
  }, [exam.sinavId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const updateAttendance = useCallback((id: number, status: string) => {
    try {
      db.runSync(`UPDATE tbl_salonlisteleri SET geldiMi = ? WHERE id = ?`, [status, id]);
      setStudents(prev => prev.map(s => s.id === id ? { ...s, geldiMi: status } : s));
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }, []);

  const stats = {
    total: students.length,
    present: students.filter(s => s.geldiMi === 'var').length,
    absent: students.filter(s => s.geldiMi === 'yok').length,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#4F46E5', '#32b8f5ff']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.examTitle}>{exam.sinavAd}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{stats.present}</Text>
              <Text style={styles.statLabel}>Var</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{stats.absent}</Text>
              <Text style={styles.statLabel}>Yok</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{stats.total}</Text>
              <Text style={styles.statLabel}>Toplam</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.filterSection}>
        <View style={styles.filterGrid}>
          <View style={styles.pickerWrapper}>
            <Text style={styles.inputLabel}>Şube</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={subeFilter}
                style={styles.picker}
                onValueChange={(val) => setSubeFilter(val)}>
                <Picker.Item label="Hepsi" value="hepsi" />
                {subeList.map(s => <Picker.Item key={s} label={s} value={s} />)}
              </Picker>
            </View>
          </View>
          <View style={styles.pickerWrapper}>
            <Text style={styles.inputLabel}>Salon</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={salonFilter}
                style={styles.picker}
                onValueChange={(val) => setSalonFilter(val)}>
                <Picker.Item label="Hepsi" value="hepsi" />
                {salonList.map(s => <Picker.Item key={s} label={s} value={s} />)}
              </Picker>
            </View>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={18} color="#9BA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="İsim veya No ile ara..."
              value={nameFilter || noFilter}
              onChangeText={(val) => {
                if (/^\d+$/.test(val)) {
                  setNoFilter(val);
                  setNameFilter('');
                } else {
                  setNameFilter(val);
                  setNoFilter('');
                }
              }}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color="#46a5e5ff" style={{ marginTop: 10 }} />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <StudentItem item={item} onUpdate={updateAttendance} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Aradığınız kriterlerde öğrenci bulunamadı.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingTop: 1,
    paddingHorizontal: 30,
    paddingBottom: 1,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  backBtn: { marginBottom: 5 },
  headerContent: { alignItems: 'center' },
  examTitle: { fontSize: 30, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 15 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statLabel: { color: '#E0E7FF', fontSize: 10, marginTop: 2 },
  statDivider: { width: 1, height: 20, backgroundColor: 'rgba(255, 255, 255, 0.2)' },

  filterSection: {
    padding: 15,
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: -15,
    borderRadius: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  filterGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pickerWrapper: { flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: 'bold', color: '#6B7280', marginBottom: 4, marginLeft: 4 },
  pickerContainer: {
    height: 40,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  picker: { height: 55, marginTop: -2 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 45,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  listContent: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 30 },
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  studentMainInfo: { flex: 1 },
  studentName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  studentNo: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: '#1d221eff' },

  cardDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },

  statusGroup: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4
  },
  statusLabel: { fontSize: 10, fontWeight: 'bold' },

  emptyContainer: { alignItems: 'center', marginTop: 50, opacity: 0.5 },
  emptyText: { color: '#6B7280', marginTop: 10, textAlign: 'center' },
});
