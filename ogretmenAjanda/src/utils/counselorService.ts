/**
 * Sınıf Rehber Öğretmenliği ve Nöbetçi Öğretmen Eşleştirme Yardımcı Servisi
 */

/**
 * Ders adının veya kodunun "Rehberlik ve Yönlendirme" dersi olup olmadığını belirler.
 */
export function isRehberlikLesson(lessonName?: string | null): boolean {
  if (!lessonName) return false;
  const clean = lessonName.trim().toLocaleLowerCase('tr-TR');
  return /rehberlik|rhbyn|\breh\b/i.test(clean);
}

/**
 * İki öğretmen adını Türkçe karakter ve boşluk toleranslı eşleştirir.
 */
export function normalizeTeacherName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

export function isSameTeacher(name1?: string | null, name2?: string | null): boolean {
  if (!name1 || !name2) return false;
  const n1 = normalizeTeacherName(name1);
  const n2 = normalizeTeacherName(name2);
  if (n1 === n2) return true;
  // Parça eşleşmesi (Örn: "Ahmet YILMAZ" ve "A. YILMAZ")
  return n1.includes(n2) || n2.includes(n1);
}

/**
 * Sınıf adını normalize eder (örn: "10-A" ile "10/A" aynı kabul edilir).
 */
export function normalizeClassName(className?: string | null): string {
  if (!className) return '';
  return className
    .trim()
    .toUpperCase()
    .replace('/', '-')
    .replace(/\s+/g, '');
}

/**
 * Bir öğretmenin hangi sınıfın rehber öğretmeni olduğunu bulur.
 * 1. Öğretmen nesnesinde manuel atanmış `counselorClass` varsa onu kullanır.
 * 2. Yoksa öğretmenin haftalık ders programındaki "Rehberlik" dersinden sınıfı tespit eder.
 */
export function getTeacherCounselorClass(teacher: any, schedules: any[] = []): string {
  if (!teacher) return '';

  // 1. Manuel seçim / Atama (Eğer 'NONE' ise kasıtlı olarak kaldırılmıştır)
  if (teacher.counselorClass) {
    const val = String(teacher.counselorClass).trim();
    if (val === 'NONE' || val === 'YOK' || val === '-') return '';
    return val;
  }

  // 2. Programdaki Rehberlik dersinden otomatik tespit
  const tName = teacher.fullName || teacher.name || '';
  if (!tName || !Array.isArray(schedules) || schedules.length === 0) return '';

  const matchedSlot = schedules.find((s) => {
    if (!isSameTeacher(s.teacherName, tName)) return false;
    const lName = s.lessonName || s.course_name || s.subject || s.lessonCode || '';
    return isRehberlikLesson(lName);
  });

  if (matchedSlot) {
    const cName =
      matchedSlot.className ||
      matchedSlot.class_name ||
      (matchedSlot.grade && matchedSlot.section
        ? `${matchedSlot.grade}-${matchedSlot.section}`
        : matchedSlot.grade || matchedSlot.section || '');
    return String(cName).trim();
  }

  return '';
}

/**
 * Bir sınıfın (örn: "10-A") Sınıf Rehber Öğretmenini bulur.
 * 1. Öğretmenler arasında `counselorClass` bu sınıf olan öğretmen aranır.
 * 2. Bulunamazsa programda bu sınıfta "Rehberlik" dersi olan öğretmen bulunur.
 */
export function getClassCounselorTeacher(
  className?: string | null,
  teachers: any[] = [],
  schedules: any[] = []
): string {
  if (!className) return '';
  const targetNorm = normalizeClassName(className);
  if (!targetNorm) return '';

  // 1. Manuel atanmış öğretmen kontrolü
  if (Array.isArray(teachers)) {
    for (const t of teachers) {
      if (t.counselorClass && t.counselorClass !== 'NONE') {
        if (normalizeClassName(t.counselorClass) === targetNorm) {
          return t.fullName || t.name || '';
        }
      }
    }
  }

  // 2. Programdaki Rehberlik dersi kontrolü
  if (Array.isArray(schedules)) {
    for (const s of schedules) {
      const cName =
        s.className ||
        s.class_name ||
        (s.grade && s.section ? `${s.grade}-${s.section}` : s.grade || s.section || '');
      if (normalizeClassName(cName) === targetNorm) {
        const lName = s.lessonName || s.course_name || s.subject || s.lessonCode || '';
        if (isRehberlikLesson(lName)) {
          return s.teacherName || '';
        }
      }
    }
  }

  return '';
}

/**
 * Belirli bir gün ve ders saatinde NÖBETÇİ olan ve DERSİ BOŞ OLAN (müsait) öğretmenleri listeler.
 */
export function getAvailableDutyTeachersForHour(
  dayOfWeek: number,
  lessonHour: number,
  duties: any[] = [],
  schedules: any[] = [],
  absentTeacherNames: string[] = []
): Array<{ teacherName: string; dutyPlace: string }> {
  if (!Array.isArray(duties) || duties.length === 0) return [];

  const dayMap = (val: any): number => {
    if (typeof val === 'number') return val;
    const str = String(val || '').toLowerCase();
    if (str.includes('pazartesi') || str === '1') return 1;
    if (str.includes('salı') || str.includes('sali') || str === '2') return 2;
    if (str.includes('çarşamba') || str.includes('carsamba') || str === '3') return 3;
    if (str.includes('perşembe') || str.includes('persembe') || str === '4') return 4;
    if (str.includes('cuma') || str === '5') return 5;
    return 0;
  };

  // O gün nöbetçi olan öğretmenler
  const dayDuties = duties.filter((d) => dayMap(d.dayOfWeek) === dayOfWeek);

  const available: Array<{ teacherName: string; dutyPlace: string }> = [];

  for (const duty of dayDuties) {
    const tName = duty.teacherName || '';
    if (!tName) continue;

    // Gelmeyenler listesinde ise atla
    if (absentTeacherNames.some((absent) => isSameTeacher(absent, tName))) {
      continue;
    }

    // O gün ve o saatte bu öğretmenin dersi var mı?
    const hasLesson = (schedules || []).some((s) => {
      const sDay = dayMap(s.dayOfWeek);
      const sHour = Number(s.lessonHour || s.periodNumber || 0);
      return sDay === dayOfWeek && sHour === lessonHour && isSameTeacher(s.teacherName, tName);
    });

    if (!hasLesson) {
      // Müsait nöbetçi öğretmen!
      available.push({
        teacherName: tName,
        dutyPlace: duty.dutyPlace || 'Genel Nöbet',
      });
    }
  }

  return available;
}
