import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../theme/colors';
import { School, TeacherAssignment, CourseName, ClassItem } from '../types';
import {
  verifySchoolAdminPin,
  updateSchoolAdminPin,
  getSchoolTeacherAssignments,
  setTeacherAssignmentApproval,
  deleteTeacherAssignment,
  saveTeacherAssignment,
  generateUniqueSchoolCode,
} from '../database/operations/schoolCodeOperations';
import { updateSchool } from '../database/operations/schoolOperations';
import { getCourses, createCourse, deleteCourse } from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';

interface SchoolAdminModalProps {
  visible: boolean;
  onClose: () => void;
  activeSchool: School | null;
  onSchoolUpdated: () => void;
}

export const SchoolAdminModal: React.FC<SchoolAdminModalProps> = ({
  visible,
  onClose,
  activeSchool,
  onSchoolUpdated,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'teachers' | 'courses'>('info');

  // School info state
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  // Teachers state
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Courses & Classes state
  const [courses, setCourses] = useState<CourseName[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');

  // Manual Assignment modal state inside admin
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignTeacherName, setAssignTeacherName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  useEffect(() => {
    if (visible && activeSchool) {
      setSchoolName(activeSchool.name || '');
      setSchoolCode(activeSchool.code || '');
      setPinInput('');
      setIsAuthenticated(false);
      setShowAssignForm(false);
      setActiveTab('info');
    }
  }, [visible, activeSchool]);

  const handleVerifyPin = async () => {
    if (!activeSchool) return;
    if (!pinInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen yönetici PIN kodunu giriniz.');
      return;
    }

    const isValid = await verifySchoolAdminPin(activeSchool.id, pinInput.trim());
    if (isValid) {
      setIsAuthenticated(true);
      loadAdminData();
    } else {
      Alert.alert('Hatalı PIN', 'Girdiğiniz PIN kodu hatalı. (Varsayılan PIN: 1234)');
    }
  };

  const loadAdminData = async () => {
    if (!activeSchool) return;
    setLoadingAssignments(true);
    try {
      const [assList, crsList, clsList] = await Promise.all([
        getSchoolTeacherAssignments(activeSchool.id),
        getCourses(),
        getClasses(),
      ]);
      setAssignments(assList);
      setCourses(crsList);
      setClasses(clsList);
      if (clsList.length > 0 && selectedClassId === null) {
        setSelectedClassId(clsList[0].id);
      }
      if (crsList.length > 0 && selectedCourseId === null) {
        setSelectedCourseId(crsList[0].id);
      }
    } catch (e) {
      console.warn('Admin verileri yüklenemedi:', e);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleCopyCode = async () => {
    if (schoolCode) {
      await Clipboard.setStringAsync(schoolCode);
      Alert.alert('Kopyalandı', `Okul Kodu (${schoolCode}) panoya kopyalandı. Öğretmenlerinizle paylaşabilirsiniz.`);
    }
  };

  const handleRegenerateCode = () => {
    Alert.alert(
      'Okul Kodunu Yenile',
      'Yeni bir okul kodu oluşturmak istediğinize emin misiniz? Eski kod geçersiz olacaktır.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Yenile',
          style: 'destructive',
          onPress: () => {
            const newCode = generateUniqueSchoolCode(schoolName || 'OKL');
            setSchoolCode(newCode);
          },
        },
      ]
    );
  };

  const handleSaveSchoolInfo = async () => {
    if (!activeSchool) return;
    if (!schoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adını boş bırakmayınız.');
      return;
    }
    setSavingInfo(true);
    try {
      await updateSchool(activeSchool.id, schoolName.trim(), activeSchool.color || '#4F46E5', schoolCode.trim());
      if (newPin.trim()) {
        await updateSchoolAdminPin(activeSchool.id, newPin.trim());
      }
      onSchoolUpdated();
      Alert.alert('Başarılı', 'Okul bilgileri güncellendi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Kaydedilirken hata oluştu.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleToggleApproval = async (item: TeacherAssignment) => {
    const nextStatus = item.is_approved === 1 ? 0 : 1;
    try {
      await setTeacherAssignmentApproval(item.id, nextStatus);
      loadAdminData();
    } catch {
      Alert.alert('Hata', 'Yetki durumu güncellenemedi.');
    }
  };

  const handleDeleteAssignment = (item: TeacherAssignment) => {
    Alert.alert(
      'Atamayı Sil',
      `"${item.teacher_name}" öğretmeninin "${item.class_name}" sınıfındaki atamasını silmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await deleteTeacherAssignment(item.id);
            loadAdminData();
          },
        },
      ]
    );
  };

  const handleCreateAssignment = async () => {
    if (!activeSchool || !assignTeacherName.trim() || !selectedClassId) {
      Alert.alert('Uyarı', 'Lütfen öğretmen adı ve sınıf seçiniz.');
      return;
    }
    try {
      await saveTeacherAssignment(
        activeSchool.id,
        assignTeacherName.trim(),
        selectedClassId,
        selectedCourseId,
        undefined,
        1
      );
      setAssignTeacherName('');
      setShowAssignForm(false);
      loadAdminData();
      Alert.alert('Başarılı', 'Öğretmen sınıf ataması kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', 'Atama kaydedilemedi: ' + (err?.message || ''));
    }
  };

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) {
      Alert.alert('Uyarı', 'Ders adını giriniz.');
      return;
    }
    try {
      await createCourse(newCourseName.trim(), newCourseCode.trim(), '#4F46E5');
      setNewCourseName('');
      setNewCourseCode('');
      loadAdminData();
    } catch {
      Alert.alert('Hata', 'Ders eklenemedi.');
    }
  };

  const handleDeleteCourse = (c: CourseName) => {
    Alert.alert(
      'Dersi Sil',
      `"${c.name}" dersini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await deleteCourse(c.id);
            loadAdminData();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.badgeCrown}>
                <Ionicons name="shield-checkmark" size={18} color="#D97706" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Okul Yönetici Paneli</Text>
                <Text style={styles.modalSub}>{activeSchool?.name || 'Okul Yönetimi'}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* PIN Lock Screen if not authenticated */}
          {!isAuthenticated ? (
            <View style={styles.pinLockContainer}>
              <View style={styles.lockIconWrap}>
                <Ionicons name="lock-closed" size={32} color="#D97706" />
              </View>
              <Text style={styles.lockTitle}>Yönetici Girişi</Text>
              <Text style={styles.lockDesc}>
                Okul ayarları ve öğretmen yetkilerini yönetmek için lütfen yönetici PIN kodunuzu giriniz. (Varsayılan: 1234)
              </Text>

              <TextInput
                style={styles.pinInput}
                placeholder="PIN Kodu (Örn: 1234)"
                placeholderTextColor={Colors.textMuted}
                value={pinInput}
                onChangeText={setPinInput}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
              />

              <TouchableOpacity style={styles.verifyBtn} onPress={handleVerifyPin} activeOpacity={0.8}>
                <Ionicons name="key-outline" size={18} color="#FFFFFF" />
                <Text style={styles.verifyBtnText}>Panele Giriş Yap</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Tabs */}
              <View style={styles.tabsRow}>
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'info' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('info')}
                >
                  <Ionicons
                    name="business-outline"
                    size={16}
                    color={activeTab === 'info' ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>
                    Okul & Kod
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'teachers' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('teachers')}
                >
                  <Ionicons
                    name="people-outline"
                    size={16}
                    color={activeTab === 'teachers' ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.tabText, activeTab === 'teachers' && styles.tabTextActive]}>
                    Öğretmenler ({assignments.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'courses' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('courses')}
                >
                  <Ionicons
                    name="book-outline"
                    size={16}
                    color={activeTab === 'courses' ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.tabText, activeTab === 'courses' && styles.tabTextActive]}>
                    Dersler ({courses.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Tab Contents */}
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {/* 1. OKUL & KOD BİLGİLERİ */}
                {activeTab === 'info' && (
                  <View style={styles.tabContentWrap}>
                    {/* Okul Kodu Kartı */}
                    <View style={styles.codeCard}>
                      <Text style={styles.codeCardLabel}>PAYLAŞILABİLİR OKUL KODU</Text>
                      <Text style={styles.codeCardValue}>{schoolCode || 'KOD YOK'}</Text>
                      <Text style={styles.codeCardHint}>
                        Diğer öğretmenler uygulamayı kurduklarında bu kodu girerek okulunuza bağlanırlar.
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCode} activeOpacity={0.8}>
                          <Ionicons name="copy-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.copyBtnText}>Kodu Kopyala</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.refreshBtn} onPress={handleRegenerateCode} activeOpacity={0.8}>
                          <Ionicons name="refresh-outline" size={16} color={Colors.textPrimary} />
                          <Text style={styles.refreshBtnText}>Yenile</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Okul Adı & Ayarlar */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Okul Adı</Text>
                      <TextInput
                        style={styles.textInput}
                        value={schoolName}
                        onChangeText={setSchoolName}
                        placeholder="Örn: Atatürk Anadolu Lisesi"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Yeni Yönetici PIN Kodu (İsteğe Bağlı)</Text>
                      <TextInput
                        style={styles.textInput}
                        value={newPin}
                        onChangeText={setNewPin}
                        placeholder="Değiştirmek istemiyorsanız boş bırakın"
                        keyboardType="numeric"
                        maxLength={8}
                        secureTextEntry
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleSaveSchoolInfo}
                      disabled={savingInfo}
                      activeOpacity={0.8}
                    >
                      {savingInfo ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.saveBtnText}>Değişiklikleri Kaydet</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* 2. ÖĞRETMEN YETKİLERİ & SINIF ATAMALARI */}
                {activeTab === 'teachers' && (
                  <View style={styles.tabContentWrap}>
                    <View style={styles.teacherHeaderRow}>
                      <View>
                        <Text style={styles.sectionTitle}>Öğretmen & Sınıf Yetkileri</Text>
                        <Text style={styles.sectionDesc}>
                          Öğretmenlerin sadece yetkili oldukları sınıfları görmesi için atamaları onaylayabilir veya kısıtlayabilirsiniz.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.addAssignBtn}
                        onPress={() => setShowAssignForm(!showAssignForm)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name={showAssignForm ? 'chevron-up' : 'add'} size={18} color="#FFFFFF" />
                        <Text style={styles.addAssignBtnText}>
                          {showAssignForm ? 'Kapat' : 'Atama Ekle'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Manuel Atama Formu */}
                    {showAssignForm && (
                      <View style={styles.newAssignCard}>
                        <Text style={styles.newAssignCardTitle}>Yeni Öğretmen & Sınıf Eşlemesi</Text>
                        <TextInput
                          style={styles.textInput}
                          placeholder="Öğretmen Adı Soyadı (Örn: Ahmet Hoca)"
                          value={assignTeacherName}
                          onChangeText={setAssignTeacherName}
                        />

                        {/* Sınıf Seçimi */}
                        <Text style={[styles.inputLabel, { marginTop: 8 }]}>Sınıf / Şube</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {classes.map((cls) => (
                              <TouchableOpacity
                                key={cls.id}
                                style={[
                                  styles.chipChoice,
                                  selectedClassId === cls.id && styles.chipChoiceSelected,
                                ]}
                                onPress={() => setSelectedClassId(cls.id)}
                              >
                                <Text
                                  style={[
                                    styles.chipChoiceText,
                                    selectedClassId === cls.id && styles.chipChoiceTextSelected,
                                  ]}
                                >
                                  {cls.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>

                        {/* Ders Seçimi */}
                        <Text style={styles.inputLabel}>Okul Dersi (İsteğe bağlı)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {courses.map((crs) => (
                              <TouchableOpacity
                                key={crs.id}
                                style={[
                                  styles.chipChoice,
                                  selectedCourseId === crs.id && styles.chipChoiceSelected,
                                ]}
                                onPress={() => setSelectedCourseId(crs.id)}
                              >
                                <Text
                                  style={[
                                    styles.chipChoiceText,
                                    selectedCourseId === crs.id && styles.chipChoiceTextSelected,
                                  ]}
                                >
                                  {crs.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>

                        <TouchableOpacity
                          style={styles.createAssignActionBtn}
                          onPress={handleCreateAssignment}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                          <Text style={styles.createAssignActionBtnText}>Atamayı Kaydet ve Onayla</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {loadingAssignments ? (
                      <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
                    ) : assignments.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <Ionicons name="shield-outline" size={32} color={Colors.textMuted} />
                        <Text style={styles.emptyCardTitle}>Henüz Öğretmen Ataması Yok</Text>
                        <Text style={styles.emptyCardDesc}>
                          Öğretmenler okul kodunu girip kendi derslerini seçtiğinde veya siz yukarıdan eklediğinizde burada listelenecektir.
                        </Text>
                      </View>
                    ) : (
                      assignments.map((item) => (
                        <View key={item.id} style={styles.assignItemCard}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.assignTeacherName}>{item.teacher_name}</Text>
                              <View
                                style={[
                                  styles.statusBadge,
                                  item.is_approved === 1
                                    ? styles.statusBadgeApproved
                                    : styles.statusBadgeBlocked,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusBadgeText,
                                    item.is_approved === 1
                                      ? styles.statusBadgeTextApproved
                                      : styles.statusBadgeTextBlocked,
                                  ]}
                                >
                                  {item.is_approved === 1 ? 'ONAYLI' : 'KISITLI'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.assignDetails}>
                              Sınıf: <Text style={{ fontWeight: '700' }}>{item.class_name}</Text>
                              {item.course_name ? ` • Ders: ${item.course_name}` : ''}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              style={[
                                styles.toggleBtn,
                                item.is_approved === 1 ? styles.toggleBtnRevoke : styles.toggleBtnApprove,
                              ]}
                              onPress={() => handleToggleApproval(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={item.is_approved === 1 ? 'hand-right-outline' : 'checkmark-done'}
                                size={14}
                                color={item.is_approved === 1 ? '#DC2626' : '#16A34A'}
                              />
                              <Text
                                style={[
                                  styles.toggleBtnText,
                                  { color: item.is_approved === 1 ? '#DC2626' : '#16A34A' },
                                ]}
                              >
                                {item.is_approved === 1 ? 'Kısıtla' : 'Onayla'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.deleteAssignBtn}
                              onPress={() => handleDeleteAssignment(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* 3. OKUL DERSLERİ */}
                {activeTab === 'courses' && (
                  <View style={styles.tabContentWrap}>
                    <View style={styles.newAssignCard}>
                      <Text style={styles.newAssignCardTitle}>Yeni Okul Dersi Ekle</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          style={[styles.textInput, { flex: 2 }]}
                          placeholder="Ders Adı (Örn: Matematik)"
                          value={newCourseName}
                          onChangeText={setNewCourseName}
                        />
                        <TextInput
                          style={[styles.textInput, { flex: 1 }]}
                          placeholder="Kodu (MAT)"
                          value={newCourseCode}
                          onChangeText={setNewCourseCode}
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.createAssignActionBtn, { marginTop: 8 }]}
                        onPress={handleCreateCourse}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.createAssignActionBtnText}>Dersi Ekle</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.sectionTitle, { marginTop: 12, marginBottom: 8 }]}>
                      Tanımlı Okul Dersleri ({courses.length})
                    </Text>

                    {courses.map((crs) => (
                      <View key={crs.id} style={styles.courseItemRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View style={[styles.courseColorDot, { backgroundColor: crs.color || '#4F46E5' }]} />
                          <View>
                            <Text style={styles.courseItemName}>{crs.name}</Text>
                            {crs.code ? <Text style={styles.courseItemCode}>Kod: {crs.code}</Text> : null}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteAssignBtn}
                          onPress={() => handleDeleteCourse(crs)}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxHeight: '88%',
    padding: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeCrown: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  pinLockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  lockIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  lockDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  pinInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 4,
    marginBottom: 16,
  },
  verifyBtn: {
    width: '100%',
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  tabContentWrap: {
    paddingBottom: 24,
  },
  codeCard: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  codeCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 1,
    marginBottom: 4,
  },
  codeCardValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1E1B4B',
    letterSpacing: 3,
    marginBottom: 4,
  },
  codeCardHint: {
    fontSize: 11.5,
    color: '#6366F1',
    textAlign: 'center',
    lineHeight: 16,
  },
  copyBtn: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  copyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
  refreshBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  refreshBtnText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  teacherHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sectionDesc: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    maxWidth: 240,
    lineHeight: 15,
    marginTop: 2,
  },
  addAssignBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addAssignBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  newAssignCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  newAssignCardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  chipChoice: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  chipChoiceSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF',
  },
  chipChoiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipChoiceTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  createAssignActionBtn: {
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createAssignActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  emptyCardDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
  assignItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  assignTeacherName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  assignDetails: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeApproved: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeBlocked: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusBadgeTextApproved: {
    color: '#16A34A',
  },
  statusBadgeTextBlocked: {
    color: '#DC2626',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  toggleBtnApprove: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  toggleBtnRevoke: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteAssignBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  courseItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  courseColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  courseItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  courseItemCode: {
    fontSize: 10.5,
    color: Colors.textMuted,
  },
});
