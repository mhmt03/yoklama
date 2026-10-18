import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

  // Mobil Geliştirme (Emülatör) Modu
  if (isDev) {
    if (Platform.OS === 'android') {
      // Android emülatörün bilgisayarın yerel sunucusuna (localhost) erişim köprüsü
      return 'http://10.0.2.2:5079/api';
    }
    return 'http://localhost:5079/api';
  }

  // Canlı / Canlı Yayın (Release APK / Prod)
  return 'https://ogretmenajanda.runasp.net/api';
};

// Varsayılan API URL'i: Emülatörde 10.0.2.2:5079, yerel webde localhost:5079, canlıda runasp.net
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
  role: 'SUPERADMIN' | 'SCHOOL_ADMIN' | 'STAFF' | 'TEACHER' | 'STUDENT';
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  customerId?: string;
  relationId?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  licenseExpiresAt?: string;
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

export async function clearAuthSession(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

// Genel API İstek Yöneticisi
export async function apiRequest<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  isFormData = false
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

    const response = await fetch(url, {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { rawText: text };
    }

    if (!response.ok) {
      console.error(`[API HATA ${response.status}] ${method} ${url}:`, data?.message || data?.rawText || 'Detaysız yanıt');
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
