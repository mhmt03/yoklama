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
  Image,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Colors } from '../theme/colors';
import { apiRequest, DEFAULT_API_URL, clearAuthSession, getActiveUserSession, getAuthToken } from '../services/apiClient';
import { parseMasterScheduleWithAi, saveMasterScheduleToServer, ParsedScheduleResult, readUriAsBase64 } from '../services/aiScheduleParser';
import { parseStudentsFromExcel, saveParsedStudentsToServer, ParsedExcelStudent, generateStudentTemplateExcel } from '../services/excelStudentParser';
import { analyzeUploadedDocument, convertRowsWithMapping, DocumentAnalysisResult, ColumnMappingSelection } from '../utils/columnMappingService';
import { getActiveSchool, updateSchool } from '../database/operations/schoolOperations';
import { setActiveUserRole } from '../utils/roleService';
import { pickSinglePhotoFromSource } from '../utils/photoService';
import {
  DEFAULT_GEMINI_API_KEY,
  DEFAULT_GEMINI_MODEL,
  PRESET_GEMINI_MODELS,
  fetchAvailableGeminiModels,
  testGeminiApiKey,
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
  getGeminiUsageStats,
  resetGeminiUsageStats,
  GeminiUsageStats,
} from '../utils/geminiScheduleService';

type AdminTab = 'teachers' | 'classes' | 'lessons' | 'students' | 'schedule' | 'logs' | 'ai_settings';

export function SchoolAdminScreen({ navigation, onRoleChange }: any) {
  // Okul ve Genel State
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('teachers');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Veri Listeleri
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  // Sınıf Öğrencileri Detay Modalı State
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<any>(null);
  const [classStudentsModalVisible, setClassStudentsModalVisible] = useState(false);

  // AI & API Ayarları State
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [selectedGeminiModel, setSelectedGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [availableLiveModels, setAvailableLiveModels] = useState<string[]>([]);
  const [testingGeminiKey, setTestingGeminiKey] = useState(false);
  const [fetchingLiveModels, setFetchingLiveModels] = useState(false);
  const [savingAiSettings, setSavingAiSettings] = useState(false);
  const [usageStats, setUsageStats] = useState<GeminiUsageStats | null>(null);
  const [showKeyPassword, setShowKeyPassword] = useState(false);

  // Öğrenci Filtre ve Arama
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);

  // İşlem Logları & Denetim Raporu State
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logUsers, setLogUsers] = useState<any[]>([]);
  const [logActionTypes, setLogActionTypes] = useState<string[]>([]);
  const [logStats, setLogStats] = useState<{ total: number; todayCount: number }>({ total: 0, todayCount: 0 });
  const [selectedLogUser, setSelectedLogUser] = useState<string>('all');
  const [selectedLogRole, setSelectedLogRole] = useState<string>('all');
  const [selectedLogAction, setSelectedLogAction] = useState<string>('all');
  const [selectedLogTime, setSelectedLogTime] = useState<'all' | 'today' | 'last7' | 'month'>('all');
  const [logSearch, setLogSearch] = useState('');
  const [exportingLogs, setExportingLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Okul Düzenleme Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editSchoolPhone, setEditSchoolPhone] = useState('');
  const [updatingSchool, setUpdatingSchool] = useState(false);

  // Okul Ekleme Modal State
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolPhone, setNewSchoolPhone] = useState('');
  const [newSchoolApiKey, setNewSchoolApiKey] = useState('');

  // 1. Öğretmen Ekleme / Düzenleme Modalları
  const [addTeacherModalVisible, setAddTeacherModalVisible] = useState(false);
  const [teacherFullName, setTeacherFullName] = useState('');
  const [teacherBranch, setTeacherBranch] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [createdTeacherResult, setCreatedTeacherResult] = useState<any>(null);

  const [editTeacherModalVisible, setEditTeacherModalVisible] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<any>(null);

  // 2. Sınıf & Şube Ekleme Modalı
  const [addClassModalVisible, setAddClassModalVisible] = useState(false);
  const [newClassGrade, setNewClassGrade] = useState('9');
  const [newClassSection, setNewClassSection] = useState('A');
  const [addingClass, setAddingClass] = useState(false);

  // 3. Ders Ekleme Modalı
  const [addLessonModalVisible, setAddLessonModalVisible] = useState(false);
  const [newLessonName, setNewLessonName] = useState('');
  const [newLessonShortCode, setNewLessonShortCode] = useState('');
  const [newLessonGrade, setNewLessonGrade] = useState('Tüm Kademeler');
  const [newLessonHours, setNewLessonHours] = useState('2');
  const [addingLesson, setAddingLesson] = useState(false);

  // 4. Öğrenci Ekleme & Düzenleme Modalları
  const [addStudentModalVisible, setAddStudentModalVisible] = useState(false);
  const [newStudentNo, setNewStudentNo] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('9');
  const [newStudentSection, setNewStudentSection] = useState('A');
  const [newStudentParentName, setNewStudentParentName] = useState('');
  const [newStudentParentPhone, setNewStudentParentPhone] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  const [editStudentModalVisible, setEditStudentModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [updatingStudent, setUpdatingStudent] = useState(false);

  // 5. AI Çarşaf Program Analizi Modal ve Staging Durumu
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedSchedule, setParsedSchedule] = useState<ParsedScheduleResult | null>(null);
  const [aiStageText, setAiStageText] = useState('Belge hazırlanıyor...');
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0);
  const [aiSaving, setAiSaving] = useState(false);
  const [scheduleSaveMode, setScheduleSaveMode] = useState<'merge' | 'overwrite'>('merge');
  const [saveTeachersChecked, setSaveTeachersChecked] = useState(true);
  const [saveClassesChecked, setSaveClassesChecked] = useState(true);
  const [saveLessonsChecked, setSaveLessonsChecked] = useState(true);
  const [saveScheduleChecked, setSaveScheduleChecked] = useState(true);
  const [showTeachersList, setShowTeachersList] = useState(false);
  const [showClassesList, setShowClassesList] = useState(false);
  const [showLessonsList, setShowLessonsList] = useState(false);

  useEffect(() => {
    let interval: any;
    if (aiParsing) {
      setAiElapsedSeconds(0);
      interval = setInterval(() => {
        setAiElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next === 4) {
            setAiStageText('🔍 Belge çözünürlüğü optimize edildi, Gemini modeline aktarılıyor...');
          } else if (next === 10) {
            setAiStageText('🧠 Yapay zeka tüm günleri, öğretmenleri ve derslikleri tarıyor...');
          } else if (next === 22) {
            setAiStageText('📊 Sınıf ve şube bazlı haftalık ders saatleri eşleştiriliyor...');
          } else if (next === 35) {
            setAiStageText('✨ Çarşaf program tablosu veri omurgasına dönüştürülüyor...');
          } else if (next === 50) {
            setAiStageText('⏳ Yoğun program analizi tamamlanmak üzere, son kontroller yapılıyor...');
          }
          return next;
        });
      }, 1000);
    } else {
      setAiElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [aiParsing]);

  // 6. Excel Öğrenci Yükleme State
  const [excelModalVisible, setExcelModalVisible] = useState(false);
  const [excelParsing, setExcelParsing] = useState(false);
  const [excelSaving, setExcelSaving] = useState(false);
  const [parsedExcelStudents, setParsedExcelStudents] = useState<ParsedExcelStudent[]>([]);
  const [detectedExcelClasses, setDetectedExcelClasses] = useState<string[]>([]);
  const [excelSchoolName, setExcelSchoolName] = useState<string | undefined>(undefined);

  // 0. Admin Giriş ve Şifre Güncelleme State
  const [adminCredentialsModalVisible, setAdminCredentialsModalVisible] = useState(false);
  const [adminNewUsername, setAdminNewUsername] = useState('');
  const [adminOldPassword, setAdminOldPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [savingAdminCredentials, setSavingAdminCredentials] = useState(false);

  // 3.1 Ders Düzenleme State
  const [editLessonModalVisible, setEditLessonModalVisible] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [editLessonName, setEditLessonName] = useState('');
  const [editLessonCode, setEditLessonCode] = useState('');
  const [editLessonGrade, setEditLessonGrade] = useState('');
  const [editLessonHours, setEditLessonHours] = useState('2');
  const [updatingLesson, setUpdatingLesson] = useState(false);

  // 3.2 Yıllık Plan Yükleme & Sütun Eşleştirme State
  const [yearlyPlanModalVisible, setYearlyPlanModalVisible] = useState(false);
  const [selectedLessonForPlan, setSelectedLessonForPlan] = useState<any>(null);
  const [docAnalysis, setDocAnalysis] = useState<DocumentAnalysisResult | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<ColumnMappingSelection>({
    topicColIndex: null,
    outcomesColIndex: null,
    dateColIndex: null,
    weekColIndex: null,
    hoursColIndex: null,
  });
  const [analyzingPlanFile, setAnalyzingPlanFile] = useState(false);
  const [savingPlanRows, setSavingPlanRows] = useState(false);

  // 1.3 Öğretmen Haftalık Ders Programı Çizelgesi State
  const [selectedTeacherForSchedule, setSelectedTeacherForSchedule] = useState<any>(null);
  const [teacherScheduleItems, setTeacherScheduleItems] = useState<any[]>([]);
  const [loadingTeacherSchedule, setLoadingTeacherSchedule] = useState(false);
  const [teacherScheduleModalVisible, setTeacherScheduleModalVisible] = useState(false);

  // 4.2 Toplu Öğrenci Fotoğrafı Yükleme State
  const [bulkPhotoModalVisible, setBulkPhotoModalVisible] = useState(false);
  const [bulkPhotoProgress, setBulkPhotoProgress] = useState('');
  const [uploadingBulkPhotos, setUploadingBulkPhotos] = useState(false);

  // Sunucu Görsel Kök Adresi (Fotoğraflar için)
  const serverBaseUrl = DEFAULT_API_URL.replace(/\/api\/?$/, '');

  // --- VERİ YÜKLEME FONKSİYONLARI ---

  const loadSchools = async () => {
    try {
      const res = await apiRequest<any[]>('schools/my-schools');
      if (res.success && res.data) {
        setSchools(res.data);
        if (res.data.length > 0) {
          const current = selectedSchool ? res.data.find(s => s.id === selectedSchool.id) || res.data[0] : res.data[0];
          setSelectedSchool(current);
          if (current.geminiApiKey) setGeminiApiKeyInput(current.geminiApiKey);
          else setGeminiApiKeyInput('');
          if (current.geminiModel) setSelectedGeminiModel(current.geminiModel);
          else setSelectedGeminiModel(DEFAULT_GEMINI_MODEL);
          await loadAllSchoolData(current.id);
          try {
            const usage = await getGeminiUsageStats(current.id);
            setUsageStats(usage);
          } catch {}
        }
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAllSchoolData = async (schoolId: string) => {
    await Promise.all([
      loadTeachers(schoolId),
      loadClasses(schoolId),
      loadLessons(schoolId),
      loadStudents(schoolId),
      loadAuditLogs(schoolId),
    ]);
  };

  const loadTeachers = async (schoolId: string) => {
    const res = await apiRequest<any[]>(`schools/${schoolId}/teachers`);
    if (res.success && res.data) setTeachers(res.data);
  };

  const loadClasses = async (schoolId: string) => {
    const res = await apiRequest<any[]>(`schools/${schoolId}/classes`);
    if (res.success && res.data) setClasses(res.data);
  };

  const loadLessons = async (schoolId: string) => {
    const res = await apiRequest<any[]>(`schools/${schoolId}/lessons`);
    if (res.success && res.data) setLessons(res.data);
  };

  const loadStudents = async (schoolId: string) => {
    const res = await apiRequest<any[]>(`sync/students?schoolId=${schoolId}`);
    if (res.success && res.data) setStudents(res.data);
  };

  useEffect(() => {
    loadSchools();
  }, []);

  // --- OKUL YÖNETİMİ ---

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
      Alert.alert('Hata', res.error || 'Okul oluşturulamadı.');
    }
  };

  const handleUpdateSchool = async () => {
    if (!editSchoolName.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen okul adı girin.');
      return;
    }
    setUpdatingSchool(true);
    try {
      await apiRequest(`schools/${selectedSchool.id}`, 'PUT', {
        name: editSchoolName.trim(),
        phone: editSchoolPhone.trim(),
      });

      const active = await getActiveSchool();
      if (active) {
        await updateSchool(active.id, editSchoolName.trim(), active.color, selectedSchool.code);
      }

      Alert.alert('Başarılı', 'Okul adı güncellendi.');
      setEditModalVisible(false);
      loadSchools();
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUpdatingSchool(false);
    }
  };

  // --- 1. ÖĞRETMEN İŞLEMLERİ ---

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

  const handleUpdateTeacher = async () => {
    if (!editingTeacher || !editingTeacher.fullName.trim()) {
      Alert.alert('Uyarı', 'Öğretmen adı boş bırakılamaz.');
      return;
    }

    try {
      const res = await apiRequest(`schools/teachers/${editingTeacher.id}/details`, 'PUT', {
        fullName: editingTeacher.fullName.trim(),
        branch: editingTeacher.branch || undefined,
        phone: editingTeacher.phone || undefined,
        email: editingTeacher.email || undefined,
        assignedClassesJson: editingTeacher.assignedClassesJson || undefined,
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Öğretmen bilgileri güncellendi.');
        setEditTeacherModalVisible(false);
        setEditingTeacher(null);
        if (selectedSchool) loadTeachers(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const handleDeleteTeacher = (teacherId: string, teacherName: string) => {
    Alert.alert(
      'Öğretmeni Sil',
      `"${teacherName}" isimli öğretmeni okul kadrosundan silmek istediğinize emin misiniz? Bu işlem doğrudan sunucudan siler.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/teachers/${teacherId}`, 'DELETE');
            if (res.success) {
              Alert.alert('Silindi', 'Öğretmen okul kadrosundan silindi.');
              if (selectedSchool) loadTeachers(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleResetTeacherPassword = (teacherId: string, teacherName: string) => {
    Alert.alert(
      'Şifreyi Sıfırla',
      `"${teacherName}" öğretmeninin şifresini "1234" olarak sıfırlamak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Şifreyi 1234 Yap',
          onPress: async () => {
            const res = await apiRequest(`schools/teachers/${teacherId}/reset-password`, 'POST', { newPassword: '1234' });
            if (res.success) {
              Alert.alert('Başarılı 🔑', `Şifre 1234 olarak güncellendi.`);
            } else {
              Alert.alert('Hata', res.error || 'Şifre güncellenemedi.');
            }
          },
        },
      ]
    );
  };

  const handleCopyTeacherCredentials = async () => {
    if (!createdTeacherResult) return;
    const text = `🎓 Öğretmen Ajanda Giriş Bilgileriniz:\n\nOkul Kodu: ${createdTeacherResult.schoolCode || selectedSchool?.code}\nKullanıcı Adı: ${createdTeacherResult.username}\nŞifre: ${createdTeacherResult.password || '1234'}\n\nUygulamayı açıp "Öğretmen" bölümünden bu bilgilerle sisteme bağlanabilirsiniz.`;
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı 📋', 'Giriş bilgileri panoya kopyalandı. WhatsApp ile iletebilirsiniz.');
  };

  // --- 2. SINIF & ŞUBE İŞLEMLERİ ---

  const handleCreateClass = async () => {
    if (!newClassGrade.trim() || !newClassSection.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen kademe ve şube adını girin.');
      return;
    }

    setAddingClass(true);
    try {
      const res = await apiRequest(`schools/${selectedSchool.id}/classes`, 'POST', {
        grade: newClassGrade.trim(),
        section: newClassSection.trim(),
        academicYear: '2026-2027',
      });

      if (res.success) {
        Alert.alert('Başarılı', `${newClassGrade}-${newClassSection} sınıfı doğrudan sunucuya eklendi.`);
        setAddClassModalVisible(false);
        setNewClassSection('');
        loadClasses(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Sınıf eklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setAddingClass(false);
    }
  };

  const handleDeleteClass = (classId: string, className: string) => {
    Alert.alert(
      'Sınıfı Sil',
      `"${className}" sınıfını sunucudan silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/classes/${classId}`, 'DELETE');
            if (res.success) {
              Alert.alert('Silindi', 'Sınıf silindi.');
              if (selectedSchool) loadClasses(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  // --- 3. DERS İŞLEMLERİ ---

  const handleCreateLesson = async () => {
    if (!newLessonName.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen ders adını girin.');
      return;
    }

    setAddingLesson(true);
    try {
      const res = await apiRequest(`schools/${selectedSchool.id}/lessons`, 'POST', {
        name: newLessonName.trim(),
        shortCode: newLessonShortCode.trim() || undefined,
        grade: newLessonGrade.trim() || 'Tüm Kademeler',
        weeklyHours: parseInt(newLessonHours) || 2,
      });

      if (res.success) {
        Alert.alert('Başarılı', `${newLessonName} dersi doğrudan sunucuya eklendi.`);
        setAddLessonModalVisible(false);
        setNewLessonName('');
        setNewLessonShortCode('');
        loadLessons(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Ders eklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setAddingLesson(false);
    }
  };

  const handleDeleteLesson = (lessonId: string, lessonName: string) => {
    Alert.alert(
      'Dersi Sil',
      `"${lessonName}" dersini okul müfredatından silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/lessons/${lessonId}`, 'DELETE');
            if (res.success) {
              Alert.alert('Silindi', 'Ders silindi.');
              if (selectedSchool) loadLessons(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  // --- 4. ÖĞRENCİ İŞLEMLERİ (SERVER CRUD & FOTOĞRAF) ---

  const handleCreateStudent = async () => {
    if (!newStudentNo.trim() || !newStudentName.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen öğrenci numarası ve adını giriniz.');
      return;
    }

    setAddingStudent(true);
    try {
      const res = await apiRequest('sync/students/single', 'POST', {
        schoolId: selectedSchool.id,
        studentNumber: newStudentNo.trim(),
        fullName: newStudentName.trim(),
        grade: newStudentGrade.trim(),
        section: newStudentSection.trim().toUpperCase(),
        parentName: newStudentParentName.trim() || undefined,
        parentPhone: newStudentParentPhone.trim() || undefined,
        studentPhone: newStudentPhone.trim() || undefined,
      });

      if (res.success) {
        Alert.alert('Başarılı', `${newStudentName} doğrudan sunucuya eklendi.`);
        setAddStudentModalVisible(false);
        setNewStudentNo('');
        setNewStudentName('');
        setNewStudentParentName('');
        setNewStudentParentPhone('');
        setNewStudentPhone('');
        loadStudents(selectedSchool.id);
        loadClasses(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Öğrenci eklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setAddingStudent(false);
    }
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent || !editingStudent.studentNumber.trim() || !editingStudent.fullName.trim()) {
      Alert.alert('Uyarı', 'Öğrenci no ve adı boş bırakılamaz.');
      return;
    }

    setUpdatingStudent(true);
    try {
      const res = await apiRequest(`sync/students/${editingStudent.id}`, 'PUT', {
        studentNumber: editingStudent.studentNumber.trim(),
        fullName: editingStudent.fullName.trim(),
        grade: editingStudent.grade.trim(),
        section: editingStudent.section.trim().toUpperCase(),
        parentName: editingStudent.parentName || undefined,
        parentPhone: editingStudent.parentPhone || undefined,
        studentPhone: editingStudent.studentPhone || undefined,
        photoPath: editingStudent.photoPath || undefined,
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Öğrenci bilgileri doğrudan sunucuda güncellendi.');
        setEditStudentModalVisible(false);
        setEditingStudent(null);
        if (selectedSchool) {
          loadStudents(selectedSchool.id);
          loadClasses(selectedSchool.id);
        }
      } else {
        Alert.alert('Hata', res.error || 'Güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUpdatingStudent(false);
    }
  };

  const handleDeleteStudent = (studentId: string, studentName: string) => {
    Alert.alert(
      'Öğrenciyi Sil',
      `"${studentName}" isimli öğrenciyi sunucudan tamamen silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`sync/students/${studentId}`, 'DELETE');
            if (res.success) {
              Alert.alert('Silindi', 'Öğrenci sunucudan silindi.');
              if (selectedSchool) {
                loadStudents(selectedSchool.id);
                loadClasses(selectedSchool.id);
              }
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handlePickAndUploadPhoto = async (student: any) => {
    Alert.alert(
      'Öğrenci Fotoğrafı',
      `${student.fullName} için fotoğraf kaynağını seçin:`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '📷 Kamera ile Çek',
          onPress: () => processPhotoUpload(student, 'camera'),
        },
        {
          text: '🖼️ Galeriden Seç',
          onPress: () => processPhotoUpload(student, 'gallery'),
        },
      ]
    );
  };

  const processPhotoUpload = async (student: any, source: 'camera' | 'gallery') => {
    try {
      const picked = await pickSinglePhotoFromSource(source);
      if (!picked) return;

      setPhotoUploadingId(student.id);

      // İstemci tarafında optimize et (300x300, JPEG 70% kalite, base64)
      const manip = await manipulateAsync(
        picked.uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.7, format: SaveFormat.JPEG, base64: true }
      );

      if (!manip.base64) {
        Alert.alert('Hata', 'Görsel işlenemedi.');
        return;
      }

      // Sunucuya base64 olarak gönder
      const uploadRes = await apiRequest<any>('uploads/student-photo-base64', 'POST', {
        schoolCode: selectedSchool.code,
        studentNumber: student.studentNumber,
        base64Data: manip.base64,
      });

      if (uploadRes.success && uploadRes.data?.photoPath) {
        // Öğrencinin photoPath'ini sunucuda güncelle
        await apiRequest(`sync/students/${student.id}/photo`, 'PUT', {
          photoPath: uploadRes.data.photoPath,
        });

        Alert.alert('Başarılı 📸', 'Fotoğraf doğrudan sunucuya yüklendi ve öğrenciye atandı.');
        if (selectedSchool) loadStudents(selectedSchool.id);
      } else {
        Alert.alert('Hata', uploadRes.error || 'Fotoğraf sunucuya kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Fotoğraf yüklenemedi.');
    } finally {
      setPhotoUploadingId(null);
    }
  };

  // --- 5. AI ÇARŞAF PROGRAM İŞLEMLERİ ---

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
      setAiElapsedSeconds(0);
      setAiStageText('Belge hazırlanıyor...');

      const apiKey = (selectedSchool.geminiApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY).trim();
      const model = selectedSchool.geminiModel?.trim() || DEFAULT_GEMINI_MODEL;
      const parsed = await parseMasterScheduleWithAi(
        file.uri,
        apiKey,
        file.mimeType || (file.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        model,
        selectedSchool.id,
        (msg) => setAiStageText(msg)
      );
      setParsedSchedule(parsed);
    } catch (error: any) {
      Alert.alert('AI Ayrıştırma Hatası', error.message || 'Belge analiz edilemedi.');
      setAiModalVisible(false);
    } finally {
      setAiParsing(false);
    }
  };

  const executeSaveSchedule = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    if (!saveTeachersChecked && !saveClassesChecked && !saveLessonsChecked && !saveScheduleChecked) {
      Alert.alert('Seçim Yapılmadı ⚠️', 'Lütfen sisteme aktarılacak en az bir veri türü (öğretmen, sınıf, ders veya program) seçiniz.');
      return;
    }

    if (scheduleSaveMode === 'overwrite') {
      Alert.alert(
        '⚠️ Dikkat: Mevcut Program Silinecek',
        'Okulun mevcut haftalık ders programı kayıtları tamamen silinecektir ve yerine bu çarşaf program sıfırdan yazılacaktır.\n\nEmin misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Evet, Sıfırla ve Yaz',
            style: 'destructive',
            onPress: () => performSaveSchedule(),
          },
        ]
      );
    } else {
      await performSaveSchedule();
    }
  };

  const performSaveSchedule = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    setAiSaving(true);
    try {
      const result = await saveMasterScheduleToServer(selectedSchool.id, parsedSchedule, {
        overwriteAll: scheduleSaveMode === 'overwrite',
        syncTeachers: saveTeachersChecked,
        syncClasses: saveClassesChecked,
        syncLessons: saveLessonsChecked,
        syncSchedules: saveScheduleChecked,
      });

      if (result.success) {
        Alert.alert('Başarılı 🎉', result.message);
        setAiModalVisible(false);
        setParsedSchedule(null);
        loadAllSchoolData(selectedSchool.id);
      } else {
        Alert.alert('Hata', result.message);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Kayıt işlemi başarısız oldu.');
    } finally {
      setAiSaving(false);
    }
  };

  // --- 6. EXCEL İLE ÖĞRENCİ YÜKLEME (STANDART TABLO & E-OKUL LİSTESİ) ---

  const handlePickAndParseExcel = async () => {
    if (!selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen önce aktif bir okul seçin.');
      return;
    }

    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const file = pickerResult.assets[0];
      setExcelModalVisible(true);
      setExcelParsing(true);
      setParsedExcelStudents([]);
      setDetectedExcelClasses([]);

      const result = await parseStudentsFromExcel(file.uri);
      setExcelParsing(false);

      if (result.success && result.students.length > 0) {
        setParsedExcelStudents(result.students);
        setDetectedExcelClasses(result.detectedClasses);
        setExcelSchoolName(result.schoolName);
      } else {
        Alert.alert('Excel Ayrıştırma Hatası', result.error || 'Excel dosyasında öğrenci verisi bulunamadı.');
        setExcelModalVisible(false);
      }
    } catch (e: any) {
      setExcelParsing(false);
      Alert.alert('Hata', e.message || 'Excel dosyası okunamadı.');
      setExcelModalVisible(false);
    }
  };

  const handleConfirmAndSaveExcelStudents = async () => {
    if (!selectedSchool || parsedExcelStudents.length === 0) return;

    setExcelSaving(true);
    try {
      // 1. Excel'de tespit edilen sınıflardan sistemde olmayanları sunucuda otomatik oluştur
      for (const clsTag of detectedExcelClasses) {
        const parts = clsTag.split('-');
        if (parts.length >= 2) {
          const grade = parts[0];
          const section = parts[1];
          const exists = classes.some(c => c.grade === grade && c.section === section);
          if (!exists) {
            await apiRequest(`schools/${selectedSchool.id}/classes`, 'POST', {
              grade,
              section,
              academicYear: '2026-2027',
            });
          }
        }
      }

      // 2. Öğrencileri toplu sunucuya kaydet
      const saveRes = await saveParsedStudentsToServer(selectedSchool.id, parsedExcelStudents);
      if (saveRes.success) {
        Alert.alert('Başarılı 🎉', saveRes.message);
        setExcelModalVisible(false);
        setParsedExcelStudents([]);
        setDetectedExcelClasses([]);
        loadStudents(selectedSchool.id);
        loadClasses(selectedSchool.id);
      } else {
        Alert.alert('Hata', saveRes.message);
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setExcelSaving(false);
    }
  };

  // Oturumu Kapatma ve Çıkış
  const handleLogout = () => {
    Alert.alert(
      'Sistemden Çıkış',
      'Yönetici oturumunuzu kapatmak ve giriş ekranına dönmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            await clearAuthSession();
            await setActiveUserRole(null);
            if (onRoleChange) {
              await onRoleChange(null);
            } else if (navigation?.goBack) {
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  // 0. Admin Giriş ve Şifre Güncelleme
  const handleOpenAdminCredentials = async () => {
    const session = await getActiveUserSession();
    setAdminNewUsername(session?.username || '');
    setAdminOldPassword('');
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAdminCredentialsModalVisible(true);
  };

  const handleSaveAdminCredentials = async () => {
    if (!adminOldPassword.trim()) {
      Alert.alert('Eksik Bilgi', 'Değişiklik yapabilmek için mevcut şifrenizi girmelisiniz.');
      return;
    }
    if (adminNewPassword && adminNewPassword !== adminConfirmPassword) {
      Alert.alert('Hata', 'Yeni şifreler birbiriyle uyuşmuyor.');
      return;
    }
    setSavingAdminCredentials(true);
    try {
      const res = await apiRequest('auth/update-credentials', 'POST', {
        newUsername: adminNewUsername.trim() || undefined,
        currentPassword: adminOldPassword,
        newPassword: adminNewPassword || undefined,
      });
      if (res.success) {
        Alert.alert('Başarılı 🎉', 'Giriş bilgileriniz güncellendi.');
        setAdminCredentialsModalVisible(false);
      } else {
        Alert.alert('Hata', res.error || 'Bilgiler güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSavingAdminCredentials(false);
    }
  };

  // Toplu Silme İşlemleri
  const handleDeleteAllLessons = () => {
    if (!selectedSchool) return;
    Alert.alert(
      'Tüm Dersleri Sil',
      `"${selectedSchool.name}" okuluna ait TÜM DERSLER silinecektir. Bu işlem geri alınamaz! Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/${selectedSchool.id}/lessons/all`, 'DELETE');
            if (res.success) {
              Alert.alert('Başarılı', 'Okula ait tüm dersler silindi.');
              loadLessons(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Dersler silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllClasses = () => {
    if (!selectedSchool) return;
    Alert.alert(
      'Tüm Şubeleri Sil',
      `"${selectedSchool.name}" okuluna ait TÜM ŞUBELER ve bağlı sınıflar silinecektir. Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/${selectedSchool.id}/classes/all`, 'DELETE');
            if (res.success) {
              Alert.alert('Başarılı', 'Okula ait tüm şubeler silindi.');
              loadClasses(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Şubeler silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllTeachers = () => {
    if (!selectedSchool) return;
    Alert.alert(
      'Tüm Öğretmenleri Sil',
      `"${selectedSchool.name}" okuluna kayıtlı TÜM ÖĞRETMENLER silinecektir. Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/${selectedSchool.id}/teachers/all`, 'DELETE');
            if (res.success) {
              Alert.alert('Başarılı', 'Okula kayıtlı tüm öğretmenler silindi.');
              loadTeachers(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Öğretmenler silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllStudents = () => {
    if (!selectedSchool) return;
    Alert.alert(
      'Tüm Öğrencileri Sil',
      `"${selectedSchool.name}" okuluna kayıtlı TÜM ÖĞRENCİLER silinecektir. Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            const res = await apiRequest(`schools/${selectedSchool.id}/students/all`, 'DELETE');
            if (res.success) {
              Alert.alert('Başarılı', 'Okula kayıtlı tüm öğrenciler silindi.');
              loadStudents(selectedSchool.id);
            } else {
              Alert.alert('Hata', res.error || 'Öğrenciler silinemedi.');
            }
          },
        },
      ]
    );
  };

  // Ders Düzenleme
  const handleOpenEditLesson = (lesson: any) => {
    setEditingLesson(lesson);
    setEditLessonName(lesson.name || '');
    setEditLessonCode(lesson.code || '');
    setEditLessonGrade(lesson.grade?.toString() || '');
    setEditLessonHours(lesson.weeklyHours?.toString() || '2');
    setEditLessonModalVisible(true);
  };

  const handleSaveLessonEdit = async () => {
    if (!editingLesson || !editLessonName.trim()) {
      Alert.alert('Uyarı', 'Ders adı boş bırakılamaz.');
      return;
    }
    setUpdatingLesson(true);
    try {
      const res = await apiRequest(`schools/lessons/${editingLesson.id}`, 'PUT', {
        name: editLessonName.trim(),
        code: editLessonCode.trim() || undefined,
        grade: editLessonGrade.trim() ? parseInt(editLessonGrade.trim()) : undefined,
        weeklyHours: editLessonHours.trim() ? parseInt(editLessonHours.trim()) : 2,
      });
      if (res.success) {
        Alert.alert('Başarılı', 'Ders bilgileri güncellendi.');
        setEditLessonModalVisible(false);
        if (selectedSchool) loadLessons(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Ders güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUpdatingLesson(false);
    }
  };

  // Yıllık Plan Yükleme & Sütun Eşleştirme
  const handlePickYearlyPlanFile = async (lesson: any) => {
    setSelectedLessonForPlan(lesson);
    try {
      const fileRes = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ],
        copyToCacheDirectory: true,
      });
      if (fileRes.canceled || !fileRes.assets?.[0]) return;

      const asset = fileRes.assets[0];
      setAnalyzingPlanFile(true);
      setYearlyPlanModalVisible(true);

      const analysis = await analyzeUploadedDocument(asset as any);
      setDocAnalysis(analysis);
      setSelectedMapping(analysis.suggestedMapping);
    } catch (e: any) {
      Alert.alert('Hata', 'Yıllık plan dosyası okunamadı: ' + e.message);
      setYearlyPlanModalVisible(false);
    } finally {
      setAnalyzingPlanFile(false);
    }
  };

  const handleConfirmAndSaveYearlyPlan = async () => {
    if (!selectedSchool || !selectedLessonForPlan || !docAnalysis) return;
    if (selectedMapping.topicColIndex === null && selectedMapping.outcomesColIndex === null) {
      Alert.alert('Eksik Seçim', 'Lütfen en azından Konu veya Kazanım sütununu seçiniz.');
      return;
    }
    setSavingPlanRows(true);
    try {
      const parsedItems = convertRowsWithMapping(
        docAnalysis.rawRows,
        docAnalysis.headerRowIndex,
        selectedMapping,
        selectedLessonForPlan.weeklyHours || 2
      );

      if (parsedItems.length === 0) {
        Alert.alert('Uyarı', 'Seçilen sütun eşleştirmesine göre geçerli plan satırı bulunamadı.');
        return;
      }

      const payload = {
        lessonId: selectedLessonForPlan.id,
        items: parsedItems.map((p: any) => ({
          week: p.weekNumber,
          dateRange: p.dateRange,
          topic: p.topic,
          learningOutcomes: p.learningOutcomes,
          hours: p.hours,
        })),
      };

      const res = await apiRequest(`sync/yearly-plan?schoolId=${selectedSchool.id}`, 'POST', payload);
      if (res.success) {
        Alert.alert('Başarılı 🎉', `"${selectedLessonForPlan.name}" dersine ait ${parsedItems.length} haftalık yıllık plan başarıyla sunucuya kaydedildi.`);
        setYearlyPlanModalVisible(false);
        setDocAnalysis(null);
      } else {
        Alert.alert('Hata', res.error || 'Yıllık plan kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSavingPlanRows(false);
    }
  };

  // Öğretmen Haftalık Ders Programını Görme
  const handleOpenTeacherSchedule = async (teacher: any) => {
    if (!selectedSchool) return;
    setSelectedTeacherForSchedule(teacher);
    setLoadingTeacherSchedule(true);
    setTeacherScheduleModalVisible(true);
    try {
      const res = await apiRequest<any[]>(`sync/schedules?schoolId=${selectedSchool.id}&teacherName=${encodeURIComponent(teacher.fullName)}`);
      if (res.success && res.data) {
        setTeacherScheduleItems(res.data);
      } else {
        setTeacherScheduleItems([]);
      }
    } catch (e: any) {
      setTeacherScheduleItems([]);
    } finally {
      setLoadingTeacherSchedule(false);
    }
  };

  // Öğrenci Excel Şablonu İndirme
  const handleDownloadStudentTemplate = async () => {
    try {
      await generateStudentTemplateExcel();
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon oluşturulamadı: ' + e.message);
    }
  };

  // Toplu Öğrenci Fotoğrafı Yükleme
  const handlePickAndUploadBulkPhotos = async () => {
    if (!selectedSchool) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const assets = res.assets;
      setBulkPhotoModalVisible(true);
      setUploadingBulkPhotos(true);
      setBulkPhotoProgress(`0 / ${assets.length} görsel hazırlanıyor...`);

      const photos: { studentNumber: string; photoBase64: string; fileName: string }[] = [];

      for (let i = 0; i < assets.length; i++) {
        const file = assets[i];
        setBulkPhotoProgress(`${i + 1} / ${assets.length}: ${file.name} okunuyor...`);

        const match = file.name.match(/\b\d+\b/);
        if (!match) continue;
        const studentNumber = match[0];

        const base64 = await readUriAsBase64(file.uri);

        photos.push({
          studentNumber,
          photoBase64: `data:image/jpeg;base64,${base64}`,
          fileName: file.name,
        });
      }

      if (photos.length === 0) {
        Alert.alert('Uyarı', 'Seçilen görsellerin dosya adlarında öğrenci numarası tespit edilemedi. Dosya adı numara içermelidir (Örn: 1042.jpg).');
        setBulkPhotoModalVisible(false);
        setUploadingBulkPhotos(false);
        return;
      }

      setBulkPhotoProgress(`${photos.length} öğrenci fotoğrafı sunucuya aktarılıyor...`);
      const apiRes = await apiRequest<{ updatedCount: number }>(`uploads/batch-student-photos?schoolId=${selectedSchool.id}`, 'POST', {
        photos,
      });

      if (apiRes.success) {
        Alert.alert('Tamamlandı 🎉', `${apiRes.data?.updatedCount || photos.length} öğrencinin fotoğrafı başarıyla güncellendi.`);
        loadStudents(selectedSchool.id);
      } else {
        Alert.alert('Hata', apiRes.error || 'Fotoğraflar yüklenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUploadingBulkPhotos(false);
      setBulkPhotoModalVisible(false);
      setBulkPhotoProgress('');
    }
  };

  // --- 5. OKUL AI VE API YAPILANDIRMA İŞLEMLERİ ---

  const handleUseDefaultApiKey = () => {
    setGeminiApiKeyInput(DEFAULT_GEMINI_API_KEY);
    Alert.alert('Varsayılan Kod Eklendi ✨', 'Tanımlı Google Gemini API anahtarı yerleştirildi. Modelleri görebilir, test edebilir veya sunucuya kaydedebilirsiniz.');
  };

  const handleTestApiKey = async () => {
    const key = geminiApiKeyInput.trim();
    if (!key) {
      Alert.alert('Uyarı', 'Lütfen test etmek için bir API anahtarı giriniz.');
      return;
    }
    const modelToTest = selectedGeminiModel || DEFAULT_GEMINI_MODEL;
    setTestingGeminiKey(true);
    try {
      const res = await testGeminiApiKey(key, modelToTest);
      setTestingGeminiKey(false);
      if (res.success) {
        try {
          const stats = await getGeminiUsageStats();
          setUsageStats(stats);
        } catch {}
        Alert.alert(
          'Bağlantı Başarılı 🎉',
          `Google Gemini (${res.modelUsed || modelToTest}) bağlantısı başarıyla doğrulandı!\n\nOkul AI altyapısı aktiftir.`
        );
      } else {
        Alert.alert('Doğrulama Başarısız ❌', res.message);
      }
    } catch (err: any) {
      setTestingGeminiKey(false);
      Alert.alert('Hata', err?.message || 'API anahtarı test edilemedi.');
    }
  };

  const handleFetchLiveModels = async () => {
    const key = geminiApiKeyInput.trim();
    if (!key) {
      Alert.alert('API Anahtarı Gerekli 🔑', 'Google hesabınızdaki modelleri listelemek için lütfen önce API anahtarınızı giriniz.');
      return;
    }
    setFetchingLiveModels(true);
    try {
      const models = await fetchAvailableGeminiModels(key);
      setFetchingLiveModels(false);
      if (models.length > 0) {
        setAvailableLiveModels(models);
        Alert.alert('Modeller Alındı 🎉', `Google API hesabınızda ${models.length} adet aktif model bulundu. Listeden istediğiniz modeli seçebilirsiniz.`);
      } else {
        Alert.alert('Bilgi', 'Google API üzerinden canlı model listesi alınamadı. Standart önerilen modeller kullanılabilir.');
      }
    } catch (err: any) {
      setFetchingLiveModels(false);
      Alert.alert('Hata', err?.message || 'Modeller alınamadı.');
    }
  };

  const handleSaveAiSettingsToServer = async () => {
    if (!selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen önce bir okul seçiniz.');
      return;
    }
    const key = geminiApiKeyInput.trim();
    const model = (selectedGeminiModel || DEFAULT_GEMINI_MODEL).trim();

    setSavingAiSettings(true);
    try {
      const res = await apiRequest(`schools/${selectedSchool.id}/gemini-key`, 'PUT', {
        apiKey: key,
        model: model,
      });

      if (res.success) {
        await Promise.all([
          setGeminiApiKey(key),
          setGeminiModel(model),
        ]);
        setSelectedSchool((prev: any) => ({ ...prev, geminiApiKey: key, geminiModel: model }));
        setSchools((prev) => prev.map(s => s.id === selectedSchool.id ? { ...s, geminiApiKey: key, geminiModel: model } : s));

        try {
          const stats = await getGeminiUsageStats(selectedSchool.id);
          setUsageStats(stats);
        } catch {}

        Alert.alert(
          'Sunucuya Kaydedildi & Paylaşıldı ✅',
          `Google Gemini API anahtarı ve seçili model (${model}) ${selectedSchool.name} okulu için sunucu veritabanına başarıyla yazıldı.\n\nBu okula bağlı tüm öğretmenler telefonlarında AI işlemlerini (ders programı OCR, yıllık plan ve öğrenci listeleri) bu kurumsal anahtar ile otomatik olarak gerçekleştirecektir.`
        );
      } else {
        Alert.alert('Hata', res.error || 'Ayarlar sunucuya kaydedilemedi.');
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Sunucu ile iletişim kurulamadı.');
    } finally {
      setSavingAiSettings(false);
    }
  };

  const handleRefreshUsageStats = async () => {
    try {
      const stats = await getGeminiUsageStats(selectedSchool?.id);
      setUsageStats(stats);
      Alert.alert('Güncellendi 🔄', 'Okul ortak TOTAL AI kullanım ve kota istatistikleri yenilendi.');
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const handleResetUsageStats = () => {
    Alert.alert(
      'Kullanım Sayacını Sıfırla',
      'Okul genelinde (tüm öğretmenler ve admin havuzunda) bugünkü harcanan istek ve token sayaçlarını sıfırlamak istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            await resetGeminiUsageStats(selectedSchool?.id);
            const stats = await getGeminiUsageStats(selectedSchool?.id);
            setUsageStats(stats);
            Alert.alert('Bilgi', 'Okul TOTAL kullanım sayacı başarıyla sıfırlandı.');
          },
        },
      ]
    );
  };

  // Filtrelenmiş Öğrenci Listesi
  const filteredStudents = students.filter(s => {
    const matchesSearch =
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.studentNumber.includes(studentSearch);

    if (selectedClassFilter === 'all') return matchesSearch;
    return matchesSearch && `${s.grade}-${s.section}` === selectedClassFilter;
  });

  // İşlem Loglarını Sunucudan Çek (Filtrelerle)
  const loadAuditLogs = async (schoolId?: string, overrideFilters?: any) => {
    const sId = schoolId || selectedSchool?.id;
    if (!sId) return;

    try {
      setLoadingLogs(true);
      let query = `schools/${sId}/audit-logs?limit=300`;

      const userF = overrideFilters?.user !== undefined ? overrideFilters.user : selectedLogUser;
      const roleF = overrideFilters?.role !== undefined ? overrideFilters.role : selectedLogRole;
      const actionF = overrideFilters?.action !== undefined ? overrideFilters.action : selectedLogAction;
      const timeF = overrideFilters?.time !== undefined ? overrideFilters.time : selectedLogTime;
      const searchF = overrideFilters?.search !== undefined ? overrideFilters.search : logSearch;

      if (userF && userF !== 'all') {
        query += `&userId=${userF}`;
      }
      if (roleF && roleF !== 'all') {
        query += `&userRole=${roleF}`;
      }
      if (actionF && actionF !== 'all') {
        query += `&actionType=${encodeURIComponent(actionF)}`;
      }
      if (searchF && searchF.trim()) {
        query += `&search=${encodeURIComponent(searchF.trim())}`;
      }

      const now = new Date();
      if (timeF === 'today') {
        query += `&startDate=${now.toISOString().split('T')[0]}`;
      } else if (timeF === 'last7') {
        const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query += `&startDate=${d.toISOString().split('T')[0]}`;
      } else if (timeF === 'month') {
        const m = new Date(now.getFullYear(), now.getMonth(), 1);
        query += `&startDate=${m.toISOString().split('T')[0]}`;
      }

      const res = await apiRequest<any>(query);
      setLoadingLogs(false);

      if (res.success && res.data) {
        setLogs(res.data.logs || []);
        setLogStats({
          total: res.data.total || (res.data.logs?.length || 0),
          todayCount: res.data.todayCount || 0,
        });
        if (res.data.users) setLogUsers(res.data.users);
        if (res.data.actionTypes) setLogActionTypes(res.data.actionTypes);
      }
    } catch (e: any) {
      setLoadingLogs(false);
      console.error('Audit logs yükleme hatası:', e);
    }
  };

  // Log Raporunu Dosya Olarak İndir / Paylaş (.txt veya .csv)
  const handleExportLogs = async (format: 'txt' | 'csv') => {
    if (!selectedSchool?.id) return;
    try {
      setExportingLogs(true);
      let query = `schools/${selectedSchool.id}/audit-logs/export?format=${format}`;
      if (selectedLogUser && selectedLogUser !== 'all') query += `&userId=${selectedLogUser}`;
      if (selectedLogRole && selectedLogRole !== 'all') query += `&userRole=${selectedLogRole}`;
      if (selectedLogAction && selectedLogAction !== 'all') query += `&actionType=${encodeURIComponent(selectedLogAction)}`;
      if (logSearch.trim()) query += `&search=${encodeURIComponent(logSearch.trim())}`;

      const now = new Date();
      if (selectedLogTime === 'today') {
        query += `&startDate=${now.toISOString().split('T')[0]}`;
      } else if (selectedLogTime === 'last7') {
        const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query += `&startDate=${d.toISOString().split('T')[0]}`;
      } else if (selectedLogTime === 'month') {
        const m = new Date(now.getFullYear(), now.getMonth(), 1);
        query += `&startDate=${m.toISOString().split('T')[0]}`;
      }

      const session = await getActiveUserSession();
      const token = await getAuthToken();
      const url = `${DEFAULT_API_URL}${query}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Rapor sunucudan alınamadı (${response.status})`);
      }

      const textData = await response.text();
      const fileExt = format === 'csv' ? 'csv' : 'txt';
      const cleanSchool = (selectedSchool.name || 'okul').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${cleanSchool}_islem_loglari_${Date.now()}.${fileExt}`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, textData, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setExportingLogs(false);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: format === 'csv' ? 'text/csv' : 'text/plain',
          dialogTitle: `${selectedSchool.name} İşlem Logları Raporu`,
        });
      } else {
        await Clipboard.setStringAsync(textData.slice(0, 5000));
        Alert.alert('Rapor Hazır', 'Rapor cihaz panosuna kopyalandı.');
      }
    } catch (e: any) {
      setExportingLogs(false);
      Alert.alert('Rapor Hatası', e?.message || 'Log raporu indirilemedi.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={16} color="#DC2626" />
          <Text style={styles.logoutButtonText}>Çıkış</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Okul Yönetim Paneli</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{selectedSchool?.name || 'Okul Seçiniz'}</Text>
        </View>
        <TouchableOpacity
          onPress={handleOpenAdminCredentials}
          style={styles.headerCredentialsBtn}
        >
          <Ionicons name="key-outline" size={14} color="#4F46E5" />
          <Text style={styles.headerCredentialsBtnText}>Şifre</Text>
        </TouchableOpacity>
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
          <Ionicons name="pencil" size={15} color="#4F46E5" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addSchoolButton}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addSchoolText}>Yeni Okul</Text>
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
                    onPress={async () => {
                      setSelectedSchool(s);
                      if (s.geminiApiKey) setGeminiApiKeyInput(s.geminiApiKey);
                      else setGeminiApiKeyInput('');
                      if (s.geminiModel) setSelectedGeminiModel(s.geminiModel);
                      else setSelectedGeminiModel(DEFAULT_GEMINI_MODEL);
                      loadAllSchoolData(s.id);
                      try {
                        const usage = await getGeminiUsageStats(s.id);
                        setUsageStats(usage);
                      } catch {}
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
                <Ionicons name="copy-outline" size={16} color="#fff" />
                <Text style={styles.copyButtonText}>Kodu Kopyala</Text>
              </TouchableOpacity>
            </View>

            {/* Müşteri ve İlişki Kimlikleri Rozetleri */}
            <View style={styles.licenseInfoRow}>
              <View style={styles.licenseBadge}>
                <Ionicons name="finger-print" size={13} color="#C7D2FE" />
                <Text style={styles.licenseBadgeText}>Müşteri: {selectedSchool.customerId || 'MST-10001'}</Text>
              </View>
              <View style={styles.licenseBadge}>
                <Ionicons name="git-network-outline" size={13} color="#C7D2FE" />
                <Text style={styles.licenseBadgeText}>İlişki: {selectedSchool.relationId || 'ILK-10001'}</Text>
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

            {/* Hızlı AI & API Ayarları Butonu */}
            <TouchableOpacity
              style={styles.codeCardAiBtn}
              onPress={() => setActiveTab('ai_settings')}
              activeOpacity={0.85}
            >
              <View style={styles.codeCardAiBtnIconWrap}>
                <Ionicons name="hardware-chip" size={16} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.codeCardAiBtnTitle}>
                  Okul AI & API Ayarları (Model & Kota)
                </Text>
                <Text style={styles.codeCardAiBtnSub} numberOfLines={1}>
                  {selectedSchool.geminiApiKey ? `Kurumsal Key Kayıtlı • Model: ${selectedSchool.geminiModel || 'gemini-2.5-flash'}` : 'Varsayılan Gemini API Ayarı'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7D2FE" />
            </TouchableOpacity>

            <Text style={styles.codeCardHint}>
              Admin doğrudan sunucuya yazar. Eklenen tüm öğretmenler, sınıflar, dersler ve öğrenciler global veritabanına anında işlenir.
            </Text>
          </View>
        )}

        {/* Sekme Seçim Çubuğu (Tabs) */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'teachers' && styles.tabButtonActive]}
            onPress={() => setActiveTab('teachers')}
          >
            <Ionicons name="people" size={15} color={activeTab === 'teachers' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'teachers' && styles.tabButtonTextActive]}>
              Öğretmenler ({teachers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'classes' && styles.tabButtonActive]}
            onPress={() => setActiveTab('classes')}
          >
            <Ionicons name="school" size={15} color={activeTab === 'classes' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'classes' && styles.tabButtonTextActive]}>
              Sınıflar ({classes.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'lessons' && styles.tabButtonActive]}
            onPress={() => setActiveTab('lessons')}
          >
            <Ionicons name="book" size={15} color={activeTab === 'lessons' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'lessons' && styles.tabButtonTextActive]}>
              Dersler ({lessons.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'students' && styles.tabButtonActive]}
            onPress={() => setActiveTab('students')}
          >
            <Ionicons name="id-card" size={15} color={activeTab === 'students' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'students' && styles.tabButtonTextActive]}>
              Öğrenciler ({students.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'schedule' && styles.tabButtonActive]}
            onPress={() => setActiveTab('schedule')}
          >
            <Ionicons name="sparkles" size={15} color={activeTab === 'schedule' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'schedule' && styles.tabButtonTextActive]}>
              AI Çarşaf
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'logs' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('logs');
              loadAuditLogs();
            }}
          >
            <Ionicons name="document-text" size={15} color={activeTab === 'logs' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'logs' && styles.tabButtonTextActive]}>
              📜 Loglar {logStats.total > 0 ? `(${logStats.total})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ai_settings' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ai_settings')}
          >
            <Ionicons name="hardware-chip" size={15} color={activeTab === 'ai_settings' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'ai_settings' && styles.tabButtonTextActive]}>
              🤖 AI & API {selectedSchool?.geminiApiKey ? '✅' : '⚙️'}
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* 1. ÖĞRETMENLER SEKMESİ */}
            {activeTab === 'teachers' && (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Bağlı Öğretmen Kadrosu ({teachers.length})</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {teachers.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllTeachers}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddTeacherModalVisible(true)}
                    >
                      <Ionicons name="person-add" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {teachers.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Henüz sisteme eklenmiş bir öğretmen bulunmuyor.</Text>
                  </View>
                ) : (
                  teachers.map((teacher) => (
                    <View key={teacher.id} style={styles.cardItem}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.teacherAvatar}>
                          <Text style={styles.avatarText}>{teacher.fullName?.slice(0, 2).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.cardTitle}>{teacher.fullName}</Text>
                          <Text style={styles.cardSub}>
                            @{teacher.username} • {teacher.role}
                          </Text>
                          {teacher.branch && (
                            <Text style={styles.teacherBranchText}>📚 Branş: {teacher.branch}</Text>
                          )}
                          {teacher.assignedClassesJson && (
                            <Text style={styles.teacherClassesText} numberOfLines={2}>🏫 Sınıflar: {teacher.assignedClassesJson}</Text>
                          )}
                          {teacher.phone && (
                            <Text style={styles.contactText}>📞 {teacher.phone}</Text>
                          )}
                        </View>
                        <View style={[styles.statusBadge, teacher.isActive ? styles.statusActive : styles.statusPassive]}>
                          <Text style={styles.statusText}>{teacher.isActive ? 'Aktif' : 'Pasif'}</Text>
                        </View>
                      </View>

                      {/* Öğretmen Aksiyon Butonları */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' }]}
                          onPress={() => handleOpenTeacherSchedule(teacher)}
                        >
                          <Ionicons name="calendar-outline" size={14} color="#4F46E5" />
                          <Text style={[styles.cardActionBtnText, { color: '#4F46E5' }]}>Ders Programı</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => {
                            setEditingTeacher({ ...teacher });
                            setEditTeacherModalVisible(true);
                          }}
                        >
                          <Ionicons name="pencil" size={14} color="#4F46E5" />
                          <Text style={styles.cardActionBtnText}>Düzenle</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#FDE68A', backgroundColor: '#FEF3C7' }]}
                          onPress={() => handleResetTeacherPassword(teacher.id, teacher.fullName)}
                        >
                          <Ionicons name="key-outline" size={14} color="#D97706" />
                          <Text style={[styles.cardActionBtnText, { color: '#D97706' }]}>Şifre (1234)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                          onPress={() => handleDeleteTeacher(teacher.id, teacher.fullName)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                          <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* 2. SINIFLAR VE ŞUBELER SEKMESİ */}
            {activeTab === 'classes' && (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Sınıflar & Şubeler ({classes.length})</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {classes.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllClasses}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddClassModalVisible(true)}
                    >
                      <Ionicons name="add-circle" size={15} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Sınıf Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {classes.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="school-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Henüz tanımlanmış bir sınıf veya şube yok.</Text>
                  </View>
                ) : (
                  <View style={styles.gridContainer}>
                    {classes.map((cls) => (
                      <TouchableOpacity
                        key={cls.id}
                        style={styles.classCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          setSelectedClassForStudents(cls);
                          setClassStudentsModalVisible(true);
                        }}
                      >
                        <View style={styles.classCardTopRow}>
                          <View style={styles.classBadge}>
                            <Text style={styles.classBadgeText}>{cls.className || `${cls.grade}-${cls.section}`}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.deleteMiniBtn}
                            onPress={() => handleDeleteClass(cls.id, cls.className || `${cls.grade}-${cls.section}`)}
                          >
                            <Ionicons name="trash-outline" size={14} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.classStudentCount}>
                          👥 {cls.studentCount || 0} Öğrenci
                        </Text>
                        <Text style={styles.classYearText}>Dönem: {cls.academicYear || '2026-2027'}</Text>

                        <View style={styles.classCardActionBtn}>
                          <Ionicons name="people" size={13} color="#4F46E5" />
                          <Text style={styles.classCardActionBtnText}>Öğrencileri Gör & Yönet</Text>
                          <Ionicons name="chevron-forward" size={13} color="#4F46E5" />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* 3. DERSLER SEKMESİ */}
            {activeTab === 'lessons' && (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Okul Müfredat Dersleri ({lessons.length})</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {lessons.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllLessons}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddLessonModalVisible(true)}
                    >
                      <Ionicons name="book" size={15} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Ders Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {lessons.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Henüz okulunuza kayıtlı ders bulunmuyor.</Text>
                  </View>
                ) : (
                  lessons.map((lesson) => (
                    <View key={lesson.id} style={styles.lessonCard}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.lessonName}>{lesson.name}</Text>
                          {lesson.shortCode && (
                            <View style={styles.shortCodeTag}>
                              <Text style={styles.shortCodeText}>{lesson.shortCode}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.lessonSub}>
                          Kademe: {lesson.grade ? `${lesson.grade}. Sınıf` : 'Tüm Kademeler'} • {lesson.weeklyHours || 2} Saat / Hafta
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                          onPress={() => handlePickYearlyPlanFile(lesson)}
                        >
                          <Ionicons name="document-text-outline" size={13} color="#16A34A" />
                          <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Yıllık Plan</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' }]}
                          onPress={() => handleOpenEditLesson(lesson)}
                        >
                          <Ionicons name="pencil-outline" size={13} color="#4F46E5" />
                          <Text style={[styles.cardActionBtnText, { color: '#4F46E5' }]}>Düzenle</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteMiniBtn}
                          onPress={() => handleDeleteLesson(lesson.id, lesson.name)}
                        >
                          <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* 4. ÖĞRENCİLER SEKMESİ (SERVER CRUD & FOTOĞRAF) */}
            {activeTab === 'students' && (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Kayıtlı Öğrenciler ({filteredStudents.length}/{students.length})</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {students.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllStudents}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#475569' }]}
                      onPress={handleDownloadStudentTemplate}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Şablon</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#7C3AED' }]}
                      onPress={handlePickAndUploadBulkPhotos}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="images-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Toplu Foto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#059669' }]}
                      onPress={handlePickAndParseExcel}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="document-text" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Excel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddStudentModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="person-add" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sınıf Filtre Çipleri */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classFilterScroll}>
                  <TouchableOpacity
                    style={[styles.filterChip, selectedClassFilter === 'all' && styles.filterChipSelected]}
                    onPress={() => setSelectedClassFilter('all')}
                  >
                    <Text style={[styles.filterChipText, selectedClassFilter === 'all' && styles.filterChipTextSelected]}>
                      Tüm Sınıflar ({students.length})
                    </Text>
                  </TouchableOpacity>
                  {classes.map(c => {
                    const tag = c.className || `${c.grade}-${c.section}`;
                    const isSel = selectedClassFilter === tag;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.filterChip, isSel && styles.filterChipSelected]}
                        onPress={() => setSelectedClassFilter(tag)}
                      >
                        <Text style={[styles.filterChipText, isSel && styles.filterChipTextSelected]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Öğrenci Arama Çubuğu */}
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Öğrenci adı veya numarası ile ara..."
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                    placeholderTextColor={Colors.textMuted}
                  />
                  {studentSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setStudentSearch('')}>
                      <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {filteredStudents.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="id-card-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Bu filtreye uygun öğrenci bulunamadı.</Text>
                  </View>
                ) : (
                  filteredStudents.map((student) => {
                    const photoUrl = student.photoPath ? `${serverBaseUrl}${student.photoPath}` : null;
                    const isUploading = photoUploadingId === student.id;

                    return (
                      <View key={student.id} style={styles.studentCard}>
                        <View style={styles.studentCardTop}>
                          {/* Fotoğraf / Avatar */}
                          <TouchableOpacity
                            style={styles.studentPhotoContainer}
                            onPress={() => handlePickAndUploadPhoto(student)}
                            activeOpacity={0.8}
                          >
                            {isUploading ? (
                              <ActivityIndicator size="small" color="#4F46E5" />
                            ) : photoUrl ? (
                              <Image source={{ uri: photoUrl }} style={styles.studentPhoto} />
                            ) : (
                              <View style={styles.studentPhotoPlaceholder}>
                                <Text style={styles.studentInitials}>{student.fullName.slice(0, 2).toUpperCase()}</Text>
                              </View>
                            )}
                            <View style={styles.cameraBadge}>
                              <Ionicons name="camera" size={12} color="#fff" />
                            </View>
                          </TouchableOpacity>

                          {/* Bilgiler */}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={styles.studentName}>{student.fullName}</Text>
                              <View style={styles.studentClassTag}>
                                <Text style={styles.studentClassTagText}>{student.grade}-{student.section}</Text>
                              </View>
                            </View>

                            <Text style={styles.studentNoText}>Okul No: {student.studentNumber}</Text>

                            {student.parentName && (
                              <Text style={styles.parentText}>
                                👨‍👩‍👧 Veli: {student.parentName} {student.parentPhone ? `(${student.parentPhone})` : ''}
                              </Text>
                            )}
                          </View>
                        </View>

                        {/* Aksiyon Butonları */}
                        <View style={styles.studentActionsRow}>
                          <TouchableOpacity
                            style={styles.cardActionBtn}
                            onPress={() => handlePickAndUploadPhoto(student)}
                          >
                            <Ionicons name="camera-outline" size={14} color="#4F46E5" />
                            <Text style={styles.cardActionBtnText}>Fotoğraf Ekle</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.cardActionBtn}
                            onPress={() => {
                              setEditingStudent({ ...student });
                              setEditStudentModalVisible(true);
                            }}
                          >
                            <Ionicons name="pencil" size={14} color="#4F46E5" />
                            <Text style={styles.cardActionBtnText}>Düzenle</Text>
                          </TouchableOpacity>

                          {student.parentPhone && (
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                              onPress={() => Linking.openURL(`tel:${student.parentPhone}`)}
                            >
                              <Ionicons name="call-outline" size={14} color="#16A34A" />
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Veli Ara</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                            onPress={() => handleDeleteStudent(student.id, student.fullName)}
                          >
                            <Ionicons name="trash-outline" size={14} color="#DC2626" />
                            <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Sil</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* 5. AI ÇARŞAF PROGRAM SEKMESİ */}
            {activeTab === 'schedule' && (
              <View>
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

                <View style={styles.aiInfoBox}>
                  <Ionicons name="information-circle-outline" size={20} color="#4F46E5" />
                  <Text style={styles.aiInfoText}>
                    Çarşaf program yüklendiğinde okul kadrosu, sınıflar ve haftalık ders çizelgesi doğrudan sunucuya işlenir. Öğretmenler kendi telefonlarında ders kokpitini açtığında haftalık programları hazır gelir.
                  </Text>
                </View>
              </View>
            )}

            {/* 6. İŞLEM LOGLARI & DENETİM RAPORU SEKMESİ */}
            {activeTab === 'logs' && (
              <View>
                {/* Başlık ve Rapor Butonları */}
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>İşlem Logları & Rapor ({logStats.total})</Text>
                    <Text style={styles.sectionSubTitle}>
                      Tüm kullanıcıların okul içindeki işlemleri kayıt altındadır.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.logReportExportBtn}
                      onPress={() => handleExportLogs('txt')}
                      disabled={exportingLogs}
                    >
                      <Ionicons name="document-text-outline" size={13} color="#4F46E5" />
                      <Text style={styles.logReportExportBtnText}>.TXT Raporu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.logReportExportExcelBtn}
                      onPress={() => handleExportLogs('csv')}
                      disabled={exportingLogs}
                    >
                      <Ionicons name="stats-chart-outline" size={13} color="#059669" />
                      <Text style={styles.logReportExportExcelBtnText}>Excel / CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.logRefreshBtn}
                      onPress={() => loadAuditLogs()}
                      disabled={loadingLogs}
                    >
                      <Ionicons name="refresh" size={14} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Özet Kartları */}
                <View style={styles.logStatsRow}>
                  <View style={styles.logStatCard}>
                    <Ionicons name="layers" size={16} color="#4F46E5" />
                    <Text style={styles.logStatValue}>{logStats.total}</Text>
                    <Text style={styles.logStatLabel}>Toplam Kayıt</Text>
                  </View>
                  <View style={[styles.logStatCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Ionicons name="time" size={16} color="#059669" />
                    <Text style={[styles.logStatValue, { color: '#065F46' }]}>{logStats.todayCount}</Text>
                    <Text style={styles.logStatLabel}>Bugünkü İşlemler</Text>
                  </View>
                  <View style={[styles.logStatCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Ionicons name="people" size={16} color="#B45309" />
                    <Text style={[styles.logStatValue, { color: '#92400E' }]}>{logUsers.length}</Text>
                    <Text style={styles.logStatLabel}>Kayıtlı Kullanıcı</Text>
                  </View>
                </View>

                {/* Arama Kutusu */}
                <View style={styles.logSearchContainer}>
                  <Ionicons name="search" size={16} color="#64748B" />
                  <TextInput
                    style={styles.logSearchInput}
                    placeholder="Loglarda ara (Kullanıcı, işlem veya açıklama)..."
                    placeholderTextColor="#94A3B8"
                    value={logSearch}
                    onChangeText={(text) => {
                      setLogSearch(text);
                    }}
                    onSubmitEditing={() => loadAuditLogs(undefined, { search: logSearch })}
                    returnKeyType="search"
                  />
                  {logSearch.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setLogSearch('');
                        loadAuditLogs(undefined, { search: '' });
                      }}
                    >
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filtre: Zaman Dilimi */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionLabel}>ZAMAN FİLTRESİ:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {[
                      { id: 'all', label: 'Tüm Zamanlar' },
                      { id: 'today', label: 'Bugün' },
                      { id: 'last7', label: 'Son 7 Gün' },
                      { id: 'month', label: 'Bu Ay' },
                    ].map((f) => {
                      const isSel = selectedLogTime === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                          onPress={() => {
                            setSelectedLogTime(f.id as any);
                            loadAuditLogs(undefined, { time: f.id });
                          }}
                        >
                          <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>{f.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Filtre: Kullanıcı Rolü */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionLabel}>KULLANICI ROLÜ:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {[
                      { id: 'all', label: 'Tüm Roller' },
                      { id: 'SchoolAdmin', label: '🛡️ Okul Admini' },
                      { id: 'Teacher', label: '👨‍🏫 Öğretmen' },
                      { id: 'Student', label: '🎓 Öğrenci' },
                    ].map((r) => {
                      const isSel = selectedLogRole === r.id;
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                          onPress={() => {
                            setSelectedLogRole(r.id);
                            loadAuditLogs(undefined, { role: r.id });
                          }}
                        >
                          <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>{r.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Filtre: Kullanıcı Seçici (Varsa) */}
                {logUsers.length > 0 && (
                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionLabel}>KULLANICI SEÇ:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                      <TouchableOpacity
                        style={[styles.logFilterChip, selectedLogUser === 'all' && styles.logFilterChipActive]}
                        onPress={() => {
                          setSelectedLogUser('all');
                          loadAuditLogs(undefined, { user: 'all' });
                        }}
                      >
                        <Text style={[styles.logFilterChipText, selectedLogUser === 'all' && styles.logFilterChipTextActive]}>
                          Tüm Kullanıcılar
                        </Text>
                      </TouchableOpacity>
                      {logUsers.map((u) => {
                        const isSel = selectedLogUser === u.id;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                            onPress={() => {
                              setSelectedLogUser(u.id);
                              loadAuditLogs(undefined, { user: u.id });
                            }}
                          >
                            <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>
                              {u.fullName || u.username}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Filtre: İşlem Türü (ActionType) */}
                {logActionTypes.length > 0 && (
                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionLabel}>İŞLEM TÜRÜ:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                      <TouchableOpacity
                        style={[styles.logFilterChip, selectedLogAction === 'all' && styles.logFilterChipActive]}
                        onPress={() => {
                          setSelectedLogAction('all');
                          loadAuditLogs(undefined, { action: 'all' });
                        }}
                      >
                        <Text style={[styles.logFilterChipText, selectedLogAction === 'all' && styles.logFilterChipTextActive]}>
                          Tüm İşlemler
                        </Text>
                      </TouchableOpacity>
                      {logActionTypes.map((act) => {
                        const isSel = selectedLogAction === act;
                        return (
                          <TouchableOpacity
                            key={act}
                            style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                            onPress={() => {
                              setSelectedLogAction(act);
                              loadAuditLogs(undefined, { action: act });
                            }}
                          >
                            <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>
                              {act}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Log Listesi */}
                {loadingLogs ? (
                  <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 24 }} />
                ) : logs.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="document-text-outline" size={44} color="#94A3B8" />
                    <Text style={styles.emptyText}>Seçilen filtrelere uygun işlem logu bulunamadı.</Text>
                  </View>
                ) : (
                  logs.map((item) => {
                    const isExpanded = expandedLogId === item.id;
                    const isDelete = item.actionType.includes('DELETE');
                    const isCreate = item.actionType.includes('CREATE') || item.actionType.includes('REGISTER');
                    const isSchedule = item.actionType.includes('SCHEDULE') || item.actionType.includes('PLAN');
                    const isLogin = item.actionType.includes('LOGIN');

                    const badgeBg = isDelete ? '#FEE2E2' : isCreate ? '#DCFCE7' : isSchedule ? '#EDE9FE' : isLogin ? '#E0F2FE' : '#F1F5F9';
                    const badgeColor = isDelete ? '#DC2626' : isCreate ? '#16A34A' : isSchedule ? '#7C3AED' : isLogin ? '#0284C7' : '#475569';

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.logCard}
                        onPress={() => setExpandedLogId(isExpanded ? null : item.id)}
                        activeOpacity={0.8}
                      >
                        {/* Üst Satır: İşlem Türü ve Tarih */}
                        <View style={styles.logCardTop}>
                          <View style={[styles.logActionBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[styles.logActionBadgeText, { color: badgeColor }]}>
                              {item.actionType}
                            </Text>
                          </View>
                          <Text style={styles.logTimestamp}>{item.localTimeString}</Text>
                        </View>

                        {/* Açıklama */}
                        <Text style={styles.logDescription}>{item.description || item.actionType}</Text>

                        {/* Kullanıcı ve Rol Bilgisi */}
                        <View style={styles.logUserRow}>
                          <Ionicons name="person-circle-outline" size={15} color="#64748B" />
                          <Text style={styles.logUserName}>
                            {item.userFullName || item.userName || 'Sistem'}
                          </Text>
                          <View style={styles.logRoleBadge}>
                            <Text style={styles.logRoleBadgeText}>{item.userRole}</Text>
                          </View>
                          {item.ipAddress ? (
                            <Text style={styles.logIpAddress}>• IP: {item.ipAddress}</Text>
                          ) : null}
                        </View>

                        {/* Genişletilebilir Detay (DetailsJson) */}
                        {isExpanded && item.detailsJson ? (
                          <View style={styles.logDetailsBox}>
                            <Text style={styles.logDetailsText}>{item.detailsJson}</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}

            {/* 7. AI & API AYARLARI SEKMESİ */}
            {activeTab === 'ai_settings' && (
              <View>
                {/* Bilgilendirme Banner */}
                <View style={styles.aiConfigBanner}>
                  <View style={styles.aiConfigBannerIcon}>
                    <Ionicons name="hardware-chip" size={24} color="#4F46E5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiConfigBannerTitle}>
                      {selectedSchool?.name || 'Okul'} Kurumsal AI Yapılandırması
                    </Text>
                    <Text style={styles.aiConfigBannerSub}>
                      Burada belirlenen API anahtarı ve seçilen model sunucu veritabanına yazılır. Bu okula bağlı tüm öğretmenler AI işlemlerini (ders programı OCR, yıllık plan ve öğrenci listeleri) bu kurumsal anahtar ile otomatik yürütür.
                    </Text>
                  </View>
                </View>

                {/* API Key Yönetim Kartı */}
                <View style={styles.aiConfigCard}>
                  <View style={styles.aiConfigCardHeader}>
                    <Ionicons name="key" size={18} color="#4F46E5" />
                    <Text style={styles.aiConfigCardTitle}>Google Gemini API Anahtarı</Text>
                  </View>

                  <View style={styles.aiInputWrap}>
                    <TextInput
                      style={styles.aiApiKeyInput}
                      placeholder="AIzaSy... veya AQ... anahtarınızı girin"
                      value={geminiApiKeyInput}
                      onChangeText={setGeminiApiKeyInput}
                      secureTextEntry={!showKeyPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor="#94A3B8"
                    />
                    <TouchableOpacity
                      onPress={() => setShowKeyPassword(!showKeyPassword)}
                      style={styles.aiEyeBtn}
                    >
                      <Ionicons
                        name={showKeyPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color="#64748B"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Hızlı Butonlar */}
                  <View style={styles.aiQuickBtnsRow}>
                    <TouchableOpacity
                      style={styles.aiQuickBtn}
                      onPress={handleUseDefaultApiKey}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={14} color="#4F46E5" />
                      <Text style={styles.aiQuickBtnText}>Varsayılan Kodu Yaz</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.aiQuickBtn}
                      onPress={async () => {
                        const text = await Clipboard.getStringAsync();
                        if (text) {
                          setGeminiApiKeyInput(text.trim());
                          Alert.alert('Yapıştırıldı 📋', 'Panodaki kod yerleştirildi.');
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="clipboard-outline" size={14} color="#64748B" />
                      <Text style={[styles.aiQuickBtnText, { color: '#64748B' }]}>Yapıştır</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.aiQuickBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                      onPress={handleTestApiKey}
                      disabled={testingGeminiKey}
                      activeOpacity={0.8}
                    >
                      {testingGeminiKey ? (
                        <ActivityIndicator size="small" color="#16A34A" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
                          <Text style={[styles.aiQuickBtnText, { color: '#16A34A' }]}>Test Et</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {geminiApiKeyInput.length > 0 && (
                      <TouchableOpacity
                        style={[styles.aiQuickBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                        onPress={() => setGeminiApiKeyInput('')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                        <Text style={[styles.aiQuickBtnText, { color: '#DC2626' }]}>Temizle</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Model Seçimi Kartı */}
                <View style={styles.aiConfigCard}>
                  <View style={styles.aiConfigCardHeader}>
                    <Ionicons name="cube-outline" size={18} color="#4F46E5" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.aiConfigCardTitle}>Aktif Yapay Zeka Modeli</Text>
                      <Text style={styles.aiConfigCardSub}>
                        Seçili Model: <Text style={{ fontWeight: '800', color: '#4F46E5' }}>{selectedGeminiModel}</Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.fetchLiveModelsBtn}
                      onPress={handleFetchLiveModels}
                      disabled={fetchingLiveModels}
                      activeOpacity={0.8}
                    >
                      {fetchingLiveModels ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="cloud-download-outline" size={13} color="#fff" />
                          <Text style={styles.fetchLiveModelsBtnText}>Canlı Modeller</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Preset & Live Model Listesi */}
                  <View style={styles.modelsGrid}>
                    {PRESET_GEMINI_MODELS.map((m) => {
                      const isSelected = selectedGeminiModel === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.modelOptionCard, isSelected && styles.modelOptionCardSelected]}
                          onPress={() => setSelectedGeminiModel(m.id)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.modelOptionTop}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[styles.modelOptionName, isSelected && styles.modelOptionNameSelected]}>
                                  {m.name}
                                </Text>
                                {m.isRecommended && (
                                  <View style={styles.recommendedBadge}>
                                    <Text style={styles.recommendedBadgeText}>ÖNERİLEN</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.modelOptionId}>{m.id}</Text>
                            </View>
                            <Ionicons
                              name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                              size={20}
                              color={isSelected ? '#4F46E5' : '#94A3B8'}
                            />
                          </View>
                          <Text style={styles.modelOptionDesc}>{m.description}</Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Dinamik Olarak Çekilen Modeller */}
                    {availableLiveModels
                      .filter((lm) => !PRESET_GEMINI_MODELS.some((pm) => pm.id === lm))
                      .map((liveModel) => {
                        const isSelected = selectedGeminiModel === liveModel;
                        return (
                          <TouchableOpacity
                            key={liveModel}
                            style={[styles.modelOptionCard, isSelected && styles.modelOptionCardSelected]}
                            onPress={() => setSelectedGeminiModel(liveModel)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.modelOptionTop}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.modelOptionName, isSelected && styles.modelOptionNameSelected]}>
                                  {liveModel}
                                </Text>
                                <Text style={styles.modelOptionId}>Google API Canlı Model</Text>
                              </View>
                              <Ionicons
                                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                                size={20}
                                color={isSelected ? '#4F46E5' : '#94A3B8'}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </View>

                {/* Kota ve Kullanım Göstergesi (Real-time Gauge) */}
                <View style={styles.aiConfigCard}>
                  <View style={styles.aiConfigCardHeader}>
                    <Ionicons name="speedometer-outline" size={18} color="#4F46E5" />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.aiConfigCardTitle}>Okul Ortak TOTAL Kota & Kullanım</Text>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>TÜM OKUL HAVUZU</Text>
                        </View>
                      </View>
                      <Text style={styles.aiConfigCardSub}>
                        {selectedSchool?.name || 'Okul'} geneli (Tüm öğretmenler ve yönetici havuzu)
                      </Text>
                    </View>
                    <TouchableOpacity onPress={handleRefreshUsageStats} style={styles.refreshIconBtn}>
                      <Ionicons name="refresh" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>

                  {/* Kalan Kota Gösterge Çubuğu */}
                  <View style={styles.quotaGaugeBox}>
                    <View style={styles.quotaGaugeTop}>
                      <Text style={styles.quotaGaugeLabel}>Kalan Günlük İstek Hakkı (Okul Toplamı):</Text>
                      <Text style={styles.quotaGaugeVal}>
                        {usageStats ? usageStats.remainingRequests : 1500} / {usageStats ? usageStats.dailyRequestLimit : 1500} İstek
                      </Text>
                    </View>
                    <View style={styles.gaugeProgressBarTrack}>
                      <View
                        style={[
                          styles.gaugeProgressBarFill,
                          {
                            width: `${Math.max(5, usageStats ? usageStats.remainingPercent : 100)}%`,
                            backgroundColor:
                              (usageStats?.remainingPercent || 100) > 40
                                ? '#10B981'
                                : (usageStats?.remainingPercent || 100) > 15
                                ? '#F59E0B'
                                : '#EF4444',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.gaugePercentText}>
                      %{usageStats ? usageStats.remainingPercent : 100} Kota Mevcut (1500 İstek/Gün)
                    </Text>
                  </View>

                  {/* Kullanım Grid */}
                  <View style={styles.quotaMiniGrid}>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>{usageStats ? usageStats.requestsToday : 0}</Text>
                      <Text style={styles.quotaMiniBoxLabel}>Okul Toplam İstek</Text>
                    </View>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>{usageStats ? usageStats.tokensToday : 0}</Text>
                      <Text style={styles.quotaMiniBoxLabel}>Harcanan Token</Text>
                    </View>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>{usageStats?.lastRequestTime || '-'}</Text>
                      <Text style={styles.quotaMiniBoxLabel}>Son İstek Saati</Text>
                    </View>
                  </View>

                  {/* Google AI Studio Plan Bilgisi & Sayacı Sıfırla */}
                  <View style={styles.quotaFooterRow}>
                    <TouchableOpacity
                      style={styles.openAiStudioPlanBtn}
                      onPress={() => Linking.openURL('https://aistudio.google.com/app/plan_information')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="open-outline" size={13} color="#0369A1" />
                      <Text style={styles.openAiStudioPlanText}>Google AI Studio Kotasını Aç</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.resetUsageBtn}
                      onPress={handleResetUsageStats}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={13} color="#DC2626" />
                      <Text style={styles.resetUsageText}>Sayacı Sıfırla</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sunucu DB Kaydet Butonu */}
                <TouchableOpacity
                  style={styles.saveAiSettingsBtn}
                  onPress={handleSaveAiSettingsToServer}
                  disabled={savingAiSettings}
                  activeOpacity={0.85}
                >
                  {savingAiSettings ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.saveAiSettingsBtnText}>
                        💾 Sunucu Veritabanına Kaydet & Tüm Öğretmenlere Dağıt
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* --- MODALLAR --- */}

      {/* 1. Öğretmen Ekle Modal */}
      <Modal visible={addTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👨‍🏫 Yeni Öğretmen Tanımla</Text>
              <TouchableOpacity onPress={() => setAddTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Adı Soyadı (Örn: Ahmet Kaya)"
              value={teacherFullName}
              onChangeText={setTeacherFullName}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Branş (Örn: Fizik, Matematik)"
              value={teacherBranch}
              onChangeText={setTeacherBranch}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Telefon Numarası (Opsiyonel)"
              value={teacherPhone}
              onChangeText={setTeacherPhone}
              keyboardType="phone-pad"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="E-posta Adresi (Opsiyonel)"
              value={teacherEmail}
              onChangeText={setTeacherEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
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

      {/* 1.1 Öğretmen Düzenle Modal */}
      <Modal visible={editTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ Öğretmen Bilgilerini Düzenle</Text>
              <TouchableOpacity onPress={() => setEditTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Adı Soyadı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Adı Soyadı"
              value={editingTeacher?.fullName || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, fullName: t })}
            />

            <Text style={styles.inputLabel}>Branşı (Ders Alanı)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Matematik, Fizik, Türkçe..."
              value={editingTeacher?.branch || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, branch: t })}
            />

            <Text style={styles.inputLabel}>Girdiği Şubeler / Sınıflar</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 9-A, 10-B, 11-C (Çarşaftan otomatik gelir)"
              value={editingTeacher?.assignedClassesJson || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, assignedClassesJson: t })}
            />

            <Text style={styles.inputLabel}>Telefon Numarası</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Telefon Numarası"
              value={editingTeacher?.phone || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, phone: t })}
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>E-posta</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="E-posta"
              value={editingTeacher?.email || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, email: t })}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#4F46E5', marginBottom: 8, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}
              onPress={() => {
                setEditTeacherModalVisible(false);
                handleOpenTeacherSchedule(editingTeacher);
              }}
            >
              <Ionicons name="calendar-outline" size={16} color="#fff" />
              <Text style={styles.createSubmitText}>📅 Haftalık Ders Programını Aç</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.createSubmitButton, { backgroundColor: '#059669' }]} onPress={handleUpdateTeacher}>
              <Text style={styles.createSubmitText}>Değişiklikleri Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 1.2 Öğretmen Oluşturuldu Sonuç Modalı */}
      <Modal visible={!!createdTeacherResult} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center' }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle" size={36} color="#059669" />
            </View>

            <Text style={styles.successTitle}>Öğretmen Hesabı Hazır! 🎉</Text>
            <Text style={styles.successSub}>
              {createdTeacherResult?.fullName} için sisteme giriş bilgileri otomatik üretildi.
            </Text>

            <View style={styles.credentialsBox}>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>Okul Kodu:</Text>
                <Text style={styles.credValCode}>{createdTeacherResult?.schoolCode || selectedSchool?.code}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>Kullanıcı Adı:</Text>
                <Text style={styles.credVal}>{createdTeacherResult?.username}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>Geçici Şifre:</Text>
                <Text style={styles.credValPass}>{createdTeacherResult?.password || '1234'}</Text>
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

      {/* 2. Sınıf / Şube Ekle Modal */}
      <Modal visible={addClassModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏫 Yeni Sınıf / Şube Ekle</Text>
              <TouchableOpacity onPress={() => setAddClassModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Kademe (Sınıf Düzeyi)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 9, 10, 11, 12 veya 1, 2, 3..."
              value={newClassGrade}
              onChangeText={setNewClassGrade}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Şube Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: A, B, C, Fen, Say..."
              value={newClassSection}
              onChangeText={setNewClassSection}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleCreateClass}
              disabled={addingClass}
            >
              {addingClass ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Sınıfı Sunucuya Ekle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. Ders Ekle Modal */}
      <Modal visible={addLessonModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📚 Yeni Ders Tanımla</Text>
              <TouchableOpacity onPress={() => setAddLessonModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Ders Adı (Örn: Biyoloji, Geometri)"
              value={newLessonName}
              onChangeText={setNewLessonName}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Kısa Kod (Örn: BYL, GEO)"
              value={newLessonShortCode}
              onChangeText={setNewLessonShortCode}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Kademe (Örn: Tüm Kademeler veya 9)"
              value={newLessonGrade}
              onChangeText={setNewLessonGrade}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Haftalık Saat (Örn: 2)"
              value={newLessonHours}
              onChangeText={setNewLessonHours}
              keyboardType="numeric"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleCreateLesson}
              disabled={addingLesson}
            >
              {addingLesson ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Dersi Sunucuya Kaydet</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 4. Öğrenci Ekle Modal */}
      <Modal visible={addStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎓 Yeni Öğrenci Ekle</Text>
              <TouchableOpacity onPress={() => setAddStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Numarası (Örn: 105)"
                value={newStudentNo}
                onChangeText={setNewStudentNo}
                keyboardType="numeric"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Adı Soyadı (Örn: Zeynep Kaya)"
                value={newStudentName}
                onChangeText={setNewStudentName}
                placeholderTextColor={Colors.textMuted}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Kademe (Örn: 9)"
                  value={newStudentGrade}
                  onChangeText={setNewStudentGrade}
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Şube (Örn: A)"
                  value={newStudentSection}
                  onChangeText={setNewStudentSection}
                  autoCapitalize="characters"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Adı Soyadı (Örn: Mehmet Kaya)"
                value={newStudentParentName}
                onChangeText={setNewStudentParentName}
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Telefonu (Örn: 0555 123 4567)"
                value={newStudentParentPhone}
                onChangeText={setNewStudentParentPhone}
                keyboardType="phone-pad"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Telefonu (Opsiyonel)"
                value={newStudentPhone}
                onChangeText={setNewStudentPhone}
                keyboardType="phone-pad"
                placeholderTextColor={Colors.textMuted}
              />

              <TouchableOpacity
                style={styles.createSubmitButton}
                onPress={handleCreateStudent}
                disabled={addingStudent}
              >
                {addingStudent ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Öğrenciyi Doğrudan Sunucuya Kaydet</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 4.1 Öğrenci Düzenle Modal */}
      <Modal visible={editStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ Öğrenci Bilgilerini Düzenle</Text>
              <TouchableOpacity onPress={() => setEditStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci No"
                value={editingStudent?.studentNumber || ''}
                onChangeText={(t) => setEditingStudent({ ...editingStudent, studentNumber: t })}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Adı Soyadı"
                value={editingStudent?.fullName || ''}
                onChangeText={(t) => setEditingStudent({ ...editingStudent, fullName: t })}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Kademe"
                  value={editingStudent?.grade || ''}
                  onChangeText={(t) => setEditingStudent({ ...editingStudent, grade: t })}
                />
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="Şube"
                  value={editingStudent?.section || ''}
                  onChangeText={(t) => setEditingStudent({ ...editingStudent, section: t })}
                  autoCapitalize="characters"
                />
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Adı"
                value={editingStudent?.parentName || ''}
                onChangeText={(t) => setEditingStudent({ ...editingStudent, parentName: t })}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Veli Telefonu"
                value={editingStudent?.parentPhone || ''}
                onChangeText={(t) => setEditingStudent({ ...editingStudent, parentPhone: t })}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Öğrenci Telefonu"
                value={editingStudent?.studentPhone || ''}
                onChangeText={(t) => setEditingStudent({ ...editingStudent, studentPhone: t })}
                keyboardType="phone-pad"
              />

              <TouchableOpacity
                style={styles.createSubmitButton}
                onPress={handleUpdateStudent}
                disabled={updatingStudent}
              >
                {updatingStudent ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Sunucuda Güncelle</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Okul Adı Düzenleme Modalı */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏫 Okul Bilgilerini Güncelle</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Okul Adı"
              value={editSchoolName}
              onChangeText={setEditSchoolName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Okul Telefonu"
              value={editSchoolPhone}
              onChangeText={setEditSchoolPhone}
              keyboardType="phone-pad"
            />

            <TouchableOpacity style={styles.createSubmitButton} onPress={handleUpdateSchool} disabled={updatingSchool}>
              {updatingSchool ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Okul Ekleme Modalı */}
      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>➕ Yeni Okul Oluştur</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Okul Adı"
              value={newSchoolName}
              onChangeText={setNewSchoolName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Okul Telefonu (İsteğe bağlı)"
              value={newSchoolPhone}
              onChangeText={setNewSchoolPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Gemini API Anahtarı (İsteğe bağlı)"
              value={newSchoolApiKey}
              onChangeText={setNewSchoolApiKey}
              autoCapitalize="none"
            />

            <TouchableOpacity style={styles.createSubmitButton} onPress={handleCreateSchool}>
              <Text style={styles.createSubmitText}>Okulu Oluştur</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Çarşaf Program Onay Modalı */}
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
                {/* Süre Rozeti */}
                <View style={styles.aiTimerBadge}>
                  <Ionicons name="timer-outline" size={15} color="#4F46E5" />
                  <Text style={styles.aiTimerBadgeText}>İşlem Sürüyor: {aiElapsedSeconds} sn</Text>
                </View>

                {/* Spinner & Ana Başlık */}
                <ActivityIndicator size="large" color="#4F46E5" style={{ marginVertical: 10 }} />
                <Text style={styles.aiLoadingText}>Gemini AI Çarşaf Programı İnceliyor</Text>

                {/* Anlık Aşama Kartı */}
                <View style={styles.aiStageCard}>
                  <View style={styles.aiStageDot} />
                  <Text style={styles.aiStageText}>{aiStageText}</Text>
                </View>

                {/* Adım Listesi (Progress Steps) */}
                <View style={styles.aiStepsContainer}>
                  <View style={styles.aiStepRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text style={styles.aiStepDoneText}>1. Belge hazırlandı ve sisteme aktarıldı</Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons
                      name={aiElapsedSeconds >= 8 ? 'checkmark-circle' : 'time-outline'}
                      size={16}
                      color={aiElapsedSeconds >= 8 ? '#16A34A' : '#4F46E5'}
                    />
                    <Text style={aiElapsedSeconds >= 8 ? styles.aiStepDoneText : styles.aiStepActiveText}>
                      2. Gemini Vision ile hücre ve metin taraması
                    </Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons
                      name={aiElapsedSeconds >= 22 ? 'checkmark-circle' : 'time-outline'}
                      size={16}
                      color={aiElapsedSeconds >= 22 ? '#16A34A' : '#94A3B8'}
                    />
                    <Text style={aiElapsedSeconds >= 22 ? styles.aiStepDoneText : styles.aiStepPendingText}>
                      3. Öğretmen, sınıf ve ders saatleri eşleştirmesi
                    </Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons name="time-outline" size={16} color="#94A3B8" />
                    <Text style={styles.aiStepPendingText}>4. Haftalık ders programı omurgasının oluşturulması</Text>
                  </View>
                </View>

                {/* Bilgilendirme Kutusu */}
                <View style={styles.aiProgressInfoBox}>
                  <Ionicons name="information-circle-outline" size={18} color="#166534" />
                  <Text style={styles.aiProgressInfoBoxText}>
                    Çarşaf programlar yüzlerce hücre, onlarca öğretmen ve ders saati içeren büyük tablolardır. Yapay zekanın tüm hücreleri hatasız eşleştirmesi <Text style={{ fontWeight: '800' }}>20-50 saniye</Text> sürebilir. Bu işlem tamamen normaldir.
                  </Text>
                </View>
              </View>
            ) : parsedSchedule ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={styles.previewSuccessTitle}>🎉 Çarşaf Program Ayrıştırıldı!</Text>

                {/* Özet Grid Kartları */}
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
                    <Text style={styles.previewVal}>{parsedSchedule.lessons.length}</Text>
                    <Text style={styles.previewLbl}>Ders</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewVal}>{parsedSchedule.scheduleItems.length}</Text>
                    <Text style={styles.previewLbl}>Ders Saati</Text>
                  </View>
                </View>

                {/* 1. İşlem / Kayıt Modu Seçimi */}
                <View style={styles.scheduleOptionSection}>
                  <Text style={styles.scheduleOptionSectionTitle}>1. KAYIT MODU SEÇİN:</Text>

                  {/* Mod A: Merge / Update */}
                  <TouchableOpacity
                    style={[
                      styles.scheduleModeCard,
                      scheduleSaveMode === 'merge' && styles.scheduleModeCardActiveMerge,
                    ]}
                    onPress={() => setScheduleSaveMode('merge')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={scheduleSaveMode === 'merge' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={scheduleSaveMode === 'merge' ? '#059669' : '#94A3B8'}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.scheduleModeTitle, scheduleSaveMode === 'merge' && { color: '#059669' }]}>
                        🔄 Mevcutları Koru & Güncelle (Önerilen)
                      </Text>
                      <Text style={styles.scheduleModeDesc}>
                        Var olan öğretmen, sınıf ve ders programı silinmez. Sadece yeni veya değişen veriler eklenir/güncellenir.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Mod B: Overwrite */}
                  <TouchableOpacity
                    style={[
                      styles.scheduleModeCard,
                      scheduleSaveMode === 'overwrite' && styles.scheduleModeCardActiveOverwrite,
                    ]}
                    onPress={() => setScheduleSaveMode('overwrite')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={scheduleSaveMode === 'overwrite' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={scheduleSaveMode === 'overwrite' ? '#DC2626' : '#94A3B8'}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.scheduleModeTitle, scheduleSaveMode === 'overwrite' && { color: '#DC2626' }]}>
                        ⚠️ Sıfırdan Temiz Kurulum (Mevcut Programı Sil)
                      </Text>
                      <Text style={styles.scheduleModeDesc}>
                        Okuldaki tüm mevcut ders programı kayıtları silinir ve bu çarşaf program sıfırdan yazılır.
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* 2. Sisteme Yazılacak Veriler (Checkboxes) */}
                <View style={styles.scheduleOptionSection}>
                  <Text style={styles.scheduleOptionSectionTitle}>2. SİSTEME YAZILACAK VERİLERİ SEÇİN:</Text>

                  {/* Öğretmenler */}
                  <View style={styles.scheduleCheckboxContainer}>
                    <View style={styles.scheduleCheckboxRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        onPress={() => setSaveTeachersChecked(!saveTeachersChecked)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={saveTeachersChecked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={saveTeachersChecked ? '#4F46E5' : '#94A3B8'}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.scheduleCheckboxTitle}>
                            👨‍🏫 Öğretmen Kadrosu ({parsedSchedule.teachers.length})
                          </Text>
                          <Text style={styles.scheduleCheckboxSub}>
                            Bulunan öğretmenleri okul kadrosuna ekler / eşleştirir.
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.scheduleToggleBtn}
                        onPress={() => setShowTeachersList(!showTeachersList)}
                      >
                        <Ionicons name={showTeachersList ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    {showTeachersList && (
                      <View style={styles.chipsContainer}>
                        {parsedSchedule.teachers.map((t, idx) => (
                          <View key={idx} style={styles.itemChip}>
                            <Text style={styles.itemChipText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Sınıflar & Şubeler */}
                  <View style={styles.scheduleCheckboxContainer}>
                    <View style={styles.scheduleCheckboxRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        onPress={() => setSaveClassesChecked(!saveClassesChecked)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={saveClassesChecked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={saveClassesChecked ? '#4F46E5' : '#94A3B8'}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.scheduleCheckboxTitle}>
                            🏫 Sınıflar & Şubeler ({parsedSchedule.classes.length})
                          </Text>
                          <Text style={styles.scheduleCheckboxSub}>
                            Belirlenen şubeleri okulun sınıf listesine kaydeder.
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.scheduleToggleBtn}
                        onPress={() => setShowClassesList(!showClassesList)}
                      >
                        <Ionicons name={showClassesList ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    {showClassesList && (
                      <View style={styles.chipsContainer}>
                        {parsedSchedule.classes.map((c, idx) => (
                          <View key={idx} style={[styles.itemChip, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}>
                            <Text style={[styles.itemChipText, { color: '#6D28D9' }]}>{c}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Ders Havuzu */}
                  <View style={styles.scheduleCheckboxContainer}>
                    <View style={styles.scheduleCheckboxRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        onPress={() => setSaveLessonsChecked(!saveLessonsChecked)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={saveLessonsChecked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={saveLessonsChecked ? '#4F46E5' : '#94A3B8'}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.scheduleCheckboxTitle}>
                            📚 Ders Havuzu ({parsedSchedule.lessons.length})
                          </Text>
                          <Text style={styles.scheduleCheckboxSub}>
                            Bulunan dersleri okulun dersler havuzuna ekler.
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.scheduleToggleBtn}
                        onPress={() => setShowLessonsList(!showLessonsList)}
                      >
                        <Ionicons name={showLessonsList ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    {showLessonsList && (
                      <View style={styles.chipsContainer}>
                        {parsedSchedule.lessons.map((l, idx) => (
                          <View key={idx} style={[styles.itemChip, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                            <Text style={[styles.itemChipText, { color: '#047857' }]}>{l}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Haftalık Ders Programı */}
                  <View style={styles.scheduleCheckboxContainer}>
                    <View style={styles.scheduleCheckboxRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        onPress={() => setSaveScheduleChecked(!saveScheduleChecked)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={saveScheduleChecked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={saveScheduleChecked ? '#4F46E5' : '#94A3B8'}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.scheduleCheckboxTitle}>
                            📅 Haftalık Ders Programı ({parsedSchedule.scheduleItems.length} Ders Saati)
                          </Text>
                          <Text style={styles.scheduleCheckboxSub}>
                            Haftalık gün ve saat bazında tüm ders eşleştirmelerini yazar.
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Aksiyon Butonları */}
                <View style={styles.scheduleActionButtonsRow}>
                  <TouchableOpacity
                    style={styles.cancelUploadButton}
                    onPress={() => {
                      setParsedSchedule(null);
                      setAiModalVisible(false);
                    }}
                  >
                    <Text style={styles.cancelUploadText}>Vazgeç</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmSaveButton, { flex: 2 }]}
                    onPress={executeSaveSchedule}
                    disabled={aiSaving}
                  >
                    {aiSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={18} color="#fff" />
                        <Text style={styles.confirmSaveText}>Seçilenleri Kaydet</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* 6. Excel ile Öğrenci Yükleme Onay Modalı */}
      <Modal visible={excelModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Excel Öğrenci Aktarımı</Text>
              <TouchableOpacity onPress={() => setExcelModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {excelParsing ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.aiLoadingText}>Excel dosyası inceleniyor...</Text>
                <Text style={styles.aiLoadingSub}>e-Okul sınıf listesi ve öğrenci kayıtları ayrıştırılıyor.</Text>
              </View>
            ) : parsedExcelStudents.length > 0 ? (
              <View style={styles.parsedPreview}>
                <Text style={styles.previewSuccessTitle}>🎉 Excel Ayrıştırma Başarılı!</Text>

                {excelSchoolName && (
                  <View style={{ backgroundColor: '#F0FDF4', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#BBF7D0' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', textAlign: 'center' }}>
                      🏫 {excelSchoolName}
                    </Text>
                  </View>
                )}

                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{parsedExcelStudents.length}</Text>
                    <Text style={styles.previewLbl}>Öğrenci</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{detectedExcelClasses.length}</Text>
                    <Text style={styles.previewLbl}>Sınıf / Şube</Text>
                  </View>
                </View>

                <Text style={styles.previewNote}>
                  Tespit edilen {detectedExcelClasses.length} şube ve {parsedExcelStudents.length} öğrenci doğrudan okulunuzun sunucu veritabanına tek seferde aktarılacak.
                </Text>

                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#059669' }]}
                  onPress={handleConfirmAndSaveExcelStudents}
                  disabled={excelSaving}
                >
                  {excelSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.confirmSaveText}>Onayla & Sunucuya Aktar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* 7. Sınıf Öğrencileri Detay & CRUD Modalı (Yukarıdan Aşağı İnme) */}
      <Modal
        visible={classStudentsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setClassStudentsModalVisible(false)}
      >
        <View style={styles.topDownOverlay}>
          <View style={styles.topDownCard}>
            {/* Modal Başlığı */}
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.classBadge}>
                    <Text style={styles.classBadgeText}>
                      {selectedClassForStudents?.className || `${selectedClassForStudents?.grade}-${selectedClassForStudents?.section}`}
                    </Text>
                  </View>
                  <Text style={styles.topDownTitle}>
                    Sınıfı Öğrencileri
                  </Text>
                </View>
                <Text style={styles.topDownSub}>
                  👥 Toplam {students.filter(s => s.grade === selectedClassForStudents?.grade && s.section === selectedClassForStudents?.section).length} kayıtlı öğrenci
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setClassStudentsModalVisible(false)}
                style={styles.topDownCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Üst Eylem Butonları */}
            <View style={styles.classModalActionRow}>
              <TouchableOpacity
                style={styles.classModalAddBtn}
                onPress={() => {
                  if (selectedClassForStudents) {
                    setNewStudentGrade(selectedClassForStudents.grade);
                    setNewStudentSection(selectedClassForStudents.section);
                  }
                  setAddStudentModalVisible(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add" size={15} color="#fff" />
                <Text style={styles.classModalAddBtnText}>+ Bu Sınıfa Öğrenci Ekle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.classModalFilterBtn}
                onPress={() => {
                  if (selectedClassForStudents) {
                    setSelectedClassFilter(selectedClassForStudents.className || `${selectedClassForStudents.grade}-${selectedClassForStudents.section}`);
                    setClassStudentsModalVisible(false);
                    setActiveTab('students');
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="filter" size={15} color="#4F46E5" />
                <Text style={styles.classModalFilterBtnText}>Öğrenciler Sekmesinde Filtrele</Text>
              </TouchableOpacity>
            </View>

            {/* Sınıftaki Öğrenci Listesi */}
            <ScrollView style={styles.classStudentsListScroll} showsVerticalScrollIndicator={false}>
              {(() => {
                const classStudents = students.filter(
                  s => s.grade === selectedClassForStudents?.grade && s.section === selectedClassForStudents?.section
                );

                if (classStudents.length === 0) {
                  return (
                    <View style={styles.classEmptyStudentsBox}>
                      <Ionicons name="people-outline" size={44} color="#94A3B8" />
                      <Text style={styles.classEmptyStudentsTitle}>Bu sınıfta henüz kayıtlı öğrenci yok</Text>
                      <Text style={styles.classEmptyStudentsSub}>
                        Yukarıdaki "+ Bu Sınıfa Öğrenci Ekle" butonuna dokunarak doğrudan bu şubeye öğrenci ekleyebilirsiniz.
                      </Text>
                    </View>
                  );
                }

                return classStudents.map((student) => {
                  const photoUrl = student.photoPath ? `${serverBaseUrl}${student.photoPath}` : null;
                  const isUploading = photoUploadingId === student.id;

                  return (
                    <View key={student.id} style={styles.classStudentItemCard}>
                      <View style={styles.classStudentItemTop}>
                        {/* Fotoğraf / Avatar */}
                        <TouchableOpacity
                          style={styles.studentPhotoContainer}
                          onPress={() => handlePickAndUploadPhoto(student)}
                          activeOpacity={0.8}
                        >
                          {isUploading ? (
                            <ActivityIndicator size="small" color="#4F46E5" />
                          ) : photoUrl ? (
                            <Image source={{ uri: photoUrl }} style={styles.studentPhoto} />
                          ) : (
                            <View style={styles.studentPhotoPlaceholder}>
                              <Text style={styles.studentInitials}>
                                {student.fullName.slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.cameraBadge}>
                            <Ionicons name="camera" size={11} color="#fff" />
                          </View>
                        </TouchableOpacity>

                        {/* Bilgiler */}
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.studentName}>{student.fullName}</Text>
                            <Text style={styles.studentNoBadge}>No: {student.studentNumber}</Text>
                          </View>

                          {student.parentName && (
                            <Text style={styles.parentText}>
                              👨‍👩‍👧 Veli: {student.parentName} {student.parentPhone ? `(${student.parentPhone})` : ''}
                            </Text>
                          )}
                          {student.studentPhone && (
                            <Text style={styles.contactText}>📱 Öğrenci Tel: {student.studentPhone}</Text>
                          )}
                        </View>
                      </View>

                      {/* Aksiyon Butonları */}
                      <View style={styles.studentActionsRow}>
                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => handlePickAndUploadPhoto(student)}
                        >
                          <Ionicons name="camera-outline" size={13} color="#4F46E5" />
                          <Text style={styles.cardActionBtnText}>Fotoğraf</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => {
                            setEditingStudent({ ...student });
                            setEditStudentModalVisible(true);
                          }}
                        >
                          <Ionicons name="pencil" size={13} color="#4F46E5" />
                          <Text style={styles.cardActionBtnText}>Düzenle</Text>
                        </TouchableOpacity>

                        {student.parentPhone && (
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                            onPress={() => Linking.openURL(`tel:${student.parentPhone}`)}
                          >
                            <Ionicons name="call-outline" size={13} color="#16A34A" />
                            <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Veli Ara</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                          onPress={() => handleDeleteStudent(student.id, student.fullName)}
                        >
                          <Ionicons name="trash-outline" size={13} color="#DC2626" />
                          <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 0. Admin Giriş Bilgileri & Şifre Değiştirme Modalı */}
      <Modal visible={adminCredentialsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔐 Yönetici Giriş Bilgileri</Text>
              <TouchableOpacity onPress={() => setAdminCredentialsModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Yeni Kullanıcı Adı (İsteğe bağlı)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni kullanıcı adı"
              value={adminNewUsername}
              onChangeText={setAdminNewUsername}
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Mevcut Şifreniz (* Zorunlu)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Mevcut yönetici şifreniz"
              value={adminOldPassword}
              onChangeText={setAdminOldPassword}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Yeni Şifre (İsteğe bağlı)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni şifreniz"
              value={adminNewPassword}
              onChangeText={setAdminNewPassword}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Yeni Şifre (Tekrar)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni şifrenizi tekrar girin"
              value={adminConfirmPassword}
              onChangeText={setAdminConfirmPassword}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={styles.createSubmitButton}
              onPress={handleSaveAdminCredentials}
              disabled={savingAdminCredentials}
            >
              {savingAdminCredentials ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Bilgileri Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3.1 Ders Düzenleme Modalı */}
      <Modal visible={editLessonModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ Dersi Düzenle</Text>
              <TouchableOpacity onPress={() => setEditLessonModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Ders Adı (* Şube/Saat Ayrımı Yazabilirsiniz)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Matematik (5-A, 3 Saat)"
              value={editLessonName}
              onChangeText={setEditLessonName}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Kısa Kod</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: MAT, BYL"
              value={editLessonCode}
              onChangeText={setEditLessonCode}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Kademe (Sınıf Düzeyi)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 5 veya boş bırakın"
              value={editLessonGrade}
              onChangeText={setEditLessonGrade}
              keyboardType="numeric"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Haftalık Ders Saati</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 2, 3, 4"
              value={editLessonHours}
              onChangeText={setEditLessonHours}
              keyboardType="numeric"
              placeholderTextColor={Colors.textMuted}
            />

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#4F46E5' }]}
              onPress={handleSaveLessonEdit}
              disabled={updatingLesson}
            >
              {updatingLesson ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>Ders Bilgilerini Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3.2 Yıllık Plan Yükleme & Sütun Eşleştirme Modalı */}
      <Modal visible={yearlyPlanModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📋 Yıllık Plan Yükle & Eşleştir</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {selectedLessonForPlan?.name} ({docAnalysis?.fileName || 'Dosya Analizi'})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setYearlyPlanModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {analyzingPlanFile ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                  Dosya analiz ediliyor ve tablo sütunları okunuyor...
                </Text>
              </View>
            ) : docAnalysis ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.mappingInfoBox}>
                  <Ionicons name="information-circle" size={18} color="#4F46E5" />
                  <Text style={styles.mappingInfoText}>
                    Excel/Word dosyanızdan {docAnalysis.rawRows.length} satır tespit edildi. Sütunların yıllık plan alanlarıyla doğru eşleştiğini kontrol edip gerekiyorsa değiştiriniz:
                  </Text>
                </View>

                {/* Sütun Eşleştirme Kartları */}
                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>🎯 Konu Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.topicColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, topicColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.topicColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>💡 Kazanım / Açıklama Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.outcomesColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, outcomesColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.outcomesColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>📅 Tarih Aralığı Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.dateColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, dateColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.dateColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>🔢 Hafta Numarası Sütunu:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {docAnalysis.columns.map((col) => (
                        <TouchableOpacity
                          key={col.index}
                          style={[styles.colChip, selectedMapping.weekColIndex === col.index && styles.colChipActive]}
                          onPress={() => setSelectedMapping({ ...selectedMapping, weekColIndex: col.index })}
                        >
                          <Text style={[styles.colChipText, selectedMapping.weekColIndex === col.index && styles.colChipTextActive]}>
                            {col.headerName || `Sütun ${col.index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <TouchableOpacity
                  style={[styles.createSubmitButton, { backgroundColor: '#059669', marginVertical: 14 }]}
                  onPress={handleConfirmAndSaveYearlyPlan}
                  disabled={savingPlanRows}
                >
                  {savingPlanRows ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.createSubmitText}>Yıllık Planı Sunucuya Kaydet</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* 1.3 Öğretmen Haftalık Ders Programı Çizelgesi Modalı */}
      <Modal visible={teacherScheduleModalVisible} animationType="slide" transparent>
        <View style={styles.topDownOverlay}>
          <View style={[styles.topDownCard, { maxHeight: '92%' }]}>
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topDownTitle}>
                  📅 {selectedTeacherForSchedule?.fullName}
                </Text>
                <Text style={styles.topDownSub}>
                  Haftalık Ders Programı & Girdiği Şubeler (Çarşaf Kaydı)
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topDownCloseBtn}
                onPress={() => setTeacherScheduleModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {loadingTeacherSchedule ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 10, fontSize: 13, color: '#64748B' }}>Ders programı getiriliyor...</Text>
              </View>
            ) : teacherScheduleItems.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', paddingHorizontal: 20 }}>
                <Ionicons name="calendar-outline" size={48} color="#94A3B8" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569', marginTop: 12 }}>
                  Ders Programı Bulunamadı
                </Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                  Bu öğretmen için henüz sunucuda kayıtlı bir ders programı yok. "AI Çarşaf" sekmesinden çarşaf programı okutarak veya güncelleyerek otomatik oluşturabilirsiniz.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map((day) => {
                  const dayItems = teacherScheduleItems
                    .filter(i => (i.dayName || i.dayOfWeek || '').toLowerCase().includes(day.toLowerCase().slice(0, 3)))
                    .sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0));

                  return (
                    <View key={day} style={styles.scheduleDayCard}>
                      <View style={styles.scheduleDayHeader}>
                        <Text style={styles.scheduleDayTitle}>{day}</Text>
                        <Text style={styles.scheduleDayCount}>{dayItems.length} Ders</Text>
                      </View>

                      {dayItems.length === 0 ? (
                        <Text style={styles.scheduleDayEmpty}>Bu gün dersi bulunmuyor</Text>
                      ) : (
                        dayItems.map((item, idx) => (
                          <View key={idx} style={styles.scheduleItemRow}>
                            <View style={styles.schedulePeriodBadge}>
                              <Text style={styles.schedulePeriodText}>{item.periodNumber || idx + 1}. Ders</Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.scheduleLessonName}>{item.lessonName || 'Ders'}</Text>
                              <Text style={styles.scheduleClassText}>
                                🏫 Sınıf: {item.className || `${item.grade || ''}-${item.section || ''}`}
                                {item.classroom ? ` • Derslik: ${item.classroom}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 4.2 Toplu Fotoğraf Yükleme Modalı */}
      <Modal visible={bulkPhotoModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 28 }]}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B', marginTop: 16 }}>
              Toplu Fotoğraf Yükleniyor
            </Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}>
              {bulkPhotoProgress || 'Lütfen bekleyin...'}
            </Text>
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
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 4,
  },
  headerCredentialsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginRight: 6,
  },
  headerCredentialsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 3,
  },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  headerSubtitle: { fontSize: 11, color: Colors.textMuted },
  editSchoolBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  addSchoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addSchoolText: { color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  dangerHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 3,
  },
  dangerHeaderBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  teacherBranchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    marginTop: 2,
  },
  teacherClassesText: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
  },
  mappingInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  mappingInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#3730A3',
    lineHeight: 16,
  },
  mappingCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mappingFieldTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  colChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  colChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  colChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  colChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  scheduleDayCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scheduleDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 4,
  },
  scheduleDayTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  scheduleDayCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  scheduleDayEmpty: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  scheduleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  schedulePeriodBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  schedulePeriodText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  scheduleLessonName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  scheduleClassText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  scrollContent: { padding: 14, paddingBottom: 40 },
  schoolSelectorContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  schoolSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  schoolSelectorLabel: {
    fontSize: 10,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  schoolChipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  schoolChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  schoolChipTextSelected: {
    color: '#fff',
  },
  schoolCodeTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  schoolCodeTagSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  schoolCodeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  schoolCodeTagTextSelected: {
    color: '#fff',
  },
  codeCard: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  codeCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeCardLabel: { fontSize: 10, color: '#C7D2FE', fontWeight: '700', letterSpacing: 0.5 },
  codeCardValue: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 2 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  copyButtonText: { color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  licenseInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  licenseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    gap: 4,
  },
  licenseBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  codeCardHint: {
    fontSize: 10,
    color: '#E0E7FF',
    lineHeight: 14,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 4,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
    gap: 4,
  },
  tabButtonActive: {
    backgroundColor: '#EEF2FF',
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  primaryAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  primaryAddBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
  },
  cardItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F46E5',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  contactText: {
    fontSize: 11,
    color: '#4F46E5',
    marginTop: 2,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusActive: { backgroundColor: '#DCFCE7' },
  statusPassive: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 10, fontWeight: '700', color: '#166534' },
  cardActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  cardActionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  classCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  classBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 6,
  },
  classBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4F46E5',
  },
  classStudentCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  classYearText: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  deleteMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    gap: 3,
  },
  deleteMiniText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lessonName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  shortCodeTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  shortCodeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  lessonSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  classFilterScroll: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextSelected: {
    color: '#fff',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    color: Colors.text,
  },
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentPhotoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  studentPhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  studentInitials: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4F46E5',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#4F46E5',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  studentClassTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentClassTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  studentNoText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  parentText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  studentActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  aiBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiBannerTextContainer: { flex: 1 },
  aiBannerTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  aiBannerDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  aiInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  aiInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#3730A3',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    maxHeight: '88%',
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
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  modalInput: {
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 10,
  },
  createSubmitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  createSubmitText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  successIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  successSub: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginBottom: 14 },
  credentialsBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    marginBottom: 14,
  },
  credRow: { flexDirection: 'row', justifyContent: 'space-between' },
  credLabel: { fontSize: 11, color: Colors.textMuted },
  credValCode: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  credVal: { fontSize: 12, fontWeight: '800', color: Colors.text },
  credValPass: { fontSize: 12, fontWeight: '800', color: '#D97706' },
  aiLoadingContainer: { alignItems: 'center', paddingVertical: 14 },
  aiLoadingText: { fontSize: 15, fontWeight: '800', color: '#1E293B', marginTop: 6, marginBottom: 8 },
  aiLoadingSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  aiTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 6,
  },
  aiTimerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  aiStageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
  },
  aiStageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
  },
  aiStageText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 16,
  },
  aiStepsContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 8,
    marginBottom: 12,
  },
  aiStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiStepDoneText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  aiStepActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  aiStepPendingText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  aiProgressInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'flex-start',
    width: '100%',
  },
  aiProgressInfoBoxText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 16,
  },
  parsedPreview: { paddingVertical: 10 },
  previewSuccessTitle: { fontSize: 15, fontWeight: '800', color: '#059669', textAlign: 'center', marginBottom: 12 },
  previewGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  previewItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewVal: { fontSize: 18, fontWeight: '800', color: '#4F46E5' },
  previewLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  previewNote: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', lineHeight: 15, marginBottom: 14 },
  confirmSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    height: 44,
  },
  confirmSaveText: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  scheduleOptionSection: {
    marginTop: 12,
    marginBottom: 6,
  },
  scheduleOptionSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  scheduleModeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  scheduleModeCardActiveMerge: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  scheduleModeCardActiveOverwrite: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  scheduleModeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  scheduleModeDesc: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
  },
  scheduleCheckboxContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  scheduleCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleCheckboxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  scheduleCheckboxSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  scheduleToggleBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  itemChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  itemChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  scheduleActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 6,
  },
  cancelUploadButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelUploadText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },

  // AI & API Yapılandırma Stilleri
  codeCardAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  codeCardAiBtnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCardAiBtnTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  codeCardAiBtnSub: {
    fontSize: 10,
    color: '#E0E7FF',
    marginTop: 1,
  },
  classCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
  },
  classCardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  classCardActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  aiConfigBanner: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 12,
    alignItems: 'flex-start',
  },
  aiConfigBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiConfigBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#312E81',
    marginBottom: 4,
  },
  aiConfigBannerSub: {
    fontSize: 11,
    color: '#4338CA',
    lineHeight: 16,
  },
  aiConfigCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  aiConfigCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiConfigCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  aiConfigCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  aiInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
  },
  aiApiKeyInput: {
    flex: 1,
    height: 44,
    fontSize: 13,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  aiEyeBtn: {
    padding: 8,
  },
  aiQuickBtnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  aiQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  aiQuickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  fetchLiveModelsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fetchLiveModelsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  modelsGrid: {
    gap: 8,
  },
  modelOptionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  modelOptionCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#F5F3FF',
  },
  modelOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  modelOptionNameSelected: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  recommendedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
  },
  modelOptionId: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  modelOptionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 15,
  },
  refreshIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  quotaGaugeBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaGaugeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaGaugeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quotaGaugeVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  gaugeProgressBarTrack: {
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  gaugeProgressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  gaugePercentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  quotaMiniGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quotaMiniBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaMiniBoxVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F46E5',
  },
  quotaMiniBoxLabel: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  quotaFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  openAiStudioPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  openAiStudioPlanText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  resetUsageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  resetUsageText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  saveAiSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 48,
    gap: 8,
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  saveAiSettingsBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Sınıf Öğrencileri Modal Stilleri (Yukarıdan Aşağı)
  topDownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 50,
    paddingHorizontal: 12,
  },
  topDownCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  topDownHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topDownTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  topDownSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  topDownCloseBtn: {
    padding: 6,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
  },
  classModalActionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  classModalAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  classModalAddBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  classModalFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  classModalFilterBtnText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  classStudentsListScroll: {
    marginTop: 8,
  },
  classEmptyStudentsBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  classEmptyStudentsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
  },
  classEmptyStudentsSub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  classStudentItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classStudentItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentNoBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sectionSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  logReportExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  logReportExportBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  logReportExportExcelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  logReportExportExcelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  logRefreshBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  logStatCard: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  logStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4F46E5',
    marginTop: 2,
  },
  logStatLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  logSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  logSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  filterSection: {
    marginBottom: 8,
  },
  filterSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4,
  },
  filterChipsRow: {
    gap: 6,
    paddingBottom: 2,
  },
  logFilterChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logFilterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  logFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  logFilterChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logActionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logActionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logTimestamp: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  logDescription: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
    marginBottom: 6,
  },
  logUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  logUserName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  logRoleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  logRoleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  logIpAddress: {
    fontSize: 10,
    color: '#94A3B8',
  },
  logDetailsBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logDetailsText: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
