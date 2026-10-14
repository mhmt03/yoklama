import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest } from './apiClient';


export interface ParsedScheduleResult {
  teachers: string[];
  classes: string[]; // 9-A, 10-B...
  lessons: string[]; // Matematik, Fizik...
  bellSchedule?: Array<{ period: number; time: string }>;
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
 * PDF /Title string veya hex değerini Türkçe karakterleri destekleyerek çözer.
 * Örn: <FEFF00410068006D00650074> -> Ahmet
 * Örn: (Ahmet Kaya) -> Ahmet Kaya
 */
export function decodePdfTitle(raw: string): string {
  raw = raw.trim();
  // 1. Hex UTF-16BE formatı: <FEFF00410068...>
  if (raw.startsWith('<') && raw.endsWith('>')) {
    const hex = raw.slice(1, -1).replace(/\s+/g, '');
    let start = 0;
    if (hex.toUpperCase().startsWith('FEFF')) {
      start = 4;
    }
    let result = '';
    for (let i = start; i < hex.length; i += 4) {
      const code = parseInt(hex.substring(i, i + 4), 16);
      if (!isNaN(code) && code !== 0) {
        result += String.fromCharCode(code);
      }
    }
    return result.trim();
  }

  // 2. Parantez içi standart PDF stringi: (Ahmet YILMAZ)
  if (raw.startsWith('(') && raw.endsWith(')')) {
    let inner = raw.slice(1, -1);
    inner = inner
      .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    return inner.trim();
  }

  return raw.trim();
}

/**
 * Base64 metnini Latin1 ikili dizgeye dönüştürür.
 */
function safeBase64ToLatin1(b64: string): string {
  if (typeof atob === 'function') {
    try {
      return atob(b64);
    } catch {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = '';
  let i = 0;
  const cleanB64 = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < cleanB64.length) {
    const b1 = chars.indexOf(cleanB64.charAt(i++));
    const b2 = chars.indexOf(cleanB64.charAt(i++));
    const b3 = chars.indexOf(cleanB64.charAt(i++));
    const b4 = chars.indexOf(cleanB64.charAt(i++));
    const a = (b1 << 2) | (b2 >> 4);
    const b = ((b2 & 15) << 4) | (b3 >> 2);
    const c = ((b3 & 3) << 6) | b4;
    str += String.fromCharCode(a);
    if (b3 !== 64) str += String.fromCharCode(b);
    if (b4 !== 64) str += String.fromCharCode(c);
  }
  return str;
}

/**
 * PDF dosyasının yer imlerinden (sayfa bookmark / outline) öğretmen isimlerini ayıklar.
 */
export function extractPdfBookmarksFromBase64(base64Data: string): string[] {
  try {
    const binary = safeBase64ToLatin1(base64Data);
    const regex = /\/Title\s*(<[0-9a-fA-F\s]+>|\((?:\\.|[^\\)])*\))/gi;
    const teachers: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(binary)) !== null) {
      const decoded = decodePdfTitle(match[1]);
      if (decoded && decoded.length >= 2 && !teachers.includes(decoded)) {
        const lower = decoded.toLowerCase();
        // İndeks, kapak veya içindekiler başlıklarını filtrele
        if (
          !lower.includes('içindekiler') &&
          !lower.includes('kapak') &&
          !lower.includes('index') &&
          !lower.includes('çarşaf program') &&
          !lower.includes('ders programı')
        ) {
          teachers.push(decoded);
        }
      }
    }
    return teachers;
  } catch (err) {
    console.warn('PDF bookmark çıkarma hatası (atlandı):', err);
    return [];
  }
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
  onProgress?: (stageText: string) => void,
  onModelChange?: (modelName: string) => void
): Promise<ParsedScheduleResult> {
  onModelChange?.(preferredModel);
  onProgress?.('Belge hazırlanıyor ve ön tarama yapılıyor...');
  const cleanApiKey = apiKey.trim();
  const genAI = new GoogleGenerativeAI(cleanApiKey);

  const resolvedMime = detectMimeType(fileUri, mimeType);
  onProgress?.('Belge yapay zeka için taranabilir formata dönüştürülüyor...');
  const base64Data = await readUriAsBase64(fileUri);

  // 1. PDF Yer İmlerini (Bookmark) tara
  let extractedBookmarks: string[] = [];
  if (resolvedMime === 'application/pdf') {
    onProgress?.('📑 1. Adım: PDF yer imleri (bookmark) taranıyor...');
    extractedBookmarks = extractPdfBookmarksFromBase64(base64Data);
    if (extractedBookmarks.length > 0) {
      onProgress?.(`📑 PDF yer imlerinde ${extractedBookmarks.length} öğretmen tespit edildi. Sayfa analizine geçiliyor...`);
    }
  }

  let bookmarkHint = '';
  if (extractedBookmarks.length > 0) {
    bookmarkHint = `
ÖNEMLİ İPUCU (PDF YER İMLERİ TESPİT EDİLDİ):
Bu belgenin PDF yer imlerinden (bookmarks) şu öğretmen isimleri doğrudan çıkarılmıştır:
${JSON.stringify(extractedBookmarks)}
Bu belgede her öğretmenin kendine ait bir sayfası vardır. Lütfen bu öğretmenlerin TÜMÜNÜ ve sayfalarını eksiksiz tara!
`;
  }

  const prompt = `
Sen Türkiye'deki MEB okullarında kullanılan haftalık çarşaf ders programı (aSc Timetables, Bilsa vb.) belgelerini kusursuz çözen uzman bir yapay zekasın.

Sana verilen belge çok sayfalı bir okul çarşaf ders programı PDF'i veya görselidir.
Bu belgedeki TÜM SAYFALARI (1. sayfadan son sayfaya kadar) baştan sona eksiksiz inceleyeceksin.
${bookmarkHint}

AŞAĞIDAKİ ADIMLARI SIRASIYLA UYGULA VE TÜM VERİLERİ ÇÖZÜMLE:

--- 1. ADIM: ÖĞRETMENLERİN TESPİTİ ---
- Belgenin her sayfasında bir öğretmenin haftalık programı yer alır.
- Sayfa yer imlerindeki (bookmark) isimleri ve her sayfanın üst/başlık kısmında yer alan "Adı Soyadı:", "Ad Soyadı:", "Öğretmen:" veya "Sayın:" ibaresinin yanındaki ismi oku.
- Tüm sayfalardaki öğretmen isimlerini eksiksiz toplayıp "teachers" listesine ekle. Hiçbir sayfayı ve hiçbir öğretmeni atlama!

--- 2. ADIM: DERSLERİN VE ŞUBELERİN TESPİTİ (HER SAYFADAKİ DERS TABLOSU) ---
- Her öğretmenin sayfasında (genellikle haftalık tablonun altında veya kenarında) o öğretmenin girdiği derslerin bir tablosu bulunur.
- Bu tablonun sütun başlıkları şunlardır:
  * "Ders Adı": Dersin açık ve tam adı (Örn: "Türk Dili ve Edebiyatı", "Matematik", "Fizik", "Görsel Sanatlar", "Beden Eğitimi ve Spor", "Biyoloji" vb.)
  * "Ders": Dersin kısa kodu / kısaltması (Örn: "TDE", "MAT", "FİZ", "GÖRS", "BED", "BİY" vb.)
  * "Sınıflar": Bu dersin verildiği sınıflar/şubeler (Örn: "9/A", "9/B", "10-C", "11/A, 11/B", "12/A" vb.)
  * (Varsa) "Yer" / "Derslik": Sınıf/laboratuvar yeri
  * (Varsa) "Hds" / "Saat": Haftalık ders saati
- BU TABLODAN:
  1. "Ders Adı" sütunundaki tüm benzersiz ders isimlerini toplayıp "lessons" listesine ekle (kısa kodları değil, açık isimleri yaz).
  2. "Sınıflar" sütunundaki tüm sınıf ve şubeleri (örn: "9/A" -> "9-A", "10/B" -> "10-B") standart formatta "classes" listesine ekle.
  3. "Ders" (kısa kod) ile "Ders Adı" (tam ad) arasındaki eşleşmeyi hafızana al.

--- 3. ADIM: DERS GİRİŞ-ÇIKIŞ VE ZİL SAATLERİ (İLK ÖĞRETMENİN PROGRAMINDAN) ---
- İlk öğretmenin program tablosunda veya sayfa saat başlığında yer alan ders saatlerini (1. Ders, 2. Ders...) ve saat aralıklarını (örn: "08:30 - 09:10", "09:25 - 10:05") oku ve "bellSchedule" listesine ekle.

--- 4. ADIM: HÜCRELERE BÖLÜNMÜŞ HAFTALIK DERS PROGRAMI (HER ÖĞRETMEN İÇİN) ---
- Her öğretmenin sayfasındaki hücrelere bölünmüş haftalık program tablosunu satır satır ve sütun sütun çöz:
  * Günler: Pazartesi (1), Salı (2), Çarşamba (3), Perşembe (4), Cuma (5).
  * Ders saatleri: 1, 2, 3, 4, 5, 6, 7, 8...
  * Her dolu hücrede bir şube (örn: "9/A" veya "10-B") ve bir ders kodu (örn: "MAT" veya "FİZ") yazar.
  * Şubeyi grade ("9") ve section ("A") olarak ayır.
  * Hücredeki ders kodunu (örn: "MAT"), 2. Adımda okuduğun "Ders Adı" tablosundan eşleştirerek TAM ders adı olarak yaz (örn: "Matematik").
  * Varsa derslik bilgisini "classroom" alanına ekle.
- Her dolu ders hücresi için bir "scheduleItems" kaydı oluştur.

Lütfen aşağıdaki JSON şemasına BİREBİR uyarak sadece ve sadece saf JSON yanıt üret. Markdown backtick veya açıklama yazma.

{
  "teachers": ["Ahmet YILMAZ", "Fatma KAYA"],
  "classes": ["9-A", "9-B", "10-A", "10-B", "11-A", "12-A"],
  "lessons": ["Türk Dili ve Edebiyatı", "Matematik", "Fizik", "Kimya", "Biyoloji"],
  "bellSchedule": [
    { "period": 1, "time": "08:30 - 09:10" },
    { "period": 2, "time": "09:25 - 10:05" }
  ],
  "scheduleItems": [
    {
      "teacherName": "Ahmet YILMAZ",
      "grade": "9",
      "section": "A",
      "lessonName": "Matematik",
      "dayOfWeek": 1,
      "lessonHour": 1,
      "classroom": "9-A"
    }
  ]
}
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
  const failures: string[] = [];

  for (const currentModel of modelsToTry) {
    try {
      onModelChange?.(currentModel);
      onProgress?.(`Gemini AI (${currentModel}) ile çok sayfalı çarşaf program taranıyor...`);
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent([prompt, imagePart]);
      onProgress?.('Hücreler, öğretmenler ve ders tabloları çözümleniyor...');
      const textResponse = result.response.text().trim();

      // JSON temizleme
      let cleanJson = textResponse.replace(/^```json/i, '').replace(/```$/i, '').trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      onProgress?.('Öğretmen, sınıf ve ders omurgası doğrulanıyor...');
      const parsedData: ParsedScheduleResult = JSON.parse(cleanJson);

      // --- VERİ GÜVENLİĞİ VE BİRLEŞTİRME (POST-PROCESSING) ---

      // 1. PDF Bookmarklarından gelen öğretmenleri ekle (AI atladıysa)
      if (extractedBookmarks.length > 0) {
        for (const t of extractedBookmarks) {
          if (!parsedData.teachers.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
            parsedData.teachers.push(t);
          }
        }
      }

      // 2. scheduleItems içindeki öğretmenleri teachers listesine ekle
      for (const item of parsedData.scheduleItems || []) {
        if (item.teacherName && !parsedData.teachers.some((t) => t.toLowerCase() === item.teacherName.toLowerCase())) {
          parsedData.teachers.push(item.teacherName);
        }
      }

      // 3. scheduleItems içindeki sınıfları classes listesine ekle
      for (const item of parsedData.scheduleItems || []) {
        if (item.grade && item.section) {
          const clsName = `${item.grade}-${item.section.toUpperCase()}`;
          if (!parsedData.classes.includes(clsName)) {
            parsedData.classes.push(clsName);
          }
        }
      }

      // 4. scheduleItems içindeki dersleri lessons listesine ekle
      for (const item of parsedData.scheduleItems || []) {
        if (item.lessonName && !parsedData.lessons.includes(item.lessonName)) {
          parsedData.lessons.push(item.lessonName);
        }
      }

      // 5. classes formatını normalize et (örn: 9/A -> 9-A)
      parsedData.classes = Array.from(
        new Set(
          (parsedData.classes || []).map((c) =>
            c.replace(/[/.\s_]/g, '-').toUpperCase().trim()
          )
        )
      ).sort();

      parsedData.teachers = Array.from(new Set(parsedData.teachers || [])).sort();
      parsedData.lessons = Array.from(new Set(parsedData.lessons || [])).sort();

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
      const short = String(err?.message || 'Bilinmeyen hata').replace(/\s+/g, ' ').slice(0, 160);
      failures.push(`• ${currentModel}: ${short}`);
    }
  }

  const errToReport = primaryError || lastError;
  const errMsg = errToReport?.message || 'Bilinmeyen hata';
  const detail = failures.length ? `\n\nDenenen modeller:\n${failures.join('\n')}` : '';
  if (errMsg.includes('404') || errMsg.includes('not found')) {
    throw new Error(
      `Seçilen "${preferredModel}" modeli Google Gemini API'sinde bulunamadı veya bu API anahtarında aktif değil.${detail}\n\n` +
      `Lütfen AI Ayarları sekmesinden desteklenen bir model seçip "Sunucuya Kaydet" butonuna basın veya "Canlı Modeller" ile anahtarınızın desteklediği modelleri listeleyin.`
    );
  }

  throw new Error(`Çarşaf ders programı analiz edilemedi: ${errMsg}${detail}`);
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
