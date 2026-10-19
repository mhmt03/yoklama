import { GoogleGenerativeAI } from '@google/generative-ai';
import { readUriAsBase64 } from './aiScheduleParser';
import { apiRequest } from './apiClient';
import {
  DEFAULT_GEMINI_API_KEY,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
  getGeminiModel,
  recordGeminiApiUsage,
} from '../utils/geminiScheduleService';

export interface SingleTeacherScheduleItem {
  teacherName: string;
  dayOfWeek: number; // 1: Pazartesi, 2: Salı, 3: Çarşamba, 4: Perşembe, 5: Cuma
  lessonHour: number; // 1..8
  grade: string; // 9, 10, 11...
  section: string; // A, B, C...
  lessonName: string;
  lessonCode?: string; // MTMTK, S.MTMK, RHBYN vb.
  classroom?: string;
}

export interface SingleTeacherParseResult {
  teacherName: string;
  totalHours: number;
  classes: string[];
  lessons: string[];
  items: SingleTeacherScheduleItem[];
  rawSummary?: string;
}

/**
 * Tek bir öğretmenin haftalık ders programı fotoğrafını veya PDF/Word belgesini
 * Gemini AI ile analiz ederek saat saat ders dağılımını çıkarır.
 */
export async function parseSingleTeacherScheduleWithAi(
  fileUri: string,
  mimeType: string,
  teacherName: string,
  customApiKey?: string,
  customModel?: string
): Promise<SingleTeacherParseResult> {
  const activeKey = customApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY;
  const activeModelName = customModel || (await getGeminiModel()) || DEFAULT_GEMINI_MODEL;

  if (!activeKey) {
    throw new Error('Gemini API anahtarı bulunamadı.');
  }

  // Base64 formatına çevir
  const base64Data = await readUriAsBase64(fileUri);

  const genAI = new GoogleGenerativeAI(activeKey);
  const model = genAI.getGenerativeModel({
    model: activeModelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const prompt = `
Sen bir MEB okul ders programı ve çizelge OCR uzmanısın.
Ekteki görsel/belge "${teacherName}" adlı öğretmenin bireysel haftalık ders programıdır.

GÖREVİN:
Bu öğretmenin Pazartesi, Salı, Çarşamba, Perşembe ve Cuma günlerine ait ders saatlerini eksiksiz oku.

TABLO VE HÜCRE YAPISI (ÇOK ÖNEMLİ):
1. TABLO HÜCRELERİNDE İKİ SATIR METİN BULUNUR:
   - ÜST SATIR: Sınıf ve Şube (Örn: "9/E", "11/D", "10/A", "12/B").
   - ALT SATIR: Dersin Kısaltma Kodu (Örn: "MTMTK", "S.MTMK", "RHBYN", "FZK", "TRH").
2. DERS KODLARI VE AÇIK DERS ADLARI:
   - Sayfanın altında veya yanındaki ders dağılım tablosunda ders kodlarının açık adları ve haftalık saatleri yazar:
     Örnek: "MTMTK" -> "Matematik", "S.MTMK" -> "Seçmeli Matematik", "RHBYN" -> "Rehberlik ve Yönlendirme".
   - "lessonCode" alanına hücredeki kısa kodu yaz (Örn: "MTMTK", "S.MTMK").
   - "lessonName" alanına bu kodun açık ders adını yaz (Örn: "Matematik", "Seçmeli Matematik").
3. ÇİFT KONTROL MEKANİZMASI:
   - Bir hücre doluysa hem Sınıf (9/E) hem Ders Kodu (MTMTK) birlikte yer alır. Her ikisini de oku.
   - Boş hücreler öğretmenin dersinin olmadığı saatlerdir; boş hücreler için kayıt oluşturma.
   - Öğretmenin haftalık toplam ders saati (totalHours), alttaki tablodaki saatlerin toplamıyla birebir eşit olmalıdır. Destek Eğitimi, Rehberlik gibi dersler de toplama dahildir (Örn: 24 saat Fizik + 3 saat Destek = 27 saat).

DİKKAT EDİLECEK KURALLAR:
1. "dayOfWeek" değerleri: 1 (Pazartesi), 2 (Salı), 3 (Çarşamba), 4 (Perşembe), 5 (Cuma). Hafta sonu varsa 6 (Cumartesi), 7 (Pazar).
2. "lessonHour" değerleri: 1, 2, 3, 4, 5, 6, 7, 8... (Ders saati).
3. "grade" ve "section" değerlerini ayır. Örneğin "9/E" için grade="9", section="E". "11-D" için grade="11", section="D".
4. "classroom": Varsa derslik veya atölye adı.

Aşağıdaki JSON şemasında yanıt ver:
{
  "teacherName": "${teacherName}",
  "totalHours": 24,
  "classes": ["9-E", "11-D"],
  "lessons": ["Matematik", "Seçmeli Matematik"],
  "items": [
    {
      "teacherName": "${teacherName}",
      "dayOfWeek": 1,
      "lessonHour": 1,
      "grade": "9",
      "section": "E",
      "lessonName": "Matematik",
      "lessonCode": "MTMTK",
      "classroom": ""
    }
  ]
}
`;

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Data,
        mimeType: mimeType || 'image/jpeg',
      },
    },
    prompt,
  ]);

  const responseText = result.response.text();
  const usageMetadata = result.response.usageMetadata;
  await recordGeminiApiUsage(activeModelName, usageMetadata);

  try {
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      teacherName: parsed.teacherName || teacherName,
      totalHours: parsed.items ? parsed.items.length : 0,
      classes: parsed.classes || [],
      lessons: parsed.lessons || [],
      items: (parsed.items || []).map((it: any) => ({
        teacherName: it.teacherName || teacherName,
        dayOfWeek: Number(it.dayOfWeek) || 1,
        lessonHour: Number(it.lessonHour) || 1,
        grade: String(it.grade || '').trim(),
        section: String(it.section || '').trim().toUpperCase(),
        lessonName: String(it.lessonName || '').trim(),
        lessonCode: it.lessonCode ? String(it.lessonCode).trim() : undefined,
        classroom: it.classroom ? String(it.classroom).trim() : undefined,
      })),
      rawSummary: `${parsed.items?.length || 0} ders saati tespit edildi.`,
    };
  } catch (err: any) {
    throw new Error('Gemini yanıtı JSON olarak ayrıştırılamadı: ' + err.message);
  }
}

/**
 * Tek bir öğretmenin programını sunucuda tamamen yeniler (diğer öğretmenlere dokunmaz).
 */
export async function saveTeacherScheduleToServer(
  schoolId: string,
  teacherName: string,
  schedules: SingleTeacherScheduleItem[]
): Promise<{ success: boolean; message: string }> {
  const res = await apiRequest<any>('sync/schedules/teacher-replace', 'POST', {
    schoolId,
    teacherName,
    schedules,
  });
  return {
    success: res.success,
    message: res.data?.message || res.error || (res.success ? 'Öğretmen programı başarıyla güncellendi.' : 'Hata oluştu.'),
  };
}

/**
 * Tek bir ders hücresini sunucuda günceller veya ekler (İnteraktif Program Düzenleyici için).
 */
export async function saveSingleScheduleItemToServer(payload: {
  id?: string;
  schoolId: string;
  teacherName?: string;
  dayOfWeek: number;
  lessonHour: number;
  grade: string;
  section: string;
  lessonName: string;
  lessonCode?: string;
  classroom?: string;
}): Promise<{ success: boolean; message: string; item?: any }> {
  const res = await apiRequest<any>('sync/schedules/item', 'POST', payload);
  return {
    success: res.success,
    message: res.data?.message || res.error || (res.success ? 'Ders hücresi kaydedildi.' : 'Hata oluştu.'),
    item: res.data?.item,
  };
}

/**
 * Tek bir ders hücresini sunucudan siler / boşaltır.
 */
export async function deleteSingleScheduleItemFromServer(params: {
  schoolId: string;
  id?: string;
  grade?: string;
  section?: string;
  teacherName?: string;
  dayOfWeek?: number;
  lessonHour?: number;
}): Promise<{ success: boolean; message: string }> {
  const query = new URLSearchParams({
    schoolId: params.schoolId,
    ...(params.id ? { id: params.id } : {}),
    ...(params.grade ? { grade: params.grade } : {}),
    ...(params.section ? { section: params.section } : {}),
    ...(params.teacherName ? { teacherName: params.teacherName } : {}),
    ...(params.dayOfWeek !== undefined ? { dayOfWeek: String(params.dayOfWeek) } : {}),
    ...(params.lessonHour !== undefined ? { lessonHour: String(params.lessonHour) } : {}),
  }).toString();

  const res = await apiRequest<any>(`sync/schedules/item?${query}`, 'DELETE');
  return {
    success: res.success,
    message: res.data?.message || res.error || (res.success ? 'Ders hücresi silindi.' : 'Hata oluştu.'),
  };
}

/**
 * Okul ders programı doluluk, eksik saatler ve çakışma denetim istatistiklerini getirir.
 */
export async function fetchScheduleIntegrityStats(
  schoolId: string,
  dailyHours: number = 8
): Promise<{ success: boolean; data?: any; error?: string }> {
  return await apiRequest(`sync/schedules/stats?schoolId=${schoolId}&dailyHours=${dailyHours}`, 'GET');
}
