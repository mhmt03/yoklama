import { getDB } from '../database/db';
import { apiRequest, getActiveUserSession } from './apiClient';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getStudentsByClass } from '../database/operations/studentOperations';

export interface ServerStudentItem {
  id?: string;
  studentNumber: string;
  fullName: string;
  grade?: string;
  section?: string;
  photoPath?: string;
  parentName?: string;
  parentPhone?: string;
  studentPhone?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  totalServer?: number;
  updatedCount?: number;
  addedCount?: number;
}

/**
 * Belirli bir sınıfın öğrencilerini sunucudan çeker.
 * Öğretmenin yerel veritabanını günceller:
 * - Öğrencinin numarası veya sınıfı sunucuda değişmişse yerel SQLite kaydı güncellenir.
 * - Öğrenciye ait quizler, sınav notları ve görüşler (student_notes, quiz_scores vb.) KESİNLİKLE KORUNUR!
 * - Sunucuda yeni olan öğrenciler eklenir.
 * - Sunucuda olmayan ve herhangi bir quiz/not/görüş geçmişi bulunmayan öğrenciler temizlenir.
 */
export async function syncClassStudentsFromServer(
  classId: number,
  className: string,
  providedSchoolCode?: string
): Promise<SyncResult> {
  try {
    const activeSchool = await getActiveSchool();
    const code = providedSchoolCode || activeSchool?.code;

    if (!code) {
      return {
        success: false,
        message: 'Aktif bir okul kodu bulunamadı. Lütfen önce okulunuza bağlanın.',
      };
    }

    // 1. Sunucudan sınıfın güncel resmi öğrenci listesini çek
    const endpoint = `sync/students?schoolCode=${encodeURIComponent(code)}&className=${encodeURIComponent(className)}`;
    const response = await apiRequest<ServerStudentItem[]>(endpoint, 'GET');

    if (!response.success || !response.data) {
      return {
        success: false,
        message: response.error || 'Sunucuya bağlanılamadı veya öğrenci verisi alınamadı.',
      };
    }

    const serverStudents = response.data;
    if (serverStudents.length === 0) {
      return {
        success: false,
        message: `Sunucuda "${className}" şubesine kayıtlı öğrenci bulunamadı.`,
      };
    }

    const db = await getDB();
    const localStudents = await getStudentsByClass(classId);

    let updatedCount = 0;
    let addedCount = 0;

    // Helper: normalize name for matching (küçük harf, Türkçe karakterler)
    const normalize = (str: string) =>
      (str || '')
        .trim()
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, ' ');

    await db.withTransactionAsync(async () => {
      const processedLocalStudentIds = new Set<number>();

      for (const serverItem of serverStudents) {
        const sNo = (serverItem.studentNumber || '').trim();
        const sFullName = (serverItem.fullName || '').trim();

        // Ad - Soyad ayrımı
        const nameParts = sFullName.split(' ');
        const lastName = nameParts.length > 1 ? nameParts.pop()! : '';
        const firstName = nameParts.join(' ') || sFullName;

        // Eşleşme kontrolü: Önce numara, sonra isim ile ara
        const matchedLocal = localStudents.find((loc) => {
          if (sNo && loc.student_number && loc.student_number.trim() === sNo) {
            return true;
          }
          // Eğer numara değişmişse isimden eşleştir
          const locFullName = `${loc.first_name} ${loc.last_name}`;
          return normalize(locFullName) === normalize(sFullName);
        });

        if (matchedLocal) {
          // Öğrenci zaten yerelde var -> Bilgilerini güncelle, ID KORUNDUĞU İÇİN TÜM NOT VE GÖRÜŞLER AYNEN KORUNUR!
          await db.runAsync(
            `UPDATE students 
             SET student_number = ?, 
                 first_name = ?, 
                 last_name = ?, 
                 photo_uri = COALESCE(?, photo_uri),
                 parent_name = COALESCE(?, parent_name),
                 parent_phone = COALESCE(?, parent_phone),
                 student_phone = COALESCE(?, student_phone)
             WHERE id = ?`,
            sNo,
            firstName,
            lastName,
            serverItem.photoPath || null,
            serverItem.parentName || null,
            serverItem.parentPhone || null,
            serverItem.studentPhone || null,
            matchedLocal.id
          );
          processedLocalStudentIds.add(matchedLocal.id);
          updatedCount++;
        } else {
          // Yeni öğrenci -> Ekle
          await db.runAsync(
            `INSERT INTO students (
               class_id, student_number, first_name, last_name, 
               photo_uri, parent_name, parent_phone, student_phone
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            classId,
            sNo,
            firstName,
            lastName,
            serverItem.photoPath || null,
            serverItem.parentName || null,
            serverItem.parentPhone || null,
            serverItem.studentPhone || null
          );
          addedCount++;
        }
      }

      // Sunucuda olmayıp yerelde kalmış öğrencileri incele
      for (const loc of localStudents) {
        if (!processedLocalStudentIds.has(loc.id)) {
          // Bu öğrencinin notu, quiz skoru veya görüşü var mı?
          const noteRow = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM student_notes WHERE student_id = ?',
            loc.id
          );
          const gradeRow = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM student_grades WHERE student_id = ?',
            loc.id
          );
          const quizRow = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM quiz_scores WHERE student_id = ?',
            loc.id
          );

          const hasUserData = (noteRow?.count || 0) > 0 || (gradeRow?.count || 0) > 0 || (quizRow?.count || 0) > 0;

          if (!hasUserData) {
            // Görüş veya quiz notu yoksa, sunucu listesine tam uymak için sil
            await db.runAsync('DELETE FROM students WHERE id = ?', loc.id);
          }
          // Görüş veya quiz notu varsa KESİNLİKLE SİLME, öğretmenin verisi kaybolmasın!
        }
      }
    });

    return {
      success: true,
      totalServer: serverStudents.length,
      updatedCount,
      addedCount,
      message: `Sunucudan ${serverStudents.length} öğrenci çekildi. (${updatedCount} güncellendi, ${addedCount} yeni eklendi). Mevcut tüm quiz ve görüşleriniz korundu.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Öğrenci senkronizasyonu sırasında bir hata oluştu.',
    };
  }
}

export interface TeacherClassesSyncResult {
  success: boolean;
  message: string;
  syncedClasses: string[];
  totalStudents: number;
}

/**
 * Öğretmenin okul idaresi (Admin) tarafından kendisine atanmış tüm şubelerini
 * ve bu şubelere ait öğrencileri sunucudan otomatik olarak çekip yerel ajandaya ekler.
 */
export async function syncTeacherAssignedClassesAndStudents(
  providedSchoolCode?: string
): Promise<TeacherClassesSyncResult> {
  try {
    const activeSchool = await getActiveSchool();
    const session = await getActiveUserSession();
    const code = (providedSchoolCode || activeSchool?.code || session?.schoolCode || '').trim();

    if (!code) {
      return {
        success: false,
        message: 'Aktif bir okul kodu bulunamadı. Lütfen önce bir okul koduna bağlanın.',
        syncedClasses: [],
        totalStudents: 0,
      };
    }

    // 1. Okul bilgisini ve ID'sini tespit et
    const { getSchools } = await import('../database/operations/schoolOperations');
    const allSchools = await getSchools();
    const targetLocalSchool = allSchools.find(
      (s) => (s.code || '').toLowerCase() === code.toLowerCase()
    ) || activeSchool;
    const targetLocalSchoolId = targetLocalSchool?.id || activeSchool?.id || 1;

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

    // Öğretmen adı
    const { getActiveTeacherName } = await import('../utils/roleService');
    const teacherName = (await getActiveTeacherName()) || session?.fullName || session?.username || '';
    const assignedClassNames = new Set<string>();

    // 2. Sunucudaki Öğretmen Profili (AssignedClassesJson)
    if (schoolId) {
      try {
        const teachersRes = await apiRequest<any[]>(`schools/${schoolId}/teachers`);
        if (teachersRes.success && teachersRes.data) {
          const myProfile = teachersRes.data.find(
            (t) =>
              (t.username && session?.username && t.username.toLowerCase() === session.username.toLowerCase()) ||
              (t.fullName && teacherName && (
                t.fullName.toLowerCase().includes(teacherName.toLowerCase()) ||
                teacherName.toLowerCase().includes(t.fullName.toLowerCase())
              ))
          );

          if (myProfile?.assignedClassesJson) {
            try {
              let parsed: any = myProfile.assignedClassesJson;
              if (typeof parsed === 'string') {
                if (parsed.startsWith('[')) {
                  parsed = JSON.parse(parsed);
                } else {
                  parsed = parsed.split(/[,;\s]+/).filter(Boolean);
                }
              }
              if (Array.isArray(parsed)) {
                parsed.forEach((c: any) => {
                  const clean = String(c).trim();
                  if (clean) assignedClassNames.add(clean);
                });
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 3. Sunucudaki Çarşaf Ders Programından gelen sınıflar (sync/schedules)
    if (schoolId && teacherName) {
      try {
        const schedRes = await apiRequest<any[]>(
          `sync/schedules?schoolId=${schoolId}&teacherName=${encodeURIComponent(teacherName)}`
        );
        if (schedRes.success && schedRes.data && schedRes.data.length > 0) {
          schedRes.data.forEach((s) => {
            if (s.grade && s.section) {
              const cls = `${s.grade}-${s.section}`.trim();
              assignedClassNames.add(cls);
            }
          });
        }
      } catch {}
    }

    // 4. Öğretmenin bu okulda hiç atanmış şubesi/dersi yoksa (2. okulda dersi yoksa veri göremez kuralı)
    if (assignedClassNames.size === 0) {
      return {
        success: true,
        message: `"${targetLocalSchool?.name || 'Okul'}" kurumunda adınıza kayıtlı şube veya ders bulunmamaktadır.`,
        syncedClasses: [],
        totalStudents: 0,
      };
    }

    // 5. Şubeleri yerel SQLite'ta ilgili okul (school_id) altına ekle/güncelle ve öğrencilerini senkronize et
    const { getClasses, createClass } = await import('../database/operations/classOperations');
    const localClasses = await getClasses(targetLocalSchoolId);
    let totalStudentsSynced = 0;
    const syncedList: string[] = [];

    for (const rawName of Array.from(assignedClassNames)) {
      const className = rawName.trim();
      if (!className) continue;

      let existing = localClasses.find(
        (c) => c.name.trim().toLowerCase() === className.toLowerCase()
      );

      let classId: number;
      if (existing) {
        classId = existing.id;
      } else {
        const match = className.match(/^(\d{1,2})/);
        const gradeLevel = match ? parseInt(match[1], 10) : undefined;
        classId = await createClass(className, 'Okuldan çekildi', gradeLevel, targetLocalSchoolId);
      }

      // Bu sınıfın öğrencilerini çek
      try {
        const studentSync = await syncClassStudentsFromServer(classId, className, code);
        if (studentSync.success && studentSync.totalServer) {
          totalStudentsSynced += studentSync.totalServer;
        }
      } catch {}

      syncedList.push(className);
    }

    return {
      success: true,
      message: `"${targetLocalSchool?.name || 'Okul'}" için ${syncedList.length} şube (${syncedList.join(', ')}) ve toplam ${totalStudentsSynced} öğrenci başarıyla telefonunuza aktarıldı.`,
      syncedClasses: syncedList,
      totalStudents: totalStudentsSynced,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Şube ve öğrenci çekme sırasında beklenmeyen bir hata oluştu.',
      syncedClasses: [],
      totalStudents: 0,
    };
  }
}

