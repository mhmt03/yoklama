import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Button, TextInput, Modal, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../database';

export default function StudentListScreen({ navigation }: any) {
  const [students, setStudents] = useState<any[]>([]);
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
      const result = db.getAllSync('SELECT * FROM tbl_ogrenciListe');
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

  const filtered = students.filter((s) => {
    const matchesSube = filterSube ? (s.sube || '').toLowerCase().includes(filterSube.toLowerCase()) : true;
    const matchesNo = filterOgrenciNo ? (s.ogrenciNo || '').toLowerCase().includes(filterOgrenciNo.toLowerCase()) : true;
    const matchesAd = filterAdSoyad ? (s.adSoyad || '').toLowerCase().includes(filterAdSoyad.toLowerCase()) : true;
    const matchesSinif = filterSinif ? (s.sinifDüzey || '').toLowerCase().includes(filterSinif.toLowerCase()) : true;
    return matchesSube && matchesNo && matchesAd && matchesSinif;
  });

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
      console.error(e);
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
            console.error(e);
            Alert.alert('Hata', 'Silinirken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Text style={styles.itemText}>No: {item.ogrenciNo}</Text>
      <Text style={styles.itemText}>Şube: {item.sube}</Text>
      <Text style={styles.itemText}>Ad Soyad: {item.adSoyad}</Text>
      <Text style={styles.itemText}>Sınıf: {item.sinifDüzey}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnEdit]} onPress={() => startEdit(item)}>
          <Text style={styles.btnText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnDelete]} onPress={() => deleteStudent(item.ogrenciNo)}>
          <Text style={styles.btnText}>Sil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
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
      />

      {/* Edit Modal */}
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
              <Pressable style={styles.modalBtn} onPress={() => setEditingStudent(null)}>
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
  filterContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  input: { backgroundColor: '#fff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ddd', marginBottom: 5, width: '48%' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 2 },
  itemText: { fontSize: 14, color: '#333' },
  actions: { flexDirection: 'row', marginTop: 8, justifyContent: 'space-between' },
  btn: { flex: 1, paddingVertical: 6, marginHorizontal: 4, borderRadius: 4, alignItems: 'center' },
  btnEdit: { backgroundColor: '#FF9800' },
  btnDelete: { backgroundColor: '#F44336' },
  btnText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 20, color: '#777' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 8, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-around' },
  modalBtn: { paddingVertical: 8, paddingHorizontal: 20, backgroundColor: '#2196F3', borderRadius: 6 },
  modalBtnText: { color: '#fff', fontWeight: '600' },
});
