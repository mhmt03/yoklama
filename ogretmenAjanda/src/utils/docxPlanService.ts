import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { unzipSync, strFromU8 } from 'fflate';
import type { ParsedYearlyPlanRow } from './excelService';

/**
 * Base64 string'i güvenli şekilde Uint8Array dizisine dönüştürür.
 * Saf JavaScript algoritması ile React Native Hermes/JSC motorlarında sorunsuz çalışır.
 */
export const base64ToUint8Array = (base64Clean: string): Uint8Array => {
  const base64 = base64Clean.replace(/\s/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let bufferLength = base64.length * 0.75;
  if (base64.endsWith('==')) bufferLength -= 2;
  else if (base64.endsWith('=')) bufferLength -= 1;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const enc1 = lookup[base64.charCodeAt(i)];
    const enc2 = lookup[base64.charCodeAt(i + 1)];
    const enc3 = lookup[base64.charCodeAt(i + 2)];
    const enc4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (enc1 << 2) | (enc2 >> 4);
    if (p < bufferLength) bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (p < bufferLength) bytes[p++] = ((enc3 & 3) << 6) | enc4;
  }
  return bytes;
};

/**
 * XML metin varlıklarını (entities) düzgün karaktere çözer.
 */
export const decodeXmlEntities = (str: string): string => {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
};

/**
 * Word document.xml içeriğinden tablo satır ve hücrelerini 2D array (string[][]) olarak çıkarır.
 */
export const extractRowsFromDocxXml = (xmlText: string): string[][] => {
  const rows: string[][] = [];

  // 1. Tablo satırlarını tespit et (<w:tr ...>...</w:tr>)
  const trMatches = xmlText.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/gi) || [];

  for (const trXml of trMatches) {
    const rowCells: string[] = [];
    const tcMatches = trXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/gi) || [];

    for (const tcXml of tcMatches) {
      const textMatches = tcXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
      const cellText = textMatches
        .map((t) => t.replace(/<[^>]+>/g, ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      rowCells.push(decodeXmlEntities(cellText));
    }

    if (rowCells.some((c) => c.length > 0)) {
      rows.push(rowCells);
    }
  }

  // 2. Eğer tablolar bulunamadıysa paragrafları satır olarak çıkar (<w:p ...>...</w:p>)
  if (rows.length === 0) {
    const pMatches = xmlText.match(/<w:p[\s>][\s\S]*?<\/w:p>/gi) || [];
    for (const pXml of pMatches) {
      const textMatches = pXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
      const pText = textMatches
        .map((t) => t.replace(/<[^>]+>/g, ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (pText.length > 0) {
        rows.push([decodeXmlEntities(pText)]);
      }
    }
  }

  return rows;
};

/**
 * Verilen Word (.docx) dosyasından tabloları okuyup satır ve sütun dizisi olarak döndürür.
 */
export const extractTableRowsFromDocx = async (fileUri: string): Promise<string[][]> => {
  let base64 = '';
  try {
    base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (readErr) {
    // Android scoped storage fallback
    const res = await fetch(fileUri);
    const blob = await res.blob();
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const str = reader.result as string;
        resolve(str.includes(',') ? str.split(',')[1] : str);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const uint8 = base64ToUint8Array(base64);
  const unzipped = unzipSync(uint8);

  const documentXmlBytes = unzipped['word/document.xml'];
  if (!documentXmlBytes) {
    throw new Error('Word (.docx) belgesi içinde tablo/metin içeriği (word/document.xml) bulunamadı.');
  }

  const xmlText = strFromU8(documentXmlBytes);
  return extractRowsFromDocxXml(xmlText);
};

/**
 * Kullanıcıya bir Word (.docx) dosyası seçtirir ve yapay zeka (Gemini AI) ile yıllık plan haftalarına dönüştürür.
 */
export const pickAndAdaptDocxWithAi = async (
  weeklyHours: number = 4
): Promise<ParsedYearlyPlanRow[]> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  const asset = result.assets[0];
  const fileName = (asset.name || '').toLowerCase();

  if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
    throw new Error(
      'Seçilen dosya eski Word (.doc) formatındadır. Tablo analizi için lütfen dosyayı Word programında "Farklı Kaydet" yaparak .docx (Word Belgesi) formatında kaydedip tekrar seçiniz.'
    );
  }

  const rawRows = await extractTableRowsFromDocx(asset.uri);
  if (rawRows.length < 2) {
    throw new Error('Word belgesinde analiz edilecek tablo veya satır verisi bulunamadı.');
  }

  const { adaptYearlyPlanExcelWithGemini } = await import('./geminiScheduleService');
  return await adaptYearlyPlanExcelWithGemini(rawRows, weeklyHours);
};
