import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, Pressable, ScrollView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { Picker } from '@react-native-picker/picker';
import { db } from '../database';
import { Ionicons } from '@expo/vector-icons';

export default function StudentListScreen({ navigation }: any) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentNos, setSelectedStudentNos] = useState<Set<string>>(new Set());
  const [filterSube, setFilterSube] = useState('');
  const [filterOgrenciNo, setFilterOgrenciNo] = useState('');
  const [filterAdSoyad, setFilterAdSoyad] = useState('');
  const [filterSinif, setFilterSinif] = useState('');

  // Edit modal
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [editSube, setEditSube] = useState('');
  const [editAdSoyad, setEditAdSoyad] = useState('');
  const [editSinif, setEditSinif] = useState('');

  // Add single student modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addNo, setAddNo] = useState('');
  const [addAdSoyad, setAddAdSoyad] = useState('');
  const [addSube, setAddSube] = useState('');
  const [addSinif, setAddSinif] = useState('');

  // Excel Import Mapping
  const [subeCol, setSubeCol] = useState('A');
  const [noCol, setNoCol] = useState('B');
  const [adCol, setAdCol] = useState('C');
  const [sinifCol, setSinifCol] = useState('D');
  const [importStartRow, setImportStartRow] = useState('2');
  const [showImportSettings, setShowImportSettings] = useState(false);

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
      if (next.has(ogrenciNo)) next.delete(ogrenciNo);
      else next.add(ogrenciNo);
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

  // ─── Tek öğrenci ekle ───────────────────────────────────────────────────────
  const saveNewStudent = () => {
    const trimNo = addNo.trim();
    const trimAd = addAdSoyad.trim();
    if (!trimNo || !trimAd) {
      Alert.alert('Eksik Bilgi', 'Öğrenci no ve ad soyad zorunludur.');
      return;
    }
    if (!/^\d+$/.test(trimNo)) {
      Alert.alert('Hata', 'Öğrenci numarası sadece rakamlardan oluşmalıdır.');
      return;
    }
    try {
      const existing = db.getFirstSync<{ ogrenciNo: string }>(
        'SELECT ogrenciNo FROM tbl_ogrenciListe WHERE ogrenciNo = ?', [trimNo]
      );
      if (existing) {
        Alert.alert('Çakışma', `${trimNo} numaralı öğrenci zaten kayıtlı.`);
        return;
      }
      db.runSync(
        `INSERT INTO tbl_ogrenciListe (ogrenciNo, sinifDüzey, sube, adSoyad) VALUES (?, ?, ?, ?)`,
        [trimNo, addSinif.trim(), addSube.trim(), trimAd]
      );
      Alert.alert('Başarılı', 'Öğrenci eklendi.');
      setShowAddModal(false);
      setAddNo(''); setAddAdSoyad(''); setAddSube(''); setAddSinif('');
      fetchStudents();
    } catch (e) {
      Alert.alert('Hata', 'Eklenirken bir sorun oluştu.');
    }
  };

  // ─── Excel yükleme ──────────────────────────────────────────────────────────
  const loadStudentLists = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      let fileUri: string | undefined;
      if ((result as any).uri) fileUri = (result as any).uri;
      else if ((result as any).assets?.length > 0) fileUri = (result as any).assets[0].uri;
      if (!fileUri) return;

      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      const workbook = XLSX.read(base64, { type: 'base64' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (jsonData.length === 0) return;

      const colToIndex = (col: string) => col.charCodeAt(0) - 65;
      const sIdx = colToIndex(subeCol), nIdx = colToIndex(noCol);
      const aIdx = colToIndex(adCol), gIdx = colToIndex(sinifCol);
      const startIdx = Math.max(0, parseInt(importStartRow, 10) - 1);

      const studentsToProcess: any[] = [];
      const studentNosInExcel = new Set<string>();

      for (let i = startIdx; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        const rawNo = row[nIdx];
        if (rawNo === undefined || rawNo === null || String(rawNo).trim() === '') continue;
        const studentNo = String(rawNo).trim();
        if (!/^\d+$/.test(studentNo)) {
          Alert.alert('Hata', `Geçersiz öğrenci numarası: "${studentNo}" (Satır: ${i + 1}). Yükleme iptal edildi.`);
          return;
        }
        studentsToProcess.push({
          ogrenciNo: studentNo,
          sube: row[sIdx] ? String(row[sIdx]).trim() : '',
          adSoyad: row[aIdx] ? String(row[aIdx]).trim() : '',
          sinifDuzey: row[gIdx] ? String(row[gIdx]).trim() : ''
        });
        studentNosInExcel.add(studentNo);
      }

      if (studentsToProcess.length === 0) {
        Alert.alert('Uyarı', 'Yüklenecek geçerli öğrenci bulunamadı.');
        return;
      }

      const existingStudents = await db.getAllAsync<{ ogrenciNo: string }>(
        `SELECT ogrenciNo FROM tbl_ogrenciListe WHERE ogrenciNo IN (${Array.from(studentNosInExcel).map(() => '?').join(',')})`,
        Array.from(studentNosInExcel)
      );
      const existingSet = new Set(existingStudents.map(s => String(s.ogrenciNo)));

      const processImport = (shouldUpdateExisting: boolean) => {
        db.execSync('BEGIN TRANSACTION;');
        try {
          let count = 0;
          studentsToProcess.forEach(s => {
            if (existingSet.has(s.ogrenciNo) && !shouldUpdateExisting) return;
            db.runSync(
              `INSERT OR REPLACE INTO tbl_ogrenciListe (ogrenciNo, sinifDüzey, sube, adSoyad) VALUES (?, ?, ?, ?)`,
              [s.ogrenciNo, s.sinifDuzey, s.sube, s.adSoyad]
            );
            count++;
          });
          db.execSync('COMMIT;');
          Alert.alert('Başarılı', `${count} kayıt işlendi.`);
          setShowImportSettings(false);
          fetchStudents();
        } catch (e) {
          db.execSync('ROLLBACK;');
          Alert.alert('Hata', 'Veritabanına kaydedilirken hata oluştu.');
        }
      };

      if (existingSet.size > 0) {
        Alert.alert(
          'Çakışma Tespit Edildi',
          `${existingSet.size} öğrenci sistemde zaten kayıtlı. Üzerine yazılsın mı?`,
          [
            { text: 'Güncelle', onPress: () => processImport(true) },
            { text: 'Sadece Yenileri Ekle', onPress: () => processImport(false) },
            { text: 'İptal', style: 'cancel' }
          ]
        );
      } else {
        processImport(true);
      }
    } catch (error) {
      Alert.alert('Hata', 'Dosya okunurken bir hata oluştu.');
    }
  };

  const deleteAllStudents = () => {
    Alert.alert('Tümünü Sil', 'Tüm öğrenci listesini silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'TÜMÜNÜ SİL', style: 'destructive',
        onPress: () => {
          try {
            db.execSync('DELETE FROM tbl_ogrenciListe');
            Alert.alert('Başarılı', 'Liste temizlendi.');
            fetchStudents();
          } catch (e) { Alert.alert('Hata', 'Silinirken bir sorun oluştu.'); }
        },
      },
    ]);
  };

  const deleteSelectedStudents = () => {
    Alert.alert('Seçilenleri Sil', `${selectedStudentNos.size} öğrenciyi silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'SİL', style: 'destructive',
        onPress: () => {
          try {
            db.execSync('BEGIN TRANSACTION;');
            selectedStudentNos.forEach(no => db.runSync('DELETE FROM tbl_ogrenciListe WHERE ogrenciNo = ?', [no]));
            db.execSync('COMMIT;');
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
      setEditingStudent(null);
      fetchStudents();
    } catch (e) { Alert.alert('Hata', 'Güncelleme sırasında bir sorun oluştu.'); }
  };

  const deleteStudent = (ogrenciNo: string) => {
    Alert.alert('Sil', 'Bu öğrenciyi silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: () => {
          try {
            db.runSync('DELETE FROM tbl_ogrenciListe WHERE ogrenciNo = ?', [ogrenciNo]);
            fetchStudents();
          } catch (e) { Alert.alert('Hata', 'Silinirken bir sorun oluştu.'); }
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
        {/* Üst satır: Ad Soyad + seçili badge */}
        <View style={styles.cardTop}>
          <Text style={styles.studentName} numberOfLines={1}>{item.adSoyad || '—'}</Text>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <Ionicons name="checkmark" size={11} color="#2196F3" />
              <Text style={styles.selectedBadgeText}>SEÇİLDİ</Text>
            </View>
          )}
        </View>

        {/* Alt satır: No, Şube, Sınıf + butonlar */}
        <View style={styles.cardBottom}>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>No</Text>
              <Text style={styles.metaValue}>{item.ogrenciNo}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Şube</Text>
              <Text style={styles.metaValue}>{item.sube || '—'}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Sınıf</Text>
              <Text style={styles.metaValue}>{item.sinifDüzey || '—'}</Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnEdit]}
              onPress={(e) => { e.stopPropagation(); startEdit(item); }}
            >
              <Ionicons name="pencil" size={13} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnDelete]}
              onPress={(e) => { e.stopPropagation(); deleteStudent(item.ogrenciNo); }}
            >
              <Ionicons name="trash" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <View style={styles.container}>

      {/* ── Üst buton grubu ─────────────────────────────────────────────── */}
      <View style={styles.managementHeader}>
        <View style={styles.managementRow}>
          <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#10B981' }]} onPress={() => setShowAddModal(true)}>
            <Ionicons name="person-add" size={15} color="#fff" />
            <Text style={styles.mBtnText}>Öğrenci Ekle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#4F46E5' }]} onPress={() => setShowImportSettings(true)}>
            <Ionicons name="document" size={15} color="#fff" />
            <Text style={styles.mBtnText}>Excel'den Yükle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#EF4444' }]} onPress={deleteAllStudents}>
            <Ionicons name="trash" size={15} color="#fff" />
            <Text style={styles.mBtnText}>Tümünü Sil</Text>
          </TouchableOpacity>
        </View>
        {selectedStudentNos.size > 0 && (
          <TouchableOpacity
            style={[styles.mBtn, { backgroundColor: '#F97316', marginTop: 8, alignSelf: 'stretch' }]}
            onPress={deleteSelectedStudents}
          >
            <Ionicons name="trash-bin" size={15} color="#fff" />
            <Text style={styles.mBtnText}>Seçilenleri Sil ({selectedStudentNos.size})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filtreler ───────────────────────────────────────────────────── */}
      <View style={styles.filterContainer}>
        <TextInput placeholder="Şube" value={filterSube} onChangeText={setFilterSube} style={styles.input} placeholderTextColor="#9CA3AF" />
        <TextInput placeholder="Öğrenci No" value={filterOgrenciNo} onChangeText={setFilterOgrenciNo} style={styles.input} placeholderTextColor="#9CA3AF" />
        <TextInput placeholder="Ad Soyad" value={filterAdSoyad} onChangeText={setFilterAdSoyad} style={styles.input} placeholderTextColor="#9CA3AF" />
        <TextInput placeholder="Sınıf Düzeyi" value={filterSinif} onChangeText={setFilterSinif} style={styles.input} placeholderTextColor="#9CA3AF" />
      </View>

      {/* ── Liste ───────────────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.ogrenciNo}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Kayıt bulunamadı.</Text>}
        contentContainerStyle={{ paddingBottom: 150 }}
      />

      {/* ══ TEK ÖĞRENCİ EKLEME MODALI ════════════════════════════════════ */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Öğrenci Ekle</Text>

            <Text style={styles.fieldLabel}>Öğrenci No *</Text>
            <TextInput
              style={styles.modalInput}
              value={addNo}
              onChangeText={setAddNo}
              keyboardType="numeric"
              placeholder="örn. 12345"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.fieldLabel}>Ad Soyad *</Text>
            <TextInput
              style={styles.modalInput}
              value={addAdSoyad}
              onChangeText={setAddAdSoyad}
              placeholder="örn. Ahmet Yılmaz"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalRow}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={styles.fieldLabel}>Şube</Text>
                <TextInput
                  style={styles.modalInput}
                  value={addSube}
                  onChangeText={setAddSube}
                  placeholder="örn. A"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Sınıf Düzeyi</Text>
                <TextInput
                  style={styles.modalInput}
                  value={addSinif}
                  onChangeText={setAddSinif}
                  placeholder="örn. 9"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#10B981' }]} onPress={saveNewStudent}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.modalBtnText}>Kaydet</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#9CA3AF' }]}
                onPress={() => {
                  setShowAddModal(false);
                  setAddNo(''); setAddAdSoyad(''); setAddSube(''); setAddSinif('');
                }}
              >
                <Ionicons name="close" size={16} color="#fff" />
                <Text style={styles.modalBtnText}>İptal</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ EXCEL AYARLARI MODALI ══════════════════════════════════════════ */}
      <Modal visible={showImportSettings} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Excel Yükleme Ayarları</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {[
                { label: 'Öğrenci No Sütunu', val: noCol, set: setNoCol },
                { label: 'Ad Soyad Sütunu', val: adCol, set: setAdCol },
                { label: 'Şube Sütunu', val: subeCol, set: setSubeCol },
                { label: 'Sınıf Düzeyi Sütunu', val: sinifCol, set: setSinifCol },
              ].map(({ label, val, set }) => (
                <View style={styles.pickerWrapper} key={label}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <View style={styles.pickerBox}>
                    <Picker selectedValue={val} onValueChange={set} style={styles.picker}>
                      {COLS.map(c => <Picker.Item label={c} value={c} key={c} />)}
                    </Picker>
                  </View>
                </View>
              ))}
              <View style={styles.pickerWrapper}>
                <Text style={styles.fieldLabel}>Veri Başlangıç Satırı</Text>
                <TextInput
                  style={styles.modalInput}
                  value={importStartRow}
                  onChangeText={setImportStartRow}
                  keyboardType="numeric"
                  placeholder="2"
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#4F46E5' }]} onPress={loadStudentLists}>
                <Ionicons name="cloud-upload" size={15} color="#fff" />
                <Text style={styles.modalBtnText}>Dosya Seç ve Yükle</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#9CA3AF' }]} onPress={() => setShowImportSettings(false)}>
                <Ionicons name="close" size={15} color="#fff" />
                <Text style={styles.modalBtnText}>İptal</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ DÜZENLEME MODALI ══════════════════════════════════════════════ */}
      <Modal visible={!!editingStudent} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Öğrenci Düzenle</Text>
            <Text style={styles.fieldLabel}>Ad Soyad</Text>
            <TextInput style={styles.modalInput} value={editAdSoyad} onChangeText={setEditAdSoyad} placeholder="Ad Soyad" />
            <View style={styles.modalRow}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={styles.fieldLabel}>Şube</Text>
                <TextInput style={styles.modalInput} value={editSube} onChangeText={setEditSube} placeholder="Şube" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Sınıf Düzeyi</Text>
                <TextInput style={styles.modalInput} value={editSinif} onChangeText={setEditSinif} placeholder="Sınıf" />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#4F46E5' }]} onPress={saveEdit}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.modalBtnText}>Kaydet</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#9CA3AF' }]} onPress={() => setEditingStudent(null)}>
                <Ionicons name="close" size={16} color="#fff" />
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
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 10 },

  // Üst buton grubu
  managementHeader: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  managementRow: { flexDirection: 'row', gap: 6 },
  mBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 8,
  },
  mBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  // Filtreler
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#EEF2FF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    width: '48%',
    fontSize: 13,
    color: '#111827',
  },

  // Öğrenci kartı
  card: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 7,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#C7D2FE',
  },
  selectedCard: { backgroundColor: '#EFF6FF', borderLeftColor: '#2196F3' },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  studentName: { fontSize: 15, fontWeight: 'bold', color: '#111827', flex: 1 },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  selectedBadgeText: { fontSize: 9, fontWeight: 'bold', color: '#2196F3' },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', gap: 6, flex: 1 },
  metaChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: 'center',
  },
  metaLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '600' },
  metaValue: { fontSize: 12, color: '#374151', fontWeight: 'bold' },

  cardActions: { flexDirection: 'row', gap: 5, marginLeft: 8 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnEdit: { backgroundColor: '#F59E0B' },
  btnDelete: { backgroundColor: '#EF4444' },

  empty: { textAlign: 'center', marginTop: 20, color: '#9CA3AF' },

  // Modal ortak
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 14,
    textAlign: 'center',
    color: '#111827',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: 3,
    marginLeft: 2,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 9,
    marginBottom: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  modalRow: { flexDirection: 'row' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6, gap: 10 },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  // Excel picker
  pickerWrapper: { marginBottom: 8 },
  pickerBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    overflow: 'hidden',
    height: 42,
    justifyContent: 'center',
  },
  picker: { height: 55, marginTop: -4 },
});
