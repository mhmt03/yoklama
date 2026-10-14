import { getDB } from '../database/db';

export type UserRole = 'admin' | 'teacher' | 'student' | 'staff';

export interface StudentProfileData {
  studentId: number;
  studentNumber: string;
  fullName: string;
  classId: number;
  className?: string;
  studentPhone?: string;
  parentName?: string;
  parentPhone?: string;
}

/**
 * SQLite app_settings tablosundan kaydedilmiş aktif kullanıcı rolünü okur.
 * Kayıt yoksa null döner (böylece ilk açılışta Rol Seçim Ekranı açılır).
 */
export const getActiveUserRole = async (): Promise<UserRole | null> => {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'active_user_role'"
    );
    if (row && (row.value === 'admin' || row.value === 'teacher' || row.value === 'student' || row.value === 'staff')) {
      return row.value as UserRole;
    }
    return null;
  } catch (err) {
    console.warn('Aktif rol okunamadı:', err);
    return null;
  }
};

/**
 * Aktif öğretmenin adını kaydeder (Sınıf/ders atamalarında filtreleme ve tanıma için).
 */
export const getActiveTeacherName = async (): Promise<string> => {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'active_teacher_name'"
    );
    return row?.value || 'Öğretmen';
  } catch {
    return 'Öğretmen';
  }
};

export const setActiveTeacherName = async (name: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('active_teacher_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      name.trim()
    );
  } catch (err) {
    console.warn('Öğretmen adı kaydedilemedi:', err);
  }
};

/**
 * Aktif kullanıcı rolünü kalıcı olarak kaydeder veya siler.
 */
export const setActiveUserRole = async (role: UserRole | null): Promise<void> => {
  try {
    const db = await getDB();
    if (role) {
      await db.runAsync(
        "INSERT INTO app_settings (key, value) VALUES ('active_user_role', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        role
      );
    } else {
      await db.runAsync("DELETE FROM app_settings WHERE key = 'active_user_role'");
    }
  } catch (err) {
    console.warn('Aktif rol kaydedilemedi:', err);
  }
};

/**
 * Eğer aktif rol öğrenci/veli ise, giriş yapmış öğrencinin oturum bilgilerini okur.
 */
export const getStudentSessionProfile = async (): Promise<StudentProfileData | null> => {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'student_session_profile'"
    );
    if (row && row.value) {
      return JSON.parse(row.value) as StudentProfileData;
    }
    return null;
  } catch (err) {
    console.warn('Öğrenci profil oturumu okunamadı:', err);
    return null;
  }
};

/**
 * Giriş yapmış öğrencinin oturum bilgilerini kaydeder.
 */
export const setStudentSessionProfile = async (profile: StudentProfileData | null): Promise<void> => {
  try {
    const db = await getDB();
    if (profile) {
      await db.runAsync(
        "INSERT INTO app_settings (key, value) VALUES ('student_session_profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        JSON.stringify(profile)
      );
    } else {
      await db.runAsync("DELETE FROM app_settings WHERE key = 'student_session_profile'");
    }
  } catch (err) {
    console.warn('Öğrenci profil oturumu kaydedilemedi:', err);
  }
};

/**
 * Rolü ve öğrenci oturumunu sıfırlar (Çıkış yapma ve rol değiştirme için).
 */
export const logoutUserRole = async (): Promise<void> => {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM app_settings WHERE key IN ('active_user_role', 'student_session_profile')");
  } catch (err) {
    console.warn('Çıkış işlemi başarısız:', err);
  }
};
