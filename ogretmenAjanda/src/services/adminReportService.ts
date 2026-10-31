import * as XLSX from 'xlsx';
import { saveAndShareWorkbook } from '../utils/excelService';
import { isTeacherMatch } from '../utils/teacherUtils';

export interface ReportSchoolInfo {
  id: string;
  name: string;
  code?: string;
  phone?: string;
  address?: string;
}

const DAY_NAMES: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
  7: 'Pazar',
};

/**
 * Format string helper for safe cell display
 */
const safeStr = (val: any) => (val === undefined || val === null ? '' : String(val).trim());

/**
 * Auto-fit column widths based on maximum length of cell strings
 */
function calculateColWidths(data: any[][]): Array<{ wch: number }> {
  const colWidths: number[] = [];
  data.forEach((row) => {
    row.forEach((cell, colIdx) => {
      const len = cell ? String(cell).length : 0;
      if (!colWidths[colIdx] || len > colWidths[colIdx]) {
        colWidths[colIdx] = len;
      }
    });
  });
  return colWidths.map((w) => ({ wch: Math.min(Math.max(w + 3, 10), 55) }));
}

/**
 * 1. Öğretmenler ve Görev Dağılımı Excel Raporu
 */
export async function exportTeachersReport(params: {
  school: ReportSchoolInfo;
  teachers: any[];
  filterBranch?: string;
  filterRole?: string;
  filterActive?: string;
}): Promise<boolean> {
  const { school, teachers, filterBranch, filterRole, filterActive } = params;

  let filtered = [...teachers];
  if (filterBranch && filterBranch !== 'all') {
    filtered = filtered.filter((t) => (t.branch || '').toLowerCase() === filterBranch.toLowerCase());
  }
  if (filterRole && filterRole !== 'all') {
    filtered = filtered.filter((t) => t.role === filterRole);
  }
  if (filterActive && filterActive !== 'all') {
    const isAct = filterActive === 'active';
    filtered = filtered.filter((t) => (t.isActive ?? true) === isAct);
  }

  const rows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - ÖĞRETMEN KADROSU & GÖREV DAĞILIMI RAPORU`],
    [`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, `Toplam Öğretmen: ${filtered.length}`],
    [],
    [
      'Sıra No',
      'Adı Soyadı',
      'Kullanıcı Adı',
      'Rol',
      'Branş',
      'Atanan Sınıflar / Şubeler',
      'Telefon',
      'E-Posta',
      'Durum',
      'Öğrenci Mesajlaşma',
      'Öğretmen Mesajlaşma',
      'Veli Mesajlaşma',
      'Kayıt Tarihi',
      'Son Giriş Tarihi',
    ],
  ];

  filtered.forEach((t, idx) => {
    let perms: any = {};
    if (t.permissionsJson) {
      try {
        perms = JSON.parse(t.permissionsJson);
      } catch (e) {}
    }

    rows.push([
      idx + 1,
      safeStr(t.fullName),
      safeStr(t.username),
      t.role === 'STAFF' ? 'İdareci / Müdür Yrd.' : 'Öğretmen',
      safeStr(t.branch || 'Belirtilmedi'),
      safeStr(t.assignedClassesJson || '-'),
      safeStr(t.phone || '-'),
      safeStr(t.email || '-'),
      t.isActive === false ? 'Pasif' : 'Aktif',
      perms.canMessageStudents === false ? 'Kapalı' : 'Açık',
      perms.canMessageTeachers === false ? 'Kapalı' : 'Açık',
      perms.canMessageParents === false ? 'Kapalı' : 'Açık',
      t.createdAt ? new Date(t.createdAt).toLocaleDateString('tr-TR') : '-',
      t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleString('tr-TR') : 'Hiç giriş yapmadı',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Öğretmenler');

  const fileName = `Ogretmen_Kadrosu_${school.code || 'Okul'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 2. Öğrenci Listesi ve İletişim Excel Raporu
 */
export async function exportStudentsReport(params: {
  school: ReportSchoolInfo;
  students: any[];
  filterGrade?: string;
  filterSection?: string;
  search?: string;
}): Promise<boolean> {
  const { school, students, filterGrade, filterSection, search } = params;

  let filtered = [...students];
  if (filterGrade && filterGrade !== 'all') {
    filtered = filtered.filter((s) => String(s.grade) === String(filterGrade));
  }
  if (filterSection && filterSection !== 'all') {
    filtered = filtered.filter((s) => (s.section || '').toUpperCase() === filterSection.toUpperCase());
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        (s.fullName || '').toLowerCase().includes(q) ||
        (s.studentNumber || '').toLowerCase().includes(q) ||
        (s.parentName || '').toLowerCase().includes(q)
    );
  }

  // Sınıf, şube ve no'ya göre sırala
  filtered.sort((a, b) => {
    const gA = Number(a.grade) || 0;
    const gB = Number(b.grade) || 0;
    if (gA !== gB) return gA - gB;
    const sA = (a.section || '').localeCompare(b.section || '');
    if (sA !== 0) return sA;
    const nA = Number(a.studentNumber) || 0;
    const nB = Number(b.studentNumber) || 0;
    return nA - nB;
  });

  const rows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - ÖĞRENCİ KÜNYE & İLETİŞİM LİSTESİ`],
    [`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, `Filtrelenen Öğrenci: ${filtered.length} / ${students.length}`],
    [],
    [
      'Sıra No',
      'Öğrenci No',
      'Adı Soyadı',
      'Sınıfı',
      'Kademe',
      'Şube',
      'Veli Adı Soyadı',
      'Veli Telefonu',
      'Öğrenci Telefonu',
      'Fotoğraf Durumu',
    ],
  ];

  filtered.forEach((s, idx) => {
    const fullClass = s.grade && s.section ? `${s.grade}-${s.section}` : safeStr(s.grade || s.section);
    rows.push([
      idx + 1,
      safeStr(s.studentNumber),
      safeStr(s.fullName),
      fullClass,
      safeStr(s.grade),
      safeStr(s.section),
      safeStr(s.parentName || '-'),
      safeStr(s.parentPhone || '-'),
      safeStr(s.studentPhone || '-'),
      s.photoPath ? 'Mevcut' : 'Yok',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Öğrenciler');

  const fileName = `Ogrenci_Listesi_${school.code || 'Okul'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 3. Sınıflar ve Şubeler Dağılım Excel Raporu
 */
export async function exportClassesReport(params: {
  school: ReportSchoolInfo;
  classes: any[];
  students: any[];
  filterGrade?: string;
}): Promise<boolean> {
  const { school, classes, students, filterGrade } = params;

  let filtered = [...classes];
  if (filterGrade && filterGrade !== 'all') {
    filtered = filtered.filter((c) => String(c.grade) === String(filterGrade));
  }

  // Kademeye ve şubeye göre sırala
  filtered.sort((a, b) => {
    const gA = Number(a.grade) || 0;
    const gB = Number(b.grade) || 0;
    if (gA !== gB) return gA - gB;
    return (a.section || '').localeCompare(b.section || '');
  });

  const rows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - SINIF & ŞUBE KAPASİTE RAPORU`],
    [`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, `Toplam Sınıf/Şube: ${filtered.length}`],
    [],
    ['Sıra No', 'Sınıf Adı', 'Kademe', 'Şube', 'Kayıtlı Öğrenci Sayısı', 'Eğitim-Öğretim Yılı'],
  ];

  let totalStudents = 0;
  filtered.forEach((c, idx) => {
    const count =
      c.studentCount !== undefined
        ? c.studentCount
        : students.filter((s) => String(s.grade) === String(c.grade) && (s.section || '').toUpperCase() === (c.section || '').toUpperCase()).length;

    totalStudents += Number(count) || 0;
    rows.push([
      idx + 1,
      `${c.grade}-${c.section}`,
      safeStr(c.grade),
      safeStr(c.section),
      Number(count) || 0,
      safeStr(c.academicYear || '2024-2025'),
    ]);
  });

  rows.push([]);
  rows.push(['TOPLAM', `${filtered.length} Şube`, '', '', totalStudents, '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sınıflar');

  const fileName = `Siniflar_Subeler_${school.code || 'Okul'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 4. Dersler ve Yıllık Plan Durumu Excel Raporu
 */
export async function exportLessonsReport(params: {
  school: ReportSchoolInfo;
  lessons: any[];
  yearlyPlans: any[];
  filterGrade?: string;
  filterPlanStatus?: 'all' | 'has_plan' | 'no_plan';
}): Promise<boolean> {
  const { school, lessons, yearlyPlans, filterGrade, filterPlanStatus } = params;

  let filtered = [...lessons];
  if (filterGrade && filterGrade !== 'all') {
    filtered = filtered.filter((l) => String(l.grade) === String(filterGrade));
  }

  // Yıllık plan eşleşmesi
  const lessonRows = filtered.map((lesson) => {
    const plans = yearlyPlans.filter(
      (p) =>
        (p.lessonName || '').trim().toLowerCase() === (lesson.name || '').trim().toLowerCase() &&
        (!lesson.grade || !p.grade || String(p.grade) === String(lesson.grade))
    );
    const hasPlan = plans.length > 0;
    const weekCount = plans.length;
    return {
      lesson,
      hasPlan,
      weekCount,
      plans,
    };
  });

  let displayItems = lessonRows;
  if (filterPlanStatus === 'has_plan') {
    displayItems = displayItems.filter((i) => i.hasPlan);
  } else if (filterPlanStatus === 'no_plan') {
    displayItems = displayItems.filter((i) => !i.hasPlan);
  }

  const rows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - OKUL DERSLERİ & YILLIK PLAN DURUM RAPORU`],
    [`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, `Toplam Ders: ${displayItems.length}`],
    [],
    [
      'Sıra No',
      'Ders Adı',
      'Kısa Kod',
      'Kademe',
      'Haftalık Ders Saati',
      'Yıllık Plan Durumu',
      'Planlanan Hafta Sayısı',
      'İlk Hafta Konusu',
      'Son Hafta Konusu',
    ],
  ];

  displayItems.forEach((item, idx) => {
    const l = item.lesson;
    const firstPlan = item.plans[0];
    const lastPlan = item.plans[item.plans.length - 1];

    rows.push([
      idx + 1,
      safeStr(l.name),
      safeStr(l.shortCode || '-'),
      l.grade ? `${l.grade}. Sınıf` : 'Tüm Kademeler',
      l.weeklyHours || '-',
      item.hasPlan ? '✅ Yüklü' : '⚠️ Yüklenmedi',
      item.hasPlan ? `${item.weekCount} Hafta` : '-',
      firstPlan ? safeStr(firstPlan.subject) : '-',
      lastPlan ? safeStr(lastPlan.subject) : '-',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dersler_ve_Planlar');

  const fileName = `Dersler_ve_Yillik_Planlar_${school.code || 'Okul'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 5. Haftalık Ders Programı (Çarşaf / Matris & Liste) Excel Raporu
 */
export async function exportSchedulesReport(params: {
  school: ReportSchoolInfo;
  schedules: any[];
  teachers: any[];
  classes: any[];
  filterTeacher?: string;
  filterClass?: string;
  filterDay?: number;
}): Promise<boolean> {
  const { school, schedules, teachers = [], classes, filterTeacher, filterClass, filterDay } = params;

  let filtered = [...schedules];
  if (filterTeacher && filterTeacher !== 'all') {
    filtered = filtered.filter((s) => (s.teacherName || '').toLowerCase().includes(filterTeacher.toLowerCase()));
  }
  if (filterClass && filterClass !== 'all') {
    const [g, sec] = filterClass.split('-');
    filtered = filtered.filter(
      (s) => String(s.grade) === String(g) && (!sec || (s.section || '').toUpperCase() === sec.toUpperCase())
    );
  }
  if (filterDay && filterDay > 0) {
    filtered = filtered.filter((s) => s.dayOfWeek === filterDay);
  }

  const wb = XLSX.utils.book_new();

  // 1. Sekme: Detaylı Program Listesi
  const listRows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - HAFTALIK DERS PROGRAMI LİSTESİ`],
    [`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, `Toplam Ders Saati: ${filtered.length}`],
    [],
    ['Sıra No', 'Gün', 'Ders Saati', 'Sınıf / Şube', 'Ders Adı', 'Öğretmen', 'Derslik'],
  ];

  const sortedList = [...filtered].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    if (a.lessonHour !== b.lessonHour) return a.lessonHour - b.lessonHour;
    const cA = `${a.grade}-${a.section}`;
    const cB = `${b.grade}-${b.section}`;
    return cA.localeCompare(cB);
  });

  sortedList.forEach((item, idx) => {
    listRows.push([
      idx + 1,
      DAY_NAMES[item.dayOfWeek] || `${item.dayOfWeek}. Gün`,
      `${item.lessonHour}. Ders`,
      `${item.grade}-${item.section}`,
      safeStr(item.lessonName),
      safeStr(item.teacherName || 'Atanmadı'),
      safeStr(item.classroom || '-'),
    ]);
  });

  const wsList = XLSX.utils.aoa_to_sheet(listRows);
  wsList['!cols'] = calculateColWidths(listRows);
  XLSX.utils.book_append_sheet(wb, wsList, 'Program_Listesi');

  // 2. Sekme: Sınıf Bazlı Çarşaf Matrisi (Satırlar: Sınıflar, Sütunlar: Gün x Saat)
  const sortedClasses = [...classes].sort((a, b) => {
    const gA = Number(a.grade) || 0;
    const gB = Number(b.grade) || 0;
    if (gA !== gB) return gA - gB;
    return (a.section || '').localeCompare(b.section || '');
  });

  const matrixHeaderRow1: string[] = ['Sınıf / Şube'];

  const maxDailyHours = (school as any).dailyLessonHours || 8;

  for (let d = 1; d <= 5; d++) {
    const dayName = DAY_NAMES[d];
    for (let h = 1; h <= maxDailyHours; h++) {
      matrixHeaderRow1.push(`${dayName} (${h}. Saat)`);
    }
  }

  const matrixRows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - SINIF BAZLI OKUL ÇARŞAF PROGRAM MATRİSİ`],
    [],
    matrixHeaderRow1,
  ];

  sortedClasses.forEach((cls) => {
    const clsName = `${cls.grade}-${cls.section}`;
    const row: string[] = [clsName];

    for (let d = 1; d <= 5; d++) {
      for (let h = 1; h <= maxDailyHours; h++) {
        const found = schedules.find(
          (s) =>
            String(s.grade) === String(cls.grade) &&
            (s.section || '').toUpperCase() === (cls.section || '').toUpperCase() &&
            s.dayOfWeek === d &&
            s.lessonHour === h
        );

        if (found) {
          row.push(`${found.lessonName || ''}\n(${found.teacherName || ''})`);
        } else {
          row.push('-');
        }
      }
    }
    matrixRows.push(row);
  });

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
  wsMatrix['!cols'] = [{ wch: 14 }, ...Array(40).fill({ wch: 18 })];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Carsaf_Matrisi');

  // 3. Sekme: Öğretmen Bazlı Çarşaf Matrisi (Satırlar: Alfabetik Öğretmenler, Sütunlar: Gün x Saat)
  // Hücre içeriği: Girdiği şube (örn: "11-A" veya "11-A (Fizik)")
  const teacherNameSet = new Set<string>();
  teachers.forEach((t) => {
    if (t.fullName && t.fullName.trim()) teacherNameSet.add(t.fullName.trim());
  });
  schedules.forEach((s) => {
    if (s.teacherName && s.teacherName.trim()) teacherNameSet.add(s.teacherName.trim());
  });

  const sortedTeacherNames = Array.from(teacherNameSet).sort((a, b) =>
    a.localeCompare(b, 'tr-TR', { sensitivity: 'base' })
  );

  const teacherMatrixHeaderRow: string[] = ['Öğretmen Adı Soyadı'];
  for (let d = 1; d <= 5; d++) {
    const dayName = DAY_NAMES[d];
    for (let h = 1; h <= maxDailyHours; h++) {
      teacherMatrixHeaderRow.push(`${dayName} (${h}. Saat)`);
    }
  }

  const teacherMatrixRows: any[][] = [
    [`👨‍🏫 ${school.name.toUpperCase()} - ÖĞRETMEN BAZLI ÇARŞAF DERS VE KONUM MATRİSİ`],
    ['Yukarıdan aşağı öğretmen adları, yatay olarak günler ve ders saatleri (Hücrede personelin bulunduğu şube yer alır).'],
    [],
    teacherMatrixHeaderRow,
  ];

  sortedTeacherNames.forEach((tName) => {
    const row: string[] = [tName];

    for (let d = 1; d <= 5; d++) {
      for (let h = 1; h <= maxDailyHours; h++) {
        const found = schedules.find(
          (s) =>
            s.dayOfWeek === d &&
            s.lessonHour === h &&
            s.teacherName &&
            (s.teacherName.trim().toLowerCase() === tName.toLowerCase() ||
             isTeacherMatch(tName, s.teacherName))
        );

        if (found) {
          const className = `${found.grade || ''}-${found.section || ''}`.trim().replace(/^-|-$/, '');
          row.push(className ? `${className}\n(${found.lessonName || 'Ders'})` : (found.lessonName || 'Ders'));
        } else {
          row.push('-');
        }
      }
    }
    teacherMatrixRows.push(row);
  });

  const wsTeacherMatrix = XLSX.utils.aoa_to_sheet(teacherMatrixRows);
  wsTeacherMatrix['!cols'] = [{ wch: 22 }, ...Array(40).fill({ wch: 16 })];
  XLSX.utils.book_append_sheet(wb, wsTeacherMatrix, 'Ogretmen_Carsaf_Matrisi');

  const fileName = `Ders_Programi_${school.code || 'Okul'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 6. Detaylı Yıllık Müfredat Planı Excel Raporu (Hafta hafta Konular & Kazanımlar)
 */
export async function exportYearlyPlanDetailsReport(params: {
  school: ReportSchoolInfo;
  lessonName: string;
  grade?: string | number;
  planItems: any[];
}): Promise<boolean> {
  const { school, lessonName, grade, planItems } = params;

  const sorted = [...planItems].sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber));

  const rows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - YILLIK MÜFREDAT VE KAZANIM PLANI`],
    [
      `Ders: ${lessonName}`,
      `Kademe: ${grade ? `${grade}. Sınıf` : 'Tüm Kademeler'}`,
      `Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`,
      `Toplam Hafta: ${sorted.length}`,
    ],
    [],
    ['Hafta No', 'Tarih Aralığı', 'Başlangıç Tarihi', 'Bitiş Tarihi', 'Konu (Deftere Yazılacak Metin)', 'Kazanımlar / Açıklamalar / Ölçme Değerlendirme'],
  ];

  sorted.forEach((item) => {
    const sDate = item.startDate ? new Date(item.startDate).toLocaleDateString('tr-TR') : '';
    const eDate = item.endDate ? new Date(item.endDate).toLocaleDateString('tr-TR') : '';
    const dRange = item.dateRange || (sDate && eDate ? `${sDate} - ${eDate}` : sDate || eDate || '');

    rows.push([
      `${item.weekNumber}. Hafta`,
      dRange,
      sDate,
      eDate,
      safeStr(item.subject),
      safeStr(item.learningOutcomes),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 38 },
    { wch: 55 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Yillik_Plan');

  const fileName = `Yillik_Plan_${lessonName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 7. Sistem Denetim ve İşlem Logları Excel Raporu
 */
export async function exportAuditLogsReport(params: {
  school: ReportSchoolInfo;
  logs: any[];
  filterUser?: string;
  filterRole?: string;
  filterAction?: string;
}): Promise<boolean> {
  const { school, logs, filterUser, filterRole, filterAction } = params;

  let filtered = [...logs];
  if (filterUser && filterUser !== 'all') {
    filtered = filtered.filter((l) => l.userId === filterUser || (l.userName || '').toLowerCase() === filterUser.toLowerCase());
  }
  if (filterRole && filterRole !== 'all') {
    filtered = filtered.filter((l) => l.userRole === filterRole);
  }
  if (filterAction && filterAction !== 'all') {
    filtered = filtered.filter((l) => l.actionType === filterAction);
  }

  const rows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - SİSTEM İŞLEM & GÜVENLİK DENETİM LOGLARI`],
    [`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, `Filtrelenen Kayıt: ${filtered.length} / ${logs.length}`],
    [],
    [
      'Sıra No',
      'Tarih / Saat (TR)',
      'İşlem Başlığı',
      'İşlem Kodu',
      'İşlemi Yapan (Ad Soyad)',
      'Kullanıcı Adı',
      'Rolü',
      'Açıklama (Ne Yapıldı)',
      'İlgili Varlık / Hedef',
      'Teknik Detaylar',
      'IP Adresi',
    ],
  ];

  filtered.forEach((log, idx) => {
    rows.push([
      idx + 1,
      log.formattedDate || (log.timestamp ? new Date(log.timestamp).toLocaleString('tr-TR') : '-'),
      safeStr(log.actionTitle || log.actionType),
      safeStr(log.actionType),
      safeStr(log.userFullName || log.userName || 'Sistem'),
      safeStr(log.userName || '-'),
      safeStr(log.roleLabel || log.userRole),
      safeStr(log.description || log.actionType),
      safeStr(`${log.entityName || '-'} ${log.entityId ? `(#${log.entityId})` : ''}`.trim()),
      safeStr(log.detailsJson || '-'),
      safeStr(log.ipAddress || '-'),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Denetim_Loglari');

  const fileName = `Guvenlik_Loglari_${school.code || 'Okul'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 8. 🌟 Konsolide Tüm Okul Veritabanı Paketi (Multi-Sheet Master Excel)
 * Tek tıkla okulun tüm verilerini ayrı sayfalarda tek bir çalışma kitabına toplar!
 */
export async function exportConsolidatedSchoolMasterExcel(params: {
  school: ReportSchoolInfo;
  teachers: any[];
  students: any[];
  classes: any[];
  lessons: any[];
  yearlyPlans: any[];
  schedules?: any[];
}): Promise<boolean> {
  const { school, teachers, students, classes, lessons, yearlyPlans, schedules = [] } = params;

  const wb = XLSX.utils.book_new();

  // 1. ÖZET & OKUL KÜNYESİ
  const summaryRows: any[][] = [
    [`🏫 ${school.name.toUpperCase()} - OKUL KONSOLİDE YÖNETİM RAPORU`],
    [`Rapor Oluşturma Zamanı: ${new Date().toLocaleString('tr-TR')}`],
    [],
    ['📊 OKUL İSTATİSTİK ÖZETİ', 'SAYI'],
    ['Toplam Öğretmen Kadrosu', teachers.length],
    ['Toplam Kayıtlı Öğrenci', students.length],
    ['Toplam Sınıf ve Şube Sayısı', classes.length],
    ['Toplam Tanımlı Ders', lessons.length],
    ['Yıllık Planı Yüklü Ders Sayısı', lessons.filter((l) => yearlyPlans.some((p) => (p.lessonName || '').toLowerCase() === (l.name || '').toLowerCase())).length],
    ['Haftalık Ders Saati Kayıtları', schedules.length],
    [],
    ['🏫 OKUL İLETİŞİM BİLGİLERİ', 'BİLGİ'],
    ['Okul Adı', school.name],
    ['Kurum Kodu', school.code || '-'],
    ['Telefon', school.phone || '-'],
    ['Adres', school.address || '-'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 32 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Genel_Ozet');

  // 2. ÖĞRETMENLER
  const teacherRows: any[][] = [
    ['Sıra No', 'Adı Soyadı', 'Kullanıcı Adı', 'Rol', 'Branş', 'Sınıflar', 'Telefon', 'E-Posta', 'Durum'],
  ];
  teachers.forEach((t, i) => {
    teacherRows.push([
      i + 1,
      safeStr(t.fullName),
      safeStr(t.username),
      t.role === 'STAFF' ? 'İdareci' : 'Öğretmen',
      safeStr(t.branch || '-'),
      safeStr(t.assignedClassesJson || '-'),
      safeStr(t.phone || '-'),
      safeStr(t.email || '-'),
      t.isActive === false ? 'Pasif' : 'Aktif',
    ]);
  });
  const wsTeachers = XLSX.utils.aoa_to_sheet(teacherRows);
  wsTeachers['!cols'] = calculateColWidths(teacherRows);
  XLSX.utils.book_append_sheet(wb, wsTeachers, 'Ogretmenler');

  // 3. ÖĞRENCİLER
  const studentRows: any[][] = [
    ['Sıra No', 'Öğrenci No', 'Adı Soyadı', 'Sınıf', 'Şube', 'Veli Adı', 'Veli Telefonu', 'Öğrenci Tel', 'Fotoğraf'],
  ];
  const sortedStudents = [...students].sort((a, b) => (Number(a.grade) || 0) - (Number(b.grade) || 0));
  sortedStudents.forEach((s, i) => {
    studentRows.push([
      i + 1,
      safeStr(s.studentNumber),
      safeStr(s.fullName),
      safeStr(s.grade),
      safeStr(s.section),
      safeStr(s.parentName || '-'),
      safeStr(s.parentPhone || '-'),
      safeStr(s.studentPhone || '-'),
      s.photoPath ? 'Var' : 'Yok',
    ]);
  });
  const wsStudents = XLSX.utils.aoa_to_sheet(studentRows);
  wsStudents['!cols'] = calculateColWidths(studentRows);
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Ogrenciler');

  // 4. SINIFLAR
  const classRows: any[][] = [
    ['Sıra No', 'Sınıf Adı', 'Kademe', 'Şube', 'Öğrenci Sayısı', 'Eğitim Yılı'],
  ];
  classes.forEach((c, i) => {
    const count =
      c.studentCount !== undefined
        ? c.studentCount
        : students.filter((s) => String(s.grade) === String(c.grade) && (s.section || '').toUpperCase() === (c.section || '').toUpperCase()).length;
    classRows.push([
      i + 1,
      `${c.grade}-${c.section}`,
      safeStr(c.grade),
      safeStr(c.section),
      Number(count) || 0,
      safeStr(c.academicYear || '2024-2025'),
    ]);
  });
  const wsClasses = XLSX.utils.aoa_to_sheet(classRows);
  wsClasses['!cols'] = calculateColWidths(classRows);
  XLSX.utils.book_append_sheet(wb, wsClasses, 'Siniflar');

  // 5. DERSLER & PLANLAR
  const lessonRows: any[][] = [
    ['Sıra No', 'Ders Adı', 'Kısa Kod', 'Kademe', 'Haftalık Saat', 'Yıllık Plan Durumu', 'Plan Hafta Sayısı'],
  ];
  lessons.forEach((l, i) => {
    const plans = yearlyPlans.filter((p) => (p.lessonName || '').toLowerCase() === (l.name || '').toLowerCase());
    lessonRows.push([
      i + 1,
      safeStr(l.name),
      safeStr(l.shortCode || '-'),
      l.grade ? `${l.grade}. Sınıf` : 'Tüm Kademeler',
      l.weeklyHours || '-',
      plans.length > 0 ? '✅ Yüklü' : '⚠️ Yüklenmedi',
      plans.length > 0 ? `${plans.length} Hafta` : '-',
    ]);
  });
  const wsLessons = XLSX.utils.aoa_to_sheet(lessonRows);
  wsLessons['!cols'] = calculateColWidths(lessonRows);
  XLSX.utils.book_append_sheet(wb, wsLessons, 'Dersler');

  // 6. DERS PROGRAMI (Varsa)
  if (schedules.length > 0) {
    const scheduleRows: any[][] = [
      ['Sıra No', 'Gün', 'Saat', 'Sınıf / Şube', 'Ders Adı', 'Öğretmen', 'Derslik'],
    ];
    const sortedSch = [...schedules].sort((a, b) => (a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.lessonHour - b.lessonHour));
    sortedSch.forEach((item, i) => {
      scheduleRows.push([
        i + 1,
        DAY_NAMES[item.dayOfWeek] || `${item.dayOfWeek}. Gün`,
        `${item.lessonHour}. Ders`,
        `${item.grade}-${item.section}`,
        safeStr(item.lessonName),
        safeStr(item.teacherName || 'Atanmadı'),
        safeStr(item.classroom || '-'),
      ]);
    });
    const wsSchedule = XLSX.utils.aoa_to_sheet(scheduleRows);
    wsSchedule['!cols'] = calculateColWidths(scheduleRows);
    XLSX.utils.book_append_sheet(wb, wsSchedule, 'Ders_Programi');
  }

  const fileName = `Tum_Okul_Veritabani_${school.code || 'Master'}_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 7. Öğretmen Giriş Bilgileri ve Şifre Listesi Excel Raporu
 */
export async function exportTeacherCredentialsReport(params: {
  school: ReportSchoolInfo;
  teachers: any[];
  filterBranch?: string;
  filterRole?: string;
}): Promise<boolean> {
  const { school, teachers, filterBranch, filterRole } = params;

  let filtered = [...teachers];
  if (filterBranch && filterBranch !== 'all') {
    filtered = filtered.filter((t) => (t.branch || '').toLowerCase() === filterBranch.toLowerCase());
  }
  if (filterRole && filterRole !== 'all') {
    filtered = filtered.filter((t) => t.role === filterRole);
  }

  filtered.sort((a, b) => safeStr(a.fullName || a.name).localeCompare(safeStr(b.fullName || b.name), 'tr'));

  const rows: any[][] = [
    [`${school.name.toUpperCase()} - ÖĞRETMEN SİSTEMİ GİRİŞ VE ŞİFRE LİSTESİ`],
    [`Okul Kodu: ${school.code || '-'} | Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} | Toplam Öğretmen: ${filtered.length}`],
    ['NOT: Öğretmenler uygulamaya "Okul Kodu", "Kullanıcı Adı" ve "Şifre" bilgileri ile giriş yaparlar. İlk girişte şifre varsayılan olarak "1234"tür.'],
    [],
    [
      'Sıra No',
      'Öğretmen Adı Soyadı',
      'Branş',
      'Yetki / Rol',
      'Okul Kodu',
      'Kullanıcı Adı',
      'Başlangıç Şifresi',
      'Telefon Numarası',
      'E-Posta Adresi',
      'Hesap Durumu',
    ],
  ];

  filtered.forEach((t, i) => {
    rows.push([
      i + 1,
      safeStr(t.fullName || t.name),
      safeStr(t.branch || 'Genel'),
      t.role === 'STAFF' ? 'Okul İdarecisi' : 'Öğretmen',
      safeStr(school.code || '-'),
      safeStr(t.username || '-'),
      '1234', // Sistem varsayılan başlangıç şifresi
      safeStr(t.phone || '-'),
      safeStr(t.email || '-'),
      t.isActive !== false ? 'Aktif' : 'Pasif',
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Ogretmen_Sifreleri');

  const cleanName = school.name.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ]/g, '_');
  const fileName = `${cleanName}_Ogretmen_Sifre_Listesi_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 8. Öğrenci Portalı Giriş Bilgileri ve Şifre Listesi Excel Raporu
 */
export async function exportStudentCredentialsReport(params: {
  school: ReportSchoolInfo;
  students: any[];
  filterGrade?: string;
  filterSection?: string;
  searchQuery?: string;
}): Promise<boolean> {
  const { school, students, filterGrade, filterSection, searchQuery } = params;

  let filtered = [...students];
  if (filterGrade && filterGrade !== 'all') {
    filtered = filtered.filter((s) => String(s.grade) === String(filterGrade));
  }
  if (filterSection && filterSection !== 'all') {
    filtered = filtered.filter((s) => (s.section || '').toUpperCase() === filterSection.toUpperCase());
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        safeStr(s.fullName || s.name).toLowerCase().includes(q) ||
        safeStr(s.studentNumber).includes(q) ||
        safeStr(s.parentName).toLowerCase().includes(q)
    );
  }

  // Sınıf ve no sıralaması
  filtered.sort((a, b) => {
    const grA = Number(a.grade) || 0;
    const grB = Number(b.grade) || 0;
    if (grA !== grB) return grA - grB;
    const secA = safeStr(a.section).toUpperCase();
    const secB = safeStr(b.section).toUpperCase();
    if (secA !== secB) return secA.localeCompare(secB);
    const noA = Number(a.studentNumber) || 0;
    const noB = Number(b.studentNumber) || 0;
    return noA - noB;
  });

  const rows: any[][] = [
    [`${school.name.toUpperCase()} - ÖĞRENCİ PORTALI GİRİŞ VE ŞİFRE LİSTESİ`],
    [`Okul Kodu: ${school.code || '-'} | Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} | Toplam Öğrenci: ${filtered.length}`],
    ['NOT: Öğrenci portalı girişi için "Okul Kodu" + "Öğrenci Numarası" + "Şifre" kullanılır. Başlangıç şifresi: "ooo_öğrencino" şeklindedir.'],
    [],
    [
      'Sıra No',
      'Öğrenci No',
      'Sınıfı / Şubesi',
      'Öğrenci Adı Soyadı',
      'Okul Kodu',
      'Giriş Kimliği (No)',
      'Varsayılan Şifre',
      'Veli Adı Soyadı',
      'Veli Telefonu',
      'Giriş Yönergesi',
    ],
  ];

  filtered.forEach((s, i) => {
    const stdNo = safeStr(s.studentNumber);
    const defaultPass = stdNo ? `ooo_${stdNo}` : '-';
    rows.push([
      i + 1,
      stdNo,
      s.grade && s.section ? `${s.grade}-${String(s.section).toUpperCase()}` : `${s.grade || ''}${s.section || ''}`,
      safeStr(s.fullName || s.name),
      safeStr(school.code || '-'),
      stdNo,
      defaultPass,
      safeStr(s.parentName || '-'),
      safeStr(s.parentPhone || '-'),
      'Öğrenci Girişinden: Okul Kodu + No + Şifre',
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Ogrenci_Sifreleri');

  const cleanName = school.name.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ]/g, '_');
  const fileName = `${cleanName}_Ogrenci_Sifre_Listesi_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}

/**
 * 9. Veli Bilgilendirme ve Giriş Şifreleri Excel Raporu
 */
export async function exportParentCredentialsReport(params: {
  school: ReportSchoolInfo;
  students: any[];
  filterGrade?: string;
  filterSection?: string;
  searchQuery?: string;
}): Promise<boolean> {
  const { school, students, filterGrade, filterSection, searchQuery } = params;

  let filtered = [...students];
  if (filterGrade && filterGrade !== 'all') {
    filtered = filtered.filter((s) => String(s.grade) === String(filterGrade));
  }
  if (filterSection && filterSection !== 'all') {
    filtered = filtered.filter((s) => (s.section || '').toUpperCase() === filterSection.toUpperCase());
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        safeStr(s.fullName || s.name).toLowerCase().includes(q) ||
        safeStr(s.studentNumber).includes(q) ||
        safeStr(s.parentName).toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => {
    const grA = Number(a.grade) || 0;
    const grB = Number(b.grade) || 0;
    if (grA !== grB) return grA - grB;
    const secA = safeStr(a.section).toUpperCase();
    const secB = safeStr(b.section).toUpperCase();
    if (secA !== secB) return secA.localeCompare(secB);
    return safeStr(sParent(a)).localeCompare(safeStr(sParent(b)), 'tr');
  });

  function sParent(item: any) {
    return item.parentName || item.fullName || item.name || '';
  }

  const rows: any[][] = [
    [`${school.name.toUpperCase()} - VELİ BİLGİLENDİRME VE PORTAL ERİŞİM ŞİFRE LİSTESİ`],
    [`Okul Kodu: ${school.code || '-'} | Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} | Toplam Veli / Öğrenci: ${filtered.length}`],
    ['NOT: Veliler öğrenci takip paneline öğrencinin numarası veya kayıtlı veli telefonu ile giriş yaparlar. Başlangıç şifresi: "vvv_öğrencino" şeklindedir.'],
    [],
    [
      'Sıra No',
      'Veli Adı Soyadı',
      'Veli Telefon Numarası',
      'Öğrenci Adı Soyadı',
      'Sınıfı / Şubesi',
      'Öğrenci Numarası',
      'Okul Kodu',
      'Veli Portalı Şifresi',
      'Erişim Kanalı',
      'Veli Bilgilendirme Notu',
    ],
  ];

  filtered.forEach((s, i) => {
    const stdNo = safeStr(s.studentNumber);
    const defaultPass = stdNo ? `vvv_${stdNo}` : '-';
    rows.push([
      i + 1,
      safeStr(s.parentName || 'Belirtilmedi'),
      safeStr(s.parentPhone || '-'),
      safeStr(s.fullName || s.name),
      s.grade && s.section ? `${s.grade}-${String(s.section).toUpperCase()}` : `${s.grade || ''}${s.section || ''}`,
      stdNo,
      safeStr(school.code || '-'),
      defaultPass,
      'Mobil Uygulama & Web Portalı',
      'Öğrenci & Veli Girişinden: Okul Kodu + No veya Veli Telefonu ile şifre girilerek erişilir.',
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = calculateColWidths(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Veli_Sifreleri');

  const cleanName = school.name.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ]/g, '_');
  const fileName = `${cleanName}_Veli_Sifre_Listesi_${Date.now()}.xlsx`;
  return await saveAndShareWorkbook(wb, fileName);
}
