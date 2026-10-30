import { apiRequest } from './apiClient';

type UnreadListener = (count: number) => void;

let cachedUnreadCount = 0;
const listeners: Set<UnreadListener> = new Set();

export function subscribeUnreadCount(listener: UnreadListener): () => void {
  listeners.add(listener);
  listener(cachedUnreadCount);
  return () => {
    listeners.delete(listener);
  };
}

export function setCachedUnreadCount(count: number) {
  cachedUnreadCount = Math.max(0, count);
  listeners.forEach(l => {
    try {
      l(cachedUnreadCount);
    } catch {}
  });
}

export function getCachedUnreadCount(): number {
  return cachedUnreadCount;
}

/**
 * Sunucudan kullanıcının okunmamış mesaj sayısını sorgular ve dinleyicilere bildirir
 */
export async function fetchUnreadMessageCount(schoolId?: string): Promise<number> {
  try {
    const url = schoolId ? `messages/unread-count?schoolId=${schoolId}` : 'messages/unread-count';
    const res = await apiRequest<{ count: number }>(url, 'GET', undefined, false, true);
    if (res.success && res.data && typeof res.data.count === 'number') {
      setCachedUnreadCount(res.data.count);
      return res.data.count;
    }
  } catch (e) {
    // Sessiz hata
  }
  return cachedUnreadCount;
}

/**
 * Belirli bir mesajı okundu olarak işaretler
 */
export async function markMessageAsRead(messageId: string): Promise<boolean> {
  try {
    const res = await apiRequest(`messages/${messageId}/read`, 'POST');
    if (res.success) {
      if (cachedUnreadCount > 0) {
        setCachedUnreadCount(cachedUnreadCount - 1);
      }
      return true;
    }
  } catch {}
  return false;
}

/**
 * Tüm mesajları okundu olarak işaretler
 */
export async function markAllMessagesAsRead(schoolId?: string): Promise<boolean> {
  try {
    const url = schoolId ? `messages/mark-all-read?schoolId=${schoolId}` : 'messages/mark-all-read';
    const res = await apiRequest(url, 'POST');
    if (res.success) {
      setCachedUnreadCount(0);
      return true;
    }
  } catch {}
  return false;
}
