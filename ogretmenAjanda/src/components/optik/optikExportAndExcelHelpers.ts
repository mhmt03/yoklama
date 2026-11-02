import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { showAlert } from '../../utils/webAlertPolyfill';

/**
 * Türkçe optik okuyucu dosyalarını (TXT, DAT, FMT vb.) hem UTF-8 hem de Windows-1254 (Türkçe ANSI)
 * veya ISO-8859-9 formatında bozulmadan, Türkçe karakterleri (ş, ğ, ı, ç, ö, ü) eksiksiz okur.
 */
export async function readTextWithEncodingAutoDetect(input: any): Promise<string> {
  try {
    let buffer: ArrayBuffer;
    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (input && typeof input.arrayBuffer === 'function') {
      buffer = await input.arrayBuffer();
    } else if (typeof input === 'string') {
      return input;
    } else {
      return '';
    }

    // 1. Önce UTF-8 fatal denemesi (Eğer Windows-1254 Türkçe baytları varsa exception fırlatır)
    try {
      if (typeof TextDecoder !== 'undefined') {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        const text = utf8Decoder.decode(buffer);
        if (!text.includes('\uFFFD')) {
          return text;
        }
      }
    } catch {
      // UTF-8 geçersiz bayt dizisi, Windows-1254 denenecek
    }

    // 2. Windows-1254 (Türkçe ANSI) çözümlemesi
    if (typeof TextDecoder !== 'undefined') {
      try {
        const trDecoder = new TextDecoder('windows-1254');
        return trDecoder.decode(buffer);
      } catch {
        try {
          const isoDecoder = new TextDecoder('iso-8859-9');
          return isoDecoder.decode(buffer);
        } catch {
          const defDecoder = new TextDecoder();
          return defDecoder.decode(buffer);
        }
      }
    }

    return '';
  } catch (err) {
    console.warn('readTextWithEncodingAutoDetect hatası:', err);
    return '';
  }
}

const escapeHtml = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const normalizeLessonKeyFront = (raw?: string): string => {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'I')
    .replace(/i/g, 'I')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 'S')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'C')
    .toUpperCase();
};

const saveWorkbookCrossPlatform = async (wb: XLSX.WorkBook, fileName: string) => {
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, fileName);
    return;
  }
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const docDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
  const uri = `${docDir}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, wbout, {
    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  } else {
    showAlert('İndirildi', `Dosya kaydedildi: ${uri}`);
  }
};

const openPrintHtmlWindow = (htmlContent: string, title: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const win = window.open('', '_blank');
    if (!win) {
      showAlert('Uyarı', 'Tarayıcınız açılır pencereyi (pop-up) engelledi. Lütfen izin verip tekrar deneyin.');
      return;
    }
    win.document.open();
    win.document.write(htmlContent);
    win.document.close();
    win.document.title = title;
    setTimeout(() => {
      win.focus();
      win.print();
    }, 350);
  } else {
    showAlert('Bilgi', 'PDF yazdırma özelliği web tarayıcısı üzerinden doğrudan PDF olarak kaydedilebilir.');
  }
};

// ============================================================================
// 1. CEVAP ANAHTARI EXCEL ŞABLONU İNDİRME & YÜKLEME
// ============================================================================

export const downloadAnswerKeyExcelTemplate = async (editingExam: any) => {
  try {
    const dersler = Array.isArray(editingExam?.dersler) && editingExam.dersler.length > 0
      ? editingExam.dersler
      : [
          { dersAdi: 'Türk Dili ve Edebiyatı', soruSayisi: 20, katsayi: 1.5, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
          { dersAdi: 'Matematik', soruSayisi: 20, katsayi: 2.0, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
        ];

    // Sayfa 1: Soru Bazlı Dikey Şablon (Hem Cevap Anahtarı Hem Konu/Kazanım Girilebilir!)
    const questionRows: any[] = [];
    dersler.forEach((d: any) => {
      const qCount = parseInt(String(d.soruSayisi || 20), 10) || 20;
      const keyA = String(d.cevapAnahtariA || '');
      const keyB = String(d.cevapAnahtariB || '');
      const keyC = String(d.cevapAnahtariC || '');
      const keyD = String(d.cevapAnahtariD || '');

      for (let q = 1; q <= qCount; q++) {
        questionRows.push({
          'Ders Adı': d.dersAdi || 'Ders',
          'Soru No': q,
          'A Kitapçığı': keyA[q - 1] || '',
          'B Kitapçığı': keyB[q - 1] || '',
          'C Kitapçığı': keyC[q - 1] || '',
          'D Kitapçığı': keyD[q - 1] || '',
          'B Soru Karşılığı (Opsiyonel)': q,
          'Konu Adı (Opsiyonel)': '',
          'Kazanım Kodu (Opsiyonel)': '',
          'Kazanım Açıklaması (Opsiyonel)': '',
        });
      }
    });

    // Sayfa 2: Ders Bazlı Yatay Bitişik Anahtar Şablonu
    const summaryRows = dersler.map((d: any, idx: number) => ({
      'Sıra No': idx + 1,
      'Ders Adı': d.dersAdi || `Ders ${idx + 1}`,
      'Soru Sayısı': d.soruSayisi || 20,
      'Katsayı': d.katsayi ?? 1.0,
      'A Kitapçığı Anahtarı': d.cevapAnahtariA || '',
      'B Kitapçığı Anahtarı': d.cevapAnahtariB || '',
      'C Kitapçığı Anahtarı': d.cevapAnahtariC || '',
      'D Kitapçığı Anahtarı': d.cevapAnahtariD || '',
    }));

    const wb = XLSX.utils.book_new();

    const wsQuestions = XLSX.utils.json_to_sheet(questionRows);
    wsQuestions['!cols'] = [
      { wch: 24 },
      { wch: 10 },
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 22 },
      { wch: 26 },
      { wch: 18 },
      { wch: 36 },
    ];
    XLSX.utils.book_append_sheet(wb, wsQuestions, 'Soru_Bazli_Anahtar');

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [
      { wch: 10 },
      { wch: 25 },
      { wch: 14 },
      { wch: 10 },
      { wch: 32 },
      { wch: 32 },
      { wch: 32 },
      { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ders_Bazli_Bitisik_Anahtar');

    const safeExamName = String(editingExam?.sinavAdi || 'Optik_Sinav')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 40);

    await saveWorkbookCrossPlatform(wb, `${safeExamName}_Cevap_Anahtari_Sablonu.xlsx`);
  } catch (err: any) {
    showAlert('Şablon İndirme Hatası', err?.message || 'Excel şablonu oluşturulamadı.');
  }
};

export interface ParsedAnswerKeyExcelResult {
  dersler: Array<{
    dersAdi: string;
    soruSayisi: number;
    katsayi: number;
    siraNo: number;
    cevapAnahtariA: string;
    cevapAnahtariB: string;
    cevapAnahtariC?: string;
    cevapAnahtariD?: string;
  }>;
  kazanimlar: Array<{
    dersAdi: string;
    soruNo: number;
    bSoruNo?: number;
    konuAdi: string;
    kazanimKodu?: string;
    kazanimAciklamasi?: string;
  }>;
}

export const parseAnswerKeyExcelArrayBuffer = (
  buffer: ArrayBuffer,
  existingDersler: any[] = []
): ParsedAnswerKeyExcelResult => {
  const wb = XLSX.read(buffer, { type: 'array' });
  const kazanimlar: ParsedAnswerKeyExcelResult['kazanimlar'] = [];

  // Önce 1. sayfayı (Soru_Bazli_Anahtar) veya ilk sayfayı kontrol et
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows || rows.length === 0) continue;

    const firstRowKeys = Object.keys(rows[0] || {});
    const findCol = (patterns: RegExp[]) =>
      firstRowKeys.find((k) => patterns.some((p) => p.test(k.trim())));

    const colDers = findCol([/ders/i, /brans/i, /branş/i, /test/i]);
    const colSoruNo = findCol([/^soru\s*no/i, /^soru$/i, /no$/i]);
    const colA = findCol([/^a(\s|$|\b)/i, /a\s*kitap/i, /a\s*anahtar/i, /cevap\s*a/i]);
    const colB = findCol([/^b(\s|$|\b)/i, /b\s*kitap/i, /b\s*anahtar/i, /cevap\s*b/i]);
    const colC = findCol([/^c(\s|$|\b)/i, /c\s*kitap/i, /c\s*anahtar/i, /cevap\s*c/i]);
    const colD = findCol([/^d(\s|$|\b)/i, /d\s*kitap/i, /d\s*anahtar/i, /cevap\s*d/i]);
    const colBSoruNo = findCol([/b\s*soru/i, /b\s*karsilik/i, /b\s*karşılık/i]);
    const colKonu = findCol([/konu/i, /ünite/i, /unite/i]);
    const colKazKod = findCol([/kazan[ıi]m\s*kod/i, /^kod/i]);
    const colKazAciklama = findCol([/kazan[ıi]m\s*a[çc][ıi]klama/i, /^kazan[ıi]m$/i, /a[çc][ıi]klama/i]);

    // Durum A: Soru bazlı dikey tablo (Soru No sütunu var ve A sütunundaki cevaplar tek karakter)
    if (colDers && colSoruNo && colA) {
      const grouped = new Map<string, any[]>();
      rows.forEach((r) => {
        const dName = String(r[colDers] || '').trim();
        const qNo = parseInt(String(r[colSoruNo] || '0'), 10);
        if (!dName || !qNo || qNo <= 0) return;
        if (!grouped.has(dName)) grouped.set(dName, []);
        grouped.get(dName)!.push({
          qNo,
          a: String(r[colA] || '').trim().toUpperCase()[0] || ' ',
          b: colB ? String(r[colB] || '').trim().toUpperCase()[0] || '' : '',
          c: colC ? String(r[colC] || '').trim().toUpperCase()[0] || '' : '',
          d: colD ? String(r[colD] || '').trim().toUpperCase()[0] || '' : '',
          bQNo: colBSoruNo ? parseInt(String(r[colBSoruNo] || qNo), 10) || qNo : qNo,
          konu: colKonu ? String(r[colKonu] || '').trim() : '',
          kazKod: colKazKod ? String(r[colKazKod] || '').trim() : '',
          kazAciklama: colKazAciklama ? String(r[colKazAciklama] || '').trim() : '',
        });
      });

      if (grouped.size > 0) {
        const parsedDersler: ParsedAnswerKeyExcelResult['dersler'] = [];
        let sira = 1;
        grouped.forEach((qList, dName) => {
          qList.sort((x, y) => x.qNo - y.qNo);
          const maxQ = Math.max(...qList.map((x) => x.qNo), qList.length);
          const arrA = new Array(maxQ).fill('A');
          const arrB = new Array(maxQ).fill('');
          const arrC = new Array(maxQ).fill('');
          const arrD = new Array(maxQ).fill('');

          qList.forEach((item) => {
            const idx = item.qNo - 1;
            if (idx >= 0 && idx < maxQ) {
              arrA[idx] = item.a && item.a !== ' ' ? item.a : 'A';
              if (item.b) arrB[idx] = item.b;
              if (item.c) arrC[idx] = item.c;
              if (item.d) arrD[idx] = item.d;
            }
            if (item.konu) {
              kazanimlar.push({
                dersAdi: dName,
                soruNo: item.qNo,
                bSoruNo: item.bQNo,
                konuAdi: item.konu,
                kazanimKodu: item.kazKod || undefined,
                kazanimAciklamasi: item.kazAciklama || undefined,
              });
            }
          });

          const existingMatch = existingDersler.find(
            (ed) => normalizeLessonKeyFront(ed.dersAdi) === normalizeLessonKeyFront(dName)
          );

          parsedDersler.push({
            dersAdi: dName,
            soruSayisi: maxQ,
            katsayi: existingMatch?.katsayi ?? 1.5,
            siraNo: sira++,
            cevapAnahtariA: arrA.join(''),
            cevapAnahtariB: arrB.some(Boolean) ? arrB.map((c, i) => c || arrA[i]).join('') : '',
            cevapAnahtariC: arrC.some(Boolean) ? arrC.map((c, i) => c || arrA[i]).join('') : undefined,
            cevapAnahtariD: arrD.some(Boolean) ? arrD.map((c, i) => c || arrA[i]).join('') : undefined,
          });
        });

        if (parsedDersler.length > 0) {
          return { dersler: parsedDersler, kazanimlar };
        }
      }
    }

    // Durum B: Ders bazlı yatay bitişik cevap anahtarı tablosu
    const colSoruSayisi = findCol([/soru\s*say/i, /adet/i]);
    const colKatsayi = findCol([/katsay/i, /puan/i]);
    if (colDers && colA) {
      const parsedDersler: ParsedAnswerKeyExcelResult['dersler'] = [];
      rows.forEach((r, idx) => {
        const dName = String(r[colDers] || '').trim();
        const keyA = String(r[colA] || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!dName || !keyA) return;
        const keyB = colB ? String(r[colB] || '').trim().toUpperCase().replace(/\s+/g, '') : '';
        const keyC = colC ? String(r[colC] || '').trim().toUpperCase().replace(/\s+/g, '') : '';
        const keyD = colD ? String(r[colD] || '').trim().toUpperCase().replace(/\s+/g, '') : '';
        const qCount = colSoruSayisi ? parseInt(String(r[colSoruSayisi] || keyA.length), 10) || keyA.length : keyA.length;
        const katsayi = colKatsayi ? parseFloat(String(r[colKatsayi] || '1.5')) || 1.5 : 1.5;

        parsedDersler.push({
          dersAdi: dName,
          soruSayisi: qCount,
          katsayi,
          siraNo: idx + 1,
          cevapAnahtariA: keyA,
          cevapAnahtariB: keyB,
          cevapAnahtariC: keyC || undefined,
          cevapAnahtariD: keyD || undefined,
        });
      });

      if (parsedDersler.length > 0) {
        return { dersler: parsedDersler, kazanimlar };
      }
    }
  }

  throw new Error('Excel dosyasında geçerli bir "Ders Adı" ve "A Kitapçığı" sütunu bulunamadı. Lütfen önce "Excel Şablonu İndir" butonuyla örnek şablonu indirip doldurun.');
};

// ============================================================================
// 2. TOPLU SONUÇ LİSTESİNİ EXCEL (.XLSX) VE PDF OLARAK ALMA
// ============================================================================

export const findLessonResultForStudent = (studentResult: any, lessonName: string) => {
  const normTarget = normalizeLessonKeyFront(lessonName);
  return (studentResult?.dersSonuclari || []).find(
    (ds: any) => normalizeLessonKeyFront(ds.dersAdi) === normTarget
  );
};

export const exportOptikResultsToExcel = async (
  examTitle: string,
  results: any[],
  lessonNames: string[]
) => {
  try {
    if (!results || results.length === 0) {
      showAlert('Uyarı', 'Dışa aktarılacak öğrenci sonucu bulunmuyor.');
      return;
    }

    const excelRows = results.map((r, idx) => {
      const row: Record<string, any> = {
        'Liste Sırası': idx + 1,
        'Okul Derecesi': r.okulSirasi ?? '-',
        'Sınıf Derecesi': r.sinifSirasi ?? '-',
        'Öğrenci No': r.ogrenciNo || '',
        'Ad Soyad': r.adSoyad || '',
        'Sınıf / Şube': r.sinif || '',
        'Kitapçık': r.kitapcikTuru || 'A',
      };

      lessonNames.forEach((lName) => {
        const ds = findLessonResultForStudent(r, lName);
        row[`${lName} (D)`] = ds?.dogruSayisi ?? 0;
        row[`${lName} (Y)`] = ds?.yanlisSayisi ?? 0;
        row[`${lName} (Net)`] = ds?.net ?? 0;
      });

      // Ders Grubu Toplam Netleri (Fen Bilimleri, Sosyal Bilimler vb.)
      if (Array.isArray(r.grupSonuclari) && r.grupSonuclari.length > 0) {
        r.grupSonuclari.forEach((grp: any) => {
          if (grp.grupAdi) {
            row[`${grp.grupAdi} (Toplam Net)`] = grp.net ?? 0;
          }
        });
      }

      row['Toplam Doğru'] = r.toplamDogru ?? 0;
      row['Toplam Yanlış'] = r.toplamYanlis ?? 0;
      row['Toplam Boş'] = r.toplamBos ?? 0;
      row['Toplam Net'] = r.toplamNet ?? 0;
      row['Sınav Puanı'] = r.puan ?? 0;

      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);
    const cols: any[] = [
      { wch: 11 },
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 24 },
      { wch: 12 },
      { wch: 9 },
    ];
    lessonNames.forEach(() => {
      cols.push({ wch: 10 }, { wch: 10 }, { wch: 12 });
    });
    cols.push({ wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 13 });
    ws['!cols'] = cols;

    XLSX.utils.book_append_sheet(wb, ws, 'Sinav_Sonuc_Listesi');

    const safeTitle = String(examTitle || 'Optik_Sinav')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 45);
    await saveWorkbookCrossPlatform(wb, `${safeTitle}_Sonuc_Listesi.xlsx`);
  } catch (err: any) {
    showAlert('Excel Aktarım Hatası', err?.message || 'Excel dosyası oluşturulamadı.');
  }
};

export const printOptikResultsTablePdf = (
  examTitle: string,
  examDate: string,
  filterLabel: string,
  sortLabel: string,
  results: any[],
  lessonNames: string[]
) => {
  if (!results || results.length === 0) {
    showAlert('Uyarı', 'Yazdırılacak öğrenci sonucu bulunmuyor.');
    return;
  }

  const avgNet =
    results.length > 0
      ? (results.reduce((acc, r) => acc + (Number(r.toplamNet) || 0), 0) / results.length).toFixed(2)
      : '0.00';
  const avgScore =
    results.length > 0
      ? (results.reduce((acc, r) => acc + (Number(r.puan) || 0), 0) / results.length).toFixed(2)
      : '0.00';

  const lessonGroupHeaders = lessonNames
    .map(
      (l) =>
        `<th colspan="3" style="background:#EFF6FF;color:#1E3A8A;border:1px solid #CBD5E1;padding:4px 3px;font-size:10px;text-align:center;">${escapeHtml(
          l
        )}</th>`
    )
    .join('');

  const lessonSubHeaders = lessonNames
    .map(
      () =>
        `<th style="background:#F8FAFC;color:#16A34A;border:1px solid #CBD5E1;padding:3px 2px;font-size:9px;">D</th>` +
        `<th style="background:#F8FAFC;color:#DC2626;border:1px solid #CBD5E1;padding:3px 2px;font-size:9px;">Y</th>` +
        `<th style="background:#EFF6FF;color:#1D4ED8;border:1px solid #CBD5E1;padding:3px 2px;font-size:9px;font-weight:800;">Net</th>`
    )
    .join('');

  const rowsHtml = results
    .map((r, idx) => {
      const lessonCells = lessonNames
        .map((lName) => {
          const ds = findLessonResultForStudent(r, lName);
          const d = ds?.dogruSayisi ?? 0;
          const y = ds?.yanlisSayisi ?? 0;
          const n = ds?.net ?? 0;
          return (
            `<td style="border:1px solid #E2E8F0;padding:3px 2px;text-align:center;color:#15803D;">${d}</td>` +
            `<td style="border:1px solid #E2E8F0;padding:3px 2px;text-align:center;color:#B91C1C;">${y}</td>` +
            `<td style="border:1px solid #E2E8F0;padding:3px 2px;text-align:center;font-weight:700;color:#1D4ED8;background:#F8FAFC;">${n}</td>`
          );
        })
        .join('');

      return `<tr style="background:${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:700;">${r.okulSirasi ?? idx + 1}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;">${r.sinifSirasi ?? '-'}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:600;">${escapeHtml(r.ogrenciNo)}</td>
        <td style="border:1px solid #E2E8F0;padding:4px 6px;font-weight:700;color:#0F172A;">${escapeHtml(r.adSoyad)}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:600;">${escapeHtml(r.sinif)}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;">${escapeHtml(r.kitapcikTuru)}</td>
        ${lessonCells}
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:700;color:#15803D;">${r.toplamDogru}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:700;color:#DC2626;">${r.toplamYanlis}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;color:#64748B;">${r.toplamBos}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:800;color:#1D4ED8;background:#EFF6FF;">${r.toplamNet}</td>
        <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:800;color:#6D28D9;background:#F5F3FF;">${r.puan}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(examTitle)} - Sonuç Listesi</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0F172A; margin: 0; padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1E3A8A; padding-bottom: 8px; margin-bottom: 10px; }
  .title { font-size: 16px; font-weight: 800; color: #1E3A8A; }
  .sub { font-size: 11px; color: #475569; margin-top: 2px; }
  .summary-pills { display: flex; gap: 10px; font-size: 11px; font-weight: 700; }
  .pill { background: #F1F5F9; border: 1px solid #CBD5E1; padding: 4px 8px; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { font-weight: 700; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="no-print" style="background:#1E3A8A;color:#FFF;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-radius:6px;">
    <span>🖨️ <b>${escapeHtml(examTitle)}</b> — PDF olarak kaydetmek veya yazdırmak için <b>"Yazdır / PDF Kaydet"</b> butonunu kullanın.</span>
    <button onclick="window.print()" style="background:#FFF;color:#1E3A8A;border:none;padding:6px 14px;border-radius:6px;font-weight:800;cursor:pointer;">🖨️ Yazdır / PDF Kaydet</button>
  </div>
  <div class="header">
    <div>
      <div class="title">🎯 ${escapeHtml(examTitle)} — Detaylı Sonuç Listesi</div>
      <div class="sub">Tarih: ${escapeHtml(examDate)} · Filtre: ${escapeHtml(filterLabel)} · Sıralama: ${escapeHtml(sortLabel)}</div>
    </div>
    <div class="summary-pills">
      <div class="pill">👥 Öğrenci: ${results.length}</div>
      <div class="pill" style="color:#1D4ED8;">📈 Ort. Net: ${avgNet}</div>
      <div class="pill" style="color:#6D28D9;">🏆 Ort. Puan: ${avgScore}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px;">Okul<br/>Sıra</th>
        <th rowspan="2" style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px;">Sınıf<br/>Sıra</th>
        <th rowspan="2" style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px;">Öğr. No</th>
        <th rowspan="2" style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px;text-align:left;">Ad Soyad</th>
        <th rowspan="2" style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px;">Sınıf</th>
        <th rowspan="2" style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px;">Kit.</th>
        ${lessonGroupHeaders}
        <th colspan="4" style="background:#DCFCE7;color:#166534;border:1px solid #CBD5E1;padding:4px;text-align:center;">TOPLAM</th>
        <th rowspan="2" style="background:#F5F3FF;color:#5B21B6;border:1px solid #CBD5E1;padding:4px;">PUAN</th>
      </tr>
      <tr>
        ${lessonSubHeaders}
        <th style="background:#F0FDF4;color:#15803D;border:1px solid #CBD5E1;padding:3px;">D</th>
        <th style="background:#FEF2F2;color:#DC2626;border:1px solid #CBD5E1;padding:3px;">Y</th>
        <th style="background:#F8FAFC;color:#64748B;border:1px solid #CBD5E1;padding:3px;">B</th>
        <th style="background:#EFF6FF;color:#1D4ED8;border:1px solid #CBD5E1;padding:3px;font-weight:800;">Net</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  openPrintHtmlWindow(html, `${examTitle} - Sonuç Listesi`);
};

// ============================================================================
// 3. BİREYSEL VE TOPLU ÖĞRENCİ KARNESİ PDF OLUŞTURUCU
// ============================================================================

export const printOptikStudentReportsPdf = (examInfo: any, reportsList: any[]) => {
  if (!reportsList || reportsList.length === 0) {
    showAlert('Uyarı', 'Yazdırılacak öğrenci karnesi bulunamadı.');
    return;
  }

  const examName = examInfo?.sinavAdi || 'Optik Deneme Sınavı';
  const examDate = examInfo?.uygulamaTarihi
    ? new Date(examInfo.uygulamaTarihi).toLocaleDateString('tr-TR')
    : '';
  const examTuru = examInfo?.sinavTuru && examInfo.sinavTuru !== 'SERBEST' ? examInfo.sinavTuru : 'Deneme Sınavı';

  const pagesHtml = reportsList
    .map((rep, idx) => {
      const stu = rep.student || {};
      const lessons = [...(rep.lessons || [])].sort((a: any, b: any) => (a.siraNo || 0) - (b.siraNo || 0));
      const kazanimlar = rep.kazanimAnalizi || [];
      const recentExamsList = Array.isArray(rep.recentExams) && rep.recentExams.length > 0 ? rep.recentExams : [];

      // 1. Ders Analiz Satırları ve Toplamı
      const lessonsRowsHtml = lessons
        .map(
          (l: any) => `
          <tr>
            <td style="border:1px solid #CBD5E1;padding:5px 7px;font-weight:700;color:#0F172A;">
              ${escapeHtml(l.dersAdi)}
              ${l.dersGrubu ? `<span style="font-size:9px;color:#6366F1;font-weight:600;"> (${escapeHtml(l.dersGrubu)})</span>` : ''}
            </td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;">${l.soruSayisi}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#15803D;font-weight:700;">${l.dogruSayisi}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#DC2626;font-weight:700;">${l.yanlisSayisi}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#64748B;">${l.bosSayisi}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;font-weight:800;color:#1D4ED8;background:#EFF6FF;">${l.net}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;">${l.sinifOrtalamaNet}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;">${l.okulOrtalamaNet}</td>
            <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;font-weight:700;">%${l.basariYuzdesi}</td>
          </tr>`
        )
        .join('');

      const totalSoru = lessons.reduce((acc: number, l: any) => acc + (l.soruSayisi || 0), 0);
      const totalD = stu.toplamDogru ?? lessons.reduce((acc: number, l: any) => acc + (l.dogruSayisi || 0), 0);
      const totalY = stu.toplamYanlis ?? lessons.reduce((acc: number, l: any) => acc + (l.yanlisSayisi || 0), 0);
      const totalB = stu.toplamBos ?? lessons.reduce((acc: number, l: any) => acc + (l.bosSayisi || 0), 0);
      const totalNet = stu.toplamNet ?? lessons.reduce((acc: number, l: any) => acc + (l.net || 0), 0);
      const totalAvgSinif = stu.sinifOrtalamaNet ?? '-';
      const totalAvgOkul = stu.okulOrtalamaNet ?? '-';
      const totalBasariPct = totalSoru > 0 ? Math.round((totalD * 100) / totalSoru) : 0;

      const totalRowHtml = `
        <tr style="background:#F1F5F9;font-weight:800;border-top:2px solid #94A3B8;">
          <td style="border:1px solid #CBD5E1;padding:5px 7px;color:#0F172A;">GENEL TOPLAM</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;">${totalSoru}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#15803D;">${totalD}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#DC2626;">${totalY}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#64748B;">${totalB}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#1D4ED8;background:#DBEAFE;font-size:11px;">${totalNet}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;">${totalAvgSinif}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;">${totalAvgOkul}</td>
          <td style="border:1px solid #CBD5E1;padding:5px;text-align:center;color:#1E3A8A;">%${totalBasariPct}</td>
        </tr>
      `;

      // 2. Ders Grubu Toplamları (örn. Fen Bilimleri = Fizik + Kimya + Biyoloji)
      const grupOzetleriList = Array.isArray(rep.grupOzetleri) && rep.grupOzetleri.length > 0
        ? rep.grupOzetleri
        : (Array.isArray(rep.student?.grupOzetleri) ? rep.student.grupOzetleri : []);

      const grupOzetleriHtml = grupOzetleriList.length > 0
        ? `<div style="margin:6px 0 10px 0;padding:6px 10px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:6px;font-size:10px;">
            <b style="color:#1E293B;">🏷️ Ders Grubu Toplamları: </b>` +
          grupOzetleriList.map((grp: any) =>
            `<span style="display:inline-block;margin-right:10px;background:#FFF;border:1px solid #E2E8F0;padding:2px 8px;border-radius:4px;">
              <b>${escapeHtml(grp.grupAdi)}:</b> ${grp.dogruSayisi}D · ${grp.yanlisSayisi}Y · <b style="color:#1D4ED8;">${grp.net} Net</b> (%${grp.basariYuzdesi})
            </span>`
          ).join('') +
          `</div>`
        : '';

      // 3. Geçmiş Sınavlar Karşılaştırmalı Gelişim Tablosu (karne örnek.pdf Page 1 gibi)
      let recentExamsHtml = '';
      if (recentExamsList.length > 0) {
        const lessonSet = new Set<string>();
        recentExamsList.forEach((re: any) => {
          (re.dersler || []).forEach((d: any) => { if (d.dersAdi) lessonSet.add(d.dersAdi); });
        });
        const recentLessonNames = Array.from(lessonSet);

        const headerCells = recentLessonNames.map((name: string) =>
          `<th style="border:1px solid #CBD5E1;padding:4px;font-size:8.5px;">${escapeHtml(name)}</th>`
        ).join('');

        const rows = recentExamsList.map((re: any) => {
          const dMap: { [key: string]: any } = {};
          (re.dersler || []).forEach((d: any) => { dMap[d.dersAdi] = d.net; });
          const dCells = recentLessonNames.map((name: string) =>
            `<td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:600;">${dMap[name] !== undefined ? dMap[name] : '-'}</td>`
          ).join('');

          const tStr = re.uygulamaTarihi ? new Date(re.uygulamaTarihi).toLocaleDateString('tr-TR') : '-';
          return `<tr>
            <td style="border:1px solid #E2E8F0;padding:4px 6px;">${tStr}</td>
            <td style="border:1px solid #E2E8F0;padding:4px 6px;font-weight:700;">${escapeHtml(re.sinavAdi)}</td>
            ${dCells}
            <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:800;color:#1D4ED8;background:#EFF6FF;">${re.toplamNet}</td>
            <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:800;color:#7C3AED;">${re.puan}</td>
            <td style="border:1px solid #E2E8F0;padding:4px;text-align:center;font-weight:700;color:#B45309;">${re.okulSirasi ? `#${re.okulSirasi}` : '-'}</td>
          </tr>`;
        }).join('');

        recentExamsHtml = `
          <div style="margin:10px 0 8px 0;">
            <div style="font-size:11px;font-weight:800;color:#1E3A8A;margin-bottom:4px;">📈 SON SINAVLARIN SONUÇLARI (GELİŞİM TAKİBİ)</div>
            <table style="width:100%;border-collapse:collapse;font-size:9px;">
              <thead>
                <tr style="background:#F1F5F9;">
                  <th style="border:1px solid #CBD5E1;padding:4px 6px;text-align:left;">Tarih</th>
                  <th style="border:1px solid #CBD5E1;padding:4px 6px;text-align:left;">Sınav Adı</th>
                  ${headerCells}
                  <th style="border:1px solid #CBD5E1;padding:4px;color:#1D4ED8;">Toplam Net</th>
                  <th style="border:1px solid #CBD5E1;padding:4px;color:#7C3AED;">Puan</th>
                  <th style="border:1px solid #CBD5E1;padding:4px;color:#B45309;">Kurum Sırası</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }

      // 4. Optik Soru Cevap Şeridi
      const opticalStripsHtml = lessons
        .map((l: any) => {
          const cells = (l.sorular || [])
            .map((q: any) => {
              const bg =
                q.durum === 'DOGRU' ? '#DCFCE7' : q.durum === 'YANLIS' ? '#FEE2E2' : '#F1F5F9';
              const fg =
                q.durum === 'DOGRU' ? '#15803D' : q.durum === 'YANLIS' ? '#DC2626' : '#64748B';
              return `<div style="display:inline-block;width:20px;text-align:center;border:1px solid #CBD5E1;border-radius:3px;margin:1px;background:${bg};font-size:8.5px;line-height:1.15;padding:2px 0;">
                <div style="color:#64748B;font-size:7.5px;">${q.soruNo}</div>
                <div style="color:${fg};font-weight:800;">${escapeHtml(q.ogrenciCevabi)}</div>
                <div style="color:#94A3B8;font-size:7.5px;">${escapeHtml(q.dogruCevap)}</div>
              </div>`;
            })
            .join('');

          return `<div style="margin-bottom:6px;border:1px solid #E2E8F0;border-radius:6px;padding:5px 7px;background:#FAFAFA;">
            <div style="font-size:10px;font-weight:700;color:#1E293B;margin-bottom:3px;">
              ${escapeHtml(l.dersAdi)} (${l.dogruSayisi}D · ${l.yanlisSayisi}Y · ${l.bosSayisi}B = <b>${l.net} Net</b>)
            </div>
            <div>${cells}</div>
          </div>`;
        })
        .join('');

      // 5. Konu ve Kazanım Analizi (karne örnek.pdf Sayfa 2)
      let questionKonuRows: any[] = [];
      lessons.forEach((l: any) => {
        (l.sorular || []).forEach((q: any) => {
          if (q.konuAdi || q.kazanimAciklamasi) {
            questionKonuRows.push({
              soruNo: q.soruNo,
              dersAdi: l.dersAdi,
              konuAdi: q.konuAdi || q.kazanimAciklamasi || '',
              dc: q.dogruCevap || '-',
              oc: q.ogrenciCevabi || '-',
              durum: q.durum || 'BOS',
            });
          }
        });
      });

      const kazanimSummaryRowsHtml =
        kazanimlar.length > 0
          ? `<div style="margin-top:10px;">
              <div style="font-size:11px;font-weight:800;color:#1E3A8A;margin-bottom:4px;">🎯 KONU / KAZANIM BAZLI BAŞARI ÖZETİ</div>
              <table style="width:100%;border-collapse:collapse;font-size:9px;">
                <thead>
                  <tr style="background:#F1F5F9;">
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:left;">Ders</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:left;">Konu / Kazanım</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:center;">Soru</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:center;">D</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:center;">Y</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:center;">B</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:center;">Başarı</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:center;">Değerlendirme</th>
                  </tr>
                </thead>
                <tbody>
                  ${kazanimlar
                    .map((k: any) => {
                      const durumColor =
                        k.basariYuzdesi >= 75 ? '#15803D' : k.basariYuzdesi >= 50 ? '#B45309' : '#DC2626';
                      return `<tr>
                        <td style="border:1px solid #E2E8F0;padding:3px 5px;font-weight:600;">${escapeHtml(k.dersAdi)}</td>
                        <td style="border:1px solid #E2E8F0;padding:3px 5px;"><b>${escapeHtml(k.konuAdi)}</b>${
                          k.kazanimAciklamasi ? ` — ${escapeHtml(k.kazanimAciklamasi)}` : ''
                        }</td>
                        <td style="border:1px solid #E2E8F0;padding:3px;text-align:center;">${k.toplamSoru}</td>
                        <td style="border:1px solid #E2E8F0;padding:3px;text-align:center;color:#15803D;font-weight:700;">${k.dogruSayisi}</td>
                        <td style="border:1px solid #E2E8F0;padding:3px;text-align:center;color:#DC2626;font-weight:700;">${k.yanlisSayisi}</td>
                        <td style="border:1px solid #E2E8F0;padding:3px;text-align:center;">${k.bosSayisi}</td>
                        <td style="border:1px solid #E2E8F0;padding:3px;text-align:center;font-weight:700;color:${durumColor};">%${k.basariYuzdesi}</td>
                        <td style="border:1px solid #E2E8F0;padding:3px;text-align:center;font-weight:700;color:${durumColor};">${escapeHtml(k.durum)}</td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
          : '';

      let page2Html = '';
      if (questionKonuRows.length > 0 || kazanimlar.length > 0) {
        const qRowsHtml = questionKonuRows.map((qr: any) => {
          const isCorrect = qr.durum === 'DOGRU';
          const isWrong = qr.durum === 'YANLIS';
          const icon = isCorrect ? '✔' : isWrong ? '✘' : '-';
          const iconBg = isCorrect ? '#DCFCE7' : isWrong ? '#FEE2E2' : '#F1F5F9';
          const iconFg = isCorrect ? '#15803D' : isWrong ? '#DC2626' : '#64748B';

          return `<tr>
            <td style="border:1px solid #CBD5E1;padding:3px 5px;text-align:center;font-weight:700;">${qr.soruNo}</td>
            <td style="border:1px solid #CBD5E1;padding:3px 5px;font-weight:600;">${escapeHtml(qr.dersAdi)}</td>
            <td style="border:1px solid #CBD5E1;padding:3px 5px;">${escapeHtml(qr.konuAdi)}</td>
            <td style="border:1px solid #CBD5E1;padding:3px;text-align:center;font-weight:800;color:#0F172A;">${escapeHtml(qr.dc)}</td>
            <td style="border:1px solid #CBD5E1;padding:3px;text-align:center;font-weight:800;color:${iconFg};">${escapeHtml(qr.oc)}</td>
            <td style="border:1px solid #CBD5E1;padding:3px;text-align:center;background:${iconBg};font-weight:900;color:${iconFg};">${icon}</td>
          </tr>`;
        }).join('');

        page2Html = `
          <div style="page-break-before:always;padding-top:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1E3A8A;padding-bottom:6px;margin-bottom:8px;">
              <div>
                <div style="font-size:14px;font-weight:800;color:#1E3A8A;">🎯 ${escapeHtml(examName)} — KONU VE KAZANIM ANALİZİ</div>
                <div style="font-size:10px;color:#475569;margin-top:2px;">
                  Öğrenci: <b>${escapeHtml(stu.adSoyad)}</b> · No: <b>${escapeHtml(stu.ogrenciNo)}</b> · Sınıf: <b>${escapeHtml(stu.sinif)}</b> · Kitapçık: <b>${escapeHtml(stu.kitapcikTuru)}</b>
                </div>
              </div>
              <div style="background:#F1F5F9;border:1px solid #CBD5E1;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:800;color:#334155;">SAYFA 2 / 2</div>
            </div>

            ${questionKonuRows.length > 0 ? `
              <div style="font-size:11px;font-weight:800;color:#1E3A8A;margin-bottom:4px;">📋 SORU BAZLI KONU VE CEVAP ANALİZİ</div>
              <table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:12px;">
                <thead>
                  <tr style="background:#F1F5F9;">
                    <th style="border:1px solid #CBD5E1;padding:4px;width:35px;">No</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;width:110px;text-align:left;">Ders</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;text-align:left;">Konu / Kazanım</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;width:35px;">DC</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;width:35px;">ÖC</th>
                    <th style="border:1px solid #CBD5E1;padding:4px;width:45px;">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  ${qRowsHtml}
                </tbody>
              </table>
            ` : ''}

            ${kazanimSummaryRowsHtml}
          </div>
        `;
      }

      const isLast = idx === reportsList.length - 1;
      return `<div style="${isLast ? '' : 'page-break-after: always;'}padding:4px 0;">
        {/* Sayfa 1: Üst Başlık & Öğrenci Bilgileri */}
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1E3A8A;padding-bottom:6px;margin-bottom:8px;">
          <div>
            <div style="font-size:15px;font-weight:800;color:#1E3A8A;">🎓 ${escapeHtml(examName)} — Öğrenci Sınav Karnesi</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">
              Öğrenci: <b>${escapeHtml(stu.adSoyad)}</b> · Öğr. No: <b>${escapeHtml(stu.ogrenciNo)}</b> · Sınıf: <b>${escapeHtml(stu.sinif)}</b> · Kitapçık: <b>${escapeHtml(stu.kitapcikTuru)}</b> · Tarih: ${escapeHtml(examDate)} · Tür: ${escapeHtml(examTuru)}
            </div>
          </div>
          <div style="background:#6D28D9;color:#FFF;padding:6px 14px;border-radius:8px;text-align:center;">
            <div style="font-size:9px;font-weight:700;opacity:0.9;">SINAV PUANI</div>
            <div style="font-size:18px;font-weight:900;">${stu.puan}</div>
          </div>
        </div>

        {/* Puan ve Dereceler Özeti */}
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="flex:1;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:6px;text-align:center;">
            <div style="font-size:15px;font-weight:800;color:#1D4ED8;">${stu.toplamNet} Net</div>
            <div style="font-size:9.5px;color:#1E40AF;">${stu.toplamDogru}D · ${stu.toplamYanlis}Y · ${stu.toplamBos}B</div>
          </div>
          <div style="flex:1;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;padding:6px;text-align:center;">
            <div style="font-size:14px;font-weight:800;color:#0F172A;">${stu.sinifOrtalamaNet} / ${stu.okulOrtalamaNet}</div>
            <div style="font-size:9.5px;color:#475569;">Sınıf Ort. / Okul Ort. Net</div>
          </div>
          <div style="flex:1;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:6px;text-align:center;">
            <div style="font-size:14px;font-weight:800;color:#B45309;">${stu.okulSirasi ? `#${stu.okulSirasi} / ${stu.toplamKatilimci}` : '-'}</div>
            <div style="font-size:9.5px;color:#92400E;">Okul Derecesi</div>
          </div>
          <div style="flex:1;background:#DCFCE7;border:1px solid #86EFAC;border-radius:8px;padding:6px;text-align:center;">
            <div style="font-size:14px;font-weight:800;color:#15803D;">${stu.sinifSirasi ? `#${stu.sinifSirasi} / ${stu.sinifKatilimci}` : '-'}</div>
            <div style="font-size:9.5px;color:#166534;">Sınıf (${escapeHtml(stu.sinif)}) Derecesi</div>
          </div>
        </div>

        {/* 1. Ders Bazlı Performans Tablosu */}
        <div style="font-size:11px;font-weight:800;color:#1E3A8A;margin-bottom:4px;">📚 DERS BAZLI PERFORMANS TABLOSU</div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px;">
          <thead>
            <tr style="background:#F1F5F9;">
              <th style="border:1px solid #CBD5E1;padding:4px 6px;text-align:left;">Ders Adı</th>
              <th style="border:1px solid #CBD5E1;padding:4px;">Soru</th>
              <th style="border:1px solid #CBD5E1;padding:4px;color:#15803D;">Doğru</th>
              <th style="border:1px solid #CBD5E1;padding:4px;color:#DC2626;">Yanlış</th>
              <th style="border:1px solid #CBD5E1;padding:4px;">Boş</th>
              <th style="border:1px solid #CBD5E1;padding:4px;color:#1D4ED8;">Öğrenci Net</th>
              <th style="border:1px solid #CBD5E1;padding:4px;">Sınıf Ort.</th>
              <th style="border:1px solid #CBD5E1;padding:4px;">Okul Ort.</th>
              <th style="border:1px solid #CBD5E1;padding:4px;">Başarı %</th>
            </tr>
          </thead>
          <tbody>
            ${lessonsRowsHtml}
            ${totalRowHtml}
          </tbody>
        </table>

        ${grupOzetleriHtml}

        {/* Son Sınavların Karşılaştırmalı Sonuçları */}
        ${recentExamsHtml}

        {/* Soru ve Cevap Anahtarı Şeridi */}
        <div style="font-size:11px;font-weight:800;color:#1E3A8A;margin-bottom:4px;margin-top:6px;">🔍 SORU VE CEVAP ANAHTARI ŞERİDİ (Üst: Soru No · Orta: Öğrenci Cevabı · Alt: Doğru Cevap)</div>
        ${opticalStripsHtml}

        {/* Sayfa 2: Konu ve Kazanım Analizi (varsa) */}
        ${page2Html}
      </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(examName)} - Öğrenci Karneleri (${reportsList.length})</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0F172A; margin: 0; padding: 0; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="no-print" style="background:#1E3A8A;color:#FFF;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-radius:6px;">
    <span>📑 <b>${escapeHtml(examName)}</b> — Toplam <b>${reportsList.length} Öğrenci Karnesi</b> hazırlandı. Her öğrenci ayrı sayfaya basılır.</span>
    <button onclick="window.print()" style="background:#FFF;color:#1E3A8A;border:none;padding:6px 14px;border-radius:6px;font-weight:800;cursor:pointer;">🖨️ Tüm Karneleri Yazdır / PDF Kaydet</button>
  </div>
  ${pagesHtml}
</body>
</html>`;

  openPrintHtmlWindow(html, `${examName} - Karneler (${reportsList.length})`);
};

