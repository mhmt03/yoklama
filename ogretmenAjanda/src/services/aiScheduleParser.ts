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
 * Gemini AI ile çarşaf ders programı PDF veya görselini analiz ederek
 * okulun tüm öğretmen, sınıf, ders ve program omurgasını çıkarır.
 */
export async function parseMasterScheduleWithAi(
  fileUri: string,
  apiKey: string,
  mimeType = 'image/jpeg'
): Promise<ParsedScheduleResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  // En güncel ve görsel anlama yeteneği yüksek model
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Dosyayı base64 oku
  const base64Data = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

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
      mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const textResponse = result.response.text().trim();

  // JSON temizleme (olası markdown backticklerini temizle)
  const cleanJson = textResponse.replace(/^```json/i, '').replace(/```$/i, '').trim();
  const parsedData: ParsedScheduleResult = JSON.parse(cleanJson);

  return parsedData;
}

/**
 * Ayrıştırılan çarşaf programı sunucuya atomik olarak gönderir
 */
export async function saveMasterScheduleToServer(
  schoolId: string,
  parsed: ParsedScheduleResult
): Promise<{ success: boolean; message: string }> {
  const syncItems = parsed.scheduleItems.map((item) => ({
    teacherName: item.teacherName,
    dayOfWeek: item.dayOfWeek,
    lessonHour: item.lessonHour,
    grade: item.grade,
    section: item.section,
    lessonName: item.lessonName,
    classroom: item.classroom,
  }));

  const res = await apiRequest('sync/schedules/batch', 'POST', {
    schoolId,
    schedules: syncItems,
  });

  if (res.success) {
    return {
      success: true,
      message: `Tüm okul ders programı, ${parsed.teachers.length} öğretmen ve ${parsed.classes.length} sınıf başarıyla kaydedildi.`,
    };
  }

  return {
    success: false,
    message: res.error || 'Ders programı sunucuya kaydedilemedi.',
  };
}
