/**
 * Günlük Nöbetçi Ders Görevlendirme Servisi
 * - Okul idaresi: gelmeyen öğretmenin dersine nöbetçi atar / kaldırır, gelmeme nedenini günceller.
 * - Öğretmen: kendisine atanan nöbetçi derslerini (veri eşitleme gerektirmeden) anlık sorgular.
 */
import { apiRequest, getAuthToken } from './apiClient';

export interface DutySubstitutionItem {
  id: string;
  schoolId: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  lessonHour: number;
  className: string;
  lessonName: string;
  absentTeacherName: string;
  absenceReason: string;
  substituteTeacherName: string;
  dutyPlace: string;
  updatedAt?: string;
}

/**
 * Hafta içi gün indeksine (1=Pzt..5=Cuma) karşılık gelen tarihi (YYYY-MM-DD) döner.
 * Hafta sonu işlem yapılıyorsa bir sonraki haftanın ilgili günü kabul edilir.
 */
export function getDutyDateForWeekday(dayIndex: number, ref: Date = new Date()): string {
  const jsDay = ref.getDay(); // 0=Pazar
  const current = jsDay === 0 ? 7 : jsDay;
  const base = new Date(ref);
  if (current >= 6) {
    // Cumartesi / Pazar: gelecek haftanın Pazartesi'sini baz al
    base.setDate(base.getDate() + (8 - current));
    base.setDate(base.getDate() + (dayIndex - 1));
  } else {
    base.setDate(base.getDate() + (dayIndex - current));
  }
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function hasServerSession(): Promise<boolean> {
  const token = await getAuthToken();
  return !!token && token !== 'offline_token';
}

export async function fetchSchoolSubstitutions(schoolId: string, date: string): Promise<DutySubstitutionItem[]> {
  if (!schoolId || !(await hasServerSession())) return [];
  const res = await apiRequest<any>(
    `schools/${schoolId}/substitutions?date=${encodeURIComponent(date)}`,
    'GET',
    undefined,
    false,
    true
  );
  if (res.success && res.data && Array.isArray(res.data.data)) return res.data.data;
  return [];
}

export async function saveSubstitution(
  schoolId: string,
  payload: Omit<DutySubstitutionItem, 'id' | 'schoolId' | 'updatedAt'>
): Promise<{ success: boolean; data?: DutySubstitutionItem; error?: string }> {
  const res = await apiRequest<any>(`schools/${schoolId}/substitutions`, 'POST', payload);
  if (res.success && res.data?.data) return { success: true, data: res.data.data };
  return { success: false, error: res.error || 'Görevlendirme kaydedilemedi.' };
}

export async function deleteSubstitution(schoolId: string, id: string): Promise<boolean> {
  const res = await apiRequest<any>(`schools/${schoolId}/substitutions/${id}`, 'DELETE');
  return !!res.success;
}

export async function updateSubstitutionReason(
  schoolId: string,
  date: string,
  absentTeacherName: string,
  absenceReason: string
): Promise<boolean> {
  if (!schoolId || !(await hasServerSession())) return false;
  const res = await apiRequest<any>(
    `schools/${schoolId}/substitutions/reason`,
    'PUT',
    { date, absentTeacherName, absenceReason },
    false,
    true
  );
  return !!res.success;
}

/**
 * Öğretmenin kendisine atanmış nöbetçi derslerini getirir (hafif, sessiz sorgu - polling için uygun).
 */
export async function fetchMySubstitutions(
  date: string,
  teacherName?: string,
  schoolId?: string
): Promise<DutySubstitutionItem[] | null> {
  if (!(await hasServerSession())) return [];
  const q = new URLSearchParams();
  q.append('date', date);
  if (teacherName) q.append('teacherName', teacherName.trim());
  if (schoolId) q.append('schoolId', schoolId);
  const res = await apiRequest<any>(`schools/substitutions/mine?${q.toString()}`, 'GET', undefined, false, true);
  if (res.success && res.data && Array.isArray(res.data.data)) return res.data.data;
  return null; // ağ hatası: mevcut listeyi koru
}

