import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { unzlibSync, inflateSync } from 'fflate';
import { Student } from '../types';

export interface PdfExtractedStudentPhoto {
  id: string;
  index: number;
  tempUri: string;
  fileSize: number;
  matchedStudent: Student | null;
  detectedNumber?: string;
  detectedName?: string;
  pageNumber?: number;
}

export interface PdfPhotoExtractResult {
  success: boolean;
  totalImages: number;
  extractedPhotos: PdfExtractedStudentPhoto[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.byteLength)) as any);
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Read PDF bytes with Android Scoped Storage fallbacks & detailed logging
// ---------------------------------------------------------------------------

async function readPdfBytes(assetOrUri: DocumentPicker.DocumentPickerAsset | string): Promise<Uint8Array> {
  const uri = typeof assetOrUri === 'string' ? assetOrUri : assetOrUri.uri;
  console.log('[PDF Fotoğraf] PDF Baytları okunuyor:', uri);

  // 1. Data URI kontrolü (Web ve önceden kodlanmış içerikler için)
  if (uri.startsWith('data:')) {
    const clean = uri.includes(',') ? uri.split(',')[1] : uri;
    return base64ToUint8Array(clean);
  }

  // 2. Native ortamlarda (Android & iOS) doğrudan FileSystem ile oku
  if (Platform.OS !== 'web') {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (b64 && b64.length > 0) {
        console.log(`[PDF Fotoğraf] FileSystem ile ${b64.length} karakter base64 okundu.`);
        return base64ToUint8Array(b64);
      }
    } catch (e) {
      console.warn('[PDF Fotoğraf] readAsStringAsync doğrudan okunamadı, copyAsync deneniyor:', e);
      try {
        const tempPath = `${FileSystem.cacheDirectory}pdf_safe_${Date.now()}.pdf`;
        await FileSystem.copyAsync({ from: uri, to: tempPath });
        const b64 = await FileSystem.readAsStringAsync(tempPath, { encoding: 'base64' });
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
        if (b64 && b64.length > 0) {
          console.log(`[PDF Fotoğraf] FileSystem (safe copy) ile ${b64.length} karakter base64 okundu.`);
          return base64ToUint8Array(b64);
        }
      } catch (copyErr) {
        console.warn('[PDF Fotoğraf] copyAsync fallback başarısız:', copyErr);
      }
    }
  }

  // 3. Web / Fallback: Fetch -> ArrayBuffer veya Blob
  try {
    const res = await fetch(uri);
    if (typeof res.arrayBuffer === 'function') {
      try {
        const ab = await res.arrayBuffer();
        if (ab && ab.byteLength > 0) {
          console.log(`[PDF Fotoğraf] Fetch ArrayBuffer ile ${ab.byteLength} bayt okundu.`);
          return new Uint8Array(ab);
        }
      } catch {}
    }
    const blob = await res.blob();
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          if (reader.result instanceof ArrayBuffer) {
            console.log(`[PDF Fotoğraf] FileReader ArrayBuffer ile ${reader.result.byteLength} bayt okundu.`);
            return resolve(new Uint8Array(reader.result));
          }
          const str = reader.result as string;
          const clean = str.includes(',') ? str.split(',')[1] : str;
          console.log(`[PDF Fotoğraf] FileReader dataURL ile ${clean.length} karakter base64 okundu.`);
          resolve(base64ToUint8Array(clean));
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      typeof reader.readAsArrayBuffer === 'function' && Platform.OS === 'web'
        ? reader.readAsArrayBuffer(blob)
        : reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('[PDF Fotoğraf] Dosya okuma hatası:', e);
    throw new Error('PDF dosyası okunamadı.');
  }
}

// ---------------------------------------------------------------------------
// Inflate (FlateDecode / zlib)
// Use fflate (fast C-speed pure JS), DecompressionStream or pure-JS fallback
// ---------------------------------------------------------------------------

async function inflateAsync(compressed: Uint8Array): Promise<Uint8Array> {
  // 1. fflate unzlibSync (zlib-wrapped streams, standard PDF FlateDecode)
  try {
    return unzlibSync(compressed);
  } catch {}

  // 2. fflate inflateSync (raw deflate streams without zlib headers)
  try {
    return inflateSync(compressed);
  } catch {}

  // 3. Strip zlib 2-byte header if present and retry
  if (compressed.length > 6 && (compressed[0] & 0x0f) === 8) {
    try {
      return inflateSync(compressed.subarray(2, compressed.length - 4));
    } catch {}
  }

  // 4. Try browser DecompressionStream if available
  try {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate' as any);
      const writer = ds.writable.getWriter();
      const copy = new Uint8Array(new ArrayBuffer(compressed.byteLength));
      copy.set(compressed);
      writer.write(copy);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      return out;
    }
  } catch {}

  // 5. Pure-JS fallback
  return inflatePureJS(compressed);
}

function inflatePureJS(data: Uint8Array): Uint8Array {
  // strip zlib header
  let buf = data;
  if (data.length > 6 && (data[0] & 0x0f) === 8) {
    buf = data.subarray(2, data.length - 4);
  }
  return deflateRawDecode(buf);
}

function deflateRawDecode(data: Uint8Array): Uint8Array {
  let pos = 0;
  const out: number[] = [];

  function readBits(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val |= ((data[(pos / 8) | 0] >> (pos % 8)) & 1) << i;
      pos++;
    }
    return val;
  }

  function readByte(): number {
    if (pos % 8 !== 0) pos += 8 - (pos % 8);
    const v = data[pos >> 3];
    pos += 8;
    return v;
  }

  type HuffDecode = () => number;

  function buildHuffman(lengths: number[]): HuffDecode {
    const maxLen = Math.max(...lengths, 0);
    const blCount = new Uint32Array(maxLen + 1);
    for (const l of lengths) if (l > 0) blCount[l]++;
    let code = 0;
    const nextCode = new Uint32Array(maxLen + 1);
    for (let bits = 1; bits <= maxLen; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const symCode = new Uint32Array(lengths.length);
    const symsPerLen: number[][] = Array.from({ length: maxLen + 1 }, () => []);
    for (let n = 0; n < lengths.length; n++) {
      const l = lengths[n];
      if (l !== 0) {
        symCode[n] = nextCode[l];
        nextCode[l]++;
        symsPerLen[l].push(n);
      }
    }
    const codeOfSym: number[] = new Array(lengths.length);
    for (let n = 0; n < lengths.length; n++) codeOfSym[n] = symCode[n];

    return function decode(): number {
      let val = 0;
      for (let b = 1; b <= maxLen; b++) {
        val = (val << 1) | readBits(1);
        for (const sym of symsPerLen[b]) {
          if (codeOfSym[sym] === val) return sym;
        }
      }
      return -1;
    };
  }

  const fixedLitLens: number[] = [];
  for (let i = 0; i <= 287; i++) {
    if (i <= 143) fixedLitLens.push(8);
    else if (i <= 255) fixedLitLens.push(9);
    else if (i <= 279) fixedLitLens.push(7);
    else fixedLitLens.push(8);
  }
  const fixedDistLens = new Array(32).fill(5);

  const lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const lenBase  = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const distExtra= [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const distBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];

  function decodeBlock(litDec: HuffDecode, distDec: HuffDecode) {
    while (true) {
      const sym = litDec();
      if (sym < 256) { out.push(sym); }
      else if (sym === 256) { break; }
      else {
        const li = sym - 257;
        const length = lenBase[li] + readBits(lenExtra[li]);
        const di = distDec();
        const dist = distBase[di] + readBits(distExtra[di]);
        const sp = out.length - dist;
        for (let k = 0; k < length; k++) out.push(out[sp + k]);
      }
    }
  }

  let bfinal = 0;
  while (!bfinal) {
    bfinal = readBits(1);
    const btype = readBits(2);
    if (btype === 0) {
      if (pos % 8 !== 0) pos += 8 - (pos % 8);
      const len = readByte() | (readByte() << 8);
      readByte(); readByte();
      for (let i = 0; i < len; i++) out.push(readByte());
    } else if (btype === 1) {
      decodeBlock(buildHuffman(fixedLitLens), buildHuffman(fixedDistLens));
    } else {
      const hlit = readBits(5) + 257;
      const hdist = readBits(5) + 1;
      const hclen = readBits(4) + 4;
      const clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const clLens = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) clLens[clOrder[i]] = readBits(3);
      const clDec = buildHuffman(clLens);
      const all: number[] = [];
      while (all.length < hlit + hdist) {
        const sym = clDec();
        if (sym < 16) { all.push(sym); }
        else if (sym === 16) { const rep = readBits(2) + 3; for (let r = 0; r < rep; r++) all.push(all[all.length - 1]); }
        else if (sym === 17) { const rep = readBits(3) + 3; for (let r = 0; r < rep; r++) all.push(0); }
        else { const rep = readBits(7) + 11; for (let r = 0; r < rep; r++) all.push(0); }
      }
      decodeBlock(buildHuffman(all.slice(0, hlit)), buildHuffman(all.slice(hlit)));
    }
  }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// PNG builder
// ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(12 + len);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, len, false);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  dv.setUint32(8 + len, crc32(chunk.subarray(4, 8 + len)), false);
  return chunk;
}

/** Minimal zlib wrap using stored (uncompressed) blocks — always valid */
function zlibStore(raw: Uint8Array): Uint8Array {
  const BS = 65535;
  const blocks = Math.ceil(raw.length / BS) || 1;
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let pos = 2, remaining = raw.length, inOff = 0;
  for (let b = 0; b < blocks; b++) {
    const len = Math.min(remaining, BS);
    out[pos++] = b === blocks - 1 ? 1 : 0;
    out[pos++] = len & 0xff; out[pos++] = (len >> 8) & 0xff;
    out[pos++] = (~len) & 0xff; out[pos++] = ((~len) >> 8) & 0xff;
    out.set(raw.subarray(inOff, inOff + len), pos);
    pos += len; inOff += len; remaining -= len;
  }
  let s1 = 1, s2 = 0;
  for (const b of raw) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  const adler = (s2 << 16) | s1;
  out[pos++] = (adler >> 24) & 0xff; out[pos++] = (adler >> 16) & 0xff;
  out[pos++] = (adler >> 8) & 0xff;  out[pos++] = adler & 0xff;
  return out.subarray(0, pos);
}

const PNG_SIG = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

function buildIndexedPng(pixels: Uint8Array, palette: Uint8Array, w: number, h: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false); dv.setUint32(4, h, false);
  ihdr[8] = 8; ihdr[9] = 3; // 8-bit indexed
  const scanlines = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    scanlines[y * (w + 1)] = 0; // filter=None
    scanlines.set(pixels.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  }
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('PLTE', palette), pngChunk('IDAT', zlibStore(scanlines)), pngChunk('IEND', new Uint8Array(0))];
  const total = PNG_SIG.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  out.set(PNG_SIG);
  let off = PNG_SIG.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function buildRgbPng(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false); dv.setUint32(4, h, false);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const scanlines = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    scanlines[y * (w * 3 + 1)] = 0;
    scanlines.set(pixels.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(scanlines)), pngChunk('IEND', new Uint8Array(0))];
  const total = PNG_SIG.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  out.set(PNG_SIG);
  let off = PNG_SIG.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ---------------------------------------------------------------------------
// PDF object parser
// ---------------------------------------------------------------------------

interface PdfImageObj {
  objNum: number;
  width: number;
  height: number;
  filter: 'DCTDecode' | 'FlateDecode' | '';
  csType: 'Indexed' | 'DeviceRGB' | 'DeviceGray' | '';
  paletteObjNum?: number;
  streamStart: number;
  streamEnd: number;
}

function parsePdfImageObjs(text: string, buf: Uint8Array): PdfImageObj[] {
  const results: PdfImageObj[] = [];
  const objRe = /(\d+)\s+0\s+obj([\s\S]*?)\bstream[\r\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const objNum = parseInt(m[1], 10);
    const hdr = m[2];
    if (!hdr.includes('/Image') || (!hdr.includes('/Subtype') && !hdr.includes('/Type'))) continue;

    const wm = /\/Width\s+(\d+)/.exec(hdr);
    const hm = /\/Height\s+(\d+)/.exec(hdr);
    if (!wm || !hm) continue;
    const width = parseInt(wm[1], 10);
    const height = parseInt(hm[1], 10);
    if (width < 30 || height < 30) continue; // skip tiny icons/bullets

    let filter: 'DCTDecode' | 'FlateDecode' | '' = '';
    if (/DCTDecode/.test(hdr)) filter = 'DCTDecode';
    else if (/FlateDecode/.test(hdr)) filter = 'FlateDecode';

    let csType: 'Indexed' | 'DeviceRGB' | 'DeviceGray' | '' = '';
    let paletteObjNum: number | undefined;
    const csRef = /\/ColorSpace\s+(\d+)\s+0\s+R/.exec(hdr);
    if (csRef) {
      const csNum = parseInt(csRef[1], 10);
      const csObjRe = new RegExp(csNum + '\\s+0\\s+obj[\\s\\S]*?\\/Indexed');
      const csM = csObjRe.exec(text);
      if (csM) {
        csType = 'Indexed';
        const palM = /\/Indexed\s+\/\w+\s+\d+\s+(\d+)\s+0\s+R/.exec(text.substring(csM.index, csM.index + 200));
        if (palM) paletteObjNum = parseInt(palM[1], 10);
      }
    } else if (/\/ColorSpace\s*\/DeviceRGB/.test(hdr)) {
      csType = 'DeviceRGB';
    } else if (/\/ColorSpace\s*\/DeviceGray/.test(hdr)) {
      csType = 'DeviceGray';
    }

    const ss = m.index + m[0].length;
    let esIdx = -1;
    const lenM = /\/Length\s+(\d+)/.exec(hdr);
    if (lenM) {
      const explicitLen = parseInt(lenM[1], 10);
      if (explicitLen > 0 && ss + explicitLen <= text.length) {
        esIdx = ss + explicitLen;
      }
    }
    if (esIdx === -1) {
      esIdx = text.indexOf('endstream', ss);
    }
    if (esIdx === -1) continue;

    results.push({ objNum, width, height, filter, csType, paletteObjNum, streamStart: ss, streamEnd: esIdx });

    // Binary akışın üzerinden atla (Regex bir sonraki nesneyi bayt akışının içinde aramasın!)
    objRe.lastIndex = Math.max(objRe.lastIndex, esIdx + 9);
  }
  return results;
}

function findObjStart(objNum: number, text: string): number {
  const target = `${objNum} 0 obj`;
  let idx = text.indexOf(target);
  while (idx !== -1) {
    if (idx === 0 || /\s/.test(text[idx - 1])) {
      return idx;
    }
    idx = text.indexOf(target, idx + 1);
  }
  return -1;
}

function getObjRawStream(objNum: number, text: string, buf: Uint8Array): Uint8Array | null {
  const objStart = findObjStart(objNum, text);
  if (objStart === -1) return null;
  const streamIdx = text.indexOf('stream', objStart);
  if (streamIdx === -1) return null;
  let ss = streamIdx + 6;
  if (text[ss] === '\r') ss++;
  if (text[ss] === '\n') ss++;
  const es = text.indexOf('endstream', ss);
  if (es === -1) return null;
  return buf.subarray(ss, es);
}

// ---------------------------------------------------------------------------
// Student name/number extraction from page content streams
// ---------------------------------------------------------------------------

interface StudentInfo { imgName: string; number: string; name: string; }

function getPdfObjContent(objNum: number, text: string): string | null {
  const objStart = findObjStart(objNum, text);
  if (objStart === -1) return null;
  const endIdx = text.indexOf('endobj', objStart);
  if (endIdx === -1) return null;
  return text.substring(objStart, endIdx);
}

function getPageXObjectMap(pageObjNum: number, pageDictText: string, text: string): Record<string, number> {
  const map: Record<string, number> = {};
  const visitedObjs = new Set<number>();

  const scanDictForXObjects = (dictStr: string) => {
    if (!dictStr) return;

    // 1. Direct /XObject << ... >> or /XObject 12 0 R
    const xobjIdx = dictStr.indexOf('/XObject');
    if (xobjIdx !== -1) {
      const sub = dictStr.substring(xobjIdx);
      const refM = /^\/XObject\s+(\d+)\s+0\s+R/.exec(sub);
      if (refM) {
        const refObj = parseInt(refM[1], 10);
        if (!visitedObjs.has(refObj)) {
          visitedObjs.add(refObj);
          const refContent = getPdfObjContent(refObj, text);
          if (refContent) scanDictForXObjects(refContent);
        }
      } else {
        const openIdx = dictStr.indexOf('<<', xobjIdx);
        if (openIdx !== -1 && openIdx - xobjIdx < 30) {
          let depth = 0;
          let endIdx = -1;
          for (let i = openIdx; i < dictStr.length - 1; i++) {
            if (dictStr[i] === '<' && dictStr[i + 1] === '<') {
              depth++;
              i++;
            } else if (dictStr[i] === '>' && dictStr[i + 1] === '>') {
              depth--;
              i++;
              if (depth === 0) {
                endIdx = i + 1;
                break;
              }
            }
          }
          if (endIdx !== -1) {
            const inner = dictStr.substring(openIdx, endIdx);
            const itemRe = /\/([a-zA-Z0-9_\-]+)\s+(\d+)\s+0\s+R/g;
            let im: RegExpExecArray | null;
            while ((im = itemRe.exec(inner)) !== null) {
              map[im[1]] = parseInt(im[2], 10);
            }
          }
        }
      }
    }

    // 2. /Resources indirect reference or inline
    const resIdx = dictStr.indexOf('/Resources');
    if (resIdx !== -1) {
      const resSub = dictStr.substring(resIdx);
      const resRef = /^\/Resources\s+(\d+)\s+0\s+R/.exec(resSub);
      if (resRef) {
        const rNum = parseInt(resRef[1], 10);
        if (!visitedObjs.has(rNum)) {
          visitedObjs.add(rNum);
          const rContent = getPdfObjContent(rNum, text);
          if (rContent) scanDictForXObjects(rContent);
        }
      }
    }
  };

  scanDictForXObjects(pageDictText);

  // Inherited from parent Pages object
  if (Object.keys(map).length === 0 && pageObjNum > 0) {
    const parentRef = /\/Parent\s+(\d+)\s+0\s+R/.exec(pageDictText);
    if (parentRef) {
      const parentObj = getPdfObjContent(parseInt(parentRef[1], 10), text);
      if (parentObj) scanDictForXObjects(parentObj);
    }
  }

  return map;
}

/**
 * Windows-1254 (Turkish) / ISO-8859-9 bayt çözücü.
 * e-Okul ve MEB PDF'lerinde Türkçe karakterler Windows-1254 kod sayfasında saklanır:
 * 0xDD -> İ, 0xFD -> ı, 0xD0 -> Ğ, 0xF0 -> ğ, 0xDE -> Ş, 0xFE -> ş,
 * 0xC7 -> Ç, 0xE7 -> ç, 0xD6 -> Ö, 0xF6 -> ö, 0xDC -> Ü, 0xFC -> ü
 */
function decodeWindows1254Byte(byte: number): string {
  switch (byte) {
    case 0xdd: return 'İ'; // Latin capital letter I with dot above
    case 0xfd: return 'ı'; // Latin small letter dotless i
    case 0xd0: return 'Ğ'; // Latin capital letter G with breve
    case 0xf0: return 'ğ'; // Latin small letter g with breve
    case 0xde: return 'Ş'; // Latin capital letter S with cedilla
    case 0xfe: return 'ş'; // Latin small letter s with cedilla
    case 0xc7: return 'Ç'; // Latin capital letter C with cedilla
    case 0xe7: return 'ç'; // Latin small letter c with cedilla
    case 0xd6: return 'Ö'; // Latin capital letter O with diaeresis
    case 0xf6: return 'ö'; // Latin small letter o with diaeresis
    case 0xdc: return 'Ü'; // Latin capital letter U with diaeresis
    case 0xfc: return 'ü'; // Latin small letter u with diaeresis
    default:
      if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
      if (byte >= 160 && byte <= 255) return String.fromCharCode(byte);
      return '';
  }
}

/**
 * Windows-1254 / Latin-1 Mojibake karakterlerini düzeltir:
 * Ý -> İ, Ð -> Ğ, Þ -> Ş, ý -> ı, ð -> ğ, þ -> ş
 */
function fixTurkishMojibake(str: string): string {
  if (!str) return '';
  return str
    .replace(/\u00DD|Ý/g, 'İ')
    .replace(/\u00FD|ý/g, 'ı')
    .replace(/\u00D0|Ð/g, 'Ğ')
    .replace(/\u00F0|ð/g, 'ğ')
    .replace(/\u00DE|Þ/g, 'Ş')
    .replace(/\u00FE|þ/g, 'ş');
}

/**
 * PDF literal string içeriğindeki kaçış dizilerini (özellikle sekizlik \ddd octal escapes ve \n, \r, \( vb.)
 * bayt dizisine dönüştürür.
 * e-Okul PDF'lerinde Türkçe karakterler örneğin \335 (İ), \320 (Ğ), \336 (Ş) gibi sekizlik kaçışlarla gelir.
 * Bunlar çözülmezse sayı regex'i bu sekizlikleri öğrenci numarası zanneder ve ismi bozar.
 */
function parsePdfLiteralStringToBytes(raw: string): number[] {
  const bytes: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw.charCodeAt(i);
    if (c === 92) { // '\\'
      i++;
      if (i >= raw.length) break;
      const nextChar = raw[i];
      // 1 ila 3 haneli sekizlik (octal) kaçış dizisi: \ddd
      if (nextChar >= '0' && nextChar <= '7') {
        let octStr = nextChar;
        i++;
        if (i < raw.length && raw[i] >= '0' && raw[i] <= '7') {
          octStr += raw[i];
          i++;
          if (i < raw.length && raw[i] >= '0' && raw[i] <= '7') {
            octStr += raw[i];
            i++;
          }
        }
        bytes.push(parseInt(octStr, 8));
        continue;
      }
      switch (nextChar) {
        case 'n': bytes.push(10); break;
        case 'r': bytes.push(13); break;
        case 't': bytes.push(9); break;
        case 'b': bytes.push(8); break;
        case 'f': bytes.push(12); break;
        case '(': bytes.push(40); break;
        case ')': bytes.push(41); break;
        case '\\': bytes.push(92); break;
        case '\r':
          if (i + 1 < raw.length && raw[i + 1] === '\n') i++;
          // Satır sonu kaçışı PDF standardında atlanır
          break;
        case '\n':
          // Satır sonu kaçışı PDF standardında atlanır
          break;
        default:
          bytes.push(raw.charCodeAt(i));
          break;
      }
      i++;
    } else {
      bytes.push(c & 0xff);
      i++;
    }
  }
  return bytes;
}

/**
 * PDF literal dizesini (parantez içi (...)) çözümler.
 * UTF-16BE (\xFE\xFF) veya Windows-1254 / ISO-8859-9 desteğiyle Türkçe karakterleri doğru üretir.
 */
function parsePdfLiteralString(raw: string): string {
  if (!raw) return '';
  const bytes = parsePdfLiteralStringToBytes(raw);
  if (bytes.length === 0) return '';

  // 1. UTF-16BE BOM kontrolü (\xFE\xFF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let j = 2; j + 1 < bytes.length; j += 2) {
      const code = (bytes[j] << 8) | bytes[j + 1];
      if (code > 0) s += String.fromCharCode(code);
    }
    return fixTurkishMojibake(s.trim());
  }

  // 2. Windows-1254 / ISO-8859-9 (e-Okul / MEB standart)
  let s = '';
  for (const b of bytes) {
    const ch = decodeWindows1254Byte(b);
    if (ch) s += ch;
  }
  return fixTurkishMojibake(s.trim());
}

/**
 * PDF Onaltılık (Hexadecimal <...>) dizesini çözümler.
 */
function decodeHexPdfString(hex: string): string {
  if (!hex || hex.length < 2) return '';
  if (hex.length % 2 !== 0) hex += '0';
  let result = '';

  // UTF-16BE (00xx, FEFF veya Türkçe UTF-16BE 01xx ile başlayan)
  let isUtf16 = hex.length >= 4 && hex.length % 4 === 0 && (
    hex.toLowerCase().startsWith('feff') ||
    hex.startsWith('00') ||
    hex.startsWith('01')
  );

  // Genel kontrol: 4'ün katıysa ve karakterlerin çoğu 00..01 aralığındaysa kesinlikle UTF-16BE'dir
  if (!isUtf16 && hex.length >= 4 && hex.length % 4 === 0) {
    let highByteCount = 0;
    const numChars = hex.length / 4;
    for (let c = 0; c < hex.length; c += 4) {
      const hb = parseInt(hex.substring(c, c + 2), 16);
      if (hb === 0x00 || hb === 0x01) highByteCount++;
    }
    if (highByteCount >= Math.ceil(numChars * 0.75)) {
      isUtf16 = true;
    }
  }

  if (isUtf16) {
    for (let i = 0; i < hex.length; i += 4) {
      const code = parseInt(hex.substring(i, i + 4), 16);
      if (code > 0 && code !== 0xfeff) {
        result += String.fromCharCode(code);
      }
    }
    return fixTurkishMojibake(result.trim());
  }

  // Windows-1254 8-bit tek baytlık karakterler
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    const ch = decodeWindows1254Byte(code);
    if (ch) result += ch;
  }
  return fixTurkishMojibake(result.trim());
}

function extractStringsFromContext(ctx: string): string[] {
  const list: string[] = [];

  // 1. Array TJ operator: [ (1) 20 (2) ] TJ or [ <0031> 10 <0032> ] TJ (e-Okul kerning)
  const tjRe = /\[([\s\S]*?)\]\s*TJ/gi;
  let tjM: RegExpExecArray | null;
  while ((tjM = tjRe.exec(ctx)) !== null) {
    const arrContent = tjM[1];
    let assembled = '';
    const tokenRe = /\(((\\.|[^)])*)\)|<([0-9a-fA-F]+)>|(-?\d+(?:\.\d+)?)/g;
    let tokM: RegExpExecArray | null;
    while ((tokM = tokenRe.exec(arrContent)) !== null) {
      if (tokM[1] !== undefined) {
        assembled += parsePdfLiteralString(tokM[1]);
      } else if (tokM[3] !== undefined) {
        assembled += decodeHexPdfString(tokM[3]);
      } else if (tokM[4] !== undefined) {
        // Kerning number: if spacing is significant negative (e.g. <= -150), insert space between words
        const kerning = parseFloat(tokM[4]);
        if (kerning <= -150 && assembled.length > 0 && !assembled.endsWith(' ')) {
          assembled += ' ';
        }
      }
    }
    const clean = fixTurkishMojibake(assembled.trim());
    if (clean && !list.includes(clean)) list.push(clean);
  }

  // 2. Direct string operator: (text) Tj or (text) '
  const singleTjRe = /\(((\\.|[^)])*)\)\s*(?:Tj|['"])/gi;
  let stM: RegExpExecArray | null;
  while ((stM = singleTjRe.exec(ctx)) !== null) {
    const s = fixTurkishMojibake(parsePdfLiteralString(stM[1]).trim());
    if (s && !list.includes(s)) list.push(s);
  }

  // 3. Hex string operator: <00310032> Tj or <hex> '
  const hexTjRe = /<([0-9a-fA-F]+)>\s*(?:Tj|['"])/gi;
  let htM: RegExpExecArray | null;
  while ((htM = hexTjRe.exec(ctx)) !== null) {
    const s = fixTurkishMojibake(decodeHexPdfString(htM[1]).trim());
    if (s && !list.includes(s)) list.push(s);
  }

  // 4. Fallback: if no Tj/TJ operators found, match direct literal strings
  if (list.length === 0) {
    const directRe = /\(((\\.|[^)])*)\)/g;
    let dm: RegExpExecArray | null;
    while ((dm = directRe.exec(ctx)) !== null) {
      const s = fixTurkishMojibake(parsePdfLiteralString(dm[1]).trim());
      if (s && !list.includes(s)) list.push(s);
    }
  }

  return list;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const extractPhotosFromPdf = async (
  students: Student[],
  assetOrUri?: DocumentPicker.DocumentPickerAsset | string
): Promise<PdfPhotoExtractResult> => {
  console.log('\n══════════════════ [PDF Fotoğraf Çıkarıcı] BAŞLADI ══════════════════');
  console.log('[PDF Fotoğraf] Eşleştirilecek Öğrenci Sayısı:', students.length);

  try {
    let targetAsset: DocumentPicker.DocumentPickerAsset | string | undefined = assetOrUri;

    if (!targetAsset) {
      console.log('[PDF Fotoğraf] Belge seçici açılıyor...');
      const pick = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
      if (pick.canceled || !pick.assets?.length) {
        console.log('[PDF Fotoğraf] Kullanıcı belge seçimini iptal etti.');
        return { success: false, totalImages: 0, extractedPhotos: [], error: 'Dosya seçilmedi.' };
      }
      targetAsset = pick.assets[0];
    }

    const buf = await readPdfBytes(targetAsset);
    if (!buf?.length) {
      console.error('[PDF Fotoğraf] PDF dosyası okunamadı veya boş (0 bayt).');
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'PDF dosyası okunamadı.' };
    }

    console.log(`[PDF Fotoğraf] PDF baytları hafızaya alındı (${(buf.length / 1024).toFixed(1)} KB). Resim nesneleri taranıyor...`);

    // Latin-1 string for text scanning (binary-safe & chunked to avoid browser memory spikes)
    let text = '';
    const chunkSz = 32768;
    for (let ci = 0; ci < buf.length; ci += chunkSz) {
      text += String.fromCharCode.apply(null, buf.subarray(ci, Math.min(ci + chunkSz, buf.length)) as any);
    }

    // 1. Parse image objects (all pages, binary order)
    const allImgs = parsePdfImageObjs(text, buf);
    // Vesikalık fotoğraflar: Hem dikey standart hem de kare (webcam 1:1) formatı kabul et
    // MEB e-Okul'a yüklenen fotoğrafların çoğu 1:1 kare veya 3:4/4:5 dikey formatındadır.
    let photoObjs = allImgs.filter(img =>
      img.height >= 35 && img.width >= 30 &&
      (img.height / img.width >= 0.70 && img.height / img.width <= 2.6)
    );
    if (photoObjs.length === 0) {
      photoObjs = allImgs.filter(img =>
        img.height >= 30 && img.width >= 25 &&
        (img.height / img.width >= 0.65 && img.height / img.width <= 2.8)
      );
    }

    console.log(`[PDF Fotoğraf] Toplam Resim Objesi: ${allImgs.length} adet | Vesikalık Kriterine Uyan: ${photoObjs.length} adet`);

    if (!photoObjs.length) {
      console.warn('[PDF Fotoğraf] PDF içinde vesikalık boyutuna uygun fotoğraf nesnesi bulunamadı.');
      return {
        success: false,
        totalImages: allImgs.length,
        extractedPhotos: [],
        error: 'PDF dosyasında öğrenci fotoğrafı bulunamadı. Okul tarafından sağlanan orijinal fotoğraf listesi PDF\'ini seçin.',
      };
    }

    // ── Ensure cache dir (Yalnızca Native) ──────────────────────────────────
    const isWeb = Platform.OS === 'web';
    const cacheDir = isWeb ? '' : `${FileSystem.cacheDirectory}pdf_photos/`;
    if (!isWeb && cacheDir) {
      try {
        if (!(await FileSystem.getInfoAsync(cacheDir)).exists) {
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        }
      } catch (dirErr) {
        console.warn('[PDF Fotoğraf] Cache dir oluşturulamadı:', dirErr);
      }
    }

    // Öğrenci numaralarını ve başındaki sıfırlar atılmış hallerini hazırla (Öncelikli 1. Kriter)
    const getStudentNum = (s: any): string => {
      const n = s.student_number || s.studentNumber || s.number || '';
      return String(n).trim();
    };

    const getStudentFullName = (s: any): string => {
      if (s.full_name) return String(s.full_name).trim();
      if (s.fullName) return String(s.fullName).trim();
      const fn = `${s.first_name || ''} ${s.last_name || ''}`.trim();
      return fn;
    };

    const getStudentId = (s: any): string => {
      return String(s.id);
    };

    const numSet = new Set<string>();
    const normalizedNumMap = new Map<string, Student>();
    for (const s of students) {
      const raw = getStudentNum(s);
      if (raw) {
        numSet.add(raw);
        const clean = raw.replace(/^0+/, '');
        if (clean) normalizedNumMap.set(clean, s);
        normalizedNumMap.set(raw, s);
      }
    }

    // ── Per-page algorithm ──────────────────────────────────────────────────
    interface PagePair {
      photo: PdfImageObj;
      info: StudentInfo;
      pageNumber: number;
    }
    const orderedPairs: PagePair[] = [];
    const usedObjNums = new Set<number>();
    let positionalCursor = 0;

    const pageRe = /\/Type\s*\/Page\b/g;
    let pm: RegExpExecArray | null;
    let pageNumber = 0;

    while ((pm = pageRe.exec(text)) !== null) {
      pageNumber++;

      // ── 1. Decode this page's content stream(s) ──
      const textBefore = text.substring(Math.max(0, pm.index - 800), pm.index);
      const objNumM = /(\d+)\s+0\s+obj[\s\S]*?$/i.exec(textBefore);
      const pageObjNum = objNumM ? parseInt(objNumM[1], 10) : 0;

      const endObjIdx = text.indexOf('endobj', pm.index);
      const pageObjText = endObjIdx !== -1
        ? text.substring(Math.max(0, pm.index - (objNumM ? objNumM[0].length : 300)), endObjIdx + 6)
        : text.substring(Math.max(0, pm.index - 300), pm.index + 8000);

      let pageContent = '';
      const arrayM = /\/Contents\s+\[([\s\S]*?)\]/.exec(pageObjText);
      if (arrayM) {
        const refs: number[] = [];
        const rRe = /(\d+)\s+0\s+R/g;
        let rm: RegExpExecArray | null;
        while ((rm = rRe.exec(arrayM[1])) !== null) {
          refs.push(parseInt(rm[1], 10));
        }
        const chunks: Uint8Array[] = [];
        for (const ref of refs) {
          const s = getObjRawStream(ref, text, buf);
          if (s) {
            try {
              chunks.push(await inflateAsync(s));
            } catch {
              chunks.push(s);
            }
          }
        }
        if (chunks.length > 0) {
          const tot = chunks.reduce((acc, c) => acc + c.length, 0);
          const comb = new Uint8Array(tot);
          let offset = 0;
          for (const c of chunks) { comb.set(c, offset); offset += c.length; }
          pageContent = Array.from(comb).map(b => String.fromCharCode(b)).join('');
        }
      } else {
        const contentsM = /\/Contents\s+(\d+)\s+0\s+R/.exec(pageObjText);
        if (contentsM) {
          const raw = getObjRawStream(parseInt(contentsM[1], 10), text, buf);
          if (raw) {
            try {
              const decoded = await inflateAsync(raw);
              pageContent = Array.from(decoded).map(b => String.fromCharCode(b)).join('');
            } catch {
              pageContent = Array.from(raw).map(b => String.fromCharCode(b)).join('');
            }
          }
        }
      }

      if (!pageContent) continue;

      // ── 2. Build per-page XObject map ──
      const pageXobjMap = getPageXObjectMap(pageObjNum, pageObjText, text);
      const hasAliasMap = Object.keys(pageXobjMap).length > 0;

      // ── 3. Find image placements on this page with spatial (x, y) coordinates ──
      const doRe = /\/([a-zA-Z0-9_\-]+)\s+Do/g;
      let dm: RegExpExecArray | null;
      interface PagePlacement {
        alias: string;
        index: number;
        objNum: number;
        photo?: PdfImageObj;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }
      const pagePlacements: PagePlacement[] = [];
      while ((dm = doRe.exec(pageContent)) !== null) {
        const alias = dm[1];
        const objNum = pageXobjMap[alias] || 0;
        let photo: PdfImageObj | undefined;
        if (objNum > 0) {
          photo = photoObjs.find(p => p.objNum === objNum);
        }

        // Do komutunun hemen önündeki koordinat matrisini (cm) yakala
        let x: number | undefined;
        let y: number | undefined;
        let width: number | undefined;
        let height: number | undefined;

        const beforeDo = pageContent.substring(Math.max(0, dm.index - 350), dm.index);
        const cmRe = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm/g;
        let cmM: RegExpExecArray | null;
        let lastCmM: RegExpExecArray | null = null;
        while ((cmM = cmRe.exec(beforeDo)) !== null) {
          lastCmM = cmM;
        }
        if (lastCmM) {
          width = Math.abs(parseFloat(lastCmM[1]));
          height = Math.abs(parseFloat(lastCmM[4]));
          x = parseFloat(lastCmM[5]);
          y = parseFloat(lastCmM[6]);
        }

        pagePlacements.push({ alias, index: dm.index, objNum, photo, x, y, width, height });
      }

      // Filter to student photos
      let photoPlacements: PagePlacement[] = [];
      if (hasAliasMap) {
        photoPlacements = pagePlacements.filter(p => p.photo !== undefined);
      }
      if (photoPlacements.length === 0) {
        const imgDoRe = /\/(img\d+|Im\d+|I\d+|Fm\d+|X\d+)\s+Do/gi;
        let idm: RegExpExecArray | null;
        while ((idm = imgDoRe.exec(pageContent)) !== null) {
          let x: number | undefined;
          let y: number | undefined;
          let width: number | undefined;
          let height: number | undefined;
          const beforeDo = pageContent.substring(Math.max(0, idm.index - 350), idm.index);
          const cmRe = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm/g;
          let cmM: RegExpExecArray | null;
          let lastCmM: RegExpExecArray | null = null;
          while ((cmM = cmRe.exec(beforeDo)) !== null) {
            lastCmM = cmM;
          }
          if (lastCmM) {
            width = Math.abs(parseFloat(lastCmM[1]));
            height = Math.abs(parseFloat(lastCmM[4]));
            x = parseFloat(lastCmM[5]);
            y = parseFloat(lastCmM[6]);
          }
          photoPlacements.push({ alias: idm[1], index: idm.index, objNum: 0, x, y, width, height });
        }
      }

      // ── KRİTİK: Fotoğrafları sayfa üzerindeki gerçek görsel konumuna göre sırala ──
      // Üst satırdan alt satıra (y azalan), aynı satırda soldan sağa (x artan).
      // Bu sayede 1. sıradaki fotoğraf daima en üst-soldaki öğrenci (Örn: Orhan Yücel) olur!
      if (photoPlacements.some(p => p.y !== undefined && p.x !== undefined)) {
        photoPlacements.sort((a, b) => {
          if (a.y !== undefined && b.y !== undefined) {
            if (Math.abs(a.y - b.y) <= 35) {
              return (a.x || 0) - (b.x || 0); // Soldan sağa
            }
            return b.y - a.y; // Yukarıdan aşağıya
          }
          return a.index - b.index;
        });
      }

      console.log(`[PDF Fotoğraf] Sayfa ${pageNumber}: ${photoPlacements.length} resim yerleşimi bulundu.`);

      if (photoPlacements.length === 0) continue;

      // ── 3.b. Sayfadaki metinleri koordinatlarıyla topla ──
      interface PageTextItem { text: string; x: number; y: number; }
      const pageTextItems: PageTextItem[] = [];
      const btEtRe = /BT([\s\S]*?)ET/g;
      let bmM: RegExpExecArray | null;
      while ((bmM = btEtRe.exec(pageContent)) !== null) {
        const block = bmM[1];
        let curX = 0;
        let curY = 0;
        const tmM = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm/.exec(block);
        if (tmM) {
          curX = parseFloat(tmM[5]);
          curY = parseFloat(tmM[6]);
        } else {
          const tdM = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+T[dD]/.exec(block);
          if (tdM) {
            curX = parseFloat(tdM[1]);
            curY = parseFloat(tdM[2]);
          }
        }

        const blockStrs = extractStringsFromContext(block);
        for (const s of blockStrs) {
          const clean = s.trim();
          if (clean.length > 0) {
            pageTextItems.push({ text: clean, x: curX, y: curY });
          }
        }
      }

      // ── 4. Associate text with photo placements ──
      const IGNORE_WORDS = new Set([
        'T.C.', 'TC', 'MİLLİ', 'MILLI', 'EĞİTİM', 'EGITIM', 'BAKANLIĞI', 'BAKANLIGI',
        'ÖĞRENCİ', 'OGRENCI', 'FOTOĞRAF', 'FOTOGRAF', 'LİSTESİ', 'LISTESI', 'SINIF',
        'ŞUBE', 'SUBE', 'SAYFA', 'SIRA', 'NO', 'NUMARASI', 'OKUL', 'DERS', 'TARİH', 'TARIH',
        'DÖNEM', 'DONEM', 'YIL', 'EĞİTİM-ÖĞRETİM', 'ÖĞRETİM', 'İMZA', 'IMZA'
      ]);

      const usedNumbersOnPage = new Set<string>();

      for (let k = 0; k < photoPlacements.length; k++) {
        const cur = photoPlacements[k];
        const prevIdx = k > 0 ? photoPlacements[k - 1].index : 0;
        const nextIdx = k + 1 < photoPlacements.length ? photoPlacements[k + 1].index : pageContent.length;

        let candidateNumbers: string[] = [];
        let candidateNames: string[] = [];
        let matchingKnown: string[] = [];

        // YÖNTEM A: Koordinat Tabanlı Eşleştirme (Fotoğrafın hemen altındaki metinler)
        if (cur.x !== undefined && cur.y !== undefined && pageTextItems.length > 0) {
          const photoW = cur.width || 80;
          const photoH = cur.height || 100;
          const textsForPhoto = pageTextItems.filter(item => {
            const xDiff = Math.abs(item.x - cur.x!);
            if (xDiff > photoW + 50) return false;
            const yDiff = cur.y! - item.y;
            return yDiff >= -25 && yDiff <= photoH + 90;
          });

          for (const item of textsForPhoto) {
            const tokens = item.text.match(/\b\d{1,6}\b/g);
            if (tokens) {
              for (const t of tokens) {
                if (!candidateNumbers.includes(t)) candidateNumbers.push(t);
              }
            }
            if (
              item.text.length >= 2 &&
              /[A-Za-zÇĞİÖŞÜçğışöşü]/.test(item.text) &&
              !/^\d+$/.test(item.text) &&
              !IGNORE_WORDS.has(item.text.toUpperCase()) &&
              !IGNORE_WORDS.has(item.text.toLocaleUpperCase('tr-TR'))
            ) {
              candidateNames.push(item.text);
            }
          }

          matchingKnown = candidateNumbers.filter(
            n => (numSet.has(n) || normalizedNumMap.has(n.replace(/^0+/, ''))) &&
                 !usedNumbersOnPage.has(n) &&
                 !usedNumbersOnPage.has(n.replace(/^0+/, ''))
          );
        }

        // YÖNTEM B: Fallback (Akış / Context bazlı)
        if (matchingKnown.length === 0 && candidateNumbers.length === 0) {
          const ctxAfter = pageContent.substring(cur.index, Math.min(nextIdx, cur.index + 2000));
          const ctxBefore = pageContent.substring(Math.max(prevIdx, cur.index - 2000), cur.index);

          const parseContextCandidates = (ctxText: string) => {
            const rawStrs = extractStringsFromContext(ctxText);
            const cleanStrs = rawStrs.filter(s => {
              const clean = s.trim();
              if (!clean) return false;
              if (/SINIF|ŞUBE|SUBE|SAYFA|TARİH|TARIH|DÖNEM|DONEM|BAKANLIĞI|BAKANLIGI|MÜDÜRLÜĞÜ|MUDURLUGU|İLÇE|ILCE|MİLLİ|MILLI|LİSTESİ|LISTESI/i.test(clean)) return false;
              return true;
            });

            const numbers: string[] = [];
            for (const s of cleanStrs) {
              const tokens = s.match(/\b\d{1,6}\b/g);
              if (tokens) {
                for (const t of tokens) {
                  if (!numbers.includes(t)) numbers.push(t);
                }
              }
            }

            const names = cleanStrs.filter(
              s => s.length >= 2 &&
                   /[A-Za-zÇĞİÖŞÜçğışöşü]/.test(s) &&
                   !/^\d+$/.test(s) &&
                   !IGNORE_WORDS.has(s.toUpperCase()) &&
                   !IGNORE_WORDS.has(s.toLocaleUpperCase('tr-TR'))
            );

            const mKnown = numbers.filter(
              n => (numSet.has(n) || normalizedNumMap.has(n.replace(/^0+/, ''))) &&
                   !usedNumbersOnPage.has(n) &&
                   !usedNumbersOnPage.has(n.replace(/^0+/, ''))
            );

            return { numbers, names, matchedKnownNumbers: mKnown };
          };

          const afterAnalysis = parseContextCandidates(ctxAfter);
          const beforeAnalysis = parseContextCandidates(ctxBefore);

          let chosenAnalysis = afterAnalysis;
          if (afterAnalysis.matchedKnownNumbers.length === 0 && beforeAnalysis.matchedKnownNumbers.length > 0) {
            chosenAnalysis = beforeAnalysis;
          } else if (afterAnalysis.numbers.length === 0 && afterAnalysis.names.length === 0 && (beforeAnalysis.numbers.length > 0 || beforeAnalysis.names.length > 0)) {
            chosenAnalysis = beforeAnalysis;
          }

          candidateNumbers = chosenAnalysis.numbers;
          if (candidateNames.length === 0) candidateNames = chosenAnalysis.names;
          matchingKnown = chosenAnalysis.matchedKnownNumbers;
        }

        let detNum = '';
        if (matchingKnown.length > 0) {
          detNum = matchingKnown[0];
        } else if (candidateNumbers.length > 0) {
          const validCandidates = candidateNumbers.filter(n => n.length >= 1 && n.length <= 5 && !usedNumbersOnPage.has(n));
          if (validCandidates.length > 0) {
            detNum = validCandidates[0];
          }
        }

        if (detNum) {
          usedNumbersOnPage.add(detNum);
          usedNumbersOnPage.add(detNum.replace(/^0+/, ''));
        }

        // İsim adaylarını temizle (tek harfli parçalar elenir)
        const cleanNameWords = candidateNames
          .join(' ')
          .split(/\s+/)
          .filter(w => w.length >= 2 && !IGNORE_WORDS.has(w.toUpperCase()))
          .slice(-3);
        const name = cleanNameWords.length >= 1 ? cleanNameWords.join(' ').trim() : '';
        const info: StudentInfo = { imgName: cur.alias, number: detNum, name };

        // ── 5. Resolve image object for this photo ──
        let photo: PdfImageObj | undefined = cur.photo;
        if (photo && !usedObjNums.has(photo.objNum)) {
          orderedPairs.push({ photo, info, pageNumber });
          usedObjNums.add(photo.objNum);
        } else {
          while (positionalCursor < photoObjs.length && usedObjNums.has(photoObjs[positionalCursor].objNum)) {
            positionalCursor++;
          }
          if (positionalCursor < photoObjs.length) {
            const posPhoto = photoObjs[positionalCursor];
            orderedPairs.push({ photo: posPhoto, info, pageNumber });
            usedObjNums.add(posPhoto.objNum);
            positionalCursor++;
          }
        }
      }
    }

    // ── 6. Sayfa akışlarına düşmemiş veya metin dışı kalmış fotoğrafları ekle (EKSİK FOTOĞRAF BIRAKMAZ) ──
    for (let pi = 0; pi < photoObjs.length; pi++) {
      const remainingPhoto = photoObjs[pi];
      if (!usedObjNums.has(remainingPhoto.objNum)) {
        orderedPairs.push({
          photo: remainingPhoto,
          info: { imgName: `img_${remainingPhoto.objNum}`, number: '', name: '' },
          pageNumber: 0
        });
        usedObjNums.add(remainingPhoto.objNum);
      }
    }

    console.log(`[PDF Fotoğraf] Sayfalardan toplam ${orderedPairs.length} adet resim-metin eşleşme adayı çıkarıldı.`);

    // ── Convert matched image objects to files and resolve students ─────────
    const extractedPhotos: PdfExtractedStudentPhoto[] = [];
    const usedStudentIds = new Set<number>();

    for (let i = 0; i < orderedPairs.length; i++) {
      const { photo: img, info, pageNumber } = orderedPairs[i];
      try {
        const rawStream = buf.subarray(img.streamStart, img.streamEnd);
        let tempPath: string | null = null;
        let fileSize = 0;

        if (img.filter === 'DCTDecode') {
          // JPEG SOI (FF D8) ve EOI (FF D9) sınırlarını temizle
          let start = 0;
          while (start < Math.min(rawStream.length - 1, 10)) {
            if (rawStream[start] === 0xff && rawStream[start + 1] === 0xd8) break;
            start++;
          }
          let end = rawStream.length;
          while (end > start + 2) {
            if (rawStream[end - 2] === 0xff && rawStream[end - 1] === 0xd9) break;
            end--;
          }
          const jpegBytes = rawStream.subarray(start, end);

          if (isWeb) {
            tempPath = `data:image/jpeg;base64,${uint8ArrayToBase64(jpegBytes)}`;
          } else {
            tempPath = `${cacheDir}pdf_${Date.now()}_${i}.jpg`;
            await FileSystem.writeAsStringAsync(tempPath, uint8ArrayToBase64(jpegBytes), { encoding: 'base64' });
          }
          fileSize = jpegBytes.length;
        } else if (img.filter === 'FlateDecode') {
          const pixels = await inflateAsync(rawStream);
          let pngBytes: Uint8Array | null = null;

          if (img.csType === 'Indexed' && img.paletteObjNum !== undefined) {
            const palRaw = getObjRawStream(img.paletteObjNum, text, buf);
            if (palRaw) {
              const palette = await inflateAsync(palRaw);
              pngBytes = buildIndexedPng(pixels, palette, img.width, img.height);
            }
          } else if (img.csType === 'DeviceRGB') {
            pngBytes = buildRgbPng(pixels, img.width, img.height);
          } else if (img.csType === 'DeviceGray') {
            const rgb = new Uint8Array(pixels.length * 3);
            for (let j = 0; j < pixels.length; j++) { rgb[j*3]=rgb[j*3+1]=rgb[j*3+2]=pixels[j]; }
            pngBytes = buildRgbPng(rgb, img.width, img.height);
          }

          if (pngBytes) {
            if (isWeb) {
              tempPath = `data:image/png;base64,${uint8ArrayToBase64(pngBytes)}`;
            } else {
              tempPath = `${cacheDir}pdf_${Date.now()}_${i}.png`;
              await FileSystem.writeAsStringAsync(tempPath, uint8ArrayToBase64(pngBytes), { encoding: 'base64' });
            }
            fileSize = pngBytes.length;
          }
        }

        if (!tempPath) continue;

        const detNum = info.number;
        let matched: Student | null = null;

        // ── 1. Numara Eşleştirme (BİRİNCİ VE KESİN KRİTER) ──
        if (detNum && detNum.trim()) {
          const cleanDet = detNum.trim().replace(/^0+/, '');
          if (cleanDet.length > 0) {
            const candidate =
              students.find(s => {
                const sNum = getStudentNum(s).trim();
                const sClean = sNum.replace(/^0+/, '');
                return (sNum.length > 0 && sNum === detNum.trim()) || (sClean.length > 0 && sClean === cleanDet);
              }) || null;

            if (candidate) {
              const cId = getStudentId(candidate);
              if (!usedStudentIds.has(cId as any)) {
                matched = candidate;
              }
            }
          }
        }

        // ── 2. İsim ile Destekleme (Yalnızca numara hiç tespit edilemediyse) ──
        // KATI VE GÜVENLİ EŞLEŞTİRME: Numara yoksa, kısmi kelime eşleşmesi ASLA yapılmaz!
        // Yalnızca öğrencinin tam adı (Ad + Soyad) sistemdeki kayıtla birebir/tam olarak eşleşiyorsa atanır.
        if (!matched && !detNum && info.name && info.name.length >= 4) {
          const normStr = (str: string) =>
            fixTurkishMojibake(str)
              .toLocaleLowerCase('tr-TR')
              .replace(/[^a-zçğıöşü0-9]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

          const normInfoName = normStr(info.name);
          const candidate = students.find(s => {
            const fullName = normStr(getStudentFullName(s));
            if (fullName === normInfoName) return true;
            const pToks = normInfoName.split(' ').filter(t => t.length >= 2);
            const sToks = fullName.split(' ').filter(t => t.length >= 2);
            // Öğrencinin tüm ad ve soyadı (en az 2 kelime) ve PDF'ten okunan tüm kelimeler BİREBİR aynı olmalı!
            if (pToks.length >= 2 && sToks.length === pToks.length) {
              return pToks.every((pt, idx) => pt === sToks[idx]);
            }
            return false;
          });
          if (candidate) {
            const cId = getStudentId(candidate);
            if (!usedStudentIds.has(cId as any)) {
              matched = candidate;
              console.log(`[PDF Fotoğraf] İsimden tam eşleşme sağlandı: "${info.name}" -> ${getStudentFullName(candidate)} (${getStudentNum(candidate)})`);
            }
          }
        }

        if (matched) usedStudentIds.add(getStudentId(matched) as any);

        const matchedDisplay = matched ? getStudentFullName(matched) : '';
        console.log(
          `[PDF Fotoğraf] Foto #${i + 1} (Sayfa ${pageNumber}): No=${detNum || 'YOK'} | İsim="${info.name}" -> ${
            matched ? `✅ EŞLEŞTİ (${matchedDisplay} - No: ${getStudentNum(matched)})` : '⚠️ EŞLEŞMEDİ (Manuel Atama)'
          }`
        );

        extractedPhotos.push({
          id: `pdf-${i}-${Date.now()}`,
          index: i,
          tempUri: tempPath,
          fileSize,
          matchedStudent: matched,
          detectedNumber: detNum,
          detectedName: info.name,
          pageNumber,
        });
      } catch (e) {
        console.warn(`[PDF Fotoğraf] Fotoğraf ${i} dönüştürme hatası:`, e);
      }
    }

    const matchedCount = extractedPhotos.filter(p => p.matchedStudent !== null).length;
    const unmatchedCount = extractedPhotos.length - matchedCount;

    console.log(`\n══════════════════ [PDF Fotoğraf Çıkarıcı] ÖZET ══════════════════`);
    console.log(`[PDF Fotoğraf] Toplam Çıkarılan Fotoğraf: ${extractedPhotos.length}`);
    console.log(`[PDF Fotoğraf] Otomatik Eşleşen: ${matchedCount} adet`);
    console.log(`[PDF Fotoğraf] Eşleşmeyen (Manuel Bekleyen): ${unmatchedCount} adet`);
    console.log(`═══════════════════════════════════════════════════════════════════\n`);

    if (!extractedPhotos.length) {
      return {
        success: false,
        totalImages: orderedPairs.length || photoObjs.length,
        extractedPhotos: [],
        error: `PDF'de fotoğraf algılandı ancak hiçbiri işlenemedi. Farklı bir PDF deneyin.`,
      };
    }

    return { success: true, totalImages: extractedPhotos.length, extractedPhotos };
  } catch (err: any) {
    console.error('[PDF Fotoğraf] Genel Hata:', err);
    return { success: false, totalImages: 0, extractedPhotos: [], error: err?.message || 'PDF işlenirken bir hata oluştu.' };
  }
};