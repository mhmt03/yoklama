import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Button } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { db } from '../database';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as XLSX from 'xlsx';
interface CountResult { cnt: number; }
export default function ReportScreen({ route, navigation }: any) {
  const { exam } = route.params;
  const [stats, setStats] = useState({ total: 0, var: 0, yok: 0, gec: 0, kontrol: 0 });
  const [loading, setLoading] = useState(true);

  const [sortOption, setSortOption] = useState('salon'); // salon, sube, alfabe, numara
  const [filterOption, setFilterOption] = useState('tum'); // tum, var, yok, gec, kontrol

  const fetchStats = useCallback(() => {
    try {
      const total = db.getFirstSync<CountResult>('SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ?', [exam.sinavId])?.cnt ?? 0;
      const varCnt = db.getFirstSync<CountResult>("SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ? AND geldiMi = 'var'", [exam.sinavId])?.cnt ?? 0;
      const yokCnt = db.getFirstSync<CountResult>("SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ? AND geldiMi = 'yok'", [exam.sinavId])?.cnt ?? 0;
      const gecCnt = db.getFirstSync<CountResult>("SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ? AND geldiMi = 'geç'", [exam.sinavId])?.cnt ?? 0;
      const kontrolCnt = db.getFirstSync<CountResult>("SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ? AND geldiMi = 'kontrol edilmedi'", [exam.sinavId])?.cnt ?? 0;
      setStats({ total, var: varCnt, yok: yokCnt, gec: gecCnt, kontrol: kontrolCnt });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [exam.sinavId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const generateExcel = async () => {
    try {
      interface ReportRow {
        salon: string;
        ogrenciNo: string;
        sube: string;
        adSoyad: string;
        sinifDüzey: string;
        geldiMi: string;
      }

      const rows = db.getAllSync<ReportRow>(`
        SELECT sl.salon, sl.ogrenciNo, ol.sube, ol.adSoyad, ol.sinifDüzey, sl.geldiMi
        FROM tbl_salonlisteleri sl
        LEFT JOIN tbl_ogrenciListe ol ON sl.ogrenciNo = ol.ogrenciNo
        WHERE sl.sinavId = ?
        ORDER BY ${sortOption === 'salon' ? 'sl.salon' : sortOption === 'sube' ? 'ol.sube' : sortOption === 'alfabe' ? 'ol.adSoyad' : 'sl.ogrenciNo'}
      `, [exam.sinavId]);

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rapor');
      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      // Create a safe filename using exam name and date
      const safeName = `${exam.sinavAd.replace(/\s+/g, '_')}_${exam.tarih.replace(/\s+/g, '_')}`;
      const uri = FileSystem.documentDirectory + `${safeName}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: 'base64' });
      return uri;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const generatePDF = async () => {
    try {
      interface ReportRow {
        salon: string;
        ogrenciNo: string;
        sube: string;
        adSoyad: string;
        sinifDüzey: string;
        geldiMi: string;
      }

      const rows = db.getAllSync<ReportRow>(`
        SELECT sl.salon, sl.ogrenciNo, ol.sube, ol.adSoyad, ol.sinifDüzey, sl.geldiMi
        FROM tbl_salonlisteleri sl
        LEFT JOIN tbl_ogrenciListe ol ON sl.ogrenciNo = ol.ogrenciNo
        WHERE sl.sinavId = ?
        ORDER BY ${sortOption === 'salon' ? 'sl.salon' : sortOption === 'sube' ? 'ol.sube' : sortOption === 'alfabe' ? 'ol.adSoyad' : 'sl.ogrenciNo'}
      `, [exam.sinavId]);
      const htmlRows = rows.map(r => `<tr><td>${r.salon}</td><td>${r.ogrenciNo}</td><td>${r.sube}</td><td>${r.adSoyad}</td><td>${r.sinifDuzey}</td><td>${r.geldiMi}</td></tr>`).join('');
      const html = `
        <html><head><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}</style></head>
        <body><h2>${exam.sinavAd} - Rapor</h2>
        <table><thead><tr><th>Salon</th><th>No</th><th>Şube</th><th>Ad Soyad</th><th>Sınıf</th><th>Durum</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>`;
      const { uri: tempUri } = await Print.printToFileAsync({ html });
      // Rename PDF using exam name and date
      const safeName = `${exam.sinavAd.replace(/\s+/g, '_')}_${exam.tarih.replace(/\s+/g, '_')}`;
      const destUri = FileSystem.documentDirectory + `${safeName}.pdf`;
      await FileSystem.moveAsync({ from: tempUri, to: destUri });
      return destUri;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const handleShare = async (type: 'excel' | 'pdf') => {
    const uri = type === 'excel' ? await generateExcel() : await generatePDF();
    if (!uri) {
      Alert.alert('Hata', 'Rapor oluşturulamadı');
      return;
    }
    Alert.alert(
      'Paylaşım Seçeneği',
      'Raporu WhatsApp üzerinden paylaşmak mı, yoksa cihazda kaydetmek mi istersiniz?',
      [
        {
          text: 'WhatsApp',
          onPress: async () => {
            // Using expo-sharing; WhatsApp will appear if installed.
            await Sharing.shareAsync(uri, { mimeType: type === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' });
          },
        },
        {
          text: 'Cihaza Kaydet',
          onPress: async () => {
            // Already saved for excel; for pdf just inform user of location.
            Alert.alert('Kaydedildi', `Rapor ${type === 'excel' ? 'Excel' : 'PDF'} dosyası ${uri} yoluna kaydedildi.`);
          },
        },
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 20 }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{exam.sinavAd}</Text>
        <Text style={styles.date}>{exam.tarih}</Text>
      </View>

      <View style={styles.statsBox}>
        <Text style={styles.stat}>Katılan: {stats.total}</Text>
        <Text style={styles.stat}>Var: {stats.var}</Text>
        <Text style={styles.stat}>Yok: {stats.yok}</Text>
        <Text style={styles.stat}>Geç: {stats.gec}</Text>
        <Text style={styles.stat}>Kontrol Edilmedi: {stats.kontrol}</Text>
      </View>

      {/* Sorting options */}
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerLabel}>Sıralama:</Text>
        <Picker selectedValue={sortOption} onValueChange={setSortOption} style={styles.picker}>
          <Picker.Item label="Salona Göre" value="salon" />
          <Picker.Item label="Şubeye Göre" value="sube" />
          <Picker.Item label="Alfabetik" value="alfabe" />
          <Picker.Item label="Numaraya Göre" value="numara" />
        </Picker>
      </View>

      {/* Filter options */}
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerLabel}>Filtre:</Text>
        <Picker selectedValue={filterOption} onValueChange={setFilterOption} style={styles.picker}>
          <Picker.Item label="Tümü" value="tum" />
          <Picker.Item label="Var" value="var" />
          <Picker.Item label="Yok" value="yok" />
          <Picker.Item label="Geç" value="gec" />
          <Picker.Item label="Kontrol Edilmedi" value="kontrol" />
        </Picker>
      </View>

      <View style={styles.buttonsRow}>
        <TouchableOpacity style={[styles.btn, styles.btnExcel]} onPress={() => handleShare('excel')}>
          <Text style={styles.btnText}>Excel Rapor Al</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPdf]} onPress={() => handleShare('pdf')}>
          <Text style={styles.btnText}>PDF Rapor Al</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 10 },
  header: { alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  date: { fontSize: 14, color: '#666' },
  statsBox: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 1 },
  stat: { fontSize: 14, color: '#444' },
  pickerContainer: { backgroundColor: '#fff', marginBottom: 10, borderRadius: 6, elevation: 1 },
  pickerLabel: { marginLeft: 10, marginTop: 5, fontSize: 12, color: '#777' },
  picker: { height: 55 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15, marginBottom: 150 },
  btn: { flex: 0.45, padding: 12, borderRadius: 6, alignItems: 'center' },
  btnExcel: { backgroundColor: '#4CAF50' },
  btnPdf: { backgroundColor: '#FF9800' },
  btnText: { color: '#fff', fontWeight: '600' },
});
