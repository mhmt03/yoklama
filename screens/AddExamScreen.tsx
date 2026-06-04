import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';


// Bilgilendirme: Excel dosyası şablonu
// Aşağıdaki başlıkları aynı sırayla içermelidir:
// B: Sınıf Düzeyi | C: Şube | D: Öğrenci No | E: Ad Soyad | F: Salon | G: Sıra

import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { Picker } from '@react-native-picker/picker';
import { db } from '../database';

export default function AddExamScreen({ navigation }: any) {
  const [examName, setExamName] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [seatingData, setSeatingData] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [studentNoCol, setStudentNoCol] = useState('D'); // default D sütunu
  const [salonCol, setSalonCol] = useState('F'); // default F sütunu
  const [rowCol, setRowCol] = useState('G'); // default G sütunu
  const [startRow, setStartRow] = useState('3'); // veri başlangıç satırı (1‑tabanlı)

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const loadSeatingPlan = async () => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const fileUri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      const workbook = XLSX.read(base64, { type: 'base64' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const colToIndex = (col: string) => col.charCodeAt(0) - 65;
      const studentIdx = colToIndex(studentNoCol);
      const salonIdx = colToIndex(salonCol);
      const rowIdx = colToIndex(rowCol);
      const startIdx = Math.max(0, parseInt(startRow, 10) - 1);
      if (jsonData.length > 1) {
        const parsedData = [];
        for (let i = startIdx; i < jsonData.length; i++) {
          const row = jsonData[i];
          const studentNo = String(row[studentIdx]);
          const salon = row[salonIdx] ? String(row[salonIdx]) : '';
          const oturma = row[rowIdx] ? String(row[rowIdx]) : '';
          const studentInfo = await db.getFirstAsync<{ sinifDüzey: string; sube: string; adSoyad: string }>(
            `SELECT sinifDüzey, sube, adSoyad FROM tbl_ogrenciListe WHERE ogrenciNo = ?`,
            [studentNo]
          );
          parsedData.push({
            sinifDuzey: studentInfo?.sinifDüzey ?? '',
            sube: studentInfo?.sube ?? '',
            ogrenciNo: studentNo,
            adSoyad: studentInfo?.adSoyad ?? '',
            salonAd: salon,
            oturmaSirasi: oturma,
          });
        }
        setSeatingData(parsedData);
        Alert.alert('Başarılı', `${parsedData.length} öğrenci için oturma planı yüklendi.`);
      }
    }
  } catch (error) {
    console.error(error);
    Alert.alert('Hata', 'Dosya okunurken bir hata oluştu.');
  }
};

  const createExam = () => {
    if (!examName) {
      Alert.alert('Hata', 'Lütfen sınav adını giriniz.');
      return;
    }
    if (seatingData.length === 0) {
      Alert.alert('Hata', 'Lütfen oturma planını yükleyiniz.');
      return;
    }

    setIsCreating(true);
    setTimeout(() => {
      try {
        const formattedDate = date.toLocaleDateString('tr-TR');
        const insertExam = db.runSync(
          'INSERT INTO tbl_sinavlar (sinavAd, tarih) VALUES (?, ?)',
          [examName, formattedDate]
        );

        const sinavId = insertExam.lastInsertRowId;

        db.execSync('BEGIN TRANSACTION;');
        seatingData.forEach((student) => {
          // Öğrenci tbl_ogrenciListe tablosunda yoksa ekle/güncelle (optional based on user request, but safe to do)
          db.runSync(
            `INSERT OR IGNORE INTO tbl_ogrenciListe (ogrenciNo, sinifDüzey, sube, adSoyad) VALUES (?, ?, ?, ?)`,
            [student.ogrenciNo, student.sinifDuzey, student.sube, student.adSoyad]
          );

          db.runSync(
            `INSERT INTO tbl_salonlisteleri (sinavId, ogrenciNo, salon, sira, geldiMi) VALUES (?, ?, ?, ?, ?)`,
            [sinavId, student.salonAd, student.oturmaSirasi, 'kontrol edilmedi']
          );
        });
        db.execSync('COMMIT;');

        Alert.alert('Başarılı', 'Sınav başarıyla oluşturuldu.', [
          { text: 'Tamam', onPress: () => navigation.goBack() }
        ]);
      } catch (error) {
        db.execSync('ROLLBACK;');
        console.error(error);
        Alert.alert('Hata', 'Sınav oluşturulurken bir hata oluştu.');
      } finally {
        setIsCreating(false);
      }
    }, 100);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Sınav Adı:</Text>
        <TextInput
          style={styles.input}
          value={examName}
          onChangeText={setExamName}
          placeholder="Örn: 1. Dönem 1. Yazılı"
        />

        <Text style={styles.label}>Sınav Tarihi:</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateText}>{date.toLocaleDateString('tr-TR')}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={onChangeDate}
          />
        )}

        <View style={styles.marginBtn}>
          <View style={styles.columnPickerContainer}>
            {/* Öğrenci No, Salon, Sıra pickers */}
            <View style={styles.pickerWrapper}>
              <Text style={styles.pickerLabel}>Öğrenci No sütunu</Text>
              <Picker
                selectedValue={studentNoCol}
                onValueChange={(itemValue) => setStudentNoCol(itemValue)}
                style={styles.picker}
              >
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((col) => (
                  <Picker.Item label={col} value={col} key={col} />
                ))}
              </Picker>
            </View>
            <View style={styles.pickerWrapper}>
              <Text style={styles.pickerLabel}>Salon sütunu</Text>
              <Picker
                selectedValue={salonCol}
                onValueChange={(itemValue) => setSalonCol(itemValue)}
                style={styles.picker}
              >
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((col) => (
                  <Picker.Item label={col} value={col} key={col} />
                ))}
              </Picker>
            </View>
            <View style={styles.pickerWrapper}>
              <Text style={styles.pickerLabel}>Sıra sütunu</Text>
              <Picker
                selectedValue={rowCol}
                onValueChange={(itemValue) => setRowCol(itemValue)}
                style={styles.picker}
              >
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((col) => (
                  <Picker.Item label={col} value={col} key={col} />
                ))}
              </Picker>
            </View>
            {/* Başlangıç satırı girişi */}
            <View style={styles.rowInputWrapper}>
              <Text style={styles.pickerLabel}>Veri başlangıç satırı</Text>
              <TextInput
                style={styles.rowInput}
                value={startRow}
                onChangeText={setStartRow}
                keyboardType="numeric"
                placeholder="3"
              />
            </View>
          </View>

        </View>

        <View style={styles.marginBtn}>
          <Button
            title="Excel'den Oturma Planı Yükle"
            onPress={loadSeatingPlan}
            color="#2196F3"
          />
        </View>




        {seatingData.length > 0 && (
          <Text style={styles.infoText}>{seatingData.length} öğrenci yüklendi hazır.</Text>
        )}

        <View style={styles.marginBtn}>
          <Button
            title="Oluştur"
            onPress={createExam}
            disabled={seatingData.length === 0 || isCreating || examName === ''}
            color="#4CAF50"
          />
          {isCreating && <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 10 }} />}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 8, elevation: 2 },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, fontSize: 16, marginBottom: 15 },
  datePickerBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 12, marginBottom: 20, backgroundColor: '#fafafa' },
  dateText: { fontSize: 16, color: '#333' },
  marginBtn: { marginTop: 15 },
  infoText: { marginTop: 10, textAlign: 'center', color: '#4CAF50', fontWeight: 'bold' },
  columnPickerContainer: { marginVertical: 10 },   // ← the missing key
  pickerWrapper: { marginBottom: 10 },
  pickerLabel: { fontSize: 14, marginBottom: 4, color: '#555' },
  picker: {
    height: 54,
    backgroundColor: '#f1b9b9ff',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 4,
  },
  rowInputWrapper: { marginVertical: 6 },
  rowInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#fff'
  },
  seatingView: { marginTop: 15, backgroundColor: '#e8f5e9', padding: 15, borderRadius: 6, borderWidth: 1, borderColor: '#c5e1a5' },
  seatingTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#2e7d32' },
  seatingItem: { marginBottom: 6, padding: 8, backgroundColor: '#fff', borderRadius: 4, borderWidth: 1, borderColor: '#e8f5e9' },
  flatListContent: { paddingBottom: 80 }
});
