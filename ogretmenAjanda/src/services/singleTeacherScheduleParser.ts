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
Sen bir okul ders programı ve çizelge OCR uzmanısın.
Ekteki görsel/belge "${teacherName}" adlı öğretmenin bireysel haftalık ders programıdır.

GÖREVİN:
Bu öğretmenin Pazartesi, Salı, Çarşamba, Perşembe ve Cuma günlerine ait ders saatlerini eksiksiz oku.
Her ders hücresinde hangi gün, kaçıncı saat, hangi sınıfa (Örn: 9-A, 10-B, 11/C) ve hangi derse (Örn: Matematik, Fizik, Biyoloji) girdiği yazar.

DİKKAT EDİLECEK KURALLAR:
1. "dayOfWeek" değerleri: 1 (Pazartesi), 2 (Salı), 3 (Çarşamba), 4 (Perşembe), 5 (Cuma). Hafta sonu varsa 6 (Cumartesi), 7 (Pazar).
2. "lessonHour" değerleri: 1, 2, 3, 4, 5, 6, 7, 8... (Ders saati).
3. "grade" ve "section" değerlerini ayır. Örneğin "10-C" için grade="10", section="C". Sadece kademe varsa grade="10", section="A" yap.
4. "lessonName": Okutulan dersin adı (Örn: Matematik). Boş saatler için kayıt oluşturma.
5. "classroom": Varsa derslik veya atölye adı.

Aşağıdaki JSON şemasında yanıt ver:
{
  "teacherName": "${teacherName}",
  "totalHours": 24,
  "classes": ["9-A", "10-B"],
  "lessons": ["Matematik", "Geometri"],
  "items": [
    {
      "teacherName": "${teacherName}",
      "dayOfWeek": 1,
      "lessonHour": 1,
      "grade": "9",
      "section": "A",
      "lessonName": "Matematik",
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
  dayOfWeek?: number;
  lessonHour?: number;
}): Promise<{ success: boolean; message: string }> {
  const query = new URLSearchParams({
    schoolId: params.schoolId,
    ...(params.id ? { id: params.id } : {}),
    ...(params.grade ? { grade: params.grade } : {}),
    ...(params.section ? { section: params.section } : {}),
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
