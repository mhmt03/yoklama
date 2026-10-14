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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Colors } from '../theme/colors';
import { apiRequest, DEFAULT_API_URL } from '../services/apiClient';
import { parseMasterScheduleWithAi, saveMasterScheduleToServer, ParsedScheduleResult } from '../services/aiScheduleParser';
import { parseStudentsFromExcel, saveParsedStudentsToServer, ParsedExcelStudent } from '../services/excelStudentParser';
import { getActiveSchool, updateSchool } from '../database/operations/schoolOperations';
import { setActiveUserRole } from '../utils/roleService';
import { pickSinglePhotoFromSource } from '../utils/photoService';

type AdminTab = 'teachers' | 'classes' | 'lessons' | 'students' | 'schedule';

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

  // Öğrenci Filtre ve Arama
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);

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

  // 6. Excel Öğrenci Yükleme State
  const [excelModalVisible, setExcelModalVisible] = useState(false);
  const [excelParsing, setExcelParsing] = useState(false);
  const [excelSaving, setExcelSaving] = useState(false);
  const [parsedExcelStudents, setParsedExcelStudents] = useState<ParsedExcelStudent[]>([]);
  const [detectedExcelClasses, setDetectedExcelClasses] = useState<string[]>([]);
  const [excelSchoolName, setExcelSchoolName] = useState<string | undefined>(undefined);

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
          await loadAllSchoolData(current.id);
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

      const apiKey = selectedSchool.geminiApiKey || 'AIzaSyA_placeholder_gemini_key';
      const parsed = await parseMasterScheduleWithAi(file.uri, apiKey, file.mimeType || 'image/jpeg');
      setParsedSchedule(parsed);
    } catch (error: any) {
      Alert.alert('AI Ayrıştırma Hatası', error.message || 'Belge analiz edilemedi.');
      setAiModalVisible(false);
    } finally {
      setAiParsing(false);
    }
  };

  const handleConfirmAndSaveSchedule = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    setAiParsing(true);
    const result = await saveMasterScheduleToServer(selectedSchool.id, parsedSchedule);
    setAiParsing(false);

    if (result.success) {
      Alert.alert('Başarılı 🎉', result.message);
      setAiModalVisible(false);
      setParsedSchedule(null);
      loadAllSchoolData(selectedSchool.id);
    } else {
      Alert.alert('Hata', result.message);
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

  // Rol Değiştirme
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

  // Filtrelenmiş Öğrenci Listesi
  const filteredStudents = students.filter(s => {
    const matchesSearch =
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.studentNumber.includes(studentSearch);

    if (selectedClassFilter === 'all') return matchesSearch;
    return matchesSearch && `${s.grade}-${s.section}` === selectedClassFilter;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBackOrLogout} style={styles.backButton}>
          <Ionicons name="swap-horizontal" size={16} color="#4F46E5" />
          <Text style={styles.backButtonText}>Rol Değiştir</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Okul Yönetim Paneli</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{selectedSchool?.name || 'Okul Seçiniz'}</Text>
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
          <Ionicons name="pencil" size={15} color="#4F46E5" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addSchoolButton}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addSchoolText}>Yeni Okul</Text>
        </TouchableOpacity>
      </View>

      {/* Hızlı Öğretmen Moduna Geçiş Çubuğu (Ders Kokpiti) */}
      <View style={styles.roleSwitchBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.roleSwitchTitle}>👨‍🏫 Derse mi Gireceksiniz?</Text>
          <Text style={styles.roleSwitchSub}>
            Canlı ders kokpiti ve yoklama için Öğretmen Moduna geçin
          </Text>
        </View>
        <TouchableOpacity
          style={styles.roleSwitchBtn}
          onPress={handleSwitchToTeacher}
          activeOpacity={0.85}
        >
          <Ionicons name="log-in-outline" size={15} color="#fff" />
          <Text style={styles.roleSwitchBtnText}>Öğretmen Modu</Text>
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
                      loadAllSchoolData(s.id);
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
                  <TouchableOpacity
                    style={styles.primaryAddBtn}
                    onPress={() => setAddTeacherModalVisible(true)}
                  >
                    <Ionicons name="person-add" size={15} color="#fff" />
                    <Text style={styles.primaryAddBtnText}>+ Öğretmen Ekle</Text>
                  </TouchableOpacity>
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
                          <Text style={[styles.cardActionBtnText, { color: '#D97706' }]}>Şifre Sıfırla (1234)</Text>
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
                  <TouchableOpacity
                    style={styles.primaryAddBtn}
                    onPress={() => setAddClassModalVisible(true)}
                  >
                    <Ionicons name="add-circle" size={16} color="#fff" />
                    <Text style={styles.primaryAddBtnText}>+ Sınıf Ekle</Text>
                  </TouchableOpacity>
                </View>

                {classes.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="school-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Henüz tanımlanmış bir sınıf veya şube yok.</Text>
                  </View>
                ) : (
                  <View style={styles.gridContainer}>
                    {classes.map((cls) => (
                      <View key={cls.id} style={styles.classCard}>
                        <View style={styles.classBadge}>
                          <Text style={styles.classBadgeText}>{cls.className || `${cls.grade}-${cls.section}`}</Text>
                        </View>
                        <Text style={styles.classStudentCount}>
                          👥 {cls.studentCount || 0} Öğrenci
                        </Text>
                        <Text style={styles.classYearText}>Dönem: {cls.academicYear || '2026-2027'}</Text>

                        <TouchableOpacity
                          style={styles.deleteMiniBtn}
                          onPress={() => handleDeleteClass(cls.id, cls.className || `${cls.grade}-${cls.section}`)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                          <Text style={styles.deleteMiniText}>Sınıfı Sil</Text>
                        </TouchableOpacity>
                      </View>
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
                  <TouchableOpacity
                    style={styles.primaryAddBtn}
                    onPress={() => setAddLessonModalVisible(true)}
                  >
                    <Ionicons name="book" size={15} color="#fff" />
                    <Text style={styles.primaryAddBtnText}>+ Ders Ekle</Text>
                  </TouchableOpacity>
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
                          Kademe: {lesson.grade || 'Tüm Kademeler'} • {lesson.weeklyHours || 2} Saat / Hafta
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteMiniBtn}
                        onPress={() => handleDeleteLesson(lesson.id, lesson.name)}
                      >
                        <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      </TouchableOpacity>
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
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#059669' }]}
                      onPress={handlePickAndParseExcel}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="document-text" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>📊 Excel Yükle</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddStudentModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="person-add" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Öğrenci Ekle</Text>
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

            <TextInput
              style={styles.modalInput}
              placeholder="Adı Soyadı"
              value={editingTeacher?.fullName || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, fullName: t })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Telefon Numarası"
              value={editingTeacher?.phone || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, phone: t })}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="E-posta"
              value={editingTeacher?.email || ''}
              onChangeText={(t) => setEditingTeacher({ ...editingTeacher, email: t })}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity style={styles.createSubmitButton} onPress={handleUpdateTeacher}>
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
                  Onayladığınızda tüm okul veritabanına tek seferde atomik olarak kaydedilecek.
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
  roleSwitchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#312E81',
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'space-between',
    gap: 10,
  },
  roleSwitchTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  roleSwitchSub: {
    fontSize: 10,
    color: '#C7D2FE',
    marginTop: 1,
  },
  roleSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#818CF8',
  },
  roleSwitchBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
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
    justifyContent: 'center',
    padding: 18,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    maxHeight: '90%',
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
  aiLoadingContainer: { alignItems: 'center', paddingVertical: 28 },
  aiLoadingText: { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: 14 },
  aiLoadingSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
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
});
