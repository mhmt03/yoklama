import { PDFDocument } from 'pdf-lib';

/**
 * Base64 stringini temizler (data URI başlığı ve boşlukları atar).
 */
function cleanBase64(raw: string): string {
  if (!raw) return '';
  const commaIdx = raw.indexOf(',');
  const str = commaIdx !== -1 && commaIdx < 100 ? raw.slice(commaIdx + 1) : raw;
  return str.replace(/\s+/g, '');
}

/**
 * Base64 stringini Uint8Array byte dizisine dönüştürür.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const clean = cleanBase64(base64);

  // 1. Buffer (Node.js & React Native / Hermes ortamında en hızlı ve güvenli)
  const globalBuffer = (globalThis as any)?.Buffer;
  if (globalBuffer) {
    try {
      const buf = globalBuffer.from(clean, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    } catch {}
  }

  // 2. atob (Web / Tarayıcı ortamı)
  if (typeof atob === 'function') {
    try {
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {}
  }

  // 3. Pure JS Base64 dönüştürücü (Fallback)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const sanitized = clean.replace(/[^A-Za-z0-9+/=]/g, '');
  const outBytes: number[] = [];
  let i = 0;
  while (i < sanitized.length) {
    const b1 = chars.indexOf(sanitized.charAt(i++));
    const b2 = chars.indexOf(sanitized.charAt(i++));
    const b3 = chars.indexOf(sanitized.charAt(i++));
    const b4 = chars.indexOf(sanitized.charAt(i++));
    const a = (b1 << 2) | (b2 >> 4);
    const b = ((b2 & 15) << 4) | (b3 >> 2);
    const c = ((b3 & 3) << 6) | b4;
    outBytes.push(a);
    if (b3 !== 64) outBytes.push(b);
    if (b4 !== 64) outBytes.push(c);
  }
  return new Uint8Array(outBytes);
}

/**
 * Uint8Array byte dizisini Base64 stringine dönüştürür (Hermes & Browser uyumlu).
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';

  // 1. Buffer (Node.js & React Native / Hermes ortamında en hızlı ve güvenli)
  const globalBuffer = (globalThis as any)?.Buffer;
  if (globalBuffer) {
    try {
      return globalBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    } catch {}
  }

  // 2. btoa chunked (Web / Tarayıcı ortamı)
  if (typeof btoa === 'function') {
    try {
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as any);
      }
      return btoa(binary);
    } catch {}
  }

  // 3. Pure JS Base64 encoder (Fallback)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : NaN;
    const b3 = i < len ? bytes[i++] : NaN;
    const a = b1 >> 2;
    const b = ((b1 & 3) << 4) | (b2 >> 4);
    const c = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (b3 >> 6);
    const d = isNaN(b3) ? 64 : b3 & 63;
    output += chars.charAt(a) + chars.charAt(b) + chars.charAt(c) + chars.charAt(d);
  }
  return output;
}

/**
 * PDF metin içeriğinden (binary/latin1) sayfa sayısını regex ile güvenle ayıklar.
 * PDF ağacındaki tüm /Count ve /Type /Page düğümlerini tarayıp kök (en yüksek) sayıyı bulur.
 */
function extractPdfPageCountFromText(text: string): number {
  if (!text) return 0;
  const counts: number[] = [];

  // 1. /Type /Pages ... /Count N (PDF hiyerarşisindeki tüm Pages düğümleri)
  const regex1 = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/g;
  let m1: RegExpExecArray | null;
  while ((m1 = regex1.exec(text)) !== null) {
    const val = parseInt(m1[1], 10);
    if (val > 0 && val < 50000) counts.push(val);
  }

  // 2. /Count N ... /Type /Pages
  const regex2 = /\/Count\s+(\d+)[\s\S]*?\/Type\s*\/Pages/g;
  let m2: RegExpExecArray | null;
  while ((m2 = regex2.exec(text)) !== null) {
    const val = parseInt(m2[1], 10);
    if (val > 0 && val < 50000) counts.push(val);
  }

  // 3. Sözlük içi genel /Count N nesneleri
  const regex3 = /<<[^>]*\/Count\s+(\d+)[^>]*>>/g;
  let m3: RegExpExecArray | null;
  while ((m3 = regex3.exec(text)) !== null) {
    const val = parseInt(m3[1], 10);
    if (val > 0 && val < 50000) counts.push(val);
  }

  // 4. Standalone /Type /Page nesne sayısı
  const pageMatches = text.match(/\/Type\s*\/Page\b/g);
  if (pageMatches && pageMatches.length > 0) {
    counts.push(pageMatches.length);
  }

  if (counts.length === 0) return 0;
  return Math.max(...counts);
}

/**
 * Base64 stringini Latin1 metnine dönüştürür (Hermes/React Native ile %100 uyumlu).
 */
function safeBase64ToLatin1(cleanB64: string): string {
  if (typeof atob === 'function') {
    try {
      return atob(cleanB64);
    } catch {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const chunks: string[] = [];
  let i = 0;
  const sanitized = cleanB64.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < sanitized.length) {
    const b1 = chars.indexOf(sanitized.charAt(i++));
    const b2 = chars.indexOf(sanitized.charAt(i++));
    const b3 = chars.indexOf(sanitized.charAt(i++));
    const b4 = chars.indexOf(sanitized.charAt(i++));
    const a = (b1 << 2) | (b2 >> 4);
    const b = ((b2 & 15) << 4) | (b3 >> 2);
    const c = ((b3 & 3) << 6) | b4;
    chunks.push(String.fromCharCode(a));
    if (b3 !== 64) chunks.push(String.fromCharCode(b));
    if (b4 !== 64) chunks.push(String.fromCharCode(c));
  }
  return chunks.join('');
}

/**
 * PDF belgesinin toplam sayfa sayısını döndürür.
 * 1. Öncelikle pdf-lib ile nesne ağacını çözümler (tam sayfa sayısı).
 * 2. Fallback olarak çoklu regex taramasındaki maksimum sayfa sayısını alır.
 */
export async function countPdfPages(base64Pdf: string): Promise<number> {
  const clean = cleanBase64(base64Pdf);
  if (!clean) return 0;

  // 1. pdf-lib ile kesin sayfa sayımı dene (Kids ve object stream ağacını tam çözer)
  try {
    const bytes = base64ToUint8Array(clean);
    if (bytes && bytes.length > 0) {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const count = doc.getPageCount();
      if (count > 0) {
        console.log(`[PDF Sayfa Sayacı] pdf-lib ile kesin sayfa sayısı tespit edildi: ${count}`);
        return count;
      }
    }
  } catch (libErr) {
    console.warn('[PDF Sayfa Sayacı] pdf-lib okuma uyarısı, regex analizi deneniyor:', libErr);
  }

  // 2. Fallback: Saf JS ile ikili regex araması (Tüm hiyerarşideki en yüksek /Count değerini alır)
  try {
    const latin1 = safeBase64ToLatin1(clean);
    const count = extractPdfPageCountFromText(latin1);
    if (count > 0) {
      console.log(`[PDF Sayfa Sayacı] Regex taramasıyla tespit edilen sayfa sayısı: ${count}`);
      return count;
    }
  } catch (fastErr) {
    console.warn('[PDF Sayfa Sayacı] Hızlı sayfa sayımı uyarısı:', fastErr);
  }

  return 0;
}

/**
 * PDF belgesinden belirtilen sayfa aralığını (1-indexed, kapsayıcı) kesip yeni bir Base64 PDF oluşturur.
 */
export async function slicePdfPages(
  base64Pdf: string,
  startPage: number,
  endPage: number
): Promise<{ slicedBase64: string; totalOriginalPages: number; pageCount: number }> {
  const bytes = base64ToUint8Array(base64Pdf);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalOriginalPages = srcDoc.getPageCount();

  const clampedStart = Math.max(1, Math.min(startPage, totalOriginalPages));
  const clampedEnd = Math.max(clampedStart, Math.min(endPage, totalOriginalPages));

  // Eğer tüm sayfalar seçildiyse fazladan işlem yapmadan orijinali dön
  if (clampedStart === 1 && clampedEnd === totalOriginalPages) {
    return {
      slicedBase64: base64Pdf,
      totalOriginalPages,
      pageCount: totalOriginalPages,
    };
  }

  const newDoc = await PDFDocument.create();
  const pageIndices: number[] = [];
  for (let p = clampedStart - 1; p < clampedEnd; p++) {
    pageIndices.push(p);
  }

  const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  const newBytes = await newDoc.save();
  const slicedBase64 = uint8ArrayToBase64(newBytes);

  return {
    slicedBase64,
    totalOriginalPages,
    pageCount: pageIndices.length,
  };
}
