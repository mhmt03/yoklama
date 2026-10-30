import { getDB } from '../db';
import { apiGet, apiPost, apiPut, apiDelete, apiRequest, getActiveSchoolId } from '../../services/apiClient';

export interface ExamHallItem {
  id: string;
  schoolId?: string;
  roomName: string;
  capacity: number;
  tag: string; // 'İkili Oturum', 'Tekli Oturum', etc.
  orderIndex: number;
  isActive: boolean;
}

export interface WrittenExamItem {
  id: string;
  schoolId?: string;
  name: string;
  examDate: string; // YYYY-MM-DD
  dayOfWeekStr?: string;
  lessonHour: number; // 1..10
  startTime?: string;
  academicYear?: string;
  term?: string;
  isActive: boolean;
  isPublishedToStudents?: boolean;
  studentCount?: number;
  roomCount?: number;
}

export interface ExamSeatingItem {
  id: string;
  writtenExamId: string;
  studentNumber: string;
  fullName: string;
  grade: string;
  section: string;
  lessonName: string;
  roomName: string;
  seatNumber: number;
  proctorTeacherName?: string;
  proctorTeacherId?: string;
}

// -------------------------------------------------------------
// SALON İŞLEMLERİ (EXAM HALLS)
// -------------------------------------------------------------

export async function fetchExamRooms(schoolId?: string, tag?: string): Promise<ExamHallItem[]> {
  try {
    const rawId = schoolId || (await getActiveSchoolId());
    const sId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId.trim() : '';
    const params: string[] = [];
    if (sId) params.push(`schoolId=${encodeURIComponent(sId)}`);
    if (tag && tag !== 'all') params.push(`tag=${encodeURIComponent(tag)}`);
    const qStr = params.length > 0 ? `?${params.join('&')}` : '';

    const res = await apiGet<{ success: boolean; data: any[] }>(`/ExamPlanner/rooms${qStr}`);
    if (res && res.success && Array.isArray(res.data)) {
      return res.data.map((r: any) => ({
        id: String(r.id),
        schoolId: String(r.schoolId),
        roomName: r.roomName,
        capacity: Number(r.capacity) || 30,
        tag: r.tag || 'İkili Oturum',
        orderIndex: Number(r.orderIndex) || 0,
        isActive: r.isActive ?? true,
      }));
    }
  } catch (err) {
    console.warn('[ExamPlanner] Sunucudan salonlar alınamadı, yerel DB kullanılıyor:', err);
  }

  // Yerel SQLite fallback
  const db = await getDB();
  let sql = 'SELECT * FROM exam_halls WHERE is_active = 1';
  const params: any[] = [];
  if (tag && tag !== 'all') {
    sql += ' AND tag = ?';
    params.push(tag);
  }
  sql += ' ORDER BY order_index ASC, room_name ASC';
  const rows = await db.getAllAsync<any>(sql, params);
  return rows.map((r) => ({
    id: String(r.id),
    schoolId: String(r.school_id),
    roomName: r.room_name,
    capacity: Number(r.capacity) || 30,
    tag: r.tag || 'İkili Oturum',
    orderIndex: Number(r.order_index) || 0,
    isActive: r.is_active === 1,
  }));
}

export async function saveExamRoom(room: Partial<ExamHallItem> & { roomName: string; capacity: number }): Promise<boolean> {
  const rawId = room.schoolId || (await getActiveSchoolId());
  const sId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId.trim() : undefined;
  try {
    const res = await apiRequest<{ success: boolean; data: any }>('ExamPlanner/rooms', 'POST', {
      id: room.id,
      schoolId: sId,
      roomName: room.roomName,
      capacity: room.capacity,
      tag: room.tag || 'İkili Oturum',
      orderIndex: room.orderIndex || 0,
      isActive: room.isActive ?? true,
    });
    if (res && res.success) return true;
  } catch (err) {
    console.warn('[ExamPlanner] Sunucuya salon kaydedilemedi, yerel DB güncelleniyor:', err);
  }

  // Yerel SQLite
  const db = await getDB();
  const id = room.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO exam_halls (id, room_name, capacity, tag, order_index, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    room.roomName,
    room.capacity,
    room.tag || 'İkili Oturum',
    room.orderIndex || 0,
    room.isActive ?? true ? 1 : 0
  );
  return true;
}

export async function deleteExamRoom(roomId: string): Promise<boolean> {
  try {
    const res = await apiDelete<{ success: boolean }>(`/ExamPlanner/rooms/${roomId}`);
    if (res && res.success) return true;
  } catch (err) {
    console.warn('[ExamPlanner] Sunucudan salon silinemedi, yerel DB deneniyor:', err);
  }

  const db = await getDB();
  await db.runAsync('DELETE FROM exam_halls WHERE id = ?', roomId);
  return true;
}

export async function seedRoomsFromClasses(defaultTag = 'İkili Oturum', defaultCapacity = 30): Promise<boolean> {
  const rawId = await getActiveSchoolId();
  const sId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId.trim() : '';
  try {
    const sParam = sId ? `schoolId=${encodeURIComponent(sId)}&` : '';
    const res = await apiPost<{ success: boolean }>(
      `/ExamPlanner/rooms/seed-from-classes?${sParam}defaultTag=${encodeURIComponent(defaultTag)}&defaultCapacity=${defaultCapacity}`
    );
    if (res && res.success) return true;
  } catch (err) {
    console.warn('[ExamPlanner] Sunucuda seed yapılamadı, yerel deneniyor:', err);
  }

  const db = await getDB();
  // Yerel şemada öğrenciler sınıflara class_id ile bağlıdır (grade/section sütunu yoktur)
  const classes = await db.getAllAsync<{ name: string; student_count: number }>(
    `SELECT c.name AS name, COUNT(s.id) AS student_count
     FROM classes c
     LEFT JOIN students s ON s.class_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`
  );

  const isTekli = defaultTag === 'Tekli Oturum';

  for (const c of classes) {
    if (c.name) {
      const roomName = c.name.trim();
      const mevcut = Number(c.student_count) || 0;

      let roomCapacity: number;
      if (mevcut > 0) {
        roomCapacity = isTekli ? Math.ceil(mevcut / 2) : mevcut;
      } else {
        roomCapacity = isTekli ? 15 : (defaultCapacity > 0 ? defaultCapacity : 30);
      }

      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM exam_halls WHERE room_name = ?', roomName);
      if (existing) {
        await db.runAsync(
          'UPDATE exam_halls SET capacity = ?, tag = ?, is_active = 1 WHERE id = ?',
          roomCapacity,
          defaultTag,
          existing.id
        );
      } else {
        const id = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.runAsync(
          `INSERT INTO exam_halls (id, room_name, capacity, tag, order_index, is_active)
           VALUES (?, ?, ?, ?, 0, 1)`,
          id,
          roomName,
          roomCapacity,
          defaultTag
        );
      }
    }
  }
  return true;
}

// -------------------------------------------------------------
// SINAV İŞLEMLERİ (WRITTEN EXAMS)
// -------------------------------------------------------------

export async function fetchWrittenExams(schoolId?: string): Promise<WrittenExamItem[]> {
  const rawId = schoolId || (await getActiveSchoolId());
  const sId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId.trim() : '';
  const qStr = sId ? `?schoolId=${encodeURIComponent(sId)}` : '';

  try {
    const res = await apiGet<{ success: boolean; data: any[] }>(`/ExamPlanner/exams${qStr}`);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      const serverExams = res.data.map((e: any) => ({
        id: String(e.id),
        schoolId: String(e.schoolId || ''),
        name: e.name,
        examDate: e.examDateStr || e.examDate?.substring(0, 10),
        dayOfWeekStr: e.dayOfWeekStr,
        lessonHour: Number(e.lessonHour) || 3,
        startTime: e.startTime,
        academicYear: e.academicYear,
        term: e.term,
        isActive: e.isActive ?? true,
        isPublishedToStudents: e.isPublishedToStudents !== false,
        studentCount: Number(e.studentCount) || 0,
        roomCount: Number(e.roomCount) || 0,
      }));

      // Yerel SQLite ile senkronize et
      try {
        const db = await getDB();
        for (const se of serverExams) {
          await db.runAsync(
            `INSERT OR REPLACE INTO written_exams (id, school_id, name, exam_date, lesson_hour, start_time, academic_year, term, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            se.id,
            se.schoolId || null,
            se.name,
            se.examDate,
            se.lessonHour,
            se.startTime || '09:50',
            se.academicYear || '2026-2027',
            se.term || '1. Dönem',
            se.isActive ? 1 : 0
          );
        }
      } catch {}

      return serverExams;
    }
  } catch (err) {
    console.warn('[ExamPlanner] Sunucudan sınavlar alınamadı, yerel DB kullanılıyor:', err);
  }

  // Yerel SQLite Fallback
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM written_exams WHERE is_active = 1 ORDER BY exam_date DESC, lesson_hour ASC'
  );
  return rows.map((r) => ({
    id: String(r.id),
    schoolId: String(r.school_id || ''),
    name: r.name,
    examDate: r.exam_date,
    lessonHour: Number(r.lesson_hour) || 3,
    startTime: r.start_time,
    academicYear: r.academic_year,
    term: r.term,
    isActive: r.is_active === 1,
    isPublishedToStudents: true,
    studentCount: 0,
    roomCount: 0,
  }));
}

export async function saveWrittenExam(exam: Partial<WrittenExamItem> & { name: string; examDate: string; lessonHour: number }): Promise<any> {
  const rawId = exam.schoolId || (await getActiveSchoolId());
  const sId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId.trim() : undefined;

  let serverSavedItem: any = null;
  try {
    const res = await apiRequest<{ success: boolean; data: any }>('ExamPlanner/exams', 'POST', {
      id: exam.id,
      schoolId: sId,
      name: exam.name,
      examDate: exam.examDate,
      lessonHour: exam.lessonHour,
      startTime: exam.startTime || '09:50',
      academicYear: exam.academicYear || '2026-2027',
      term: exam.term || '1. Dönem',
      isActive: exam.isActive ?? true,
      isPublishedToStudents: exam.isPublishedToStudents ?? true,
    });

    if (res && res.success) {
      serverSavedItem = (res.data as any)?.data || res.data;
    } else if (res && !res.success) {
      throw new Error(res.error || 'Sınav sunucuya kaydedilemedi.');
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Sunucuya bağlanılamadı')) {
      throw err;
    }
    console.warn('[ExamPlanner] Sunucuya erişilemedi, yerel DB kullanılıyor:', err);
  }

  // Yerel SQLite'a kaydet (çift güvence)
  const db = await getDB();
  const id = serverSavedItem?.id ? String(serverSavedItem.id) : (exam.id || `exam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  await db.runAsync(
    `INSERT OR REPLACE INTO written_exams (id, school_id, name, exam_date, lesson_hour, start_time, academic_year, term, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    sId || null,
    exam.name,
    exam.examDate,
    exam.lessonHour,
    exam.startTime || '09:50',
    exam.academicYear || '2026-2027',
    exam.term || '1. Dönem',
    exam.isActive ?? true ? 1 : 0
  );

  return serverSavedItem || { id, ...exam, schoolId: sId };
}

export async function deleteWrittenExam(examId: string): Promise<boolean> {
  try {
    const res = await apiDelete<{ success: boolean }>(`/ExamPlanner/exams/${examId}`);
    if (res && res.success) return true;
  } catch (err) {
    console.warn('[ExamPlanner] Sunucudan sınav silinemedi, yerel DB deneniyor:', err);
  }

  const db = await getDB();
  await db.runAsync('DELETE FROM exam_seatings WHERE written_exam_id = ?', examId);
  await db.runAsync('DELETE FROM written_exams WHERE id = ?', examId);
  return true;
}

export async function toggleExamPublish(examId: string, isPublished: boolean): Promise<boolean> {
  try {
    const res = await apiPut<{ success: boolean; isPublishedToStudents?: boolean }>(
      `/ExamPlanner/exams/${examId}/publish`,
      { isPublished: isPublished, isPublishedToStudents: isPublished }
    );
    if (res && res.success) return true;
  } catch (err) {
    console.warn('[ExamPlanner] toggleExamPublish hatası:', err);
  }
  return false;
}

export async function fetchExamDetails(examId: string): Promise<any> {
  try {
    const res = await apiGet<any>(`/ExamPlanner/exams/${examId}/details`);
    if (res && res.success) {
      return res;
    }
  } catch (err) {
    console.warn('[ExamPlanner] Sunucudan sınav detayları alınamadı:', err);
  }
  return null;
}

// -------------------------------------------------------------
// DAĞITIM SİHİRBAZI (PLACE STUDENTS)
// -------------------------------------------------------------

export async function placeStudentsInExam(params: {
  examId: string;
  selectedRoomIds: string[];
  selectedBranches: string[];
  branchLessons: Record<string, string>;
  isButterfly: boolean;
}): Promise<{ success: boolean; message: string; placedCount?: number }> {
  try {
    const res = await apiPost<any>(`/ExamPlanner/exams/${params.examId}/place-students`, {
      selectedRoomIds: params.selectedRoomIds,
      selectedBranches: params.selectedBranches,
      branchLessons: params.branchLessons,
      isButterfly: params.isButterfly,
    });
    if (res && res.success) {
      return { success: true, message: res.message, placedCount: res.placedCount };
    }
    return { success: false, message: res?.message || 'Yerleşim yapılamadı.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Sunucu hatası veya bağlantı problemi.' };
  }
}

export async function updateProctorTeacher(examId: string, roomName: string, proctorTeacherName: string): Promise<boolean> {
  try {
    const res = await apiPut<any>(`/ExamPlanner/exams/${examId}/proctor`, {
      roomName,
      proctorTeacherName,
    });
    return !!(res && res.success);
  } catch (err) {
    console.warn('[ExamPlanner] Gözetmen güncellenemedi:', err);
    return false;
  }
}

// -------------------------------------------------------------
// ÖĞRENCİ & VELİ SORGUSU
// -------------------------------------------------------------

export async function fetchStudentExamSeatings(schoolId: string, studentNumber: string): Promise<any[]> {
  try {
    const res = await apiGet<{ success: boolean; data: any[] }>(
      `/ExamPlanner/student-seatings?schoolId=${schoolId}&studentNumber=${encodeURIComponent(studentNumber)}`
    );
    if (res && res.success && Array.isArray(res.data)) {
      return res.data;
    }
  } catch (err) {
    console.warn('[ExamPlanner] Öğrenci oturma planı sorgulanamadı:', err);
  }
  return [];
}

// -------------------------------------------------------------
// ÖĞRETMEN UYARISI
// -------------------------------------------------------------

export async function checkTeacherExamAlert(
  schoolId: string,
  teacherName?: string,
  dateStr?: string,
  lessonHour?: number
): Promise<{ hasExam: boolean; examName?: string; lessonHour?: number; isProctor?: boolean; proctorRoom?: string; message?: string }> {
  try {
    const query = new URLSearchParams();
    query.append('schoolId', schoolId);
    if (teacherName) query.append('teacherName', teacherName);
    if (dateStr) query.append('dateStr', dateStr);
    if (lessonHour) query.append('lessonHour', String(lessonHour));

    const res = await apiGet<any>(`/ExamPlanner/teacher-exam-alert?${query.toString()}`);
    if (res && res.success) {
      return res;
    }
  } catch (err) {
    // sessizce geç
  }
  return { hasExam: false };
}

export interface TeacherProctorDutyItem {
  examId: string;
  examName: string;
  examDate: string;
  examDateRaw?: string;
  dayOfWeekStr: string;
  lessonHour: number;
  startTime: string;
  roomName: string;
  studentCount: number;
  isToday: boolean;
}

export async function fetchTeacherProctorDuties(
  schoolId?: string,
  teacherName?: string
): Promise<TeacherProctorDutyItem[]> {
  try {
    const sId = schoolId || (await getActiveSchoolId());
    if (!sId) return [];

    let name = teacherName;
    if (!name) {
      const session = await import('../../services/apiClient').then((m) => m.getActiveUserSession());
      name = session?.teacherName || session?.fullName || session?.username || '';
    }
    if (!name) return [];

    const res = await apiGet<{ success: boolean; data: TeacherProctorDutyItem[] }>(
      `/ExamPlanner/teacher-proctor-duties?schoolId=${encodeURIComponent(sId)}&teacherName=${encodeURIComponent(name.trim())}`
    );
    if (res && res.success && Array.isArray(res.data)) {
      return res.data;
    }
  } catch (err) {
    console.warn('[ExamPlanner] Gözetmenlik görevleri alınamadı:', err);
  }
  return [];
}

export interface BranchDistributionItem {
  key: string;
  grade: string;
  section: string;
  count: number;
}

export async function fetchExamBranches(schoolId?: string): Promise<BranchDistributionItem[]> {
  try {
    const rawId = schoolId || (await getActiveSchoolId());
    const sId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId.trim() : '';
    const query = sId ? `?schoolId=${encodeURIComponent(sId)}` : '';
    const res = await apiGet<{ success: boolean; data: BranchDistributionItem[] }>(
      `/ExamPlanner/branches${query}`
    );
    if (res && res.success && Array.isArray(res.data)) {
      return res.data;
    }
  } catch (err) {
    console.warn('[ExamPlanner] fetchExamBranches API hatası:', err);
  }

  // Yerel SQLite fallback (offline)
  try {
    const db = await getDB();
    // Yerel şemada öğrenciler sınıflara class_id ile bağlıdır (grade/section sütunu yoktur)
    const rows = await db.getAllAsync<any>(
      `SELECT c.name AS name, COUNT(s.id) AS cnt
       FROM classes c
       LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id`
    );
    const map: Record<string, { grade: string; section: string; count: number }> = {};
    for (const r of rows) {
      const n = String(r.name || '').trim();
      if (!n) continue;
      const match = n.match(/^(\d+)[-/.\s]*([A-Za-zÇĞİÖŞÜçğıöşü]+)$/i);
      const grade = match ? match[1] : (n.replace(/\D/g, '') || n);
      const section = match ? match[2].toUpperCase() : (n.replace(/\d/g, '').replace(/[-/.\s]/g, '').toUpperCase() || '');
      const key = match ? `${grade}-${section}` : n;
      if (!map[key]) {
        map[key] = { grade, section, count: 0 };
      }
      map[key].count += Number(r.cnt) || 0;
    }
    return Object.keys(map).map((k) => ({
      key: k,
      grade: map[k].grade,
      section: map[k].section,
      count: map[k].count,
    })).sort((a, b) => a.key.localeCompare(b.key, 'tr', { numeric: true }));
  } catch {
    return [];
  }
}

export async function swapOrMoveStudentSeat(params: {
  writtenExamId: string;
  seatingId: string;
  targetRoomName: string;
  targetSeatNumber: number;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiPost<{ success: boolean; message: string }>('/ExamPlanner/swap-or-move-seat', {
      writtenExamId: params.writtenExamId,
      seatingId: params.seatingId,
      targetRoomName: params.targetRoomName,
      targetSeatNumber: params.targetSeatNumber,
    });
    if (res && res.success) {
      return res;
    }
    return { success: false, message: res?.message || 'İşlem gerçekleştirilemedi.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Bağlantı hatası.' };
  }
}

export interface AvailableProctorItem {
  id: string;
  teacherName: string;
  priority: number;
  badge: string;
  badgeColor: string;
  isDuty: boolean;
  dutyPlace?: string;
  isBusy: boolean;
  busyLesson?: string;
  hasLessonsToday: boolean;
  assignedRoom?: string;
  isCurrentRoomProctor: boolean;
  isDutyAndFree?: boolean;
}

export async function fetchAvailableProctors(examId: string, roomName?: string): Promise<AvailableProctorItem[]> {
  try {
    const roomParam = roomName ? `?roomName=${encodeURIComponent(roomName)}` : '';
    const res = await apiGet<{ success: boolean; data: AvailableProctorItem[] }>(
      `/ExamPlanner/exams/${examId}/available-proctors${roomParam}`
    );
    if (res && res.success && Array.isArray(res.data)) {
      return res.data;
    }
  } catch (err) {
    console.warn('[ExamPlanner] fetchAvailableProctors API hatası:', err);
  }
  return [];
}


