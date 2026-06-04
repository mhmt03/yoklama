import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('yoklama.db');

export const initDb = () => {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS tbl_sinavlar (
        sinavId INTEGER PRIMARY KEY AUTOINCREMENT,
        sinavAd TEXT NOT NULL,
        tarih TEXT NOT NULL
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS tbl_ogrenciListe (
        ogrenciNo TEXT PRIMARY KEY,
        sinifDüzey TEXT,
        sube TEXT,
        adSoyad TEXT
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS tbl_salonlisteleri (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sinavId INTEGER,
        ogrenciNo TEXT,
        salon TEXT,
        sira TEXT,
        geldiMi TEXT DEFAULT 'kontrol edilmedi',
        FOREIGN KEY (sinavId) REFERENCES tbl_sinavlar(sinavId),
        FOREIGN KEY (ogrenciNo) REFERENCES tbl_ogrenciListe(ogrenciNo)
      );
    `);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database', error);
  }
};
