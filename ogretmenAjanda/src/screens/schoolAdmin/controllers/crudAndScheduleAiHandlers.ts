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
import {
  inspectExcelWorkbook,
  parseInitialExcelSchedule,
  ExcelInspectionResult,
} from '../../../services/excelScheduleParser';
import { countPdfPages } from '../../../utils/pdfSliceService';
import { parseStudentsFromExcel, saveParsedStudentsToServer, ParsedExcelStudent, generateStudentTemplateExcel } from '../../../services/excelStudentParser';
import { parseStudentsFromExcelWithAi, AiStudentParseResult } from '../../../services/aiStudentExcelParser';
import { setActiveUserRole, logoutUserRole } from '../../../utils/roleService';
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

export function createCrudAndScheduleAiHandlers(ctx: SchoolAdminCtx) {
  const {
    createdTeacherResult,
    selectedSchool,
    newClassGrade,
    newClassSection,
    setAddingClass,
    setAddClassModalVisible,
    setNewClassSection,
    classes,
    setClasses,
    newLessonName,
    setAddingLesson,
    newLessonShortCode,
    newLessonGrade,
    newLessonHours,
    setAddLessonModalVisible,
    setNewLessonName,
    setNewLessonShortCode,
    lessons,
    setLessons,
    newStudentNo,
    newStudentName,
    newStudentGrade,
    newStudentSection,
    setAddingStudent,
    newStudentParentName,
    newStudentParentPhone,
    newStudentPhone,
    setAddStudentModalVisible,
    setNewStudentNo,
    setNewStudentName,
    setNewStudentGrade,
    setNewStudentSection,
    setNewStudentParentName,
    setNewStudentParentPhone,
    setNewStudentPhone,
    students,
    setStudents,
    editingStudent,
    setUpdatingStudent,
    setEditStudentModalVisible,
    setEditingStudent,
    setSelectedStudentForCreds,
    setCustomResetPassInput,
    setCustomParentResetPassInput,
    setShowCredPassword,
    setShowParentCredPassword,
    setCredentialsModalVisible,
    selectedStudentForCreds,
    setResettingPassword,
    setResettingParentPassword,
    setSelectedAdminStudent,
    setAdminStudentModalVisible,
    setLoadingStudentDetail,
    setStudentEvaluations,
    setStudentAssignments,
    setStudentLocalNotes,
    setStudentLocalGrades,
    setStudentLocalQuizzes,
    cachedPdfPhotos,
    setSingleStudentPdfTarget,
    setSingleStudentPdfSearch,
    setSingleStudentPdfModalVisible,
    setCachedPdfAsset,
    setCachedPdfPhotos,
    singleStudentPdfTarget,
    setSingleStudentPdfUploading,
    setPhotoUploadingId,
    setExcludedTeachers,
    setExcludedClasses,
    setExcludedLessons,
    parsedSchedule,
    setExcelInspection,
    setSelectedExcelSheet,
    setExcelPreviewModalVisible,
    setPendingScheduleFile,
    setCachedScheduleDoc,
    setCountingPdfPages,
    setPdfTotalPages,
    setSchedulePreOptionsModalVisible,
    setPdfStartPage,
    setPdfPageRangeMode,
    setPdfEndPage,
    pendingScheduleFile,
    optExtractTeachers,
    optExtractClasses,
    optExtractLessons,
    optExtractScheduleItems,
    teachers,
    pdfTotalPages,
    pdfPageRangeMode,
    pdfStartPage,
    pdfEndPage,
    aiCancelledRef,
    setLastAnalyzedPageRange,
    setAiModalVisible,
    setAiParsing,
    setParsedSchedule,
    setShowTeachersList,
    setShowClassesList,
    setShowLessonsList,
    setAiElapsedSeconds,
    setAiStageText,
    selectedGeminiModel,
    setAiActiveModel,
    optAutoHealBlocks,
    setCachedScheduleDraft,
    setSaveTeachersChecked,
    setSaveClassesChecked,
    setSaveLessonsChecked,
    setSaveScheduleChecked,
    setUsageStats,
    excludedTeachers,
    excludedClasses,
    excludedLessons,
    saveTeachersChecked,
    saveClassesChecked,
    saveLessonsChecked,
    saveScheduleChecked,
    scheduleSaveMode,
    setAiSaving,
    setExcelModalVisible,
    setExcelParsing,
    setParsedExcelStudents,
    setDetectedExcelClasses,
    setExcelSchoolName,
    parsedExcelStudents,
    setExcelSaving,
    detectedExcelClasses,
    setAiStudentModalVisible,
    setAiStudentParsing,
    setAiStudentResult,
    aiStudentResult,
    setAiStudentSaving,
    onRoleChange,
    navigation,
    setAdminNewUsername,
    setAdminOldPassword,
    setAdminNewPassword,
    setAdminConfirmPassword,
    setAdminCredentialsModalVisible
  } = ctx;

  const loadStudents = (...args: any[]) => ctx.loadStudents(...args);
  const loadAllSchoolData = (...args: any[]) => ctx.loadAllSchoolData(...args);
  const loadClasses = (...args: any[]) => ctx.loadClasses(...args);

  const handleCopyTeacherCredentials = async () => {
    if (!createdTeacherResult) return;
    const text = `🎓 Öğretmen Ajanda Giriş Bilgileriniz:\n\nOkul Kodu: ${createdTeacherResult.schoolCode || selectedSchool?.code}\nKullanıcı Adı: ${createdTeacherResult.username}\nŞifre: ${createdTeacherResult.password || '1234'}\n\nUygulamayı açıp "Öğretmen" bölümünden bu bilgilerle sisteme bağlanabilirsiniz.`;
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı 📋', 'Giriş bilgileri panoya kopyalandı. WhatsApp ile iletebilirsiniz.');
  };

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
        const newClassItem = (res.data as any) || {
          id: String(Date.now()),
          grade: newClassGrade.trim(),
          section: newClassSection.trim(),
          className: `${newClassGrade.trim()}-${newClassSection.trim()}`,
          name: `${newClassGrade.trim()}/${newClassSection.trim()}`,
        };
        const updated = [...classes, newClassItem];
        setClasses(updated);
        if (selectedSchool) {
          patchLocalSchoolSnapshot(selectedSchool.id, { classes: updated });
        }
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
              const updated = classes.filter((c: any) => c.id !== classId);
              setClasses(updated);
              if (selectedSchool) {
                patchLocalSchoolSnapshot(selectedSchool.id, { classes: updated });
              }
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

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
        const newLessonItem = (res.data as any) || {
          id: String(Date.now()),
          name: newLessonName.trim(),
          shortCode: newLessonShortCode.trim() || '',
          grade: newLessonGrade.trim() || '',
          weeklyHours: parseInt(newLessonHours) || 2,
        };
        const updated = [...lessons, newLessonItem];
        setLessons(updated);
        if (selectedSchool) {
          patchLocalSchoolSnapshot(selectedSchool.id, { lessons: updated });
        }
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
              const updated = lessons.filter((l: any) => l.id !== lessonId);
              setLessons(updated);
              if (selectedSchool) {
                patchLocalSchoolSnapshot(selectedSchool.id, { lessons: updated });
              }
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleCreateStudent = async () => {
    if (!newStudentNo.trim() || !newStudentName.trim() || !selectedSchool) {
      Alert.alert('Uyarı', 'Lütfen öğrenci numarası ve adını giriniz.');
      return;
    }

    let gradeVal = newStudentGrade.trim();
    let sectionVal = newStudentSection.trim().toUpperCase();

    // Roma rakamları desteği
    const romanMap: Record<string, string> = { IX: '9', X: '10', XI: '11', XII: '12' };

    // Eğer şubeye "11-A", "11/A", "11A", "XI-A" yazılmışsa
    if (!gradeVal && sectionVal) {
      const match = sectionVal.match(/^(\d{1,2}|IX|X|XI|XII)[\s\-\/_]*(.*)$/i);
      if (match) {
        const prefix = match[1].toUpperCase();
        gradeVal = romanMap[prefix] || match[1];
        sectionVal = match[2]?.trim().replace(/^[\s\-\/_]+/, '') || '';
      }
    } else if (gradeVal && (!sectionVal || sectionVal.length > 2)) {
      // Eğer kademeye "11-A" yazılmışsa
      const match = gradeVal.match(/^(\d{1,2}|IX|X|XI|XII)[\s\-\/_]*(.*)$/i);
      if (match && match[2]) {
        const prefix = match[1].toUpperCase();
        gradeVal = romanMap[prefix] || match[1];
        if (!sectionVal) {
          sectionVal = match[2]?.trim().replace(/^[\s\-\/_]+/, '').toUpperCase() || '';
        }
      }
    }

    if (romanMap[gradeVal.toUpperCase()]) {
      gradeVal = romanMap[gradeVal.toUpperCase()];
    }

    if (!gradeVal) {
      Alert.alert(
        'Sınıf Düzeyi Zorunludur',
        'Lütfen öğrencinin sınıf düzeyini (örn: 9, 10, 11, 12) giriniz veya şube alanına "11-A" şeklinde belirtiniz.'
      );
      return;
    }

    setAddingStudent(true);
    try {
      const res = await apiRequest('sync/students/single', 'POST', {
        schoolId: selectedSchool.id,
        studentNumber: newStudentNo.trim(),
        fullName: newStudentName.trim(),
        grade: gradeVal,
        section: sectionVal,
        parentName: newStudentParentName.trim() || undefined,
        parentPhone: newStudentParentPhone.trim() || undefined,
        studentPhone: newStudentPhone.trim() || undefined,
      });

      if (res.success) {
        Alert.alert('Başarılı', `${newStudentName} doğrudan sunucuya eklendi.`);
        setAddStudentModalVisible(false);
        setNewStudentNo('');
        setNewStudentName('');
        setNewStudentGrade('');
        setNewStudentSection('');
        setNewStudentParentName('');
        setNewStudentParentPhone('');
        setNewStudentPhone('');
        const newStd = (res.data as any) || {
          id: String(Date.now()),
          studentNumber: newStudentNo.trim(),
          fullName: newStudentName.trim(),
          grade: gradeVal,
          section: sectionVal,
          parentName: newStudentParentName.trim(),
          parentPhone: newStudentParentPhone.trim(),
          studentPhone: newStudentPhone.trim(),
        };
        const updated = [...students, newStd];
        setStudents(updated);
        if (selectedSchool) {
          patchLocalSchoolSnapshot(selectedSchool.id, { students: updated });
        }
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

    let gradeVal = (editingStudent.grade || '').trim();
    let sectionVal = (editingStudent.section || '').trim().toUpperCase();

    const romanMap: Record<string, string> = { IX: '9', X: '10', XI: '11', XII: '12' };
    if (!gradeVal && sectionVal) {
      const match = sectionVal.match(/^(\d{1,2}|IX|X|XI|XII)[\s\-\/_]*(.*)$/i);
      if (match) {
        const prefix = match[1].toUpperCase();
        gradeVal = romanMap[prefix] || match[1];
        sectionVal = match[2]?.trim().replace(/^[\s\-\/_]+/, '') || '';
      }
    }

    if (romanMap[gradeVal.toUpperCase()]) {
      gradeVal = romanMap[gradeVal.toUpperCase()];
    }

    setUpdatingStudent(true);
    try {
      const res = await apiRequest(`sync/students/${editingStudent.id}`, 'PUT', {
        studentNumber: editingStudent.studentNumber.trim(),
        fullName: editingStudent.fullName.trim(),
        grade: gradeVal || '9',
        section: sectionVal || 'A',
        parentName: editingStudent.parentName || undefined,
        parentPhone: editingStudent.parentPhone || undefined,
        studentPhone: editingStudent.studentPhone || undefined,
        photoPath: editingStudent.photoPath || undefined,
      });

      if (res.success) {
        Alert.alert('Başarılı', 'Öğrenci bilgileri doğrudan sunucuda güncellendi.');
        setEditStudentModalVisible(false);
        const updated = students.map((s: any) =>
          s.id === editingStudent.id ? { ...s, ...editingStudent, grade: gradeVal || '9', section: sectionVal || 'A' } : s
        );
        setStudents(updated);
        if (selectedSchool) {
          patchLocalSchoolSnapshot(selectedSchool.id, { students: updated });
        }
        setEditingStudent(null);
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
              const updated = students.filter((s: any) => s.id !== studentId);
              setStudents(updated);
              if (selectedSchool) {
                patchLocalSchoolSnapshot(selectedSchool.id, { students: updated });
              }
            } else {
              Alert.alert('Hata', res.error || 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleOpenCredentialsModal = (student: any) => {
    setSelectedStudentForCreds(student);
    setCustomResetPassInput('');
    setCustomParentResetPassInput('');
    setShowCredPassword(false);
    setShowParentCredPassword(false);
    setCredentialsModalVisible(true);
  };

  const handleResetStudentPassword = async (customPass?: string) => {
    if (!selectedStudentForCreds || !selectedSchool) return;

    const studentName = selectedStudentForCreds.fullName;
    const defaultPass = `ooo_${selectedStudentForCreds.studentNumber}`;
    const targetPass = customPass?.trim() || defaultPass;

    Alert.alert(
      'Öğrenci Şifresini Sıfırla',
      `"${studentName}" öğrencisinin portal giriş şifresi:\n\n👉 "${targetPass}"\n\nolarak güncellenecektir. (Veli şifresi etkilenmez). Onaylıyor musunuz?`,
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
                  '✅ Öğrenci Şifresi Güncellendi',
                  `"${studentName}" için yeni öğrenci giriş şifresi:\n\n🔑 Şifre: ${res.data?.password || targetPass}\n\n(Veli şifresi korunmuştur).`
                );
                setCustomResetPassInput('');
                // Local nesneyi güncelle
                setSelectedStudentForCreds({
                  ...selectedStudentForCreds,
                  studentCustomPassword: res.data?.password || targetPass
                });
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

  const handleResetParentPassword = async (customPass?: string) => {
    if (!selectedStudentForCreds || !selectedSchool) return;

    const studentName = selectedStudentForCreds.fullName;
    const defaultPass = `vvv_${selectedStudentForCreds.studentNumber}`;
    const targetPass = customPass?.trim() || defaultPass;

    Alert.alert(
      'Veli Şifresini Sıfırla',
      `"${studentName}" öğrencisinin veli portalı giriş şifresi:\n\n👉 "${targetPass}"\n\nolarak güncellenecektir. (Öğrenci şifresi etkilenmez). Onaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Sıfırla',
          onPress: async () => {
            setResettingParentPassword(true);
            try {
              const res = await apiRequest<{ success: boolean; message: string; password: string }>(
                `schools/${selectedSchool.id}/students/${selectedStudentForCreds.id}/reset-parent-password`,
                'POST',
                { newPassword: customPass?.trim() || undefined }
              );

              if (res.success) {
                Alert.alert(
                  '✅ Veli Şifresi Güncellendi',
                  `"${studentName}" velisi için yeni giriş şifresi:\n\n🔑 Veli Şifresi: ${res.data?.password || targetPass}\n\n(Öğrencinin şifresi korunmuştur).`
                );
                setCustomParentResetPassInput('');
                // Local nesneyi güncelle
                setSelectedStudentForCreds({
                  ...selectedStudentForCreds,
                  parentCustomPassword: res.data?.password || targetPass
                });
              } else {
                Alert.alert('Hata', res.error || 'Veli şifresi sıfırlanamadı.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'İşlem başarısız.');
            } finally {
              setResettingParentPassword(false);
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
    const stdPass = student.studentCustomPassword || `ooo_${sNo}`;
    const parentPass = student.parentCustomPassword || `vvv_${sNo}`;

    return `Sayın ${parentName},\n\n${schoolName} bünyesinde kayıtlı öğrencimiz ${sName} (${sGrade} - No: ${sNo}) için Öğrenci ve Veli Portalı erişim bilgileriniz:\n\n🏫 Okul Kodu: ${schoolCode}\n\n🎓 ÖĞRENCİ GİRİŞİ:\n• Kullanıcı Adı: ${sNo}\n• Şifre: ${stdPass}\n\n👨‍👩‍👧 VELİ GİRİŞİ:\n• Kullanıcı Adı: ${sNo} (veya veli cep telefonu)\n• Şifre: ${parentPass}\n\nPortal üzerinden ders programını, ödevleri, quizleri ve öğretmen görüşlerini anlık olarak takip edebilirsiniz.`;
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

  const handleOpenStudentDetail = async (student: any) => {
    setSelectedAdminStudent(student);
    setAdminStudentModalVisible(true);
    setLoadingStudentDetail(true);
    setStudentEvaluations([]);
    setStudentAssignments([]);
    setStudentLocalNotes([]);
    setStudentLocalGrades(null);
    setStudentLocalQuizzes([]);

    try {
      // 1. Sunucudan Öğrenci Akışı (Görüşler, Öğretmen değerlendirmeleri, Quizler)
      try {
        const feedRes = await apiRequest<any>(`sync/student-feed?studentId=${student.id}&role=ADMIN`);
        if (feedRes.success && feedRes.data) {
          if (Array.isArray(feedRes.data.evaluations)) {
            setStudentEvaluations(feedRes.data.evaluations);
          }
          if (Array.isArray(feedRes.data.assignments)) {
            setStudentAssignments(feedRes.data.assignments);
          }
        }
      } catch (err) {
        console.warn('[Admin Öğrenci Detay] Sunucu akışı alınamadı:', err);
      }

      // 2. Mobil / Yerel SQLite veritabanından veri çekme (varsa)
      if (Platform.OS !== 'web') {
        try {
          const { getDB } = await import('../../../database/db');
          const db = await getDB();

          // Öğrenciyi SQLite'tan bulalım (öğrenci numarası veya id ile)
          const stdRow = await db.getFirstAsync<any>(
            'SELECT id FROM students WHERE student_number = ? OR id = ? LIMIT 1',
            student.studentNumber || student.student_number || '',
            student.id || 0
          );

          if (stdRow?.id) {
            const localStdId = stdRow.id;

            // a) Görüşler (student_notes)
            const notes = await db.getAllAsync<any>(
              `SELECT sn.id, sn.note, sn.note_date, sn.lesson_info, sn.created_at,
                      c.name as class_name
               FROM student_notes sn
               LEFT JOIN classes c ON c.id = sn.class_id
               WHERE sn.student_id = ?
               ORDER BY sn.note_date DESC, sn.id DESC`,
              localStdId
            );
            setStudentLocalNotes(notes || []);

            // b) Sınav ve Performans Notları (student_grades)
            const grades = await db.getFirstAsync<any>(
              'SELECT * FROM student_grades WHERE student_id = ? ORDER BY term DESC LIMIT 1',
              localStdId
            );
            setStudentLocalGrades(grades || null);

            // c) Quizler ve Quiz Sonuçları (quizzes & quiz_scores)
            const quizzes = await db.getAllAsync<any>(
              `SELECT q.title, q.date, qs.score, c.name as class_name
               FROM quiz_scores qs
               JOIN quizzes q ON q.id = qs.quiz_id
               LEFT JOIN classes c ON c.id = q.class_id
               WHERE qs.student_id = ?
               ORDER BY q.date DESC`,
              localStdId
            );
            setStudentLocalQuizzes(quizzes || []);
          }
        } catch (sqliteErr) {
          console.warn('[Admin Öğrenci Detay] SQLite verisi sorgulanamadı:', sqliteErr);
        }
      }
    } catch (globalErr) {
      console.warn('[Admin Öğrenci Detay] Genel hata:', globalErr);
    } finally {
      setLoadingStudentDetail(false);
    }
  };

  const handleSendMessageToParent = (student: any) => {
    if (!student?.parentPhone) {
      Alert.alert(
        'Veli Telefonu Eksik',
        'Bu öğrencinin kayıtlı bir veli cep telefonu bulunmuyor. Düzenle butonunu kullanarak veli telefonu ekleyebilirsiniz.'
      );
      return;
    }

    let cleanPhone = student.parentPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '9' + cleanPhone;
    } else if (cleanPhone.length === 10) {
      cleanPhone = '90' + cleanPhone;
    }

    Alert.alert(
      '👨‍👩‍👧 Veli İletişimi',
      `${student.parentName || student.fullName + ' Velisi'} (${student.parentPhone}) için işlem seçiniz:`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '💬 WhatsApp ile Mesaj At',
          onPress: async () => {
            const url = `whatsapp://send?phone=${cleanPhone}`;
            try {
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                await Linking.openURL(`https://wa.me/${cleanPhone}`);
              }
            } catch {
              await Linking.openURL(`https://wa.me/${cleanPhone}`);
            }
          },
        },
        {
          text: '✉️ SMS Gönder',
          onPress: async () => {
            const separator = Platform.OS === 'ios' ? '&' : '?';
            const url = `sms:${cleanPhone}`;
            try {
              await Linking.openURL(url);
            } catch (e: any) {
              Alert.alert('Hata', 'SMS uygulaması açılamadı: ' + e.message);
            }
          },
        },
        {
          text: '📞 Telefonla Ara',
          onPress: () => {
            Linking.openURL(`tel:${cleanPhone}`).catch(() => {
              Alert.alert('Hata', 'Arama başlatılamadı.');
            });
          },
        },
      ]
    );
  };

  const handleSendMessageToStudent = (student: any) => {
    if (!student?.studentPhone) {
      Alert.alert(
        'Öğrenci Telefonu Eksik',
        'Bu öğrencinin kayıtlı bir cep telefonu bulunmuyor. Düzenle butonunu kullanarak öğrenci telefonu ekleyebilirsiniz.'
      );
      return;
    }

    let cleanPhone = student.studentPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '9' + cleanPhone;
    } else if (cleanPhone.length === 10) {
      cleanPhone = '90' + cleanPhone;
    }

    Alert.alert(
      '🎓 Öğrenci İletişimi',
      `${student.fullName} (${student.studentPhone}) için işlem seçiniz:`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '💬 WhatsApp ile Mesaj At',
          onPress: async () => {
            const url = `whatsapp://send?phone=${cleanPhone}`;
            try {
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                await Linking.openURL(`https://wa.me/${cleanPhone}`);
              }
            } catch {
              await Linking.openURL(`https://wa.me/${cleanPhone}`);
            }
          },
        },
        {
          text: '✉️ SMS Gönder',
          onPress: async () => {
            const url = `sms:${cleanPhone}`;
            try {
              await Linking.openURL(url);
            } catch (e: any) {
              Alert.alert('Hata', 'SMS uygulaması açılamadı: ' + e.message);
            }
          },
        },
        {
          text: '📞 Telefonla Ara',
          onPress: () => {
            Linking.openURL(`tel:${cleanPhone}`).catch(() => {
              Alert.alert('Hata', 'Arama başlatılamadı.');
            });
          },
        },
      ]
    );
  };

  const handlePickAndUploadPhoto = async (student: any) => {
    const options: any[] = [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: '📷 Kamera ile Çek',
        onPress: () => processPhotoUpload(student, 'camera'),
      },
      {
        text: '🖼️ Galeriden Seç',
        onPress: () => processPhotoUpload(student, 'gallery'),
      },
    ];

    options.push({
      text: cachedPdfPhotos.length > 0
        ? `📄 PDF Albümünden Seç (${cachedPdfPhotos.length} Fotoğraf)`
        : '📄 PDF Dosyasından Seç',
      onPress: () => handleOpenPdfPickerForStudent(student),
    });

    Alert.alert(
      'Öğrenci Fotoğrafı',
      `${student.fullName} için fotoğraf kaynağını seçin:`,
      options
    );
  };

  const handleOpenPdfPickerForStudent = async (student: any) => {
    setSingleStudentPdfTarget(student);
    setSingleStudentPdfSearch('');

    if (cachedPdfPhotos.length > 0) {
      setSingleStudentPdfModalVisible(true);
    } else {
      Alert.alert(
        'PDF Belgesi Seçin',
        'Öğrenci fotoğraflarını içeren e-Okul veya sınıf listesi PDF belgesini seçiniz.',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'PDF Seç & Tara',
            onPress: async () => {
              try {
                const pick = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
                if (pick.canceled || !pick.assets?.length) return;
                const asset = pick.assets[0];
                setCachedPdfAsset(asset);
                const res = await extractPhotosFromPdf(students, asset);
                if (res.success && res.extractedPhotos.length > 0) {
                  setCachedPdfPhotos(res.extractedPhotos);
                  setSingleStudentPdfModalVisible(true);
                } else {
                  Alert.alert('Fotoğraf Bulunamadı', 'Seçilen PDF belgesinde vesikalık fotoğraf tespit edilemedi.');
                }
              } catch (e: any) {
                Alert.alert('Hata', e.message || 'PDF okunamadı.');
              }
            },
          },
        ]
      );
    }
  };

  const handlePickNewPdfForSingleStudent = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
      if (pick.canceled || !pick.assets?.length) return;
      const asset = pick.assets[0];
      setCachedPdfAsset(asset);
      const res = await extractPhotosFromPdf(students, asset);
      if (res.success && res.extractedPhotos.length > 0) {
        setCachedPdfPhotos(res.extractedPhotos);
        Alert.alert('PDF Güncellendi', `Yeni PDF'ten ${res.extractedPhotos.length} fotoğraf albüme yüklendi.`);
      } else {
        Alert.alert('Fotoğraf Bulunamadı', 'Seçilen PDF belgesinde vesikalık fotoğraf tespit edilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'PDF okunamadı.');
    }
  };

  const handleSelectPdfPhotoForStudent = async (photo: PdfExtractedStudentPhoto) => {
    if (!singleStudentPdfTarget || !selectedSchool) return;
    setSingleStudentPdfUploading(true);
    try {
      const manip = await manipulateAsync(
        photo.tempUri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.7, format: SaveFormat.JPEG, base64: true }
      );

      if (!manip.base64) {
        Alert.alert('Hata', 'Görsel işlenemedi.');
        return;
      }

      const uploadRes = await apiRequest<any>('uploads/student-photo-base64', 'POST', {
        schoolCode: selectedSchool.code,
        studentNumber: singleStudentPdfTarget.studentNumber,
        base64Data: manip.base64,
      });

      if (uploadRes.success && uploadRes.data?.photoPath) {
        await apiRequest(`sync/students/${singleStudentPdfTarget.id}/photo`, 'PUT', {
          photoPath: uploadRes.data.photoPath,
        });

        Alert.alert('Başarılı 📸', `${singleStudentPdfTarget.fullName} öğrencisine fotoğraf PDF albümünden başarıyla atandı.`);
        setSingleStudentPdfModalVisible(false);
        setSingleStudentPdfTarget(null);
        if (selectedSchool) loadStudents(selectedSchool.id);
      } else {
        Alert.alert('Hata', uploadRes.error || 'Fotoğraf sunucuya kaydedilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Fotoğraf yüklenemedi.');
    } finally {
      setSingleStudentPdfUploading(false);
    }
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

  const toggleExcludeTeacher = (name: string) => {
    setExcludedTeachers((prev: any) =>
      prev.includes(name) ? prev.filter((t: any) => t !== name) : [...prev, name]
    );
  };

  const toggleExcludeClass = (name: string) => {
    setExcludedClasses((prev: any) =>
      prev.includes(name) ? prev.filter((c: any) => c !== name) : [...prev, name]
    );
  };

  const toggleExcludeLesson = (name: string) => {
    setExcludedLessons((prev: any) =>
      prev.includes(name) ? prev.filter((l: any) => l !== name) : [...prev, name]
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
        (msg: any) => {
          console.log(`[Çarşaf UI Aşaması]: ${msg}`);
          if (!aiCancelledRef.current) setAiStageText(msg);
        },
        (m: any) => {
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
      } catch { }
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

    const activeTeachers = (parsedSchedule.teachers || []).filter((t: any) => !(excludedTeachers || []).includes(t));
    const activeClasses = (parsedSchedule.classes || []).filter((c: any) => !(excludedClasses || []).includes(c));
    const activeLessons = (parsedSchedule.lessons || []).filter((l: any) => !(excludedLessons || []).includes(l));

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
        '⚠️ Dikkat: Haftalık Ders Programı Sıfırlanacak',
        `Okulun mevcut haftalık ders dağılım saatleri tamamen silinecektir ve yerine bu seçili çarşaf program (${activeTeachers.length} öğretmen, ${activeClasses.length} şube, ${activeLessons.length} ders) sıfırdan yazılacaktır.\n\n🛡️ Önemli: Sistemde kayıtlı öğretmenlerin hesapları, kullanıcı adları ve şifreleri KESİNLİKLE KORUNUR (silinmez veya sıfırlanmaz).${excludedSummary}\n\nEmin misiniz?`,
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
      const activeTeachers = (parsedSchedule.teachers || []).filter((t: any) => !excludedTeachers.includes(t));
      const activeClasses = (parsedSchedule.classes || []).filter((c: any) => !excludedClasses.includes(c));
      const activeLessons = (parsedSchedule.lessons || []).filter((l: any) => !excludedLessons.includes(l));

      // Pasif yapılan öğretmenlere, sınıflara veya derslere ait ders saatlerini de programdan hariç tut
      const activeScheduleItems = (parsedSchedule.scheduleItems || []).filter((item: any) => {
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
          const exists = classes.some((c: any) => c.grade === grade && c.section === section);
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
          const exists = classes.some((c: any) => c.grade === grade && c.section === section);
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

  const handleOpenAdminCredentials = async () => {
    const session = await getActiveUserSession();
    setAdminNewUsername(session?.username || '');
    setAdminOldPassword('');
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAdminCredentialsModalVisible(true);
  };

  return {
    handleCopyTeacherCredentials,
    handleCreateClass,
    handleDeleteClass,
    handleCreateLesson,
    handleDeleteLesson,
    handleCreateStudent,
    handleUpdateStudent,
    handleDeleteStudent,
    handleOpenCredentialsModal,
    handleResetStudentPassword,
    handleResetParentPassword,
    getCredentialsMessage,
    handleShareViaWhatsApp,
    handleShareViaSms,
    handleCopyCredentialsMessage,
    handleOpenStudentDetail,
    handleSendMessageToParent,
    handleSendMessageToStudent,
    handlePickAndUploadPhoto,
    handleOpenPdfPickerForStudent,
    handlePickNewPdfForSingleStudent,
    handleSelectPdfPhotoForStudent,
    processPhotoUpload,
    toggleExcludeTeacher,
    toggleExcludeClass,
    toggleExcludeLesson,
    setAllTeachersExcluded,
    setAllClassesExcluded,
    setAllLessonsExcluded,
    handlePickAndAnalyzeSchedule,
    startScheduleAnalysisWithOptions,
    executeSaveSchedule,
    performSaveSchedule,
    handlePickAndParseExcel,
    handleConfirmAndSaveExcelStudents,
    handlePickAndParseExcelWithAi,
    handleConfirmAndSaveAiStudents,
    handleLogout,
    handleSwitchToTeacher,
    handleOpenAdminCredentials
  };
}
