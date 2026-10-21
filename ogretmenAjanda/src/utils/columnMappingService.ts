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
  sheetName?: string;
  availableSheets?: string[];
  detectedWeeklyHours?: number;
  detectedTotalHours?: number;
  calculatedWeeks?: number;
  detectedHolidays?: string[];
  detectedSchoolYear?: number;
}

/**
 * Türkçe tarih aralıklarını (örn: "09.09.2024 - 13.09.2024", "16-20 Eylül 2024", "28 Eylül - 2 Ekim" veya "28 Aralık - 1 Ocak")
 * YYYY-AA-GG formatına çevirir. MEB eğitim yılı takvimine göre Eylül-Aralık (Yıl 1) ve Ocak-Haziran (Yıl 2) geçişini doğru hesaplar.
 */
export const parseTurkishDateRange = (
  rawDateStr: string,
  schoolStartYear: number = new Date().getFullYear()
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
      : String(schoolStartYear);
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

  const getYearForMonth = (mNum: number) => {
    return mNum >= 9 ? schoolStartYear : schoolStartYear + 1;
  };

  // 2. Ay Geçişli Tarihler: GG Ay1 - GG Ay2 (Örn: "28 Eylül - 2 Ekim", "30 Kasım - 4 Aralık", "28 Aralık - 1 Ocak", "31 Mayıs - 4 Haziran")
  const crossMonthRegex =
    /(\d{1,2})\s*([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s*[-–]\s*(\d{1,2})\s*([a-zA-ZçğıöşüÇĞİÖŞÜ]+)(?:\s+(\d{4}))?/i;
  const cmMatch = clean.match(crossMonthRegex);
  if (cmMatch) {
    const m1Name = cmMatch[2].toLocaleLowerCase('tr-TR');
    const m2Name = cmMatch[4].toLocaleLowerCase('tr-TR');
    const m1 = turkishMonths[m1Name];
    const m2 = turkishMonths[m2Name];
    if (m1 && m2) {
      const explicitYear = cmMatch[5] ? parseInt(cmMatch[5], 10) : null;
      const y1 = explicitYear || getYearForMonth(m1);
      const y2 = explicitYear || getYearForMonth(m2);
      return {
        dateStart: `${y1}-${pad(m1)}-${pad(cmMatch[1])}`,
        dateEnd: `${y2}-${pad(m2)}-${pad(cmMatch[3])}`,
      };
    }
  }

  // 3. Aynı Ay İçi: GG - GG Ay YYYY (Örn: "09 - 13 Eylül 2026" veya "16-20 Eylül")
  const sameMonthRegex =
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)(?:\s+(\d{4}))?/i;
  const smMatch = clean.match(sameMonthRegex);
  if (smMatch) {
    const mName = smMatch[3].toLocaleLowerCase('tr-TR');
    const mNum = turkishMonths[mName];
    if (mNum) {
      const explicitYear = smMatch[4] ? parseInt(smMatch[4], 10) : null;
      const year = explicitYear || getYearForMonth(mNum);
      return {
        dateStart: `${year}-${pad(mNum)}-${pad(smMatch[1])}`,
        dateEnd: `${year}-${pad(mNum)}-${pad(smMatch[2])}`,
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
    const h = col.headerName.toLocaleLowerCase('tr-TR');

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

    // Konu: 'konu' veya 'içerik' varsa önceliklidir (ünite tek başına daha geneldir)
    if (
      topicColIndex === null &&
      (h.includes('konu') ||
        h.includes('içerik') ||
        h.includes('alt öğrenme') ||
        h.includes('ünite') ||
        h.includes('öğrenme alanı') ||
        h.includes('tema') ||
        h.includes('etkinlik'))
    ) {
      topicColIndex = col.index;
    }

    // Kazanım: 'kazanım', 'öğrenme çıktıları', 'açıklama'
    if (
      outcomesColIndex === null &&
      (h.includes('kazanım') ||
        h.includes('kazanim') ||
        h.includes('öğrenme çıktı') ||
        h.includes('çıktı') ||
        h.includes('süreç bileşen') ||
        h.includes('açıklama') ||
        h.includes('beceri') ||
        h.includes('hedef'))
    ) {
      outcomesColIndex = col.index;
    }
  }

  // Eğer hem Ünite hem Konu sütunları varsa, daha spesifik olan 'konu' sütununu topicColIndex yap
  for (const col of columns) {
    const h = col.headerName.toLocaleLowerCase('tr-TR');
    if (h.includes('konu') || h.includes('içerik çerçevesi')) {
      topicColIndex = col.index;
      break;
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
  columns: RawColumnInfo[],
  contextInfo?: {
    detectedWeeklyHours?: number;
    detectedTotalHours?: number;
    calculatedWeeks?: number;
    lessonName?: string;
  }
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

  let contextExtra = '';
  if (contextInfo?.detectedTotalHours && contextInfo?.detectedWeeklyHours) {
    contextExtra = `\nBELGEDEN OKUNAN EK BİLGİLER:
- Yıllık Toplam Ders Saati: ${contextInfo.detectedTotalHours} Saat
- Haftalık Ders Saati: ${contextInfo.detectedWeeklyHours} Saat
- Hesaplanan Beklenen Hafta Sayısı: ${contextInfo.calculatedWeeks || Math.round(contextInfo.detectedTotalHours / contextInfo.detectedWeeklyHours)} Hafta (${contextInfo.detectedTotalHours} / ${contextInfo.detectedWeeklyHours})`;
  } else if (contextInfo?.detectedWeeklyHours) {
    contextExtra = `\nBELGEDEN OKUNAN HAFTALIK DERS SAATİ: ${contextInfo.detectedWeeklyHours} Saat`;
  }

  const prompt = `Türkiye MEB yıllık müfredat planı tablosu sütun eşleştirme uzmanısın.
Aşağıda Word veya Excel tablosundan çıkarılan sütun indeksleri, başlıkları ve ilk 2 satır örnek verileri verilmiştir:

${JSON.stringify(columnsSummary, null, 2)}
${contextExtra}

ÖNEMLİ MEB DERS SAATİ & HAFTA MATEMATİĞİ KURALLARI:
1. MEB'de bir eğitim öğretim yılı net olarak 36 veya 37 ders haftasıdır.
2. Matematiksel İlişki: 1 Yıllık Toplam Ders Saati / Haftalık Ders Saati = Toplam Hafta Sayısıdır.
   - Örn: 72 saat / 2 saat = 36 Hafta
   - Örn: 144 saat / 4 saat = 36-37 Hafta
3. Kümülatif / Toplam Saat Tuzağı: Bazı plan tablolarında hem haftalık ders saati (örn: 2, 4) hem de kümülatif toplam saat (4, 8, 12... 144) bulunur.
   - 'hoursColIndex' için haftalık ders saatini (2 veya 4) seçmelisin, kümülatif toplamı değil!
4. Birleşik (Compound) Hafta ve Tarih Sütunu: MEB planlarında 'HAFTA' sütununda genellikle hem hafta numarası ("1. Hafta:") hem de tarih aralığı ("14-18 Eylül") birlikte yer alır. weekColIndex olarak bu sütunu seçmelisin.
5. Konu ve Ünite Ayrımı: Tabloda hem 'ÜNİTE/TEMA' hem de 'KONU' / 'İÇERİK ÇERÇEVESİ' sütunları varsa, öğretmenin deftere yazacağı konuyu gösteren 'KONU' sütununu topicColIndex olarak seç!
6. Çok Haftalı Konular ve Dönem Arası Tatilleri: Bazı haftalarda konu hücresi birleştirilmiş veya boş olabilir (detaylar kazanım sütununda yer alır); aralarda ise '1. Dönem Ara Tatili', 'Yarıyıl Tatili' gibi tatil satırları bulunabilir.

GÖREVİN:
Aşağıdaki 5 alan için en uygun sütun indekslerini (0, 1, 2...) tespit et:
1. topicColIndex (ZORUNLU): Öğretmenin sınıf defterine yazacağı ana ders konusu / ünite / öğrenme alanı sütunu.
2. outcomesColIndex (OPSİYONEL): Kazanımlar veya açıklamalar sütunu (yoksa null).
3. dateColIndex (OPSİYONEL): Hafta başlangıç-bitiş tarih aralığı sütunu (yoksa null).
4. weekColIndex (OPSİYONEL): Hafta numarası sütunu (1..37) (yoksa null).
5. hoursColIndex (OPSİYONEL): Haftalık ders saati sütunu (örn: 2, 4) (yoksa null).

Yanıtını SADECE şu JSON şemasında döndür:
{
  "topicColIndex": number,
  "outcomesColIndex": number | null,
  "dateColIndex": number | null,
  "weekColIndex": number | null,
  "hoursColIndex": number | null,
  "reason": "Kısa Türkçe açıklama (örn: Sütun 4 deftere yazılacak alt konuları, Sütun 5 kazanımları, Sütun 1 hafta ve tarihleri temsil ediyor.)"
}`;

  const selectedModel = await getGeminiModel();
  const models = Array.from(
    new Set([selectedModel, 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'].filter(Boolean))
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
  asset: DocumentPickerAsset,
  selectedSheetName?: string
): Promise<DocumentAnalysisResult> => {
  const fileName = asset.name || 'Belge';
  const isDocx = fileName.toLowerCase().endsWith('.docx');
  let rawRows: any[][] = [];
  let availableSheets: string[] = [];
  let currentSheetName: string | undefined;

  if (isDocx) {
    rawRows = await extractTableRowsFromDocx(asset.uri);
  } else {
    // Excel okuma
    const { readWorkbookFromAsset } = await import('./excelService');
    const workbook = await readWorkbookFromAsset(asset);
    availableSheets = workbook.SheetNames || [];
    currentSheetName = selectedSheetName && availableSheets.includes(selectedSheetName)
      ? selectedSheetName
      : availableSheets[0];

    const worksheet = workbook.Sheets[currentSheetName];
    if (!worksheet) {
      throw new Error(`Excel dosyasında "${currentSheetName}" geçerli bir sayfa bulunamadı.`);
    }
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  }

  if (!rawRows || rawRows.length < 2) {
    throw new Error('Dosyada analiz edilecek tablo veya satır verisi bulunamadı.');
  }

  // 1. Başlık satırını bul (İlk 15 satırı tara)
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
  let bestScore = -999;

  const maxScan = Math.min(rawRows.length, 15);
  for (let i = 0; i < maxScan; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length < 2) continue;

    const nonEmptyCells = row.filter((c) => c !== null && c !== undefined && String(c).trim().length > 0);
    if (nonEmptyCells.length < 2) continue;

    let score = 0;
    const rowTextLower = row.map((c) => String(c || '')).join(' ').toLocaleLowerCase('tr-TR');

    // Veri satırı cezaları: "1. Hafta", tarih aralığı, ara tatil veya uzun metin içeren satırlar başlık satırı OLAMAZ
    if (/\b\d{1,2}\.\s*hafta\b/i.test(rowTextLower)) score -= 25;
    if (/\d{1,2}\s*[-–]\s*\d{1,2}\s*(eylül|ekim|kasım|aralık|ocak|şubat|mart|nisan|mayıs|haziran)/i.test(rowTextLower)) score -= 25;
    if (/(?:ara\s*tatil|yar[ıi]y[ıi]l\s*tatil|s[öo]mestr)/i.test(rowTextLower)) score -= 30;

    let hasVeryLongCell = false;
    let totalLen = 0;
    for (const c of nonEmptyCells) {
      const s = String(c).trim();
      totalLen += s.length;
      if (s.length > 70) hasVeryLongCell = true;
      const lower = s.toLocaleLowerCase('tr-TR');
      if (
        [
          'ay',
          'hafta',
          'hafta no',
          'tarih',
          'ders saati',
          'saat',
          'ünite',
          'unite',
          'konu',
          'kazanım',
          'kazanim',
          'öğrenme çıktıları',
          'içerik çerçevesi',
          'tema',
        ].includes(lower)
      ) {
        score += 6;
      }
    }
    if (hasVeryLongCell) score -= 15;
    const avgLen = totalLen / nonEmptyCells.length;
    if (avgLen > 40) score -= 10;

    for (const kw of headerKeywords) {
      if (rowTextLower.includes(kw)) score += 2;
    }
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

    // Örnek değerleri topla (tatil satırlarını atla)
    const samples: string[] = [];
    for (let r = bestHeaderRowIdx + 1; r < Math.min(rawRows.length, bestHeaderRowIdx + 10); r++) {
      const rowText = (rawRows[r] || []).join(' ').toLocaleLowerCase('tr-TR');
      if (/(?:ara\s*tatil|yar[ıi]y[ıi]l\s*tatil|s[öo]mestr)/i.test(rowText)) continue;

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

  // 1.5 Üst satırlardan veya tablodan Eğitim Yılı, Haftalık Ders Saati ve Yıllık Toplam Saati tara
  let detectedSchoolYear: number | undefined;
  let detectedWeeklyHours: number | undefined;
  let detectedTotalHours: number | undefined;
  const detectedHolidays: string[] = [];

  const preScanLimit = Math.min(rawRows.length, Math.max(bestHeaderRowIdx + 1, 10));
  for (let i = 0; i < preScanLimit; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.map((c) => String(c || '').trim()).join(' ');

    if (!detectedSchoolYear) {
      const yMatch = rowText.match(/(\d{4})\s*[-–]\s*(\d{4})\s*(?:eğitim|öğretim)/i);
      if (yMatch) {
        detectedSchoolYear = parseInt(yMatch[1], 10);
      }
    }

    if (!detectedWeeklyHours) {
      const wm = rowText.match(/(?:haftal[ıi]k\s*(?:ders)?\s*saat[ıi]?)\s*[:=\-]?\s*(\d{1,2})/i);
      if (wm) detectedWeeklyHours = parseInt(wm[1], 10);
    }

    if (!detectedTotalHours) {
      const tm = rowText.match(/(?:y[ıi]ll[ıi]k\s*(?:toplam)?\s*(?:ders)?\s*saat[ıi]?|toplam\s*ders\s*saat[ıi]?)\s*[:=\-]?\s*(\d{2,3})/i);
      if (tm) detectedTotalHours = parseInt(tm[1], 10);
    }
  }

  // Tablo satırlarından ara tatilleri ve yarıyıl tatillerini tespit et
  for (let i = bestHeaderRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.map((c) => String(c || '')).join(' ').toLocaleLowerCase('tr-TR');
    if (/(?:ara\s*tatil|yar[ıi]y[ıi]l\s*tatil|s[öo]mestr|bayram\s*tatil)/i.test(rowText)) {
      const holidayCell = row.find((c) => c && /(?:tatil|s[öo]mestr)/i.test(String(c).toLocaleLowerCase('tr-TR')));
      if (holidayCell) {
        const cleanName = String(holidayCell).replace(/\s+/g, ' ').trim();
        if (!detectedHolidays.includes(cleanName)) {
          detectedHolidays.push(cleanName);
        }
      }
    }
  }

  let calculatedWeeks: number | undefined;
  if (detectedTotalHours && detectedWeeklyHours && detectedWeeklyHours > 0) {
    calculatedWeeks = Math.round(detectedTotalHours / detectedWeeklyHours);
  }

  // 2. Yapay Zeka veya Kural Tabanlı Eşleştirme Önerisi Al (MEB Saat Matematiği ile)
  const { mapping, reason } = await detectSuggestedMappingWithAi(columns, {
    detectedWeeklyHours,
    detectedTotalHours,
    calculatedWeeks,
  });

  return {
    fileName,
    fileType: isDocx ? 'docx' : 'excel',
    rawRows,
    headerRowIndex: bestHeaderRowIdx,
    columns,
    suggestedMapping: mapping,
    aiReason: reason,
    sheetName: currentSheetName,
    availableSheets,
    detectedWeeklyHours,
    detectedTotalHours,
    calculatedWeeks,
    detectedHolidays,
    detectedSchoolYear,
  };
};

/**
 * Kullanıcının onayladığı sütun eşlemesine göre satırları dönüştürür.
 * Dönem arası tatilleri otomatik tanır, hafta atlamalarını korur ve MEB 36-37 haftalık tutarlılığı sağlar.
 */
export const convertRowsWithMapping = (
  rawRows: any[][],
  headerRowIndex: number,
  mapping: ColumnMappingSelection,
  weeklyHours: number = 4,
  schoolYear: number = 2026
): ParsedYearlyPlanRow[] => {
  if (mapping.topicColIndex === null && mapping.outcomesColIndex === null) {
    throw new Error('Lütfen "Deftere Yazılacak Konu" veya "Kazanım" sütununu seçiniz.');
  }

  const rawResult: ParsedYearlyPlanRow[] = [];
  let autoWeek = 1;
  let lastTopic = '';

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rowTextLower = row.map((c) => String(c || '')).join(' ').toLocaleLowerCase('tr-TR');
    if (!rowTextLower.trim()) continue;

    // 1. Ara Tatil / Yarıyıl Tatili / Tatil Satırı Kontrolü
    const isHoliday = /(?:ara\s*tatil|yar[ıi]y[ıi]l\s*tatil|s[öo]mestr|bayram\s*tatil|resmi\s*tatil)/i.test(rowTextLower);
    if (isHoliday) {
      // Tatil satırı eğitim haftası DEĞİLDİR -> autoWeek artırılmaz, atlanır!
      continue;
    }

    // 2. Hafta Numarası
    let weekNumber: number | null = null;
    let weekRawStr = '';
    if (mapping.weekColIndex !== null && row[mapping.weekColIndex] !== undefined && row[mapping.weekColIndex] !== null) {
      weekRawStr = String(row[mapping.weekColIndex]);
      const wMatch = weekRawStr.match(/(\d{1,2})\.\s*hafta/i) || weekRawStr.match(/\b(\d{1,2})\b/);
      if (wMatch) {
        const p = parseInt(wMatch[1], 10);
        if (p >= 1 && p <= 52) weekNumber = p;
      }
    }

    // 3. Konu Çıkarımı
    let topicStr = '';
    if (mapping.topicColIndex !== null && row[mapping.topicColIndex] !== undefined && row[mapping.topicColIndex] !== null) {
      topicStr = String(row[mapping.topicColIndex]).trim();
    }

    // Bürokratik kodları temizle (Örn: "11.1.2. Vektörler" -> "Vektörler" veya "FİZ.11.1 Vektörler")
    topicStr = topicStr
      .replace(/^\[?[a-zA-ZçğıöşüÇĞİÖŞÜ0-9\.\-_]{2,15}\]?\s*[:\.\-]\s*/g, '')
      .replace(/^\d+\.\d+(?:\.\d+)*\.?\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Kazanım Çıkarımı
    let outcomesStr = '';
    if (mapping.outcomesColIndex !== null && row[mapping.outcomesColIndex] !== undefined && row[mapping.outcomesColIndex] !== null) {
      outcomesStr = String(row[mapping.outcomesColIndex]).trim();
    }

    // Çok haftalı birleşik konularda Konu hücresi boş kalmışsa kazanım veya önceki konudan türet
    if (!topicStr || topicStr.toLocaleLowerCase('tr-TR') === 'konu') {
      if (outcomesStr) {
        const cleanedOutcome = outcomesStr
          .replace(/^\[?[a-zA-ZçğıöşüÇĞİÖŞÜ0-9\.\-_]{2,15}\]?\s*[:\.\-]\s*/g, '')
          .replace(/^\d+\.\d+(?:\.\d+)*\.?\s*/g, '')
          .split(/[\r\n]+/)[0]
          .trim();
        topicStr = lastTopic ? `${lastTopic}: ${cleanedOutcome}`.substring(0, 100) : cleanedOutcome;
      } else {
        // Satırdaki diğer hücreleri tara (Örn: "Sosyal Etkinlik", "Okul Temelli Planlama")
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          if (colIdx === mapping.weekColIndex || colIdx === mapping.hoursColIndex) continue;
          const val = row[colIdx];
          if (val && typeof val === 'string' && /(?:etkinlik|planlama|tekrar|sınav|değerlendirme)/i.test(val)) {
            topicStr = val.trim();
            break;
          }
        }
        if (!topicStr && lastTopic && weekNumber !== null) {
          topicStr = `${lastTopic} (Uygulama ve Pekiştirme)`;
        }
      }
    }

    // Konu hâlâ yoksa ve hafta numarası da yoksa satırı atla
    if (!topicStr && weekNumber === null) continue;

    if (weekNumber === null) {
      weekNumber = autoWeek;
    }

    if (topicStr) lastTopic = topicStr;

    // 4. Tarih Aralığı
    let dateStart = '';
    let dateEnd = '';
    if (mapping.dateColIndex !== null && row[mapping.dateColIndex] && mapping.dateColIndex !== mapping.weekColIndex) {
      const parsed = parseTurkishDateRange(String(row[mapping.dateColIndex]), schoolYear);
      dateStart = parsed.dateStart || '';
      dateEnd = parsed.dateEnd || '';
    }
    // Eğer tarih bulunamadıysa hafta sütunundaki compound metinden ("1. Hafta: 14-18 Eylül") çıkar
    if (!dateStart && weekRawStr) {
      const parsed = parseTurkishDateRange(weekRawStr, schoolYear);
      dateStart = parsed.dateStart || '';
      dateEnd = parsed.dateEnd || '';
    }

    // 5. Ders Saati
    let lessonHours = weeklyHours;
    if (mapping.hoursColIndex !== null && row[mapping.hoursColIndex] !== undefined && row[mapping.hoursColIndex] !== null) {
      const hStr = String(row[mapping.hoursColIndex]);
      const hMatch = hStr.match(/\d+/);
      if (hMatch) {
        const parsedH = parseInt(hMatch[0], 10);
        if (parsedH > 0 && parsedH <= 20) {
          lessonHours = parsedH;
        } else if (parsedH > 20 && weeklyHours > 0 && mapping.weekColIndex === null) {
          // Kümülatif toplam ders saati sütunu seçilmişse hafta türet
          const derivedWeek = Math.round(parsedH / weeklyHours);
          if (derivedWeek >= 1 && derivedWeek <= 45) {
            weekNumber = derivedWeek;
          }
        }
      }
    }

    rawResult.push({
      weekNumber,
      dateStart,
      dateEnd,
      lessonHours,
      subjectTopic: topicStr || `Hafta ${weekNumber} Konusu`,
      learningOutcomes: outcomesStr,
    });

    autoWeek = Math.max(autoWeek, weekNumber + 1);
  }

  if (rawResult.length === 0) {
    throw new Error('Seçilen sütun eşleşmesine göre herhangi bir plan satırı çıkarılamadı.');
  }

  // 6. Aynı haftaya ait çoklu satırları (örn: 2 saat Konu 1 + 2 saat Konu 2) tek bir haftalık kayıtta birleştir
  const consolidated: ParsedYearlyPlanRow[] = [];
  const byWeek = new Map<number, ParsedYearlyPlanRow>();

  for (const item of rawResult) {
    if (!byWeek.has(item.weekNumber)) {
      const entry = { ...item };
      byWeek.set(item.weekNumber, entry);
      consolidated.push(entry);
    } else {
      const existing = byWeek.get(item.weekNumber)!;
      existing.lessonHours += item.lessonHours;
      if (item.subjectTopic && !existing.subjectTopic.includes(item.subjectTopic)) {
        existing.subjectTopic = `${existing.subjectTopic} / ${item.subjectTopic}`.substring(0, 180);
      }
      if (item.learningOutcomes) {
        if (!existing.learningOutcomes) {
          existing.learningOutcomes = item.learningOutcomes;
        } else if (!existing.learningOutcomes.includes(item.learningOutcomes)) {
          existing.learningOutcomes = `${existing.learningOutcomes}\n${item.learningOutcomes}`;
        }
      }
      if (!existing.dateStart && item.dateStart) existing.dateStart = item.dateStart;
      if (!existing.dateEnd && item.dateEnd) existing.dateEnd = item.dateEnd;
    }
  }

  return consolidated;
};

/**
 * Standart Yıllık Müfredat Planı Excel Şablonu (.xlsx) üretir ve paylaşım menüsünü açar.
 */
export async function generateYearlyPlanTemplateExcel(
  lessonName = 'Ders',
  gradeLevel = 'Tüm_Kademeler'
): Promise<boolean> {
  const { saveAndShareWorkbook } = await import('./excelService');
  const workbook = XLSX.utils.book_new();

  const header = [
    'Hafta *',
    'Tarih Aralığı (Örn: 09.09.2024 - 13.09.2024)',
    'Ders Saati',
    'Konu / Ünite (Deftere Yazılacak Ana Konu) *',
    'Kazanımlar ve Açıklamalar',
  ];

  // 36 haftalık örnek ve doldurulabilir satırlar
  const sampleRows: any[][] = [header];
  const sampleTopics = [
    'Giriş ve Tanışma, Dersin Amaç ve Yöntemleri',
    '1. Ünite: Temel Kavramlar ve Tanımlar',
    '1. Ünite: Temel İlkeler ve Özellikler',
    '1. Ünite: Alıştırmalar, Problem Çözümü ve Pekiştirme',
    '2. Ünite: Uygulama ve Analiz Yöntemleri',
    '2. Ünite: İnceleme ve Örnek Olaylar',
  ];

  for (let w = 1; w <= 36; w++) {
    const topic = w <= sampleTopics.length ? sampleTopics[w - 1] : `Hafta ${w} Konusu`;
    const outcomes = w <= sampleTopics.length ? `${w}. hafta kazanımları ve sınıf içi uygulamaları.` : '';
    sampleRows.push([
      w,
      '',
      4,
      topic,
      outcomes,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 10 },
    { wch: 32 },
    { wch: 12 },
    { wch: 45 },
    { wch: 50 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Yıllık Plan');

  // Bilgilendirme sayfası
  const infoRows = [
    ['MEB YILLIK MÜFREDAT PLANI HAZIR ŞABLON KILAVUZU'],
    [''],
    ['1. "Yıllık Plan" sekmesindeki sütun başlıklarını değiştirmeden ders konularınızı giriniz.'],
    ['2. "Hafta" (1-36 arası) ve "Konu / Ünite" sütunları zorunludur.'],
    ['3. "Tarih Aralığı", "Ders Saati" ve "Kazanımlar" sütunları isteğe bağlıdır.'],
    ['4. Dosyayı kaydettikten sonra Öğretmen Ajandası uygulamasında ilgili dersin "Yıllık Plan Yükle" düğmesiyle doğrudan yükleyebilirsiniz.'],
    ['5. Yapay zeka sütunları otomatik tanıyıp defter ve ders kokpitinize hazır hale getirecektir.'],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Kılavuz');

  const cleanLesson = (lessonName || 'Ders').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]/g, '_');
  const cleanGrade = String(gradeLevel || '').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]/g, '_');
  const fileName = `Yillik_Plan_Sablonu_${cleanLesson}_${cleanGrade}.xlsx`;
  return await saveAndShareWorkbook(workbook, fileName);
}
