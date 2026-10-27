import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';

export interface SchoolSnapshotTeacher {
  id: string;
  fullName: string;
  username?: string;
  branch: string;
  phone?: string;
  email?: string;
  role: string;
  counselorClass?: string;
  isActive: boolean;
  lastLoginAt?: string;
}

export interface SchoolSnapshotClass {
  id: string;
  grade: string;
  section: string;
  className: string;
  name: string;
}

export interface SchoolSnapshotLesson {
  id: string;
  name: string;
  shortCode?: string;
  grade?: string;
  weeklyHours: number;
}

export interface SchoolSnapshotScheduleItem {
  id: string;
  teacherId?: string | null;
  teacherName: string;
  dayOfWeek: number;
  lessonHour: number;
  grade: string;
  section: string;
  lessonName: string;
  lessonCode?: string;
  classroom?: string;
}

export interface SchoolSnapshotDuty {
  id: string;
  teacherName: string;
  dutyPlace: string;
  dayOfWeek?: string;
  date?: string;
}

export interface SchoolSnapshotStudent {
  id: string;
  studentNumber: string;
  fullName: string;
  grade: string;
  section: string;
  photoPath?: string;
  parentName?: string;
  parentPhone?: string;
  studentPhone?: string;
}

export interface SchoolSnapshotData {
  success?: boolean;
  schoolId: string;
  schoolName: string;
  dailyLessonHours: number;
  teachers: SchoolSnapshotTeacher[];
  classes: SchoolSnapshotClass[];
  lessons: SchoolSnapshotLesson[];
  schedules: SchoolSnapshotScheduleItem[];
  duties: SchoolSnapshotDuty[];
  students?: SchoolSnapshotStudent[];
  syncedAt: string; // ISO string
}

const getSnapshotStorageKey = (schoolId: string) => `@school_snapshot_${schoolId}`;
const getSyncTimeStorageKey = (schoolId: string) => `@school_snapshot_time_${schoolId}`;

export async function saveSchoolSnapshotToStorage(schoolId: string, snapshot: SchoolSnapshotData): Promise<void> {
  try {
    await AsyncStorage.setItem(getSnapshotStorageKey(schoolId), JSON.stringify(snapshot));
    await AsyncStorage.setItem(getSyncTimeStorageKey(schoolId), snapshot.syncedAt || new Date().toISOString());
  } catch (err) {
    console.warn('saveSchoolSnapshotToStorage error:', err);
  }
}

export async function patchLocalSchoolSnapshot(
  schoolId: string,
  patch: Partial<SchoolSnapshotData>
): Promise<void> {
  try {
    const existing = await loadSchoolSnapshotFromStorage(schoolId);
    if (!existing) return;
    const updated: SchoolSnapshotData = {
      ...existing,
      ...patch,
      syncedAt: new Date().toISOString(),
    };
    await saveSchoolSnapshotToStorage(schoolId, updated);
  } catch (err) {
    console.warn('patchLocalSchoolSnapshot error:', err);
  }
}

export async function loadSchoolSnapshotFromStorage(schoolId: string): Promise<SchoolSnapshotData | null> {
  try {
    const raw = await AsyncStorage.getItem(getSnapshotStorageKey(schoolId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('loadSchoolSnapshotFromStorage error:', err);
    return null;
  }
}

export async function getSchoolSnapshotLastSyncTime(schoolId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(getSyncTimeStorageKey(schoolId));
  } catch {
    return null;
  }
}

export async function fetchAndCacheSchoolSnapshot(schoolId: string): Promise<SchoolSnapshotData | null> {
  try {
    const res = await apiRequest<SchoolSnapshotData>(`schools/${schoolId}/snapshot`);
    if (res.success && res.data) {
      await saveSchoolSnapshotToStorage(schoolId, res.data);
      return res.data;
    }
    return null;
  } catch (err) {
    console.warn('fetchAndCacheSchoolSnapshot error:', err);
    return null;
  }
}

export function formatSyncTime(isoString?: string | null): string {
  if (!isoString) return 'Henüz eşitlenmedi';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month} ${hours}:${mins}`;
  } catch {
    return isoString;
  }
}

