import { apiRequest, getActiveUserSession } from './apiClient';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getCourses, createCourse } from '../database/operations/scheduleOperations';
import { bulkCreateYearlyPlanItems, BulkPlanItemPayload } from '../database/operations/yearlyPlanOperations';
import { isTeacherMatch } from '../utils/teacherUtils';

export interface YearlyPlanSyncResult {
  success: boolean;
  message: string;
  totalPlans?: number;
  totalWeeks?: number;
  importedCourses?: string[];
  plans?: any[];
}

export interface ServerYearlyPlanItem {
  id: string;
  schoolId: string;
  lessonName: string;
  grade: string;
  weekNumber: number;
  startDate?: string | null;
  endDate?: string | null;
  subject: string;
  learningOutcomes?: string;
}

export interface TeacherTaughtLesson {
  lessonName: string;
  gradeLevels: number[];
}

/**
 * İki ders adının (büyük/küçük harf, Türkçe karakterler ve ekler gözetilerek)
 * aynı derse ait olup olmadığını kontrol eder.
 */
export function matchLessonNames(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const cleanA = a.trim().toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]/gi, '');
  const cleanB = b.trim().toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]/gi, '');
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  return false;
}

/**
 * Öğretmenin bu okulda girdiği tüm dersleri ve sınıf düzeylerini hem yerel SQLite'tan
 * hem de sunucudaki haftalık ders programından tespit eder.
 */
export async function getTeacherTaughtLessons(
  schoolCode?: string,
  schoolId?: string
): Promise<TeacherTaughtLesson[]> {
  const lessonGradeMap: Map<string, { originalName: string; grades: Set<number> }> = new Map();

  const addLesson = (name: string, gradeLevel?: number | null) => {
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLocaleLowerCase('tr-TR');
    if (!lessonGradeMap.has(key)) {
      lessonGradeMap.set(key, { originalName: clean, grades: new Set<number>() });
    }
    if (gradeLevel && gradeLevel > 0) {
      lessonGradeMap.get(key)!.grades.add(gradeLevel);
    }
  };

  try {
    const db = await (await import('../database/db')).getDB();
    const session = await getActiveUserSession();
    const activeSchool = await getActiveSchool();
    const code = (schoolCode || activeSchool?.code || session?.schoolCode || '').trim();

    // 1. Sunucudaki haftalık ders programı (sync/schedules) - Kurumsal modda tek ve kesin doğruluk kaynağı
    let sId = schoolId || session?.schoolId;
    if (!sId && session?.affiliatedSchools && Array.isArray(session.affiliatedSchools)) {
      const match = session.affiliatedSchools.find(
        (s: any) => (s.schoolCode || s.code || '').toLowerCase() === code.toLowerCase()
      );
      if (match?.id) sId = match.id;
    }
    if (!sId && code) {
      try {
        const lookup = await apiRequest<any[]>(`schools/lookup?code=${encodeURIComponent(code)}`);
        if (lookup.success && lookup.data && lookup.data.length > 0) {
          sId = lookup.data[0].id;
        }
      } catch {}
    }

    if (sId) {
      const { getActiveTeacherName } = await import('../utils/roleService');
      const teacherName = (
        (await getActiveTeacherName()) ||
        session?.fullName ||
        session?.username ||
        ''
      ).trim();

      let matchedServerSchedules: any[] = [];
      if (teacherName) {
        try {
          const res = await apiRequest<any[]>(
            `sync/schedules?schoolId=${sId}&teacherName=${encodeURIComponent(teacherName)}`
          );
          if (res.success && res.data && res.data.length > 0) {
            matchedServerSchedules = res.data;
          }
        } catch {}
      }

      // Sunucu programında öğretmen adına göre hassas eşleştirme (adaș çakıșmasını engelleyen kontrol)
      if (matchedServerSchedules.length === 0 && teacherName) {
        try {
          const allRes = await apiRequest<any[]>(`sync/schedules?schoolId=${sId}`);
          if (allRes.success && allRes.data && allRes.data.length > 0) {
            matchedServerSchedules = allRes.data.filter((s) =>
              isTeacherMatch(teacherName, s.teacherName)
            );
          }
        } catch {}
      }

      for (const item of matchedServerSchedules) {
        let gLevel: number | undefined;
        if (item.grade) {
          const m = String(item.grade).match(/\d+/);
          if (m) gLevel = parseInt(m[0], 10);
        }
        if (item.lessonName) {
          addLesson(item.lessonName, gLevel);
        }
      }
    }

    // 2. Eğer sunucuya erişilemediyse veya okul programı sunucudan dönmediyse yerel SQLite'a bak (Offline mod)
    if (lessonGradeMap.size === 0) {
      let localSchoolId: number | undefined;
      if (code) {
        const schRow = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM schools WHERE UPPER(code) = ?',
          code.toUpperCase()
        );
        if (schRow?.id) localSchoolId = schRow.id;
      }
      if (!localSchoolId && activeSchool?.id) {
        localSchoolId = activeSchool.id;
      }

      const localQuery = `
        SELECT DISTINCT c.name as course_name, cl.name as class_name, cl.grade_level
        FROM schedules s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN classes cl ON cl.id = s.class_id
        ${localSchoolId ? 'WHERE s.school_id = ? OR cl.school_id = ?' : ''}
      `;
      const localRows = localSchoolId
        ? await db.getAllAsync<{ course_name: string; class_name: string; grade_level: number }>(
            localQuery,
            localSchoolId,
            localSchoolId
          )
        : await db.getAllAsync<{ course_name: string; class_name: string; grade_level: number }>(
            localQuery
          );

      for (const r of localRows) {
        let gLevel = r.grade_level;
        if (!gLevel && r.class_name) {
          const m = r.class_name.match(/\d+/);
          if (m) gLevel = parseInt(m[0], 10);
        }
        addLesson(r.course_name, gLevel);
      }
    }
  } catch (err) {
    console.warn('getTeacherTaughtLessons hatası:', err);
  }

  const list: TeacherTaughtLesson[] = [];
  lessonGradeMap.forEach((val) => {
    list.push({
      lessonName: val.originalName,
      gradeLevels: Array.from(val.grades),
    });
  });

  return list;
}

/**
 * Okul idaresi (Admin) tarafından sisteme yüklenmiş olan yıllık müfredat planlarını
 * sunucudan çekip öğretmenin yerel veritabanına otomatik aktarır.
 * Öğretmen rolündeki kullanıcılar yalnızca kendi girdikleri derslerin planlarını çekebilir.
 */
export async function syncYearlyPlansFromSchool(options?: {
  providedSchoolCode?: string;
  courseId?: number | null;
  courseName?: string | null;
  gradeLevel?: number | null;
  syncAll?: boolean;
}): Promise<YearlyPlanSyncResult> {
  try {
    const activeSchool = await getActiveSchool();
    const session = await getActiveUserSession();
    const code = (options?.providedSchoolCode || activeSchool?.code || session?.schoolCode || '').trim();

    if (!code) {
      return {
        success: false,
        message: 'Aktif bir okul bağlantısı bulunamadı. Lütfen önce bir okul koduna bağlanınız.',
      };
    }

    // 1. Okul ID'sini tespit et
    let schoolId = session?.schoolId;
    if (session?.affiliatedSchools && Array.isArray(session.affiliatedSchools)) {
      const match = session.affiliatedSchools.find(
        (s: any) => (s.schoolCode || s.code || '').toLowerCase() === code.toLowerCase()
      );
      if (match?.id) {
        schoolId = match.id;
      }
    }

    if (!schoolId) {
      try {
        const lookup = await apiRequest<any[]>(`schools/lookup?code=${encodeURIComponent(code)}`);
        if (lookup.success && lookup.data && lookup.data.length > 0) {
          schoolId = lookup.data[0].id;
        }
      } catch {}
    }

    if (!schoolId) {
      return {
        success: false,
        message: 'Okul sunucusuna erişilemedi. Okul kodunuzu kontrol ediniz.',
      };
    }

    // 2. Sunucudan yıllık planları çek
    const queryUrl = `sync/yearly-plans?schoolId=${schoolId}`;
    const res = await apiRequest<ServerYearlyPlanItem[]>(queryUrl);

    if (!res.success || !res.data || res.data.length === 0) {
      return {
        success: false,
        message: 'Okulunuzda admin tarafından henüz yüklenmiş bir yıllık plan bulunamadı.',
      };
    }

    const allServerPlans = res.data;

    // 3. Mevcut yerel dersler
    const existingCourses = await getCourses();
    const courseNameToIdMap: Record<string, number> = {};

    for (const c of existingCourses) {
      courseNameToIdMap[c.name.trim().toLowerCase()] = c.id;
      if (c.code) {
        courseNameToIdMap[c.code.trim().toLowerCase()] = c.id;
      }
    }

    // 4. Kullanıcı rolünü kontrol et
    const { getActiveUserRole } = await import('../utils/roleService');
    const activeRole = ((await getActiveUserRole()) || '').toLowerCase();
    const sessionRole = (session?.role || '').toLowerCase();
    const isTeacher = activeRole === 'teacher' || sessionRole === 'teacher';

    let plansToProcess = allServerPlans;
    let taughtLessons: TeacherTaughtLesson[] = [];

    if (isTeacher) {
      // Öğretmenin bu okulda girdiği dersleri ve kademeleri bul
      taughtLessons = await getTeacherTaughtLessons(code, schoolId);

      if (taughtLessons.length === 0) {
        return {
          success: false,
          message: 'Okul sisteminde veya ders programınızda adınıza tanımlı ders bulunamadı. Yalnızca girdiğiniz derslerin yıllık planlarını çekebilirsiniz.',
          totalPlans: 0,
          totalWeeks: 0,
        };
      }

      // Eğer spesifik tek bir ders çekilmek isteniyorsa
      if (!options?.syncAll && (options?.courseName || options?.courseId)) {
        const targetName = (options.courseName || '').trim();
        const matchedTaught = taughtLessons.find((tl) => matchLessonNames(tl.lessonName, targetName));

        if (!matchedTaught) {
          return {
            success: false,
            message: `"${targetName}" dersine girmediğiniz için bu dersin yıllık planı çekilemez. Yalnızca girdiğiniz derslerin planlarını çekebilirsiniz.`,
            totalPlans: 0,
            totalWeeks: 0,
          };
        }

        const targetGrade = options.gradeLevel ? String(options.gradeLevel) : null;
        plansToProcess = allServerPlans.filter((p) => {
          const isNameMatch = matchLessonNames(p.lessonName, targetName);
          if (!isNameMatch) return false;
          if (targetGrade) {
            const pGrade = (p.grade || '').replace(/[^0-9]/g, '');
            return pGrade === targetGrade;
          }
          return true;
        });
      } else {
        // Öğretmenin girdiği tüm derslerin planlarını çek
        plansToProcess = allServerPlans.filter((p) => {
          const pGrade = (p.grade || '').replace(/[^0-9]/g, '');
          const pGradeNum = pGrade ? parseInt(pGrade, 10) : undefined;

          return taughtLessons.some((tl) => {
            const isNameMatch = matchLessonNames(tl.lessonName, p.lessonName);
            if (!isNameMatch) return false;
            // Eğer öğretmenin bu ders için girdiği sınıf düzeyleri belliyse ve planın sınıfı biliniyorsa filtrele:
            if (tl.gradeLevels.length > 0 && pGradeNum !== undefined) {
              return tl.gradeLevels.includes(pGradeNum);
            }
            return true;
          });
        });
      }

      if (plansToProcess.length === 0) {
        return {
          success: true,
          message: 'Okulda yüklü olan yıllık planlar arasında girdiğiniz derslere ait plan bulunamadı.',
          totalPlans: 0,
          totalWeeks: 0,
        };
      }
    } else {
      // Admin / Staff rolü:
      if (!options?.syncAll && (options?.courseName || options?.courseId) && options?.gradeLevel) {
        const targetName = (options.courseName || '').trim().toLowerCase();
        const targetGrade = String(options.gradeLevel);

        plansToProcess = allServerPlans.filter((p) => {
          const pLesson = (p.lessonName || '').trim().toLowerCase();
          const pGrade = (p.grade || '').replace(/[^0-9]/g, '');
          const isGradeMatch = pGrade === targetGrade || p.grade === targetGrade;
          const isNameMatch =
            !targetName ||
            pLesson === targetName ||
            pLesson.includes(targetName) ||
            targetName.includes(pLesson);
          return isGradeMatch && isNameMatch;
        });
      }
    }

    // 4. Planları ders ve sınıf düzeyine göre grupla
    const groupedPlans: Record<
      string,
      {
        lessonName: string;
        gradeLevel: number;
        items: ServerYearlyPlanItem[];
      }
    > = {};

    for (const item of plansToProcess) {
      const rawLesson = (item.lessonName || 'Ders').trim();
      const numMatch = (item.grade || '').match(/\d+/);
      const gradeLvl = numMatch ? parseInt(numMatch[0], 10) : (options?.gradeLevel || 11);
      const key = `${rawLesson.toLowerCase()}__${gradeLvl}`;

      if (!groupedPlans[key]) {
        groupedPlans[key] = {
          lessonName: rawLesson,
          gradeLevel: gradeLvl,
          items: [],
        };
      }
      groupedPlans[key].items.push(item);
    }

    let totalImportedWeeks = 0;
    const importedCourseLabels: string[] = [];

    // 5. Her grup için dersi kontrol et / oluştur ve yerel veritabanına aktar
    for (const group of Object.values(groupedPlans)) {
      let courseId: number | undefined;

      const normLesson = group.lessonName.toLowerCase();
      courseId = courseNameToIdMap[normLesson];

      if (!courseId) {
        const matchedCourse = existingCourses.find(
          (c) =>
            c.name.trim().toLowerCase() === normLesson ||
            normLesson.includes(c.name.trim().toLowerCase()) ||
            c.name.trim().toLowerCase().includes(normLesson)
        );
        if (matchedCourse) {
          courseId = matchedCourse.id;
        }
      }

      if (!courseId) {
        courseId = await createCourse(group.lessonName, '', '#4F46E5');
        courseNameToIdMap[normLesson] = courseId;
      }

      group.items.sort((a, b) => a.weekNumber - b.weekNumber);

      const bulkPayload: BulkPlanItemPayload[] = group.items.map((it) => ({
        weekNumber: it.weekNumber,
        subjectTopic: it.subject || 'Konu',
        learningOutcomes: it.learningOutcomes || undefined,
        dateStart: it.startDate ? it.startDate.split('T')[0] : undefined,
        dateEnd: it.endDate ? it.endDate.split('T')[0] : undefined,
      }));

      const resBulk = await bulkCreateYearlyPlanItems(courseId, group.gradeLevel, bulkPayload, true);
      totalImportedWeeks += resBulk.insertedCount;
      importedCourseLabels.push(`${group.lessonName} (${group.gradeLevel}. Sınıf - ${resBulk.insertedCount} Hafta)`);
    }

    // 6. Eğer öğretmen ise, girmediği derslere ait eski/artık yerel plan kayıtlarını temizle
    if (isTeacher && typeof taughtLessons !== 'undefined' && taughtLessons.length > 0) {
      try {
        const db = await (await import('../database/db')).getDB();
        const allLocalCourses = await db.getAllAsync<{ id: number; name: string; code?: string }>(
          'SELECT id, name, code FROM courses'
        );
        const unauthorizedCourseIds = allLocalCourses
          .filter(
            (c) =>
              !taughtLessons.some(
                (tl) =>
                  matchLessonNames(tl.lessonName, c.name) ||
                  (c.code && matchLessonNames(tl.lessonName, c.code))
              )
          )
          .map((c) => c.id);

        if (unauthorizedCourseIds.length > 0) {
          const placeholders = unauthorizedCourseIds.map(() => '?').join(',');
          await db.runAsync(
            `DELETE FROM yearly_plans WHERE course_id IN (${placeholders})`,
            ...unauthorizedCourseIds
          );
        }
      } catch (cleanErr) {
        console.warn('Eski yetkisiz planları temizleme uyarısı:', cleanErr);
      }
    }

    return {
      success: true,
      totalPlans: Object.keys(groupedPlans).length,
      totalWeeks: totalImportedWeeks,
      importedCourses: importedCourseLabels,
      plans: allServerPlans,
      message: `${totalImportedWeeks} haftalık müfredat planı okuldan başarıyla çekildi!\n\n` +
               importedCourseLabels.join('\n'),
    };
  } catch (error: any) {
    console.error('Yıllık plan okul senkronizasyon hatası:', error);
    return {
      success: false,
      message: error?.message || 'Okuldan yıllık plan çekilirken bir hata oluştu.',
    };
  }
}
