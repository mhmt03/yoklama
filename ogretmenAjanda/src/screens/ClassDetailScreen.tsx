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
import { Colors, Shadows } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
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
} from '../database/operations/studentOperations';
import { getClasses, deleteEntireClassWithAllData } from '../database/operations/classOperations';
import { syncClassStudentsFromServer } from '../services/studentSyncService';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getActiveUserRole } from '../utils/roleService';
import { getClassCounselorTeacher } from '../utils/counselorService';
import { loadSchoolSnapshotFromStorage } from '../services/schoolSnapshotService';
import {
  getNotesByStudent,
  createNote,
  deleteNote,
  updateNote,
  getStudentNoteCounts,
  getQuickNotes,
  QuickNoteItem,
} from '../database/operations/noteOperations';
import * as Clipboard from 'expo-clipboard';
import { formatDateToTR, getCurrentDateTimeString } from '../utils/dateUtils';
import {
  getClassNotes,
  createClassNote,
  updateClassNote,
  deleteClassNote,
} from '../database/operations/classNoteOperations';
import {
  getCurrentActiveLessonSummary,
  CurrentLessonSummary,
} from '../database/operations/scheduleOperations';
import {
  pickAndParseStudentsExcel,
  generateStudentTemplateExcel,
  exportClassStudentsToExcel,
  generateGradebookTemplateExcel,
  exportClassGradebookToExcel,
  pickAndParseGradebookExcel,
} from '../utils/excelService';
import {
  getFullClassGradebook,
  saveStudentGrades,
  createQuiz,
  deleteQuiz,
  saveQuizScore,
} from '../database/operations/gradeOperations';
import {
  pickSinglePhotoFromSource,
  savePhotoPermanently,
  pickBulkPhotosFromDevice,
  matchPhotosWithStudents,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTO_SIZE_LABEL,
  BulkPhotoMatchResult,
} from '../utils/photoService';
import {
  extractPhotosFromPdf,
  PdfExtractedStudentPhoto,
} from '../utils/pdfPhotoExtractor';
import { Student, ClassItem, StudentNote, StudentGradeRow, QuizItem, ClassNote } from '../types';
import { styles, ClassDetailCtx } from './classDetail/classDetailStyles';
import { StudentActionAndPhotoModals } from './classDetail/modals/StudentActionAndPhotoModals';
import { StudentDetailAndGradeModals } from './classDetail/modals/StudentDetailAndGradeModals';
import { createClassDetailHandlers } from './classDetail/classDetailHandlers';

export const ClassDetailScreen: React.FC = () => {
  const route = useRoute<any>();

  const navigation = useNavigation<any>();

  const { classId, className } = route.params;

  const insets = useSafeAreaInsets();

  const [students, setStudents] = useState<Student[]>([]);

  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);

  const [syncingServer, setSyncingServer] = useState(false);

  const [isSchoolTeacher, setIsSchoolTeacher] = useState(false);

  const getDisplayPhotoUri = (uri?: string | null): string | undefined => {
    if (!uri || !uri.trim()) return undefined;
    const clean = uri.trim();
    if (
      clean.startsWith('file://') ||
      clean.startsWith('data:image') ||
      clean.startsWith('http://') ||
      clean.startsWith('https://')
    ) {
      return clean;
    }
    return `http://ogretmenajanda.runasp.net${clean.startsWith('/') ? '' : '/'}${clean}`;
  };

  const [modalVisible, setModalVisible] = useState(false);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [studentNoInput, setStudentNoInput] = useState('');

  const [firstNameInput, setFirstNameInput] = useState('');

  const [lastNameInput, setLastNameInput] = useState('');

  const [studentPhoneInput, setStudentPhoneInput] = useState('');

  const [parentNameInput, setParentNameInput] = useState('');

  const [parentPhoneInput, setParentPhoneInput] = useState('');

  const [notesInput, setNotesInput] = useState('');

  const [photoUriInput, setPhotoUriInput] = useState<string | null>(null);

  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  const [photoTargetStudent, setPhotoTargetStudent] = useState<Student | null>(null);

  const [bulkPhotoModalVisible, setBulkPhotoModalVisible] = useState(false);

  const [bulkPhotoResult, setBulkPhotoResult] = useState<BulkPhotoMatchResult | null>(null);

  const [bulkPhotoSaving, setBulkPhotoSaving] = useState(false);

  const [pdfPhotoModalVisible, setPdfPhotoModalVisible] = useState(false);

  const [pdfExtracting, setPdfExtracting] = useState(false);

  const [pdfExtractItems, setPdfExtractItems] = useState<PdfExtractedStudentPhoto[]>([]);

  const [savingPdfPhotos, setSavingPdfPhotos] = useState(false);

  const [pdfScope, setPdfScope] = useState<'class' | 'all'>('class');

  const [singlePdfGridModalVisible, setSinglePdfGridModalVisible] = useState(false);

  const [singlePdfGridPhotos, setSinglePdfGridPhotos] = useState<PdfExtractedStudentPhoto[]>([]);

  const [singlePdfLoading, setSinglePdfLoading] = useState(false);

  const [studentSelectModalVisible, setStudentSelectModalVisible] = useState(false);

  const [studentSelectTargetPhotoIndex, setStudentSelectTargetPhotoIndex] = useState<number | null>(null);

  const [studentSelectSearchQuery, setStudentSelectSearchQuery] = useState('');

  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  const [classCounselorTeacher, setClassCounselorTeacher] = useState<string>('');

  const [detailStudentIndex, setDetailStudentIndex] = useState<number>(0);

  const [studentNotesList, setStudentNotesList] = useState<StudentNote[]>([]);

  const [quickNotesList, setQuickNotesList] = useState<QuickNoteItem[]>([]);

  const [newNoteText, setNewNoteText] = useState('');

  const [loadingNotes, setLoadingNotes] = useState(false);

  const [savingNote, setSavingNote] = useState(false);

  const [activeLesson, setActiveLesson] = useState<CurrentLessonSummary | null>(null);

  const [noteCounts, setNoteCounts] = useState<Record<number, number>>({});

  const [editNoteModalVisible, setEditNoteModalVisible] = useState(false);

  const [editingNote, setEditingNote] = useState<StudentNote | null>(null);

  const [editingNoteText, setEditingNoteText] = useState('');

  const [savingEditNote, setSavingEditNote] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);

  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  const [actionMenuVisible, setActionMenuVisible] = useState(false);

  const [transferModalVisible, setTransferModalVisible] = useState(false);

  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>([]);

  const [selectedTargetClassId, setSelectedTargetClassId] = useState<number | null>(null);

  const [activeViewTab, setActiveViewTab] = useState<'students' | 'gradebook' | 'classNotes'>('students');

  const [classNotes, setClassNotes] = useState<ClassNote[]>([]);

  const [loadingClassNotes, setLoadingClassNotes] = useState(false);

  const [classNoteSearchQuery, setClassNoteSearchQuery] = useState('');

  const [classNoteModalVisible, setClassNoteModalVisible] = useState(false);

  const [editingClassNote, setEditingClassNote] = useState<ClassNote | null>(null);

  const [classNoteInput, setClassNoteInput] = useState('');

  const [classNoteDateInput, setClassNoteDateInput] = useState('');

  const [classNoteLessonInput, setClassNoteLessonInput] = useState('');

  const [currentActiveLesson, setCurrentActiveLesson] = useState<CurrentLessonSummary | null>(null);

  const [savingClassNote, setSavingClassNote] = useState(false);

  const filteredClassNotes = classNotes.filter((item: any) => {
    if (!classNoteSearchQuery.trim()) return true;
    const q = classNoteSearchQuery.toLowerCase();
    return (
      item.note.toLowerCase().includes(q) ||
      (item.lesson_info && item.lesson_info.toLowerCase().includes(q)) ||
      (item.note_date && item.note_date.toLowerCase().includes(q))
    );
  });

  const [activeTerm, setActiveTerm] = useState<1 | 2>(1);

  const [gradebookData, setGradebookData] = useState<{
    students: StudentGradeRow[];
    quizzes: QuizItem[];
  }>({ students: [], quizzes: [] });

  const [loadingGradebook, setLoadingGradebook] = useState(false);

  const [gradeSearchQuery, setGradeSearchQuery] = useState('');

  const [quizModalVisible, setQuizModalVisible] = useState(false);

  const [quizTitleInput, setQuizTitleInput] = useState('');

  const [savingQuiz, setSavingQuiz] = useState(false);

  const [editGradeModalVisible, setEditGradeModalVisible] = useState(false);

  const [editingGradeRow, setEditingGradeRow] = useState<StudentGradeRow | null>(null);

  const [gradeInputs, setGradeInputs] = useState<{
    exam1: string;
    exam2: string;
    exam3: string;
    perf1: string;
    perf2: string;
    perf3: string;
    quizScores: Record<number, string>;
  }>({
    exam1: '',
    exam2: '',
    exam3: '',
    perf1: '',
    perf2: '',
    perf3: '',
    quizScores: {},
  });

  const [savingSingleGrade, setSavingSingleGrade] = useState(false);

  const filteredStudents = students.filter((s: any) => {
    const term = searchQuery.toLowerCase();
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
    const no = (s.student_number || '').toLowerCase();
    return fullName.includes(term) || no.includes(term);
  });

  const getScoreStyle = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return styles.textEmptyScore;
    if (val < 50) return styles.textFailScore;
    if (val >= 85) return styles.textHighScore;
    return styles.textNormalScore;
  };

  const ctx: ClassDetailCtx = {
    route,
    navigation,
    classId,
    className,
    insets,
    students,
    setStudents,
    searchQuery,
    setSearchQuery,
    loading,
    setLoading,
    syncingServer,
    setSyncingServer,
    isSchoolTeacher,
    setIsSchoolTeacher,
    getDisplayPhotoUri,
    modalVisible,
    setModalVisible,
    editingStudent,
    setEditingStudent,
    studentNoInput,
    setStudentNoInput,
    firstNameInput,
    setFirstNameInput,
    lastNameInput,
    setLastNameInput,
    studentPhoneInput,
    setStudentPhoneInput,
    parentNameInput,
    setParentNameInput,
    parentPhoneInput,
    setParentPhoneInput,
    notesInput,
    setNotesInput,
    photoUriInput,
    setPhotoUriInput,
    photoModalVisible,
    setPhotoModalVisible,
    photoTargetStudent,
    setPhotoTargetStudent,
    bulkPhotoModalVisible,
    setBulkPhotoModalVisible,
    bulkPhotoResult,
    setBulkPhotoResult,
    bulkPhotoSaving,
    setBulkPhotoSaving,
    pdfPhotoModalVisible,
    setPdfPhotoModalVisible,
    pdfExtracting,
    setPdfExtracting,
    pdfExtractItems,
    setPdfExtractItems,
    savingPdfPhotos,
    setSavingPdfPhotos,
    pdfScope,
    setPdfScope,
    singlePdfGridModalVisible,
    setSinglePdfGridModalVisible,
    singlePdfGridPhotos,
    setSinglePdfGridPhotos,
    singlePdfLoading,
    setSinglePdfLoading,
    studentSelectModalVisible,
    setStudentSelectModalVisible,
    studentSelectTargetPhotoIndex,
    setStudentSelectTargetPhotoIndex,
    studentSelectSearchQuery,
    setStudentSelectSearchQuery,
    detailModalVisible,
    setDetailModalVisible,
    detailStudent,
    setDetailStudent,
    classCounselorTeacher,
    setClassCounselorTeacher,
    detailStudentIndex,
    setDetailStudentIndex,
    studentNotesList,
    setStudentNotesList,
    quickNotesList,
    setQuickNotesList,
    newNoteText,
    setNewNoteText,
    loadingNotes,
    setLoadingNotes,
    savingNote,
    setSavingNote,
    activeLesson,
    setActiveLesson,
    noteCounts,
    setNoteCounts,
    editNoteModalVisible,
    setEditNoteModalVisible,
    editingNote,
    setEditingNote,
    editingNoteText,
    setEditingNoteText,
    savingEditNote,
    setSavingEditNote,
    selectionMode,
    setSelectionMode,
    selectedStudentIds,
    setSelectedStudentIds,
    actionMenuVisible,
    setActionMenuVisible,
    transferModalVisible,
    setTransferModalVisible,
    availableClasses,
    setAvailableClasses,
    selectedTargetClassId,
    setSelectedTargetClassId,
    activeViewTab,
    setActiveViewTab,
    classNotes,
    setClassNotes,
    loadingClassNotes,
    setLoadingClassNotes,
    classNoteSearchQuery,
    setClassNoteSearchQuery,
    classNoteModalVisible,
    setClassNoteModalVisible,
    editingClassNote,
    setEditingClassNote,
    classNoteInput,
    setClassNoteInput,
    classNoteDateInput,
    setClassNoteDateInput,
    classNoteLessonInput,
    setClassNoteLessonInput,
    currentActiveLesson,
    setCurrentActiveLesson,
    savingClassNote,
    setSavingClassNote,
    filteredClassNotes,
    activeTerm,
    setActiveTerm,
    gradebookData,
    setGradebookData,
    loadingGradebook,
    setLoadingGradebook,
    gradeSearchQuery,
    setGradeSearchQuery,
    quizModalVisible,
    setQuizModalVisible,
    quizTitleInput,
    setQuizTitleInput,
    savingQuiz,
    setSavingQuiz,
    editGradeModalVisible,
    setEditGradeModalVisible,
    editingGradeRow,
    setEditingGradeRow,
    gradeInputs,
    setGradeInputs,
    savingSingleGrade,
    setSavingSingleGrade,
    filteredStudents,
    getScoreStyle
  };

  Object.assign(ctx, createClassDetailHandlers(ctx));

  const {
    loadStudents,
    loadGradebook,
    loadClassNotes,
    handleChangeTerm,
    handleSyncStudentsFromServer,
    handleSelectAll,
    handleOpenTransferModal,
    handleBulkDelete,
    toggleSelectionMode,
    handleOpenAdd,
    toggleSelectStudent,
    handleOpenStudentDetail,
    handleOpenEdit,
    handleDeleteStudent,
    handleOpenAddQuiz,
    handleImportGradebookExcel,
    handleDownloadGradebookTemplate,
    handleDeleteQuizConfirm,
    handleOpenEditGrade,
    formatScore,
    handleOpenAddClassNote,
    handleCopyClassNote,
    handleOpenEditClassNote,
    handleDeleteClassNote
  } = ctx;

  useFocusEffect(
    useCallback(() => {
      loadStudents();
      loadGradebook();
      loadClassNotes();
    }, [classId, activeTerm])
  );

  return (
    <View style={styles.container}>
      <Header
        title={className}
        subtitle={`${students.length} Kayıtlı Öğrenci`}
        showBack
        onBack={() => navigation.goBack()}
        rightContent={
          activeViewTab === 'gradebook' ? (
            <View style={[styles.termSelector, { padding: 2 }]}>
              <TouchableOpacity
                style={[styles.termBtn, activeTerm === 1 && styles.termBtnActive, { paddingHorizontal: 10, paddingVertical: 5 }]}
                onPress={() => handleChangeTerm(1)}
              >
                <Text style={[styles.termBtnText, activeTerm === 1 && styles.termBtnTextActive, { fontSize: 11 }]}>
                  1. Dönem
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.termBtn, activeTerm === 2 && styles.termBtnActive, { paddingHorizontal: 10, paddingVertical: 5 }]}
                onPress={() => handleChangeTerm(2)}
              >
                <Text style={[styles.termBtnText, activeTerm === 2 && styles.termBtnTextActive, { fontSize: 11 }]}>
                  2. Dönem
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.headerSyncBtn}
              onPress={handleSyncStudentsFromServer}
              disabled={syncingServer}
              activeOpacity={0.8}
            >
              {syncingServer ? (
                <ActivityIndicator size="small" color="#4F46E5" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={15} color="#4F46E5" />
                  <Text style={styles.headerSyncBtnText}>Sistemden Çek</Text>
                </>
              )}
            </TouchableOpacity>
          )
        }
      />

      {/* View Segment Switch: Öğrenciler / Not Çizelgesi & Quizler / Sınıf Görüşü */}
      <View style={styles.segmentSwitchOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentSwitchContent}
        >
          <TouchableOpacity
            style={[styles.segmentBtn, activeViewTab === 'students' && styles.segmentBtnActive]}
            onPress={() => setActiveViewTab('students')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people"
              size={16}
              color={activeViewTab === 'students' ? '#FFFFFF' : Colors.textSecondary}
            />
            <Text
              style={[styles.segmentBtnText, activeViewTab === 'students' && styles.segmentBtnTextActive]}
            >
              Öğrenciler ({students.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeViewTab === 'gradebook' && styles.segmentBtnActive]}
            onPress={() => {
              setActiveViewTab('gradebook');
              loadGradebook();
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="calculator"
              size={16}
              color={activeViewTab === 'gradebook' ? '#FFFFFF' : Colors.textSecondary}
            />
            <Text
              style={[styles.segmentBtnText, activeViewTab === 'gradebook' && styles.segmentBtnTextActive]}
            >
              Not Çizelgesi & Quizler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeViewTab === 'classNotes' && styles.segmentBtnActive]}
            onPress={() => {
              setActiveViewTab('classNotes');
              loadClassNotes();
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="chatbox-ellipses"
              size={16}
              color={activeViewTab === 'classNotes' ? '#FFFFFF' : Colors.textSecondary}
            />
            <Text
              style={[styles.segmentBtnText, activeViewTab === 'classNotes' && styles.segmentBtnTextActive]}
            >
              Sınıf Görüşü {classNotes.length > 0 ? `(${classNotes.length})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {activeViewTab === 'students' && (
        <>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(item: any) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.studentListHeaderWrap}>
              {/* Selection Mode Toolbar (When Active) */}
              {selectionMode && (
                <View style={styles.selectionToolbar}>
                  <View style={styles.selectionCountWrap}>
                    <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllBtn}>
                      <Ionicons
                        name={
                          selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0
                            ? 'checkbox'
                            : 'square-outline'
                        }
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.selectAllText}>
                        {selectedStudentIds.length === filteredStudents.length ? 'Temizle' : 'Tümü'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.selectionCountText}>
                      <Text style={{ fontWeight: '800', color: Colors.primary }}>
                        {selectedStudentIds.length}
                      </Text>{' '}
                      seçili
                    </Text>
                  </View>

                  <View style={styles.selectionActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.selectionActionBtn,
                        styles.transferBtn,
                        selectedStudentIds.length === 0 && styles.btnDisabled,
                      ]}
                      disabled={selectedStudentIds.length === 0}
                      onPress={handleOpenTransferModal}
                    >
                      <Ionicons name="swap-horizontal" size={14} color="#0369A1" />
                      <Text style={styles.transferBtnText}>Şube Taşı</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.selectionActionBtn,
                        styles.deleteBtn,
                        selectedStudentIds.length === 0 && styles.btnDisabled,
                      ]}
                      disabled={selectedStudentIds.length === 0}
                      onPress={handleBulkDelete}
                    >
                      <Ionicons name="trash-outline" size={14} color="#B91C1C" />
                      <Text style={styles.deleteBtnText}>Sil</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.selectionActionBtn, styles.closeSelectionBtn]}
                      onPress={toggleSelectionMode}
                    >
                      <Ionicons name="close" size={14} color={Colors.textSecondary} />
                      <Text style={styles.closeSelectionBtnText}>Kapat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Search Bar & Counter - Scrolls with the list */}
              <View style={styles.searchRowInHeader}>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder="Öğrenci adı, soyadı veya no ile ara..."
                    icon="search"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onClear={() => setSearchQuery('')}
                    style={{ height: 40 }}
                  />
                </View>
                <View style={styles.studentCountBadge}>
                  <Text style={styles.studentCountBadgeText}>
                    {filteredStudents.length} / {students.length}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={
                searchQuery ? 'Aramayla Eşleşen Öğrenci Bulunamadı' : 'Bu Şubede Henüz Öğrenci Yok'
              }
              description={
                searchQuery
                  ? 'Farklı bir isim veya numara ile aramayı deneyin.'
                  : 'Manuel olarak öğrenci ekleyebilir veya Excel listenizi doğrudan yükleyebilirsiniz.'
              }
              actionTitle={searchQuery ? undefined : 'Yeni Öğrenci Ekle'}
              onAction={searchQuery ? undefined : handleOpenAdd}
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectedStudentIds.includes(item.id);

            return (
              <Card
                style={[styles.studentCard, isSelected && styles.studentCardSelected]}
              >
                <View style={styles.studentRow}>
                  {/* Selection Checkbox */}
                  {selectionMode && (
                    <TouchableOpacity
                      style={styles.checkboxTouch}
                      onPress={() => toggleSelectStudent(item.id)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? Colors.primary : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}

                  {/* Student Avatar / Photo - Large Portrait */}
                  <TouchableOpacity
                    style={styles.avatarWrap}
                    onPress={() => handleOpenStudentDetail(item)}
                    activeOpacity={0.8}
                  >
                    {getDisplayPhotoUri(item.photo_uri) ? (
                      <Image source={{ uri: getDisplayPhotoUri(item.photo_uri) }} style={styles.avatarImg} />
                    ) : (
                      <View style={styles.numberBadge}>
                        <Ionicons name="person" size={22} color={Colors.textMuted} />
                        <Text style={styles.numberText}>{item.student_number || '-'}</Text>
                      </View>
                    )}
                    <View style={styles.zoomIconBadge}>
                      <Ionicons name="expand" size={10} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.studentInfo}
                    onPress={() => handleOpenStudentDetail(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.studentNameRow}>
                      <Text style={styles.studentName}>
                        {item.first_name} {item.last_name}
                      </Text>
                      {(noteCounts[item.id] || 0) > 0 && (
                        <View style={styles.inlineNoteBadge}>
                          <Ionicons name="chatbubbles" size={10} color="#B45309" />
                          <Text style={styles.inlineNoteBadgeText}>
                            {noteCounts[item.id]}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.studentSubInfo}>
                      No: {item.student_number || '-'}
                      {(noteCounts[item.id] || 0) > 0 ? ` • ${noteCounts[item.id]} görüş` : ''}
                      {item.notes ? ` • ${item.notes}` : ''}
                    </Text>
                  </TouchableOpacity>

                  {!selectionMode && (
                    <View style={styles.studentActions}>
                      {/* Quick opinion / student detail modal */}
                      <TouchableOpacity
                        style={[
                          styles.opinionCountBtn,
                          (noteCounts[item.id] || 0) > 0
                            ? styles.opinionCountBtnActive
                            : styles.opinionCountBtnZero,
                        ]}
                        onPress={() => handleOpenStudentDetail(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="chatbox-ellipses"
                          size={14}
                          color={(noteCounts[item.id] || 0) > 0 ? '#B45309' : Colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.opinionCountBtnText,
                            (noteCounts[item.id] || 0) > 0
                              ? styles.opinionCountBtnTextActive
                              : styles.opinionCountBtnTextZero,
                          ]}
                        >
                          {noteCounts[item.id] || 0}
                        </Text>
                      </TouchableOpacity>

                      {/* Edit button */}
                      <TouchableOpacity
                        style={styles.smallIconBtn}
                        onPress={() => handleOpenEdit(item)}
                      >
                        <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      {/* Delete button */}
                      {!isSchoolTeacher && (
                        <TouchableOpacity
                          style={styles.smallIconBtn}
                          onPress={() => handleDeleteStudent(item)}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* Floating Action Button (FAB) */}
      {!selectionMode && (
        <TouchableOpacity
          style={styles.floatingActionPill}
          onPress={() => setActionMenuVisible(true)}
          activeOpacity={0.85}
        >
          {pdfExtracting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <View style={styles.fabIconCircle}>
                <Ionicons name="sparkles" size={17} color="#FFF" />
              </View>
              <Text style={styles.fabPillText}>İşlemler</Text>
            </>
          )}
        </TouchableOpacity>
      )}
        </>
      )}

      {/* Gradebook View */}
      {activeViewTab === 'gradebook' && (
        <View style={styles.gradebookContainer}>
          {/* Term Switcher & Gradebook Actions */}
          {/* Gradebook Actions */}
          <View style={[styles.gradebookControlBar, { justifyContent: 'flex-end' }]}>
            {/* Action Buttons */}
            <View style={styles.gradeActionsRow}>
              <TouchableOpacity
                style={styles.gradeActionBtnPrimary}
                onPress={handleOpenAddQuiz}
              >
                <Ionicons name="add-circle-outline" size={15} color="#FFFFFF" />
                <Text style={styles.gradeActionBtnPrimaryText}>+ Quiz</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gradeActionBtnSecondary}
                onPress={handleImportGradebookExcel}
              >
                <Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} />
                <Text style={styles.gradeActionBtnSecondaryText}>Excel Yükle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gradeActionBtnOutline}
                onPress={handleDownloadGradebookTemplate}
              >
                <Ionicons name="download-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.gradeActionBtnOutlineText}>Şablon</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gradeActionBtnOutline}
                onPress={() => navigation.navigate('ReportsTab')}
              >
                <Ionicons name="stats-chart-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.gradeActionBtnOutlineText}>Raporlar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search bar for gradebook */}
          <View style={styles.gradeSearchWrap}>
            <View style={styles.gradeSearchInput}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.gradeSearchTextInput}
                placeholder="Öğrenci adı veya no ile filtrele..."
                placeholderTextColor={Colors.textMuted}
                value={gradeSearchQuery}
                onChangeText={setGradeSearchQuery}
              />
              {gradeSearchQuery ? (
                <TouchableOpacity onPress={() => setGradeSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Gradebook Info & Hint */}
          <View style={styles.gradebookSummaryBar}>
            <Text style={styles.gradebookSummaryText}>
              <Text style={{ fontWeight: '700' }}>{gradebookData.students.length} Öğrenci</Text> •{' '}
              {gradebookData.quizzes.length} Quiz tanımlı
            </Text>
            <Text style={styles.gradebookHintText}>💡 Not düzenlemek için öğrenci satırına dokunun</Text>
          </View>

          {/* Gradebook Table */}
          {loadingGradebook ? (
            <View style={styles.gradebookLoadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.gradebookLoadingText}>Notlar yükleniyor...</Text>
            </View>
          ) : gradebookData.students.length === 0 ? (
            <View style={styles.gradebookEmptyWrap}>
              <Ionicons name="school-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.gradebookEmptyTitle}>Bu sınıfta henüz kayıtlı öğrenci yok</Text>
              <Text style={styles.gradebookEmptySub}>
                "Öğrenciler" sekmesinden öğrenci ekleyebilir veya Excel ile yükleyebilirsiniz.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScrollX}>
              <View>
                {/* Table Header Row */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.thCell, styles.colNo]}>No</Text>
                  <Text style={[styles.thCell, styles.colName]}>Öğrenci</Text>

                  {/* 3 Yazılı */}
                  <Text style={[styles.thCell, styles.colExam]}>1.Yaz</Text>
                  <Text style={[styles.thCell, styles.colExam]}>2.Yaz</Text>
                  <Text style={[styles.thCell, styles.colExam]}>3.Yaz</Text>
                  <Text style={[styles.thCell, styles.colAvg, styles.bgExamAvg]}>Y.Ort</Text>

                  {/* 3 Performans */}
                  <Text style={[styles.thCell, styles.colPerf]}>1.Perf</Text>
                  <Text style={[styles.thCell, styles.colPerf]}>2.Perf</Text>
                  <Text style={[styles.thCell, styles.colPerf]}>3.Perf</Text>
                  <Text style={[styles.thCell, styles.colAvg, styles.bgPerfAvg]}>P.Ort</Text>

                  {/* Dinamik Quiz Sütunları */}
                  {gradebookData.quizzes.map((q: any) => (
                    <TouchableOpacity
                      key={q.id}
                      style={[styles.thCellClickable, styles.colQuiz]}
                      onLongPress={() => handleDeleteQuizConfirm(q)}
                      onPress={() =>
                        Alert.alert(
                          q.title,
                          'Bu quizi silmek ister misiniz?',
                          [
                            { text: 'Vazgeç', style: 'cancel' },
                            {
                              text: 'Quizi Sil',
                              style: 'destructive',
                              onPress: () => handleDeleteQuizConfirm(q),
                            },
                          ]
                        )
                      }
                    >
                      <Text style={styles.thQuizTitle} numberOfLines={1}>
                        {q.title}
                      </Text>
                      <Ionicons name="close-circle-outline" size={12} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}

                  {/* Quiz Ort. */}
                  {gradebookData.quizzes.length > 0 && (
                    <Text style={[styles.thCell, styles.colAvg, styles.bgQuizAvg]}>Q.Ort</Text>
                  )}

                  {/* Genel Ortalama */}
                  <Text style={[styles.thCell, styles.colOverall]}>Ders Ort.</Text>
                </View>

                {/* Table Body */}
                <ScrollView style={styles.tableScrollY} showsVerticalScrollIndicator={true}>
                  {gradebookData.students
                    .filter((r: any) => {
                      if (!gradeSearchQuery.trim()) return true;
                      const term = gradeSearchQuery.toLowerCase();
                      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
                      const no = (r.student_number || '').toLowerCase();
                      return fullName.includes(term) || no.includes(term);
                    })
                    .map((row: any, index: any) => {
                      const isEven = index % 2 === 0;
                      return (
                        <TouchableOpacity
                          key={row.student_id}
                          style={[styles.tableDataRow, isEven && styles.tableDataRowEven]}
                          onPress={() => handleOpenEditGrade(row)}
                          activeOpacity={0.7}
                        >
                          {/* Student No */}
                          <Text style={[styles.tdCell, styles.colNo, styles.textBold, { fontSize: 10 }]}>
                            {row.student_number || '-'}
                          </Text>

                          {/* Student Name */}
                          <View style={[styles.tdCell, styles.colName, styles.tdNameWrap]}>
                            <Text style={[styles.tdStudentName, { fontSize: 10.5 }]} numberOfLines={1}>
                              {row.first_name} {row.last_name}
                            </Text>
                          </View>

                          {/* 1.Y, 2.Y, 3.Y */}
                          <Text style={[styles.tdCell, styles.colExam, getScoreStyle(row.exam1)]}>
                            {formatScore(row.exam1)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colExam, getScoreStyle(row.exam2)]}>
                            {formatScore(row.exam2)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colExam, getScoreStyle(row.exam3)]}>
                            {formatScore(row.exam3)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colAvg, styles.bgExamAvg, styles.textBold]}>
                            {formatScore(row.examAvg)}
                          </Text>

                          {/* 1.P, 2.P, 3.P */}
                          <Text style={[styles.tdCell, styles.colPerf, getScoreStyle(row.perf1)]}>
                            {formatScore(row.perf1)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colPerf, getScoreStyle(row.perf2)]}>
                            {formatScore(row.perf2)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colPerf, getScoreStyle(row.perf3)]}>
                            {formatScore(row.perf3)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colAvg, styles.bgPerfAvg, styles.textBold]}>
                            {formatScore(row.perfAvg)}
                          </Text>

                          {/* Dynamic Quizzes */}
                          {gradebookData.quizzes.map((q: any) => {
                            const qScore = row.quizScores[q.id];
                            return (
                              <Text
                                key={q.id}
                                style={[styles.tdCell, styles.colQuiz, getScoreStyle(qScore)]}
                              >
                                {formatScore(qScore)}
                              </Text>
                            );
                          })}

                          {/* Quiz Avg */}
                          {gradebookData.quizzes.length > 0 && (
                            <Text style={[styles.tdCell, styles.colAvg, styles.bgQuizAvg, styles.textBold]}>
                              {formatScore(row.quizAvg)}
                            </Text>
                          )}

                          {/* Overall Avg */}
                          <View style={[styles.tdCell, styles.colOverall]}>
                            <View
                              style={[
                                styles.overallBadge,
                                row.overallAvg !== null && row.overallAvg !== undefined
                                  ? row.overallAvg >= 50
                                    ? styles.badgePass
                                    : styles.badgeFail
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.overallText,
                                  row.overallAvg !== null && row.overallAvg !== undefined
                                    ? row.overallAvg >= 50
                                      ? styles.textPass
                                      : styles.textFail
                                    : null,
                                ]}
                              >
                                {formatScore(row.overallAvg)}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* 3. Class Notes View (Sınıf Görüşü) */}
      {activeViewTab === 'classNotes' && (
        <View style={styles.classNotesContainer}>
          {/* Top Bar: Search + Add Button */}
          <View style={styles.classNotesHeaderRow}>
            <View style={{ flex: 1 }}>
              <Input
                placeholder="Sınıf görüşlerinde ara..."
                icon="search"
                value={classNoteSearchQuery}
                onChangeText={setClassNoteSearchQuery}
                onClear={() => setClassNoteSearchQuery('')}
                style={{ height: 40 }}
              />
            </View>
            <TouchableOpacity
              style={styles.addClassNoteTopBtn}
              onPress={handleOpenAddClassNote}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.addClassNoteTopBtnText}>Görüş Ekle</Text>
            </TouchableOpacity>
          </View>

          {loadingClassNotes ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Görüşler yükleniyor...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredClassNotes}
              keyExtractor={(item: any) => item.id.toString()}
              contentContainerStyle={styles.classNotesListContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <EmptyState
                  icon="chatbox-ellipses-outline"
                  title={
                    classNoteSearchQuery
                      ? 'Aramayla Eşleşen Görüş Bulunamadı'
                      : 'Bu Şubeye Ait Henüz Görüş Yok'
                  }
                  description={
                    classNoteSearchQuery
                      ? 'Farklı bir kelime ile aramayı deneyebilirsiniz.'
                      : `${className} şubesi genelindeki ders disiplini, sınıf dinamikleri veya gözlemlerinizi ekleyebilirsiniz.`
                  }
                  actionTitle={classNoteSearchQuery ? undefined : 'Yeni Görüş Ekle'}
                  onAction={classNoteSearchQuery ? undefined : handleOpenAddClassNote}
                />
              }
              renderItem={({ item }) => (
                <Card style={styles.classNoteCard}>
                  {/* Top: Date, Lesson Info & Action Buttons */}
                  <View style={styles.classNoteCardHeader}>
                    <View style={styles.classNoteMetaWrap}>
                      <View style={styles.classNoteDateBadge}>
                        <Ionicons name="calendar-outline" size={12} color={Colors.primary} />
                        <Text style={styles.classNoteDateText}>
                          {formatDateToTR(item.note_date)}
                        </Text>
                      </View>

                      {item.lesson_info ? (
                        <View style={styles.classNoteLessonBadge}>
                          <Ionicons name="time-outline" size={11} color={Colors.primaryDark} />
                          <Text style={styles.classNoteLessonText} numberOfLines={1}>
                            {item.lesson_info}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Actions: Copy, Edit, Delete */}
                    <View style={styles.classNoteCardActions}>
                      <TouchableOpacity
                        style={styles.classNoteActionIconBtn}
                        onPress={() => handleCopyClassNote(item.note)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="copy-outline" size={15} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.classNoteActionIconBtn}
                        onPress={() => handleOpenEditClassNote(item)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="pencil" size={15} color={Colors.primary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.classNoteActionIconBtn}
                        onPress={() => handleDeleteClassNote(item)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Body: Note text */}
                  <View style={styles.classNoteBodyWrap}>
                    <Text style={styles.classNoteText} selectable={true}>
                      {item.note}
                    </Text>
                  </View>
                </Card>
              )}
            />
          )}
        </View>
      )}

      {/* Floating Action Menu Modal */}
      <StudentActionAndPhotoModals ctx={ctx} />
      <StudentDetailAndGradeModals ctx={ctx} />
    </View>
  );
};
