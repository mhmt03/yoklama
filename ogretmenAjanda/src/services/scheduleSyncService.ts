import { apiRequest, getActiveUserSession } from './apiClient';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getActiveTeacherName } from '../utils/roleService';
import { applyAnalyzedSchedule } from '../database/operations/scheduleOperations';
import { AnalyzedLessonItem } from '../utils/geminiScheduleService';

export interface ScheduleSyncResult {
  success: boolean;
  message: string;
  totalLessons?: number;
  classesEnsured?: string[];
  coursesEnsured?: string[];
  matchedTeacherName?: string;
}

export interface ServerScheduleItem {
  id: string;
  schoolId: string;
  teacherId?: string | null;
  teacherName?: string | null;
  dayOfWeek: number;
  lessonHour: number;
  grade: string;
  section: string;
  lessonName: string;
  classroom?: string | null;
}

/**
 * Okul idaresi (Admin) tarafından sisteme yüklenmiş olan çarşaf ders programından
 * öğretmenin kendi ders programını otomatik olarak çekip yerel ajandaya işler.
 */
export async function syncScheduleFromSchool(
  providedSchoolCode?: string
): Promise<ScheduleSyncResult> {
  try {
    const activeSchool = await getActiveSchool();
    const session = await getActiveUserSession();
    const code = (providedSchoolCode || activeSchool?.code || session?.schoolCode || '').trim();

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

    // 2. Öğretmen adını tespit et
    const rawTeacherName = (
      (await getActiveTeacherName()) ||
      session?.fullName ||
      session?.username ||
      ''
    ).trim();

    let matchedItems: ServerScheduleItem[] = [];
    let detectedTeacher = rawTeacherName;

    // 3. İlk olarak öğretmen adı filtresiyle dene
    if (rawTeacherName) {
      const res = await apiRequest<ServerScheduleItem[]>(
        `sync/schedules?schoolId=${schoolId}&teacherName=${encodeURIComponent(rawTeacherName)}`
      );
      if (res.success && res.data && res.data.length > 0) {
        matchedItems = res.data;
      }
    }

    // 4. Eğer bulunamadıysa, okulun tüm programını çekip esnek isim eşleştirmesi yap
    if (matchedItems.length === 0) {
      const allRes = await apiRequest<ServerScheduleItem[]>(`sync/schedules?schoolId=${schoolId}`);
      if (!allRes.success || !allRes.data || allRes.data.length === 0) {
        return {
          success: false,
          message: 'Okulunuzda admin tarafından henüz yüklenmiş bir ders programı (çarşaf program) bulunamadı.',
        };
      }

      const allItems = allRes.data;
      const distinctTeachers = Array.from(
        new Set(allItems.map((s) => (s.teacherName || '').trim()).filter(Boolean))
      );

      if (rawTeacherName) {
        const normTarget = rawTeacherName.toLowerCase();
        const targetWords = normTarget.split(/\s+/).filter((w) => w.length >= 2);

        // Akıllı eşleşme (ad veya soyad kelimesi geçenler)
        const matchedName = distinctTeachers.find((tName) => {
          const normT = tName.toLowerCase();
          if (normT === normTarget || normT.includes(normTarget) || normTarget.includes(normT)) {
            return true;
          }
          return targetWords.some((word) => normT.includes(word));
        });

        if (matchedName) {
          detectedTeacher = matchedName;
          matchedItems = allItems.filter(
            (s) => (s.teacherName || '').trim().toLowerCase() === matchedName.toLowerCase()
          );
        }
      }

      // Eğer hala eşleşmediyse ve programda tek bir öğretmen varsa veya hiç isim girilmediyse
      if (matchedItems.length === 0) {
        if (distinctTeachers.length === 1) {
          detectedTeacher = distinctTeachers[0];
          matchedItems = allItems;
        } else {
          return {
            success: false,
            message: `Okulda ders programı mevcut fakat "${rawTeacherName || 'Öğretmen'}" adına atanmış ders bulunamadı.\n\nOkul programındaki kayıtlı öğretmenler:\n${distinctTeachers.slice(0, 6).join(', ')}${distinctTeachers.length > 6 ? '...' : ''}`,
          };
        }
      }
    }

    if (matchedItems.length === 0) {
      return {
        success: false,
        message: 'Ders programınızda atanmış herhangi bir ders saati bulunamadı.',
      };
    }

    // 5. Dersleri AnalyzedLessonItem formatına dönüştür
    const lessons: AnalyzedLessonItem[] = matchedItems.map((item) => {
      const g = (item.grade || '').trim();
      const s = (item.section || '').trim();
      let clsName = 'Sınıf';
      if (g && s) {
        clsName = `${g}-${s}`;
      } else if (g) {
        clsName = g;
      } else if (s) {
        clsName = s;
      }

      return {
        day: item.dayOfWeek,
        slotNumber: item.lessonHour,
        className: clsName,
        courseName: item.lessonName?.trim() || 'Ders',
        classroom: item.classroom?.trim() || undefined,
      };
    });

    // 6. Haftalık programa uygula (mevcut haftalık programı sıfırlar, şube ve dersleri otomatik oluşturur)
    const applyRes = await applyAnalyzedSchedule(lessons, {
      clearDaysOption: 'all_week',
      autoCreateClasses: true,
      autoCreateCourses: true,
      updateSlotTimes: false,
    });

    return {
      success: true,
      totalLessons: applyRes.totalLessonsLoaded,
      classesEnsured: applyRes.classesEnsured,
      coursesEnsured: applyRes.coursesEnsured,
      matchedTeacherName: detectedTeacher,
      message: `${applyRes.totalLessonsLoaded} ders saati okul programından başarıyla çekildi!\n\n` +
               `Öğretmen: ${detectedTeacher}\n` +
               `Şubeler: ${applyRes.classesEnsured.join(', ') || 'Yok'}\n` +
               `Dersler: ${applyRes.coursesEnsured.join(', ') || 'Yok'}`,
    };
  } catch (error: any) {
    console.error('Ders programı okul senkronizasyon hatası:', error);
    return {
      success: false,
      message: error?.message || 'Okuldan ders programı çekilirken bir hata oluştu.',
    };
  }
}
