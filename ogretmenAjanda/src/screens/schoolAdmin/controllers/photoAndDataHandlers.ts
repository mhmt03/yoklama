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
import { markAllMessagesAsRead, setCachedUnreadCount } from '../../../services/messageNotificationService';
import {
  parseSingleTeacherScheduleWithAi,
  saveTeacherScheduleToServer,
  saveSingleScheduleItemToServer,
  deleteSingleScheduleItemFromServer,
  fetchScheduleIntegrityStats,
  SingleTeacherScheduleItem,
} from '../../../services/singleTeacherScheduleParser';
import { getActiveSchool, updateSchool, deleteSchool, getSchools } from '../../../database/operations/schoolOperations';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SchoolSnapshotData,
  saveSchoolSnapshotToStorage,
  loadSchoolSnapshotFromStorage,
  getSchoolSnapshotLastSyncTime,
  fetchAndCacheSchoolSnapshot,
  patchLocalSchoolSnapshot,
  formatSyncTime,
} from '../../../services/schoolSnapshotService';
import { SchoolAdminCtx, generateDefaultTeacherUsername } from '../schoolAdminStyles';

export function createPhotoAndDataHandlers(ctx: SchoolAdminCtx) {
  const {
    setPhotoHistoryStack,
    reviewPhotos,
    setReviewPhotos,
    photoHistoryStack,
    initialReviewPhotos,
    cachedPdfAsset,
    setRescanningPage,
    students,
    selectedSchool,
    setStudents,
    reviewPageFilter,
    setCachedPdfPhotos,
    setSavingReviewPhotos,
    setPhotoReviewModalVisible,
    scheduleDailyHours,
    setLoadingScheduleStats,
    setScheduleStats,
    allSchoolSchedules,
    setLoadingAllSchedules,
    setAllSchoolSchedules,
    setAutoReconciling,
    setAutoFillingGaps,
    setSlotConflictItems,
    setEditingSlotData,
    classes,
    teachers,
    lessons,
    setSlotLessonSearchQuery,
    setSlotTeacherSearchQuery,
    setSlotModalVisible,
    setSavingSlot,
    slotConflictItems,
    editingSlotData,
    selectedTeacherForSchedule,
    setSingleTeacherParsing,
    setSingleTeacherModalVisible,
    selectedGeminiModel,
    setSingleTeacherPreview,
    singleTeacherPreview,
    setSavingSingleTeacher,
    setSchools,
    setSelectedSchool,
    setScheduleDailyHours,
    setLoading,
    setRefreshing,
    setGeminiApiKeyInput,
    setSelectedGeminiModel,
    setUsageStats,
    setTeachers,
    setClasses,
    setLessons,
    normalizeDayNumber,
    setDutiesList,
    setLastSyncTime,
    setSyncingSnapshot,
    setSchoolYearlyPlans,
    adminMessageScope,
    setLoadingMessages,
    setSchoolMessages,
    setAdminReplyingMessage,
    setAdminReplyContent,
    setAdminReplyModalVisible,
    adminReplyContent,
    adminReplyingMessage,
    setSendingAdminReply,
    adminNewMsgContent,
    setSendingAdminNewMsg,
    adminNewMsgTargetType,
    adminNewMsgTargetTeacher,
    setAdminNewMsgModalVisible,
    setAdminNewMsgContent,
    setAdminNewMsgTargetTeacher,
    newSchoolName,
    newSchoolDailyHours,
    newSchoolPhone,
    newSchoolApiKey,
    setCreateModalVisible,
    setNewSchoolName,
    setNewSchoolPhone,
    setNewSchoolApiKey,
    setNewSchoolDailyHours,
    setEditingSchoolObj,
    setEditSchoolName,
    setEditSchoolPhone,
    setEditSchoolAddress,
    setEditSchoolApiKey,
    setEditSchoolModel,
    setEditSchoolDailyHours,
    setEditModalVisible,
    editingSchoolObj,
    editSchoolName,
    setUpdatingSchool,
    editSchoolDailyHours,
    editSchoolPhone,
    editSchoolAddress,
    editSchoolApiKey,
    editSchoolModel,
    schools,
    setDeletingSchoolId,
    setSchoolSelectModalVisible,
    teacherFullName,
    setAddingTeacher,
    teacherBranch,
    teacherPhone,
    teacherEmail,
    newTeacherRole,
    setAddTeacherModalVisible,
    setCreatedTeacherResult,
    setTeacherFullName,
    setTeacherBranch,
    setTeacherPhone,
    setTeacherEmail,
    setNewTeacherRole,
    editingTeacher,
    setEditTeacherModalVisible,
    setEditingTeacher
  } = ctx;

  const handleOpenTeacherSchedule = (...args: any[]) => ctx.handleOpenTeacherSchedule(...args);

  const handleShiftPhotos = (direction: -1 | 1) => {
    Alert.alert(
      direction === -1 ? '◀ Fotoğrafları 1 Geri Kaydır (-1)' : 'Fotoğrafları 1 İleri Kaydır (+1) ▶',
      direction === -1
        ? 'Tüm listedeki fotoğraflar 1 basamak GERİYE kaydırılacaktır (Fotoğraf dizisi 1 basamak geriye hizalanır). Devam edilsin mi?'
        : 'Tüm listedeki fotoğraflar 1 basamak İLERİYE kaydırılacaktır (Fotoğraf dizisi 1 basamak ileriye hizalanır). Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Kaydır',
          onPress: () => {
            setPhotoHistoryStack((prev: any) => [...prev.slice(-9), reviewPhotos]);
            setReviewPhotos((prev: any) => {
              if (prev.length <= 1) return prev;
              const count = prev.length;
              return prev.map((item: any, idx: any) => {
                const srcIdx = (idx - direction + count) % count;
                return {
                  ...item,
                  tempUri: prev[srcIdx].tempUri,
                  fileSize: prev[srcIdx].fileSize,
                };
              });
            });
          },
        },
      ]
    );
  };

  const handleShiftPhotosFromIndex = (photoId: string, direction: -1 | 1) => {
    setPhotoHistoryStack((prev: any) => [...prev.slice(-9), reviewPhotos]);
    setReviewPhotos((prev: any) => {
      const targetIndex = prev.findIndex((p: any) => p.id === photoId);
      if (targetIndex === -1) return prev;

      const updated = [...prev];
      if (direction === -1) {
        // 1 Geri: Bu kart ve sonraki her kart, bir sonraki kartın fotoğrafını buraya çeker
        for (let i = targetIndex; i < updated.length - 1; i++) {
          updated[i] = {
            ...updated[i],
            tempUri: updated[i + 1].tempUri,
            fileSize: updated[i + 1].fileSize,
          };
        }
        // Son kartın fotoğrafı temizlenir (asla son kart kopyalanıp çoğaltılmaz!)
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          tempUri: '',
          fileSize: 0,
        };
      } else {
        // 1 İleri: Bu karttan sonraki her kart, bir önceki kartın fotoğrafını ileriye doğru öteler
        for (let i = updated.length - 1; i > targetIndex; i--) {
          updated[i] = {
            ...updated[i],
            tempUri: updated[i - 1].tempUri,
            fileSize: updated[i - 1].fileSize,
          };
        }
        // Hedef kartın fotoğrafı temizlenir (ASLA aynı fotoğraf duplicate edilmez!)
        updated[targetIndex] = {
          ...updated[targetIndex],
          tempUri: '',
          fileSize: 0,
        };
      }
      return updated;
    });
  };

  const handleUndoShift = () => {
    if (photoHistoryStack.length === 0) return;
    const previousState = photoHistoryStack[photoHistoryStack.length - 1];
    setPhotoHistoryStack((prev: any) => prev.slice(0, -1));
    setReviewPhotos(previousState);
  };

  const handleResetToInitial = () => {
    if (initialReviewPhotos.length === 0) return;
    Alert.alert(
      'İlk Sıralamaya Dön',
      'Tüm kaydırma ve manuel düzenlemeler iptal edilerek belgeden ilk taranan orijinal sıralamaya dönülecektir. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sıfırla',
          style: 'destructive',
          onPress: () => {
            setPhotoHistoryStack((prev: any) => [...prev.slice(-9), reviewPhotos]);
            setReviewPhotos(initialReviewPhotos);
            Alert.alert('Sıfırlandı', 'Orijinal fotoğraf eşleştirmeleri geri yüklendi.');
          },
        },
      ]
    );
  };

  const handleRescanCurrentPage = async () => {
    if (!cachedPdfAsset) {
      Alert.alert('Belge Seçilmedi', 'Önbellekte PDF belgesi bulunamadı. Lütfen yeni bir PDF seçiniz.');
      return;
    }
    setRescanningPage(true);
    try {
      let currentStudents = students;
      if (!currentStudents || currentStudents.length === 0) {
        const sRes = await apiRequest<any[]>(`sync/students?schoolId=${selectedSchool.id}`);
        if (sRes.success && sRes.data) {
          currentStudents = sRes.data;
          setStudents(sRes.data);
        }
      }

      const res = await extractPhotosFromPdf(currentStudents, cachedPdfAsset);
      if (!res.success || !res.extractedPhotos.length) {
        Alert.alert('Yeniden Tarama Hatası', res.error || 'Sayfa taranamadı.');
        return;
      }

      setPhotoHistoryStack((prev: any) => [...prev.slice(-9), reviewPhotos]);

      if (reviewPageFilter !== 'all') {
        const pagePhotos = res.extractedPhotos.filter((p: any) => p.pageNumber === reviewPageFilter);
        if (pagePhotos.length === 0) {
          Alert.alert('Bilgi', `Sayfa ${reviewPageFilter} için yeni fotoğraf tespit edilemedi.`);
          return;
        }

        setReviewPhotos((prev: any) => {
          const others = prev.filter((p: any) => p.pageNumber !== reviewPageFilter);
          return [...others, ...pagePhotos].sort((a: any, b: any) => a.index - b.index);
        });
        Alert.alert('Başarılı 🔄', `Sayfa ${reviewPageFilter} yeniden tarandı. Toplam ${pagePhotos.length} fotoğraf güncellendi.`);
      } else {
        setReviewPhotos(res.extractedPhotos);
        setCachedPdfPhotos(res.extractedPhotos);
        Alert.alert('Başarılı 🔄', `Tüm sayfalar baştan tarandı. Toplam ${res.extractedPhotos.length} fotoğraf güncellendi.`);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Yeniden tarama başarısız.');
    } finally {
      setRescanningPage(false);
    }
  };

  const handleSaveConfirmedPhotos = async () => {
    if (!selectedSchool) return;
    const toSave = reviewPhotos.filter((p: any) => p.matchedStudent !== null);
    if (toSave.length === 0) {
      Alert.alert('Uyarı', 'Kaydedilecek ve sisteme atanmış en az bir öğrenci fotoğrafı bulunmalıdır.');
      return;
    }

    Alert.alert(
      'Fotoğrafları Kaydet',
      `Toplam ${toSave.length} adet onaylanmış öğrenci fotoğrafı okul veritabanına aktarılacak. Onaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Kaydet',
          onPress: async () => {
            setSavingReviewPhotos(true);
            try {
              const preparedPhotos: { studentNumber: string; photoBase64: string; fileName: string }[] = [];
              for (const item of toSave) {
                const stdNo = item.matchedStudent?.student_number || item.detectedNumber;
                if (!stdNo) continue;
                try {
                  let b64 = '';
                  if (item.tempUri && item.tempUri.startsWith('data:image')) {
                    b64 = item.tempUri;
                  } else if (item.tempUri) {
                    const rawB64 = await readUriAsBase64(item.tempUri);
                    b64 = `data:image/jpeg;base64,${rawB64}`;
                  }
                  if (b64) {
                    preparedPhotos.push({
                      studentNumber: stdNo,
                      photoBase64: b64,
                      base64Data: b64,
                      fileName: `${stdNo}.jpg`,
                    } as any);
                  }
                } catch (bErr) {
                  console.warn('Fotoğraf base64 okuma hatası:', stdNo, bErr);
                }
              }

              if (preparedPhotos.length === 0) {
                Alert.alert('Hata', 'Fotoğraflar işlenemedi.');
                setSavingReviewPhotos(false);
                return;
              }

              // 50'şerli paketler halinde sunucuya aktar
              const BATCH_SIZE = 50;
              let totalSaved = 0;
              for (let i = 0; i < preparedPhotos.length; i += BATCH_SIZE) {
                const chunk = preparedPhotos.slice(i, i + BATCH_SIZE);
                const apiRes = await apiRequest<{ updatedCount: number; successCount?: number }>(
                  `uploads/batch-student-photos?schoolId=${selectedSchool.id}`,
                  'POST',
                  {
                    schoolId: selectedSchool.id,
                    schoolCode: selectedSchool.schoolCode || selectedSchool.code,
                    photos: chunk,
                  }
                );
                if (apiRes.success) {
                  totalSaved += apiRes.data?.updatedCount || apiRes.data?.successCount || chunk.length;
                }
              }

              Alert.alert(
                'Tamamlandı 🎉',
                `Toplam ${totalSaved} öğrencinin vesikalık fotoğrafı başarıyla yüklendi ve sisteme kaydedildi.`
              );
              setPhotoReviewModalVisible(false);
              setReviewPhotos([]);
              loadStudents(selectedSchool.id);
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'Fotoğraflar sunucuya kaydedilirken hata oluştu.');
            } finally {
              setSavingReviewPhotos(false);
            }
          },
        },
      ]
    );
  };

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

    // 1. FAST OFFLINE: Hafızada zaten okulun programı varsa 0ms ile hemen dön
    if (allSchoolSchedules && allSchoolSchedules.length > 0) {
      setLoadingAllSchedules(false);
      return;
    }

    // 2. FAST OFFLINE: Telefondaki yerel snapshot'tan anında yükle (0ms)
    try {
      const cached = await loadSchoolSnapshotFromStorage(selectedSchool.id);
      if (cached?.schedules && cached.schedules.length > 0) {
        setAllSchoolSchedules(cached.schedules);
        setLoadingAllSchedules(false);
        return; // Yerel veri mevcut, çevrimdışı 0ms olarak tamamla!
      }
    } catch { }

    // 3. Yalnızca cihazda hiç program verisi yoksa sunucudan çekmeyi dene
    setLoadingAllSchedules(true);
    try {
      const res = await apiRequest<any[]>(`sync/schedules?schoolId=${selectedSchool.id}`);
      if (res.success && res.data) {
        setAllSchoolSchedules(res.data);
        await patchLocalSchoolSnapshot(selectedSchool.id, { schedules: res.data });
      }
    } catch (e) {
      console.error('Error loading all schedules:', e);
    } finally {
      setLoadingAllSchedules(false);
    }
  };

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
            `${res.data?.message}\n\nYapılan işlemlerden örnekler:\n• ${sampleDetails}${(res.data?.details || []).length > 6 ? `\n... ve ${(res.data?.details || []).length - 6} işlem daha.` : ''
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
                    `${res.data?.message}\n\nYerleştirilen derslerden örnekler:\n• ${sampleDetails}${(res.data?.details || []).length > 6 ? `\n... ve ${(res.data?.details || []).length - 6} ders daha.` : ''
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
                const remaining = slotConflictItems.filter((ci: any) => ci.id !== item.id);
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
                Alert.alert('Hata', (res as any).message || 'Çakışan ders silinemedi.');
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
        Alert.alert('Hata', (res as any).message || 'Ders hücresi kaydedilemedi.');
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
                Alert.alert('Hata', (res as any).message || 'Ders hücresi silinemedi.');
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
        Alert.alert('Başarılı 🎉', (res as any).message);
        setSingleTeacherModalVisible(false);
        setSingleTeacherPreview(null);
        await loadAllSchedules();
        await loadScheduleStats();
        if (selectedTeacherForSchedule?.fullName === singleTeacherPreview.teacherName) {
          handleOpenTeacherSchedule(selectedTeacherForSchedule);
        }
      } else {
        Alert.alert('Hata', (res as any).message || 'Program kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Kaydetme sırasında hata oluştu.');
    } finally {
      setSavingSingleTeacher(false);
    }
  };

  const loadSchools = async () => {
    let hasCached = false;
    // 1. FAST OFFLINE: Önce cihazdaki kayıtlı okulları anında getir (0ms)
    try {
      const cachedSchoolsRaw = await AsyncStorage.getItem('@cached_admin_schools');
      if (cachedSchoolsRaw) {
        const cached = JSON.parse(cachedSchoolsRaw);
        if (Array.isArray(cached) && cached.length > 0) {
          hasCached = true;
          setSchools(cached);
          const current = selectedSchool ? cached.find((s: any) => s.id === selectedSchool.id) || cached[0] : cached[0];
          setSelectedSchool(current);
          if (current.dailyLessonHours && current.dailyLessonHours > 0) {
            setScheduleDailyHours(current.dailyLessonHours);
          }
          await loadAllSchoolData(current.id);
          setLoading(false);
          setRefreshing(false);
        }
      }
    } catch { }

    // 2. Canlı sunucudan arka planda oku (Yerelde veri varsa UI'yi asla kilitleme)
    if (hasCached) {
      // Arka planda sessizce dene, internet kapalıysa UI beklemesin
      apiRequest<any[]>('schools/my-schools', 'GET', undefined, false, true).then(async (res: any) => {
        if (res.success && res.data && res.data.length > 0) {
          setSchools(res.data);
          await AsyncStorage.setItem('@cached_admin_schools', JSON.stringify(res.data));
        }
      }).catch(() => { });
      return;
    }

    // 3. İlk açılış ve yerelde okul yoksa sunucudan bekle
    try {
      const res = await apiRequest<any[]>('schools/my-schools');
      if (res.success && res.data) {
        setSchools(res.data);
        await AsyncStorage.setItem('@cached_admin_schools', JSON.stringify(res.data));
        if (res.data.length > 0) {
          const current = selectedSchool ? res.data.find((s: any) => s.id === selectedSchool.id) || res.data[0] : res.data[0];
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
      if (!selectedSchool) {
        Alert.alert('Hata', e.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applySnapshotData = (snap: SchoolSnapshotData) => {
    if (snap.teachers) setTeachers(snap.teachers);
    if (snap.classes && snap.classes.length > 0) setClasses(snap.classes);
    if (snap.lessons && snap.lessons.length > 0) setLessons(snap.lessons);
    if (snap.schedules && snap.schedules.length > 0) setAllSchoolSchedules(snap.schedules);
    if (snap.duties && snap.duties.length > 0) {
      const normalizedDuties = snap.duties.map((d: any) => ({
        ...d,
        dayOfWeek: normalizeDayNumber(d.dayOfWeek),
      }));
      setDutiesList(normalizedDuties);
    }
    if (snap.students && snap.students.length > 0) setStudents(snap.students);
    if (snap.dailyLessonHours && snap.dailyLessonHours > 0) {
      setScheduleDailyHours(snap.dailyLessonHours);
    }
    if (snap.syncedAt) setLastSyncTime(snap.syncedAt);
  };

  const handleManualSyncSnapshot = async () => {
    if (!selectedSchool) return;
    setSyncingSnapshot(true);
    try {
      const snap = await fetchAndCacheSchoolSnapshot(selectedSchool.id);
      if (snap) {
        applySnapshotData(snap);
        Alert.alert(
          'Veriler Eşitlendi 🎉',
          `Sunucudaki güncel okul verileri telefona başarıyla indirildi:\n\n` +
          `• Öğretmenler: ${snap.teachers.length}\n` +
          `• Şubeler: ${snap.classes.length}\n` +
          `• Dersler: ${snap.lessons.length}\n` +
          `• Haftalık Ders Saatleri: ${snap.schedules.length}\n` +
          `• Nöbetçi Kayıtları: ${snap.duties.length}\n` +
          `• Öğrenciler: ${snap.students?.length || 0}\n\n` +
          `Artık Boş Ders Radarı, Şubede Kim Var, Öğretmen Programı ve Fotoğraflı Öğrenci Listeleri telefondan anında (0ms) çalışacaktır.`
        );
      } else {
        Alert.alert('Eşitleme Uyarısı', 'Sunucudan veri paketi alınamadı. İnternet bağlantınızı kontrol ediniz.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Eşitleme sırasında hata oluştu: ' + (e?.message || e));
    } finally {
      setSyncingSnapshot(false);
    }
  };

  const loadAllSchoolData = async (schoolId: string) => {
    // 1. FAST OFFLINE: Önce telefondaki yerel depodan anında yükle (0ms gecikme)
    const cached = await loadSchoolSnapshotFromStorage(schoolId);
    if (cached) {
      applySnapshotData(cached);
      setLoading(false);
      setRefreshing(false);
      return; // Yerel önbellek mevcut, 0ms anında hazır!
    }

    // 2. Yalnızca yerel önbellek yoksa ilk açılışta sunucudan snapshot paketini çek
    setLoading(true);
    try {
      const snap = await fetchAndCacheSchoolSnapshot(schoolId);
      if (snap) {
        applySnapshotData(snap);
      }
    } catch { } finally {
      setLoading(false);
      setRefreshing(false);
    }
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

  const loadSchoolMessages = async (targetSchoolId?: string, customScope?: 'personal' | 'all' | 'sent') => {
    const sId = targetSchoolId || selectedSchool?.id;
    if (!sId) return;
    const scopeToUse = customScope || adminMessageScope;
    setLoadingMessages(true);
    try {
      const scopeParam = scopeToUse ? `&scope=${scopeToUse}` : '';
      const res = await apiRequest<any[]>(`messages?schoolId=${sId}${scopeParam}`);
      if (res.success && res.data) {
        setSchoolMessages(res.data);
        // İdareci mesajları görüntülediğinde sunucuda okundu işaretle ve bildirim sayacını sıfırla
        markAllMessagesAsRead(String(sId));
        setCachedUnreadCount(0);
      }
    } catch (e: any) {
      console.log('Mesajlar yüklenirken hata:', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleOpenAdminReply = (msg: any) => {
    setAdminReplyingMessage(msg);
    setAdminReplyContent('');
    setAdminReplyModalVisible(true);
  };

  const handleSendAdminReply = async () => {
    if (!adminReplyContent.trim()) {
      Alert.alert('Uyarı', 'Lütfen yanıt mesajınızı yazınız.');
      return;
    }
    if (!adminReplyingMessage || !selectedSchool) return;

    setSendingAdminReply(true);
    try {
      const rRole = (adminReplyingMessage.senderRole || '').toUpperCase();
      const targetRole = rRole === 'TEACHER' ? 'SPECIFIC_TEACHER' : (rRole === 'STUDENT' ? 'SPECIFIC_STUDENT' : 'PARENT');

      const payload = {
        schoolId: selectedSchool.id,
        receiverId: adminReplyingMessage.senderId,
        receiverName: adminReplyingMessage.senderName,
        targetRole,
        targetDescription: `Yanıt: ${adminReplyingMessage.senderName}`,
        content: adminReplyContent.trim(),
        replyToMessageId: adminReplyingMessage.id,
        replyToContent: adminReplyingMessage.content ? (adminReplyingMessage.content.length > 80 ? adminReplyingMessage.content.substring(0, 77) + '...' : adminReplyingMessage.content) : undefined,
      };

      const res = await apiRequest('messages', 'POST', payload);
      if (res.success) {
        Alert.alert('Başarılı 📨', `${adminReplyingMessage.senderName} kişisine yanıtınız iletildi.`);
        setAdminReplyModalVisible(false);
        setAdminReplyingMessage(null);
        setAdminReplyContent('');
        loadSchoolMessages(String(selectedSchool.id));
      } else {
        Alert.alert('Hata', res.error || 'Yanıt gönderilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Yanıt gönderilemedi.');
    } finally {
      setSendingAdminReply(false);
    }
  };

  const handleSendAdminNewMessage = async () => {
    if (!adminNewMsgContent.trim()) {
      Alert.alert('Uyarı', 'Lütfen mesaj metnini yazınız.');
      return;
    }
    if (!selectedSchool) return;

    setSendingAdminNewMsg(true);
    try {
      let targetDesc = 'Tüm Öğretmenler';
      let recId = undefined;
      let recName = undefined;

      if (adminNewMsgTargetType === 'SPECIFIC_TEACHER') {
        if (!adminNewMsgTargetTeacher) {
          Alert.alert('Uyarı', 'Lütfen bir öğretmen seçiniz.');
          setSendingAdminNewMsg(false);
          return;
        }
        targetDesc = adminNewMsgTargetTeacher.fullName;
        recId = adminNewMsgTargetTeacher.id;
        recName = adminNewMsgTargetTeacher.fullName;
      } else if (adminNewMsgTargetType === 'ALL') {
        targetDesc = 'Tüm Okul (Genel Duyuru)';
      }

      const payload = {
        schoolId: selectedSchool.id,
        targetRole: adminNewMsgTargetType,
        targetDescription: targetDesc,
        receiverId: recId,
        receiverName: recName,
        content: adminNewMsgContent.trim(),
      };

      const res = await apiRequest('messages', 'POST', payload);
      if (res.success) {
        Alert.alert('Başarılı 📨', `Mesajınız "${targetDesc}" hedefine başarıyla iletildi.`);
        setAdminNewMsgModalVisible(false);
        setAdminNewMsgContent('');
        setAdminNewMsgTargetTeacher(null);
        loadSchoolMessages(String(selectedSchool.id));
      } else {
        Alert.alert('Hata', res.error || 'Mesaj iletilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Mesaj gönderilemedi.');
    } finally {
      setSendingAdminNewMsg(false);
    }
  };

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
            (s: any) => (s.code && s.code.toUpperCase() === target.code?.toUpperCase()) || s.name.toLowerCase() === target.name?.toLowerCase()
          );
          if (match) {
            await updateSchool(match.id, editSchoolName.trim(), match.color, target.code);
          }
          try {
            const { updateActiveUserSession } = await import('../../../services/apiClient');
            await updateActiveUserSession((prev: any) => ({
              ...prev,
              schoolName: prev.schoolCode?.toUpperCase() === target.code?.toUpperCase() ? editSchoolName.trim() : prev.schoolName,
              affiliatedSchools: prev.affiliatedSchools?.map((s: any) =>
                (s.code && s.code.toUpperCase() === target.code?.toUpperCase()) || s.id === target.id
                  ? { ...s, name: editSchoolName.trim() }
                  : s
              ),
            }));
          } catch { }
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
                    (s: any) => s.code && s.code.toUpperCase() === schoolToDelete.code?.toUpperCase()
                  );
                  if (match && localSchools.length > 1) {
                    await deleteSchool(match.id);
                  }
                  try {
                    const { updateActiveUserSession } = await import('../../../services/apiClient');
                    await updateActiveUserSession((prev: any) => ({
                      ...prev,
                      affiliatedSchools: prev.affiliatedSchools?.filter((s: any) =>
                        (s.code && s.code.toUpperCase() !== schoolToDelete.code?.toUpperCase()) && s.id !== schoolToDelete.id
                      ),
                    }));
                  } catch { }
                } catch (localErr) {
                  console.warn('Yerel okul silme uyarısı:', localErr);
                }

                setEditModalVisible(false);
                setSchoolSelectModalVisible(false);

                // Kalan okullardan birini seç
                const remaining = schools.filter((s: any) => s.id !== schoolToDelete.id);
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
      const cleanUsername = editingTeacher.username ? editingTeacher.username.trim().toLowerCase() : undefined;
      const res = await apiRequest(`schools/teachers/${editingTeacher.id}/details`, 'PUT', {
        fullName: editingTeacher.fullName.trim(),
        username: cleanUsername,
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
        const updated = teachers.map((t: any) =>
          t.id === editingTeacher.id ? { ...t, ...editingTeacher, username: cleanUsername || t.username } : t
        );
        setTeachers(updated);
        if (selectedSchool) {
          patchLocalSchoolSnapshot(selectedSchool.id, { teachers: updated });
        }
        setEditingTeacher(null);
      } else {
        Alert.alert('Hata', (res as any)?.message || res.error || 'Öğretmen bilgileri güncellenemedi.');
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
              const updated = teachers.filter((t: any) => t.id !== teacherId);
              setTeachers(updated);
              if (selectedSchool) {
                patchLocalSchoolSnapshot(selectedSchool.id, { teachers: updated });
              }
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleResetTeacherPassword = (teacherId: string, teacherName: string, teacherUsername?: string) => {
    const uName = teacherUsername || generateDefaultTeacherUsername(teacherName);
    Alert.alert(
      'Şifreyi Sıfırla',
      `"${teacherName}" öğretmeninin (${uName}) şifresini "1234" olarak sıfırlamak istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Şifreyi 1234 Yap',
          onPress: async () => {
            const res = await apiRequest(`schools/teachers/${teacherId}/reset-password`, 'POST', { newPassword: '1234' });
            if (res.success) {
              Alert.alert('Başarılı 🔑', `Kullanıcı Adı: ${uName}\nŞifre: 1234\n\nŞifre başarıyla 1234 olarak güncellendi.`);
            } else {
              Alert.alert('Hata', res.error || 'Şifre güncellenemedi.');
            }
          },
        },
      ]
    );
  };

  return {
    handleShiftPhotos,
    handleShiftPhotosFromIndex,
    handleUndoShift,
    handleResetToInitial,
    handleRescanCurrentPage,
    handleSaveConfirmedPhotos,
    loadScheduleStats,
    loadAllSchedules,
    executeAutoReconcile,
    handleAutoReconcileSchedule,
    handleAutoFillGapsSchedule,
    handleOpenSlotModal,
    handleDeleteSpecificConflictItem,
    handleSaveSlot,
    handleDeleteSlot,
    handlePickSingleTeacherSchedulePhoto,
    handleSaveSingleTeacherSchedule,
    loadSchools,
    applySnapshotData,
    handleManualSyncSnapshot,
    loadAllSchoolData,
    handleSelectSchool,
    handleChangeDailyHours,
    loadTeachers,
    loadClasses,
    loadLessons,
    loadStudents,
    loadSchoolMessages,
    handleOpenAdminReply,
    handleSendAdminReply,
    handleSendAdminNewMessage,
    handleCopyCode,
    handleCreateSchool,
    handleOpenEditSchool,
    handleUpdateSchool,
    handleDeleteSchool,
    handleCreateTeacher,
    handleUpdateTeacher,
    handleDeleteTeacher,
    handleResetTeacherPassword
  };
}
