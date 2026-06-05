import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { db } from '../database';

// Simple Custom Radio Button
const RadioButton = ({ selected, onPress, label, color = '#2196F3' }: any) => (
  <TouchableOpacity style={styles.radioContainer} onPress={onPress}>
    <View style={[styles.radioOuter, { borderColor: selected ? color : '#999' }]}>
      {selected && <View style={[styles.radioInner, { backgroundColor: color }]} />}
    </View>
    <Text style={styles.radioLabel}>{label}</Text>
  </TouchableOpacity>
);
const StudentItem = memo(({ item, onUpdate }: { item: any; onUpdate: (id: number, status: string) => void }) => (
  <View style={styles.studentCard}>
    <View style={styles.studentInfoRow}>
      <Text style={styles.studentText}>
        <Text style={styles.bold}>Salon:</Text> {item.salon} | <Text style={styles.bold}>Sıra:</Text> {item.sira}
      </Text>
      <Text style={styles.studentText}>
        <Text style={styles.bold}>Sınıf:</Text> {item.sinifDüzey}-{item.sube}
      </Text>
    </View>
    <View style={styles.studentInfoRow}>
      <Text style={styles.studentText}>
        <Text style={styles.bold}>No:</Text> {item.ogrenciNo}
      </Text>
      <Text style={styles.studentText} numberOfLines={1}>
        <Text style={styles.bold}>Ad:</Text> {item.adSoyad}
      </Text>
    </View>

    <View style={styles.radioGroup}>
      <RadioButton
        label="Var"
        color="#4CAF50"
        selected={item.geldiMi === 'var'}
        onPress={() => onUpdate(item.id, 'var')}
      />
      <RadioButton
        label="Yok"
        color="#F44336"
        selected={item.geldiMi === 'yok'}
        onPress={() => onUpdate(item.id, 'yok')}
      />
      <RadioButton
        label="Geç"
        color="#FF9800"
        selected={item.geldiMi === 'geç'}
        onPress={() => onUpdate(item.id, 'geç')}
      />
      <RadioButton
        label="Bilinmiyor"
        color="#9E9E9E"
        selected={item.geldiMi === 'kontrol edilmedi'}
        onPress={() => onUpdate(item.id, 'kontrol edilmedi')}
      />
    </View>
  </View>
));

export default function AttendanceScreen({ route }: any) {
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
    // Initial fetch to populate dropdowns
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
      // Optimistic UI update (only the changed row)
      setStudents(prev => prev.map(s => s.id === id ? { ...s, geldiMi: status } : s));
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }, []);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <StudentItem item={item} onUpdate={updateAttendance} />
  ), [updateAttendance]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.examTitle}>{exam.sinavAd}</Text>
        <Text style={styles.examDate}>{exam.tarih}</Text>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <View style={styles.pickerContainer}>
            <Text style={styles.filterLabel}>Şube:</Text>
            <Picker
              selectedValue={subeFilter}
              style={styles.picker}
              onValueChange={(val) => setSubeFilter(val)}>
              <Picker.Item label="Hepsi" value="hepsi" />
              {subeList.map(s => <Picker.Item key={s} label={s} value={s} />)}
            </Picker>
          </View>
          <View style={styles.pickerContainer}>
            <Text style={styles.filterLabel}>Salon:</Text>
            <Picker
              selectedValue={salonFilter}
              style={styles.picker}
              onValueChange={(val) => setSalonFilter(val)}>
              <Picker.Item label="Hepsi" value="hepsi" />
              {salonList.map(s => <Picker.Item key={s} label={s} value={s} />)}
            </Picker>
          </View>
        </View>

        <View style={styles.filterRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 5 }]}
            placeholder="Öğrenci No"
            value={noFilter}
            onChangeText={setNoFilter}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, { flex: 2, marginLeft: 5 }]}
            placeholder="Ad Soyad"
            value={nameFilter}
            onChangeText={setNameFilter}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={30}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 15, backgroundColor: '#2196F3', alignItems: 'center' },
  examTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  examDate: { fontSize: 14, color: '#e0e0e0', marginTop: 5 },
  filters: { padding: 10, backgroundColor: '#fff', elevation: 2, marginBottom: 5 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  pickerContainer: { flex: 1, marginHorizontal: 5, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, height: 40, justifyContent: 'center' },
  picker: { height: 50 },
  filterLabel: { position: 'absolute', top: -10, left: 10, backgroundColor: '#fff', fontSize: 10, color: '#666', zIndex: 1, paddingHorizontal: 2 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4, paddingHorizontal: 10, height: 40 },
  listContent: { padding: 10 },
  studentCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 1 },
  studentInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  studentText: { fontSize: 14, color: '#333', flex: 1 },
  bold: { fontWeight: 'bold' },
  radioGroup: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  radioContainer: { flexDirection: 'row', alignItems: 'center' },
  radioOuter: { height: 20, width: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  radioInner: { height: 10, width: 10, borderRadius: 5 },
  radioLabel: { fontSize: 11, color: '#555' }
});
