import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';

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
 */
export async function getSavedInstitution(): Promise<InstitutionInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(INSTITUTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Kurum bilgisi okunamadı:', e);
    return null;
  }
}

/**
 * Kurum bilgisini cihaza kaydeder.
 */
export async function saveInstitution(info: InstitutionInfo): Promise<void> {
  try {
    await AsyncStorage.setItem(INSTITUTION_KEY, JSON.stringify(info));
  } catch (e) {
    console.warn('Kurum bilgisi kaydedilemedi:', e);
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
}

/**
 * "Beni Hatırla" tercihini döndürür.
 */
export async function getRememberMeSetting(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * "Beni Hatırla" tercihini kaydeder.
 */
export async function setRememberMeSetting(val: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(REMEMBER_ME_KEY, val ? 'true' : 'false');
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
