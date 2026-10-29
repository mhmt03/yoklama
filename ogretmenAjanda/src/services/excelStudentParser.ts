import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest } from './apiClient';

export interface ParsedExcelStudent {
  studentNumber: string;
  fullName: string;
  grade: string;
  section: string;
  gender?: string;
  parentName?: string;
  parentPhone?: string;
  studentPhone?: string;
}

export interface ParseExcelResult {
  success: boolean;
  students: ParsedExcelStudent[];
  detectedClasses: string[];
  schoolName?: string;
  error?: string;
}

export function normalizeGradeAndSection(rawGrade?: string, rawSection?: string): { grade: string; section: string } {
  const g = (rawGrade || '').trim();
  const s = (rawSection || '').trim();

  const matchS = s.match(/^(\d{1,2})[-/.\s]*([A-Za-zÇĞİÖŞÜçğıöşü]+)$/i);
  if (matchS) {
    return { grade: matchS[1], section: matchS[2].toUpperCase() };
  }

  const matchG = g.match(/^(\d{1,2})[-/.\s]*([A-Za-zÇĞİÖŞÜçğıöşü]+)$/i);
  if (matchG) {
    const finalSec = s && s.length <= 2 ? s.toUpperCase() : matchG[2].toUpperCase();
    return { grade: matchG[1], section: finalSec };
  }

  const numG = g.match(/\d+/);
  let cleanGrade = numG ? numG[0] : g;

  let cleanSection = s.replace(/şubesi/gi, '').replace(/şube/gi, '').trim().toUpperCase();
  if (!cleanGrade && cleanSection) {
    const numS = cleanSection.match(/\d+/);
    if (numS) {
      cleanGrade = numS[0];
      cleanSection = cleanSection.replace(/\d+/g, '').trim();
    }
  }

  return {
    grade: cleanGrade || '9',
    section: cleanSection || 'A',
  };
}

/**
 * Parses both standard table Excel files (ogrenci listesi.XLS)
 * and official e-Okul printable class list formats (okul liste.XLS).
 */
export async function parseStudentsFromExcel(fileUri: string): Promise<ParseExcelResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(base64, { type: 'base64' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { success: false, students: [], detectedClasses: [], error: 'Excel sayfası bulunamadı.' };
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      return { success: false, students: [], detectedClasses: [], error: 'Excel dosyası boş görünüyor.' };
    }

    const students: ParsedExcelStudent[] = [];
    const classSet = new Set<string>();
    let detectedSchoolName: string | undefined = undefined;

    // Format 1: Standart Tablo Başlıklı Format (ogrenci listesi.XLS)
    // Örn: Sınıf Düzeyi | Şube | Okul No | Ad | Soyad | CİNSİYET
    const headerRow = rawData[0] || [];
    const isStandardTable = headerRow.some((cell: any) =>
      typeof cell === 'string' &&
      (cell.includes('Okul No') || cell.includes('Öğrenci No') || cell.includes('Sınıf Düzeyi'))
    );

    if (isStandardTable) {
      // Sütun indekslerini tespit et
      let noIdx = -1, nameIdx = -1, surnameIdx = -1, fullNameIdx = -1, gradeIdx = -1, branchIdx = -1, genderIdx = -1;
      let parentNameIdx = -1, parentPhoneIdx = -1, studentPhoneIdx = -1;
      headerRow.forEach((val: any, idx: number) => {
        const str = String(val || '').toLowerCase().trim();
        if (str.includes('okul no') || str.includes('öğrenci no') || str === 'no') noIdx = idx;
        else if (
          str.includes('ad soyad') ||
          str.includes('adı soyadı') ||
          str.includes('adı ve soyadı') ||
          str.includes('ad/soyad') ||
          str.includes('ad-soyad')
        ) fullNameIdx = idx;
        else if (str === 'ad' || str === 'adı' || str === 'öğrenci adı' || str === 'öğrencinin adı') nameIdx = idx;
        else if (str === 'soyad' || str === 'soyadı' || str === 'öğrenci soyadı' || str === 'öğrencinin soyadı') surnameIdx = idx;
        else if (str.includes('sınıf düzeyi') || str === 'sınıf' || str === 'sınıfı') gradeIdx = idx;
        else if (str === 'şube' || str === 'şubesi') branchIdx = idx;
        else if (str.includes('cinsiyet')) genderIdx = idx;
        else if (str.includes('veli adı') || str.includes('veli ad') || str === 'veli') parentNameIdx = idx;
        else if (str.includes('veli tel') || str.includes('veli telefon') || str.includes('veli cep')) parentPhoneIdx = idx;
        else if (str.includes('öğrenci tel') || str.includes('öğrenci telefon') || str.includes('öğrenci cep') || str === 'telefon') studentPhoneIdx = idx;
      });

      // Eğer hem ad hem soyad ayrı sütunlardaysa, fullNameIdx'i iptal et
      if (nameIdx !== -1 && surnameIdx !== -1) {
        fullNameIdx = -1;
      }

      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const rawNo = row[noIdx];
        if (rawNo === undefined || rawNo === null || String(rawNo).trim() === '') continue;

        const studentNumber = String(rawNo).trim();
        let fullName = '';
        if (fullNameIdx !== -1 && row[fullNameIdx]) {
          fullName = String(row[fullNameIdx]).trim();
        } else {
          const ad = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : '';
          const soyad = surnameIdx !== -1 && row[surnameIdx] ? String(row[surnameIdx]).trim() : '';
          fullName = `${ad} ${soyad}`.trim();
        }
        if (!fullName) fullName = `Öğrenci ${studentNumber}`;

        const rawGradeVal = gradeIdx !== -1 && row[gradeIdx] ? String(row[gradeIdx]) : '';
        const rawBranchVal = branchIdx !== -1 && row[branchIdx] ? String(row[branchIdx]) : '';
        const { grade, section } = normalizeGradeAndSection(rawGradeVal, rawBranchVal);

        const className = `${grade}-${section}`;
        classSet.add(className);

        const parentName = parentNameIdx !== -1 && row[parentNameIdx] ? String(row[parentNameIdx]).trim() : undefined;
        const parentPhone = parentPhoneIdx !== -1 && row[parentPhoneIdx] ? String(row[parentPhoneIdx]).trim() : undefined;
        const studentPhone = studentPhoneIdx !== -1 && row[studentPhoneIdx] ? String(row[studentPhoneIdx]).trim() : undefined;

        students.push({
          studentNumber,
          fullName,
          grade,
          section,
          gender: genderIdx !== -1 && row[genderIdx] ? String(row[genderIdx]).trim() : undefined,
          parentName: parentName || undefined,
          parentPhone: parentPhone || undefined,
          studentPhone: studentPhone || undefined,
        });
      }
    } else {
      // Format 2: e-Okul Yazdırılabilir Sınıf Listesi Formatı (okul liste.XLS)
      // Başlıklarda "AL - 9. Sınıf / A Şubesi Sınıf Listesi" ve okul adı geçer.
      let currentGrade = '9';
      let currentSection = 'A';

      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const firstCell = String(row[0] || '').trim();

        // Okul Adı tespiti (Örn: Kamil Miras Anadolu Lisesi)
        if (!detectedSchoolName && firstCell.includes('Müdürlüğü')) {
          const lines = firstCell.split('\n');
          for (const line of lines) {
            if (line.includes('Lisesi') || line.includes('Okulu') || line.includes('İlkokulu') || line.includes('Ortaokulu')) {
              detectedSchoolName = line.replace(/Müdürlüğü/g, '').trim();
            }
          }
        }

        // Sınıf / Şube tespiti (Örn: "AL -  9. Sınıf / A Şubesi")
        const classMatch = firstCell.match(/(\d+)\.\s*Sınıf\s*\/\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*Şubesi/i);
        if (classMatch) {
          currentGrade = classMatch[1].trim();
          currentSection = classMatch[2].trim().toUpperCase();
          classSet.add(`${currentGrade}-${currentSection}`);
          continue;
        }

        // Öğrenci Satırı (Öğrenci No genelde sütun 1'de, Ad sütun 3'te, Soyad sütun 7'de bulunur)
        const possibleNo = parseInt(String(row[1]));
        if (!isNaN(possibleNo) && possibleNo > 0) {
          // İsim ve Soyisim bulma
          let name = '';
          let surname = '';
          let gender = '';

          for (let c = 2; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim();
            if (!cellVal) continue;

            if (!name) {
              name = cellVal;
            } else if (!surname && c >= 5) {
              surname = cellVal;
            } else if (cellVal === 'Kız' || cellVal === 'Erkek') {
              gender = cellVal;
            }
          }

          const fullName = `${name} ${surname}`.trim() || `Öğrenci ${possibleNo}`;
          const studentNumber = String(possibleNo);

          classSet.add(`${currentGrade}-${currentSection}`);
          students.push({
            studentNumber,
            fullName,
            grade: currentGrade,
            section: currentSection,
            gender: gender || undefined,
          });
        }
      }
    }

    return {
      success: true,
      students,
      detectedClasses: Array.from(classSet).sort(),
      schoolName: detectedSchoolName,
    };
  } catch (error: any) {
    return {
      success: false,
      students: [],
      detectedClasses: [],
      error: error.message || 'Excel dosyası ayrıştırılamadı.',
    };
  }
}

/**
 * Saves all parsed students directly to the server via batch sync.
 */
export async function saveParsedStudentsToServer(
  schoolId: string,
  students: ParsedExcelStudent[]
): Promise<{ success: boolean; message: string }> {
  try {
    const payload = {
      schoolId,
      students: students.map(s => ({
        studentNumber: s.studentNumber,
        fullName: s.fullName,
        grade: s.grade,
        section: s.section,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        studentPhone: s.studentPhone,
      })),
    };

    const res = await apiRequest('sync/students/batch', 'POST', payload);
    if (res.success) {
      return {
        success: true,
        message: `${students.length} öğrenci başarıyla sunucuya kaydedildi.`,
      };
    } else {
      return {
        success: false,
        message: res.error || 'Öğrenciler sunucuya aktarılamadı.',
      };
    }
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Öğrenci aktarımı sırasında hata oluştu.',
    };
  }
}

/**
 * Öğrenci listesi Excel şablonu oluşturup cihazda paylaşılmasını / indirilmesini sağlar.
 * Eğer sistemde mevcut öğrenciler varsa onları şablona doldurur, böylece kullanıcı
 * mevcut verileri güncelleyip tekrar Excel ile sisteme yükleyebilir.
 */
export async function generateStudentTemplateExcel(existingStudents?: any[], schoolName?: string): Promise<boolean> {
  const { saveAndShareWorkbook } = await import('../utils/excelService');
  const workbook = XLSX.utils.book_new();

  const header = [
    'Öğrenci No *',
    'Adı *',
    'Soyadı *',
    'Sınıf Düzeyi (örn: 9, 10, 11) *',
    'Şube (örn: A, B, C) *',
    'Cinsiyet (Erkek/Kız)',
    'Veli Adı',
    'Veli Telefonu',
    'Öğrenci Telefonu',
  ];

  let rows: (string | number)[][] = [header];

  if (existingStudents && existingStudents.length > 0) {
    // Öğrencileri Sınıf Düzeyi, Şube ve Okul Numarasına göre sırala
    const sorted = [...existingStudents].sort((a, b) => {
      const gA = parseInt(String(a.grade || a.grade_level || 0), 10) || 0;
      const gB = parseInt(String(b.grade || b.grade_level || 0), 10) || 0;
      if (gA !== gB) return gA - gB;
      const secA = String(a.section || a.class_name || '').localeCompare(String(b.section || b.class_name || ''), 'tr');
      if (secA !== 0) return secA;
      const noA = parseInt(String(a.studentNumber || a.student_number || 0), 10) || 0;
      const noB = parseInt(String(b.studentNumber || b.student_number || 0), 10) || 0;
      return noA - noB;
    });

    for (const s of sorted) {
      const studentNo = String(s.studentNumber || s.student_number || s.number || '').trim();
      let firstName = String(s.first_name || '').trim();
      let lastName = String(s.last_name || '').trim();

      if (!firstName && !lastName && s.fullName) {
        const parts = String(s.fullName).trim().split(/\s+/);
        if (parts.length > 1) {
          lastName = parts.pop() || '';
          firstName = parts.join(' ');
        } else {
          firstName = parts[0] || '';
          lastName = '';
        }
      }

      let grade = String(s.grade !== undefined && s.grade !== null ? s.grade : (s.grade_level !== undefined && s.grade_level !== null ? s.grade_level : '')).trim();
      let section = String(s.section || '').trim();

      if (!section && s.class_name) {
        const m = String(s.class_name).match(/^(\d{1,2})[-/]?([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/i);
        if (m) {
          if (!grade) grade = m[1];
          section = m[2].toUpperCase();
        } else {
          section = String(s.class_name).trim();
        }
      }

      rows.push([
        studentNo,
        firstName,
        lastName,
        grade,
        section,
        s.gender || '',
        s.parentName || s.parent_name || '',
        s.parentPhone || s.parent_phone || '',
        s.studentPhone || s.student_phone || '',
      ]);
    }
  } else {
    // Sistemde henüz kayıtlı öğrenci yoksa rehber olması için örnek 3 satır
    rows = [
      header,
      ['101', 'Ahmet', 'Yılmaz', '9', 'A', 'Erkek', 'Mehmet Yılmaz', '05321112233', '05554443322'],
      ['102', 'Ayşe', 'Demir', '9', 'A', 'Kız', 'Fatma Demir', '05332223344', '05553332211'],
      ['201', 'Burak', 'Kaya', '10', 'B', 'Erkek', 'Ali Kaya', '05423334455', ''],
    ];
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
    { wch: 26 },
    { wch: 20 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Listesi');

  // Açıklama sayfası
  const infoRows = [
    ['ÖĞRENCİ LİSTESİ TOPLU GÜNCELLEME VE YÜKLEME KILAVUZU'],
    [],
    ['1.', 'Mevcut öğrencilerin bilgileri şablona otomatik doldurulmuştur.'],
    ['2.', 'Mevcut öğrencinin numarasını koruyarak adını, soyadını, şubesini, veli veya telefon bilgilerini güncelleyebilirsiniz.'],
    ['3.', 'Yeni öğrenci eklemek için tablonun altına yeni satırlar ekleyebilirsiniz.'],
    ['4.', 'Yıldızlı (*) alanların doldurulması zorunludur (Öğrenci No, Ad, Soyad, Sınıf Düzeyi, Şube).'],
    ['5.', 'Düzenlemenizi tamamladıktan sonra Yönetim Paneli -> Öğrenciler -> "Excel" butonu ile yüklediğinizde sistem mevcut kayıtları güncelleyecek ve yenileri ekleyecektir.'],
    ['6.', 'e-Okuldan aldığınız resmi sınıf/okul listesi Excel dosyalarını doğrudan da yükleyebilirsiniz.'],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet['!cols'] = [{ wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Kılavuz');

  const safeSchoolName = schoolName ? schoolName.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]/g, '_') : 'Okul';
  const fileName = `${safeSchoolName}_Ogrenci_Guncelleme_Sablonu.xlsx`;

  return await saveAndShareWorkbook(workbook, fileName);
}
