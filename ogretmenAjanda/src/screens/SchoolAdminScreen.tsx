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
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Colors } from '../theme/colors';
import { getActiveTeacherName } from '../utils/roleService';
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
import { parseTeachersFromExcel, saveParsedTeachersToServer, ParsedExcelTeacher, generateTeacherTemplateExcel } from '../services/excelTeacherParser';
import { parseStudentsFromExcelWithAi, AiStudentParseResult } from '../services/aiStudentExcelParser';
import { generateDutyTemplateExcel } from '../utils/excelService';
import { PermissionsManagementModal } from '../components/PermissionsManagementModal';
import { FloatingMessageBubble } from '../components/FloatingMessageBubble';
import { markAllMessagesAsRead, setCachedUnreadCount } from '../services/messageNotificationService';
import { CURRENT_APP_VERSION, CURRENT_VERSION_CODE } from '../services/appUpdateService';
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
import { extractPhotosFromPdf, PdfExtractedStudentPhoto } from '../utils/pdfPhotoExtractor';
import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isTeacherMatch } from '../utils/teacherUtils';
import { formatDateToTR } from '../utils/dateUtils';
import {
  SchoolSnapshotData,
  saveSchoolSnapshotToStorage,
  loadSchoolSnapshotFromStorage,
  getSchoolSnapshotLastSyncTime,
  fetchAndCacheSchoolSnapshot,
  patchLocalSchoolSnapshot,
  formatSyncTime,
} from '../services/schoolSnapshotService';
import {
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../utils/counselorService';
import { printDutyAssignments, DutyPrintSlot } from '../utils/dutyPrintService';
import { OptikModuleView } from '../components/OptikModuleView';
import { BackupModuleView } from '../components/BackupModuleView';
import { styles, AdminTab, SchoolAdminCtx, HtmlSelect, generateDefaultTeacherUsername } from './schoolAdmin/schoolAdminStyles';
import { TeachersTabView } from './schoolAdmin/tabs/TeachersTabView';
import { ClassesTabView } from './schoolAdmin/tabs/ClassesTabView';
import { LessonsTabView } from './schoolAdmin/tabs/LessonsTabView';
import { StudentsTabView } from './schoolAdmin/tabs/StudentsTabView';
import { ScheduleTabView } from './schoolAdmin/tabs/ScheduleTabView';
import { LogsTabView } from './schoolAdmin/tabs/LogsTabView';
import { MessagesTabView } from './schoolAdmin/tabs/MessagesTabView';
import { AiSettingsTabView } from './schoolAdmin/tabs/AiSettingsTabView';
import { ReportsTabView } from './schoolAdmin/tabs/ReportsTabView';
import { RadarTabView } from './schoolAdmin/tabs/RadarTabView';
import { DutyAssignmentTabView } from './schoolAdmin/tabs/DutyAssignmentTabView';
import { TeacherAndClassModals } from './schoolAdmin/modals/TeacherAndClassModals';
import { ScheduleAndSchoolModals } from './schoolAdmin/modals/ScheduleAndSchoolModals';
import { LessonPlanAndExcelModals } from './schoolAdmin/modals/LessonPlanAndExcelModals';
import { PhotoAndSystemModals } from './schoolAdmin/modals/PhotoAndSystemModals';
import { createScheduleAndBatchHandlers } from './schoolAdmin/controllers/scheduleAndBatchHandlers';
import { createPhotoAndDataHandlers } from './schoolAdmin/controllers/photoAndDataHandlers';
import { createCrudAndScheduleAiHandlers } from './schoolAdmin/controllers/crudAndScheduleAiHandlers';
import { createPlanExcelAndSystemHandlers } from './schoolAdmin/controllers/planExcelAndSystemHandlers';

export { generateDefaultTeacherUsername };

export function SchoolAdminScreen({ navigation, onRoleChange }: any) {
  const [schools, setSchools] = useState<any[]>([]);

  const [selectedSchool, setSelectedSchool] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('teachers');

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const [syncingSnapshot, setSyncingSnapshot] = useState(false);

  const [currentUserSession, setCurrentUserSession] = useState<any>(null);

  const isStaff = currentUserSession?.role === 'STAFF' || (currentUserSession?.role === 'SCHOOL_ADMIN' && !!currentUserSession?.schoolId && !currentUserSession?.isInstitutionAdmin);

  const adminDisplayName = currentUserSession?.fullName || currentUserSession?.username || '';

  const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);

  const [teachers, setTeachers] = useState<any[]>([]);

  const [studentVisibleCount, setStudentVisibleCount] = useState(30);

  const [classes, setClasses] = useState<any[]>([]);

  const [lessons, setLessons] = useState<any[]>([]);

  const [lessonGradeFilter, setLessonGradeFilter] = useState<'all' | '9' | '10' | '11' | '12' | 'common'>('all');

  const [lessonSearchQuery, setLessonSearchQuery] = useState('');

  const [students, setStudents] = useState<any[]>([]);

  const [schoolMessages, setSchoolMessages] = useState<any[]>([]);

  const [loadingMessages, setLoadingMessages] = useState(false);

  const [messageSearch, setMessageSearch] = useState('');

  const [selectedMessageFilter, setSelectedMessageFilter] = useState<'all' | 'students' | 'teachers' | 'parents'>('all');

  const [adminMessageScope, setAdminMessageScope] = useState<'personal' | 'all' | 'sent'>('personal');

  const [adminReplyModalVisible, setAdminReplyModalVisible] = useState(false);

  const [adminReplyingMessage, setAdminReplyingMessage] = useState<any | null>(null);

  const [adminReplyContent, setAdminReplyContent] = useState('');

  const [sendingAdminReply, setSendingAdminReply] = useState(false);

  const [adminNewMsgModalVisible, setAdminNewMsgModalVisible] = useState(false);

  const [adminNewMsgTargetType, setAdminNewMsgTargetType] = useState<string>('TEACHER');

  const [adminNewMsgTargetTeacher, setAdminNewMsgTargetTeacher] = useState<any | null>(null);

  const [adminNewMsgContent, setAdminNewMsgContent] = useState('');

  const [sendingAdminNewMsg, setSendingAdminNewMsg] = useState(false);

  const [selectedClassForStudents, setSelectedClassForStudents] = useState<any>(null);

  const [classStudentsModalVisible, setClassStudentsModalVisible] = useState(false);

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

  const [studentSearch, setStudentSearch] = useState('');

  const [selectedClassFilter, setSelectedClassFilter] = useState('all');

  const [classFilterModalVisible, setClassFilterModalVisible] = useState(false);

  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);

  const [dutyAssignDay, setDutyAssignDay] = useState<number>(() => {
    const d = new Date().getDay();
    return (d >= 1 && d <= 5) ? d : 1;
  });

  const [absentTeachers, setAbsentTeachers] = useState<string[]>([]);

  const [absentTeacherSearch, setAbsentTeacherSearch] = useState<string>('');

  const [hiddenDutyTeachersBySlot, setHiddenDutyTeachersBySlot] = useState<Record<string, string[]>>({});

  const [editingCounselorClass, setEditingCounselorClass] = useState<string>('');

  const [savingCounselorClass, setSavingCounselorClass] = useState<boolean>(false);

  const [selectedAdminStudent, setSelectedAdminStudent] = useState<any>(null);

  const [adminStudentModalVisible, setAdminStudentModalVisible] = useState(false);

  const [loadingStudentDetail, setLoadingStudentDetail] = useState(false);

  const [studentEvaluations, setStudentEvaluations] = useState<any[]>([]);

  const [studentAssignments, setStudentAssignments] = useState<any[]>([]);

  const [studentLocalNotes, setStudentLocalNotes] = useState<any[]>([]);

  const [studentLocalGrades, setStudentLocalGrades] = useState<any>(null);

  const [studentLocalQuizzes, setStudentLocalQuizzes] = useState<any[]>([]);

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

  const [logPurgeModalVisible, setLogPurgeModalVisible] = useState(false);

  const [purgeStartDate, setPurgeStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });

  const [purgeEndDate, setPurgeEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [isPurgingLogs, setIsPurgingLogs] = useState(false);

  const [menuDrawerVisible, setMenuDrawerVisible] = useState(false);

  const [licenseModalVisible, setLicenseModalVisible] = useState(false);

  const [schoolSelectModalVisible, setSchoolSelectModalVisible] = useState(false);

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

  const [createModalVisible, setCreateModalVisible] = useState(false);

  const [newSchoolName, setNewSchoolName] = useState('');

  const [newSchoolPhone, setNewSchoolPhone] = useState('');

  const [newSchoolApiKey, setNewSchoolApiKey] = useState('');

  const [newSchoolDailyHours, setNewSchoolDailyHours] = useState('8');

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

  const [addClassModalVisible, setAddClassModalVisible] = useState(false);

  const [newClassGrade, setNewClassGrade] = useState('9');

  const [newClassSection, setNewClassSection] = useState('A');

  const [addingClass, setAddingClass] = useState(false);

  const [addLessonModalVisible, setAddLessonModalVisible] = useState(false);

  const [newLessonName, setNewLessonName] = useState('');

  const [newLessonShortCode, setNewLessonShortCode] = useState('');

  const [newLessonGrade, setNewLessonGrade] = useState('Tüm Kademeler');

  const [newLessonHours, setNewLessonHours] = useState('2');

  const [addingLesson, setAddingLesson] = useState(false);

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

  const [credentialsModalVisible, setCredentialsModalVisible] = useState(false);

  const [selectedStudentForCreds, setSelectedStudentForCreds] = useState<any>(null);

  const [showCredPassword, setShowCredPassword] = useState(false);

  const [showParentCredPassword, setShowParentCredPassword] = useState(false);

  const [customResetPassInput, setCustomResetPassInput] = useState('');

  const [customParentResetPassInput, setCustomParentResetPassInput] = useState('');

  const [resettingPassword, setResettingPassword] = useState(false);

  const [resettingParentPassword, setResettingParentPassword] = useState(false);

  const [schedulePreOptionsModalVisible, setSchedulePreOptionsModalVisible] = useState(false);

  const [pendingScheduleFile, setPendingScheduleFile] = useState<any>(null);

  const [optExtractTeachers, setOptExtractTeachers] = useState(true);

  const [optExtractClasses, setOptExtractClasses] = useState(true);

  const [optExtractLessons, setOptExtractLessons] = useState(true);

  const [optExtractScheduleItems, setOptExtractScheduleItems] = useState(true);

  const [optAutoHealBlocks, setOptAutoHealBlocks] = useState(false);

  const [pdfTotalPages, setPdfTotalPages] = useState<number>(0);

  const [pdfPageRangeMode, setPdfPageRangeMode] = useState<'all' | 'half1' | 'half2' | 'custom'>('all');

  const [pdfStartPage, setPdfStartPage] = useState<string>('1');

  const [pdfEndPage, setPdfEndPage] = useState<string>('1');

  const [countingPdfPages, setCountingPdfPages] = useState<boolean>(false);

  const [excelPreviewModalVisible, setExcelPreviewModalVisible] = useState<boolean>(false);

  const [excelInspection, setExcelInspection] = useState<ExcelInspectionResult | null>(null);

  const [selectedExcelSheet, setSelectedExcelSheet] = useState<string>('');

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

  const [scheduleBatches, setScheduleBatches] = useState<ScheduleBatchItem[]>([]);

  const [batchPoolModalVisible, setBatchPoolModalVisible] = useState(false);

  const [lastAnalyzedPageRange, setLastAnalyzedPageRange] = useState<{ start: number; end: number } | undefined>(undefined);

  const [cachedScheduleDoc, setCachedScheduleDoc] = useState<CachedScheduleDocInfo | null>(null);

  const [cachedScheduleDraft, setCachedScheduleDraft] = useState<ParsedScheduleResult | null>(null);

  const [reScanningTeacher, setReScanningTeacher] = useState(false);

  const [teacherRescanHint, setTeacherRescanHint] = useState('');

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

  const [inspectDayTab, setInspectDayTab] = useState<number>(1);

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

  const aiCancelledRef = useRef(false);

  const [excelModalVisible, setExcelModalVisible] = useState(false);

  const [excelParsing, setExcelParsing] = useState(false);

  const [excelSaving, setExcelSaving] = useState(false);

  const [parsedExcelStudents, setParsedExcelStudents] = useState<ParsedExcelStudent[]>([]);

  const [detectedExcelClasses, setDetectedExcelClasses] = useState<string[]>([]);

  const [excelSchoolName, setExcelSchoolName] = useState<string | undefined>(undefined);

  const [aiStudentModalVisible, setAiStudentModalVisible] = useState(false);

  const [aiStudentParsing, setAiStudentParsing] = useState(false);

  const [aiStudentSaving, setAiStudentSaving] = useState(false);

  const [aiStudentResult, setAiStudentResult] = useState<AiStudentParseResult | null>(null);

  const [teacherExcelModalVisible, setTeacherExcelModalVisible] = useState(false);

  const [teacherExcelParsing, setTeacherExcelParsing] = useState(false);

  const [teacherExcelSaving, setTeacherExcelSaving] = useState(false);

  const [parsedExcelTeachers, setParsedExcelTeachers] = useState<ParsedExcelTeacher[]>([]);

  const [adminCredentialsModalVisible, setAdminCredentialsModalVisible] = useState(false);

  const [adminNewUsername, setAdminNewUsername] = useState('');

  const [adminOldPassword, setAdminOldPassword] = useState('');

  const [adminNewPassword, setAdminNewPassword] = useState('');

  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  const [savingAdminCredentials, setSavingAdminCredentials] = useState(false);

  const [editLessonModalVisible, setEditLessonModalVisible] = useState(false);

  const [editingLesson, setEditingLesson] = useState<any>(null);

  const [editLessonName, setEditLessonName] = useState('');

  const [editLessonCode, setEditLessonCode] = useState('');

  const [editLessonGrade, setEditLessonGrade] = useState('');

  const [editLessonHours, setEditLessonHours] = useState('2');

  const [updatingLesson, setUpdatingLesson] = useState(false);

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

  const [planSheetPickerVisible, setPlanSheetPickerVisible] = useState(false);

  const [planSheetPickerSheets, setPlanSheetPickerSheets] = useState<string[]>([]);

  const [planSheetPickerAsset, setPlanSheetPickerAsset] = useState<any>(null);

  const [planSheetPickerLesson, setPlanSheetPickerLesson] = useState<any>(null);

  const [viewPlanModalVisible, setViewPlanModalVisible] = useState(false);

  const [selectedLessonForViewPlan, setSelectedLessonForViewPlan] = useState<any>(null);

  const [viewPlanItems, setViewPlanItems] = useState<any[]>([]);

  const [loadingViewPlan, setLoadingViewPlan] = useState(false);

  const [planSearch, setPlanSearch] = useState('');

  const [deletingPlan, setDeletingPlan] = useState(false);

  const [selectedTeacherForSchedule, setSelectedTeacherForSchedule] = useState<any>(null);

  const [teacherScheduleItems, setTeacherScheduleItems] = useState<any[]>([]);

  const [loadingTeacherSchedule, setLoadingTeacherSchedule] = useState(false);

  const [teacherScheduleModalVisible, setTeacherScheduleModalVisible] = useState(false);

  const [scheduleStats, setScheduleStats] = useState<any | null>(null);

  const [loadingScheduleStats, setLoadingScheduleStats] = useState(false);

  const [scheduleDailyHours, setScheduleDailyHours] = useState(8);

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
    const n1 = normalizeSearchStr(name1);
    const n2 = normalizeSearchStr(name2);
    if (n1 === n2) return true;
    try {
      if (isTeacherMatch(name1, name2)) return true;
    } catch { }
    return false;
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

  const filteredLessons = useMemo(() => {
    let result = [...lessons];

    // Kademe Filtresi
    if (lessonGradeFilter !== 'all') {
      if (lessonGradeFilter === 'common') {
        result = result.filter((l: any) => !l.grade || l.grade === 'Tüm Kademeler' || l.grade === 'Ortak');
      } else {
        result = result.filter((l: any) => {
          const gStr = String(l.grade || '').trim();
          return gStr === lessonGradeFilter || gStr.startsWith(lessonGradeFilter);
        });
      }
    }

    // Arama Filtresi
    if (lessonSearchQuery.trim()) {
      const q = normalizeSearchStr(lessonSearchQuery);
      result = result.filter((l: any) =>
        normalizeSearchStr(l.name).includes(q) ||
        (l.shortCode && normalizeSearchStr(l.shortCode).includes(q)) ||
        (l.grade && normalizeSearchStr(String(l.grade)).includes(q))
      );
    }

    // Sıralama: Önce kademe (9, 10, 11, 12, Ortak), sonra ders adı
    return result.sort((a: any, b: any) => {
      const gA = parseInt(String(a.grade || '').replace(/\D/g, '') || '999', 10);
      const gB = parseInt(String(b.grade || '').replace(/\D/g, '') || '999', 10);
      if (gA !== gB) return gA - gB;
      return (a.name || '').localeCompare(b.name || '', 'tr');
    });
  }, [lessons, lessonGradeFilter, lessonSearchQuery]);

  const uniqueLessonsCount = useMemo(() => {
    const set = new Set<string>();
    for (const l of lessons) {
      if (l.name) set.add(l.name.trim().toLocaleLowerCase('tr-TR'));
    }
    return set.size;
  }, [lessons]);

  const [scheduleEditorMode, setScheduleEditorMode] = useState<'class' | 'teacher'>('class');

  const [selectedClassForEditor, setSelectedClassForEditor] = useState<string>('');

  const [selectedTeacherForEditor, setSelectedTeacherForEditor] = useState<string>('');

  const [teacherListBoxSearch, setTeacherListBoxSearch] = useState<string>('');

  const [allSchoolSchedules, setAllSchoolSchedules] = useState<any[]>([]);

  const [loadingAllSchedules, setLoadingAllSchedules] = useState(false);

  const [scheduleResetModalVisible, setScheduleResetModalVisible] = useState(false);

  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a: any, b: any) => (a.fullName || '').localeCompare(b.fullName || '', 'tr'));
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

  const teacherTotalHoursMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!allSchoolSchedules || allSchoolSchedules.length === 0) return map;
    for (let i = 0; i < allSchoolSchedules.length; i++) {
      const s = allSchoolSchedules[i];
      const norm = normalizeSearchStr(s.teacherName);
      if (norm) {
        map.set(norm, (map.get(norm) || 0) + 1);
      }
    }
    return map;
  }, [allSchoolSchedules]);

  const getTeacherTotalHours = useCallback((teacherFullName: string) => {
    if (!teacherFullName) return 0;
    return teacherTotalHoursMap.get(normalizeSearchStr(teacherFullName)) || 0;
  }, [teacherTotalHoursMap]);

  const [radarSubTab, setRadarSubTab] = useState<'teacher' | 'class' | 'free_teachers' | 'duty'>('teacher');

  const [radarTeacher, setRadarTeacher] = useState<string>('');

  const [radarTeacherSearch, setRadarTeacherSearch] = useState<string>('');

  const [radarClass, setRadarClass] = useState<string>('');

  const [radarClassModalVisible, setRadarClassModalVisible] = useState<boolean>(false);

  const [radarClassSearch, setRadarClassSearch] = useState<string>('');

  const [radarClassGradeFilter, setRadarClassGradeFilter] = useState<'all' | '9' | '10' | '11' | '12'>('all');

  const [dutyPlacesModalVisible, setDutyPlacesModalVisible] = useState<boolean>(false);

  const [customDutyPlaces, setCustomDutyPlaces] = useState<string[]>([]);

  const [newCustomPlaceInput, setNewCustomPlaceInput] = useState<string>('');

  const [radarDay, setRadarDay] = useState<number>(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  });

  const [radarHour, setRadarHour] = useState<number>(1);

  const [dutiesList, setDutiesList] = useState<any[]>([]);

  const [loadingDuties, setLoadingDuties] = useState(false);

  const [dutyFilterDay, setDutyFilterDay] = useState<number>(0);

  const [addDutyModalVisible, setAddDutyModalVisible] = useState(false);

  const [newDutyTeacher, setNewDutyTeacher] = useState<string>('');

  const [newDutyDay, setNewDutyDay] = useState<number>(1);

  const [newDutyPlace, setNewDutyPlace] = useState<string>('');

  const [newDutyNotes, setNewDutyNotes] = useState<string>('');

  const [savingDuty, setSavingDuty] = useState(false);

  const [importingDutyExcel, setImportingDutyExcel] = useState(false);

  const [downloadingDutyTemplate, setDownloadingDutyTemplate] = useState(false);

  const allKnownDutyPlaces = useMemo(() => {
    const set = new Set<string>();
    const defaults = [
      'Bahçe ve Giriş Kapısı',
      'Zemin Kat ve Kantin',
      '1. Kat (İdari Kat)',
      '2. Kat (Derslikler)',
      '3. Kat (Derslikler)',
      'Spor Salonu / Yemekhane',
      'Pansiyon / Yurt',
    ];
    defaults.forEach((p: any) => set.add(p));
    customDutyPlaces.forEach((p: any) => set.add(p));
    dutiesList.forEach((d: any) => {
      const p = String(d.dutyPlace || d.duty_place || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set);
  }, [dutiesList, customDutyPlaces]);

  const normalizeDayNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    const str = String(val || '').trim().toLowerCase();
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) return parsed;
    if (str.includes('pazartesi') || str.includes('pzt')) return 1;
    if (str.includes('salı') || str.includes('sali')) return 2;
    if (str.includes('çarşamba') || str.includes('carsamba')) return 3;
    if (str.includes('perşembe') || str.includes('persembe')) return 4;
    if (str.includes('cuma') || str.includes('cum')) return 5;
    if (str.includes('cumartesi')) return 6;
    if (str.includes('pazar')) return 7;
    return 1;
  };

  const freeTeachersList = useMemo(() => {
    if (!teachers || teachers.length === 0) return [];

    // 1. O gün ve o saatte dersi olan öğretmenler Set'i (O(1) lookup)
    const busyTeacherNormSet = new Set<string>();
    // 2. O gün öğretmenin toplam kaç dersi var (O(1) lookup)
    const todayLessonCountMap = new Map<string, number>();

    const schedulesLen = allSchoolSchedules.length;
    for (let i = 0; i < schedulesLen; i++) {
      const s = allSchoolSchedules[i];
      if (s.dayOfWeek === radarDay) {
        const sNorm = normalizeSearchStr(s.teacherName);
        todayLessonCountMap.set(sNorm, (todayLessonCountMap.get(sNorm) || 0) + 1);
        if (s.lessonHour === radarHour) {
          busyTeacherNormSet.add(sNorm);
        }
      }
    }

    // 3. O gün nöbetçi olan öğretmenler Map'i (O(1) lookup)
    const dutyTeacherMap = new Map<string, any>();
    const dutiesLen = dutiesList.length;
    for (let i = 0; i < dutiesLen; i++) {
      const d = dutiesList[i];
      if (normalizeDayNumber(d.dayOfWeek) === radarDay) {
        dutyTeacherMap.set(normalizeSearchStr(d.teacherName), d);
      }
    }

    // 4. Öğretmenleri O(1) ile işle (78.960 işlem yerine sadece 47 işlem!)
    const result: any[] = [];
    const teachersLen = teachers.length;
    for (let i = 0; i < teachersLen; i++) {
      const teacher = teachers[i];
      const tName = teacher.fullName || '';
      const tNorm = normalizeSearchStr(tName);

      // O saatte dersi varsa meşguldür, listeye girmez
      if (busyTeacherNormSet.has(tNorm)) continue;

      let todayLessons = todayLessonCountMap.get(tNorm) || 0;
      const todayFreeHours = Math.max(0, scheduleDailyHours - todayLessons);
      const duty = dutyTeacherMap.get(tNorm);

      result.push({
        ...teacher,
        todayLessons,
        todayFreeHours,
        duty,
      });
    }

    // 5. Sıralama
    result.sort((a: any, b: any) => {
      // 1. KURAL: O gün nöbetçi olanlar listenin en tepesinde
      if (a.duty && !b.duty) return -1;
      if (!a.duty && b.duty) return 1;

      // 2. KURAL: Bugünkü derslerinin tamamı boş olanlar en alta insin
      const aAllDayFree = (a.todayLessons === 0);
      const bAllDayFree = (b.todayLessons === 0);
      if (!aAllDayFree && bAllDayFree) return -1;
      if (aAllDayFree && !bAllDayFree) return 1;

      // 3. KURAL: Bugün boş ders saati en çok olan öğretmen daha üstte çıksın
      if ((a.todayFreeHours || 0) !== (b.todayFreeHours || 0)) {
        return (b.todayFreeHours || 0) - (a.todayFreeHours || 0);
      }
      return (a.fullName || '').localeCompare(b.fullName || '', 'tr');
    });

    return result;
  }, [teachers, allSchoolSchedules, dutiesList, radarDay, radarHour, scheduleDailyHours]);

  const activeRadarTeacherScheduleMap = useMemo(() => {
    const activeTName = radarTeacher || sortedTeachers[0]?.fullName || '';
    if (!activeTName || !allSchoolSchedules || allSchoolSchedules.length === 0) return new Map<string, any>();
    const map = new Map<string, any>();
    const activeNorm = normalizeSearchStr(activeTName);

    for (let i = 0; i < allSchoolSchedules.length; i++) {
      const s = allSchoolSchedules[i];
      if (normalizeSearchStr(s.teacherName) === activeNorm || normalizeTeacherMatch(s.teacherName, activeTName)) {
        map.set(`${s.dayOfWeek}_${s.lessonHour}`, s);
      }
    }
    return map;
  }, [allSchoolSchedules, radarTeacher, sortedTeachers]);

  const filteredRadarTeachers = useMemo(() => {
    if (!radarTeacherSearch.trim()) return sortedTeachers;
    const q = normalizeSearchStr(radarTeacherSearch);
    return sortedTeachers.filter((t: any) =>
      normalizeSearchStr(t.fullName).includes(q) ||
      normalizeSearchStr(t.branch || '').includes(q)
    );
  }, [sortedTeachers, radarTeacherSearch]);

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

  const [singleTeacherParsing, setSingleTeacherParsing] = useState(false);

  const [singleTeacherPreview, setSingleTeacherPreview] = useState<any | null>(null);

  const [singleTeacherModalVisible, setSingleTeacherModalVisible] = useState(false);

  const [savingSingleTeacher, setSavingSingleTeacher] = useState(false);

  const [teacherLoginFilter, setTeacherLoginFilter] = useState<'all' | 'logged_in' | 'not_logged_in'>('all');

  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');

  const [teacherSortOrder, setTeacherSortOrder] = useState<'asc' | 'desc'>('asc');

  const [bulkPhotoModalVisible, setBulkPhotoModalVisible] = useState(false);

  const [bulkPhotoProgress, setBulkPhotoProgress] = useState('');

  const [uploadingBulkPhotos, setUploadingBulkPhotos] = useState(false);

  const [photoReviewModalVisible, setPhotoReviewModalVisible] = useState(false);

  const [reviewPhotos, setReviewPhotos] = useState<PdfExtractedStudentPhoto[]>([]);

  const [reviewPageFilter, setReviewPageFilter] = useState<'all' | number>('all');

  const [reviewMatchFilter, setReviewMatchFilter] = useState<'all' | 'full' | 'number_only' | 'unmatched'>('all');

  const [reviewSearchQuery, setReviewSearchQuery] = useState('');

  const [savingReviewPhotos, setSavingReviewPhotos] = useState(false);

  const [cachedPdfAsset, setCachedPdfAsset] = useState<any>(null);

  const [cachedPdfPhotos, setCachedPdfPhotos] = useState<PdfExtractedStudentPhoto[]>([]);

  const [initialReviewPhotos, setInitialReviewPhotos] = useState<PdfExtractedStudentPhoto[]>([]);

  const [photoHistoryStack, setPhotoHistoryStack] = useState<PdfExtractedStudentPhoto[][]>([]);

  const [rescanningPage, setRescanningPage] = useState(false);

  const [studentPickerVisible, setStudentPickerVisible] = useState(false);

  const [studentPickerTargetId, setStudentPickerTargetId] = useState<string | null>(null);

  const [studentPickerSearch, setStudentPickerSearch] = useState('');

  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);

  const [photoPickerTargetId, setPhotoPickerTargetId] = useState<string | null>(null);

  const [photoPickerSearch, setPhotoPickerSearch] = useState('');

  const [singleStudentPdfModalVisible, setSingleStudentPdfModalVisible] = useState(false);

  const [singleStudentPdfTarget, setSingleStudentPdfTarget] = useState<any>(null);

  const [singleStudentPdfSearch, setSingleStudentPdfSearch] = useState('');

  const [singleStudentPdfUploading, setSingleStudentPdfUploading] = useState(false);

  const serverBaseUrl = DEFAULT_API_URL.replace(/\/api\/?$/, '');

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

  const getPickerStudentInfo = (s: any) => {
    const number = String(s.studentNumber || s.student_number || s.number || '').trim();
    const fullName = String(
      s.fullName ||
      s.full_name ||
      `${s.first_name || s.name || ''} ${s.last_name || ''}`.trim() ||
      'İsimsiz Öğrenci'
    ).trim();
    const className = String(
      s.className ||
      s.class_name ||
      (s.grade && s.section ? `${s.grade}/${s.section}` : s.grade || s.section || '-')
    ).trim();
    return { number, fullName, className };
  };

  const reviewAvailablePages = useMemo(() => {
    const pages = new Set<number>();
    reviewPhotos.forEach((p: any) => {
      if (typeof p.pageNumber === 'number' && p.pageNumber > 0) {
        pages.add(p.pageNumber);
      }
    });
    return Array.from(pages).sort((a: any, b: any) => a - b);
  }, [reviewPhotos]);

  const getPhotoMatchStatus = (item: PdfExtractedStudentPhoto) => {
    const matched: any = item.matchedStudent;
    if (!matched) {
      return {
        status: 'none' as const,
        color: '#DC2626',
        bgColor: '#FEF2F2', // Açık kırmızı
        borderColor: '#FCA5A5', // Kırmızı kenarlık
        badgeBg: '#FEE2E2',
        badgeText: '#B91C1C',
        badgeLabel: 'Eşleşmedi',
        isNameMatch: false,
        isNumberMatch: false,
        sysNumber: '-',
        sysFullName: 'Öğrenci Atanmadı',
        sysClassName: '-',
      };
    }

    const sysNumber = String(matched.student_number || (matched as any).studentNumber || (matched as any).number || '').trim();
    const pdfNumber = String(item.detectedNumber || '').trim();
    const cleanSysNum = sysNumber.replace(/^0+/, '');
    const cleanPdfNum = pdfNumber.replace(/^0+/, '');
    const isNumberMatch = Boolean(cleanSysNum && cleanPdfNum && cleanSysNum === cleanPdfNum);

    const norm = (s: string) =>
      (s || '')
        .replace(/Ý/g, 'İ')
        .replace(/Ð/g, 'Ğ')
        .replace(/Þ/g, 'Ş')
        .replace(/ý/g, 'ı')
        .replace(/ð/g, 'ğ')
        .replace(/þ/g, 'ş')
        .toLocaleLowerCase('tr-TR')
        .replace(/[^a-zçğıöşü0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const pdfNameNorm = norm(item.detectedName || '');
    const stdInfo = getPickerStudentInfo(matched);
    const sysFullName = stdInfo.fullName !== 'İsimsiz Öğrenci'
      ? stdInfo.fullName
      : (matched.fullName || (matched as any).full_name || `${matched.first_name || (matched as any).name || ''} ${matched.last_name || ''}`.trim() || '-');
    const sysNameNorm = norm(sysFullName);
    const sysClassName = stdInfo.className !== '-'
      ? stdInfo.className
      : (matched.className || (matched as any).class_name || (matched.grade && matched.section ? `${matched.grade}/${matched.section}` : matched.grade || '-'));

    let isNameMatch = false;
    if (pdfNameNorm.length >= 3 && sysNameNorm.length >= 3) {
      if (pdfNameNorm === sysNameNorm) {
        isNameMatch = true;
      } else {
        const pTokens = pdfNameNorm.split(' ').filter((t: any) => t.length >= 2);
        const sTokens = sysNameNorm.split(' ').filter((t: any) => t.length >= 2);
        if (pTokens.length >= 2 && sTokens.length >= 2) {
          const matchesCount = pTokens.filter((pt: any) => sTokens.some((st: any) => st === pt || st.includes(pt) || pt.includes(st))).length;
          if (matchesCount >= 2) {
            isNameMatch = true;
          }
        }
      }
    }

    if (isNumberMatch && isNameMatch) {
      return {
        status: 'full' as const,
        color: '#15803D',
        bgColor: '#F0FDF4', // Yeşil zemin
        borderColor: '#86EFAC', // Yeşil kenarlık
        badgeBg: '#DCFCE7',
        badgeText: '#15803D',
        badgeLabel: 'Tam Eşleşti (Ad Soyad + No)',
        isNameMatch: true,
        isNumberMatch: true,
        sysNumber,
        sysFullName,
        sysClassName,
      };
    }

    if (isNumberMatch) {
      return {
        status: 'number_only' as const,
        color: '#B45309',
        bgColor: '#FFFBEB', // Sarı / Amber zemin
        borderColor: '#FCD34D', // Sarı / Amber kenarlık
        badgeBg: '#FEF3C7',
        badgeText: '#B45309',
        badgeLabel: 'Yalnızca Numara Eşleşti',
        isNameMatch: false,
        isNumberMatch: true,
        sysNumber,
        sysFullName,
        sysClassName,
      };
    }

    return {
      status: 'number_only' as const,
      color: '#D97706',
      bgColor: '#FFFBEB', // Sarı zemin
      borderColor: '#FCD34D',
      badgeBg: '#FEF3C7',
      badgeText: '#B45309',
      badgeLabel: isNameMatch ? 'Yalnızca İsim Eşleşti' : 'Manuel Atandı',
      isNameMatch,
      isNumberMatch,
      sysNumber,
      sysFullName,
      sysClassName,
    };
  };

  const filteredReviewPhotos = useMemo(() => {
    return reviewPhotos.filter((item: any) => {
      if (reviewPageFilter !== 'all' && item.pageNumber !== reviewPageFilter) {
        return false;
      }
      const matchInfo = getPhotoMatchStatus(item);
      if (reviewMatchFilter === 'full' && matchInfo.status !== 'full') {
        return false;
      }
      if (reviewMatchFilter === 'number_only' && matchInfo.status !== 'number_only') {
        return false;
      }
      if (reviewMatchFilter === 'unmatched' && matchInfo.status !== 'none') {
        return false;
      }
      if (reviewSearchQuery.trim()) {
        const q = reviewSearchQuery.toLowerCase().trim();
        const stdNo = String(item.matchedStudent?.student_number || item.detectedNumber || '').toLowerCase();
        const stdName = String(item.matchedStudent?.first_name || item.matchedStudent?.name || item.detectedName || '').toLowerCase();
        const stdLast = String(item.matchedStudent?.last_name || '').toLowerCase();
        const cls = String(item.matchedStudent?.class_name || '').toLowerCase();
        if (!stdNo.includes(q) && !stdName.includes(q) && !stdLast.includes(q) && !cls.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [reviewPhotos, reviewPageFilter, reviewMatchFilter, reviewSearchQuery]);

  const filteredPickerStudents = useMemo(() => {
    const list = students || [];
    if (!studentPickerSearch.trim()) return list.slice(0, 100);
    const q = studentPickerSearch.toLocaleLowerCase('tr-TR').trim();
    return list.filter((s: any) => {
      const info = getPickerStudentInfo(s);
      return (
        info.number.toLowerCase().includes(q) ||
        info.fullName.toLocaleLowerCase('tr-TR').includes(q) ||
        info.className.toLowerCase().includes(q)
      );
    }).slice(0, 100);
  }, [students, studentPickerSearch]);

  const [autoReconciling, setAutoReconciling] = useState(false);

  const [autoFillingGaps, setAutoFillingGaps] = useState(false);

  const [slotConflictItems, setSlotConflictItems] = useState<any[]>([]);

  const allAvailableLessons = useMemo(() => {
    const lessonSet = new Set<string>();
    lessons.forEach((l: any) => {
      if (l.name && l.name.trim()) lessonSet.add(l.name.trim());
    });
    allSchoolSchedules.forEach((s: any) => {
      if (s.lessonName && s.lessonName.trim()) lessonSet.add(s.lessonName.trim());
    });
    return Array.from(lessonSet).sort((a: any, b: any) => a.localeCompare(b, 'tr-TR'));
  }, [lessons, allSchoolSchedules]);

  const allAvailableTeachers = useMemo(() => {
    const teacherSet = new Set<string>();
    teachers.forEach((t: any) => {
      if (t.fullName && t.fullName.trim()) teacherSet.add(t.fullName.trim());
    });
    allSchoolSchedules.forEach((s: any) => {
      if (s.teacherName && s.teacherName.trim()) teacherSet.add(s.teacherName.trim());
    });
    return Array.from(teacherSet).sort((a: any, b: any) => a.localeCompare(b, 'tr-TR'));
  }, [teachers, allSchoolSchedules]);

  const filteredSlotLessons = useMemo(() => {
    if (!slotLessonSearchQuery.trim()) return allAvailableLessons;
    const q = normalizeSearchStr(slotLessonSearchQuery);
    return allAvailableLessons.filter((l: any) => normalizeSearchStr(l).includes(q));
  }, [allAvailableLessons, slotLessonSearchQuery]);

  const filteredSlotTeachers = useMemo(() => {
    if (!slotTeacherSearchQuery.trim()) return allAvailableTeachers;
    const q = normalizeSearchStr(slotTeacherSearchQuery);
    return allAvailableTeachers.filter((t: any) => normalizeSearchStr(t).includes(q));
  }, [allAvailableTeachers, slotTeacherSearchQuery]);

  const tabPressTimestampRef = useRef<number>(0);

  const filteredTeachers = useMemo(() => {
    return teachers
      .filter((t: any) => {
        if (teacherLoginFilter === 'logged_in') return !!t.lastLoginAt;
        if (teacherLoginFilter === 'not_logged_in') return !t.lastLoginAt;
        return true;
      })
      .filter((t: any) => {
        if (!teacherSearchQuery.trim()) return true;
        const q = teacherSearchQuery.trim().toLowerCase();
        const matchName = (t.fullName || '').toLowerCase().includes(q);
        const matchUser = (t.username || '').toLowerCase().includes(q);
        const matchBranch = (t.branch || '').toLowerCase().includes(q);
        return matchName || matchUser || matchBranch;
      })
      .sort((a: any, b: any) => {
        const nameA = (a.fullName || a.username || '').trim();
        const nameB = (b.fullName || b.username || '').trim();
        if (teacherSortOrder === 'desc') {
          return nameB.localeCompare(nameA, 'tr');
        }
        return nameA.localeCompare(nameB, 'tr');
      });
  }, [teachers, teacherLoginFilter, teacherSearchQuery, teacherSortOrder]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.toLowerCase();
    return students.filter((s: any) => {
      const matchesSearch =
        s.fullName.toLowerCase().includes(q) ||
        s.studentNumber.includes(studentSearch);

      if (selectedClassFilter === 'all') return matchesSearch;
      return (
        matchesSearch &&
        (`${s.grade}-${s.section}` === selectedClassFilter ||
          s.className === selectedClassFilter ||
          (s.grade && s.section && `${s.grade}/${s.section}` === selectedClassFilter))
      );
    });
  }, [students, studentSearch, selectedClassFilter]);

  const ctx: SchoolAdminCtx = {
    navigation,
    onRoleChange,
    schools,
    setSchools,
    selectedSchool,
    setSelectedSchool,
    activeTab,
    setActiveTab,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    lastSyncTime,
    setLastSyncTime,
    syncingSnapshot,
    setSyncingSnapshot,
    currentUserSession,
    setCurrentUserSession,
    isStaff,
    adminDisplayName,
    permissionsModalVisible,
    setPermissionsModalVisible,
    teachers,
    setTeachers,
    studentVisibleCount,
    setStudentVisibleCount,
    classes,
    setClasses,
    lessons,
    setLessons,
    lessonGradeFilter,
    setLessonGradeFilter,
    lessonSearchQuery,
    setLessonSearchQuery,
    students,
    setStudents,
    schoolMessages,
    setSchoolMessages,
    loadingMessages,
    setLoadingMessages,
    messageSearch,
    setMessageSearch,
    selectedMessageFilter,
    setSelectedMessageFilter,
    adminMessageScope,
    setAdminMessageScope,
    adminReplyModalVisible,
    setAdminReplyModalVisible,
    adminReplyingMessage,
    setAdminReplyingMessage,
    adminReplyContent,
    setAdminReplyContent,
    sendingAdminReply,
    setSendingAdminReply,
    adminNewMsgModalVisible,
    setAdminNewMsgModalVisible,
    adminNewMsgTargetType,
    setAdminNewMsgTargetType,
    adminNewMsgTargetTeacher,
    setAdminNewMsgTargetTeacher,
    adminNewMsgContent,
    setAdminNewMsgContent,
    sendingAdminNewMsg,
    setSendingAdminNewMsg,
    selectedClassForStudents,
    setSelectedClassForStudents,
    classStudentsModalVisible,
    setClassStudentsModalVisible,
    geminiApiKeyInput,
    setGeminiApiKeyInput,
    selectedGeminiModel,
    setSelectedGeminiModel,
    availableLiveModels,
    setAvailableLiveModels,
    modelDropdownModalVisible,
    setModelDropdownModalVisible,
    modelSearchQuery,
    setModelSearchQuery,
    testingGeminiKey,
    setTestingGeminiKey,
    fetchingLiveModels,
    setFetchingLiveModels,
    savingAiSettings,
    setSavingAiSettings,
    usageStats,
    setUsageStats,
    showKeyPassword,
    setShowKeyPassword,
    studentSearch,
    setStudentSearch,
    selectedClassFilter,
    setSelectedClassFilter,
    classFilterModalVisible,
    setClassFilterModalVisible,
    photoUploadingId,
    setPhotoUploadingId,
    dutyAssignDay,
    setDutyAssignDay,
    absentTeachers,
    setAbsentTeachers,
    absentTeacherSearch,
    setAbsentTeacherSearch,
    hiddenDutyTeachersBySlot,
    setHiddenDutyTeachersBySlot,
    editingCounselorClass,
    setEditingCounselorClass,
    savingCounselorClass,
    setSavingCounselorClass,
    selectedAdminStudent,
    setSelectedAdminStudent,
    adminStudentModalVisible,
    setAdminStudentModalVisible,
    loadingStudentDetail,
    setLoadingStudentDetail,
    studentEvaluations,
    setStudentEvaluations,
    studentAssignments,
    setStudentAssignments,
    studentLocalNotes,
    setStudentLocalNotes,
    studentLocalGrades,
    setStudentLocalGrades,
    studentLocalQuizzes,
    setStudentLocalQuizzes,
    logs,
    setLogs,
    loadingLogs,
    setLoadingLogs,
    logUsers,
    setLogUsers,
    logActionTypes,
    setLogActionTypes,
    logStats,
    setLogStats,
    selectedLogUser,
    setSelectedLogUser,
    selectedLogRole,
    setSelectedLogRole,
    selectedLogAction,
    setSelectedLogAction,
    selectedLogTime,
    setSelectedLogTime,
    logSearch,
    setLogSearch,
    exportingLogs,
    setExportingLogs,
    expandedLogId,
    setExpandedLogId,
    logPurgeModalVisible,
    setLogPurgeModalVisible,
    purgeStartDate,
    setPurgeStartDate,
    purgeEndDate,
    setPurgeEndDate,
    isPurgingLogs,
    setIsPurgingLogs,
    menuDrawerVisible,
    setMenuDrawerVisible,
    licenseModalVisible,
    setLicenseModalVisible,
    schoolSelectModalVisible,
    setSchoolSelectModalVisible,
    editModalVisible,
    setEditModalVisible,
    editingSchoolObj,
    setEditingSchoolObj,
    editSchoolName,
    setEditSchoolName,
    editSchoolPhone,
    setEditSchoolPhone,
    editSchoolAddress,
    setEditSchoolAddress,
    editSchoolApiKey,
    setEditSchoolApiKey,
    editSchoolModel,
    setEditSchoolModel,
    editSchoolDailyHours,
    setEditSchoolDailyHours,
    updatingSchool,
    setUpdatingSchool,
    deletingSchoolId,
    setDeletingSchoolId,
    createModalVisible,
    setCreateModalVisible,
    newSchoolName,
    setNewSchoolName,
    newSchoolPhone,
    setNewSchoolPhone,
    newSchoolApiKey,
    setNewSchoolApiKey,
    newSchoolDailyHours,
    setNewSchoolDailyHours,
    addTeacherModalVisible,
    setAddTeacherModalVisible,
    teacherFullName,
    setTeacherFullName,
    teacherBranch,
    setTeacherBranch,
    teacherPhone,
    setTeacherPhone,
    teacherEmail,
    setTeacherEmail,
    addingTeacher,
    setAddingTeacher,
    newTeacherRole,
    setNewTeacherRole,
    createdTeacherResult,
    setCreatedTeacherResult,
    editTeacherModalVisible,
    setEditTeacherModalVisible,
    editingTeacher,
    setEditingTeacher,
    addClassModalVisible,
    setAddClassModalVisible,
    newClassGrade,
    setNewClassGrade,
    newClassSection,
    setNewClassSection,
    addingClass,
    setAddingClass,
    addLessonModalVisible,
    setAddLessonModalVisible,
    newLessonName,
    setNewLessonName,
    newLessonShortCode,
    setNewLessonShortCode,
    newLessonGrade,
    setNewLessonGrade,
    newLessonHours,
    setNewLessonHours,
    addingLesson,
    setAddingLesson,
    addStudentModalVisible,
    setAddStudentModalVisible,
    newStudentNo,
    setNewStudentNo,
    newStudentName,
    setNewStudentName,
    newStudentGrade,
    setNewStudentGrade,
    newStudentSection,
    setNewStudentSection,
    newStudentParentName,
    setNewStudentParentName,
    newStudentParentPhone,
    setNewStudentParentPhone,
    newStudentPhone,
    setNewStudentPhone,
    addingStudent,
    setAddingStudent,
    editStudentModalVisible,
    setEditStudentModalVisible,
    editingStudent,
    setEditingStudent,
    updatingStudent,
    setUpdatingStudent,
    credentialsModalVisible,
    setCredentialsModalVisible,
    selectedStudentForCreds,
    setSelectedStudentForCreds,
    showCredPassword,
    setShowCredPassword,
    showParentCredPassword,
    setShowParentCredPassword,
    customResetPassInput,
    setCustomResetPassInput,
    customParentResetPassInput,
    setCustomParentResetPassInput,
    resettingPassword,
    setResettingPassword,
    resettingParentPassword,
    setResettingParentPassword,
    schedulePreOptionsModalVisible,
    setSchedulePreOptionsModalVisible,
    pendingScheduleFile,
    setPendingScheduleFile,
    optExtractTeachers,
    setOptExtractTeachers,
    optExtractClasses,
    setOptExtractClasses,
    optExtractLessons,
    setOptExtractLessons,
    optExtractScheduleItems,
    setOptExtractScheduleItems,
    optAutoHealBlocks,
    setOptAutoHealBlocks,
    pdfTotalPages,
    setPdfTotalPages,
    pdfPageRangeMode,
    setPdfPageRangeMode,
    pdfStartPage,
    setPdfStartPage,
    pdfEndPage,
    setPdfEndPage,
    countingPdfPages,
    setCountingPdfPages,
    excelPreviewModalVisible,
    setExcelPreviewModalVisible,
    excelInspection,
    setExcelInspection,
    selectedExcelSheet,
    setSelectedExcelSheet,
    scheduleSubView,
    setScheduleSubView,
    conflictSearchQuery,
    setConflictSearchQuery,
    analyticsSearchQuery,
    setAnalyticsSearchQuery,
    analyticsFilterType,
    setAnalyticsFilterType,
    aiModalVisible,
    setAiModalVisible,
    aiParsing,
    setAiParsing,
    parsedSchedule,
    setParsedSchedule,
    aiStageText,
    setAiStageText,
    aiElapsedSeconds,
    setAiElapsedSeconds,
    aiActiveModel,
    setAiActiveModel,
    aiSaving,
    setAiSaving,
    scheduleSaveMode,
    setScheduleSaveMode,
    saveTeachersChecked,
    setSaveTeachersChecked,
    saveClassesChecked,
    setSaveClassesChecked,
    saveLessonsChecked,
    setSaveLessonsChecked,
    saveScheduleChecked,
    setSaveScheduleChecked,
    showTeachersList,
    setShowTeachersList,
    showClassesList,
    setShowClassesList,
    showLessonsList,
    setShowLessonsList,
    excludedTeachers,
    setExcludedTeachers,
    excludedClasses,
    setExcludedClasses,
    excludedLessons,
    setExcludedLessons,
    scheduleBatches,
    setScheduleBatches,
    batchPoolModalVisible,
    setBatchPoolModalVisible,
    lastAnalyzedPageRange,
    setLastAnalyzedPageRange,
    cachedScheduleDoc,
    setCachedScheduleDoc,
    cachedScheduleDraft,
    setCachedScheduleDraft,
    reScanningTeacher,
    setReScanningTeacher,
    teacherRescanHint,
    setTeacherRescanHint,
    inspectTeacherModalVisible,
    setInspectTeacherModalVisible,
    inspectingTeacher,
    setInspectingTeacher,
    inspectingVerification,
    setInspectingVerification,
    inspectingItems,
    setInspectingItems,
    inspectDayTab,
    setInspectDayTab,
    editingExpectedHours,
    setEditingExpectedHours,
    tempExpectedHours,
    setTempExpectedHours,
    editingCellSlot,
    setEditingCellSlot,
    aiCancelledRef,
    excelModalVisible,
    setExcelModalVisible,
    excelParsing,
    setExcelParsing,
    excelSaving,
    setExcelSaving,
    parsedExcelStudents,
    setParsedExcelStudents,
    detectedExcelClasses,
    setDetectedExcelClasses,
    excelSchoolName,
    setExcelSchoolName,
    aiStudentModalVisible,
    setAiStudentModalVisible,
    aiStudentParsing,
    setAiStudentParsing,
    aiStudentSaving,
    setAiStudentSaving,
    aiStudentResult,
    setAiStudentResult,
    teacherExcelModalVisible,
    setTeacherExcelModalVisible,
    teacherExcelParsing,
    setTeacherExcelParsing,
    teacherExcelSaving,
    setTeacherExcelSaving,
    parsedExcelTeachers,
    setParsedExcelTeachers,
    adminCredentialsModalVisible,
    setAdminCredentialsModalVisible,
    adminNewUsername,
    setAdminNewUsername,
    adminOldPassword,
    setAdminOldPassword,
    adminNewPassword,
    setAdminNewPassword,
    adminConfirmPassword,
    setAdminConfirmPassword,
    savingAdminCredentials,
    setSavingAdminCredentials,
    editLessonModalVisible,
    setEditLessonModalVisible,
    editingLesson,
    setEditingLesson,
    editLessonName,
    setEditLessonName,
    editLessonCode,
    setEditLessonCode,
    editLessonGrade,
    setEditLessonGrade,
    editLessonHours,
    setEditLessonHours,
    updatingLesson,
    setUpdatingLesson,
    schoolYearlyPlans,
    setSchoolYearlyPlans,
    yearlyPlanModalVisible,
    setYearlyPlanModalVisible,
    selectedLessonForPlan,
    setSelectedLessonForPlan,
    docAnalysis,
    setDocAnalysis,
    selectedMapping,
    setSelectedMapping,
    analyzingPlanFile,
    setAnalyzingPlanFile,
    savingPlanRows,
    setSavingPlanRows,
    planSheetPickerVisible,
    setPlanSheetPickerVisible,
    planSheetPickerSheets,
    setPlanSheetPickerSheets,
    planSheetPickerAsset,
    setPlanSheetPickerAsset,
    planSheetPickerLesson,
    setPlanSheetPickerLesson,
    viewPlanModalVisible,
    setViewPlanModalVisible,
    selectedLessonForViewPlan,
    setSelectedLessonForViewPlan,
    viewPlanItems,
    setViewPlanItems,
    loadingViewPlan,
    setLoadingViewPlan,
    planSearch,
    setPlanSearch,
    deletingPlan,
    setDeletingPlan,
    selectedTeacherForSchedule,
    setSelectedTeacherForSchedule,
    teacherScheduleItems,
    setTeacherScheduleItems,
    loadingTeacherSchedule,
    setLoadingTeacherSchedule,
    teacherScheduleModalVisible,
    setTeacherScheduleModalVisible,
    scheduleStats,
    setScheduleStats,
    loadingScheduleStats,
    setLoadingScheduleStats,
    scheduleDailyHours,
    setScheduleDailyHours,
    normalizeSearchStr,
    normalizeTeacherMatch,
    filteredTeacherWorkloads,
    filteredClassFullness,
    filteredCourseAllocations,
    filteredLessons,
    uniqueLessonsCount,
    scheduleEditorMode,
    setScheduleEditorMode,
    selectedClassForEditor,
    setSelectedClassForEditor,
    selectedTeacherForEditor,
    setSelectedTeacherForEditor,
    teacherListBoxSearch,
    setTeacherListBoxSearch,
    allSchoolSchedules,
    setAllSchoolSchedules,
    loadingAllSchedules,
    setLoadingAllSchedules,
    scheduleResetModalVisible,
    setScheduleResetModalVisible,
    sortedTeachers,
    filteredTeachersForListBox,
    currentActiveTeacher,
    teacherTotalHoursMap,
    getTeacherTotalHours,
    radarSubTab,
    setRadarSubTab,
    radarTeacher,
    setRadarTeacher,
    radarTeacherSearch,
    setRadarTeacherSearch,
    radarClass,
    setRadarClass,
    radarClassModalVisible,
    setRadarClassModalVisible,
    radarClassSearch,
    setRadarClassSearch,
    radarClassGradeFilter,
    setRadarClassGradeFilter,
    dutyPlacesModalVisible,
    setDutyPlacesModalVisible,
    customDutyPlaces,
    setCustomDutyPlaces,
    newCustomPlaceInput,
    setNewCustomPlaceInput,
    radarDay,
    setRadarDay,
    radarHour,
    setRadarHour,
    dutiesList,
    setDutiesList,
    loadingDuties,
    setLoadingDuties,
    dutyFilterDay,
    setDutyFilterDay,
    addDutyModalVisible,
    setAddDutyModalVisible,
    newDutyTeacher,
    setNewDutyTeacher,
    newDutyDay,
    setNewDutyDay,
    newDutyPlace,
    setNewDutyPlace,
    newDutyNotes,
    setNewDutyNotes,
    savingDuty,
    setSavingDuty,
    importingDutyExcel,
    setImportingDutyExcel,
    downloadingDutyTemplate,
    setDownloadingDutyTemplate,
    allKnownDutyPlaces,
    normalizeDayNumber,
    freeTeachersList,
    activeRadarTeacherScheduleMap,
    filteredRadarTeachers,
    handleSelectPrevTeacher,
    handleSelectNextTeacher,
    slotModalVisible,
    setSlotModalVisible,
    editingSlotData,
    setEditingSlotData,
    savingSlot,
    setSavingSlot,
    slotLessonSearchQuery,
    setSlotLessonSearchQuery,
    slotTeacherSearchQuery,
    setSlotTeacherSearchQuery,
    singleTeacherParsing,
    setSingleTeacherParsing,
    singleTeacherPreview,
    setSingleTeacherPreview,
    singleTeacherModalVisible,
    setSingleTeacherModalVisible,
    savingSingleTeacher,
    setSavingSingleTeacher,
    teacherLoginFilter,
    setTeacherLoginFilter,
    teacherSearchQuery,
    setTeacherSearchQuery,
    teacherSortOrder,
    setTeacherSortOrder,
    bulkPhotoModalVisible,
    setBulkPhotoModalVisible,
    bulkPhotoProgress,
    setBulkPhotoProgress,
    uploadingBulkPhotos,
    setUploadingBulkPhotos,
    photoReviewModalVisible,
    setPhotoReviewModalVisible,
    reviewPhotos,
    setReviewPhotos,
    reviewPageFilter,
    setReviewPageFilter,
    reviewMatchFilter,
    setReviewMatchFilter,
    reviewSearchQuery,
    setReviewSearchQuery,
    savingReviewPhotos,
    setSavingReviewPhotos,
    cachedPdfAsset,
    setCachedPdfAsset,
    cachedPdfPhotos,
    setCachedPdfPhotos,
    initialReviewPhotos,
    setInitialReviewPhotos,
    photoHistoryStack,
    setPhotoHistoryStack,
    rescanningPage,
    setRescanningPage,
    studentPickerVisible,
    setStudentPickerVisible,
    studentPickerTargetId,
    setStudentPickerTargetId,
    studentPickerSearch,
    setStudentPickerSearch,
    photoPickerVisible,
    setPhotoPickerVisible,
    photoPickerTargetId,
    setPhotoPickerTargetId,
    photoPickerSearch,
    setPhotoPickerSearch,
    singleStudentPdfModalVisible,
    setSingleStudentPdfModalVisible,
    singleStudentPdfTarget,
    setSingleStudentPdfTarget,
    singleStudentPdfSearch,
    setSingleStudentPdfSearch,
    singleStudentPdfUploading,
    setSingleStudentPdfUploading,
    serverBaseUrl,
    exportingReportType,
    setExportingReportType,
    reportTeacherBranch,
    setReportTeacherBranch,
    reportTeacherRole,
    setReportTeacherRole,
    reportTeacherActive,
    setReportTeacherActive,
    reportStudentGrade,
    setReportStudentGrade,
    reportStudentSection,
    setReportStudentSection,
    reportStudentSearch,
    setReportStudentSearch,
    reportClassGrade,
    setReportClassGrade,
    reportLessonGrade,
    setReportLessonGrade,
    reportLessonPlanStatus,
    setReportLessonPlanStatus,
    reportScheduleTeacher,
    setReportScheduleTeacher,
    reportScheduleClass,
    setReportScheduleClass,
    reportScheduleDay,
    setReportScheduleDay,
    reportSelectedPlanLessonId,
    setReportSelectedPlanLessonId,
    reportAuditUser,
    setReportAuditUser,
    reportAuditRole,
    setReportAuditRole,
    reportAuditAction,
    setReportAuditAction,
    getPickerStudentInfo,
    reviewAvailablePages,
    getPhotoMatchStatus,
    filteredReviewPhotos,
    filteredPickerStudents,
    autoReconciling,
    setAutoReconciling,
    autoFillingGaps,
    setAutoFillingGaps,
    slotConflictItems,
    setSlotConflictItems,
    allAvailableLessons,
    allAvailableTeachers,
    filteredSlotLessons,
    filteredSlotTeachers,
    tabPressTimestampRef,
    filteredTeachers,
    filteredStudents
  };

  Object.assign(ctx, createScheduleAndBatchHandlers(ctx));
  Object.assign(ctx, createPhotoAndDataHandlers(ctx));
  Object.assign(ctx, createCrudAndScheduleAiHandlers(ctx));
  Object.assign(ctx, createPlanExcelAndSystemHandlers(ctx));

  const {
    loadSchoolMessages,
    loadSchools,
    handleLogout,
    handleOpenEditSchool,
    handleDeleteSchool,
    handleSelectSchool,
    handleCopyCode,
    handleManualSyncSnapshot,
    loadAllSchedules,
    loadScheduleStats,
    loadDuties
  } = ctx;

  useEffect(() => {
    let interval: any;
    if (aiParsing) {
      setAiElapsedSeconds(0);
      interval = setInterval(() => {
        setAiElapsedSeconds((prev: any) => prev + 1);
      }, 1000);
    } else {
      setAiElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [aiParsing]);

  useEffect(() => {
    if (activeTab === 'messages' && selectedSchool?.id) {
      loadSchoolMessages(String(selectedSchool.id));
    }
  }, [activeTab, selectedSchool?.id]);

  useEffect(() => {
    const elapsed = tabPressTimestampRef.current > 0 ? (Date.now() - tabPressTimestampRef.current) : 0;
    const h = InteractionManager.runAfterInteractions(() => {
      console.log(`[PERF] sekme='${activeTab}' (tıklama->çizim: ${elapsed}ms) | öğretmen=${teachers.length} öğrenci=${students.length} program=${allSchoolSchedules.length}`);
    });
    return () => h.cancel();
  }, [activeTab]);

  useEffect(() => {
    const elapsed = tabPressTimestampRef.current > 0 ? (Date.now() - tabPressTimestampRef.current) : 0;
    const h = InteractionManager.runAfterInteractions(() => {
      console.log(`[PERF] radarAltSekme='${radarSubTab}' boşÖğretmenler=${freeTeachersList.length} gün=${radarDay} saat=${radarHour} (tıklama->çizim: ${elapsed}ms)`);
    });
    return () => h.cancel();
  }, [radarSubTab, radarDay, radarHour]);

  useEffect(() => {
    setStudentVisibleCount(30);
  }, [studentSearch, selectedClassFilter, activeTab]);

  useEffect(() => {
    loadSchools();
    getActiveUserSession().then(async (session: any) => {
      const role = (session?.role || '').toUpperCase();
      if (role === 'STUDENT' || role === 'PARENT') {
        Alert.alert('Yetkisiz Erişim', 'Öğrenci veya veli hesapları okul idare paneline erişemez.');
        await clearAuthSession();
        if (onRoleChange) onRoleChange(null);
        return;
      }
      if (session) setCurrentUserSession(session);
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* 📌 Sabit Minimal Üst Çubuk (Sadece Sistemden Çıkış, Hamburger Menü ve Yetkiler Butonları) */}
      <View style={styles.fixedTopBar}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.fixedBrandDot} />
          <Text style={styles.fixedBrandText} numberOfLines={1}>
            {selectedSchool?.name || 'Okul İdaresi'}
          </Text>
        </View>

        {/* Sağ Butonlar: Yetkiler, Çıkış ve Menü */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.hamburgerBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
            activeOpacity={0.7}
            accessibilityLabel="Oturumu Kapat / Rol Değiştir"
          >
            <Ionicons name="log-out-outline" size={19} color="#DC2626" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenuDrawerVisible(true)}
            style={styles.hamburgerBtn}
            activeOpacity={0.7}
            accessibilityLabel="Menü"
          >
            <Ionicons name="menu" size={22} color="#4F46E5" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSchools(); }} />}
      >
        {/* 📜 Sayfa İle Birlikte Kayan İdareci Başlık & Okul Dropdown Paneli */}
        <View style={styles.scrollableHeaderCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flex: 1 }}>
            <Text style={styles.headerTitle}>
              {isStaff ? '🛡️ Okul İdarecisi Paneli' : 'Okul Yönetim Paneli'}
            </Text>
            {adminDisplayName ? (
              <View style={styles.headerAdminPill}>
                <Ionicons name="person-circle" size={13} color="#4F46E5" />
                <Text style={styles.headerAdminPillText} numberOfLines={1}>
                  {adminDisplayName}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.headerSchoolDropdownBtn, { marginTop: 0 }]}
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
        </View>

        {/* 🏫 BİRLEŞTİRİLMİŞ OKUL VE ÖĞRETMEN BAĞLANTI KODU KARTI */}
        <View style={styles.combinedSchoolCard}>
          <View style={styles.schoolSelectorHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="business" size={13} color="#4F46E5" />
              <Text style={styles.schoolSelectorLabel}>
                {isStaff ? 'YETKİLİ OLDUĞUNUZ OKULLAR' : 'YÖNETTİĞİNİZ OKULLAR'} {schools.length > 0 ? `(${schools.length})` : ''}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {!isStaff && selectedSchool && (
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
              {!isStaff && (
                <TouchableOpacity
                  onPress={() => setCreateModalVisible(true)}
                  style={styles.addSchoolSmallBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle" size={12} color="#166534" />
                  {/* <Text style={styles.addSchoolSmallBtnText}>Yeni Okul</Text> */}
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.schoolChipsScroll}>
            {schools.map((s: any) => {
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
                  {!isStaff && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 2 }}>
                      <TouchableOpacity
                        onPress={(e: any) => {
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
                          onPress={(e: any) => {
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
                  )}
                </TouchableOpacity>
              );
            })}
            {!isStaff && schools.length === 0 && (
              <TouchableOpacity
                onPress={() => setCreateModalVisible(true)}
                style={[styles.schoolChip, { borderColor: '#166534', backgroundColor: '#F0FDF4' }]}
              >
                <Ionicons name="add" size={14} color="#166534" />
                <Text style={[styles.schoolChipText, { color: '#166534' }]}>Henüz Okul Yok - İlk Okulu Ekle</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

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

          {/* OFFLINE-FIRST VERİ EŞİTLEME ŞERİDİ */}
          {selectedSchool && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC',
              borderWidth: 1,
              borderColor: '#E2E8F0',
              borderRadius: 10,
              paddingVertical: 7,
              paddingHorizontal: 12,
              marginTop: 6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Ionicons name="cloud-done-outline" size={16} color="#059669" />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E293B' }}>
                      Yerel Çevrimdışı Bellek (0ms Hız)
                    </Text>
                    <View style={{ backgroundColor: '#E0E7FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4338CA' }}>v{CURRENT_APP_VERSION}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: '#64748B' }}>
                    Son Eşitleme: {formatSyncTime(lastSyncTime)} • Kod: {CURRENT_VERSION_CODE}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#4F46E5',
                  paddingVertical: 6,
                  paddingHorizontal: 11,
                  borderRadius: 7,
                }}
                onPress={handleManualSyncSnapshot}
                disabled={syncingSnapshot}
                activeOpacity={0.7}
              >
                {syncingSnapshot ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="sync" size={13} color="#FFFFFF" />
                )}
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                  {syncingSnapshot ? 'Eşitleniyor...' : 'Verileri Güncelle'}
                </Text>
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
              Dersler ({uniqueLessonsCount > 0 ? uniqueLessonsCount : lessons.length})
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
              if (allSchoolSchedules.length === 0) {
                loadAllSchedules();
              }
              if (!scheduleStats) {
                loadScheduleStats();
              }
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
            style={[styles.tabButton, activeTab === 'radar' && styles.tabButtonActive]}
            onPress={() => {
              tabPressTimestampRef.current = Date.now();
              setActiveTab('radar');
              // Yerel hafızada zaten veri varsa 0ms gecikmeyle anında göster, sunucu bekleme yapma
              if (allSchoolSchedules.length === 0) {
                loadAllSchedules();
              }
              if (dutiesList.length === 0) {
                loadDuties();
              }
            }}
          >
            <Ionicons name="compass" size={15} color={activeTab === 'radar' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'radar' && styles.tabButtonTextActive]}>
              📍 Canlı Radar & Nöbet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'duty_assignment' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('duty_assignment');
              if (allSchoolSchedules.length === 0) {
                loadAllSchedules();
              }
              if (dutiesList.length === 0) {
                loadDuties();
              }
            }}
          >
            <Ionicons name="shield-checkmark" size={15} color={activeTab === 'duty_assignment' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'duty_assignment' && styles.tabButtonTextActive]}>
              🛡️ Nöbetçi Atama
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'optik' && styles.tabButtonActive]}
            onPress={() => setActiveTab('optik')}
          >
            <Ionicons name="scan" size={15} color={activeTab === 'optik' ? '#4F46E5' : '#64748B'} />
            <Text style={[styles.tabButtonText, activeTab === 'optik' && styles.tabButtonTextActive]}>
              🎯 Optik Sınav & Analiz
            </Text>
          </TouchableOpacity>

          {!isStaff && (
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'backup' && styles.tabButtonActive]}
              onPress={() => setActiveTab('backup')}
            >
              <Ionicons name="cloud-download" size={15} color={activeTab === 'backup' ? '#4F46E5' : '#64748B'} />
              <Text style={[styles.tabButtonText, activeTab === 'backup' && styles.tabButtonTextActive]}>
                💾 Yedekleme
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* 1. ÖĞRETMENLER SEKMESİ */}
            {activeTab === 'teachers' && <TeachersTabView ctx={ctx} />}

            {/* 2. SINIFLAR VE ŞUBELER SEKMESİ */}
            {activeTab === 'classes' && <ClassesTabView ctx={ctx} />}

            {/* 3. DERSLER SEKMESİ */}
            {activeTab === 'lessons' && <LessonsTabView ctx={ctx} />}

            {/* 4. ÖĞRENCİLER SEKMESİ (SERVER CRUD & FOTOĞRAF) */}
            {activeTab === 'students' && <StudentsTabView ctx={ctx} />}

            {/* 5. ÇARŞAF, PROGRAM DENETİMİ VE CANLI DÜZENLEYİCİ SEKMESİ */}
            {activeTab === 'schedule' && <ScheduleTabView ctx={ctx} />}

            {/* 6. İŞLEM LOGLARI & DENETİM RAPORU SEKMESİ */}
            {activeTab === 'logs' && <LogsTabView ctx={ctx} />}

            {/* 7. OKUL İÇİ MESAJLAŞMA VE DENETİM SEKMESİ */}
            {activeTab === 'messages' && <MessagesTabView ctx={ctx} />}

            {/* 8. AI & API AYARLARI SEKMESİ */}
            {activeTab === 'ai_settings' && <AiSettingsTabView ctx={ctx} />}

            {/* 8. RAPORLAMA VE EXCEL MERKEZİ SEKMESİ */}
            {activeTab === 'reports' && <ReportsTabView ctx={ctx} />}

            {/* 10. CANLI KONUM, BOŞ DERS RADARI & NÖBET MODÜLÜ */}
            {activeTab === 'radar' && <RadarTabView ctx={ctx} />}

            {/* 7. NÖBETÇİ ATAMA & GELMEYEN ÖĞRETMEN TELAFİ DAĞITIMI SEKMESİ */}
            {activeTab === 'duty_assignment' && <DutyAssignmentTabView ctx={ctx} />}

            {/* OPTİK OKUMA, SINAV DEĞERLENDİRME & KONU-KAZANIM ANALİZİ SEKMESİ */}
            {activeTab === 'optik' && (
              <OptikModuleView schoolId={selectedSchool?.id} mode="admin" />
            )}

            {/* VERİTABANI YEDEKLEME & GERİ YÜKLEME SEKMESİ */}
            {activeTab === 'backup' && !isStaff && (
              <BackupModuleView
                schoolId={selectedSchool?.id}
                schoolName={selectedSchool?.name}
                isSuperAdmin={currentUserSession?.role === 'SUPERADMIN'}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* NÖBETÇİ EKLEME MODALI */}
      <TeacherAndClassModals ctx={ctx} />
      <ScheduleAndSchoolModals ctx={ctx} />
      <LessonPlanAndExcelModals ctx={ctx} />
      <PhotoAndSystemModals ctx={ctx} />

      {/* 💬 Okunmamış Mesajlar Yüzen Bildirim Baloncuğu */}
      {activeTab !== 'messages' && (
        <FloatingMessageBubble
          onPress={() => {
            setActiveTab('messages');
            loadSchoolMessages();
          }}
          schoolId={selectedSchool?.id ? String(selectedSchool.id) : undefined}
          bottomOffset={24}
        />
      )}
    </SafeAreaView>
  );
}
