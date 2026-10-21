import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { getGeminiApiKey, getGeminiModel, recordGeminiApiUsage, DEFAULT_GEMINI_MODEL } from '../utils/geminiScheduleService';
import { ParsedExcelStudent } from './excelStudentParser';

export interface AiStudentColumnMapping {
  studentNumberCol: number | null;
  fullNameCol: number | null;
  firstNameCol: number | null;
  lastNameCol: number | null;
  gradeCol: number | null;
  sectionCol: number | null;
  combinedClassCol: number | null;
  genderCol: number | null;
  parentNameCol: number | null;
  parentPhoneCol: number | null;
  studentPhoneCol: number | null;
  startRowIndex: number;
}

export interface AiStudentParseResult {
  success: boolean;
  students: ParsedExcelStudent[];
  detectedClasses: string[];
  schoolName?: string;
  totalRawRows: number;
  skippedRowsCount: number;
  mappingUsed: AiStudentColumnMapping;
  columnNames: Record<number, string>;
  aiReason?: string;
  modelUsed?: string;
  sheetName?: string;
  error?: string;
}

interface ColumnSample {
  index: number;
  header: string;
  samples: string[];
}

/**
 * Android, iOS ve Web için güvenli Base64 okuma
 */
async function readBase64Safely(fileUri: string): Promise<string> {
  // 1. FileSystem doğrudan okuma (Expo / Mobil / Scoped Storage)
  try {
    if (FileSystem && typeof FileSystem.readAsStringAsync === 'function') {
      const b64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (b64 && b64.length > 0) return b64;
    }
  } catch {}

  // 2. Web / Blob / Data URL için fetch okuması
  try {
    if (typeof fetch === 'function' && typeof FileReader === 'function') {
      const res = await fetch(fileUri);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const result = reader.result as string;
            const clean = result.includes(',') ? result.split(',')[1] : result;
            resolve(clean);
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {}

  // 3. Nihai FileSystem denemesi
  return await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Excel çalışma kitabını okur ve sayfaları çıkarır
 */
export async function readExcelWorkbook(fileUri: string): Promise<XLSX.WorkBook> {
  const base64 = await readBase64Safely(fileUri);
  return XLSX.read(base64, { type: 'base64', cellDates: true });
}

function normalizeTr(s: any): string {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

/**
 * Kural tabanlı (Heuristic) sütun eşleştirme - Yapay zeka yoksa veya çevrimdışıysa devreye girer
 */
function heuristicColumnMatch(
  headerRow: any[],
  sampleRows: any[][]
): { mapping: AiStudentColumnMapping; startRowIndex: number; reason: string } {
  let studentNumberCol: number | null = null;
  let fullNameCol: number | null = null;
  let firstNameCol: number | null = null;
  let lastNameCol: number | null = null;
  let gradeCol: number | null = null;
  let sectionCol: number | null = null;
  let combinedClassCol: number | null = null;
  let genderCol: number | null = null;
  let parentNameCol: number | null = null;
  let parentPhoneCol: number | null = null;
  let studentPhoneCol: number | null = null;

  headerRow.forEach((cell, idx) => {
    const val = normalizeTr(cell);
    if (!val) return;

    // SIRA / S.NO sütununu öğrenci no ile karıştırma
    if (val === 'sira' || val === 's.no' || val === 'sira no') {
      return;
    }

    // Okul No / Öğrenci No
    if (
      studentNumberCol === null &&
      (val.includes('okul no') ||
        val.includes('ogrenci no') ||
        val === 'no' ||
        val === 'numara' ||
        val.includes('numarasi'))
    ) {
      studentNumberCol = idx;
    }
    // Adı Soyadı (Bileşik - Aynı Sütun)
    else if (
      fullNameCol === null &&
      ((val.includes('ad') && val.includes('soyad')) ||
        val.includes('adi soyadi') ||
        val.includes('adi ve soyadi') ||
        val.includes('ad/soyad') ||
        val.includes('ad-soyad') ||
        val.includes('ad - soyad') ||
        val.includes('ogrenci adi soyadi') ||
        val.includes('tam ad'))
    ) {
      fullNameCol = idx;
    }
    // Ad (Ayrı Sütun)
    else if (
      firstNameCol === null &&
      (val === 'ad' ||
        val === 'adi' ||
        val === 'ogrenci ad' ||
        val === 'ogrenci adi' ||
        val === 'ogrencinin adi' ||
        val === 'isim' ||
        val === 'isimi' ||
        val === 'ogrenci ismi')
    ) {
      firstNameCol = idx;
    }
    // Soyad (Ayrı Sütun)
    else if (
      lastNameCol === null &&
      (val === 'soyad' ||
        val === 'soyadi' ||
        val === 'ogrenci soyad' ||
        val === 'ogrenci soyadi' ||
        val === 'ogrencinin soyadi' ||
        val === 'soyisim' ||
        val === 'soyisimi')
    ) {
      lastNameCol = idx;
    }
    // Sınıf / Şube Bileşik (örn: 9-A, 10/B)
    else if (
      combinedClassCol === null &&
      (val.includes('sinif/sube') ||
        val.includes('sinif / sube') ||
        val.includes('sinif-sube') ||
        val === 'subesi' ||
        val.includes('sinifi/subesi'))
    ) {
      combinedClassCol = idx;
    }
    // Sınıf Düzeyi
    else if (
      gradeCol === null &&
      (val.includes('sinif duzeyi') ||
        val === 'sinif' ||
        val === 'sinifi')
    ) {
      gradeCol = idx;
    }
    // Şube
    else if (sectionCol === null && (val === 'sube' || val === 'subesi')) {
      sectionCol = idx;
    }
    // Cinsiyet
    else if (genderCol === null && (val.includes('cinsiyet') || val === 'c')) {
      genderCol = idx;
    }
    // Veli Adı
    else if (parentNameCol === null && (val.includes('veli') && (val.includes('ad') || val.includes('adi')))) {
      parentNameCol = idx;
    }
    // Veli Tel
    else if (
      parentPhoneCol === null &&
      (val.includes('veli tel') ||
        val.includes('veli telefon') ||
        val.includes('veli gsm') ||
        val.includes('veli iletisim'))
    ) {
      parentPhoneCol = idx;
    }
    // Öğrenci Tel
    else if (
      studentPhoneCol === null &&
      (val.includes('ogrenci tel') ||
        val.includes('ogrenci telefon') ||
        val === 'telefon' ||
        val === 'gsm')
    ) {
      studentPhoneCol = idx;
    }
  });

  // Eğer hem Ad hem Soyad ayrı sütunlarda tespit edildiyse, fullNameCol'u sıfırla (ayrı sütunlar önceliklidir)
  if (firstNameCol !== null && lastNameCol !== null) {
    fullNameCol = null;
  } else if (fullNameCol !== null && lastNameCol !== null && firstNameCol === null) {
    // Eğer başlık yanlışlıkla fullNameCol'a takılmış ama soyad sütunu da varsa, fullNameCol aslında firstNameCol'dur
    firstNameCol = fullNameCol;
    fullNameCol = null;
  }

  return {
    mapping: {
      studentNumberCol,
      fullNameCol,
      firstNameCol,
      lastNameCol,
      gradeCol,
      sectionCol,
      combinedClassCol,
      genderCol,
      parentNameCol,
      parentPhoneCol,
      studentPhoneCol,
      startRowIndex: 1,
    },
    startRowIndex: 1,
    reason: 'Kural tabanlı Türkçe okul tablosu eşleştiricisi uygulandı.',
  };
}

/**
 * Gemini API'ye Excel sütun yapısını ve örnek satırları gönderip sütun haritasını ister
 */
async function callGeminiForStudentColumns(
  columns: ColumnSample[],
  sampleRows: any[][],
  sheetTitleHints: string,
  apiKey: string,
  schoolId?: string,
  preferredModel?: string
): Promise<{ mapping: AiStudentColumnMapping; reason: string; modelUsed: string }> {
  const modelsToTry = [
    preferredModel || DEFAULT_GEMINI_MODEL,
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-pro-latest',
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  const prompt = `Sen Türkiye Milli Eğitim Bakanlığı (MEB), e-Okul ve özel okul öğrenci kayıt tabloları konusunda uzman bir yapay zeka veri analistisin.
Aşağıda kullanıcının yüklediği bir Excel dosyasının tespit edilen sütunları ve ilk örnek satırları verilmiştir.

Excel Başlık İpuçları (varsa):
${sheetTitleHints || 'Yok'}

Sütunlar ve Örnek Hücre Değerleri:
${JSON.stringify(columns, null, 2)}

İlk 6 Satırın Ham Hali:
${JSON.stringify(sampleRows.slice(0, 6), null, 2)}

GÖREVİN VE DİKKAT ETMEN GEREKEN KRİTİK KURALLAR:
1. Hangi sütunun hangi öğrenci verisine denk geldiğini 0-tabanlı indeks numarasıyla (0, 1, 2...) tespit et. Eşleşmeyen sütun için null ver.
2. Gerçek öğrenci satırlarının başladığı 0-tabanlı satır indeksini (startRowIndex) belirle (başlık satırlarını ve okul adı/açıklama satırlarını atla).
3. "studentNumberCol": Okul / Öğrenci Numarası sütun indeksi (101, 1042, 542 gibi tam sayılar içerir).

4. ⚠️ ÖĞRENCİ ADI VE SOYADI TESPİTİ (ÇOK ÖNEMLİ):
   Excel dosyalarında öğrencinin adı ve soyadı iki farklı formatta bulunabilir:
   - DURUM A (AYNI SÜTUNDA / BİLEŞİK AD-SOYAD):
     Öğrencinin hem adı hem de soyadı tek bir sütunda birlikte yazılmıştır.
     Örnek Başlıklar: "Adı Soyadı", "Adı ve Soyadı", "Öğrenci Adı Soyadı", "Ad Soyad", "Ad/Soyad"
     Örnek Değerler: "AHMET YILMAZ", "FATMA ZEHRA KAYA", "MEHMET ALİ DEMİR"
     -> Bu durumda: "fullNameCol" = ilgili sütunun indeksi, "firstNameCol" = null, "lastNameCol" = null olmalıdır.
   
   - DURUM B (AYRI SÜTUNLARDA AD VE SOYAD):
     Öğrencinin adı bir sütunda, soyadı ise tamamen ayrı başka bir sütundadır.
     Örnek Başlık 1 (Ad): "Adı", "Ad", "Öğrenci Adı", "Öğrencinin Adı" (Değerler: "AHMET", "FATMA ZEHRA", "MEHMET")
     Örnek Başlık 2 (Soyad): "Soyadı", "Soyad", "Öğrenci Soyadı" (Değerler: "YILMAZ", "KAYA", "DEMİR")
     -> Bu durumda: "firstNameCol" = Ad sütunu indeksi, "lastNameCol" = Soyad sütunu indeksi, "fullNameCol" = null olmalıdır.

   - 🔍 HÜCRE DEĞERLERİNE GÖRE SAĞLAMA YAP:
     Sütunlardaki örnek değerleri mutlaka incele! Eğer bir sütundaki değerler yalnızca isimlerden ("Elif", "Burak") oluşuyorsa ve başka bir sütunda soyisimler ("ŞAHİN", "ÖZTÜRK") yer alıyorsa, bunlar KESİNLİKLE ayrı sütunlardır; Ad sütununu tek başına fullNameCol olarak işaretleme! Tam ad ancak iki kelime birden aynı hücrede yer aldığında fullNameCol kabul edilir.

5. "gradeCol": Sınıf kademesi (9, 10, 11, 12, 1, 2 gibi değerler).
6. "sectionCol": Şube harfi (A, B, C, D gibi harfler).
7. "combinedClassCol": Eğer sınıf ve şube tek bir sütundaysa (örn: "9-A", "10/B", "11 C", "12-Fen A") bu sütunun indeksi.
8. "genderCol": Cinsiyet sütunu (Erkek/Kız, E/K).
9. "parentNameCol": Veli adı soyadı.
10. "parentPhoneCol": Veli telefon numarası.
11. "studentPhoneCol": Öğrenci cep telefonu.
12. "skipKeywords": Öğrenci olmayan satırları elemek için anahtar kelimeler (örn: ["toplam", "sayfa", "öğrenci sayısı", "müdür", "imza"]).
13. "reason": Neden bu sütunları seçtiğini ve Ad-Soyad durumunun aynı sütunda mı yoksa ayrı sütunlarda mı olduğunu belirten kısa ve profesyonel Türkçe özet (1-2 cümle).

YANIT FORMATI: Yalnızca aşağıdaki JSON şemasında çıktı üret:
{
  "studentNumberCol": number | null,
  "fullNameCol": number | null,
  "firstNameCol": number | null,
  "lastNameCol": number | null,
  "gradeCol": number | null,
  "sectionCol": number | null,
  "combinedClassCol": number | null,
  "genderCol": number | null,
  "parentNameCol": number | null,
  "parentPhoneCol": number | null,
  "studentPhoneCol": number | null,
  "startRowIndex": number,
  "reason": string
}`;

  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `Model ${model} HTTP ${res.status}: ${errText}`;
        continue;
      }

      const json = await res.json();
      if (json?.usageMetadata) {
        await recordGeminiApiUsage(model, json.usageMetadata, schoolId);
      }

      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let clean = text.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(clean);
      if (
        typeof parsed.studentNumberCol === 'number' ||
        typeof parsed.fullNameCol === 'number' ||
        typeof parsed.firstNameCol === 'number'
      ) {
        return {
          mapping: {
            studentNumberCol: typeof parsed.studentNumberCol === 'number' ? parsed.studentNumberCol : null,
            fullNameCol: typeof parsed.fullNameCol === 'number' ? parsed.fullNameCol : null,
            firstNameCol: typeof parsed.firstNameCol === 'number' ? parsed.firstNameCol : null,
            lastNameCol: typeof parsed.lastNameCol === 'number' ? parsed.lastNameCol : null,
            gradeCol: typeof parsed.gradeCol === 'number' ? parsed.gradeCol : null,
            sectionCol: typeof parsed.sectionCol === 'number' ? parsed.sectionCol : null,
            combinedClassCol: typeof parsed.combinedClassCol === 'number' ? parsed.combinedClassCol : null,
            genderCol: typeof parsed.genderCol === 'number' ? parsed.genderCol : null,
            parentNameCol: typeof parsed.parentNameCol === 'number' ? parsed.parentNameCol : null,
            parentPhoneCol: typeof parsed.parentPhoneCol === 'number' ? parsed.parentPhoneCol : null,
            studentPhoneCol: typeof parsed.studentPhoneCol === 'number' ? parsed.studentPhoneCol : null,
            startRowIndex: typeof parsed.startRowIndex === 'number' ? parsed.startRowIndex : 1,
          },
          reason: parsed.reason || '✨ Yapay Zeka sütun ve örnek verileri inceleyerek optimum eşleştirmeyi sağladı.',
          modelUsed: model,
        };
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Yapay Zeka sütun analizi tamamlayamadı: ${lastError}`);
}

/**
 * Yapay Zeka (AI) destekli akıllı Excel Öğrenci Yükleme fonksiyonu
 */
export async function parseStudentsFromExcelWithAi(
  fileUri: string,
  options?: {
    schoolId?: string;
    apiKey?: string;
    model?: string;
    selectedSheetName?: string;
  }
): Promise<AiStudentParseResult> {
  try {
    const workbook = await readExcelWorkbook(fileUri);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        success: false,
        students: [],
        detectedClasses: [],
        totalRawRows: 0,
        skippedRowsCount: 0,
        mappingUsed: {
          studentNumberCol: null,
          fullNameCol: null,
          firstNameCol: null,
          lastNameCol: null,
          gradeCol: null,
          sectionCol: null,
          combinedClassCol: null,
          genderCol: null,
          parentNameCol: null,
          parentPhoneCol: null,
          studentPhoneCol: null,
          startRowIndex: 0,
        },
        columnNames: {},
        error: 'Excel dosyasında okunabilir çalışma sayfası bulunamadı.',
      };
    }

    const sheetName =
      options?.selectedSheetName && workbook.SheetNames.includes(options.selectedSheetName)
        ? options.selectedSheetName
        : workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return {
        success: false,
        students: [],
        detectedClasses: [],
        totalRawRows: 0,
        skippedRowsCount: 0,
        mappingUsed: {
          studentNumberCol: null,
          fullNameCol: null,
          firstNameCol: null,
          lastNameCol: null,
          gradeCol: null,
          sectionCol: null,
          combinedClassCol: null,
          genderCol: null,
          parentNameCol: null,
          parentPhoneCol: null,
          studentPhoneCol: null,
          startRowIndex: 0,
        },
        columnNames: {},
        error: `"${sheetName}" sayfası açılamadı.`,
      };
    }

    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (!rawRows || rawRows.length < 2) {
      return {
        success: false,
        students: [],
        detectedClasses: [],
        totalRawRows: rawRows.length,
        skippedRowsCount: 0,
        mappingUsed: {
          studentNumberCol: null,
          fullNameCol: null,
          firstNameCol: null,
          lastNameCol: null,
          gradeCol: null,
          sectionCol: null,
          combinedClassCol: null,
          genderCol: null,
          parentNameCol: null,
          parentPhoneCol: null,
          studentPhoneCol: null,
          startRowIndex: 0,
        },
        columnNames: {},
        error: 'Excel dosyası boş veya yeterli satır içermiyor.',
      };
    }

    // 1. Başlık satırını bul (İlk 15 satırı tara)
    const headerKeywords = ['no', 'okul', 'öğrenci', 'ad', 'soyad', 'sınıf', 'şube', 'cinsiyet', 't.c', 'veli'];
    let bestHeaderRowIdx = 0;
    let bestScore = -1;
    const maxScan = Math.min(rawRows.length, 15);

    let detectedSchoolName: string | undefined = undefined;
    let defaultGradeFromSheet = '9';
    let defaultSectionFromSheet = 'A';

    for (let r = 0; r < maxScan; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      const fullRowText = row.map((c) => String(c || '').trim()).join(' ');

      // Okul adı tespiti
      if (!detectedSchoolName && (fullRowText.includes('LİSESİ') || fullRowText.includes('OKULU') || fullRowText.includes('Müdürlüğü'))) {
        detectedSchoolName = fullRowText.replace(/T\.C\.|Milli Eğitim Bakanlığı|Müdürlüğü/gi, '').trim();
      }

      // Sınıf başlığı tespiti (Örn: "9. Sınıf / A Şubesi" veya "10-C Sınıf Listesi")
      const classHeaderMatch = fullRowText.match(/(\d{1,2})\s*[-./]?\s*(?:Sınıf)?\s*[/ -]?\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*(?:Şubesi|Sınıfı)?/i);
      if (classHeaderMatch) {
        defaultGradeFromSheet = classHeaderMatch[1].trim();
        defaultSectionFromSheet = classHeaderMatch[2].trim().toUpperCase();
      }

      let score = 0;
      const lower = fullRowText.toLowerCase();
      for (const kw of headerKeywords) {
        if (lower.includes(kw)) score += 2;
      }
      const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim().length > 0).length;
      score += Math.min(nonEmpty, 8);

      if (score > bestScore && nonEmpty >= 2) {
        bestScore = score;
        bestHeaderRowIdx = r;
      }
    }

    const headerRow = rawRows[bestHeaderRowIdx] || [];
    const maxCols = Math.max(
      headerRow.length,
      ...rawRows.slice(bestHeaderRowIdx, bestHeaderRowIdx + 10).map((r) => (Array.isArray(r) ? r.length : 0))
    );

    const columnNames: Record<number, string> = {};
    const columnSamples: ColumnSample[] = [];

    for (let c = 0; c < maxCols; c++) {
      const hVal = headerRow[c];
      const headerStr = hVal !== null && hVal !== undefined && String(hVal).trim().length > 0
        ? String(hVal).trim()
        : `Sütun ${c + 1}`;
      columnNames[c] = headerStr;

      const samples: string[] = [];
      for (let r = bestHeaderRowIdx + 1; r < Math.min(rawRows.length, bestHeaderRowIdx + 12); r++) {
        const val = rawRows[r]?.[c];
        if (val !== null && val !== undefined) {
          const str = String(val).trim();
          if (str && !samples.includes(str)) {
            samples.push(str.length > 50 ? str.slice(0, 50) + '...' : str);
            if (samples.length >= 4) break;
          }
        }
      }

      columnSamples.push({
        index: c,
        header: headerStr,
        samples,
      });
    }

    // 2. Yapay Zeka Eşleştirme Çağrısı (Fallback destekli)
    let mapping: AiStudentColumnMapping;
    let aiReason = '';
    let modelUsed = 'Kural Tabanlı Algoritma';

    const apiKey = (options?.apiKey || (await getGeminiApiKey())).trim();
    const modelToUse = options?.model || (await getGeminiModel());

    if (apiKey) {
      try {
        const aiRes = await callGeminiForStudentColumns(
          columnSamples,
          rawRows.slice(bestHeaderRowIdx, bestHeaderRowIdx + 8),
          detectedSchoolName || sheetName,
          apiKey,
          options?.schoolId,
          modelToUse
        );
        mapping = aiRes.mapping;
        aiReason = aiRes.reason;
        modelUsed = aiRes.modelUsed;
      } catch (aiErr: any) {
        console.warn('AI analizi başarısız oldu, kural tabanlı eşleştiriciye geçiliyor:', aiErr?.message);
        const fallback = heuristicColumnMatch(headerRow, rawRows.slice(bestHeaderRowIdx + 1, bestHeaderRowIdx + 6));
        mapping = fallback.mapping;
        mapping.startRowIndex = bestHeaderRowIdx + 1;
        aiReason = `Yapay Zeka çevrimdışı, yerel akıllı eşleştirici uygulandı (${aiErr?.message || 'Bağlantı sağlanamadı'}).`;
      }
    } else {
      const fallback = heuristicColumnMatch(headerRow, rawRows.slice(bestHeaderRowIdx + 1, bestHeaderRowIdx + 6));
      mapping = fallback.mapping;
      mapping.startRowIndex = bestHeaderRowIdx + 1;
      aiReason = 'Gemini API anahtarı girilmediği için yerel akıllı tablo eşleştiricisi uygulandı.';
    }

    // 3. Tespit Edilen Eşleştirmeyi Kullanarak Tüm Satırları Ayrıştırma
    const students: ParsedExcelStudent[] = [];
    const classSet = new Set<string>();
    let skippedRowsCount = 0;

    const startRow = Math.max(mapping.startRowIndex, bestHeaderRowIdx + 1);

    // Güncel sınıf/şube bağlamı (e-Okul gibi gruplu listeler için)
    let currentGrade = defaultGradeFromSheet;
    let currentSection = defaultSectionFromSheet;

    for (let r = startRow; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) {
        skippedRowsCount++;
        continue;
      }

      // Satırın boş veya anlamsız olup olmadığını kontrol et
      const rowText = row.map((c) => String(c || '').trim()).join(' ');
      if (!rowText || rowText.length < 2) {
        skippedRowsCount++;
        continue;
      }

      const lowerRow = rowText.toLowerCase();

      // İptal / dipnot / toplam satırlarını atla
      if (
        lowerRow.includes('toplam') ||
        lowerRow.includes('öğrenci sayısı') ||
        lowerRow.includes('müdür') ||
        lowerRow.includes('sayfa :') ||
        lowerRow.includes('sayfa:') ||
        lowerRow.includes('tasdikname') ||
        lowerRow.includes('rapor tarihi')
      ) {
        skippedRowsCount++;
        continue;
      }

      // Sınıf başlık satırı ara (örn: "AL - 9. Sınıf / A Şubesi" veya "10/B")
      const inlineClassMatch = rowText.match(/(\d{1,2})\s*[-./]?\s*(?:Sınıf)?\s*[/ -]?\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*(?:Şubesi|Sınıfı)?/i);
      if (inlineClassMatch && rowText.includes('Sınıf')) {
        currentGrade = inlineClassMatch[1].trim();
        currentSection = inlineClassMatch[2].trim().toUpperCase();
        classSet.add(`${currentGrade}-${currentSection}`);
        skippedRowsCount++;
        continue;
      }

      // Okul No Çıkar
      let studentNumber = '';
      if (mapping.studentNumberCol !== null && row[mapping.studentNumberCol] !== undefined) {
        const rawNo = String(row[mapping.studentNumberCol]).trim();
        // Sayısal temizlik (örn: 1042.0 -> 1042)
        const match = rawNo.match(/\b\d+\b/);
        if (match) {
          studentNumber = match[0];
        }
      }

      // Eğer numara sütununda bulunamadıysa satırdaki ilk mantıklı sayıyı ara
      if (!studentNumber) {
        for (let c = 0; c < Math.min(row.length, 5); c++) {
          const rawCell = String(row[c] || '').trim();
          const match = rawCell.match(/^\d{1,6}$/);
          if (match && parseInt(match[0], 10) > 0) {
            studentNumber = match[0];
            break;
          }
        }
      }

      // Eğer hala okul numarası yoksa satır öğrenci satırı değildir
      if (!studentNumber) {
        skippedRowsCount++;
        continue;
      }

      // İsim ve Soyisim Çıkar
      let fullName = '';
      if (mapping.fullNameCol !== null && row[mapping.fullNameCol]) {
        fullName = String(row[mapping.fullNameCol]).trim();
      } else if (
        (mapping.firstNameCol !== null && row[mapping.firstNameCol]) ||
        (mapping.lastNameCol !== null && row[mapping.lastNameCol])
      ) {
        const fName = mapping.firstNameCol !== null ? String(row[mapping.firstNameCol] || '').trim() : '';
        const lName = mapping.lastNameCol !== null ? String(row[mapping.lastNameCol] || '').trim() : '';
        fullName = `${fName} ${lName}`.trim();
      }

      // İsim tespit edilemediyse satırdaki metin hücrelerinden derle
      if (!fullName) {
        const textParts: string[] = [];
        for (let c = 0; c < row.length; c++) {
          if (c === mapping.studentNumberCol) continue;
          const val = String(row[c] || '').trim();
          if (val && !/^\d+$/.test(val) && val.length >= 2 && !val.includes('-') && !val.includes('/')) {
            textParts.push(val);
            if (textParts.length >= 2) break;
          }
        }
        fullName = textParts.join(' ').trim() || `Öğrenci ${studentNumber}`;
      }

      // Başlık kelimeleriyle isim karışmışsa atla
      const lowerName = fullName.toLowerCase();
      if (lowerName === 'adı soyadı' || lowerName === 'ad soyad' || lowerName === 'öğrenci adı') {
        skippedRowsCount++;
        continue;
      }

      // Sınıf ve Şube Çıkar
      let grade = currentGrade;
      let section = currentSection;

      if (mapping.combinedClassCol !== null && row[mapping.combinedClassCol]) {
        const classStr = String(row[mapping.combinedClassCol]).trim();
        const parts = classStr.split(/[-/ _]/).filter(Boolean);
        if (parts.length >= 2) {
          grade = parts[0].replace(/[^\d]/g, '') || grade;
          section = parts[1].replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').toUpperCase() || section;
        } else if (classStr.length >= 2) {
          const numMatch = classStr.match(/\d+/);
          const letterMatch = classStr.match(/[A-Za-zÇĞİÖŞÜçğıöşü]+/);
          if (numMatch) grade = numMatch[0];
          if (letterMatch) section = letterMatch[0].toUpperCase();
        }
      } else {
        if (mapping.gradeCol !== null && row[mapping.gradeCol]) {
          const rawG = String(row[mapping.gradeCol]).replace(/[^\d]/g, '').trim();
          if (rawG) grade = rawG;
        }
        if (mapping.sectionCol !== null && row[mapping.sectionCol]) {
          const rawS = String(row[mapping.sectionCol]).replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').trim().toUpperCase();
          if (rawS) section = rawS;
        }
      }

      const className = `${grade}-${section}`;
      classSet.add(className);

      // Cinsiyet
      let gender: string | undefined = undefined;
      if (mapping.genderCol !== null && row[mapping.genderCol]) {
        const rawG = String(row[mapping.genderCol]).trim().toLowerCase();
        if (rawG === 'e' || rawG.startsWith('erk')) gender = 'Erkek';
        else if (rawG === 'k' || rawG.startsWith('kız') || rawG.startsWith('kiz')) gender = 'Kız';
      }

      // Veli Bilgileri
      const parentName =
        mapping.parentNameCol !== null && row[mapping.parentNameCol]
          ? String(row[mapping.parentNameCol]).trim()
          : undefined;

      const parentPhone =
        mapping.parentPhoneCol !== null && row[mapping.parentPhoneCol]
          ? String(row[mapping.parentPhoneCol]).trim()
          : undefined;

      const studentPhone =
        mapping.studentPhoneCol !== null && row[mapping.studentPhoneCol]
          ? String(row[mapping.studentPhoneCol]).trim()
          : undefined;

      students.push({
        studentNumber,
        fullName,
        grade,
        section,
        gender,
        parentName,
        parentPhone,
        studentPhone,
      });
    }

    if (students.length === 0) {
      return {
        success: false,
        students: [],
        detectedClasses: [],
        totalRawRows: rawRows.length,
        skippedRowsCount,
        mappingUsed: mapping,
        columnNames,
        aiReason,
        modelUsed,
        sheetName,
        error: 'Excel tablosundan geçerli öğrenci kaydı çıkarılamadı. Sütun başlıklarını kontrol ediniz.',
      };
    }

    return {
      success: true,
      students,
      detectedClasses: Array.from(classSet).sort(),
      schoolName: detectedSchoolName,
      totalRawRows: rawRows.length,
      skippedRowsCount,
      mappingUsed: mapping,
      columnNames,
      aiReason,
      modelUsed,
      sheetName,
    };
  } catch (err: any) {
    return {
      success: false,
      students: [],
      detectedClasses: [],
      totalRawRows: 0,
      skippedRowsCount: 0,
      mappingUsed: {
        studentNumberCol: null,
        fullNameCol: null,
        firstNameCol: null,
        lastNameCol: null,
        gradeCol: null,
        sectionCol: null,
        combinedClassCol: null,
        genderCol: null,
        parentNameCol: null,
        parentPhoneCol: null,
        studentPhoneCol: null,
        startRowIndex: 0,
      },
      columnNames: {},
      error: `Dosya işlenirken hata oluştu: ${err?.message || 'Bilinmeyen hata'}`,
    };
  }
}
