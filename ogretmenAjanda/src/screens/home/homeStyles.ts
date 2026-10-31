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
import { Colors, Shadows } from '../../theme/colors';
import { useDrawer } from '../../context/DrawerContext';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { PdfViewerModal } from '../../components/PdfViewerModal';
import { CURRENT_APP_VERSION } from '../../services/appUpdateService';
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
import { viewYearlyPlanPdf } from '../../utils/pdfPlanService';
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
import { useSchoolTheme, getOpaqueTint } from '../../context/SchoolThemeContext';
import { getActiveUserSession } from '../../services/apiClient';
import { getActiveTeacherName } from '../../utils/roleService';
import { getTeacherTaughtLessons } from '../../services/yearlyPlanSyncService';
import { subscribeUnreadCount, fetchUnreadMessageCount } from '../../services/messageNotificationService';
import { FloatingMessageBubble } from '../../components/FloatingMessageBubble';
import { OptikModuleView } from '../../components/OptikModuleView';

export interface HeroNavTarget {
  day: number;
  index: number;
  lesson: ScheduleItem;
  dayLessons: ScheduleItem[];
}

export interface StateSetter {
  (updater: (prev: any) => any): void;
  (value: any): void;
}

export interface HomeCtx {
  setRefreshing: StateSetter;
  setCurrentTime: StateSetter;
  setUnreadMessageCount: StateSetter;
  setActiveSchoolState: StateSetter;
  setDefaultSchoolIdState: StateSetter;
  setSchoolsList: StateSetter;
  setIsInstitutionalTeacher: StateSetter;
  setSchoolModalVisible: StateSetter;
  setNewSchoolName: StateSetter;
  setNewSchoolColor: StateSetter;
  setIsAddingSchool: StateSetter;
  setEditingSchool: StateSetter;
  setEditSchoolName: StateSetter;
  setEditSchoolColor: StateSetter;
  setCurrentExamAlert: StateSetter;
  setTeacherProctorDuties: StateSetter;
  setServerSchoolId: StateSetter;
  setOptikModalVisible: StateSetter;
  setSelectedDay: StateSetter;
  setDisplayedLessons: StateSetter;
  setShowAllSchoolsSchedule: StateSetter;
  setLessonInfo: StateSetter;
  setHeroNavTarget: StateSetter;
  setHeroTopic: StateSetter;
  setHeroTopicLoading: StateSetter;
  setTeacherDisplayName: StateSetter;
  setAssignedLessonsList: StateSetter;
  setAssignedClassesList: StateSetter;
  setTeacherInfoModalVisible: StateSetter;
  setStats: StateSetter;
  setSelectedDayAgendaItems: StateSetter;
  setTodayAlertItems: StateSetter;
  setPendingAgendaCount: StateSetter;
  setTopicModalVisible: StateSetter;
  setTopicLoading: StateSetter;
  setTopicInfo: StateSetter;
  setSelectedTopicIndex: StateSetter;
  setYearlyPlanModalVisible: StateSetter;
  setYearlyPlanLoading: StateSetter;
  setYearlyPlanList: StateSetter;
  setYearlyPlanPdf: StateSetter;
  setYearlyPlanMeta: StateSetter;
  setPlanSearchQuery: StateSetter;
  setPlanDateStart: StateSetter;
  setPlanDateEnd: StateSetter;
  setShowPlanDatePicker: StateSetter;
  setPdfViewerModalVisible: StateSetter;
  setHighlightedPlanId: StateSetter;
  refreshing: boolean;
  unreadMessageCount: number;
  activeSchool: School | null;
  defaultSchoolId: number | null;
  schoolsList: School[];
  isInstitutionalTeacher: boolean;
  schoolModalVisible: boolean;
  newSchoolName: string;
  isAddingSchool: boolean;
  editingSchool: School | null;
  editSchoolName: string;
  currentExamAlert: any | null;
  teacherProctorDuties: TeacherProctorDutyItem[];
  serverSchoolId: string | undefined;
  optikModalVisible: boolean;
  selectedDay: number;
  displayedLessons: ScheduleItem[];
  showAllSchoolsSchedule: boolean;
  lessonInfo: ActiveLessonInfo;
  heroTopic: YearlyPlanItem | null;
  heroTopicLoading: boolean;
  teacherDisplayName: string;
  assignedLessonsList: string[];
  assignedClassesList: string[];
  teacherInfoModalVisible: boolean;
  selectedDayAgendaItems: AgendaItem[];
  todayAlertItems: AgendaItem[];
  pendingAgendaCount: number;
  topicModalVisible: boolean;
  topicLoading: boolean;
  topicInfo: LessonTopicSurroundingInfo | null;
  selectedTopicIndex: number;
  yearlyPlanModalVisible: boolean;
  yearlyPlanLoading: boolean;
  yearlyPlanList: YearlyPlanItem[];
  yearlyPlanPdf: YearlyPlanDocument | null;
  yearlyPlanMeta: {
    gradeLevel: number;
    className: string;
    courseName: string;
    courseId: number;
  } | null;
  planSearchQuery: string;
  planDateStart: string;
  planDateEnd: string;
  showPlanDatePicker: 'start' | 'end' | null;
  pdfViewerModalVisible: boolean;
  highlightedPlanId: number | null;
  [key: string]: any;
}

export const styles: Record<string, any> = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 12,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  schoolSwitcherBar: {
    marginBottom: 10,
    marginTop: 2,
  },
  schoolSwitcherScroll: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  schoolSwitchTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Shadows.small,
  },
  schoolSwitchTabActive: {
    borderWidth: 1.5,
  },
  schoolSwitchTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
    maxWidth: 180,
  },
  schoolSwitchTabTextActive: {
    fontWeight: '800',
  },
  activeSchoolBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  hamburgerBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  topBarLogo: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    ...Shadows.small,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  clockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
    ...Shadows.small,
  },
  clockText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  settingsHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  exitHeaderBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  heroCardContainer: {
    marginTop: 0,
    marginBottom: 1,
  },
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 0,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  activeStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pulsingDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.successDark,
    letterSpacing: 0.3,
  },
  nextIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  nextText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.3,
  },
  otherIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  otherText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  heroRightControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroCurrentJumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  heroCurrentJumpBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  heroCurrentJumpBtnText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.primary,
  },
  heroNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 2,
    paddingVertical: 1,
    gap: 1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroNavArrowBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroNavArrowDisabled: {
    backgroundColor: 'transparent',
    opacity: 0.35,
  },
  heroNavCounter: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.textSecondary,
    minWidth: 24,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  heroCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 4,
  },
  heroClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroClassBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  heroCourseNameText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  heroDotSeparator: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  heroSlotBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroSlotBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  heroClassroomText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  expandedTopicCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 3.5,
    borderLeftColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
  },
  expandedTopicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  topicHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topicBookIconBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedTopicLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  topicHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topicWeekBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topicWeekBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  topicCopyIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  expandedTopicText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 18.5,
  },
  expandedOutcomeText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 15,
  },
  topicLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  topicLoadingText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  topicEmptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  topicEmptyText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 0,
    marginBottom: 0,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  cardActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.primary,
  },
  idleCard: {
    backgroundColor: Colors.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 0,
  },
  idleIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  idleIndicatorText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.secondary,
    letterSpacing: 0.3,
  },
  idleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  idleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleTextWrap: {
    flex: 1,
  },
  idleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  idleSub: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
    marginBottom: 10,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 4,
  },
  dayNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  navArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  dayTitleContainer: {
    justifyContent: 'center',
  },
  dayMainTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  daySubTitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  todayPill: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31C48D',
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#03543F',
  },
  returnTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  returnTodayBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  quickGrid: {
    marginBottom: 10,
    gap: 10,

  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,

  },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickTextWrap: {
    flex: 1,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  quickSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyTodayCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTodayText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  addScheduleLink: {
    marginTop: 10,
  },
  addScheduleLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  allProgramsSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    paddingHorizontal: 28,
    paddingVertical: 1,
    borderRadius: 8,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
    height: 35,

  },
  allProgramsSwitchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  allProgramsSwitchLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textPrimary,

  },
  schoolsCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 2,
  },
  schoolsCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  schoolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
  },
  schoolPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  schoolPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  conflictWarningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  conflictWarningText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#B45309',
  },
  timelineCard: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  timelineActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeColumn: {
    width: 76,
  },
  slotName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  timeRange: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  lessonDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
    marginHorizontal: 6,
  },
  lessonContent: {
    flex: 1,
  },
  lessonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lessonClass: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  lessonCourse: {
    fontSize: 11.5,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 0,
  },
  classroomSmall: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  timeColumnTouch: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    marginTop: 2,
    gap: 2,
  },
  defterPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  classNameTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 1,
  },
  planCardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    marginLeft: 4,
  },
  planBtnIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  planCardBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 14,
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    ...Shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 12,
  },
  modalClassTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalCourseTag: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalEmptyWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  modalEmptyDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  modalEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    gap: 6,
  },
  modalEmptyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalScroll: {
    marginTop: 4,
  },
  topicStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  stepArrowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  stepArrowBtnDisabled: {
    opacity: 0.4,
  },
  stepArrowText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  topicSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
  },
  noAdjacentBox: {
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  noAdjacentText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  adjacentCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    marginBottom: 8,
  },
  adjacentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  offsetBadgeGray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offsetBadgeTextGray: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  offsetBadgeBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offsetBadgeTextBlue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  adjacentMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  adjacentTopicText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  currentTopicHeroCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#22C55E',
    padding: 14,
    marginVertical: 12,
    ...Shadows.medium,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mainBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroWeekText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  heroDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 10,
  },
  heroTopicBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 10,
  },
  heroTopicText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  outcomesContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
  },
  outcomesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 2,
  },
  outcomesBody: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  heroCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
    ...Shadows.small,
  },
  heroCopyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  yearlyPlanModalContainer: {
    maxHeight: '96%',
    height: '96%',
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 16,
  },
  yearlyPlanActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  pdfOpenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  pdfOpenBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planManageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  planManageBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  dateFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  dateFilterInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    gap: 4,
  },
  dateFilterInput: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  dateFilterText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  headerTodayIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayJumpIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 34,
    paddingHorizontal: 9,
    borderRadius: 8,
    gap: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  todayJumpIconBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planItemCardHighlighted: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: '#EEF2FF',
  },
  planItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    ...Shadows.small,
  },
  planItemCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  planItemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  weekBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  weekBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  planDateInlineText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  planHoursText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  planDateText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  planSubjectText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 6,
  },
  planOutcomesWrap: {
    backgroundColor: Colors.background,
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  planOutcomesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  planOutcomesBody: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  headerAgendaBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerAgendaBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  headerMessageBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerMessageBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  unreadNotificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#4F46E5',
    ...Shadows.small,
  },
  unreadNotificationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadNotificationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  unreadNotificationLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  unreadNotificationSub: {
    fontSize: 11.5,
    color: '#4338CA',
    marginTop: 2,
  },
  unreadNotificationActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 3,
    marginLeft: 6,
  },
  unreadNotificationActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  alertBannerContainer: {
    marginBottom: 10,
    gap: 8,
  },
  alertBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#F59E0B',
    ...Shadows.small,
  },
  alertBannerCardUrgent: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderLeftColor: '#EF4444',
  },
  alertBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  alertTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  alertTimeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#78350F',
  },
  alertTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  alertDescText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  alertQuickCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  alertQuickCheckText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  todayAgendaSection: {
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  todayAgendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: 8,
  },
  agendaSectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayAgendaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  agendaCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  agendaCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  todayAgendaSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  agendaQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  agendaQuickAddText: {
    fontSize: 11,
    fontWeight: '700',
  },
  agendaViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  agendaViewAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  agendaEmptyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  agendaEmptyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaEmptyTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  agendaEmptyText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  agendaItemsList: {
    gap: 6,
  },
  agendaItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  agendaItemRowAlert: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    backgroundColor: '#FFFDFD',
  },
  agendaItemRowCompleted: {
    opacity: 0.6,
    backgroundColor: '#F1F5F9',
  },
  agendaCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  agendaCheckboxPending: {
    borderColor: Colors.divider,
    backgroundColor: '#FFFFFF',
  },
  agendaCheckboxDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  agendaItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  agendaItemTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  agendaMiniAlertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  agendaMiniAlertText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.danger,
  },
  agendaTimeMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  agendaTimeMiniText: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  agendaCategoryMiniText: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  agendaDateBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  agendaDateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  proctorDutyContainer: {
    marginBottom: 12,
    gap: 8,
  },
  proctorDutyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  proctorDutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  proctorDutyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4338CA',
    letterSpacing: 0.5,
  },
  proctorDutyCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  proctorDutyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderLeftWidth: 5,
    borderLeftColor: '#6366F1',
    borderRadius: 14,
    padding: 12,
    ...Shadows.small,
  },
  proctorDutyCardToday: {
    backgroundColor: '#FDF4FF',
    borderColor: '#E9D5FF',
    borderLeftColor: '#9333EA',
  },
  proctorDutyCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  proctorIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proctorRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  proctorExamTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  proctorTodayBadge: {
    backgroundColor: '#9333EA',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proctorTodayBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  proctorMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  proctorMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proctorMetaChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  proctorHallHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  proctorHallText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  proctorStudentCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proctorStudentCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
});
