import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest } from './apiClient';

export interface ParsedExcelTeacher {
  fullName: string;
  username?: string;
  branch?: string;
  role?: string; // 'TEACHER' | 'STAFF'
  phone?: string;
  email?: string;
  isActive?: boolean;
  assignedClassesJson?: string;
}

export interface ParseTeacherExcelResult {
  success: boolean;
  teachers: ParsedExcelTeacher[];
  error?: string;
}

/**
 * Excel dosyasından öğretmen kadrosunu ayrıştırır.
 * Hem şablon formatını, hem de Raporlar ekranından indirilen kadro raporlarını okuyabilir.
 */
export async function parseTeachersFromExcel(fileUri: string): Promise<ParseTeacherExcelResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(base64, { type: 'base64' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { success: false, teachers: [], error: 'Excel sayfası bulunamadı.' };
    }

    // İlk sayfayı veya 'Öğretmenler' isimli sayfayı seç
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('öğretmen') || n.toLowerCase().includes('ogretmen')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      return { success: false, teachers: [], error: 'Excel dosyası boş görünüyor.' };
    }

    // Başlık satırını tespit et
    let headerRowIdx = -1;
    let nameIdx = -1, surnameIdx = -1, fullNameIdx = -1;
    let usernameIdx = -1, branchIdx = -1, roleIdx = -1;
    let phoneIdx = -1, emailIdx = -1, statusIdx = -1, classesIdx = -1;

    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (!Array.isArray(row)) continue;

      let foundName = false;
      row.forEach((cell: any, idx: number) => {
        const str = String(cell || '').toLowerCase().trim();
        if (
          str.includes('adı soyadı') ||
          str.includes('ad soyad') ||
          str.includes('adı ve soyadı') ||
          str.includes('ad/soyad') ||
          str.includes('öğretmen adı') ||
          str.includes('ogretmen adi') ||
          str === 'öğretmen' ||
          str === 'ogretmen'
        ) {
          fullNameIdx = idx;
          foundName = true;
        } else if (str === 'ad' || str === 'adı') {
          nameIdx = idx;
          foundName = true;
        } else if (str === 'soyad' || str === 'soyadı') {
          surnameIdx = idx;
        } else if (str.includes('kullanıcı adı') || str.includes('kullanici adi') || str === 'kullanıcı' || str === 'username') {
          usernameIdx = idx;
        } else if (str.includes('branş') || str.includes('brans') || str === 'alan' || str === 'ders') {
          branchIdx = idx;
        } else if (str.includes('rol') || str.includes('görev') || str.includes('gorev') || str.includes('unvan')) {
          roleIdx = idx;
        } else if (str.includes('telefon') || str.includes('tel') || str === 'cep' || str === 'gsm') {
          phoneIdx = idx;
        } else if (str.includes('e-posta') || str.includes('eposta') || str.includes('email') || str.includes('mail')) {
          emailIdx = idx;
        } else if (str.includes('durum') || str.includes('aktif') || str.includes('status')) {
          statusIdx = idx;
        } else if (str.includes('atanan sınıf') || str.includes('şube') || str.includes('sube') || str.includes('sınıflar')) {
          classesIdx = idx;
        }
      });

      if (foundName) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return {
        success: false,
        teachers: [],
        error: 'Öğretmen tablosu başlıkları tespit edilemedi. Lütfen geçerli bir öğretmen Excel şablonu yükleyiniz.',
      };
    }

    // Eğer ad ve soyad ayrı sütunlardaysa
    if (nameIdx !== -1 && surnameIdx !== -1) {
      fullNameIdx = -1;
    }

    const teachers: ParsedExcelTeacher[] = [];

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let fullName = '';
      if (fullNameIdx !== -1 && row[fullNameIdx] !== undefined) {
        fullName = String(row[fullNameIdx]).trim();
      } else if (nameIdx !== -1) {
        const ad = row[nameIdx] ? String(row[nameIdx]).trim() : '';
        const soyad = surnameIdx !== -1 && row[surnameIdx] ? String(row[surnameIdx]).trim() : '';
        fullName = `${ad} ${soyad}`.trim();
      }

      // Başlık satırı veya boş satır tekrarlarını atla
      if (!fullName || fullName.toLowerCase().includes('adı soyadı') || fullName.toLowerCase().includes('toplam')) {
        continue;
      }

      const username = usernameIdx !== -1 && row[usernameIdx] ? String(row[usernameIdx]).trim() : undefined;
      const branch = branchIdx !== -1 && row[branchIdx] ? String(row[branchIdx]).trim() : undefined;

      let role = 'TEACHER';
      if (roleIdx !== -1 && row[roleIdx]) {
        const rStr = String(row[roleIdx]).toLowerCase().trim();
        if (rStr.includes('idare') || rStr.includes('müdür') || rStr.includes('mudur') || rStr.includes('staff')) {
          role = 'STAFF';
        }
      }

      const phone = phoneIdx !== -1 && row[phoneIdx] ? String(row[phoneIdx]).trim() : undefined;
      const email = emailIdx !== -1 && row[emailIdx] ? String(row[emailIdx]).trim() : undefined;

      let isActive = true;
      if (statusIdx !== -1 && row[statusIdx] !== undefined) {
        const sStr = String(row[statusIdx]).toLowerCase().trim();
        if (sStr.includes('pasif') || sStr === '0' || sStr === 'hayır' || sStr === 'false') {
          isActive = false;
        }
      }

      const assignedClasses = classesIdx !== -1 && row[classesIdx] ? String(row[classesIdx]).trim() : undefined;

      teachers.push({
        fullName,
        username: username || undefined,
        branch: branch && branch !== '-' && branch !== 'Belirtilmedi' ? branch : undefined,
        role,
        phone: phone && phone !== '-' ? phone : undefined,
        email: email && email !== '-' ? email : undefined,
        isActive,
        assignedClassesJson: assignedClasses && assignedClasses !== '-' ? assignedClasses : undefined,
      });
    }

    if (teachers.length === 0) {
      return {
        success: false,
        teachers: [],
        error: 'Dosyada geçerli öğretmen satırı bulunamadı.',
      };
    }

    return {
      success: true,
      teachers,
    };
  } catch (e: any) {
    return {
      success: false,
      teachers: [],
      error: e.message || 'Excel dosyası işlenirken hata oluştu.',
    };
  }
}

/**
 * Sunucuya ayrıştırılmış öğretmenleri topluca aktarır.
 * Mevcut öğretmenlerin şifresi ve kullanıcı adı kesinlikle korunur!
 */
export async function saveParsedTeachersToServer(
  schoolId: string,
  teachers: ParsedExcelTeacher[]
): Promise<{ success: boolean; message: string; updatedCount?: number; addedCount?: number }> {
  try {
    const res = await apiRequest<{ message: string; updatedCount: number; addedCount: number; total: number }>(
      `schools/${schoolId}/teachers/batch`,
      'POST',
      { teachers }
    );

    if (res.success && res.data) {
      return {
        success: true,
        message: res.data.message || `${teachers.length} öğretmen başarıyla senkronize edildi.`,
        updatedCount: res.data.updatedCount,
        addedCount: res.data.addedCount,
      };
    } else {
      return {
        success: false,
        message: res.error || 'Öğretmenler sunucuya aktarılamadı.',
      };
    }
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Öğretmen aktarımı sırasında hata oluştu.',
    };
  }
}

/**
 * Mevcut tüm öğretmenlerin doldurulduğu Excel şablonu üretip indirir / paylaşır.
 * Kullanıcı bu şablondan mevcut öğretmenleri güncelleyebilir veya yeni öğretmenler ekleyebilir.
 * Mevcut öğretmenlerin şifresi ve kullanıcı adı korunur.
 */
export async function generateTeacherTemplateExcel(existingTeachers?: any[], schoolName?: string): Promise<boolean> {
  const { saveAndShareWorkbook } = await import('../utils/excelService');
  const workbook = XLSX.utils.book_new();

  const header = [
    'Adı Soyadı *',
    'Kullanıcı Adı (Sistem Bilgisi)',
    'Branş',
    'Rol (Öğretmen / İdareci)',
    'Telefon',
    'E-Posta',
    'Durum (Aktif / Pasif)',
  ];

  let rows: (string | number)[][] = [header];

  if (existingTeachers && existingTeachers.length > 0) {
    // Öğretmenleri ada göre alfabetik sırala
    const sorted = [...existingTeachers].sort((a, b) =>
      String(a.fullName || '').localeCompare(String(b.fullName || ''), 'tr')
    );

    for (const t of sorted) {
      rows.push([
        String(t.fullName || '').trim(),
        String(t.username || '').trim(),
        String(t.branch || '').trim(),
        t.role === 'STAFF' ? 'İdareci' : 'Öğretmen',
        String(t.phone || '').trim(),
        String(t.email || '').trim(),
        t.isActive === false ? 'Pasif' : 'Aktif',
      ]);
    }
  } else {
    // Sistemde henüz öğretmen yoksa örnek 3 satır
    rows = [
      header,
      ['Ahmet Yılmaz', '', 'Matematik', 'Öğretmen', '05321112233', 'ahmet@okul.com', 'Aktif'],
      ['Ayşe Demir', '', 'Türkçe', 'Öğretmen', '05332223344', 'ayse@okul.com', 'Aktif'],
      ['Mehmet Kaya', '', 'Fizik', 'İdareci', '05423334455', 'mehmet@okul.com', 'Aktif'],
    ];
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 24 }, // Adı Soyadı
    { wch: 26 }, // Kullanıcı Adı
    { wch: 20 }, // Branş
    { wch: 24 }, // Rol
    { wch: 18 }, // Telefon
    { wch: 24 }, // E-Posta
    { wch: 20 }, // Durum
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğretmenler');

  // Açıklama / Kılavuz sayfası
  const infoRows = [
    ['ÖĞRETMEN KADROSU TOPLU GÜNCELLEME VE YÜKLEME KILAVUZU'],
    [],
    ['1.', 'Mevcut okul öğretmenlerinin bilgileri şablona otomatik doldurulmuştur.'],
    ['2.', 'ÖNEMLİ: Mevcut öğretmenlerin şifresi ve kullanıcı adı KESİNLİKLE KORUNUR, asla sıfırlanmaz veya değişmez.'],
    ['3.', 'Kullanıcı adı sütunu, mevcut öğretmenleri hatasız ve doğrudan eşleştirmek için kullanılır.'],
    ['4.', 'Öğretmenlerin Adı Soyadı, Branş, Rol (Öğretmen / İdareci), Telefon, E-Posta veya Durumunu (Aktif/Pasif) güncelleyebilirsiniz.'],
    ['5.', 'Yeni öğretmen eklemek için tablonun altına yeni satırlar ekleyebilirsiniz.'],
    ['6.', 'Yeni eklenen öğretmenler için sistem otomatik kullanıcı adı ve varsayılan "1234" şifresi tanımlar.'],
    ['7.', 'Düzenlemenizi tamamladıktan sonra Yönetim Paneli -> Öğretmenler -> "Excel" butonu ile yüklediğinizde sistem tüm güncellemeleri kaydeder.'],
  ];

  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet['!cols'] = [{ wch: 8 }, { wch: 85 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Kılavuz');

  const safeSchoolName = schoolName ? schoolName.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]/g, '_') : 'Okul';
  const fileName = `${safeSchoolName}_Ogretmen_Kadro_Sablonu.xlsx`;

  return await saveAndShareWorkbook(workbook, fileName);
}
