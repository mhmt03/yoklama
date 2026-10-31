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
import { ClassDetailCtx } from './classDetailStyles';

export function createClassDetailHandlers(ctx: ClassDetailCtx) {
  const {
    setLoadingClassNotes,
    classId,
    setClassNotes,
    setEditingClassNote,
    setClassNoteInput,
    setClassNoteDateInput,
    setCurrentActiveLesson,
    setClassNoteLessonInput,
    setClassNoteModalVisible,
    classNoteInput,
    setSavingClassNote,
    editingClassNote,
    classNoteDateInput,
    classNoteLessonInput,
    setNoteCounts,
    setLoading,
    setIsSchoolTeacher,
    className,
    setClassCounselorTeacher,
    setStudents,
    setSyncingServer,
    activeViewTab,
    navigation,
    activeTerm,
    setLoadingGradebook,
    setGradebookData,
    setActiveTerm,
    gradebookData,
    setQuizTitleInput,
    setQuizModalVisible,
    quizTitleInput,
    setSavingQuiz,
    setEditingGradeRow,
    setGradeInputs,
    setEditGradeModalVisible,
    editingGradeRow,
    setSavingSingleGrade,
    gradeInputs,
    students,
    isSchoolTeacher,
    setEditingStudent,
    setStudentNoInput,
    setFirstNameInput,
    setLastNameInput,
    setStudentPhoneInput,
    setParentNameInput,
    setParentPhoneInput,
    setNotesInput,
    setPhotoUriInput,
    setModalVisible,
    firstNameInput,
    studentNoInput,
    editingStudent,
    lastNameInput,
    notesInput,
    photoUriInput,
    studentPhoneInput,
    parentNameInput,
    parentPhoneInput,
    setPhotoTargetStudent,
    setPhotoModalVisible,
    photoTargetStudent,
    detailStudent,
    setDetailStudent,
    setSinglePdfLoading,
    setSinglePdfGridPhotos,
    setSinglePdfGridModalVisible,
    setBulkPhotoResult,
    setBulkPhotoModalVisible,
    bulkPhotoResult,
    setBulkPhotoSaving,
    setPdfScope,
    setPdfExtracting,
    setPdfExtractItems,
    setPdfPhotoModalVisible,
    pdfExtractItems,
    setSavingPdfPhotos,
    searchQuery,
    setDetailStudentIndex,
    setDetailModalVisible,
    setNewNoteText,
    setLoadingNotes,
    setStudentNotesList,
    setQuickNotesList,
    setActiveLesson,
    detailStudentIndex,
    studentNotesList,
    newNoteText,
    setSavingNote,
    activeLesson,
    setEditingNote,
    setEditingNoteText,
    setEditNoteModalVisible,
    editingNote,
    editingNoteText,
    setSavingEditNote,
    selectionMode,
    setSelectionMode,
    setSelectedStudentIds,
    selectedStudentIds,
    filteredStudents,
    setAvailableClasses,
    setSelectedTargetClassId,
    setTransferModalVisible,
    selectedTargetClassId,
    availableClasses
  } = ctx;

  const loadClassNotes = async () => {
    try {
      setLoadingClassNotes(true);
      const notes = await getClassNotes(classId);
      setClassNotes(notes);
    } catch (e) {
      console.error('Error loading class notes:', e);
    } finally {
      setLoadingClassNotes(false);
    }
  };

  const handleOpenAddClassNote = async () => {
    setEditingClassNote(null);
    setClassNoteInput('');
    setClassNoteDateInput(getCurrentDateTimeString());
    try {
      const active = await getCurrentActiveLessonSummary();
      setCurrentActiveLesson(active);
      if (active) {
        setClassNoteLessonInput(`${active.fullText} (${active.startTime} - ${active.endTime})`);
      } else {
        setClassNoteLessonInput('');
      }
    } catch {
      setCurrentActiveLesson(null);
      setClassNoteLessonInput('');
    }
    setClassNoteModalVisible(true);
  };

  const handleOpenEditClassNote = (item: ClassNote) => {
    setEditingClassNote(item);
    setClassNoteInput(item.note);
    setClassNoteDateInput(item.note_date);
    setClassNoteLessonInput(item.lesson_info || '');
    setClassNoteModalVisible(true);
  };

  const handleSaveClassNote = async () => {
    if (!classNoteInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen bir görüş metni giriniz.');
      return;
    }
    try {
      setSavingClassNote(true);
      if (editingClassNote) {
        await updateClassNote(
          editingClassNote.id,
          classNoteInput,
          classNoteDateInput.trim() || undefined,
          classNoteLessonInput.trim() || null
        );
      } else {
        await createClassNote(
          classId,
          classNoteInput,
          classNoteDateInput.trim() || undefined,
          classNoteLessonInput.trim() || null
        );
      }
      setClassNoteModalVisible(false);
      await loadClassNotes();
    } catch (e) {
      console.error('Error saving class note:', e);
      Alert.alert('Hata', 'Sınıf görüşü kaydedilirken bir hata oluştu.');
    } finally {
      setSavingClassNote(false);
    }
  };

  const handleDeleteClassNote = (item: ClassNote) => {
    Alert.alert(
      'Görüşü Sil',
      'Bu sınıf görüşünü silmek istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClassNote(item.id);
              await loadClassNotes();
            } catch (e) {
              console.error('Error deleting class note:', e);
              Alert.alert('Hata', 'Görüş silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleCopyClassNote = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı', 'Görüş panoya kopyalandı.');
  };

  const loadNoteCounts = async () => {
    try {
      const counts = await getStudentNoteCounts();
      setNoteCounts(counts);
    } catch (e) {
      console.error('Error loading note counts:', e);
    }
  };

  const loadStudents = async () => {
    try {
      setLoading(true);
      const [role, active] = await Promise.all([getActiveUserRole(), getActiveSchool()]);
      setIsSchoolTeacher(role === 'teacher' && !!active);

      if (active?.id) {
        try {
          const snap = await loadSchoolSnapshotFromStorage(String(active.id));
          if (snap) {
            const counselor = getClassCounselorTeacher(className, snap.teachers, snap.schedules);
            if (counselor) setClassCounselorTeacher(counselor);
          }
        } catch {}
      }

      const [data] = await Promise.all([
        getStudentsByClass(classId),
        loadNoteCounts(),
      ]);
      setStudents(data);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncStudentsFromServer = () => {
    Alert.alert(
      'Sistemden Öğrenci Çek',
      `"${className}" şubesinin öğrenci listesi okul sunucusundan çekilecek ve güncellenecektir.\n\n💡 Öğrencilerinize ait mevcut quiz puanları, notları ve görüşleriniz KORUNACAKTIR.\n\nİşlemi onaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çek ve Güncelle',
          onPress: async () => {
            setSyncingServer(true);
            try {
              const activeSchool = await getActiveSchool();
              const res = await syncClassStudentsFromServer(classId, className, activeSchool?.code);
              Alert.alert(res.success ? 'Başarılı 🎉' : 'Bilgi', res.message);
              if (res.success) {
                await loadStudents();
                if (activeViewTab === 'gradebook') {
                  await loadGradebook();
                }
              }
            } catch (e: any) {
              Alert.alert('Hata', e.message || 'Öğrenci çekme sırasında bir hata oluştu.');
            } finally {
              setSyncingServer(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteEntireClass = () => {
    Alert.alert(
      'Tüm Sınıfı Sil ⚠️',
      `"${className}" şubesini ve bu şubeye ait TÜM öğrencileri, görüşleri, notları, quizleri ve ödevleri cihazınızdan kalıcı olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tüm Sınıfı Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntireClassWithAllData(classId);
              Alert.alert('Silindi', `"${className}" şubesi ve tüm ilişkili veriler başarıyla silindi.`, [
                {
                  text: 'Tamam',
                  onPress: () => navigation.goBack(),
                },
              ]);
            } catch (error) {
              Alert.alert('Hata', 'Şube ve verileri silinirken bir sorun oluştu.');
            }
          },
        },
      ]
    );
  };

  const loadGradebook = async (termToLoad?: 1 | 2) => {
    const term = termToLoad || activeTerm;
    try {
      setLoadingGradebook(true);
      const data = await getFullClassGradebook(classId, term);
      setGradebookData(data);
    } catch (e) {
      console.error('Error loading gradebook:', e);
    } finally {
      setLoadingGradebook(false);
    }
  };

  const handleChangeTerm = (term: 1 | 2) => {
    setActiveTerm(term);
    loadGradebook(term);
  };

  const handleOpenAddQuiz = () => {
    const nextQuizNum = gradebookData.quizzes.length + 1;
    setQuizTitleInput(`Quiz ${nextQuizNum}`);
    setQuizModalVisible(true);
  };

  const handleSaveNewQuiz = async () => {
    if (!quizTitleInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen quiz başlığı giriniz.');
      return;
    }
    setSavingQuiz(true);
    try {
      await createQuiz(classId, activeTerm, quizTitleInput.trim());
      setQuizModalVisible(false);
      setQuizTitleInput('');
      await loadGradebook();
      Alert.alert('Başarılı', `"${quizTitleInput.trim()}" quizi başarıyla eklendi.`);
    } catch (e) {
      Alert.alert('Hata', 'Quiz eklenemedi.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleDeleteQuizConfirm = (quiz: QuizItem) => {
    Alert.alert(
      'Quiz Sil',
      `"${quiz.title}" quizini ve öğrencilerin bu quizdeki notlarını silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuiz(quiz.id);
              await loadGradebook();
            } catch (e) {
              Alert.alert('Hata', 'Quiz silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditGrade = (row: StudentGradeRow) => {
    setEditingGradeRow(row);
    const qs: Record<number, string> = {};
    for (const q of gradebookData.quizzes) {
      const val = row.quizScores[q.id];
      qs[q.id] = val !== null && val !== undefined ? String(val) : '';
    }
    setGradeInputs({
      exam1: row.exam1 !== null && row.exam1 !== undefined ? String(row.exam1) : '',
      exam2: row.exam2 !== null && row.exam2 !== undefined ? String(row.exam2) : '',
      exam3: row.exam3 !== null && row.exam3 !== undefined ? String(row.exam3) : '',
      perf1: row.perf1 !== null && row.perf1 !== undefined ? String(row.perf1) : '',
      perf2: row.perf2 !== null && row.perf2 !== undefined ? String(row.perf2) : '',
      perf3: row.perf3 !== null && row.perf3 !== undefined ? String(row.perf3) : '',
      quizScores: qs,
    });
    setEditGradeModalVisible(true);
  };

  const handleSaveSingleGrade = async () => {
    if (!editingGradeRow) return;

    const parseVal = (str: string): number | null => {
      const trimmed = str.trim().replace(',', '.');
      if (!trimmed) return null;
      const num = parseFloat(trimmed);
      if (isNaN(num)) return null;
      return Math.min(100, Math.max(0, Math.round(num * 10) / 10));
    };

    setSavingSingleGrade(true);
    try {
      await saveStudentGrades(editingGradeRow.student_id, classId, activeTerm, {
        exam1: parseVal(gradeInputs.exam1),
        exam2: parseVal(gradeInputs.exam2),
        exam3: parseVal(gradeInputs.exam3),
        perf1: parseVal(gradeInputs.perf1),
        perf2: parseVal(gradeInputs.perf2),
        perf3: parseVal(gradeInputs.perf3),
      });

      for (const q of gradebookData.quizzes) {
        const valStr = gradeInputs.quizScores[q.id];
        const valNum = valStr !== undefined ? parseVal(valStr) : null;
        await saveQuizScore(q.id, editingGradeRow.student_id, valNum);
      }

      setEditGradeModalVisible(false);
      await loadGradebook();
    } catch (e) {
      Alert.alert('Hata', 'Notlar kaydedilemedi.');
    } finally {
      setSavingSingleGrade(false);
    }
  };

  const handleDownloadGradebookTemplate = async () => {
    try {
      await generateGradebookTemplateExcel(
        className,
        activeTerm,
        students,
        gradebookData.quizzes
      );
    } catch (e) {
      Alert.alert('Hata', 'Not şablonu oluşturulamadı.');
    }
  };

  const handleExportGradebookExcel = async () => {
    try {
      await exportClassGradebookToExcel(className, activeTerm, gradebookData);
    } catch (e) {
      Alert.alert('Hata', 'Not çizelgesi Excel çıktısı oluşturulamadı.');
    }
  };

  const handleImportGradebookExcel = async () => {
    try {
      const res = await pickAndParseGradebookExcel(
        classId,
        activeTerm,
        students,
        gradebookData.quizzes
      );

      if (!res.success) {
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('Hata', res.error);
        }
        return;
      }

      await loadGradebook();
      let msg = `${res.updatedCount} öğrencinin ${activeTerm}. Dönem notları başarıyla güncellendi!`;
      if (res.newQuizzesCreated.length > 0) {
        msg += `\n\nOluşturulan yeni quizler: ${res.newQuizzesCreated.join(', ')}`;
      }
      Alert.alert('Başarılı 🎉', msg);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Excel not yüklemesi başarısız.');
    }
  };

  const handleOpenAdd = () => {
    if (isSchoolTeacher) {
      Alert.alert('Yetki Sınırı', 'Okul modundasınız: Öğrenci ekleme yetkisi yalnızca okul idaresindedir. Öğrenci listesi okul sunucusundan otomatik eşitlenir.');
      return;
    }
    setEditingStudent(null);
    setStudentNoInput('');
    setFirstNameInput('');
    setLastNameInput('');
    setStudentPhoneInput('');
    setParentNameInput('');
    setParentPhoneInput('');
    setNotesInput('');
    setPhotoUriInput(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (s: Student) => {
    if (isSchoolTeacher) {
      Alert.alert('Yetki Sınırı', 'Okul modundasınız: Öğrenci bilgileri ve fotoğrafı yalnızca okul idaresi tarafından düzenlenebilir.');
      return;
    }
    setEditingStudent(s);
    setStudentNoInput(s.student_number);
    setFirstNameInput(s.first_name);
    setLastNameInput(s.last_name);
    setStudentPhoneInput(s.student_phone || '');
    setParentNameInput(s.parent_name || '');
    setParentPhoneInput(s.parent_phone || '');
    setNotesInput(s.notes || '');
    setPhotoUriInput(s.photo_uri || null);
    setModalVisible(true);
  };

  const handleSaveStudent = async () => {
    if (!firstNameInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci adını giriniz.');
      return;
    }
    if (!studentNoInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci numarasını giriniz.');
      return;
    }

    try {
      if (editingStudent) {
        await updateStudent(
          editingStudent.id,
          studentNoInput,
          firstNameInput,
          lastNameInput,
          notesInput,
          photoUriInput,
          studentPhoneInput,
          parentNameInput,
          parentPhoneInput
        );
      } else {
        await createStudent(
          classId,
          studentNoInput,
          firstNameInput,
          lastNameInput,
          notesInput,
          photoUriInput,
          undefined,
          studentPhoneInput,
          parentNameInput,
          parentPhoneInput
        );
      }
      setModalVisible(false);
      loadStudents();
    } catch (error) {
      Alert.alert('Hata', 'Öğrenci kaydedilirken bir hata oluştu.');
    }
  };

  const handleDeleteStudent = (s: Student) => {
    if (isSchoolTeacher) {
      Alert.alert('Yetki Sınırı', 'Okul modundasınız: Öğrenci silme yetkisi yalnızca okul idaresindedir.');
      return;
    }
    Alert.alert(
      'Öğrenciyi Sil',
      `"${s.first_name} ${s.last_name}" öğrencisini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStudent(s.id);
              loadStudents();
            } catch (error) {
              Alert.alert('Hata', 'Öğrenci silinirken bir hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleOpenPhotoOptions = (student: Student) => {
    setPhotoTargetStudent(student);
    setPhotoModalVisible(true);
  };

  const handlePickSinglePhoto = async (source: 'camera' | 'gallery') => {
    if (!photoTargetStudent) return;
    try {
      const picked = await pickSinglePhotoFromSource(source);
      if (!picked) return;

      // Check max size
      if (picked.size > MAX_PHOTO_SIZE_BYTES) {
        Alert.alert(
          'Boyut Hatası',
          `Seçilen fotoğraf boyutu ${MAX_PHOTO_SIZE_LABEL}'den büyük (${(
            picked.size /
            (1024 * 1024)
          ).toFixed(1)} MB). Lütfen daha küçük bir fotoğraf seçiniz.`
        );
        return;
      }

      // Save permanently to document directory
      const permanentUri = await savePhotoPermanently(
        picked.uri,
        photoTargetStudent.student_number || photoTargetStudent.id
      );

      // Save to DB
      await updateStudentPhoto(photoTargetStudent.id, permanentUri);
      if (detailStudent && detailStudent.id === photoTargetStudent.id) {
        setDetailStudent({ ...detailStudent, photo_uri: permanentUri });
      }
      setPhotoModalVisible(false);
      loadStudents();
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Fotoğraf seçilemedi.');
    }
  };

  const handleRemovePhoto = async () => {
    if (!photoTargetStudent) return;
    try {
      await updateStudentPhoto(photoTargetStudent.id, null);
      if (detailStudent && detailStudent.id === photoTargetStudent.id) {
        setDetailStudent({ ...detailStudent, photo_uri: undefined });
      }
      setPhotoModalVisible(false);
      loadStudents();
    } catch (error) {
      Alert.alert('Hata', 'Fotoğraf kaldırılamadı.');
    }
  };

  const handlePickSinglePhotoFromPdf = async () => {
    if (!photoTargetStudent) return;
    setPhotoModalVisible(false);
    try {
      setSinglePdfLoading(true);
      const res = await extractPhotosFromPdf(students);
      if (!res.success) {
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('Hata', res.error);
        }
        return;
      }
      if (res.extractedPhotos.length === 0) {
        Alert.alert('Bilgi', 'PDF içinde fotoğraf bulunamadı.');
        return;
      }
      setSinglePdfGridPhotos(res.extractedPhotos);
      setSinglePdfGridModalVisible(true);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'PDF işlenirken bir hata oluştu.');
    } finally {
      setSinglePdfLoading(false);
    }
  };

  const handleSelectPhotoFromPdfForStudent = async (photo: PdfExtractedStudentPhoto) => {
    if (!photoTargetStudent) return;
    try {
      const permanentUri = await savePhotoPermanently(
        photo.tempUri,
        photoTargetStudent.student_number || photoTargetStudent.id
      );
      await updateStudentPhoto(photoTargetStudent.id, permanentUri);
      if (detailStudent && detailStudent.id === photoTargetStudent.id) {
        setDetailStudent({ ...detailStudent, photo_uri: permanentUri });
      }
      setSinglePdfGridModalVisible(false);
      setSinglePdfGridPhotos([]);
      loadStudents();
      Alert.alert('Başarılı', `${photoTargetStudent.first_name} ${photoTargetStudent.last_name} için fotoğraf PDF'ten kaydedildi.`);
    } catch (e) {
      Alert.alert('Hata', 'Fotoğraf kaydedilemedi.');
    }
  };

  const handleStartBulkPhoto = async () => {
    try {
      setLoading(true);
      const files = await pickBulkPhotosFromDevice();
      if (files.length === 0) {
        setLoading(false);
        return;
      }

      const matchResult = await matchPhotosWithStudents(files, students);
      setBulkPhotoResult(matchResult);
      setBulkPhotoModalVisible(true);
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Fotoğraflar seçilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBulkPhotos = async () => {
    if (!bulkPhotoResult || bulkPhotoResult.matched.length === 0) return;
    try {
      setBulkPhotoSaving(true);
      const dbMatches: { studentId: number; photoUri: string }[] = [];

      for (const item of bulkPhotoResult.matched) {
        const permanentUri = await savePhotoPermanently(
          item.fileUri,
          item.student.student_number || item.student.id
        );
        dbMatches.push({
          studentId: item.student.id,
          photoUri: permanentUri,
        });
      }

      await bulkUpdateStudentPhotos(dbMatches);
      setBulkPhotoModalVisible(false);
      loadStudents();
      Alert.alert(
        'Başarılı',
        `${dbMatches.length} öğrencinin fotoğrafı başarıyla yüklendi ve numaralarına göre eşleştirildi.`
      );
    } catch (error) {
      Alert.alert('Hata', 'Fotoğraflar kaydedilirken bir hata oluştu.');
    } finally {
      setBulkPhotoSaving(false);
    }
  };

  const handleStartPdfPhoto = () => {
    Alert.alert(
      'PDF\'ten Fotoğraf Aktar',
      'Hangi öğrenciler için eşleştirme yapılsın?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sadece Bu Sınıf',
          onPress: () => {
            setPdfScope('class');
            runPdfExtraction('class');
          },
        },
        {
          text: 'Tüm Öğrenciler',
          onPress: () => {
            setPdfScope('all');
            runPdfExtraction('all');
          },
        },
      ]
    );
  };

  const handleClearClassPhotos = () => {
    Alert.alert(
      'Sınıf Fotoğraflarını Sil',
      `"${className}" sınıfındaki tüm öğrencilerin fotoğraflarını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearStudentPhotosByClass(classId);
              await loadStudents();
              Alert.alert('Başarılı', `"${className}" sınıfındaki tüm öğrenci fotoğrafları silindi.`);
            } catch (e) {
              Alert.alert('Hata', 'Fotoğraflar silinirken bir hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleClearAllPhotos = () => {
    Alert.alert(
      'Tüm Fotoğrafları Sil',
      'Sistemdeki TÜM sınıflara ait TÜM öğrenci fotoğraflarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tüm Sistemdeki Fotoğrafları Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllStudentPhotos();
              await loadStudents();
              Alert.alert('Başarılı', 'Sistemdeki tüm öğrenci fotoğrafları başarıyla temizlendi.');
            } catch (e) {
              Alert.alert('Hata', 'Fotoğraflar silinirken bir hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllClassStudents = () => {
    if (students.length === 0) {
      Alert.alert('Bilgi', `"${className}" sınıfında silinecek öğrenci bulunmuyor.`);
      return;
    }
    Alert.alert(
      'Sınıfın Tüm Öğrencilerini Sil',
      `"${className}" sınıfındaki ${students.length} öğrencinin tamamını silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve öğrencilere ait ödev/not verileri de silinecektir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tüm Öğrencileri Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllStudentsByClass(classId);
              await loadStudents();
              Alert.alert('Başarılı', `"${className}" sınıfındaki tüm öğrenciler silindi.`);
            } catch (e) {
              Alert.alert('Hata', 'Öğrenciler silinirken bir hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllSystemStudents = () => {
    Alert.alert(
      'Sistemdeki TÜM Öğrencileri Sil',
      'DİKKAT! Tüm sınıflardaki TÜM öğrencileri ve bu öğrencilere ait tüm ödev/not verilerini kalıcı olarak silmek üzeresiniz. Bu işlem GERİ ALINAMAZ!',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'EVET, TÜM SİSTEMİ SİL',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllStudentsGlobally();
              await loadStudents();
              Alert.alert('Başarılı', 'Sistemdeki tüm öğrenciler ve verileri silindi.');
            } catch (e) {
              Alert.alert('Hata', 'Tüm öğrenciler silinirken bir hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const runPdfExtraction = async (scope: 'class' | 'all') => {
    try {
      setPdfExtracting(true);
      let targetStudents: Student[] = students;
      if (scope === 'all') {
        const all = await getAllStudentsWithClass();
        targetStudents = all.map((s: any) => ({
          id: s.id,
          class_id: s.class_id,
          student_number: s.student_number,
          first_name: s.first_name,
          last_name: s.last_name,
          notes: s.notes,
          photo_uri: s.photo_uri,
          created_at: s.created_at,
          class_name: s.class_name,
        } as any));
      }
      if (targetStudents.length === 0) {
        Alert.alert('Bilgi', 'Eşleştirilecek öğrenci bulunamadı.');
        return;
      }
      const res = await extractPhotosFromPdf(targetStudents);
      if (!res.success) {
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('Hata', res.error);
        }
        return;
      }
      if (res.extractedPhotos.length === 0) {
        Alert.alert('Bilgi', 'PDF içinde uygun vesikalık fotoğraf bulunamadı.');
        return;
      }
      setPdfExtractItems(res.extractedPhotos);
      setPdfPhotoModalVisible(true);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'PDF işlenemedi.');
    } finally {
      setPdfExtracting(false);
    }
  };

  const handleConfirmSavePdfPhotos = async () => {
    const toSave = pdfExtractItems.filter((item: any) => item.matchedStudent !== null);
    if (toSave.length === 0) {
      Alert.alert('Uyarı', 'Eşleşen öğrenci bulunamadı.');
      return;
    }
    setSavingPdfPhotos(true);
    try {
      let savedCount = 0;
      for (const item of toSave) {
        if (!item.matchedStudent) continue;
        const permanentUri = await savePhotoPermanently(
          item.tempUri,
          item.matchedStudent.student_number || item.matchedStudent.id
        );
        await updateStudentPhoto(item.matchedStudent.id, permanentUri);
        savedCount++;
      }
      setPdfPhotoModalVisible(false);
      setPdfExtractItems([]);
      loadStudents();
      Alert.alert(
        'Başarılı 🎉',
        `PDF'ten toplam ${savedCount} öğrenci fotoğrafı başarıyla yüklendi ve öğrencilere atandı!`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Fotoğraflar kaydedilirken bir hata oluştu.');
    } finally {
      setSavingPdfPhotos(false);
    }
  };

  const handleUpdatePdfMatchStudent = (index: number, student: Student | null) => {
    setPdfExtractItems((prev: any) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], matchedStudent: student };
      return copy;
    });
  };

  const handleOpenStudentDetail = async (student: Student) => {
    const filteredStudents = students.filter((s: any) =>
      searchQuery
        ? (s.first_name + ' ' + s.last_name).toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.student_number || '').toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );
    const idx = filteredStudents.findIndex((s: any) => s.id === student.id);
    setDetailStudentIndex(idx >= 0 ? idx : 0);
    setDetailStudent(student);
    setDetailModalVisible(true);
    setNewNoteText('');
    setLoadingNotes(true);
    try {
      const [notes, quicks, currentSched] = await Promise.all([
        getNotesByStudent(student.id),
        getQuickNotes(),
        getCurrentActiveLessonSummary(),
      ]);
      setStudentNotesList(notes);
      setQuickNotesList(quicks);
      setActiveLesson(currentSched);
    } catch (e) {
      console.error('Error loading student detail:', e);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleNavigateDetailStudent = async (direction: 'prev' | 'next') => {
    const filteredStudents = students.filter((s: any) =>
      searchQuery
        ? (s.first_name + ' ' + s.last_name).toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.student_number || '').toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );
    const newIdx =
      direction === 'next'
        ? Math.min(detailStudentIndex + 1, filteredStudents.length - 1)
        : Math.max(detailStudentIndex - 1, 0);
    const nextStudent = filteredStudents[newIdx];
    if (!nextStudent) return;
    setDetailStudentIndex(newIdx);
    setDetailStudent(nextStudent);
    setNewNoteText('');
    setLoadingNotes(true);
    try {
      const [notes, quicks, currentSched] = await Promise.all([
        getNotesByStudent(nextStudent.id),
        getQuickNotes(),
        getCurrentActiveLessonSummary(),
      ]);
      setStudentNotesList(notes);
      setQuickNotesList(quicks);
      setActiveLesson(currentSched);
    } catch (e) {
      console.error('Error loading student detail:', e);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleSendParentMessage = async (type: 'direct' | 'notes' | 'grades' | 'call') => {
    if (!detailStudent) return;
    const phone = detailStudent.parent_phone?.trim();
    if (!phone && type !== 'direct') {
      Alert.alert(
        'Veli Telefonu Yok',
        'Bu öğrencinin veli telefon numarası kayıtlı değil. Lütfen önce öğrenci bilgilerini düzenleyerek veli telefonunu giriniz.'
      );
      return;
    }

    if (type === 'call') {
      if (phone) {
        Linking.openURL(`tel:${phone}`);
      }
      return;
    }

    const stdFullName = `${detailStudent.first_name} ${detailStudent.last_name}`;
    let messageText = '';

    if (type === 'notes') {
      const recentNotes = studentNotesList.slice(0, 5);
      if (recentNotes.length === 0) {
        Alert.alert('Bilgi', 'Bu öğrenci için henüz kayıtlı bir öğretmen görüşü bulunmuyor.');
        return;
      }
      const notesFormatted = recentNotes
        .map(
          (n: any, i: any) =>
            `${i + 1}. ${n.note} (${formatDateToTR(n.note_date || n.created_at)}${
              n.lesson_info ? ' - ' + n.lesson_info : ''
            })`
        )
        .join('\n');

      messageText = `Sayın Velimiz,\n\nÖğrencimiz ${stdFullName} (${className} - No: ${
        detailStudent.student_number || '-'
      }) hakkında öğretmen ders içi gözlem ve görüşleri aşağıdadır:\n\n${notesFormatted}\n\nBilgilerinize sunar, başarılar dileriz.`;
    } else if (type === 'grades') {
      const currentGradeRow = gradebookData.students.find(
        (r: any) => r.student_id === detailStudent.id
      );
      if (!currentGradeRow) {
        Alert.alert('Bilgi', 'Öğrencinin kayıtlı sınav ve ders notu bulunamadı.');
        return;
      }

      messageText =
        `Sayın Velimiz,\n\nÖğrencimiz ${stdFullName} (${className} - No: ${
          detailStudent.student_number || '-'
        }) ${activeTerm}. dönem ders not durum bilgisi:\n\n` +
        `📝 Yazılı Sınavlar: ${currentGradeRow.exam1 ?? '-'} / ${currentGradeRow.exam2 ?? '-'} / ${
          currentGradeRow.exam3 ?? '-'
        } (Ort: ${currentGradeRow.examAvg ?? '-'})\n` +
        `⭐ Performans Notları: ${currentGradeRow.perf1 ?? '-'} / ${currentGradeRow.perf2 ?? '-'} / ${
          currentGradeRow.perf3 ?? '-'
        } (Ort: ${currentGradeRow.perfAvg ?? '-'})\n` +
        `🎯 Quiz Ortalaması: ${currentGradeRow.quizAvg ?? '-'}\n` +
        `🏆 Genel Not Ortalaması: ${currentGradeRow.overallAvg ?? '-'}\n\n` +
        `Bilgilerinize sunarız.`;
    } else {
      // Direct
      messageText = `Sayın Velimiz,\n\nÖğrencimiz ${stdFullName} (${className} - No: ${
        detailStudent.student_number || '-'
      }) hakkında bilgilendirmedir: `;
    }

    let cleanedPhone = (phone || '').replace(/[^0-9]/g, '');
    if (cleanedPhone.startsWith('0')) {
      cleanedPhone = '9' + cleanedPhone;
    } else if (!cleanedPhone.startsWith('90') && cleanedPhone.length === 10) {
      cleanedPhone = '90' + cleanedPhone;
    }

    const encodedMsg = encodeURIComponent(messageText);

    Alert.alert(
      'Veliye İletişim',
      `Mesaj veli numarasına (${phone || 'Numara yok'}) yönlendirilecektir. Hangi yöntemle göndermek istersiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '📱 WhatsApp ile Gönder',
          onPress: async () => {
            const waUrl = cleanedPhone
              ? `whatsapp://send?phone=${cleanedPhone}&text=${encodedMsg}`
              : `whatsapp://send?text=${encodedMsg}`;
            try {
              const supported = await Linking.canOpenURL(waUrl);
              if (supported) {
                await Linking.openURL(waUrl);
              } else {
                const webWaUrl = cleanedPhone
                  ? `https://wa.me/${cleanedPhone}?text=${encodedMsg}`
                  : `https://wa.me/?text=${encodedMsg}`;
                await Linking.openURL(webWaUrl);
              }
            } catch (err) {
              const webWaUrl = cleanedPhone
                ? `https://wa.me/${cleanedPhone}?text=${encodedMsg}`
                : `https://wa.me/?text=${encodedMsg}`;
              await Linking.openURL(webWaUrl);
            }
          },
        },
        {
          text: '✉️ Normal SMS ile Gönder',
          onPress: async () => {
            const smsUrl = cleanedPhone
              ? Platform.OS === 'ios'
                ? `sms:${phone}&body=${encodedMsg}`
                : `sms:${phone}?body=${encodedMsg}`
              : `sms:?body=${encodedMsg}`;
            await Linking.openURL(smsUrl);
          },
        },
      ]
    );
  };

  const handleAddNoteFromDetail = async (textToAdd?: string) => {
    const text = (textToAdd || newNoteText).trim();
    if (!text || !detailStudent) return;
    setSavingNote(true);
    try {
      const lessonInfoToSave = activeLesson
        ? `${activeLesson.fullText} (${activeLesson.startTime} - ${activeLesson.endTime})`
        : null;
      await createNote(detailStudent.id, classId, text, undefined, lessonInfoToSave);
      setNewNoteText('');
      const updatedNotes = await getNotesByStudent(detailStudent.id);
      setStudentNotesList(updatedNotes);
      await loadNoteCounts();
    } catch (e) {
      Alert.alert('Hata', 'Görüş kaydedilemedi.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleOpenEditNote = (n: StudentNote) => {
    setEditingNote(n);
    setEditingNoteText(n.note);
    setEditNoteModalVisible(true);
  };

  const handleSaveEditNote = async () => {
    if (!editingNote || !editingNoteText.trim() || !detailStudent) return;
    setSavingEditNote(true);
    try {
      await updateNote(editingNote.id, editingNoteText.trim());
      setEditNoteModalVisible(false);
      setEditingNote(null);
      setEditingNoteText('');
      const updatedNotes = await getNotesByStudent(detailStudent.id);
      setStudentNotesList(updatedNotes);
      await loadNoteCounts();
    } catch (e) {
      Alert.alert('Hata', 'Görüş güncellenemedi.');
    } finally {
      setSavingEditNote(false);
    }
  };

  const handleDeleteNoteFromDetail = async (noteId: number) => {
    if (!detailStudent) return;
    Alert.alert('Görüşü Sil', 'Bu görüş kaydını silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote(noteId);
            const updatedNotes = await getNotesByStudent(detailStudent.id);
            setStudentNotesList(updatedNotes);
            await loadNoteCounts();
          } catch (e) {
            Alert.alert('Hata', 'Görüş silinemedi.');
          }
        },
      },
    ]);
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedStudentIds([]);
    } else {
      setSelectionMode(true);
      setSelectedStudentIds([]);
    }
  };

  const toggleSelectStudent = (id: number) => {
    setSelectedStudentIds((prev: any) =>
      prev.includes(id) ? prev.filter((sId: any) => sId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map((s: any) => s.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedStudentIds.length === 0) {
      Alert.alert('Uyarı', 'Lütfen silinecek öğrencileri seçiniz.');
      return;
    }

    Alert.alert(
      'Toplu Öğrenci Silme',
      `Seçilen ${selectedStudentIds.length} öğrenciyi silmek istediğinize emin misiniz? Bu işlem öğrencilerin tüm ödev ve not kayıtlarını da silecektir.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await bulkDeleteStudents(selectedStudentIds);
              setSelectedStudentIds([]);
              setSelectionMode(false);
              loadStudents();
              Alert.alert('Başarılı', 'Seçilen öğrenciler silindi.');
            } catch (error) {
              Alert.alert('Hata', 'Öğrenciler silinirken hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleOpenTransferModal = async () => {
    if (selectedStudentIds.length === 0) {
      Alert.alert('Uyarı', 'Lütfen şubesi değiştirilecek öğrencileri seçiniz.');
      return;
    }
    try {
      const allClasses = await getClasses();
      const otherClasses = allClasses.filter((c: any) => c.id !== classId);
      if (otherClasses.length === 0) {
        Alert.alert('Bilgi', 'Aktarım yapılabilecek başka bir şube bulunmuyor.');
        return;
      }
      setAvailableClasses(otherClasses);
      setSelectedTargetClassId(otherClasses[0].id);
      setTransferModalVisible(true);
    } catch (error) {
      Alert.alert('Hata', 'Şubeler yüklenemedi.');
    }
  };

  const handleConfirmTransfer = async () => {
    if (!selectedTargetClassId) return;
    const targetClass = availableClasses.find((c: any) => c.id === selectedTargetClassId);
    try {
      await bulkTransferStudents(selectedStudentIds, selectedTargetClassId);
      setTransferModalVisible(false);
      setSelectedStudentIds([]);
      setSelectionMode(false);
      loadStudents();
      Alert.alert(
        'Başarılı',
        `Seçilen ${selectedStudentIds.length} öğrenci "${targetClass?.name}" şubesine aktarıldı.`
      );
    } catch (error) {
      Alert.alert('Hata', 'Şube değişikliği yapılırken hata oluştu.');
    }
  };

  const handleExcelImport = async () => {
    if (isSchoolTeacher) {
      Alert.alert('Yetki Sınırı', 'Okul modundasınız: Excel ile öğrenci yükleme yetkisi yalnızca okul idaresindedir.');
      return;
    }
    try {
      setLoading(true);
      const parsed = await pickAndParseStudentsExcel();
      if (parsed.length === 0) {
        setLoading(false);
        return;
      }

      const result = await bulkCreateStudents(classId, parsed);
      loadStudents();
      Alert.alert(
        'Başarılı',
        `${result.added} öğrenci eklendi.${result.skipped > 0 ? ` (${result.skipped} satır atlandı)` : ''}`
      );
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Hata', error?.message || 'Excel dosyası okunamadı.');
    }
  };

  const handleExcelExport = async () => {
    if (students.length === 0) {
      Alert.alert('Bilgi', 'Dışa aktarılacak öğrenci bulunmuyor.');
      return;
    }
    try {
      await exportClassStudentsToExcel(className, students);
    } catch (error) {
      Alert.alert('Hata', 'Excel dosyası oluşturulamadı.');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await generateStudentTemplateExcel(students);
    } catch (error) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı.');
    }
  };

  const formatScore = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return String(val);
  };

  return {
    loadClassNotes,
    handleOpenAddClassNote,
    handleOpenEditClassNote,
    handleSaveClassNote,
    handleDeleteClassNote,
    handleCopyClassNote,
    loadNoteCounts,
    loadStudents,
    handleSyncStudentsFromServer,
    handleDeleteEntireClass,
    loadGradebook,
    handleChangeTerm,
    handleOpenAddQuiz,
    handleSaveNewQuiz,
    handleDeleteQuizConfirm,
    handleOpenEditGrade,
    handleSaveSingleGrade,
    handleDownloadGradebookTemplate,
    handleExportGradebookExcel,
    handleImportGradebookExcel,
    handleOpenAdd,
    handleOpenEdit,
    handleSaveStudent,
    handleDeleteStudent,
    handleOpenPhotoOptions,
    handlePickSinglePhoto,
    handleRemovePhoto,
    handlePickSinglePhotoFromPdf,
    handleSelectPhotoFromPdfForStudent,
    handleStartBulkPhoto,
    handleConfirmBulkPhotos,
    handleStartPdfPhoto,
    handleClearClassPhotos,
    handleClearAllPhotos,
    handleDeleteAllClassStudents,
    handleDeleteAllSystemStudents,
    runPdfExtraction,
    handleConfirmSavePdfPhotos,
    handleUpdatePdfMatchStudent,
    handleOpenStudentDetail,
    handleNavigateDetailStudent,
    handleSendParentMessage,
    handleAddNoteFromDetail,
    handleOpenEditNote,
    handleSaveEditNote,
    handleDeleteNoteFromDetail,
    toggleSelectionMode,
    toggleSelectStudent,
    handleSelectAll,
    handleBulkDelete,
    handleOpenTransferModal,
    handleConfirmTransfer,
    handleExcelImport,
    handleExcelExport,
    handleDownloadTemplate,
    formatScore
  };
}
