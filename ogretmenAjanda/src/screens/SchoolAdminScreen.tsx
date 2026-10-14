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
import { setActiveUserRole } from '../utils/roleService';

export function SchoolAdminScreen({ navigation, onRoleChange }: any) {
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

  // Manuel Öğretmen Ekleme Modalı & Sonuç
  const [addTeacherModalVisible, setAddTeacherModalVisible] = useState(false);
  const [teacherFullName, setTeacherFullName] = useState('');
  const [teacherBranch, setTeacherBranch] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [createdTeacherResult, setCreatedTeacherResult] = useState<any>(null);

  const handleCreateTeacher = async () => {
    if (!teacherFullName.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen öğretmen adını ve soyadını giriniz.');
      return;
    }

    setAddingTeacher(true);
    try {
      const res = await apiRequest(`schools/${selectedSchool.id}/teachers`, 'POST', {
        fullName: teacherFullName.trim(),
        branch: teacherBranch.trim() || undefined,
        phone: teacherPhone.trim() || undefined,
        email: teacherEmail.trim() || undefined,
      });

      if (res.success && res.data) {
        setAddTeacherModalVisible(false);
        setCreatedTeacherResult(res.data);
        setTeacherFullName('');
        setTeacherBranch('');
        setTeacherPhone('');
        setTeacherEmail('');
        loadTeachers(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Öğretmen eklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setAddingTeacher(false);
    }
  };

  const handleCopyTeacherCredentials = async () => {
    if (!createdTeacherResult) return;
    const text = `🎓 Öğretmen Ajanda Giriş Bilgileriniz:\n\nOkul Kodu: ${createdTeacherResult.schoolCode || selectedSchool?.code}\nKullanıcı Adı: ${createdTeacherResult.username}\nŞifre: ${createdTeacherResult.password || '1234'}\n\nUygulamayı açıp "Öğretmen" bölümünden bu bilgilerle giriş yapabilirsiniz.`;
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı 📋', 'Giriş bilgileri panoya kopyalandı. WhatsApp veya SMS ile öğretmeninize iletebilirsiniz.');
  };


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

  const handleSwitchToTeacher = async () => {
    if (onRoleChange) {
      await onRoleChange('teacher');
    } else if (navigation?.switchToTeacher) {
      await navigation.switchToTeacher();
    } else {
      await setActiveUserRole('teacher');
      if (navigation?.goBack) navigation.goBack();
    }
  };

  const handleGoBackOrLogout = async () => {
    if (onRoleChange) {
      await onRoleChange(null);
    } else if (navigation?.goBack) {
      await setActiveUserRole(null);
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBackOrLogout} style={styles.backButton}>
          <Ionicons name="swap-horizontal" size={18} color="#4F46E5" />
          <Text style={styles.backButtonText}>Rol Değiştir</Text>
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

      {/* Hızlı Öğretmen Moduna Geçiş Çubuğu (Ders Kokpiti) */}
      <View style={styles.roleSwitchBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.roleSwitchTitle}>👨‍🏫 Derse mi Gireceksiniz?</Text>
          <Text style={styles.roleSwitchSub}>
            Canlı ders kokpiti, yoklama ve ödevler için Öğretmen Moduna geçin
          </Text>
        </View>
        <TouchableOpacity
          style={styles.roleSwitchBtn}
          onPress={handleSwitchToTeacher}
          activeOpacity={0.85}
        >
          <Ionicons name="log-in-outline" size={16} color="#fff" />
          <Text style={styles.roleSwitchBtnText}>Öğretmen Moduna Geç</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSchools(); }} />}
      >
        {/* Çoklu Okul Değiştirici (Müşteri Birden Fazla Okul Yönetebilir) */}
        {schools.length > 1 && (
          <View style={styles.schoolSelectorContainer}>
            <View style={styles.schoolSelectorHeader}>
              <Ionicons name="business" size={14} color="#4F46E5" />
              <Text style={styles.schoolSelectorLabel}>YÖNETTİĞİNİZ OKULLAR ({schools.length})</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.schoolChipsScroll}>
              {schools.map(s => {
                const isSelected = selectedSchool?.id === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      setSelectedSchool(s);
                      loadTeachers(s.id);
                    }}
                    style={[styles.schoolChip, isSelected && styles.schoolChipSelected]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.schoolChipText, isSelected && styles.schoolChipTextSelected]}>
                      {s.name}
                    </Text>
                    <View style={[styles.schoolCodeTag, isSelected && styles.schoolCodeTagSelected]}>
                      <Text style={[styles.schoolCodeTagText, isSelected && styles.schoolCodeTagTextSelected]}>
                        {s.code}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Okul Kodu Kartı & Müşteri / Lisans Bilgisi */}
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

            {/* Müşteri ve İlişki Kimlikleri Rozetleri */}
            <View style={styles.licenseInfoRow}>
              <View style={styles.licenseBadge}>
                <Ionicons name="finger-print" size={13} color="#C7D2FE" />
                <Text style={styles.licenseBadgeText}>Müşteri No: {selectedSchool.customerId || 'MST-10001'}</Text>
              </View>
              <View style={styles.licenseBadge}>
                <Ionicons name="git-network-outline" size={13} color="#C7D2FE" />
                <Text style={styles.licenseBadgeText}>İlişki ID: {selectedSchool.relationId || 'ILK-10001'}</Text>
              </View>
              <View style={[styles.licenseBadge, { backgroundColor: 'rgba(34, 197, 94, 0.25)', borderColor: '#86EFAC' }]}>
                <Ionicons name="shield-checkmark" size={13} color="#86EFAC" />
                <Text style={[styles.licenseBadgeText, { color: '#86EFAC', fontWeight: '800' }]}>
                  {selectedSchool.licenseExpiresAt
                    ? `1 Yıl Lisans (${new Date(selectedSchool.licenseExpiresAt).toLocaleDateString('tr-TR')})`
                    : '1 Yıl Deneme Lisansı'}
                </Text>
              </View>
            </View>

            <Text style={styles.codeCardHint}>
              Öğretmenler bu okul koduyla bağlandığında İlişki ID'niz ({selectedSchool.relationId || 'ILK-10001'}) atanır ve lisans süreniz üzerinden yetkilendirilir.
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
          <TouchableOpacity
            style={styles.addTeacherBtn}
            onPress={() => setAddTeacherModalVisible(true)}
          >
            <Ionicons name="person-add" size={15} color="#4F46E5" />
            <Text style={styles.addTeacherBtnText}>+ Öğretmen Ekle</Text>
          </TouchableOpacity>
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

      {/* Yeni Öğretmen Tanımlama Modalı */}
      <Modal visible={addTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👨‍🏫 Yeni Öğretmen Ekle</Text>
              <TouchableOpacity onPress={() => setAddTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 12 }}>
              Eklenen öğretmen için otomatik kullanıcı adı ve varsayılan 1234 şifresi üretilecektir.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>Ad Soyad *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Mehmet Yılmaz"
              placeholderTextColor={Colors.textMuted}
              value={teacherFullName}
              onChangeText={setTeacherFullName}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>Branş</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Fizik, Matematik, Kimya..."
              placeholderTextColor={Colors.textMuted}
              value={teacherBranch}
              onChangeText={setTeacherBranch}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>Telefon (Opsiyonel)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="05xx xxx xx xx"
              placeholderTextColor={Colors.textMuted}
              value={teacherPhone}
              onChangeText={setTeacherPhone}
              keyboardType="phone-pad"
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>E-posta (Opsiyonel)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="ogretmen@okul.meb.k12.tr"
              placeholderTextColor={Colors.textMuted}
              value={teacherEmail}
              onChangeText={setTeacherEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#4F46E5', marginTop: 10 }]}
              onPress={handleCreateTeacher}
              disabled={addingTeacher}
            >
              {addingTeacher ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Öğretmeni Kaydet & Şifre Üret</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Öğretmen Oluşturuldu Sonuç Modalı */}
      <Modal visible={!!createdTeacherResult} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center' }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={36} color="#059669" />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 6 }}>
              Öğretmen Hesabı Hazır! 🎉
            </Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>
              {createdTeacherResult?.fullName} için sisteme giriş bilgileri otomatik üretildi.
            </Text>

            <View style={{ width: '100%', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 8, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>Okul Kodu:</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#4F46E5' }}>{createdTeacherResult?.schoolCode || selectedSchool?.code}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>Kullanıcı Adı:</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.text }}>{createdTeacherResult?.username}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>Geçici Şifre:</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#D97706' }}>{createdTeacherResult?.password || '1234'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#059669', width: '100%', flexDirection: 'row', gap: 8, justifyContent: 'center' }]}
              onPress={handleCopyTeacherCredentials}
            >
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={styles.createSubmitText}>Giriş Bilgilerini Kopyala (WhatsApp)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 12, paddingVertical: 8 }}
              onPress={() => setCreatedTeacherResult(null)}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textMuted }}>Kapat</Text>
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  backButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 4,
  },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerSubtitle: { fontSize: 11, color: Colors.textMuted },
  roleSwitchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#312E81',
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'space-between',
    gap: 10,
  },
  roleSwitchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  roleSwitchSub: {
    fontSize: 11,
    color: '#C7D2FE',
    marginTop: 2,
  },
  roleSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#818CF8',
  },
  roleSwitchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5,
  },
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
  addTeacherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  addTeacherBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  // Çoklu Okul Seçici Stilleri
  schoolSelectorContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  schoolSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  schoolSelectorLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  schoolChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  schoolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  schoolChipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  schoolChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  schoolChipTextSelected: {
    color: '#fff',
  },
  schoolCodeTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  schoolCodeTagSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  schoolCodeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  schoolCodeTagTextSelected: {
    color: '#fff',
  },
  // Lisans ve Müşteri Rozetleri
  licenseInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  licenseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    gap: 5,
  },
  licenseBadgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
});
