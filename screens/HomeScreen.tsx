import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Button } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../database';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
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


  const loadStudentLists = () => {
    console.log('loadStudentLists called');
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
                // Handle both legacy (assets) and new (uri) result formats
                let fileUri: string | undefined;
                if ((result as any).uri) {
                  fileUri = (result as any).uri;
                } else if ((result as any).assets && (result as any).assets.length > 0) {
                  fileUri = (result as any).assets[0].uri;
                }
                if (!fileUri) {
                  return;
                }
                const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
                const workbook = XLSX.read(base64, { type: 'base64' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length > 1) {
                  db.execSync('BEGIN TRANSACTION;');
                  try {
                    // skip header row
                    for (let i = 1; i < jsonData.length; i++) {
                      const row = jsonData[i];
                      if (row.length === 0 || !row[1]) continue; // if empty or no student number

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
                  } catch (e) {
                    db.execSync('ROLLBACK;');
                    console.error(e);
                    Alert.alert('Hata', 'Veritabanına kaydedilirken hata oluştu.');
                  }
                }
              }
            } catch (error) {
              console.error(error);
              Alert.alert('Hata', 'Dosya okunurken bir hata oluştu.');
            }
          },
        },
        { text: 'İptal', style: 'cancel' },
      ]
    );
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
        <View style={{ marginTop: 10 }}>
          <Button title="Öğrenci Listelerini Yükle" onPress={loadStudentLists} color="#4CAF50" />
        </View>
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
