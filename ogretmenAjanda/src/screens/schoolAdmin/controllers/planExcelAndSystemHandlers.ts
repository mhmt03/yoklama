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
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiRequest, DEFAULT_API_URL, clearAuthSession, getActiveUserSession, getAuthToken } from '../../../services/apiClient';
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
} from '../../../services/aiScheduleParser';
import { parseStudentsFromExcel, saveParsedStudentsToServer, ParsedExcelStudent, generateStudentTemplateExcel } from '../../../services/excelStudentParser';
import { parseTeachersFromExcel, saveParsedTeachersToServer, ParsedExcelTeacher, generateTeacherTemplateExcel } from '../../../services/excelTeacherParser';
import { analyzeUploadedDocument, convertRowsWithMapping, DocumentAnalysisResult, ColumnMappingSelection, generateYearlyPlanTemplateExcel } from '../../../utils/columnMappingService';
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
} from '../../../utils/geminiScheduleService';
import {
  SchoolSnapshotData,
  saveSchoolSnapshotToStorage,
  loadSchoolSnapshotFromStorage,
  getSchoolSnapshotLastSyncTime,
  fetchAndCacheSchoolSnapshot,
  patchLocalSchoolSnapshot,
  formatSyncTime,
} from '../../../services/schoolSnapshotService';
import {
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../../../utils/counselorService';
import { printDutyAssignments, DutyPrintSlot } from '../../../utils/dutyPrintService';
import { SchoolAdminCtx } from '../schoolAdminStyles';

export function createPlanExcelAndSystemHandlers(ctx: SchoolAdminCtx) {
  const {
    adminOldPassword,
    adminNewPassword,
    adminConfirmPassword,
    setSavingAdminCredentials,
    adminNewUsername,
    setAdminOldPassword,
    setAdminNewPassword,
    setAdminConfirmPassword,
    setAdminCredentialsModalVisible,
    selectedSchool,
    setScheduleResetModalVisible,
    setLoadingAllSchedules,
    setAllSchoolSchedules,
    selectedClassForEditor,
    classes,
    allSchoolSchedules,
    selectedTeacherForEditor,
    teachers,
    setEditingLesson,
    setEditLessonName,
    setEditLessonCode,
    setEditLessonGrade,
    setEditLessonHours,
    setEditLessonModalVisible,
    editingLesson,
    editLessonName,
    setUpdatingLesson,
    editLessonCode,
    editLessonGrade,
    editLessonHours,
    setSelectedLessonForPlan,
    setPlanSheetPickerAsset,
    setPlanSheetPickerLesson,
    setPlanSheetPickerSheets,
    setPlanSheetPickerVisible,
    setAnalyzingPlanFile,
    setYearlyPlanModalVisible,
    setDocAnalysis,
    setSelectedMapping,
    planSheetPickerAsset,
    planSheetPickerLesson,
    selectedLessonForPlan,
    docAnalysis,
    selectedMapping,
    setSavingPlanRows,
    setSelectedLessonForViewPlan,
    setPlanSearch,
    setViewPlanModalVisible,
    setViewPlanItems,
    setLoadingViewPlan,
    setDeletingPlan,
    selectedTeacherForSchedule,
    setSavingCounselorClass,
    setSelectedTeacherForSchedule,
    setEditingCounselorClass,
    setTeachers,
    absentTeachers,
    dutyAssignDay,
    dutiesList,
    hiddenDutyTeachersBySlot,
    setTeacherScheduleModalVisible,
    normalizeTeacherMatch,
    setTeacherScheduleItems,
    setLoadingTeacherSchedule,
    students,
    setStudents,
    setTeacherExcelModalVisible,
    setTeacherExcelParsing,
    setParsedExcelTeachers,
    parsedExcelTeachers,
    setTeacherExcelSaving,
    setBulkPhotoModalVisible,
    setUploadingBulkPhotos,
    setBulkPhotoProgress,
    setGeminiApiKeyInput,
    geminiApiKeyInput,
    selectedGeminiModel,
    setTestingGeminiKey,
    setUsageStats,
    setFetchingLiveModels,
    setAvailableLiveModels,
    setSavingAiSettings,
    setSelectedSchool,
    setSchools,
    setLoadingLogs,
    selectedLogUser,
    selectedLogRole,
    selectedLogAction,
    selectedLogTime,
    logSearch,
    setLogs,
    setLogStats,
    setLogUsers,
    setLogActionTypes,
    setExportingLogs,
    setIsPurgingLogs,
    purgeStartDate,
    purgeEndDate,
    setLogPurgeModalVisible
  } = ctx;

  const loadLessons = (...args: any[]) => ctx.loadLessons(...args);
  const loadClasses = (...args: any[]) => ctx.loadClasses(...args);
  const loadScheduleStats = (...args: any[]) => ctx.loadScheduleStats(...args);
  const loadTeachers = (...args: any[]) => ctx.loadTeachers(...args);
  const loadStudents = (...args: any[]) => ctx.loadStudents(...args);

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
        oldPassword: adminOldPassword,
        currentPassword: adminOldPassword,
        newPassword: adminNewPassword || undefined,
      });
      if (res.success) {
        Alert.alert('Başarılı 🎉', 'Giriş bilgileriniz güncellendi.');
        setAdminOldPassword('');
        setAdminNewPassword('');
        setAdminConfirmPassword('');
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
                setAllSchoolSchedules([]);
                await patchLocalSchoolSnapshot(selectedSchool.id, { schedules: [] });
                loadScheduleStats();
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
                const updated = allSchoolSchedules.filter((s: any) => s.grade !== grade || s.section !== section);
                setAllSchoolSchedules(updated);
                await patchLocalSchoolSnapshot(selectedSchool.id, { schedules: updated });
                loadScheduleStats();
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
                const updated = allSchoolSchedules.filter((s: any) => s.teacherName !== targetTeacher);
                setAllSchoolSchedules(updated);
                await patchLocalSchoolSnapshot(selectedSchool.id, { schedules: updated });
                loadScheduleStats();
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
      setPlanSheetPickerAsset(asset);
      setPlanSheetPickerLesson(lesson);

      const fileName = (asset.name || '').toLowerCase();

      let targetSheet: string | undefined = undefined;
      if (!fileName.endsWith('.docx') && !fileName.endsWith('.doc')) {
        const { getWorkbookSheetNames } = await import('../../../utils/excelService');
        const sheetNames = await getWorkbookSheetNames(asset as any);
        if (sheetNames.length > 1) {
          // Birden fazla sheet varsa şık ve sınırsız seçim modalını aç
          setPlanSheetPickerSheets(sheetNames);
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

  const handleSwitchPlanSheet = async (newSheet: string) => {
    if (!planSheetPickerAsset) return;
    setAnalyzingPlanFile(true);
    try {
      const analysis = await analyzeUploadedDocument(planSheetPickerAsset as any, newSheet);
      setDocAnalysis(analysis);
      setSelectedMapping(analysis.suggestedMapping);
    } catch (e: any) {
      Alert.alert('Hata', 'Seçilen çalışma sayfası okunamadı: ' + e.message);
    } finally {
      setAnalyzingPlanFile(false);
    }
  };

  const handleProceedWithPlanSheet = async (selectedSheet: string) => {
    setPlanSheetPickerVisible(false);
    if (!planSheetPickerAsset) return;

    if (planSheetPickerLesson) {
      setSelectedLessonForPlan(planSheetPickerLesson);
    }
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

  const handleDownloadYearlyPlanTemplate = async (lessonName?: string, grade?: string) => {
    try {
      await generateYearlyPlanTemplateExcel(lessonName || 'Ders', grade || 'Tüm_Kademeler');
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon oluşturulamadı: ' + e.message);
    }
  };

  const handleSaveTeacherCounselorClass = async (newClass: string) => {
    if (!selectedTeacherForSchedule || !selectedSchool) return;
    setSavingCounselorClass(true);
    try {
      const counselorValue = newClass ? newClass.trim() : 'NONE';
      const updatedTeacher = {
        ...selectedTeacherForSchedule,
        counselorClass: counselorValue,
      };
      setSelectedTeacherForSchedule(updatedTeacher);
      setEditingCounselorClass(newClass);

      // 1. Öğretmenler listesini güncelle
      const updatedTeachers = teachers.map((t: any) =>
        t.id === selectedTeacherForSchedule.id ? updatedTeacher : t
      );
      setTeachers(updatedTeachers);

      // 2. Yerel snapshot'a kaydet
      await patchLocalSchoolSnapshot(selectedSchool.id, { teachers: updatedTeachers });

      // 3. Sunucuya kaydet
      await apiRequest(`schools/teachers/${selectedTeacherForSchedule.id}/details`, 'PUT', {
        ...selectedTeacherForSchedule,
        counselorClass: counselorValue,
      });

      Alert.alert('Başarılı', `${selectedTeacherForSchedule.fullName} için sınıf rehberliği "${newClass || 'Kaldırıldı'}" olarak güncellendi.`);
    } catch (err: any) {
      Alert.alert('Hata', 'Rehberlik bilgisi kaydedilemedi: ' + (err?.message || err));
    } finally {
      setSavingCounselorClass(false);
    }
  };

  const handlePrintDutySchedule = () => {
    if (!absentTeachers || absentTeachers.length === 0) {
      Alert.alert('Uyarı', 'Lütfen önce listeden en az bir gelmeyen öğretmen seçiniz.');
      return;
    }

    const absentDaySchedules = (allSchoolSchedules || [])
      .filter((s: any) => {
        const sDay = Number(s.dayOfWeek);
        if (sDay !== dutyAssignDay) return false;
        return absentTeachers.some((absentName: any) => isSameTeacher(absentName, s.teacherName));
      })
      .sort((a: any, b: any) => Number(a.lessonHour || 0) - Number(b.lessonHour || 0));

    if (absentDaySchedules.length === 0) {
      Alert.alert('Bilgi', 'Seçilen öğretmenlerin seçilen günde dersi bulunmamaktadır.');
      return;
    }

    const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
    const dayName = dayNames[dutyAssignDay] || 'Pazartesi';

    const slots: DutyPrintSlot[] = absentDaySchedules.map((slotItem: any, sIdx: any) => {
      const lHour = Number(slotItem.lessonHour || (sIdx + 1));
      const slotKey = `${dutyAssignDay}_${lHour}_${normalizeTeacherName(slotItem.teacherName)}`;
      const allAvailableDuty = getAvailableDutyTeachersForHour(
        dutyAssignDay,
        lHour,
        dutiesList,
        allSchoolSchedules,
        absentTeachers
      );
      const hiddenList = hiddenDutyTeachersBySlot[slotKey] || [];
      const visibleDutyTeachers = allAvailableDuty.filter((d: any) => !hiddenList.includes(d.teacherName));

      const classNameText = slotItem.className || (slotItem.grade && slotItem.section ? `${slotItem.grade}-${slotItem.section}` : slotItem.grade || slotItem.section || '—');

      return {
        lessonHour: lHour,
        className: classNameText,
        lessonName: slotItem.lessonName || 'Ders',
        absentTeacherName: slotItem.teacherName,
        assignedTeachers: visibleDutyTeachers.map((d: any) => ({
          teacherName: d.teacherName,
          dutyPlace: d.dutyPlace || 'Nöbet Alanı',
        })),
      };
    });

    const printed = printDutyAssignments({
      schoolName: selectedSchool?.name || 'Okul Müdürlüğü',
      dayName,
      slots,
    });

    if (!printed) {
      Alert.alert('Uyarı', 'Yazdırma penceresi açılamadı. Lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kontrol edip tekrar deneyiniz.');
    }
  };

  const handleOpenTeacherSchedule = async (teacher: any) => {
    if (!selectedSchool || !teacher) return;
    setSelectedTeacherForSchedule(teacher);
    const initialCounselor = getTeacherCounselorClass(teacher, allSchoolSchedules);
    setEditingCounselorClass(initialCounselor || '');
    setTeacherScheduleModalVisible(true);

    // 1. FAST LOCAL: Zaten yerelde okulun tüm programı (allSchoolSchedules) varsa
    if (allSchoolSchedules && allSchoolSchedules.length > 0) {
      const localMatched = allSchoolSchedules.filter((s: any) =>
        normalizeTeacherMatch(s.teacherName, teacher.fullName)
      );
      // Öğretmenin 0 dersi de olsa yerel veritabanı/program tamdır, doğrudan 0ms ile göster (sunucuya gitme!)
      setTeacherScheduleItems(localMatched);
      setLoadingTeacherSchedule(false);
      return;
    }

    // 2. Eğer allSchoolSchedules henüz yüklenmemişse cihazdaki yerel snapshot'tan al (0ms)
    try {
      const cached = await loadSchoolSnapshotFromStorage(selectedSchool.id);
      if (cached?.schedules && cached.schedules.length > 0) {
        setAllSchoolSchedules(cached.schedules);
        const localMatched = cached.schedules.filter((s: any) =>
          normalizeTeacherMatch(s.teacherName, teacher.fullName)
        );
        setTeacherScheduleItems(localMatched);
        setLoadingTeacherSchedule(false);
        return;
      }
    } catch { }

    // 3. Sadece ve sadece cihazda hiçbir yerel veri yoksa sunucuya git
    setLoadingTeacherSchedule(true);
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

  const handleDownloadStudentTemplate = async () => {
    try {
      let currentStudents = students;
      if ((!currentStudents || currentStudents.length === 0) && selectedSchool?.id) {
        const res = await apiRequest<any[]>(`sync/students?schoolId=${selectedSchool.id}`);
        if (res.success && res.data) {
          currentStudents = res.data;
          setStudents(currentStudents);
        }
      }
      await generateStudentTemplateExcel(currentStudents, selectedSchool?.name);
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon oluşturulamadı: ' + e.message);
    }
  };

  const handleDownloadTeacherTemplate = async () => {
    try {
      let currentTeachers = teachers;
      if ((!currentTeachers || currentTeachers.length === 0) && selectedSchool?.id) {
        const res = await apiRequest<any[]>(`schools/${selectedSchool.id}/teachers`);
        if (res.success && res.data) {
          currentTeachers = res.data;
          setTeachers(currentTeachers);
        }
      }
      await generateTeacherTemplateExcel(currentTeachers, selectedSchool?.name);
    } catch (e: any) {
      Alert.alert('Hata', 'Öğretmen şablonu oluşturulamadı: ' + e.message);
    }
  };

  const handlePickAndParseTeacherExcel = async () => {
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
      setTeacherExcelModalVisible(true);
      setTeacherExcelParsing(true);
      setParsedExcelTeachers([]);

      const result = await parseTeachersFromExcel(file.uri);
      setTeacherExcelParsing(false);

      if (result.success && result.teachers.length > 0) {
        setParsedExcelTeachers(result.teachers);
      } else {
        Alert.alert('Excel Ayrıştırma Hatası', result.error || 'Excel dosyasında öğretmen verisi bulunamadı.');
        setTeacherExcelModalVisible(false);
      }
    } catch (e: any) {
      setTeacherExcelParsing(false);
      Alert.alert('Hata', e.message || 'Excel dosyası okunamadı.');
      setTeacherExcelModalVisible(false);
    }
  };

  const handleConfirmAndSaveExcelTeachers = async () => {
    if (!selectedSchool || parsedExcelTeachers.length === 0) return;

    setTeacherExcelSaving(true);
    try {
      const saveRes = await saveParsedTeachersToServer(selectedSchool.id, parsedExcelTeachers);
      if (saveRes.success) {
        Alert.alert(
          'Başarılı 🎉',
          `${saveRes.message}\n\nMevcut öğretmenlerin şifreleri ve kullanıcı adları güvenle korunmuştur.`
        );
        setTeacherExcelModalVisible(false);
        setParsedExcelTeachers([]);
        loadTeachers(selectedSchool.id);
      } else {
        Alert.alert('Hata', saveRes.message);
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setTeacherExcelSaving(false);
    }
  };

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

      const photos: { studentNumber: string; photoBase64: string; base64Data?: string; fileName: string }[] = [];

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
        Alert.alert('Doğrulama Başarısız ❌', (res as any).message);
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
        setSchools((prev: any) => prev.map((s: any) => s.id === selectedSchool.id ? { ...s, geminiApiKey: key, geminiModel: model } : s));

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

  const handlePurgeLogs = async () => {
    if (!selectedSchool?.id) return;
    try {
      setIsPurgingLogs(true);
      const res = await apiRequest<{ success: boolean; deletedCount: number; message: string }>(
        `schools/${selectedSchool.id}/audit-logs?startDate=${encodeURIComponent(purgeStartDate)}&endDate=${encodeURIComponent(purgeEndDate)}`,
        'DELETE'
      );
      setIsPurgingLogs(false);
      setLogPurgeModalVisible(false);
      Alert.alert('İşlem Başarılı', (res as any)?.message || 'Seçilen tarih aralığındaki loglar veritabanından temizlendi.');
      await loadAuditLogs();
    } catch (err: any) {
      setIsPurgingLogs(false);
      Alert.alert('Hata', err?.message || 'Loglar temizlenirken bir hata oluştu.');
    }
  };

  return {
    handleSaveAdminCredentials,
    handleDeleteAllLessons,
    handleDeleteAllClasses,
    handleClearAllSchedules,
    handleClearCurrentClassSchedule,
    handleClearCurrentTeacherSchedule,
    handleDeleteAllTeachers,
    handleDeleteAllStudents,
    handleOpenEditLesson,
    handleSaveLessonEdit,
    handlePickYearlyPlanFile,
    handleSwitchPlanSheet,
    handleProceedWithPlanSheet,
    handleConfirmAndSaveYearlyPlan,
    handleOpenViewYearlyPlan,
    handleDeleteYearlyPlan,
    handleDownloadYearlyPlanTemplate,
    handleSaveTeacherCounselorClass,
    handlePrintDutySchedule,
    handleOpenTeacherSchedule,
    handleDownloadStudentTemplate,
    handleDownloadTeacherTemplate,
    handlePickAndParseTeacherExcel,
    handleConfirmAndSaveExcelTeachers,
    handlePickAndUploadBulkPhotos,
    handleUseDefaultApiKey,
    handleTestApiKey,
    handleFetchLiveModels,
    handleSaveAiSettingsToServer,
    handleRefreshUsageStats,
    handleResetUsageStats,
    loadAuditLogs,
    handleExportLogs,
    handlePurgeLogs
  };
}
