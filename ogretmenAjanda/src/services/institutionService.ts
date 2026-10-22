import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';
import { getDB } from '../database/db';

export interface InstitutionInfo {
  code: string;
  name: string;
  maxSchoolCount?: number;
  isActive?: boolean;
  isExpired?: boolean;
}

const INSTITUTION_KEY = '@ogretmen_ajanda_institution';
const REMEMBER_ME_KEY = '@ogretmen_ajanda_remember_me';

/**
 * Cihazda kayıtlı olan aktif kurum bilgisini döndürür.
 * Önce AsyncStorage, ardından SQLite app_settings tablosunu kontrol eder.
 */
export async function getSavedInstitution(): Promise<InstitutionInfo | null> {
  // 1. AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(INSTITUTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.name || parsed.code)) {
        if (!parsed.name) parsed.name = parsed.code;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('AsyncStorage kurum bilgisi okunamadı:', e);
  }

  // 2. SQLite app_settings fallback
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'saved_institution'"
    );
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && (parsed.name || parsed.code)) {
        if (!parsed.name) parsed.name = parsed.code;
        try {
          await AsyncStorage.setItem(INSTITUTION_KEY, JSON.stringify(parsed));
        } catch {}
        return parsed;
      }
    }
  } catch (dbErr) {
    console.warn('SQLite kurum bilgisi okunamadı:', dbErr);
  }

  return null;
}

/**
 * Kurum bilgisini hem AsyncStorage'a hem de SQLite app_settings'e kaydeder.
 */
export async function saveInstitution(info: InstitutionInfo): Promise<void> {
  if (!info) return;
  const safeInfo: InstitutionInfo = {
    ...info,
    name: info.name || info.code || 'Kurum',
    code: info.code || info.name || 'kurum',
  };

  const jsonStr = JSON.stringify(safeInfo);

  try {
    await AsyncStorage.setItem(INSTITUTION_KEY, jsonStr);
  } catch (e) {
    console.warn('AsyncStorage kurum bilgisi kaydedilemedi:', e);
  }

  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('saved_institution', ?)`,
      jsonStr
    );
  } catch (dbErr) {
    console.warn('SQLite kurum bilgisi kaydedilemedi:', dbErr);
  }
}

/**
 * Kayıtlı kurum bilgisini temizler.
 */
export async function clearSavedInstitution(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INSTITUTION_KEY);
  } catch (e) {
    console.warn('Kurum bilgisi silinemedi:', e);
  }

  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM app_settings WHERE key = 'saved_institution'");
  } catch {}
}

/**
 * "Beni Hatırla" tercihini döndürür.
 */
export async function getRememberMeSetting(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {}

  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'remember_institution'"
    );
    if (row) {
      return row.value === 'true';
    }
  } catch {}

  // Varsayılan olarak true
  return true;
}

/**
 * "Beni Hatırla" tercihini kaydeder.
 */
export async function setRememberMeSetting(val: boolean): Promise<void> {
  const strVal = val ? 'true' : 'false';
  try {
    await AsyncStorage.setItem(REMEMBER_ME_KEY, strVal);
  } catch {}

  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('remember_institution', ?)`,
      strVal
    );
  } catch {}
}

/**
 * Girilen kurum adını/kodunu sunucu üzerinden doğrular.
 */
export async function verifyInstitutionOnline(
  rawInput: string
): Promise<{ success: boolean; data?: InstitutionInfo; message?: string }> {
  const cleanCode = (rawInput || '').trim().toLowerCase();
  if (!cleanCode) {
    return { success: false, message: 'Lütfen bir kurum adı veya kodu giriniz.' };
  }

  try {
    const res = await apiRequest<any>(`auth/lookup-institution/${encodeURIComponent(cleanCode)}`);
    if (res.success && res.data) {
      if (res.data.isExpired) {
        return {
          success: false,
          message: `"${res.data.name}" kurumunun lisans süresi dolmuştur. Lütfen sistem yöneticiniz (SüperAdmin) ile görüşünüz.`,
        };
      }
      if (res.data.isActive === false) {
        return {
          success: false,
          message: `"${res.data.name}" kurumunun hesabı askıya alınmıştır.`,
        };
      }

      const info: InstitutionInfo = {
        code: res.data.code,
        name: res.data.name,
        maxSchoolCount: res.data.maxSchoolCount || 1,
        isActive: res.data.isActive,
        isExpired: res.data.isExpired,
      };

      await saveInstitution(info);
      return { success: true, data: info };
    }

    // Çevrimdışı / Demo Test Fallback (zafer-egitim / MST-10001)
    if (cleanCode === 'zafer-egitim' || cleanCode === 'mst-10001' || cleanCode === 'demo') {
      const demoInfo: InstitutionInfo = {
        code: 'zafer-egitim',
        name: 'Zafer Eğitim Kurumları (Test)',
        maxSchoolCount: 2,
        isActive: true,
        isExpired: false,
      };
      await saveInstitution(demoInfo);
      return { success: true, data: demoInfo };
    }

    return {
      success: false,
      message: res.error || 'Bu kurum adı veya koduna ait aktif bir kayıt bulunamadı.',
    };
  } catch (err: any) {
    // Çevrimdışı modda demo kontrolü
    if (cleanCode === 'zafer-egitim' || cleanCode === 'mst-10001' || cleanCode === 'demo') {
      const demoInfo: InstitutionInfo = {
        code: 'zafer-egitim',
        name: 'Zafer Eğitim Kurumları (Çevrimdışı)',
        maxSchoolCount: 2,
        isActive: true,
        isExpired: false,
      };
      await saveInstitution(demoInfo);
      return { success: true, data: demoInfo };
    }

    return {
      success: false,
      message: err.message || 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol ediniz.',
    };
  }
}
