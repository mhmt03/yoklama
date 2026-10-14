import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../theme/colors';
import { apiRequest } from '../services/apiClient';
import { parseMasterScheduleWithAi, saveMasterScheduleToServer, ParsedScheduleResult } from '../services/aiScheduleParser';
import { getActiveSchool, updateSchool } from '../database/operations/schoolOperations';

export function SchoolAdminScreen({ navigation }: any) {
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Okul Adı Düzenleme Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editSchoolPhone, setEditSchoolPhone] = useState('');
  const [updatingSchool, setUpdatingSchool] = useState(false);

  // AI Çarşaf Program Analizi Modal ve Staging Durumu
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedSchedule, setParsedSchedule] = useState<ParsedScheduleResult | null>(null);

  // Okul Ekleme Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolPhone, setNewSchoolPhone] = useState('');
  const [newSchoolApiKey, setNewSchoolApiKey] = useState('');


  const loadSchools = async () => {
    try {
      const res = await apiRequest<any[]>('schools/my-schools');
      if (res.success && res.data) {
        setSchools(res.data);
        if (res.data.length > 0 && !selectedSchool) {
          setSelectedSchool(res.data[0]);
          loadTeachers(res.data[0].id);
        }
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTeachers = async (schoolId: string) => {
    const res = await apiRequest<any[]>(`schools/${schoolId}/teachers`);
    if (res.success && res.data) {
      setTeachers(res.data);
    }
  };

  useEffect(() => {
    loadSchools();
  }, []);

  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Kopyalandı', `Okul Kodu (${code}) panoya kopyalandı. Öğretmenleriniz bu kodla sisteme bağlanabilir.`);
  };

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adı girin.');
      return;
    }
    const res = await apiRequest('schools', 'POST', {
      name: newSchoolName.trim(),
      phone: newSchoolPhone.trim(),
      geminiApiKey: newSchoolApiKey.trim(),
    });

    if (res.success && res.data) {
      Alert.alert('Başarılı', `Okul oluşturuldu. Okul Kodu: ${res.data.code}`);
      setCreateModalVisible(false);
      setNewSchoolName('');
      setNewSchoolPhone('');
      setNewSchoolApiKey('');
      loadSchools();
    } else {
      Alert.alert('Hata', res.error || 'Okul oluşturulamadı (En fazla 3 okul açabilirsiniz).');
    }
  };

  const handleUpdateSchool = async () => {
    if (!editSchoolName.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen okul adı girin.');
      return;
    }
    setUpdatingSchool(true);
    try {
      // 1. Sunucuyu güncelle
      await apiRequest(`schools/${selectedSchool.id}`, 'PUT', {
        name: editSchoolName.trim(),
        phone: editSchoolPhone.trim(),
      });

      // 2. Yerel veritabanındaki okulu da güncelle
      const active = await getActiveSchool();
      if (active) {
        await updateSchool(active.id, editSchoolName.trim(), active.color, selectedSchool.code);
      }

      Alert.alert('Başarılı', 'Okul adı başarıyla güncellendi.');
      setEditModalVisible(false);
      loadSchools();
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUpdatingSchool(false);
    }
  };

  // İki Aşamalı AI Çarşaf Program Analizi (Client-Side Staging)
  const handlePickAndAnalyzeSchedule = async () => {
    if (!selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen önce aktif bir okul seçin.');
      return;
    }

    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const file = pickerResult.assets[0];
      setAiModalVisible(true);
      setAiParsing(true);
      setParsedSchedule(null);

      // Okulun kendi Gemini API key'i varsa kullan, yoksa varsayılan
      const apiKey = selectedSchool.geminiApiKey || 'AIzaSyA_placeholder_gemini_key';

      // 1. Aşama: Telefondaki bellekte ayrıştırma
      const parsed = await parseMasterScheduleWithAi(file.uri, apiKey, file.mimeType || 'image/jpeg');
      setParsedSchedule(parsed);
    } catch (error: any) {
      Alert.alert('AI Ayrıştırma Hatası', error.message || 'Belge analiz edilemedi. Lütfen net bir fotoğraf yükleyin.');
      setAiModalVisible(false);
    } finally {
      setAiParsing(false);
    }
  };

  // 2. Aşama: Doğrulanan veriyi atomik olarak sunucuya gönderme
  const handleConfirmAndSaveSchedule = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    setAiParsing(true);
    const result = await saveMasterScheduleToServer(selectedSchool.id, parsedSchedule);
    setAiParsing(false);

    if (result.success) {
      Alert.alert('Başarılı 🎉', result.message);
      setAiModalVisible(false);
      setParsedSchedule(null);
      loadTeachers(selectedSchool.id);
    } else {
      Alert.alert('Hata', result.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Okul Yönetim Paneli</Text>
          <Text style={styles.headerSubtitle}>{selectedSchool?.name || 'Okul Seçiniz'}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (selectedSchool) {
              setEditSchoolName(selectedSchool.name || '');
              setEditSchoolPhone(selectedSchool.phone || '');
              setEditModalVisible(true);
            }
          }}
          style={styles.editSchoolBtn}
        >
          <Ionicons name="pencil" size={16} color="#4F46E5" />
          <Text style={styles.editSchoolBtnText}>Okulu Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addSchoolButton}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addSchoolText}>Yeni</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSchools(); }} />}
      >
        {/* Okul Kodu Kartı */}
        {selectedSchool && (
          <View style={styles.codeCard}>
            <View style={styles.codeCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.codeCardLabel}>ÖĞRETMEN BAĞLANTI KODU</Text>
                <Text style={styles.codeCardValue}>{selectedSchool.code}</Text>
              </View>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => handleCopyCode(selectedSchool.code)}
              >
                <Ionicons name="copy-outline" size={18} color="#fff" />
                <Text style={styles.copyButtonText}>Kodu Kopyala</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.codeCardHint}>
              Öğretmenler uygulamayı yükledikten sonra bu kodu girerek doğrudan okulunuza bağlanır.
            </Text>
          </View>
        )}


        {/* AI ile Otomatik Okul İnşası Butonu */}
        <TouchableOpacity style={styles.aiBanner} onPress={handlePickAndAnalyzeSchedule}>
          <View style={styles.aiBannerIcon}>
            <Ionicons name="sparkles" size={28} color="#fff" />
          </View>
          <View style={styles.aiBannerTextContainer}>
            <Text style={styles.aiBannerTitle}>AI ile Çarşaf Program Yükle</Text>
            <Text style={styles.aiBannerDesc}>
              Haftalık çarşaf programı yükleyin; öğretmenler, sınıflar ve dersler 30 saniyede otomatik kurulsun!
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6366F1" />
        </TouchableOpacity>

        {/* Okula Bağlı Öğretmenler */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Bağlı Öğretmenler ({teachers.length})</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
        ) : teachers.length === 0 ? (
          <View style={styles.emptyTeachers}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Henüz okul kodunuzu kullanarak bağlanan öğretmen bulunmuyor.</Text>
          </View>
        ) : (
          teachers.map((teacher) => (
            <View key={teacher.id} style={styles.teacherCard}>
              <View style={styles.teacherAvatar}>
                <Text style={styles.avatarText}>{teacher.fullName.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.teacherInfo}>
                <Text style={styles.teacherName}>{teacher.fullName}</Text>
                <Text style={styles.teacherSub}>{teacher.email || teacher.username} • {teacher.role}</Text>
              </View>
              <View style={[styles.teacherStatusBadge, teacher.isActive ? styles.statusActive : styles.statusPassive]}>
                <Text style={styles.statusText}>{teacher.isActive ? 'Aktif' : 'Onay Bekliyor'}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* AI Çarşaf Program Onay Modalı (Client Staging) */}
      <Modal visible={aiModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🪄 AI Çarşaf Program Analizi</Text>
              <TouchableOpacity onPress={() => setAiModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {aiParsing ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.aiLoadingText}>Gemini AI çarşaf programı inceliyor...</Text>
                <Text style={styles.aiLoadingSub}>Öğretmenler, sınıflar ve ders saatleri ayrıştırılıyor.</Text>
              </View>
            ) : parsedSchedule ? (
              <View style={styles.parsedPreview}>
                <Text style={styles.previewSuccessTitle}>🎉 Ayrıştırma Başarılı!</Text>
                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewVal}>{parsedSchedule.teachers.length}</Text>
                    <Text style={styles.previewLbl}>Öğretmen</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewVal}>{parsedSchedule.classes.length}</Text>
                    <Text style={styles.previewLbl}>Sınıf / Şube</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewVal}>{parsedSchedule.scheduleItems.length}</Text>
                    <Text style={styles.previewLbl}>Ders Saati</Text>
                  </View>
                </View>

                <Text style={styles.previewNote}>
                  Veriler önce telefonunuzda doğrulandı. Onayladığınızda tüm okul veritabanına tek seferde kaydedilecek.
                </Text>

                <TouchableOpacity style={styles.confirmSaveButton} onPress={handleConfirmAndSaveSchedule}>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.confirmSaveText}>Onayla & Sisteme Kaydet</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Yeni Okul Oluşturma Modalı */}
      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Okul Tanımla</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Okul Adı (Örn: Atatürk Anadolu Lisesi)"
              placeholderTextColor={Colors.textMuted}
              value={newSchoolName}
              onChangeText={setNewSchoolName}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Telefon Numarası (Opsiyonel)"
              placeholderTextColor={Colors.textMuted}
              value={newSchoolPhone}
              onChangeText={setNewSchoolPhone}
              keyboardType="phone-pad"
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Okul Ortak Gemini API Anahtarı (Opsiyonel)"
              placeholderTextColor={Colors.textMuted}
              value={newSchoolApiKey}
              onChangeText={setNewSchoolApiKey}
            />

            <TouchableOpacity style={styles.createSubmitButton} onPress={handleCreateSchool}>
              <Text style={styles.createSubmitText}>Okulu Oluştur</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Okul Bilgilerini Düzenleme Modalı */}
      <Modal visible={editModalVisible} animationType="slide" transparent>

        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Okul Bilgilerini Düzenle</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 6 }}>Okul Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Okul Adı"
              placeholderTextColor={Colors.textMuted}
              value={editSchoolName}
              onChangeText={setEditSchoolName}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 6 }}>Telefon (Opsiyonel)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Telefon Numarası"
              placeholderTextColor={Colors.textMuted}
              value={editSchoolPhone}
              onChangeText={setEditSchoolPhone}
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleUpdateSchool}
              disabled={updatingSchool}
            >
              {updatingSchool ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Değişiklikleri Kaydet</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: { padding: 4 },
  headerTitleContainer: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  headerSubtitle: { fontSize: 12, color: Colors.textMuted },
  editSchoolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  editSchoolBtnText: { color: '#4F46E5', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  addSchoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  addSchoolText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  codeCard: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  codeCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeCardLabel: { fontSize: 11, color: '#C7D2FE', fontWeight: '700', letterSpacing: 0.5 },
  codeCardValue: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyButtonText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  codeCardHint: { fontSize: 12, color: '#E0E7FF', marginTop: 10, lineHeight: 16 },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 20,
  },
  aiBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiBannerTextContainer: { flex: 1, marginRight: 8 },
  aiBannerTitle: { fontSize: 15, fontWeight: '700', color: '#312E81' },
  aiBannerDesc: { fontSize: 12, color: '#4338CA', marginTop: 2, lineHeight: 16 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyTeachers: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 13, color: Colors.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 },
  teacherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teacherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  teacherInfo: { flex: 1 },
  teacherName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  teacherSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  teacherStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusActive: { backgroundColor: '#ECFDF5' },
  statusPassive: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    fontSize: 14,
    color: Colors.text,
  },
  createSubmitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  createSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  aiLoadingContainer: { alignItems: 'center', paddingVertical: 32 },
  aiLoadingText: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 16 },
  aiLoadingSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  parsedPreview: { paddingVertical: 12 },
  previewSuccessTitle: { fontSize: 16, fontWeight: '800', color: '#059669', textAlign: 'center', marginBottom: 16 },
  previewGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  previewItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewVal: { fontSize: 20, fontWeight: '800', color: '#4F46E5' },
  previewLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  previewNote: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 16, marginBottom: 16 },
  confirmSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    height: 48,
  },
  confirmSaveText: { color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 8 },
});
