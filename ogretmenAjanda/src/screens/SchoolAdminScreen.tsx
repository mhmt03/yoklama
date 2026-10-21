import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
import {
  parseMasterScheduleWithAi,
  saveMasterScheduleToServer,
  ParsedScheduleResult,
  TeacherScheduleVerification,
  readUriAsBase64,
  ScheduleBatchItem,
  mergeScheduleBatches,
  saveScheduleBatchesToStorage,
  loadScheduleBatchesFromStorage,
  clearScheduleBatchesFromStorage,
  saveCachedScheduleFile,
  loadCachedScheduleFile,
  clearCachedScheduleFile,
  saveParsedScheduleDraft,
  loadParsedScheduleDraft,
  clearParsedScheduleDraft,
  CachedScheduleDocInfo,
} from '../services/aiScheduleParser';
import {
  inspectExcelWorkbook,
  parseInitialExcelSchedule,
  ExcelInspectionResult,
} from '../services/excelScheduleParser';
import { countPdfPages } from '../utils/pdfSliceService';
import { extractStudentPhotosWithAi } from '../services/aiStudentPhotoExtractor';
import { parseStudentsFromExcel, saveParsedStudentsToServer, ParsedExcelStudent, generateStudentTemplateExcel } from '../services/excelStudentParser';
import { parseStudentsFromExcelWithAi, AiStudentParseResult } from '../services/aiStudentExcelParser';
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
  exportTeacherCredentialsReport,
  exportStudentCredentialsReport,
  exportParentCredentialsReport,
} from '../services/adminReportService';
import {
  parseSingleTeacherScheduleWithAi,
  saveTeacherScheduleToServer,
  saveSingleScheduleItemToServer,
  deleteSingleScheduleItemFromServer,
  fetchScheduleIntegrityStats,
  SingleTeacherScheduleItem,
} from '../services/singleTeacherScheduleParser';
import { getActiveSchool, updateSchool, deleteSchool, getSchools } from '../database/operations/schoolOperations';
import { setActiveUserRole, logoutUserRole } from '../utils/roleService';
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
import { extractPhotosFromPdf } from '../utils/pdfPhotoExtractor';

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
  const [lessonGradeFilter, setLessonGradeFilter] = useState<'all' | '9' | '10' | '11' | '12' | 'common'>('all');
  const [lessonSearchQuery, setLessonSearchQuery] = useState('');
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
  const [modelDropdownModalVisible, setModelDropdownModalVisible] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
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

  // Menü, Lisans ve Okul Seçim Modalları State
  const [menuDrawerVisible, setMenuDrawerVisible] = useState(false);
  const [licenseModalVisible, setLicenseModalVisible] = useState(false);
  const [schoolSelectModalVisible, setSchoolSelectModalVisible] = useState(false);

  // Okul Düzenleme Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSchoolObj, setEditingSchoolObj] = useState<any>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editSchoolPhone, setEditSchoolPhone] = useState('');
  const [editSchoolAddress, setEditSchoolAddress] = useState('');
  const [editSchoolApiKey, setEditSchoolApiKey] = useState('');
  const [editSchoolModel, setEditSchoolModel] = useState('');
  const [editSchoolDailyHours, setEditSchoolDailyHours] = useState('8');
  const [updatingSchool, setUpdatingSchool] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);

  // Okul Ekleme Modal State
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolPhone, setNewSchoolPhone] = useState('');
  const [newSchoolApiKey, setNewSchoolApiKey] = useState('');
  const [newSchoolDailyHours, setNewSchoolDailyHours] = useState('8');

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
  const [optAutoHealBlocks, setOptAutoHealBlocks] = useState(false); // İsteğe bağlı: Parçalı yüklemede varsayılan kapalı!

  // PDF Sayfa Bölme / Aralığı State
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(0);
  const [pdfPageRangeMode, setPdfPageRangeMode] = useState<'all' | 'half1' | 'half2' | 'custom'>('all');
  const [pdfStartPage, setPdfStartPage] = useState<string>('1');
  const [pdfEndPage, setPdfEndPage] = useState<string>('1');
  const [countingPdfPages, setCountingPdfPages] = useState<boolean>(false);

  // Excel Çarşaf Ön İnceleme ve Yükleme State
  const [excelPreviewModalVisible, setExcelPreviewModalVisible] = useState<boolean>(false);
  const [excelInspection, setExcelInspection] = useState<ExcelInspectionResult | null>(null);
  const [selectedExcelSheet, setSelectedExcelSheet] = useState<string>('');

  // 1.8 Detaylı Program Dağılımı & İstatistik Görünüm State
  const [scheduleSubView, setScheduleSubView] = useState<'editor' | 'analytics'>('editor');
  const [conflictSearchQuery, setConflictSearchQuery] = useState('');
  const [analyticsSearchQuery, setAnalyticsSearchQuery] = useState('');
  const [analyticsFilterType, setAnalyticsFilterType] = useState<'all' | 'conflicts' | 'missing' | 'teachers' | 'courses'>('all');

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

  // Çarşaf Parça Havuzu State (Büyük PDF'lerin parçalar halinde depolanması ve birleştirilmesi)
  const [scheduleBatches, setScheduleBatches] = useState<ScheduleBatchItem[]>([]);
  const [batchPoolModalVisible, setBatchPoolModalVisible] = useState(false);
  const [lastAnalyzedPageRange, setLastAnalyzedPageRange] = useState<{ start: number; end: number } | undefined>(undefined);
  const [cachedScheduleDoc, setCachedScheduleDoc] = useState<CachedScheduleDocInfo | null>(null);
  const [cachedScheduleDraft, setCachedScheduleDraft] = useState<ParsedScheduleResult | null>(null);
  const [reScanningTeacher, setReScanningTeacher] = useState(false);
  const [teacherRescanHint, setTeacherRescanHint] = useState('');

  const loadSchoolBatches = async (schoolId: string) => {
    try {
      const batches = await loadScheduleBatchesFromStorage(schoolId);
      setScheduleBatches(batches);
      const cachedDoc = await loadCachedScheduleFile(schoolId);
      setCachedScheduleDoc(cachedDoc);
      const draft = await loadParsedScheduleDraft(schoolId);
      setCachedScheduleDraft(draft);
    } catch (e) {
      console.warn('[Çarşaf Havuz] Yükleme hatası:', e);
    }
  };

  const handleAddCurrentToBatches = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    const pageRangeInfo = lastAnalyzedPageRange
      ? `Sayfa ${lastAnalyzedPageRange.start}-${lastAnalyzedPageRange.end}`
      : (pdfTotalPages > 1 && pdfPageRangeMode !== 'all' ? `Sayfa ${pdfStartPage}-${pdfEndPage}` : 'Tüm Belge');
    const batchName = pendingScheduleFile?.name
      ? `${pendingScheduleFile.name} (${pageRangeInfo})`
      : `Parça ${scheduleBatches.length + 1} (${pageRangeInfo})`;

    const newBatch: ScheduleBatchItem = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: batchName,
      createdAt: Date.now(),
      pageRangeText: lastAnalyzedPageRange ? `${lastAnalyzedPageRange.start}-${lastAnalyzedPageRange.end}` : undefined,
      data: parsedSchedule,
    };

    const updated = [...scheduleBatches, newBatch];
    setScheduleBatches(updated);
    await saveScheduleBatchesToStorage(selectedSchool.id, updated);
    Alert.alert(
      'Havuza Eklendi 📥',
      `"${batchName}" başarıyla depolandı.\n\n` +
      `Şu anda havuzda toplam ${updated.length} parça var (${updated.reduce((sum, b) => sum + (b.data?.teachers?.length || 0), 0)} öğretmen girdisi).\n\n` +
      `İsterseniz diğer PDF parçasını da analiz edip ekleyebilir, ardından "Tüm Parçaları Birleştir" seçeneğiyle tek bir kurulum yapabilirsiniz.`
    );
  };

  const handleMergeAllBatches = () => {
    if (scheduleBatches.length === 0) {
      Alert.alert('Havuz Boş', 'Henüz depolanmış bir çarşaf parça bulunmuyor.');
      return;
    }
    const merged = mergeScheduleBatches(scheduleBatches);
    setParsedSchedule(merged);
    setAiModalVisible(true);
    setBatchPoolModalVisible(false);
    Alert.alert(
      'Parçalar Birleştirildi 🧩',
      `Havuzdaki ${scheduleBatches.length} parçanın tüm ham verileri birleştirildi:\n\n` +
      `• Öğretmenler: ${merged.teachers.length}\n` +
      `• Şubeler: ${merged.classes.length}\n` +
      `• Dersler: ${merged.lessons.length}\n` +
      `• Toplam Ders Saati: ${merged.scheduleItems.length}\n\n` +
      `Verileri inceleyip tek seferde sisteme kaydedebilirsiniz.`
    );
  };

  const handleRemoveBatch = async (batchId: string) => {
    if (!selectedSchool) return;
    const updated = scheduleBatches.filter(b => b.id !== batchId);
    setScheduleBatches(updated);
    await saveScheduleBatchesToStorage(selectedSchool.id, updated);
  };

  const handleClearAllBatches = async () => {
    if (!selectedSchool) return;
    Alert.alert('Havuzu Temizle', 'Depolanan tüm çarşaf parçaları silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Evet, Temizle',
        style: 'destructive',
        onPress: async () => {
          setScheduleBatches([]);
          await clearScheduleBatchesFromStorage(selectedSchool.id);
        },
      },
    ]);
  };

  // Çarşaf AI Öğretmen Programı İnceleme & Elle Tamamlama Modalı State & Handlers
  const [inspectTeacherModalVisible, setInspectTeacherModalVisible] = useState(false);
  const [inspectingTeacher, setInspectingTeacher] = useState<string>('');
  const [inspectingVerification, setInspectingVerification] = useState<TeacherScheduleVerification | null>(null);
  const [inspectingItems, setInspectingItems] = useState<Array<{
    teacherName: string;
    grade: string;
    section: string;
    lessonName: string;
    lessonCode?: string;
    dayOfWeek: number;
    lessonHour: number;
    classroom?: string;
  }>>([]);
  const [inspectDayTab, setInspectDayTab] = useState<number>(1); // 1: Pazartesi ... 5: Cuma
  const [editingExpectedHours, setEditingExpectedHours] = useState(false);
  const [tempExpectedHours, setTempExpectedHours] = useState('');
  const [editingCellSlot, setEditingCellSlot] = useState<{
    originDayOfWeek?: number;
    originLessonHour?: number;
    dayOfWeek: number;
    lessonHour: number;
    grade: string;
    section: string;
    lessonName: string;
  } | null>(null);

  const handleOpenTeacherScheduleInspector = (teacherName: string) => {
    if (!parsedSchedule) return;
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const verif = (parsedSchedule.teacherVerifications || []).find(v => norm(v.teacherName) === norm(teacherName)) || null;
    const items = (parsedSchedule.scheduleItems || [])
      .filter(it => norm(it.teacherName) === norm(teacherName))
      .map(it => ({ ...it }));

    setInspectingTeacher(teacherName);
    setInspectingVerification(verif);
    setTempExpectedHours(verif?.expectedWeeklyHours != null ? String(verif.expectedWeeklyHours) : String(items.length));
    setEditingExpectedHours(false);
    setInspectingItems(items);
    setInspectDayTab(1);
    setEditingCellSlot(null);
    setTeacherRescanHint('');
    setInspectTeacherModalVisible(true);
  };

  const handleStartEditCell = (dayOfWeek: number, lessonHour: number) => {
    const existing = inspectingItems.find(it => it.dayOfWeek === dayOfWeek && it.lessonHour === lessonHour);
    if (existing) {
      setEditingCellSlot({
        originDayOfWeek: dayOfWeek,
        originLessonHour: lessonHour,
        dayOfWeek,
        lessonHour,
        grade: existing.grade,
        section: existing.section,
        lessonName: existing.lessonName,
      });
    } else {
      // Öğretmenin alt tablosundaki resmî ders yükünden veya mevcut derslerinden varsayılan seç:
      const firstWl = inspectingVerification?.workloadItems?.[0];
      const defaultCls = firstWl?.className?.replace('/', '-') || (inspectingItems[0] ? `${inspectingItems[0].grade}-${inspectingItems[0].section}` : (parsedSchedule?.classes?.[0] || '9-A'));
      const parts = defaultCls.split('-');
      const defaultLsn = firstWl?.lessonName || firstWl?.lessonCode || inspectingItems[0]?.lessonName || parsedSchedule?.lessons?.[0] || '';
      setEditingCellSlot({
        originDayOfWeek: dayOfWeek,
        originLessonHour: lessonHour,
        dayOfWeek,
        lessonHour,
        grade: parts[0] || '9',
        section: parts[1] || 'A',
        lessonName: defaultLsn,
      });
    }
  };

  const handleSaveCellSlot = () => {
    if (!editingCellSlot) return;
    const { originDayOfWeek, originLessonHour, dayOfWeek, lessonHour, grade, section, lessonName } = editingCellSlot;
    if (!grade.trim() || !section.trim() || !lessonName.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen sınıf, şube ve ders adını doldurunuz.');
      return;
    }

    const origDay = originDayOfWeek ?? dayOfWeek;
    const origHour = originLessonHour ?? lessonHour;

    // 1. Orijinal slottaki dersi kaldır
    let updated = inspectingItems.filter(it => !(it.dayOfWeek === origDay && it.lessonHour === origHour));

    // 2. Hedef saatte daha önceden bir ders varsa üzerine yaz/kaldır
    updated = updated.filter(it => !(it.dayOfWeek === dayOfWeek && it.lessonHour === lessonHour));

    updated.push({
      teacherName: inspectingTeacher,
      grade: grade.trim(),
      section: section.trim().toUpperCase(),
      lessonName: lessonName.trim(),
      dayOfWeek,
      lessonHour,
    });
    setInspectingItems(updated);
    setEditingCellSlot(null);
  };

  const handleDeleteCellSlot = (dayOfWeek: number, lessonHour: number) => {
    const updated = inspectingItems.filter(it => !(it.dayOfWeek === dayOfWeek && it.lessonHour === lessonHour));
    setInspectingItems(updated);
  };

  const handleShiftLessonHour = (dayOfWeek: number, fromHour: number, toHour: number) => {
    setInspectingItems(prev => {
      const fromItem = prev.find(it => it.dayOfWeek === dayOfWeek && it.lessonHour === fromHour);
      if (!fromItem) return prev;
      const toItem = prev.find(it => it.dayOfWeek === dayOfWeek && it.lessonHour === toHour);

      return prev.map(it => {
        if (it.dayOfWeek === dayOfWeek && it.lessonHour === fromHour) {
          return { ...it, lessonHour: toHour };
        }
        if (toItem && it.dayOfWeek === dayOfWeek && it.lessonHour === toHour) {
          return { ...it, lessonHour: fromHour };
        }
        return it;
      });
    });
  };

  const handlePromptMoveLessonHour = (dayOfWeek: number, fromHour: number, maxPeriod: number) => {
    const fromItem = inspectingItems.find(it => it.dayOfWeek === dayOfWeek && it.lessonHour === fromHour);
    if (!fromItem) return;

    const options: any[] = [];
    for (let h = 1; h <= maxPeriod; h++) {
      if (h === fromHour) continue;
      const targetItem = inspectingItems.find(it => it.dayOfWeek === dayOfWeek && it.lessonHour === h);
      const label = targetItem
        ? `${h}. Saat (${targetItem.grade}-${targetItem.section} ile Değiş Tokuş 🔄)`
        : `${h}. Saat (Boş Saat ➔)`;
      options.push({
        text: label,
        onPress: () => handleShiftLessonHour(dayOfWeek, fromHour, h),
      });
    }
    options.push({ text: 'Vazgeç', style: 'cancel' });

    Alert.alert(
      'Dersi Saate Taşı / Kaydır',
      `${fromHour}. Ders (${fromItem.grade}-${fromItem.section} - ${fromItem.lessonName}) hangi saate aktarılsın?`,
      options
    );
  };

  const handleSaveExpectedHours = () => {
    const parsedNum = parseInt(tempExpectedHours, 10);
    if (!isNaN(parsedNum) && parsedNum >= 0) {
      setInspectingVerification(prev => {
        if (prev) {
          return {
            ...prev,
            expectedWeeklyHours: parsedNum,
            isConsistent: parsedNum === inspectingItems.length,
          };
        }
        return {
          teacherName: inspectingTeacher,
          expectedWeeklyHours: parsedNum,
          extractedWeeklyHours: inspectingItems.length,
          isConsistent: parsedNum === inspectingItems.length,
        };
      });
      setEditingExpectedHours(false);
    } else {
      Alert.alert('Geçersiz Değer', 'Lütfen geçerli bir ders saati giriniz.');
    }
  };

  const handleApplyTeacherInspectorChanges = () => {
    if (!parsedSchedule) return;

    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const otherItems = (parsedSchedule.scheduleItems || []).filter(it => norm(it.teacherName) !== norm(inspectingTeacher));
    const newScheduleItems = [...otherItems, ...inspectingItems];

    const expHours = inspectingVerification?.expectedWeeklyHours ?? inspectingItems.length;

    let foundVerif = false;
    const newVerifications = (parsedSchedule.teacherVerifications || []).map(v => {
      if (norm(v.teacherName) === norm(inspectingTeacher)) {
        foundVerif = true;
        return {
          ...v,
          expectedWeeklyHours: expHours,
          extractedWeeklyHours: inspectingItems.length,
          isConsistent: expHours === inspectingItems.length,
        };
      }
      return v;
    });

    if (!foundVerif) {
      newVerifications.push({
        teacherName: inspectingTeacher,
        expectedWeeklyHours: expHours,
        extractedWeeklyHours: inspectingItems.length,
        isConsistent: expHours === inspectingItems.length,
      });
    }

    const classesSet = new Set(parsedSchedule.classes || []);
    const lessonsSet = new Set(parsedSchedule.lessons || []);
    inspectingItems.forEach(it => {
      const cls = `${it.grade}-${it.section}`.toUpperCase();
      classesSet.add(cls);
      if (it.lessonName) lessonsSet.add(it.lessonName);
    });

    const updatedParsedSchedule: ParsedScheduleResult = {
      ...parsedSchedule,
      classes: Array.from(classesSet),
      lessons: Array.from(lessonsSet),
      scheduleItems: newScheduleItems,
      teacherVerifications: newVerifications,
    };

    setParsedSchedule(updatedParsedSchedule);
    if (selectedSchool) {
      saveParsedScheduleDraft(selectedSchool.id, updatedParsedSchedule);
      setCachedScheduleDraft(updatedParsedSchedule);
    }
    setInspectTeacherModalVisible(false);

    // 🛡️ Çapraz Çakışma Denetim Motoru:
    // Bu öğretmenin güncellenen saatleri diğer öğretmenlerle aynı sınıfta çakışıyor mu?
    const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const conflictsDetected: Array<{
      dayOfWeek: number;
      lessonHour: number;
      className: string;
      otherTeacher: string;
      lessonName?: string;
    }> = [];

    for (const myItem of inspectingItems) {
      const myClass = `${myItem.grade}-${myItem.section}`.toUpperCase().trim();
      const conflictWith = otherItems.find(ot => {
        const otClass = `${ot.grade}-${ot.section}`.toUpperCase().trim();
        return ot.dayOfWeek === myItem.dayOfWeek &&
               ot.lessonHour === myItem.lessonHour &&
               otClass === myClass;
      });

      if (conflictWith) {
        conflictsDetected.push({
          dayOfWeek: myItem.dayOfWeek,
          lessonHour: myItem.lessonHour,
          className: myClass,
          otherTeacher: conflictWith.teacherName || 'Bilinmeyen Öğretmen',
          lessonName: conflictWith.lessonName,
        });
      }
    }

    if (conflictsDetected.length === 0) {
      Alert.alert(
        'Öğretmen Programı Güncellendi ✅',
        `"${inspectingTeacher}" için ${inspectingItems.length} ders saati programa aktarıldı.\n\n` +
        `🛡️ Çapraz Kontrol: Diğer tüm öğretmenlerle kontrol edildi, HİÇBİR ÇAKIŞMA YOK (0 Çakışma, Kusursuz Uyum)!\n\n` +
        `💾 Değişiklikler yerel taslak olarak belleğe kaydedildi.`
      );
    } else {
      const conflictSummary = conflictsDetected.slice(0, 3).map(c =>
        `• ${dayNames[c.dayOfWeek] || c.dayOfWeek}. Gün ${c.lessonHour}. Ders (${c.className}): ${c.otherTeacher}`
      ).join('\n');
      const extra = conflictsDetected.length > 3 ? `\n... ve ${conflictsDetected.length - 3} çakışma daha.` : '';

      const distinctConflictTeachers = Array.from(
        new Set(conflictsDetected.map(c => c.otherTeacher).filter(t => t && t !== 'Bilinmeyen Öğretmen' && t !== inspectingTeacher))
      );
      const firstConflictTeacher = distinctConflictTeachers[0];
      const alertButtons: any[] = [];
      if (firstConflictTeacher) {
        alertButtons.push({
          text: `🔍 ${firstConflictTeacher}'a Geç (İncele)`,
          onPress: () => {
            handleOpenTeacherScheduleInspector(firstConflictTeacher);
          },
        });
      }
      alertButtons.push({ text: 'Tamam', style: 'cancel' });

      Alert.alert(
        'Öğretmen Güncellendi ⚠️ Çakışma Uyarısı',
        `"${inspectingTeacher}" için ${inspectingItems.length} saat programa aktarıldı ancak ${conflictsDetected.length} derste başka öğretmenlerle ÇAKIŞMA tespit edildi:\n\n` +
        `${conflictSummary}${extra}\n\n` +
        `İlgili saatlerde aynı şubede iki öğretmen görünmektedir.\n\n` +
        `💡 Manuel Geçiş: Diğer öğretmene geçtiğinizde PDF otomatik okunmaz, mevcut dersler korunur. Yalnızca isterseniz pencere içindeki "⚡ Belgeden Yeniden Oku" butonuna basabilirsiniz.`,
        alertButtons
      );
    }
  };

  const handleAutoResolveConflictChain = async (initialTeachers: string[]) => {
    const targetFile = pendingScheduleFile || cachedScheduleDoc;
    if (!targetFile?.uri) {
      Alert.alert('Belge Bulunamadı', 'Hafızada kayıtlı bir çarşaf belgesi bulunamadı. Lütfen önce bir çarşaf yükleyin.');
      return;
    }

    if (!parsedSchedule) return;

    const queue: string[] = [...initialTeachers];
    const visited = new Set<string>();
    const resolvedTeachers: string[] = [];
    let currentParsed: ParsedScheduleResult = { ...parsedSchedule };
    const maxIterations = 8;
    let iterationCount = 0;

    setAiParsing(true);
    setAiModalVisible(true);
    setAiStageText(`🔄 Zincirleme Çözüm Başlatılıyor (${queue.length} öğretmen sırada)...`);

    try {
      while (queue.length > 0 && iterationCount < maxIterations) {
        iterationCount++;
        const currentTeacher = queue.shift()!;
        const normName = currentTeacher.trim().toLowerCase();
        if (visited.has(normName)) continue;
        visited.add(normName);

        setAiStageText(`🔄 [${iterationCount}] "${currentTeacher}" belgeden taranıyor ve programı yenileniyor...`);

        try {
          const res = await parseSingleTeacherScheduleWithAi(
            targetFile.uri,
            targetFile.mimeType || 'application/pdf',
            currentTeacher,
            geminiApiKeyInput,
            selectedGeminiModel
          );

          if (res && Array.isArray(res.items) && res.items.length > 0) {
            resolvedTeachers.push(currentTeacher);

            // Mevcut scheduleItems içinden bu öğretmeni çıkar, yenileri ekle
            const otherItems = (currentParsed.scheduleItems || []).filter(
              it => (it.teacherName || '').trim().toLowerCase() !== normName
            );
            const updatedItems = [...otherItems, ...res.items];

            // Teacher verifications güncelle
            const otherVerifs = (currentParsed.teacherVerifications || []).filter(
              v => (v.teacherName || '').trim().toLowerCase() !== normName
            );
            const expHours = res.totalHours || res.items.length;
            const updatedVerifs = [
              ...otherVerifs,
              {
                teacherName: currentTeacher,
                expectedWeeklyHours: expHours,
                extractedWeeklyHours: res.items.length,
                isConsistent: expHours === res.items.length,
              }
            ];

            currentParsed = {
              ...currentParsed,
              scheduleItems: updatedItems,
              teacherVerifications: updatedVerifs,
            };

            // Şimdi bu öğretmenin yeni saatleri başka BİRİYLE çakışıyor mu kontrol et:
            for (const myItem of res.items) {
              const myClass = `${myItem.grade}-${myItem.section}`.toUpperCase().trim();
              const conflict = otherItems.find(ot => {
                const otClass = `${ot.grade}-${ot.section}`.toUpperCase().trim();
                return ot.dayOfWeek === myItem.dayOfWeek &&
                       ot.lessonHour === myItem.lessonHour &&
                       otClass === myClass;
              });

              if (conflict && conflict.teacherName) {
                const confNorm = conflict.teacherName.trim().toLowerCase();
                if (!visited.has(confNorm) && !queue.includes(conflict.teacherName)) {
                  queue.push(conflict.teacherName);
                  setAiStageText(`🔍 Yeni çakışma tespit edildi: "${conflict.teacherName}" zincire eklendi.`);
                }
              }
            }
          }
        } catch (tErr: any) {
          console.warn(`[Zincir Çözüm] "${currentTeacher}" okuma hatası:`, tErr);
        }
      }

      // Son durumu state'e ve taslağa kaydet
      setParsedSchedule(currentParsed);
      if (selectedSchool) {
        saveParsedScheduleDraft(selectedSchool.id, currentParsed);
        setCachedScheduleDraft(currentParsed);
      }

      // Kalan çakışma var mı son bir kez tüm okul çapında hesapla:
      const remainingConflicts: string[] = [];
      const allItems = currentParsed.scheduleItems || [];
      for (let i = 0; i < allItems.length; i++) {
        const it1 = allItems[i];
        const cls1 = `${it1.grade}-${it1.section}`.toUpperCase().trim();
        for (let j = i + 1; j < allItems.length; j++) {
          const it2 = allItems[j];
          if ((it1.teacherName || '').trim().toLowerCase() === (it2.teacherName || '').trim().toLowerCase()) continue;
          const cls2 = `${it2.grade}-${it2.section}`.toUpperCase().trim();
          if (it1.dayOfWeek === it2.dayOfWeek && it1.lessonHour === it2.lessonHour && cls1 === cls2) {
            remainingConflicts.push(`${cls1}: ${it1.teacherName} & ${it2.teacherName}`);
            break;
          }
        }
      }

      setAiModalVisible(false);
      setAiParsing(false);

      if (remainingConflicts.length === 0) {
        Alert.alert(
          'Zincir Başarıyla Çözüldü 🎉',
          `Toplam ${resolvedTeachers.length} öğretmen (${resolvedTeachers.join(', ')}) belgeden taranıp programları yenilendi.\n\n` +
          `🛡️ Çapraz Kontrol: Okul genelinde 0 ÇAKIŞMA! Tüm program kusursuz birbiriyle uyumlu hale geldi.`
        );
      } else {
        Alert.alert(
          'Zincir Tamamlandı ⚠️',
          `${resolvedTeachers.length} öğretmen yenilendi (${resolvedTeachers.join(', ')}).\n\n` +
          `Hala ${remainingConflicts.length} çakışma mevcut:\n` +
          remainingConflicts.slice(0, 3).map(c => `• ${c}`).join('\n') +
          (remainingConflicts.length > 3 ? `\n... ve fazlası.` : '')
        );
      }
    } catch (chainErr: any) {
      setAiModalVisible(false);
      setAiParsing(false);
      Alert.alert('Zincir Hatası', chainErr.message || 'Zincir çözülürken hata oluştu.');
    }
  };

  const handleRescanTeacherFromDocument = async (customTeacherName?: string, customHint?: string) => {
    const teacherToScan = customTeacherName || inspectingTeacher;
    const targetFile = pendingScheduleFile || cachedScheduleDoc;
    if (!targetFile?.uri) {
      Alert.alert('Belge Bulunamadı', 'Hafızada kayıtlı bir çarşaf belgesi bulunamadı. Lütfen önce bir çarşaf dosyası yükleyin.');
      return;
    }

    try {
      setReScanningTeacher(true);
      if (customTeacherName) {
        setInspectingTeacher(customTeacherName);
      }
      const hint = customHint !== undefined ? customHint : teacherRescanHint;
      const res = await parseSingleTeacherScheduleWithAi(
        targetFile.uri,
        targetFile.mimeType || 'application/pdf',
        teacherToScan,
        geminiApiKeyInput,
        selectedGeminiModel,
        hint
      );

      if (res && Array.isArray(res.items) && res.items.length > 0) {
        setInspectingItems(res.items);
        if (res.totalHours) {
          setTempExpectedHours(String(res.totalHours));
        }
        Alert.alert(
          'Yeniden Okuma Başarılı 🎉',
          `"${teacherToScan}" için belgeden ${res.items.length} ders saati başarıyla yeniden çıkarıldı ve tabloya aktarıldı.` +
          (hint && hint.trim() ? `\n\n🎯 Uygulanan İpucu: "${hint.trim()}"` : '')
        );
      } else {
        Alert.alert('Ders Bulunamadı', `Belgede "${teacherToScan}" için ders saati tespit edilemedi.`);
      }
    } catch (err: any) {
      console.warn('Tek öğretmen okuma hatası:', err);
      Alert.alert('Okuma Hatası', err.message || 'Öğretmen belgeden taranamadı.');
    } finally {
      setReScanningTeacher(false);
    }
  };

  const handleLoadActiveScheduleToDraft = async () => {
    if (!selectedSchool) {
      Alert.alert('Okul Seçilmedi', 'Lütfen önce aktif bir okul seçin.');
      return;
    }

    try {
      setAiParsing(true);
      setAiStageText('Sistemde kayıtlı aktif ders programı getiriliyor...');
      setAiModalVisible(true);

      const res = await apiRequest<any[]>(`sync/schedules?schoolId=${selectedSchool.id}`);
      if (!res.success || !res.data || res.data.length === 0) {
        setAiModalVisible(false);
        setAiParsing(false);
        Alert.alert('Kayıtlı Program Bulunamadı', 'Sistemde kayıtlı herhangi bir ders programı verisi bulunamadı.');
        return;
      }

      const activeItems = res.data;
      const teachersSet = new Set<string>();
      const classesSet = new Set<string>();
      const lessonsSet = new Set<string>();
      const teacherItemsCountMap: Record<string, number> = {};

      const formattedItems = activeItems.map((item: any) => {
        const tName = item.teacherName || item.teacher?.fullName || 'Bilinmeyen Öğretmen';
        teachersSet.add(tName);
        teacherItemsCountMap[tName] = (teacherItemsCountMap[tName] || 0) + 1;

        const grade = String(item.grade || item.class?.grade || '');
        const section = String(item.section || item.class?.section || '');
        const clsName = grade && section ? `${grade}-${section}` : (item.className || 'Genel');
        classesSet.add(clsName);

        const lName = item.lessonName || item.lesson?.name || 'Ders';
        lessonsSet.add(lName);

        return {
          teacherName: tName,
          dayOfWeek: Number(item.dayOfWeek),
          lessonHour: Number(item.lessonHour),
          grade,
          section,
          lessonName: lName,
          lessonCode: item.lessonCode || item.lesson?.code,
          classroom: item.classroom,
        };
      });

      const verifications: TeacherScheduleVerification[] = Array.from(teachersSet).map(tName => ({
        teacherName: tName,
        expectedWeeklyHours: teacherItemsCountMap[tName],
        extractedWeeklyHours: teacherItemsCountMap[tName],
        isConsistent: true,
      }));

      const draftResult: ParsedScheduleResult = {
        teachers: Array.from(teachersSet).sort(),
        classes: Array.from(classesSet).sort(),
        lessons: Array.from(lessonsSet).sort(),
        scheduleItems: formattedItems,
        teacherVerifications: verifications,
      };

      setParsedSchedule(draftResult);
      await saveParsedScheduleDraft(selectedSchool.id, draftResult);
      setCachedScheduleDraft(draftResult);
      setAiParsing(false);
    } catch (err: any) {
      setAiModalVisible(false);
      setAiParsing(false);
      Alert.alert('Yükleme Hatası', err.message || 'Aktif program taslağa yüklenemedi.');
    }
  };

  const aiCancelledRef = useRef(false);

  const cancelScheduleAnalysis = () => {
    aiCancelledRef.current = true;
    setAiParsing(false);
    setAiModalVisible(false);
    setAiStageText('');
    setAiElapsedSeconds(0);
  };

  useEffect(() => {
    let interval: any;
    if (aiParsing) {
      setAiElapsedSeconds(0);
      interval = setInterval(() => {
        setAiElapsedSeconds((prev) => prev + 1);
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

  // 6.1 AI ile Excel Öğrenci Yükleme State
  const [aiStudentModalVisible, setAiStudentModalVisible] = useState(false);
  const [aiStudentParsing, setAiStudentParsing] = useState(false);
  const [aiStudentSaving, setAiStudentSaving] = useState(false);
  const [aiStudentResult, setAiStudentResult] = useState<AiStudentParseResult | null>(null);

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

  // 3.2.1 Yıllık Plan Çoklu Sheet Seçim Modalı State
  const [planSheetPickerVisible, setPlanSheetPickerVisible] = useState(false);
  const [planSheetPickerSheets, setPlanSheetPickerSheets] = useState<string[]>([]);
  const [planSheetPickerAsset, setPlanSheetPickerAsset] = useState<any>(null);
  const [planSheetPickerLesson, setPlanSheetPickerLesson] = useState<any>(null);

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

  // İstatistik Filtreleme ve Türkçe Uyumlu Arama/Eşleştirme Yardımcıları
  const normalizeSearchStr = (str?: string | null): string => {
    if (!str) return '';
    return str
      .trim()
      .replace(/İ/g, 'i')
      .replace(/I/g, 'ı')
      .toLocaleLowerCase('tr-TR')
      .replace(/\s+/g, ' ');
  };

  const normalizeTeacherMatch = (name1?: string | null, name2?: string | null): boolean => {
    if (!name1 || !name2) return false;
    return normalizeSearchStr(name1) === normalizeSearchStr(name2);
  };

  const filteredTeacherWorkloads = useMemo(() => {
    const list = scheduleStats?.teacherWorkloads || [];
    if (!analyticsSearchQuery.trim()) return list;
    const q = normalizeSearchStr(analyticsSearchQuery);
    return list.filter((t: any) =>
      normalizeSearchStr(t.teacherName).includes(q) ||
      t.classes?.some((c: string) => normalizeSearchStr(c).includes(q)) ||
      t.lessons?.some((l: string) => normalizeSearchStr(l).includes(q))
    );
  }, [scheduleStats?.teacherWorkloads, analyticsSearchQuery]);

  const filteredClassFullness = useMemo(() => {
    const list = scheduleStats?.classFullness || [];
    if (!analyticsSearchQuery.trim()) return list;
    const q = normalizeSearchStr(analyticsSearchQuery);
    return list.filter((c: any) => normalizeSearchStr(c.className).includes(q));
  }, [scheduleStats?.classFullness, analyticsSearchQuery]);

  const filteredCourseAllocations = useMemo(() => {
    const list = scheduleStats?.courseAllocations || [];
    if (!analyticsSearchQuery.trim()) return list;
    const q = normalizeSearchStr(analyticsSearchQuery);
    return list.filter((a: any) =>
      normalizeSearchStr(a.lessonName).includes(q) ||
      normalizeSearchStr(a.className).includes(q) ||
      normalizeSearchStr(a.teacherName).includes(q)
    );
  }, [scheduleStats?.courseAllocations, analyticsSearchQuery]);

  // Kademe ve aramaya göre filtrelenmiş ve sıralanmış dersler
  const filteredLessons = useMemo(() => {
    let result = [...lessons];

    // Kademe Filtresi
    if (lessonGradeFilter !== 'all') {
      if (lessonGradeFilter === 'common') {
        result = result.filter(l => !l.grade || l.grade === 'Tüm Kademeler' || l.grade === 'Ortak');
      } else {
        result = result.filter(l => {
          const gStr = String(l.grade || '').trim();
          return gStr === lessonGradeFilter || gStr.startsWith(lessonGradeFilter);
        });
      }
    }

    // Arama Filtresi
    if (lessonSearchQuery.trim()) {
      const q = normalizeSearchStr(lessonSearchQuery);
      result = result.filter(l =>
        normalizeSearchStr(l.name).includes(q) ||
        (l.shortCode && normalizeSearchStr(l.shortCode).includes(q)) ||
        (l.grade && normalizeSearchStr(String(l.grade)).includes(q))
      );
    }

    // Sıralama: Önce kademe (9, 10, 11, 12, Ortak), sonra ders adı
    return result.sort((a, b) => {
      const gA = parseInt(String(a.grade || '').replace(/\D/g, '') || '999', 10);
      const gB = parseInt(String(b.grade || '').replace(/\D/g, '') || '999', 10);
      if (gA !== gB) return gA - gB;
      return (a.name || '').localeCompare(b.name || '', 'tr');
    });
  }, [lessons, lessonGradeFilter, lessonSearchQuery]);

  // 1.5 Canlı İnteraktif Program Düzenleyici State
  const [scheduleEditorMode, setScheduleEditorMode] = useState<'class' | 'teacher'>('class');
  const [selectedClassForEditor, setSelectedClassForEditor] = useState<string>('');
  const [selectedTeacherForEditor, setSelectedTeacherForEditor] = useState<string>('');
  const [teacherListBoxSearch, setTeacherListBoxSearch] = useState<string>('');
  const [allSchoolSchedules, setAllSchoolSchedules] = useState<any[]>([]);
  const [loadingAllSchedules, setLoadingAllSchedules] = useState(false);
  const [scheduleResetModalVisible, setScheduleResetModalVisible] = useState(false);

  // Öğretmen Programı Düzenleyicisi için sıralı ve filtrelenmiş öğretmenler
  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'tr'));
  }, [teachers]);

  const filteredTeachersForListBox = useMemo(() => {
    if (!teacherListBoxSearch.trim()) return sortedTeachers;
    const q = normalizeSearchStr(teacherListBoxSearch);
    return sortedTeachers.filter((t: any) =>
      normalizeSearchStr(t.fullName).includes(q) ||
      normalizeSearchStr(t.branch).includes(q)
    );
  }, [sortedTeachers, teacherListBoxSearch]);

  const currentActiveTeacher = useMemo(() => {
    const activeName = selectedTeacherForEditor || (sortedTeachers[0] ? sortedTeachers[0].fullName : '');
    return sortedTeachers.find((t: any) => t.fullName === activeName) || sortedTeachers[0] || null;
  }, [sortedTeachers, selectedTeacherForEditor]);

  const getTeacherTotalHours = useCallback((teacherFullName: string) => {
    if (!teacherFullName || !allSchoolSchedules) return 0;
    const norm = normalizeSearchStr(teacherFullName);
    return allSchoolSchedules.filter((s: any) => normalizeSearchStr(s.teacherName) === norm).length;
  }, [allSchoolSchedules]);

  const handleSelectPrevTeacher = useCallback(() => {
    if (!sortedTeachers.length) return;
    const activeName = selectedTeacherForEditor || (sortedTeachers[0] ? sortedTeachers[0].fullName : '');
    const currIdx = sortedTeachers.findIndex((t: any) => t.fullName === activeName);
    const prevIdx = currIdx <= 0 ? sortedTeachers.length - 1 : currIdx - 1;
    setSelectedTeacherForEditor(sortedTeachers[prevIdx].fullName);
  }, [sortedTeachers, selectedTeacherForEditor]);

  const handleSelectNextTeacher = useCallback(() => {
    if (!sortedTeachers.length) return;
    const activeName = selectedTeacherForEditor || (sortedTeachers[0] ? sortedTeachers[0].fullName : '');
    const currIdx = sortedTeachers.findIndex((t: any) => t.fullName === activeName);
    const nextIdx = currIdx < 0 || currIdx >= sortedTeachers.length - 1 ? 0 : currIdx + 1;
    setSelectedTeacherForEditor(sortedTeachers[nextIdx].fullName);
  }, [sortedTeachers, selectedTeacherForEditor]);

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
    lessonCode?: string;
    classroom?: string;
  } | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotLessonSearchQuery, setSlotLessonSearchQuery] = useState('');
  const [slotTeacherSearchQuery, setSlotTeacherSearchQuery] = useState('');

  // 1.7 Tek Öğretmen Fotoğraftan Program Okuma State
  const [singleTeacherParsing, setSingleTeacherParsing] = useState(false);
  const [singleTeacherPreview, setSingleTeacherPreview] = useState<any | null>(null);
  const [singleTeacherModalVisible, setSingleTeacherModalVisible] = useState(false);
  const [savingSingleTeacher, setSavingSingleTeacher] = useState(false);
  const [teacherLoginFilter, setTeacherLoginFilter] = useState<'all' | 'logged_in' | 'not_logged_in'>('all');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [teacherSortOrder, setTeacherSortOrder] = useState<'asc' | 'desc'>('asc');

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

  const handleExportTeacherCredentials = async () => {
    if (!selectedSchool) return;
    setExportingReportType('teacher_credentials');
    try {
      await exportTeacherCredentialsReport({
        school: selectedSchool,
        teachers,
        filterBranch: reportTeacherBranch,
        filterRole: reportTeacherRole,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Öğretmen şifre raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportStudentCredentials = async () => {
    if (!selectedSchool) return;
    setExportingReportType('student_credentials');
    try {
      await exportStudentCredentialsReport({
        school: selectedSchool,
        students,
        filterGrade: reportStudentGrade,
        filterSection: reportStudentSection,
        searchQuery: reportStudentSearch,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Öğrenci şifre raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handleExportParentCredentials = async () => {
    if (!selectedSchool) return;
    setExportingReportType('parent_credentials');
    try {
      await exportParentCredentialsReport({
        school: selectedSchool,
        students,
        filterGrade: reportStudentGrade,
        filterSection: reportStudentSection,
        searchQuery: reportStudentSearch,
      });
    } catch (e: any) {
      Alert.alert('Rapor Hatası', 'Veli şifre raporu oluşturulamadı: ' + e.message);
    } finally {
      setExportingReportType(null);
    }
  };

  const handlePickPdfAndExtractPhotos = async () => {
    if (!selectedSchool) return;
    try {
      setBulkPhotoModalVisible(true);
      setUploadingBulkPhotos(true);
      setBulkPhotoProgress('e-Okul PDF belgesi seçiliyor ve taranıyor...');

      const res = await extractPhotosFromPdf(students);
      if (!res.success) {
        setBulkPhotoModalVisible(false);
        setUploadingBulkPhotos(false);
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('PDF Fotoğraf Hatası', res.error);
        }
        return;
      }

      const extracted = res.extractedPhotos || [];
      if (extracted.length === 0) {
        setBulkPhotoModalVisible(false);
        setUploadingBulkPhotos(false);
        Alert.alert('Fotoğraf Bulunamadı', 'Seçilen PDF belgesinde öğrenci numarası ile eşleşen fotoğraf tespit edilemedi.');
        return;
      }

      const matched = extracted.filter(p => p.matchedStudent?.student_number || p.detectedNumber);
      if (matched.length === 0) {
        setBulkPhotoModalVisible(false);
        setUploadingBulkPhotos(false);
        Alert.alert('Fotoğraf Eşleşmedi', 'PDF içindeki fotoğraflar sistemdeki öğrenci numaralarıyla eşleşemedi.');
        return;
      }

      setBulkPhotoProgress(`${matched.length} öğrenci fotoğrafı sunucuya aktarılıyor...`);

      const photos: { studentNumber: string; photoBase64: string; fileName: string }[] = [];
      for (const p of matched) {
        const stdNo = p.matchedStudent?.student_number || p.detectedNumber;
        if (!stdNo) continue;
        try {
          const b64 = await readUriAsBase64(p.tempUri);
          photos.push({
            studentNumber: stdNo,
            photoBase64: `data:image/jpeg;base64,${b64}`,
            base64Data: `data:image/jpeg;base64,${b64}`,
            fileName: `${stdNo}.jpg`,
          } as any);
        } catch (err) {
          console.warn('Fotoğraf okunamadı:', stdNo, err);
        }
      }

      if (photos.length === 0) {
        setBulkPhotoModalVisible(false);
        setUploadingBulkPhotos(false);
        Alert.alert('Hata', 'Fotoğraflar işlenemedi.');
        return;
      }

      const apiRes = await apiRequest<{ updatedCount: number; successCount?: number }>(`uploads/batch-student-photos?schoolId=${selectedSchool.id}`, 'POST', {
        schoolId: selectedSchool.id,
        schoolCode: selectedSchool.schoolCode,
        photos,
      });

      if (apiRes.success) {
        const count = apiRes.data?.updatedCount || apiRes.data?.successCount || photos.length;
        Alert.alert('Tamamlandı 🎉', `${count} öğrencinin fotoğrafı PDF'den başarıyla yüklendi.`);
        loadStudents(selectedSchool.id);
      } else {
        Alert.alert('Hata', apiRes.error || 'Fotoğraflar sunucuya kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setUploadingBulkPhotos(false);
      setBulkPhotoModalVisible(false);
      setBulkPhotoProgress('');
    }
  };

  const handlePickAndExtractPhotosWithAi = async () => {
    if (!selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen önce aktif bir okul seçiniz.');
      return;
    }
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/*',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const file = pickerResult.assets[0];
      setBulkPhotoModalVisible(true);
      setUploadingBulkPhotos(true);
      setBulkPhotoProgress('Yapay Zeka (Gemini Vision) ile öğrenci fotoğrafları taranıyor...');

      const apiKey = (selectedSchool.geminiApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY).trim();
      const model = (selectedGeminiModel || selectedSchool.geminiModel || (await getGeminiModel()) || DEFAULT_GEMINI_MODEL).trim();

      const res = await extractStudentPhotosWithAi(
        file.uri,
        file.name,
        file.mimeType || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        students,
        selectedSchool.id,
        apiKey,
        model,
        (progressText) => setBulkPhotoProgress(progressText)
      );

      if (res.success) {
        Alert.alert(
          'AI Fotoğraf Çıkarımı Tamamlandı 🎉',
          `${res.uploadedCount} öğrencinin fotoğrafı yapay zeka ile başarıyla tespit edilip sunucuya kaydedildi!`
        );
        loadStudents(selectedSchool.id);
      } else {
        Alert.alert('AI Fotoğraf Hatası', res.error || 'Fotoğraf analizi tamamlanamadı.');
      }
    } catch (e: any) {
      console.error('[AI Foto UI Hata]:', e);
      Alert.alert('Hata', e.message || 'Fotoğraf çıkarma işlemi başarısız.');
    } finally {
      setUploadingBulkPhotos(false);
      setBulkPhotoModalVisible(false);
      setBulkPhotoProgress('');
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

  const [autoReconciling, setAutoReconciling] = useState(false);
  const [autoFillingGaps, setAutoFillingGaps] = useState(false);

  const executeAutoReconcile = async (includeGaps: boolean) => {
    if (!selectedSchool) return;
    setAutoReconciling(true);
    try {
      const res = await apiRequest<{ success: boolean; movedCount: number; message: string; details?: string[] }>(
        `sync/schedules/auto-reconcile?schoolId=${selectedSchool.id}&dailyHours=${scheduleDailyHours}&includeGaps=${includeGaps}`,
        'POST'
      );

      if (res.success) {
        const moved = res.data?.movedCount || 0;
        if (moved > 0) {
          const sampleDetails = (res.data?.details || []).slice(0, 6).join('\n• ');
          Alert.alert(
            '🎉 Dengeleme Tamamlandı',
            `${res.data?.message}\n\nYapılan işlemlerden örnekler:\n• ${sampleDetails}${
              (res.data?.details || []).length > 6 ? `\n... ve ${(res.data?.details || []).length - 6} işlem daha.` : ''
            }`
          );
        } else {
          Alert.alert('Bilgi', res.data?.message || 'Taşınabilecek çakışma veya eksik saat bulunamadı.');
        }
        loadScheduleStats();
        loadAllSchedules();
      } else {
        Alert.alert('Hata', res.error || 'Dengeleme yapılamadı.');
      }
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'İşlem başarısız.');
    } finally {
      setAutoReconciling(false);
    }
  };

  const handleAutoReconcileSchedule = () => {
    if (!selectedSchool) return;

    Alert.alert(
      '⚡ Akıllı Dengeleme Seçenekleri',
      'Şubelerdeki çakışmaları boş saatlere taşıyabilir ve isterseniz müfredata göre eksik kalan öğretmen derslerini de boşluklara otomatik olarak doldurabilirsiniz.\n\nHangi işlemi yapmak istiyorsunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sadece Çakışmaları Dengele',
          onPress: () => executeAutoReconcile(false),
        },
        {
          text: '🔥 Tümünü Dengele & Boşlukları Doldur',
          onPress: () => executeAutoReconcile(true),
        },
      ]
    );
  };

  const handleAutoFillGapsSchedule = async () => {
    if (!selectedSchool) return;

    Alert.alert(
      '🧩 Boşlukları Doldur (Müfredat & Eksik Saatler)',
      'Haftalık ders programında müfredata göre eksik saati kalmış öğretmenler ve dersler tespit edilecek, şubelerin boş ders saatlerine (özellikle ardışık 2 saatlik blok oluşturacak şekilde) yerleştirilecektir.\n\nİşlemi başlatmak istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Boşlukları Doldur',
          onPress: async () => {
            setAutoFillingGaps(true);
            try {
              const res = await apiRequest<{ success: boolean; placedCount: number; message: string; details?: string[] }>(
                `sync/schedules/auto-fill-gaps?schoolId=${selectedSchool.id}&dailyHours=${scheduleDailyHours}`,
                'POST'
              );

              if (res.success) {
                const placed = res.data?.placedCount || 0;
                if (placed > 0) {
                  const sampleDetails = (res.data?.details || []).slice(0, 6).join('\n• ');
                  Alert.alert(
                    '🎉 Boşluklar Dolduruldu',
                    `${res.data?.message}\n\nYerleştirilen derslerden örnekler:\n• ${sampleDetails}${
                      (res.data?.details || []).length > 6 ? `\n... ve ${(res.data?.details || []).length - 6} ders daha.` : ''
                    }`
                  );
                } else {
                  Alert.alert('Bilgi', res.data?.message || 'Müfredata göre yerleştirilebilecek eksik ders bulunamadı.');
                }
                loadScheduleStats();
                loadAllSchedules();
              } else {
                Alert.alert('Hata', res.error || 'İşlem tamamlanamadı.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'İşlem başarısız.');
            } finally {
              setAutoFillingGaps(false);
            }
          },
        },
      ]
    );
  };

  const [slotConflictItems, setSlotConflictItems] = useState<any[]>([]);

  const handleOpenSlotModal = (params: {
    dayOfWeek: number;
    lessonHour: number;
    grade?: string;
    section?: string;
    teacherName?: string;
    existingItem?: any;
    conflictingItems?: any[];
  }) => {
    const existing = params.existingItem;
    setSlotConflictItems(params.conflictingItems || []);
    setEditingSlotData({
      id: existing?.id,
      dayOfWeek: params.dayOfWeek,
      lessonHour: params.lessonHour,
      grade: existing?.grade || params.grade || (classes[0] ? String(classes[0].grade) : '9'),
      section: existing?.section || params.section || (classes[0] ? classes[0].section : 'A'),
      teacherName: existing?.teacherName || params.teacherName || (teachers[0] ? teachers[0].fullName : ''),
      lessonName: existing?.lessonName || (lessons[0] ? lessons[0].name : ''),
      lessonCode: existing?.lessonCode || '',
      classroom: existing?.classroom || '',
    });
    setSlotLessonSearchQuery('');
    setSlotTeacherSearchQuery('');
    setSlotModalVisible(true);
  };

  const handleDeleteSpecificConflictItem = async (item: any) => {
    if (!selectedSchool || !item) return;
    Alert.alert(
      'Çakışan Dersi Sil',
      `"${item.lessonName} - ${item.teacherName || 'Öğretmen Belirtilmedi'}" dersini bu saatten (${item.dayOfWeek}. Gün ${item.lessonHour}. Saat) programdan kaldırmak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            setSavingSlot(true);
            try {
              const res = await deleteSingleScheduleItemFromServer({
                schoolId: selectedSchool.id,
                id: item.id,
                grade: item.grade,
                section: item.section,
                teacherName: item.teacherName,
                dayOfWeek: item.dayOfWeek,
                lessonHour: item.lessonHour,
              });

              if (res.success) {
                const remaining = slotConflictItems.filter(ci => ci.id !== item.id);
                setSlotConflictItems(remaining);

                if (remaining.length > 0) {
                  const nextItem = remaining[0];
                  setEditingSlotData({
                    id: nextItem.id,
                    dayOfWeek: nextItem.dayOfWeek,
                    lessonHour: nextItem.lessonHour,
                    grade: nextItem.grade,
                    section: nextItem.section,
                    teacherName: nextItem.teacherName || '',
                    lessonName: nextItem.lessonName || '',
                    lessonCode: nextItem.lessonCode || '',
                    classroom: nextItem.classroom || '',
                  });
                } else {
                  setSlotModalVisible(false);
                }

                await loadAllSchedules();
                await loadScheduleStats();
              } else {
                Alert.alert('Hata', res.message || 'Çakışan ders silinemedi.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'İşlem başarısız.');
            } finally {
              setSavingSlot(false);
            }
          },
        },
      ]
    );
  };

  // Slot Modal için alfabetik tekilleştirilmiş dersler
  const allAvailableLessons = useMemo(() => {
    const lessonSet = new Set<string>();
    lessons.forEach(l => {
      if (l.name && l.name.trim()) lessonSet.add(l.name.trim());
    });
    allSchoolSchedules.forEach(s => {
      if (s.lessonName && s.lessonName.trim()) lessonSet.add(s.lessonName.trim());
    });
    return Array.from(lessonSet).sort((a, b) => a.localeCompare(b, 'tr-TR'));
  }, [lessons, allSchoolSchedules]);

  // Slot Modal için alfabetik tekilleştirilmiş öğretmenler
  const allAvailableTeachers = useMemo(() => {
    const teacherSet = new Set<string>();
    teachers.forEach(t => {
      if (t.fullName && t.fullName.trim()) teacherSet.add(t.fullName.trim());
    });
    allSchoolSchedules.forEach(s => {
      if (s.teacherName && s.teacherName.trim()) teacherSet.add(s.teacherName.trim());
    });
    return Array.from(teacherSet).sort((a, b) => a.localeCompare(b, 'tr-TR'));
  }, [teachers, allSchoolSchedules]);

  // Filtrelenmiş ders listesi
  const filteredSlotLessons = useMemo(() => {
    if (!slotLessonSearchQuery.trim()) return allAvailableLessons;
    const q = normalizeSearchStr(slotLessonSearchQuery);
    return allAvailableLessons.filter(l => normalizeSearchStr(l).includes(q));
  }, [allAvailableLessons, slotLessonSearchQuery]);

  // Filtrelenmiş öğretmen listesi
  const filteredSlotTeachers = useMemo(() => {
    if (!slotTeacherSearchQuery.trim()) return allAvailableTeachers;
    const q = normalizeSearchStr(slotTeacherSearchQuery);
    return allAvailableTeachers.filter(t => normalizeSearchStr(t).includes(q));
  }, [allAvailableTeachers, slotTeacherSearchQuery]);

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
        lessonCode: editingSlotData.lessonCode,
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
                teacherName: editingSlotData.teacherName,
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
          if (current.dailyLessonHours && current.dailyLessonHours > 0) {
            setScheduleDailyHours(current.dailyLessonHours);
          }
          if (current.geminiApiKey) setGeminiApiKeyInput(current.geminiApiKey);
          else setGeminiApiKeyInput('');
          const validModel = current.geminiModel && !['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'].includes(current.geminiModel)
            ? current.geminiModel
            : DEFAULT_GEMINI_MODEL;
          setSelectedGeminiModel(validModel);
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
      loadSchoolBatches(schoolId),
    ]);
  };

  const handleSelectSchool = async (s: any) => {
    setSelectedSchool(s);
    if (s.dailyLessonHours && s.dailyLessonHours > 0) {
      setScheduleDailyHours(s.dailyLessonHours);
    }
    if (s.geminiApiKey) setGeminiApiKeyInput(s.geminiApiKey);
    else setGeminiApiKeyInput('');
    const validModel = s.geminiModel && !['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'].includes(s.geminiModel)
      ? s.geminiModel
      : DEFAULT_GEMINI_MODEL;
    setSelectedGeminiModel(validModel);
    await loadAllSchoolData(s.id);
    try {
      const usage = await getGeminiUsageStats(s.id);
      setUsageStats(usage);
    } catch { }
  };

  const handleChangeDailyHours = async (newHours: number) => {
    if (newHours === scheduleDailyHours || newHours < 4 || newHours > 14) return;
    setScheduleDailyHours(newHours);
    if (selectedSchool) {
      try {
        await apiRequest(`schools/${selectedSchool.id}`, 'PUT', {
          name: selectedSchool.name,
          dailyLessonHours: newHours,
        });
        selectedSchool.dailyLessonHours = newHours;
      } catch (e) {
        console.warn('Failed to update school dailyLessonHours:', e);
      }
      loadScheduleStats(newHours);
    }
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
    const parsedHours = parseInt(newSchoolDailyHours, 10) || 8;
    const res = await apiRequest('schools', 'POST', {
      name: newSchoolName.trim(),
      phone: newSchoolPhone.trim(),
      geminiApiKey: newSchoolApiKey.trim(),
      dailyLessonHours: parsedHours >= 4 && parsedHours <= 14 ? parsedHours : 8,
    });

    if (res.success && res.data) {
      Alert.alert('Başarılı', `Okul oluşturuldu. Okul Kodu: ${res.data.code}`);
      setCreateModalVisible(false);
      setNewSchoolName('');
      setNewSchoolPhone('');
      setNewSchoolApiKey('');
      setNewSchoolDailyHours('8');
      loadSchools();
    } else {
      Alert.alert('Hata', res.error || 'Okul oluşturulamadı.');
    }
  };

  const handleOpenEditSchool = (schoolToEdit: any) => {
    if (!schoolToEdit) return;
    setEditingSchoolObj(schoolToEdit);
    setEditSchoolName(schoolToEdit.name || '');
    setEditSchoolPhone(schoolToEdit.phone || '');
    setEditSchoolAddress(schoolToEdit.address || '');
    setEditSchoolApiKey(schoolToEdit.geminiApiKey || '');
    setEditSchoolModel(schoolToEdit.geminiModel || '');
    setEditSchoolDailyHours(String(schoolToEdit.dailyLessonHours || scheduleDailyHours || 8));
    setEditModalVisible(true);
  };

  const handleUpdateSchool = async () => {
    const target = editingSchoolObj || selectedSchool;
    if (!target) return;
    if (!editSchoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adı girin.');
      return;
    }
    setUpdatingSchool(true);
    try {
      const parsedHours = parseInt(editSchoolDailyHours, 10);
      const res = await apiRequest(`schools/${target.id}`, 'PUT', {
        name: editSchoolName.trim(),
        phone: editSchoolPhone.trim() || undefined,
        address: editSchoolAddress.trim() || undefined,
        geminiApiKey: editSchoolApiKey.trim() || undefined,
        geminiModel: editSchoolModel.trim() || undefined,
        dailyLessonHours: !isNaN(parsedHours) && parsedHours >= 4 && parsedHours <= 14 ? parsedHours : 8,
      });

      if (res.success) {
        if (!isNaN(parsedHours) && parsedHours >= 4 && parsedHours <= 14) {
          setScheduleDailyHours(parsedHours);
        }

        // Yerel veritabanında da okul adını güncelle
        try {
          const localSchools = await getSchools();
          const match = localSchools.find(
            s => (s.code && s.code.toUpperCase() === target.code?.toUpperCase()) || s.name.toLowerCase() === target.name?.toLowerCase()
          );
          if (match) {
            await updateSchool(match.id, editSchoolName.trim(), match.color, target.code);
          }
        } catch (localErr) {
          console.warn('Yerel okul güncelleme uyarısı:', localErr);
        }

        Alert.alert('Başarılı', `"${editSchoolName.trim()}" okul bilgileri güncellendi.`);
        setEditModalVisible(false);
        await loadSchools();
      } else {
        Alert.alert('Hata', res.error || 'Okul bilgileri güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Bir hata oluştu.');
    } finally {
      setUpdatingSchool(false);
    }
  };

  const handleDeleteSchool = (schoolToDelete: any) => {
    if (!schoolToDelete) return;
    if (schools.length <= 1) {
      Alert.alert(
        'Okul Silinemez',
        'Sistemde en az bir okul bulunmalıdır. Yönettiğiniz tek ve son okulu silemezsiniz.'
      );
      return;
    }

    Alert.alert(
      '⚠️ Okulu Sil',
      `"${schoolToDelete.name}" (${schoolToDelete.code}) okulunu silmek istediğinize emin misiniz?\n\nBu işlem okulu ve ilişkili kayıtları arşivleyecek/devre dışı bırakacaktır. Bu işlem geri alınamaz!`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Okulu Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingSchoolId(schoolToDelete.id);
            try {
              const res = await apiRequest(`schools/${schoolToDelete.id}`, 'DELETE');
              if (res.success) {
                // Yerel SQLite'tan da temizle
                try {
                  const localSchools = await getSchools();
                  const match = localSchools.find(
                    s => s.code && s.code.toUpperCase() === schoolToDelete.code?.toUpperCase()
                  );
                  if (match && localSchools.length > 1) {
                    await deleteSchool(match.id);
                  }
                } catch (localErr) {
                  console.warn('Yerel okul silme uyarısı:', localErr);
                }

                setEditModalVisible(false);
                setSchoolSelectModalVisible(false);

                // Kalan okullardan birini seç
                const remaining = schools.filter(s => s.id !== schoolToDelete.id);
                if (selectedSchool?.id === schoolToDelete.id && remaining.length > 0) {
                  await handleSelectSchool(remaining[0]);
                }

                Alert.alert('Başarılı', `"${schoolToDelete.name}" okulu sistemden silindi.`);
                await loadSchools();
              } else {
                Alert.alert('Hata', res.error || 'Okul silinemedi.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'Okul silinirken hata oluştu.');
            } finally {
              setDeletingSchoolId(null);
            }
          },
        },
      ]
    );
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
    setExcludedTeachers(exclude ? [...(parsedSchedule.teachers || [])] : []);
  };

  const setAllClassesExcluded = (exclude: boolean) => {
    if (!parsedSchedule) return;
    setExcludedClasses(exclude ? [...(parsedSchedule.classes || [])] : []);
  };

  const setAllLessonsExcluded = (exclude: boolean) => {
    if (!parsedSchedule) return;
    setExcludedLessons(exclude ? [...(parsedSchedule.lessons || [])] : []);
  };

  const handlePickAndAnalyzeSchedule = async (targetFormat: 'pdf' | 'excel' = 'pdf') => {
    if (!selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen önce aktif bir okul seçin.');
      return;
    }

    try {
      const pickerTypes = targetFormat === 'excel'
        ? [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/vnd.ms-excel.sheet.macroEnabled.12',
            '*/*',
          ]
        : ['image/*', 'application/pdf'];

      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: pickerTypes,
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const file = pickerResult.assets[0];
      const fileNameLower = (file.name || '').toLowerCase();
      const isExcel = targetFormat === 'excel' || fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls');

      if (isExcel) {
        try {
          const b64 = await readUriAsBase64(file.uri);
          const inspection = inspectExcelWorkbook(b64, file.name || 'carsaf.xlsx');
          setExcelInspection(inspection);
          setSelectedExcelSheet(inspection.sheetNames[0] || '');
          setExcelPreviewModalVisible(true);
        } catch (err: any) {
          Alert.alert('Excel Okuma Hatası', err?.message || 'Excel dosyası incelenemedi.');
        }
        return;
      }

      setPendingScheduleFile(file);
      if (selectedSchool) {
        const docInfo: CachedScheduleDocInfo = {
          name: file.name || 'carsaf.pdf',
          uri: file.uri,
          mimeType: file.mimeType || (file.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          size: file.size,
          totalPages: 0,
          updatedAt: Date.now(),
        };
        saveCachedScheduleFile(selectedSchool.id, docInfo);
        setCachedScheduleDoc(docInfo);
      }

      // PDF ise sayfa sayısını otomatik tara
      if (file.name?.toLowerCase().endsWith('.pdf') || file.mimeType?.includes('pdf')) {
        setCountingPdfPages(true);
        setPdfTotalPages(0);
        setSchedulePreOptionsModalVisible(true);
        try {
          const b64 = await readUriAsBase64(file.uri);
          const total = await countPdfPages(b64);
          if (total > 0) {
            setPdfTotalPages(total);
            setPdfStartPage('1');
            if (total > 35) {
              setPdfPageRangeMode('half1');
              setPdfEndPage(String(Math.ceil(total / 2)));
            } else {
              setPdfPageRangeMode('all');
              setPdfEndPage(String(total));
            }
          } else {
            setPdfTotalPages(0);
            setPdfPageRangeMode('all');
            setPdfStartPage('1');
            setPdfEndPage('1');
          }
        } catch (cntErr) {
          console.warn('PDF sayfa sayısı okunamadı (Tüm belge modu seçildi):', cntErr);
          setPdfTotalPages(0);
          setPdfPageRangeMode('all');
          setPdfStartPage('1');
          setPdfEndPage('1');
        } finally {
          setCountingPdfPages(false);
        }
      } else {
        setPdfTotalPages(0);
        setPdfPageRangeMode('all');
        setSchedulePreOptionsModalVisible(true);
      }
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

    // Sayfa Aralığı Belirleme
    let pageRange: { start: number; end: number } | undefined = undefined;
    if (pdfTotalPages > 1 && pdfPageRangeMode !== 'all') {
      const start = parseInt(pdfStartPage, 10) || 1;
      const end = parseInt(pdfEndPage, 10) || pdfTotalPages;
      pageRange = {
        start: Math.max(1, Math.min(start, pdfTotalPages)),
        end: Math.max(start, Math.min(end, pdfTotalPages)),
      };
    }

    aiCancelledRef.current = false;
    setLastAnalyzedPageRange(pageRange);
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
        ? (pageRange ? `Belge taranmaya hazırlanıyor (Sayfa ${pageRange.start}-${pageRange.end})...` : 'Belge taranmaya hazırlanıyor (Tam Program Çözümleme)...')
        : 'Belge taranmaya hazırlanıyor (Hızlı Kadro, Şube & Ders Analizi)...'
    );

    try {
      let apiKey = (selectedSchool.geminiApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY || '').trim();
      if (!apiKey || apiKey === 'AQ.Ab8RN6Jo0l8xWLJabe72du_7hkSGRYm9miUkzxV0-ISPbqFC') {
        apiKey = DEFAULT_GEMINI_API_KEY;
      }
      if (!apiKey) {
        console.warn('[Çarşaf UI] ❌ Gemini API anahtarı bulunamadı (okul ayarları, yerel ayarlar ve varsayılan anahtar boş). Analiz durduruldu.');
        setAiParsing(false);
        setAiModalVisible(false);
        Alert.alert(
          'API Anahtarı Bulunamadı ⚠️',
          'Yapay zeka ile çarşaf program analizi yapabilmek için okul ayarlarından veya genel ayarlardan geçerli bir Gemini API Anahtarı giriniz.'
        );
        return;
      }

      const rawModel = (selectedGeminiModel || selectedSchool.geminiModel || (await getGeminiModel()) || DEFAULT_GEMINI_MODEL).trim();
      const model = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'].includes(rawModel) ? DEFAULT_GEMINI_MODEL : rawModel;

      const existingTeacherNames = teachers.map((t: any) => t.fullName || t.name).filter(Boolean);
      const existingClassNames = classes.map((c: any) => `${c.grade}-${c.section.toUpperCase()}`).filter(Boolean);
      const existingLessonNames = lessons.map((l: any) => l.name).filter(Boolean);

      console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║ 🚀 [ÇARŞAF PROGRAM] ANALİZ VE YÜKLEME İŞLEMİ BAŞLATILDI           ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝');
      console.log('[Çarşaf UI] Seçili Okul:', selectedSchool.name, '(ID:', selectedSchool.id, ')');
      console.log('[Çarşaf UI] Dosya Adı:', pendingScheduleFile.name);
      console.log('[Çarşaf UI] Dosya MIME:', pendingScheduleFile.mimeType || 'otomatik');
      console.log('[Çarşaf UI] Dosya URI:', pendingScheduleFile.uri);
      console.log('[Çarşaf UI] Kullanılacak AI Modeli:', model);
      console.log('[Çarşaf UI] API Anahtarı Durumu:', apiKey ? `Mevcut (${apiKey.slice(0, 6)}...${apiKey.slice(-4)})` : '❌ BULUNAMADI!');
      console.log('[Çarşaf UI] Seçilen Analiz Kriterleri:', {
        öğretmenKadrosu: optExtractTeachers,
        şubeler: optExtractClasses,
        açıkDersler: optExtractLessons,
        haftalıkProgramHücreleri: optExtractScheduleItems,
        sayfaAralığı: pageRange ? `${pageRange.start}-${pageRange.end}` : 'Tüm Belge',
      });

      const parsed = await parseMasterScheduleWithAi(
        pendingScheduleFile.uri,
        apiKey,
        pendingScheduleFile.mimeType || (pendingScheduleFile.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        model,
        selectedSchool.id,
        (msg) => {
          console.log(`[Çarşaf UI Aşaması]: ${msg}`);
          if (!aiCancelledRef.current) setAiStageText(msg);
        },
        (m) => {
          console.log(`[Çarşaf UI Aktif Model Değişti]: ${m}`);
          if (!aiCancelledRef.current) setAiActiveModel(m);
        },
        {
          extractTeachers: optExtractTeachers,
          extractClasses: optExtractClasses,
          extractLessons: optExtractLessons,
          extractScheduleItems: optExtractScheduleItems,
          existingTeachers: existingTeacherNames,
          existingClasses: existingClassNames,
          existingLessons: existingLessonNames,
          pageRange,
          isCancelled: () => aiCancelledRef.current,
          autoHealBlocks: optAutoHealBlocks,
        }
      );

      if (aiCancelledRef.current) {
        console.warn('[Çarşaf UI] Kullanıcı analizi iptal etti.');
        return;
      }

      console.log('[Çarşaf UI] Analiz Başarılı! Çıkarılan Veri Özeti:', {
        öğretmenler: (parsed?.teachers || []).length,
        şubeler: (parsed?.classes || []).length,
        dersler: (parsed?.lessons || []).length,
        programSatırları: (parsed?.scheduleItems || []).length,
        zilSaatleri: (parsed?.bellSchedule || []).length,
      });

      setParsedSchedule(parsed);
      if (selectedSchool) {
        saveParsedScheduleDraft(selectedSchool.id, parsed);
        setCachedScheduleDraft(parsed);
      }
      setSaveTeachersChecked(optExtractTeachers);
      setSaveClassesChecked(optExtractClasses);
      setSaveLessonsChecked(optExtractLessons);
      setSaveScheduleChecked(optExtractScheduleItems);

      // AI analizinin harcadığı token ve kota bilgisini ekranda hemen güncelle
      try {
        const usage = await getGeminiUsageStats(selectedSchool.id);
        setUsageStats(usage);
      } catch {}
    } catch (error: any) {
      if (aiCancelledRef.current) return;
      console.error('\n❌ [ÇARŞAF UI ANALİZ HATASI]:', {
        mesaj: error?.message || String(error),
        stack: error?.stack,
        hataNesnesi: error,
      });
      Alert.alert('AI Ayrıştırma Hatası', error?.message || String(error) || 'Belge analiz edilemedi.');
      setAiModalVisible(false);
    } finally {
      setAiParsing(false);
    }
  };

  const executeSaveSchedule = async () => {
    if (!parsedSchedule || !selectedSchool) return;

    const activeTeachers = (parsedSchedule.teachers || []).filter((t) => !(excludedTeachers || []).includes(t));
    const activeClasses = (parsedSchedule.classes || []).filter((c) => !(excludedClasses || []).includes(c));
    const activeLessons = (parsedSchedule.lessons || []).filter((l) => !(excludedLessons || []).includes(l));

    if (!saveTeachersChecked && !saveClassesChecked && !saveLessonsChecked && !saveScheduleChecked) {
      Alert.alert('Seçim Yapılmadı ⚠️', 'Lütfen sisteme aktarılacak en az bir veri türü (öğretmen, sınıf, ders veya program) seçiniz.');
      return;
    }

    if (saveTeachersChecked && activeTeachers.length === 0 && (parsedSchedule.teachers || []).length > 0) {
      Alert.alert('Uyarı', 'Tüm öğretmenleri pasif yaptınız. Lütfen en az bir öğretmeni aktif bırakın veya Öğretmen Kadrosu onay kutusunu kaldırın.');
      return;
    }

    const exTeachersCount = (excludedTeachers || []).length;
    const exClassesCount = (excludedClasses || []).length;
    const exLessonsCount = (excludedLessons || []).length;
    const totalExcluded = exTeachersCount + exClassesCount + exLessonsCount;
    const excludedSummary = totalExcluded > 0
      ? `\n\n📌 Dikkat: Pasif yapılan ${exTeachersCount > 0 ? `${exTeachersCount} öğretmen, ` : ''}${exClassesCount > 0 ? `${exClassesCount} şube, ` : ''}${exLessonsCount > 0 ? `${exLessonsCount} ders ` : ''}ve bunlara ait ders saatleri veritabanına KAYDEDİLMEYECEKTİR.`
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
      const activeTeachers = (parsedSchedule.teachers || []).filter((t) => !excludedTeachers.includes(t));
      const activeClasses = (parsedSchedule.classes || []).filter((c) => !excludedClasses.includes(c));
      const activeLessons = (parsedSchedule.lessons || []).filter((l) => !excludedLessons.includes(l));

      // Pasif yapılan öğretmenlere, sınıflara veya derslere ait ders saatlerini de programdan hariç tut
      const activeScheduleItems = (parsedSchedule.scheduleItems || []).filter((item) => {
        if (!item) return false;
        if (item.teacherName && excludedTeachers.includes(item.teacherName)) return false;
        const secUpper = item.section ? String(item.section).toUpperCase() : '';
        const clsName = `${item.grade}-${secUpper}`;
        if (excludedClasses.includes(clsName)) return false;
        if (item.lessonName && excludedLessons.includes(item.lessonName)) return false;
        return true;
      });

      const filteredSchedule: ParsedScheduleResult = {
        teachers: activeTeachers,
        classes: activeClasses,
        lessons: activeLessons,
        lessonDetails: parsedSchedule.lessonDetails || [],
        bellSchedule: parsedSchedule.bellSchedule || [],
        scheduleItems: activeScheduleItems,
        teacherVerifications: parsedSchedule.teacherVerifications || [],
      };

      console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║ 💾 [ÇARŞAF KAYIT] VERİTABANINA YAZMA ADIMI BAŞLATILDI             ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝');
      console.log('[Çarşaf Kayıt UI] Hedef Okul:', selectedSchool.name, '(ID:', selectedSchool.id, ')');
      console.log('[Çarşaf Kayıt UI] Kayıt Modu (Mevcut Programı Sıfırla):', scheduleSaveMode === 'overwrite');
      console.log('[Çarşaf Kayıt UI] Gönderilecek Veri Özeti:', {
        öğretmenler: filteredSchedule.teachers.length,
        şubeler: filteredSchedule.classes.length,
        dersler: filteredSchedule.lessons.length,
        programHücreleri: filteredSchedule.scheduleItems.length,
        öğretmenleriKaydet: saveTeachersChecked,
        şubeleriKaydet: saveClassesChecked,
        dersleriKaydet: saveLessonsChecked,
        programıKaydet: saveScheduleChecked,
      });

      const result = await saveMasterScheduleToServer(selectedSchool.id, filteredSchedule, {
        overwriteAll: scheduleSaveMode === 'overwrite',
        syncTeachers: saveTeachersChecked,
        syncClasses: saveClassesChecked,
        syncLessons: saveLessonsChecked,
        syncSchedules: saveScheduleChecked,
      });

      console.log('[Çarşaf Kayıt UI Sonucu]:', result);

      if (result.success) {
        console.log('[Çarşaf Kayıt UI] Başarılı! Ekran yenileniyor...');
        Alert.alert('Başarılı 🎉', result.message);
        setAiModalVisible(false);
        setParsedSchedule(null);
        if (selectedSchool) {
          clearParsedScheduleDraft(selectedSchool.id);
          setCachedScheduleDraft(null);
        }
        setExcludedTeachers([]);
        setExcludedClasses([]);
        setExcludedLessons([]);
        loadAllSchoolData(selectedSchool.id);
      } else {
        console.error('[Çarşaf Kayıt UI Hata Yanıtı]:', result.message);
        Alert.alert('Hata', result.message);
      }
    } catch (err: any) {
      console.error('[Çarşaf Kayıt UI Catch Hatası]:', {
        mesaj: err?.message,
        stack: err?.stack,
        tamHata: err,
      });
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

  // --- 6.1 AI İLE EXCEL ÖĞRENCİ YÜKLEME ---

  const handlePickAndParseExcelWithAi = async () => {
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
      setAiStudentModalVisible(true);
      setAiStudentParsing(true);
      setAiStudentResult(null);

      const result = await parseStudentsFromExcelWithAi(file.uri, {
        schoolId: selectedSchool.id,
        apiKey: selectedSchool.geminiApiKey,
        model: selectedSchool.geminiModel,
      });

      setAiStudentParsing(false);

      if (result.success && result.students.length > 0) {
        setAiStudentResult(result);
      } else {
        Alert.alert('AI Ayrıştırma Hatası', result.error || 'Excel dosyasında öğrenci verisi bulunamadı.');
        setAiStudentModalVisible(false);
      }
    } catch (e: any) {
      setAiStudentParsing(false);
      Alert.alert('Hata', e.message || 'Excel dosyası okunamadı.');
      setAiStudentModalVisible(false);
    }
  };

  const handleConfirmAndSaveAiStudents = async () => {
    if (!selectedSchool || !aiStudentResult || aiStudentResult.students.length === 0) return;

    setAiStudentSaving(true);
    try {
      // 1. Excel'de tespit edilen sınıflardan sistemde olmayanları sunucuda otomatik oluştur
      for (const clsTag of aiStudentResult.detectedClasses) {
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
      const saveRes = await saveParsedStudentsToServer(selectedSchool.id, aiStudentResult.students);
      if (saveRes.success) {
        Alert.alert('Başarılı 🎉', saveRes.message);
        setAiStudentModalVisible(false);
        setAiStudentResult(null);
        loadStudents(selectedSchool.id);
        loadClasses(selectedSchool.id);
      } else {
        Alert.alert('Hata', saveRes.message);
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setAiStudentSaving(false);
    }
  };

  // Oturumu Kapatma ve Çıkış (Web ve Mobil Uyumlu)
  const handleLogout = async () => {
    const doLogout = async () => {
      console.log('[SchoolAdmin] Oturum kapatılıyor...');
      await logoutUserRole();
      if (onRoleChange) {
        await onRoleChange(null);
      } else if (navigation?.goBack) {
        navigation.goBack();
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
      }
    };

    if (Platform.OS === 'web') {
      await doLogout();
    } else {
      Alert.alert(
        'Sistemden Çıkış',
        'Yönetici oturumunuzu kapatmak ve giriş ekranına dönmek istiyor musunuz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Çıkış Yap',
            style: 'destructive',
            onPress: doLogout,
          },
        ]
      );
    }
  };

  const handleSwitchToTeacher = async () => {
    await setActiveUserRole('teacher');
    if (onRoleChange) {
      await onRoleChange('teacher');
    } else if (navigation?.switchToTeacher) {
      navigation.switchToTeacher();
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
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

  // --- PROGRAM VE KADRO SIFIRLAMA / TEMİZLEME İŞLEMLERİ ---
  const handleClearAllSchedules = () => {
    if (!selectedSchool) return;
    Alert.alert(
      'Tüm Okul Ders Programını Sıfırla ⚠️',
      `"${selectedSchool.name}" okuluna ait TÜM DERS PROGRAMI (tüm şubelerin ve tüm öğretmenlerin ders saatleri) silinecektir.\n\nBu işlem şube ve öğretmen kayıtlarını silmez, yalnızca ders dağılım saatlerini temizler.\n\nEmin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Tüm Programı Sil',
          style: 'destructive',
          onPress: async () => {
            setScheduleResetModalVisible(false);
            setLoadingAllSchedules(true);
            try {
              const res = await apiRequest(`sync/schedules/clear?schoolId=${selectedSchool.id}&scope=all`, 'DELETE');
              if (res.success) {
                Alert.alert('Temizlendi 🎉', res.data?.message || 'Tüm okul ders programı başarıyla silindi.');
                await Promise.all([loadAllSchedules(), loadScheduleStats()]);
              } else {
                Alert.alert('Hata', res.error || 'Ders programı silinemedi.');
              }
            } catch (e: any) {
              Alert.alert('Hata', e.message);
            } finally {
              setLoadingAllSchedules(false);
            }
          },
        },
      ]
    );
  };

  const handleClearCurrentClassSchedule = () => {
    if (!selectedSchool) return;
    const targetClass = selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : '');
    if (!targetClass) {
      Alert.alert('Uyarı', 'Lütfen silinecek bir şube seçin.');
      return;
    }
    const [grade, section] = targetClass.split('-');
    Alert.alert(
      `${targetClass} Şubesinin Programını Sil ⚠️`,
      `"${targetClass}" şubesine atanmış tüm haftalık ders saatleri silinecektir. İlgili öğretmenlerin programından da bu saatler kalkacaktır.\n\nEmin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Şubeyi Boşalt',
          style: 'destructive',
          onPress: async () => {
            setScheduleResetModalVisible(false);
            setLoadingAllSchedules(true);
            try {
              const res = await apiRequest(
                `sync/schedules/clear?schoolId=${selectedSchool.id}&scope=class&grade=${grade}&section=${section}`,
                'DELETE'
              );
              if (res.success) {
                Alert.alert('Temizlendi 🎉', res.data?.message || `${targetClass} şubesi temizlendi.`);
                await Promise.all([loadAllSchedules(), loadScheduleStats()]);
              } else {
                Alert.alert('Hata', res.error || 'Şube programı silinemedi.');
              }
            } catch (e: any) {
              Alert.alert('Hata', e.message);
            } finally {
              setLoadingAllSchedules(false);
            }
          },
        },
      ]
    );
  };

  const handleClearCurrentTeacherSchedule = () => {
    if (!selectedSchool) return;
    const targetTeacher = selectedTeacherForEditor || (teachers[0] ? teachers[0].fullName : '');
    if (!targetTeacher) {
      Alert.alert('Uyarı', 'Lütfen silinecek bir öğretmen seçin.');
      return;
    }
    Alert.alert(
      `${targetTeacher} Öğretmeninin Programını Sil ⚠️`,
      `"${targetTeacher}" öğretmenine ait tüm haftalık ders saatleri silinecektir. İlgili sınıfların programından da bu saatler boşalacaktır.\n\nEmin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Öğretmeni Boşalt',
          style: 'destructive',
          onPress: async () => {
            setScheduleResetModalVisible(false);
            setLoadingAllSchedules(true);
            try {
              const res = await apiRequest(
                `sync/schedules/clear?schoolId=${selectedSchool.id}&scope=teacher&teacherName=${encodeURIComponent(targetTeacher)}`,
                'DELETE'
              );
              if (res.success) {
                Alert.alert('Temizlendi 🎉', res.data?.message || `${targetTeacher} programı temizlendi.`);
                await Promise.all([loadAllSchedules(), loadScheduleStats()]);
              } else {
                Alert.alert('Hata', res.error || 'Öğretmen programı silinemedi.');
              }
            } catch (e: any) {
              Alert.alert('Hata', e.message);
            } finally {
              setLoadingAllSchedules(false);
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
      const fileName = (asset.name || '').toLowerCase();

      let targetSheet: string | undefined = undefined;
      if (!fileName.endsWith('.docx') && !fileName.endsWith('.doc')) {
        const { getWorkbookSheetNames } = await import('../utils/excelService');
        const sheetNames = await getWorkbookSheetNames(asset as any);
        if (sheetNames.length > 1) {
          // Birden fazla sheet varsa şık ve sınırsız seçim modalını aç
          setPlanSheetPickerSheets(sheetNames);
          setPlanSheetPickerAsset(asset);
          setPlanSheetPickerLesson(lesson);
          setPlanSheetPickerVisible(true);
          return;
        } else if (sheetNames.length === 1) {
          targetSheet = sheetNames[0];
        }
      }

      setAnalyzingPlanFile(true);
      setYearlyPlanModalVisible(true);

      const analysis = await analyzeUploadedDocument(asset as any, targetSheet);
      setDocAnalysis(analysis);
      setSelectedMapping(analysis.suggestedMapping);
    } catch (e: any) {
      Alert.alert('Hata', 'Yıllık plan dosyası okunamadı: ' + e.message);
      setYearlyPlanModalVisible(false);
    } finally {
      setAnalyzingPlanFile(false);
    }
  };

  // Sheet seçim modalından bir sayfa seçilince tetiklenir
  const handleProceedWithPlanSheet = async (selectedSheet: string) => {
    setPlanSheetPickerVisible(false);
    if (!planSheetPickerAsset || !planSheetPickerLesson) return;

    setSelectedLessonForPlan(planSheetPickerLesson);
    setAnalyzingPlanFile(true);
    setYearlyPlanModalVisible(true);

    try {
      const analysis = await analyzeUploadedDocument(planSheetPickerAsset as any, selectedSheet);
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
        selectedLessonForPlan.weeklyHours || 2,
        docAnalysis.detectedSchoolYear || new Date().getFullYear()
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

        const fullBase64 = `data:image/jpeg;base64,${base64}`;
        photos.push({
          studentNumber,
          photoBase64: fullBase64,
          base64Data: fullBase64,
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
        schoolId: selectedSchool.id,
        schoolCode: selectedSchool.code,
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

  // Filtrelenmiş ve Sıralanmış Öğretmen Listesi
  const filteredTeachers = teachers
    .filter((t) => {
      if (teacherLoginFilter === 'logged_in') return !!t.lastLoginAt;
      if (teacherLoginFilter === 'not_logged_in') return !t.lastLoginAt;
      return true;
    })
    .filter((t) => {
      if (!teacherSearchQuery.trim()) return true;
      const q = teacherSearchQuery.trim().toLowerCase();
      const matchName = (t.fullName || '').toLowerCase().includes(q);
      const matchUser = (t.username || '').toLowerCase().includes(q);
      const matchBranch = (t.branch || '').toLowerCase().includes(q);
      return matchName || matchUser || matchBranch;
    })
    .sort((a, b) => {
      const nameA = (a.fullName || a.username || '').trim();
      const nameB = (b.fullName || b.username || '').trim();
      if (teacherSortOrder === 'desc') {
        return nameB.localeCompare(nameA, 'tr');
      }
      return nameA.localeCompare(nameB, 'tr');
    });

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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {isStaff ? '🛡️ Okul İdarecisi Paneli' : 'Okul Yönetim Paneli'}
          </Text>
          <TouchableOpacity
            style={styles.headerSchoolDropdownBtn}
            onPress={() => setSchoolSelectModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="business" size={13} color="#4F46E5" />
            <Text style={styles.headerSchoolDropdownText} numberOfLines={1}>
              {selectedSchool?.name || 'Okul Seçiniz'}
            </Text>
            <Ionicons name="chevron-down" size={13} color="#4F46E5" />
          </TouchableOpacity>
        </View>

        {/* Sağ Butonlar: Çıkış ve Menü */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.hamburgerBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
            activeOpacity={0.7}
            accessibilityLabel="Oturumu Kapat / Rol Değiştir"
          >
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenuDrawerVisible(true)}
            style={styles.hamburgerBtn}
            activeOpacity={0.7}
            accessibilityLabel="Menü"
          >
            <Ionicons name="menu" size={24} color="#4F46E5" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSchools(); }} />}
      >
        {/* 🏫 BİRLEŞTİRİLMİŞ OKUL VE ÖĞRETMEN BAĞLANTI KODU KARTI */}
        <View style={styles.combinedSchoolCard}>
          {!isStaff && (
            <>
              <View style={styles.schoolSelectorHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="business" size={13} color="#4F46E5" />
                  <Text style={styles.schoolSelectorLabel}>
                    YÖNETTİĞİNİZ OKULLAR {schools.length > 0 ? `(${schools.length})` : ''}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {selectedSchool && (
                    <>
                      <TouchableOpacity
                        onPress={() => handleOpenEditSchool(selectedSchool)}
                        style={styles.editSchoolSmallBtn}
                        activeOpacity={0.7}
                        accessibilityLabel="Seçili Okulu Düzenle"
                      >
                        <Ionicons name="pencil" size={12} color="#4F46E5" />
                        <Text style={styles.editSchoolSmallBtnText}>Düzenle</Text>
                      </TouchableOpacity>
                      {schools.length > 1 && (
                        <TouchableOpacity
                          onPress={() => handleDeleteSchool(selectedSchool)}
                          style={styles.deleteSchoolSmallBtn}
                          activeOpacity={0.7}
                          accessibilityLabel="Seçili Okulu Sil"
                        >
                          <Ionicons name="trash-outline" size={12} color="#DC2626" />
                          <Text style={styles.deleteSchoolSmallBtnText}>Sil</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                  <TouchableOpacity
                    onPress={() => setCreateModalVisible(true)}
                    style={styles.addSchoolSmallBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle" size={12} color="#166534" />
                    <Text style={styles.addSchoolSmallBtnText}>Yeni Okul</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.schoolChipsScroll}>
                {schools.map(s => {
                  const isSelected = selectedSchool?.id === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => handleSelectSchool(s)}
                      style={[styles.schoolChip, isSelected && styles.schoolChipSelected]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={isSelected ? "checkmark-circle" : "business-outline"} size={13} color={isSelected ? "#fff" : "#4F46E5"} />
                      <Text style={[styles.schoolChipText, isSelected && styles.schoolChipTextSelected]}>
                        {s.name}
                      </Text>
                      <View style={[styles.schoolCodeTag, isSelected && styles.schoolCodeTagSelected]}>
                        <Text style={[styles.schoolCodeTagText, isSelected && styles.schoolCodeTagTextSelected]}>
                          {s.code}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 2 }}>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleOpenEditSchool(s);
                          }}
                          style={{ padding: 3, borderRadius: 4, backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#E2E8F0' }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityLabel={`${s.name} Düzenle`}
                        >
                          <Ionicons name="pencil" size={11} color={isSelected ? '#fff' : '#4F46E5'} />
                        </TouchableOpacity>
                        {schools.length > 1 && (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleDeleteSchool(s);
                            }}
                            style={{ padding: 3, borderRadius: 4, backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#FEE2E2' }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityLabel={`${s.name} Sil`}
                          >
                            <Ionicons name="trash-outline" size={11} color={isSelected ? '#fff' : '#DC2626'} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {schools.length === 0 && (
                  <TouchableOpacity
                    onPress={() => setCreateModalVisible(true)}
                    style={[styles.schoolChip, { borderColor: '#166534', backgroundColor: '#F0FDF4' }]}
                  >
                    <Ionicons name="add" size={14} color="#166534" />
                    <Text style={[styles.schoolChipText, { color: '#166534' }]}>Henüz Okul Yok - İlk Okulu Ekle</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </>
          )}

          {/* Entegre Öğretmen Bağlantı Kodu Şeridi */}
          {selectedSchool && (
            <View style={[styles.integratedCodeSection, !isStaff && { marginTop: 8 }]}>
              <View style={styles.integratedCodeLeft}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="key" size={11} color="#4F46E5" />
                  <Text style={styles.integratedCodeLabel}>ÖĞRETMEN BAĞLANTI KODU</Text>
                </View>
                <Text style={styles.integratedCodeValue}>{selectedSchool.code}</Text>
              </View>
              <TouchableOpacity
                style={styles.integratedCopyBtn}
                onPress={() => handleCopyCode(selectedSchool.code)}
                activeOpacity={0.7}
              >
                <Ionicons name="copy-outline" size={13} color="#4F46E5" />
                <Text style={styles.integratedCopyBtnText}>Kopyala</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
              📅 Program & Doğruluk Denetimi
            </Text>
            {!!scheduleStats?.conflictsCount && scheduleStats.conflictsCount > 0 && (
              <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, marginLeft: 4 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                  {scheduleStats.conflictsCount}
                </Text>
              </View>
            )}
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
                  <Text style={styles.sectionTitle}>
                    Bağlı Öğretmen Kadrosu ({filteredTeachers.length}{filteredTeachers.length !== teachers.length ? ` / ${teachers.length}` : ''})
                  </Text>
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

                {/* Öğretmen Arama & Ada Göre Sıralama Çubuğu */}
                {teachers.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <View style={[styles.searchBox, { flex: 1, marginBottom: 0 }]}>
                      <Ionicons name="search" size={18} color={Colors.textMuted} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Öğretmen adı veya branş ile ara..."
                        value={teacherSearchQuery}
                        onChangeText={setTeacherSearchQuery}
                        placeholderTextColor={Colors.textMuted}
                      />
                      {teacherSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setTeacherSearchQuery('')}>
                          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#EEF2FF',
                        borderWidth: 1,
                        borderColor: '#C7D2FE',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        height: 38,
                        gap: 4,
                      }}
                      onPress={() => setTeacherSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    >
                      <Ionicons
                        name={teacherSortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                        size={14}
                        color="#4F46E5"
                      />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#4F46E5' }}>
                        {teacherSortOrder === 'desc' ? 'Z ➔ A' : 'A ➔ Z'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {filteredTeachers.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name={teacherSearchQuery.trim() ? "search-outline" : "people-outline"} size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {teacherSearchQuery.trim()
                        ? `"${teacherSearchQuery}" aramasına uygun öğretmen bulunamadı.`
                        : 'Henüz sisteme eklenmiş bir öğretmen bulunmuyor.'}
                    </Text>
                  </View>
                ) : (
                  filteredTeachers.map((teacher) => (
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
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.sectionTitle}>Okul Müfredat Dersleri ({filteredLessons.length}/{lessons.length})</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      Her sınıf düzeyi için yıllık planlar ayrı yüklenir ve programla otomatik eşleşir.
                    </Text>
                  </View>
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

                {/* Arama & Kademe Filtreleri */}
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  {/* Arama Inputu */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 8 }}>
                    <Ionicons name="search" size={16} color="#94A3B8" />
                    <TextInput
                      style={{ flex: 1, marginLeft: 8, fontSize: 13, color: '#1E293B', padding: 0 }}
                      placeholder="Ders adı, kısa kod veya kademe ara (örn: Seçmeli Fizik, S.FZK, 11)..."
                      placeholderTextColor="#94A3B8"
                      value={lessonSearchQuery}
                      onChangeText={setLessonSearchQuery}
                    />
                    {lessonSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setLessonSearchQuery('')}>
                        <Ionicons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Kademe Filtre Butonları */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <TouchableOpacity
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                        lessonGradeFilter === 'all' && { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }
                      ]}
                      onPress={() => setLessonGradeFilter('all')}
                    >
                      <Text style={[{ fontSize: 12, fontWeight: '700', color: '#475569' }, lessonGradeFilter === 'all' && { color: '#FFFFFF' }]}>
                        Tüm Kademeler ({lessons.length})
                      </Text>
                    </TouchableOpacity>

                    {['9', '10', '11', '12'].map((g) => {
                      const count = lessons.filter(l => String(l.grade || '').trim() === g || String(l.grade || '').trim().startsWith(g)).length;
                      const isActive = lessonGradeFilter === g;
                      return (
                        <TouchableOpacity
                          key={g}
                          style={[
                            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                            isActive && { backgroundColor: '#0284C7', borderColor: '#0284C7' }
                          ]}
                          onPress={() => setLessonGradeFilter(g as any)}
                        >
                          <Text style={[{ fontSize: 12, fontWeight: '700', color: '#475569' }, isActive && { color: '#FFFFFF' }]}>
                            {g}. Sınıf ({count})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                        lessonGradeFilter === 'common' && { backgroundColor: '#64748B', borderColor: '#64748B' }
                      ]}
                      onPress={() => setLessonGradeFilter('common')}
                    >
                      <Text style={[{ fontSize: 12, fontWeight: '700', color: '#475569' }, lessonGradeFilter === 'common' && { color: '#FFFFFF' }]}>
                        Ortak / Genel ({lessons.filter(l => !l.grade || l.grade === 'Tüm Kademeler' || l.grade === 'Ortak').length})
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>

                {filteredLessons.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {lessons.length === 0 ? 'Henüz okulunuza kayıtlı ders bulunmuyor.' : 'Seçilen filtreye uygun ders bulunamadı.'}
                    </Text>
                  </View>
                ) : (
                  filteredLessons.map((lesson) => {
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

                    // Kademe Renk Rozeti
                    const gradeNum = String(lesson.grade || '').trim();
                    const isGrade9 = gradeNum === '9';
                    const isGrade10 = gradeNum === '10';
                    const isGrade11 = gradeNum === '11';
                    const isGrade12 = gradeNum === '12';
                    const badgeBg = isGrade9 ? '#DCFCE7' : isGrade10 ? '#E0F2FE' : isGrade11 ? '#EEF2FF' : isGrade12 ? '#F5F3FF' : '#F1F5F9';
                    const badgeBorder = isGrade9 ? '#86EFAC' : isGrade10 ? '#7DD3FC' : isGrade11 ? '#C7D2FE' : isGrade12 ? '#DDD6FE' : '#CBD5E1';
                    const badgeTextColor = isGrade9 ? '#15803D' : isGrade10 ? '#0369A1' : isGrade11 ? '#4338CA' : isGrade12 ? '#6D28D9' : '#475569';

                    return (
                      <View key={lesson.id} style={styles.lessonCard}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {/* Belirgin Kademe Rozeti */}
                            <View style={{
                              backgroundColor: badgeBg,
                              borderColor: badgeBorder,
                              borderWidth: 1.5,
                              paddingHorizontal: 8,
                              paddingVertical: 2.5,
                              borderRadius: 6,
                            }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: badgeTextColor }}>
                                {lesson.grade && lesson.grade !== 'Tüm Kademeler' ? `${lesson.grade}. Sınıf` : 'Tüm Kademeler'}
                              </Text>
                            </View>

                            <Text style={[styles.lessonName, { fontSize: 15, fontWeight: '800' }]}>{lesson.name}</Text>
                            {lesson.shortCode && (
                              <View style={styles.shortCodeTag}>
                                <Text style={styles.shortCodeText}>{lesson.shortCode}</Text>
                              </View>
                            )}
                          </View>

                          <Text style={[styles.lessonSub, { marginTop: 4 }]}>
                            Haftalık Ders Yükü: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{lesson.weeklyHours || 2} Saat / Hafta</Text>
                          </Text>

                          {/* Yıllık Plan Durum Göstergesi */}
                          {hasPlan ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                              <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#16A34A' }}>
                                Yıllık Plan Yüklü ({lessonPlans.length} Hafta)
                              </Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="alert-circle-outline" size={14} color="#D97706" />
                              <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#D97706' }}>
                                Plan Yüklenmedi ({lesson.grade ? `${lesson.grade}. Sınıf Planı Bekleniyor` : 'Genel Plan Bekleniyor'})
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
                            onPress={() => handleDeleteLesson(lesson.id, `${lesson.name} (${lesson.grade || 'Tüm Kademeler'})`)}
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
                      style={[styles.primaryAddBtn, { backgroundColor: '#4338CA' }]}
                      onPress={handlePickPdfAndExtractPhotos}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="document-attach-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>PDF'den Foto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#9333EA' }]}
                      onPress={handlePickAndExtractPhotosWithAi}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>AI ile Foto</Text>
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
                      style={[styles.primaryAddBtn, { backgroundColor: '#8B5CF6' }]}
                      onPress={handlePickAndParseExcelWithAi}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>AI ile Excel</Text>
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
                {/* 0.1 KAYDEDİLMEMİŞ SON ÇARŞAF ANALİZİ TASLAĞI (VARSA) */}
                {cachedScheduleDraft && (
                  <View style={{
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1.5,
                    borderColor: '#86EFAC',
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Ionicons name="document-text" size={18} color="#16A34A" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#166534' }}>
                          💾 Kaydedilmemiş Son Çarşaf Analizi
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#15803D' }}>
                        {(cachedScheduleDraft.teachers || []).length} Öğretmen, {(cachedScheduleDraft.scheduleItems || []).length} Ders Saati hafızada hazır.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setParsedSchedule(cachedScheduleDraft);
                          setAiModalVisible(true);
                        }}
                        style={{
                          backgroundColor: '#16A34A',
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Taslağı Aç ➔</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          if (selectedSchool) await clearParsedScheduleDraft(selectedSchool.id);
                          setCachedScheduleDraft(null);
                        }}
                        style={{
                          backgroundColor: '#FEE2E2',
                          paddingHorizontal: 8,
                          paddingVertical: 7,
                          borderRadius: 8,
                        }}
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 0.2 SON YÜKLENEN BELGE İLE HIZLI TEKRAR TARA (VARSA) */}
                {cachedScheduleDoc && (
                  <TouchableOpacity
                    onPress={() => {
                      setPendingScheduleFile({
                        name: cachedScheduleDoc.name,
                        uri: cachedScheduleDoc.uri,
                        mimeType: cachedScheduleDoc.mimeType,
                        size: cachedScheduleDoc.size,
                      });
                      setPdfTotalPages(cachedScheduleDoc.totalPages || 0);
                      setPdfPageRangeMode('all');
                      setPdfStartPage('1');
                      setPdfEndPage(String(cachedScheduleDoc.totalPages || 1));
                      setSchedulePreOptionsModalVisible(true);
                    }}
                    style={{
                      backgroundColor: '#EEF2FF',
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="document-attach" size={20} color="#4F46E5" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#312E81' }} numberOfLines={1}>
                          📄 Son Belge: {cachedScheduleDoc.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#6366F1' }}>
                          {cachedScheduleDoc.totalPages ? `${cachedScheduleDoc.totalPages} Sayfa • ` : ''}Dosya seçmeden hızlıca tekrar tara
                        </Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#4F46E5', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Hızlı Tara ➔</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* 1. ÇARŞAF PROGRAM YÜKLEME SEÇENEKLERİ (PDF & EXCEL) */}
                <View style={{ marginBottom: 12, gap: 10 }}>
                  {/* A) AI ile PDF / Fotoğraf Yükleme Butonu */}
                  <TouchableOpacity
                    style={[styles.aiBanner, { marginBottom: 0 }]}
                    onPress={() => handlePickAndAnalyzeSchedule('pdf')}
                  >
                    <View style={styles.aiBannerIcon}>
                      <Ionicons name="sparkles" size={26} color="#fff" />
                    </View>
                    <View style={styles.aiBannerTextContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.aiBannerTitle}>PDF / Fotoğraf ile Çarşaf Yükle</Text>
                        <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#4F46E5' }}>AI OCR</Text>
                        </View>
                      </View>
                      <Text style={styles.aiBannerDesc}>
                        PDF veya fotoğraf çarşafını yükleyin; öğretmenler, sınıflar ve dersler yapay zeka ile otomatik taranıp kurulsun.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                  </TouchableOpacity>

                  {/* B) Excel (.xlsx, .xls) ile Çarşaf Yükleme Butonu */}
                  <TouchableOpacity
                    style={[
                      styles.aiBanner,
                      {
                        marginBottom: 0,
                        borderColor: '#A7F3D0',
                        backgroundColor: '#F0FDF4',
                      },
                    ]}
                    onPress={() => handlePickAndAnalyzeSchedule('excel')}
                  >
                    <View style={[styles.aiBannerIcon, { backgroundColor: '#10B981' }]}>
                      <Ionicons name="grid" size={24} color="#fff" />
                    </View>
                    <View style={styles.aiBannerTextContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.aiBannerTitle, { color: '#065F46' }]}>Excel Tablosu (.xlsx) ile Çarşaf Yükle</Text>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669' }}>YENİ</Text>
                        </View>
                      </View>
                      <Text style={[styles.aiBannerDesc, { color: '#047857' }]}>
                        Excel çarşaf tablonuzu yükleyin; sayfaları ve satırları inceleyip doğrudan taslak programa dönüştürün.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#10B981" />
                  </TouchableOpacity>
                </View>

                {/* 1.1 ÇARŞAF PARÇA HAVUZU BANNERI */}
                <TouchableOpacity
                  style={[
                    styles.batchPoolBanner,
                    scheduleBatches.length > 0 && styles.batchPoolBannerActive,
                  ]}
                  onPress={() => setBatchPoolModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.batchPoolIcon, scheduleBatches.length > 0 && { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons
                      name="file-tray-full"
                      size={22}
                      color={scheduleBatches.length > 0 ? '#16A34A' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.batchPoolTitle}>Çarşaf Parça Havuzu & Yeniden Yerleştir</Text>
                      <View style={[styles.batchPoolCountBadge, scheduleBatches.length > 0 && { backgroundColor: '#16A34A' }]}>
                        <Text style={styles.batchPoolCountBadgeText}>{scheduleBatches.length} Parça</Text>
                      </View>
                    </View>
                    <Text style={styles.batchPoolDesc}>
                      {scheduleBatches.length > 0
                        ? `${scheduleBatches.length} parça depolandı. PDF okumaya gerek kalmadan tek tıkla birleştirip sıfırdan kurun.`
                        : 'Büyük PDF’leri 2 veya daha fazla parça halinde yükleyip burada biriktirebilirsiniz.'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>

                {/* 1.2 AKTİF PROGRAMI İNCELEME & DÜZENLEME TASLAĞINA AL */}
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={handleLoadActiveScheduleToDraft}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{ backgroundColor: '#EEF2FF', padding: 10, borderRadius: 12 }}>
                      <Ionicons name="clipboard" size={22} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                        📋 Kayıtlı Programı Taslak Olarak Aç & Canlı Düzenle
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        Sistemdeki tüm kayıtlı programı görsel inceleme ekranına geri yükler; çakışmaları elle veya tek tek AI ile düzeltebilirsiniz.
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.sanityResetMenuBtn}
                        onPress={() => setScheduleResetModalVisible(true)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.sanityResetMenuBtnText}>Sıfırla / Temizle</Text>
                      </TouchableOpacity>
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
                    <TouchableOpacity
                      style={[styles.sanityBox, { borderColor: '#818CF8', backgroundColor: '#EEF2FF' }]}
                      onPress={() => handleOpenEditSchool(selectedSchool)}
                      activeOpacity={0.7}
                      accessibilityLabel="Günlük ders saatini değiştir"
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.sanityBoxVal, { color: '#4F46E5' }]}>{scheduleDailyHours}</Text>
                        <Ionicons name="pencil-sharp" size={12} color="#4F46E5" />
                      </View>
                      <Text style={[styles.sanityBoxLbl, { color: '#4338CA' }]}>Günlük Ders Saati</Text>
                      <Text style={[styles.sanityBoxSub, { color: '#6366F1' }]}>
                        {scheduleDailyHours * 5} Saat/Hafta (Değiştir)
                      </Text>
                    </TouchableOpacity>
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

                  {/* Hızlı Günlük Saat Ayarlayıcı */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    marginTop: 8,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="time-outline" size={16} color="#4F46E5" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                        Okul Günlük Ders Saati:
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {[6, 7, 8, 9, 10].map((h) => {
                        const isActive = scheduleDailyHours === h;
                        return (
                          <TouchableOpacity
                            key={h}
                            onPress={() => handleChangeDailyHours(h)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: isActive ? '#4F46E5' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: isActive ? '#4338CA' : '#CBD5E1',
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isActive ? '#FFFFFF' : '#475569' }}>
                              {h} Saat
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Çakışma Uyarıları Bölümü (Conflicts - ListBox Formatında) */}
                  {scheduleStats?.conflictsCount > 0 ? (
                    (() => {
                      const q = (conflictSearchQuery || '').trim().toLowerCase();
                      const filteredConflicts = (scheduleStats.conflicts || []).filter((c: any) => {
                        if (!q) return true;
                        return (
                          (c.description || '').toLowerCase().includes(q) ||
                          (c.className || '').toLowerCase().includes(q) ||
                          (c.teacherName || '').toLowerCase().includes(q) ||
                          (c.title || '').toLowerCase().includes(q)
                        );
                      });

                      return (
                        <View style={styles.conflictAlertBanner}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons name="warning" size={18} color="#DC2626" />
                              <Text style={styles.conflictAlertTitle}>
                                ⚠️ {scheduleStats.conflictsCount} Çakışma Tespit Edildi
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: '#B91C1C' }}>
                                {filteredConflicts.length} gösteriliyor
                              </Text>
                            </View>
                          </View>

                          {/* Hızlı Filtre / Arama Girişi */}
                          {scheduleStats.conflicts.length > 5 && (
                            <View style={styles.listboxSearchWrap}>
                              <Ionicons name="search" size={14} color="#94A3B8" style={{ marginLeft: 8 }} />
                              <TextInput
                                style={styles.listboxSearchInput}
                                placeholder="Şube veya öğretmen ara (örn: 10-A, Ahmet)..."
                                placeholderTextColor="#94A3B8"
                                value={conflictSearchQuery}
                                onChangeText={setConflictSearchQuery}
                              />
                              {!!conflictSearchQuery && (
                                <TouchableOpacity onPress={() => setConflictSearchQuery('')} style={{ padding: 6 }}>
                                  <Ionicons name="close-circle" size={15} color="#94A3B8" />
                                </TouchableOpacity>
                              )}
                            </View>
                          )}

                          {/* Kaydırılabilir Çakışma ListBox */}
                          <ScrollView
                            nestedScrollEnabled={true}
                            style={{ maxHeight: 260, marginTop: 4 }}
                            contentContainerStyle={{ gap: 6, paddingRight: 2 }}
                            showsVerticalScrollIndicator={true}
                          >
                            {filteredConflicts.length === 0 ? (
                              <View style={{ padding: 12, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600' }}>
                                  Arama kriterine uygun çakışma bulunamadı.
                                </Text>
                              </View>
                            ) : (
                              filteredConflicts.map((c: any, cIdx: number) => (
                                <TouchableOpacity
                                  key={cIdx}
                                  style={styles.conflictItemBox}
                                  activeOpacity={0.7}
                                  onPress={() => {
                                    if (c.className) {
                                      setScheduleSubView('editor');
                                      setScheduleEditorMode('class');
                                      setSelectedClassForEditor(c.className);
                                    } else if (c.teacherName) {
                                      setScheduleSubView('editor');
                                      setScheduleEditorMode('teacher');
                                      setSelectedTeacherForEditor(c.teacherName);
                                    }
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Text style={styles.conflictItemType}>
                                        {c.type === 'TEACHER_CONFLICT' ? '👨‍🏫 Öğretmen' : '🏫 Şube'}:
                                      </Text>
                                      <View style={{ backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#991B1B' }}>
                                          {c.dayOfWeek}. Gün {c.lessonHour}. Ders
                                        </Text>
                                      </View>
                                    </View>
                                    <Text style={{ fontSize: 11, color: '#4F46E5', fontWeight: '700' }}>
                                      {c.className || c.teacherName} Düzenle ➔
                                    </Text>
                                  </View>
                                  <Text style={styles.conflictItemDesc}>{c.description}</Text>
                                </TouchableOpacity>
                              ))
                            )}
                          </ScrollView>
                        </View>
                      );
                    })()
                  ) : (
                    <View style={[{ gap: 8 }] as any}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0' } as any}>
                        <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534', flex: 1 } as any}>
                          Harika! Ders saatlerinde veya öğretmen çizelgelerinde hiçbir çakışma bulunmuyor.
                        </Text>
                      </View>
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

                {/* 3. GÖRÜNÜM GEÇİŞ SEKMESİ (Canlı Düzenleyici vs İstatistik & Dağılım) */}
                <View style={styles.scheduleSubTabSegment}>
                  <TouchableOpacity
                    style={[styles.scheduleSubTabBtn, scheduleSubView === 'editor' && styles.scheduleSubTabBtnActive]}
                    onPress={() => setScheduleSubView('editor')}
                  >
                    <Ionicons name="create-outline" size={16} color={scheduleSubView === 'editor' ? '#FFFFFF' : '#4F46E5'} />
                    <Text style={[styles.scheduleSubTabBtnText, scheduleSubView === 'editor' && styles.scheduleSubTabBtnTextActive]}>
                      ✏️ Canlı Program Düzenleyici
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.scheduleSubTabBtn, scheduleSubView === 'analytics' && styles.scheduleSubTabBtnActive]}
                    onPress={() => {
                      setScheduleSubView('analytics');
                      if (!scheduleStats?.teacherWorkloads) {
                        loadScheduleStats();
                      }
                    }}
                  >
                    <Ionicons name="stats-chart" size={16} color={scheduleSubView === 'analytics' ? '#FFFFFF' : '#4F46E5'} />
                    <Text style={[styles.scheduleSubTabBtnText, scheduleSubView === 'analytics' && styles.scheduleSubTabBtnTextActive]}>
                      📊 Detaylı Dağılım & İstatistikler
                    </Text>
                  </TouchableOpacity>
                </View>

                {scheduleSubView === 'editor' && (
                  <View style={styles.interactiveEditorCard}>
                  <View style={styles.interactiveHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.interactiveTitle}>✏️ Canlı Ders Programı Düzenleyici</Text>
                      <Text style={styles.interactiveSub}>
                        Hatalı saatlere dokunarak anında ders atayın, öğretmeni değiştirin veya boşaltın.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.editorClearScopeBtn}
                      onPress={() => {
                        if (scheduleEditorMode === 'class') {
                          handleClearCurrentClassSchedule();
                        } else {
                          handleClearCurrentTeacherSchedule();
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={13} color="#DC2626" />
                      <Text style={styles.editorClearScopeBtnText}>
                        {scheduleEditorMode === 'class' ? 'Bu Şubeyi Boşalt' : 'Bu Öğretmeni Boşalt'}
                      </Text>
                    </TouchableOpacity>
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
                    <View style={styles.editorTeacherListBoxWrap}>
                      {/* Üst Başlık & Aktif Öğretmen Özeti */}
                      <View style={styles.editorTeacherHeaderRow}>
                        <View style={{ flex: 1, minWidth: 200 }}>
                          <Text style={styles.editorSelectorLabel}>Düzenlenecek Öğretmen (Listbox):</Text>
                          {currentActiveTeacher && (
                            <View style={styles.editorActiveTeacherBanner}>
                              <View style={styles.editorActiveTeacherAvatar}>
                                <Ionicons name="person" size={16} color="#4F46E5" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <Text style={styles.editorActiveTeacherName}>
                                    {currentActiveTeacher.fullName}
                                  </Text>
                                  {currentActiveTeacher.branch && (
                                    <View style={styles.editorTeacherBranchBadge}>
                                      <Text style={styles.editorTeacherBranchBadgeText}>
                                        {currentActiveTeacher.branch}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.editorActiveTeacherMeta}>
                                  Haftalık Ders Yükü: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{getTeacherTotalHours(currentActiveTeacher.fullName)} Saat</Text>
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Hızlı Önceki / Sonraki Butonları */}
                        <View style={styles.editorTeacherNavButtons}>
                          <TouchableOpacity
                            style={styles.editorTeacherNavBtn}
                            onPress={handleSelectPrevTeacher}
                            accessibilityLabel="Önceki Öğretmen"
                          >
                            <Ionicons name="chevron-back" size={16} color="#4F46E5" />
                            <Text style={styles.editorTeacherNavBtnText}>Önceki</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.editorTeacherNavBtn}
                            onPress={handleSelectNextTeacher}
                            accessibilityLabel="Sonraki Öğretmen"
                          >
                            <Text style={styles.editorTeacherNavBtnText}>Sonraki</Text>
                            <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Arama ve Dikey Listbox */}
                      <View style={styles.editorListBoxContainer}>
                        {/* Arama Çubuğu */}
                        <View style={styles.editorListBoxSearchRow}>
                          <Ionicons name="search" size={16} color="#64748B" style={{ marginLeft: 8 }} />
                          <TextInput
                            style={styles.editorListBoxSearchInput}
                            placeholder="Öğretmen veya branş ara... (örn: Matematik, Ayşe)"
                            placeholderTextColor="#94A3B8"
                            value={teacherListBoxSearch}
                            onChangeText={setTeacherListBoxSearch}
                          />
                          {teacherListBoxSearch.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setTeacherListBoxSearch('')}
                              style={{ padding: 6, marginRight: 4 }}
                            >
                              <Ionicons name="close-circle" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                          )}
                          <View style={styles.editorListBoxCountBadge}>
                            <Text style={styles.editorListBoxCountBadgeText}>
                              {filteredTeachersForListBox.length} / {teachers.length}
                            </Text>
                          </View>
                        </View>

                        {/* Dikey Kaydırılabilir Öğretmen Listbox */}
                        <ScrollView
                          nestedScrollEnabled={true}
                          style={styles.editorListBoxScrollView}
                          contentContainerStyle={styles.editorListBoxScrollContent}
                          showsVerticalScrollIndicator={true}
                        >
                          {filteredTeachersForListBox.length === 0 ? (
                            <View style={styles.editorListBoxEmptyWrap}>
                              <Ionicons name="search-outline" size={24} color="#94A3B8" />
                              <Text style={styles.editorListBoxEmptyText}>
                                "{teacherListBoxSearch}" aramasına uygun öğretmen bulunamadı.
                              </Text>
                            </View>
                          ) : (
                            filteredTeachersForListBox.map((tch: any, idx: number) => {
                              const isSel = (currentActiveTeacher?.fullName || '') === tch.fullName;
                              const tchHours = getTeacherTotalHours(tch.fullName);

                              return (
                                <TouchableOpacity
                                  key={tch.id || tch.fullName || idx}
                                  style={[
                                    styles.editorListBoxItem,
                                    isSel && styles.editorListBoxItemActive,
                                  ]}
                                  onPress={() => setSelectedTeacherForEditor(tch.fullName)}
                                  activeOpacity={0.7}
                                >
                                  {/* Sol: İkon & İsim */}
                                  <View style={styles.editorListBoxItemLeft}>
                                    <View
                                      style={[
                                        styles.editorListBoxItemIcon,
                                        isSel && styles.editorListBoxItemIconActive,
                                      ]}
                                    >
                                      <Ionicons
                                        name="person"
                                        size={13}
                                        color={isSel ? '#FFFFFF' : '#64748B'}
                                      />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text
                                        style={[
                                          styles.editorListBoxItemName,
                                          isSel && styles.editorListBoxItemNameActive,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {tch.fullName}
                                      </Text>
                                      {tch.branch && (
                                        <Text
                                          style={[
                                            styles.editorListBoxItemBranch,
                                            isSel && styles.editorListBoxItemBranchActive,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {tch.branch}
                                        </Text>
                                      )}
                                    </View>
                                  </View>

                                  {/* Sağ: Ders Saati & Seçim Durumu */}
                                  <View style={styles.editorListBoxItemRight}>
                                    <View
                                      style={[
                                        styles.editorListBoxHourBadge,
                                        isSel && styles.editorListBoxHourBadgeActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.editorListBoxHourBadgeText,
                                          isSel && styles.editorListBoxHourBadgeTextActive,
                                        ]}
                                      >
                                        {tchHours}s
                                      </Text>
                                    </View>
                                    <Ionicons
                                      name={isSel ? 'radio-button-on' : 'radio-button-off'}
                                      size={18}
                                      color={isSel ? '#4F46E5' : '#CBD5E1'}
                                    />
                                  </View>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </ScrollView>
                      </View>
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
                              let matchedItems: any[] = [];
                              if (scheduleEditorMode === 'class') {
                                const [g, sec] = activeClass.split('-');
                                matchedItems = allSchoolSchedules.filter(
                                  (s) =>
                                    String(s.grade) === String(g) &&
                                    (s.section || '').trim().toUpperCase() === (sec || '').trim().toUpperCase() &&
                                    s.dayOfWeek === dayNumber &&
                                    s.lessonHour === lessonHour
                                );
                              } else {
                                matchedItems = allSchoolSchedules.filter(
                                  (s) =>
                                    normalizeTeacherMatch(s.teacherName, activeTeacher) &&
                                    s.dayOfWeek === dayNumber &&
                                    s.lessonHour === lessonHour
                                );
                              }

                              const matchedItem = matchedItems[0] || null;
                              const hasConflict = matchedItems.length > 1;
                              const isFilled = !!matchedItem && !!matchedItem.lessonName;

                              return (
                                <TouchableOpacity
                                  key={lessonHour}
                                  style={[
                                    styles.slotCell,
                                    isFilled ? styles.slotCellFilled : styles.slotCellEmpty,
                                    hasConflict && { borderColor: '#EF4444', borderWidth: 1.5, backgroundColor: '#FEF2F2' },
                                  ]}
                                  onPress={() => {
                                    if (scheduleEditorMode === 'class') {
                                      const [g, sec] = activeClass.split('-');
                                      handleOpenSlotModal({
                                        dayOfWeek: dayNumber,
                                        lessonHour,
                                        grade: g,
                                        section: sec,
                                        existingItem: matchedItem,
                                        conflictingItems: matchedItems,
                                      });
                                    } else {
                                      handleOpenSlotModal({
                                        dayOfWeek: dayNumber,
                                        lessonHour,
                                        teacherName: activeTeacher,
                                        existingItem: matchedItem,
                                        conflictingItems: matchedItems,
                                      });
                                    }
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <View style={styles.slotCellTop}>
                                    <View style={[styles.slotHourBadge, isFilled && styles.slotHourBadgeFilled, hasConflict && { backgroundColor: '#FEE2E2' }]}>
                                      <Text style={[styles.slotHourText, isFilled && styles.slotHourTextFilled, hasConflict && { color: '#DC2626' }]}>
                                        {lessonHour}. Ders
                                      </Text>
                                    </View>
                                    {hasConflict ? (
                                      <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>⚠️ Çakışma</Text>
                                      </View>
                                    ) : (
                                      <Ionicons
                                        name={isFilled ? 'pencil' : 'add-circle-outline'}
                                        size={12}
                                        color={isFilled ? '#4F46E5' : '#94A3B8'}
                                      />
                                    )}
                                  </View>

                                  {isFilled ? (
                                    <View style={styles.slotContentBox}>
                                      <Text style={[styles.slotLessonTitle, hasConflict && { color: '#B91C1C' }]} numberOfLines={1}>
                                        {matchedItem.lessonName}{matchedItem.lessonCode ? ` (${matchedItem.lessonCode})` : ''}
                                      </Text>
                                      <Text style={styles.slotSubDetail} numberOfLines={1}>
                                        {scheduleEditorMode === 'class'
                                          ? (matchedItem.teacherName || 'Öğretmen Atanmadı')
                                          : `${matchedItem.grade}-${matchedItem.section}`}
                                      </Text>
                                      {hasConflict && (
                                        <Text style={{ fontSize: 9, color: '#DC2626', fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                                          +{matchedItems.length - 1} çakışan ders!
                                        </Text>
                                      )}
                                      {!!matchedItem.classroom && !hasConflict && (
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
              )}

                {/* 4. DETAYLI DERS & ÖĞRETMEN DAĞILIMI VE İSTATİSTİK ANALİZ GÖRÜNÜMÜ */}
                {scheduleSubView === 'analytics' && (
                  <View style={styles.interactiveEditorCard}>
                    {/* Başlık ve Yenile */}
                    <View style={styles.interactiveHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.interactiveTitle}>📊 Haftalık Ders Dağılımı & Öğretmen İstatistikleri</Text>
                        <Text style={styles.interactiveSub}>
                          Tüm şubelerin ders doluluklarını, öğretmenlerin haftalık toplam ders saatlerini ve ders dağılım matrisini inceleyin.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.sanityRefreshBtn}
                        onPress={() => loadScheduleStats()}
                        disabled={loadingScheduleStats}
                      >
                        {loadingScheduleStats ? (
                          <ActivityIndicator size="small" color="#4F46E5" />
                        ) : (
                          <Ionicons name="refresh" size={16} color="#4F46E5" />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Arama Kutusu */}
                    <View style={styles.analyticsSearchWrap}>
                      <Ionicons name="search" size={18} color="#94A3B8" />
                      <TextInput
                        style={styles.analyticsSearchInput}
                        placeholder="Öğretmen, ders veya şube ara (örn: Matematik, 9-A, Ahmet)..."
                        placeholderTextColor="#94A3B8"
                        value={analyticsSearchQuery}
                        onChangeText={setAnalyticsSearchQuery}
                      />
                      {analyticsSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setAnalyticsSearchQuery('')}>
                          <Ionicons name="close-circle" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Filtre Butonları */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsFilterScroll}>
                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'all' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('all')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'all' && styles.analyticsFilterBtnTextActive]}>
                          Tümü ({scheduleStats?.totalActualSlots || allSchoolSchedules.length} Saat)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'teachers' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('teachers')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'teachers' && styles.analyticsFilterBtnTextActive]}>
                          👨‍🏫 Öğretmen Yükleri ({filteredTeacherWorkloads.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'missing' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('missing')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'missing' && styles.analyticsFilterBtnTextActive]}>
                          🏫 Şube Dolulukları ({filteredClassFullness.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.analyticsFilterBtn, analyticsFilterType === 'courses' && styles.analyticsFilterBtnActive]}
                        onPress={() => setAnalyticsFilterType('courses')}
                      >
                        <Text style={[styles.analyticsFilterBtnText, analyticsFilterType === 'courses' && styles.analyticsFilterBtnTextActive]}>
                          📚 Ders Dağılım Matrisi ({filteredCourseAllocations.length})
                        </Text>
                      </TouchableOpacity>

                      {(scheduleStats?.conflictsCount || 0) > 0 && (
                        <TouchableOpacity
                          style={[styles.analyticsFilterBtn, analyticsFilterType === 'conflicts' && styles.analyticsFilterBtnActive, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                          onPress={() => setAnalyticsFilterType('conflicts')}
                        >
                          <Text style={[styles.analyticsFilterBtnText, { color: '#DC2626', fontWeight: 'bold' }]}>
                            ⚠️ Çakışmalar ({scheduleStats?.conflictsCount})
                          </Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>

                    {/* 1. ÇAKIŞMA DETAYLARI (Eğer Varsa) */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'conflicts') && scheduleStats?.conflictsCount > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.analyticsSectionLabel}>⚠️ Tespit Edilen Çakışmalar ({scheduleStats.conflictsCount})</Text>
                        <ScrollView
                          nestedScrollEnabled={true}
                          style={{ maxHeight: 280, marginTop: 6 }}
                          contentContainerStyle={{ gap: 8, paddingRight: 2 }}
                          showsVerticalScrollIndicator={true}
                        >
                          {scheduleStats.conflicts
                            .filter((c: any) => {
                              if (!analyticsSearchQuery) return true;
                              const q = analyticsSearchQuery.toLowerCase();
                              return (
                                (c.description || '').toLowerCase().includes(q) ||
                                (c.title || '').toLowerCase().includes(q) ||
                                (c.className || '').toLowerCase().includes(q) ||
                                (c.teacherName || '').toLowerCase().includes(q)
                              );
                            })
                            .map((c: any, cIdx: number) => (
                              <View key={cIdx} style={styles.analyticsConflictCard}>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="warning" size={16} color="#DC2626" />
                                    <Text style={styles.analyticsConflictTitle}>{c.title}</Text>
                                    <Text style={styles.analyticsConflictHourBadge}>{c.dayOfWeek}. Gün {c.lessonHour}. Ders</Text>
                                  </View>
                                  <Text style={styles.analyticsConflictDesc}>{c.description}</Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.analyticsFixBtn}
                                  onPress={() => {
                                    if (c.className) {
                                      setScheduleEditorMode('class');
                                      setSelectedClassForEditor(c.className);
                                    } else if (c.teacherName) {
                                      setScheduleEditorMode('teacher');
                                      setSelectedTeacherForEditor(c.teacherName);
                                    }
                                    setScheduleSubView('editor');
                                  }}
                                >
                                  <Ionicons name="pencil" size={13} color="#FFFFFF" />
                                  <Text style={styles.analyticsFixBtnText}>Düzenle</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* 2. ÖĞRETMEN DERS YÜKLERİ (Teacher Workload) */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'teachers') && (
                      <View style={{ marginTop: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.analyticsSectionLabel}>
                            👨‍🏫 Öğretmen Haftalık Ders Saatleri ({filteredTeacherWorkloads.length})
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>Ders saatine göre sıralı</Text>
                        </View>

                        {filteredTeacherWorkloads.length === 0 ? (
                          <View style={styles.analyticsEmptyBox}>
                            <Text style={styles.analyticsEmptyText}>Eşleşen öğretmen bulunamadı.</Text>
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            {filteredTeacherWorkloads.map((t: any, idx: number) => {
                              const isHeavy = t.totalHours >= 24;
                              const isMedium = t.totalHours >= 15;
                              return (
                                <View key={idx} style={styles.teacherWorkloadCard}>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <Text style={styles.teacherWorkloadName}>{t.teacherName}</Text>
                                      <View style={[styles.teacherHoursBadge, isHeavy ? styles.hoursBadgeHigh : isMedium ? styles.hoursBadgeNormal : styles.hoursBadgeLow]}>
                                        <Text style={[styles.teacherHoursText, isHeavy ? { color: '#047857' } : isMedium ? { color: '#1D4ED8' } : { color: '#B45309' }]}>
                                          {t.totalHours} Saat/Hafta
                                        </Text>
                                      </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                      {t.classes?.map((cls: string, cIdx: number) => (
                                        <View key={cIdx} style={styles.workloadChipClass}>
                                          <Text style={styles.workloadChipClassText}>{cls}</Text>
                                        </View>
                                      ))}
                                      {t.lessons?.map((les: string, lIdx: number) => (
                                        <View key={lIdx} style={styles.workloadChipLesson}>
                                          <Text style={styles.workloadChipLessonText}>{les}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>

                                  <TouchableOpacity
                                    style={styles.analyticsGoEditorBtn}
                                    onPress={() => {
                                      setScheduleEditorMode('teacher');
                                      setSelectedTeacherForEditor(t.teacherName);
                                      setScheduleSubView('editor');
                                    }}
                                  >
                                    <Ionicons name="create-outline" size={14} color="#4F46E5" />
                                    <Text style={styles.analyticsGoEditorText}>Program</Text>
                                  </TouchableOpacity>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    )}

                    {/* 3. ŞUBELERİN DERS DOLULUKLARI */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'missing') && (
                      <View style={{ marginTop: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.analyticsSectionLabel}>
                            🏫 Şube Haftalık Ders Dolulukları ({filteredClassFullness.length})
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {filteredClassFullness.map((cf: any, idx: number) => {
                            const isFull = cf.isFullyFilled;
                            return (
                              <TouchableOpacity
                                key={idx}
                                style={[styles.classFullnessDetailCard, isFull ? styles.cardBorderGreen : styles.cardBorderOrange]}
                                onPress={() => {
                                  setScheduleEditorMode('class');
                                  setSelectedClassForEditor(cf.className);
                                  setScheduleSubView('editor');
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={styles.classFullnessCardTitle}>{cf.className}</Text>
                                  <Text style={[styles.classFullnessCardPercent, isFull ? { color: '#166534' } : { color: '#EA580C' }]}>
                                    %{cf.percent}
                                  </Text>
                                </View>
                                <Text style={styles.classFullnessCardSub}>
                                  {cf.filledCount} / {cf.expectedCount} Saat
                                </Text>
                                <Text style={[styles.classFullnessCardStatus, isFull ? { color: '#15803D' } : { color: '#C2410C' }]}>
                                  {isFull ? '✅ Tam Dolu' : `⚠️ ${cf.missingCount} Saat Boş`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* 4. DERS DAĞILIM MATRİSİ (Hangi Dersi Kim Hangi Sınıfa Kaç Saat Veriyor) */}
                    {(analyticsFilterType === 'all' || analyticsFilterType === 'courses') && (
                      <View style={{ marginTop: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.analyticsSectionLabel}>
                            📚 Ders Dağılım Matrisi ({filteredCourseAllocations.length})
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>Ders - Şube - Öğretmen Eşleşmeleri</Text>
                        </View>

                        {filteredCourseAllocations.length === 0 ? (
                          <View style={styles.analyticsEmptyBox}>
                            <Text style={styles.analyticsEmptyText}>Eşleşen ders dağılımı bulunamadı.</Text>
                          </View>
                        ) : (
                          <View style={{ gap: 6 }}>
                            {filteredCourseAllocations.map((item: any, idx: number) => (
                              <View key={idx} style={styles.courseAllocRow}>
                                <View style={styles.courseAllocClassBadge}>
                                  <Text style={styles.courseAllocClassText}>{item.className}</Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                  <Text style={styles.courseAllocLessonName}>{item.lessonName}</Text>
                                  <Text style={styles.courseAllocTeacherName}>👨‍🏫 {item.teacherName}</Text>
                                </View>
                                <View style={styles.courseAllocHoursBadge}>
                                  <Text style={styles.courseAllocHoursText}>{item.hours} Saat</Text>
                                </View>
                                <TouchableOpacity
                                  style={{ padding: 6, marginLeft: 4 }}
                                  onPress={() => {
                                    setScheduleEditorMode('class');
                                    setSelectedClassForEditor(item.className);
                                    setScheduleSubView('editor');
                                  }}
                                >
                                  <Ionicons name="pencil" size={15} color="#4F46E5" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
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

                  {/* Kompakt Model Seçim Dropdown Tetikleyicisi */}
                  {(() => {
                    const preset = PRESET_GEMINI_MODELS.find(p => p.id === selectedGeminiModel);
                    const modelDisplayName = preset ? preset.name : selectedGeminiModel;
                    const isRecommended = preset?.isRecommended;

                    return (
                      <TouchableOpacity
                        style={styles.modelDropdownTrigger}
                        onPress={() => setModelDropdownModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.modelDropdownTriggerLeft}>
                          <View style={styles.modelDropdownIconBox}>
                            <Ionicons name="hardware-chip" size={22} color="#4F46E5" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.modelDropdownTriggerTitle} numberOfLines={1}>
                                {modelDisplayName}
                              </Text>
                              {isRecommended && (
                                <View style={styles.recommendedBadge}>
                                  <Text style={styles.recommendedBadgeText}>ÖNERİLEN</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.modelDropdownTriggerId} numberOfLines={1}>
                              ID: {selectedGeminiModel}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.modelDropdownTriggerRight}>
                          <Text style={styles.modelDropdownChangeText}>Model Seç</Text>
                          <Ionicons name="chevron-down" size={16} color="#4F46E5" />
                        </View>
                      </TouchableOpacity>
                    );
                  })()}
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
                      <Text style={styles.quotaGaugeLabel}>Kalan Günlük Havuz Kotası:</Text>
                      <Text style={styles.quotaGaugeVal}>
                        %{usageStats ? usageStats.remainingPercent : 100} Kalan
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <Text style={styles.gaugePercentText}>
                        %{usageStats ? usageStats.remainingPercent : 100} Kota Mevcut (En Kritik Limit)
                      </Text>
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                        Token: %{usageStats?.tokenPercent ?? 100} • İstek: %{usageStats ? Math.round(((usageStats.dailyRequestLimit - usageStats.requestsToday) / usageStats.dailyRequestLimit) * 100) : 100}
                      </Text>
                    </View>
                  </View>

                  {/* Kullanım Grid */}
                  <View style={styles.quotaMiniGrid}>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>
                        {usageStats ? usageStats.requestsToday : 0} / {usageStats ? usageStats.dailyRequestLimit : 1500}
                      </Text>
                      <Text style={styles.quotaMiniBoxLabel}>Günlük İstek</Text>
                    </View>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>
                        {(usageStats?.tokensToday || 0).toLocaleString('tr-TR')} / {((usageStats?.dailyTokenLimit || 1000000) / 1000).toLocaleString('tr-TR')}k
                      </Text>
                      <Text style={styles.quotaMiniBoxLabel}>Harcanan Token</Text>
                    </View>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>
                        {usageStats?.lastTokensUsed ? `${usageStats.lastTokensUsed.toLocaleString('tr-TR')} tok` : '-'}
                      </Text>
                      <Text style={styles.quotaMiniBoxLabel}>Son İşlem ({usageStats?.lastRequestTime || '-'})</Text>
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

                {/* 7. ŞİFRE VE SİSTEM ERİŞİM RAPORLARI KARTI */}
                <View style={[styles.reportSectionCard, { borderColor: '#818CF8', borderWidth: 1.5 }]}>
                  <View style={styles.reportCardHeader}>
                    <View style={[styles.reportIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="key" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.reportCardTitle}>🔐 Şifre ve Sistem Erişim Raporları</Text>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>YENİ</Text>
                        </View>
                      </View>
                      <Text style={styles.reportCardDesc}>
                        Öğretmenler, öğrenciler ve veliler için sistem giriş kimlikleri, okul kodları ve başlangıç şifre dökümleri.
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 10, marginTop: 6 }}>
                    {/* Öğretmen Şifreleri */}
                    <TouchableOpacity
                      style={[styles.exportActionBtn, { backgroundColor: '#4F46E5', paddingVertical: 12 }]}
                      onPress={handleExportTeacherCredentials}
                      disabled={exportingReportType === 'teacher_credentials'}
                      activeOpacity={0.88}
                    >
                      {exportingReportType === 'teacher_credentials' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="person-circle-outline" size={20} color="#fff" />
                          <View style={{ flex: 1, marginLeft: 4 }}>
                            <Text style={styles.exportActionBtnText}>Öğretmen Şifre Excel Raporu (.xlsx)</Text>
                            <Text style={{ fontSize: 10, color: '#C7D2FE', marginTop: 1 }}>Kullanıcı adı, okul kodu, branş ve başlangıç şifresi (1234)</Text>
                          </View>
                          <Ionicons name="download-outline" size={17} color="#fff" />
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Öğrenci Şifreleri */}
                    <TouchableOpacity
                      style={[styles.exportActionBtn, { backgroundColor: '#059669', paddingVertical: 12 }]}
                      onPress={handleExportStudentCredentials}
                      disabled={exportingReportType === 'student_credentials'}
                      activeOpacity={0.88}
                    >
                      {exportingReportType === 'student_credentials' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="school-outline" size={20} color="#fff" />
                          <View style={{ flex: 1, marginLeft: 4 }}>
                            <Text style={styles.exportActionBtnText}>Öğrenci Şifre Excel Raporu (.xlsx)</Text>
                            <Text style={{ fontSize: 10, color: '#A7F3D0', marginTop: 1 }}>Öğrenci no, sınıf-şube, okul kodu ve portal şifresi (aaaa_no)</Text>
                          </View>
                          <Ionicons name="download-outline" size={17} color="#fff" />
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Veli Şifreleri */}
                    <TouchableOpacity
                      style={[styles.exportActionBtn, { backgroundColor: '#D97706', paddingVertical: 12 }]}
                      onPress={handleExportParentCredentials}
                      disabled={exportingReportType === 'parent_credentials'}
                      activeOpacity={0.88}
                    >
                      {exportingReportType === 'parent_credentials' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="people-outline" size={20} color="#fff" />
                          <View style={{ flex: 1, marginLeft: 4 }}>
                            <Text style={styles.exportActionBtnText}>Veli Bilgilendirme & Şifre Excel Raporu (.xlsx)</Text>
                            <Text style={{ fontSize: 10, color: '#FDE68A', marginTop: 1 }}>Veli adı, telefon, öğrenci no ve veli erişim şifresi dökümü</Text>
                          </View>
                          <Ionicons name="download-outline" size={17} color="#fff" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* AI Model Seçim Modalı (Dropdown List) */}
      <Modal visible={modelDropdownModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="hardware-chip" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Gemini Modeli Seçin</Text>
              </View>
              <TouchableOpacity onPress={() => setModelDropdownModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Model Arama Filtresi */}
            <View style={styles.modelSearchWrap}>
              <Ionicons name="search" size={16} color="#64748B" />
              <TextInput
                style={styles.modelSearchInput}
                placeholder="Model ara (örn: 2.5, flash, pro)..."
                value={modelSearchQuery}
                onChangeText={setModelSearchQuery}
                placeholderTextColor="#94A3B8"
              />
              {!!modelSearchQuery && (
                <TouchableOpacity onPress={() => setModelSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 1. Önerilen & Hazır Modeller */}
              <Text style={styles.modelCategoryTitle}>ÖNERİLEN MODELLER</Text>
              {PRESET_GEMINI_MODELS
                .filter(m => !modelSearchQuery.trim() || m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                .map((m) => {
                  const isSelected = selectedGeminiModel === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.modelDropdownItem, isSelected && styles.modelDropdownItemSelected]}
                      onPress={() => {
                        setSelectedGeminiModel(m.id);
                        setModelDropdownModalVisible(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.modelDropdownItemName, isSelected && styles.modelDropdownItemNameSelected]}>
                            {m.name}
                          </Text>
                          {m.isRecommended && (
                            <View style={styles.recommendedBadge}>
                              <Text style={styles.recommendedBadgeText}>ÖNERİLEN</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modelDropdownItemId}>{m.id}</Text>
                        <Text style={styles.modelDropdownItemDesc} numberOfLines={2}>{m.description}</Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={isSelected ? '#4F46E5' : '#CBD5E1'}
                      />
                    </TouchableOpacity>
                  );
                })}

              {/* 2. Google API Canlı Modeller */}
              {availableLiveModels.filter(lm => !PRESET_GEMINI_MODELS.some(pm => pm.id === lm)).length > 0 && (
                <>
                  <Text style={[styles.modelCategoryTitle, { marginTop: 16 }]}>
                    GOOGLE API CANLI MODELLERİ ({availableLiveModels.filter(lm => !PRESET_GEMINI_MODELS.some(pm => pm.id === lm)).length})
                  </Text>
                  {availableLiveModels
                    .filter(lm => !PRESET_GEMINI_MODELS.some(pm => pm.id === lm))
                    .filter(lm => !modelSearchQuery.trim() || lm.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                    .map((liveModel) => {
                      const isSelected = selectedGeminiModel === liveModel;
                      return (
                        <TouchableOpacity
                          key={liveModel}
                          style={[styles.modelDropdownItem, isSelected && styles.modelDropdownItemSelected]}
                          onPress={() => {
                            setSelectedGeminiModel(liveModel);
                            setModelDropdownModalVisible(false);
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.modelDropdownItemName, isSelected && styles.modelDropdownItemNameSelected]}>
                              {liveModel}
                            </Text>
                            <Text style={styles.modelDropdownItemId}>API Canlı Model</Text>
                          </View>
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={isSelected ? '#4F46E5' : '#CBD5E1'}
                          />
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
              placeholder="Ders Adı (Örn: Biyoloji, Seçmeli Fizik)"
              value={newLessonName}
              onChangeText={setNewLessonName}
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Kısa Kod (Örn: BYL, S.FZK)"
              value={newLessonShortCode}
              onChangeText={setNewLessonShortCode}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Sınıf Düzeyi / Kademe (Her düzeyin planı ayrı yüklenir):
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {['9', '10', '11', '12', 'Tüm Kademeler'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: newLessonGrade === g ? '#4F46E5' : '#CBD5E1',
                      backgroundColor: newLessonGrade === g ? '#EEF2FF' : '#FFFFFF',
                    }}
                    onPress={() => setNewLessonGrade(g)}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: newLessonGrade === g ? '#4F46E5' : '#64748B' }}>
                      {g.includes('Tüm') ? g : `${g}. Sınıf`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Kademe (Örn: 11 veya Tüm Kademeler)"
                value={newLessonGrade}
                onChangeText={setNewLessonGrade}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Haftalık Saat (Örn: 2, 4)"
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

      {/* Okul Adı & Bilgileri Düzenleme Modalı */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pencil" size={20} color="#4F46E5" />
                <Text style={styles.modalTitle}>Okul Bilgilerini Güncelle</Text>
              </View>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Okul Kodu Kartı */}
              {(editingSchoolObj?.code || selectedSchool?.code) && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#EEF2FF',
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#C7D2FE',
                  marginBottom: 12,
                }}>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#4338CA' }}>ÖĞRETMEN BAĞLANTI KODU</Text>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#312E81', marginTop: 1 }}>
                      {editingSchoolObj?.code || selectedSchool?.code}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleCopyCode(editingSchoolObj?.code || selectedSchool?.code)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#FFFFFF',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                    }}
                  >
                    <Ionicons name="copy-outline" size={13} color="#4F46E5" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Kopyala</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Okul / Kurum Adı *
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Atatürk Anadolu Lisesi"
                value={editSchoolName}
                onChangeText={setEditSchoolName}
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                İletişim Telefonu
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: 0312 000 00 00"
                value={editSchoolPhone}
                onChangeText={setEditSchoolPhone}
                keyboardType="phone-pad"
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Okul Adresi
              </Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Okulun açık adresi (İsteğe bağlı)"
                value={editSchoolAddress}
                onChangeText={setEditSchoolAddress}
                multiline
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                Okul Günlük Ders Saati (Örn: 7, 8, 9, 10 Saat)
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {[6, 7, 8, 9, 10].map((h) => {
                  const isSelected = String(h) === String(editSchoolDailyHours);
                  return (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setEditSchoolDailyHours(String(h))}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isSelected ? '#4338CA' : '#CBD5E1',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#fff' : '#475569' }}>
                        {h} Saat
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TextInput
                  style={[styles.modalInput, { width: 65, marginBottom: 0, textAlign: 'center', fontWeight: '700' }]}
                  placeholder="8"
                  value={editSchoolDailyHours}
                  onChangeText={setEditSchoolDailyHours}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              {!isStaff && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                    Kurumsal Gemini API Anahtarı
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="AI API Key (İsteğe bağlı)"
                    value={editSchoolApiKey}
                    onChangeText={setEditSchoolApiKey}
                    autoCapitalize="none"
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.createSubmitButton, { marginTop: 8 }]}
                onPress={handleUpdateSchool}
                disabled={updatingSchool}
              >
                {updatingSchool ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Değişiklikleri Kaydet</Text>
                )}
              </TouchableOpacity>

              {/* Okul Silme Butonu */}
              {!isStaff && (
                <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                  {schools.length > 1 ? (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FEE2E2',
                        borderWidth: 1,
                        borderColor: '#FECACA',
                        borderRadius: 10,
                        paddingVertical: 10,
                        gap: 6,
                      }}
                      onPress={() => handleDeleteSchool(editingSchoolObj || selectedSchool)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                        Bu Okulu Sistemden Sil
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
                        ℹ️ Sistemde en az 1 okul kalmalıdır. Son kalan okul silinemez.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
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

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
              Okul Günlük Ders Saati
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[6, 7, 8, 9, 10].map((h) => {
                const isSelected = String(h) === String(newSchoolDailyHours);
                return (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setNewSchoolDailyHours(String(h))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: isSelected ? '#4338CA' : '#CBD5E1',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#fff' : '#475569' }}>
                      {h} Saat
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TextInput
                style={[styles.modalInput, { width: 65, marginBottom: 0, textAlign: 'center', fontWeight: '700' }]}
                placeholder="8"
                value={newSchoolDailyHours}
                onChangeText={setNewSchoolDailyHours}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>

            <TouchableOpacity style={styles.createSubmitButton} onPress={handleCreateSchool}>
              <Text style={styles.createSubmitText}>Okulu Oluştur</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🏫 OKUL DEĞİŞTİRME VE YÖNETİMİ MODALI */}
      <Modal visible={schoolSelectModalVisible} animationType="slide" transparent onRequestClose={() => setSchoolSelectModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="business" size={24} color="#4F46E5" />
                <Text style={styles.modalTitle}>Okul Seç & Değiştir</Text>
              </View>
              <TouchableOpacity onPress={() => setSchoolSelectModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
              Yönettiğiniz okullar arasında geçiş yapabilir veya yeni bir okul kurumu tanımlayabilirsiniz.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {schools.map((s) => {
                const isSelected = selectedSchool?.id === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      handleSelectSchool(s);
                      setSchoolSelectModalVisible(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
                      backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                      marginBottom: 10,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark' : 'business-outline'}
                        size={20}
                        color={isSelected ? '#FFFFFF' : '#64748B'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? '#312E81' : Colors.text,
                        }}
                      >
                        {s.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>
                          Kod: <Text style={{ fontWeight: '700', color: '#4F46E5' }}>{s.code}</Text>
                        </Text>
                        {isSelected && (
                          <View
                            style={{
                              backgroundColor: '#DCFCE7',
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 4,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534' }}>ŞU AN AKTİF</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.();
                          setSchoolSelectModalVisible(false);
                          handleOpenEditSchool(s);
                        }}
                        style={{ padding: 6, borderRadius: 8, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel={`${s.name} Düzenle`}
                      >
                        <Ionicons name="pencil" size={15} color="#4F46E5" />
                      </TouchableOpacity>
                      {schools.length > 1 && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleDeleteSchool(s);
                          }}
                          style={{ padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityLabel={`${s.name} Sil`}
                        >
                          <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={isSelected ? '#4F46E5' : '#CBD5E1'}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
              {schools.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#64748B', fontSize: 13 }}>Henüz kayıtlı bir okulunuz bulunmuyor.</Text>
                </View>
              )}
            </ScrollView>

            {!isStaff && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1.5,
                  borderColor: '#86EFAC',
                  borderRadius: 12,
                  paddingVertical: 12,
                  marginTop: 10,
                  gap: 8,
                }}
                onPress={() => {
                  setSchoolSelectModalVisible(false);
                  setCreateModalVisible(true);
                }}
              >
                <Ionicons name="add-circle" size={20} color="#166534" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>
                  Yeni Okul Tanımla
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Excel Çarşaf Programı Ön İnceleme ve Yükleme Modalı */}
      <Modal visible={excelPreviewModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="grid-outline" size={24} color="#10B981" />
                <Text style={styles.modalTitle}>Excel Çarşaf Ön İnceleme</Text>
              </View>
              <TouchableOpacity onPress={() => setExcelPreviewModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Dosya Bilgi Kartı */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#ECFDF5',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#A7F3D0',
              }}>
                <Ionicons name="document-text" size={32} color="#059669" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }} numberOfLines={1}>
                    {excelInspection?.fileName || 'carsaf.xlsx'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>
                    📊 {excelInspection?.sheetNames?.length || 0} Sayfa • Toplam {excelInspection?.totalRows || 0} Satır Bulundu
                  </Text>
                </View>
              </View>

              {/* Bilgilendirme Notu */}
              <View style={{
                backgroundColor: '#F0FDF4',
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
                borderLeftWidth: 4,
                borderLeftColor: '#10B981',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
                  💡 Excel Çarşaf Okuma Altyapısı Hazırlandı!
                </Text>
                <Text style={{ fontSize: 11, color: '#047857', marginTop: 4, lineHeight: 16 }}>
                  Örnek Excel çarşafınızı oluşturduktan sonra bize sunduğunuzda hücre ve sütun eşleştirmesi (öğretmenler, ders saatleri, sınıflar) tam otomatik hale getirilecektir. Şimdilik bulunan sayfaları inceleyebilir ve şablonu taslak düzenleyiciye aktarabilirsiniz.
                </Text>
              </View>

              {/* Sayfa Seçici Sekmeler (Varsa birden fazla sayfa) */}
              {(excelInspection?.sheetNames?.length || 0) > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 }}>
                    Görüntülenen Sayfa:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {excelInspection?.sheets.map((s) => {
                      const isSelected = selectedExcelSheet === s.name;
                      return (
                        <TouchableOpacity
                          key={s.name}
                          onPress={() => setSelectedExcelSheet(s.name)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: isSelected ? '#10B981' : '#F1F5F9',
                            borderWidth: 1,
                            borderColor: isSelected ? '#059669' : '#CBD5E1',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : '#475569' }}>
                            {s.name} ({s.rowCount} satır)
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Seçilen Sayfa Önizleme Tablosu */}
              {(() => {
                const curSheet = excelInspection?.sheets.find(s => s.name === selectedExcelSheet) || excelInspection?.sheets?.[0];
                if (!curSheet) return null;
                const sampleRows = curSheet.sampleRows || [];

                return (
                  <View style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    padding: 10,
                    marginBottom: 16,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                        Sayfa: {curSheet.name} (İlk {sampleRows.length} Satır)
                      </Text>
                      <Text style={{ fontSize: 10, color: '#64748B' }}>
                        {curSheet.colCount} Sütun • {curSheet.rowCount} Satır
                      </Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                      <View>
                        {sampleRows.map((row, rIdx) => (
                          <View
                            key={rIdx}
                            style={{
                              flexDirection: 'row',
                              backgroundColor: rIdx === 0 ? '#F8FAFC' : (rIdx % 2 === 0 ? '#FAFAFA' : '#FFFFFF'),
                              borderBottomWidth: 1,
                              borderBottomColor: '#F1F5F9',
                              paddingVertical: 5,
                            }}
                          >
                            <View style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '700' }}>{rIdx + 1}</Text>
                            </View>
                            {row.map((cell: any, cIdx: number) => (
                              <View
                                key={cIdx}
                                style={{
                                  width: 100,
                                  paddingHorizontal: 6,
                                  justifyContent: 'center',
                                  borderRightWidth: 1,
                                  borderRightColor: '#F1F5F9',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: rIdx === 0 ? '700' : '400',
                                    color: rIdx === 0 ? '#1E293B' : '#334155',
                                  }}
                                  numberOfLines={2}
                                >
                                  {cell !== null && cell !== undefined ? String(cell) : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })()}

              {/* Aksiyon Butonları */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#10B981',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14,
                  borderRadius: 12,
                  gap: 8,
                  marginBottom: 10,
                }}
                onPress={() => {
                  if (!excelInspection || !selectedSchool) return;
                  const parsed = parseInitialExcelSchedule(excelInspection, selectedSchool.name);
                  setParsedSchedule(parsed);
                  saveParsedScheduleDraft(selectedSchool.id, parsed);
                  setCachedScheduleDraft(parsed);
                  setExcelPreviewModalVisible(false);
                  setAiModalVisible(true);
                  Alert.alert(
                    'Excel Taslağı Hazırlandı 📊',
                    `Excel dosyasından ${parsed.classes.length} sınıf ve ${excelInspection.totalRows} satır tespit edildi. Canlı düzenleyici ekranında açıldı.`
                  );
                }}
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
                  Taslak Olarak Aç & Canlı Düzenle ➔
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                }}
                onPress={() => setExcelPreviewModalVisible(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
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

              {/* 5. Otomatik Akıllı Blok Dengeleme (İsteğe Bağlı) */}
              {optExtractScheduleItems && (
                <TouchableOpacity
                  style={[styles.preOptItemCard, optAutoHealBlocks && styles.preOptItemCardChecked, { borderColor: optAutoHealBlocks ? '#4F46E5' : '#E2E8F0' }]}
                  onPress={() => setOptAutoHealBlocks(!optAutoHealBlocks)}
                >
                  <Ionicons
                    name={optAutoHealBlocks ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={optAutoHealBlocks ? '#4F46E5' : '#94A3B8'}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.preOptItemTitle}>⚡ Akıllı Blok Dengeleme (İsteğe Bağlı)</Text>
                      <Text style={[styles.preOptBadgeSpeed, { backgroundColor: optAutoHealBlocks ? '#EEF2FF' : '#F1F5F9', color: optAutoHealBlocks ? '#4F46E5' : '#64748B' }]}>
                        {optAutoHealBlocks ? 'Aktif' : 'Devre Dışı (Önerilen)'}
                      </Text>
                    </View>
                    <Text style={styles.preOptItemSub}>
                      Çarşaf programı parça parça veya 2 kerede yüklüyorsanız KAPALI tutunuz. Öğretmenin eksik dersleri diğer sayfalarda olabilir. Tüm sayfalar yüklendikten sonra "Program Denetimi" ekranından tek tuşla dilediğiniz zaman dengeleyebilirsiniz.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

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
              {/* 5. PDF Sayfa Aralığı / Parça Parça Okuma Kartı */}
              {pendingScheduleFile?.name?.toLowerCase().endsWith('.pdf') && (
                <View style={styles.preOptPageRangeCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="documents" size={18} color="#4F46E5" />
                      <Text style={styles.preOptPageRangeTitle}>📄 PDF Sayfa Aralığı Seçimi</Text>
                    </View>
                    {countingPdfPages ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <ActivityIndicator size="small" color="#4F46E5" />
                        <Text style={{ fontSize: 11, color: '#64748B' }}>Sayfalar taranıyor...</Text>
                      </View>
                    ) : pdfTotalPages > 0 ? (
                      <View style={styles.preOptPageBadge}>
                        <Text style={styles.preOptPageBadgeText}>Toplam {pdfTotalPages} Sayfa</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.preOptPageRangeSub}>
                    {pdfTotalPages > 35
                      ? '💡 Belgeniz çok sayfalı. Token tavanına takılmamak ve %100 eksiksiz okuma için parçalara bölmeniz önerilir.'
                      : 'İhtiyaca göre belgenin sadece belirli sayfalarını (örn: 1-25) okutabilirsiniz.'}
                  </Text>

                  {/* Hızlı Seçim Butonları */}
                  {pdfTotalPages > 1 && (
                    <View style={styles.pdfRangePresetRow}>
                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'all' && styles.pdfRangePresetBtnActive]}
                        onPress={() => {
                          setPdfPageRangeMode('all');
                          setPdfStartPage('1');
                          setPdfEndPage(String(pdfTotalPages));
                        }}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'all' && styles.pdfRangePresetTextActive]}>
                          Tümü (1-{pdfTotalPages})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'half1' && styles.pdfRangePresetBtnActive]}
                        onPress={() => {
                          setPdfPageRangeMode('half1');
                          setPdfStartPage('1');
                          setPdfEndPage(String(Math.ceil(pdfTotalPages / 2)));
                        }}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'half1' && styles.pdfRangePresetTextActive]}>
                          1. Yarı (1-{Math.ceil(pdfTotalPages / 2)})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'half2' && styles.pdfRangePresetBtnActive]}
                        onPress={() => {
                          setPdfPageRangeMode('half2');
                          setPdfStartPage(String(Math.ceil(pdfTotalPages / 2) + 1));
                          setPdfEndPage(String(pdfTotalPages));
                        }}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'half2' && styles.pdfRangePresetTextActive]}>
                          2. Yarı ({Math.ceil(pdfTotalPages / 2) + 1}-{pdfTotalPages})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.pdfRangePresetBtn, pdfPageRangeMode === 'custom' && styles.pdfRangePresetBtnActive]}
                        onPress={() => setPdfPageRangeMode('custom')}
                      >
                        <Text style={[styles.pdfRangePresetText, pdfPageRangeMode === 'custom' && styles.pdfRangePresetTextActive]}>
                          Özel Aralık
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Sayfa Giriş Kutuları */}
                  <View style={styles.pdfRangeInputsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pdfRangeInputLabel}>Başlangıç:</Text>
                      <TextInput
                        style={styles.pdfRangeInput}
                        keyboardType="numeric"
                        value={pdfStartPage}
                        onChangeText={(txt) => {
                          setPdfStartPage(txt);
                          setPdfPageRangeMode('custom');
                        }}
                      />
                    </View>

                    <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>—</Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pdfRangeInputLabel}>Bitiş:</Text>
                      <TextInput
                        style={styles.pdfRangeInput}
                        keyboardType="numeric"
                        value={pdfEndPage}
                        onChangeText={(txt) => {
                          setPdfEndPage(txt);
                          setPdfPageRangeMode('custom');
                        }}
                      />
                    </View>
                  </View>
                </View>
              )}
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
              <TouchableOpacity onPress={cancelScheduleAnalysis}>
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

                {/* Mod Bilgisi */}
                {!optExtractScheduleItems ? (
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>⚡ Hızlı Liste Modu: Program hücreleri çözümlenmiyor</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>🗓️ Tam Dağılım Modu: Haftalık program hücreleri taranıyor</Text>
                  </View>
                )}

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

                {/* Adım Listesi (Sadece kullanıcının seçtiği kategorileri gösterir) */}
                <View style={styles.aiStepsContainer}>
                  {optExtractTeachers && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                      <Text style={styles.aiStepDoneText}>• Öğretmen kadrosu taranıyor (sayfa yer imleri & başlıklar)</Text>
                    </View>
                  )}
                  {optExtractClasses && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                      <Text style={styles.aiStepDoneText}>• Şubeler ve sınıflar tespit ediliyor</Text>
                    </View>
                  )}
                  {optExtractLessons && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                      <Text style={styles.aiStepDoneText}>• Ders adları ve branşlar ayıklanıyor</Text>
                    </View>
                  )}
                  {optExtractScheduleItems && (
                    <View style={styles.aiStepRow}>
                      <Ionicons name="time-outline" size={16} color="#4F46E5" />
                      <Text style={styles.aiStepActiveText}>
                        • Hücrelere bölünmüş haftalık ders tablolarından tüm program omurgası çıkarılıyor
                      </Text>
                    </View>
                  )}
                </View>

                {/* İptal Butonu */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FEE2E2',
                    borderWidth: 1,
                    borderColor: '#FCA5A5',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    marginTop: 12,
                    gap: 6,
                  }}
                  onPress={cancelScheduleAnalysis}
                  activeOpacity={0.7}
                >
                  <Ionicons name="stop-circle-outline" size={18} color="#DC2626" />
                  <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>Analizi Durdur / İptal Et</Text>
                </TouchableOpacity>

                {/* Bilgilendirme Kutusu */}
                <View style={styles.aiProgressInfoBox}>
                  <Ionicons name="information-circle-outline" size={18} color="#166534" />
                  <Text style={styles.aiProgressInfoBoxText}>
                    {optExtractScheduleItems
                      ? 'Tam program çözümlemesi çok sayfalı tablolarda birkaç dakika sürebilir. İstemediğiniz kategorileri analiz öncesi seçeneklerden kapatarak işlemi saniyeler içinde tamamlayabilirsiniz.'
                      : 'Hızlı mod seçildiği için ders programı hücreleri çözümlenmeyecek; sadece öğretmen, sınıf ve ders listeleri hızla toplanacaktır.'}
                  </Text>
                </View>
              </View>
            ) : parsedSchedule ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {(() => {
                  const teachersList = parsedSchedule.teachers || [];
                  const classesList = parsedSchedule.classes || [];
                  const lessonsList = parsedSchedule.lessons || [];
                  const scheduleItemsList = parsedSchedule.scheduleItems || [];
                  const bellScheduleList = parsedSchedule.bellSchedule || [];

                  const activeTeachersCount = teachersList.length - excludedTeachers.length;
                  const activeClassesCount = classesList.length - excludedClasses.length;
                  const activeLessonsCount = lessonsList.length - excludedLessons.length;
                  const activeScheduleItemsCount = scheduleItemsList.filter((item) => {
                    if (!item) return false;
                    if (item.teacherName && excludedTeachers.includes(item.teacherName)) return false;
                    const sec = item.section ? String(item.section).toUpperCase() : '';
                    const clsName = `${item.grade}-${sec}`;
                    if (excludedClasses.includes(clsName)) return false;
                    if (item.lessonName && excludedLessons.includes(item.lessonName)) return false;
                    return true;
                  }).length;

                  // 🛡️ Çapraz Çakışmaları Hesapla:
                  const slotMap = new Map<string, Array<{ teacherName: string; lessonName: string }>>();
                  for (const item of scheduleItemsList) {
                    if (!item || !item.teacherName) return null;
                    const grade = item.grade ? String(item.grade).trim() : '';
                    const section = item.section ? String(item.section).trim().toUpperCase() : '';
                    if (!grade || !section) continue;
                    const clsKey = `${grade}-${section}`;
                    const slotKey = `${item.dayOfWeek}_${item.lessonHour}_${clsKey}`;
                    if (!slotMap.has(slotKey)) {
                      slotMap.set(slotKey, []);
                    }
                    slotMap.get(slotKey)!.push({
                      teacherName: item.teacherName.trim(),
                      lessonName: item.lessonName || item.lessonCode || 'Ders',
                    });
                  }

                  const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
                  const conflictsList: Array<{
                    dayOfWeek: number;
                    lessonHour: number;
                    className: string;
                    teachers: Array<{ teacherName: string; lessonName: string }>;
                  }> = [];
                  const teacherConflictsCountMap: Record<string, number> = {};

                  for (const [slotKey, items] of slotMap.entries()) {
                    const distinctTeachers = Array.from(new Set(items.map(it => it.teacherName.toLowerCase())));
                    if (distinctTeachers.length > 1) {
                      const parts = slotKey.split('_');
                      const dayOfWeek = parseInt(parts[0], 10);
                      const lessonHour = parseInt(parts[1], 10);
                      const className = parts[2];
                      conflictsList.push({
                        dayOfWeek,
                        lessonHour,
                        className,
                        teachers: items,
                      });
                      for (const it of items) {
                        const tNorm = it.teacherName.toLowerCase();
                        teacherConflictsCountMap[tNorm] = (teacherConflictsCountMap[tNorm] || 0) + 1;
                      }
                    }
                  }

                  return (
                    <>
                      <Text style={styles.previewSuccessTitle}>🎉 Çarşaf Program Ayrıştırıldı!</Text>

                      {/* Özet Grid Kartları */}
                      <View style={styles.previewGrid}>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeTeachersCount}
                            {excludedTeachers.length > 0 && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{teachersList.length}</Text>
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
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{classesList.length}</Text>
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
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{lessonsList.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>
                            Ders {excludedLessons.length > 0 ? `(${excludedLessons.length} Pasif)` : ''}
                          </Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewVal}>
                            {activeScheduleItemsCount}
                            {scheduleItemsList.length > 0 && activeScheduleItemsCount !== scheduleItemsList.length && (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }}>/{scheduleItemsList.length}</Text>
                            )}
                          </Text>
                          <Text style={styles.previewLbl}>Ders Saati</Text>
                        </View>
                      </View>

                      {/* 🚨 ÇAKIŞMA UYARI KARTI VE İNTERAKTİF ÇAKIŞMA LİSTESİ */}
                      {conflictsList.length > 0 ? (
                        <View style={{
                          backgroundColor: '#FEF2F2',
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: '#FECACA',
                          padding: 12,
                          marginBottom: 14,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons name="alert-circle" size={20} color="#DC2626" />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#991B1B' }}>
                                ⚠️ Tespit Edilen Çakışmalar ({conflictsList.length} Saat)
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                                {Object.keys(teacherConflictsCountMap).length} Öğretmen Etkileniyor
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: '#B91C1C', marginBottom: 10 }}>
                            Aynı şubede aynı gün ve saatte birden fazla öğretmenin dersi görünmektedir. Düzeltmek istediğiniz öğretmenin yanındaki butona basarak doğrudan çizelgesini açabilir, "Güne Taşı" ile tüm günü aktarabilir veya elle düzenleyebilirsiniz:
                          </Text>

                          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6 }}>
                            {conflictsList.map((c, cIdx) => (
                              <View
                                key={cIdx}
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  borderRadius: 8,
                                  padding: 8,
                                  borderWidth: 1,
                                  borderColor: '#FCA5A5',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>{c.className}</Text>
                                    </View>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                                      {dayNames[c.dayOfWeek] || `${c.dayOfWeek}. Gün`}, {c.lessonHour}. Ders
                                    </Text>
                                  </View>
                                </View>

                                <View style={{ gap: 4 }}>
                                  {c.teachers.map((t, tIdx) => (
                                    <View key={tIdx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                      <Text style={{ fontSize: 11, color: '#334155', flex: 1, marginRight: 6 }} numberOfLines={1}>
                                        <Text style={{ fontWeight: '700', color: '#0F172A' }}>{t.teacherName}</Text> ({t.lessonName})
                                      </Text>
                                      <TouchableOpacity
                                        onPress={() => handleOpenTeacherScheduleInspector(t.teacherName)}
                                        style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}
                                      >
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>✏️ İncele & Taşı</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      ) : (
                        <View style={{
                          backgroundColor: '#F0FDF4',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#BBF7D0',
                          padding: 10,
                          marginBottom: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}>
                          <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                            🛡️ 0 Çakışma: Tüm sınıfların ve öğretmenlerin ders saatleri kusursuz şekilde uyumlu!
                          </Text>
                        </View>
                      )}

                      {/* Okul Ders & Giriş-Çıkış Saatleri (Varsa) */}
                      {bellScheduleList && bellScheduleList.length > 0 && (
                        <View style={[styles.scheduleOptionSection, { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Ionicons name="time" size={16} color="#4F46E5" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                              ⏰ TESPİT EDİLEN OKUL GİRİŞ - ÇIKIŞ SAATLERİ ({bellScheduleList.length} Ders):
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {bellScheduleList.map((b) => (
                              <View key={b.period} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
                                  {b.period}. Ders: <Text style={{ fontWeight: '600', color: '#1E293B' }}>{b.time}</Text>
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Öğretmen Haftalık Saat (HS) Doğrulama & Çizelge Sağlaması */}
                      {parsedSchedule.teacherVerifications && parsedSchedule.teacherVerifications.length > 0 && (
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', padding: 12, marginBottom: 14 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons name="shield-checkmark" size={17} color="#4F46E5" />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                                ⚖️ Öğretmen Haftalık Ders Saati (HS) Sağlaması
                              </Text>
                            </View>
                            <View style={{
                              backgroundColor: parsedSchedule.teacherVerifications.every(v => v.isConsistent) ? '#DCFCE7' : '#FEF3C7',
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}>
                              <Text style={{
                                fontSize: 11,
                                fontWeight: '800',
                                color: parsedSchedule.teacherVerifications.every(v => v.isConsistent) ? '#15803D' : '#B45309'
                              }}>
                                {parsedSchedule.teacherVerifications.every(v => v.isConsistent)
                                  ? '✅ Tüm Kadro Tam Tutarlı'
                                  : `⚠️ ${parsedSchedule.teacherVerifications.filter(v => !v.isConsistent).length} Öğretmende Saat Farkı`}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                            Çarşafın altındaki resmî ders dağılım çizelgesindeki toplam saat (HS) ile ızgaradan çıkarılan dersler karşılaştırıldı (Bir öğretmene dokunarak programını inceleyebilir ve kağıda bakarak eksik saatleri elle düzeltebilirsiniz):
                          </Text>

                          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6 }}>
                            {parsedSchedule.teacherVerifications.map((v, vIdx) => (
                              <TouchableOpacity
                                key={vIdx}
                                activeOpacity={0.7}
                                onPress={() => handleOpenTeacherScheduleInspector(v.teacherName)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  backgroundColor: teacherConflictsCountMap[v.teacherName.toLowerCase()]
                                    ? '#FFF5F5'
                                    : v.isConsistent ? '#FFFFFF' : '#FFFBEB',
                                  paddingHorizontal: 10,
                                  paddingVertical: 8,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: teacherConflictsCountMap[v.teacherName.toLowerCase()]
                                    ? '#FCA5A5'
                                    : v.isConsistent ? '#E2E8F0' : '#FCD34D'
                                }}
                              >
                                <View style={{ flex: 1, marginRight: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>{v.teacherName}</Text>
                                    {teacherConflictsCountMap[v.teacherName.toLowerCase()] ? (
                                      <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#FECACA' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626' }}>
                                          ⚠️ {teacherConflictsCountMap[v.teacherName.toLowerCase()]} Çakışma
                                        </Text>
                                      </View>
                                    ) : null}
                                    <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 10, color: '#4F46E5', fontWeight: '700' }}>✏️ İncele & Düzenle</Text>
                                    </View>
                                  </View>
                                  <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                                    Çizelgedeki Saat: {v.expectedWeeklyHours != null ? `${v.expectedWeeklyHours} Saat` : '—'} • Çıkarılan: {v.extractedWeeklyHours} Saat
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{
                                    backgroundColor: v.isConsistent ? '#F0FDF4' : '#FEF2F2',
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    borderColor: v.isConsistent ? '#BBF7D0' : '#FECACA'
                                  }}>
                                    <Text style={{
                                      fontSize: 10,
                                      fontWeight: '800',
                                      color: v.isConsistent ? '#166534' : '#DC2626'
                                    }}>
                                      {v.isConsistent ? `✅ ${v.extractedWeeklyHours}/${v.expectedWeeklyHours || v.extractedWeeklyHours} Saat` : `⚠️ ${v.extractedWeeklyHours}/${v.expectedWeeklyHours} Saat`}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                                </View>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {/* Derslerin Gerçek Haftalık Saatleri (HS) */}
                      {parsedSchedule.lessonDetails && parsedSchedule.lessonDetails.some(l => (l.weeklyHours || 0) > 0) && (
                        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0', padding: 10, marginBottom: 14 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="checkmark-done-circle" size={16} color="#16A34A" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                              📚 Çizelgeden Okunan Gerçek Haftalık Ders Saatleri (HS):
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {parsedSchedule.lessonDetails.filter(l => (l.weeklyHours || 0) > 0).map((l, lIdx) => (
                              <View key={lIdx} style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#86EFAC' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>
                                  {l.name}: <Text style={{ fontWeight: '800', color: '#166534' }}>{l.weeklyHours} Saat</Text>
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
                                  👨‍🏫 Öğretmen Kadrosu ({activeTeachersCount}/{teachersList.length} Aktif)
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
                                {teachersList.map((t, idx) => {
                                  const isExcluded = excludedTeachers.includes(t);
                                  return (
                                    <View
                                      key={idx}
                                      style={[styles.itemChip, isExcluded && styles.itemChipExcluded, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                                    >
                                      <TouchableOpacity
                                        onPress={() => toggleExcludeTeacher(t)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
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
                                      <TouchableOpacity
                                        onPress={() => handleOpenTeacherScheduleInspector(t)}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        style={{ paddingLeft: 3 }}
                                      >
                                        <Ionicons name="create-outline" size={13} color={isExcluded ? '#94A3B8' : '#4F46E5'} />
                                      </TouchableOpacity>
                                    </View>
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
                                  🏫 Sınıflar & Şubeler ({activeClassesCount}/{classesList.length} Aktif)
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
                                {classesList.map((c, idx) => {
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
                                  📚 Ders Havuzu ({activeLessonsCount}/{lessonsList.length} Aktif)
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
                                {lessonsList.map((l, idx) => {
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
                                  📅 Haftalık Ders Programı ({activeScheduleItemsCount}/{scheduleItemsList.length} Ders Saati Aktif)
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
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {/* Havuza Ekle Butonu */}
                    <TouchableOpacity
                      style={[styles.batchSaveToPoolBtn, { flex: 1 }]}
                      onPress={handleAddCurrentToBatches}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="archive-outline" size={17} color="#059669" />
                      <Text style={styles.batchSaveToPoolBtnText}>📥 Havuza Ekle</Text>
                    </TouchableOpacity>

                    {/* Havuzdaki Diğer Parçalarla Birleştir Butonu (Varsa) */}
                    {scheduleBatches.length > 0 && (
                      <TouchableOpacity
                        style={[styles.batchMergeBtn, { flex: 1 }]}
                        onPress={handleMergeAllBatches}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="git-merge-outline" size={17} color="#4F46E5" />
                        <Text style={styles.batchMergeBtnText}>
                          🧩 Havuzla Birleştir ({scheduleBatches.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

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
                          <Text style={styles.confirmSaveText}>Seçilenleri Sunucuya Kaydet</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* 5.1.5 Çarşaf AI Öğretmen Programı İnceleme & Elle Düzenleme Modalı */}
      <Modal visible={inspectTeacherModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%', paddingBottom: 16 }]}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="person-circle" size={26} color="#4F46E5" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>{inspectingTeacher}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Çarşaf Program İnceleme & Eksik Saat Tamamlama
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setInspectTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
              {/* Durum / Sağlama Kartı */}
              {(() => {
                const expectedHours = inspectingVerification?.expectedWeeklyHours;
                const currentHours = inspectingItems.length;
                const diff = expectedHours != null ? expectedHours - currentHours : 0;
                const isMatched = expectedHours != null && diff === 0;

                return (
                  <View style={{
                    backgroundColor: isMatched ? '#F0FDF4' : diff > 0 ? '#FFFBEB' : '#FEF2F2',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isMatched ? '#BBF7D0' : diff > 0 ? '#FCD34D' : '#FECACA',
                    padding: 12,
                    marginBottom: 12,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                        ⚖️ Haftalık Ders Yükü Durumu
                      </Text>
                      <View style={{
                        backgroundColor: isMatched ? '#DCFCE7' : diff > 0 ? '#FEF3C7' : '#FEE2E2',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: isMatched ? '#15803D' : diff > 0 ? '#B45309' : '#DC2626',
                        }}>
                          {expectedHours == null
                            ? `${currentHours} Saat Yerleşti`
                            : isMatched
                            ? `✅ Tam Tutarlı (${currentHours}/${expectedHours} Saat)`
                            : diff > 0
                            ? `⚠️ ${diff} Saat Eksik (${currentHours}/${expectedHours} Saat)`
                            : `⚠️ ${Math.abs(diff)} Saat Fazla (${currentHours}/${expectedHours} Saat)`}
                        </Text>
                      </View>
                    </View>

                    {(pendingScheduleFile || cachedScheduleDoc) && (
                      <View style={{ marginBottom: 8 }}>
                        {/* İPUCU / DÜZELTME GİRDİ ALANI */}
                        <View style={{
                          backgroundColor: '#F8FAFC',
                          borderWidth: 1,
                          borderColor: '#E2E8F0',
                          borderRadius: 8,
                          padding: 8,
                          marginBottom: 6,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="bulb-outline" size={13} color="#D97706" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>
                                AI İpucu / Düzeltme Notu (İsteğe Bağlı)
                              </Text>
                            </View>
                            {teacherRescanHint.length > 0 && (
                              <TouchableOpacity onPress={() => setTeacherRescanHint('')}>
                                <Text style={{ fontSize: 10, color: '#94A3B8' }}>Temizle</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <TextInput
                            placeholder="Örn: Salı günü tamamen boş, dersler Çarşamba günüdür..."
                            placeholderTextColor="#94A3B8"
                            value={teacherRescanHint}
                            onChangeText={setTeacherRescanHint}
                            style={{
                              backgroundColor: '#FFFFFF',
                              borderWidth: 1,
                              borderColor: '#CBD5E1',
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                              fontSize: 11,
                              color: '#1E293B',
                            }}
                          />
                        </View>

                        <TouchableOpacity
                          disabled={reScanningTeacher}
                          onPress={() => handleRescanTeacherFromDocument()}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            backgroundColor: teacherRescanHint.trim() ? '#4338CA' : '#EEF2FF',
                            borderWidth: 1,
                            borderColor: teacherRescanHint.trim() ? '#3730A3' : '#C7D2FE',
                            borderRadius: 8,
                            paddingVertical: 8,
                          }}
                        >
                          {reScanningTeacher ? (
                            <ActivityIndicator size="small" color={teacherRescanHint.trim() ? '#fff' : '#4F46E5'} />
                          ) : (
                            <Ionicons name="flash" size={14} color={teacherRescanHint.trim() ? '#fff' : '#4F46E5'} />
                          )}
                          <Text style={{ fontSize: 11, fontWeight: '700', color: teacherRescanHint.trim() ? '#fff' : '#4338CA' }}>
                            {reScanningTeacher
                              ? 'Öğretmen Belgeden Taranıyor...'
                              : teacherRescanHint.trim()
                              ? '⚡ İpucuyla Belgeden Yeniden Oku'
                              : '⚡ Bu Öğretmeni Belgeden Yeniden Oku'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Kağıttaki Beklenen Saat Ayarı (Gerekirse düzeltme) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, marginTop: 4, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Ionicons name="document-text-outline" size={15} color="#4F46E5" />
                        <Text style={{ fontSize: 11, color: '#475569' }}>
                          Kağıttaki Resmi Saat (HS): <Text style={{ fontWeight: '800', color: '#1E293B' }}>{expectedHours ?? 'Belirtilmemiş'} Saat</Text>
                        </Text>
                      </View>
                      {editingExpectedHours ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TextInput
                            style={{
                              borderWidth: 1,
                              borderColor: '#4F46E5',
                              borderRadius: 6,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              fontSize: 11,
                              fontWeight: '700',
                              width: 44,
                              textAlign: 'center',
                              backgroundColor: '#fff',
                            }}
                            keyboardType="numeric"
                            value={tempExpectedHours}
                            onChangeText={setTempExpectedHours}
                          />
                          <TouchableOpacity onPress={handleSaveExpectedHours} style={{ backgroundColor: '#4F46E5', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingExpectedHours(false)} style={{ backgroundColor: '#94A3B8', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
                            <Ionicons name="close" size={12} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => setEditingExpectedHours(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                          <Ionicons name="pencil" size={11} color="#4F46E5" />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>Düzelt</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 6, lineHeight: 14 }}>
                      {diff > 0
                        ? '💡 Kağıttaki programa göre eksik kalan dersler var. Aşağıdan ilgili güne gidip boş saatlere ders ekleyebilirsiniz.'
                        : diff < 0
                        ? '⚠️ Kağıttan fazla ders girilmiş görünüyor. Mükerrer dersleri çöp kutusu simgesine basarak silebilirsiniz.'
                        : '🎉 Bu öğretmenin haftalık ders programı kağıttaki çizelgeyle tam olarak örtüşüyor.'}
                    </Text>
                  </View>
                );
              })()}

              {/* Alt tablodan okunan ders yükü dökümü - TIKLANABİLİR HIZLI DOLDURMA KARTLARI */}
              {inspectingVerification?.workloadItems && inspectingVerification.workloadItems.length > 0 && (
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#CBD5E1', padding: 10, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>
                      📄 Kağıdın Alt Tablosundaki Ders Dağılımı:
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1' }}>
                      ⚡ Dokunarak Saate Otomatik Doldur
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {inspectingVerification.workloadItems.map((wi, wIdx) => {
                      const cleanCls = wi.className.replace('/', '-').trim().toUpperCase();
                      const parts = cleanCls.split('-');
                      const lName = wi.lessonName || wi.lessonCode || 'Ders';
                      const currentEditCls = editingCellSlot ? `${editingCellSlot.grade}-${editingCellSlot.section}`.toUpperCase() : '';
                      const isSelected = editingCellSlot && currentEditCls === cleanCls && (
                        editingCellSlot.lessonName.toUpperCase() === lName.toUpperCase() ||
                        editingCellSlot.lessonName.toUpperCase() === (wi.lessonCode || '').toUpperCase()
                      );

                      return (
                        <TouchableOpacity
                          key={wIdx}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (editingCellSlot) {
                              setEditingCellSlot({
                                ...editingCellSlot,
                                grade: parts[0] || '9',
                                section: parts[1] || 'A',
                                lessonName: lName,
                              });
                            } else {
                              // Aktif gündeki ilk boş saati bulup otomatik düzenlemeye al
                              const maxH = Math.max(8, ...inspectingItems.map(it => it.lessonHour));
                              const allHours = Array.from({ length: maxH }, (_, i) => i + 1);
                              const firstEmpty = allHours.find(h => !inspectingItems.some(it => it.dayOfWeek === inspectDayTab && it.lessonHour === h)) || 1;
                              setEditingCellSlot({
                                dayOfWeek: inspectDayTab,
                                lessonHour: firstEmpty,
                                grade: parts[0] || '9',
                                section: parts[1] || 'A',
                                lessonName: lName,
                              });
                            }
                          }}
                          style={{
                            backgroundColor: isSelected ? '#4F46E5' : '#FFFFFF',
                            borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#3730A3' : '#94A3B8',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            shadowColor: isSelected ? '#4F46E5' : '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: isSelected ? 0.2 : 0.05,
                            shadowRadius: 2,
                            elevation: isSelected ? 2 : 1,
                          }}
                        >
                          {isSelected && <Ionicons name="checkmark-circle" size={13} color="#fff" />}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#fff' : '#1E293B' }}>
                            {cleanCls} {wi.lessonCode || wi.lessonName}
                          </Text>
                          <View style={{
                            backgroundColor: isSelected ? '#3730A3' : '#EEF2FF',
                            borderRadius: 5,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                          }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: isSelected ? '#C7D2FE' : '#4F46E5' }}>
                              {wi.weeklyHours} Saat
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Gün Seçici Sekmeler (Pazartesi .. Cuma) */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {[
                  { id: 1, name: 'Pazartesi', short: 'Pzt' },
                  { id: 2, name: 'Salı', short: 'Sal' },
                  { id: 3, name: 'Çarşamba', short: 'Çar' },
                  { id: 4, name: 'Perşembe', short: 'Per' },
                  { id: 5, name: 'Cuma', short: 'Cum' },
                ].map((d) => {
                  const dayLessons = inspectingItems.filter(it => it.dayOfWeek === d.id);
                  const dayCount = dayLessons.length;
                  const isActive = inspectDayTab === d.id;

                  // Bu günde bu öğretmenin başka öğretmenle çakışan dersi var mı?
                  const hasDayConflict = dayLessons.some(it => {
                    const itemClass = `${it.grade}-${it.section}`.toUpperCase().trim();
                    return (parsedSchedule?.scheduleItems || []).some(ot =>
                      (ot.teacherName || '').trim().toLowerCase() !== inspectingTeacher.trim().toLowerCase() &&
                      ot.dayOfWeek === d.id &&
                      ot.lessonHour === it.lessonHour &&
                      `${ot.grade}-${ot.section}`.toUpperCase().trim() === itemClass
                    );
                  });

                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setInspectDayTab(d.id);
                        setEditingCellSlot(null);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        backgroundColor: isActive
                          ? (hasDayConflict ? '#DC2626' : '#4F46E5')
                          : (hasDayConflict ? '#FEF2F2' : '#F1F5F9'),
                        borderWidth: hasDayConflict ? 1.5 : 1,
                        borderColor: isActive
                          ? (hasDayConflict ? '#B91C1C' : '#4F46E5')
                          : (hasDayConflict ? '#EF4444' : '#CBD5E1'),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: isActive
                            ? '#FFFFFF'
                            : (hasDayConflict ? '#DC2626' : '#475569'),
                        }}
                      >
                        {hasDayConflict ? `⚠️ ${d.short}` : d.short}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: isActive
                            ? (hasDayConflict ? '#FEE2E2' : '#C7D2FE')
                            : (hasDayConflict ? '#EF4444' : '#94A3B8'),
                          marginTop: 2,
                        }}
                      >
                        {dayCount} Saat {hasDayConflict ? '(!)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Aktif Gün Hızlı İşlemler (Boşalt veya Başka Güne Taşı) */}
              {(() => {
                const currentDayLessons = inspectingItems.filter(it => it.dayOfWeek === inspectDayTab);
                const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
                const currentDayName = dayNames[inspectDayTab - 1] || 'Gün';

                if (currentDayLessons.length === 0) return null;

                return (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    marginBottom: 10,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Ionicons name="information-circle" size={16} color="#DC2626" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#991B1B' }}>
                        {currentDayName}: {currentDayLessons.length} ders
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const otherDays = [
                            { id: 1, name: 'Pazartesi' },
                            { id: 2, name: 'Salı' },
                            { id: 3, name: 'Çarşamba' },
                            { id: 4, name: 'Perşembe' },
                            { id: 5, name: 'Cuma' },
                          ].filter(d => d.id !== inspectDayTab);

                          Alert.alert(
                            'Dersleri Başka Güne Taşı',
                            `${currentDayName} günündeki ${currentDayLessons.length} dersi hangi güne aktarmak istiyorsunuz?`,
                            [
                              ...otherDays.map(d => ({
                                text: d.name,
                                onPress: () => {
                                  setInspectingItems(prev => {
                                    return prev.map(it => {
                                      if (it.dayOfWeek === inspectDayTab) {
                                        return { ...it, dayOfWeek: d.id };
                                      }
                                      return it;
                                    });
                                  });
                                  setInspectDayTab(d.id);
                                }
                              })),
                              { text: 'Vazgeç', style: 'cancel' }
                            ]
                          );
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#4F46E5',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Ionicons name="arrow-forward-circle-outline" size={13} color="#fff" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Güne Taşı</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Günü Boşalt',
                            `${currentDayName} günündeki ${currentDayLessons.length} dersi silip günü tamamen boşaltmak istiyor musunuz?`,
                            [
                              { text: 'Vazgeç', style: 'cancel' },
                              {
                                text: 'Günü Boşalt',
                                style: 'destructive',
                                onPress: () => {
                                  setInspectingItems(prev => prev.filter(it => it.dayOfWeek !== inspectDayTab));
                                }
                              }
                            ]
                          );
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#DC2626',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Ionicons name="trash-bin-outline" size={13} color="#fff" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Günü Boşalt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {/* Hücre Düzenleme / Ekleme Kartı (Varsa Açık) */}
              {editingCellSlot && (
                <View style={{
                  backgroundColor: '#EEF2FF',
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#818CF8',
                  padding: 12,
                  marginBottom: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#312E81' }}>
                      ✏️ {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'][editingCellSlot.dayOfWeek - 1]} - {editingCellSlot.lessonHour}. Ders Saati
                    </Text>
                    <TouchableOpacity onPress={() => setEditingCellSlot(null)}>
                      <Ionicons name="close-circle" size={18} color="#6366F1" />
                    </TouchableOpacity>
                  </View>

                  {/* 0. DERS SAATİ NUMARASI SEÇİMİ */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                        ⏰ Ders Saati Numarası:
                      </Text>
                      <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#1E40AF' }}>
                          {editingCellSlot.lessonHour}. Ders Saati
                        </Text>
                      </View>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                        {Array.from(
                          { length: Math.max(10, ...inspectingItems.map(it => it.lessonHour), editingCellSlot.lessonHour) },
                          (_, i) => i + 1
                        ).map((h) => {
                          const isSel = editingCellSlot.lessonHour === h;
                          const isOccupied = inspectingItems.some(it =>
                            it.dayOfWeek === editingCellSlot.dayOfWeek &&
                            it.lessonHour === h &&
                            !(it.dayOfWeek === (editingCellSlot.originDayOfWeek ?? editingCellSlot.dayOfWeek) &&
                              it.lessonHour === (editingCellSlot.originLessonHour ?? editingCellSlot.lessonHour))
                          );

                          return (
                            <TouchableOpacity
                              key={h}
                              onPress={() => setEditingCellSlot({ ...editingCellSlot, lessonHour: h })}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                                backgroundColor: isSel ? '#4F46E5' : (isOccupied ? '#FEF3C7' : '#FFFFFF'),
                                borderWidth: 1.5,
                                borderColor: isSel ? '#4338CA' : (isOccupied ? '#F59E0B' : '#CBD5E1'),
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#FFFFFF' : (isOccupied ? '#92400E' : '#1E293B') }}>
                                {h}. Saat
                              </Text>
                              {isOccupied && !isSel && (
                                <Text style={{ fontSize: 8, fontWeight: '700', color: '#B45309' }}>Dolu</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>

                  {/* Listbox Seçim Alanı: Öğretmenin Kendi Dersleri ve Sınıfları */}
                  {(() => {
                    // 1. Öğretmenin Kendi Ders Listesi:
                    const teacherLessonsMap = new Map<string, { name: string; code?: string; weeklyHours?: number }>();
                    (inspectingVerification?.workloadItems || []).forEach(wi => {
                      const key = (wi.lessonName || wi.lessonCode || '').trim();
                      if (key) {
                        teacherLessonsMap.set(key.toUpperCase(), {
                          name: wi.lessonName || wi.lessonCode || key,
                          code: wi.lessonCode,
                          weeklyHours: wi.weeklyHours,
                        });
                      }
                      if (wi.lessonCode && wi.lessonName && wi.lessonCode !== wi.lessonName) {
                        teacherLessonsMap.set(wi.lessonCode.toUpperCase(), {
                          name: wi.lessonName,
                          code: wi.lessonCode,
                          weeklyHours: wi.weeklyHours,
                        });
                      }
                    });

                    inspectingItems.forEach(it => {
                      if (it.lessonName) {
                        const key = it.lessonName.trim().toUpperCase();
                        if (!teacherLessonsMap.has(key)) {
                          teacherLessonsMap.set(key, {
                            name: it.lessonName,
                            code: it.lessonCode,
                          });
                        }
                      }
                    });

                    const teacherLessons = Array.from(teacherLessonsMap.values());

                    // Diğer Okul Dersleri:
                    const otherLessons = (parsedSchedule?.lessons || []).filter(lsn => {
                      const upper = lsn.trim().toUpperCase();
                      return !teacherLessonsMap.has(upper) && !Array.from(teacherLessonsMap.values()).some(tl => tl.name.toUpperCase() === upper || tl.code?.toUpperCase() === upper);
                    });

                    // 2. Öğretmenin Kendi Sınıfları:
                    const teacherClassesSet = new Set<string>();
                    (inspectingVerification?.workloadItems || []).forEach(wi => {
                      if (wi.className) teacherClassesSet.add(wi.className.replace('/', '-').toUpperCase().trim());
                    });
                    inspectingItems.forEach(it => {
                      teacherClassesSet.add(`${it.grade}-${it.section}`.toUpperCase().trim());
                    });
                    const teacherClasses = Array.from(teacherClassesSet);

                    // Diğer Okul Şubeleri:
                    const otherClasses = (parsedSchedule?.classes || []).filter(cls => !teacherClassesSet.has(cls.toUpperCase().trim()));

                    const currentClass = `${editingCellSlot.grade}-${editingCellSlot.section}`.toUpperCase();

                    return (
                      <View style={{ gap: 10 }}>
                        {/* ⚡ Hızlı Paket Seçimi: Kağıdın Alt Tablosundaki Dağılım Çipleri */}
                        {inspectingVerification?.workloadItems && inspectingVerification.workloadItems.length > 0 && (
                          <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#4338CA', marginBottom: 5 }}>
                              ⚡ Kağıttaki Ders Paketiyle 1-Tıkla Doldur:
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                {inspectingVerification.workloadItems.map((wi, wIdx) => {
                                  const cleanCls = wi.className.replace('/', '-').toUpperCase();
                                  const parts = cleanCls.split('-');
                                  const lName = wi.lessonName || wi.lessonCode || 'Ders';
                                  const isSelected = currentClass === cleanCls && (editingCellSlot.lessonName.toUpperCase() === lName.toUpperCase() || editingCellSlot.lessonName.toUpperCase() === (wi.lessonCode || '').toUpperCase());

                                  return (
                                    <TouchableOpacity
                                      key={wIdx}
                                      onPress={() => {
                                        setEditingCellSlot({
                                          ...editingCellSlot,
                                          grade: parts[0] || '9',
                                          section: parts[1] || 'A',
                                          lessonName: lName,
                                        });
                                      }}
                                      style={{
                                        backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: isSelected ? '#4338CA' : '#CBD5E1',
                                        paddingHorizontal: 8,
                                        paddingVertical: 5,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                    >
                                      {isSelected && <Ionicons name="checkmark-circle" size={12} color="#fff" />}
                                      <Text style={{ fontSize: 11, fontWeight: '800', color: isSelected ? '#fff' : '#1E293B' }}>
                                        {cleanCls} • {wi.lessonCode || wi.lessonName}
                                      </Text>
                                      <View style={{ backgroundColor: isSelected ? '#3730A3' : '#E2E8F0', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: isSelected ? '#C7D2FE' : '#475569' }}>
                                          {wi.weeklyHours}s
                                        </Text>
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </ScrollView>
                          </View>
                        )}

                        {/* 1. ŞUBE SEÇİM LİSTBOX'I (Elle yazma kaldırıldı) */}
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                              🏫 Şube Seçimi:
                            </Text>
                            <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '900', color: '#1E40AF' }}>
                                Seçili: {currentClass}
                              </Text>
                            </View>
                          </View>

                          {/* Öğretmenin Şubeleri */}
                          <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '700', marginBottom: 3 }}>
                            Öğretmenin Girdiği Sınıflar:
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                            {teacherClasses.map((cls, cIdx) => {
                              const isSel = currentClass === cls;
                              const parts = cls.split('-');
                              return (
                                <TouchableOpacity
                                  key={cIdx}
                                  onPress={() => setEditingCellSlot({
                                    ...editingCellSlot,
                                    grade: parts[0] || '9',
                                    section: parts[1] || 'A',
                                  })}
                                  style={{
                                    backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? '#4338CA' : '#CBD5E1',
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#fff' : '#1E293B' }}>
                                    {cls}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Diğer Okul Şubeleri (Gerekirse) */}
                          {otherClasses.length > 0 && (
                            <>
                              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', marginBottom: 3 }}>
                                Diğer Okul Şubeleri:
                              </Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                  {otherClasses.map((cls, cIdx) => {
                                    const isSel = currentClass === cls;
                                    const parts = cls.split('-');
                                    return (
                                      <TouchableOpacity
                                        key={cIdx}
                                        onPress={() => setEditingCellSlot({
                                          ...editingCellSlot,
                                          grade: parts[0] || '9',
                                          section: parts[1] || 'A',
                                        })}
                                        style={{
                                          backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                          paddingHorizontal: 8,
                                          paddingVertical: 4,
                                          borderRadius: 6,
                                          borderWidth: 1,
                                          borderColor: isSel ? '#4338CA' : '#E2E8F0',
                                        }}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? '#fff' : '#64748B' }}>
                                          {cls}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </ScrollView>
                            </>
                          )}
                        </View>

                        {/* 2. DERS ADI SEÇİM LİSTBOX'I (Elle yazma kaldırıldı) */}
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                              📚 Ders Seçimi:
                            </Text>
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, maxWidth: '65%' }}>
                              <Text style={{ fontSize: 11, fontWeight: '900', color: '#92400E' }} numberOfLines={1}>
                                Seçili: {editingCellSlot.lessonName || 'Seçilmedi'}
                              </Text>
                            </View>
                          </View>

                          {/* Öğretmenin Resmî Dersleri */}
                          <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '700', marginBottom: 4 }}>
                            Öğretmenin Resmî Dersleri:
                          </Text>
                          <View style={{ gap: 5, marginBottom: 6 }}>
                            {teacherLessons.map((tl, lIdx) => {
                              const isSel = editingCellSlot.lessonName.toUpperCase() === tl.name.toUpperCase() ||
                                            (tl.code && editingCellSlot.lessonName.toUpperCase() === tl.code.toUpperCase());

                              return (
                                <TouchableOpacity
                                  key={lIdx}
                                  onPress={() => setEditingCellSlot({ ...editingCellSlot, lessonName: tl.name })}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? '#4338CA' : '#CBD5E1',
                                    paddingHorizontal: 10,
                                    paddingVertical: 7,
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Ionicons
                                      name={isSel ? "radio-button-on" : "radio-button-off"}
                                      size={16}
                                      color={isSel ? "#fff" : "#94A3B8"}
                                    />
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#fff' : '#1E293B', flex: 1 }} numberOfLines={1}>
                                      {tl.name}
                                    </Text>
                                  </View>
                                  {tl.code && (
                                    <View style={{ backgroundColor: isSel ? '#3730A3' : '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: '800', color: isSel ? '#C7D2FE' : '#475569' }}>
                                        {tl.code}
                                      </Text>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Diğer Okul Dersleri (Gerekirse) */}
                          {otherLessons.length > 0 && (
                            <>
                              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', marginBottom: 3 }}>
                                Diğer Okul Dersleri ({otherLessons.length}):
                              </Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                  {otherLessons.map((lsn, lIdx) => {
                                    const isSel = editingCellSlot.lessonName.toUpperCase() === lsn.toUpperCase();
                                    return (
                                      <TouchableOpacity
                                        key={lIdx}
                                        onPress={() => setEditingCellSlot({ ...editingCellSlot, lessonName: lsn })}
                                        style={{
                                          backgroundColor: isSel ? '#4F46E5' : '#FFFFFF',
                                          paddingHorizontal: 8,
                                          paddingVertical: 4,
                                          borderRadius: 6,
                                          borderWidth: 1,
                                          borderColor: isSel ? '#4338CA' : '#E2E8F0',
                                        }}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? '#fff' : '#64748B' }}>
                                          {lsn}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </ScrollView>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })()}

                  {/* Ekle / Vazgeç Butonları */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setEditingCellSlot(null)}
                      style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#E2E8F0', alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Vazgeç</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveCellSlot}
                      style={{ flex: 2, paddingVertical: 6, borderRadius: 6, backgroundColor: '#4F46E5', alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>💾 Saate Yerleştir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Seçili Günün Saatleri (1 .. maxPeriod) */}
              {(() => {
                const maxPeriod = Math.max(8, ...inspectingItems.map(it => it.lessonHour));
                const hoursList = Array.from({ length: maxPeriod }, (_, i) => i + 1);

                return (
                  <View style={{ gap: 6 }}>
                    {hoursList.map((period) => {
                      const item = inspectingItems.find(it => it.dayOfWeek === inspectDayTab && it.lessonHour === period);

                      if (item) {
                        const itemClass = `${item.grade}-${item.section}`.toUpperCase().trim();
                        const conflictItem = (parsedSchedule?.scheduleItems || []).find(ot =>
                          (ot.teacherName || '').trim().toLowerCase() !== inspectingTeacher.trim().toLowerCase() &&
                          ot.dayOfWeek === inspectDayTab &&
                          ot.lessonHour === period &&
                          `${ot.grade}-${ot.section}`.toUpperCase().trim() === itemClass
                        );

                        return (
                          <View
                            key={period}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: conflictItem ? '#FEF2F2' : '#FFFFFF',
                              borderRadius: 10,
                              padding: 10,
                              borderWidth: 1,
                              borderColor: conflictItem ? '#FCA5A5' : '#CBD5E1',
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <View style={{
                                width: 28,
                                height: 28,
                                borderRadius: 7,
                                backgroundColor: conflictItem ? '#DC2626' : '#4F46E5',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{period}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                                    {item.grade}-{item.section}
                                  </Text>
                                  {conflictItem && (
                                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626' }}>⚠️ ÇAKIŞMA</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                                  {item.lessonName}
                                </Text>
                                {conflictItem && (
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#B91C1C', marginTop: 2 }}>
                                    ⚠️ {conflictItem.teacherName} da bu saatte {item.grade}-{item.section}'de!
                                  </Text>
                                )}
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {/* 🔼 Yukarı Kaydır Butonu */}
                              <TouchableOpacity
                                onPress={() => handleShiftLessonHour(inspectDayTab, period, period - 1)}
                                disabled={period <= 1}
                                style={{
                                  backgroundColor: period <= 1 ? '#F1F5F9' : '#EEF2FF',
                                  padding: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: period <= 1 ? '#E2E8F0' : '#C7D2FE',
                                }}
                              >
                                <Ionicons name="chevron-up" size={13} color={period <= 1 ? '#CBD5E1' : '#4F46E5'} />
                              </TouchableOpacity>

                              {/* 🔽 Aşağı Kaydır Butonu */}
                              <TouchableOpacity
                                onPress={() => handleShiftLessonHour(inspectDayTab, period, period + 1)}
                                disabled={period >= maxPeriod}
                                style={{
                                  backgroundColor: period >= maxPeriod ? '#F1F5F9' : '#EEF2FF',
                                  padding: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: period >= maxPeriod ? '#E2E8F0' : '#C7D2FE',
                                }}
                              >
                                <Ionicons name="chevron-down" size={13} color={period >= maxPeriod ? '#CBD5E1' : '#4F46E5'} />
                              </TouchableOpacity>

                              {/* 🔀 Saate Taşı / Değiş Tokuş Butonu */}
                              <TouchableOpacity
                                onPress={() => handlePromptMoveLessonHour(inspectDayTab, period, maxPeriod)}
                                style={{
                                  backgroundColor: '#F0FDF4',
                                  paddingHorizontal: 6,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: '#BBF7D0',
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A' }}>Taşı ➔</Text>
                              </TouchableOpacity>

                              {conflictItem && (
                                <TouchableOpacity
                                  onPress={() => handleOpenTeacherScheduleInspector(conflictItem.teacherName)}
                                  style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}
                                >
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#4F46E5' }}>Diğerini Aç ➔</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => handleStartEditCell(inspectDayTab, period)}
                                style={{ backgroundColor: '#EEF2FF', padding: 6, borderRadius: 6 }}
                              >
                                <Ionicons name="pencil" size={14} color="#4F46E5" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeleteCellSlot(inspectDayTab, period)}
                                style={{ backgroundColor: '#FEF2F2', padding: 6, borderRadius: 6 }}
                              >
                                <Ionicons name="trash-outline" size={14} color="#DC2626" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      }

                      return (
                        <TouchableOpacity
                          key={period}
                          onPress={() => handleStartEditCell(inspectDayTab, period)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC',
                            borderRadius: 10,
                            padding: 10,
                            borderWidth: 1,
                            borderStyle: 'dashed',
                            borderColor: '#CBD5E1',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              backgroundColor: '#E2E8F0',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B' }}>{period}</Text>
                            </View>
                            <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>
                              Boş Ders Saati
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Ionicons name="add" size={14} color="#059669" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>+ Ders Ekle</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
            </ScrollView>

            {/* Modal Alt Aksiyon Butonları */}
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
              <TouchableOpacity
                onPress={() => setInspectTeacherModalVisible(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleApplyTeacherInspectorChanges}
                style={{
                  flex: 2,
                  flexDirection: 'row',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: '#059669',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-done" size={17} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                  Değişiklikleri Programa Aktar ({inspectingItems.length} Saat)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5.1 Çarşaf Parça Havuzu Modalı */}
      <Modal visible={batchPoolModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="file-tray-full" size={24} color="#059669" />
                <View>
                  <Text style={styles.modalTitle}>📦 Çarşaf Parça Havuzu</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Çok sayfalı PDF'leri parça parça biriktirin ve tek seferde kayıpsız kurun
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setBatchPoolModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
              {scheduleBatches.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                  <Ionicons name="file-tray-outline" size={48} color="#94A3B8" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#475569', marginTop: 12 }}>
                    Havuzda Henüz Parça Bulunmuyor
                  </Text>
                  <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                    Büyük PDF'inizi 2 parça halinde (Örn: 1. Yarı ve 2. Yarı) yüklerken, her analiz sonrası "📥 Havuza Ekle" butonuna basarak verileri burada biriktirebilirsiniz.{'\n\n'}
                    Tüm parçalar biriktiğinde PDF okutmaya gerek kalmadan tek tıkla birleştirip sıfırdan kurulum yapabilirsiniz.
                  </Text>
                  <TouchableOpacity
                    style={[styles.confirmSaveButton, { marginTop: 20, paddingHorizontal: 20 }]}
                    onPress={() => {
                      setBatchPoolModalVisible(false);
                      handlePickAndAnalyzeSchedule();
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={styles.confirmSaveText}>İlk Parçayı Yükle</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>
                      💡 Bilgi: Havuzda {scheduleBatches.length} parça depolandı
                    </Text>
                    <Text style={{ fontSize: 12, color: '#15803D', marginTop: 3 }}>
                      "Tüm Parçaları Birleştir" butonuna basarak tüm öğretmenleri ve ders saatlerini tek bir program halinde birleştirebilirsiniz.
                    </Text>
                  </View>

                  {scheduleBatches.map((batch, index) => {
                    const tCount = batch.data?.teachers?.length || 0;
                    const cCount = batch.data?.classes?.length || 0;
                    const lCount = batch.data?.lessons?.length || 0;
                    const sCount = batch.data?.scheduleItems?.length || 0;
                    const dateStr = new Date(batch.createdAt).toLocaleString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <View key={batch.id} style={styles.batchCard}>
                        <View style={styles.batchCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.batchCardTitle}>{batch.name}</Text>
                            <Text style={styles.batchCardDate}>Kayıt: {dateStr}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemoveBatch(batch.id)}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.batchCardStatsRow}>
                          <View style={styles.batchCardStatBadge}>
                            <Text style={styles.batchCardStatText}>👨‍🏫 {tCount} Öğretmen</Text>
                          </View>
                          <View style={styles.batchCardStatBadge}>
                            <Text style={styles.batchCardStatText}>🏫 {cCount} Şube</Text>
                          </View>
                          <View style={styles.batchCardStatBadge}>
                            <Text style={styles.batchCardStatText}>📚 {lCount} Ders</Text>
                          </View>
                          <View style={[styles.batchCardStatBadge, { backgroundColor: '#EEF2FF' }]}>
                            <Text style={[styles.batchCardStatText, { color: '#4F46E5' }]}>
                              📅 {sCount} Ders Saati
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {scheduleBatches.length > 0 && (
              <View style={{ gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#4F46E5', width: '100%' }]}
                  onPress={handleMergeAllBatches}
                >
                  <Ionicons name="git-merge" size={18} color="#fff" />
                  <Text style={styles.confirmSaveText}>
                    🧩 Tüm Parçaları Birleştir ve İncele / Kur
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.cancelUploadButton, { flex: 1, backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                    onPress={handleClearAllBatches}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={[styles.cancelUploadText, { color: '#DC2626' }]}>Havuzu Temizle</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelUploadButton, { flex: 1 }]}
                    onPress={() => {
                      setBatchPoolModalVisible(false);
                      handlePickAndAnalyzeSchedule();
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#475569" />
                    <Text style={styles.cancelUploadText}>➕ Yeni Parça Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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

      {/* 6.1 AI ile Excel Öğrenci Yükleme Onay Modalı */}
      <Modal visible={aiStudentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', width: Platform.OS === 'web' ? 700 : '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={22} color="#8B5CF6" />
                <Text style={styles.modalTitle}>✨ AI ile Excel Öğrenci Aktarımı</Text>
              </View>
              <TouchableOpacity onPress={() => setAiStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {aiStudentParsing ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.aiLoadingText}>Yapay Zeka Excel Tablosunu Çözümlüyor...</Text>
                <Text style={styles.aiLoadingSub}>
                  Sütunlar (Okul No, Ad Soyad, Sınıf, Şube vb.) haritalandırılıyor, boş ve gereksiz satırlar eleniyor.
                </Text>
              </View>
            ) : aiStudentResult && aiStudentResult.students.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                {/* AI Başlık ve Model Rozeti */}
                <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#DDD6FE', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#6D28D9' }}>
                      🤖 {aiStudentResult.modelUsed || 'Gemini Flash'} ile Çözümlendi
                    </Text>
                    {aiStudentResult.schoolName && (
                      <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#5B21B6' }}>
                          🏫 {aiStudentResult.schoolName}
                        </Text>
                      </View>
                    )}
                  </View>
                  {aiStudentResult.aiReason && (
                    <Text style={{ fontSize: 12, color: '#4C1D95', lineHeight: 18 }}>
                      {aiStudentResult.aiReason}
                    </Text>
                  )}
                </View>

                {/* İstatistik Sayaçları */}
                <View style={[styles.previewGrid, { marginBottom: 12 }]}>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#8B5CF6' }]}>{aiStudentResult.students.length}</Text>
                    <Text style={styles.previewLbl}>Öğrenci</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#059669' }]}>{aiStudentResult.detectedClasses.length}</Text>
                    <Text style={styles.previewLbl}>Sınıf / Şube</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#D97706' }]}>{aiStudentResult.skippedRowsCount}</Text>
                    <Text style={styles.previewLbl}>Atlanan Satır</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={[styles.previewVal, { color: '#64748B' }]}>{aiStudentResult.totalRawRows}</Text>
                    <Text style={styles.previewLbl}>Toplam Satır</Text>
                  </View>
                </View>

                {/* Tespit Edilen Sınıflar Rozetleri */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 }}>
                  Tespit Edilen Sınıflar ({aiStudentResult.detectedClasses.length}):
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {aiStudentResult.detectedClasses.map((cls) => (
                    <View key={cls} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#4338CA' }}>{cls}</Text>
                    </View>
                  ))}
                </View>

                {/* İlk 6 Öğrenci Önizleme Listesi */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 }}>
                  Örnek Öğrenci Önizlemesi (İlk {Math.min(aiStudentResult.students.length, 6)} Kayıt):
                </Text>
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 8, marginBottom: 14 }}>
                  {aiStudentResult.students.slice(0, 6).map((s, idx) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 6,
                        borderBottomWidth: idx < 5 && idx < (aiStudentResult?.students.length ?? 0) - 1 ? 1 : 0,
                        borderBottomColor: '#F1F5F9',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#6D28D9' }}>{s.studentNumber}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, flex: 1 }} numberOfLines={1}>
                          {s.fullName}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369A1' }}>
                            {s.grade}-{s.section}
                          </Text>
                        </View>
                        {s.gender && (
                          <Text style={{ fontSize: 11, color: Colors.textMuted }}>{s.gender}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.confirmSaveButton, { backgroundColor: '#8B5CF6' }]}
                  onPress={handleConfirmAndSaveAiStudents}
                  disabled={aiStudentSaving}
                >
                  {aiStudentSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.confirmSaveText}>
                        {aiStudentResult.students.length} Öğrenciyi Onayla & Sunucuya Aktar
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
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

            <Text style={styles.inputLabel}>Kademe (Sınıf Düzeyi - Müfredat Planı Bu Düzeyle Eşleşir)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {['9', '10', '11', '12', 'Tüm Kademeler'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: editLessonGrade === g ? '#4F46E5' : '#CBD5E1',
                    backgroundColor: editLessonGrade === g ? '#EEF2FF' : '#FFFFFF',
                  }}
                  onPress={() => setEditLessonGrade(g)}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: editLessonGrade === g ? '#4F46E5' : '#64748B' }}>
                    {g.includes('Tüm') ? g : `${g}. Sınıf`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 11 veya Tüm Kademeler"
              value={editLessonGrade}
              onChangeText={setEditLessonGrade}
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

      {/* 3.1.5 Yıllık Plan Excel Çoklu Sheet Seçim Modalı */}
      <Modal
        visible={planSheetPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPlanSheetPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="layers" size={22} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { fontSize: 16 }]}>Çalışma Sayfası (Sheet) Seçin</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                    {planSheetPickerLesson?.name} ({planSheetPickerLesson?.grade ? `${planSheetPickerLesson.grade}. Sınıf` : 'Tüm Kademeler'}) • {planSheetPickerAsset?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setPlanSheetPickerVisible(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', padding: 10, borderRadius: 8, marginVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="information-circle" size={16} color="#16A34A" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                  Bu Excel dosyasında {planSheetPickerSheets.length} adet çalışma sayfası bulundu.
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: '#15803D', marginTop: 3, lineHeight: 16 }}>
                Yıllık plan konularını ve kazanımlarını aktarmak istediğiniz sayfayı listeden seçiniz:
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: 320, marginVertical: 4 }}
              contentContainerStyle={{ gap: 8, paddingBottom: 6 }}
              showsVerticalScrollIndicator={true}
            >
              {planSheetPickerSheets.map((sheetName, sIdx) => (
                <TouchableOpacity
                  key={sIdx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                  onPress={() => handleProceedWithPlanSheet(sheetName)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-text-outline" size={17} color="#4F46E5" />
                    </View>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#1E293B' }} numberOfLines={1}>
                      {sheetName}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Seç</Text>
                    <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={{
                marginTop: 10,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#CBD5E1',
                backgroundColor: '#F8FAFC',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() => setPlanSheetPickerVisible(false)}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>İptal / Vazgeç</Text>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  <Text style={[styles.headerSubtitle, { fontWeight: '800', color: '#1E293B' }]} numberOfLines={1}>
                    {selectedLessonForPlan?.name}
                  </Text>
                  <View style={{
                    backgroundColor: '#EEF2FF',
                    borderColor: '#C7D2FE',
                    borderWidth: 1,
                    paddingHorizontal: 7,
                    paddingVertical: 1.5,
                    borderRadius: 4,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#4338CA' }}>
                      🎯 Hedef Kademe: {selectedLessonForPlan?.grade && selectedLessonForPlan.grade !== 'Tüm Kademeler' ? `${selectedLessonForPlan.grade}. Sınıf` : 'Tüm Kademeler'}
                    </Text>
                  </View>
                </View>
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

                {/* 🧮 Ders Saati ve Hafta Matematiği Bilgilendirme Kartı */}
                {docAnalysis.detectedTotalHours && docAnalysis.detectedWeeklyHours ? (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0', padding: 10, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="calculator-outline" size={16} color="#16A34A" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                        MEB Müfredat Saati Matematiği:
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#15803D', marginTop: 3, lineHeight: 16 }}>
                      Belgede tespit edilen: Yıllık Toplam <Text style={{ fontWeight: '800' }}>{docAnalysis.detectedTotalHours} Saat</Text> ÷ Haftalık <Text style={{ fontWeight: '800' }}>{docAnalysis.detectedWeeklyHours} Saat</Text> = <Text style={{ fontWeight: '800', color: '#166534' }}>{docAnalysis.calculatedWeeks || Math.round(docAnalysis.detectedTotalHours / docAnalysis.detectedWeeklyHours)} Hafta</Text>
                    </Text>
                  </View>
                ) : null}

                {/* 🌴 Dönem Arası Tatiller Bilgilendirme Kartı */}
                {docAnalysis.detectedHolidays && docAnalysis.detectedHolidays.length > 0 ? (
                  <View style={{ backgroundColor: '#FFFBEB', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', padding: 10, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sunny-outline" size={16} color="#D97706" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>
                        Dönem Arası Tatiller Tespit Edildi ({docAnalysis.detectedHolidays.length} Ara/Tatil):
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#92400E', marginTop: 3, lineHeight: 16 }}>
                      {docAnalysis.detectedHolidays.join(' • ')}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#B45309', marginTop: 3, fontStyle: 'italic' }}>
                      Tatil haftaları eğitim dersi sayımından hariç tutularak hafta numaraları eksiksiz ve tutarlı şekilde dengelendi.
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

      {/* 🧹 PROGRAM VE KADRO SIFIRLAMA / TEMİZLEME MODALI */}
      <Modal visible={scheduleResetModalVisible} animationType="fade" transparent onRequestClose={() => setScheduleResetModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 540 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.sanityHeaderIconBox, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="trash" size={20} color="#DC2626" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Program & Kadro Sıfırlama</Text>
                  <Text style={styles.modalSubTitle}>İstediğiniz veri grubunu temizleyerek artık verilerden arının.</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setScheduleResetModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460, marginTop: 12 }}>
              {/* Seçenek 1: Tüm Okul Ders Programını Sil */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={handleClearAllSchedules}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="calendar-outline" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetActionTitle}>🗑️ Tüm Okul Ders Programını Sil</Text>
                  <Text style={styles.resetActionDesc}>
                    Tüm şubelerin ve tüm öğretmenlerin haftalık ders saatlerini tamamen siler ({allSchoolSchedules.length} saat). Şube ve öğretmen isimleri korunur.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 2: Yalnızca Seçili Şubeyi Boşalt */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={handleClearCurrentClassSchedule}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="school-outline" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetActionTitle}>
                    🏫 Seçili Şubenin Programını Sil ({selectedClassForEditor || (classes[0] ? `${classes[0].grade}-${classes[0].section}` : 'Şube')})
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Yalnızca bu şubeye ait haftalık ders saatlerini boşaltır. İlgili öğretmenlerin saatlerinden de düşer.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 3: Yalnızca Seçili Öğretmeni Boşalt */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={handleClearCurrentTeacherSchedule}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#E0E7FF' }]}>
                  <Ionicons name="person-outline" size={22} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetActionTitle}>
                    👨‍🏫 Seçili Öğretmenin Programını Sil ({selectedTeacherForEditor || (teachers[0] ? teachers[0].fullName : 'Öğretmen')})
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Yalnızca bu öğretmenin haftalık ders saatlerini boşaltır. İlgili şubelerin saatlerinden de kaldırılır.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 4: Tüm Öğretmen Kadrosunu Sil */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={() => {
                  setScheduleResetModalVisible(false);
                  handleDeleteAllTeachers();
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="people-outline" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resetActionTitle, { color: '#DC2626' }]}>
                    👥 Tüm Öğretmen Kadrosunu Sil ({teachers.length} Öğretmen)
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Sisteme kayıtlı öğretmen kullanıcılarını tamamen siler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Seçenek 5: Tüm Şubeleri Sil */}
              <TouchableOpacity
                style={styles.resetActionCard}
                onPress={() => {
                  setScheduleResetModalVisible(false);
                  handleDeleteAllClasses();
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.resetActionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="business-outline" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resetActionTitle, { color: '#DC2626' }]}>
                    🏢 Tüm Şubeleri ve Sınıfları Sil ({classes.length} Şube)
                  </Text>
                  <Text style={styles.resetActionDesc}>
                    Sisteme kayıtlı sınıf ve şube tanımlarını tamamen siler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { marginTop: 16 }]}
              onPress={() => setScheduleResetModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Kapat</Text>
            </TouchableOpacity>
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
              {/* Çift Yönlü Otomatik Senkronizasyon Bilgi Notu */}
              <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, padding: 10, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
                <Ionicons name="sync-circle" size={22} color="#4F46E5" />
                <Text style={{ fontSize: 11.5, color: '#3730A3', flex: 1, fontWeight: '500', lineHeight: 16 }}>
                  Bu ders hücresini kaydettiğinizde veya sildiğinizde; hem <Text style={{ fontWeight: '700' }}>{editingSlotData?.grade || '?'}-{editingSlotData?.section || '?'} şubesinin</Text> hem de <Text style={{ fontWeight: '700' }}>{editingSlotData?.teacherName || 'ilgili öğretmenin'}</Text> programı otomatik olarak güncellenir.
                </Text>
              </View>

              {/* Çakışma Varsa: Çakışan Dersleri Göster ve Seçmeli Sil */}
              {slotConflictItems.length > 1 && (
                <View style={styles.conflictResolutionBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="warning" size={18} color="#DC2626" />
                    <Text style={styles.conflictResolutionTitle}>
                      Bu Saatte {slotConflictItems.length} Farklı Ders Çakışıyor!
                    </Text>
                  </View>
                  <Text style={styles.conflictResolutionDesc}>
                    Bu şubede aynı saatte birden fazla ders tanımlanmış. Doğru olan dersi seçebilir, yanlış olanı tek tıkla silebilirsiniz:
                  </Text>

                  <View style={{ gap: 8, marginTop: 10 }}>
                    {slotConflictItems.map((cItem, cIdx) => {
                      const isCurrentSelected = editingSlotData?.id === cItem.id;
                      return (
                        <View
                          key={cItem.id || cIdx}
                          style={[
                            styles.conflictResolutionItem,
                            isCurrentSelected && styles.conflictResolutionItemActive,
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.conflictResolutionItemLesson}>
                              {cItem.lessonName} {cItem.lessonCode ? `(${cItem.lessonCode})` : ''}
                            </Text>
                            <Text style={styles.conflictResolutionItemTeacher}>
                              👨‍🏫 {cItem.teacherName || 'Öğretmen Belirtilmedi'} • 🏫 {cItem.grade}-{cItem.section}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={[styles.conflictSelectBtn, isCurrentSelected && styles.conflictSelectBtnActive]}
                              onPress={() => {
                                setEditingSlotData({
                                  id: cItem.id,
                                  dayOfWeek: cItem.dayOfWeek,
                                  lessonHour: cItem.lessonHour,
                                  grade: cItem.grade,
                                  section: cItem.section,
                                  teacherName: cItem.teacherName || '',
                                  lessonName: cItem.lessonName || '',
                                  lessonCode: cItem.lessonCode || '',
                                  classroom: cItem.classroom || '',
                                });
                              }}
                            >
                              <Text style={[styles.conflictSelectBtnText, isCurrentSelected && { color: '#4F46E5', fontWeight: '800' }]}>
                                {isCurrentSelected ? '✓ Seçili' : 'Seç'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.conflictDeleteBtn}
                              onPress={() => handleDeleteSpecificConflictItem(cItem)}
                            >
                              <Ionicons name="trash" size={13} color="#DC2626" />
                              <Text style={styles.conflictDeleteBtnText}>Sil</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

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

              {/* 1. DERS SEÇİMİ (ALFABETİK LİSTBOX & ARAMA) */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.slotModalLabel}>📚 Ders Seçimi (Alfabetik Liste)</Text>
                  {editingSlotData?.lessonName ? (
                    <View style={styles.listboxSelectedBadge}>
                      <Text style={styles.listboxSelectedBadgeText} numberOfLines={1}>
                        Seçili: {editingSlotData.lessonName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Ders Arama Çubuğu */}
                <View style={styles.listboxSearchWrap}>
                  <Ionicons name="search" size={15} color="#64748B" style={{ marginLeft: 8 }} />
                  <TextInput
                    style={styles.listboxSearchInput}
                    placeholder="Ders ara (örn: Matematik, Fizik, Biyoloji...)"
                    value={slotLessonSearchQuery}
                    onChangeText={setSlotLessonSearchQuery}
                    placeholderTextColor="#94A3B8"
                  />
                  {!!slotLessonSearchQuery && (
                    <TouchableOpacity onPress={() => setSlotLessonSearchQuery('')} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dikey Alfabetik Listbox */}
                <View style={styles.listboxContainer}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ maxHeight: 145 }}
                    showsVerticalScrollIndicator={true}
                  >
                    {filteredSlotLessons.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>Eşleşen ders bulunamadı.</Text>
                        {!!slotLessonSearchQuery.trim() && (
                          <TouchableOpacity
                            style={styles.listboxAddCustomBtn}
                            onPress={() => {
                              setEditingSlotData(prev => prev ? { ...prev, lessonName: slotLessonSearchQuery.trim() } : null);
                              setSlotLessonSearchQuery('');
                            }}
                          >
                            <Text style={styles.listboxAddCustomBtnText}>
                              + "{slotLessonSearchQuery.trim()}" dersini seç
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      filteredSlotLessons.map((lsnName, idx) => {
                        const isSelected = normalizeSearchStr(editingSlotData?.lessonName) === normalizeSearchStr(lsnName);
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.listboxItem, isSelected && styles.listboxItemSelected]}
                            onPress={() => {
                              setEditingSlotData(prev => prev ? { ...prev, lessonName: lsnName } : null);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <View style={[styles.listboxItemDot, isSelected && styles.listboxItemDotSelected]}>
                                <Text style={[styles.listboxItemDotText, isSelected && { color: '#fff' }]}>
                                  {lsnName.charAt(0).toLocaleUpperCase('tr-TR')}
                                </Text>
                              </View>
                              <Text style={[styles.listboxItemText, isSelected && styles.listboxItemTextSelected]} numberOfLines={1}>
                                {lsnName}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={18} color="#4F46E5" />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* 2. ÖĞRETMEN SEÇİMİ (ALFABETİK LİSTBOX & ARAMA) */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.slotModalLabel}>👨‍🏫 Öğretmen Seçimi (Alfabetik Liste)</Text>
                  {editingSlotData?.teacherName ? (
                    <View style={[styles.listboxSelectedBadge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                      <Text style={[styles.listboxSelectedBadgeText, { color: '#16A34A' }]} numberOfLines={1}>
                        Seçili: {editingSlotData.teacherName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Öğretmen Arama Çubuğu */}
                <View style={styles.listboxSearchWrap}>
                  <Ionicons name="search" size={15} color="#64748B" style={{ marginLeft: 8 }} />
                  <TextInput
                    style={styles.listboxSearchInput}
                    placeholder="Öğretmen ara (örn: Ahmet, Ayşe, Mehmet...)"
                    value={slotTeacherSearchQuery}
                    onChangeText={setSlotTeacherSearchQuery}
                    placeholderTextColor="#94A3B8"
                  />
                  {!!slotTeacherSearchQuery && (
                    <TouchableOpacity onPress={() => setSlotTeacherSearchQuery('')} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dikey Alfabetik Listbox */}
                <View style={styles.listboxContainer}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ maxHeight: 155 }}
                    showsVerticalScrollIndicator={true}
                  >
                    {filteredSlotTeachers.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>Eşleşen öğretmen bulunamadı.</Text>
                        {!!slotTeacherSearchQuery.trim() && (
                          <TouchableOpacity
                            style={[styles.listboxAddCustomBtn, { backgroundColor: '#10B981' }]}
                            onPress={() => {
                              setEditingSlotData(prev => prev ? { ...prev, teacherName: slotTeacherSearchQuery.trim() } : null);
                              setSlotTeacherSearchQuery('');
                            }}
                          >
                            <Text style={styles.listboxAddCustomBtnText}>
                              + "{slotTeacherSearchQuery.trim()}" öğretmenini ata
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      filteredSlotTeachers.map((tchName, idx) => {
                        const isSelected = normalizeTeacherMatch(editingSlotData?.teacherName, tchName);
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.listboxItem, isSelected && styles.listboxItemSelected]}
                            onPress={() => {
                              setEditingSlotData(prev => prev ? { ...prev, teacherName: tchName } : null);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <View style={[styles.listboxItemDot, isSelected ? { backgroundColor: '#10B981' } : { backgroundColor: '#E0E7FF' }]}>
                                <Text style={[styles.listboxItemDotText, isSelected ? { color: '#fff' } : { color: '#4338CA' }]}>
                                  {tchName.charAt(0).toLocaleUpperCase('tr-TR')}
                                </Text>
                              </View>
                              <Text style={[styles.listboxItemText, isSelected && styles.listboxItemTextSelected]} numberOfLines={1}>
                                {tchName}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
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

      {/* 🍔 HAMBURGER YÖNETİM MENÜSÜ MODALI */}
      <Modal visible={menuDrawerVisible} animationType="fade" transparent onRequestClose={() => setMenuDrawerVisible(false)}>
        <TouchableOpacity
          style={styles.hamburgerModalOverlay}
          activeOpacity={1}
          onPress={() => setMenuDrawerVisible(false)}
        >
          <View style={styles.hamburgerDrawerContent} onStartShouldSetResponder={() => true}>
            <View style={styles.hamburgerDrawerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hamburgerDrawerTitle}>Yönetim Menüsü</Text>
                <Text style={styles.hamburgerDrawerSubtitle} numberOfLines={1}>{selectedSchool?.name || 'Okul Paneli'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMenuDrawerVisible(false)}
                style={styles.hamburgerDrawerCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
              {/* 0. Aktif Okulu Değiştir */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setSchoolSelectModalVisible(true);
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="swap-horizontal" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Aktif Okulu Değiştir</Text>
                  <Text style={styles.hamburgerMenuSub}>{schools.length > 0 ? `${schools.length} kayıtlı okul arasında geçiş yapın` : 'Okul seçimi yapın'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 1. Okul Bilgilerini Düzenle */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  if (selectedSchool) {
                    handleOpenEditSchool(selectedSchool);
                  }
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="pencil" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Okul Bilgilerini Düzenle</Text>
                  <Text style={styles.hamburgerMenuSub}>Okul adı, adres ve iletişim bilgilerini güncelle</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 2. Yeni Okul Ekle (Sadece yetkili) */}
              {!isStaff && (
                <TouchableOpacity
                  style={styles.hamburgerMenuItem}
                  onPress={() => {
                    setMenuDrawerVisible(false);
                    setCreateModalVisible(true);
                  }}
                >
                  <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="add" size={18} color="#166534" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hamburgerMenuLabel}>Yeni Okul Tanımla</Text>
                    <Text style={styles.hamburgerMenuSub}>Sisteme yeni bir okul kurumu ekleyin</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              )}

              {/* 2.1 Okulu Sil (Sadece yetkili ve birden fazla okul varsa) */}
              {!isStaff && schools.length > 1 && (
                <TouchableOpacity
                  style={styles.hamburgerMenuItem}
                  onPress={() => {
                    setMenuDrawerVisible(false);
                    if (selectedSchool) {
                      handleDeleteSchool(selectedSchool);
                    }
                  }}
                >
                  <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.hamburgerMenuLabel, { color: '#DC2626' }]}>Okulu Sistemden Sil</Text>
                    <Text style={styles.hamburgerMenuSub}>{selectedSchool?.name || 'Seçili okul'} kurumunu sil</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              )}

              {/* 3. İdareci & Şifre Yönetimi */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  handleOpenAdminCredentials();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="key" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>İdareci Şifre Değiştir</Text>
                  <Text style={styles.hamburgerMenuSub}>Yönetim paneli giriş şifrenizi yenileyin</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 4. Müşteri & Lisans Bilgileri (Derine taşınan alan) */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setLicenseModalVisible(true);
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Müşteri & Lisans Detayları</Text>
                  <Text style={styles.hamburgerMenuSub}>Müşteri No, İlişki ID ve Lisans durumu</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              <View style={styles.hamburgerMenuDivider} />

              {/* 5. Denetim Logları */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('logs');
                  loadAuditLogs();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="document-text" size={18} color="#475569" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Denetim Logları</Text>
                  <Text style={styles.hamburgerMenuSub}>Kullanıcı işlem ve güvenlik kayıtları</Text>
                </View>
                {logStats.total > 0 && (
                  <View style={styles.hamburgerMenuTag}>
                    <Text style={styles.hamburgerMenuTagText}>{logStats.total}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* 6. Okul Mesajları */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('messages');
                  loadSchoolMessages();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="chatbubbles" size={18} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Okul İçi Mesajlar</Text>
                  <Text style={styles.hamburgerMenuSub}>Öğretmenlere duyuru ve bildirim iletin</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 7. Raporlar */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('reports');
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="stats-chart" size={18} color="#B45309" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>Raporlar & İstatistikler</Text>
                  <Text style={styles.hamburgerMenuSub}>Yoklama ve katılım grafikleri</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 8. AI & API Ayarları */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  setActiveTab('ai_settings');
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="hardware-chip" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerMenuLabel}>AI & API Ayarları</Text>
                  <Text style={styles.hamburgerMenuSub}>Gemini API anahtarı, model ve kota durumu</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              <View style={styles.hamburgerMenuDivider} />

              {/* 9. Rol Değiştir: Öğretmen Moduna Geç */}
              <TouchableOpacity
                style={styles.hamburgerMenuItem}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  handleSwitchToTeacher();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="school" size={18} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.hamburgerMenuLabel, { color: '#16A34A' }]}>Öğretmen Moduna Geç</Text>
                  <Text style={styles.hamburgerMenuSub}>Ajanda ve sınıf kokpit görünümüne geçiş yap</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* 10. Çıkış Yap / Rol Seçimine Dön */}
              <TouchableOpacity
                style={[styles.hamburgerMenuItem, { marginBottom: 16 }]}
                onPress={() => {
                  setMenuDrawerVisible(false);
                  handleLogout();
                }}
              >
                <View style={[styles.hamburgerMenuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="log-out" size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.hamburgerMenuLabel, { color: '#DC2626' }]}>Oturumu Kapat / Rol Değiştir</Text>
                  <Text style={styles.hamburgerMenuSub}>Giriş ve rol seçimi ekranına dön</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 🛡️ MÜŞTERİ & LİSANS DETAYLARI MODALI (Derin Bilgiler) */}
      <Modal visible={licenseModalVisible} animationType="slide" transparent onRequestClose={() => setLicenseModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={22} color="#4F46E5" />
                <Text style={styles.modalTitle}>Müşteri & Lisans Bilgileri</Text>
              </View>
              <TouchableOpacity onPress={() => setLicenseModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 8 }}>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 18 }}>
                Kurumunuza ait müşteri tanımlayıcıları, kurumsal ilişki kodu ve lisans geçerlilik durumu aşağıda listelenmiştir.
              </Text>

              <View style={styles.licenseDetailCard}>
                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="finger-print" size={16} color="#4F46E5" />
                    <Text style={styles.licenseDetailLabel}>Müşteri No (Customer ID)</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.customerId || 'MST-10001'}</Text>
                </View>

                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="git-network-outline" size={16} color="#4F46E5" />
                    <Text style={styles.licenseDetailLabel}>İlişki Kimliği (Relation ID)</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.relationId || 'ILK-10001'}</Text>
                </View>

                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="school" size={16} color="#4F46E5" />
                    <Text style={styles.licenseDetailLabel}>Okul Kodu</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.code}</Text>
                </View>

                <View style={styles.licenseDetailRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#166534" />
                    <Text style={styles.licenseDetailLabel}>Lisans Durumu</Text>
                  </View>
                  <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534' }}>
                      {selectedSchool?.licenseExpiresAt
                        ? `1 Yıl Lisans (${new Date(selectedSchool.licenseExpiresAt).toLocaleDateString('tr-TR')})`
                        : '1 Yıl Deneme Lisansı'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.licenseDetailRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="call" size={16} color="#64748B" />
                    <Text style={styles.licenseDetailLabel}>İletişim Telefonu</Text>
                  </View>
                  <Text style={styles.licenseDetailVal}>{selectedSchool?.phone || 'Belirtilmedi'}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.createSubmitButton, { marginTop: 16 }]}
                onPress={() => setLicenseModalVisible(false)}
              >
                <Text style={styles.createSubmitText}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
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
  hamburgerBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 54,
    paddingRight: 12,
  },
  hamburgerDrawerContent: {
    width: 320,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  hamburgerDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  hamburgerDrawerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  hamburgerDrawerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  hamburgerDrawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  hamburgerMenuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hamburgerMenuLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  hamburgerMenuSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  hamburgerMenuTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
  },
  hamburgerMenuTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  hamburgerMenuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 6,
  },
  licenseDetailCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  licenseDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  licenseDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  licenseDetailVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
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
  headerSchoolDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    maxWidth: 240,
  },
  headerSchoolDropdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    flexShrink: 1,
  },
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
  combinedSchoolCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  integratedCodeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  integratedCodeLeft: {
    flex: 1,
  },
  integratedCodeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4338CA',
    letterSpacing: 0.4,
  },
  integratedCodeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#312E81',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  integratedCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  integratedCopyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
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
  addSchoolSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  addSchoolSmallBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  editSchoolSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  editSchoolSmallBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  deleteSchoolSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteSchoolSmallBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
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
  modalSubTitle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  modalCancelBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
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
  modelDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  modelDropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  modelDropdownIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelDropdownTriggerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  modelDropdownTriggerId: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  modelDropdownTriggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modelDropdownChangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  modelSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 10,
    gap: 8,
  },
  modelSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    padding: 0,
  },
  modelCategoryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 6,
  },
  modelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  modelDropdownItemSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
    borderWidth: 1.5,
  },
  modelDropdownItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  modelDropdownItemNameSelected: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  modelDropdownItemId: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  modelDropdownItemDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 15,
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
  autoReconcileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  autoReconcileBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  autoFillGapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  autoFillGapsBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  conflictResolutionBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  conflictResolutionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
    flex: 1,
  },
  conflictResolutionDesc: {
    fontSize: 11,
    color: '#7F1D1D',
    lineHeight: 15,
  },
  conflictResolutionItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  conflictResolutionItemActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
  },
  conflictResolutionItemLesson: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  conflictResolutionItemTeacher: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  conflictSelectBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  conflictSelectBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  conflictSelectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  conflictDeleteBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  conflictDeleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
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
  // --- Öğretmen ListBox Seçici Stilleri ---
  editorTeacherListBoxWrap: {
    marginBottom: 14,
    gap: 8,
  },
  editorTeacherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  editorActiveTeacherBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginTop: 2,
  },
  editorActiveTeacherAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorActiveTeacherName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  editorTeacherBranchBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  editorTeacherBranchBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
  },
  editorActiveTeacherMeta: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  editorTeacherNavButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editorTeacherNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  editorTeacherNavBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  editorListBoxContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  editorListBoxSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  editorListBoxSearchInput: {
    flex: 1,
    height: 38,
    fontSize: 12,
    color: '#1E293B',
    paddingHorizontal: 8,
  },
  editorListBoxCountBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  editorListBoxCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  editorListBoxScrollView: {
    maxHeight: 180,
  },
  editorListBoxScrollContent: {
    padding: 6,
    gap: 4,
  },
  editorListBoxEmptyWrap: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editorListBoxEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  editorListBoxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  editorListBoxItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#818CF8',
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  editorListBoxItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  editorListBoxItemIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorListBoxItemIconActive: {
    backgroundColor: '#4F46E5',
  },
  editorListBoxItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  editorListBoxItemNameActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  editorListBoxItemBranch: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  editorListBoxItemBranchActive: {
    color: '#4338CA',
    fontWeight: '600',
  },
  editorListBoxItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editorListBoxHourBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  editorListBoxHourBadgeActive: {
    backgroundColor: '#E0E7FF',
  },
  editorListBoxHourBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  editorListBoxHourBadgeTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
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

  // --- 📄 PDF SAYFA ARALIĞI SEÇİM STİLLERİ ---
  preOptPageRangeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
    marginBottom: 6,
  },
  preOptPageRangeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  preOptPageRangeSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 15,
  },
  preOptPageBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  preOptPageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  pdfRangePresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  pdfRangePresetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  pdfRangePresetBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  pdfRangePresetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pdfRangePresetTextActive: {
    color: '#FFFFFF',
  },
  pdfRangeInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pdfRangeInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pdfRangeInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    minWidth: 45,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },

  // --- 📊 PROGRAM ALT SEKMESİ VE İSTATİSTİK STİLLERİ ---
  scheduleSubTabSegment: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 4,
    gap: 6,
    marginBottom: 14,
  },
  scheduleSubTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  scheduleSubTabBtnActive: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  scheduleSubTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  scheduleSubTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  analyticsSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    marginBottom: 10,
  },
  analyticsSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    padding: 0,
  },
  analyticsFilterScroll: {
    gap: 6,
    paddingBottom: 4,
    marginBottom: 6,
  },
  analyticsFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  analyticsFilterBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  analyticsFilterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  analyticsFilterBtnTextActive: {
    color: '#FFFFFF',
  },
  analyticsSectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  analyticsConflictCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  analyticsConflictTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  analyticsConflictHourBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  analyticsConflictDesc: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 3,
  },
  analyticsFixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  analyticsFixBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  teacherWorkloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  teacherWorkloadName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  teacherHoursBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hoursBadgeHigh: { backgroundColor: '#D1FAE5' },
  hoursBadgeNormal: { backgroundColor: '#DBEAFE' },
  hoursBadgeLow: { backgroundColor: '#FEF3C7' },
  teacherHoursText: {
    fontSize: 11,
    fontWeight: '800',
  },
  workloadChipClass: {
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  workloadChipClassText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  workloadChipLesson: {
    backgroundColor: '#EDE9FE',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  workloadChipLessonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6D28D9',
  },
  analyticsGoEditorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  analyticsGoEditorText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  classFullnessDetailCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  cardBorderGreen: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  cardBorderOrange: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  classFullnessCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  classFullnessCardPercent: {
    fontSize: 12,
    fontWeight: '800',
  },
  classFullnessCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
  classFullnessCardStatus: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  courseAllocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  courseAllocClassBadge: {
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  courseAllocClassText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  courseAllocLessonName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  courseAllocTeacherName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  courseAllocHoursBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  courseAllocHoursText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  analyticsEmptyBox: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  analyticsEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  sanityResetMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sanityResetMenuBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  editorClearScopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editorClearScopeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  resetActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  resetActionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  resetActionDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  listboxSelectedBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    maxWidth: '55%',
  },
  listboxSelectedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  listboxSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 4,
    marginBottom: 6,
  },
  listboxSearchInput: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#1E293B',
  },
  listboxContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  listboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listboxItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  listboxItemDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listboxItemDotSelected: {
    backgroundColor: '#4F46E5',
  },
  listboxItemDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  listboxItemText: {
    fontSize: 13,
    color: '#334155',
  },
  listboxItemTextSelected: {
    fontWeight: '700',
    color: '#4F46E5',
  },
  listboxAddCustomBtn: {
    marginTop: 6,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  listboxAddCustomBtnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  batchPoolBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    gap: 12,
  },
  batchPoolBannerActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  batchPoolIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchPoolTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  batchPoolDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  batchPoolCountBadge: {
    backgroundColor: '#94A3B8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  batchPoolCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  batchSaveToPoolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  batchSaveToPoolBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  batchMergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  batchMergeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  batchCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  batchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batchCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  batchCardDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  batchCardStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  batchCardStatBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  batchCardStatText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
});


