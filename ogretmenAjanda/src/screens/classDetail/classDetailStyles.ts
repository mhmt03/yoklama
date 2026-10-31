import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../../theme/colors';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import {
  getStudentsByClass,
  getAllStudentsWithClass,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkCreateStudents,
  updateStudentPhoto,
  bulkUpdateStudentPhotos,
  clearStudentPhotosByClass,
  clearAllStudentPhotos,
  bulkDeleteStudents,
  deleteAllStudentsByClass,
  deleteAllStudentsGlobally,
  bulkTransferStudents,
} from '../../database/operations/studentOperations';
import { getClasses, deleteEntireClassWithAllData } from '../../database/operations/classOperations';
import { syncClassStudentsFromServer } from '../../services/studentSyncService';
import { getActiveSchool } from '../../database/operations/schoolOperations';
import { getActiveUserRole } from '../../utils/roleService';
import { getClassCounselorTeacher } from '../../utils/counselorService';
import { loadSchoolSnapshotFromStorage } from '../../services/schoolSnapshotService';
import {
  getNotesByStudent,
  createNote,
  deleteNote,
  updateNote,
  getStudentNoteCounts,
  getQuickNotes,
  QuickNoteItem,
} from '../../database/operations/noteOperations';
import * as Clipboard from 'expo-clipboard';
import { formatDateToTR, getCurrentDateTimeString } from '../../utils/dateUtils';
import {
  getClassNotes,
  createClassNote,
  updateClassNote,
  deleteClassNote,
} from '../../database/operations/classNoteOperations';
import {
  getCurrentActiveLessonSummary,
  CurrentLessonSummary,
} from '../../database/operations/scheduleOperations';
import {
  pickAndParseStudentsExcel,
  generateStudentTemplateExcel,
  exportClassStudentsToExcel,
  generateGradebookTemplateExcel,
  exportClassGradebookToExcel,
  pickAndParseGradebookExcel,
} from '../../utils/excelService';
import {
  getFullClassGradebook,
  saveStudentGrades,
  createQuiz,
  deleteQuiz,
  saveQuizScore,
} from '../../database/operations/gradeOperations';
import {
  pickSinglePhotoFromSource,
  savePhotoPermanently,
  pickBulkPhotosFromDevice,
  matchPhotosWithStudents,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTO_SIZE_LABEL,
  BulkPhotoMatchResult,
} from '../../utils/photoService';
import {
  extractPhotosFromPdf,
  PdfExtractedStudentPhoto,
} from '../../utils/pdfPhotoExtractor';
import { Student, ClassItem, StudentNote, StudentGradeRow, QuizItem, ClassNote } from '../../types';

export interface StateSetter {
  (updater: (prev: any) => any): void;
  (value: any): void;
}

export interface ClassDetailCtx {
  setStudents: StateSetter;
  setSearchQuery: StateSetter;
  setLoading: StateSetter;
  setSyncingServer: StateSetter;
  setIsSchoolTeacher: StateSetter;
  setModalVisible: StateSetter;
  setEditingStudent: StateSetter;
  setStudentNoInput: StateSetter;
  setFirstNameInput: StateSetter;
  setLastNameInput: StateSetter;
  setStudentPhoneInput: StateSetter;
  setParentNameInput: StateSetter;
  setParentPhoneInput: StateSetter;
  setNotesInput: StateSetter;
  setPhotoUriInput: StateSetter;
  setPhotoModalVisible: StateSetter;
  setPhotoTargetStudent: StateSetter;
  setBulkPhotoModalVisible: StateSetter;
  setBulkPhotoResult: StateSetter;
  setBulkPhotoSaving: StateSetter;
  setPdfPhotoModalVisible: StateSetter;
  setPdfExtracting: StateSetter;
  setPdfExtractItems: StateSetter;
  setSavingPdfPhotos: StateSetter;
  setPdfScope: StateSetter;
  setSinglePdfGridModalVisible: StateSetter;
  setSinglePdfGridPhotos: StateSetter;
  setSinglePdfLoading: StateSetter;
  setStudentSelectModalVisible: StateSetter;
  setStudentSelectTargetPhotoIndex: StateSetter;
  setStudentSelectSearchQuery: StateSetter;
  setDetailModalVisible: StateSetter;
  setDetailStudent: StateSetter;
  setClassCounselorTeacher: StateSetter;
  setDetailStudentIndex: StateSetter;
  setStudentNotesList: StateSetter;
  setQuickNotesList: StateSetter;
  setNewNoteText: StateSetter;
  setLoadingNotes: StateSetter;
  setSavingNote: StateSetter;
  setActiveLesson: StateSetter;
  setNoteCounts: StateSetter;
  setEditNoteModalVisible: StateSetter;
  setEditingNote: StateSetter;
  setEditingNoteText: StateSetter;
  setSavingEditNote: StateSetter;
  setSelectionMode: StateSetter;
  setSelectedStudentIds: StateSetter;
  setActionMenuVisible: StateSetter;
  setTransferModalVisible: StateSetter;
  setAvailableClasses: StateSetter;
  setSelectedTargetClassId: StateSetter;
  setActiveViewTab: StateSetter;
  setClassNotes: StateSetter;
  setLoadingClassNotes: StateSetter;
  setClassNoteSearchQuery: StateSetter;
  setClassNoteModalVisible: StateSetter;
  setEditingClassNote: StateSetter;
  setClassNoteInput: StateSetter;
  setClassNoteDateInput: StateSetter;
  setClassNoteLessonInput: StateSetter;
  setCurrentActiveLesson: StateSetter;
  setSavingClassNote: StateSetter;
  setActiveTerm: StateSetter;
  setGradebookData: StateSetter;
  setLoadingGradebook: StateSetter;
  setGradeSearchQuery: StateSetter;
  setQuizModalVisible: StateSetter;
  setQuizTitleInput: StateSetter;
  setSavingQuiz: StateSetter;
  setEditGradeModalVisible: StateSetter;
  setEditingGradeRow: StateSetter;
  setGradeInputs: StateSetter;
  setSavingSingleGrade: StateSetter;
  students: Student[];
  searchQuery: string;
  loading: boolean;
  syncingServer: boolean;
  isSchoolTeacher: boolean;
  modalVisible: boolean;
  editingStudent: Student | null;
  studentNoInput: string;
  firstNameInput: string;
  lastNameInput: string;
  studentPhoneInput: string;
  parentNameInput: string;
  parentPhoneInput: string;
  notesInput: string;
  photoUriInput: string | null;
  photoModalVisible: boolean;
  photoTargetStudent: Student | null;
  bulkPhotoModalVisible: boolean;
  bulkPhotoResult: BulkPhotoMatchResult | null;
  bulkPhotoSaving: boolean;
  pdfPhotoModalVisible: boolean;
  pdfExtracting: boolean;
  pdfExtractItems: PdfExtractedStudentPhoto[];
  savingPdfPhotos: boolean;
  pdfScope: 'class' | 'all';
  singlePdfGridModalVisible: boolean;
  singlePdfGridPhotos: PdfExtractedStudentPhoto[];
  singlePdfLoading: boolean;
  studentSelectModalVisible: boolean;
  studentSelectTargetPhotoIndex: number | null;
  studentSelectSearchQuery: string;
  detailModalVisible: boolean;
  detailStudent: Student | null;
  classCounselorTeacher: string;
  detailStudentIndex: number;
  studentNotesList: StudentNote[];
  quickNotesList: QuickNoteItem[];
  newNoteText: string;
  loadingNotes: boolean;
  savingNote: boolean;
  activeLesson: CurrentLessonSummary | null;
  noteCounts: Record<number, number>;
  editNoteModalVisible: boolean;
  editingNote: StudentNote | null;
  editingNoteText: string;
  savingEditNote: boolean;
  selectionMode: boolean;
  selectedStudentIds: number[];
  actionMenuVisible: boolean;
  transferModalVisible: boolean;
  availableClasses: ClassItem[];
  selectedTargetClassId: number | null;
  activeViewTab: 'students' | 'gradebook' | 'classNotes';
  classNotes: ClassNote[];
  loadingClassNotes: boolean;
  classNoteSearchQuery: string;
  classNoteModalVisible: boolean;
  editingClassNote: ClassNote | null;
  classNoteInput: string;
  classNoteDateInput: string;
  classNoteLessonInput: string;
  currentActiveLesson: CurrentLessonSummary | null;
  savingClassNote: boolean;
  activeTerm: 1 | 2;
  gradebookData: {
    students: StudentGradeRow[];
    quizzes: QuizItem[];
  };
  loadingGradebook: boolean;
  gradeSearchQuery: string;
  quizModalVisible: boolean;
  quizTitleInput: string;
  savingQuiz: boolean;
  editGradeModalVisible: boolean;
  editingGradeRow: StudentGradeRow | null;
  gradeInputs: {
    exam1: string;
    exam2: string;
    exam3: string;
    perf1: string;
    perf2: string;
    perf3: string;
    quizScores: Record<number, string>;
  };
  savingSingleGrade: boolean;
  [key: string]: any;
}

export const styles: Record<string, any> = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studentCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  studentCountBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  floatingActionPill: {
    position: 'absolute',
    bottom: 44,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30,
    gap: 8,
    ...Shadows.large,
    elevation: 8,
    zIndex: 99,
  },
  fabIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPillText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  actionModalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    ...Shadows.large,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  actionSheetSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionSheetCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  actionSheetContent: {
    gap: 10,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  actionSheetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetItemTextWrap: {
    flex: 1,
  },
  actionSheetItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  actionSheetItemDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  actionItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  actionItemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryMuted,
  },
  selectionCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: Colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primaryMuted,
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  selectionCountText: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
  selectionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  transferBtn: {
    backgroundColor: '#E0F2FE',
    borderColor: '#7DD3FC',
  },
  transferBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },
  closeSelectionBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  closeSelectionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 90,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  studentCard: {
    padding: 12,
    marginBottom: 8,
  },
  studentCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxTouch: {
    marginRight: 10,
    padding: 2,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImg: {
    width: 72,
    height: 90,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1.5,
    borderColor: Colors.border,
    resizeMode: 'cover',
  },
  numberBadge: {
    width: 72,
    height: 90,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    gap: 2,
  },
  numberText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  zoomIconBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  studentInfo: {
    flex: 1,
  },
  studentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  inlineNoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    gap: 3,
  },
  inlineNoteBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  studentSubInfo: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  studentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  opinionCountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    height: 32,
    borderRadius: 8,
    gap: 4,
  },
  opinionCountBtnActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  opinionCountBtnZero: {
    backgroundColor: Colors.cardSubtle,
  },
  opinionCountBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  opinionCountBtnTextActive: {
    color: '#B45309',
  },
  opinionCountBtnTextZero: {
    color: Colors.textMuted,
  },
  smallIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  photoActionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    margin: 20,
    padding: 20,
    alignSelf: 'center',
    width: '90%',
  },
  photoActionHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  photoActionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  photoActionSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  previewImageWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  previewAvatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  photoActionButtons: {
    gap: 8,
    marginTop: 6,
  },
  photoChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  photoChoiceText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  photoCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  photoCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  bulkStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bulkStatPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.cardSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bulkStatNum: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  bulkStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  oversizedWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    gap: 6,
  },
  oversizedWarningText: {
    flex: 1,
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  matchedScroll: {
    maxHeight: 220,
    marginBottom: 10,
  },
  matchItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  matchThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardSubtle,
  },
  matchStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  matchMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  emptyMatchText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 18,
  },
  classChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    backgroundColor: Colors.card,
  },
  classChoiceRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  classChoiceInfo: {
    flex: 1,
  },
  classChoiceName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  classChoiceSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // PDF Photo Import Modal Styles
  pdfBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  pdfBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 16,
  },
  pdfMatchScroll: {
    flex: 1,
    marginBottom: 12,
  },
  pdfMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  pdfMatchThumb: {
    width: 48,
    height: 60,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    resizeMode: 'cover',
  },
  pdfMatchInfo: {
    flex: 1,
  },
  pdfMatchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pdfOrderText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  matchedBadgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  matchedBadgeSuccessText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '700',
  },
  matchedBadgeWarning: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  matchedBadgeWarningText: {
    fontSize: 10,
    color: '#B45309',
    fontWeight: '700',
  },
  pdfMatchedStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  pdfUnmatchedText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  // Student Detail Modal Styles
  detailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  detailModalContainer: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailHeaderInfo: {
    flex: 1,
  },
  detailModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  detailModalSubTitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  detailModalCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: Colors.cardSubtle,
  },
  detailModalBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  detailStudentCard: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    alignItems: 'center',
    ...Shadows.small,
  },
  detailPhotoWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  detailPhotoTouchWrap: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.cardSubtle,
    borderWidth: 2,
    borderColor: Colors.border,
    ...Shadows.medium,
  },
  detailPhotoLarge: {
    width: 200,
    height: 255,
    borderRadius: 14,
    backgroundColor: Colors.cardSubtle,
  },
  detailPhotoPlaceholder: {
    width: 200,
    height: 255,
    borderRadius: 14,
    backgroundColor: Colors.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailPlaceholderNo: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  detailPhotoActionOverlay: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  detailPhotoActionOverlayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailStudentMetaUnder: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  detailStudentFullName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  detailBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailNumberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  detailNumberBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  detailClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  detailClassBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.successDark,
  },
  detailNotesCard: {
    width: '100%',
    backgroundColor: Colors.cardSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  detailNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  detailNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  detailNotesText: {
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 17,
  },
  detailSection: {
    marginBottom: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailSectionSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipButton: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipButtonText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  customNoteInputWrap: {
    marginTop: 4,
  },
  customNoteInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  emptyNotesBox: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyNotesText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  detailParentCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailParentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  detailParentTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  detailParentContent: {
    gap: 4,
    marginBottom: 10,
  },
  detailParentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  detailParentLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  detailParentValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    maxWidth: '65%',
    textAlign: 'right',
  },
  parentActionButtonsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  parentActionBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  parentActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noteItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    gap: 8,
  },
  noteItemContent: {
    flex: 1,
  },
  noteItemText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  noteItemDate: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  noteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  noteDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteLessonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  noteLessonBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  activeLessonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
    marginBottom: 6,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeLessonBannerText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
  },
  timeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
    marginBottom: 6,
  },
  timeBannerText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  noteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 2,
  },
  editNoteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteNoteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
    marginTop: 4,
    marginBottom: 40,
  },
  fullHistoryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Segment Switch
  segmentSwitchOuter: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  segmentSwitchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Student list header & in-list search
  studentListHeaderWrap: {
    marginBottom: 6,
  },
  searchRowInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },

  // Class Notes View Styles
  classNotesContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  classNotesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  addClassNoteTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 4,
    ...Shadows.small,
  },
  addClassNoteTopBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  classNotesListContent: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 40,
  },
  classNoteCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    ...Shadows.small,
  },
  classNoteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  classNoteMetaWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  classNoteDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  classNoteDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  classNoteLessonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 160,
  },
  classNoteLessonText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  classNoteCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  classNoteActionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classNoteBodyWrap: {
    marginTop: 2,
  },
  classNoteText: {
    fontSize: 13.5,
    color: Colors.textPrimary,
    lineHeight: 19.5,
    fontWeight: '500',
  },
  classNoteTextArea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13.5,
    color: Colors.textPrimary,
    minHeight: 100,
  },
  classNoteInputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  quickTemplateWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickTemplateChip: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickTemplateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primaryDark,
  },

  // Gradebook Container & Control Bar
  gradebookContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradebookControlBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  termSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSubtle,
    borderRadius: 8,
    padding: 3,
  },
  headerSyncBtn: {
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
  headerSyncBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  termBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  termBtnActive: {
    backgroundColor: Colors.primary,
  },
  termBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  termBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  gradeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gradeActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  gradeActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gradeActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  gradeActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  gradeActionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  gradeActionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Search & Summary
  gradeSearchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  gradeSearchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  gradeSearchTextInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    padding: 0,
  },
  gradebookSummaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  gradebookSummaryText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  gradebookHintText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Loading & Empty
  gradebookLoadingWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gradebookLoadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  gradebookEmptyWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gradebookEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  gradebookEmptySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Grade Table
  tableScrollX: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tableScrollY: {
    flex: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderBottomWidth: 2,
    borderBottomColor: '#94A3B8',
    minHeight: 40,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    minHeight: 44,
    backgroundColor: '#FFFFFF',
  },
  tableDataRowEven: {
    backgroundColor: '#EDF2F7', // Belirgin zebra zıtlığı (açık kontrastlı gri/mavi ton)
  },
  thCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  thCellClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    gap: 2,
    backgroundColor: '#DBEAFE',
  },
  thQuizTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    maxWidth: 55,
  },
  tdCell: {
    fontSize: 12,
    color: '#0F172A',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  tdNameWrap: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 8,
  },
  tdStudentName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Column Dimensions
  colNo: {
    width: 44,
  },
  colName: {
    width: 145,
  },
  colExam: {
    width: 46,
  },
  colPerf: {
    width: 46,
  },
  colQuiz: {
    width: 66,
  },
  colAvg: {
    width: 50,
  },
  colOverall: {
    width: 68,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cell Backgrounds
  bgExamAvg: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    fontWeight: '700',
  },
  bgPerfAvg: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    fontWeight: '700',
  },
  bgQuizAvg: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontWeight: '700',
  },

  // Score Typography & Badges
  textEmptyScore: {
    color: Colors.textMuted,
  },
  textNormalScore: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  textHighScore: {
    color: '#047857',
    fontWeight: '700',
  },
  textFailScore: {
    color: '#DC2626',
    fontWeight: '700',
  },
  textBold: {
    fontWeight: '700',
  },
  overallBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    minWidth: 42,
    alignItems: 'center',
  },
  badgePass: {
    backgroundColor: '#D1FAE5',
  },
  badgeFail: {
    backgroundColor: '#FEE2E2',
  },
  overallText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  textPass: {
    color: '#047857',
  },
  textFail: {
    color: '#DC2626',
  },

  // Detail Modal Grade Section
  detailGradeSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.cardSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailGradeEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
  },
  detailGradeEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  detailGradeGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  detailGradeBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
  },
  detailGradeBoxOverall: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  detailGradeBoxLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  detailGradeBoxLabelOverall: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 2,
  },
  detailGradeBoxVal: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailGradeBoxValOverall: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  detailGradeBoxSub: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Edit Grade Modal
  gradeModalSection: {
    marginBottom: 16,
    backgroundColor: Colors.cardSubtle,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  gradeModalSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  gradeModalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gradeModalInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeModalInputCol: {
    flex: 1,
  },
  gradeInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  gradeScoreInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.textPrimary,
  },
  noQuizHint: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  quizInputsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quizInputItem: {
    width: '48%',
  },
  quizModalHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  detailNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  detailNavBtnDisabled: {
    backgroundColor: Colors.cardSubtle,
    opacity: 0.5,
  },
});
