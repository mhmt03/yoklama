import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const getPlatformDefaultApiUrl = (): string => {
  // Web Ortamı
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const port = window.location.port;
      const hostname = window.location.hostname;
      const isLocalWeb = ['8081', '19006', '3000'].includes(port) || hostname === 'localhost' || hostname === '127.0.0.1';
      if (isLocalWeb) {
        // Yerel web geliştirme (localhost:8081): Yerel .NET API'sine bağlan (localhost:5079)
        return 'http://localhost:5079/api';
      }
      return `${window.location.origin}/api`;
    }
    return 'http://localhost:5079/api';
  }

  // Mobil Geliştirme (Expo Go / Emülatör / BlueStacks / Gerçek Cihaz) Modu
  if (isDev) {
    // Expo Go ile bağlanan bilgisayarın yerel IP adresini tespit et (BlueStacks, telefon ve tüm cihazlar için)
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
    if (hostUri) {
      const hostIp = hostUri.split(':')[0];
      if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
        return `http://${hostIp}:5079/api`;
      }
    }

    if (Platform.OS === 'android') {
      // Android Studio QEMU fallback
      return 'http://10.0.2.2:5079/api';
    }
    return 'http://localhost:5079/api';
  }

  // Canlı / Canlı Yayın (Release APK / Prod)
  return 'https://ogretmenajanda.runasp.net/api';
};

// Varsayılan API URL'i
export const DEFAULT_API_URL = getPlatformDefaultApiUrl();


const TOKEN_KEY = '@ogretmen_ajanda_jwt_token';
const USER_KEY = '@ogretmen_ajanda_active_user';
const API_URL_KEY = '@ogretmen_ajanda_api_url';

export interface AffiliatedSchool {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}

export interface UserSession {
  userId: string;
  username: string;
  fullName: string;
  role: 'SUPERADMIN' | 'SCHOOL_ADMIN' | 'STAFF' | 'TEACHER' | 'STUDENT' | 'PARENT';
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  customerId?: string;
  relationId?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  licenseExpiresAt?: string;
  assignedClasses?: string[] | string;
  assignedLessons?: string[] | string;
  affiliatedSchools?: AffiliatedSchool[];
}

export async function getBaseApiUrl(): Promise<string> {
  const customUrl = await AsyncStorage.getItem(API_URL_KEY);
  let url = customUrl || getPlatformDefaultApiUrl();
  // HTTP -> HTTPS otomatik yükseltme (Sunucu 307 yönlendirmesinde Authorization başlığı düşmesini önler)
  if (url.startsWith('http://ogretmenajanda.runasp.net')) {
    url = url.replace('http://', 'https://');
  }
  return url;
}

export async function setBaseApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(API_URL_KEY, url);
}

export async function saveAuthToken(token: string, user: UserSession): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getAuthToken(): Promise<string | null> {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

export async function getActiveUserSession(): Promise<UserSession | null> {
  const json = await AsyncStorage.getItem(USER_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function updateActiveUserSession(
  updater: (prev: UserSession) => UserSession
): Promise<UserSession | null> {
  const current = await getActiveUserSession();
  if (!current) return null;
  const updated = updater(current);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearAuthSession(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
  await AsyncStorage.removeItem('active_teacher_name').catch(() => {});
}

// Genel API İstek Yöneticisi
export async function apiRequest<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  isFormData = false,
  silent = false
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const baseUrl = await getBaseApiUrl();
    const token = await getAuthToken();

    const url = `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 7000) : null;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: isFormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { rawText: text };
    }

    if (!response.ok) {
      if (!silent && !endpoint.includes('ai-usage')) {
        console.error(`[API HATA ${response.status}] ${method} ${url}:`, data?.message || data?.rawText || 'Detaysız yanıt');
      }
      if (response.status === 401) {
        return {
          success: false,
          error: data.message || 'Sunucu oturumunuz doğrulanamadı veya süresi doldu (401). Lütfen Okul Admini olarak tekrar giriş yapınız.',
        };
      }
      return {
        success: false,
        error: data.message || `Sunucu Hatası (${response.status})`,
      };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error(`[API BAĞLANTI HATASI] ${method} ${endpoint}:`, err?.message || err);
    return {
      success: false,
      error: err.message || 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.',
    };
  }
}

export async function getActiveSchoolId(): Promise<string | undefined> {
  const session = await getActiveUserSession();
  if (session?.schoolId) return session.schoolId;
  if (session?.affiliatedSchools && session.affiliatedSchools.length > 0) {
    return session.affiliatedSchools[0].id;
  }
  return undefined;
}

export async function apiGet<T = any>(endpoint: string): Promise<T | null> {
  const res = await apiRequest<T>(endpoint.replace(/^\//, ''), 'GET');
  if (res.success && res.data !== undefined) return res.data as T;
  return null;
}

export async function apiPost<T = any>(endpoint: string, body?: any): Promise<T | null> {
  const res = await apiRequest<T>(endpoint.replace(/^\//, ''), 'POST', body);
  if (res.success && res.data !== undefined) return res.data as T;
  return null;
}

export async function apiPut<T = any>(endpoint: string, body?: any): Promise<T | null> {
  const res = await apiRequest<T>(endpoint.replace(/^\//, ''), 'PUT', body);
  if (res.success && res.data !== undefined) return res.data as T;
  return null;
}

export async function apiDelete<T = any>(endpoint: string): Promise<T | null> {
  const res = await apiRequest<T>(endpoint.replace(/^\//, ''), 'DELETE');
  if (res.success && res.data !== undefined) return res.data as T;
  return null;
}

