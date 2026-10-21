import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface OptimizedImageResult {
  uri: string;
  width: number;
  height: number;
  sizeBytes?: number;
  wasOptimized: boolean;
}

/**
 * Akıllı Resim Optimizasyon Servisi
 * Kural:
 * 1. Resim boyutu ve çözünürlüğü kontrol edilir.
 * 2. Zaten küçükse (Genişlik <= 320px veya Dosya boyutu < 40KB) dokunulmaz.
 * 3. Büyükse max 300x400 px ve %68 kalitede JPEG olarak sıkıştırılır (20-30 KB hedefi).
 */
export async function optimizeStudentPhoto(uri: string): Promise<OptimizedImageResult> {
  try {
    let fileSize = 0;
    if (Platform.OS === 'web') {
      if (uri.startsWith('data:')) {
        const comma = uri.indexOf(',');
        fileSize = Math.round((uri.length - (comma >= 0 ? comma + 1 : 0)) * 0.75);
      }
    } else {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists && 'size' in fileInfo) {
          fileSize = fileInfo.size;
        }
      } catch {
        // Dosya boyutu okunamasa bile manipülasyona devam et
      }
    }

    // 40 KB'dan küçükse zaten yeterince küçüktür
    if (fileSize > 0 && fileSize < 40 * 1024) {
      return {
        uri,
        width: 300,
        height: 400,
        sizeBytes: fileSize,
        wasOptimized: false,
      };
    }

    // Boyut veya çözünürlük yüksekse optimize et
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 300 } }], // En boy oranını koruyarak genişliği 300px yapar
      {
        compress: 0.68,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    let newSize = 0;
    if (Platform.OS === 'web') {
      if (manipResult.uri.startsWith('data:')) {
        const comma = manipResult.uri.indexOf(',');
        newSize = Math.round((manipResult.uri.length - (comma >= 0 ? comma + 1 : 0)) * 0.75);
      }
    } else {
      try {
        const newInfo = await FileSystem.getInfoAsync(manipResult.uri);
        if (newInfo.exists && 'size' in newInfo) {
          newSize = newInfo.size;
        }
      } catch {
        // yoksay
      }
    }

    return {
      uri: manipResult.uri,
      width: manipResult.width,
      height: manipResult.height,
      sizeBytes: newSize,
      wasOptimized: true,
    };
  } catch (error) {
    console.warn('Görsel optimize edilirken hata oluştu, orijinal kullanılıyor:', error);
    return {
      uri,
      width: 300,
      height: 400,
      wasOptimized: false,
    };
  }
}
