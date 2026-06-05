import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Button } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../database';

interface CountResult { cnt: number; }

export default function HomeScreen({ navigation }: any) {
  const [exams, setExams] = useState<any[]>([]);

  const fetchExams = useCallback(() => {
    try {
      const result = db.getAllSync('SELECT * FROM tbl_sinavlar ORDER BY sinavId DESC');
      const examsWithCount = result.map((exam:any) => {
        const count = db.getFirstSync<CountResult>('SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ?', [exam.sinavId]).cnt;
        return { ...exam, participantCount: count };
      });
      setExams(examsWithCount);
    } catch (error) {
      console.error('Error fetching exams:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchExams();
    }, [fetchExams])
  );

  const deleteExam = (id: number) => {
    Alert.alert('Sil', 'Bu sınavı ve yoklama kayıtlarını silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          try {
            db.execSync(`DELETE FROM tbl_salonlisteleri WHERE sinavId = ${id}`);
            db.execSync(`DELETE FROM tbl_sinavlar WHERE sinavId = ${id}`);
            fetchExams();
          } catch (e) {
            Alert.alert('Hata', 'Silinirken bir hata oluştu.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.examCard}>
      <View style={styles.examInfo}>
        <Text style={styles.examName}>{item.sinavAd} ({item.participantCount})</Text>
        <Text style={styles.examDate}>{item.tarih}</Text>
      </View>
      <View style={styles.examActions}>
        <TouchableOpacity style={[styles.btn, styles.btnDelete]} onPress={() => deleteExam(item.sinavId)}>
          <Text style={styles.btnText}>Sil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnAttendance]} onPress={() => navigation.navigate('Attendance', { exam: item })}>
          <Text style={styles.btnText}>Yoklama Al</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnReport]} onPress={() => navigation.navigate('Report', { exam: item })}>
          <Text style={styles.btnText}>Rapor Al</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerButtons}>
        <Button title="Öğrenci Yönetimi" onPress={() => navigation.navigate('Students')} color="#FF5722" />
        <Button title="Yeni Sınav Ekle" onPress={() => navigation.navigate('AddExam')} />
      </View>
      <FlatList
        data={exams}
        keyExtractor={(item) => item.sinavId.toString()}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz sınav eklenmemiş.</Text>}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerButtons: { padding: 15, backgroundColor: '#fff', elevation: 2, marginBottom: 10 },
  listContent: { padding: 15 },
  examCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 15, elevation: 1 },
  examInfo: { marginBottom: 15 },
  examName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  examDate: { fontSize: 14, color: '#666', marginTop: 4 },
  examActions: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, flex: 1, marginHorizontal: 4, alignItems: 'center' },
  btnDelete: { backgroundColor: '#F44336' },
  btnAttendance: { backgroundColor: '#2196F3' },
  btnReport: { backgroundColor: '#FF9800' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
});
