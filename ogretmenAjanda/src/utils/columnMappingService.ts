import * as XLSX from 'xlsx';
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { ParsedYearlyPlanRow } from './excelService';
import { extractTableRowsFromDocx } from './docxPlanService';
import { getGeminiApiKey, getGeminiModel, recordGeminiApiUsage } from './geminiScheduleService';

export interface RawColumnInfo {
  index: number;
  headerName: string;
  sampleValues: string[];
}

export interface ColumnMappingSelection {
  topicColIndex: number | null;
  outcomesColIndex: number | null;
  dateColIndex: number | null;
  weekColIndex: number | null;
  hoursColIndex: number | null;
}

export interface DocumentAnalysisResult {
  fileName: string;
  fileType: 'excel' | 'docx';
  rawRows: any[][];
  headerRowIndex: number;
  columns: RawColumnInfo[];
  suggestedMapping: ColumnMappingSelection;
  aiReason?: string;
}

/**
 * Türkçe tarih aralıklarını (örn: "09.09.2024 - 13.09.2024" veya "16-20 Eylül 2024") YYYY-AA-GG formatına çevirir.
 */
export const parseTurkishDateRange = (
  rawDateStr: string,
  defaultYear: number = new Date().getFullYear()
): { dateStart?: string; dateEnd?: string } => {
  if (!rawDateStr || typeof rawDateStr !== 'string') return {};

  const clean = rawDateStr.replace(/\s+/g, ' ').trim();
  const pad = (n: number | string) => String(n).padStart(2, '0');

  // 1. GG.AA.YYYY - GG.AA.YYYY veya GG/AA/YYYY - GG/AA/YYYY
  const fullMatch = clean.match(
    /(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})?\s*[-–\/]\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})?/
  );
  if (fullMatch) {
    const y1 = fullMatch[3]
      ? fullMatch[3].length === 2
        ? '20' + fullMatch[3]
        : fullMatch[3]
      : String(defaultYear);
    const y2 = fullMatch[6]
      ? fullMatch[6].length === 2
        ? '20' + fullMatch[6]
        : fullMatch[6]
      : y1;
    return {
      dateStart: `${y1}-${pad(fullMatch[2])}-${pad(fullMatch[1])}`,
      dateEnd: `${y2}-${pad(fullMatch[5])}-${pad(fullMatch[4])}`,
    };
  }

  // 2. GG - GG Ay YYYY (Örn: "09 - 13 Eylül 2024" veya "16-20 Eylül")
  const turkishMonths: Record<string, number> = {
    ocak: 1,
    subat: 2,
    şubat: 2,
    mart: 3,
    nisan: 4,
    mayis: 5,
    mayıs: 5,
    haziran: 6,
    temmuz: 7,
    agustos: 8,
    ağustos: 8,
    eylul: 9,
    eylül: 9,
    ekim: 10,
    kasim: 11,
    kasım: 11,
    aralik: 12,
    aralık: 12,
  };

  const monthRegex =
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)(?:\s+(\d{4}))?/i;
  const mMatch = clean.match(monthRegex);
  if (mMatch) {
    const mName = mMatch[3].toLowerCase();
    const monthNum = turkishMonths[mName];
    if (monthNum) {
      const year = mMatch[4] || String(defaultYear);
      return {
        dateStart: `${year}-${pad(monthNum)}-${pad(mMatch[1])}`,
        dateEnd: `${year}-${pad(monthNum)}-${pad(mMatch[2])}`,
      };
    }
  }

  return {};
};

/**
 * Sezgisel anahtar kelime eşleştirme ile sütunları tahmin eder.
 */
export const detectSuggestedMappingWithHeuristics = (
  columns: RawColumnInfo[]
): ColumnMappingSelection => {
  let topicColIndex: number | null = null;
  let outcomesColIndex: number | null = null;
  let dateColIndex: number | null = null;
  let weekColIndex: number | null = null;
  let hoursColIndex: number | null = null;

  for (const col of columns) {
    const h = col.headerName.toLowerCase();

    // Hafta
    if (weekColIndex === null && (h.includes('hafta') || h === 'no' || h.includes('hafta no') || h.includes('dönem'))) {
      weekColIndex = col.index;
    }

    // Tarih
    if (dateColIndex === null && (h.includes('tarih') || h.includes('zaman') || h.includes('gün') || h.includes('ay'))) {
      dateColIndex = col.index;
    }

    // Ders Saati
    if (hoursColIndex === null && (h.includes('saat') || h.includes('süre') || h.includes('ders saati'))) {
      hoursColIndex = col.index;
    }

    // Konu
    if (
      topicColIndex === null &&
      (h.includes('konu') ||
        h.includes('ünite') ||
        h.includes('öğrenme alanı') ||
        h.includes('alt öğrenme') ||
        h.includes('içerik') ||
        h.includes('tema') ||
        h.includes('etkinlik'))
    ) {
      topicColIndex = col.index;
    }

    // Kazanım
    if (
      outcomesColIndex === null &&
      (h.includes('kazanım') ||
        h.includes('açıklama') ||
        h.includes('beceri') ||
        h.includes('hedef') ||
        h.includes('kazanim'))
    ) {
      outcomesColIndex = col.index;
    }
  }

  // Eğer konu bulunamadıysa ama uzun metin içeren bir sütun varsa onu seç
  if (topicColIndex === null && columns.length > 0) {
    let longestCol = columns[0].index;
    let maxLen = 0;
    for (const c of columns) {
      if (c.index === weekColIndex || c.index === dateColIndex || c.index === hoursColIndex) continue;
      const avgLen = c.sampleValues.reduce((acc, v) => acc + v.length, 0);
      if (avgLen > maxLen) {
        maxLen = avgLen;
        longestCol = c.index;
      }
    }
    topicColIndex = longestCol;
  }

  return {
    topicColIndex,
    outcomesColIndex,
    dateColIndex,
    weekColIndex,
    hoursColIndex,
  };
};

/**
 * Gemini AI ile sütun başlıklarını ve örnek verileri analiz ederek en iyi eşleşmeyi önerir.
 */
export const detectSuggestedMappingWithAi = async (
  columns: RawColumnInfo[]
): Promise<{ mapping: ColumnMappingSelection; reason?: string }> => {
  const fallback = detectSuggestedMappingWithHeuristics(columns);
  const apiKey = (await getGeminiApiKey()).trim();

  if (!apiKey) {
    return { mapping: fallback, reason: 'Kural tabanlı akıllı eşleştirme uygulandı.' };
  }

  const columnsSummary = columns.map((c) => ({
    index: c.index,
    headerName: c.headerName,
    sampleValues: c.sampleValues.slice(0, 2),
  }));

  const prompt = `Türkiye MEB yıllık müfredat planı tablosu sütun eşleştirme uzmanısın.
Aşağıda Word veya Excel tablosundan çıkarılan sütun indeksleri, başlıkları ve ilk 2 satır örnek verileri verilmiştir:

${JSON.stringify(columnsSummary, null, 2)}

GÖREVİN:
Aşağıdaki 5 alan için en uygun sütun indekslerini (0, 1, 2...) tespit et:
1. topicColIndex (ZORUNLU): Öğretmenin sınıf defterine yazacağı ana ders konusu / ünite / öğrenme alanı sütunu.
2. outcomesColIndex (OPSİYONEL): Kazanımlar veya açıklamalar sütunu (yoksa null).
3. dateColIndex (OPSİYONEL): Hafta başlangıç-bitiş tarih aralığı sütunu (yoksa null).
4. weekColIndex (OPSİYONEL): Hafta numarası sütunu (yoksa null).
5. hoursColIndex (OPSİYONEL): Haftalık ders saati sütunu (yoksa null).

Yanıtını SADECE şu JSON şemasında döndür:
{
  "topicColIndex": number,
  "outcomesColIndex": number | null,
  "dateColIndex": number | null,
  "weekColIndex": number | null,
  "hoursColIndex": number | null,
  "reason": "Kısa Türkçe açıklama (örn: Sütun 3 konu başlıklarını, Sütun 4 kazanımları temsil ediyor.)"
}`;

  const selectedModel = await getGeminiModel();
  const models = Array.from(
    new Set([selectedModel, 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-1.5-flash'].filter(Boolean))
  );

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data?.usageMetadata) {
        await recordGeminiApiUsage(model, data.usageMetadata);
      }
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let clean = rawText.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(clean);
      if (typeof parsed.topicColIndex === 'number') {
        return {
          mapping: {
            topicColIndex: parsed.topicColIndex,
            outcomesColIndex: typeof parsed.outcomesColIndex === 'number' ? parsed.outcomesColIndex : null,
            dateColIndex: typeof parsed.dateColIndex === 'number' ? parsed.dateColIndex : null,
            weekColIndex: typeof parsed.weekColIndex === 'number' ? parsed.weekColIndex : null,
            hoursColIndex: typeof parsed.hoursColIndex === 'number' ? parsed.hoursColIndex : null,
          },
          reason: parsed.reason || '✨ Yapay Zeka tablonun başlık ve örnek verilerini analiz ederek en uygun eşleştirmeyi yaptı.',
        };
      }
    } catch (e) {
      // Try next model
    }
  }

  return { mapping: fallback, reason: 'Kural tabanlı akıllı eşleştirme uygulandı.' };
};

/**
 * Yüklenen Word veya Excel dosyasını tarar, başlık satırını bulur ve sütunları hazırlar.
 */
export const analyzeUploadedDocument = async (
  asset: DocumentPickerAsset
): Promise<DocumentAnalysisResult> => {
  const fileName = asset.name || 'Belge';
  const isDocx = fileName.toLowerCase().endsWith('.docx');
  let rawRows: any[][] = [];

  if (isDocx) {
    rawRows = await extractTableRowsFromDocx(asset.uri);
  } else {
    // Excel okuma
    const { readWorkbookFromAsset } = await import('./excelService');
    const workbook = await readWorkbookFromAsset(asset);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error('Excel dosyasında geçerli bir sayfa bulunamadı.');
    }
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  }

  if (!rawRows || rawRows.length < 2) {
    throw new Error('Dosyada analiz edilecek tablo veya satır verisi bulunamadı.');
  }

  // 1. Başlık satırını bul (İlk 12 satırı tara)
  const headerKeywords = [
    'hafta',
    'tarih',
    'saat',
    'konu',
    'kazanım',
    'kazanim',
    'ünite',
    'unite',
    'öğrenme',
    'içerik',
    'açıklama',
    'ay',
    'tema',
    'etkinlik',
  ];

  let bestHeaderRowIdx = 0;
  let bestScore = -1;

  const maxScan = Math.min(rawRows.length, 12);
  for (let i = 0; i < maxScan; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length < 2) continue;

    let score = 0;
    const nonEmptyCells = row.filter((c) => c !== null && c !== undefined && String(c).trim().length > 0);
    if (nonEmptyCells.length < 2) continue;

    const rowText = row.map((c) => String(c || '').toLowerCase()).join(' ');
    for (const kw of headerKeywords) {
      if (rowText.includes(kw)) score += 2;
    }
    // Sütun sayısı fazlalığı bonusu
    score += Math.min(nonEmptyCells.length, 6);

    if (score > bestScore) {
      bestScore = score;
      bestHeaderRowIdx = i;
    }
  }

  const headerRow = rawRows[bestHeaderRowIdx] || [];
  const maxCols = Math.max(headerRow.length, ...rawRows.slice(bestHeaderRowIdx, bestHeaderRowIdx + 5).map((r) => (Array.isArray(r) ? r.length : 0)));

  const columns: RawColumnInfo[] = [];

  for (let c = 0; c < maxCols; c++) {
    const rawHead = headerRow[c];
    const headerName =
      rawHead !== null && rawHead !== undefined && String(rawHead).trim().length > 0
        ? String(rawHead).trim()
        : `Sütun ${c + 1}`;

    // Örnek değerleri topla
    const samples: string[] = [];
    for (let r = bestHeaderRowIdx + 1; r < Math.min(rawRows.length, bestHeaderRowIdx + 8); r++) {
      const val = rawRows[r]?.[c];
      if (val !== null && val !== undefined) {
        const s = String(val).trim();
        if (s.length > 0 && !samples.includes(s)) {
          samples.push(s.length > 80 ? s.substring(0, 80) + '...' : s);
          if (samples.length >= 3) break;
        }
      }
    }

    columns.push({
      index: c,
      headerName,
      sampleValues: samples,
    });
  }

  // 2. Yapay Zeka veya Kural Tabanlı Eşleştirme Önerisi Al
  const { mapping, reason } = await detectSuggestedMappingWithAi(columns);

  return {
    fileName,
    fileType: isDocx ? 'docx' : 'excel',
    rawRows,
    headerRowIndex: bestHeaderRowIdx,
    columns,
    suggestedMapping: mapping,
    aiReason: reason,
  };
};

/**
 * Kullanıcının onayladığı sütun eşlemesine göre satırları dönüştürür.
 */
export const convertRowsWithMapping = (
  rawRows: any[][],
  headerRowIndex: number,
  mapping: ColumnMappingSelection,
  weeklyHours: number = 4
): ParsedYearlyPlanRow[] => {
  if (mapping.topicColIndex === null) {
    throw new Error('Lütfen "Deftere Yazılacak Konu" sütununu seçiniz.');
  }

  const result: ParsedYearlyPlanRow[] = [];
  let autoWeek = 1;

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Konu hücresini al
    const rawTopic = row[mapping.topicColIndex];
    if (rawTopic === null || rawTopic === undefined) continue;
    let topicStr = String(rawTopic).trim();

    // Boşsa veya tekrarlanan başlık satırıysa atla
    if (!topicStr || topicStr.toLowerCase() === 'konu' || topicStr.toLowerCase() === 'öğrenme alanı') {
      continue;
    }

    // Bürokratik kodları temizle (Örn: "11.1.2. Vektörler" -> "Vektörler" veya "FİZ.11.1 Vektörler")
    topicStr = topicStr
      .replace(/^\[?[a-zA-ZçğıöşüÇĞİÖŞÜ0-9\.\-_]{2,15}\]?\s*[:\.\-]\s*/g, '')
      .replace(/^\d+\.\d+(?:\.\d+)*\.?\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!topicStr) continue;

    // Hafta
    let weekNumber = autoWeek;
    if (mapping.weekColIndex !== null) {
      const rawW = row[mapping.weekColIndex];
      if (rawW !== null && rawW !== undefined) {
        const numMatch = String(rawW).match(/\d+/);
        if (numMatch) {
          const parsedWeek = parseInt(numMatch[0], 10);
          if (parsedWeek > 0 && parsedWeek <= 52) {
            weekNumber = parsedWeek;
          }
        }
      }
    }

    // Saat
    let lessonHours = weeklyHours;
    if (mapping.hoursColIndex !== null) {
      const rawH = row[mapping.hoursColIndex];
      if (rawH !== null && rawH !== undefined) {
        const hMatch = String(rawH).match(/\d+/);
        if (hMatch) {
          const parsedH = parseInt(hMatch[0], 10);
          if (parsedH > 0 && parsedH <= 20) {
            lessonHours = parsedH;
          }
        }
      }
    }

    // Tarih
    let dateStart: string | undefined;
    let dateEnd: string | undefined;
    if (mapping.dateColIndex !== null) {
      const rawDate = row[mapping.dateColIndex];
      if (rawDate !== null && rawDate !== undefined) {
        const parsedDates = parseTurkishDateRange(String(rawDate));
        dateStart = parsedDates.dateStart;
        dateEnd = parsedDates.dateEnd;
      }
    }

    // Kazanım
    let learningOutcomes: string | undefined;
    if (mapping.outcomesColIndex !== null) {
      const rawOut = row[mapping.outcomesColIndex];
      if (rawOut !== null && rawOut !== undefined) {
        const s = String(rawOut).trim();
        if (s.length > 0) {
          learningOutcomes = s;
        }
      }
    }

    result.push({
      weekNumber,
      dateStart: dateStart || '',
      dateEnd: dateEnd || '',
      lessonHours,
      subjectTopic: topicStr,
      learningOutcomes: learningOutcomes || '',
    });

    autoWeek = Math.max(autoWeek, weekNumber + 1);
  }

  if (result.length === 0) {
    throw new Error('Seçilen sütun eşleşmesine göre herhangi bir plan satırı çıkarılamadı.');
  }

  return result;
};
