import { apiRequest, getActiveUserSession } from './apiClient';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getCourses, createCourse } from '../database/operations/scheduleOperations';
import { bulkCreateYearlyPlanItems, BulkPlanItemPayload } from '../database/operations/yearlyPlanOperations';

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

/**
 * Okul idaresi (Admin) tarafından sisteme yüklenmiş olan yıllık müfredat planlarını
 * sunucudan çekip öğretmenin yerel veritabanına otomatik aktarır.
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

    // Filtreleme: Eğer spesifik bir ders ve sınıf seçildiyse ve syncAll zorlanmadıysa
    let plansToProcess = allServerPlans;

    if (!options?.syncAll && (options?.courseName || options?.courseId) && options?.gradeLevel) {
      const targetName = (options.courseName || '').trim().toLowerCase();
      const targetGrade = String(options.gradeLevel);

      const matched = allServerPlans.filter((p) => {
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

      if (matched.length > 0) {
        plansToProcess = matched;
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
