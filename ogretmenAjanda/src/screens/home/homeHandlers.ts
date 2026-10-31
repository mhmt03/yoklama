import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  BackHandler,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  getActiveAndTodayLessons,
  ActiveLessonInfo,
  getScheduleByDay,
  mergeAndDetectConflicts,
  getShowAllSchoolsSetting,
  setShowAllSchoolsSetting,
} from '../../database/operations/scheduleOperations';
import { getClasses } from '../../database/operations/classOperations';
import { getAssignments } from '../../database/operations/assignmentOperations';
import {
  checkTeacherExamAlert,
  fetchTeacherProctorDuties,
  TeacherProctorDutyItem,
} from '../../database/operations/examPlannerOperations';
import {
  getCurrentTopicForClass,
  getSurroundingTopicsForLesson,
  LessonTopicSurroundingInfo,
  getYearlyPlans,
  getYearlyPlanDocument,
  YearlyPlanDocument,
} from '../../database/operations/yearlyPlanOperations';
import {
  DAYS_OF_WEEK,
  getDayOfWeekIndex,
  formatDateToTR,
  getCurrentTimeString,
  getTodayDateString,
  getDateForDayOfWeek,
  formatDateShortTR,
} from '../../utils/dateUtils';
import { YearlyPlanItem, ScheduleItem, AgendaItem } from '../../types';
import {
  getTodayAgendaItems,
  getAgendaItemsByDate,
  getTodayAlertItems,
  toggleAgendaItemCompleted,
  getPendingAgendaCountToday,
} from '../../database/operations/agendaOperations';
import { School, getSchools, getActiveSchool, setActiveSchool, createSchool, SCHOOL_COLORS, syncAffiliatedSchools, refreshAffiliatedSchoolsFromServer, getDefaultSchoolId, setDefaultSchoolId, activateDefaultSchoolOnStartup } from '../../database/operations/schoolOperations';
import { getActiveUserSession } from '../../services/apiClient';
import { getActiveTeacherName } from '../../utils/roleService';
import { getTeacherTaughtLessons } from '../../services/yearlyPlanSyncService';
import { subscribeUnreadCount, fetchUnreadMessageCount } from '../../services/messageNotificationService';
import { HomeCtx, HeroNavTarget } from './homeStyles';

export function createHomeHandlers(ctx: HomeCtx) {
  const {
    setServerSchoolId,
    setIsInstitutionalTeacher,
    setActiveSchoolState,
    setSchoolsList,
    setDefaultSchoolIdState,
    reloadSchoolTheme,
    setShowAllSchoolsSchedule,
    selectedDay,
    setSchoolModalVisible,
    newSchoolName,
    newSchoolColor,
    setNewSchoolName,
    setIsAddingSchool,
    setEditingSchool,
    setEditSchoolName,
    setEditSchoolColor,
    editingSchool,
    editSchoolName,
    editSchoolColor,
    schoolsList,
    activeSchool,
    setSelectedDayAgendaItems,
    setTodayAlertItems,
    setPendingAgendaCount,
    showAllSchoolsSchedule,
    setDisplayedLessons,
    setCurrentTime,
    setLessonInfo,
    setStats,
    setTeacherDisplayName,
    setAssignedLessonsList,
    setAssignedClassesList,
    setTeacherProctorDuties,
    setRefreshing,
    setSelectedDay,
    setHeroNavTarget,
    todayIndex,
    setTopicLoading,
    setTopicModalVisible,
    setTopicInfo,
    setSelectedTopicIndex,
    setYearlyPlanMeta,
    setPlanSearchQuery,
    setPlanDateStart,
    setPlanDateEnd,
    setYearlyPlanLoading,
    setYearlyPlanModalVisible,
    planItemOffsets,
    setHighlightedPlanId,
    setYearlyPlanList,
    setYearlyPlanPdf,
    yearlyPlanList,
    planSearchQuery,
    planDateStart,
    planDateEnd,
    planScrollRef,
    lessonInfo,
    heroNavTarget
  } = ctx;

  const loadSchools = async () => {
    try {
      const session = await getActiveUserSession();
      if (session?.schoolId) {
        setServerSchoolId(session.schoolId);
      }
      const affSchools = (session?.affiliatedSchools && session.affiliatedSchools.length > 0)
        ? session.affiliatedSchools
        : (session?.schoolName ? [{ id: session.schoolCode || 'OKL-10001', name: session.schoolName, code: session.schoolCode || 'OKL-10001', geminiApiKey: session.geminiApiKey, geminiModel: session.geminiModel }] : []);
      const isInst = !!(session?.schoolCode || session?.schoolId || affSchools.length > 0);
      setIsInstitutionalTeacher(isInst);

      // 1. Önce yerel veritabanındaki mevcut okulları anında göster
      const initialActive = await getActiveSchool();
      if (initialActive) setActiveSchoolState(initialActive);
      const initialList = await getSchools();
      if (initialList.length > 0) setSchoolsList(initialList);

      // 2. Kurumsal bağlantı varsa sunucudan en güncel okulları çekip senkronize et (İsmi değişen veya silinen okullar anında güncellenir)
      if (isInst) {
        await refreshAffiliatedSchoolsFromServer();
      }

      // 3. Güncellenmiş varsayılan okulu etkinleştir
      const active = await activateDefaultSchoolOnStartup();
      setActiveSchoolState(active);
      const defId = await getDefaultSchoolId();
      setDefaultSchoolIdState(defId);
      const list = await getSchools();
      setSchoolsList(list);
      await reloadSchoolTheme();
      const savedSetting = await getShowAllSchoolsSetting();
      setShowAllSchoolsSchedule(savedSetting);
    } catch (e) {
      console.warn('Error loading schools:', e);
    }
  };

  const handleSetDefaultSchool = async (schId: number) => {
    try {
      await setDefaultSchoolId(schId);
      setDefaultSchoolIdState(schId);
      const updated = await setActiveSchool(schId);
      setActiveSchoolState(updated);
      await reloadSchoolTheme();
      await loadData();
      Alert.alert('Varsayılan Okul Seçildi ⭐', 'Öğretmen ekranı açıldığında artık bu okul otomatik olarak seçilecektir.');
    } catch (e: any) {
      Alert.alert('Hata', 'Varsayılan okul ayarlanamadı.');
    }
  };

  const handleExitApp = () => {
    Alert.alert(
      'Uygulamayı Kapat',
      'Uygulamadan çıkmak istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kapat',
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ],
      { cancelable: true }
    );
  };

  const handleToggleShowAllSchools = async (val: boolean) => {
    setShowAllSchoolsSchedule(val);
    await setShowAllSchoolsSetting(val);
    await loadDaySchedule(selectedDay, val);
  };

  const handleSelectSchool = async (schoolId: number) => {
    try {
      const updated = await setActiveSchool(schoolId);
      setActiveSchoolState(updated);
      await reloadSchoolTheme();
      setSchoolModalVisible(false);

      // Kurumsal okul ise verileri (program, şube/öğrenci, yıllık plan) bu okul için otomatik senkronize et
      if (updated?.code) {
        try {
          const { syncScheduleFromSchool } = await import('../../services/scheduleSyncService');
          const { syncTeacherAssignedClassesAndStudents } = await import('../../services/studentSyncService');
          const { syncYearlyPlansFromSchool } = await import('../../services/yearlyPlanSyncService');

          await syncScheduleFromSchool(updated.code);
          await syncTeacherAssignedClassesAndStudents(updated.code);
          await syncYearlyPlansFromSchool({ providedSchoolCode: updated.code });
        } catch (syncErr) {
          console.warn('School switch auto-sync error:', syncErr);
        }
      }

      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Okul değiştirilemedi.');
    }
  };

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adını giriniz.');
      return;
    }
    try {
      await createSchool(newSchoolName, newSchoolColor);
      setNewSchoolName('');
      setIsAddingSchool(false);
      await loadSchools();
      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Okul eklenirken bir hata oluştu.');
    }
  };

  const handleStartEditSchool = (sch: School) => {
    setEditingSchool(sch);
    setEditSchoolName(sch.name);
    setEditSchoolColor(sch.color || SCHOOL_COLORS[0].color);
  };

  const handleSaveEditSchool = async () => {
    if (!editingSchool || !editSchoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adını giriniz.');
      return;
    }
    try {
      const { updateSchool } = await import('../../database/operations/schoolOperations');
      await updateSchool(editingSchool.id, editSchoolName, editSchoolColor);
      setEditingSchool(null);
      await loadSchools();
      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Okul güncellenirken hata oluştu.');
    }
  };

  const handleDeleteSchoolHandler = async (sch: School) => {
    if (schoolsList.length <= 1) {
      Alert.alert('Uyarı', 'Sistemde en az bir okul bulunmalıdır, son okul silinemez.');
      return;
    }
    Alert.alert(
      'Okulu Sil',
      `"${sch.name}" okulunu silmek istediğinize emin misiniz? Okula ait tüm şubeler ve kayıtlar da silinecektir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const { deleteSchool } = await import('../../database/operations/schoolOperations');
              await deleteSchool(sch.id);
              await loadSchools();
              await loadData();
            } catch (e: any) {
              Alert.alert('Hata', e?.message || 'Okul silinemedi.');
            }
          },
        },
      ]
    );
  };

  const loadAgendaData = async (targetDate?: string) => {
    try {
      const dateToLoad = targetDate || getDateForDayOfWeek(selectedDay);
      const items = await getAgendaItemsByDate(dateToLoad, activeSchool?.id);
      setSelectedDayAgendaItems(items);
      const alerts = await getTodayAlertItems(activeSchool?.id);
      setTodayAlertItems(alerts);
      const pendingCount = await getPendingAgendaCountToday(activeSchool?.id);
      setPendingAgendaCount(pendingCount);
    } catch (e) {
      console.warn('Error loading agenda data in HomeScreen:', e);
    }
  };

  const loadDaySchedule = async (day: number, overrideShowAll?: boolean) => {
    try {
      const showAll = overrideShowAll !== undefined ? overrideShowAll : showAllSchoolsSchedule;
      const items = await getScheduleByDay(day, showAll ? 'all' : undefined);
      const valid = items.filter((item: any) => item.class_id || item.course_id);
      if (showAll) {
        setDisplayedLessons(mergeAndDetectConflicts(valid, activeSchool?.id));
      } else {
        setDisplayedLessons(valid);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAssignedLessonsForDay = async (day: number, overrideShowAll?: boolean): Promise<ScheduleItem[]> => {
    try {
      const showAll = overrideShowAll !== undefined ? overrideShowAll : showAllSchoolsSchedule;
      const items = await getScheduleByDay(day, showAll ? 'all' : undefined);
      const valid = items.filter((item: any) => item.class_id || item.course_id);
      if (showAll) {
        return mergeAndDetectConflicts(valid, activeSchool?.id);
      }
      return valid;
    } catch (err) {
      console.error('Error fetching lessons for day', day, err);
      return [];
    }
  };

  const findNextDayWithLessons = async (
    startDay: number,
    overrideShowAll?: boolean
  ): Promise<{ day: number; lessons: ScheduleItem[] } | null> => {
    for (let offset = 1; offset <= 7; offset++) {
      const nextDay = ((startDay - 1 + offset) % 7) + 1;
      const lessons = await fetchAssignedLessonsForDay(nextDay, overrideShowAll);
      if (lessons.length > 0) {
        return { day: nextDay, lessons };
      }
    }
    return null;
  };

  const findPrevDayWithLessons = async (
    startDay: number,
    overrideShowAll?: boolean
  ): Promise<{ day: number; lessons: ScheduleItem[] } | null> => {
    for (let offset = 1; offset <= 7; offset++) {
      let prevDay = startDay - offset;
      while (prevDay <= 0) prevDay += 7;
      const lessons = await fetchAssignedLessonsForDay(prevDay, overrideShowAll);
      if (lessons.length > 0) {
        return { day: prevDay, lessons };
      }
    }
    return null;
  };

  const loadData = async (dayToLoad?: number) => {
    try {
      setCurrentTime(getCurrentTimeString());
      const savedSetting = await getShowAllSchoolsSetting();
      setShowAllSchoolsSchedule(savedSetting);
      const targetDay = dayToLoad !== undefined ? dayToLoad : selectedDay;
      const info = await getActiveAndTodayLessons(savedSetting ? 'all' : undefined);
      setLessonInfo(info);
      await loadDaySchedule(targetDay, savedSetting);

      const classes = await getClasses();
      const totalStudents = classes.reduce((sum: any, c: any) => sum + (c.student_count || 0), 0);
      const assignments = await getAssignments();
      const pendingCount = assignments.reduce((sum: any, a: any) => sum + (a.pending_count || 0), 0);

      setStats({
        classCount: classes.length,
        studentCount: totalStudents,
        pendingAssignments: pendingCount,
      });

      // Öğretmen adı ve sorumlu olduğu ders/şubeleri yükle
      try {
        const tName = await getActiveTeacherName();
        const session = await getActiveUserSession();
        if (tName) {
          setTeacherDisplayName(tName);
        } else if (session?.fullName) {
          setTeacherDisplayName(session.fullName);
        }

        let lessons: string[] = [];
        let classList: string[] = [];

        if (session?.assignedLessons) {
          lessons = Array.isArray(session.assignedLessons)
            ? session.assignedLessons
            : JSON.parse(session.assignedLessons);
        }
        if (session?.assignedClasses) {
          classList = Array.isArray(session.assignedClasses)
            ? session.assignedClasses
            : JSON.parse(session.assignedClasses);
        }

        if (lessons.length === 0) {
          try {
            const taught = await getTeacherTaughtLessons();
            lessons = taught.map((t: any) => t.lessonName);
          } catch { }
        }

        if (classList.length === 0 && classes.length > 0) {
          classList = classes.map((c: any) => c.name);
        }

        setAssignedLessonsList(lessons);
        setAssignedClassesList(classList);

        // Öğretmen sınav gözetmenlik görevlerini sunucudan yükle
        try {
          const duties = await fetchTeacherProctorDuties(activeSchool?.code || undefined, tName || session?.fullName || undefined);
          setTeacherProctorDuties(duties || []);
        } catch (examErr) {
          console.warn('Error fetching proctor duties in HomeScreen:', examErr);
        }
      } catch (profErr) {
        console.warn('Error loading teacher profile/assignments in HomeScreen:', profErr);
      }

      await loadAgendaData();
    } catch (error) {
      console.error('Error loading home data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const currentDay = getDayOfWeekIndex();
    setSelectedDay(currentDay);
    setHeroNavTarget(null);
    await loadData(currentDay);
    await fetchUnreadMessageCount();
    setRefreshing(false);
  };

  const handlePrevDay = () => {
    setSelectedDay((prev: any) => (prev <= 1 ? 7 : prev - 1));
  };

  const handleNextDay = () => {
    setSelectedDay((prev: any) => (prev >= 7 ? 1 : prev + 1));
  };

  const handleJumpToToday = () => {
    setSelectedDay(todayIndex);
    setHeroNavTarget(null);
  };

  const handleJumpToCurrentDayAndLesson = async () => {
    const currentDay = getDayOfWeekIndex();
    setSelectedDay(currentDay);
    setHeroNavTarget(null);
    await loadDaySchedule(currentDay);
    try {
      const info = await getActiveAndTodayLessons(showAllSchoolsSchedule ? 'all' : undefined);
      setLessonInfo(info);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenTopicModal = async (item: ScheduleItem) => {
    if (!item.class_id || !item.course_id) {
      Alert.alert('Bilgi', 'Bu ders için şube veya ders bilgisi tanımlı değil.');
      return;
    }
    setTopicLoading(true);
    setTopicModalVisible(true);
    try {
      const res = await getSurroundingTopicsForLesson(
        item.class_id,
        item.course_id,
        item.day_of_week,
        item.slot_id
      );
      setTopicInfo(res);
      setSelectedTopicIndex(res.currentIndex >= 0 ? res.currentIndex : 0);
    } catch (e) {
      console.error('Error loading surrounding topics:', e);
      Alert.alert('Hata', 'Defter metni yüklenirken bir sorun oluştu.');
    } finally {
      setTopicLoading(false);
    }
  };

  const handleCopyNotebookText = async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı', 'Deftere yazılacak metin panoya kopyalandı.');
  };

  const handleOpenYearlyPlanModal = async (item: ScheduleItem) => {
    const m = item.class_name?.match(/\d+/);
    const gradeLevel = m ? parseInt(m[0], 10) : 0;
    const meta = {
      gradeLevel,
      className: item.class_name || '',
      courseName: item.course_name || 'Ders',
      courseId: item.course_id || 0,
    };
    setYearlyPlanMeta(meta);
    setPlanSearchQuery('');
    setPlanDateStart('');
    setPlanDateEnd('');
    setYearlyPlanLoading(true);
    setYearlyPlanModalVisible(true);
    planItemOffsets.current = {};
    setHighlightedPlanId(null);

    try {
      // 1. Şubeye özel değil sınıf düzeyine ait planı ara (class_id göndermeden)
      let plans = await getYearlyPlans(item.course_id || undefined, gradeLevel || undefined);

      // 2. Yedek: Eğer ders eşleşmediyse, o sınıf düzeyine yüklenmiş tüm planları dene
      if (plans.length === 0 && gradeLevel) {
        plans = await getYearlyPlans(undefined, gradeLevel);
      }

      // 3. Yedek: Eğer sınıf düzeyi çıkmadıysa ders id ile ara
      if (plans.length === 0 && item.course_id) {
        plans = await getYearlyPlans(item.course_id, undefined);
      }

      // PDF belgesini kontrol et
      const doc = await getYearlyPlanDocument(item.course_id || undefined, gradeLevel || undefined);

      setYearlyPlanList(plans);
      setYearlyPlanPdf(doc);

      // Başlangıç tarihi varsayılanı: Yıllık planın başladığı ilk hafta tarihi
      const firstWeekStart = plans.find((p: any) => p.date_start)?.date_start;
      if (firstWeekStart) {
        setPlanDateStart(firstWeekStart);
        // Bitiş tarihi varsayılanı: Tam 1 yıl sonrası
        const sDate = new Date(firstWeekStart);
        if (!isNaN(sDate.getTime())) {
          sDate.setFullYear(sDate.getFullYear() + 1);
          setPlanDateEnd(sDate.toISOString().split('T')[0]);
        } else {
          setPlanDateEnd('');
        }
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        setPlanDateStart(todayStr);
        const nextYearDate = new Date();
        nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
        setPlanDateEnd(nextYearDate.toISOString().split('T')[0]);
      }
    } catch (e) {
      console.error('Error loading yearly plan:', e);
      Alert.alert('Hata', 'Yıllık plan yüklenirken bir sorun oluştu.');
    } finally {
      setYearlyPlanLoading(false);
    }
  };

  const getClosestPlanItem = (plans: YearlyPlanItem[]): YearlyPlanItem | null => {
    if (!plans || plans.length === 0) return null;
    const todayStr = getTodayDateString();
    const todayTime = new Date(todayStr).getTime();

    // 1. Doğrudan bu haftaya denk gelen kazanım
    const exactMatch = plans.find(
      (p: any) => Boolean(p.date_start && p.date_end && p.date_start <= todayStr && p.date_end >= todayStr)
    );
    if (exactMatch) return exactMatch;

    // 2. Bugünün tarihine gün farkı olarak en yakın kazanım
    let closestPlan: YearlyPlanItem | null = null;
    let minDiff = Infinity;

    for (const p of plans) {
      if (p.date_start && p.date_end) {
        const startTime = new Date(p.date_start).getTime();
        const endTime = new Date(p.date_end).getTime();
        let diff = 0;
        if (todayTime < startTime) {
          diff = startTime - todayTime;
        } else if (todayTime > endTime) {
          diff = todayTime - endTime;
        } else {
          diff = 0;
        }
        if (diff < minDiff) {
          minDiff = diff;
          closestPlan = p;
        }
      } else if (p.date_start) {
        const diff = Math.abs(todayTime - new Date(p.date_start).getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestPlan = p;
        }
      } else if (p.date_end) {
        const diff = Math.abs(todayTime - new Date(p.date_end).getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestPlan = p;
        }
      }
    }

    return closestPlan || plans[0] || null;
  };

  const handleScrollToTodayPlan = () => {
    if (!yearlyPlanList || yearlyPlanList.length === 0) return;

    // Filtreleme yapmadan, tüm listede rahatça yukarı-aşağı kaydırılabilmesi için arama/tarih filtresini sıfırlar
    let needFilterReset = false;
    if (planSearchQuery) {
      setPlanSearchQuery('');
      needFilterReset = true;
    }
    const todayStr = getTodayDateString();
    if (planDateStart && planDateEnd) {
      if (planDateStart > todayStr || planDateEnd < todayStr) {
        const firstWeekStart = yearlyPlanList.find((p: any) => p.date_start)?.date_start;
        if (firstWeekStart) {
          setPlanDateStart(firstWeekStart);
          try {
            const sDate = new Date(firstWeekStart);
            sDate.setFullYear(sDate.getFullYear() + 1);
            setPlanDateEnd(sDate.toISOString().split('T')[0]);
          } catch {
            setPlanDateEnd('');
          }
        } else {
          setPlanDateStart('');
          setPlanDateEnd('');
        }
        needFilterReset = true;
      }
    }

    const targetPlan = getClosestPlanItem(yearlyPlanList);
    if (!targetPlan) return;

    setHighlightedPlanId(targetPlan.id);
    setTimeout(() => {
      setHighlightedPlanId(null);
    }, 3000);

    const performScroll = () => {
      const y = planItemOffsets.current[targetPlan.id];
      if (y !== undefined && planScrollRef.current) {
        planScrollRef.current.scrollTo({
          y: Math.max(0, y - 10),
          animated: true,
        });
      }
    };

    if (needFilterReset) {
      setTimeout(performScroll, 120);
    } else {
      performScroll();
      setTimeout(performScroll, 120);
    }
  };

  const handleNextHeroLesson = async () => {
    const currentDay = getDayOfWeekIndex();
    const cTime = getCurrentTimeString();
    const todayAssigned = lessonInfo.todayLessons || [];

    // Durum 1: Halihazırda gezinilen bir dersteysek
    if (heroNavTarget) {
      const { day, dayLessons, index } = heroNavTarget;
      if (index < dayLessons.length - 1) {
        // Aynı gün içinde bir sonraki ders
        const nextIndex = index + 1;
        setHeroNavTarget({
          day,
          dayLessons,
          index: nextIndex,
          lesson: dayLessons[nextIndex],
        });
        return;
      }
      // Bu günün son dersindeyiz -> en yakın sonraki günün ilk dersine git
      const nextResult = await findNextDayWithLessons(day);
      if (nextResult && nextResult.lessons.length > 0) {
        setSelectedDay(nextResult.day);
        setHeroNavTarget({
          day: nextResult.day,
          dayLessons: nextResult.lessons,
          index: 0,
          lesson: nextResult.lessons[0],
        });
      }
      return;
    }

    // Durum 2: "Şu An" modundayız ve şu anda devam eden bir aktif ders var
    if (lessonInfo.currentLesson) {
      const curIdx = todayAssigned.findIndex((item: any) => item.slot_id === lessonInfo.currentLesson?.slot_id);
      if (curIdx !== -1 && curIdx < todayAssigned.length - 1) {
        // Bugün içindeki bir sonraki ders
        const nextIndex = curIdx + 1;
        setHeroNavTarget({
          day: currentDay,
          dayLessons: todayAssigned,
          index: nextIndex,
          lesson: todayAssigned[nextIndex],
        });
        return;
      }
      // Bugünün son dersindeydik -> sonraki günün ilk dersine git
      const nextResult = await findNextDayWithLessons(currentDay);
      if (nextResult && nextResult.lessons.length > 0) {
        setSelectedDay(nextResult.day);
        setHeroNavTarget({
          day: nextResult.day,
          dayLessons: nextResult.lessons,
          index: 0,
          lesson: nextResult.lessons[0],
        });
      }
      return;
    }

    // Durum 3: "Şu An Boş Ders" formundayız (şu an ders yok)
    // En yakın sıradaki derse git
    if (lessonInfo.nextLesson) {
      const nextIdx = todayAssigned.findIndex((item: any) => item.slot_id === lessonInfo.nextLesson?.slot_id);
      if (nextIdx !== -1) {
        setHeroNavTarget({
          day: currentDay,
          dayLessons: todayAssigned,
          index: nextIdx,
          lesson: todayAssigned[nextIdx],
        });
        return;
      }
    }

    // Ya da bugün saati cTime'dan büyük olan herhangi bir ders
    const upcomingIdx = todayAssigned.findIndex((item: any) => Boolean(item.start_time && item.start_time > cTime));
    if (upcomingIdx !== -1) {
      setHeroNavTarget({
        day: currentDay,
        dayLessons: todayAssigned,
        index: upcomingIdx,
        lesson: todayAssigned[upcomingIdx],
      });
      return;
    }

    // Bugün başka ders kalmadıysa -> sonraki günlerin ilk dersine git
    const nextResult = await findNextDayWithLessons(currentDay);
    if (nextResult && nextResult.lessons.length > 0) {
      setSelectedDay(nextResult.day);
      setHeroNavTarget({
        day: nextResult.day,
        dayLessons: nextResult.lessons,
        index: 0,
        lesson: nextResult.lessons[0],
      });
    }
  };

  const handlePrevHeroLesson = async () => {
    const currentDay = getDayOfWeekIndex();
    const cTime = getCurrentTimeString();
    const todayAssigned = lessonInfo.todayLessons || [];

    // Durum 1: Halihazırda gezinilen bir dersteysek
    if (heroNavTarget) {
      const { day, dayLessons, index } = heroNavTarget;
      if (index > 0) {
        // Aynı gün içinde bir önceki ders
        const prevIndex = index - 1;
        setHeroNavTarget({
          day,
          dayLessons,
          index: prevIndex,
          lesson: dayLessons[prevIndex],
        });
        return;
      }
      // Bu günün ilk dersindeyiz -> en yakın önceki günün son dersine git
      const prevResult = await findPrevDayWithLessons(day);
      if (prevResult && prevResult.lessons.length > 0) {
        const lastIdx = prevResult.lessons.length - 1;
        setSelectedDay(prevResult.day);
        setHeroNavTarget({
          day: prevResult.day,
          dayLessons: prevResult.lessons,
          index: lastIdx,
          lesson: prevResult.lessons[lastIdx],
        });
      }
      return;
    }

    // Durum 2: "Şu An" modundayız ve şu anda devam eden bir aktif ders var
    if (lessonInfo.currentLesson) {
      const curIdx = todayAssigned.findIndex((item: any) => item.slot_id === lessonInfo.currentLesson?.slot_id);
      if (curIdx > 0) {
        // Bugün içindeki bir önceki ders
        const prevIndex = curIdx - 1;
        setHeroNavTarget({
          day: currentDay,
          dayLessons: todayAssigned,
          index: prevIndex,
          lesson: todayAssigned[prevIndex],
        });
        return;
      }
      // Bugünün ilk dersindeydik -> önceki günün son dersine git
      const prevResult = await findPrevDayWithLessons(currentDay);
      if (prevResult && prevResult.lessons.length > 0) {
        const lastIdx = prevResult.lessons.length - 1;
        setSelectedDay(prevResult.day);
        setHeroNavTarget({
          day: prevResult.day,
          dayLessons: prevResult.lessons,
          index: lastIdx,
          lesson: prevResult.lessons[lastIdx],
        });
      }
      return;
    }

    // Durum 3: "Şu An Boş Ders" formundayız (şu an ders yok)
    // Bugün daha önce bitmiş ders varsa en son biten derse git
    let lastPastIdx = -1;
    for (let i = todayAssigned.length - 1; i >= 0; i--) {
      if (todayAssigned[i].end_time && todayAssigned[i].end_time! <= cTime) {
        lastPastIdx = i;
        break;
      }
    }

    if (lastPastIdx !== -1) {
      setHeroNavTarget({
        day: currentDay,
        dayLessons: todayAssigned,
        index: lastPastIdx,
        lesson: todayAssigned[lastPastIdx],
      });
      return;
    }

    // Bugün geçmiş ders yoksa (örneğin sabah erken veya bugün ders yok) -> önceki günlerin son dersine git
    const prevResult = await findPrevDayWithLessons(currentDay);
    if (prevResult && prevResult.lessons.length > 0) {
      const lastIdx = prevResult.lessons.length - 1;
      setSelectedDay(prevResult.day);
      setHeroNavTarget({
        day: prevResult.day,
        dayLessons: prevResult.lessons,
        index: lastIdx,
        lesson: prevResult.lessons[lastIdx],
      });
    }
  };

  return {
    loadSchools,
    handleSetDefaultSchool,
    handleExitApp,
    handleToggleShowAllSchools,
    handleSelectSchool,
    handleCreateSchool,
    handleStartEditSchool,
    handleSaveEditSchool,
    handleDeleteSchoolHandler,
    loadAgendaData,
    loadDaySchedule,
    fetchAssignedLessonsForDay,
    findNextDayWithLessons,
    findPrevDayWithLessons,
    loadData,
    onRefresh,
    handlePrevDay,
    handleNextDay,
    handleJumpToToday,
    handleJumpToCurrentDayAndLesson,
    handleOpenTopicModal,
    handleCopyNotebookText,
    handleOpenYearlyPlanModal,
    getClosestPlanItem,
    handleScrollToTodayPlan,
    handleNextHeroLesson,
    handlePrevHeroLesson
  };
}
