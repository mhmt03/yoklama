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
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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
import { extractStudentPhotosWithAi } from '../../../services/aiStudentPhotoExtractor';
import { generateDutyTemplateExcel } from '../../../utils/excelService';
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
} from '../../../services/adminReportService';
import {
  parseSingleTeacherScheduleWithAi,
  saveTeacherScheduleToServer,
  saveSingleScheduleItemToServer,
  deleteSingleScheduleItemFromServer,
  fetchScheduleIntegrityStats,
  SingleTeacherScheduleItem,
} from '../../../services/singleTeacherScheduleParser';
import { pickSinglePhotoFromSource } from '../../../utils/photoService';
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
import { extractPhotosFromPdf, PdfExtractedStudentPhoto } from '../../../utils/pdfPhotoExtractor';
import * as XLSX from 'xlsx';
import {
  SchoolSnapshotData,
  saveSchoolSnapshotToStorage,
  loadSchoolSnapshotFromStorage,
  getSchoolSnapshotLastSyncTime,
  fetchAndCacheSchoolSnapshot,
  patchLocalSchoolSnapshot,
  formatSyncTime,
} from '../../../services/schoolSnapshotService';
import { SchoolAdminCtx } from '../schoolAdminStyles';

export function createScheduleAndBatchHandlers(ctx: SchoolAdminCtx) {
  const {
    setScheduleBatches,
    setCachedScheduleDoc,
    setCachedScheduleDraft,
    parsedSchedule,
    selectedSchool,
    lastAnalyzedPageRange,
    pdfTotalPages,
    pdfPageRangeMode,
    pdfStartPage,
    pdfEndPage,
    pendingScheduleFile,
    scheduleBatches,
    setParsedSchedule,
    setAiModalVisible,
    setBatchPoolModalVisible,
    setInspectingTeacher,
    setInspectingVerification,
    setTempExpectedHours,
    setEditingExpectedHours,
    setInspectingItems,
    setInspectDayTab,
    setEditingCellSlot,
    setTeacherRescanHint,
    setInspectTeacherModalVisible,
    inspectingItems,
    inspectingVerification,
    editingCellSlot,
    inspectingTeacher,
    tempExpectedHours,
    cachedScheduleDoc,
    setAiParsing,
    setAiStageText,
    geminiApiKeyInput,
    selectedGeminiModel,
    setReScanningTeacher,
    teacherRescanHint,
    aiCancelledRef,
    setAiElapsedSeconds,
    dutiesList,
    setLoadingDuties,
    normalizeDayNumber,
    setDutiesList,
    newDutyTeacher,
    newDutyPlace,
    setSavingDuty,
    newDutyDay,
    newDutyNotes,
    setAddDutyModalVisible,
    setNewDutyTeacher,
    setNewDutyPlace,
    setNewDutyNotes,
    setDownloadingDutyTemplate,
    allKnownDutyPlaces,
    teachers,
    setImportingDutyExcel,
    setExportingReportType,
    reportTeacherBranch,
    reportTeacherRole,
    reportTeacherActive,
    students,
    reportStudentGrade,
    reportStudentSection,
    reportStudentSearch,
    classes,
    reportClassGrade,
    lessons,
    schoolYearlyPlans,
    reportLessonGrade,
    reportLessonPlanStatus,
    teacherScheduleItems,
    reportScheduleTeacher,
    reportScheduleClass,
    reportScheduleDay,
    reportSelectedPlanLessonId,
    logs,
    setLogs,
    reportAuditUser,
    reportAuditRole,
    reportAuditAction,
    setBulkPhotoModalVisible,
    setUploadingBulkPhotos,
    setBulkPhotoProgress,
    setStudents,
    setCachedPdfAsset,
    setCachedPdfPhotos,
    setInitialReviewPhotos,
    setPhotoHistoryStack,
    setReviewPhotos,
    setReviewPageFilter,
    setReviewMatchFilter,
    setReviewSearchQuery,
    setPhotoReviewModalVisible,
    setStudentPickerTargetId,
    setStudentPickerSearch,
    setStudentPickerVisible,
    studentPickerTargetId,
    getPickerStudentInfo,
    reviewPhotos,
    setPhotoPickerTargetId,
    setPhotoPickerSearch,
    setPhotoPickerVisible,
    photoPickerTargetId
  } = ctx;

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
      `Şu anda havuzda toplam ${updated.length} parça var (${updated.reduce((sum: any, b: any) => sum + (b.data?.teachers?.length || 0), 0)} öğretmen girdisi).\n\n` +
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
    const updated = scheduleBatches.filter((b: any) => b.id !== batchId);
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

  const handleOpenTeacherScheduleInspector = (teacherName: string) => {
    if (!parsedSchedule) return;
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const verif = (parsedSchedule.teacherVerifications || []).find((v: any) => norm(v.teacherName) === norm(teacherName)) || null;
    const items = (parsedSchedule.scheduleItems || [])
      .filter((it: any) => norm(it.teacherName) === norm(teacherName))
      .map((it: any) => ({ ...it }));

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
    const existing = inspectingItems.find((it: any) => it.dayOfWeek === dayOfWeek && it.lessonHour === lessonHour);
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
    let updated = inspectingItems.filter((it: any) => !(it.dayOfWeek === origDay && it.lessonHour === origHour));

    // 2. Hedef saatte daha önceden bir ders varsa üzerine yaz/kaldır
    updated = updated.filter((it: any) => !(it.dayOfWeek === dayOfWeek && it.lessonHour === lessonHour));

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
    const updated = inspectingItems.filter((it: any) => !(it.dayOfWeek === dayOfWeek && it.lessonHour === lessonHour));
    setInspectingItems(updated);
  };

  const handleShiftLessonHour = (dayOfWeek: number, fromHour: number, toHour: number) => {
    setInspectingItems((prev: any) => {
      const fromItem = prev.find((it: any) => it.dayOfWeek === dayOfWeek && it.lessonHour === fromHour);
      if (!fromItem) return prev;
      const toItem = prev.find((it: any) => it.dayOfWeek === dayOfWeek && it.lessonHour === toHour);

      return prev.map((it: any) => {
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
    const fromItem = inspectingItems.find((it: any) => it.dayOfWeek === dayOfWeek && it.lessonHour === fromHour);
    if (!fromItem) return;

    const options: any[] = [];
    for (let h = 1; h <= maxPeriod; h++) {
      if (h === fromHour) continue;
      const targetItem = inspectingItems.find((it: any) => it.dayOfWeek === dayOfWeek && it.lessonHour === h);
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
      setInspectingVerification((prev: any) => {
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
    const otherItems = (parsedSchedule.scheduleItems || []).filter((it: any) => norm(it.teacherName) !== norm(inspectingTeacher));
    const newScheduleItems = [...otherItems, ...inspectingItems];

    const expHours = inspectingVerification?.expectedWeeklyHours ?? inspectingItems.length;

    let foundVerif = false;
    const newVerifications = (parsedSchedule.teacherVerifications || []).map((v: any) => {
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
    inspectingItems.forEach((it: any) => {
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
      const conflictWith = otherItems.find((ot: any) => {
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
      const conflictSummary = conflictsDetected.slice(0, 3).map((c: any) =>
        `• ${dayNames[c.dayOfWeek] || c.dayOfWeek}. Gün ${c.lessonHour}. Ders (${c.className}): ${c.otherTeacher}`
      ).join('\n');
      const extra = conflictsDetected.length > 3 ? `\n... ve ${conflictsDetected.length - 3} çakışma daha.` : '';

      const distinctConflictTeachers = Array.from(
        new Set(conflictsDetected.map((c: any) => c.otherTeacher).filter((t: any) => t && t !== 'Bilinmeyen Öğretmen' && t !== inspectingTeacher))
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
              (it: any) => (it.teacherName || '').trim().toLowerCase() !== normName
            );
            const updatedItems = [...otherItems, ...res.items];

            // Teacher verifications güncelle
            const otherVerifs = (currentParsed.teacherVerifications || []).filter(
              (v: any) => (v.teacherName || '').trim().toLowerCase() !== normName
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
              const conflict = otherItems.find((ot: any) => {
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
          remainingConflicts.slice(0, 3).map((c: any) => `• ${c}`).join('\n') +
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

      const verifications: TeacherScheduleVerification[] = Array.from(teachersSet).map((tName: any) => ({
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

  const cancelScheduleAnalysis = () => {
    aiCancelledRef.current = true;
    setAiParsing(false);
    setAiModalVisible(false);
    setAiStageText('');
    setAiElapsedSeconds(0);
  };

  const loadDuties = async (schoolId?: string) => {
    const sid = schoolId || selectedSchool?.id;
    if (!sid) return;

    // 1. FAST OFFLINE: Hafızada zaten nöbetler varsa 0ms ile hemen dön
    if (dutiesList && dutiesList.length > 0) {
      setLoadingDuties(false);
      return;
    }

    // 2. FAST OFFLINE: Önce yerel hafızadaki snapshot'tan anında getir (0ms)
    try {
      const cached = await loadSchoolSnapshotFromStorage(sid);
      if (cached?.duties && cached.duties.length > 0) {
        const normalized = cached.duties.map((d: any) => ({
          ...d,
          dayOfWeek: normalizeDayNumber(d.dayOfWeek),
        }));
        setDutiesList(normalized);
        setLoadingDuties(false);
        return; // Yerel veri mevcut, çevrimdışı 0ms olarak tamamla!
      }
    } catch { }

    // 3. Yalnızca cihazda hiç nöbet verisi yoksa sunucudan çekmeyi dene
    setLoadingDuties(true);
    try {
      const res = await apiRequest<any[]>(`schools/${sid}/duties`);
      if (res.success && res.data) {
        const normalized = res.data.map((d: any) => ({
          ...d,
          dayOfWeek: normalizeDayNumber(d.dayOfWeek),
        }));
        setDutiesList(normalized);
        await patchLocalSchoolSnapshot(sid, { duties: normalized });
      }
    } catch (e) {
      console.error('Nöbet listesi yüklenemedi:', e);
    } finally {
      setLoadingDuties(false);
    }
  };

  const handleSaveDuty = async () => {
    if (!selectedSchool) return;
    if (!newDutyTeacher.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen öğretmen seçiniz veya adını yazınız.');
      return;
    }
    if (!newDutyPlace.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen nöbet yerini belirtiniz (Örn: Bahçe, 1. Kat).');
      return;
    }
    setSavingDuty(true);
    try {
      const res = await apiRequest(`schools/${selectedSchool.id}/duties`, 'POST', {
        teacherName: newDutyTeacher.trim(),
        dayOfWeek: newDutyDay,
        dutyPlace: newDutyPlace.trim(),
        notes: newDutyNotes.trim() || undefined,
      });
      if (res.success) {
        Alert.alert('Başarılı', 'Nöbetçi öğretmen başarıyla kaydedildi.');
        setAddDutyModalVisible(false);
        setNewDutyTeacher('');
        setNewDutyPlace('');
        setNewDutyNotes('');
        const savedItem = (res.data as any) || {
          id: String(Date.now()),
          teacherName: newDutyTeacher.trim(),
          dayOfWeek: newDutyDay,
          dutyPlace: newDutyPlace.trim(),
          notes: newDutyNotes.trim(),
        };
        const updated = [...dutiesList, savedItem];
        setDutiesList(updated);
        await patchLocalSchoolSnapshot(selectedSchool.id, { duties: updated });
      } else {
        Alert.alert('Hata', (res as any).message || 'Kayıt yapılamadı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Nöbetçi kaydedilirken hata oluştu: ' + (e?.message || e));
    } finally {
      setSavingDuty(false);
    }
  };

  const handleDeleteDuty = async (id: string, teacherName: string) => {
    if (!selectedSchool) return;
    Alert.alert(
      'Nöbet Kaydı Silinecek',
      `"${teacherName}" isimli öğretmenin nöbet kaydını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiRequest(`schools/${selectedSchool.id}/duties/${id}`, 'DELETE');
              if (res.success) {
                const updated = dutiesList.filter((d: any) => d.id !== id);
                setDutiesList(updated);
                await patchLocalSchoolSnapshot(selectedSchool.id, { duties: updated });
              } else {
                Alert.alert('Hata', (res as any).message || 'Silinemedi.');
              }
            } catch (e: any) {
              Alert.alert('Hata', 'Silinirken hata: ' + e?.message);
            }
          },
        },
      ]
    );
  };

  const handleDownloadDutyTemplate = async () => {
    try {
      setDownloadingDutyTemplate(true);
      const combinedDutiesForTemplate = [
        ...dutiesList,
        ...allKnownDutyPlaces.map((p: any) => ({ dutyPlace: p, teacherName: '' }))
      ];
      const success = await generateDutyTemplateExcel(
        teachers,
        combinedDutiesForTemplate,
        selectedSchool?.name || 'Okul'
      );
      if (success && Platform.OS !== 'web') {
        Alert.alert('Şablon Hazır', 'Nöbet programı Excel şablonu oluşturuldu ve paylaşıldı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon oluşturulurken bir hata oluştu: ' + (e?.message || e));
    } finally {
      setDownloadingDutyTemplate(false);
    }
  };

  const handlePickAndParseDutyExcel = async () => {
    if (!selectedSchool) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;

      setImportingDutyExcel(true);
      const file = res.assets[0];

      let wb: XLSX.WorkBook;
      if (Platform.OS === 'web') {
        let arrayBuf: ArrayBuffer;
        if (file.file && typeof (file.file as any).arrayBuffer === 'function') {
          arrayBuf = await (file.file as File).arrayBuffer();
        } else {
          const resp = await fetch(file.uri);
          const blob = await resp.blob();
          arrayBuf = await blob.arrayBuffer();
        }
        wb = XLSX.read(arrayBuf, { type: 'array' });
      } else {
        const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        wb = XLSX.read(b64, { type: 'base64' });
      }

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        Alert.alert('Boş Belge', 'Excel dosyasında sayfa bulunamadı.');
        return;
      }

      const mapDayToNum = (text: string): number => {
        const t = (text || '').toLowerCase().trim();
        if (t.includes('pazartesi') || t.includes('pzt')) return 1;
        if (t.includes('salı') || t.includes('sali') || t.includes('sal')) return 2;
        if (t.includes('çarşamba') || t.includes('carsamba') || t.includes('çar') || t.includes('car')) return 3;
        if (t.includes('perşembe') || t.includes('persembe') || t.includes('per')) return 4;
        if (t.includes('cuma') || t.includes('cum')) return 5;
        if (t.includes('cumartesi') || t.includes('cts')) return 6;
        if (t.includes('pazar')) return 7;
        return 0;
      };

      const batch: { teacherName: string; dayOfWeek: number; dutyPlace: string; notes?: string }[] = [];

      // İlgili sayfaları tara (önce 'nöbet'/'haftalık' içeren, yoksa sırayla tüm sayfalar)
      const sortedSheetNames = [...wb.SheetNames].sort((a: any, b: any) => {
        const aMatch = /nöbet|nobet|haftalık|haftalik|çizelge|cizelge/i.test(a) ? -1 : 1;
        const bMatch = /nöbet|nobet|haftalık|haftalik|çizelge|cizelge/i.test(b) ? -1 : 1;
        return aMatch - bMatch;
      });

      for (const sheetName of sortedSheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows || rows.length === 0) continue;

        // 1. Matris formatı kontrolü (Pazartesi, Salı, Çarşamba sütun başlıkları)
        let dayCols: { colIndex: number; day: number }[] = [];
        let headerRowIndex = -1;

        for (let r = 0; r < Math.min(rows.length, 12); r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;
          const matched: { colIndex: number; day: number }[] = [];
          row.forEach((cell: any, cIdx: any) => {
            const d = mapDayToNum(String(cell));
            if (d > 0) matched.push({ colIndex: cIdx, day: d });
          });
          if (matched.length >= 3) {
            dayCols = matched;
            headerRowIndex = r;
            break;
          }
        }

        if (dayCols.length >= 3) {
          // Matris Formatı
          for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;

            const placeCandidates = row.slice(0, dayCols[0].colIndex).map((c: any) => String(c || '').trim()).filter(Boolean);
            const textCandidates = placeCandidates.filter((c: any) => isNaN(Number(c)));
            const dutyPlace = textCandidates.length > 0
              ? textCandidates[textCandidates.length - 1]
              : (placeCandidates[0] || 'Genel Nöbet');

            dayCols.forEach(({ colIndex, day }) => {
              const teacherCell = row[colIndex];
              if (teacherCell && String(teacherCell).trim()) {
                const raw = String(teacherCell).trim();
                const parts = raw.split(/[\n,\/]+/).map((p: any) => p.trim()).filter(Boolean);
                parts.forEach((tName: any) => {
                  if (tName.length >= 2 && !/öğretmen|nöbetçi|imza|açıklama|toplam/i.test(tName)) {
                    batch.push({
                      teacherName: tName,
                      dayOfWeek: day,
                      dutyPlace: dutyPlace,
                      notes: 'Excel matris aktarımı',
                    });
                  }
                });
              }
            });
          }
        } else {
          // 2. Tablo Sütun Formatı
          let dayCol = -1;
          let teacherCol = -1;
          let placeCol = -1;
          let noteCol = -1;
          let startRow = 0;

          for (let r = 0; r < Math.min(rows.length, 12); r++) {
            const row = rows[r].map((c: any) => String(c).toLowerCase().trim());
            row.forEach((colStr: any, idx: any) => {
              if (colStr.includes('gün') || colStr.includes('gun') || colStr.includes('tarih')) dayCol = idx;
              if (colStr.includes('öğretmen') || colStr.includes('ogretmen') || colStr.includes('ad') || colStr.includes('isim') || colStr.includes('personel')) teacherCol = idx;
              if (colStr.includes('yer') || colStr.includes('nöbet') || colStr.includes('nobet') || colStr.includes('bölge') || colStr.includes('kat') || colStr.includes('alan') || colStr.includes('görev')) placeCol = idx;
              if (colStr.includes('not') || colStr.includes('açıklama') || colStr.includes('aciklama')) noteCol = idx;
            });
            if (teacherCol !== -1 && (dayCol !== -1 || placeCol !== -1)) {
              startRow = r + 1;
              break;
            }
          }

          if (teacherCol !== -1) {
            for (let r = startRow; r < rows.length; r++) {
              const row = rows[r];
              if (!row || row.length === 0) continue;
              const teacherName = String(row[teacherCol] || '').trim();
              if (!teacherName || teacherName.length < 2 || /öğretmen|personel|adı|ad/i.test(teacherName)) continue;

              const dayNum = dayCol !== -1 ? mapDayToNum(String(row[dayCol] || '')) : 1;
              const place = placeCol !== -1 ? (String(row[placeCol] || 'Genel Nöbet').trim() || 'Genel Nöbet') : 'Genel Nöbet';
              const note = noteCol !== -1 ? String(row[noteCol] || '').trim() : undefined;

              batch.push({
                teacherName,
                dayOfWeek: dayNum > 0 ? dayNum : 1,
                dutyPlace: place,
                notes: note,
              });
            }
          }
        }

        if (batch.length > 0) break; // İlk veri bulunan sayfadan sonra dur
      }

      if (batch.length === 0) {
        Alert.alert('Eşleşme Bulunamadı', 'Excel dosyasında nöbetçi öğretmen kaydı algılanamadı. Lütfen "Şablon İndir" ile örnek Excel tablosunu inceleyin.');
        return;
      }

      const postRes = await apiRequest<any>(`schools/${selectedSchool.id}/duties/batch`, 'POST', {
        overwriteExisting: true,
        duties: batch,
      });

      if (postRes.success) {
        Alert.alert('Başarılı', `Excel dosyasından ${batch.length} adet nöbetçi öğretmen başarıyla aktarıldı.`);
        await loadDuties(selectedSchool.id);
        await patchLocalSchoolSnapshot(selectedSchool.id, { duties: batch as any });
      } else {
        Alert.alert('Hata', postRes.error || (postRes as any).message || 'Nöbetçiler kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Excel Okuma Hatası', 'Dosya işlenirken hata oluştu: ' + (e?.message || e));
    } finally {
      setImportingDutyExcel(false);
    }
  };

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
    const target = lesson || (reportSelectedPlanLessonId !== 'all' ? lessons.find((l: any) => l.id === reportSelectedPlanLessonId) : lessons[0]);
    if (!target) {
      Alert.alert('Uyarı', 'Lütfen raporunu almak istediğiniz dersi seçin.');
      return;
    }
    setExportingReportType(`plan_${target.id}`);
    try {
      const items = schoolYearlyPlans.filter((p: any) => (p.lessonName || '').toLowerCase() === (target.name || '').toLowerCase() && (!target.grade || !p.grade || String(p.grade) === String(target.grade)));
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
    if (!selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen önce aktif bir okul seçiniz.');
      return;
    }
    try {
      setBulkPhotoModalVisible(true);
      setUploadingBulkPhotos(true);

      let currentStudents = students;
      if (!currentStudents || currentStudents.length === 0) {
        setBulkPhotoProgress('Okul öğrenci listesi yükleniyor...');
        try {
          const sRes = await apiRequest<any[]>(`sync/students?schoolId=${selectedSchool.id}`);
          if (sRes.success && sRes.data) {
            currentStudents = sRes.data;
            setStudents(sRes.data);
          }
        } catch (loadErr) {
          console.warn('[PDF Fotoğraf] Öğrenciler çekilemedi:', loadErr);
        }
      }

      setBulkPhotoProgress('e-Okul PDF belgesi seçiliyor ve taranıyor...');
      const pick = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
      if (pick.canceled || !pick.assets?.length) {
        setBulkPhotoModalVisible(false);
        setUploadingBulkPhotos(false);
        setBulkPhotoProgress('');
        return;
      }
      const asset = pick.assets[0];
      setCachedPdfAsset(asset);

      const res = await extractPhotosFromPdf(currentStudents, asset);
      setBulkPhotoModalVisible(false);
      setUploadingBulkPhotos(false);
      setBulkPhotoProgress('');

      if (!res.success) {
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('PDF Fotoğraf Hatası', res.error);
        }
        return;
      }

      const extracted = res.extractedPhotos || [];
      if (extracted.length === 0) {
        Alert.alert('Fotoğraf Bulunamadı', 'Seçilen PDF belgesinde vesikalık fotoğraf tespit edilemedi.');
        return;
      }

      setCachedPdfPhotos(extracted);
      setInitialReviewPhotos(extracted);
      setPhotoHistoryStack([]);
      setReviewPhotos(extracted);
      setReviewPageFilter('all');
      setReviewMatchFilter('all');
      setReviewSearchQuery('');
      setPhotoReviewModalVisible(true);
    } catch (e: any) {
      setUploadingBulkPhotos(false);
      setBulkPhotoModalVisible(false);
      setBulkPhotoProgress('');
      Alert.alert('Hata', e.message || 'PDF fotoğrafları çıkarılırken bir hata oluştu.');
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

      let currentStudents = students;
      if (!currentStudents || currentStudents.length === 0) {
        setBulkPhotoProgress('Okul öğrenci listesi yükleniyor...');
        try {
          const sRes = await apiRequest<any[]>(`sync/students?schoolId=${selectedSchool.id}`);
          if (sRes.success && sRes.data) {
            currentStudents = sRes.data;
            setStudents(sRes.data);
          }
        } catch (loadErr) {
          console.warn('[AI Fotoğraf] Öğrenciler çekilemedi:', loadErr);
        }
      }

      setBulkPhotoProgress('Yapay Zeka (Gemini Vision) ile öğrenci fotoğrafları taranıyor...');

      const apiKey = (selectedSchool.geminiApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY).trim();
      const model = (selectedGeminiModel || selectedSchool.geminiModel || (await getGeminiModel()) || DEFAULT_GEMINI_MODEL).trim();

      const res = await extractStudentPhotosWithAi(
        file.uri,
        file.name,
        file.mimeType || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        currentStudents,
        selectedSchool.id,
        apiKey,
        model,
        (progressText: any) => setBulkPhotoProgress(progressText),
        false // Önizleme ve onay için autoSave = false
      );

      setUploadingBulkPhotos(false);
      setBulkPhotoModalVisible(false);
      setBulkPhotoProgress('');

      if (!res.success) {
        Alert.alert('AI Fotoğraf Hatası', res.error || 'Fotoğraf analizi tamamlanamadı.');
        return;
      }

      const found = res.photos || [];
      if (found.length === 0) {
        Alert.alert('Fotoğraf Bulunamadı', 'Belgede vesikalık fotoğraf veya öğrenci numarası tespit edilemedi.');
        return;
      }

      const mappedPhotos: PdfExtractedStudentPhoto[] = found.map((p: any, idx: any) => {
        const cleanPNum = String(p.studentNumber || '').trim();
        const fallbackMatch = cleanPNum.length > 0
          ? (students.find((s: any) => {
            const sNum = String(s.student_number || '').trim();
            return sNum.length > 0 && (sNum === cleanPNum || sNum.replace(/^0+/, '') === cleanPNum.replace(/^0+/, ''));
          }) || null)
          : null;

        return {
          id: `ai_${idx}_${Date.now()}`,
          index: idx,
          tempUri: p.tempUri || p.photoBase64,
          fileSize: p.photoBase64 ? Math.round(p.photoBase64.length * 0.75) : 0,
          matchedStudent: p.matchedStudent || fallbackMatch,
          detectedNumber: p.studentNumber,
          detectedName: p.studentName,
          pageNumber: p.pageNumber || 1,
        };
      });

      setCachedPdfAsset(file);
      setCachedPdfPhotos(mappedPhotos);
      setInitialReviewPhotos(mappedPhotos);
      setPhotoHistoryStack([]);
      setReviewPhotos(mappedPhotos);
      setReviewPageFilter('all');
      setReviewMatchFilter('all');
      setReviewSearchQuery('');
      setPhotoReviewModalVisible(true);
    } catch (e: any) {
      setUploadingBulkPhotos(false);
      setBulkPhotoModalVisible(false);
      setBulkPhotoProgress('');
      console.error('[AI Foto UI Hata]:', e);
      Alert.alert('Hata', e.message || 'Fotoğraf çıkarma işlemi başarısız.');
    }
  };

  const handleRemovePhotoMatch = (photoId: string) => {
    setReviewPhotos((prev: any) =>
      prev.map((p: any) => {
        if (p.id === photoId) {
          return { ...p, matchedStudent: null, detectedNumber: undefined };
        }
        return p;
      })
    );
  };

  const handleOpenStudentPicker = async (photoId: string) => {
    setStudentPickerTargetId(photoId);
    setStudentPickerSearch('');
    setStudentPickerVisible(true);

    if ((!students || students.length === 0) && selectedSchool) {
      try {
        const sRes = await apiRequest<any[]>(`sync/students?schoolId=${selectedSchool.id}`);
        if (sRes.success && sRes.data) {
          setStudents(sRes.data);
        }
      } catch (err) {
        console.warn('[Öğrenci Seçici] Öğrenciler yüklenemedi:', err);
      }
    }
  };

  const handleAssignStudentToPhoto = (student: any) => {
    if (!studentPickerTargetId) return;
    const stdInfo = getPickerStudentInfo(student);
    setReviewPhotos((prev: any) =>
      prev.map((p: any) => {
        if (p.id === studentPickerTargetId) {
          return {
            ...p,
            matchedStudent: {
              ...student,
              student_number: stdInfo.number,
              studentNumber: stdInfo.number,
              full_name: stdInfo.fullName,
              fullName: stdInfo.fullName,
              class_name: stdInfo.className,
              first_name: stdInfo.fullName.split(' ')[0] || '',
              last_name: stdInfo.fullName.split(' ').slice(1).join(' ') || '',
            },
            detectedNumber: stdInfo.number,
          };
        }
        return p;
      })
    );
    setStudentPickerVisible(false);
    setStudentPickerTargetId(null);
  };

  const handleOpenPhotoPicker = (photoId: string) => {
    Alert.alert(
      'Fotoğraf Seç / Değiştir',
      'Bu öğrenci kartı için fotoğrafı nereden almak istersiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '🖼️ Cihaz Galerisinden Seç',
          onPress: async () => {
            try {
              const picked = await pickSinglePhotoFromSource('gallery');
              if (!picked) return;
              const manip = await manipulateAsync(
                picked.uri,
                [{ resize: { width: 300, height: 300 } }],
                { compress: 0.7, format: SaveFormat.JPEG, base64: true }
              );
              if (manip.base64) {
                const dataUri = `data:image/jpeg;base64,${manip.base64}`;
                setPhotoHistoryStack((prev: any) => [...prev.slice(-9), reviewPhotos]);
                setReviewPhotos((prev: any) =>
                  prev.map((p: any) =>
                    p.id === photoId
                      ? { ...p, tempUri: dataUri, fileSize: Math.round((manip.base64?.length || 0) * 0.75) }
                      : p
                  )
                );
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'Fotoğraf seçilemedi.');
            }
          },
        },
        {
          text: '📄 PDF Albümünden Seç',
          onPress: () => {
            setPhotoPickerTargetId(photoId);
            setPhotoPickerSearch('');
            setPhotoPickerVisible(true);
          },
        },
      ]
    );
  };

  const handleAssignPhotoToTarget = (selectedPhoto: PdfExtractedStudentPhoto) => {
    if (!photoPickerTargetId) return;
    setPhotoHistoryStack((prev: any) => [...prev.slice(-9), reviewPhotos]);
    setReviewPhotos((prev: any) =>
      prev.map((p: any) => {
        if (p.id === photoPickerTargetId) {
          return {
            ...p,
            tempUri: selectedPhoto.tempUri,
            fileSize: selectedPhoto.fileSize,
          };
        }
        return p;
      })
    );
    setPhotoPickerVisible(false);
    setPhotoPickerTargetId(null);
  };

  return {
    loadSchoolBatches,
    handleAddCurrentToBatches,
    handleMergeAllBatches,
    handleRemoveBatch,
    handleClearAllBatches,
    handleOpenTeacherScheduleInspector,
    handleStartEditCell,
    handleSaveCellSlot,
    handleDeleteCellSlot,
    handleShiftLessonHour,
    handlePromptMoveLessonHour,
    handleSaveExpectedHours,
    handleApplyTeacherInspectorChanges,
    handleAutoResolveConflictChain,
    handleRescanTeacherFromDocument,
    handleLoadActiveScheduleToDraft,
    cancelScheduleAnalysis,
    loadDuties,
    handleSaveDuty,
    handleDeleteDuty,
    handleDownloadDutyTemplate,
    handlePickAndParseDutyExcel,
    handleExportTeachersExcel,
    handleExportStudentsExcel,
    handleExportClassesExcel,
    handleExportLessonsExcel,
    handleExportScheduleExcel,
    handleExportYearlyPlanDetailsExcel,
    handleExportAuditLogsExcel,
    handleExportConsolidatedMaster,
    handleExportTeacherCredentials,
    handleExportStudentCredentials,
    handleExportParentCredentials,
    handlePickPdfAndExtractPhotos,
    handlePickAndExtractPhotosWithAi,
    handleRemovePhotoMatch,
    handleOpenStudentPicker,
    handleAssignStudentToPhoto,
    handleOpenPhotoPicker,
    handleAssignPhotoToTarget
  };
}
