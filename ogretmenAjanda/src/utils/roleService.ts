import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDB } from '../database/db';
import { clearAuthSession } from '../services/apiClient';

export type UserRole = 'superadmin' | 'admin' | 'teacher' | 'student' | 'staff';

export const ROLE_STORAGE_KEY = '@ogretmen_ajanda_active_role';

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
 * Kaydedilmiş aktif kullanıcı rolünü okur.
 * Web ve mobilde maksimum güvenilirlik için önce AsyncStorage, ardından SQLite kontrol edilir.
 */
export const getActiveUserRole = async (): Promise<UserRole | null> => {
  // 1. AsyncStorage kontrolü (Web ve React Native genelinde anında ve kilitlenmesiz)
  try {
    const asyncRole = await AsyncStorage.getItem(ROLE_STORAGE_KEY);
    if (asyncRole && ['superadmin', 'admin', 'teacher', 'student', 'staff'].includes(asyncRole)) {
      return asyncRole as UserRole;
    }
  } catch {}

  // 2. SQLite veritabanı kontrolü
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'active_user_role'"
    );
    if (row && ['superadmin', 'admin', 'teacher', 'student', 'staff'].includes(row.value)) {
      try {
        await AsyncStorage.setItem(ROLE_STORAGE_KEY, row.value);
      } catch {}
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
 * Hem AsyncStorage hem de SQLite'a yazar.
 */
export const setActiveUserRole = async (role: UserRole | null): Promise<void> => {
  // 1. AsyncStorage
  try {
    if (role) {
      await AsyncStorage.setItem(ROLE_STORAGE_KEY, role);
    } else {
      await AsyncStorage.removeItem(ROLE_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('AsyncStorage rol kayıt hatası:', e);
  }

  // 2. SQLite
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
 * Rolü, token'ları ve kullanıcı oturumunu tamamen sıfırlar (Çıkış yapma ve rol değiştirme için).
 */
export const logoutUserRole = async (): Promise<void> => {
  console.log('[RoleService] Çıkış yapılıyor: Oturum ve roller tamamen sıfırlanıyor...');
  try {
    await clearAuthSession();
  } catch (e) {
    console.warn('clearAuthSession hatası:', e);
  }

  try {
    await AsyncStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {}

  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM app_settings WHERE key IN ('active_user_role', 'student_session_profile')");
  } catch (err) {
    console.warn('Çıkış işlemi SQLite hatası:', err);
  }
};
