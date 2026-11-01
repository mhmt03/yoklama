import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { unzipSync, strFromU8 } from 'fflate';
import { Student } from '../types';
import { PdfExtractedStudentPhoto, PdfPhotoExtractResult } from './pdfPhotoExtractor';

const LOG = '[Word/DOCX Fotoğraf Çıkarıcı]';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.byteLength)) as any);
  }
  return btoa(bin);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readDocxBytes(assetOrUri: DocumentPicker.DocumentPickerAsset | string): Promise<Uint8Array> {
  const uri = typeof assetOrUri === 'string' ? assetOrUri : assetOrUri.uri;

  if (uri.startsWith('data:')) {
    const clean = uri.includes(',') ? uri.split(',')[1] : uri;
    return base64ToUint8Array(clean);
  }

  if (Platform.OS !== 'web') {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (b64 && b64.length > 0) return base64ToUint8Array(b64);
    } catch {
      try {
        const tempPath = `${FileSystem.cacheDirectory}docx_temp_${Date.now()}.docx`;
        await FileSystem.copyAsync({ from: uri, to: tempPath });
        const b64 = await FileSystem.readAsStringAsync(tempPath, { encoding: 'base64' });
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
        if (b64 && b64.length > 0) return base64ToUint8Array(b64);
      } catch {}
    }
  }

  const res = await fetch(uri);
  if (typeof res.arrayBuffer === 'function') {
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  }
  const blob = await res.blob();
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUrl = reader.result as string;
        const b64 = dataUrl.split(',')[1];
        resolve(base64ToUint8Array(b64));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const IGNORE_WORDS = new Set([
  'T.C.', 'TC', 'MİLLİ', 'MILLI', 'EĞİTİM', 'EGITIM', 'BAKANLIĞI', 'BAKANLIGI',
  'ÖĞRENCİ', 'OGRENCI', 'FOTOĞRAF', 'FOTOGRAF', 'LİSTESİ', 'LISTESI', 'SINIF',
  'ŞUBE', 'SUBE', 'SAYFA', 'SIRA', 'NO', 'NUMARASI', 'OKUL', 'DERS', 'TARİH', 'TARIH',
  'DÖNEM', 'DONEM', 'YIL', 'EĞİTİM-ÖĞRETİM', 'ÖĞRETİM', 'İMZA', 'IMZA'
]);

interface ExtractedDocxItem {
  mediaPath: string;
  imageBytes: Uint8Array;
  cellText: string;
}

export async function extractPhotosFromDocx(
  students: Student[],
  assetOrUri: DocumentPicker.DocumentPickerAsset | string
): Promise<PdfPhotoExtractResult> {
  try {
    const buf = await readDocxBytes(assetOrUri);
    if (!buf || buf.length === 0) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'Word (.docx) belgesi okunamadı veya boş.' };
    }

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(buf);
    } catch (zipErr: any) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'Seçilen dosya geçerli bir Word (.docx) belgesi değil: ' + (zipErr?.message || '') };
    }

    // 1. Relationships dosyasından rId -> media eşleştirmesini oku
    const relsKey = Object.keys(unzipped).find(k => k.toLowerCase() === 'word/_rels/document.xml.rels');
    const relMap = new Map<string, string>(); // rId -> media/image1.jpeg
    if (relsKey && unzipped[relsKey]) {
      const relsXml = strFromU8(unzipped[relsKey]);
      const relRe = /<Relationship\b([^>]*)\/>/gi;
      let rm: RegExpExecArray | null;
      while ((rm = relRe.exec(relsXml)) !== null) {
        const attrs = rm[1];
        const idM = /Id=["']([^"']+)["']/i.exec(attrs);
        const targetM = /Target=["']([^"']+)["']/i.exec(attrs);
        const typeM = /Type=["']([^"']+)["']/i.exec(attrs);
        if (idM && targetM) {
          if (!typeM || typeM[1].toLowerCase().includes('image')) {
            let tgt = targetM[1].replace(/\\/g, '/');
            if (tgt.startsWith('/')) tgt = tgt.substring(1);
            if (!tgt.startsWith('word/')) tgt = 'word/' + tgt;
            relMap.set(idM[1], tgt);
          }
        }
      }
    }

    // 2. document.xml dosyasını oku
    const docKey = Object.keys(unzipped).find(k => k.toLowerCase() === 'word/document.xml');
    if (!docKey || !unzipped[docKey]) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'Word belgesi içerisinde document.xml bulunamadı.' };
    }

    const docXml = strFromU8(unzipped[docKey]);

    const getImgRIdFromXml = (xmlChunk: string): string | null => {
      const blipM = /<a:blip\b[^>]*\br:embed=["']([^"']+)["']/i.exec(xmlChunk);
      if (blipM) return blipM[1];
      const vImgM = /<v:imagedata\b[^>]*\br:id=["']([^"']+)["']/i.exec(xmlChunk);
      if (vImgM) return vImgM[1];
      const anyRIdM = /\br:(?:embed|id)=["'](rId\d+)["']/i.exec(xmlChunk);
      if (anyRIdM) return anyRIdM[1];
      return null;
    };

    const getTextFromXml = (xmlChunk: string): string => {
      const texts: string[] = [];
      const tRe = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(xmlChunk)) !== null) {
        if (tm[1]) texts.push(tm[1]);
      }
      return texts.join(' ').replace(/\s+/g, ' ').trim();
    };

    const items: ExtractedDocxItem[] = [];

    // 3. Tablo Yapısı Analizi (<w:tbl>)
    const tblRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/gi;
    let tblM: RegExpExecArray | null;
    let tablesFound = 0;

    while ((tblM = tblRe.exec(docXml)) !== null) {
      tablesFound++;
      const tblXml = tblM[0];
      const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/gi;
      let rowM: RegExpExecArray | null;
      const rows: string[] = [];
      while ((rowM = rowRe.exec(tblXml)) !== null) {
        rows.push(rowM[0]);
      }

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const rowXml = rows[rIdx];
        const cellRe = /<w:tc\b[\s\S]*?<\/w:tc>/gi;
        let cellM: RegExpExecArray | null;
        const cells: string[] = [];
        while ((cellM = cellRe.exec(rowXml)) !== null) {
          cells.push(cellM[0]);
        }

        // Bu satırdaki hücreleri incele
        for (let cIdx = 0; cIdx < cells.length; cIdx++) {
          const cXml = cells[cIdx];
          const rId = getImgRIdFromXml(cXml);
          if (rId) {
            const targetPath = relMap.get(rId);
            const imgBytes = targetPath ? unzipped[targetPath] : undefined;
            if (imgBytes && imgBytes.length > 500) {
              let cellText = getTextFromXml(cXml);

              // Eğer hücrede metin yoksa veya sadece başlık varsa, bir sonraki satırın aynı sütunundaki hücreye bak (Foxit şablonu)
              if (!cellText || !/\d/.test(cellText)) {
                if (rIdx + 1 < rows.length) {
                  const nextRowXml = rows[rIdx + 1];
                  const nextCellRe = /<w:tc\b[\s\S]*?<\/w:tc>/gi;
                  let ncm: RegExpExecArray | null;
                  const nextCells: string[] = [];
                  while ((ncm = nextCellRe.exec(nextRowXml)) !== null) {
                    nextCells.push(ncm[0]);
                  }
                  if (cIdx < nextCells.length) {
                    const belowText = getTextFromXml(nextCells[cIdx]);
                    if (belowText) cellText = belowText;
                  }
                }
              }

              items.push({ mediaPath: targetPath || rId, imageBytes: imgBytes, cellText });
            }
          }
        }
      }
    }

    // 4. Eğer Tablo Yapısı Bulunamadıysa veya az resim çıktıysa: Paragraf bazlı tarama (<w:p>)
    if (items.length === 0) {
      const pRe = /<w:p\b[\s\S]*?<\/w:p>/gi;
      let pM: RegExpExecArray | null;
      const paragraphs: string[] = [];
      while ((pM = pRe.exec(docXml)) !== null) {
        paragraphs.push(pM[0]);
      }

      for (let i = 0; i < paragraphs.length; i++) {
        const pXml = paragraphs[i];
        const rId = getImgRIdFromXml(pXml);
        if (rId) {
          const targetPath = relMap.get(rId);
          const imgBytes = targetPath ? unzipped[targetPath] : undefined;
          if (imgBytes && imgBytes.length > 500) {
            let pText = getTextFromXml(pXml);
            if (!pText && i + 1 < paragraphs.length) {
              pText = getTextFromXml(paragraphs[i + 1]);
            }
            if (!pText && i + 2 < paragraphs.length) {
              pText = getTextFromXml(paragraphs[i + 2]);
            }
            items.push({ mediaPath: targetPath || rId, imageBytes: imgBytes, cellText: pText });
          }
        }
      }
    }

    if (items.length === 0) {
      return {
        success: false,
        totalImages: 0,
        extractedPhotos: [],
        error: 'Word (.docx) belgesi içerisinde öğrenci fotoğrafı bulunamadı. Lütfen belgede fotoğrafların yer aldığından emin olun.',
      };
    }

    // 5. Öğrenci Eşleştirme Motoru
    const isWeb = Platform.OS === 'web';
    const cacheDir = isWeb ? '' : `${FileSystem.cacheDirectory}docx_photos/`;
    if (!isWeb && cacheDir) {
      try {
        if (!(await FileSystem.getInfoAsync(cacheDir)).exists) {
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        }
      } catch {}
    }

    const getStdNum = (s: any): string => String(s?.studentNumber || s?.student_number || s?.number || '').trim();
    const getStdFullName = (s: any): string =>
      String(s?.fullName || s?.full_name || `${s?.first_name || ''} ${s?.last_name || ''}`.trim() || '').trim();

    const normalizedNumMap = new Map<string, Student>();
    for (const s of students) {
      const raw = getStdNum(s);
      if (raw) {
        const clean = raw.replace(/^0+/, '');
        normalizedNumMap.set(raw, s);
        if (clean) normalizedNumMap.set(clean, s);
      }
    }

    const extractedPhotos: PdfExtractedStudentPhoto[] = [];
    const usedStudentIds = new Set<string>();

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      let tempPath = '';
      const b64 = uint8ArrayToBase64(item.imageBytes);
      const isPng = item.mediaPath.toLowerCase().endsWith('.png');
      const mime = isPng ? 'image/png' : 'image/jpeg';

      if (isWeb) {
        tempPath = `data:${mime};base64,${b64}`;
      } else {
        const ext = isPng ? 'png' : 'jpg';
        tempPath = `${cacheDir}docx_${Date.now()}_${idx}.${ext}`;
        await FileSystem.writeAsStringAsync(tempPath, b64, { encoding: 'base64' });
      }

      // Metinden numara ve isim ayıkla
      const text = item.cellText || '';
      const numbers = text.match(/\b\d{1,6}\b/g) || [];
      let detectedNum = '';
      let matched: Student | null = null;

      // 1. Numara Eşleştirme (BİRİNCİ VE EN KESİN KRİTER)
      for (const num of numbers) {
        const clean = num.replace(/^0+/, '');
        const found = normalizedNumMap.get(num) || (clean ? normalizedNumMap.get(clean) : undefined);
        if (found) {
          detectedNum = num;
          if (!usedStudentIds.has(String(found.id))) {
            matched = found;
            usedStudentIds.add(String(found.id));
            break;
          }
        }
      }

      if (!detectedNum && numbers.length > 0) {
        detectedNum = numbers[0] || "";
      }

      // İsim ayıklama
      const words = text
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length >= 2 && !/^\d+$/.test(w) && !IGNORE_WORDS.has(w.toUpperCase()) && !IGNORE_WORDS.has(w.toLocaleUpperCase('tr-TR')));

      const detectedName = words.join(' ');

      // 2. İsim ile Eşleştirme (Eğer numara eşleşmediyse)
      if (!matched && detectedName.length >= 4) {
        const norm = (s: string) =>
          s
            .replace(/Ý/g, 'İ').replace(/Ð/g, 'Ğ').replace(/Þ/g, 'Ş')
            .replace(/ý/g, 'ı').replace(/ð/g, 'ğ').replace(/þ/g, 'ş')
            .toLocaleLowerCase('tr-TR')
            .replace(/[^a-zçğıöşü0-9]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const targetNorm = norm(detectedName);
        const cand = students.find(s => {
          const sNameNorm = norm(getStdFullName(s));
          return sNameNorm === targetNorm && !usedStudentIds.has(String(s.id));
        });
        if (cand) {
          matched = cand;
          usedStudentIds.add(String(cand.id));
        }
      }

      extractedPhotos.push({
        id: `docx_${idx}_${Date.now()}`,
        index: idx,
        tempUri: tempPath,
        fileSize: item.imageBytes.length,
        matchedStudent: matched,
        detectedNumber: detectedNum || (matched ? getStdNum(matched) : undefined),
        detectedName: detectedName || (matched ? getStdFullName(matched) : undefined),
        pageNumber: Math.floor(idx / 21) + 1,
      });
    }

    return {
      success: true,
      totalImages: items.length,
      extractedPhotos,
    };
  } catch (err: any) {
    return {
      success: false,
      totalImages: 0,
      extractedPhotos: [],
      error: 'Word belgesinden fotoğraf ayıklanırken beklenmeyen hata oluştu: ' + (err?.message || String(err)),
    };
  }
}
