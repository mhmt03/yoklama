import { getDB } from '../db';
import { setGeminiApiKey, setGeminiModel } from '../../utils/geminiScheduleService';
import { getActiveUserSession } from '../../services/apiClient';

export interface School {
  id: number;
  name: string;
  code?: string;
  color: string;
  is_active: number; // 1 = aktif okul, 0 = pasif
  created_at?: string;
}

export const SCHOOL_COLORS = [
  { name: 'Soft İndigo', color: '#6366F1' },
  { name: 'Gökyüzü Mavi', color: '#38BDF8' },
  { name: 'Tatlı Zümrüt', color: '#34D399' },
  { name: 'Sıcak Amber', color: '#FBBF24' },
  { name: 'Gül Pembe', color: '#F472B6' },
  { name: 'Yumuşak Mor', color: '#A78BFA' },
  { name: 'Fas Turkuazı', color: '#2DD4BF' },
  { name: 'Mercan Kırmızı', color: '#F87171' },
];

export const getSchools = async (): Promise<School[]> => {
  const db = await getDB();
  const allSchools = await db.getAllAsync<School>('SELECT * FROM schools ORDER BY id ASC');

  try {
    const session = await getActiveUserSession();
    const isTeacherOrStaff = session && (session.role === 'TEACHER' || session.role === 'STAFF');
    if (isTeacherOrStaff) {
      const affSchools = (session.affiliatedSchools && session.affiliatedSchools.length > 0)
        ? session.affiliatedSchools
        : (session.schoolName ? [{ name: session.schoolName, code: session.schoolCode || 'OKL-10001' }] : []);

      if (affSchools.length > 0) {
        const allowedCodes = new Set(affSchools.map(s => s.code?.trim().toUpperCase()).filter(Boolean));
        const allowedNames = new Set(affSchools.map(s => s.name?.trim().toLowerCase()).filter(Boolean));

        const filtered = allSchools.filter(s => 
          (s.code && allowedCodes.has(s.code.trim().toUpperCase())) ||
          allowedNames.has(s.name.trim().toLowerCase())
        );

        if (filtered.length > 0) {
          return filtered;
        }
      }
    }
  } catch (err) {
    console.warn('Error filtering schools by session:', err);
  }

  return allSchools;
};

export const getActiveSchool = async (): Promise<School | null> => {
  const db = await getDB();

  let allowedCodes: Set<string> | null = null;
  let allowedNames: Set<string> | null = null;

  try {
    const session = await getActiveUserSession();
    const isTeacherOrStaff = session && (session.role === 'TEACHER' || session.role === 'STAFF');
    if (isTeacherOrStaff) {
      const affSchools = (session.affiliatedSchools && session.affiliatedSchools.length > 0)
        ? session.affiliatedSchools
        : (session.schoolName ? [{ name: session.schoolName, code: session.schoolCode || 'OKL-10001' }] : []);

      if (affSchools.length > 0) {
        allowedCodes = new Set(affSchools.map(s => s.code?.trim().toUpperCase()).filter(Boolean));
        allowedNames = new Set(affSchools.map(s => s.name?.trim().toLowerCase()).filter(Boolean));
      }
    }
  } catch {}

  const activeSchool = await db.getFirstAsync<School>('SELECT * FROM schools WHERE is_active = 1 LIMIT 1');
  if (activeSchool) {
    if (allowedCodes && allowedNames) {
      const isAllowed = (activeSchool.code && allowedCodes.has(activeSchool.code.trim().toUpperCase())) ||
                        allowedNames.has(activeSchool.name.trim().toLowerCase());
      if (isAllowed) return activeSchool;
    } else {
      return activeSchool;
    }
  }

  // Fallback: Return first allowed school
  const allSchools = await db.getAllAsync<School>('SELECT * FROM schools ORDER BY id ASC');
  const validSchools = (allowedCodes && allowedNames)
    ? allSchools.filter(s => (s.code && allowedCodes.has(s.code.trim().toUpperCase())) || allowedNames.has(s.name.trim().toLowerCase()))
    : allSchools;

  if (validSchools.length > 0) {
    const firstSchool = validSchools[0];
    await db.runAsync('UPDATE schools SET is_active = 0');
    await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', firstSchool.id);
    return { ...firstSchool, is_active: 1 };
  }

  return null;
};

export const setActiveSchool = async (schoolId: number): Promise<School | null> => {
  const db = await getDB();
  await db.runAsync('UPDATE schools SET is_active = 0');
  await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', schoolId);
  return await getActiveSchool();
};

// --- VARSAYILAN OKUL ---
export const getDefaultSchoolId = async (): Promise<number | null> => {
  const db = await getDB();
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'default_school_id'"
    );
    if (row?.value) {
      const id = parseInt(row.value, 10);
      if (!isNaN(id)) {
        const exists = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools WHERE id = ?', id);
        if (exists) return id;
      }
    }

    // Eğer app_settings'te kayıtlı bir varsayılan okul yoksa, veritabanındaki ilk okulu otomatik varsayılan yap
    const firstSchool = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools ORDER BY id ASC LIMIT 1');
    if (firstSchool) {
      await db.runAsync(
        "INSERT INTO app_settings (key, value) VALUES ('default_school_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        String(firstSchool.id)
      );
      return firstSchool.id;
    }
    return null;
  } catch (e) {
    console.warn('Error reading default school id:', e);
    return null;
  }
};

export const setDefaultSchoolId = async (schoolId: number | null): Promise<void> => {
  const db = await getDB();
  if (schoolId === null) {
    await db.runAsync("DELETE FROM app_settings WHERE key = 'default_school_id'");
    return;
  }
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES ('default_school_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(schoolId)
  );
};

/**
 * Uygulama açılışında çağrılır: varsayılan okul tanımlıysa onu aktif okul yapar.
 */
export const activateDefaultSchoolOnStartup = async (): Promise<School | null> => {
  const defaultId = await getDefaultSchoolId();
  if (defaultId !== null) {
    return await setActiveSchool(defaultId);
  }
  return await getActiveSchool();
};

export const createSchool = async (name: string, color: string, code?: string): Promise<number> => {
  const db = await getDB();
  
  // Pasifleştir ve yeniyi aktif olarak ekle
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM schools');
  const isFirst = !countRow || countRow.count === 0;

  if (isFirst) {
    const result = await db.runAsync(
      'INSERT INTO schools (name, color, code, is_active) VALUES (?, ?, ?, 1)',
      name.trim(),
      color,
      code?.trim() || ''
    );
    return result.lastInsertRowId;
  } else {
    // Yeni eklenen okulu doğrudan aktif yapalım ki kullanıcı o okula geçsin
    await db.runAsync('UPDATE schools SET is_active = 0');
    const result = await db.runAsync(
      'INSERT INTO schools (name, color, code, is_active) VALUES (?, ?, ?, 1)',
      name.trim(),
      color,
      code?.trim() || ''
    );
    return result.lastInsertRowId;
  }
};

export const updateSchool = async (id: number, name: string, color: string, code?: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE schools SET name = ?, color = ?, code = ? WHERE id = ?',
    name.trim(),
    color,
    code?.trim() || '',
    id
  );
};

export const deleteSchool = async (id: number): Promise<void> => {
  const db = await getDB();
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM schools');
  if (countRow && countRow.count <= 1) {
    throw new Error('En az bir okul bulunmalıdır, son okul silinemez.');
  }

  const target = await db.getFirstAsync<School>('SELECT * FROM schools WHERE id = ?', id);
  await db.runAsync('DELETE FROM schools WHERE id = ?', id);

  const defaultId = await getDefaultSchoolId();
  if (defaultId === null || defaultId === id) {
    await db.runAsync("DELETE FROM app_settings WHERE key = 'default_school_id'");
  }

  if (target?.is_active) {
    const firstRemaining = await db.getFirstAsync<School>('SELECT * FROM schools ORDER BY id ASC LIMIT 1');
    if (firstRemaining) {
      await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', firstRemaining.id);
    }
  }
};

/**
 * Kurumsal öğretmen veya admin girişi yapıldığında,
 * sunucudan gelen (aynı admine bağlı tüm) okulları yerel SQLite veritabanına senkronize eder.
 */
export const syncAffiliatedSchools = async (
  affiliatedSchools: Array<{ name: string; code: string; geminiApiKey?: string; geminiModel?: string }>,
  primaryCode?: string
): Promise<School | null> => {
  if (!affiliatedSchools || affiliatedSchools.length === 0) return null;

  const db = await getDB();
  const currentSchools = await db.getAllAsync<School>('SELECT * FROM schools');

  for (let i = 0; i < affiliatedSchools.length; i++) {
    const item = affiliatedSchools[i];
    const cleanCode = item.code?.trim().toUpperCase();
    const cleanName = item.name?.trim();

    const existing = currentSchools.find(
      s => (s.code && s.code.trim().toUpperCase() === cleanCode) || s.name.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (existing) {
      await db.runAsync(
        'UPDATE schools SET name = ?, code = ? WHERE id = ?',
        cleanName,
        cleanCode,
        existing.id
      );
    } else {
      const color = SCHOOL_COLORS[i % SCHOOL_COLORS.length].color;
      await db.runAsync(
        'INSERT INTO schools (name, color, code, is_active) VALUES (?, ?, ?, 0)',
        cleanName,
        color,
        cleanCode
      );
    }
  }

  // Okul listesini SQLite'dan tekrar alıp kuruma AİT OLMAYAN okulları temizleyelim
  const updatedDbSchools = await db.getAllAsync<School>('SELECT * FROM schools');
  const allowedCodes = new Set(affiliatedSchools.map(s => s.code?.trim().toUpperCase()).filter(Boolean));
  const allowedNames = new Set(affiliatedSchools.map(s => s.name?.trim().toLowerCase()).filter(Boolean));

  const validSchoolIds: number[] = [];
  const schoolsToDelete: School[] = [];

  for (const sch of updatedDbSchools) {
    const codeMatch = sch.code && allowedCodes.has(sch.code.trim().toUpperCase());
    const nameMatch = allowedNames.has(sch.name.trim().toLowerCase());
    if (codeMatch || nameMatch) {
      validSchoolIds.push(sch.id);
    } else {
      schoolsToDelete.push(sch);
    }
  }

  // Kuruma ait olmayan (örneğin Merkez Okulu, deneme amaçlı açılan dfgsdfg gibi) okulları temizle
  for (const del of schoolsToDelete) {
    try {
      await db.runAsync('DELETE FROM schedule_items WHERE school_id = ?', del.id);
      await db.runAsync('DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE school_id = ?)', del.id);
      await db.runAsync('DELETE FROM assignments WHERE class_id IN (SELECT id FROM classes WHERE school_id = ?)', del.id);
      await db.runAsync('DELETE FROM classes WHERE school_id = ?', del.id);
      await db.runAsync('DELETE FROM agenda_items WHERE school_id = ?', del.id);
      await db.runAsync('DELETE FROM schools WHERE id = ?', del.id);
    } catch (cleanErr) {
      console.warn('Kurum dışı eski okul temizlenirken hata:', del.name, cleanErr);
    }
  }

  // Okulun Gemini API Key ve Modelini SQLite'a kaydet (böylece tüm öğretmenler ortak anahtarı kullanır)
  const targetItem = affiliatedSchools.find(
    s => primaryCode && s.code?.trim().toUpperCase() === primaryCode.trim().toUpperCase()
  ) || affiliatedSchools[0];

  if (targetItem?.geminiApiKey) {
    await setGeminiApiKey(targetItem.geminiApiKey);
  }
  if (targetItem?.geminiModel) {
    await setGeminiModel(targetItem.geminiModel);
  }

  // Hedef okulu (primaryCode) veya ilk okulu aktif ve varsayılan yap
  let targetSchool: School | null = null;
  if (primaryCode) {
    targetSchool = await db.getFirstAsync<School>(
      'SELECT * FROM schools WHERE UPPER(code) = ? LIMIT 1',
      primaryCode.trim().toUpperCase()
    );
  }
  if (!targetSchool && validSchoolIds.length > 0) {
    targetSchool = await db.getFirstAsync<School>(
      'SELECT * FROM schools WHERE id = ? LIMIT 1',
      validSchoolIds[0]
    );
  }

  if (targetSchool) {
    await db.runAsync('UPDATE schools SET is_active = 0');
    await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', targetSchool.id);

    const currentDef = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'default_school_id'"
    );
    const defId = currentDef?.value ? parseInt(currentDef.value, 10) : null;
    if (!defId || !validSchoolIds.includes(defId)) {
      await setDefaultSchoolId(targetSchool.id);
    }
    return { ...targetSchool, is_active: 1 };
  }

  return await getActiveSchool();
};
