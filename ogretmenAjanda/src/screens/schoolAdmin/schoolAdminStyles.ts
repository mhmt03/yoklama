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
import { Colors } from '../../theme/colors';
import { getActiveTeacherName } from '../../utils/roleService';
import { apiRequest, DEFAULT_API_URL, clearAuthSession, getActiveUserSession, getAuthToken } from '../../services/apiClient';
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
} from '../../services/aiScheduleParser';
import {
  inspectExcelWorkbook,
  parseInitialExcelSchedule,
  ExcelInspectionResult,
} from '../../services/excelScheduleParser';
import { countPdfPages } from '../../utils/pdfSliceService';
import { extractStudentPhotosWithAi } from '../../services/aiStudentPhotoExtractor';
import { parseStudentsFromExcel, saveParsedStudentsToServer, ParsedExcelStudent, generateStudentTemplateExcel } from '../../services/excelStudentParser';
import { parseTeachersFromExcel, saveParsedTeachersToServer, ParsedExcelTeacher, generateTeacherTemplateExcel } from '../../services/excelTeacherParser';
import { parseStudentsFromExcelWithAi, AiStudentParseResult } from '../../services/aiStudentExcelParser';
import { generateDutyTemplateExcel } from '../../utils/excelService';
import { PermissionsManagementModal } from '../../components/PermissionsManagementModal';
import { FloatingMessageBubble } from '../../components/FloatingMessageBubble';
import { markAllMessagesAsRead, setCachedUnreadCount } from '../../services/messageNotificationService';
import { CURRENT_APP_VERSION, CURRENT_VERSION_CODE } from '../../services/appUpdateService';
import { analyzeUploadedDocument, convertRowsWithMapping, DocumentAnalysisResult, ColumnMappingSelection, generateYearlyPlanTemplateExcel } from '../../utils/columnMappingService';
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
} from '../../services/adminReportService';
import {
  parseSingleTeacherScheduleWithAi,
  saveTeacherScheduleToServer,
  saveSingleScheduleItemToServer,
  deleteSingleScheduleItemFromServer,
  fetchScheduleIntegrityStats,
  SingleTeacherScheduleItem,
} from '../../services/singleTeacherScheduleParser';
import { getActiveSchool, updateSchool, deleteSchool, getSchools } from '../../database/operations/schoolOperations';
import { setActiveUserRole, logoutUserRole } from '../../utils/roleService';
import { pickSinglePhotoFromSource } from '../../utils/photoService';
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
} from '../../utils/geminiScheduleService';
import { extractPhotosFromPdf, PdfExtractedStudentPhoto } from '../../utils/pdfPhotoExtractor';
import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isTeacherMatch } from '../../utils/teacherUtils';
import { formatDateToTR } from '../../utils/dateUtils';
import {
  SchoolSnapshotData,
  saveSchoolSnapshotToStorage,
  loadSchoolSnapshotFromStorage,
  getSchoolSnapshotLastSyncTime,
  fetchAndCacheSchoolSnapshot,
  patchLocalSchoolSnapshot,
  formatSyncTime,
} from '../../services/schoolSnapshotService';
import {
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../../utils/counselorService';
import { printDutyAssignments, DutyPrintSlot } from '../../utils/dutyPrintService';
import { OptikModuleView } from '../../components/OptikModuleView';
import { BackupModuleView } from '../../components/BackupModuleView';

export type AdminTab = 'teachers' | 'classes' | 'lessons' | 'students' | 'schedule' | 'duty_assignment' | 'logs' | 'messages' | 'reports' | 'ai_settings' | 'radar' | 'optik' | 'backup';

export interface StateSetter {
  (updater: (prev: any) => any): void;
  (value: any): void;
}

export interface SchoolAdminCtx {
  setSchools: StateSetter;
  setSelectedSchool: StateSetter;
  setActiveTab: StateSetter;
  setLoading: StateSetter;
  setRefreshing: StateSetter;
  setLastSyncTime: StateSetter;
  setSyncingSnapshot: StateSetter;
  setCurrentUserSession: StateSetter;
  setPermissionsModalVisible: StateSetter;
  setTeachers: StateSetter;
  setStudentVisibleCount: StateSetter;
  setClasses: StateSetter;
  setLessons: StateSetter;
  setLessonGradeFilter: StateSetter;
  setLessonSearchQuery: StateSetter;
  setStudents: StateSetter;
  setSchoolMessages: StateSetter;
  setLoadingMessages: StateSetter;
  setMessageSearch: StateSetter;
  setSelectedMessageFilter: StateSetter;
  setAdminMessageScope: StateSetter;
  setAdminReplyModalVisible: StateSetter;
  setAdminReplyingMessage: StateSetter;
  setAdminReplyContent: StateSetter;
  setSendingAdminReply: StateSetter;
  setAdminNewMsgModalVisible: StateSetter;
  setAdminNewMsgTargetType: StateSetter;
  setAdminNewMsgTargetTeacher: StateSetter;
  setAdminNewMsgContent: StateSetter;
  setSendingAdminNewMsg: StateSetter;
  setSelectedClassForStudents: StateSetter;
  setClassStudentsModalVisible: StateSetter;
  setGeminiApiKeyInput: StateSetter;
  setSelectedGeminiModel: StateSetter;
  setAvailableLiveModels: StateSetter;
  setModelDropdownModalVisible: StateSetter;
  setModelSearchQuery: StateSetter;
  setTestingGeminiKey: StateSetter;
  setFetchingLiveModels: StateSetter;
  setSavingAiSettings: StateSetter;
  setUsageStats: StateSetter;
  setShowKeyPassword: StateSetter;
  setStudentSearch: StateSetter;
  setSelectedClassFilter: StateSetter;
  setClassFilterModalVisible: StateSetter;
  setPhotoUploadingId: StateSetter;
  setDutyAssignDay: StateSetter;
  setAbsentTeachers: StateSetter;
  setAbsentTeacherSearch: StateSetter;
  setHiddenDutyTeachersBySlot: StateSetter;
  setEditingCounselorClass: StateSetter;
  setSavingCounselorClass: StateSetter;
  setSelectedAdminStudent: StateSetter;
  setAdminStudentModalVisible: StateSetter;
  setLoadingStudentDetail: StateSetter;
  setStudentEvaluations: StateSetter;
  setStudentAssignments: StateSetter;
  setStudentLocalNotes: StateSetter;
  setStudentLocalGrades: StateSetter;
  setStudentLocalQuizzes: StateSetter;
  setLogs: StateSetter;
  setLoadingLogs: StateSetter;
  setLogUsers: StateSetter;
  setLogActionTypes: StateSetter;
  setLogStats: StateSetter;
  setSelectedLogUser: StateSetter;
  setSelectedLogRole: StateSetter;
  setSelectedLogAction: StateSetter;
  setSelectedLogTime: StateSetter;
  setLogSearch: StateSetter;
  setExportingLogs: StateSetter;
  setExpandedLogId: StateSetter;
  setLogPurgeModalVisible: StateSetter;
  setPurgeStartDate: StateSetter;
  setPurgeEndDate: StateSetter;
  setIsPurgingLogs: StateSetter;
  setMenuDrawerVisible: StateSetter;
  setLicenseModalVisible: StateSetter;
  setSchoolSelectModalVisible: StateSetter;
  setEditModalVisible: StateSetter;
  setEditingSchoolObj: StateSetter;
  setEditSchoolName: StateSetter;
  setEditSchoolPhone: StateSetter;
  setEditSchoolAddress: StateSetter;
  setEditSchoolApiKey: StateSetter;
  setEditSchoolModel: StateSetter;
  setEditSchoolDailyHours: StateSetter;
  setUpdatingSchool: StateSetter;
  setDeletingSchoolId: StateSetter;
  setCreateModalVisible: StateSetter;
  setNewSchoolName: StateSetter;
  setNewSchoolPhone: StateSetter;
  setNewSchoolApiKey: StateSetter;
  setNewSchoolDailyHours: StateSetter;
  setAddTeacherModalVisible: StateSetter;
  setTeacherFullName: StateSetter;
  setTeacherBranch: StateSetter;
  setTeacherPhone: StateSetter;
  setTeacherEmail: StateSetter;
  setAddingTeacher: StateSetter;
  setNewTeacherRole: StateSetter;
  setCreatedTeacherResult: StateSetter;
  setEditTeacherModalVisible: StateSetter;
  setEditingTeacher: StateSetter;
  setAddClassModalVisible: StateSetter;
  setNewClassGrade: StateSetter;
  setNewClassSection: StateSetter;
  setAddingClass: StateSetter;
  setAddLessonModalVisible: StateSetter;
  setNewLessonName: StateSetter;
  setNewLessonShortCode: StateSetter;
  setNewLessonGrade: StateSetter;
  setNewLessonHours: StateSetter;
  setAddingLesson: StateSetter;
  setAddStudentModalVisible: StateSetter;
  setNewStudentNo: StateSetter;
  setNewStudentName: StateSetter;
  setNewStudentGrade: StateSetter;
  setNewStudentSection: StateSetter;
  setNewStudentParentName: StateSetter;
  setNewStudentParentPhone: StateSetter;
  setNewStudentPhone: StateSetter;
  setAddingStudent: StateSetter;
  setEditStudentModalVisible: StateSetter;
  setEditingStudent: StateSetter;
  setUpdatingStudent: StateSetter;
  setCredentialsModalVisible: StateSetter;
  setSelectedStudentForCreds: StateSetter;
  setShowCredPassword: StateSetter;
  setShowParentCredPassword: StateSetter;
  setCustomResetPassInput: StateSetter;
  setCustomParentResetPassInput: StateSetter;
  setResettingPassword: StateSetter;
  setResettingParentPassword: StateSetter;
  setSchedulePreOptionsModalVisible: StateSetter;
  setPendingScheduleFile: StateSetter;
  setOptExtractTeachers: StateSetter;
  setOptExtractClasses: StateSetter;
  setOptExtractLessons: StateSetter;
  setOptExtractScheduleItems: StateSetter;
  setOptAutoHealBlocks: StateSetter;
  setPdfTotalPages: StateSetter;
  setPdfPageRangeMode: StateSetter;
  setPdfStartPage: StateSetter;
  setPdfEndPage: StateSetter;
  setCountingPdfPages: StateSetter;
  setExcelPreviewModalVisible: StateSetter;
  setExcelInspection: StateSetter;
  setSelectedExcelSheet: StateSetter;
  setScheduleSubView: StateSetter;
  setConflictSearchQuery: StateSetter;
  setAnalyticsSearchQuery: StateSetter;
  setAnalyticsFilterType: StateSetter;
  setAiModalVisible: StateSetter;
  setAiParsing: StateSetter;
  setParsedSchedule: StateSetter;
  setAiStageText: StateSetter;
  setAiElapsedSeconds: StateSetter;
  setAiActiveModel: StateSetter;
  setAiSaving: StateSetter;
  setScheduleSaveMode: StateSetter;
  setSaveTeachersChecked: StateSetter;
  setSaveClassesChecked: StateSetter;
  setSaveLessonsChecked: StateSetter;
  setSaveScheduleChecked: StateSetter;
  setShowTeachersList: StateSetter;
  setShowClassesList: StateSetter;
  setShowLessonsList: StateSetter;
  setExcludedTeachers: StateSetter;
  setExcludedClasses: StateSetter;
  setExcludedLessons: StateSetter;
  setScheduleBatches: StateSetter;
  setBatchPoolModalVisible: StateSetter;
  setLastAnalyzedPageRange: StateSetter;
  setCachedScheduleDoc: StateSetter;
  setCachedScheduleDraft: StateSetter;
  setReScanningTeacher: StateSetter;
  setTeacherRescanHint: StateSetter;
  setInspectTeacherModalVisible: StateSetter;
  setInspectingTeacher: StateSetter;
  setInspectingVerification: StateSetter;
  setInspectingItems: StateSetter;
  setInspectDayTab: StateSetter;
  setEditingExpectedHours: StateSetter;
  setTempExpectedHours: StateSetter;
  setEditingCellSlot: StateSetter;
  setExcelModalVisible: StateSetter;
  setExcelParsing: StateSetter;
  setExcelSaving: StateSetter;
  setParsedExcelStudents: StateSetter;
  setDetectedExcelClasses: StateSetter;
  setExcelSchoolName: StateSetter;
  setAiStudentModalVisible: StateSetter;
  setAiStudentParsing: StateSetter;
  setAiStudentSaving: StateSetter;
  setAiStudentResult: StateSetter;
  setTeacherExcelModalVisible: StateSetter;
  setTeacherExcelParsing: StateSetter;
  setTeacherExcelSaving: StateSetter;
  setParsedExcelTeachers: StateSetter;
  setAdminCredentialsModalVisible: StateSetter;
  setAdminNewUsername: StateSetter;
  setAdminOldPassword: StateSetter;
  setAdminNewPassword: StateSetter;
  setAdminConfirmPassword: StateSetter;
  setSavingAdminCredentials: StateSetter;
  setEditLessonModalVisible: StateSetter;
  setEditingLesson: StateSetter;
  setEditLessonName: StateSetter;
  setEditLessonCode: StateSetter;
  setEditLessonGrade: StateSetter;
  setEditLessonHours: StateSetter;
  setUpdatingLesson: StateSetter;
  setSchoolYearlyPlans: StateSetter;
  setYearlyPlanModalVisible: StateSetter;
  setSelectedLessonForPlan: StateSetter;
  setDocAnalysis: StateSetter;
  setSelectedMapping: StateSetter;
  setAnalyzingPlanFile: StateSetter;
  setSavingPlanRows: StateSetter;
  setPlanSheetPickerVisible: StateSetter;
  setPlanSheetPickerSheets: StateSetter;
  setPlanSheetPickerAsset: StateSetter;
  setPlanSheetPickerLesson: StateSetter;
  setViewPlanModalVisible: StateSetter;
  setSelectedLessonForViewPlan: StateSetter;
  setViewPlanItems: StateSetter;
  setLoadingViewPlan: StateSetter;
  setPlanSearch: StateSetter;
  setDeletingPlan: StateSetter;
  setSelectedTeacherForSchedule: StateSetter;
  setTeacherScheduleItems: StateSetter;
  setLoadingTeacherSchedule: StateSetter;
  setTeacherScheduleModalVisible: StateSetter;
  setScheduleStats: StateSetter;
  setLoadingScheduleStats: StateSetter;
  setScheduleDailyHours: StateSetter;
  setScheduleEditorMode: StateSetter;
  setSelectedClassForEditor: StateSetter;
  setSelectedTeacherForEditor: StateSetter;
  setTeacherListBoxSearch: StateSetter;
  setAllSchoolSchedules: StateSetter;
  setLoadingAllSchedules: StateSetter;
  setScheduleResetModalVisible: StateSetter;
  setRadarSubTab: StateSetter;
  setRadarTeacher: StateSetter;
  setRadarTeacherSearch: StateSetter;
  setRadarClass: StateSetter;
  setRadarClassModalVisible: StateSetter;
  setRadarClassSearch: StateSetter;
  setRadarClassGradeFilter: StateSetter;
  setDutyPlacesModalVisible: StateSetter;
  setCustomDutyPlaces: StateSetter;
  setNewCustomPlaceInput: StateSetter;
  setRadarDay: StateSetter;
  setRadarHour: StateSetter;
  setDutiesList: StateSetter;
  setLoadingDuties: StateSetter;
  setDutyFilterDay: StateSetter;
  setAddDutyModalVisible: StateSetter;
  setNewDutyTeacher: StateSetter;
  setNewDutyDay: StateSetter;
  setNewDutyPlace: StateSetter;
  setNewDutyNotes: StateSetter;
  setSavingDuty: StateSetter;
  setImportingDutyExcel: StateSetter;
  setDownloadingDutyTemplate: StateSetter;
  setSlotModalVisible: StateSetter;
  setEditingSlotData: StateSetter;
  setSavingSlot: StateSetter;
  setSlotLessonSearchQuery: StateSetter;
  setSlotTeacherSearchQuery: StateSetter;
  setSingleTeacherParsing: StateSetter;
  setSingleTeacherPreview: StateSetter;
  setSingleTeacherModalVisible: StateSetter;
  setSavingSingleTeacher: StateSetter;
  setTeacherLoginFilter: StateSetter;
  setTeacherSearchQuery: StateSetter;
  setTeacherSortOrder: StateSetter;
  setBulkPhotoModalVisible: StateSetter;
  setBulkPhotoProgress: StateSetter;
  setUploadingBulkPhotos: StateSetter;
  setPhotoReviewModalVisible: StateSetter;
  setReviewPhotos: StateSetter;
  setReviewPageFilter: StateSetter;
  setReviewMatchFilter: StateSetter;
  setReviewSearchQuery: StateSetter;
  setSavingReviewPhotos: StateSetter;
  setCachedPdfAsset: StateSetter;
  setCachedPdfPhotos: StateSetter;
  setInitialReviewPhotos: StateSetter;
  setPhotoHistoryStack: StateSetter;
  setRescanningPage: StateSetter;
  setStudentPickerVisible: StateSetter;
  setStudentPickerTargetId: StateSetter;
  setStudentPickerSearch: StateSetter;
  setPhotoPickerVisible: StateSetter;
  setPhotoPickerTargetId: StateSetter;
  setPhotoPickerSearch: StateSetter;
  setSingleStudentPdfModalVisible: StateSetter;
  setSingleStudentPdfTarget: StateSetter;
  setSingleStudentPdfSearch: StateSetter;
  setSingleStudentPdfUploading: StateSetter;
  setExportingReportType: StateSetter;
  setReportTeacherBranch: StateSetter;
  setReportTeacherRole: StateSetter;
  setReportTeacherActive: StateSetter;
  setReportStudentGrade: StateSetter;
  setReportStudentSection: StateSetter;
  setReportStudentSearch: StateSetter;
  setReportClassGrade: StateSetter;
  setReportLessonGrade: StateSetter;
  setReportLessonPlanStatus: StateSetter;
  setReportScheduleTeacher: StateSetter;
  setReportScheduleClass: StateSetter;
  setReportScheduleDay: StateSetter;
  setReportSelectedPlanLessonId: StateSetter;
  setReportAuditUser: StateSetter;
  setReportAuditRole: StateSetter;
  setReportAuditAction: StateSetter;
  setAutoReconciling: StateSetter;
  setAutoFillingGaps: StateSetter;
  setSlotConflictItems: StateSetter;
  schools: any[];
  selectedSchool: any;
  activeTab: AdminTab;
  loading: boolean;
  refreshing: boolean;
  lastSyncTime: string | null;
  syncingSnapshot: boolean;
  currentUserSession: any;
  permissionsModalVisible: boolean;
  teachers: any[];
  studentVisibleCount: number;
  classes: any[];
  lessons: any[];
  lessonGradeFilter: 'all' | '9' | '10' | '11' | '12' | 'common';
  lessonSearchQuery: string;
  students: any[];
  schoolMessages: any[];
  loadingMessages: boolean;
  messageSearch: string;
  selectedMessageFilter: 'all' | 'students' | 'teachers' | 'parents';
  adminMessageScope: 'personal' | 'all' | 'sent';
  adminReplyModalVisible: boolean;
  adminReplyingMessage: any | null;
  adminReplyContent: string;
  sendingAdminReply: boolean;
  adminNewMsgModalVisible: boolean;
  adminNewMsgTargetType: string;
  adminNewMsgTargetTeacher: any | null;
  adminNewMsgContent: string;
  sendingAdminNewMsg: boolean;
  selectedClassForStudents: any;
  classStudentsModalVisible: boolean;
  geminiApiKeyInput: string;
  availableLiveModels: string[];
  modelDropdownModalVisible: boolean;
  modelSearchQuery: string;
  testingGeminiKey: boolean;
  fetchingLiveModels: boolean;
  savingAiSettings: boolean;
  usageStats: GeminiUsageStats | null;
  showKeyPassword: boolean;
  studentSearch: string;
  selectedClassFilter: string;
  classFilterModalVisible: boolean;
  photoUploadingId: string | null;
  dutyAssignDay: number;
  absentTeachers: string[];
  absentTeacherSearch: string;
  hiddenDutyTeachersBySlot: Record<string, string[]>;
  editingCounselorClass: string;
  savingCounselorClass: boolean;
  selectedAdminStudent: any;
  adminStudentModalVisible: boolean;
  loadingStudentDetail: boolean;
  studentEvaluations: any[];
  studentAssignments: any[];
  studentLocalNotes: any[];
  studentLocalGrades: any;
  studentLocalQuizzes: any[];
  logs: any[];
  loadingLogs: boolean;
  logUsers: any[];
  logActionTypes: string[];
  logStats: { total: number; todayCount: number };
  selectedLogUser: string;
  selectedLogRole: string;
  selectedLogAction: string;
  selectedLogTime: 'all' | 'today' | 'last7' | 'month';
  logSearch: string;
  exportingLogs: boolean;
  expandedLogId: string | null;
  logPurgeModalVisible: boolean;
  isPurgingLogs: boolean;
  menuDrawerVisible: boolean;
  licenseModalVisible: boolean;
  schoolSelectModalVisible: boolean;
  editModalVisible: boolean;
  editingSchoolObj: any;
  editSchoolName: string;
  editSchoolPhone: string;
  editSchoolAddress: string;
  editSchoolApiKey: string;
  editSchoolModel: string;
  editSchoolDailyHours: string;
  updatingSchool: boolean;
  deletingSchoolId: string | null;
  createModalVisible: boolean;
  newSchoolName: string;
  newSchoolPhone: string;
  newSchoolApiKey: string;
  newSchoolDailyHours: string;
  addTeacherModalVisible: boolean;
  teacherFullName: string;
  teacherBranch: string;
  teacherPhone: string;
  teacherEmail: string;
  addingTeacher: boolean;
  newTeacherRole: 'TEACHER' | 'STAFF';
  createdTeacherResult: any;
  editTeacherModalVisible: boolean;
  editingTeacher: any;
  addClassModalVisible: boolean;
  newClassGrade: string;
  newClassSection: string;
  addingClass: boolean;
  addLessonModalVisible: boolean;
  newLessonName: string;
  newLessonShortCode: string;
  newLessonGrade: string;
  newLessonHours: string;
  addingLesson: boolean;
  addStudentModalVisible: boolean;
  newStudentNo: string;
  newStudentName: string;
  newStudentGrade: string;
  newStudentSection: string;
  newStudentParentName: string;
  newStudentParentPhone: string;
  newStudentPhone: string;
  addingStudent: boolean;
  editStudentModalVisible: boolean;
  editingStudent: any;
  updatingStudent: boolean;
  credentialsModalVisible: boolean;
  selectedStudentForCreds: any;
  showCredPassword: boolean;
  showParentCredPassword: boolean;
  customResetPassInput: string;
  customParentResetPassInput: string;
  resettingPassword: boolean;
  resettingParentPassword: boolean;
  schedulePreOptionsModalVisible: boolean;
  pendingScheduleFile: any;
  optExtractTeachers: boolean;
  optExtractClasses: boolean;
  optExtractLessons: boolean;
  optExtractScheduleItems: boolean;
  optAutoHealBlocks: boolean;
  pdfTotalPages: number;
  pdfPageRangeMode: 'all' | 'half1' | 'half2' | 'custom';
  pdfStartPage: string;
  pdfEndPage: string;
  countingPdfPages: boolean;
  excelPreviewModalVisible: boolean;
  excelInspection: ExcelInspectionResult | null;
  selectedExcelSheet: string;
  scheduleSubView: 'editor' | 'analytics';
  conflictSearchQuery: string;
  analyticsSearchQuery: string;
  analyticsFilterType: 'all' | 'conflicts' | 'missing' | 'teachers' | 'courses';
  aiModalVisible: boolean;
  aiParsing: boolean;
  parsedSchedule: ParsedScheduleResult | null;
  aiStageText: string;
  aiElapsedSeconds: number;
  aiActiveModel: string;
  aiSaving: boolean;
  scheduleSaveMode: 'merge' | 'overwrite';
  saveTeachersChecked: boolean;
  saveClassesChecked: boolean;
  saveLessonsChecked: boolean;
  saveScheduleChecked: boolean;
  showTeachersList: boolean;
  showClassesList: boolean;
  showLessonsList: boolean;
  excludedTeachers: string[];
  excludedClasses: string[];
  excludedLessons: string[];
  scheduleBatches: ScheduleBatchItem[];
  batchPoolModalVisible: boolean;
  lastAnalyzedPageRange: { start: number; end: number } | undefined;
  cachedScheduleDoc: CachedScheduleDocInfo | null;
  cachedScheduleDraft: ParsedScheduleResult | null;
  reScanningTeacher: boolean;
  teacherRescanHint: string;
  inspectTeacherModalVisible: boolean;
  inspectingTeacher: string;
  inspectingVerification: TeacherScheduleVerification | null;
  inspectingItems: Array<{
    teacherName: string;
    grade: string;
    section: string;
    lessonName: string;
    lessonCode?: string;
    dayOfWeek: number;
    lessonHour: number;
    classroom?: string;
  }>;
  inspectDayTab: number;
  editingExpectedHours: boolean;
  tempExpectedHours: string;
  editingCellSlot: {
    originDayOfWeek?: number;
    originLessonHour?: number;
    dayOfWeek: number;
    lessonHour: number;
    grade: string;
    section: string;
    lessonName: string;
  } | null;
  excelModalVisible: boolean;
  excelParsing: boolean;
  excelSaving: boolean;
  parsedExcelStudents: ParsedExcelStudent[];
  detectedExcelClasses: string[];
  excelSchoolName: string | undefined;
  aiStudentModalVisible: boolean;
  aiStudentParsing: boolean;
  aiStudentSaving: boolean;
  aiStudentResult: AiStudentParseResult | null;
  teacherExcelModalVisible: boolean;
  teacherExcelParsing: boolean;
  teacherExcelSaving: boolean;
  parsedExcelTeachers: ParsedExcelTeacher[];
  adminCredentialsModalVisible: boolean;
  adminNewUsername: string;
  adminOldPassword: string;
  adminNewPassword: string;
  adminConfirmPassword: string;
  savingAdminCredentials: boolean;
  editLessonModalVisible: boolean;
  editingLesson: any;
  editLessonName: string;
  editLessonCode: string;
  editLessonGrade: string;
  editLessonHours: string;
  updatingLesson: boolean;
  schoolYearlyPlans: any[];
  yearlyPlanModalVisible: boolean;
  selectedLessonForPlan: any;
  docAnalysis: DocumentAnalysisResult | null;
  selectedMapping: ColumnMappingSelection;
  analyzingPlanFile: boolean;
  savingPlanRows: boolean;
  planSheetPickerVisible: boolean;
  planSheetPickerSheets: string[];
  planSheetPickerAsset: any;
  planSheetPickerLesson: any;
  viewPlanModalVisible: boolean;
  selectedLessonForViewPlan: any;
  viewPlanItems: any[];
  loadingViewPlan: boolean;
  planSearch: string;
  deletingPlan: boolean;
  selectedTeacherForSchedule: any;
  teacherScheduleItems: any[];
  loadingTeacherSchedule: boolean;
  teacherScheduleModalVisible: boolean;
  scheduleStats: any | null;
  loadingScheduleStats: boolean;
  scheduleDailyHours: number;
  filteredLessons: any[];
  scheduleEditorMode: 'class' | 'teacher';
  selectedClassForEditor: string;
  selectedTeacherForEditor: string;
  teacherListBoxSearch: string;
  allSchoolSchedules: any[];
  loadingAllSchedules: boolean;
  scheduleResetModalVisible: boolean;
  radarSubTab: 'teacher' | 'class' | 'free_teachers' | 'duty';
  radarTeacher: string;
  radarTeacherSearch: string;
  radarClass: string;
  radarClassModalVisible: boolean;
  radarClassSearch: string;
  radarClassGradeFilter: 'all' | '9' | '10' | '11' | '12';
  dutyPlacesModalVisible: boolean;
  customDutyPlaces: string[];
  newCustomPlaceInput: string;
  radarDay: number;
  radarHour: number;
  dutiesList: any[];
  loadingDuties: boolean;
  dutyFilterDay: number;
  addDutyModalVisible: boolean;
  newDutyTeacher: string;
  newDutyDay: number;
  newDutyPlace: string;
  newDutyNotes: string;
  savingDuty: boolean;
  importingDutyExcel: boolean;
  downloadingDutyTemplate: boolean;
  freeTeachersList: any[];
  slotModalVisible: boolean;
  editingSlotData: {
    id?: string;
    dayOfWeek: number;
    lessonHour: number;
    grade: string;
    section: string;
    teacherName: string;
    lessonName: string;
    lessonCode?: string;
    classroom?: string;
  } | null;
  savingSlot: boolean;
  slotLessonSearchQuery: string;
  slotTeacherSearchQuery: string;
  singleTeacherParsing: boolean;
  singleTeacherPreview: any | null;
  singleTeacherModalVisible: boolean;
  savingSingleTeacher: boolean;
  teacherLoginFilter: 'all' | 'logged_in' | 'not_logged_in';
  teacherSearchQuery: string;
  teacherSortOrder: 'asc' | 'desc';
  bulkPhotoModalVisible: boolean;
  bulkPhotoProgress: string;
  uploadingBulkPhotos: boolean;
  photoReviewModalVisible: boolean;
  reviewPhotos: PdfExtractedStudentPhoto[];
  reviewPageFilter: 'all' | number;
  reviewMatchFilter: 'all' | 'full' | 'number_only' | 'unmatched';
  reviewSearchQuery: string;
  savingReviewPhotos: boolean;
  cachedPdfAsset: any;
  cachedPdfPhotos: PdfExtractedStudentPhoto[];
  initialReviewPhotos: PdfExtractedStudentPhoto[];
  photoHistoryStack: PdfExtractedStudentPhoto[][];
  rescanningPage: boolean;
  studentPickerVisible: boolean;
  studentPickerTargetId: string | null;
  studentPickerSearch: string;
  photoPickerVisible: boolean;
  photoPickerTargetId: string | null;
  photoPickerSearch: string;
  singleStudentPdfModalVisible: boolean;
  singleStudentPdfTarget: any;
  singleStudentPdfSearch: string;
  singleStudentPdfUploading: boolean;
  exportingReportType: string | null;
  reportTeacherBranch: string;
  reportTeacherRole: string;
  reportTeacherActive: string;
  reportStudentGrade: string;
  reportStudentSection: string;
  reportStudentSearch: string;
  reportClassGrade: string;
  reportLessonGrade: string;
  reportLessonPlanStatus: 'all' | 'has_plan' | 'no_plan';
  reportScheduleTeacher: string;
  reportScheduleClass: string;
  reportScheduleDay: number;
  reportSelectedPlanLessonId: string;
  reportAuditUser: string;
  reportAuditRole: string;
  reportAuditAction: string;
  filteredReviewPhotos: any[];
  filteredPickerStudents: any[];
  autoReconciling: boolean;
  autoFillingGaps: boolean;
  slotConflictItems: any[];
  filteredSlotLessons: any[];
  filteredSlotTeachers: any[];
  filteredTeachers: any[];
  filteredStudents: any[];
  [key: string]: any;
}

export const HtmlSelect = 'select' as any;

export function generateDefaultTeacherUsername(fullName?: string): string {
  if (!fullName || !fullName.trim()) return 'ogretmen';
  const clean = fullName.trim().toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z\s]/g, ' ')
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ogretmen';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}.${parts[1]}`;
  const firstName = parts.slice(0, -1).join('');
  const lastName = parts[parts.length - 1];
  return `${firstName}.${lastName}`;
}

export const styles: Record<string, any> = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  classSelectContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classSelectHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  clearFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  clearFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  webSelectWrapper: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  webSelectIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
    pointerEvents: 'none',
  },
  webSelectBox: {
    width: '100%',
    height: 42,
    paddingLeft: 38,
    paddingRight: 16,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    outline: 'none',
    cursor: 'pointer',
  } as any,
  mobileSelectPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  mobileSelectPickerText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  classFilterModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  classFilterModalItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  classFilterModalItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  classFilterModalItemTextSelected: {
    fontWeight: '800',
    color: '#4F46E5',
  },
  fixedTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    minHeight: 46,
  },
  fixedBrandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  fixedBrandText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  scrollableHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  teacherUsernameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  teacherUsernameLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
    marginLeft: 3,
  },
  teacherUsernameValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E1B4B',
  },
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
  headerAdminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  headerAdminPillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#4338CA',
    maxWidth: 180,
  },
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
  // --- CANLI RADAR & NÖBET MODÜLÜ STİLLERİ ---
  radarContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  radarHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  radarSubTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  radarSubTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  radarSubTabBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  radarSubTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  radarSubTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  radarGridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  radarDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  radarDropdownIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarDropdownActionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  radarDropdownActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  radarTable: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  radarTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  radarTableHeadCell: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  radarTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  radarTableCell: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  radarCellOccupied: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    padding: 4,
    width: '100%',
    alignItems: 'center',
  },
  radarCellOccupiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  radarCellSubText: {
    fontSize: 9,
    color: '#6366F1',
    marginTop: 1,
  },
  radarCellEmpty: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  radarCellEmptyText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  radarDutyBadgeRed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  radarDutyBadgeRedText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
  },
  radarFreeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  radarFreeCardDuty: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  // Admin Öğrenci Detay Modalı Stilleri
  adminDetailProfileCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  adminDetailPhotoWrap: {
    position: 'relative',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  adminDetailBigPhoto: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  adminDetailBigPhotoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminDetailBigPhotoInitial: {
    fontSize: 34,
    fontWeight: '900',
    color: '#4F46E5',
  },
  adminDetailCameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#4F46E5',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  adminDetailNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  adminDetailBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
  },
  adminDetailTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminDetailTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  adminDetailContactBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 12,
  },
  adminDetailContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  adminDetailContactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  adminDetailContactValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  adminDetailContactDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  adminDetailMessagingRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  adminDetailMsgBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  adminDetailMsgBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  adminSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  adminSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  adminSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  adminSectionCountBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  adminSectionCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  adminDetailEmptyBox: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  adminDetailEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  adminObservationItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3.5,
    borderLeftColor: '#4F46E5',
    marginBottom: 8,
  },
  adminObservationTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 2,
  },
  adminObservationContent: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  adminObservationMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  adminObservationAuthor: {
    fontSize: 11,
    color: '#64748B',
  },
  adminObservationDate: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  adminGradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  adminGradeCell: {
    flex: 1,
    minWidth: 80,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminGradeCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  adminGradeCellValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  adminGradeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 8,
  },
  adminGradeSummaryItem: {
    alignItems: 'center',
  },
  adminGradeSummaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  adminGradeSummaryVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  adminGradeSummaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
  },
  adminQuizItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  adminQuizTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  adminQuizSub: {
    fontSize: 11,
    color: '#64748B',
  },
  adminQuizScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  adminQuizScoreText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
