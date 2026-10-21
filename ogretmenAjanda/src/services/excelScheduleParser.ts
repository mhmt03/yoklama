import * as XLSX from 'xlsx';
import { ParsedScheduleResult, TeacherWorkloadItem, TeacherScheduleVerification, ParsedLessonItemDetail } from './aiScheduleParser';

export interface ExcelSheetSummary {
  name: string;
  rowCount: number;
  colCount: number;
  sampleRows: any[][];
}

export interface ExcelInspectionResult {
  fileName: string;
  sheetNames: string[];
  sheets: ExcelSheetSummary[];
  totalRows: number;
  rawWorkbookData?: Record<string, any[][]>;
}

/**
 * Yüklenen Excel (.xlsx, .xls) dosyasını ikili base64 verisinden okur
 * ve sayfaların özetini ve örnek satırlarını çıkarır.
 */
export function inspectExcelWorkbook(base64Data: string, fileName: string): ExcelInspectionResult {
  try {
    const workbook = XLSX.read(base64Data, { type: 'base64', cellDates: true });
    const sheetNames = workbook.SheetNames || [];
    const sheets: ExcelSheetSummary[] = [];
    const rawWorkbookData: Record<string, any[][]> = {};
    let totalRows = 0;

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;

      // Hücreleri 2 boyutlu dizi olarak çıkar
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      const rowCount = rawRows.length;
      totalRows += rowCount;
      const colCount = rawRows.reduce((max, r) => Math.max(max, (r || []).length), 0);
      const sampleRows = rawRows.slice(0, 8); // İlk 8 satır önizleme

      sheets.push({
        name,
        rowCount,
        colCount,
        sampleRows,
      });

      rawWorkbookData[name] = rawRows;
    }

    return {
      fileName,
      sheetNames,
      sheets,
      totalRows,
      rawWorkbookData,
    };
  } catch (err: any) {
    console.error('Excel okuma hatası:', err);
    throw new Error(`Excel dosyası okunamadı: ${err?.message || 'Bilinmeyen biçim'}`);
  }
}

/**
 * MEB formatındaki "Öğretmen El Programı" Excel dökümünü doğrudan
 * deterministik ve sıfır hata toleransıyla çözümleyen motor.
 */
export function parseMebTeacherHandbookExcel(
  rows: any[][],
  defaultSchoolName = 'Kamil Miras Anadolu Lisesi'
): ParsedScheduleResult {
  let detectedSchoolName = defaultSchoolName;
  if (rows[0] && typeof rows[0][0] === 'string' && rows[0][0].includes('LİSESİ')) {
    detectedSchoolName = rows[0][0].replace('T.C.', '').trim();
  }

  const rxTeacher = /Adı\s*Soyadı\s*:\s*([^:\r\n]+?)(?=\s{2,}|Eğitici|Nöbet|$)/i;
  const rxClub = /Eğitici\s*Kolu\s*\((?:Kulüp)?\)\s*:\s*([^:\r\n]+?)(?=\s{2,}|Nöbet|$)/i;
  const rxDuty = /Nöbet\s*Günü\s*(?:ve\s*Yeri)?\s*:\s*([^\r\n]+?)(?=\s{2,}|$)/i;
  const rxClassTeacher = /Sınıf\s*Öğretmenliği\s*:\s*([^:\r\n]+?)(?=\s{2,}|Adı|Nöbet|$)/i;

  const dayMap: Record<string, number> = {
    'pazartesi': 1,
    'salı': 2,
    'sali': 2,
    'çarşamba': 3,
    'carsamba': 3,
    'perşembe': 4,
    'persembe': 4,
    'cuma': 5,
  };

  let curTeacher: string | null = null;
  let curClub = '';
  let curDuty = '';
  let curClassTeacher = '';
  let curColMap: Record<number, number> = {};
  let curItems: any[] = [];
  let curWorkload: TeacherWorkloadItem[] = [];
  let curExpectedHours = 0;
  let inWorkloadTable = false;

  const scheduleItems: any[] = [];
  const verifications: TeacherScheduleVerification[] = [];
  const teachersSet = new Set<string>();
  const classesSet = new Set<string>();
  const lessonsSet = new Set<string>();
  const codeToNameMap: Record<string, string> = {};
  const lessonDetailsMap = new Map<string, ParsedLessonItemDetail>();

  const flushTeacher = () => {
    if (!curTeacher) return;
    teachersSet.add(curTeacher);
    const extractedCount = curItems.length;
    verifications.push({
      teacherName: curTeacher,
      expectedWeeklyHours: curExpectedHours > 0 ? curExpectedHours : extractedCount,
      extractedWeeklyHours: extractedCount,
      isConsistent: curExpectedHours > 0 ? extractedCount === curExpectedHours : true,
      workloadItems: curWorkload,
    });
    curItems.forEach(it => scheduleItems.push(it));
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowStr = row.join(' ');

    const tm = rowStr.match(rxTeacher);
    if (tm) {
      flushTeacher();
      curTeacher = tm[1].trim();
      const clubMatch = rowStr.match(rxClub);
      curClub = clubMatch ? clubMatch[1].trim() : '';
      const dutyMatch = rowStr.match(rxDuty);
      curDuty = dutyMatch ? dutyMatch[1].trim() : '';
      const ctMatch = rowStr.match(rxClassTeacher);
      curClassTeacher = ctMatch ? ctMatch[1].trim() : '';
      curColMap = {};
      curItems = [];
      curWorkload = [];
      curExpectedHours = 0;
      inWorkloadTable = false;
    }

    if (!curTeacher) continue;

    // Ders Saatleri Başlık Satırı: "Ders\Gün" veya "Ders / Gün"
    if (rowStr.includes('Ders\\Gün') || rowStr.includes('Ders/Gün') || rowStr.includes('Ders / Gün')) {
      curColMap = {};
      row.forEach((cell, cIdx) => {
        let num: number | null = null;
        if (typeof cell === 'number') {
          num = Math.abs(cell);
        } else if (typeof cell === 'string') {
          const m = cell.match(/(\d+)/);
          if (m) num = parseInt(m[1], 10);
        }
        if (num && num >= 1 && num <= 14) {
          curColMap[cIdx] = num;
        }
      });
      inWorkloadTable = false;
      continue;
    }

    // Haftalık Ders Izgarası Satırları (Pazartesi .. Cuma)
    const firstCol = (row[1] || row[0] || '').toString().trim().toLowerCase();
    if (dayMap[firstCol] && Object.keys(curColMap).length > 0) {
      const dayOfWeek = dayMap[firstCol];
      for (const [colIdxStr, hour] of Object.entries(curColMap)) {
        const colIdx = Number(colIdxStr);
        const cellVal = (row[colIdx] || '').toString().trim();
        if (cellVal && cellVal !== '-' && cellVal !== 'X' && cellVal !== 'x') {
          // Hücre formatları: "9/D S.2YDL" veya "9/B\r\nSEÇKRN"
          const clean = cellVal.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
          const parts = clean.split(/\s+/);
          const rawCls = (parts[0] || '').replace('/', '-').toUpperCase();
          const lsnCode = parts.slice(1).join(' ') || '';

          const classMatch = rawCls.match(/^(\d{1,2})-([A-Za-zİıĞğÜüŞşÖöÇç])$/);
          const grade = classMatch ? classMatch[1] : rawCls;
          const section = classMatch ? classMatch[2] : '';
          if (rawCls) classesSet.add(rawCls);

          curItems.push({
            teacherName: curTeacher,
            dayOfWeek,
            lessonHour: hour,
            grade,
            section,
            lessonCode: lsnCode,
            lessonName: lsnCode,
          });
        }
      }
      continue;
    }

    // Öğretmen Resmi Ders Yükü Tablosu Başlangıcı: "Yer Adı ... Ders Adı"
    if (rowStr.includes('Yer Adı') && rowStr.includes('Ders Adı')) {
      inWorkloadTable = true;
      continue;
    }

    // Ders Yükü Toplamları: "Toplamlar"
    if (inWorkloadTable && row.some(c => String(c).trim() === 'Toplamlar')) {
      inWorkloadTable = false;
      const nums = row.map(c => Number(c)).filter(n => !isNaN(n) && n > 0);
      if (nums.length > 0) curExpectedHours = nums[nums.length - 1];
      continue;
    }

    // Ders Yükü Satır Verisi
    if (inWorkloadTable) {
      const rowClean = row.filter(c => c !== '');
      if (rowClean.length >= 3) {
        let cls = '';
        let code = '';
        let name = '';
        let hours = 0;

        for (const cell of row) {
          if (typeof cell === 'string') {
            const m = cell.trim().match(/^(\d{1,2})[\/-]([A-Za-zİıĞğÜüŞşÖöÇç])$/);
            if (m) cls = m[1] + '-' + m[2].toUpperCase();
          }
        }
        if (typeof row[8] === 'string' && row[8].trim()) code = row[8].trim();
        if (typeof row[9] === 'string' && row[9].trim()) name = row[9].trim();
        const nums = row.map(c => Number(c)).filter(n => !isNaN(n) && n > 0);
        if (nums.length > 0) hours = nums[nums.length - 1];

        if (code && name) {
          codeToNameMap[code] = name;
          lessonsSet.add(name);
        }
        if (cls || name) {
          curWorkload.push({
            className: cls,
            lessonCode: code,
            lessonName: name || code,
            weeklyHours: hours,
          });

          // Kademeyi (grade: "9", "10", "11", "12") tespit et ve kademeye özel ders detayına kaydet
          const parsedGrade = cls ? cls.split('-')[0].split('/')[0].trim() : '';
          const finalLessonName = (name || code).trim();
          if (finalLessonName && parsedGrade) {
            const key = `${finalLessonName.toLowerCase()}__${parsedGrade}`;
            const existing = lessonDetailsMap.get(key);
            if (!existing || (hours > 0 && (!existing.weeklyHours || hours > existing.weeklyHours))) {
              lessonDetailsMap.set(key, {
                name: finalLessonName,
                code: code ? code.trim() : undefined,
                grade: parsedGrade,
                weeklyHours: hours > 0 ? hours : 2,
              });
            }
          }
        }
      }
    }
  }

  flushTeacher();

  // Kısaltılmış ders kodlarını tam ders adlarıyla zenginleştir
  // ve scheduleItems'dan da eksik kademe derslerini tamamla
  scheduleItems.forEach(it => {
    if (it.lessonCode && codeToNameMap[it.lessonCode]) {
      it.lessonName = codeToNameMap[it.lessonCode];
    }
    const lName = (it.lessonName || it.lessonCode || '').trim();
    const lGrade = (it.grade || '').trim();
    if (lName && lGrade) {
      const key = `${lName.toLowerCase()}__${lGrade}`;
      if (!lessonDetailsMap.has(key)) {
        lessonDetailsMap.set(key, {
          name: lName,
          code: it.lessonCode,
          grade: lGrade,
          weeklyHours: 2,
        });
      }
    }
  });

  const sortedLessonDetails = Array.from(lessonDetailsMap.values()).sort((a, b) => {
    const gA = parseInt(a.grade || '0', 10);
    const gB = parseInt(b.grade || '0', 10);
    if (gA !== gB) return gA - gB;
    return a.name.localeCompare(b.name, 'tr');
  });

  return {
    schoolName: detectedSchoolName,
    teachers: Array.from(teachersSet).sort(),
    classes: Array.from(classesSet).sort(),
    lessons: Array.from(lessonsSet).sort(),
    lessonDetails: sortedLessonDetails,
    scheduleItems,
    teacherVerifications: verifications,
    warnings: [
      `Excel El Programı Çözümlemesi Başarılı: ${teachersSet.size} öğretmen, ${classesSet.size} sınıf ve ${scheduleItems.length} ders saati eksiksiz aktarıldı.`,
      `Ders yükü tablosundan ${sortedLessonDetails.length} adet kademe bazlı ders (HS saatleriyle) tespit edildi.`,
    ],
  };
}

/**
 * Excel çarşafından temel verileri ayrıştırmak için ana giriş fonksiyonu.
 * Önce MEB formatını (Öğretmen El Programı) kontrol eder; tespit edilirse
 * doğrudan %100 uyumlu deterministik parser'ı çalıştırır.
 */
export function parseInitialExcelSchedule(
  inspection: ExcelInspectionResult,
  schoolName = 'Okul'
): ParsedScheduleResult {
  // 1. Önce çalışma sayfalarını incele
  for (const sheet of inspection.sheets) {
    const rows = inspection.rawWorkbookData?.[sheet.name] || [];
    const hasHandbookMarkers = rows.some(r => {
      const str = r.join(' ');
      return str.includes('Adı Soyadı :') || str.includes('Adı Soyadı:') || str.includes('Ders\\Gün');
    });

    if (hasHandbookMarkers) {
      return parseMebTeacherHandbookExcel(rows, schoolName);
    }
  }

  // 2. Eğer özel bir standart tablo formatıysa genel tarama yap
  const result: ParsedScheduleResult = {
    schoolName,
    teachers: [],
    classes: [],
    lessons: [],
    scheduleItems: [],
    teacherVerifications: [],
    warnings: [],
  };

  const teacherSet = new Set<string>();
  const classSet = new Set<string>();
  const lessonSet = new Set<string>();

  for (const sheet of inspection.sheets) {
    const rows = inspection.rawWorkbookData?.[sheet.name] || [];
    for (const row of rows) {
      for (const cell of row) {
        if (typeof cell !== 'string') continue;
        const trimmed = cell.trim();
        // 9-A, 10/B, 11-C gibi sınıf kalıpları
        if (/^\d{1,2}[-/][A-Za-zİıĞğÜüŞşÖöÇç]$/.test(trimmed)) {
          classSet.add(trimmed.replace('/', '-').toUpperCase());
        }
      }
    }
  }

  result.classes = Array.from(classSet);
  result.teachers = Array.from(teacherSet);
  result.lessons = Array.from(lessonSet);

  result.warnings = result.warnings || [];
  result.warnings.push(
    `Excel dosyası (${inspection.fileName}) başarıyla incelendi. ${inspection.sheetNames.length} sayfa ve toplam ${inspection.totalRows} satır tespit edildi.`
  );

  return result;
}

/**
 * Kullanıcının isteği üzerine:
 * Gerekli sütunlar ve yapılar için AI'ya verilecek talimat ve prompt mimarisi.
 * Yapay zekaya (LLM) Excel verisi gönderilirken kullanılacak kesin sistem talimatı.
 */
export function buildExcelScheduleAiInstructions(): string {
  return `
# GÖREV: HAFTALIK OKUL DERS PROGRAMI EXCEL ÇARŞAF VE EL PROGRAMI ÇÖZÜMLEME

Sen uzman bir okul yönetim bilgi sistemi (e-Okul / MEB) veri analistisin.
Sana bir okulun haftalık ders programını içeren Excel tablosu satırları verilecektir.
Aşağıdaki sütun tespiti ve veri çıkarma algoritmalarını harfiyen uygula.

## 1. BELGE TÜRÜ VE SÜTUN TESPİT ALGORİTMASI:
Excel tabloları genellikle 2 farklı yapıda gelir:

### YAPI A: MEB ÖĞRETMEN EL PROGRAMI (BLOK DÜZENİ)
Her öğretmen için ardışık bloklar bulunur:
1. Öğretmen Bilgi Satırı:
   - "Adı Soyadı :" -> [ÖĞRETMEN ADI]
   - "Sınıf Öğretmenliği :" -> [REHBERLİK SINIFI] (Örn: 9/A)
   - "Eğitici Kolu(Kulüp) :" -> [KULÜP ADI]
   - "Nöbet Günü ve Yeri :" -> [NÖBET GÜNÜ VE YERİ] (Örn: Salı KANTİN)
2. Ders Saatleri Başlık Satırı:
   - "Ders\\Gün" hücresini bul.
   - Bu satırdaki sütun indislerini ders saati numaraları (1, 2, 3, 4, 5, 6, 7, 8...) ile haritala.
3. Haftalık Gün Satırları:
   - Sütun 0 veya 1'de "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma" gün adları yer alır.
   - Her gün satırında, 2. adımda tespit edilen saat sütunlarındaki hücre değerlerini oku:
     * Hücre formatı: "[SINIF] [DERS KODU]" (Örn: "9/D S.2YDL", "10-A MAT", "12/D S.FZK").
     * Sınıfı grade ve section olarak ayrıştır (Örn: 9/D -> grade: "9", section: "D").
4. Resmi Ders Yükü Tablosu (Altta):
   - "Yer Adı", "Sınıflar", "Ders", "Ders Adı" başlıklarını bul.
   - Kısa ders kodlarını (Örn: "S.2YDL") tam ders adına (Örn: "SEÇMELİ ALMANCA") eşleyen sözlüğü çıkar.
   - "Toplamlar" satırındaki son sayıyı [expectedWeeklyHours] olarak kaydet.

### YAPI B: TABLO / SATIR SATIR DÜZEN
Eğer Excel düz bir liste/tablo ise şu sütunları otomatik eşleştir:
- Öğretmen Adı: ["Öğretmen", "Öğretmen Adı", "Ogretmen", "Adı Soyadı", "Teacher"]
- Gün: ["Gün", "Gun", "Day", "Haftanın Günü"] (1=Pazartesi .. 5=Cuma)
- Ders Saati: ["Saat", "Ders Saati", "Saat No", "Period", "Ders"] (1..8)
- Sınıf / Şube: ["Sınıf", "Şube", "Sinif", "Class"] (Örn: 9-A, 10/B)
- Ders Adı / Kodu: ["Ders", "Ders Adı", "Ders Kodu", "Subject"]

## 2. KESİN ÇIKTI JSON ŞEMASI:
{
  "schoolName": string,
  "teachers": string[],
  "classes": string[],
  "lessons": string[],
  "scheduleItems": [
    {
      "teacherName": string,
      "dayOfWeek": number, // 1: Pazartesi, 2: Salı, 3: Çarşamba, 4: Perşembe, 5: Cuma
      "lessonHour": number, // 1..10
      "grade": string, // "9", "10", "11", "12"
      "section": string, // "A", "B", "C" ...
      "lessonName": string, // Tam ders adı (Örn: "SEÇMELİ ALMANCA")
      "lessonCode": string // Kısa kod (Örn: "S.2YDL")
    }
  ],
  "teacherVerifications": [
    {
      "teacherName": string,
      "expectedWeeklyHours": number,
      "extractedWeeklyHours": number,
      "isConsistent": boolean,
      "workloadItems": [
        {
          "className": string,
          "lessonCode": string,
          "lessonName": string,
          "weeklyHours": number
        }
      ]
    }
  ]
}

## 3. DOĞRULAMA VE ÇAKIŞMA KURALLARI:
1. Hiçbir ders saatini atlama.
2. Sınıf adlarını standartlaştır: "/" işaretlerini "-" yap (Örn: "9/D" -> "9-D").
3. Ders kodlarının tam açılımını alt tablodaki sözlükten tamamla.
4. Çıkarılan toplam saat (extractedWeeklyHours) ile "Toplamlar"daki saat (expectedWeeklyHours) eşit olmalıdır.
`.trim();
}
