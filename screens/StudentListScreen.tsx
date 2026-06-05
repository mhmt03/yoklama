import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Button, TextInput, Modal, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../database';

export default function StudentListScreen({ navigation }: any) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentNos, setSelectedStudentNos] = useState<Set<string>>(new Set());
  const [filterSube, setFilterSube] = useState('');
  const [filterOgrenciNo, setFilterOgrenciNo] = useState('');
  const [filterAdSoyad, setFilterAdSoyad] = useState('');
  const [filterSinif, setFilterSinif] = useState('');

  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [editSube, setEditSube] = useState('');
  const [editAdSoyad, setEditAdSoyad] = useState('');
  const [editSinif, setEditSinif] = useState('');

  const fetchStudents = useCallback(() => {
    try {
      const result = db.getAllSync('SELECT * FROM tbl_ogrenciListe ORDER BY adSoyad ASC');
      setStudents(result);
    } catch (e) {
      console.error('Error fetching students', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStudents();
    }, [fetchStudents])
  );

  const toggleSelection = (ogrenciNo: string) => {
    setSelectedStudentNos(prev => {
      const next = new Set(prev);
      if (next.has(ogrenciNo)) {
        next.delete(ogrenciNo);
      } else {
        next.add(ogrenciNo);
      }
      return next;
    });
  };

  const filtered = students.filter((s) => {
    const matchesSube = filterSube ? (s.sube || '').toLowerCase().includes(filterSube.toLowerCase()) : true;
    const matchesNo = filterOgrenciNo ? (s.ogrenciNo || '').toLowerCase().includes(filterOgrenciNo.toLowerCase()) : true;
    const matchesAd = filterAdSoyad ? (s.adSoyad || '').toLowerCase().includes(filterAdSoyad.toLowerCase()) : true;
    const matchesSinif = filterSinif ? (s.sinifDüzey || '').toLowerCase().includes(filterSinif.toLowerCase()) : true;
    return matchesSube && matchesNo && matchesAd && matchesSinif;
  });

  const loadStudentLists = () => {
    Alert.alert(
      'Excel Şablonu',
      'Lütfen aşağıdaki sütun başlıklarıyla bir Excel dosyası hazırlayın:\n\nŞube, Öğrenci No, Ad Soyad, Sınıf Düzeyi',
      [
        {
          text: 'Tamam',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
                copyToCacheDirectory: true,
              });

              if (!result.canceled) {
                let fileUri: string | undefined;
                if ((result as any).uri) {
                  fileUri = (result as any).uri;
                } else if ((result as any).assets && (result as any).assets.length > 0) {
                  fileUri = (result as any).assets[0].uri;
                }
                if (!fileUri) return;

                const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
                const workbook = XLSX.read(base64, { type: 'base64' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length > 1) {
                  db.execSync('BEGIN TRANSACTION;');
                  try {
                    for (let i = 1; i < jsonData.length; i++) {
                      const row = jsonData[i];
                      if (!row || row.length === 0 || !row[1]) continue;

                      const sube = row[0] ? String(row[0]) : '';
                      const ogrenciNo = String(row[1]);
                      const adSoyad = row[2] ? String(row[2]) : '';
                      const sinifDuzey = row[3] ? String(row[3]) : '';

                      db.runSync(
                        `INSERT OR REPLACE INTO tbl_ogrenciListe (ogrenciNo, sinifDüzey, sube, adSoyad) VALUES (?, ?, ?, ?)`,
                        [ogrenciNo, sinifDuzey, sube, adSoyad]
                      );
                    }
                    db.execSync('COMMIT;');
                    Alert.alert('Başarılı', 'Öğrenci listesi başarıyla yüklendi.');
                    fetchStudents();
                  } catch (e) {
                    db.execSync('ROLLBACK;');
                    Alert.alert('Hata', 'Veritabanına kaydedilirken hata oluştu.');
                  }
                }
              }
            } catch (error) {
              Alert.alert('Hata', 'Dosya okunurken bir hata oluştu.');
            }
          },
        },
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  const deleteAllStudents = () => {
    Alert.alert('Tümünü Sil', 'Tüm öğrenci listesini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'TÜMÜNÜ SİL',
        style: 'destructive',
        onPress: () => {
          try {
            db.execSync('DELETE FROM tbl_ogrenciListe');
            Alert.alert('Başarılı', 'Tüm listesi temizlendi.');
            fetchStudents();
          } catch (e) {
            Alert.alert('Hata', 'Silinirken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  const deleteSelectedStudents = () => {
    const count = selectedStudentNos.size;
    Alert.alert('Seçilenleri Sil', `${count} öğrenciyi silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'SİL',
        style: 'destructive',
        onPress: () => {
          try {
            db.execSync('BEGIN TRANSACTION;');
            selectedStudentNos.forEach(no => {
              db.runSync('DELETE FROM tbl_ogrenciListe WHERE ogrenciNo = ?', [no]);
            });
            db.execSync('COMMIT;');
            Alert.alert('Başarılı', `${count} öğrenci silindi.`);
            setSelectedStudentNos(new Set());
            fetchStudents();
          } catch (e) {
            db.execSync('ROLLBACK;');
            Alert.alert('Hata', 'Silinirken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  const startEdit = (student: any) => {
    setEditingStudent(student);
    setEditSube(student.sube || '');
    setEditAdSoyad(student.adSoyad || '');
    setEditSinif(student.sinifDüzey || '');
  };

  const saveEdit = () => {
    if (!editingStudent) return;
    try {
      db.runSync(
        `UPDATE tbl_ogrenciListe SET sube = ?, adSoyad = ?, sinifDüzey = ? WHERE ogrenciNo = ?`,
        [editSube, editAdSoyad, editSinif, editingStudent.ogrenciNo]
      );
      Alert.alert('Başarılı', 'Öğrenci bilgileri güncellendi.');
      setEditingStudent(null);
      fetchStudents();
    } catch (e) {
      Alert.alert('Hata', 'Güncelleme sırasında bir sorun oluştu.');
    }
  };

  const deleteStudent = (ogrenciNo: string) => {
    Alert.alert('Sil', 'Bu öğrenciyi silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          try {
            db.runSync('DELETE FROM tbl_ogrenciListe WHERE ogrenciNo = ?', [ogrenciNo]);
            Alert.alert('Silindi', 'Öğrenci silindi.');
            fetchStudents();
          } catch (e) {
            Alert.alert('Hata', 'Silinirken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isSelected = selectedStudentNos.has(item.ogrenciNo);
    return (
      <TouchableOpacity 
        style={[styles.card, isSelected && styles.selectedCard]} 
        onPress={() => toggleSelection(item.ogrenciNo)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
           <Text style={styles.itemTextNo}>No: {item.ogrenciNo}</Text>
           {isSelected && <Text style={styles.selectedBadge}>SEÇİLDİ</Text>}
        </View>
        <Text style={styles.itemText}>Şube: {item.sube} | Sınıf: {item.sinifDüzey}</Text>
        <Text style={styles.itemTextName}>{item.adSoyad}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnEdit]} onPress={(e) => { e.stopPropagation(); startEdit(item); }}>
            <Text style={styles.btnText}>Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnDelete]} onPress={(e) => { e.stopPropagation(); deleteStudent(item.ogrenciNo); }}>
            <Text style={styles.btnText}>Sil</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.managementHeader}>
        <View style={styles.managementRow}>
          <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#4CAF50' }]} onPress={loadStudentLists}>
            <Text style={styles.mBtnText}>Yükle (Excel)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#F44336' }]} onPress={deleteAllStudents}>
            <Text style={styles.mBtnText}>Tümünü Sil</Text>
          </TouchableOpacity>
        </View>
        {selectedStudentNos.size > 0 && (
          <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#FF5722', marginTop: 8 }]} onPress={deleteSelectedStudents}>
            <Text style={styles.mBtnText}>Seçilenleri Sil ({selectedStudentNos.size})</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterContainer}>
        <TextInput placeholder="Şube" value={filterSube} onChangeText={setFilterSube} style={styles.input} />
        <TextInput placeholder="Öğrenci No" value={filterOgrenciNo} onChangeText={setFilterOgrenciNo} style={styles.input} />
        <TextInput placeholder="Ad Soyad" value={filterAdSoyad} onChangeText={setFilterAdSoyad} style={styles.input} />
        <TextInput placeholder="Sınıf Düzeyi" value={filterSinif} onChangeText={setFilterSinif} style={styles.input} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.ogrenciNo}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Kayıt bulunamadı.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <Modal visible={!!editingStudent} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Öğrenci Düzenle</Text>
            <TextInput placeholder="Şube" value={editSube} onChangeText={setEditSube} style={styles.modalInput} />
            <TextInput placeholder="Ad Soyad" value={editAdSoyad} onChangeText={setEditAdSoyad} style={styles.modalInput} />
            <TextInput placeholder="Sınıf Düzeyi" value={editSinif} onChangeText={setEditSinif} style={styles.modalInput} />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={saveEdit}>
                <Text style={styles.modalBtnText}>Kaydet</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#999' }]} onPress={() => setEditingStudent(null)}>
                <Text style={styles.modalBtnText}>İptal</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 10 },
  managementHeader: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 10, elevation: 2 },
  managementRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mBtn: { flex: 1, padding: 12, borderRadius: 6, alignItems: 'center', marginHorizontal: 4 },
  mBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  filterContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  input: { backgroundColor: '#fff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ddd', marginBottom: 5, width: '48%' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#ccc' },
  selectedCard: { backgroundColor: '#e3f2fd', borderLeftColor: '#2196F3' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  selectedBadge: { fontSize: 10, fontWeight: 'bold', color: '#2196F3', backgroundColor: '#fff', paddingHorizontal: 4, borderRadius: 4, borderWidth: 1, borderColor: '#2196F3' },
  itemTextNo: { fontSize: 13, color: '#666', fontWeight: '600' },
  itemTextName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 4 },
  itemText: { fontSize: 14, color: '#555' },
  actions: { flexDirection: 'row', marginTop: 10, justifyContent: 'space-between' },
  btn: { flex: 1, paddingVertical: 6, marginHorizontal: 4, borderRadius: 4, alignItems: 'center' },
  btnEdit: { backgroundColor: '#FF9800' },
  btnDelete: { backgroundColor: '#F44336' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 20, color: '#777' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 8, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-around' },
  modalBtn: { paddingVertical: 8, paddingHorizontal: 20, backgroundColor: '#2196F3', borderRadius: 6 },
  modalBtnText: { color: '#fff', fontWeight: '600' },
});
