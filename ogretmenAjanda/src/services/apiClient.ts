import AsyncStorage from '@react-native-async-storage/async-storage';

// Varsayılan API URL'i (Geliştirme aşamasında yerel veya monsterasp sunucusu)
export const DEFAULT_API_URL = 'http://10.0.2.2:5000/api'; // Android Emulator için, cihazda veya canlıda monsterasp.net adresi yazılır

const TOKEN_KEY = '@ogretmen_ajanda_jwt_token';
const USER_KEY = '@ogretmen_ajanda_active_user';
const API_URL_KEY = '@ogretmen_ajanda_api_url';

export interface UserSession {
  userId: string;
  username: string;
  fullName: string;
  role: 'SUPERADMIN' | 'SCHOOL_ADMIN' | 'STAFF' | 'TEACHER' | 'STUDENT';
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  geminiApiKey?: string;
  licenseExpiresAt?: string;
}

export async function getBaseApiUrl(): Promise<string> {
  const customUrl = await AsyncStorage.getItem(API_URL_KEY);
  return customUrl || DEFAULT_API_URL;
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
