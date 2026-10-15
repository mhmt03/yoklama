import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Varsayılan API URL'i: Canlı mobil uygulama ve canlı web için ogretmenajanda.runasp.net (HTTPS zorunlu)
export const DEFAULT_API_URL = Platform.OS === 'web' && typeof window !== 'undefined' && !['8081', '19006'].includes(window.location.port)
  ? `${window.location.origin}/api`
  : 'https://ogretmenajanda.runasp.net/api';


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
  let url = customUrl || DEFAULT_API_URL;
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
    return {
      success: false,
      error: err.message || 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.',
    };
  }
}
