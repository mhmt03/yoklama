import { apiRequest } from './apiClient';
import { optimizeStudentPhoto } from '../utils/imageOptimizer';
import * as FileSystem from 'expo-file-system';

export interface SyncResult {
  success: boolean;
  message: string;
  count?: number;
}

/**
 * Okuldaki öğrencileri sunucudan çeker
 */
export async function fetchStudentsFromServer(schoolId: string): Promise<any[]> {
  const res = await apiRequest<any[]>(`sync/students?schoolId=${schoolId}`);
  if (res.success && res.data) {
    return res.data;
  }
  throw new Error(res.error || 'Öğrenciler sunucudan çekilemedi.');
}

/**
 * Okulun ders programını sunucudan çeker
 */
export async function fetchScheduleFromServer(schoolId: string, teacherName?: string): Promise<any[]> {
  let endpoint = `sync/schedules?schoolId=${schoolId}`;
  if (teacherName) {
    endpoint += `&teacherName=${encodeURIComponent(teacherName)}`;
  }
  const res = await apiRequest<any[]>(endpoint);
  if (res.success && res.data) {
    return res.data;
  }
  throw new Error(res.error || 'Ders programı sunucudan çekilemedi.');
}

/**
 * Okulun yıllık planını sunucudan çeker
 */
export async function fetchYearlyPlanFromServer(schoolId: string, lessonName: string, grade: string): Promise<any[]> {
  const endpoint = `sync/yearly-plans?schoolId=${schoolId}&lessonName=${encodeURIComponent(lessonName)}&grade=${encodeURIComponent(grade)}`;
  const res = await apiRequest<any[]>(endpoint);
  if (res.success && res.data) {
    return res.data;
  }
  throw new Error(res.error || 'Yıllık plan sunucudan çekilemedi.');
}

/**
 * Öğrenci fotoğrafını optimize edip sunucuya yükler
 */
export async function uploadOptimizedStudentPhoto(
  localUri: string,
  schoolCode: string,
  studentNumber: string
): Promise<string | null> {
  try {
    // 1. Önce akıllı kontrol ve gerekirse küçültme
    const opt = await optimizeStudentPhoto(localUri);

    // 2. FormData hazırla
    const formData = new FormData();
    formData.append('schoolCode', schoolCode);
    formData.append('studentNumber', studentNumber);

    const filename = opt.uri.split('/').pop() || `${studentNumber}.jpg`;
    formData.append('file', {
      uri: opt.uri,
      name: filename,
      type: 'image/jpeg',
    } as any);

    // 3. Sunucuya yükle
    const res = await apiRequest<{ photoPath: string }>('uploads/student-photo', 'POST', formData, true);
    if (res.success && res.data?.photoPath) {
      return res.data.photoPath;
    }
    return null;
  } catch (error) {
    console.warn('Fotoğraf yükleme hatası:', error);
    return null;
  }
}

/**
 * Bir ödevi sunucuya gönderir veya günceller
 */
export async function syncAssignmentToServer(payload: {
  id: string;
  schoolId: string;
  lessonName: string;
  title: string;
  description?: string;
  dueDate: string;
  targetGrade: string;
  targetSection: string;
  submissions: Array<{
    id: string;
    studentId: string;
    status: string;
    feedback?: string;
  }>;
}): Promise<boolean> {
  const res = await apiRequest('sync/assignment', 'POST', payload);
  return res.success;
}

/**
 * Bir öğrenci görüş veya notunu sunucuya gönderir/günceller
 */
export async function syncEvaluationToServer(payload: {
  id: string;
  schoolId: string;
  studentId: string;
  type: string;
  title?: string;
  content: string;
  score?: number;
  isSharedWithParent: boolean;
}): Promise<boolean> {
  const res = await apiRequest('sync/evaluation', 'POST', payload);
  return res.success;
}

/**
 * Öğrenci/Veli akış verilerini çeker
 */
export async function fetchStudentPortalFeed(studentId: string, role?: string): Promise<any> {
  const roleQuery = role ? `&role=${encodeURIComponent(role)}` : '';
  const res = await apiRequest(`sync/student-feed?studentId=${studentId}${roleQuery}`);
  if (res.success && res.data) {
    return res.data;
  }
  throw new Error(res.error || 'Öğrenci portal verileri alınamadı.');
}
