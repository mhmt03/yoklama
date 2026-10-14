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
      let noIdx = -1, nameIdx = -1, surnameIdx = -1, gradeIdx = -1, branchIdx = -1, genderIdx = -1;
      headerRow.forEach((val: any, idx: number) => {
        const str = String(val || '').toLowerCase().trim();
        if (str.includes('okul no') || str.includes('öğrenci no')) noIdx = idx;
        else if (str === 'ad' || str === 'adı') nameIdx = idx;
        else if (str === 'soyad' || str === 'soyadı') surnameIdx = idx;
        else if (str.includes('sınıf düzeyi') || str === 'sınıf') gradeIdx = idx;
        else if (str === 'şube') branchIdx = idx;
        else if (str.includes('cinsiyet')) genderIdx = idx;
      });

      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const rawNo = row[noIdx];
        if (rawNo === undefined || rawNo === null || String(rawNo).trim() === '') continue;

        const studentNumber = String(rawNo).trim();
        const ad = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : '';
        const soyad = surnameIdx !== -1 && row[surnameIdx] ? String(row[surnameIdx]).trim() : '';
        const fullName = `${ad} ${soyad}`.trim() || `Öğrenci ${studentNumber}`;

        let grade = '9';
        let section = 'A';

        if (branchIdx !== -1 && row[branchIdx]) {
          const branchStr = String(row[branchIdx]).trim().toUpperCase();
          const parts = branchStr.split(/[-/]/);
          if (parts.length >= 2) {
            grade = parts[0].trim();
            section = parts[1].trim();
          } else {
            section = branchStr;
          }
        }

        if (gradeIdx !== -1 && row[gradeIdx]) {
          grade = String(row[gradeIdx]).trim();
        }

        const className = `${grade}-${section}`;
        classSet.add(className);

        students.push({
          studentNumber,
          fullName,
          grade,
          section,
          gender: genderIdx !== -1 && row[genderIdx] ? String(row[genderIdx]).trim() : undefined,
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
