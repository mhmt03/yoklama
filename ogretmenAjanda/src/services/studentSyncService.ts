import { getDB } from '../database/db';
import { apiRequest } from './apiClient';
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
