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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Shadows } from '../theme/colors';
import { useDrawer } from '../context/DrawerContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { PdfViewerModal } from '../components/PdfViewerModal';
import { CURRENT_APP_VERSION } from '../services/appUpdateService';
import {
  getActiveAndTodayLessons,
  ActiveLessonInfo,
  getScheduleByDay,
  mergeAndDetectConflicts,
  getShowAllSchoolsSetting,
  setShowAllSchoolsSetting,
} from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import { getAssignments } from '../database/operations/assignmentOperations';
import {
  checkTeacherExamAlert,
  fetchTeacherProctorDuties,
  TeacherProctorDutyItem,
} from '../database/operations/examPlannerOperations';
import {
  getCurrentTopicForClass,
  getSurroundingTopicsForLesson,
  LessonTopicSurroundingInfo,
  getYearlyPlans,
  getYearlyPlanDocument,
  YearlyPlanDocument,
} from '../database/operations/yearlyPlanOperations';
import { viewYearlyPlanPdf } from '../utils/pdfPlanService';
import {
  DAYS_OF_WEEK,
  getDayOfWeekIndex,
  formatDateToTR,
  getCurrentTimeString,
  getTodayDateString,
  getDateForDayOfWeek,
  formatDateShortTR,
} from '../utils/dateUtils';
import { YearlyPlanItem, ScheduleItem, AgendaItem } from '../types';
import {
  getTodayAgendaItems,
  getAgendaItemsByDate,
  getTodayAlertItems,
  toggleAgendaItemCompleted,
  getPendingAgendaCountToday,
} from '../database/operations/agendaOperations';
import { School, getSchools, getActiveSchool, setActiveSchool, createSchool, SCHOOL_COLORS, syncAffiliatedSchools, refreshAffiliatedSchoolsFromServer, getDefaultSchoolId, setDefaultSchoolId, activateDefaultSchoolOnStartup } from '../database/operations/schoolOperations';
import { useSchoolTheme, getOpaqueTint } from '../context/SchoolThemeContext';
import { getActiveUserSession } from '../services/apiClient';
import { getActiveTeacherName } from '../utils/roleService';
import { getTeacherTaughtLessons } from '../services/yearlyPlanSyncService';
import { subscribeUnreadCount, fetchUnreadMessageCount } from '../services/messageNotificationService';
import { FloatingMessageBubble } from '../components/FloatingMessageBubble';
import { OptikModuleView } from '../components/OptikModuleView';
import { styles, HomeCtx, HeroNavTarget } from './home/homeStyles';
import { HomeModals } from './home/HomeModals';
import { createHomeHandlers } from './home/homeHandlers';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const { reloadSchoolTheme, bgTint } = useSchoolTheme();

  const { openDrawer } = useDrawer();

  const [refreshing, setRefreshing] = useState(false);

  const [currentTime, setCurrentTime] = useState(getCurrentTimeString());

  const [unreadMessageCount, setUnreadMessageCount] = useState<number>(0);

  const [activeSchool, setActiveSchoolState] = useState<School | null>(null);

  const [defaultSchoolId, setDefaultSchoolIdState] = useState<number | null>(null);

  const [schoolsList, setSchoolsList] = useState<School[]>([]);

  const [isInstitutionalTeacher, setIsInstitutionalTeacher] = useState(false);

  const [schoolModalVisible, setSchoolModalVisible] = useState(false);

  const [newSchoolName, setNewSchoolName] = useState('');

  const [newSchoolColor, setNewSchoolColor] = useState(SCHOOL_COLORS[0].color);

  const [isAddingSchool, setIsAddingSchool] = useState(false);

  const [editingSchool, setEditingSchool] = useState<School | null>(null);

  const [editSchoolName, setEditSchoolName] = useState('');

  const [editSchoolColor, setEditSchoolColor] = useState(SCHOOL_COLORS[0].color);

  const [currentExamAlert, setCurrentExamAlert] = useState<any | null>(null);

  const [teacherProctorDuties, setTeacherProctorDuties] = useState<TeacherProctorDutyItem[]>([]);

  const [serverSchoolId, setServerSchoolId] = useState<string | undefined>(undefined);

  const [optikModalVisible, setOptikModalVisible] = useState(false);

  const todayIndex = getDayOfWeekIndex();

  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);

  const [displayedLessons, setDisplayedLessons] = useState<ScheduleItem[]>([]);

  const [showAllSchoolsSchedule, setShowAllSchoolsSchedule] = useState(false);

  const [lessonInfo, setLessonInfo] = useState<ActiveLessonInfo>({
    currentLesson: null,
    nextLesson: null,
    todayLessons: [],
  });

  const [heroNavTarget, setHeroNavTarget] = useState<HeroNavTarget | null>(null);

  const [heroTopic, setHeroTopic] = useState<YearlyPlanItem | null>(null);

  const [heroTopicLoading, setHeroTopicLoading] = useState(false);

  const [teacherDisplayName, setTeacherDisplayName] = useState<string>('');

  const [assignedLessonsList, setAssignedLessonsList] = useState<string[]>([]);

  const [assignedClassesList, setAssignedClassesList] = useState<string[]>([]);

  const [teacherInfoModalVisible, setTeacherInfoModalVisible] = useState(false);

  const [stats, setStats] = useState({
    classCount: 0,
    studentCount: 0,
    pendingAssignments: 0,
  });

  const [selectedDayAgendaItems, setSelectedDayAgendaItems] = useState<AgendaItem[]>([]);

  const [todayAlertItems, setTodayAlertItems] = useState<AgendaItem[]>([]);

  const [pendingAgendaCount, setPendingAgendaCount] = useState<number>(0);

  const [topicModalVisible, setTopicModalVisible] = useState(false);

  const [topicLoading, setTopicLoading] = useState(false);

  const [topicInfo, setTopicInfo] = useState<LessonTopicSurroundingInfo | null>(null);

  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number>(0);

  const [yearlyPlanModalVisible, setYearlyPlanModalVisible] = useState(false);

  const [yearlyPlanLoading, setYearlyPlanLoading] = useState(false);

  const [yearlyPlanList, setYearlyPlanList] = useState<YearlyPlanItem[]>([]);

  const [yearlyPlanPdf, setYearlyPlanPdf] = useState<YearlyPlanDocument | null>(null);

  const [yearlyPlanMeta, setYearlyPlanMeta] = useState<{
    gradeLevel: number;
    className: string;
    courseName: string;
    courseId: number;
  } | null>(null);

  const [planSearchQuery, setPlanSearchQuery] = useState('');

  const [planDateStart, setPlanDateStart] = useState('');

  const [planDateEnd, setPlanDateEnd] = useState('');

  const [showPlanDatePicker, setShowPlanDatePicker] = useState<'start' | 'end' | null>(null);

  const [pdfViewerModalVisible, setPdfViewerModalVisible] = useState(false);

  const planScrollRef = useRef<ScrollView>(null);

  const planItemOffsets = useRef<Record<number, number>>({});

  const [highlightedPlanId, setHighlightedPlanId] = useState<number | null>(null);

  const todayLessons = lessonInfo.todayLessons || [];

  const currentActiveIndex = lessonInfo.currentLesson
    ? todayLessons.findIndex((item: any) => item.slot_id === lessonInfo.currentLesson?.slot_id)
    : -1;

  const effectiveHeroLesson: ScheduleItem | null = heroNavTarget
    ? heroNavTarget.lesson
    : (lessonInfo.currentLesson || null);

  const heroDay = heroNavTarget ? heroNavTarget.day : todayIndex;

  const isHeroToday = heroDay === todayIndex;

  const heroDayObj = DAYS_OF_WEEK.find((d: any) => d.id === heroDay);

  const heroDayName = heroDayObj ? heroDayObj.name : '';

  const isCurrentLesson = Boolean(
    lessonInfo.currentLesson &&
    effectiveHeroLesson &&
    effectiveHeroLesson.slot_id === lessonInfo.currentLesson.slot_id &&
    isHeroToday &&
    !heroNavTarget
  );

  const isNextLesson = Boolean(
    !lessonInfo.currentLesson &&
    lessonInfo.nextLesson &&
    effectiveHeroLesson &&
    effectiveHeroLesson.slot_id === lessonInfo.nextLesson.slot_id &&
    isHeroToday &&
    !heroNavTarget
  );

  const heroDisplayIndex = heroNavTarget
    ? heroNavTarget.index
    : currentActiveIndex >= 0
      ? currentActiveIndex
      : 0;

  const heroDisplayTotal = heroNavTarget
    ? heroNavTarget.dayLessons.length
    : todayLessons.length;

  const currentTopicItem = topicInfo?.allTopics[selectedTopicIndex] || null;

  const prevTopics = topicInfo
    ? [
      selectedTopicIndex - 2 >= 0
        ? { offset: -2, item: topicInfo.allTopics[selectedTopicIndex - 2] }
        : null,
      selectedTopicIndex - 1 >= 0
        ? { offset: -1, item: topicInfo.allTopics[selectedTopicIndex - 1] }
        : null,
    ].filter(Boolean) as { offset: number; item: YearlyPlanItem }[]
    : [];

  const nextTopics = topicInfo
    ? [
      selectedTopicIndex + 1 < topicInfo.allTopics.length
        ? { offset: 1, item: topicInfo.allTopics[selectedTopicIndex + 1] }
        : null,
      selectedTopicIndex + 2 < topicInfo.allTopics.length
        ? { offset: 2, item: topicInfo.allTopics[selectedTopicIndex + 2] }
        : null,
    ].filter(Boolean) as { offset: number; item: YearlyPlanItem }[]
    : [];

  const filteredPlanList = yearlyPlanList.filter((p: any) => {
    if (planSearchQuery.trim()) {
      const q = planSearchQuery.toLowerCase();
      const matchText =
        p.subject_topic.toLowerCase().includes(q) ||
        (p.learning_outcomes && p.learning_outcomes.toLowerCase().includes(q)) ||
        `hafta ${p.week_number}`.includes(q) ||
        `${p.week_number}. hafta`.includes(q) ||
        (p.date_start && p.date_start.includes(q)) ||
        (p.date_end && p.date_end.includes(q));
      if (!matchText) return false;
    }
    if (planDateStart.trim() && p.date_end && p.date_end < planDateStart.trim()) return false;
    if (planDateEnd.trim() && p.date_start && p.date_start > planDateEnd.trim()) return false;
    return true;
  });

  const isViewingToday = selectedDay === todayIndex;

  const selectedDayObj = DAYS_OF_WEEK.find((d: any) => d.id === selectedDay);

  const selectedDateString = useMemo(() => {
    return getDateForDayOfWeek(selectedDay);
  }, [selectedDay]);

  const todayName = DAYS_OF_WEEK.find((d: any) => d.id === todayIndex)?.name || 'Bugün';

  const insets = useSafeAreaInsets();

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20
  );

  const schoolBgTint = bgTint || (activeSchool?.color ? getOpaqueTint(activeSchool.color) : Colors.background);

  const ctx: HomeCtx = {
    navigation,
    reloadSchoolTheme,
    bgTint,
    openDrawer,
    refreshing,
    setRefreshing,
    currentTime,
    setCurrentTime,
    unreadMessageCount,
    setUnreadMessageCount,
    activeSchool,
    setActiveSchoolState,
    defaultSchoolId,
    setDefaultSchoolIdState,
    schoolsList,
    setSchoolsList,
    isInstitutionalTeacher,
    setIsInstitutionalTeacher,
    schoolModalVisible,
    setSchoolModalVisible,
    newSchoolName,
    setNewSchoolName,
    newSchoolColor,
    setNewSchoolColor,
    isAddingSchool,
    setIsAddingSchool,
    editingSchool,
    setEditingSchool,
    editSchoolName,
    setEditSchoolName,
    editSchoolColor,
    setEditSchoolColor,
    currentExamAlert,
    setCurrentExamAlert,
    teacherProctorDuties,
    setTeacherProctorDuties,
    serverSchoolId,
    setServerSchoolId,
    optikModalVisible,
    setOptikModalVisible,
    todayIndex,
    selectedDay,
    setSelectedDay,
    displayedLessons,
    setDisplayedLessons,
    showAllSchoolsSchedule,
    setShowAllSchoolsSchedule,
    lessonInfo,
    setLessonInfo,
    heroNavTarget,
    setHeroNavTarget,
    heroTopic,
    setHeroTopic,
    heroTopicLoading,
    setHeroTopicLoading,
    teacherDisplayName,
    setTeacherDisplayName,
    assignedLessonsList,
    setAssignedLessonsList,
    assignedClassesList,
    setAssignedClassesList,
    teacherInfoModalVisible,
    setTeacherInfoModalVisible,
    stats,
    setStats,
    selectedDayAgendaItems,
    setSelectedDayAgendaItems,
    todayAlertItems,
    setTodayAlertItems,
    pendingAgendaCount,
    setPendingAgendaCount,
    topicModalVisible,
    setTopicModalVisible,
    topicLoading,
    setTopicLoading,
    topicInfo,
    setTopicInfo,
    selectedTopicIndex,
    setSelectedTopicIndex,
    yearlyPlanModalVisible,
    setYearlyPlanModalVisible,
    yearlyPlanLoading,
    setYearlyPlanLoading,
    yearlyPlanList,
    setYearlyPlanList,
    yearlyPlanPdf,
    setYearlyPlanPdf,
    yearlyPlanMeta,
    setYearlyPlanMeta,
    planSearchQuery,
    setPlanSearchQuery,
    planDateStart,
    setPlanDateStart,
    planDateEnd,
    setPlanDateEnd,
    showPlanDatePicker,
    setShowPlanDatePicker,
    pdfViewerModalVisible,
    setPdfViewerModalVisible,
    planScrollRef,
    planItemOffsets,
    highlightedPlanId,
    setHighlightedPlanId,
    todayLessons,
    currentActiveIndex,
    effectiveHeroLesson,
    heroDay,
    isHeroToday,
    heroDayObj,
    heroDayName,
    isCurrentLesson,
    isNextLesson,
    heroDisplayIndex,
    heroDisplayTotal,
    currentTopicItem,
    prevTopics,
    nextTopics,
    filteredPlanList,
    isViewingToday,
    selectedDayObj,
    selectedDateString,
    todayName,
    insets,
    topInset,
    schoolBgTint
  };

  Object.assign(ctx, createHomeHandlers(ctx));

  const {
    loadSchools,
    loadData,
    loadDaySchedule,
    loadAgendaData,
    onRefresh,
    handleExitApp,
    handleSelectSchool,
    handleJumpToCurrentDayAndLesson,
    handlePrevHeroLesson,
    handleNextHeroLesson,
    handleCopyNotebookText,
    handleOpenTopicModal,
    handleOpenYearlyPlanModal,
    handlePrevDay,
    handleJumpToToday,
    handleNextDay,
    handleToggleShowAllSchools
  } = ctx;

  useFocusEffect(
    useCallback(() => {
      const currentDay = getDayOfWeekIndex();
      setSelectedDay(currentDay);
      setHeroNavTarget(null);
      loadSchools().then(() => {
        loadData(currentDay);
      });
      fetchUnreadMessageCount();
      const interval = setInterval(() => {
        setCurrentTime(getCurrentTimeString());
        getActiveAndTodayLessons(showAllSchoolsSchedule ? 'all' : undefined).then(async (info: any) => {
          setLessonInfo(info);
        });
      }, 30000); // 30 sec tick
      return () => clearInterval(interval);
    }, [showAllSchoolsSchedule])
  );

  useEffect(() => {
    const unsub = subscribeUnreadCount(setUnreadMessageCount);
    fetchUnreadMessageCount();
    return () => unsub();
  }, []);

  useEffect(() => {
    loadDaySchedule(selectedDay);
    const dateStr = getDateForDayOfWeek(selectedDay);
    loadAgendaData(dateStr);
  }, [selectedDay]);

  useEffect(() => {
    let isMounted = true;
    if (!effectiveHeroLesson) {
      setHeroTopic(null);
      setHeroTopicLoading(false);
      return;
    }

    setHeroTopicLoading(true);
    getCurrentTopicForClass(
      effectiveHeroLesson.class_id,
      effectiveHeroLesson.course_id || undefined,
      effectiveHeroLesson.day_of_week,
      effectiveHeroLesson.slot_id,
      effectiveHeroLesson.class_name,
      effectiveHeroLesson.course_name
    )
      .then((topic: any) => {
        if (isMounted) {
          setHeroTopic(topic);
          setHeroTopicLoading(false);
        }
      })
      .catch((err: any) => {
        console.error('Error loading hero topic:', err);
        if (isMounted) {
          setHeroTopic(null);
          setHeroTopicLoading(false);
        }
      });

    // Yazılı Sınav Uyarısı Denetimi
    (async () => {
      try {
        const session = await getActiveUserSession();
        const sId = session?.schoolId;
        if (sId) {
          const res = await checkTeacherExamAlert(
            sId,
            session?.fullName || session?.username,
            new Date().toISOString().substring(0, 10),
            effectiveHeroLesson?.slot_number || effectiveHeroLesson?.slot_id
          );
          if (isMounted) {
            setCurrentExamAlert(res?.hasExam ? res : null);
          }
        }
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [
    effectiveHeroLesson?.id,
    effectiveHeroLesson?.slot_id,
    effectiveHeroLesson?.class_id,
    effectiveHeroLesson?.course_id,
    effectiveHeroLesson?.day_of_week,
    effectiveHeroLesson?.class_name,
    effectiveHeroLesson?.course_name,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: schoolBgTint }}>
      <ScrollView
        style={[styles.container, { backgroundColor: schoolBgTint }]}
        contentContainerStyle={[styles.contentContainer, { paddingTop: topInset + 2 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Welcome Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={openDrawer}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={26} color={activeSchool?.color || Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topBarLeft}
            onPress={() => {
              loadSchools();
              setEditingSchool(null);
              setIsAddingSchool(false);
              setSchoolModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.dateText}>
                  {todayName}, {formatDateToTR(new Date().toISOString().split('T')[0])}
                </Text>
                {isInstitutionalTeacher && (
                  <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 2 }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#4F46E5' }}>Kurumsal</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
                <Text
                  style={[styles.greetingTitle, { color: activeSchool?.color || Colors.textPrimary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.7}
                >
                  {activeSchool?.name || 'Sınıf Takip & Ajanda'}
                </Text>
                {schoolsList.length > 1 && (
                  <Ionicons name="chevron-down-circle" size={13} color={activeSchool?.color || Colors.primary} />
                )}
              </View>

              {/* Öğretmen Adı ve Sorumlu Ders/Şube Bilgi Butonu */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <TouchableOpacity
                  onPress={() => setTeacherInfoModalVisible(true)}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2f5ff', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 8, gap: 4, maxWidth: '100%' }}
                >
                  <Ionicons name="person-circle" size={12} color={activeSchool?.color || Colors.primary} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                    {teacherDisplayName ? `Sn. ${teacherDisplayName}` : 'Öğretmen Bilgisi'}
                  </Text>
                  <View style={{ backgroundColor: `${activeSchool?.color || Colors.primary}18`, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, marginLeft: 2 }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: activeSchool?.color || Colors.primary }}>Ders & Şubelerim ℹ️</Text>
                  </View>
                  <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, marginLeft: 3 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>v{CURRENT_APP_VERSION}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {schoolsList.length > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <View style={{ backgroundColor: `${activeSchool?.color || Colors.primary}18`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: activeSchool?.color || Colors.primary }}>
                      Okul Değiştir ({schoolsList.length} Okul)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: Colors.textMuted }}>(Değiştirmek için dokunun)</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Mesajlar Kısayol Butonu + Okunmamış Mesaj Baloncuğu */}
              <TouchableOpacity
                style={styles.settingsHeaderBtn}
                onPress={() => navigation.navigate('Messages')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubbles-outline" size={17} color={activeSchool?.color || Colors.primary} />
                {unreadMessageCount > 0 && (
                  <View style={styles.headerMessageBadge}>
                    <Text style={styles.headerMessageBadgeText}>
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Ajanda Kısayol Butonu + Rozet */}
              <TouchableOpacity
                style={styles.settingsHeaderBtn}
                onPress={() => navigation.navigate('Agenda')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={17} color={activeSchool?.color || Colors.primary} />
                {pendingAgendaCount > 0 && (
                  <View style={styles.headerAgendaBadge}>
                    <Text style={styles.headerAgendaBadgeText}>
                      {pendingAgendaCount > 9 ? '9+' : pendingAgendaCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingsHeaderBtn}
                onPress={() => navigation.navigate('Operations')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="options-outline" size={18} color={activeSchool?.color || Colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingsHeaderBtn, styles.exitHeaderBtn]}
                onPress={handleExitApp}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="power" size={16} color={Colors.danger} />
              </TouchableOpacity>
            </View>

            <View style={styles.clockBadge}>
              <Ionicons name="time-outline" size={12} color={activeSchool?.color || Colors.primary} />
              <Text style={[styles.clockText, { color: activeSchool?.color || Colors.primary }]}>{currentTime}</Text>
            </View>
          </View>
        </View>

        {/* 🏫 ÇOKLU OKUL SEÇİCİ TAB ÇUBUĞU (Öğretmen Bağlı Olduğu Okullar Arasında Tek Dokunuşla Geçiş Yapar) */}
        {schoolsList.length > 1 && (
          <View style={styles.schoolSwitcherBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.schoolSwitcherScroll}
            >
              {schoolsList.map((sch: any) => {
                const isSelected = activeSchool?.id === sch.id;
                const schColor = sch.color || Colors.primary;
                return (
                  <TouchableOpacity
                    key={sch.id}
                    style={[
                      styles.schoolSwitchTab,
                      isSelected ? [styles.schoolSwitchTabActive, { borderColor: schColor, backgroundColor: `${schColor}14` }] : null,
                    ]}
                    onPress={() => handleSelectSchool(sch.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="school"
                      size={14}
                      color={isSelected ? schColor : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.schoolSwitchTabText,
                        isSelected ? [styles.schoolSwitchTabTextActive, { color: schColor }] : null,
                      ]}
                      numberOfLines={1}
                    >
                      {sch.name}
                    </Text>
                    {isSelected && (
                      <View style={[styles.activeSchoolBadge, { backgroundColor: schColor }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 💬 OKUNMAMIŞ KURUM İÇİ MESAJ BİLDİRİM BALONCUĞU / KARTI */}
        {unreadMessageCount > 0 && (
          <TouchableOpacity
            style={styles.unreadNotificationBanner}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.85}
          >
            <View style={styles.unreadNotificationIconWrap}>
              <Ionicons name="chatbubbles" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.unreadNotificationTitle}>
                  {unreadMessageCount} Yeni Okunmamış Mesajınız Var!
                </Text>
                <View style={styles.unreadNotificationLiveDot} />
              </View>
              <Text style={styles.unreadNotificationSub} numberOfLines={1}>
                Okul idaresi veya meslektaşlarınızdan gelen mesajları okumak için dokunun.
              </Text>
            </View>
            <View style={styles.unreadNotificationActionBtn}>
              <Text style={styles.unreadNotificationActionText}>Oku</Text>
              <Ionicons name="chevron-forward" size={14} color="#4F46E5" />
            </View>
          </TouchableOpacity>
        )}

        {/* 🏛️ SINAV GÖZETMENLİK GÖREVLERİ KARTI */}
        {teacherProctorDuties.length > 0 && (
          <View style={styles.proctorDutyContainer}>
            <View style={styles.proctorDutyHeaderRow}>
              <View style={styles.proctorDutyBadge}>
                <Ionicons name="shield-checkmark" size={15} color="#4338CA" />
                <Text style={styles.proctorDutyBadgeText}>SINAV GÖZETMENLİK GÖREVLERİNİZ</Text>
              </View>
              <Text style={styles.proctorDutyCountText}>{teacherProctorDuties.length} Görev</Text>
            </View>

            {teacherProctorDuties.map((duty: any, idx: any) => (
              <View
                key={`${duty.examId}-${duty.roomName}-${idx}`}
                style={[
                  styles.proctorDutyCard,
                  duty.isToday ? styles.proctorDutyCardToday : null,
                ]}
              >
                <View style={styles.proctorDutyCardLeft}>
                  <View style={[styles.proctorIconWrap, duty.isToday ? { backgroundColor: '#EDE9FE' } : null]}>
                    <Ionicons name="document-text" size={20} color={duty.isToday ? '#7C3AED' : '#4F46E5'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.proctorRowTop}>
                      <Text style={styles.proctorExamTitle} numberOfLines={2}>
                        {duty.examName}
                      </Text>
                      {duty.isToday ? (
                        <View style={styles.proctorTodayBadge}>
                          <Text style={styles.proctorTodayBadgeText}>BUGÜN</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.proctorMetaRow}>
                      <View style={styles.proctorMetaChip}>
                        <Ionicons name="calendar-outline" size={13} color="#4B5563" />
                        <Text style={styles.proctorMetaChipText}>
                          {duty.examDate} {duty.dayOfWeekStr ? `(${duty.dayOfWeekStr})` : ''}
                        </Text>
                      </View>
                      <View style={styles.proctorMetaChip}>
                        <Ionicons name="time-outline" size={13} color="#4B5563" />
                        <Text style={styles.proctorMetaChipText}>
                          {duty.lessonHour}. Ders ({duty.startTime})
                        </Text>
                      </View>
                    </View>

                    <View style={styles.proctorHallHighlight}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="business" size={15} color="#065F46" />
                        <Text style={styles.proctorHallText}>
                          Gözetmenlik Salonu: <Text style={{ fontWeight: '800' }}>{duty.roomName}</Text>
                        </Text>
                      </View>
                      <View style={styles.proctorStudentCountPill}>
                        <Ionicons name="people" size={12} color="#047857" />
                        <Text style={styles.proctorStudentCountText}>{duty.studentCount} Öğrenci</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 🎯 OPTİK SINAV SONUÇLARIM & BRANŞ KAZANIM ANALİZİ KARTI */}
        {serverSchoolId && (
          <TouchableOpacity
            style={{
              backgroundColor: '#EFF6FF',
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: '#BFDBFE',
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onPress={() => setOptikModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ backgroundColor: '#2563EB', padding: 9, borderRadius: 10 }}>
                <Ionicons name="analytics" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E3A8A' }}>
                  🎯 Optik Sınav Sonuçlarım & Kazanım Analizleri
                </Text>
                <Text style={{ fontSize: 12, color: '#1D4ED8', marginTop: 2 }}>
                  Girdiğiniz şubelerin deneme sonuçlarını, soru zorluklarını ve eksik kazanım karnelerini inceleyin
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#2563EB" />
          </TouchableOpacity>
        )}

        {/* OPTİK SINAV ANALİZ MODALI (ÖĞRETMEN GÖRÜNÜMÜ) */}
        <Modal
          visible={optikModalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setOptikModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', paddingTop: insets.top }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: '#FFFFFF',
                borderBottomWidth: 1,
                borderBottomColor: '#E2E8F0',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                🎯 Optik Sınav Sonuçlarım & Branş Analizleri
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: '#F1F5F9',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
                onPress={() => setOptikModalVisible(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>✕ Kapat</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              <OptikModuleView schoolId={serverSchoolId} mode="teacher" />
            </ScrollView>
          </View>
        </Modal>

        {/* 🚨 TÜM GÜN EKRANDA UYARI KARTI (Günün Kritik Ajanda / Hatırlatma Notları) */}
        {todayAlertItems.length > 0 && (
          <View style={styles.alertBannerContainer}>
            {todayAlertItems.map((alertItem: any) => (
              <TouchableOpacity
                key={alertItem.id}
                style={[
                  styles.alertBannerCard,
                  alertItem.priority === 'acil' ? styles.alertBannerCardUrgent : null,
                ]}
                onPress={() => navigation.navigate('Agenda')}
                activeOpacity={0.85}
              >
                <View style={styles.alertBannerLeft}>
                  <View
                    style={[
                      styles.alertIconWrap,
                      alertItem.priority === 'acil' ? { backgroundColor: '#FEE2E2' } : null,
                    ]}
                  >
                    <Ionicons
                      name={alertItem.priority === 'acil' ? 'flame' : 'alert-circle'}
                      size={20}
                      color={alertItem.priority === 'acil' ? '#DC2626' : '#D97706'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.alertHeaderRow}>
                      <Text
                        style={[
                          styles.alertBadgeText,
                          alertItem.priority === 'acil' ? { color: '#DC2626' } : null,
                        ]}
                      >
                        {alertItem.priority === 'acil' ? '🚨 ACİL DİKKAT' : '🔔 GÜNÜN UYARISI'}
                      </Text>
                      {alertItem.has_time === 1 && alertItem.time ? (
                        <View style={styles.alertTimePill}>
                          <Ionicons name="time" size={10} color="#78350F" />
                          <Text style={styles.alertTimeText}>{alertItem.time}</Text>
                        </View>
                      ) : (
                        <View style={styles.alertTimePill}>
                          <Ionicons name="sunny" size={10} color="#78350F" />
                          <Text style={styles.alertTimeText}>Tüm Gün</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.alertTitleText} numberOfLines={2}>
                      {alertItem.title}
                    </Text>
                    {alertItem.description ? (
                      <Text style={styles.alertDescText} numberOfLines={1}>
                        {alertItem.description}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.alertQuickCheckBtn}
                  onPress={async () => {
                    await toggleAgendaItemCompleted(alertItem.id, true);
                    await loadAgendaData();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark" size={15} color="#047857" />
                  <Text style={styles.alertQuickCheckText}>Tamamla</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ACTIVE / NAVIGATED LESSON HERO CARD */}
        <View style={styles.heroCardContainer}>
          {effectiveHeroLesson ? (
            <Card
              style={[
                styles.activeCard,
                effectiveHeroLesson.school_color && showAllSchoolsSchedule
                  ? { borderLeftWidth: 4, borderLeftColor: effectiveHeroLesson.school_color }
                  : null,
              ]}
              highlightBorder={isCurrentLesson ? Colors.success : isNextLesson ? Colors.primary : Colors.primaryLight}
            >
              {/* 1. ÜST ROZETLER VE MİNİK SAĞ-SOL GEZİNME OKLARI */}
              <View style={styles.activeBadgeRow}>
                <View style={styles.activeStatusWrap}>
                  {isCurrentLesson ? (
                    <View style={styles.liveIndicator}>
                      <View style={styles.pulsingDot} />
                      <Text style={styles.liveText}>ŞU ANDAKİ DERS</Text>
                    </View>
                  ) : isNextLesson ? (
                    <View style={styles.nextIndicator}>
                      <View style={[styles.pulsingDot, { backgroundColor: Colors.primary }]} />
                      <Text style={styles.nextText}>SIRADAKİ DERS</Text>
                    </View>
                  ) : (
                    <View style={styles.otherIndicator}>
                      <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
                      <Text style={styles.otherText}>
                        {!isHeroToday ? `${heroDayName} • ` : ''}
                        {effectiveHeroLesson.slot_name || `${effectiveHeroLesson.slot_number || heroDisplayIndex + 1}. Ders`}
                      </Text>
                    </View>
                  )}

                  <Badge
                    label={`${effectiveHeroLesson.start_time || ''} - ${effectiveHeroLesson.end_time || ''}`}
                    status={isCurrentLesson ? 'yapildi' : isNextLesson ? 'bekliyor' : 'varsayilan'}
                    size="sm"
                  />
                </View>

                {/* SAĞ TARAF: AKTİF GÜN/SAAT BUTONU VE SAĞ-SOL GEZİNME OKLARI */}
                <View style={styles.heroRightControlsRow}>
                  {/* Kaydırma oklarının solunda minik buton: Aktif gün ve ders saatine otomatik gelir */}
                  <TouchableOpacity
                    style={[
                      styles.heroCurrentJumpBtn,
                      isCurrentLesson && !heroNavTarget ? styles.heroCurrentJumpBtnActive : null,
                    ]}
                    onPress={handleJumpToCurrentDayAndLesson}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="locate"
                      size={12}
                      color={isCurrentLesson && !heroNavTarget ? Colors.success : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.heroCurrentJumpBtnText,
                        isCurrentLesson && !heroNavTarget ? { color: Colors.successDark } : null,
                      ]}
                    >
                      Şu An
                    </Text>
                  </TouchableOpacity>

                  {/* SAĞ-SOL GEZİNME OKLARI (MİNİK SAĞ SOL OKLARI) */}
                  <View style={styles.heroNavContainer}>
                    <TouchableOpacity
                      style={styles.heroNavArrowBtn}
                      onPress={handlePrevHeroLesson}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={Colors.primary}
                      />
                    </TouchableOpacity>

                    <Text style={styles.heroNavCounter}>
                      {heroDisplayIndex + 1}/{heroDisplayTotal || 1}
                    </Text>

                    <TouchableOpacity
                      style={styles.heroNavArrowBtn}
                      onPress={handleNextHeroLesson}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={Colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 2. SINIF BİLGİSİ, DERS ADI VE DERS NUMARASI - AYNI SATIRDA */}
              <View style={styles.heroCompactRow}>
                {/* Sınıf Bilgisi */}
                <View
                  style={[
                    styles.heroClassBadge,
                    effectiveHeroLesson.school_color
                      ? { backgroundColor: `${effectiveHeroLesson.school_color}18` }
                      : null,
                  ]}
                >
                  <Ionicons
                    name="school-outline"
                    size={13}
                    color={effectiveHeroLesson.school_color || Colors.primary}
                  />
                  <Text
                    style={[
                      styles.heroClassBadgeText,
                      effectiveHeroLesson.school_color
                        ? { color: effectiveHeroLesson.school_color }
                        : null,
                    ]}
                  >
                    {effectiveHeroLesson.class_name || 'Şube Yok'}
                  </Text>
                </View>

                {/* Ders Adı */}
                <Text style={styles.heroCourseNameText} numberOfLines={1}>
                  {effectiveHeroLesson.course_code ? `[${effectiveHeroLesson.course_code}] ` : ''}
                  {effectiveHeroLesson.course_name || 'Ders Belirtilmemiş'}
                </Text>

                {/* Ayırıcı Nokta */}
                <Text style={styles.heroDotSeparator}>•</Text>

                {/* Ders Numarası */}
                <View style={styles.heroSlotBadge}>
                  <Text style={styles.heroSlotBadgeText}>
                    {effectiveHeroLesson.slot_name || `${effectiveHeroLesson.slot_number || heroDisplayIndex + 1}. Ders`}
                  </Text>
                </View>

                {/* Derslik (varsa) */}
                {effectiveHeroLesson.classroom ? (
                  <>
                    <Text style={styles.heroDotSeparator}>•</Text>
                    <Text style={styles.heroClassroomText}>
                      {effectiveHeroLesson.classroom}
                    </Text>
                  </>
                ) : null}
              </View>

              {/* 3. KONUNUN YAZILDIĞI KART (BÜYÜTÜLMÜŞ, TAM VE FERAH METİN) */}
              <View style={styles.expandedTopicCard}>
                <View style={styles.expandedTopicHeader}>
                  <View style={styles.topicHeaderTitleRow}>
                    <View style={styles.topicBookIconBg}>
                      <Ionicons name="book-outline" size={13} color={Colors.primary} />
                    </View>
                    <Text style={styles.expandedTopicLabel}>Deftere Yazılacak Konu</Text>
                  </View>

                  {heroTopic && (
                    <View style={styles.topicHeaderBadges}>
                      {heroTopic.week_number ? (
                        <View style={styles.topicWeekBadge}>
                          <Text style={styles.topicWeekBadgeText}>
                            {heroTopic.week_number}. Hafta{heroTopic.lesson_hours ? ` (${heroTopic.lesson_hours}s)` : ''}
                          </Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => handleCopyNotebookText(heroTopic.subject_topic)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.topicCopyIconBtn}
                      >
                        <Ionicons name="copy-outline" size={13} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* 📝 YAZILI SINAV UYARI ROZETİ (Kullanıcı İsteği) */}
                {currentExamAlert?.hasExam && (
                  <View
                    style={{
                      backgroundColor: '#FEF3C7',
                      borderWidth: 1.5,
                      borderColor: '#F59E0B',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons name="alert-circle" size={22} color="#D97706" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>
                        Şu anda Yazılı Sınav Var!
                      </Text>
                      <Text style={{ fontSize: 11, color: '#B45309', marginTop: 1 }}>
                        {currentExamAlert.message || `${currentExamAlert.examName} yapılmaktadır.`}
                      </Text>
                    </View>
                  </View>
                )}

                {heroTopicLoading ? (
                  <View style={styles.topicLoadingContainer}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.topicLoadingText}>Konu yükleniyor...</Text>
                  </View>
                ) : heroTopic ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleOpenTopicModal(effectiveHeroLesson)}
                  >
                    <Text style={styles.expandedTopicText} selectable={true}>
                      {heroTopic.subject_topic}
                    </Text>
                    {heroTopic.learning_outcomes ? (
                      <Text style={styles.expandedOutcomeText} selectable={true} numberOfLines={2}>
                        Kazanım: {heroTopic.learning_outcomes}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.topicEmptyContainer}
                    onPress={() => handleOpenYearlyPlanModal(effectiveHeroLesson)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.topicEmptyText}>
                      Bu hafta için plan konusu bulunamadı. Planı açmak için dokunun.
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 4. AKSİYON BUTONLARI */}
              <View style={styles.cardActionsRow}>
                {/* Canlı Ders Kokpiti */}
                <TouchableOpacity
                  style={[styles.cardActionBtn, { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }]}
                  onPress={() => {
                    if (effectiveHeroLesson?.class_id) {
                      navigation.navigate('ClassCockpit', {
                        classId: effectiveHeroLesson.class_id,
                        className: effectiveHeroLesson.class_name,
                        lessonName: effectiveHeroLesson.course_name || 'Ders',
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="game-controller" size={15} color="#4F46E5" />
                  <Text style={[styles.cardActionText, { color: '#4F46E5' }]}>Canlı Kokpit</Text>
                </TouchableOpacity>

                {/* Öğrenci Listesi */}
                <TouchableOpacity
                  style={styles.cardActionBtn}
                  onPress={() => {
                    if (effectiveHeroLesson?.class_id) {
                      navigation.navigate('ClassDetail', {
                        classId: effectiveHeroLesson.class_id,
                        className: effectiveHeroLesson.class_name,
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people-outline" size={15} color={Colors.primary} />
                  <Text style={styles.cardActionText}>Öğrenci Listesi</Text>
                </TouchableOpacity>

                {/* Görüş Ekle */}
                <TouchableOpacity
                  style={[styles.cardActionBtn, { backgroundColor: Colors.warningLight }]}
                  onPress={() => {
                    navigation.navigate('StudentNotesTab', {
                      initialClassId: effectiveHeroLesson?.class_id,
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={15} color={Colors.warningDark} />
                  <Text style={[styles.cardActionText, { color: Colors.warningDark }]}>
                    Görüş Ekle
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : (
            <Card style={styles.idleCard} highlightBorder={Colors.primaryLight}>
              {/* Üst Rozetler ve Sağ Gezinme Butonları */}
              <View style={styles.activeBadgeRow}>
                <View style={styles.activeStatusWrap}>
                  <View style={styles.idleIndicator}>
                    <Ionicons name="cafe" size={11} color={Colors.secondary} />
                    <Text style={styles.idleIndicatorText}>ŞU AN DERS BOŞ</Text>
                  </View>
                  <Badge
                    label={currentTime}
                    status="varsayilan"
                    size="sm"
                  />
                </View>

                <View style={styles.heroRightControlsRow}>
                  {/* Şu An Butonu - Boş ders modunda aktif yeşil */}
                  <TouchableOpacity
                    style={[styles.heroCurrentJumpBtn, styles.heroCurrentJumpBtnActive]}
                    onPress={handleJumpToCurrentDayAndLesson}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="locate" size={12} color={Colors.success} />
                    <Text style={[styles.heroCurrentJumpBtnText, { color: Colors.successDark }]}>
                      Şu An
                    </Text>
                  </TouchableOpacity>

                  {/* SAĞ-SOL GEZİNME OKLARI */}
                  <View style={styles.heroNavContainer}>
                    <TouchableOpacity
                      style={styles.heroNavArrowBtn}
                      onPress={handlePrevHeroLesson}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-back" size={14} color={Colors.primary} />
                    </TouchableOpacity>

                    <Text style={styles.heroNavCounter}>—</Text>

                    <TouchableOpacity
                      style={styles.heroNavArrowBtn}
                      onPress={handleNextHeroLesson}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* İçerik Satırı */}
              <View style={styles.idleRow}>
                <View style={styles.idleIconWrap}>
                  <Ionicons name="cafe-outline" size={24} color={Colors.secondary} />
                </View>
                <View style={styles.idleTextWrap}>
                  <Text style={styles.idleTitle}>Şu An Boş Ders</Text>
                  <Text style={styles.idleSub} numberOfLines={2}>
                    {lessonInfo.nextLesson
                      ? `Sıradaki: ${lessonInfo.nextLesson.start_time} • ${lessonInfo.nextLesson.class_name || 'Şube'} - ${lessonInfo.nextLesson.course_name || 'Ders'}`
                      : 'Bugün için başka planlanmış ders bulunmuyor. Oklara basarak en yakın derslere göz atabilirsiniz.'}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        </View>

        {/* SCHEDULE SECTION WITH DAY NAVIGATOR (PREV / NEXT ARROWS) */}
        <View style={styles.scheduleHeaderRow}>
          <View style={styles.dayNavigator}>
            <TouchableOpacity
              style={styles.navArrowBtn}
              onPress={handlePrevDay}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={18} color={Colors.primary} />
            </TouchableOpacity>

            <View style={styles.dayTitleContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.dayMainTitle}>
                  {isViewingToday ? 'Bugün' : `${selectedDayObj?.name} `}
                </Text>
                {isViewingToday ? (
                  <View style={styles.todayPill}>
                    <Text style={styles.todayPillText}>Bugün</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleJumpToToday} style={styles.returnTodayBtn}>
                    <Ionicons name="return-down-back" size={11} color={Colors.primary} />
                    <Text style={styles.returnTodayBtnText}>Bugün</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.daySubTitle}>
                {isViewingToday ? `${selectedDayObj?.name} Programı` : `${selectedDayObj?.name} Günü Programı`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.navArrowBtn}
              onPress={handleNextDay}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('ScheduleTab')}>
            <Text style={styles.seeAllText}>Tüm Program</Text>
          </TouchableOpacity>
        </View>

        {/* TÜM PROGRAMLARI GÖSTER SWITCH ROW */}
        <View style={styles.allProgramsSwitchRow}>
          <View style={styles.allProgramsSwitchLeft}>
            <Ionicons
              name={showAllSchoolsSchedule ? 'layers' : 'layers-outline'}
              size={16}
              color={showAllSchoolsSchedule ? (activeSchool?.color || Colors.primary) : Colors.textSecondary}
            />
            <Text style={styles.allProgramsSwitchLabel}>Tüm programları göster</Text>
            {showAllSchoolsSchedule && schoolsList.length > 1 && (
              <View
                style={[
                  styles.schoolsCountBadge,
                  { backgroundColor: (activeSchool?.color || Colors.primary) + '18' },
                ]}
              >
                <Text
                  style={[
                    styles.schoolsCountBadgeText,
                    { color: activeSchool?.color || Colors.primary },
                  ]}
                >
                  {schoolsList.length} Okul
                </Text>
              </View>
            )}
          </View>

          <Switch
            value={showAllSchoolsSchedule}
            onValueChange={handleToggleShowAllSchools}
            trackColor={{
              false: '#E2E8F0',
              true: (activeSchool?.color || Colors.primary) + '50',
            }}
            thumbColor={showAllSchoolsSchedule ? (activeSchool?.color || Colors.primary) : '#FFFFFF'}
            style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
          />
        </View>

        {displayedLessons.length === 0 ? (
          <Card style={styles.emptyTodayCard}>
            <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyTodayText}>
              {selectedDayObj?.name} günü için planlanmış ders bulunmuyor.
            </Text>
            <TouchableOpacity
              style={styles.addScheduleLink}
              onPress={() => navigation.navigate('ScheduleTab')}
            >
              <Text style={styles.addScheduleLinkText}>Programı Düzenle</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          displayedLessons.map((item: any, index: any) => {
            const isCurrent =
              isViewingToday &&
              lessonInfo.currentLesson &&
              lessonInfo.currentLesson.slot_id === item.slot_id;

            const schoolColor = item.school_color || activeSchool?.color || Colors.primary;

            // Arkaplan rengi: Tüm programlar gösteriliyorsa ilgili okulun rengiyle hafif tonlu
            const cardBg = showAllSchoolsSchedule && item.school_color
              ? `${item.school_color}14`
              : isCurrent
                ? '#F8FAFC'
                : Colors.card;

            const cardBorder = isCurrent
              ? Colors.primary
              : showAllSchoolsSchedule && item.school_color
                ? `${item.school_color}40`
                : undefined;

            return (
              <Card
                key={`${item.slot_id}-${item.id || index}`}
                style={[
                  styles.timelineCard,
                  { backgroundColor: cardBg },
                  showAllSchoolsSchedule && item.school_color
                    ? { borderLeftWidth: 4, borderLeftColor: item.school_color }
                    : isCurrent
                      ? styles.timelineActive
                      : null,
                ]}
                highlightBorder={cardBorder}
              >
                <View style={styles.timelineRow}>
                  {/* 1. DERS NUMARASI / SAATİ (Dokununca deftere yazılacak metin popup'ı) */}
                  <TouchableOpacity
                    style={styles.timeColumnTouch}
                    onPress={() => handleOpenTopicModal(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.slotName}>{item.slot_name}</Text>
                    <Text style={styles.timeRange}>
                      {item.start_time} - {item.end_time}
                    </Text>
                    <View
                      style={[
                        styles.defterPill,
                        showAllSchoolsSchedule && item.school_color
                          ? { backgroundColor: `${item.school_color}18` }
                          : null,
                      ]}
                    >
                      <Ionicons
                        name="create-outline"
                        size={11}
                        color={showAllSchoolsSchedule && item.school_color ? item.school_color : Colors.primary}
                      />
                      <Text
                        style={[
                          styles.defterPillText,
                          showAllSchoolsSchedule && item.school_color ? { color: item.school_color } : null,
                        ]}
                      >
                        Defter
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.lessonDivider} />

                  {/* 2. ORTA BÖLÜM: OKUL ROZETİ, ÇAKIŞMA UYARISI, ŞUBE ADI & DERS */}
                  <View style={styles.lessonContent}>
                    {showAllSchoolsSchedule && (
                      <View style={styles.cardMetaRow}>
                        {item.school_name && (
                          <View
                            style={[
                              styles.schoolPill,
                              {
                                backgroundColor: `${schoolColor}18`,
                                borderColor: `${schoolColor}35`,
                              },
                            ]}
                          >
                            <View style={[styles.schoolPillDot, { backgroundColor: schoolColor }]} />
                            <Text
                              style={[styles.schoolPillText, { color: schoolColor }]}
                              numberOfLines={1}
                            >
                              {item.school_name}
                            </Text>
                          </View>
                        )}

                        {item.has_conflict && (
                          <TouchableOpacity
                            style={styles.conflictWarningBadge}
                            onPress={() => {
                              Alert.alert(
                                'Ders Saati Çakışması',
                                `Bu saatte başka bir okulda da dersiniz bulunmaktadır:\n\n` +
                                `• Görüntülenen: ${item.school_name || 'Seçili Okul'} - ${item.class_name || ''} (${item.course_name || ''})\n` +
                                `• Çakışan Okul: ${item.conflict_school_name || 'Diğer Okul'}\n` +
                                `• Çakışan Şube: ${item.conflict_class_name || '-'}\n` +
                                `• Çakışan Ders: ${item.conflict_course_name || '-'}\n` +
                                `• Saat: ${item.conflict_time || item.start_time || ''}`,
                                [{ text: 'Tamam' }]
                              );
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="warning" size={12} color="#D97706" />
                            <Text style={styles.conflictWarningText} numberOfLines={1}>
                              Çakışma: {item.conflict_school_name}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    <View style={styles.lessonHeaderRow}>
                      <TouchableOpacity
                        onPress={() => {
                          if (item.class_id) {
                            navigation.navigate('ClassDetail', {
                              classId: item.class_id,
                              className: item.class_name,
                            });
                          }
                        }}
                        activeOpacity={0.7}
                        style={styles.classNameTouch}
                      >
                        <Text style={styles.lessonClass}>{item.class_name || '-'}</Text>
                        <Ionicons
                          name="people-circle-outline"
                          size={16}
                          color={showAllSchoolsSchedule && item.school_color ? item.school_color : Colors.primary}
                        />
                      </TouchableOpacity>

                      {isCurrent && (
                        <Badge label="Ders İşleniyor" status="yapildi" size="sm" />
                      )}
                    </View>
                    <Text style={styles.lessonCourse}>
                      {item.course_code ? `[${item.course_code}] ` : ''}
                      {item.course_name || '-'}
                    </Text>
                    {item.classroom && (
                      <Text style={styles.classroomSmall}>Derslik: {item.classroom}</Text>
                    )}
                  </View>

                  {/* 3. EN SAĞ TARAF: O SINIF DÜZEYİNE AİT YILLIK PLAN POPUP BUTONU */}
                  <TouchableOpacity
                    style={styles.planCardBtn}
                    onPress={() => handleOpenYearlyPlanModal(item)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.planBtnIconWrap,
                        showAllSchoolsSchedule && item.school_color
                          ? { backgroundColor: `${item.school_color}18` }
                          : null,
                      ]}
                    >
                      <Ionicons
                        name="book-outline"
                        size={15}
                        color={showAllSchoolsSchedule && item.school_color ? item.school_color : Colors.primary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.planCardBtnText,
                        showAllSchoolsSchedule && item.school_color ? { color: item.school_color } : null,
                      ]}
                    >
                      Plan
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })
        )}

        {/* 📅 AJANDA & YAPILACAKLAR BÖLÜMÜ (SEÇİLİ GÜNE ENTEGRE) */}
        <View style={styles.todayAgendaSection}>
          <View style={styles.todayAgendaHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View
                style={[
                  styles.agendaSectionIconWrap,
                  { backgroundColor: `${activeSchool?.color || Colors.primary}18` },
                ]}
              >
                <Ionicons name="calendar" size={17} color={activeSchool?.color || Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.todayAgendaTitle}>
                    {isViewingToday ? 'Bugünün Ajandası' : `${selectedDayObj?.name} Günü Ajandası`}
                  </Text>
                  <View style={styles.agendaDateBadge}>
                    <Text style={styles.agendaDateBadgeText}>
                      {formatDateShortTR(selectedDateString)}
                    </Text>
                  </View>
                  {selectedDayAgendaItems.length > 0 && (
                    <View style={[styles.agendaCountBadge, { backgroundColor: `${activeSchool?.color || Colors.primary}18` }]}>
                      <Text style={[styles.agendaCountBadgeText, { color: activeSchool?.color || Colors.primary }]}>
                        {selectedDayAgendaItems.filter((i: any) => i.is_completed === 1).length}/{selectedDayAgendaItems.length}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.todayAgendaSubtitle}>
                  {selectedDayAgendaItems.length > 0
                    ? `${selectedDayAgendaItems.filter((i: any) => i.is_completed === 0).length} bekleyen iş / randevu`
                    : isViewingToday
                      ? 'Günün planları, görevleri ve hatırlatıcıları'
                      : `${selectedDayObj?.name} için kayıtlı randevu veya görev bulunmuyor`}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[styles.agendaQuickAddBtn, { borderColor: activeSchool?.color || Colors.primary }]}
                onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={14} color={activeSchool?.color || Colors.primary} />
                <Text style={[styles.agendaQuickAddText, { color: activeSchool?.color || Colors.primary }]}>Ekle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.agendaViewAllBtn}
                onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
                activeOpacity={0.7}
              >
                <Text style={styles.agendaViewAllText}>Tümü</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedDayAgendaItems.length === 0 ? (
            <TouchableOpacity
              style={styles.agendaEmptyBanner}
              onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
              activeOpacity={0.7}
            >
              <View style={styles.agendaEmptyIconWrap}>
                <Ionicons name="sparkles" size={18} color={activeSchool?.color || Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.agendaEmptyTitle}>
                  {isViewingToday
                    ? 'Bugün için kayıtlı işiniz yok'
                    : `${selectedDayObj?.name} (${formatDateShortTR(selectedDateString)}) için kayıtlı randevu veya iş yok`}
                </Text>
                <Text style={styles.agendaEmptyText}>
                  {isViewingToday
                    ? 'Günün görevlerini veya hatırlatıcılarını eklemek için dokunun.'
                    : `${selectedDayObj?.name} gününe görev veya randevu eklemek için dokunun.`}
                </Text>
              </View>
              <Ionicons name="add-circle" size={20} color={activeSchool?.color || Colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.agendaItemsList}>
              {selectedDayAgendaItems.map((item: any) => {
                const isCompleted = item.is_completed === 1;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.agendaItemRow,
                      item.is_all_day_alert === 1 && !isCompleted ? styles.agendaItemRowAlert : null,
                      isCompleted ? styles.agendaItemRowCompleted : null,
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.agendaCheckbox,
                        isCompleted ? styles.agendaCheckboxDone : styles.agendaCheckboxPending,
                      ]}
                      onPress={async () => {
                        await toggleAgendaItemCompleted(item.id, !isCompleted);
                        await loadAgendaData(selectedDateString);
                      }}
                      activeOpacity={0.7}
                    >
                      {isCompleted && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text
                          style={[
                            styles.agendaItemTitle,
                            isCompleted ? styles.agendaItemTitleDone : null,
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        {item.is_all_day_alert === 1 && !isCompleted && (
                          <View style={styles.agendaMiniAlertPill}>
                            <Ionicons name="alert-circle" size={10} color={Colors.danger} />
                            <Text style={styles.agendaMiniAlertText}>Uyarı</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        {item.has_time === 1 && item.time ? (
                          <View style={styles.agendaTimeMini}>
                            <Ionicons name="time-outline" size={10} color={Colors.textSecondary} />
                            <Text style={styles.agendaTimeMiniText}>{item.time}</Text>
                          </View>
                        ) : (
                          <View style={styles.agendaTimeMini}>
                            <Ionicons name="sunny-outline" size={10} color={Colors.textMuted} />
                            <Text style={styles.agendaTimeMiniText}>Tüm Gün</Text>
                          </View>
                        )}

                        <Text style={styles.agendaCategoryMiniText}>
                          {item.category === 'gorev' ? '📝 Görev' :
                            item.category === 'toplanti' ? '👥 Toplantı' :
                              item.category === 'sinav' ? '📋 Sınav / Not' :
                                item.category === 'nobet' ? '🛡️ Nöbet' :
                                  item.category === 'hatirlatma' ? '🔔 Hatırlatma' : '📌 Diğer'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* QUICK ACTION BUTTONS */}
        <Text style={styles.sectionHeader}>Hızlı İşlemler</Text>
        <View style={styles.quickGrid}>
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('AssignmentCreate')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: Colors.primaryLight }]}>
                <Ionicons name="document-text" size={22} color={Colors.primary} />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>Yeni Ödev Ver</Text>
                <Text style={styles.quickSub}>Şube & Muafiyet</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('StudentNotesTab')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="chatbubbles" size={22} color={Colors.warningDark} />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>Öğrenci Görüşü</Text>
                <Text style={styles.quickSub}>Not & Değerlendirme</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('ScheduleTab')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: Colors.secondaryLight }]}>
                <Ionicons name="calendar" size={22} color={Colors.secondary} />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>Ders Programı</Text>
                <Text style={styles.quickSub}>Saat & Şubeler</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('ReportsTab')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: Colors.successLight }]}>
                <Ionicons name="stats-chart" size={22} color={Colors.successDark} />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>Excel Raporları</Text>
                <Text style={styles.quickSub}>Dışa Aktar & Paylaş</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('YearlyPlan')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="book" size={22} color="#7C3AED" />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>Yıllık Plan</Text>
                <Text style={styles.quickSub}>Müfredat & Konular</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('Operations')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="construct" size={22} color="#DC2626" />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>İşlemler</Text>
                <Text style={styles.quickSub}>Yedekleme & Ayarlar</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('Agenda')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="calendar" size={22} color="#0284C7" />
              </View>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickTitle}>Ajanda & Hatırlatıcı</Text>
                <Text style={styles.quickSub}>Görevler & Uyarılar</Text>
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />
          </View>

          {/* CANLI SAAT VE ZAMAN KARTI */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: Colors.card,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: Colors.border,
            marginTop: 4,
            ...Shadows.small,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: activeSchool?.color ? `${activeSchool.color}15` : Colors.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name="time" size={20} color={activeSchool?.color || Colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase' }}>
                  Canlı Zaman & Sistem Saati
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>
                  {todayName}, {formatDateToTR(new Date().toISOString().split('T')[0])}
                </Text>
              </View>
            </View>

            <View style={{
              backgroundColor: activeSchool?.color || Colors.primary,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>
                {currentTime}
              </Text>
            </View>
          </View>
        </View>

        {/* QUICK STATS (AT THE BOTTOM OF PAGE) */}
        <Text style={styles.sectionHeader}>Genel İstatistikler</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.classCount}</Text>
            <Text style={styles.statLabel}>Şube</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.studentCount}</Text>
            <Text style={styles.statLabel}>Öğrenci</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{lessonInfo.todayLessons.length}</Text>
            <Text style={styles.statLabel}>Bugünkü Ders</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>
              {stats.pendingAssignments}
            </Text>
            <Text style={styles.statLabel}>Bekleyen Ödev</Text>
          </View>
        </View>
      </ScrollView>

      {/* 1. DEFTERE YAZILACAK METİN (KONU) POP-UP MODAL */}
      <HomeModals ctx={ctx} />

      {/* 💬 Okunmamış Mesajlar Yüzen Bildirim Baloncuğu */}
      <FloatingMessageBubble
        onPress={() => navigation.navigate('Messages')}
        schoolId={activeSchool?.code || (activeSchool?.id ? String(activeSchool.id) : undefined)}
        bottomOffset={80}
      />
    </View>
  );
};
