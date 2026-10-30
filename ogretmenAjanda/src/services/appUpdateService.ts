import { Alert, Linking, Platform } from 'react-native';

/**
 * Uygulamanın dahili versiyon bilgisi.
 * Yeni her APK derlemesinde bu değerler bir artırılır.
 */
export const CURRENT_APP_VERSION = '1.0.10';
export const CURRENT_VERSION_CODE = 11;

export const UPDATE_SERVER_BASE_URL = 'https://ogretmenajanda.runasp.net';
export const UPDATE_JSON_URL = `${UPDATE_SERVER_BASE_URL}/version.json`;
export const UPDATE_TXT_URL = `${UPDATE_SERVER_BASE_URL}/version.txt`;
export const DEFAULT_APK_DOWNLOAD_URL = `${UPDATE_SERVER_BASE_URL}/api/apk`;

export interface AppVersionInfo {
  version: string;
  versionCode?: number;
  downloadUrl?: string;
  releaseNotes?: string;
  mandatory?: boolean;
}

/**
 * Semantik versiyon karşılaştırması (örn: 1.0.1 > 1.0.0)
 * remote > current ise pozitif döner.
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string = CURRENT_APP_VERSION): boolean {
  if (!remoteVersion) return false;
  const parseParts = (v: string) => v.replace(/^v/i, '').split('.').map(p => parseInt(p, 10) || 0);
  const rParts = parseParts(remoteVersion);
  const cParts = parseParts(currentVersion);

  const maxLen = Math.max(rParts.length, cParts.length);
  for (let i = 0; i < maxLen; i++) {
    const r = rParts[i] || 0;
    const c = cParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

/**
 * Sunucudaki version.json veya version.txt dosyasını kontrol eder.
 * Yeni versiyon varsa kullanıcıya uyarı gösterip APK indirme bağlantısına yönlendirir.
 */
export async function checkForAppUpdate(silent: boolean = true): Promise<void> {
  // Web tarayıcısında çalışan sürüm için APK güncelleme kontrolü yapılmaz (Mixed content ve gereksiz ağ trafiği önlenir)
  if (Platform.OS === 'web') return;
  try {
    let remoteInfo: AppVersionInfo | null = null;

    // 1. Önce detaylı version.json'u çekmeyi dene
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${UPDATE_JSON_URL}?t=${Date.now()}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        remoteInfo = await res.json();
      }
    } catch {
      // JSON başarısızsa version.txt'ye geçilecek
    }

    // 2. JSON gelmediyse doğrudan version.txt'yi dene
    if (!remoteInfo) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const resTxt = await fetch(`${UPDATE_TXT_URL}?t=${Date.now()}`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' },
        });
        clearTimeout(timeoutId);

        if (resTxt.ok) {
          const txt = (await resTxt.text()).trim();
          if (txt) {
            // İlk satır versiyon numarasıdır
            const firstLine = txt.split('\n')[0].trim();
            remoteInfo = {
              version: firstLine,
              downloadUrl: DEFAULT_APK_DOWNLOAD_URL,
              releaseNotes: 'Yeni özellikler ve hata düzeltmeleri hazırlandı.',
            };
          }
        }
      } catch {
        // İkisi de başarısız
      }
    }

    if (!remoteInfo || !remoteInfo.version) {
      if (!silent) {
        Alert.alert('Bağlantı Hatası', 'Sunucudaki güncelleme bilgisine erişilemedi.');
      }
      return;
    }

    const hasNewer = isNewerVersion(remoteInfo.version, CURRENT_APP_VERSION) ||
      (remoteInfo.versionCode !== undefined && remoteInfo.versionCode > CURRENT_VERSION_CODE);

    if (hasNewer) {
      const downloadUrl = remoteInfo.downloadUrl || DEFAULT_APK_DOWNLOAD_URL;
      const notes = remoteInfo.releaseNotes
        ? `\n\n📌 Yenilikler:\n${remoteInfo.releaseNotes}`
        : '';

      Alert.alert(
        '🚀 Yeni Güncelleme Mevcut!',
        `Öğretmen Ajandası uygulamasının yeni bir sürümü yayınlandı.\n` +
        `• Mevcut Sürüm: v${CURRENT_APP_VERSION}\n` +
        `• Yeni Sürüm: v${remoteInfo.version}${notes}\n\n` +
        `Yeni özellikleri kullanabilmek ve kesintisiz deneyim için uygulamayı hemen güncellemeniz önerilir.`,
        [
          { text: 'Daha Sonra', style: 'cancel' },
          {
            text: 'Şimdi Güncelle (APK İndir)',
            style: 'default',
            onPress: async () => {
              try {
                const supported = await Linking.canOpenURL(downloadUrl);
                if (supported) {
                  await Linking.openURL(downloadUrl);
                } else {
                  Alert.alert('Hata', 'İndirme bağlantısı açılamadı: ' + downloadUrl);
                }
              } catch (e: any) {
                Alert.alert('Hata', 'Bağlantı açılırken sorun oluştu: ' + (e?.message || e));
              }
            },
          },
        ]
      );
    } else {
      if (!silent) {
        Alert.alert(
          'Uygulama Güncel',
          `Harika! En son Öğretmen Ajandası sürümünü kullanıyorsunuz (v${CURRENT_APP_VERSION}).`
        );
      }
    }
  } catch (e) {
    if (!silent) {
      Alert.alert('Güncelleme Denetimi', 'Güncelleme kontrolü yapılırken bir sorun oluştu.');
    }
  }
}
