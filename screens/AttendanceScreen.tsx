import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { db } from '../database';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Premium Status Button Component
const StatusButton = ({ selected, onPress, label, color, icon }: any) => (
  <TouchableOpacity
    style={[
      styles.statusBtn,
      selected ? { backgroundColor: color, borderColor: color } : { backgroundColor: '#fff', borderColor: '#E5E7EB' }
    ]}
    onPress={onPress}
  >
    <Ionicons name={icon} size={14} color={selected ? '#fff' : '#6B7280'} />
    <Text style={[styles.statusLabel, selected ? { color: '#fff' } : { color: '#6B7280' }]}>{label}</Text>
  </TouchableOpacity>
);

const StudentItem = memo(({ item, onUpdate }: { item: any; onUpdate: (id: number, status: string) => void }) => (
  <View style={styles.studentCard}>
    <View style={styles.cardHeader}>
      <View style={styles.studentMainInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.studentName}>{item.adSoyad || 'İsimsiz Öğrenci'}</Text>
          <View style={styles.classBadge}>
            <Text style={styles.classBadgeText}>{item.sinifDüzey}-{item.sube}</Text>
          </View>
        </View>
        <Text style={styles.studentNo}>No: {item.ogrenciNo}</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: item.salon ? '#EEF2FF' : '#F3F4F6' }]}>
        <Text style={styles.badgeText}>{item.salon} / {item.sira}</Text>
      </View>
    </View>

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
        label="?"
        icon="refresh-circle"
        color="#6B7280"
        selected={item.geldiMi === 'kontrol edilmedi'}
        onPress={() => onUpdate(item.id, 'kontrol edilmedi')}
      />
    </View>
  </View>
));

type SortMode = 'name' | 'seat';

export default function AttendanceScreen({ route, navigation }: any) {
  const { exam } = route.params;
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('seat');

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

      if (sortMode === 'name') {
        query += ` ORDER BY ol.adSoyad ASC`;
      } else {
        query += ` ORDER BY sl.salon ASC, sl.sira ASC`;
      }

      const result = db.getAllSync(query, params);
      setStudents(result);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }, [exam.sinavId, subeFilter, salonFilter, noFilter, nameFilter, sortMode]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
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

  // Ekrandaki (filtrelenmiş) öğrencilere toplu işlem
  const bulkUpdate = useCallback((status: string) => {
    const labelMap: Record<string, string> = {
      var: 'Tümü VAR',
      yok: 'Tümü YOK',
      'kontrol edilmedi': 'Tümü Belirsiz',
    };
    Alert.alert(
      'Toplu İşlem',
      `Ekrandaki ${students.length} öğrenci "${labelMap[status]}" olarak işaretlenecek. Devam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet',
          onPress: () => {
            try {
              const ids = students.map(s => s.id);
              ids.forEach(id => {
                db.runSync(`UPDATE tbl_salonlisteleri SET geldiMi = ? WHERE id = ?`, [status, id]);
              });
              setStudents(prev => prev.map(s => ({ ...s, geldiMi: status })));
            } catch (error) {
              console.error('Bulk update error:', error);
            }
          },
        },
      ]
    );
  }, [students]);

  const stats = {
    total: students.length,
    present: students.filter(s => s.geldiMi === 'var').length,
    absent: students.filter(s => s.geldiMi === 'yok').length,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#4F46E5', '#32b8f5ff']} style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.examTitle}>{exam.sinavAd}</Text>
            <View style={{ width: 24 }} />
          </View>

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
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.filterSection}>
        {/* Şube & Salon Picker */}
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

        {/* Arama + Sıralama + Toplu İşlem */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={16} color="#9BA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="İsim veya No..."
              placeholderTextColor="#9BA3AF"
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

          {/* Sıralama butonları */}
          <TouchableOpacity
            style={[styles.iconBtn, sortMode === 'name' && styles.iconBtnActive]}
            onPress={() => setSortMode('name')}
          >
            <Ionicons name="text" size={15} color={sortMode === 'name' ? '#fff' : '#4F46E5'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, sortMode === 'seat' && styles.iconBtnActive]}
            onPress={() => setSortMode('seat')}
          >
            <Ionicons name="grid" size={15} color={sortMode === 'seat' ? '#fff' : '#4F46E5'} />
          </TouchableOpacity>

          {/* Toplu işlem butonları */}
          <TouchableOpacity style={[styles.iconBtn, { borderColor: '#10B981' }]} onPress={() => bulkUpdate('var')}>
            <Ionicons name="checkmark-circle" size={15} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: '#EF4444' }]} onPress={() => bulkUpdate('yok')}>
            <Ionicons name="close-circle" size={15} color="#EF4444" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: '#6B7280' }]} onPress={() => bulkUpdate('kontrol edilmedi')}>
            <Ionicons name="help-circle" size={15} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Sıralama & toplu işlem etiketleri */}
        <View style={styles.hintRow}>
          <Text style={styles.hintText}>
            {sortMode === 'name' ? '↑ Ada göre sıralı' : '↑ Oturma sırasına göre sıralı'}
          </Text>
          <Text style={styles.hintText}>✓ / ✗ / ? toplu işlem</Text>
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
  container: { flex: 1, backgroundColor: '#F9FAFB', paddingBottom: 100 },

  // Header
  header: {
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 1,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  examTitle: { fontSize: 17, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  statLabel: { color: '#fa7b05ff', fontSize: 10, marginTop: 1 },
  statDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Filter Section
  filterSection: {
    padding: 10,
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: -12,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  filterGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pickerWrapper: { flex: 1 },
  inputLabel: { fontSize: 10, fontWeight: 'bold', color: '#6B7280', marginBottom: 2, marginLeft: 2 },
  pickerContainer: {
    height: 36,
    backgroundColor: '#a8c1f3ff',
    borderRadius: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  picker: { height: 50, marginTop: -4 },

  // Search row
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#93b5f7ff',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
  },
  searchIcon: { marginRight: 5 },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },

  // Icon buttons (sort + bulk)
  iconBtn: {
    width: 34,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },

  // Hint row
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingHorizontal: 2,
  },
  hintText: { fontSize: 9, color: '#9CA3AF' },

  // List
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 30 },

  // Student Card
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  studentMainInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  studentName: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
  classBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  classBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#1D4ED8' },
  studentNo: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    marginLeft: 6,
  },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#1d221eff' },

  // Status buttons
  statusGroup: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
  },
  statusLabel: { fontSize: 9, fontWeight: 'bold' },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 50, opacity: 0.5 },
  emptyText: { color: '#6B7280', marginTop: 10, textAlign: 'center' },
});
