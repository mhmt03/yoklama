import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest } from './apiClient';


export interface ParsedScheduleResult {
  teachers: string[];
  classes: string[]; // 9-A, 10-B...
  lessons: string[]; // Matematik, Fizik...
  scheduleItems: Array<{
    teacherName: string;
    grade: string;
    section: string;
    lessonName: string;
    dayOfWeek: number; // 1: Pazartesi, 5: Cuma
    lessonHour: number; // 1, 2, 3...
    classroom?: string;
  }>;
}

/**
 * Android Scoped Storage ve DocumentPicker önbelleğinde IOException vermeyen,
 * fetch + blob + FileReader + copyAsync fallback'li güvenli base64 okuyucu.
 */
export async function readUriAsBase64(fileUri: string): Promise<string> {
  // 1. fetch -> blob -> FileReader (Android DocumentPicker cache/content URI için en sağlam yöntem)
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const res = reader.result as string;
          const clean = res.includes(',') ? res.split(',')[1] : res;
          resolve(clean);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (b64 && b64.length > 0) return b64;
  } catch (fetchErr) {
    console.warn('fetch blob base64 okuma başarısız, FileSystem deneniyor:', fetchErr);
  }

  // 2. FileSystem.readAsStringAsync doğrudan okuma
  try {
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (b64 && b64.length > 0) return b64;
  } catch (fsErr) {
    console.warn('readAsStringAsync başarısız, copyAsync deneniyor:', fsErr);
  }

  // 3. Geçici dosya kopyalama ile okuma (Scoped storage aşımı)
  try {
    const ext = fileUri.toLowerCase().includes('.pdf') ? '.pdf' : '.tmp';
    const tempPath = `${FileSystem.cacheDirectory}schedule_safe_${Date.now()}${ext}`;
    await FileSystem.copyAsync({ from: fileUri, to: tempPath });
    const b64 = await FileSystem.readAsStringAsync(tempPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
    if (b64 && b64.length > 0) return b64;
  } catch (copyErr) {
    console.warn('copyAsync fallback başarısız:', copyErr);
  }

  throw new Error('Belge dosyası okunamadı. Lütfen dosyayı tekrar seçiniz veya bir görsel (PNG/JPG) olarak yüklemeyi deneyiniz.');
}

export function detectMimeType(uri: string, providedMime?: string): string {
  const clean = uri.toLowerCase().split('?')[0];
  if (clean.endsWith('.pdf') || providedMime?.toLowerCase().includes('pdf')) {
    return 'application/pdf';
  }
  if (clean.endsWith('.png') || providedMime?.toLowerCase().includes('png')) {
    return 'image/png';
  }
  if (clean.endsWith('.webp') || providedMime?.toLowerCase().includes('webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

/**
 * Gemini AI ile çarşaf ders programı PDF veya görselini analiz ederek
 * okulun tüm öğretmen, sınıf, ders ve program omurgasını çıkarır.
 */
export async function parseMasterScheduleWithAi(
  fileUri: string,
  apiKey: string,
  mimeType = 'image/jpeg',
  preferredModel = 'gemini-2.5-flash',
  schoolId?: string,
  onProgress?: (stageText: string) => void
): Promise<ParsedScheduleResult> {
  onProgress?.('Belge hazırlanıyor ve sıkıştırılıyor...');
  const cleanApiKey = apiKey.trim();
  const genAI = new GoogleGenerativeAI(cleanApiKey);

  const resolvedMime = detectMimeType(fileUri, mimeType);
  onProgress?.('Belge yapay zeka için taranabilir formata dönüştürülüyor...');
  const base64Data = await readUriAsBase64(fileUri);

  const prompt = `
Bu haftalık okul çarşaf ders programı belgesini incele.
Lütfen aşağıdaki JSON şemasına BİREBİR uyarak sadece ve sadece saf JSON yanıt üret. Markdown backtick veya açıklama yazma.

{
  "teachers": ["Öğretmen Adı Soyadı"],
  "classes": ["9-A", "10-B"],
  "lessons": ["Fizik", "Matematik"],
  "scheduleItems": [
    {
      "teacherName": "Öğretmen Adı",
      "grade": "9",
      "section": "A",
      "lessonName": "Fizik",
      "dayOfWeek": 1, 
      "lessonHour": 1,
      "classroom": "Derslik 101"
    }
  ]
}

Notlar:
- dayOfWeek: 1: Pazartesi, 2: Salı, 3: Çarşamba, 4: Perşembe, 5: Cuma, 6: Cumartesi, 7: Pazar
- grade ve section'ı ayır (örn: "9-A" ise grade="9", section="A").
- Sadece saf JSON string döndür.
`;

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: resolvedMime,
    },
  };

  const candidateList = [preferredModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.8-flash'];
  const modelsToTry = Array.from(new Set(candidateList.filter(Boolean)));
  let lastError: any = null;
  let primaryError: any = null;

  for (const currentModel of modelsToTry) {
    try {
      onProgress?.(`Gemini AI (${currentModel}) ile görsel analiz yapılıyor...`);
      const model = genAI.getGenerativeModel({ model: currentModel });
      const result = await model.generateContent([prompt, imagePart]);
      onProgress?.('Ders programı tablosu çözümleniyor ve veriler inceleniyor...');
      const textResponse = result.response.text().trim();

      // JSON temizleme (olası markdown backticklerini temizle)
      let cleanJson = textResponse.replace(/^```json/i, '').replace(/```$/i, '').trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      onProgress?.('Öğretmen, sınıf ve ders saatleri doğrulanıyor...');
      const parsedData: ParsedScheduleResult = JSON.parse(cleanJson);

      // Total okul kotasına bildir
      try {
        const { recordGeminiApiUsage } = await import('../utils/geminiScheduleService');
        await recordGeminiApiUsage(currentModel, result.response.usageMetadata, schoolId);
      } catch {}

      onProgress?.('Ayrıştırma başarıyla tamamlandı!');
      return parsedData;
    } catch (err: any) {
      if (!primaryError) {
        primaryError = err;
      }
      lastError = err;
    }
  }

  const errToReport = primaryError || lastError;
  const errMsg = errToReport?.message || 'Bilinmeyen hata';
  if (errMsg.includes('404') || errMsg.includes('not found')) {
    throw new Error(
      `Seçilen "${preferredModel}" modeli Google Gemini API'sinde bulunamadı veya bu API anahtarında aktif değil.\n\n` +
      `Lütfen Admin panelindeki "AI Ayarları" sekmesinden "gemini-2.5-flash" veya "gemini-2.0-flash" seçin veya "Canlı Modeller" butonuna basarak API anahtarınızın desteklediği güncel modelleri listeleyin.`
    );
  }

  throw new Error(`Çarşaf ders programı analiz edilemedi: ${errMsg}`);
}

export interface MasterScheduleSaveOptions {
  overwriteAll: boolean;
  syncTeachers?: boolean;
  syncClasses?: boolean;
  syncLessons?: boolean;
  syncSchedules?: boolean;
}

/**
 * Ayrıştırılan çarşaf programı sunucuya atomik ve seçmeli olarak gönderir
 */
export async function saveMasterScheduleToServer(
  schoolId: string,
  parsed: ParsedScheduleResult,
  options: MasterScheduleSaveOptions | boolean = false
): Promise<{ success: boolean; message: string; data?: any }> {
  const opts: MasterScheduleSaveOptions = typeof options === 'boolean'
    ? { overwriteAll: options, syncTeachers: true, syncClasses: true, syncLessons: true, syncSchedules: true }
    : {
        overwriteAll: options.overwriteAll,
        syncTeachers: options.syncTeachers ?? true,
        syncClasses: options.syncClasses ?? true,
        syncLessons: options.syncLessons ?? true,
        syncSchedules: options.syncSchedules ?? true,
      };

  const syncItems = parsed.scheduleItems.map((item) => ({
    teacherName: item.teacherName,
    dayOfWeek: item.dayOfWeek,
    lessonHour: item.lessonHour,
    grade: item.grade,
    section: item.section,
    lessonName: item.lessonName,
    classroom: item.classroom,
  }));

  const res = await apiRequest<any>('sync/schedules/batch', 'POST', {
    schoolId,
    overwriteAll: opts.overwriteAll,
    syncTeachers: opts.syncTeachers,
    syncClasses: opts.syncClasses,
    syncLessons: opts.syncLessons,
    syncSchedules: opts.syncSchedules,
    teachers: parsed.teachers,
    classes: parsed.classes,
    lessons: parsed.lessons,
    schedules: syncItems,
  });

  if (res.success) {
    return {
      success: true,
      message: res.data?.message || (opts.overwriteAll
        ? `Tüm okul ders programı sıfırlanıp yeniden kaydedildi.`
        : `Ders programı başarıyla güncellendi.`),
      data: res.data,
    };
  }

  return {
    success: false,
    message: res.error || 'Ders programı sunucuya kaydedilemedi.',
  };
}
