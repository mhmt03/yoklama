import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';
import { slicePdfPages } from '../utils/pdfSliceService';

export interface ScheduleBatchItem {
  id: string;
  name: string;
  createdAt: number;
  pageRangeText?: string;
  data: ParsedScheduleResult;
}

export interface TeacherWorkloadItem {
  className: string; // "12-D", "11-C"
  lessonCode?: string; // "KLSAHL", "BDN"
  lessonName: string; // "Seçmeli Klasik Ahlak Metinleri"
  weeklyHours: number; // HS (1, 2, 4...)
  dailyHours?: { [day: string]: number }; // { "Pzt": 1, "Salı": 2, ... }
}

export interface TeacherScheduleVerification {
  teacherName: string;
  expectedWeeklyHours?: number; // Tablodaki "Toplamlar" satırındaki HS
  extractedWeeklyHours: number; // Grid'den çıkarılan ders saati toplamı
  isConsistent: boolean;
  workloadItems?: TeacherWorkloadItem[];
}

export interface ParsedLessonItemDetail {
  name: string;
  code?: string;
  weeklyHours?: number;
  grade?: string;
}

export interface ParsedScheduleResult {
  teachers: string[];
  classes: string[]; // 9-A, 10-B...
  lessons: string[]; // Matematik, Fizik...
  lessonDetails?: ParsedLessonItemDetail[];
  bellSchedule?: Array<{ period: number; time: string }>;
  scheduleItems: Array<{
    teacherName: string;
    grade: string;
    section: string;
    lessonName: string;
    lessonCode?: string;
    dayOfWeek: number; // 1: Pazartesi, 5: Cuma
    lessonHour: number; // 1, 2, 3...
    classroom?: string;
  }>;
  teacherVerifications?: TeacherScheduleVerification[];
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

function addTeacherIfValid(decoded: string, teachers: string[]): void {
  if (!decoded || decoded.length < 2) return;
  const clean = decoded.replace(/^(?:by|sn\.?|sayın)\s*/i, '').trim();
  if (clean.length < 2 || teachers.includes(clean)) return;
  const lower = clean.toLowerCase();
  if (
    !lower.includes('içindekiler') &&
    !lower.includes('kapak') &&
    !lower.includes('index') &&
    !lower.includes('çarşaf program') &&
    !lower.includes('ders programı')
  ) {
    teachers.push(clean);
  }
}

/**
 * Base64 metnini Latin1 ikili dizgeye dönüştürür (ReDoS ve bellek sızıntısını önler).
 */
function safeBase64ToLatin1(b64: string): string {
  const cleanB64 = b64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    try {
      return atob(cleanB64);
    } catch {}
  }
  const globalBuffer = (globalThis as any)?.Buffer;
  if (globalBuffer) {
    try {
      return globalBuffer.from(cleanB64, 'base64').toString('latin1');
    } catch {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const chunks: string[] = [];
  let i = 0;
  const sanitized = cleanB64.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < sanitized.length) {
    const b1 = chars.indexOf(sanitized.charAt(i++));
    const b2 = chars.indexOf(sanitized.charAt(i++));
    const b3 = chars.indexOf(sanitized.charAt(i++));
    const b4 = chars.indexOf(sanitized.charAt(i++));
    const a = (b1 << 2) | (b2 >> 4);
    const b = ((b2 & 15) << 4) | (b3 >> 2);
    const c = ((b3 & 3) << 6) | b4;
    chunks.push(String.fromCharCode(a));
    if (b3 !== 64) chunks.push(String.fromCharCode(b));
    if (b4 !== 64) chunks.push(String.fromCharCode(c));
  }
  return chunks.join('');
}

/**
 * PDF dosyasının yer imlerinden (sayfa bookmark / outline) öğretmen isimlerini ayıklar.
 * Güvenli arama: Regex backtracking olmadan hızlıca /Title başlıklarını bulur.
 */
export function extractPdfBookmarksFromBase64(base64Data: string): string[] {
  try {
    const binary = safeBase64ToLatin1(base64Data);
    if (!binary) return [];

    const teachers: string[] = [];
    let idx = 0;
    const maxLen = binary.length;

    while ((idx = binary.indexOf('/Title', idx)) !== -1) {
      idx += 6;
      // İleriye dönük en fazla 300 karakterlik güvenli bir kesit al (Asla tüm dosyayı tarayıp takılmaz)
      const snippet = binary.substring(idx, Math.min(idx + 300, maxLen));

      // 1. Hex UTF-16 formatı: <FEFF00410068...>
      const hexMatch = snippet.match(/^\s*<([0-9a-fA-F\s]+)>/);
      if (hexMatch) {
        const decoded = decodePdfTitle('<' + hexMatch[1] + '>');
        addTeacherIfValid(decoded, teachers);
        continue;
      }

      // 2. Parantez içi standart PDF metni: (Ahmet YILMAZ)
      const parenStart = snippet.indexOf('(');
      if (parenStart !== -1 && parenStart < 15) {
        let parenEnd = -1;
        for (let i = parenStart + 1; i < snippet.length; i++) {
          if (snippet[i] === ')' && snippet[i - 1] !== '\\') {
            parenEnd = i;
            break;
          }
        }
        if (parenEnd !== -1) {
          const rawTitle = snippet.substring(parenStart, parenEnd + 1);
          const decoded = decodePdfTitle(rawTitle);
          addTeacherIfValid(decoded, teachers);
        }
      }
    }
    return teachers;
  } catch (err) {
    console.warn('PDF bookmark çıkarma hatası (atlandı):', err);
    return [];
  }
}

const LOG = '[Çarşaf AI]';

/**
 * Gemini yanıtındaki JSON'u toleranslı ayrıştırır: markdown temizler, sondaki virgülleri atar,
 * yanıt token sınırında yarım kesilmişse son tamamlanmış öğeye kadar kesip parantezleri kapatır.
 */
export function parseJsonLenient(raw: string): { data: any; repaired: boolean } {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = text.indexOf('{');
  if (first < 0) throw new Error('Yanıtta JSON bulunamadı.');
  text = text.slice(first);
  try {
    return { data: JSON.parse(text), repaired: false };
  } catch {}

  const noTrailing = text.replace(/,\s*([}\]])/g, '$1');
  try {
    return { data: JSON.parse(noTrailing), repaired: true };
  } catch {}

  // Kesilmiş JSON onarımı
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  let safeStack: string[] = [];
  for (let i = 0; i < noTrailing.length; i++) {
    const ch = noTrailing[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length >= 1) {
        lastSafe = i + 1;
        safeStack = [...stack];
      }
    }
  }
  if (lastSafe < 0) throw new Error('JSON onarılamadı (yanıt çok kısa kesilmiş).');
  const fixed = noTrailing.slice(0, lastSafe).replace(/,\s*$/, '') + safeStack.reverse().join('');
  return { data: JSON.parse(fixed), repaired: true };
}

export interface ScheduleParseOptions {
  extractTeachers?: boolean;
  extractClasses?: boolean;
  extractLessons?: boolean;
  extractBellSchedule?: boolean;
  extractScheduleItems?: boolean;
  existingTeachers?: string[];
  existingClasses?: string[];
  existingLessons?: string[];
  pageRange?: { start: number; end: number };
  isCancelled?: () => boolean;
  autoHealBlocks?: boolean; // Varsayılan: false (İsteğe bağlı akıllı dengeleme)
}

/**
 * Gemini AI ile çarşaf ders programı PDF veya görselini analiz ederek
 * okulun tüm öğretmen, sınıf, ders ve program omurgasını çıkarır.
 */
export async function parseMasterScheduleWithAi(
  fileUri: string,
  apiKey: string,
  mimeType = 'image/jpeg',
  preferredModel = 'gemini-3-flash-preview',
  schoolId?: string,
  onProgress?: (stageText: string) => void,
  onModelChange?: (modelName: string) => void,
  options?: ScheduleParseOptions
): Promise<ParsedScheduleResult> {
  const optTeachers = options?.extractTeachers ?? true;
  const optClasses = options?.extractClasses ?? true;
  const optLessons = options?.extractLessons ?? true;
  const optBellSchedule = options?.extractBellSchedule ?? true;
  const optScheduleItems = options?.extractScheduleItems ?? true;

  onModelChange?.(preferredModel);
  onProgress?.('Belge hazırlanıyor ve ön tarama yapılıyor...');
  const cleanApiKey = apiKey.trim();
  const genAI = new GoogleGenerativeAI(cleanApiKey);

  const resolvedMime = detectMimeType(fileUri, mimeType);
  onProgress?.('Belge yapay zeka için taranabilir formata dönüştürülüyor...');
  let base64Data = await readUriAsBase64(fileUri);

  // Belirli sayfa aralığı seçildiyse PDF'i bellek içinde otomatik kes
  if (resolvedMime === 'application/pdf' && options?.pageRange && options.pageRange.start > 0 && options.pageRange.end > 0) {
    try {
      onProgress?.(`📄 PDF'in ${options.pageRange.start}. - ${options.pageRange.end}. arası sayfaları kesiliyor...`);
      const sliceRes = await slicePdfPages(base64Data, options.pageRange.start, options.pageRange.end);
      base64Data = sliceRes.slicedBase64;
      console.log(`[Çarşaf AI] PDF Sayfa Aralığı Kesildi: ${options.pageRange.start}-${options.pageRange.end} (${sliceRes.pageCount}/${sliceRes.totalOriginalPages} sayfa, ${Math.round(base64Data.length / 1024)} KB)`);
    } catch (sliceErr) {
      console.warn('[Çarşaf AI] PDF sayfa kesme hatası, orijinal belgeyle devam ediliyor:', sliceErr);
    }
  }

  // 1. PDF Yer İmlerini (Bookmark) tara (Sadece öğretmen çıkarımı gerekliyse)
  let extractedBookmarks: string[] = [];
  if (resolvedMime === 'application/pdf' && optTeachers) {
    onProgress?.('📑 1. Adım: PDF yer imleri (bookmark) taranıyor...');
    extractedBookmarks = extractPdfBookmarksFromBase64(base64Data);
    if (extractedBookmarks.length > 0) {
      onProgress?.(`📑 PDF yer imlerinde ${extractedBookmarks.length} öğretmen tespit edildi.`);
      // Kullanıcı SADECE öğretmen kadrosunu istediyse ve PDF yer imlerinde öğretmenler varsa, yapay zekayı beklemeden 0.1 sn'de tamamla!
      if (!optClasses && !optLessons && !optScheduleItems) {
        onProgress?.(`⚡ PDF yer imlerinden ${extractedBookmarks.length} öğretmen anında çıkarıldı!`);
        return {
          teachers: Array.from(new Set(extractedBookmarks)).sort(),
          classes: [],
          lessons: [],
          bellSchedule: [],
          scheduleItems: [],
        };
      }
    }
  }

  let bookmarkHint = '';
  if (extractedBookmarks.length > 0) {
    bookmarkHint = `
ÖNEMLİ İPUCU (PDF YER İMLERİ TESPİT EDİLDİ):
Bu belgenin PDF yer imlerinden (bookmarks) şu öğretmen isimleri doğrudan çıkarılmıştır:
${JSON.stringify(extractedBookmarks)}
Bu listeyi sayfa başlıklarıyla doğrula; sayfada olup burada eksik kalan öğretmen varsa ekle.
`;
  } else {
    bookmarkHint = `
BİLGİ (YER İMİ / BOOKMARK BULUNMADI VEYA BELGE FOTOĞRAF / TARAMA):
Bu belgede yer imi (bookmark) bulunmamaktadır (veya bir fotoğraf / tarama belgesidir).
Öğretmen isimlerini belgenin doğrudan görsel içeriğinden; sayfa başlıklarındaki ("Sayın...", "Öğretmen:...", "Adı Soyadı:...", "Öğretmen El Programı:...", başlık kutusu), tablo üstündeki veya satır başlarındaki isimlerden EKSİKSİZ oku ve topla!
`;
  }

  // Mevcut sistem verileri ipucu olarak prompt'a eklenir
  let existingContextHint = '';
  if (options?.existingClasses && options.existingClasses.length > 0) {
    existingContextHint += `\nSİSTEMDE KAYITLI MEVCUT ŞUBELER:\n${JSON.stringify(options.existingClasses)}\n`;
  }
  if (options?.existingTeachers && options.existingTeachers.length > 0) {
    existingContextHint += `\nSİSTEMDE KAYITLI MEVCUT ÖĞRETMENLER:\n${JSON.stringify(options.existingTeachers)}\n`;
  }
  if (options?.existingLessons && options.existingLessons.length > 0) {
    existingContextHint += `\nSİSTEMDE KAYITLI MEVCUT DERSLER:\n${JSON.stringify(options.existingLessons)}\n`;
  }

  // Hızlı Tarama Sınırı (Kullanıcı ders programı hücrelerini istemediyse modeli kesin olarak sınırla)
  const fastScanBanner = !optScheduleItems
    ? `
════════════════════════════════════════════════════════════════════════
🚨🚨🚨 ÇOK ACİL VE KRİTİK HIZ TALİMATI (HÜCRELERİ ÇÖZÜMLEME!): 🚨🚨🚨
Bu istek bir "HIZLI ÖN BİLGİ LİSTESİ" çıkarma işlemidir.
Kullanıcı HAFTALIK DERS DAĞILIMINI, DERS SAATLERİNİ VEYA DERS PROGRAMI HÜCRELERİNİ KESİNLİKLE İSTEMEMEKTEDİR!
Tablolardaki saatleri, günleri (Pzt-Salı-Çarş-Perş-Cuma) ve derslik hücrelerini ÇÖZÜMLEMEYE ASLA VAKİT HARCAMA!
SADECE VE SADECE şunları liste olarak topla ve hemen bitir:
${optTeachers ? '• Öğretmen İsimleri ("teachers")' : ''}
${optClasses ? '• Şube/Sınıf İsimleri ("classes")' : ''}
${optLessons ? '• Açık Ders Adları ("lessons")' : ''}
JSON çıktındaki "scheduleItems" ve "bellSchedule" alanları MUTLAKA BOŞ DİZİ [] olmalıdır!
════════════════════════════════════════════════════════════════════════
`
    : '';

  // Dinamik Prompt Oluşturma
  let requestedSteps = '';
  let jsonSchema = '{\n';

  if (optTeachers) {
    requestedSteps += `
--- ÖĞRETMENLERİN TESPİTİ (HER TÜRLÜ BELGE, TARAMA VEYA FOTOĞRAFTA) ---
- Belgede yer imi (bookmark) olsun veya OLMASIN (fotoğraf veya tarama olsa bile), her sayfa ve çizelgedeki öğretmen isimlerini şu alanlardan eksiksiz oku:
  1. Sayfa Başlığı ve Üst Bilgi: "Sayın [İsim]", "Öğretmen: [İsim]", "Adı Soyadı: [İsim]", "Öğretmenin Adı: [İsim]" veya başlık kutusunda yazan isim (Örn: "ENGİN YILMAZ", "FATMA KAYA").
  2. Tablo Başlık / Sol Sütun (Eğer tek sayfalık büyük matrix çarşaf tablosu ise): En sol sütundaki öğretmen isimlerini satır satır oku.
  3. Tablo Altı / İmza / Ders Dağılım Bölümü: Tablonun altındaki imza veya ders dağılım özetinde yer alan öğretmen adını oku.
  4. Temizleme Kuralı: "Sayın", "Öğretmen", "Sn.", "Müdür" gibi unvanları ayıkla; sadece gerçek Ad ve Soyadı al (Örn: "Sayın Ahmet YILMAZ" -> "Ahmet YILMAZ"). "Çarşaf Program", "İçindekiler" gibi başlıkları öğretmen sanma.
- Tüm sayfalardaki öğretmen isimlerini toplayıp tekilleştirerek "teachers" listesine ekle.
`;
    jsonSchema += '  "teachers": ["Ahmet YILMAZ", "Fatma KAYA"],\n';
  } else {
    jsonSchema += '  "teachers": [],\n';
  }

  if (optClasses || optLessons) {
    requestedSteps += `
--- DERSLERİN VE ŞUBELERİN TESPİTİ (HER SAYFADAKİ DERS TABLOSU) ---
- Her öğretmenin sayfasındaki (tablonun altı/kenarındaki) "Ders Adı - Ders Kodu - Sınıflar" özet tablosunu oku:
${optLessons ? '  * "Ders Adı" sütunundaki tüm açık ders isimlerini "lessons" listesine ekle.' : ''}
${optClasses ? '  * "Sınıflar" sütunundaki tüm sınıf ve şubeleri (örn: "9/A" -> "9-A", "10-B") standart formatta "classes" listesine ekle.' : ''}
`;
    if (optClasses) jsonSchema += '  "classes": ["9-A", "9-B", "10-A", "10-B"],\n';
    else jsonSchema += '  "classes": [],\n';

    if (optLessons) jsonSchema += '  "lessons": ["Türk Dili ve Edebiyatı", "Matematik", "Fizik"],\n';
    else jsonSchema += '  "lessons": [],\n';
  } else {
    jsonSchema += '  "classes": [],\n  "lessons": [],\n';
  }

  if (optBellSchedule && optScheduleItems) {
    requestedSteps += `
--- DERS GİRİŞ-ÇIKIŞ VE ZİL SAATLERİ ---
- İlk öğretmenin program tablosundaki saat aralıklarını (örn: "08:30 - 09:10") "bellSchedule" listesine ekle.
`;
    jsonSchema += '  "bellSchedule": [{ "period": 1, "time": "08:30 - 09:10" }],\n';
  }

  if (optScheduleItems) {
    requestedSteps += `
--- HÜCRELERE BÖLÜNMÜŞ HAFTALIK DERS PROGRAMI & DERS DAĞILIM ÇİZELGESİ ---
Her öğretmenin sayfasındaki haftalık program tablosunu ve alttaki "Ders Dağılım ve Saat Çizelgesi" özet tablosunu oku:
Her öğretmen için:
1. "teacher": Öğretmenin Adı Soyadı (Örn: "Ahmet KARAAĞAÇ").
2. "lessonDictionary": Sayfa altındaki özet tablodan ders kodlarının açık adları sözlüğü:
   Örnek: { "S.2YDL": "SEÇMELİ ALMANCA", "S.ADB": "ADABI MUAŞERET", "BDN": "Beden Eğitimi" }
3. "totalWeeklyHours": Sayfa altındaki "Toplamlar" satırının en sağındaki nihai genel toplam "HS" (Haftalık Toplam Ders Saati) sayısı.
   KRİTİK UYARI: Rehberlik (REH, RHBYN), Destek Eğitimi / Hedef Temelli Destek Eğitimi (HEDEF, S.HEDEF, DESTEK), Sosyal Etkinlik, Proje gibi tüm dersler ve seçmeliler öğretmenin resmî haftalık ders saatidir ve toplama KESİNLİKLE DAHİLDİR! Örneğin bir öğretmenin 24 saat Fizik ve 3 saat Destek Eğitimi varsa "totalWeeklyHours" KESİNLİKLE 27'dir; asla sadece ana branşını sayarak 24 yazma!
4. "workloadSummary": Sayfa altındaki "Ders Dağılım ve Saat Çizelgesi" tablosundaki TÜM satırlar (Destek Eğitimi, Rehberlik ve Seçmeli dersler dahil!):
   - "className": Sınıf (Örn: "11/C" -> "11-C", "12/D" -> "12-D")
   - "lessonCode": Ders kodu (Örn: "BDN", "KLSAHL", "S.KMY")
   - "lessonName": Açık ders adı (Örn: "Beden Eğitimi", "Seçmeli Kimya")
   - "weeklyHours": "HS" sütunundaki haftalık toplam saat sayısı (Örn: 2, 4, 1)
   - "dailyHours": Gün sütunlarındaki ders saat sayıları (Örn: { "Salı": 2, "Cuma": 2 })
5. "grid": Günlere göre TAM 8 ELEMANLI SABİT DİZİLER:
   - DİKKAT: Pazartesi, Salı, Çarşamba, Perşembe, Cuma dizileri KESİNLİKLE 8'er elemandan oluşmalıdır!
   - 0. indeks = 1. Ders Saati (08:30)
   - 1. indeks = 2. Ders Saati (09:25)
   - 2. indeks = 3. Ders Saati (10:15)
   - 3. indeks = 4. Ders Saati (11:05)
   - 4. indeks = 5. Ders Saati (11:55)
   - 5. indeks = 6. Ders Saati (13:40)
   - 6. indeks = 7. Ders Saati (14:30)
   - 7. indeks = 8. Ders Saati (15:20)
   - Eğer bir saatte ders yoksa KESİNLİKLE boş metin "" koy! ASLA boş saatleri atlayıp diziyi 8'den kısa yapma!
    - 🚨 ÇOK ÖNEMLİ: KOMPLE BOŞ GÜN KURALI (BOŞ GÜNLERİ ASLA ATLAYIP KAYDIRMA!):
      * Bir öğretmenin bir veya birden fazla günü TAMAMEN BOŞ OLABİLİR (Örneğin Salı günü hiç dersi olmayabilir).
      * Tablonun solundaki gün etiketine bak: "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma".
      * Eğer bir günün satırındaki hücreler tamamen boşsa, o günün grid dizisi KESİNLİKLE 8 elemanlı boş dizi olmalıdır: ["", "", "", "", "", "", "", ""].
      * KESİNLİKLE boş günü görmezden gelip sonraki günün (örn: Çarşamba'nın) derslerini boş güne (Salı'ya) KAYDIRMA!
    - 🚨 CUMA ÖNCESİ İKİNCİ "Saat" SATIRI UYARISI:
      * Tablolarda Perşembe ile Cuma arasında Cuma ders saatleri farklı olduğu için araya tekrar "Saat" başlık satırı girer ("Saat 08:30 09:20...").
      * Bu satır bir ders veya gün DEĞİLDİR! Bu ara satırı atla; onun altındaki satır "Cuma" günüdür.
    - 🚨 ALT TABLO (workloadSummary.dailyHours) İLE ÇAPRAZ SAĞLAMA:
      * Sayfa altındaki "Ders Dağılım ve Saat Çizelgesi" tablosundaki gün sütunlarında öğretmenin hangi gün kaç saat dersi olduğu yazar.
      * Eğer alt tabloda o gün için toplam 0 saat yazıyorsa (örn: Salı sütunu boşsa), grid'deki o gün KESİNLİKLE ["", "", "", "", "", "", "", ""] olmalıdır.
   - Dolu saat için "Şube DersKodu" yaz (Örn: "9/D S.2YDL", "10/A CĞRFY", "12/F S.COĞ").
   - KRİTİK BLOK DERS KURALI: Eğer alt tablodaki "dailyHours" alanında o gün 2 saat yazıyorsa (örn: Salı 11/C için 2 saat Beden), grid'e KESİNLİKLE 2 SAAT peş peşe yazılmalıdır (Örn: 3. ve 4. saat)! Asla 1 saat yazıp sonraki öğretmeni erken saate kaydırma!
   - DİKKAT (SÜTUN HİZALAMASI): Tablonun en sağındaki son 2 sütunda bulunan dersler KESİNLİKLE 6. ve 7. indekse (7. ve 8. saat) denk gelir! Asla sabaha veya sola kaydırma!
`;
    jsonSchema += `  "teacherSchedules": [
    {
      "teacher": "Ahmet KARAAĞAÇ",
      "lessonDictionary": { "S.2YDL": "SEÇMELİ ALMANCA", "S.ADB": "ADABI MUAŞERET" },
      "totalWeeklyHours": 14,
      "workloadSummary": [
        {
          "className": "9-D",
          "lessonCode": "S.2YDL",
          "lessonName": "SEÇMELİ ALMANCA",
          "weeklyHours": 2,
          "dailyHours": { "Salı": 2 }
        }
      ],
      "grid": {
        "Pazartesi": ["", "", "", "", "", "", "", ""],
        "Salı": ["9/D S.2YDL", "9/D S.2YDL", "", "", "", "", "9/E S.2YDL", "9/E S.2YDL"],
        "Çarşamba": ["", "", "9/C S.ADB", "9/B S.ADB", "9/C S.2YDL", "9/C S.2YDL", "9/E S.ADB", "9/D S.ADB"],
        "Perşembe": ["", "", "", "", "", "", "", ""],
        "Cuma": ["9/A S.2YDL", "9/A S.2YDL", "9/B S.2YDL", "9/B S.2YDL", "", "9/A RHBYN", "9/A S.ADB", ""]
      }
    }
  ],\n`;
  } else {
    jsonSchema += '  "teacherSchedules": [],\n';
  }

  jsonSchema += '}';

  const prompt = `
Sen MEB okulları için veri ayıklayan yardımcı bir yapay zekasın.
${fastScanBanner}
Sana verilen belge okul çarşaf ders programı PDF'i veya görselidir.
${bookmarkHint}
${existingContextHint}

GÖREV TALİMATLARI:
${requestedSteps}

Aşağıdaki JSON şemasına BİREBİR uyarak sadece saf JSON üret:
${jsonSchema}
`;

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: resolvedMime,
    },
  };

  // Hesabın gerçekten erişebildiği modelleri öğren (404 alınan modelleri boşuna denememek için)
  let liveModels: string[] = [];
  try {
    const { fetchAvailableGeminiModels } = await import('../utils/geminiScheduleService');
    liveModels = await fetchAvailableGeminiModels(cleanApiKey);
  } catch (e) {
    console.warn(LOG, 'Canlı model listesi alınamadı:', e);
  }
  console.log(LOG, 'Canlı modeller:', liveModels.join(', ') || '(alınamadı)');

  // Bilinen 404/kullanımdan kalkan modeller
  const deprecatedModels = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ];

  // Kararlı ve hızlı modeller öncelik sırası (Google API'de şu an canlı ve test edilmiş olanlar)
  const preferredWorking = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-pro-latest',
  ];

  let initialModel = preferredModel;
  if (deprecatedModels.includes(initialModel)) {
    initialModel = 'gemini-flash-latest';
  }

  let candidateList = [initialModel, ...preferredWorking];
  if (liveModels.length > 0) {
    candidateList = candidateList.filter((m) => !deprecatedModels.includes(m) && (liveModels.includes(m) || m === initialModel));
    const extraLiveFlash = liveModels.filter((m) => m.includes('flash') && !deprecatedModels.includes(m) && !candidateList.includes(m));
    candidateList.push(...extraLiveFlash);
  }
  const modelsToTry = Array.from(new Set(candidateList.filter(Boolean))).slice(0, 4);
  
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║ 🚀 [ÇARŞAF AI] ÇARŞAF DERS PROGRAMI ANALİZİ BAŞLATILDI            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('[Çarşaf AI] Belge URI:', fileUri);
  console.log('[Çarşaf AI] MIME Türü:', resolvedMime);
  console.log('[Çarşaf AI] Base64 Boyutu:', `${Math.round(base64Data.length / 1024)} KB`);
  console.log('[Çarşaf AI] Tercih Edilen Model:', preferredModel);
  console.log('[Çarşaf AI] Sırayla Denenecek Modeller:', modelsToTry.join(' → '));
  console.log('[Çarşaf AI] Analiz Seçenekleri:', {
    öğretmenler: optTeachers,
    şubeler: optClasses,
    dersler: optLessons,
    zilSaatleri: optBellSchedule,
    haftalıkHücreler: optScheduleItems,
  });

  let lastError: any = null;
  let primaryError: any = null;
  const failures: string[] = [];

  for (const currentModel of modelsToTry) {
    if (options?.isCancelled?.()) {
      console.warn('[Çarşaf AI] Kullanıcı işlemi iptal etti.');
      throw new Error('Analiz kullanıcı tarafından iptal edildi.');
    }
    try {
      console.log(`\n[Çarşaf AI Model Deneniyor] >> ${currentModel} başlatılıyor...`);
      onModelChange?.(currentModel);
      onProgress?.(
        optScheduleItems
          ? `Gemini AI (${currentModel}) ile tüm haftalık ders programı taranıyor...`
          : `Gemini AI (${currentModel}) ile hızlı kadro, şube ve ders listesi taranıyor...`
      );
      const genConfig: any = {
        temperature: 0.1,
        maxOutputTokens: optScheduleItems ? 32768 : 8192,
        responseMimeType: 'application/json',
      };
      // Modellerde düşünme bütçesi (akıl yürütme): Tablo hücrelerini doğru okumak için makul bütçe
      if (!currentModel.toLowerCase().includes('lite')) {
        genConfig.thinkingConfig = { thinkingBudget: 1024 };
      }
      let model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: genConfig,
      });
      const t0 = Date.now();
      const timeoutMs = optScheduleItems ? 120000 : 40000;
      let timer: any;
      let cancelCheck: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Yapay zeka yanıt süresi (${Math.round(timeoutMs / 1000)} sn) aşıldı. Model (${currentModel}) yanıt vermedi.`));
        }, timeoutMs);
        if (options?.isCancelled) {
          cancelCheck = setInterval(() => {
            if (options.isCancelled?.()) {
              clearTimeout(timer);
              clearInterval(cancelCheck);
              reject(new Error('Analiz kullanıcı tarafından iptal edildi.'));
            }
          }, 300);
        }
      });

      let result: any;
      try {
        console.log(`[Çarşaf AI İstek] ${currentModel} modeline gönderildi (Zaman aşımı: ${timeoutMs / 1000}s, MaxTokens: ${genConfig.maxOutputTokens})...`);
        result = await Promise.race([model.generateContent([prompt, imagePart]), timeoutPromise]);
      } catch (genErr: any) {
        if (options?.isCancelled?.()) throw genErr;
        const genMsg = String(genErr?.message || '');
        if (genConfig.thinkingConfig && (genMsg.includes('thinkingConfig') || genMsg.includes('invalid argument') || genErr.status === 400)) {
          console.log(`[Çarşaf AI] ${currentModel} thinkingConfig parametresini desteklemedi, parametresiz yeniden deneniyor...`);
          delete genConfig.thinkingConfig;
          model = genAI.getGenerativeModel({ model: currentModel, generationConfig: genConfig });
          result = await Promise.race([model.generateContent([prompt, imagePart]), timeoutPromise]);
        } else if (genMsg.includes('503') || genMsg.includes('overloaded') || genMsg.includes('429')) {
          console.log(`[Çarşaf AI 503/429] ${currentModel} aşırı yoğunluk verdi, 2 sn sonra tekrar deneniyor...`);
          onProgress?.(`⚠️ Google sunucuları anlık yoğun (${currentModel}), tekrar deneniyor...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (options?.isCancelled?.()) throw new Error('Analiz kullanıcı tarafından iptal edildi.');
          try {
            result = await Promise.race([model.generateContent([prompt, imagePart]), timeoutPromise]);
          } catch (retryErr: any) {
            console.log(`[Çarşaf AI 503/429] ${currentModel} tekrar yoğunluk verdi, sıradaki yedek modele geçiliyor...`);
            throw retryErr;
          }
        } else {
          throw genErr;
        }
      } finally {
        if (timer) clearTimeout(timer);
        if (cancelCheck) clearInterval(cancelCheck);
      }

      onProgress?.(
        optScheduleItems
          ? 'Hücreler, saatler ve haftalık ders dağılım tablosu çözümleniyor...'
          : 'Öğretmen, şube ve ders listeleri ayıklanıyor...'
      );
      const textResponse = result.response.text().trim();
      const durationSec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[Çarşaf AI Başarılı Yanıt] ${currentModel} yanıt verdi!`);
      console.log(`  ⏱️ Geçen Süre: ${durationSec} sn`);
      console.log(`  📄 Yanıt Karakter Sayısı: ${textResponse.length}`);
      console.log(`  🏁 FinishReason: ${result.response.candidates?.[0]?.finishReason}`);
      console.log(`  🔍 Yanıtın İlk 300 Karakteri:\n${textResponse.slice(0, 300)}\n...`);

      onProgress?.(
        optScheduleItems
          ? 'Haftalık ders programı omurgası ve dağılım doğrulanıyor...'
          : 'Tespit edilen kadro, şube ve ders listeleri doğrulanıyor...'
      );
      const { data: parsedData, repaired } = parseJsonLenient(textResponse) as { data: ParsedScheduleResult; repaired: boolean };
      parsedData.teachers = parsedData.teachers || [];
      parsedData.classes = parsedData.classes || [];
      parsedData.lessons = parsedData.lessons || [];
      parsedData.scheduleItems = parsedData.scheduleItems || [];

      // 1. Yeni ve En Yüksek Doğruluklu Format: "teacherSchedules" (Her gün için 8 elemanlı sabit dizi)
      if (Array.isArray((parsedData as any).teacherSchedules) && (parsedData as any).teacherSchedules.length > 0) {
        const dayMap: Record<string, number> = {
          pazartesi: 1, pzt: 1, mon: 1, '1': 1,
          salı: 2, sali: 2, tue: 2, '2': 2,
          çarşamba: 3, carsamba: 3, çar: 3, car: 3, wed: 3, '3': 3,
          perşembe: 4, persembe: 4, prş: 4, prs: 4, thu: 4, '4': 4,
          cuma: 5, cum: 5, fri: 5, '5': 5,
          cumartesi: 6, ctesi: 6, sat: 6, '6': 6,
          pazar: 7, paz: 7, sun: 7, '7': 7,
        };

        const teacherVerifications: TeacherScheduleVerification[] = [];
        const lessonDetailsMap = new Map<string, ParsedLessonItemDetail>();

        for (const tSched of (parsedData as any).teacherSchedules) {
          const teacherName = String(tSched?.teacher || '').trim();
          if (!teacherName) continue;
          const dict: Record<string, string> = tSched?.lessonDictionary || {};
          const grid: Record<string, any[]> = tSched?.grid || {};
          const workloadSummary: TeacherWorkloadItem[] = Array.isArray(tSched?.workloadSummary) ? tSched.workloadSummary : [];
          const workloadSum = workloadSummary.reduce((sum, item) => sum + (Number(item.weeklyHours) || 0), 0);
          const expectedTotalWeeklyHours = Math.max(Number(tSched?.totalWeeklyHours) || 0, workloadSum);

          // Derslerin gerçek haftalık saatlerini topla (HS sütunundan)
          for (const wl of workloadSummary) {
            if (wl.lessonName) {
              const cleanName = wl.lessonName.trim();
              const existing = lessonDetailsMap.get(cleanName.toLowerCase());
              if (!existing || (wl.weeklyHours && (!existing.weeklyHours || wl.weeklyHours > existing.weeklyHours))) {
                lessonDetailsMap.set(cleanName.toLowerCase(), {
                  name: cleanName,
                  code: wl.lessonCode?.trim(),
                  weeklyHours: Number(wl.weeklyHours) > 0 ? Number(wl.weeklyHours) : undefined,
                  grade: wl.className ? wl.className.split('-')[0].split('/')[0] : undefined
                });
              }
            }
          }

          // ⚡ Akıllı Blok Tamamlama (Self-Healing Grid):
          // YALNIZCA kullanıcı özellikle talep ettiyse (options?.autoHealBlocks === true) çalıştırılır!
          // Çarşaf program 2 veya daha fazla kerede yüklendiğinde, öğretmenlerin eksik saatleri diğer sayfalarda
          // olabileceği için varsayılan olarak KAPALIDIR ve otomatik başlamaz.
          if (options?.autoHealBlocks) {
            const dayKeysConfig = [
              { name: 'Pazartesi', aliases: ['pazartesi', 'pzt', 'mon', '1'], dayNum: 1 },
              { name: 'Salı', aliases: ['salı', 'sali', 'tue', '2'], dayNum: 2 },
              { name: 'Çarşamba', aliases: ['çarşamba', 'carsamba', 'çar', 'car', 'wed', '3'], dayNum: 3 },
              { name: 'Perşembe', aliases: ['perşembe', 'persembe', 'prş', 'prs', 'thu', '4'], dayNum: 4 },
              { name: 'Cuma', aliases: ['cuma', 'cum', 'fri', '5'], dayNum: 5 },
            ];

            for (const dCfg of dayKeysConfig) {
              const matchingGridKey = Object.keys(grid).find(k => dCfg.aliases.some(a => k.toLowerCase().trim() === a || k.toLowerCase().trim().startsWith(a)));
              const periods = matchingGridKey ? grid[matchingGridKey] : null;
              if (!periods || !Array.isArray(periods)) continue;

              for (const wl of workloadSummary) {
                let expDayHours = 0;
                if (wl.dailyHours && typeof wl.dailyHours === 'object') {
                  const dayMatchKey = Object.keys(wl.dailyHours).find(k => dCfg.aliases.some(a => k.toLowerCase().trim() === a || k.toLowerCase().trim().startsWith(a)));
                  if (dayMatchKey) expDayHours = Number(wl.dailyHours[dayMatchKey]) || 0;
                }

                if (expDayHours > 1) {
                  const targetCls = (wl.className || '').replace(/[/.\s_]/g, '-').toUpperCase().trim();
                  const targetCode = (wl.lessonCode || '').trim().toUpperCase();

                  let foundIndices: number[] = [];
                  for (let idx = 0; idx < periods.length && idx < 8; idx++) {
                    const cell = String(periods[idx] || '').replace(/[/.\s_]/g, '-').toUpperCase();
                    if (cell.includes(targetCls) || (targetCode && cell.includes(targetCode))) {
                      foundIndices.push(idx);
                    }
                  }

                  if (foundIndices.length > 0 && foundIndices.length < expDayHours) {
                    const missing = expDayHours - foundIndices.length;
                    const lastIdx = foundIndices[foundIndices.length - 1];
                    const tokenToCopy = periods[lastIdx];

                    for (let m = 1; m <= missing; m++) {
                      const targetIdx = lastIdx + m;
                      if (targetIdx < 8) {
                        if (!periods[targetIdx] || String(periods[targetIdx]).trim() === '') {
                          periods[targetIdx] = tokenToCopy;
                          console.log(`[Çarşaf Blok Tamamlama] ⚡ ${teacherName} | ${dCfg.name} ${lastIdx + 1}. saatteki ${tokenToCopy} dersi, alttaki çizelgedeki ${expDayHours} saate göre ${targetIdx + 1}. saate blok tamamlandı.`);
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          // 🛡️ Çapraz Kontrol: Alt Resmi Çizelgedeki Günlük Saatler (dailyHours) ile Grid Doğrulaması
          // MEB çizelgelerinde bir öğretmenin bir günü (örn: Salı) tamamen boş olabilir.
          // Eğer alt çizelgedeki gün sütununda hiç saat yoksa (0 saat ise), ancak model üst ızgaradaki
          // bir sonraki günün (Çarşamba) derslerini bu boş güne kaydırdıysa, bu kaymayı tespit edip düzelt:
          const dayConfigs = [
            { dayNum: 1, name: 'Pazartesi', aliases: ['pazartesi', 'pzt', 'mon', '1'] },
            { dayNum: 2, name: 'Salı', aliases: ['salı', 'sali', 'tue', '2'] },
            { dayNum: 3, name: 'Çarşamba', aliases: ['çarşamba', 'carsamba', 'çar', 'car', 'wed', '3'] },
            { dayNum: 4, name: 'Perşembe', aliases: ['perşembe', 'persembe', 'prş', 'prs', 'thu', '4'] },
            { dayNum: 5, name: 'Cuma', aliases: ['cuma', 'cum', 'fri', '5'] },
          ];

          let hasSummaryDailyData = false;
          const expectedHoursPerDay: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

          for (const wl of workloadSummary) {
            if (wl.dailyHours && typeof wl.dailyHours === 'object') {
              for (const dCfg of dayConfigs) {
                const matchKey = Object.keys(wl.dailyHours).find(k =>
                  dCfg.aliases.some(a => k.toLowerCase().trim() === a || k.toLowerCase().trim().startsWith(a))
                );
                if (matchKey) {
                  const val = Number(wl.dailyHours[matchKey]) || 0;
                  if (val > 0) {
                    hasSummaryDailyData = true;
                    expectedHoursPerDay[dCfg.dayNum] += val;
                  }
                }
              }
            }
          }

          if (hasSummaryDailyData) {
            for (const dCfg of dayConfigs) {
              const matchingGridKey = Object.keys(grid).find(k =>
                dCfg.aliases.some(a => k.toLowerCase().trim() === a || k.toLowerCase().trim().startsWith(a))
              );
              if (!matchingGridKey || !Array.isArray(grid[matchingGridKey])) continue;

              const periods = grid[matchingGridKey];
              const filledLessons = periods.filter(p => String(p || '').trim() !== '');
              const expHours = expectedHoursPerDay[dCfg.dayNum];

              // Eğer bu gün alt çizelgede 0 saat ise ama grid'e ders yazılmışsa (örneğin Salı günü boşken Çarşamba dersleri yazılmışsa):
              if (expHours === 0 && filledLessons.length > 0) {
                console.warn(`[Çarşaf Sağlama] ⚠️ ${teacherName} | ${dCfg.name} günü alt çizelgede 0 SAAT (KOMPLE BOŞ) ancak ızgarada ${filledLessons.length} ders bulundu.`);

                // Bu derslerin asıl ait olduğu eksik günü (genellikle sonraki gün, örn: Çarşamba) bul:
                const deficientDay = dayConfigs.find(other => {
                  if (other.dayNum <= dCfg.dayNum) return false;
                  const otherKey = Object.keys(grid).find(k =>
                    other.aliases.some(a => k.toLowerCase().trim() === a || k.toLowerCase().trim().startsWith(a))
                  );
                  const otherPeriods = otherKey && Array.isArray(grid[otherKey]) ? grid[otherKey] : [];
                  const otherFilled = otherPeriods.filter(p => String(p || '').trim() !== '').length;
                  const otherExp = expectedHoursPerDay[other.dayNum];
                  return otherExp > otherFilled;
                });

                if (deficientDay) {
                  const defKey = Object.keys(grid).find(k =>
                    deficientDay.aliases.some(a => k.toLowerCase().trim() === a || k.toLowerCase().trim().startsWith(a))
                  ) || deficientDay.name;

                  if (!grid[defKey] || !Array.isArray(grid[defKey])) {
                    grid[defKey] = ['', '', '', '', '', '', '', ''];
                  }

                  console.log(`[Çarşaf Düzeltme] 🔄 ${teacherName} | Boş gün ${dCfg.name} üzerindeki ${filledLessons.length} ders, eksik olan ${deficientDay.name} gününe aktarılıyor.`);

                  // Boş olan deficientDay hücrelerine aktar
                  for (let h = 0; h < periods.length && h < 8; h++) {
                    const token = String(periods[h] || '').trim();
                    if (token) {
                      if (!grid[defKey][h] || String(grid[defKey][h]).trim() === '') {
                        grid[defKey][h] = token;
                      } else {
                        const emptyIdx = grid[defKey].findIndex((p: any) => String(p || '').trim() === '');
                        if (emptyIdx !== -1) {
                          grid[defKey][emptyIdx] = token;
                        }
                      }
                    }
                  }
                }

                // Boş olan günün tüm hücrelerini kesin olarak boşalt
                grid[matchingGridKey] = ['', '', '', '', '', '', '', ''];
              }
            }
          }

          // Grid'deki ders saatlerini topla
          let teacherExtractedHours = 0;
          for (const [dayKey, periods] of Object.entries(grid)) {
            const dayNum = dayMap[dayKey.toLowerCase().trim()] || 1;
            if (!Array.isArray(periods)) continue;

            for (let h = 0; h < periods.length && h < 8; h++) {
              const cellText = String(periods[h] || '').trim();
              if (!cellText) continue;

              const hourNum = h + 1; // 1'den 8'e kadar KESİN ders saati!

              // Hücre içeriğini ayır: "9/D S.2YDL" veya "10-A CĞRFY"
              const tokens = cellText.split(/\s+/).filter(Boolean);
              let clsStr = tokens[0] || '';
              let codeStr = tokens.slice(1).join(' ') || '';

              const cleanCls = String(clsStr || '').replace(/[/.\s_]/g, '-').trim();
              const parts = cleanCls.split('-');
              const grade = parts[0] || '';
              const section = parts.slice(1).join('-') || '';

              // Açık ders adı sözlükten veya koddan
              const fullLesson = dict[codeStr] || dict[codeStr.toUpperCase()] || codeStr || 'Ders';

              parsedData.scheduleItems.push({
                teacherName,
                grade,
                section,
                lessonName: fullLesson.trim(),
                lessonCode: codeStr ? codeStr.trim() : undefined,
                dayOfWeek: dayNum,
                lessonHour: hourNum,
                classroom: cleanCls,
              });
              teacherExtractedHours++;
            }
          }

          teacherVerifications.push({
            teacherName,
            expectedWeeklyHours: expectedTotalWeeklyHours > 0 ? expectedTotalWeeklyHours : undefined,
            extractedWeeklyHours: teacherExtractedHours,
            isConsistent: expectedTotalWeeklyHours > 0 ? (expectedTotalWeeklyHours === teacherExtractedHours) : true,
            workloadItems: workloadSummary
          });
        }

        parsedData.teacherVerifications = teacherVerifications;
        parsedData.lessonDetails = Array.from(lessonDetailsMap.values());
      }

      // 2. Fallback: Model compact "items" dizisi formatında yanıt verdiyse dönüştür
      if (Array.isArray((parsedData as any).items) && (parsedData as any).items.length > 0) {
        for (const row of (parsedData as any).items) {
          if (Array.isArray(row)) {
            let tName = row[0];
            let clsStr = row[1];
            let lName = row[2];
            let lCode: string | undefined = undefined;
            let day = 1;
            let hour = 1;
            let room: string | undefined = undefined;

            if (typeof row[3] === 'number') {
              // 5 elemanlı: [tName, clsStr, lName, day, hour, room]
              day = row[3];
              hour = row[4];
              room = row[5];
            } else {
              // 6+ elemanlı: [tName, clsStr, lName, lCode, day, hour, room]
              lCode = row[3];
              day = row[4];
              hour = row[5];
              room = row[6];
            }

            const cleanCls = String(clsStr || '').replace(/[/.\s_]/g, '-').trim();
            const parts = cleanCls.split('-');
            const grade = parts[0] || '';
            const section = parts.slice(1).join('-') || '';
            parsedData.scheduleItems.push({
              teacherName: String(tName || '').trim(),
              grade,
              section,
              lessonName: String(lName || '').trim(),
              lessonCode: lCode ? String(lCode).trim() : undefined,
              dayOfWeek: Number(day) || 1,
              lessonHour: Number(hour) || 1,
              classroom: room ? String(room).trim() : cleanCls,
            });
          } else if (typeof row === 'object' && row !== null) {
            parsedData.scheduleItems.push(row);
          }
        }
      }

      console.log(`[Çarşaf AI JSON Parse Başarılı] (Onarıldı mı: ${repaired ? 'EVET' : 'HAYIR'})`);
      console.log(`  👨‍🏫 Öğretmen Sayısı: ${parsedData.teachers.length}`);
      console.log(`  🏫 Şube Sayısı: ${parsedData.classes.length}`);
      console.log(`  📚 Ders Sayısı: ${parsedData.lessons.length}`);
      console.log(`  📅 Program Satırı Sayısı: ${parsedData.scheduleItems.length}`);

      // Eğer kullanıcı program hücrelerini istemediyse kesinlikle boşalt (hızlı mod garantisi)
      if (!optScheduleItems) {
        parsedData.scheduleItems = [];
        parsedData.bellSchedule = [];
      }
      if (!optTeachers) {
        parsedData.teachers = [];
      }
      if (!optClasses) {
        parsedData.classes = [];
      }
      if (!optLessons) {
        parsedData.lessons = [];
      }

      // --- VERİ GÜVENLİĞİ VE BİRLEŞTİRME (POST-PROCESSING) ---

      // 0. Öğretmen isimlerini temizleme yardımcı fonksiyonu
      const cleanTeacherTitle = (raw: string): string => {
        return raw
          .replace(/^(?:sayın|sayin|sn\.?|öğretmen|ogretmen|öğr\.?|ogr\.?)\s*[:\-]?\s*/i, '')
          .replace(/\s*[-–]\s*(?:matematik|fizik|kimya|biyoloji|edebiyat|tarih|coğrafya|ingilizce|din|felsefe|beden|müzik|resim|bilişim|rehberlik)?\s*(?:öğretmeni|ogretmeni)?$/i, '')
          .trim();
      };

      parsedData.teachers = (parsedData.teachers || [])
        .map(cleanTeacherTitle)
        .filter((t) => t.length >= 2 && !t.toLowerCase().includes('çarşaf') && !t.toLowerCase().includes('programı'));

      // 1. PDF Bookmarklarından gelen öğretmenleri ekle (AI atladıysa)
      if (extractedBookmarks.length > 0) {
        for (const t of extractedBookmarks) {
          const cleanT = cleanTeacherTitle(t);
          if (!parsedData.teachers.some((existing) => existing.toLowerCase() === cleanT.toLowerCase())) {
            parsedData.teachers.push(cleanT);
          }
        }
      }

      // 2. scheduleItems içindeki öğretmenleri teachers listesine ekle
      for (const item of parsedData.scheduleItems || []) {
        if (item.teacherName) {
          item.teacherName = cleanTeacherTitle(item.teacherName);
          if (!parsedData.teachers.some((t) => t.toLowerCase() === item.teacherName.toLowerCase())) {
            parsedData.teachers.push(item.teacherName);
          }
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
      parsedData.classes = Array.from(new Set(parsedData.classes || [])).sort();
      parsedData.lessons = Array.from(new Set(parsedData.lessons || [])).sort();
      parsedData.scheduleItems = Array.isArray(parsedData.scheduleItems) ? parsedData.scheduleItems : [];
      parsedData.bellSchedule = Array.isArray(parsedData.bellSchedule) ? parsedData.bellSchedule : [];

      // Total okul kotasına bildir
      try {
        const { recordGeminiApiUsage } = await import('../utils/geminiScheduleService');
        const estimatedTokens = result.response?.usageMetadata?.totalTokenCount || Math.max(4500, Math.round((textResponse.length + 3000) / 3));
        await recordGeminiApiUsage(currentModel, result.response?.usageMetadata, schoolId, estimatedTokens);
      } catch (usageErr) {
        console.warn(LOG, 'Kullanım kotası bildirilemedi:', usageErr);
      }

      console.log('══════════════════ [ÇARŞAF AI ANALİZİ TAMAMLANDI] ══════════════════\n');
      onProgress?.('Ayrıştırma başarıyla tamamlandı!');

      const finalResult: ParsedScheduleResult = {
        teachers: parsedData.teachers,
        classes: parsedData.classes,
        lessons: parsedData.lessons,
        lessonDetails: parsedData.lessonDetails || [],
        bellSchedule: parsedData.bellSchedule,
        scheduleItems: parsedData.scheduleItems,
        teacherVerifications: parsedData.teacherVerifications || [],
      };

      // Telefondaki yerel dosyada döküm stack'i olarak sakla
      await saveParsedScheduleToCache(finalResult);

      return finalResult;
    } catch (err: any) {
      if (!primaryError) {
        primaryError = err;
      }
      lastError = err;
      console.error(`[Çarşaf AI Model HATA] >> ${currentModel} başarısız oldu:`, {
        mesaj: err?.message || err,
        stack: err?.stack,
      });
      const short = String(err?.message || 'Bilinmeyen hata').replace(/\s+/g, ' ').slice(0, 160);
      failures.push(`• ${currentModel}: ${short}`);
      onProgress?.(`⚠️ ${currentModel} yanıt veremedi. Yedek model deneniyor...`);
    }
  }

  const errToReport = primaryError || lastError;
  const errMsg = errToReport?.message || 'Bilinmeyen hata';
  const detail = failures.length ? `\n\nDenenen modeller:\n${failures.join('\n')}` : '';
  console.error('[Çarşaf AI Genel HATA]:', errMsg, detail);

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

  const teachersList = parsed.teachers || [];
  const classesList = parsed.classes || [];
  const lessonsList = parsed.lessons || [];
  const rawScheduleItems = parsed.scheduleItems || [];

  const syncItems = rawScheduleItems.map((item) => ({
    teacherName: item.teacherName,
    dayOfWeek: item.dayOfWeek,
    lessonHour: item.lessonHour,
    grade: item.grade,
    section: item.section,
    lessonName: item.lessonName,
    lessonCode: item.lessonCode,
    classroom: item.classroom,
  }));

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║ 💾 [ÇARŞAF KAYIT] DERS PROGRAMI SUNUCUYA AKTARILIYOR              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('[Çarşaf Kayıt] Hedef Okul ID:', schoolId);
  console.log('[Çarşaf Kayıt] Mod (Mevcutları Sil & Sıfırdan Yaz):', opts.overwriteAll);
  console.log('[Çarşaf Kayıt] Gönderilen Öğretmen Sayısı:', teachersList.length);
  console.log('[Çarşaf Kayıt] Gönderilen Şube Sayısı:', classesList.length);
  console.log('[Çarşaf Kayıt] Gönderilen Ders Sayısı:', lessonsList.length);
  console.log('[Çarşaf Kayıt] Gönderilen Ders Program Saati:', syncItems.length);

  const res = await apiRequest<any>('sync/schedules/batch', 'POST', {
    schoolId,
    overwriteAll: opts.overwriteAll,
    syncTeachers: opts.syncTeachers,
    syncClasses: opts.syncClasses,
    syncLessons: opts.syncLessons,
    syncSchedules: opts.syncSchedules,
    teachers: teachersList,
    classes: classesList,
    lessons: lessonsList,
    lessonDetails: parsed.lessonDetails || [],
    schedules: syncItems,
  });

  console.log('[Çarşaf Kayıt Sunucu Yanıtı]:', res);

  if (res.success) {
    console.log('[Çarşaf Kayıt BAŞARILI 🎉]:', res.data?.message);
    return {
      success: true,
      message: res.data?.message || (opts.overwriteAll
        ? `Tüm okul ders programı sıfırlanıp yeniden kaydedildi.`
        : `Ders programı başarıyla güncellendi.`),
      data: res.data,
    };
  }

  console.error('[Çarşaf Kayıt BAŞARISIZ ❌]:', res.error);
  return {
    success: false,
    message: res.error || 'Ders programı sunucuya kaydedilemedi.',
  };
}

const SCHEDULE_CACHE_DIR = `${FileSystem.documentDirectory}schedule_cache/`;
const SCHEDULE_CACHE_FILE = `${SCHEDULE_CACHE_DIR}latest_parsed_schedule.json`;

/**
 * AI tarafından çözümlenen ham ders programı yığınını (stack) telefonda yerel JSON dosyasında saklar.
 */
export async function saveParsedScheduleToCache(data: ParsedScheduleResult): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(SCHEDULE_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(SCHEDULE_CACHE_DIR, { intermediates: true });
    }
    await FileSystem.writeAsStringAsync(SCHEDULE_CACHE_FILE, JSON.stringify(data, null, 2));
    console.log('[Çarşaf AI Cache] Ayrıştırılan veriler telefondaki yerel dosyaya kaydedildi:', SCHEDULE_CACHE_FILE);
  } catch (err) {
    console.warn('[Çarşaf AI Cache Hata]:', err);
  }
}

/**
 * Telefonda saklanan son AI analiz verisini (stack dökümünü) okur.
 */
export async function getCachedParsedSchedule(): Promise<ParsedScheduleResult | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(SCHEDULE_CACHE_FILE);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(SCHEDULE_CACHE_FILE);
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[Çarşaf AI Cache Okuma Hata]:', err);
  }
  return null;
}

/**
 * Birden fazla parça halinde okunan çarşaf program sonuçlarını
 * hiçbir veriyi ezmeden, uydurma yapmadan tek bir nihai sonuca birleştirir.
 */
export function mergeScheduleBatches(batches: ScheduleBatchItem[]): ParsedScheduleResult {
  const mergedTeachers = new Set<string>();
  const mergedClasses = new Set<string>();
  const mergedLessons = new Set<string>();
  const lessonDetailsMap = new Map<string, ParsedLessonItemDetail>();
  let bellSchedule: Array<{ period: number; time: string }> = [];

  // scheduleItems: key = `${teacherName.toLowerCase()}_${dayOfWeek}_${lessonHour}`
  // Aynı öğretmenin aynı saati güncellenir, farklı öğretmenler veya paralel dersler asla ezilmez!
  const scheduleItemsMap = new Map<string, ParsedScheduleResult['scheduleItems'][0]>();
  const verificationsMap = new Map<string, TeacherScheduleVerification>();

  for (const batch of batches) {
    const data = batch.data;
    if (!data) continue;

    (data.teachers || []).forEach((t) => mergedTeachers.add(t));
    (data.classes || []).forEach((c) => mergedClasses.add(c));
    (data.lessons || []).forEach((l) => mergedLessons.add(l));

    (data.lessonDetails || []).forEach((ld) => {
      if (ld.name) lessonDetailsMap.set(ld.name.toLowerCase(), ld);
    });

    if (bellSchedule.length === 0 && (data.bellSchedule || []).length > 0) {
      bellSchedule = data.bellSchedule!;
    }

    (data.scheduleItems || []).forEach((item) => {
      if (!item || !item.teacherName) return;
      const key = `${item.teacherName.trim().toLowerCase()}_${item.dayOfWeek}_${item.lessonHour}`;
      scheduleItemsMap.set(key, item);
    });

    (data.teacherVerifications || []).forEach((tv) => {
      if (!tv || !tv.teacherName) return;
      const key = tv.teacherName.trim().toLowerCase();
      verificationsMap.set(key, tv);
    });
  }

  return {
    teachers: Array.from(mergedTeachers).sort(),
    classes: Array.from(mergedClasses).sort(),
    lessons: Array.from(mergedLessons).sort(),
    lessonDetails: Array.from(lessonDetailsMap.values()),
    bellSchedule,
    scheduleItems: Array.from(scheduleItemsMap.values()),
    teacherVerifications: Array.from(verificationsMap.values()),
  };
}

const BATCH_STORAGE_KEY_PREFIX = 'carsaf_schedule_batches_';

/**
 * Parça havuzunu yerel depolamada saklar
 */
export async function saveScheduleBatchesToStorage(
  schoolId: string,
  batches: ScheduleBatchItem[]
): Promise<void> {
  try {
    const key = `${BATCH_STORAGE_KEY_PREFIX}${schoolId}`;
    await AsyncStorage.setItem(key, JSON.stringify(batches));
    console.log(`[Çarşaf Havuz] ${batches.length} parça yerel depolamaya saklandı.`);
  } catch (e) {
    console.warn('[Çarşaf Havuz Kayıt Hata]:', e);
  }
}

/**
 * Parça havuzunu yerel depolamadan getirir
 */
export async function loadScheduleBatchesFromStorage(
  schoolId: string
): Promise<ScheduleBatchItem[]> {
  try {
    const key = `${BATCH_STORAGE_KEY_PREFIX}${schoolId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Çarşaf Havuz Yükleme Hata]:', e);
  }
  return [];
}

/**
 * Parça havuzunu temizler
 */
export async function clearScheduleBatchesFromStorage(schoolId: string): Promise<void> {
  try {
    const key = `${BATCH_STORAGE_KEY_PREFIX}${schoolId}`;
    await AsyncStorage.removeItem(key);
    console.log('[Çarşaf Havuz] Depolama temizlendi.');
  } catch (e) {
    console.warn('[Çarşaf Havuz Temizleme Hata]:', e);
  }
}

const CACHED_FILE_KEY_PREFIX = 'carsaf_cached_doc_';
const DRAFT_SCHEDULE_KEY_PREFIX = 'carsaf_parsed_draft_';

export interface CachedScheduleDocInfo {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
  totalPages?: number;
  updatedAt: number;
}

/**
 * Son yüklenen çarşaf belgesini (PDF/Görsel) okul bazında önbelleğe saklar
 */
export async function saveCachedScheduleFile(schoolId: string, docInfo: CachedScheduleDocInfo): Promise<void> {
  try {
    const key = `${CACHED_FILE_KEY_PREFIX}${schoolId}`;
    await AsyncStorage.setItem(key, JSON.stringify(docInfo));
    console.log(`[Çarşaf Önbellek] Belge saklandı: ${docInfo.name}`);
  } catch (e) {
    console.warn('[Çarşaf Belge Saklama Hata]:', e);
  }
}

/**
 * Son yüklenen çarşaf belgesi meta verisini getirir
 */
export async function loadCachedScheduleFile(schoolId: string): Promise<CachedScheduleDocInfo | null> {
  try {
    const key = `${CACHED_FILE_KEY_PREFIX}${schoolId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Çarşaf Belge Yükleme Hata]:', e);
  }
  return null;
}

/**
 * Önbellekteki belge kaydını temizler
 */
export async function clearCachedScheduleFile(schoolId: string): Promise<void> {
  try {
    const key = `${CACHED_FILE_KEY_PREFIX}${schoolId}`;
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn('[Çarşaf Belge Temizleme Hata]:', e);
  }
}

/**
 * Son ayrıştırılan çarşaf program taslağını yerel hafızaya saklar
 */
export async function saveParsedScheduleDraft(schoolId: string, draft: ParsedScheduleResult): Promise<void> {
  try {
    const key = `${DRAFT_SCHEDULE_KEY_PREFIX}${schoolId}`;
    await AsyncStorage.setItem(key, JSON.stringify(draft));
    console.log('[Çarşaf Taslak] Ayrıştırılan son program taslak olarak saklandı.');
  } catch (e) {
    console.warn('[Çarşaf Taslak Saklama Hata]:', e);
  }
}

/**
 * Son ayrıştırılan çarşaf program taslağını hafızadan getirir
 */
export async function loadParsedScheduleDraft(schoolId: string): Promise<ParsedScheduleResult | null> {
  try {
    const key = `${DRAFT_SCHEDULE_KEY_PREFIX}${schoolId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Çarşaf Taslak Yükleme Hata]:', e);
  }
  return null;
}

/**
 * Çarşaf program taslağını temizler
 */
export async function clearParsedScheduleDraft(schoolId: string): Promise<void> {
  try {
    const key = `${DRAFT_SCHEDULE_KEY_PREFIX}${schoolId}`;
    await AsyncStorage.removeItem(key);
    console.log('[Çarşaf Taslak] Taslak temizlendi.');
  } catch (e) {
    console.warn('[Çarşaf Taslak Temizleme Hata]:', e);
  }
}
