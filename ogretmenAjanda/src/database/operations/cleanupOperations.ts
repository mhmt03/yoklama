import { getDB } from '../db';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Cihazdaki yerel SQLite veritabanını ve önbelleğe alınmış verileri tamamen temizler.
 * Sunucuya bağlı okulların verileri sunucuda güvendedir; bu işlem yalnızca
 * telefondaki/tarayıcıdaki yerel artık verileri sıfırlar.
 */
export async function clearLocalDatabase(): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDB();

    await db.withTransactionAsync(async () => {
      // 1. Ders programı ve bağlı kayıtlar
      await db.runAsync('DELETE FROM schedules;');
      await db.runAsync('DELETE FROM day_slot_times;');

      // 2. Ödevler ve öğrenci ödev durumları
      await db.runAsync('DELETE FROM assignment_students;');
      await db.runAsync('DELETE FROM assignments;');

      // 3. Notlar, quizler ve sınavlar
      await db.runAsync('DELETE FROM quiz_scores;');
      await db.runAsync('DELETE FROM quizzes;');
      await db.runAsync('DELETE FROM student_grades;');

      // 4. Görüşler ve sınıf notları
      await db.runAsync('DELETE FROM student_notes;');
      await db.runAsync('DELETE FROM class_notes;');

      // 5. Öğrenciler ve şubeler
      await db.runAsync('DELETE FROM students;');
      await db.runAsync('DELETE FROM teacher_assignments;');
      await db.runAsync('DELETE FROM classes;');

      // 6. Ajanda & görevler
      await db.runAsync('DELETE FROM agenda_items;');

      // 7. Yıllık planlar
      await db.runAsync('DELETE FROM yearly_plans;');
      await db.runAsync('DELETE FROM yearly_plan_documents;');

      // 8. Önbellek ve ayarlar (okul ve lisans bilgileri hariç temizle)
      await db.runAsync("DELETE FROM app_settings WHERE key LIKE '%sync%' OR key LIKE '%schedule_%';");
    });

    // 9. Mobilde indirilmiş öğrenci fotoğrafları önbellek klasörünü temizle
    if (Platform.OS !== 'web') {
      try {
        const photoDir = `${FileSystem.documentDirectory}student_photos/`;
        const dirInfo = await FileSystem.getInfoAsync(photoDir);
        if (dirInfo.exists) {
          await FileSystem.deleteAsync(photoDir, { idempotent: true });
        }
      } catch (fsErr) {
        console.warn('Fotoğraf önbelleği temizleme uyarısı:', fsErr);
      }
    }

    return {
      success: true,
      message: 'Yerel veritabanı ve önbellek başarıyla temizlendi.',
    };
  } catch (error: any) {
    console.error('Yerel veritabanı temizleme hatası:', error);
    return {
      success: false,
      message: error?.message || 'Veritabanı temizlenirken bir hata oluştu.',
    };
  }
}
