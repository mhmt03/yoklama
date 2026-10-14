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
import { Colors } from '../theme/colors';
import { School, CourseName, ClassItem } from '../types';
import {
  getSchoolByCode,
  joinSchoolByCode,
  saveTeacherAssignment,
} from '../database/operations/schoolCodeOperations';
import { getClasses } from '../database/operations/classOperations';
import { getCourses } from '../database/operations/scheduleOperations';
import {
  getActiveTeacherName,
  setActiveTeacherName,
} from '../utils/roleService';

interface TeacherSchoolModalProps {
  visible: boolean;
  onClose: () => void;
  activeSchool: School | null;
  onSchoolChanged: () => void;
}

export const TeacherSchoolModal: React.FC<TeacherSchoolModalProps> = ({
  visible,
  onClose,
  activeSchool,
  onSchoolChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'join' | 'selectClasses'>('join');

  // Join school state
  const [inputCode, setInputCode] = useState('');
  const [searchingCode, setSearchingCode] = useState(false);
  const [foundSchool, setFoundSchool] = useState<School | null>(null);

  // Select classes & courses state
  const [teacherName, setTeacherName] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<CourseName[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [savingAssignments, setSavingAssignments] = useState(false);

  useEffect(() => {
    if (visible) {
      loadInitialData();
    }
  }, [visible, activeSchool]);

  const loadInitialData = async () => {
    const savedName = await getActiveTeacherName();
    setTeacherName(savedName);
    setInputCode('');
    setFoundSchool(null);

    if (activeSchool) {
      try {
        const [clsList, crsList] = await Promise.all([
          getClasses(),
          getCourses(),
        ]);
        setClasses(clsList);
        setCourses(crsList);
        if (clsList.length > 0) {
          setActiveTab('selectClasses');
        } else {
          setActiveTab('join');
        }
      } catch (e) {
        console.warn('Veriler yüklenemedi:', e);
      }
    } else {
      setActiveTab('join');
    }
  };

  const handleSearchCode = async () => {
    if (!inputCode.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul kodunu giriniz.');
      return;
    }
    setSearchingCode(true);
    try {
      const sch = await getSchoolByCode(inputCode.trim());
      if (sch) {
        setFoundSchool(sch);
      } else {
        Alert.alert('Bulunamadı', 'Bu koda ait bir okul bulunamadı. Lütfen okul idaresinden kodu teyit ediniz.');
        setFoundSchool(null);
      }
    } catch {
      Alert.alert('Hata', 'Okul aranırken hata oluştu.');
    } finally {
      setSearchingCode(false);
    }
  };

  const handleConfirmJoin = async () => {
    if (!foundSchool) return;
    try {
      await joinSchoolByCode(foundSchool.code || inputCode.trim());
      onSchoolChanged();
      Alert.alert('Başarılı', `"${foundSchool.name}" okuluna başarıyla bağlandınız! Şimdi ders verdiğiniz sınıfları seçebilirsiniz.`);
      setActiveTab('selectClasses');
      // Sınıfları tazele
      const clsList = await getClasses();
      setClasses(clsList);
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Okula bağlanılamadı.');
    }
  };

  const toggleClassSelection = (classId: number) => {
    if (selectedClassIds.includes(classId)) {
      setSelectedClassIds(selectedClassIds.filter((id) => id !== classId));
    } else {
      setSelectedClassIds([...selectedClassIds, classId]);
    }
  };

  const handleSaveTeacherSelections = async () => {
    if (!activeSchool) {
      Alert.alert('Uyarı', 'Lütfen önce bir okul koduna bağlanınız.');
      return;
    }
    if (!teacherName.trim()) {
      Alert.alert('Uyarı', 'Lütfen adınızı ve soyadınızı giriniz.');
      return;
    }
    if (selectedClassIds.length === 0) {
      Alert.alert('Uyarı', 'Lütfen dersine girdiğiniz en az bir sınıf seçiniz.');
      return;
    }

    setSavingAssignments(true);
    try {
      await setActiveTeacherName(teacherName.trim());
      // Seçilen sınıfları kaydet
      for (const clsId of selectedClassIds) {
        await saveTeacherAssignment(
          activeSchool.id,
          teacherName.trim(),
          clsId,
          selectedCourseId,
          undefined,
          1 // Admin onayına tabi
        );
      }
      Alert.alert(
        'Harika!',
        `${selectedClassIds.length} sınıf seçimi kaydedildi. Artık sadece bu sınıflarınızın ödev ve yoklamalarını yönetebilirsiniz.`
      );
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', 'Kayıt sırasında hata oluştu: ' + (err?.message || ''));
    } finally {
      setSavingAssignments(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.badgeIcon}>
                <Ionicons name="school" size={18} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Öğretmen Okul & Sınıf Seçimi</Text>
                <Text style={styles.modalSub}>
                  {activeSchool ? `Bağlı Okul: ${activeSchool.name}` : 'Henüz Okula Bağlı Değil'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'join' && styles.tabBtnActive]}
              onPress={() => setActiveTab('join')}
            >
              <Ionicons
                name="key-outline"
                size={15}
                color={activeTab === 'join' ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === 'join' && styles.tabTextActive]}>
                Okul Koduna Bağlan
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'selectClasses' && styles.tabBtnActive]}
              onPress={() => setActiveTab('selectClasses')}
            >
              <Ionicons
                name="checkbox-outline"
                size={15}
                color={activeTab === 'selectClasses' ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === 'selectClasses' && styles.tabTextActive]}>
                Girdiğim Sınıfları Seç
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: OKUL KODUNA BAĞLAN */}
          {activeTab === 'join' && (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={styles.cardBox}>
                <Text style={styles.cardBoxTitle}>Okulunuzun Kodunu Girin</Text>
                <Text style={styles.cardBoxDesc}>
                  Okul idaresi veya zümre başkanınızın oluşturduğu okul kodunu (Örn: AFL-4821) girerek okuldaki tüm hazır sınıflara ve öğrencilere anında erişebilirsiniz.
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TextInput
                    style={[styles.codeTextInput, { flex: 1 }]}
                    placeholder="Örn: AFL-4821"
                    placeholderTextColor={Colors.textMuted}
                    value={inputCode}
                    onChangeText={setInputCode}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={styles.searchCodeBtn}
                    onPress={handleSearchCode}
                    disabled={searchingCode}
                    activeOpacity={0.8}
                  >
                    {searchingCode ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="search" size={16} color="#FFFFFF" />
                        <Text style={styles.searchCodeBtnText}>Ara</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Bulunan Okul Kartı */}
                {foundSchool && (
                  <View style={styles.foundSchoolCard}>
                    <View style={styles.foundSchoolIconWrap}>
                      <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foundSchoolName}>{foundSchool.name}</Text>
                      <Text style={styles.foundSchoolCode}>Kod: {foundSchool.code}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.connectBtn}
                      onPress={handleConfirmJoin}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.connectBtnText}>Okula Bağlan</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          )}

          {/* TAB 2: GİRDİĞİM SINIF & BRANŞI SEÇ */}
          {activeTab === 'selectClasses' && (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={styles.cardBox}>
                <Text style={styles.cardBoxTitle}>Öğretmen Bilgileriniz</Text>
                <TextInput
                  style={styles.nameTextInput}
                  placeholder="Adınız Soyadı (Örn: Mehmet Yılmaz)"
                  value={teacherName}
                  onChangeText={setTeacherName}
                />

                {/* Branş Dersi Seçimi */}
                <Text style={[styles.sectionHeading, { marginTop: 14 }]}>
                  Branşınız / Okuttuğunuz Ders (İsteğe bağlı)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {courses.map((crs) => (
                      <TouchableOpacity
                        key={crs.id}
                        style={[
                          styles.chipCourse,
                          selectedCourseId === crs.id && styles.chipCourseSelected,
                        ]}
                        onPress={() => setSelectedCourseId(crs.id)}
                      >
                        <Text
                          style={[
                            styles.chipCourseText,
                            selectedCourseId === crs.id && styles.chipCourseTextSelected,
                          ]}
                        >
                          {crs.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Sınıf Seçimleri */}
                <Text style={styles.sectionHeading}>
                  Dersine Girdiğiniz Sınıflar ({selectedClassIds.length} seçili)
                </Text>
                <Text style={styles.sectionSub}>
                  Sıfırdan sınıf veya öğrenci eklemenize gerek yok. Okulunuzdaki sınıflardan dersinize girenleri işaretleyiniz:
                </Text>

                {classes.length === 0 ? (
                  <View style={styles.noClassesBox}>
                    <Text style={styles.noClassesText}>
                      Bu okulda henüz tanımlı sınıf bulunamadı. Okul yöneticisinin sınıfları yüklemesi gerekmektedir.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.classesGrid}>
                    {classes.map((cls) => {
                      const isSelected = selectedClassIds.includes(cls.id);
                      return (
                        <TouchableOpacity
                          key={cls.id}
                          style={[
                            styles.classTile,
                            isSelected && styles.classTileSelected,
                          ]}
                          onPress={() => toggleClassSelection(cls.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={isSelected ? Colors.primary : Colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.classTileText,
                              isSelected && styles.classTileTextSelected,
                            ]}
                          >
                            {cls.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.saveSelectionBtn}
                  onPress={handleSaveTeacherSelections}
                  disabled={savingAssignments}
                  activeOpacity={0.8}
                >
                  {savingAssignments ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                      <Text style={styles.saveSelectionBtnText}>Seçimlerimi Kaydet</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
    maxHeight: '86%',
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
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16.5,
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
  cardBox: {
    paddingBottom: 24,
  },
  cardBoxTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardBoxDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  codeTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.textPrimary,
  },
  searchCodeBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  searchCodeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  foundSchoolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  foundSchoolIconWrap: {
    width: 32,
    alignItems: 'center',
  },
  foundSchoolName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#166534',
  },
  foundSchoolCode: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 1,
  },
  connectBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  nameTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  chipCourse: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  chipCourseSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF',
  },
  chipCourseText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipCourseTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  classesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  classTile: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  classTileSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: Colors.primary,
  },
  classTileText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  classTileTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  noClassesBox: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  noClassesText: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 17,
  },
  saveSelectionBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveSelectionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
