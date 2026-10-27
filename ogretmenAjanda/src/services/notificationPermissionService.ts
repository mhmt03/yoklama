import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';

const NOTIFICATION_PERMISSION_ASKED_KEY = '@ogretmen_ajanda_notif_asked_v1';

/**
 * Android 13+ (API 33+) ve platformlar için bildirim izinlerini kullanıcıdan talep eder.
 * Kullanıcı daha sonra bildirim alabilmesi için sistem izni açılır.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13+ (API 33+) için POST_NOTIFICATIONS izni zorunludur
    if (Platform.Version >= 33) {
      try {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

        if (hasPermission) {
          return true;
        }

        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Öğretmen Ajandası Bildirim İzni',
            message:
              'Okul içi mesajlar, anonslar, ders programı güncellemeleri ve öğrenci bildirimlerini anlık alabilmeniz için bildirim izni vermeniz önerilir.',
            buttonPositive: 'İzin Ver',
            buttonNegative: 'Daha Sonra',
          }
        );

        await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, 'true');
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Bildirim izni alınırken hata:', err);
        return false;
      }
    }
    // Android 12 ve öncesinde kurulumda bildirimler varsayılan olarak açıktır
    return true;
  }

  // Web veya diğer platformlar
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'default') {
        const res = await Notification.requestPermission();
        return res === 'granted';
      }
      return Notification.permission === 'granted';
    } catch {}
  }

  return true;
}

/**
 * Sunucuya cihaz bildirim token'ını kaydeder (ileride anlık push bildirimleri göndermek için)
 */
export async function registerDevicePushToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await apiRequest('messages/register-push-token', 'POST', { token });
    return res.success;
  } catch (e) {
    return false;
  }
}
