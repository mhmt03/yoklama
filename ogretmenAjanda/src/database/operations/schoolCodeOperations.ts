import { getDB } from '../db';
import { School, TeacherAssignment } from '../../types';
import { setActiveSchool } from './schoolOperations';

/**
 * Okul adından ve rastgele sayılardan benzersiz bir okul kodu üretir (Örn: "AFL-4829" veya "OKL-7153").
 */
export const generateUniqueSchoolCode = (schoolName: string): string => {
  const cleanName = schoolName
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
  const prefix = (cleanName.slice(0, 3) || 'OKL').padEnd(3, 'X');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randomSuffix}`;
};

/**
 * Okul koduna göre okulu arar.
 */
export const getSchoolByCode = async (code: string): Promise<School | null> => {
  const db = await getDB();
  const normalizedCode = code.trim().toUpperCase();
  const school = await db.getFirstAsync<School>(
    'SELECT * FROM schools WHERE UPPER(code) = ? LIMIT 1',
    normalizedCode
  );
  return school || null;
};

/**
 * Bir öğretmenin okul kodu girerek o okula bağlanmasını sağlar ve okulu aktif yapar.
 */
export const joinSchoolByCode = async (code: string): Promise<School> => {
  const school = await getSchoolByCode(code);
  if (!school) {
    throw new Error('Girdiğiniz okul koduna ait bir okul bulunamadı. Lütfen kontrol ediniz.');
  }
  await setActiveSchool(school.id);
  return school;
};

/**
 * Okul admin PIN kodunu kontrol eder (Varsayılan: 1234).
 */
export const verifySchoolAdminPin = async (schoolId: number, pin: string): Promise<boolean> => {
  const db = await getDB();
  const school = await db.getFirstAsync<{ admin_pin?: string }>(
    'SELECT admin_pin FROM schools WHERE id = ?',
    schoolId
  );
  if (!school) return false;
  const currentPin = school.admin_pin || '1234';
  return currentPin === pin.trim();
};

/**
 * Okul admin PIN kodunu günceller.
 */
export const updateSchoolAdminPin = async (schoolId: number, newPin: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE schools SET admin_pin = ? WHERE id = ?',
    newPin.trim(),
    schoolId
  );
};

/**
 * Okulun tüm öğretmen sınıf/ders atamalarını listeler (Admin denetimi için).
 */
export const getSchoolTeacherAssignments = async (
  schoolId: number,
  teacherNameFilter?: string
): Promise<TeacherAssignment[]> => {
  const db = await getDB();
  let query = `
    SELECT 
      ta.id,
      ta.school_id,
      ta.teacher_name,
      ta.teacher_phone,
      ta.class_id,
      ta.course_id,
      ta.is_approved,
      ta.created_at,
      c.name as class_name,
      co.name as course_name,
      co.color as course_color
    FROM teacher_assignments ta
    INNER JOIN classes c ON ta.class_id = c.id
    LEFT JOIN courses co ON ta.course_id = co.id
    WHERE ta.school_id = ?
  `;
  const params: any[] = [schoolId];

  if (teacherNameFilter && teacherNameFilter.trim()) {
    query += ' AND ta.teacher_name = ?';
    params.push(teacherNameFilter.trim());
  }

  query += ' ORDER BY ta.teacher_name ASC, c.name ASC';
  return await db.getAllAsync<TeacherAssignment>(query, ...params);
};

/**
 * Bir öğretmenin girdiği sınıf ve dersleri kaydeder veya günceller.
 */
export const saveTeacherAssignment = async (
  schoolId: number,
  teacherName: string,
  classId: number,
  courseId: number | null,
  teacherPhone?: string,
  isApproved: number = 1
): Promise<number> => {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO teacher_assignments (school_id, teacher_name, teacher_phone, class_id, course_id, is_approved)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(school_id, teacher_name, class_id, course_id) DO UPDATE SET
       teacher_phone = excluded.teacher_phone,
       is_approved = excluded.is_approved`,
    schoolId,
    teacherName.trim(),
    teacherPhone?.trim() || null,
    classId,
    courseId ?? null,
    isApproved
  );
  return result.lastInsertRowId;
};

/**
 * Admin: Öğretmenin atama durumunu onaylar (1) veya kısıtlar/askıya alır (0).
 */
export const setTeacherAssignmentApproval = async (
  assignmentId: number,
  isApproved: number
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE teacher_assignments SET is_approved = ? WHERE id = ?',
    isApproved,
    assignmentId
  );
};

/**
 * Admin veya Öğretmen: Bir atamayı siler.
 */
export const deleteTeacherAssignment = async (assignmentId: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM teacher_assignments WHERE id = ?', assignmentId);
};

/**
 * Öğretmenin sadece onaylanmış (yetkili) olduğu sınıf ID'lerini döner.
 * Eğer henüz hiçbir atama kısıtlaması yoksa boş liste döner (böylece tüm sınıflara erişebilir).
 */
export const getTeacherAuthorizedClassIds = async (
  schoolId: number,
  teacherName: string
): Promise<number[] | null> => {
  const db = await getDB();
  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM teacher_assignments WHERE school_id = ? AND teacher_name = ?',
    schoolId,
    teacherName.trim()
  );

  // Öğretmenin tanımlı ataması yoksa henüz kısıtlama uygulanmamıştır
  if (!countRow || countRow.count === 0) {
    return null; // Null: Kısıtlama yok, tüm sınıfları görebilir
  }

  // Sadece onaylı (is_approved = 1) olanları al
  const approvedRows = await db.getAllAsync<{ class_id: number }>(
    'SELECT DISTINCT class_id FROM teacher_assignments WHERE school_id = ? AND teacher_name = ? AND is_approved = 1',
    schoolId,
    teacherName.trim()
  );

  return approvedRows.map((r) => r.class_id);
};
