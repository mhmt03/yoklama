import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { getDB, closeDatabase, initDatabase } from '../database/db';

export interface DatabaseStats {
  schoolCount: number;
  classCount: number;
  studentCount: number;
  assignmentCount: number;
  noteCount: number;
  classNoteCount: number;
  scheduleCount: number;
  yearlyPlanCount: number;
  yearlyPlanDocCount: number;
  quickNoteCount: number;
  agendaCount: number;
  gradeCount: number;
  quizCount: number;
  teacherAssignmentCount: number;
}

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    const enc4 = b3 & 63;

    base64 +=
      chars[enc1] +
      chars[enc2] +
      (i + 1 < len ? chars[enc3] : '=') +
      (i + 2 < len ? chars[enc4] : '=');
  }
  return base64;
};

const getTimestampString = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
};

export const getDatabaseStats = async (): Promise<DatabaseStats> => {
  try {
    const db = await getDB();

    const safeCount = async (query: string): Promise<number> => {
      try {
        const row = await db.getFirstAsync<{ count: number }>(query);
        return row?.count || 0;
      } catch {
        return 0;
      }
    };

    const [
      schoolCount,
      classCount,
      studentCount,
      assignmentCount,
      noteCount,
      classNoteCount,
      scheduleCount,
      yearlyPlanCount,
      yearlyPlanDocCount,
      quickNoteCount,
      agendaCount,
      gradeCount,
      quizCount,
      teacherAssignmentCount,
    ] = await Promise.all([
      safeCount('SELECT count(*) as count FROM schools'),
      safeCount('SELECT count(*) as count FROM classes'),
      safeCount('SELECT count(*) as count FROM students'),
      safeCount('SELECT count(*) as count FROM assignments'),
      safeCount('SELECT count(*) as count FROM student_notes'),
      safeCount('SELECT count(*) as count FROM class_notes'),
      safeCount('SELECT count(*) as count FROM schedules WHERE class_id IS NOT NULL OR course_id IS NOT NULL'),
      safeCount('SELECT count(*) as count FROM yearly_plans'),
      safeCount('SELECT count(*) as count FROM yearly_plan_documents'),
      safeCount('SELECT count(*) as count FROM quick_notes'),
      safeCount('SELECT count(*) as count FROM agenda_items'),
      safeCount('SELECT count(*) as count FROM student_grades'),
      safeCount('SELECT count(*) as count FROM quizzes'),
      safeCount('SELECT count(*) as count FROM teacher_assignments'),
    ]);

    return {
      schoolCount,
      classCount,
      studentCount,
      assignmentCount,
      noteCount,
      classNoteCount,
      scheduleCount,
      yearlyPlanCount,
      yearlyPlanDocCount,
      quickNoteCount,
      agendaCount,
      gradeCount,
      quizCount,
      teacherAssignmentCount,
    };
  } catch (error) {
    console.error('getDatabaseStats error:', error);
    return {
      schoolCount: 0,
      classCount: 0,
      studentCount: 0,
      assignmentCount: 0,
      noteCount: 0,
      classNoteCount: 0,
      scheduleCount: 0,
      yearlyPlanCount: 0,
      yearlyPlanDocCount: 0,
      quickNoteCount: 0,
      agendaCount: 0,
      gradeCount: 0,
      quizCount: 0,
      teacherAssignmentCount: 0,
    };
  }
};

export const exportDatabaseBackup = async (
  action: 'share' | 'download'
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const db = await getDB();

    // WAL Checkpoint: Tüm açık ve önbellekteki işlemleri (yıllık planlar, ajanda, öğretmen atamaları vb.)
    // ana veritabanı dosyasına yazıp WAL dosyasını temizler.
    try {
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (walErr) {
      console.warn('Backup öncesi WAL checkpoint uyarısı:', walErr);
    }

    let dbContentBase64 = '';

    // 1. Tercih edilen yöntem: db.serializeAsync
    try {
      // @ts-ignore - expo-sqlite serializeAsync
      if (typeof db.serializeAsync === 'function') {
        // @ts-ignore
        const bytes: Uint8Array = await db.serializeAsync('main');
        dbContentBase64 = uint8ArrayToBase64(bytes);
      }
    } catch (serializeErr) {
      console.warn('serializeAsync başarısız, fiziksel dosya okuma deneniyor:', serializeErr);
    }

    // 2. Yedek yöntem: SQLite dosyasını doğrudan oku
    if (!dbContentBase64) {
      const sqlitePath = `${FileSystem.documentDirectory}SQLite/sinif_takip.db`;
      const fileInfo = await FileSystem.getInfoAsync(sqlitePath);
      if (fileInfo.exists) {
        dbContentBase64 = await FileSystem.readAsStringAsync(sqlitePath, {
          // @ts-ignore
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        throw new Error('Veritabanı dosyası fiziksel olarak bulunamadı.');
      }
    }

    const backupFileName = `ogretmen_ajanda_yedek_${getTimestampString()}.db`;

    if (action === 'download' && Platform.OS === 'android') {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const directoryUri = permissions.directoryUri;
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            directoryUri,
            backupFileName,
            'application/x-sqlite3'
          );
          await FileSystem.writeAsStringAsync(fileUri, dbContentBase64, {
            // @ts-ignore
            encoding: FileSystem.EncodingType.Base64,
          });
          return {
            success: true,
            message: `Veritabanı yedeği seçtiğiniz klasöre başarıyla kaydedildi:\n${backupFileName}`,
          };
        } else {
          return {
            success: false,
            message: 'Klasör seçimi yapılmadığı için indirme iptal edildi.',
          };
        }
      } catch (safErr) {
        console.warn('SAF hatası, paylaşım yöntemine dönülüyor:', safErr);
      }
    }

    // Varsayılan / Paylaşım işlemi
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    const tempFilePath = `${cacheDir}${backupFileName}`;

    await FileSystem.writeAsStringAsync(tempFilePath, dbContentBase64, {
      // @ts-ignore
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(tempFilePath, {
        mimeType: 'application/x-sqlite3',
        dialogTitle: `Öğretmen Ajanda Veritabanı Yedeğini Paylaş: ${backupFileName}`,
        UTI: 'application/x-sqlite3',
      });
      return {
        success: true,
        message: 'Yedek dosyası hazırlandı ve paylaşım penceresi açıldı.',
      };
    } else {
      return {
        success: true,
        message: `Yedek dosyası oluşturuldu: ${tempFilePath}`,
      };
    }
  } catch (error: any) {
    console.error('exportDatabaseBackup error:', error);
    return {
      success: false,
      error: error?.message || 'Veritabanı yedeklenirken bilinmeyen bir hata oluştu.',
    };
  }
};

export const restoreDatabaseBackup = async (): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  stats?: DatabaseStats;
}> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/x-sqlite3', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, message: 'Dosya seçimi iptal edildi.' };
    }

    const selectedAsset = result.assets[0];
    const sourceUri = selectedAsset.uri;

    // 1. Dosya varlık ve boyut doğrulaması
    const srcInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!srcInfo.exists || ('size' in srcInfo && (srcInfo.size || 0) < 100)) {
      throw new Error('Seçilen dosya geçerli veya okunabilir bir veritabanı yedeği değil (dosya boyutu yetersiz).');
    }

    // 2. Güvenlik önlemi: Mevcut veritabanının yedeğini al ve WAL temizle
    let safetyBackupCreated = false;
    const safetyPath = `${FileSystem.cacheDirectory}guvenlik_yedek_${getTimestampString()}.db`;
    try {
      const currentDb = await getDB();
      try {
        await currentDb.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {}

      // @ts-ignore
      if (typeof currentDb.serializeAsync === 'function') {
        // @ts-ignore
        const safetyBytes: Uint8Array = await currentDb.serializeAsync('main');
        const safetyBase64 = uint8ArrayToBase64(safetyBytes);
        await FileSystem.writeAsStringAsync(safetyPath, safetyBase64, {
          // @ts-ignore
          encoding: FileSystem.EncodingType.Base64,
        });
        safetyBackupCreated = true;
      }
    } catch (e) {
      console.warn('Güvenlik yedeği serialize ile alınamadı, devam ediliyor:', e);
    }

    // 3. Mevcut veritabanı bağlantısını tamamen kapat
    await closeDatabase();

    const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
    const targetDbPath = `${sqliteDir}sinif_takip.db`;
    const walPath = `${sqliteDir}sinif_takip.db-wal`;
    const shmPath = `${sqliteDir}sinif_takip.db-shm`;

    const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
    }

    // Fiziksel dosya kopyalama ile ek güvenlik yedeği
    if (!safetyBackupCreated) {
      try {
        const curInfo = await FileSystem.getInfoAsync(targetDbPath);
        if (curInfo.exists) {
          await FileSystem.copyAsync({ from: targetDbPath, to: safetyPath });
        }
      } catch {}
    }

    // 4. Eski WAL ve SHM dosyalarını temizle (veri çakışması ve bozulmayı önler)
    try {
      const walInfo = await FileSystem.getInfoAsync(walPath);
      if (walInfo.exists) {
        await FileSystem.deleteAsync(walPath, { idempotent: true });
      }
      const shmInfo = await FileSystem.getInfoAsync(shmPath);
      if (shmInfo.exists) {
        await FileSystem.deleteAsync(shmPath, { idempotent: true });
      }
    } catch (cleanErr) {
      console.warn('WAL/SHM temizleme uyarısı:', cleanErr);
    }

    // 5. Seçilen yedek dosyasını hedef veritabanının üzerine kopyala
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetDbPath,
    });

    // 6. Veritabanını yeniden başlat ve yeni tablo/sütun göçlerini (migration) otomatik çalıştır
    await initDatabase();

    // 7. Bütünlük kontrolü (PRAGMA integrity_check)
    const db = await getDB();
    const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check;');
    if (integrity && integrity.integrity_check !== 'ok') {
      console.error('Veritabanı bütünlük kontrolü başarısız:', integrity.integrity_check);
      // Geri alma (rollback)
      try {
        const safetyInfo = await FileSystem.getInfoAsync(safetyPath);
        if (safetyInfo.exists) {
          await closeDatabase();
          await FileSystem.copyAsync({ from: safetyPath, to: targetDbPath });
          await initDatabase();
        }
      } catch (rollbackErr) {
        console.error('Rollback hatası:', rollbackErr);
      }
      throw new Error(`Seçilen veritabanı yedeğinde bozulma tespit edildi (${integrity.integrity_check}). Eski veritabanınız korundu.`);
    }

    // 8. İstatistikleri oku ve kullanıcıya detaylı özet sun
    const stats = await getDatabaseStats();

    return {
      success: true,
      message: `Veritabanı başarıyla geri yüklendi! ✅\n\n• Toplam Şube: ${stats.classCount}\n• Toplam Öğrenci: ${stats.studentCount}\n• Ödev Sayısı: ${stats.assignmentCount}\n• Görüş/Not: ${stats.noteCount + stats.classNoteCount}\n• Yıllık Plan: ${stats.yearlyPlanCount}\n• Ajanda / Görevler: ${stats.agendaCount}\n• Öğretmen Atamaları: ${stats.teacherAssignmentCount}`,
      stats,
    };
  } catch (error: any) {
    console.error('restoreDatabaseBackup error:', error);
    try {
      await initDatabase();
    } catch (reInitErr) {
      console.error('Geri alma sonrası başlatma hatası:', reInitErr);
    }
    return {
      success: false,
      error: error?.message || 'Geri yükleme işlemi sırasında bir hata meydana geldi.',
    };
  }
};
