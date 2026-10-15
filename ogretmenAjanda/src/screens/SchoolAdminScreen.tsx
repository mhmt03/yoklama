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
import { analyzeUploadedDocument, convertRowsWithMapping, DocumentAnalysisResult, ColumnMappingSelection, generateYearlyPlanTemplateExcel } from '../utils/columnMappingService';
import {
  exportTeachersReport,
  exportStudentsReport,
  exportClassesReport,
  exportLessonsReport,
  exportSchedulesReport,
  exportYearlyPlanDetailsReport,
  exportAuditLogsReport,
  exportConsolidatedSchoolMasterExcel,
} from '../services/adminReportService';
import {
  parseSingleTeacherScheduleWithAi,
  saveTeacherScheduleToServer,
  saveSingleScheduleItemToServer,
  deleteSingleScheduleItemFromServer,
  fetchScheduleIntegrityStats,
  SingleTeacherScheduleItem,
} from '../services/singleTeacherScheduleParser';
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

type AdminTab = 'teachers' | 'classes' | 'lessons' | 'students' | 'schedule' | 'logs' | 'messages' | 'reports' | 'ai_settings';

export function SchoolAdminScreen({ navigation, onRoleChange }: any) {
  // Okul ve Genel State
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('teachers');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Oturum Açan Kullanıcı & Rol Durumu
  const [currentUserSession, setCurrentUserSession] = useState<any>(null);
  const isStaff = currentUserSession?.role === 'STAFF';

  // Veri Listeleri
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  // Okul İçi Mesajlaşma Denetim State
  const [schoolMessages, setSchoolMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [selectedMessageFilter, setSelectedMessageFilter] = useState<'all' | 'students' | 'teachers' | 'parents'>('all');

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
  const [newTeacherRole, setNewTeacherRole] = useState<'TEACHER' | 'STAFF'>('TEACHER');
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

  // Öğrenci & Veli Giriş ve Şifre Yönetimi Modalı
  const [credentialsModalVisible, setCredentialsModalVisible] = useState(false);
  const [selectedStudentForCreds, setSelectedStudentForCreds] = useState<any>(null);
  const [customResetPassInput, setCustomResetPassInput] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showCredPassword, setShowCredPassword] = useState(false);

  // 5. AI Çarşaf Program Analizi Modal ve Staging Durumu
  const [schedulePreOptionsModalVisible, setSchedulePreOptionsModalVisible] = useState(false);
  const [pendingScheduleFile, setPendingScheduleFile] = useState<any>(null);
  const [optExtractTeachers, setOptExtractTeachers] = useState(true);
  const [optExtractClasses, setOptExtractClasses] = useState(true);
  const [optExtractLessons, setOptExtractLessons] = useState(true);
  const [optExtractScheduleItems, setOptExtractScheduleItems] = useState(true);

  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedSchedule, setParsedSchedule] = useState<ParsedScheduleResult | null>(null);
  const [aiStageText, setAiStageText] = useState('Belge hazırlanıyor...');
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0);
  const [aiActiveModel, setAiActiveModel] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [scheduleSaveMode, setScheduleSaveMode] = useState<'merge' | 'overwrite'>('merge');
  const [saveTeachersChecked, setSaveTeachersChecked] = useState(true);
  const [saveClassesChecked, setSaveClassesChecked] = useState(true);
  const [saveLessonsChecked, setSaveLessonsChecked] = useState(true);
  const [saveScheduleChecked, setSaveScheduleChecked] = useState(true);
  const [showTeachersList, setShowTeachersList] = useState(true);
  const [showClassesList, setShowClassesList] = useState(false);
  const [showLessonsList, setShowLessonsList] = useState(false);
  const [excludedTeachers, setExcludedTeachers] = useState<string[]>([]);
  const [excludedClasses, setExcludedClasses] = useState<string[]>([]);
  const [excludedLessons, setExcludedLessons] = useState<string[]>([]);

  useEffect(() => {
    let interval: any;
    if (aiParsing) {
      setAiElapsedSeconds(0);
      interval = setInterval(() => {
        setAiElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next === 5) {
            setAiStageText('📑 1. Adım: PDF sayfa yer imleri (bookmark) ve sayfa başlıkları taranıyor...');
          } else if (next === 20) {
            setAiStageText('👨‍🏫 2. Adım: Her sayfadaki "Adı Soyadı" ile öğretmen kadrosu doğrulanıyor...');
          } else if (next === 45) {
            setAiStageText('📚 3. Adım: "Ders Adı", "Ders" (kod) ve "Sınıflar" tablosundan tüm branşlar ve şubeler çıkarılıyor...');
          } else if (next === 80) {
            setAiStageText('⏰ 4. Adım: İlk öğretmenin programından okulun giriş-çıkış ve ders saatleri belirleniyor...');
          } else if (next === 120) {
            setAiStageText('🗓️ 5. Adım: Hücrelere bölünmüş haftalık ders tablolarından tüm program çözümleniyor...');
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

  // 3.2 Yıllık Plan Yükleme, Görüntüleme & Sütun Eşleştirme State
  const [schoolYearlyPlans, setSchoolYearlyPlans] = useState<any[]>([]);
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

  // 3.3 Yüklü Yıllık Planı İnceleme Modalı State
  const [viewPlanModalVisible, setViewPlanModalVisible] = useState(false);
  const [selectedLessonForViewPlan, setSelectedLessonForViewPlan] = useState<any>(null);
  const [viewPlanItems, setViewPlanItems] = useState<any[]>([]);
  const [loadingViewPlan, setLoadingViewPlan] = useState(false);
  const [planSearch, setPlanSearch] = useState('');
  const [deletingPlan, setDeletingPlan] = useState(false);

  // 1.3 Öğretmen Haftalık Ders Programı Çizelgesi State
  const [selectedTeacherForSchedule, setSelectedTeacherForSchedule] = useState<any>(null);
  const [teacherScheduleItems, setTeacherScheduleItems] = useState<any[]>([]);
  const [loadingTeacherSchedule, setLoadingTeacherSchedule] = useState(false);
  const [teacherScheduleModalVisible, setTeacherScheduleModalVisible] = useState(false);

  // 1.4 Çarşaf Doğruluk, Doluluk & Sağlamlık Denetimi State
  const [scheduleStats, setScheduleStats] = useState<any | null>(null);
  const [loadingScheduleStats, setLoadingScheduleStats] = useState(false);
  const [scheduleDailyHours, setScheduleDailyHours] = useState(8);

  // 1.5 Canlı İnteraktif Program Düzenleyici State
  const [scheduleEditorMode, setScheduleEditorMode] = useState<'class' | 'teacher'>('class');
  const [selectedClassForEditor, setSelectedClassForEditor] = useState<string>('');
  const [selectedTeacherForEditor, setSelectedTeacherForEditor] = useState<string>('');
  const [allSchoolSchedules, setAllSchoolSchedules] = useState<any[]>([]);
  const [loadingAllSchedules, setLoadingAllSchedules] = useState(false);

  // 1.6 Hücre Slot Düzenleme Modalı State
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [editingSlotData, setEditingSlotData] = useState<{
    id?: string;
    dayOfWeek: number;
    lessonHour: number;
    grade: string;
    section: string;
    teacherName: string;
    lessonName: string;
    classroom?: string;
  } | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);

  // 1.7 Tek Öğretmen Fotoğraftan Program Okuma State
  const [singleTeacherParsing, setSingleTeacherParsing] = useState(false);
  const [singleTeacherPreview, setSingleTeacherPreview] = useState<any | null>(null);
  const [singleTeacherModalVisible, setSingleTeacherModalVisible] = useState(false);
  const [savingSingleTeacher, setSavingSingleTeacher] = useState(false);
  const [teacherLoginFilter, setTeacherLoginFilter] = useState<'all' | 'logged_in' | 'not_logged_in'>('all');

  // 4.2 Toplu Öğrenci Fotoğrafı Yükleme State
  const [bulkPhotoModalVisible, setBulkPhotoModalVisible] = useState(false);
  const [bulkPhotoProgress, setBulkPhotoProgress] = useState('');
  const [uploadingBulkPhotos, setUploadingBulkPhotos] = useState(false);

  // Sunucu Görsel Kök Adresi (Fotoğraflar için)
  const serverBaseUrl = DEFAULT_API_URL.replace(/\/api\/?$/, '');

  // 9. Raporlama Sekmesi State & Filtreleri
  const [exportingReportType, setExportingReportType] = useState<string | null>(null);
  const [reportTeacherBranch, setReportTeacherBranch] = useState('all');
  const [reportTeacherRole, setReportTeacherRole] = useState('all');
  const [reportTeacherActive, setReportTeacherActive] = useState('all');

  const [reportStudentGrade, setReportStudentGrade] = useState('all');
  const [reportStudentSection, setReportStudentSection] = useState('all');
  const [reportStudentSearch, setReportStudentSearch] = useState('');

  const [reportClassGrade, setReportClassGrade] = useState('all');

  const [reportLessonGrade, setReportLessonGrade] = useState('all');
  const [reportLessonPlanStatus, setReportLessonPlanStatus] = useState<'all' | 'has_plan' | 'no_plan'>('all');

  const [reportScheduleTeacher, setReportScheduleTeacher] = useState('all');
  const [reportScheduleClass, setReportScheduleClass] = useState('all');
  const [reportScheduleDay, setReportScheduleDay] = useState(0);

  const [reportSelectedPlanLessonId, setReportSelectedPlanLessonId] = useState<string>('all');

  const [reportAuditUser, setReportAuditUser] = useState('all');
  const [reportAuditRole, setReportAuditRole] = useState('all');
  const [reportAuditAction, setReportAuditAction] = useState('all');

  // Rapor Çıktı Fonksiyonları
  const handleExportTeachersExcel = async () => {
    if (!selectedSchool) return;
    setExportingReportType('teachers');
    try {
      await exportTeachersReport({
        school: selectedSchool,
        teachers,
        filterBranch: reportTeacherBranch,
        filterRole: reportTeacherRole,
        filterActive: reportTeacherActive,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Öğretmen raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportStudentsExcel = async () => {
    if (!selectedSchool) return;
    setExportingReportType('students');
    try {
      await exportStudentsReport({
        school: selectedSchool,
        students,
        filterGrade: reportStudentGrade,
        filterSection: reportStudentSection,
        search: reportStudentSearch,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Öğrenci raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportClassesExcel = async () => {
    if (!selectedSchool) return;
    setExportingReportType('classes');
    try {
      await exportClassesReport({
        school: selectedSchool,
        classes,
        students,
        filterGrade: reportClassGrade,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Sınıf raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportLessonsExcel = async () => {
    if (!selectedSchool) return;
    setExportingReportType('lessons');
    try {
      await exportLessonsReport({
        school: selectedSchool,
        lessons,
        yearlyPlans: schoolYearlyPlans,
        filterGrade: reportLessonGrade,
        filterPlanStatus: reportLessonPlanStatus,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Ders raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportScheduleExcel = async () => {
    if (!selectedSchool) return;
    setExportingReportType('schedules');
    try {
      let schList = teacherScheduleItems;
      const res = await apiRequest<any[]>(`sync/schedules?schoolId=${selectedSchool.id}`);
      if (res.success && res.data) {
        schList = res.data;
      }
      await exportSchedulesReport({
        school: selectedSchool,
        schedules: schList,
        teachers,
        classes,
        filterTeacher: reportScheduleTeacher,
        filterClass: reportScheduleClass,
        filterDay: reportScheduleDay,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Ders programı raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportYearlyPlanDetailsExcel = async (lesson?: any) => {
    if (!selectedSchool) return;
    const target = lesson || (reportSelectedPlanLessonId !== 'all' ? lessons.find(l => l.id === reportSelectedPlanLessonId) : lessons[0]);
    if (!target) {
      Alert.alert('Uyarı', 'Lütfen raporunu almak istediğiniz dersi seçin.');
      return;
    }
    setExportingReportType(`plan_${target.id}`);
    try {
      const items = schoolYearlyPlans.filter(p => (p.lessonName || '').toLowerCase() === (target.name || '').toLowerCase() && (!target.grade || !p.grade || String(p.grade) === String(target.grade)));
      if (items.length === 0) {
        Alert.alert('Bilgi', `"${target.name}" dersine ait henüz kayıtlı bir yıllık plan bulunmuyor.`);
        return;
      }
      await exportYearlyPlanDetailsReport({
        school: selectedSchool,
        lessonName: target.name,
        grade: target.grade,
        planItems: items,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Yıllık plan raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportAuditLogsExcel = async () => {
    if (!selectedSchool) return;
    setExportingReportType('audit_logs');
    try {
      let currentLogs = logs;
      if (currentLogs.length === 0) {
        const res = await apiRequest<any>(`audit-logs?schoolId=${selectedSchool.id}&limit=200`);
        if (res.success && res.data?.logs) {
          currentLogs = res.data.logs;
          setLogs(currentLogs);
        }
      }
      await exportAuditLogsReport({
        school: selectedSchool,
        logs: currentLogs,
        filterUser: reportAuditUser,
        filterRole: reportAuditRole,
        filterAction: reportAuditAction,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Log raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportConsolidatedMaster = async () => {
    if (!selectedSchool) return;
    setExportingReportType('consolidated_master');
    try {
      let schList: any[] = [];
      try {
        const schRes = await apiRequest<any[]>(`sync/schedules?schoolId=${selectedSchool.id}`);
        if (schRes.success && schRes.data) schList = schRes.data;
      } catch (err) { }

      await exportConsolidatedSchoolMasterExcel({
        school: selectedSchool,
        teachers,
        students,
        classes,
        lessons,
        yearlyPlans: schoolYearlyPlans,
        schedules: schList,
      });
    } catch (e: any) {
      Alert.alert('Konsolide Rapor Hatası', 'Okul veritabanı raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  // 1.4 Çarşaf Doğruluk, Doluluk & Sağlamlık Denetimi Fonksiyonları
  const loadScheduleStats = async (hours = scheduleDailyHours) => {
    if (!selectedSchool) return;
    setLoadingScheduleStats(true);
    try {
      const res = await fetchScheduleIntegrityStats(selectedSchool.id, hours);
      if (res.success && res.data) {
        setScheduleStats(res.data);
      }
    } catch (e) {
      console.error('Error loading schedule stats:', e);
    } finally {
      setLoadingScheduleStats(false);
    }
  };

  const loadAllSchedules = async () => {
    if (!selectedSchool) return;
    setLoadingAllSchedules(true);
    try {
      const res = await apiRequest<any[]>(`sync/schedules?schoolId=${selectedSchool.id}`);
      if (res.success && res.data) {
        setAllSchoolSchedules(res.data);
      }
    } catch (e) {
      console.error('Error loading all schedules:', e);
    } finally {
      setLoadingAllSchedules(false);
    }
  };

  const handleOpenSlotModal = (params: {
    dayOfWeek: number;
    lessonHour: number;
    grade?: string;
    section?: string;
    teacherName?: string;
    existingItem?: any;
  }) => {
    const existing = params.existingItem;
    setEditingSlotData({
      id: existing?.id,
      dayOfWeek: params.dayOfWeek,
      lessonHour: params.lessonHour,
      grade: existing?.grade || params.grade || (classes[0] ? String(classes[0].grade) : '9'),
      section: existing?.section || params.section || (classes[0] ? classes[0].section : 'A'),
      teacherName: existing?.teacherName || params.teacherName || (teachers[0] ? teachers[0].fullName : ''),
      lessonName: existing?.lessonName || (lessons[0] ? lessons[0].name : ''),
      classroom: existing?.classroom || '',
    });
    setSlotModalVisible(true);
  };

  const handleSaveSlot = async () => {
    if (!selectedSchool || !editingSlotData) return;
    setSavingSlot(true);
    try {
      const res = await saveSingleScheduleItemToServer({
        id: editingSlotData.id,
        schoolId: selectedSchool.id,
        dayOfWeek: editingSlotData.dayOfWeek,
        lessonHour: editingSlotData.lessonHour,
        grade: editingSlotData.grade,
        section: editingSlotData.section,
        teacherName: editingSlotData.teacherName,
        lessonName: editingSlotData.lessonName,
        classroom: editingSlotData.classroom,
      });

      if (res.success) {
        setSlotModalVisible(false);
        await loadAllSchedules();
        await loadScheduleStats();
        if (selectedTeacherForSchedule) {
          handleOpenTeacherSchedule(selectedTeacherForSchedule);
        }
      } else {
        Alert.alert('Hata', res.message || 'Ders hücresi kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Kayıt sırasında hata oluştu.');
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!selectedSchool || !editingSlotData) return;
    Alert.alert(
      'Dersi Boşalt',
      `${editingSlotData.dayOfWeek}. Gün ${editingSlotData.lessonHour}. ders saatini programdan kaldırmak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Boşalt (Sil)',
          style: 'destructive',
          onPress: async () => {
            setSavingSlot(true);
            try {
              const res = await deleteSingleScheduleItemFromServer({
                schoolId: selectedSchool.id,
                id: editingSlotData.id,
                grade: editingSlotData.grade,
                section: editingSlotData.section,
                dayOfWeek: editingSlotData.dayOfWeek,
                lessonHour: editingSlotData.lessonHour,
              });

              if (res.success) {
                setSlotModalVisible(false);
                await loadAllSchedules();
                await loadScheduleStats();
                if (selectedTeacherForSchedule) {
                  handleOpenTeacherSchedule(selectedTeacherForSchedule);
                }
              } else {
                Alert.alert('Hata', res.message || 'Ders hücresi silinemedi.');
              }
            } catch (e: any) {
              Alert.alert('Hata', e.message || 'Silme sırasında hata oluştu.');
            } finally {
              setSavingSlot(false);
            }
          },
        },
      ]
    );
  };

  const handlePickSingleTeacherSchedulePhoto = async (teacher: any) => {
    if (!selectedSchool) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0];
      setSingleTeacherParsing(true);
      setSingleTeacherModalVisible(true);

      const parsed = await parseSingleTeacherScheduleWithAi(
        asset.uri,
        asset.mimeType || 'image/jpeg',
        teacher.fullName,
        selectedSchool.geminiApiKey,
        selectedGeminiModel
      );

      setSingleTeacherPreview({
        teacher,
        ...parsed,
      });
    } catch (e: any) {
      Alert.alert('AI Okuma Hatası', e.message || 'Öğretmen programı okunamadı.');
      setSingleTeacherModalVisible(false);
    } finally {
      setSingleTeacherParsing(false);
    }
  };

  const handleSaveSingleTeacherSchedule = async () => {
    if (!selectedSchool || !singleTeacherPreview) return;
    setSavingSingleTeacher(true);
    try {
      const res = await saveTeacherScheduleToServer(
        selectedSchool.id,
        singleTeacherPreview.teacherName,
        singleTeacherPreview.items
      );

      if (res.success) {
        Alert.alert('Başarılı 🎉', res.message);
        setSingleTeacherModalVisible(false);
        setSingleTeacherPreview(null);
        await loadAllSchedules();
        await loadScheduleStats();
        if (selectedTeacherForSchedule?.fullName === singleTeacherPreview.teacherName) {
          handleOpenTeacherSchedule(selectedTeacherForSchedule);
        }
      } else {
        Alert.alert('Hata', res.message || 'Program kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Kaydetme sırasında hata oluştu.');
    } finally {
      setSavingSingleTeacher(false);
    }
  };

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
          } catch { }
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

    try {
      const planRes = await apiRequest<any[]>(`sync/yearly-plans?schoolId=${schoolId}`);
      if (planRes.success && planRes.data) {
        setSchoolYearlyPlans(planRes.data);
      } else {
        setSchoolYearlyPlans([]);
      }
    } catch {
      setSchoolYearlyPlans([]);
    }
  };

  const loadStudents = async (schoolId: string) => {
    const res = await apiRequest<any[]>(`sync/students?schoolId=${schoolId}`);
    if (res.success && res.data) setStudents(res.data);
  };

  const loadSchoolMessages = async (targetSchoolId?: string) => {
    const sId = targetSchoolId || selectedSchool?.id;
    if (!sId) return;
    setLoadingMessages(true);
    try {
      const res = await apiRequest<any[]>(`messages?schoolId=${sId}`);
      if (res.success && res.data) {
        setSchoolMessages(res.data);
      }
    } catch (e: any) {
      console.log('Mesajlar yüklenirken hata:', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadSchools();
    getActiveUserSession().then((session) => {
      if (session) setCurrentUserSession(session);
    });
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
        role: newTeacherRole,
      });

      if (res.success && res.data) {
        setAddTeacherModalVisible(false);
        setCreatedTeacherResult(res.data);
        setTeacherFullName('');
        setTeacherBranch('');
        setTeacherPhone('');
        setTeacherEmail('');
        setNewTeacherRole('TEACHER');
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
        role: editingTeacher.role || 'TEACHER',
        permissionsJson: JSON.stringify(editingTeacher.permissions || {}),
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Öğretmen bilgileri ve yetkileri güncellendi.');
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

  // --- ÖĞRENCİ & VELİ GİRİŞ VE ŞİFRE YÖNETİMİ ---

  const handleOpenCredentialsModal = (student: any) => {
    setSelectedStudentForCreds(student);
    setCustomResetPassInput('');
    setShowCredPassword(false);
    setCredentialsModalVisible(true);
  };

  const handleResetStudentPassword = async (customPass?: string) => {
    if (!selectedStudentForCreds || !selectedSchool) return;

    const studentName = selectedStudentForCreds.fullName;
    const defaultPass = `aaaa_${selectedStudentForCreds.studentNumber}`;
    const targetPass = customPass?.trim() || defaultPass;

    Alert.alert(
      'Şifreyi Sıfırla',
      `"${studentName}" öğrencisinin ve velisinin giriş şifresi:\n\n👉 "${targetPass}"\n\nolarak güncellenecektir. Onaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sıfırla',
          onPress: async () => {
            setResettingPassword(true);
            try {
              const res = await apiRequest<{ success: boolean; message: string; password: string }>(
                `schools/${selectedSchool.id}/students/${selectedStudentForCreds.id}/reset-password`,
                'POST',
                { newPassword: customPass?.trim() || undefined }
              );

              if (res.success) {
                Alert.alert(
                  '✅ Şifre Sıfırlandı',
                  `"${studentName}" için yeni giriş şifresi başarıyla kaydedildi:\n\n🔑 Şifre: ${res.data?.password || targetPass}\n\nBu şifre ile hem öğrenci hem veli portala giriş yapabilir.`
                );
                setCustomResetPassInput('');
              } else {
                Alert.alert('Hata', res.error || 'Şifre sıfırlanamadı.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'İşlem başarısız.');
            } finally {
              setResettingPassword(false);
            }
          },
        },
      ]
    );
  };

  const getCredentialsMessage = (student: any) => {
    const sName = student.fullName;
    const sGrade = `${student.grade}-${student.section}`;
    const sNo = student.studentNumber;
    const schoolCode = selectedSchool?.code || '';
    const schoolName = selectedSchool?.name || 'Okulumuz';
    const parentName = student.parentName || 'Sayın Velimiz';
    const defPass = `aaaa_${sNo}`;

    return `Sayın ${parentName},\n\n${schoolName} bünyesinde kayıtlı öğrencimiz ${sName} (${sGrade} - No: ${sNo}) için Öğrenci & Veli Portalı erişim bilgileriniz aşağıdadır:\n\n🏫 Okul Kodu: ${schoolCode}\n👤 Kullanıcı Adı: ${sNo} (veya kayıtlı veli cep telefonu)\n🔑 Giriş Şifresi: ${defPass}\n\nPortal üzerinden ödevleri, ders programını ve öğretmen değerlendirmelerini anlık olarak takip edebilirsiniz.`;
  };

  const handleShareViaWhatsApp = async (student: any) => {
    if (!student.parentPhone) {
      Alert.alert(
        'Veli Telefonu Eksik',
        'Bu öğrencinin veli cep telefonu kayıtlı değil. Düzenle butonundan veli telefonunu ekleyebilirsiniz.'
      );
      return;
    }

    let cleanPhone = student.parentPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '9' + cleanPhone;
    } else if (cleanPhone.length === 10) {
      cleanPhone = '90' + cleanPhone;
    }

    const message = getCredentialsMessage(student);
    const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`);
      }
    } catch {
      await Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`);
    }
  };

  const handleShareViaSms = async (student: any) => {
    if (!student.parentPhone) {
      Alert.alert('Bilgi', 'Bu öğrencinin veli cep telefonu kayıtlı değil.');
      return;
    }

    const cleanPhone = student.parentPhone.replace(/[^0-9+]/g, '');
    const message = getCredentialsMessage(student);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Hata', 'SMS uygulaması açılamadı: ' + e.message);
    }
  };

  const handleCopyCredentialsMessage = async (student: any) => {
    const message = getCredentialsMessage(student);
    await Clipboard.setStringAsync(message);
    Alert.alert('📋 Kopyalandı', 'Öğrenci ve veli portal giriş bilgilendirme metni panoya kopyalandı.');
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

  const toggleExcludeTeacher = (name: string) => {
    setExcludedTeachers((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const toggleExcludeClass = (name: string) => {
    setExcludedClasses((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const toggleExcludeLesson = (name: string) => {
    setExcludedLessons((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]
    );
  };

  const setAllTeachersExcluded = (exclude: boolean) => {
    if (!parsedSchedule) return;
    setExcludedTeachers(exclude ? [...parsedSchedule.teachers] : []);
  };

  const setAllClassesExcluded = (exclude: boolean) => {
    if (!parsedSchedule) return;
    setExcludedClasses(exclude ? [...parsedSchedule.classes] : []);
  };

  const setAllLessonsExcluded = (exclude: boolean) => {
    if (!parsedSchedule) return;
    setExcludedLessons(exclude ? [...parsedSchedule.lessons] : []);
  };

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
      setPendingScheduleFile(file);
      // Analiz öncesi seçenek modalını aç
      setSchedulePreOptionsModalVisible(true);
    } catch (error: any) {
      Alert.alert('Dosya Seçimi Hatası', error.message || 'Belge seçilemedi.');
    }
  };

  const startScheduleAnalysisWithOptions = async () => {
    if (!pendingScheduleFile || !selectedSchool) return;

    // Kontrol 1: En az bir veri kategorisi seçildi mi?
    if (!optExtractTeachers && !optExtractClasses && !optExtractLessons && !optExtractScheduleItems) {
      Alert.alert('Seçim Yapılmadı ⚠️', 'Lütfen analiz edilmesini istediğiniz en az bir veri türünü işaretleyiniz.');
      return;
    }

    // Kontrol 2: Şube Kontrolü (Haftalık ders programı seçildiyse)
    if (optExtractScheduleItems) {
      const registeredClassCount = classes.length;
      if (registeredClassCount === 0 && !optExtractClasses) {
        Alert.alert(
          'Şubeler Eksik ⚠️',
          'Sistemde henüz kayıtlı bir şube (sınıf) bulunmuyor.\n\nDers programındaki saatlerin hangi sınıfa ait olduğunu sisteme işleyebilmek için lütfen "Sınıflar ve Şubeler" seçeneğini de işaretleyiniz veya önce sınıfları sisteme ekleyiniz.'
        );
        return;
      }

      // Kontrol 3: Öğretmen Kontrolü (Haftalık ders programı seçildiyse)
      const registeredTeacherCount = teachers.length;
      if (registeredTeacherCount === 0 && !optExtractTeachers) {
        Alert.alert(
          'Öğretmen Kadrosu Eksik ⚠️',
          'Sistemde henüz kayıtlı öğretmen bulunmuyor.\n\nDers programını öğretmenlere atayabilmek için lütfen "Öğretmen Kadrosu" seçeneğini de işaretleyiniz.'
        );
        return;
      }
    }

    setSchedulePreOptionsModalVisible(false);
    setAiModalVisible(true);
    setAiParsing(true);
    setParsedSchedule(null);
    setExcludedTeachers([]);
    setExcludedClasses([]);
    setExcludedLessons([]);
    setShowTeachersList(optExtractTeachers);
    setShowClassesList(optExtractClasses && !optExtractTeachers);
    setShowLessonsList(optExtractLessons && !optExtractTeachers && !optExtractClasses);
    setAiElapsedSeconds(0);
    setAiStageText(
      optExtractScheduleItems
        ? 'Belge taranmaya hazırlanıyor (Tam Program Çözümleme)...'
        : 'Belge taranmaya hazırlanıyor (Hızlı Kadro, Şube & Ders Analizi)...'
    );

    try {
      const apiKey = (selectedSchool.geminiApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY).trim();
      const model = (selectedGeminiModel || selectedSchool.geminiModel || (await getGeminiModel()) || DEFAULT_GEMINI_MODEL).trim();

      const existingTeacherNames = teachers.map((t: any) => t.fullName || t.name).filter(Boolean);
      const existingClassNames = classes.map((c: any) => `${c.grade}-${c.section.toUpperCase()}`).filter(Boolean);
      const existingLessonNames = lessons.map((l: any) => l.name).filter(Boolean);

      const parsed = await parseMasterScheduleWithAi(
        pendingScheduleFile.uri,
        apiKey,
        pendingScheduleFile.mimeType || (pendingScheduleFile.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        model,
        selectedSchool.id,
        (msg) => setAiStageText(msg),
        (m) => setAiActiveModel(m),
        {
          extractTeachers: optExtractTeachers,
          extractClasses: optExtractClasses,
          extractLessons: optExtractLessons,
          extractScheduleItems: optExtractScheduleItems,
          existingTeachers: existingTeacherNames,
          existingClasses: existingClassNames,
          existingLessons: existingLessonNames,
        }
      );

      setParsedSchedule(parsed);
      setSaveTeachersChecked(optExtractTeachers);
      setSaveClassesChecked(optExtractClasses);
      setSaveLessonsChecked(optExtractLessons);
      setSaveScheduleChecked(optExtractScheduleItems);
    } catch (error: any) {
      Alert.alert('AI Ayrıştırma Hatası', error.message || 'Belge analiz edilemedi.');
      setAiModalVisible(false);
    } finally {
      setAiParsing(false);
    }
  };

  const executeSaveSchedule = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    const activeTeachers = parsedSchedule.teachers.filter((t) => !excludedTeachers.includes(t));
    const activeClasses = parsedSchedule.classes.filter((c) => !excludedClasses.includes(c));
    const activeLessons = parsedSchedule.lessons.filter((l) => !excludedLessons.includes(l));

    if (!saveTeachersChecked && !saveClassesChecked && !saveLessonsChecked && !saveScheduleChecked) {
      Alert.alert('Seçim Yapılmadı ⚠️', 'Lütfen sisteme aktarılacak en az bir veri türü (öğretmen, sınıf, ders veya program) seçiniz.');
      return;
    }

    if (saveTeachersChecked && activeTeachers.length === 0 && parsedSchedule.teachers.length > 0) {
      Alert.alert('Uyarı', 'Tüm öğretmenleri pasif yaptınız. Lütfen en az bir öğretmeni aktif bırakın veya Öğretmen Kadrosu onay kutusunu kaldırın.');
      return;
    }

    const totalExcluded = excludedTeachers.length + excludedClasses.length + excludedLessons.length;
    const excludedSummary = totalExcluded > 0
      ? `\n\n📌 Dikkat: Pasif yapılan ${excludedTeachers.length > 0 ? `${excludedTeachers.length} öğretmen, ` : ''}${excludedClasses.length > 0 ? `${excludedClasses.length} şube, ` : ''}${excludedLessons.length > 0 ? `${excludedLessons.length} ders ` : ''}ve bunlara ait ders saatleri veritabanına KAYDEDİLMEYECEKTİR.`
      : '';

    if (scheduleSaveMode === 'overwrite') {
      Alert.alert(
        '⚠️ Dikkat: Mevcut Program Silinecek',
        `Okulun mevcut haftalık ders programı kayıtları tamamen silinecektir ve yerine bu seçili çarşaf program (${activeTeachers.length} öğretmen, ${activeClasses.length} şube, ${activeLessons.length} ders) sıfırdan yazılacaktır.${excludedSummary}\n\nEmin misiniz?`,
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
      // Pasif yapılan öğretmenleri, şubeleri ve dersleri filtrele
      const activeTeachers = parsedSchedule.teachers.filter((t) => !excludedTeachers.includes(t));
      const activeClasses = parsedSchedule.classes.filter((c) => !excludedClasses.includes(c));
      const activeLessons = parsedSchedule.lessons.filter((l) => !excludedLessons.includes(l));

      // Pasif yapılan öğretmenlere, sınıflara veya derslere ait ders saatlerini de programdan hariç tut
      const activeScheduleItems = parsedSchedule.scheduleItems.filter((item) => {
        if (excludedTeachers.includes(item.teacherName)) return false;
        const clsName = `${item.grade}-${item.section.toUpperCase()}`;
        if (excludedClasses.includes(clsName)) return false;
        if (excludedLessons.includes(item.lessonName)) return false;
        return true;
      });

      const filteredSchedule: ParsedScheduleResult = {
        teachers: activeTeachers,
        classes: activeClasses,
        lessons: activeLessons,
        bellSchedule: parsedSchedule.bellSchedule,
        scheduleItems: activeScheduleItems,
      };

      const result = await saveMasterScheduleToServer(selectedSchool.id, filteredSchedule, {
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
        setExcludedTeachers([]);
        setExcludedClasses([]);
        setExcludedLessons([]);
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
        schoolId: selectedSchool.id,
        overwriteExisting: true,
        planItems: parsedItems.map((p: any) => ({
          lessonName: selectedLessonForPlan.name,
          grade: selectedLessonForPlan.grade ? String(selectedLessonForPlan.grade) : 'Tüm Kademeler',
          weekNumber: p.weekNumber,
          startDate: p.dateStart ? new Date(p.dateStart) : null,
          endDate: p.dateEnd ? new Date(p.dateEnd) : null,
          dateRange: p.dateStart && p.dateEnd ? `${p.dateStart} - ${p.dateEnd}` : undefined,
          subject: p.subjectTopic,
          learningOutcomes: p.learningOutcomes || '',
        })),
      };

      const res = await apiRequest('sync/yearly-plans/batch', 'POST', payload);
      if (res.success) {
        Alert.alert('Başarılı 🎉', `"${selectedLessonForPlan.name}" dersine ait ${parsedItems.length} haftalık yıllık plan başarıyla sunucuya kaydedildi.`);
        setYearlyPlanModalVisible(false);
        setDocAnalysis(null);
        loadLessons(selectedSchool.id);
      } else {
        Alert.alert('Hata', res.error || 'Yıllık plan kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSavingPlanRows(false);
    }
  };

  // Yüklü Yıllık Planı Görme
  const handleOpenViewYearlyPlan = async (lesson: any, cachedPlans?: any[]) => {
    if (!selectedSchool) return;
    setSelectedLessonForViewPlan(lesson);
    setPlanSearch('');
    setViewPlanModalVisible(true);

    if (cachedPlans && cachedPlans.length > 0) {
      setViewPlanItems(cachedPlans);
    }

    setLoadingViewPlan(true);
    try {
      const gradeParam = lesson.grade ? `&grade=${encodeURIComponent(String(lesson.grade))}` : '';
      const res = await apiRequest<any[]>(
        `sync/yearly-plans?schoolId=${selectedSchool.id}&lessonName=${encodeURIComponent(lesson.name)}${gradeParam}`
      );
      if (res.success && res.data) {
        setViewPlanItems(res.data);
      }
    } catch (e) {
      // keep cached
    } finally {
      setLoadingViewPlan(false);
    }
  };

  // Yıllık Planı Silme
  const handleDeleteYearlyPlan = (lesson: any) => {
    if (!selectedSchool || !lesson) return;
    Alert.alert(
      'Yıllık Planı Sil 🗑️',
      `"${lesson.name}" dersine ait sunucudaki tüm yıllık müfredat planı satırları silinecektir.\n\nEmin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingPlan(true);
              const gradeParam = lesson.grade ? `&grade=${encodeURIComponent(String(lesson.grade))}` : '';
              const res = await apiRequest(
                `sync/yearly-plans?schoolId=${selectedSchool.id}&lessonName=${encodeURIComponent(lesson.name)}${gradeParam}`,
                'DELETE'
              );
              if (res.success) {
                Alert.alert('Başarılı', `"${lesson.name}" dersinin yıllık planı silindi.`);
                setViewPlanModalVisible(false);
                loadLessons(selectedSchool.id);
              } else {
                Alert.alert('Hata', res.error || 'Plan silinemedi.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            } finally {
              setDeletingPlan(false);
            }
          },
        },
      ]
    );
  };

  // Yıllık Plan Excel Şablonu İndirme
  const handleDownloadYearlyPlanTemplate = async (lessonName?: string, grade?: string) => {
    try {
      await generateYearlyPlanTemplateExcel(lessonName || 'Ders', grade || 'Tüm_Kademeler');
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon oluşturulamadı: ' + e.message);
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
        } catch { }
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
        } catch { }

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
          <Text style={styles.headerTitle}>
            {isStaff ? '🛡️ Okul İdarecisi Paneli' : 'Okul Yönetim Paneli'}
          </Text>
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
        {!isStaff && (
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addSchoolButton}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addSchoolText}>Yeni Okul</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSchools(); }} />}
      >
        {/* Çoklu Okul Değiştirici (Müşteri Birden Fazla Okul Yönetebilir - İdareci yalnızca kendi okulunu görür) */}
        {schools.length > 1 && !isStaff && (
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
                      } catch { }
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
            onPress={() => {
              setActiveTab('schedule');
              loadScheduleStats();
              loadAllSchedules();
            }}
          >
            <Ionicons name="sparkles" size={15} color={activeTab === 'schedule' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'schedule' && styles.tabButtonTextActive]}>
              📅 Çarşaf & Program
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
            style={[styles.tabButton, activeTab === 'messages' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('messages');
              loadSchoolMessages();
            }}
          >
            <Ionicons name="chatbubbles" size={15} color={activeTab === 'messages' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'messages' && styles.tabButtonTextActive]}>
              💬 Mesajlar {schoolMessages.length > 0 ? `(${schoolMessages.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'reports' && styles.tabButtonActive]}
            onPress={() => setActiveTab('reports')}
          >
            <Ionicons name="stats-chart" size={15} color={activeTab === 'reports' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'reports' && styles.tabButtonTextActive]}>
              📊 Raporlar
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
                {/* 🛡️ GÜVENLİK VE GİRİŞ TAKİP KARTI */}
                <View style={styles.securityCard}>
                  <View style={styles.securityCardHeader}>
                    <View style={styles.securityIconBox}>
                      <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.securityTitle}>Uygulama Kullanım & Güvenlik Takibi</Text>
                      <Text style={styles.securitySub}>
                        Öğretmenlerin uygulamaya giriş durumlarını denetleyin. Şifre sızıntısı veya yetkisiz erişim şüphesinde şifreyi 1234 olarak sıfırlayabilirsiniz.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.securityGrid}>
                    <View style={styles.securityStatBox}>
                      <Text style={styles.securityStatVal}>{teachers.length}</Text>
                      <Text style={styles.securityStatLbl}>Toplam Kadro</Text>
                    </View>
                    <View style={styles.securityStatBox}>
                      <Text style={[styles.securityStatVal, { color: '#0D9488' }]}>
                        {teachers.filter((t) => !!t.lastLoginAt).length}
                      </Text>
                      <Text style={styles.securityStatLbl}>Giriş Yapanlar</Text>
                    </View>
                    <View style={styles.securityStatBox}>
                      <Text style={[styles.securityStatVal, { color: '#E11D48' }]}>
                        {teachers.filter((t) => !t.lastLoginAt).length}
                      </Text>
                      <Text style={styles.securityStatLbl}>Henüz Girmeyen</Text>
                    </View>
                  </View>

                  <View style={styles.securityFilterRow}>
                    <TouchableOpacity
                      style={[styles.securityFilterBtn, teacherLoginFilter === 'all' && styles.securityFilterBtnActive]}
                      onPress={() => setTeacherLoginFilter('all')}
                    >
                      <Text style={[styles.securityFilterText, teacherLoginFilter === 'all' && styles.securityFilterTextActive]}>
                        Tümü ({teachers.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.securityFilterBtn, teacherLoginFilter === 'logged_in' && styles.securityFilterBtnActive]}
                      onPress={() => setTeacherLoginFilter('logged_in')}
                    >
                      <Text style={[styles.securityFilterText, teacherLoginFilter === 'logged_in' && styles.securityFilterTextActive]}>
                        🟢 Giriş Yapan ({teachers.filter((t) => !!t.lastLoginAt).length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.securityFilterBtn, teacherLoginFilter === 'not_logged_in' && styles.securityFilterBtnActive]}
                      onPress={() => setTeacherLoginFilter('not_logged_in')}
                    >
                      <Text style={[styles.securityFilterText, teacherLoginFilter === 'not_logged_in' && styles.securityFilterTextActive]}>
                        ⚪ Girmeyen ({teachers.filter((t) => !t.lastLoginAt).length})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

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
                  teachers
                    .filter((t) => {
                      if (teacherLoginFilter === 'logged_in') return !!t.lastLoginAt;
                      if (teacherLoginFilter === 'not_logged_in') return !t.lastLoginAt;
                      return true;
                    })
                    .map((teacher) => (
                      <View key={teacher.id} style={styles.cardItem}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.teacherAvatar}>
                            <Text style={styles.avatarText}>{teacher.fullName?.slice(0, 2).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <Text style={styles.cardTitle}>{teacher.fullName}</Text>
                              <View style={[styles.roleBadge, teacher.role === 'STAFF' ? styles.roleStaffBadge : styles.roleTeacherBadge]}>
                                <Text style={teacher.role === 'STAFF' ? styles.roleStaffBadgeText : styles.roleTeacherBadgeText}>
                                  {teacher.role === 'STAFF' ? '🛡️ İdareci' : '👨‍🏫 Öğretmen'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.cardSub}>
                              @{teacher.username}
                            </Text>

                            {/* Güvenlik & Son Giriş Rozeti */}
                            {teacher.lastLoginAt ? (
                              <View style={styles.loginStatusBadgeGreen}>
                                <Ionicons name="checkmark-circle" size={12} color="#0D9488" />
                                <Text style={styles.loginStatusTextGreen}>
                                  Son Giriş: {new Date(teacher.lastLoginAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.loginStatusBadgeGray}>
                                <Ionicons name="time-outline" size={12} color="#64748B" />
                                <Text style={styles.loginStatusTextGray}>
                                  Henüz Giriş Yapmadı (İlk Şifre: 1234)
                                </Text>
                              </View>
                            )}
                            {teacher.branch && (
                              <Text style={styles.teacherBranchText}>📚 Branş: {teacher.branch}</Text>
                            )}
                            {teacher.assignedClassesJson && (
                              <Text style={styles.teacherClassesText} numberOfLines={2}>🏫 Sınıflar: {teacher.assignedClassesJson}</Text>
                            )}
                            {teacher.phone && (
                              <Text style={styles.contactText}>📞 {teacher.phone}</Text>
                            )}

                            {/* Yetki Özeti Çipleri */}
                            {(() => {
                              let perms: any = null;
                              if (teacher.permissionsJson) {
                                try { perms = JSON.parse(teacher.permissionsJson); } catch (e) { }
                              }
                              return (
                                <View style={styles.permissionChipsWrap}>
                                  <View style={[styles.permissionMiniChip, perms?.canMessageStudents === false && { backgroundColor: '#FEE2E2' }]}>
                                    <Text style={[styles.permissionMiniChipText, perms?.canMessageStudents === false && { color: '#DC2626' }]}>
                                      {perms?.canMessageStudents === false ? '🚫 Öğrenci Mesaj' : '💬 Öğrenci'}
                                    </Text>
                                  </View>
                                  <View style={[styles.permissionMiniChip, perms?.canMessageParents === false && { backgroundColor: '#FEE2E2' }]}>
                                    <Text style={[styles.permissionMiniChipText, perms?.canMessageParents === false && { color: '#DC2626' }]}>
                                      {perms?.canMessageParents === false ? '🚫 Veli Mesaj' : '💬 Veli'}
                                    </Text>
                                  </View>
                                  <View style={[styles.permissionMiniChip, perms?.canMessageTeachers === false && { backgroundColor: '#FEE2E2' }]}>
                                    <Text style={[styles.permissionMiniChipText, perms?.canMessageTeachers === false && { color: '#DC2626' }]}>
                                      {perms?.canMessageTeachers === false ? '🚫 Öğretmen Mesaj' : '💬 Öğretmen'}
                                    </Text>
                                  </View>
                                  <View style={styles.permissionMiniChip}>
                                    <Text style={styles.permissionMiniChipText}>
                                      {perms?.canViewAllClasses === false ? '🔒 Kısıtlı Şube' : '🌐 Tüm Şubeler'}
                                    </Text>
                                  </View>
                                  {perms?.canUseAiAssistant === false && (
                                    <View style={[styles.permissionMiniChip, { backgroundColor: '#FEE2E2' }]}>
                                      <Text style={[styles.permissionMiniChipText, { color: '#DC2626' }]}>🚫 AI Kapalı</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })()}
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
                              let perms = {
                                canMessageStudents: true,
                                canMessageTeachers: true,
                                canMessageParents: true,
                                canViewAllClasses: true,
                                canUseAiAssistant: true,
                                canExportReports: true,
                                canManageAttendance: true,
                                canEditStudents: false,
                              };
                              if (teacher.permissionsJson) {
                                try {
                                  perms = { ...perms, ...JSON.parse(teacher.permissionsJson) };
                                } catch (e) { }
                              }
                              setEditingTeacher({
                                ...teacher,
                                role: teacher.role || 'TEACHER',
                                permissions: perms,
                              });
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
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
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
                      style={[styles.primaryAddBtn, { backgroundColor: '#0284C7' }]}
                      onPress={() => handleDownloadYearlyPlanTemplate()}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Plan Şablonu</Text>
                    </TouchableOpacity>
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
                  lessons.map((lesson) => {
                    const lessonPlans = schoolYearlyPlans.filter((p) => {
                      const pName = (p.lessonName || '').trim().toLowerCase();
                      const lName = (lesson.name || '').trim().toLowerCase();
                      const nameMatch = pName === lName || pName.includes(lName) || lName.includes(pName);
                      if (!nameMatch) return false;
                      if (lesson.grade && p.grade && p.grade !== 'Tüm Kademeler') {
                        return String(p.grade).trim() === String(lesson.grade).trim();
                      }
                      return true;
                    });
                    const hasPlan = lessonPlans.length > 0;

                    return (
                      <View key={lesson.id} style={styles.lessonCard}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

                          {/* Yıllık Plan Durum Göstergesi */}
                          {hasPlan ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#16A34A' }}>
                                Yıllık Plan Yüklü ({lessonPlans.length} Hafta)
                              </Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="alert-circle-outline" size={13} color="#D97706" />
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>
                                Plan Yüklenmedi
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {hasPlan ? (
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                              onPress={() => handleOpenViewYearlyPlan(lesson, lessonPlans)}
                            >
                              <Ionicons name="eye-outline" size={13} color="#16A34A" />
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Planı Gör</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                              onPress={() => handlePickYearlyPlanFile(lesson)}
                            >
                              <Ionicons name="cloud-upload-outline" size={13} color="#16A34A" />
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A' }]}>Plan Yükle</Text>
                            </TouchableOpacity>
                          )}

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
                    );
                  })
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

                            {/* Giriş Bilgileri Önizleme */}
                            <View style={styles.cardCredPreviewBox}>
                              <View style={styles.cardCredItem}>
                                <Ionicons name="key" size={11} color="#4F46E5" />
                                <Text style={styles.cardCredLabel}>Şifre:</Text>
                                <Text style={styles.cardCredValue}>aaaa_{student.studentNumber}</Text>
                              </View>
                              <View style={styles.cardCredDivider} />
                              <View style={styles.cardCredItem}>
                                <Ionicons name="school" size={11} color="#059669" />
                                <Text style={styles.cardCredLabel}>Okul:</Text>
                                <Text style={styles.cardCredValue}>{selectedSchool?.code || '-'}</Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* Aksiyon Butonları */}
                        <View style={styles.studentActionsRow}>
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { borderColor: '#818CF8', backgroundColor: '#EEF2FF' }]}
                            onPress={() => handleOpenCredentialsModal(student)}
                          >
                            <Ionicons name="key" size={13} color="#4F46E5" />
                            <Text style={[styles.cardActionBtnText, { color: '#4F46E5', fontWeight: '700' }]}>Giriş & Şifre</Text>
                          </TouchableOpacity>

                          {student.parentPhone && (
                            <TouchableOpacity
                              style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                              onPress={() => handleShareViaWhatsApp(student)}
                            >
                              <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                              <Text style={[styles.cardActionBtnText, { color: '#16A34A', fontWeight: '600' }]}>Veli WhatsApp</Text>
                            </TouchableOpacity>
                          )}

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
                  })
                )}
              </View>
            )}

            {/* 5. ÇARŞAF, PROGRAM DENETİMİ VE CANLI DÜZENLEYİCİ SEKMESİ */}
            {activeTab === 'schedule' && (
              <View>
                {/* 1. AI ile Çarşaf Yükleme Butonu */}
                <TouchableOpacity style={styles.aiBanner} onPress={handlePickAndAnalyzeSchedule}>
                  <View style={styles.aiBannerIcon}>
                    <Ionicons name="sparkles" size={28} color="#fff" />
                  </View>
                  <View style={styles.aiBannerTextContainer}>
                    <Text style={styles.aiBannerTitle}>AI ile Çarşaf Program Yükle</Text>
                    <Text style={styles.aiBannerDesc}>
                      Haftalık çarşaf programı yükleyin; öğretmenler, sınıflar ve dersler yapay zeka ile otomatik kurulsun!
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                </TouchableOpacity>

                {/* 2. DOĞRULUK, DOLULUK VE SAĞLAMLIK DENETİM KARTI (Sanity Check) */}
                <View style={styles.sanityCard}>
                  <View style={styles.sanityCardHeader}>
                    <View style={styles.sanityHeaderIconBox}>
                      <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sanityCardTitle}>Program Doğruluk & Sağlamlık Denetimi</Text>
                      <Text style={styles.sanityCardSub}>
                        Çarşaf okumasında eksik şube, boş kalan saat veya çakışma olup olmadığını denetler.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.sanityRefreshBtn}
                      onPress={() => {
                        loadScheduleStats();
                        loadAllSchedules();
                      }}
                      disabled={loadingScheduleStats}
                    >
                      {loadingScheduleStats ? (
                        <ActivityIndicator size="small" color="#4F46E5" />
                      ) : (
                        <Ionicons name="refresh" size={16} color="#4F46E5" />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* 4'lü Sayaç Kutusu */}
                  <View style={styles.sanityGrid}>
                    <View style={styles.sanityBox}>
                      <Text style={styles.sanityBoxVal}>{classes.length}</Text>
                      <Text style={styles.sanityBoxLbl}>Okul Şubesi</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleStats?.classesWithSchedule || 0} Şubede Ders Var
                      </Text>
                    </View>
                    <View style={styles.sanityBox}>
                      <Text style={styles.sanityBoxVal}>{teachers.length}</Text>
                      <Text style={styles.sanityBoxLbl}>Öğretmen Kadrosu</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleStats?.teachersWithSchedule || 0} Öğretmen Atandı
                      </Text>
                    </View>
                    <View style={styles.sanityBox}>
                      <Text style={styles.sanityBoxVal}>{scheduleDailyHours}</Text>
                      <Text style={styles.sanityBoxLbl}>Günlük Ders Saati</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleDailyHours * 5} Saat/Hafta
                      </Text>
                    </View>
                    <View style={[styles.sanityBox, { borderColor: (scheduleStats?.overallFillPercent || 0) >= 95 ? '#BBF7D0' : '#FED7AA' }]}>
                      <Text style={[styles.sanityBoxVal, { color: (scheduleStats?.overallFillPercent || 0) >= 95 ? '#16A34A' : '#EA580C' }]}>
                        %{scheduleStats?.overallFillPercent ?? 0}
                      </Text>
                      <Text style={styles.sanityBoxLbl}>Genel Doluluk</Text>
                      <Text style={styles.sanityBoxSub}>
                        {scheduleStats?.totalActualSlots || allSchoolSchedules.length} / {scheduleStats?.totalExpectedSlots || (classes.length * scheduleDailyHours * 5)} Saat
                      </Text>
                    </View>
                  </View>

                  {/* Doluluk İlerleme Çubuğu */}
                  <View style={styles.sanityProgressWrap}>
                    <View
                      style={[
                        styles.sanityProgressBar,
                        {
                          width: `${Math.min(100, Math.max(3, scheduleStats?.overallFillPercent || 0))}%`,
                          backgroundColor: (scheduleStats?.overallFillPercent || 0) >= 95 ? '#10B981' : (scheduleStats?.overallFillPercent || 0) >= 70 ? '#F59E0B' : '#EF4444',
                        },
                      ]}
                    />
                  </View>

                  {/* Çakışma Uyarıları Bölümü (Conflicts) */}
                  {scheduleStats?.conflictsCount > 0 ? (
                    <View style={styles.conflictAlertBanner}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="warning" size={20} color="#DC2626" />
                        <Text style={styles.conflictAlertTitle}>
                          ⚠️ {scheduleStats.conflictsCount} Ders / Öğretmen Çakışması Bulundu!
                        </Text>
                      </View>
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {scheduleStats.conflicts.map((c: any, cIdx: number) => (
                          <View key={cIdx} style={styles.conflictItemBox}>
                            <Text style={styles.conflictItemType}>
                              {c.type === 'TEACHER_CONFLICT' ? '👨‍🏫 Öğretmen Çakışması' : '🏫 Şube Çakışması'}:
                            </Text>
                            <Text style={styles.conflictItemDesc}>{c.description}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.conflictClearBanner}>
                      <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                      <Text style={styles.conflictClearText}>
                        Harika! Ders saatlerinde veya öğretmen çizelgelerinde hiçbir çakışma bulunmuyor.
                      </Text>
                    </View>
                  )}

                  {/* Şube Bazlı Doluluk Durumları */}
                  {scheduleStats?.classFullness && scheduleStats.classFullness.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.classFullnessHeaderLabel}>Şube Bazlı Doluluk Durumları</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classFullnessScroll}>
                        {scheduleStats.classFullness.map((cf: any, idx: number) => {
                          const isFull = cf.isFullyFilled;
                          const isSelected = selectedClassForEditor === cf.className;
                          return (
                            <TouchableOpacity
                              key={idx}
                              style={[
                                styles.classFullnessBadge,
                                isFull ? styles.classFullnessBadgeFull : styles.classFullnessBadgeMissing,
                                isSelected && styles.classFullnessBadgeSelected,
                              ]}
                              onPress={() => {
                                setScheduleEditorMode('class');
                                setSelectedClassForEditor(cf.className);
                              }}
                            >
                              <Text style={[styles.classFullnessBadgeText, isFull ? { color: '#166534' } : { color: '#9A3412' }]}>
                                {cf.className}: {cf.filledCount}/{cf.expectedCount} Saat
                              </Text>
                              <Text style={[styles.classFullnessBadgeSub, isFull ? { color: '#15803D' } : { color: '#C2410C' }]}>
                                {isFull ? '✅ %100 Dolu' : `⚠️ ${cf.missingCount} Saat Boş`}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* 3. İNTERAKTİF CANLI DERS PROGRAMI DÜZENLEYİCİ */}
                <View style={styles.interactiveEditorCard}>
                  <View style={styles.interactiveHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.interactiveTitle}>✏️ Canlı Ders Programı Düzenleyici</Text>
                      <Text style={styles.interactiveSub}>
                        Hatalı saatlere dokunarak anında ders atayın, öğretmeni değiştirin veya boşaltın.
                      </Text>
                    </View>
                  </View>

                  {/* Mod Seçici (Şube vs Öğretmen) */}
                  <View style={styles.editorModeSegment}>
                    <TouchableOpacity
                      style={[styles.editorModeBtn, scheduleEditorMode === 'class' && styles.editorModeBtnActive]}
                      onPress={() => setScheduleEditorMode('class')}
                    >
                      <Ionicons name="school" size={14} color={scheduleEditorMode === 'class' ? '#4F46E5' : '#64748B'} />
                      <Text style={[styles.editorModeBtnText, scheduleEditorMode === 'class' && styles.editorModeBtnTextActive]}>
                        🏫 Şube Programı
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.editorModeBtn, scheduleEditorMode === 'teacher' && styles.editorModeBtnActive]}
                      onPress={() => setScheduleEditorMode('teacher')}
                    >
                      <Ionicons name="person" size={14} color={scheduleEditorMode === 'teacher' ? '#4F46E5' : '#64748B'} />
                      <Text style={[styles.editorModeBtnText, scheduleEditorMode === 'teacher' && styles.editorModeBtnTextActive]}>
                        👨‍🏫 Öğretmen Programı
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Şube veya Öğretmen Seçici Çipler */}
                  {scheduleEditorMode === 'class' ? (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.editorSelectorLabel}>Düzenlenecek Şubeyi Seçin:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorChipsScroll}>
                        {classes.map((cls) => {
                          const clsName = `${cls.grade}-${cls.section}`;
                          const isSel = (selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : '')) === clsName;
                          return (
                            <TouchableOpacity
                              key={cls.id}
                              style={[styles.editorChip, isSel && styles.editorChipActive]}
                              onPress={() => setSelectedClassForEditor(clsName)}
                            >
                              <Text style={[styles.editorChipText, isSel && styles.editorChipTextActive]}>
                                {clsName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.editorSelectorLabel}>Düzenlenecek Öğretmeni Seçin:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorChipsScroll}>
                        {teachers.map((tch) => {
                          const isSel = (selectedTeacherForEditor || (teachers[0] ? teachers[0].fullName : '')) === tch.fullName;
                          return (
                            <TouchableOpacity
                              key={tch.id}
                              style={[styles.editorChip, isSel && styles.editorChipActive]}
                              onPress={() => setSelectedTeacherForEditor(tch.fullName)}
                            >
                              <Text style={[styles.editorChipText, isSel && styles.editorChipTextActive]}>
                                {tch.fullName} ({tch.branch || 'Öğretmen'})
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* 5 Günlük Haftalık Çizelge Matrisi */}
                  <View style={styles.timetableWrap}>
                    {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map((dayName, dIdx) => {
                      const dayNumber = dIdx + 1;
                      const activeClass = selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : '9-A');
                      const activeTeacher = selectedTeacherForEditor || (teachers[0] ? teachers[0].fullName : '');

                      return (
                        <View key={dayName} style={styles.timetableDayBox}>
                          <View style={styles.timetableDayHeader}>
                            <Text style={styles.timetableDayTitle}>{dayName}</Text>
                          </View>

                          <View style={styles.timetableHoursGrid}>
                            {Array.from({ length: scheduleDailyHours }, (_, hIdx) => {
                              const lessonHour = hIdx + 1;

                              // İlgili hücreyi allSchoolSchedules içinden bul
                              let matchedItem: any = null;
                              if (scheduleEditorMode === 'class') {
                                const [g, sec] = activeClass.split('-');
                                matchedItem = allSchoolSchedules.find(
                                  (s) =>
                                    String(s.grade) === String(g) &&
                                    (s.section || '').toUpperCase() === (sec || '').toUpperCase() &&
                                    s.dayOfWeek === dayNumber &&
                                    s.lessonHour === lessonHour
                                );
                              } else {
                                matchedItem = allSchoolSchedules.find(
                                  (s) =>
                                    (s.teacherName || '').toLowerCase() === activeTeacher.toLowerCase() &&
                                    s.dayOfWeek === dayNumber &&
                                    s.lessonHour === lessonHour
                                );
                              }

                              const isFilled = !!matchedItem && !!matchedItem.lessonName;

                              return (
                                <TouchableOpacity
                                  key={lessonHour}
                                  style={[styles.slotCell, isFilled ? styles.slotCellFilled : styles.slotCellEmpty]}
                                  onPress={() => {
                                    if (scheduleEditorMode === 'class') {
                                      const [g, sec] = activeClass.split('-');
                                      handleOpenSlotModal({
                                        dayOfWeek: dayNumber,
                                        lessonHour,
                                        grade: g,
                                        section: sec,
                                        existingItem: matchedItem,
                                      });
                                    } else {
                                      handleOpenSlotModal({
                                        dayOfWeek: dayNumber,
                                        lessonHour,
                                        teacherName: activeTeacher,
                                        existingItem: matchedItem,
                                      });
                                    }
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <View style={styles.slotCellTop}>
                                    <View style={[styles.slotHourBadge, isFilled && styles.slotHourBadgeFilled]}>
                                      <Text style={[styles.slotHourText, isFilled && styles.slotHourTextFilled]}>
                                        {lessonHour}. Ders
                                      </Text>
                                    </View>
                                    <Ionicons
                                      name={isFilled ? 'pencil' : 'add-circle-outline'}
                                      size={12}
                                      color={isFilled ? '#4F46E5' : '#94A3B8'}
                                    />
                                  </View>

                                  {isFilled ? (
                                    <View style={styles.slotContentBox}>
                                      <Text style={styles.slotLessonTitle} numberOfLines={1}>
                                        {matchedItem.lessonName}
                                      </Text>
                                      <Text style={styles.slotSubDetail} numberOfLines={1}>
                                        {scheduleEditorMode === 'class'
                                          ? (matchedItem.teacherName || 'Öğretmen Atanmadı')
                                          : `${matchedItem.grade}-${matchedItem.section}`}
                                      </Text>
                                      {!!matchedItem.classroom && (
                                        <Text style={styles.slotRoomText} numberOfLines={1}>
                                          📍 {matchedItem.classroom}
                                        </Text>
                                      )}
                                    </View>
                                  ) : (
                                    <View style={styles.slotEmptyBox}>
                                      <Text style={styles.slotEmptyText}>+ Ders Ata</Text>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
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

            {/* 7. OKUL İÇİ MESAJLAŞMA VE DENETİM SEKMESİ */}
            {activeTab === 'messages' && (
              <View>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>💬 Okul İçi Mesajlaşmalar ({schoolMessages.length})</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Tüm öğretmen, öğrenci ve veli iletişimini buradan denetleyebilirsiniz.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.primaryAddBtn, { backgroundColor: '#4F46E5' }]}
                    onPress={() => loadSchoolMessages()}
                  >
                    <Ionicons name="refresh" size={14} color="#fff" />
                    <Text style={styles.primaryAddBtnText}>Yenile</Text>
                  </TouchableOpacity>
                </View>

                {/* Filtre ve Arama */}
                <View style={styles.logSearchContainer}>
                  <Ionicons name="search" size={16} color="#64748B" />
                  <TextInput
                    style={styles.logSearchInput}
                    placeholder="Mesaj içeriği, gönderen veya alıcı ara..."
                    value={messageSearch}
                    onChangeText={setMessageSearch}
                    placeholderTextColor="#94A3B8"
                  />
                  {messageSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setMessageSearch('')}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.logFilterChip, selectedMessageFilter === 'all' && styles.logFilterChipActive]}
                    onPress={() => setSelectedMessageFilter('all')}
                  >
                    <Text style={[styles.logFilterChipText, selectedMessageFilter === 'all' && styles.logFilterChipTextActive]}>
                      Tümü ({schoolMessages.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.logFilterChip, selectedMessageFilter === 'students' && styles.logFilterChipActive]}
                    onPress={() => setSelectedMessageFilter('students')}
                  >
                    <Text style={[styles.logFilterChipText, selectedMessageFilter === 'students' && styles.logFilterChipTextActive]}>
                      Öğrenciye
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.logFilterChip, selectedMessageFilter === 'teachers' && styles.logFilterChipActive]}
                    onPress={() => setSelectedMessageFilter('teachers')}
                  >
                    <Text style={[styles.logFilterChipText, selectedMessageFilter === 'teachers' && styles.logFilterChipTextActive]}>
                      Öğretmenlere
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.logFilterChip, selectedMessageFilter === 'parents' && styles.logFilterChipActive]}
                    onPress={() => setSelectedMessageFilter('parents')}
                  >
                    <Text style={[styles.logFilterChipText, selectedMessageFilter === 'parents' && styles.logFilterChipTextActive]}>
                      Velilere
                    </Text>
                  </TouchableOpacity>
                </View>

                {loadingMessages ? (
                  <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 20 }} />
                ) : schoolMessages.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Henüz kayıtlı bir okul mesajı bulunamadı.</Text>
                  </View>
                ) : (
                  schoolMessages
                    .filter((m) => {
                      if (selectedMessageFilter === 'students') {
                        const t = (m.targetRole || '').toUpperCase();
                        return t.includes('STUDENT') || t === 'GRADE' || t === 'SECTION' || t === 'MY_STUDENTS';
                      }
                      if (selectedMessageFilter === 'teachers') {
                        const t = (m.targetRole || '').toUpperCase();
                        return t.includes('TEACHER');
                      }
                      if (selectedMessageFilter === 'parents') {
                        const t = (m.targetRole || '').toUpperCase();
                        return t.includes('PARENT');
                      }
                      return true;
                    })
                    .filter((m) => {
                      if (!messageSearch.trim()) return true;
                      const q = messageSearch.toLowerCase();
                      return (
                        (m.content || '').toLowerCase().includes(q) ||
                        (m.senderName || '').toLowerCase().includes(q) ||
                        (m.receiverName || '').toLowerCase().includes(q) ||
                        (m.targetDescription || '').toLowerCase().includes(q)
                      );
                    })
                    .map((msg) => (
                      <View key={msg.id} style={styles.cardItem}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons
                              name={msg.senderRole === 'STAFF' ? 'shield-checkmark' : 'person-circle'}
                              size={18}
                              color={msg.senderRole === 'STAFF' ? '#7C3AED' : '#4F46E5'}
                            />
                            <Text style={{ fontWeight: '800', fontSize: 13, color: '#1E293B' }}>
                              {msg.senderName || 'İsimsiz'}
                            </Text>
                            <View style={[styles.roleBadge, { paddingVertical: 1, paddingHorizontal: 6, marginTop: 0 }]}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>
                                {msg.senderRole === 'STAFF' ? 'İdareci' : msg.senderRole === 'TEACHER' ? 'Öğretmen' : msg.senderRole}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                          </Text>
                        </View>

                        <View style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>
                            🎯 Alıcı / Hedef: <Text style={{ color: '#0F172A', fontWeight: '700' }}>{msg.targetDescription || msg.receiverName || msg.targetRole || 'Genel'}</Text>
                          </Text>
                        </View>

                        <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>
                          {msg.content}
                        </Text>
                      </View>
                    ))
                )}
              </View>
            )}

            {/* 8. AI & API AYARLARI SEKMESİ */}
            {activeTab === 'ai_settings' && (
              <View>
                {/* Bilgilendirme Banner */}
                <View style={[styles.aiConfigBanner, isStaff && { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                  <View style={[styles.aiConfigBannerIcon, isStaff && { backgroundColor: '#EDE9FE' }]}>
                    <Ionicons name={isStaff ? 'shield-checkmark' : 'hardware-chip'} size={24} color={isStaff ? '#7C3AED' : '#4F46E5'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aiConfigBannerTitle, isStaff && { color: '#6D28D9' }]}>
                      {isStaff ? '🛡️ Kurumsal AI Yapılandırması (Salt Okunur)' : `${selectedSchool?.name || 'Okul'} Kurumsal AI Yapılandırması`}
                    </Text>
                    <Text style={[styles.aiConfigBannerSub, isStaff && { color: '#5B21B6' }]}>
                      {isStaff
                        ? 'İdareci rolündesiniz. Google Gemini API anahtarı ve model seçimi okul ana yöneticisi (Admin) tarafından yönetilir. Sunucuya anahtar güncellemesi gönderilemez. Okulun ortak lisansı ve kullanım kotası üzerinden işlemler otomatik yürütülür.'
                        : 'Burada belirlenen API anahtarı ve seçilen model sunucu veritabanına yazılır. Bu okula bağlı tüm öğretmenler AI işlemlerini (ders programı OCR, yıllık plan ve öğrenci listeleri) bu kurumsal anahtar ile otomatik yürütür.'}
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

                {/* Sunucu DB Kaydet Butonu (İdarecide Salt Okunur) */}
                {isStaff ? (
                  <View style={[styles.aiConfigBanner, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE', marginTop: 14 }]}>
                    <Ionicons name="information-circle" size={22} color="#7C3AED" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.aiConfigBannerTitle, { color: '#6D28D9' }]}>İdareci Yetki Bildirimi</Text>
                      <Text style={[styles.aiConfigBannerSub, { color: '#5B21B6' }]}>
                        Kurumsal Gemini API anahtarı ve model seçimi okul yöneticisi (Admin) tarafından yönetilir. Sunucuya anahtar değişikliği gönderme yetkiniz bulunmamaktadır.
                      </Text>
                    </View>
                  </View>
                ) : (
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
                )}
              </View>
            )}

            {/* 8. RAPORLAMA VE EXCEL MERKEZİ SEKMESİ */}
            {activeTab === 'reports' && (
              <View style={styles.reportsContainer}>
                {/* Hero / Dashboard Banner */}
                <View style={styles.reportHeroCard}>
                  <View style={styles.reportHeroTop}>
                    <View style={styles.reportHeroIconWrap}>
                      <Ionicons name="stats-chart" size={26} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportHeroTitle}>Kurumsal Excel Raporlama Merkezi</Text>
                      <Text style={styles.reportHeroSubtitle}>
                        Okulunuza ait tüm verileri filtreleyin, hazır Excel tabloları halinde anında indirin veya paylaşın.
                      </Text>
                    </View>
                  </View>

                  {/* Okul Mini Sayaçları */}
                  <View style={styles.reportHeroStatsGrid}>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{teachers.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Öğretmen</Text>
                    </View>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{students.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Öğrenci</Text>
                    </View>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{classes.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Şube</Text>
                    </View>
                    <View style={styles.reportHeroStatItem}>
                      <Text style={styles.reportHeroStatVal}>{lessons.length}</Text>
                      <Text style={styles.reportHeroStatLabel}>Ders</Text>
                    </View>
                  </View>

                  {/* Konsolide Okul Veritabanı Master Butonu */}
                  <TouchableOpacity
                    style={styles.masterExportBtn}
                    onPress={handleExportConsolidatedMaster}
                    disabled={exportingReportType === 'consolidated_master'}
                    activeOpacity={0.88}
                  >
                    {exportingReportType === 'consolidated_master' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download" size={20} color="#fff" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.masterExportBtnTitle}>
                            🌟 Tek Tıkla Konsolide Okul Veritabanı (Multi-Sheet Excel)
                          </Text>
                          <Text style={styles.masterExportBtnSub}>
                            Öğretmenler, öğrenciler, sınıflar, dersler ve haftalık programı tek bir Excel kitabında toplar.
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#C7D2FE" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 1. ÖĞRETMENLER RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="people" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>👨‍🏫 Öğretmen Kadrosu & Görev Dağılımı</Text>
                      <Text style={styles.reportCardDesc}>
                        Branş, atanan sınıflar, iletişim, yetkiler ve ders dağılımı listesi.
                      </Text>
                    </View>
                  </View>

                  {/* Filtre: Branş */}
                  <Text style={styles.reportFilterLabel}>Branş Filtresi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportTeacherBranch === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportTeacherBranch('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportTeacherBranch === 'all' && styles.reportFilterChipTextActive]}>Tüm Branşlar ({teachers.length})</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(teachers.map(t => t.branch).filter(Boolean))).map((branch: any) => (
                      <TouchableOpacity
                        key={branch}
                        style={[styles.reportFilterChip, reportTeacherBranch === branch && styles.reportFilterChipActive]}
                        onPress={() => setReportTeacherBranch(branch)}
                      >
                        <Text style={[styles.reportFilterChipText, reportTeacherBranch === branch && styles.reportFilterChipTextActive]}>
                          {branch} ({teachers.filter(t => t.branch === branch).length})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Filtre: Rol & Durum */}
                  <View style={styles.reportFilterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportFilterLabel}>Kullanıcı Rolü</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'TEACHER', label: 'Öğretmen' },
                          { id: 'STAFF', label: 'İdareci' },
                        ].map(item => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportTeacherRole === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportTeacherRole(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportTeacherRole === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.reportFilterLabel}>Durum</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'active', label: 'Aktif' },
                          { id: 'passive', label: 'Pasif' },
                        ].map(item => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportTeacherActive === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportTeacherActive(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportTeacherActive === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.exportActionBtn}
                    onPress={handleExportTeachersExcel}
                    disabled={exportingReportType === 'teachers'}
                  >
                    {exportingReportType === 'teachers' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-text-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Öğretmen Kadro Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 2. ÖĞRENCİLER RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#F0FDF4' }]}>
                      <Ionicons name="school" size={20} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>👨‍🎓 Öğrenci Künye ve İletişim Raporu</Text>
                      <Text style={styles.reportCardDesc}>
                        Öğrenci numarası, sınıfı, veli isimleri ve telefon numaraları listesi.
                      </Text>
                    </View>
                  </View>

                  {/* Arama Kutusu */}
                  <View style={styles.reportSearchWrap}>
                    <Ionicons name="search" size={15} color="#64748B" />
                    <TextInput
                      style={styles.reportSearchInput}
                      placeholder="Öğrenci adı, no veya veli adı ile filtrele..."
                      value={reportStudentSearch}
                      onChangeText={setReportStudentSearch}
                    />
                    {!!reportStudentSearch && (
                      <TouchableOpacity onPress={() => setReportStudentSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filtre: Kademe */}
                  <Text style={styles.reportFilterLabel}>Sınıf Kademesi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportStudentGrade === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportStudentGrade('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportStudentGrade === 'all' && styles.reportFilterChipTextActive]}>Tüm Kademeler</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(students.map(s => String(s.grade)).filter(Boolean))).sort((a: any, b: any) => Number(a) - Number(b)).map((gr: any) => (
                      <TouchableOpacity
                        key={gr}
                        style={[styles.reportFilterChip, reportStudentGrade === gr && styles.reportFilterChipActive]}
                        onPress={() => setReportStudentGrade(gr)}
                      >
                        <Text style={[styles.reportFilterChipText, reportStudentGrade === gr && styles.reportFilterChipTextActive]}>{gr}. Sınıf</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Filtre: Şube */}
                  <Text style={styles.reportFilterLabel}>Şube</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportStudentSection === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportStudentSection('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportStudentSection === 'all' && styles.reportFilterChipTextActive]}>Tüm Şubeler</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(students.map(s => (s.section || '').toUpperCase()).filter(Boolean))).sort().map((sec: any) => (
                      <TouchableOpacity
                        key={sec}
                        style={[styles.reportFilterChip, reportStudentSection === sec && styles.reportFilterChipActive]}
                        onPress={() => setReportStudentSection(sec)}
                      >
                        <Text style={[styles.reportFilterChipText, reportStudentSection === sec && styles.reportFilterChipTextActive]}>{sec} Şubesi</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#16A34A' }]}
                    onPress={handleExportStudentsExcel}
                    disabled={exportingReportType === 'students'}
                  >
                    {exportingReportType === 'students' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Öğrenci Listesi İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 3. SINIFLAR VE ŞUBELER RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#FEF3C7' }]}>
                      <Ionicons name="grid" size={20} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>🏫 Sınıflar & Şubeler Kapasite Raporu</Text>
                      <Text style={styles.reportCardDesc}>
                        Şube mevcutları, kayıtlı öğrenci sayıları ve sınıf listesi dökümü.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportFilterLabel}>Kademe Filtresi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    <TouchableOpacity
                      style={[styles.reportFilterChip, reportClassGrade === 'all' && styles.reportFilterChipActive]}
                      onPress={() => setReportClassGrade('all')}
                    >
                      <Text style={[styles.reportFilterChipText, reportClassGrade === 'all' && styles.reportFilterChipTextActive]}>Tüm Kademeler ({classes.length} Şube)</Text>
                    </TouchableOpacity>
                    {Array.from(new Set(classes.map(c => String(c.grade)).filter(Boolean))).sort((a: any, b: any) => Number(a) - Number(b)).map((gr: any) => (
                      <TouchableOpacity
                        key={gr}
                        style={[styles.reportFilterChip, reportClassGrade === gr && styles.reportFilterChipActive]}
                        onPress={() => setReportClassGrade(gr)}
                      >
                        <Text style={[styles.reportFilterChipText, reportClassGrade === gr && styles.reportFilterChipTextActive]}>{gr}. Sınıflar</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#D97706' }]}
                    onPress={handleExportClassesExcel}
                    disabled={exportingReportType === 'classes'}
                  >
                    {exportingReportType === 'classes' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="albums-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Sınıf & Şube Kapasite Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 4. DERSLER VE YILLIK PLAN DURUMU RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#F0F9FF' }]}>
                      <Ionicons name="book" size={20} color="#0284C7" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📚 Okul Dersleri & Yıllık Plan Durumu</Text>
                      <Text style={styles.reportCardDesc}>
                        Okuldaki derslerin haftalık saatleri ve yıllık plan yükleme durumları.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportFilterLabel}>Plan Yükleme Durumu</Text>
                  <View style={styles.reportSegmentRow}>
                    {[
                      { id: 'all', label: 'Tüm Dersler' },
                      { id: 'has_plan', label: '✅ Planı Yüklü' },
                      { id: 'no_plan', label: '⚠️ Plan Eksik' },
                    ].map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.reportSegmentBtn, reportLessonPlanStatus === item.id && styles.reportSegmentBtnActive]}
                        onPress={() => setReportLessonPlanStatus(item.id as any)}
                      >
                        <Text style={[styles.reportSegmentText, reportLessonPlanStatus === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#0284C7' }]}
                    onPress={handleExportLessonsExcel}
                    disabled={exportingReportType === 'lessons'}
                  >
                    {exportingReportType === 'lessons' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="calendar-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Dersler ve Plan Durum Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 5. DERS PROGRAMI VE ÇARŞAF MATRİSİ RAPORU KARTI */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#FAF5FF' }]}>
                      <Ionicons name="calendar" size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📅 Haftalık Ders Programı & Çarşaf Matrisi</Text>
                      <Text style={styles.reportCardDesc}>
                        Sınıf bazlı matris çarşafı ve öğretmenlerin haftalık ders dağılım tablosu.
                      </Text>
                    </View>
                  </View>

                  {/* Gün Filtresi */}
                  <Text style={styles.reportFilterLabel}>Gün Filtresi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    {[
                      { day: 0, label: 'Tüm Hafta (Pzt-Cum)' },
                      { day: 1, label: 'Pazartesi' },
                      { day: 2, label: 'Salı' },
                      { day: 3, label: 'Çarşamba' },
                      { day: 4, label: 'Perşembe' },
                      { day: 5, label: 'Cuma' },
                    ].map(d => (
                      <TouchableOpacity
                        key={d.day}
                        style={[styles.reportFilterChip, reportScheduleDay === d.day && styles.reportFilterChipActive]}
                        onPress={() => setReportScheduleDay(d.day)}
                      >
                        <Text style={[styles.reportFilterChipText, reportScheduleDay === d.day && styles.reportFilterChipTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={handleExportScheduleExcel}
                    disabled={exportingReportType === 'schedules'}
                  >
                    {exportingReportType === 'schedules' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="grid-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Ders Programı & Çarşaf Matrisi İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 6. DERSİN DETAYLI YILLIK KAZANIM PLANI RAPORU */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#FFF7ED' }]}>
                      <Ionicons name="ribbon" size={20} color="#EA580C" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📖 Detaylı Yıllık Müfredat & Kazanım Planı</Text>
                      <Text style={styles.reportCardDesc}>
                        Seçilen dersin 36 haftalık konu, defter metni ve MEB kazanım tablosu.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportFilterLabel}>Ders Seçiniz</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportFilterChipScroll}>
                    {lessons.map(lesson => {
                      const isSel = reportSelectedPlanLessonId === lesson.id;
                      const hasPlan = schoolYearlyPlans.some(p => (p.lessonName || '').toLowerCase() === (lesson.name || '').toLowerCase());
                      return (
                        <TouchableOpacity
                          key={lesson.id}
                          style={[styles.reportFilterChip, isSel && styles.reportFilterChipActive]}
                          onPress={() => setReportSelectedPlanLessonId(lesson.id)}
                        >
                          <Text style={[styles.reportFilterChipText, isSel && styles.reportFilterChipTextActive]}>
                            {hasPlan ? '✅ ' : '⚠️ '}{lesson.name} ({lesson.grade ? `${lesson.grade}. Snf` : 'Tüm'})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#EA580C' }]}
                    onPress={() => handleExportYearlyPlanDetailsExcel()}
                    disabled={exportingReportType?.startsWith('plan_')}
                  >
                    {exportingReportType?.startsWith('plan_') ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-attach-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Seçili Dersin Yıllık Planını İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 7. İŞLEM & GÜVENLİK DENETİM LOGLARI RAPORU */}
                <View style={styles.reportSectionCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons name="shield-checkmark" size={20} color="#334155" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>📜 Sistem Denetim & Güvenlik Logları</Text>
                      <Text style={styles.reportCardDesc}>
                        Oturum açma, güncelleme ve silme hareketlerinin IP ve tarihli dökümü.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.reportFilterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportFilterLabel}>Rol Filtresi</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'SCHOOL_ADMIN', label: 'Admin' },
                          { id: 'TEACHER', label: 'Öğretmen' },
                        ].map(item => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportAuditRole === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportAuditRole(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportAuditRole === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.reportFilterLabel}>İşlem Türü</Text>
                      <View style={styles.reportSegmentRow}>
                        {[
                          { id: 'all', label: 'Tümü' },
                          { id: 'LOGIN', label: 'Giriş' },
                          { id: 'UPDATE', label: 'Düzenleme' },
                        ].map(item => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.reportSegmentBtn, reportAuditAction === item.id && styles.reportSegmentBtnActive]}
                            onPress={() => setReportAuditAction(item.id)}
                          >
                            <Text style={[styles.reportSegmentText, reportAuditAction === item.id && styles.reportSegmentTextActive]}>{item.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.exportActionBtn, { backgroundColor: '#334155' }]}
                    onPress={handleExportAuditLogsExcel}
                    disabled={exportingReportType === 'audit_logs'}
                  >
                    {exportingReportType === 'audit_logs' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="newspaper-outline" size={17} color="#fff" />
                        <Text style={styles.exportActionBtnText}>Denetim Logları Raporu İndir (.xlsx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
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

            <Text style={styles.inputLabel}>Kullanıcı Rolü</Text>
            <View style={styles.segmentedRoleRow}>
              <TouchableOpacity
                style={[styles.segmentedRoleBtn, newTeacherRole === 'TEACHER' && styles.segmentedRoleBtnActiveTeacher]}
                onPress={() => setNewTeacherRole('TEACHER')}
              >
                <Ionicons name="school" size={16} color={newTeacherRole === 'TEACHER' ? '#0284C7' : '#64748B'} />
                <Text style={[styles.segmentedRoleText, newTeacherRole === 'TEACHER' && styles.segmentedRoleTextActiveTeacher]}>
                  👨‍🏫 Öğretmen
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentedRoleBtn, newTeacherRole === 'STAFF' && styles.segmentedRoleBtnActiveStaff]}
                onPress={() => setNewTeacherRole('STAFF')}
              >
                <Ionicons name="shield-checkmark" size={16} color={newTeacherRole === 'STAFF' ? '#7C3AED' : '#64748B'} />
                <Text style={[styles.segmentedRoleText, newTeacherRole === 'STAFF' && styles.segmentedRoleTextActiveStaff]}>
                  🛡️ İdareci (Md. Yrd.)
                </Text>
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
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>✏️ Öğretmen Bilgilerini & Yetkilerini Düzenle</Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Rol ve erişim izinlerini okul kurallarına göre yapılandırın.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              {/* Rol Seçimi */}
              <Text style={styles.inputLabel}>Kullanıcı Rolü & Panel Erişimi</Text>
              <View style={styles.segmentedRoleRow}>
                <TouchableOpacity
                  style={[styles.segmentedRoleBtn, editingTeacher?.role !== 'STAFF' && styles.segmentedRoleBtnActiveTeacher]}
                  onPress={() => setEditingTeacher({ ...editingTeacher, role: 'TEACHER' })}
                >
                  <Ionicons name="school" size={16} color={editingTeacher?.role !== 'STAFF' ? '#0284C7' : '#64748B'} />
                  <Text style={[styles.segmentedRoleText, editingTeacher?.role !== 'STAFF' && styles.segmentedRoleTextActiveTeacher]}>
                    👨‍🏫 Öğretmen
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentedRoleBtn, editingTeacher?.role === 'STAFF' && styles.segmentedRoleBtnActiveStaff]}
                  onPress={() => setEditingTeacher({ ...editingTeacher, role: 'STAFF' })}
                >
                  <Ionicons name="shield-checkmark" size={16} color={editingTeacher?.role === 'STAFF' ? '#7C3AED' : '#64748B'} />
                  <Text style={[styles.segmentedRoleText, editingTeacher?.role === 'STAFF' && styles.segmentedRoleTextActiveStaff]}>
                    🛡️ İdareci (Md. Yrd.)
                  </Text>
                </TouchableOpacity>
              </View>

              {editingTeacher?.role === 'STAFF' && (
                <View style={styles.roleExplainBox}>
                  <Text style={styles.roleExplainText}>
                    🛡️ <Text style={{ fontWeight: '800' }}>İdareci Yetkisi:</Text> Bu öğretmen okul yönetim paneline erişebilir. Sınıfları, öğrencileri, işlem loglarını ve mesajlaşmaları denetleyebilir. Okul ekleyemez veya diğer okulları göremez. AI API anahtarını değiştiremez. Lisansı ana yöneticiye bağlı çalışır.
                  </Text>
                </View>
              )}

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

              {/* YETKİ VE KISITLAMA AYARLARI */}
              <Text style={styles.permissionSectionTitle}>🔒 Yetki ve Özellik Kısıtlamaları</Text>

              {/* Mesajlaşma İzinleri */}
              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Öğrencilere Mesaj Gönderebilir</Text>
                  <Text style={styles.permissionSublabel}>Öğrencilere duyuru ve bilgilendirme mesajı atabilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canMessageStudents !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canMessageStudents: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canMessageStudents !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canMessageStudents !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Öğretmenlere Mesaj Gönderebilir</Text>
                  <Text style={styles.permissionSublabel}>Diğer öğretmen arkadaşlarına mesaj yazabilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canMessageTeachers !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canMessageTeachers: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canMessageTeachers !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canMessageTeachers !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Velilere Mesaj Gönderebilir</Text>
                  <Text style={styles.permissionSublabel}>Öğrenci velilerine doğrudan mesaj iletebilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canMessageParents !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canMessageParents: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canMessageParents !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canMessageParents !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              {/* Şube ve Sınıf Görünürlüğü */}
              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Tüm Okul Şubelerini Görebilir</Text>
                  <Text style={styles.permissionSublabel}>Kapalı ise öğretmen yalnızca atandığı şubeleri görür.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canViewAllClasses !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canViewAllClasses: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canViewAllClasses !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canViewAllClasses !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              {/* Şube Seçimi Çipleri */}
              {editingTeacher?.permissions?.canViewAllClasses === false && (
                <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', marginBottom: 4 }}>
                    Erişebileceği Şubeleri Seçin:
                  </Text>
                  <View style={styles.classesChipsContainer}>
                    {classes.map((cls) => {
                      const clsName = `${cls.grade}-${cls.section}`;
                      const currentList: string[] = (editingTeacher?.assignedClassesJson || '')
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                      const isAssigned = currentList.includes(clsName);
                      return (
                        <TouchableOpacity
                          key={cls.id || clsName}
                          style={[styles.classSelectChip, isAssigned && styles.classSelectChipActive]}
                          onPress={() => {
                            let updated: string[];
                            if (isAssigned) {
                              updated = currentList.filter((s: string) => s !== clsName);
                            } else {
                              updated = [...currentList, clsName];
                            }
                            setEditingTeacher({
                              ...editingTeacher,
                              assignedClassesJson: updated.join(', '),
                            });
                          }}
                        >
                          <Text style={[styles.classSelectChipText, isAssigned && styles.classSelectChipTextActive]}>
                            {isAssigned ? '✓ ' : '+ '}{clsName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.inputLabel}>Girdiği Şubeler / Sınıflar (Metin)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: 9-A, 10-B, 11-C"
                value={editingTeacher?.assignedClassesJson || ''}
                onChangeText={(t) => setEditingTeacher({ ...editingTeacher, assignedClassesJson: t })}
              />

              {/* Ek Modül Kısıtlamaları */}
              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Yapay Zeka (AI) ve OCR Kullanabilir</Text>
                  <Text style={styles.permissionSublabel}>Okulun ortak Gemini kotasıyla AI asistanını çalıştırır.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canUseAiAssistant !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canUseAiAssistant: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canUseAiAssistant !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canUseAiAssistant !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Rapor ve Excel / PDF İndirebilir</Text>
                  <Text style={styles.permissionSublabel}>Yoklama, not ve öğrenci raporlarını dışa aktarabilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canExportReports !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canExportReports: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canExportReports !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canExportReports !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Yoklama Değiştirme / Silme</Text>
                  <Text style={styles.permissionSublabel}>Geçmiş yoklama kayıtlarını düzenleyebilir veya silebilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canManageAttendance !== false;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canManageAttendance: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canManageAttendance !== false ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canManageAttendance !== false ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permissionLabelWrap}>
                  <Text style={styles.permissionLabel}>Öğrenci Profil & Fotoğraf Düzenleme</Text>
                  <Text style={styles.permissionSublabel}>Öğrenci bilgilerini ve fotoğraflarını güncelleyebilir.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const current = editingTeacher?.permissions?.canEditStudents === true;
                    setEditingTeacher({
                      ...editingTeacher,
                      permissions: { ...editingTeacher?.permissions, canEditStudents: !current },
                    });
                  }}
                >
                  <Ionicons
                    name={editingTeacher?.permissions?.canEditStudents === true ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editingTeacher?.permissions?.canEditStudents === true ? '#4F46E5' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#4F46E5', marginTop: 10, marginBottom: 8, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}
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

      {/* 4.2 Öğrenci & Veli Giriş ve Şifre Yönetimi Modalı */}
      <Modal visible={credentialsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="key" size={20} color="#4F46E5" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Giriş & Şifre Bilgileri</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                    Öğrenci & Veli Portalı Erişim Kartı
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setCredentialsModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {selectedStudentForCreds && (
                <>
                  {/* Öğrenci Bilgi Özeti Çipi */}
                  <View style={styles.credStudentCardBanner}>
                    <View style={styles.credAvatarWrap}>
                      <Text style={styles.credAvatarText}>
                        {selectedStudentForCreds.fullName?.slice(0, 2).toUpperCase() || 'ÖG'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.credStudentName}>{selectedStudentForCreds.fullName}</Text>
                      <Text style={styles.credStudentSub}>
                        {selectedStudentForCreds.grade}-{selectedStudentForCreds.section} Şubesi • Okul No: {selectedStudentForCreds.studentNumber}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        🏫 {selectedSchool?.name || 'Okul'}
                      </Text>
                    </View>
                  </View>

                  {/* KART 1: ÖĞRENCİ VE VELİ SİSTEM GİRİŞ BİLGİLERİ */}
                  <View style={styles.credSectionBox}>
                    <View style={styles.credSectionHeaderRow}>
                      <Ionicons name="school-outline" size={16} color="#4F46E5" />
                      <Text style={styles.credSectionTitle}>Portal Giriş Bilgileri</Text>
                    </View>

                    {/* Okul Kodu */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>Okul Kodu</Text>
                        <Text style={styles.credFieldValueBold}>{selectedSchool?.code || '-'}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.credCopyBtn}
                        onPress={() => {
                          Clipboard.setStringAsync(selectedSchool?.code || '');
                          Alert.alert('Kopyalandı', 'Okul kodu panoya kopyalandı.');
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#4F46E5" />
                        <Text style={styles.credCopyBtnText}>Kopyala</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Kullanıcı Adı */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>Kullanıcı Adı (Öğrenci No)</Text>
                        <Text style={styles.credFieldValueBold}>{selectedStudentForCreds.studentNumber}</Text>
                        <Text style={styles.credFieldHint}>* Veli ayrıca kayıtlı cep telefonu ile de giriş yapabilir.</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.credCopyBtn}
                        onPress={() => {
                          Clipboard.setStringAsync(selectedStudentForCreds.studentNumber);
                          Alert.alert('Kopyalandı', 'Kullanıcı adı panoya kopyalandı.');
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#4F46E5" />
                        <Text style={styles.credCopyBtnText}>Kopyala</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Giriş Şifresi */}
                    <View style={styles.credDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.credFieldLabel}>Varsayılan / Giriş Şifresi</Text>
                        <Text style={[styles.credFieldValueBold, { color: '#4F46E5' }]}>
                          {showCredPassword ? `aaaa_${selectedStudentForCreds.studentNumber}` : '••••••••••••'}
                        </Text>
                        <Text style={styles.credFieldHint}>* Varsayılan format: aaaa_öğrencino</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.credIconBtn}
                          onPress={() => setShowCredPassword(!showCredPassword)}
                        >
                          <Ionicons name={showCredPassword ? "eye-off-outline" : "eye-outline"} size={16} color="#64748B" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.credCopyBtn}
                          onPress={() => {
                            Clipboard.setStringAsync(`aaaa_${selectedStudentForCreds.studentNumber}`);
                            Alert.alert('Kopyalandı', 'Giriş şifresi panoya kopyalandı.');
                          }}
                        >
                          <Ionicons name="copy-outline" size={14} color="#4F46E5" />
                          <Text style={styles.credCopyBtnText}>Kopyala</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* KART 2: VELİ BİLGİLERİ VE TEK TIKLA PAYLAŞIM */}
                  <View style={[styles.credSectionBox, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
                    <View style={styles.credSectionHeaderRow}>
                      <Ionicons name="people-outline" size={16} color="#16A34A" />
                      <Text style={[styles.credSectionTitle, { color: '#166534' }]}>Veli İletişimi & Bilgi Gönderimi</Text>
                    </View>

                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.credParentInfoText}>
                        👤 <Text style={{ fontWeight: '700' }}>Veli Adı:</Text> {selectedStudentForCreds.parentName || 'Tanımlanmamış'}
                      </Text>
                      <Text style={styles.credParentInfoText}>
                        📱 <Text style={{ fontWeight: '700' }}>Veli Telefonu:</Text> {selectedStudentForCreds.parentPhone || 'Tanımlanmamış'}
                      </Text>
                    </View>

                    {/* Paylaşım Butonları */}
                    <View style={{ gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.credShareBtn, { backgroundColor: '#16A34A' }]}
                        onPress={() => handleShareViaWhatsApp(selectedStudentForCreds)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                        <Text style={styles.credShareBtnText}>WhatsApp ile Veliye Gönder</Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.credShareBtn, { flex: 1, backgroundColor: '#2563EB' }]}
                          onPress={() => handleShareViaSms(selectedStudentForCreds)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
                          <Text style={styles.credShareBtnText}>SMS ile Gönder</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.credShareBtn, { flex: 1, backgroundColor: '#475569' }]}
                          onPress={() => handleCopyCredentialsMessage(selectedStudentForCreds)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="copy-outline" size={16} color="#fff" />
                          <Text style={styles.credShareBtnText}>Tümünü Kopyala</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* KART 3: ŞİFRE SIFIRLAMA */}
                  <View style={[styles.credSectionBox, { borderColor: '#FED7AA', backgroundColor: '#FFFBEB' }]}>
                    <View style={styles.credSectionHeaderRow}>
                      <Ionicons name="refresh-circle-outline" size={18} color="#D97706" />
                      <Text style={[styles.credSectionTitle, { color: '#B45309' }]}>Şifre Sıfırlama (Öğrenci & Veli)</Text>
                    </View>
                    <Text style={styles.credResetHelpText}>
                      Öğrenci veya veli şifresini unuttuysa ya da erişim sorunu yaşıyorsa tek tıkla varsayılan şifreye döndürebilir veya yeni bir şifre belirleyebilirsiniz.
                    </Text>

                    {/* Hızlı Varsayılana Sıfırla Butonu */}
                    <TouchableOpacity
                      style={styles.credResetDefaultBtn}
                      onPress={() => handleResetStudentPassword()}
                      disabled={resettingPassword}
                      activeOpacity={0.85}
                    >
                      {resettingPassword ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={16} color="#fff" />
                          <Text style={styles.credResetDefaultBtnText}>
                            Varsayılan Şifreye Döndür (aaaa_{selectedStudentForCreds.studentNumber})
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Ya da Özel Şifre Belirleme */}
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', marginBottom: 4 }}>
                        Veya Özel Yeni Şifre Belirle:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          style={[styles.modalInput, { flex: 1, marginBottom: 0, backgroundColor: '#fff', fontSize: 13 }]}
                          placeholder="Yeni özel şifre (örn: 123456)"
                          value={customResetPassInput}
                          onChangeText={setCustomResetPassInput}
                          placeholderTextColor={Colors.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.credCustomPassSaveBtn, (!customResetPassInput.trim() || resettingPassword) && { opacity: 0.5 }]}
                          onPress={() => {
                            if (!customResetPassInput.trim()) {
                              Alert.alert('Uyarı', 'Lütfen yeni şifreyi giriniz.');
                              return;
                            }
                            handleResetStudentPassword(customResetPassInput.trim());
                          }}
                          disabled={!customResetPassInput.trim() || resettingPassword}
                        >
                          <Ionicons name="checkmark" size={16} color="#fff" />
                          <Text style={styles.credCustomPassSaveBtnText}>Uygula</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: '#64748B', marginTop: 10 }]}
              onPress={() => setCredentialsModalVisible(false)}
            >
              <Text style={styles.createSubmitText}>Kapat</Text>
            </TouchableOpacity>
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

      {/* AI Çarşaf Program Ön Seçenekler Modalı (Neleri Çekelim?) */}
      <Modal visible={schedulePreOptionsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options-outline" size={24} color="#4F46E5" />
                <Text style={styles.modalTitle}>Çarşaf Program Seçenekleri</Text>
              </View>
              <TouchableOpacity onPress={() => setSchedulePreOptionsModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Seçilen Belge Bilgisi */}
              <View style={styles.preOptFileCard}>
                <Ionicons name="document-text" size={28} color="#4F46E5" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.preOptFileName} numberOfLines={1}>
                    {pendingScheduleFile?.name || 'Seçilen Çarşaf Belgesi'}
                  </Text>
                  <Text style={styles.preOptFileDesc}>
                    Çarşaf belgeler çok sayfalı ve yoğun veri içerir. İhtiyacınıza göre verileri parça parça veya toplu alabilirsiniz.
                  </Text>
                </View>
              </View>

              {/* Hızlı Şablon Butonları */}
              <Text style={styles.preOptSectionTitle}>⚡ Hızlı Şablonlar</Text>
              <View style={styles.preOptPresetsRow}>
                <TouchableOpacity
                  style={[
                    styles.preOptPresetBtn,
                    optExtractTeachers && optExtractClasses && optExtractLessons && !optExtractScheduleItems && styles.preOptPresetBtnActive,
                  ]}
                  onPress={() => {
                    setOptExtractTeachers(true);
                    setOptExtractClasses(true);
                    setOptExtractLessons(true);
                    setOptExtractScheduleItems(false);
                  }}
                >
                  <Ionicons name="flash-outline" size={16} color={optExtractTeachers && optExtractClasses && optExtractLessons && !optExtractScheduleItems ? '#FFFFFF' : '#4F46E5'} />
                  <Text
                    style={[
                      styles.preOptPresetBtnText,
                      optExtractTeachers && optExtractClasses && optExtractLessons && !optExtractScheduleItems && styles.preOptPresetBtnTextActive,
                    ]}
                  >
                    Hızlı Kadro, Sınıf & Ders (~10 sn)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.preOptPresetBtn,
                    !optExtractTeachers && !optExtractClasses && !optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnActive,
                  ]}
                  onPress={() => {
                    setOptExtractTeachers(false);
                    setOptExtractClasses(false);
                    setOptExtractLessons(false);
                    setOptExtractScheduleItems(true);
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={!optExtractTeachers && !optExtractClasses && !optExtractLessons && optExtractScheduleItems ? '#FFFFFF' : '#4F46E5'} />
                  <Text
                    style={[
                      styles.preOptPresetBtnText,
                      !optExtractTeachers && !optExtractClasses && !optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnTextActive,
                    ]}
                  >
                    Sadece Ders Dağılımı (Program)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.preOptPresetBtn,
                    optExtractTeachers && optExtractClasses && optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnActive,
                  ]}
                  onPress={() => {
                    setOptExtractTeachers(true);
                    setOptExtractClasses(true);
                    setOptExtractLessons(true);
                    setOptExtractScheduleItems(true);
                  }}
                >
                  <Ionicons name="sparkles" size={16} color={optExtractTeachers && optExtractClasses && optExtractLessons && optExtractScheduleItems ? '#FFFFFF' : '#4F46E5'} />
                  <Text
                    style={[
                      styles.preOptPresetBtnText,
                      optExtractTeachers && optExtractClasses && optExtractLessons && optExtractScheduleItems && styles.preOptPresetBtnTextActive,
                    ]}
                  >
                    Tümünü Çöz (Tam Otonom)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Seçim Onay Kutuları */}
              <Text style={[styles.preOptSectionTitle, { marginTop: 14 }]}>📋 Çekilecek Veri Türleri</Text>

              {/* 1. Öğretmenler */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractTeachers && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractTeachers(!optExtractTeachers)}
              >
                <Ionicons
                  name={optExtractTeachers ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractTeachers ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>👨‍🏫 Öğretmen Kadrosu</Text>
                    <Text style={styles.preOptBadgeSpeed}>Çok Hızlı ⚡</Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Sayfa yer imleri ve başlıklarından tüm öğretmen isimlerini ve branşları toplar.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 2. Şubeler / Sınıflar */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractClasses && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractClasses(!optExtractClasses)}
              >
                <Ionicons
                  name={optExtractClasses ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractClasses ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>🏫 Şubeler ve Sınıflar</Text>
                    <Text style={styles.preOptBadgeSpeed}>Çok Hızlı ⚡</Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Öğretmen ders tablolarından tüm şubeleri (örn: 9-A, 10-B, 11-C) standartlaştırarak çıkarır.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 3. Ders İsimleri */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractLessons && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractLessons(!optExtractLessons)}
              >
                <Ionicons
                  name={optExtractLessons ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractLessons ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>📚 Ders Tam Adları</Text>
                    <Text style={styles.preOptBadgeSpeed}>Çok Hızlı ⚡</Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Ders kodları (MAT, FİZ) ile açık adları (Matematik, Fizik) eşleştirir.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 4. Haftalık Ders Dağılımı (Program Hücreleri) */}
              <TouchableOpacity
                style={[styles.preOptItemCard, optExtractScheduleItems && styles.preOptItemCardChecked]}
                onPress={() => setOptExtractScheduleItems(!optExtractScheduleItems)}
              >
                <Ionicons
                  name={optExtractScheduleItems ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={optExtractScheduleItems ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.preOptItemTitle}>📅 Haftalık Ders Dağılımı (Program)</Text>
                    <Text style={[styles.preOptBadgeSpeed, { backgroundColor: '#FEF3C7', color: '#B45309' }]}>
                      Kapsamlı Analiz
                    </Text>
                  </View>
                  <Text style={styles.preOptItemSub}>
                    Hücre hücre gün ve saatleri çözer. Her öğretmenin hangi şubeye hangi dersi okuttuğunu eşleştirir.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Sistem Mevcut Durum Kartı */}
              <View style={styles.preOptSystemStatusBox}>
                <Ionicons name="information-circle" size={20} color="#0284C7" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.preOptSystemStatusTitle}>Okulun Sistemdeki Mevcut Kayıtları:</Text>
                  <Text style={styles.preOptSystemStatusText}>
                    • {teachers.length} Öğretmen  |  • {classes.length} Şube  |  • {lessons.length} Ders
                  </Text>
                  {optExtractScheduleItems && classes.length === 0 && !optExtractClasses && (
                    <Text style={styles.preOptWarningText}>
                      ⚠️ Dikkat: Sistemde kayıtlı şube yok! Lütfen yukarıdaki "Şubeler ve Sınıflar" kutusunu da işaretleyiniz.
                    </Text>
                  )}
                  {optExtractScheduleItems && teachers.length === 0 && !optExtractTeachers && (
                    <Text style={styles.preOptWarningText}>
                      ⚠️ Dikkat: Sistemde kayıtlı öğretmen yok! Lütfen yukarıdaki "Öğretmen Kadrosu" kutusunu da işaretleyiniz.
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Butonlar */}
            <View style={styles.preOptActionsRow}>
              <TouchableOpacity
                style={styles.preOptCancelBtn}
                onPress={() => setSchedulePreOptionsModalVisible(false)}
              >
                <Text style={styles.preOptCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preOptSubmitBtn}
                onPress={startScheduleAnalysisWithOptions}
              >
                <Ionicons name="rocket-outline" size={20} color="#FFFFFF" />
                <Text style={styles.preOptSubmitBtnText}>Analizi Başlat</Text>
              </TouchableOpacity>
            </View>
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
                  <Text style={styles.aiTimerBadgeText}>
                    İşlem Sürüyor: {Math.floor(aiElapsedSeconds / 60) > 0 ? `${Math.floor(aiElapsedSeconds / 60)} dk ${aiElapsedSeconds % 60} sn` : `${aiElapsedSeconds} sn`}
                  </Text>
                </View>

                {/* Spinner & Ana Başlık */}
                <ActivityIndicator size="large" color="#4F46E5" style={{ marginVertical: 10 }} />
                <Text style={styles.aiLoadingText}>Gemini AI Çarşaf Programı İnceliyor</Text>
                {!!aiActiveModel && (
                  <View style={[styles.aiTimerBadge, { marginTop: 4, marginBottom: 6 }]}>
                    <Ionicons name="hardware-chip-outline" size={15} color="#4F46E5" />
                    <Text style={styles.aiTimerBadgeText}>Kullanılan Model: {aiActiveModel}</Text>
                  </View>
                )}

                {/* Anlık Aşama Kartı */}
                <View style={styles.aiStageCard}>
                  <View style={styles.aiStageDot} />
                  <Text style={styles.aiStageText}>{aiStageText}</Text>
                </View>

                {/* Adım Listesi (Progress Steps - 5 Aşamalı Çözümleme) */}
                <View style={styles.aiStepsContainer}>
                  <View style={styles.aiStepRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text style={styles.aiStepDoneText}>1. PDF Sayfa Bookmarkları ve sayfa başlıkları taranıyor</Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons
                      name={aiElapsedSeconds >= 15 ? 'checkmark-circle' : 'time-outline'}
                      size={16}
                      color={aiElapsedSeconds >= 15 ? '#16A34A' : '#4F46E5'}
                    />
                    <Text style={aiElapsedSeconds >= 15 ? styles.aiStepDoneText : styles.aiStepActiveText}>
                      2. Her sayfa başlığından ("Adı Soyadı") öğretmen kadrosu doğrulanıyor
                    </Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons
                      name={aiElapsedSeconds >= 35 ? 'checkmark-circle' : 'time-outline'}
                      size={16}
                      color={aiElapsedSeconds >= 35 ? '#16A34A' : '#94A3B8'}
                    />
                    <Text style={aiElapsedSeconds >= 35 ? styles.aiStepDoneText : styles.aiStepPendingText}>
                      3. "Ders Adı", "Ders" (kod) ve "Sınıflar" tablosundan branş ve şubeler çıkarılıyor
                    </Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons
                      name={aiElapsedSeconds >= 60 ? 'checkmark-circle' : 'time-outline'}
                      size={16}
                      color={aiElapsedSeconds >= 60 ? '#16A34A' : '#94A3B8'}
                    />
                    <Text style={aiElapsedSeconds >= 60 ? styles.aiStepDoneText : styles.aiStepPendingText}>
                      4. İlk öğretmenin programından okulun giriş-çıkış ve ders saatleri belirleniyor
                    </Text>
                  </View>
                  <View style={styles.aiStepRow}>
                    <Ionicons
                      name={aiElapsedSeconds >= 90 ? 'checkmark-circle' : 'time-outline'}
                      size={16}
                      color={aiElapsedSeconds >= 90 ? '#16A34A' : '#94A3B8'}
                    />
                    <Text style={aiElapsedSeconds >= 90 ? styles.aiStepDoneText : styles.aiStepPendingText}>
                      5. Hücrelere bölünmüş haftalık ders tablolarından tüm program omurgası çıkarılıyor
                    </Text>
                  </View>
                </View>

                {/* Bilgilendirme Kutusu */}
                <View style={styles.aiProgressInfoBox}>
                  <Ionicons name="information-circle-outline" size={18} color="#166534" />
                  <Text style={styles.aiProgressInfoBoxText}>
                    Çarşaf programlar sayfa sayfa onlarca öğretmen, derslik ve yüzlerce ders hücresi içeren büyük tablolardır. Belge boyutuna ve sayfa sayısına göre yapay zekanın tüm sayfaları titizlikle çözmesi <Text style={{ fontWeight: '800' }}>birkaç dakika (yaklaşık 2-10 dakika)</Text> sürebilir. Bu işlem tamamen normaldir, lütfen ekranı kapatmadan bekleyiniz.
                  </Text>
                </View>
              </View>
            ) : parsedSchedule ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {(() => {
                  const activeTeachersCount = parsedSchedule.teachers.length - excludedTeachers.length;
                  const activeClassesCount = parsedSchedule.classes.length - excludedClasses.length;
                  const activeLessonsCount = parsedSchedule.lessons.length - excludedLessons.length;
                  const activeScheduleItemsCount = parsedSchedule.scheduleItems.filter((item) => {
                    if (excludedTeachers.includes(item.teacherName)) return false;
                    const clsName = `${item.grade}-${item.section.toUpperCase()}`;
                    if (excludedClasses.includes(clsName)) return false;
                    if (excludedLessons.includes(item.lessonName)) return false;
                    return true;
                  }).length;

                  return (
                    <>
                      <Text style={styles.previewSuccessTitle}>🎉 Çarşaf Program Ayrıştırıldı!</Text>

                      {/* Özet Grid Kartları */}
                      <View style={styles.previewGrid}>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeTeachersCount}
                            {excludedTeachers.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{parsedSchedule.teachers.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Öğretmen {excludedTeachers.length > 0 ? `(${excludedTeachers.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeClassesCount}
                            {excludedClasses.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{parsedSchedule.classes.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Sınıf / Şube {excludedClasses.length > 0 ? `(${excludedClasses.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeLessonsCount}
                            {excludedLessons.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{parsedSchedule.lessons.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Ders {excludedLessons.length > 0 ? `(${excludedLessons.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeScheduleItemsCount}
                            {activeScheduleItemsCount !== parsedSchedule.scheduleItems.length && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{parsedSchedule.scheduleItems.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>Ders Saati</Text>
                        </View>
                      </View>

                      {/* Okul Ders & Giriş-Çıkış Saatleri (Varsa) */}
                      {parsedSchedule.bellSchedule && parsedSchedule.bellSchedule.length > 0 && (
                        <View style={[styles.scheduleOptionSection, { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Ionicons name="time" size={16} color="#4F46E5" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                              ⏰ TESPİT EDİLEN OKUL GİRİŞ - ÇIKIŞ SAATLERİ ({parsedSchedule.bellSchedule.length} Ders):
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {parsedSchedule.bellSchedule.map((b) => (
                              <View key={b.period} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                                  {b.period}. Ders: <Text style={{ fontWeight: '600', color: '#1E293B' }}>{b.time}</Text>
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

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

                      {/* 2. Sisteme Yazılacak Veriler (Checkboxes & Tıklanabilir Pasif/Aktif Öğeler) */}
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
                                  👨‍🏫 Öğretmen Kadrosu ({activeTeachersCount}/{parsedSchedule.teachers.length} Aktif)
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
                            <View style={styles.chipsWrapper}>
                              <View style={styles.chipActionsBar}>
                                <Text style={styles.chipHelpText}>
                                  💡 Hatalı veya mükerrer adların üzerine dokunarak <Text style={{ fontWeight: '800', color: '#EF4444' }}>Pasif</Text> yapabilirsiniz (sisteme kaydedilmez):
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <TouchableOpacity
                                    onPress={() => setAllTeachersExcluded(false)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Aktif Et</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setAllTeachersExcluded(true)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Bırak</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              <View style={styles.chipsContainer}>
                                {parsedSchedule.teachers.map((t, idx) => {
                                  const isExcluded = excludedTeachers.includes(t);
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      style={[styles.itemChip, isExcluded && styles.itemChipExcluded]}
                                      onPress={() => toggleExcludeTeacher(t)}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons
                                        name={isExcluded ? 'close-circle' : 'checkmark-circle'}
                                        size={14}
                                        color={isExcluded ? '#EF4444' : '#16A34A'}
                                      />
                                      <Text style={[styles.itemChipText, isExcluded && styles.itemChipTextExcluded]}>
                                        {t}
                                      </Text>
                                      {isExcluded && <Text style={styles.excludedBadgeText}>(Pasif)</Text>}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
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
                                  🏫 Sınıflar & Şubeler ({activeClassesCount}/{parsedSchedule.classes.length} Aktif)
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
                            <View style={styles.chipsWrapper}>
                              <View style={styles.chipActionsBar}>
                                <Text style={styles.chipHelpText}>
                                  💡 Kaydedilmesini istemediğiniz şubelerin üzerine dokunarak pasif yapabilirsiniz:
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <TouchableOpacity
                                    onPress={() => setAllClassesExcluded(false)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Aktif Et</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setAllClassesExcluded(true)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Bırak</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              <View style={styles.chipsContainer}>
                                {parsedSchedule.classes.map((c, idx) => {
                                  const isExcluded = excludedClasses.includes(c);
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      style={[
                                        styles.itemChip,
                                        { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' },
                                        isExcluded && styles.itemChipExcluded,
                                      ]}
                                      onPress={() => toggleExcludeClass(c)}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons
                                        name={isExcluded ? 'close-circle' : 'checkmark-circle'}
                                        size={14}
                                        color={isExcluded ? '#EF4444' : '#7C3AED'}
                                      />
                                      <Text
                                        style={[
                                          styles.itemChipText,
                                          { color: '#6D28D9' },
                                          isExcluded && styles.itemChipTextExcluded,
                                        ]}
                                      >
                                        {c}
                                      </Text>
                                      {isExcluded && <Text style={styles.excludedBadgeText}>(Pasif)</Text>}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
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
                                  📚 Ders Havuzu ({activeLessonsCount}/{parsedSchedule.lessons.length} Aktif)
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
                            <View style={styles.chipsWrapper}>
                              <View style={styles.chipActionsBar}>
                                <Text style={styles.chipHelpText}>
                                  💡 Okul ders havuzuna eklenmesini istemediğiniz derslere dokunarak pasif yapabilirsiniz:
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                  <TouchableOpacity
                                    onPress={() => setAllLessonsExcluded(false)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Aktif Et</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setAllLessonsExcluded(true)}
                                    style={styles.chipQuickBtn}
                                  >
                                    <Text style={styles.chipQuickBtnText}>Tümünü Bırak</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              <View style={styles.chipsContainer}>
                                {parsedSchedule.lessons.map((l, idx) => {
                                  const isExcluded = excludedLessons.includes(l);
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      style={[
                                        styles.itemChip,
                                        { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                                        isExcluded && styles.itemChipExcluded,
                                      ]}
                                      onPress={() => toggleExcludeLesson(l)}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons
                                        name={isExcluded ? 'close-circle' : 'checkmark-circle'}
                                        size={14}
                                        color={isExcluded ? '#EF4444' : '#059669'}
                                      />
                                      <Text
                                        style={[
                                          styles.itemChipText,
                                          { color: '#047857' },
                                          isExcluded && styles.itemChipTextExcluded,
                                        ]}
                                      >
                                        {l}
                                      </Text>
                                      {isExcluded && <Text style={styles.excludedBadgeText}>(Pasif)</Text>}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
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
                                  📅 Haftalık Ders Programı ({activeScheduleItemsCount}/{parsedSchedule.scheduleItems.length} Ders Saati Aktif)
                                </Text>
                                <Text style={styles.scheduleCheckboxSub}>
                                  Haftalık gün ve saat bazında tüm ders eşleştirmelerini yazar.
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </>
                  );
                })()}

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

                          {/* Giriş Bilgileri Önizleme */}
                          <View style={styles.cardCredPreviewBox}>
                            <View style={styles.cardCredItem}>
                              <Ionicons name="key" size={11} color="#4F46E5" />
                              <Text style={styles.cardCredLabel}>Şifre:</Text>
                              <Text style={styles.cardCredValue}>aaaa_{student.studentNumber}</Text>
                            </View>
                            <View style={styles.cardCredDivider} />
                            <View style={styles.cardCredItem}>
                              <Ionicons name="school" size={11} color="#059669" />
                              <Text style={styles.cardCredLabel}>Okul:</Text>
                              <Text style={styles.cardCredValue}>{selectedSchool?.code || '-'}</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Aksiyon Butonları */}
                      <View style={styles.studentActionsRow}>
                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#818CF8', backgroundColor: '#EEF2FF' }]}
                          onPress={() => handleOpenCredentialsModal(student)}
                        >
                          <Ionicons name="key" size={13} color="#4F46E5" />
                          <Text style={[styles.cardActionBtnText, { color: '#4F46E5', fontWeight: '700' }]}>Giriş & Şifre</Text>
                        </TouchableOpacity>

                        {student.parentPhone && (
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                            onPress={() => handleShareViaWhatsApp(student)}
                          >
                            <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                            <Text style={[styles.cardActionBtnText, { color: '#16A34A', fontWeight: '600' }]}>WhatsApp</Text>
                          </TouchableOpacity>
                        )}

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

                {/* Yapay Zeka Gerekçesi (Varsa) */}
                {docAnalysis.aiReason ? (
                  <View style={styles.mappingAiReasonCard}>
                    <Ionicons name="sparkles" size={16} color="#7C3AED" />
                    <Text style={styles.mappingAiReasonText}>
                      {docAnalysis.aiReason}
                    </Text>
                  </View>
                ) : null}

                {/* Sütun Eşleştirme Kartları */}
                <View style={styles.mappingCard}>
                  <Text style={styles.mappingFieldTitle}>🎯 Konu Sütunu (Zorunlu):</Text>
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
                  {selectedMapping.topicColIndex !== null && docAnalysis.columns[selectedMapping.topicColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.topicColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
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
                  {selectedMapping.outcomesColIndex !== null && docAnalysis.columns[selectedMapping.outcomesColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.outcomesColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
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
                  {selectedMapping.dateColIndex !== null && docAnalysis.columns[selectedMapping.dateColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.dateColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
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
                  {selectedMapping.weekColIndex !== null && docAnalysis.columns[selectedMapping.weekColIndex]?.sampleValues[0] && (
                    <Text style={styles.mappingSampleText} numberOfLines={1}>
                      Örnek Değer: "{docAnalysis.columns[selectedMapping.weekColIndex]?.sampleValues[0]}"
                    </Text>
                  )}
                </View>

                {/* Şablon İndirme Kısayolu */}
                <TouchableOpacity
                  style={styles.mappingTemplateDownloadBtn}
                  onPress={() => handleDownloadYearlyPlanTemplate(selectedLessonForPlan?.name, selectedLessonForPlan?.grade)}
                >
                  <Ionicons name="download-outline" size={14} color="#0284C7" />
                  <Text style={styles.mappingTemplateDownloadText}>
                    Bu ders için standart Excel şablonu indir
                  </Text>
                </TouchableOpacity>

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

      {/* 3.3 Yüklü Yıllık Planı İnceleme Modalı */}
      <Modal visible={viewPlanModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%', height: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalTitle}>📖 Yıllık Müfredat Planı</Text>
                  <View style={styles.planCountBadge}>
                    <Text style={styles.planCountBadgeText}>{viewPlanItems.length} Hafta</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {selectedLessonForViewPlan?.name} • {selectedLessonForViewPlan?.grade ? `${selectedLessonForViewPlan.grade}. Sınıf` : 'Tüm Kademeler'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewPlanModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Arama & Hızlı Aksiyon Barı */}
            <View style={styles.planActionBar}>
              <View style={styles.planSearchInputWrap}>
                <Ionicons name="search" size={16} color="#64748B" />
                <TextInput
                  style={styles.planSearchInput}
                  placeholder="Hafta, konu veya kazanım ara..."
                  value={planSearch}
                  onChangeText={setPlanSearch}
                />
                {!!planSearch && (
                  <TouchableOpacity onPress={() => setPlanSearch('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={[styles.planActionMiniBtn, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                  onPress={() => handleDownloadYearlyPlanTemplate(selectedLessonForViewPlan?.name, selectedLessonForViewPlan?.grade)}
                >
                  <Ionicons name="download-outline" size={13} color="#0284C7" />
                  <Text style={[styles.planActionMiniText, { color: '#0284C7' }]}>Şablon İndir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.planActionMiniBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                  onPress={() => {
                    setViewPlanModalVisible(false);
                    handlePickYearlyPlanFile(selectedLessonForViewPlan);
                  }}
                >
                  <Ionicons name="cloud-upload-outline" size={13} color="#16A34A" />
                  <Text style={[styles.planActionMiniText, { color: '#16A34A' }]}>Planı Güncelle</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.planActionMiniBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                  onPress={() => handleDeleteYearlyPlan(selectedLessonForViewPlan)}
                  disabled={deletingPlan}
                >
                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                  <Text style={[styles.planActionMiniText, { color: '#DC2626' }]}>Planı Sil</Text>
                </TouchableOpacity>
              </View>
            </View>

            {loadingViewPlan ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 10, fontSize: 13, color: '#64748B' }}>Yıllık plan satırları yükleniyor...</Text>
              </View>
            ) : (() => {
              const q = planSearch.trim().toLowerCase();
              const filtered = viewPlanItems.filter((item) => {
                if (!q) return true;
                const matchWeek = String(item.weekNumber).includes(q);
                const matchSubject = (item.subject || '').toLowerCase().includes(q);
                const matchOutcomes = (item.learningOutcomes || '').toLowerCase().includes(q);
                return matchWeek || matchSubject || matchOutcomes;
              });

              if (filtered.length === 0) {
                return (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Ionicons name="document-text-outline" size={40} color="#94A3B8" />
                    <Text style={{ marginTop: 10, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                      {viewPlanItems.length === 0 ? 'Bu derse ait henüz yıllık plan yüklenmedi.' : 'Aramaya uygun plan satırı bulunamadı.'}
                    </Text>
                  </View>
                );
              }

              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  {filtered.map((item, idx) => (
                    <View key={item.id || idx} style={styles.planRowCard}>
                      <View style={styles.planRowCardHeader}>
                        <View style={styles.planWeekBadge}>
                          <Text style={styles.planWeekBadgeText}>{item.weekNumber}. Hafta</Text>
                        </View>
                        {(item.startDate || item.endDate || item.dateRange) && (
                          <View style={styles.planDateBadge}>
                            <Ionicons name="calendar-outline" size={12} color="#64748B" />
                            <Text style={styles.planDateBadgeText}>
                              {item.dateRange || (item.startDate ? `${new Date(item.startDate).toLocaleDateString('tr-TR')} - ${item.endDate ? new Date(item.endDate).toLocaleDateString('tr-TR') : ''}` : '')}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.planSubjectBox}>
                        <Text style={styles.planSubjectLabel}>📌 Konu (Deftere Yazılacak):</Text>
                        <Text style={styles.planSubjectText}>{item.subject}</Text>
                      </View>

                      {!!item.learningOutcomes && (
                        <View style={styles.planOutcomesBox}>
                          <Text style={styles.planOutcomesLabel}>🎯 Kazanımlar / Açıklamalar:</Text>
                          <Text style={styles.planOutcomesText}>{item.learningOutcomes}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              );
            })()}
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

            {/* Hızlı Aksiyon Butonları (Fotoğraftan AI ile Oku veya Elle Ekle) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 }}>
              <TouchableOpacity
                style={styles.singleTeacherAiBtnMini}
                onPress={() => handlePickSingleTeacherSchedulePhoto(selectedTeacherForSchedule)}
              >
                <Ionicons name="camera" size={14} color="#4F46E5" />
                <Text style={styles.singleTeacherAiBtnMiniText}>📷 Fotoğraftan Güncelle (AI)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.singleTeacherAddBtnMini}
                onPress={() =>
                  handleOpenSlotModal({
                    dayOfWeek: 1,
                    lessonHour: 1,
                    teacherName: selectedTeacherForSchedule?.fullName,
                  })
                }
              >
                <Ionicons name="add-circle" size={14} color="#16A34A" />
                <Text style={styles.singleTeacherAddBtnMiniText}>+ Elle Ders Ekle</Text>
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
                  Bu öğretmen için henüz kayıtlı bir ders programı yok. Çarşafı baştan okutmak yerine doğrudan öğretmenin ders çizelgesi fotoğrafını okutabilir veya elle ders ekleyebilirsiniz.
                </Text>

                <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={styles.slotSaveBtn}
                    onPress={() => handlePickSingleTeacherSchedulePhoto(selectedTeacherForSchedule)}
                  >
                    <Ionicons name="camera" size={16} color="#fff" />
                    <Text style={styles.slotSaveBtnText}>📷 Fotoğraftan Program Oku</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map((day) => {
                  const dayItems = teacherScheduleItems
                    .filter(i => (i.dayName || i.dayOfWeek || '').toLowerCase().includes(day.toLowerCase().slice(0, 3)))
                    .sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0));

                  let dayNum = 1;
                  const dLower = day.toLowerCase();
                  if (dLower.startsWith('sal')) dayNum = 2;
                  else if (dLower.startsWith('çar')) dayNum = 3;
                  else if (dLower.startsWith('per')) dayNum = 4;
                  else if (dLower.startsWith('cum')) dayNum = 5;

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
                          <TouchableOpacity
                            key={idx}
                            style={styles.scheduleItemRowClickable}
                            onPress={() =>
                              handleOpenSlotModal({
                                dayOfWeek: dayNum,
                                lessonHour: item.periodNumber || item.lessonHour || (idx + 1),
                                teacherName: selectedTeacherForSchedule?.fullName,
                                existingItem: item,
                              })
                            }
                            activeOpacity={0.7}
                          >
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
                            <Ionicons name="pencil" size={14} color="#6366F1" style={{ marginLeft: 6 }} />
                          </TouchableOpacity>
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

      {/* 1.6 Hücre Slot Düzenleme Modalı */}
      <Modal visible={slotModalVisible} animationType="slide" transparent>
        <View style={styles.topDownOverlay}>
          <View style={[styles.topDownCard, { maxHeight: '90%' }]}>
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topDownTitle}>
                  {editingSlotData?.id ? '✏️ Ders Saatini Düzenle' : '➕ Yeni Ders Saati Ata'}
                </Text>
                <Text style={styles.topDownSub}>
                  {editingSlotData ? `${['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'][editingSlotData.dayOfWeek - 1] || `${editingSlotData.dayOfWeek}. Gün`} - ${editingSlotData.lessonHour}. Ders Saati` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topDownCloseBtn}
                onPress={() => setSlotModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              {/* Gün ve Saat Seçimi */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotModalLabel}>Haftanın Günü</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {['Pzt', 'Sal', 'Çar', 'Per', 'Cum'].map((dName, dIdx) => (
                      <TouchableOpacity
                        key={dName}
                        style={[styles.slotDayChip, editingSlotData?.dayOfWeek === dIdx + 1 && styles.slotDayChipActive]}
                        onPress={() => setEditingSlotData(prev => prev ? { ...prev, dayOfWeek: dIdx + 1 } : null)}
                      >
                        <Text style={[styles.slotDayChipText, editingSlotData?.dayOfWeek === dIdx + 1 && styles.slotDayChipTextActive]}>
                          {dName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={{ width: 100 }}>
                  <Text style={styles.slotModalLabel}>Ders Saati</Text>
                  <TextInput
                    style={styles.slotModalInput}
                    value={String(editingSlotData?.lessonHour || 1)}
                    keyboardType="number-pad"
                    onChangeText={(val) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num > 0) {
                        setEditingSlotData(prev => prev ? { ...prev, lessonHour: num } : null);
                      }
                    }}
                  />
                </View>
              </View>

              {/* Sınıf / Şube */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.slotModalLabel}>Şube Seçimi (Kademe & Şube)</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TextInput
                    style={[styles.slotModalInput, { flex: 1 }]}
                    placeholder="Kademe (örn: 9)"
                    value={editingSlotData?.grade || ''}
                    onChangeText={(val) => setEditingSlotData(prev => prev ? { ...prev, grade: val } : null)}
                  />
                  <TextInput
                    style={[styles.slotModalInput, { flex: 1 }]}
                    placeholder="Şube (örn: A)"
                    autoCapitalize="characters"
                    value={editingSlotData?.section || ''}
                    onChangeText={(val) => setEditingSlotData(prev => prev ? { ...prev, section: val.toUpperCase() } : null)}
                  />
                </View>
                {/* Hızlı Şube Seçici */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {classes.map((cls) => {
                    const isSel = editingSlotData?.grade === String(cls.grade) && editingSlotData?.section === cls.section;
                    return (
                      <TouchableOpacity
                        key={cls.id}
                        style={[styles.slotQuickChip, isSel && styles.slotQuickChipActive]}
                        onPress={() => setEditingSlotData(prev => prev ? { ...prev, grade: String(cls.grade), section: cls.section } : null)}
                      >
                        <Text style={[styles.slotQuickChipText, isSel && styles.slotQuickChipTextActive]}>
                          {cls.grade}-{cls.section}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Ders Adı */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.slotModalLabel}>Ders Adı</Text>
                <TextInput
                  style={[styles.slotModalInput, { marginTop: 4 }]}
                  placeholder="Ders adı yazın (örn: Matematik, Fizik...)"
                  value={editingSlotData?.lessonName || ''}
                  onChangeText={(val) => setEditingSlotData(prev => prev ? { ...prev, lessonName: val } : null)}
                />
                {/* Hızlı Ders Seçici */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {lessons.map((lsn) => {
                    const isSel = (editingSlotData?.lessonName || '').toLowerCase() === (lsn.name || '').toLowerCase();
                    return (
                      <TouchableOpacity
                        key={lsn.id}
                        style={[styles.slotQuickChip, isSel && styles.slotQuickChipActive]}
                        onPress={() => setEditingSlotData(prev => prev ? { ...prev, lessonName: lsn.name } : null)}
                      >
                        <Text style={[styles.slotQuickChipText, isSel && styles.slotQuickChipTextActive]}>
                          {lsn.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Öğretmen */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.slotModalLabel}>Öğretmen Adı Soyadı</Text>
                <TextInput
                  style={[styles.slotModalInput, { marginTop: 4 }]}
                  placeholder="Öğretmen adı yazın"
                  value={editingSlotData?.teacherName || ''}
                  onChangeText={(val) => setEditingSlotData(prev => prev ? { ...prev, teacherName: val } : null)}
                />
                {/* Hızlı Öğretmen Seçici */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {teachers.map((tch) => {
                    const isSel = (editingSlotData?.teacherName || '').toLowerCase() === (tch.fullName || '').toLowerCase();
                    return (
                      <TouchableOpacity
                        key={tch.id}
                        style={[styles.slotQuickChip, isSel && styles.slotQuickChipActive]}
                        onPress={() => setEditingSlotData(prev => prev ? { ...prev, teacherName: tch.fullName } : null)}
                      >
                        <Text style={[styles.slotQuickChipText, isSel && styles.slotQuickChipTextActive]}>
                          {tch.fullName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Derslik / Oda (Opsiyonel) */}
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.slotModalLabel}>Derslik / Sınıf Odası (İsteğe Bağlı)</Text>
                <TextInput
                  style={[styles.slotModalInput, { marginTop: 4 }]}
                  placeholder="örn: Lab 1, Spor Salonu, 204..."
                  value={editingSlotData?.classroom || ''}
                  onChangeText={(val) => setEditingSlotData(prev => prev ? { ...prev, classroom: val } : null)}
                />
              </View>

              {/* Kaydet ve Sil Butonları */}
              <View style={{ gap: 10, marginBottom: 20 }}>
                <TouchableOpacity
                  style={styles.slotSaveBtn}
                  onPress={handleSaveSlot}
                  disabled={savingSlot}
                >
                  {savingSlot ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.slotSaveBtnText}>Değişiklikleri Kaydet</Text>
                    </>
                  )}
                </TouchableOpacity>

                {editingSlotData?.id && (
                  <TouchableOpacity
                    style={styles.slotDeleteBtn}
                    onPress={handleDeleteSlot}
                    disabled={savingSlot}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={styles.slotDeleteBtnText}>Bu Saati Programdan Kaldır (Boşalt)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 1.7 Tek Bir Öğretmenin Programını Fotoğrafla Okuma & Onay Modalı */}
      <Modal visible={singleTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.topDownOverlay}>
          <View style={[styles.topDownCard, { maxHeight: '92%' }]}>
            <View style={styles.topDownHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topDownTitle}>
                  📷 Öğretmen Programı (AI Önizleme)
                </Text>
                <Text style={styles.topDownSub}>
                  {singleTeacherPreview?.teacherName || 'Öğretmen programı inceleniyor...'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.topDownCloseBtn}
                onPress={() => {
                  setSingleTeacherModalVisible(false);
                  setSingleTeacherPreview(null);
                }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {singleTeacherParsing ? (
              <View style={{ paddingVertical: 50, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: '#1E293B' }}>
                  Yapay Zeka Programı Çözümlüyor...
                </Text>
                <Text style={{ marginTop: 6, fontSize: 13, color: '#64748B', textAlign: 'center', paddingHorizontal: 20 }}>
                  Fotoğraftaki haftalık ders saatleri, şubeler ve branşlar tespit ediliyor. Lütfen bekleyin.
                </Text>
              </View>
            ) : singleTeacherPreview ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
                <View style={styles.singleTeacherAlert}>
                  <Ionicons name="information-circle" size={20} color="#4F46E5" />
                  <Text style={styles.singleTeacherAlertText}>
                    Bu işlem sadece <Text style={{ fontWeight: '800' }}>{singleTeacherPreview.teacherName}</Text> öğretmeninin haftalık programını günceller. Okulun diğer öğretmenlerinin ve şubelerinin programı aynen korunur.
                  </Text>
                </View>

                <View style={styles.singleTeacherStatsRow}>
                  <View style={styles.singleTeacherStatBox}>
                    <Text style={styles.singleTeacherStatVal}>{singleTeacherPreview.items?.length || 0}</Text>
                    <Text style={styles.singleTeacherStatLbl}>Toplam Ders Saati</Text>
                  </View>
                  <View style={styles.singleTeacherStatBox}>
                    <Text style={styles.singleTeacherStatVal}>
                      {Array.from(new Set(singleTeacherPreview.items?.map((i: any) => `${i.grade}-${i.section}`))).length}
                    </Text>
                    <Text style={styles.singleTeacherStatLbl}>Farklı Şube</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginVertical: 8 }}>
                  Tespit Edilen Ders Saatleri:
                </Text>

                {singleTeacherPreview.items?.map((slot: any, sIdx: number) => {
                  const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
                  return (
                    <View key={sIdx} style={styles.singleTeacherItemCard}>
                      <View style={styles.singleTeacherDayBadge}>
                        <Text style={styles.singleTeacherDayText}>
                          {dayNames[slot.dayOfWeek] || `${slot.dayOfWeek}. Gün`}
                        </Text>
                        <Text style={styles.singleTeacherHourText}>
                          {slot.lessonHour}. Ders
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.singleTeacherLessonName}>{slot.lessonName}</Text>
                        <Text style={styles.singleTeacherClassName}>
                          🏫 {slot.grade}-{slot.section}
                          {slot.classroom ? ` • Derslik: ${slot.classroom}` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                <View style={{ gap: 10, marginTop: 16, marginBottom: 24 }}>
                  <TouchableOpacity
                    style={styles.slotSaveBtn}
                    onPress={handleSaveSingleTeacherSchedule}
                    disabled={savingSingleTeacher}
                  >
                    {savingSingleTeacher ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={18} color="#fff" />
                        <Text style={styles.slotSaveBtnText}>Onayla ve Programa Aktar</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.slotCancelBtn}
                    onPress={() => {
                      setSingleTeacherModalVisible(false);
                      setSingleTeacherPreview(null);
                    }}
                  >
                    <Text style={styles.slotCancelBtnText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
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
  chipsWrapper: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chipActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chipHelpText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  chipQuickBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipQuickBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  itemChipExcluded: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    opacity: 0.7,
  },
  itemChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  itemChipTextExcluded: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  excludedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF4444',
    marginLeft: 2,
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
  cardCredPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignSelf: 'flex-start',
  },
  cardCredItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardCredLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  cardCredValue: {
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '700',
  },
  cardCredDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 8,
  },
  credStudentCardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  credAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  credAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  credStudentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  credStudentSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 1,
    fontWeight: '600',
  },
  credSectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  credSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  credSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  credDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  credFieldLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  credFieldValueBold: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '800',
    marginTop: 1,
  },
  credFieldHint: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  credCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  credCopyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  credIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  credParentInfoText: {
    fontSize: 12,
    color: '#1E293B',
    marginBottom: 4,
  },
  credShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  credShareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  credResetHelpText: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
    marginBottom: 10,
  },
  credResetDefaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  credResetDefaultBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  credCustomPassSaveBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  credCustomPassSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
  },
  roleStaffBadge: {
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
  },
  roleTeacherBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  roleStaffBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  roleTeacherBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  permissionChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  permissionMiniChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  permissionMiniChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  segmentedRoleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentedRoleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  segmentedRoleBtnActiveTeacher: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  segmentedRoleBtnActiveStaff: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  segmentedRoleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentedRoleTextActiveTeacher: {
    color: '#0284C7',
  },
  segmentedRoleTextActiveStaff: {
    color: '#7C3AED',
  },
  roleExplainBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  roleExplainText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  permissionSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 14,
    marginBottom: 6,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  permissionLabelWrap: {
    flex: 1,
    marginRight: 10,
  },
  permissionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  permissionSublabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  classesChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  classSelectChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  classSelectChipActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  classSelectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  classSelectChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },

  // Yıllık Plan İnceleme ve AI Eşleştirme Stilleri
  mappingAiReasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAF5FF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    marginBottom: 10,
  },
  mappingAiReasonText: {
    flex: 1,
    fontSize: 11,
    color: '#6B21A8',
    lineHeight: 16,
    fontWeight: '600',
  },
  mappingSampleText: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 2,
    marginLeft: 2,
  },
  mappingTemplateDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginTop: 10,
    marginBottom: 4,
  },
  mappingTemplateDownloadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  planCountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  planCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  planActionBar: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  planSearchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  planSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 0,
  },
  planActionMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  planActionMiniText: {
    fontSize: 11,
    fontWeight: '700',
  },
  planRowCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  planRowCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  planWeekBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  planWeekBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  planDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  planDateBadgeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  planSubjectBox: {
    marginTop: 4,
  },
  planSubjectLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  planSubjectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  planOutcomesBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  planOutcomesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  planOutcomesText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },

  // --- 8. RAPORLAMA VE EXCEL MERKEZİ STİLLERİ ---
  reportsContainer: {
    paddingBottom: 24,
  },
  reportHeroCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    marginBottom: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  reportHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportHeroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  reportHeroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  reportHeroSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 17,
  },
  reportHeroStatsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  reportHeroStatItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reportHeroStatVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  reportHeroStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  masterExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4338CA',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    gap: 12,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  masterExportBtnTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  masterExportBtnSub: {
    color: '#E0E7FF',
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  reportSectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  reportCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  reportIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  reportCardDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  reportFilterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  reportFilterChipScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
    marginBottom: 10,
  },
  reportFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reportFilterChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  reportFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  reportFilterChipTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  reportFilterRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  reportSegmentRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  reportSegmentBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  reportSegmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  reportSegmentText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  reportSegmentTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  reportSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
    marginBottom: 6,
  },
  reportSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  exportActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 42,
    gap: 8,
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  exportActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  // --- 🛡️ GÜVENLİK VE GİRİŞ TAKİP STİLLERİ ---
  securityCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 14,
    marginBottom: 14,
  },
  securityCardHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  securityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
  },
  securitySub: {
    fontSize: 11,
    color: '#115E59',
    marginTop: 2,
    lineHeight: 15,
  },
  securityGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  securityStatBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  securityStatVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  securityStatLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  securityFilterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  securityFilterBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#E6FFFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
  },
  securityFilterBtnActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0F766E',
  },
  securityFilterText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  securityFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  loginStatusBadgeGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#CCFBF1',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  loginStatusTextGreen: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  loginStatusBadgeGray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  loginStatusTextGray: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },

  // --- 📊 PROGRAM SAĞLAMLIK & SANITY CHECK STİLLERİ ---
  sanityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sanityCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sanityHeaderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sanityCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  sanityCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  sanityRefreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sanityGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sanityBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  sanityBoxVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4F46E5',
  },
  sanityBoxLbl: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 3,
    textAlign: 'center',
  },
  sanityBoxSub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  sanityProgressWrap: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  sanityProgressBar: {
    height: '100%',
    borderRadius: 4,
  },
  conflictAlertBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  conflictAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
    flex: 1,
  },
  conflictItemBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  conflictItemType: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
  },
  conflictItemDesc: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
  },
  conflictClearBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  conflictClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    flex: 1,
  },
  classFullnessHeaderLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },
  classFullnessScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  classFullnessBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  classFullnessBadgeFull: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  classFullnessBadgeMissing: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  classFullnessBadgeSelected: {
    borderWidth: 2,
    borderColor: '#4F46E5',
    transform: [{ scale: 1.03 }],
  },
  classFullnessBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  classFullnessBadgeSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },

  // --- ✏️ CANLI DERS PROGRAMI DÜZENLEYİCİ STİLLERİ ---
  interactiveEditorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  interactiveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  interactiveTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  interactiveSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  editorModeSegment: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
    marginBottom: 12,
  },
  editorModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editorModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  editorModeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  editorModeBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  editorSelectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  editorChipsScroll: {
    gap: 6,
    paddingBottom: 4,
  },
  editorChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  editorChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  editorChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  editorChipTextActive: {
    color: '#4F46E5',
    fontWeight: '900',
  },
  timetableWrap: {
    gap: 12,
    marginTop: 6,
  },
  timetableDayBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  timetableDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 4,
  },
  timetableDayTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  timetableHoursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  slotCell: {
    width: '23.5%',
    minHeight: 70,
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  slotCellFilled: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  slotCellEmpty: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  slotCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotHourBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  slotHourBadgeFilled: {
    backgroundColor: '#E0E7FF',
  },
  slotHourText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  slotHourTextFilled: {
    color: '#4F46E5',
  },
  slotContentBox: {
    marginTop: 2,
  },
  slotLessonTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
  },
  slotSubDetail: {
    fontSize: 9,
    fontWeight: '600',
    color: '#4F46E5',
    marginTop: 1,
  },
  slotRoomText: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 1,
  },
  slotEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  slotEmptyText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // --- 📷 TEK ÖĞRETMEN VE HÜCRE DÜZENLEME MODAL STİLLERİ ---
  singleTeacherAiBtnMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  singleTeacherAiBtnMiniText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  singleTeacherAddBtnMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  singleTeacherAddBtnMiniText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  scheduleItemRowClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slotModalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  slotModalInput: {
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
  },
  slotDayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  slotDayChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  slotDayChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  slotDayChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  slotQuickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  slotQuickChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  slotQuickChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  slotQuickChipTextActive: {
    color: '#4F46E5',
    fontWeight: '900',
  },
  slotSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 44,
  },
  slotSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  slotDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    height: 40,
  },
  slotDeleteBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  slotCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  slotCancelBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  singleTeacherAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 12,
  },
  singleTeacherAlertText: {
    fontSize: 11,
    color: '#312E81',
    flex: 1,
    lineHeight: 16,
  },
  singleTeacherStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  singleTeacherStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  singleTeacherStatVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4F46E5',
  },
  singleTeacherStatLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  singleTeacherItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  singleTeacherDayBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    width: 75,
  },
  singleTeacherDayText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  singleTeacherHourText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6366F1',
    marginTop: 1,
  },
  singleTeacherLessonName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  singleTeacherClassName: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  preOptFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  preOptFileName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  preOptFileDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  preOptSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },
  preOptPresetsRow: {
    flexDirection: 'column',
    gap: 6,
    marginBottom: 8,
  },
  preOptPresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  preOptPresetBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  preOptPresetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  preOptPresetBtnTextActive: {
    color: '#FFFFFF',
  },
  preOptItemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  preOptItemCardChecked: {
    borderColor: '#4F46E5',
    backgroundColor: '#F8FAFC',
  },
  preOptItemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  preOptBadgeSpeed: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  preOptItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 15,
  },
  preOptSystemStatusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginTop: 8,
  },
  preOptSystemStatusTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  preOptSystemStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
    marginTop: 2,
  },
  preOptWarningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 4,
  },
  preOptActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  preOptCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preOptCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  preOptSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  preOptSubmitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

