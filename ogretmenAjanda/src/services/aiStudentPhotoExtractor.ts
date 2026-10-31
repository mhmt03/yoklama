import { GoogleGenerativeAI } from '@google/generative-ai';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Image, Platform } from 'react-native';
import { Student } from '../types';
import { apiRequest } from './apiClient';
import { readUriAsBase64, detectMimeType, parseJsonLenient } from './aiScheduleParser';
import { extractPhotosFromPdf } from '../utils/pdfPhotoExtractor';
import { getGeminiApiKey, getGeminiModel, DEFAULT_GEMINI_API_KEY, DEFAULT_GEMINI_MODEL } from '../utils/geminiScheduleService';

export interface AiExtractedStudentPhoto {
  studentNumber: string;
  studentName?: string;
  photoBase64: string;
  fileName: string;
  matchedStudent?: Student;
  source: 'pdf-stream' | 'ai-vision-crop' | 'ai-matched';
  tempUri?: string;
  pageNumber?: number;
}

export interface AiPhotoExtractResult {
  success: boolean;
  totalFound: number;
  uploadedCount: number;
  photos: AiExtractedStudentPhoto[];
  error?: string;
}

const LOG = '[AI Foto Analiz]';

/**
 * Resmi verilen bounding box koordinatlarına göre kırpar.
 * box_2d: [ymin, xmin, ymax, xmax] - 0..1000 arası normalize koordinatlar
 */
async function cropImageByBoundingBox(
  imageUri: string,
  box: [number, number, number, number],
  imageWidth: number,
  imageHeight: number
): Promise<{ uri: string; base64: string } | null> {
  try {
    const [ymin, xmin, ymax, xmax] = box;
    const originX = Math.max(0, Math.round((xmin / 1000) * imageWidth));
    const originY = Math.max(0, Math.round((ymin / 1000) * imageHeight));
    const cropWidth = Math.min(imageWidth - originX, Math.round(((xmax - xmin) / 1000) * imageWidth));
    const cropHeight = Math.min(imageHeight - originY, Math.round(((ymax - ymin) / 1000) * imageHeight));

    if (cropWidth < 20 || cropHeight < 20) {
      console.warn(LOG, 'Kırpma alanı çok küçük, atlandı:', { cropWidth, cropHeight });
      return null;
    }

    const manipResult = await manipulateAsync(
      imageUri,
      [
        { crop: { originX, originY, width: cropWidth, height: cropHeight } },
        { resize: { width: 300, height: 360 } },
      ],
      { compress: 0.8, format: SaveFormat.JPEG, base64: true }
    );

    return { uri: manipResult.uri, base64: manipResult.base64 || '' };
  } catch (err) {
    console.warn(LOG, 'Kırpma hatası:', err);
    return null;
  }
}

/**
 * Resim boyutlarını asenkron olarak alır (Web ve Native uyumlu)
 */
function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => {
        console.warn(LOG, 'Image.getSize başarısız, varsayılan 1200x1600 kullanılıyor:', err);
        resolve({ width: 1200, height: 1600 });
      }
    );
  });
}

/**
 * Gemini Vision kullanarak PDF veya Görsel belgedeki öğrenci fotoğraflarını
 * analiz eder, numaralarını tespit eder, vesikalık fotoğrafları ayıklar ve sunucuya yükler.
 */
export async function extractStudentPhotosWithAi(
  fileUri: string,
  fileName: string,
  mimeType: string,
  students: Student[],
  schoolId: string,
  schoolApiKey?: string,
  schoolModel?: string,
  onProgress?: (stageText: string) => void,
  autoSave: boolean = true
): Promise<AiPhotoExtractResult> {
  console.log(`\n══════════════════ ${LOG} BAŞLADI ══════════════════`);
  console.log(LOG, 'Dosya:', fileName, '| MIME:', mimeType, '| Okul ID:', schoolId, '| Sistemdeki Öğrenci Sayısı:', students.length);

  try {
    onProgress?.('Belge hazırlanıyor ve yapay zeka yapılandırılıyor...');
    const resolvedApiKey = (schoolApiKey || (await getGeminiApiKey()) || DEFAULT_GEMINI_API_KEY).trim();
    const resolvedModel = (schoolModel || (await getGeminiModel()) || DEFAULT_GEMINI_MODEL).trim();

    const genAI = new GoogleGenerativeAI(resolvedApiKey);
    const resolvedMime = detectMimeType(fileUri, mimeType);
    const isPdf = resolvedMime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

    const resultPhotos: AiExtractedStudentPhoto[] = [];

    const getStdNum = (s: any): string => String(s?.studentNumber || s?.student_number || s?.number || '').trim();
    const getStdFullName = (s: any): string =>
      String(s?.fullName || s?.full_name || `${s?.first_name || s?.name || ''} ${s?.last_name || ''}`.trim() || '').trim();

    function findStudentByNumberFirst(stdNo: string, stdName: string | undefined, students: Student[]): Student | undefined {
      if (stdNo && stdNo.trim()) {
        const cleanNo = stdNo.trim().replace(/^0+/, '');
        if (cleanNo.length > 0) {
          // 1. BİRİNCİ VE EN KESİN KRİTER: Öğrenci Numarası (Okul No)
          const byNum = students.find((s) => {
            const sNum = getStdNum(s);
            const cleanS = sNum.replace(/^0+/, '');
            return sNum === stdNo.trim() || (cleanS.length > 0 && cleanS === cleanNo);
          });
          if (byNum) return byNum;
        }
      }

      // 2. İKİNCİL DESTEK: Sadece numara hiç bulunamadıysa ve isim en az 2 kelimelik tam ad-soyad ise
      if (stdName && stdName.trim().length >= 4) {
        const norm = (str: string) =>
          str
            .replace(/Ý/g, 'İ')
            .replace(/Ð/g, 'Ğ')
            .replace(/Þ/g, 'Ş')
            .replace(/ý/g, 'ı')
            .replace(/ð/g, 'ğ')
            .replace(/þ/g, 'ş')
            .toLocaleLowerCase('tr-TR')
            .replace(/[^a-zçğıöşü0-9]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const targetNorm = norm(stdName);
        const tToks = targetNorm.split(' ').filter(t => t.length >= 2);

        // KATI GÜVENLİK: İsim eşleştirmesi için en az 2 kelime olmalı (tek harfler "I G L" asla eşleşemez)
        if (tToks.length >= 2) {
          const byName = students.find((s) => {
            const sNameNorm = norm(getStdFullName(s));
            if (sNameNorm === targetNorm) return true;
            const sToks = sNameNorm.split(' ').filter(t => t.length >= 2);
            if (sToks.length === tToks.length) {
              return tToks.every((tt, idx) => tt === sToks[idx]);
            }
            return false;
          });
          if (byName) return byName;
        }
      }

      return undefined;
    }

    // ─── 1. DURUM: PDF BELGESİ ───
    if (isPdf) {
      console.log(LOG, '1. Adım: PDF belgesi taranıyor...');
      onProgress?.('PDF içerisindeki fotoğraf ve metin akışları inceleniyor...');

      // Önce PDF akışından fotoğrafları algıla (kullanıcıya tekrar dosya seçtirmez, mevcut dosya kullanılır)
      let streamPhotos: any[] = [];
      try {
        const streamRes = await extractPhotosFromPdf(students, fileUri);
        if (streamRes.success && streamRes.extractedPhotos?.length) {
          streamPhotos = streamRes.extractedPhotos;
          console.log(LOG, `PDF akışından ${streamPhotos.length} fotoğraf ham olarak çıkarıldı.`);
        }
      } catch (streamErr) {
        console.warn(LOG, 'PDF akış çıkarma atlandı/hata verdi:', streamErr);
      }

      // PDF akışından çıkan TÜM fotoğrafları topla (boş numara olsa dahi atlama, sıra kaymasını engeller)
      for (const sp of streamPhotos) {
        const stdNo = sp.matchedStudent ? getStdNum(sp.matchedStudent) : (sp.detectedNumber || '');
        if (sp.tempUri) {
          try {
            const b64 = await readUriAsBase64(sp.tempUri);
            const matched = sp.matchedStudent || (stdNo ? findStudentByNumberFirst(stdNo, sp.detectedName, students) : undefined);
            resultPhotos.push({
              studentNumber: stdNo,
              studentName: matched ? getStdFullName(matched) : (sp.detectedName || ''),
              photoBase64: `data:image/jpeg;base64,${b64}`,
              fileName: `${stdNo || 'ogrenci_' + (resultPhotos.length + 1)}.jpg`,
              matchedStudent: matched,
              source: 'pdf-stream',
              tempUri: sp.tempUri,
              pageNumber: sp.pageNumber,
            });
          } catch {}
        }
      }

      // Eğer akıştan eşleşme çıkmadıysa veya eksik kaldıysa: Gemini Vision ile PDF analizi yap
      if (resultPhotos.length === 0) {
        console.log(LOG, 'PDF akışında doğrudan numara eşleşmesi bulunamadı. Gemini Vision ile görsel analiz yapılıyor...');
        onProgress?.('Gemini Vision ile PDF sayfası ve vesikalık fotoğraflar taranıyor (Numara Öncelikli)...');

        const base64Pdf = await readUriAsBase64(fileUri);
        console.log(LOG, 'PDF base64 boyutu:', base64Pdf.length);

        const registeredHints = students
          .map((s) => ({ no: getStdNum(s), name: getStdFullName(s) }))
          .filter((s) => s.no.length > 0)
          .slice(0, 100);

        const prompt = `
Sen MEB okulları için öğrenci listesi ve okul albümü çözümleyen uzman bir yapay zeka asistanısın.
Sana verilen PDF belgesinde öğrenci fotoğrafları, isimleri ve okul numaraları yer almaktadır.

🔴 ÇOK ÖNEMLİ EŞLEŞTİRME KURALI:
1. BİRİNCİ VE EN KESİN EŞLEŞTİRME ÖNCELİĞİN ÖĞRENCİ NUMARASIDIR (Okul No).
2. Fotoğrafları analiz ederken mutlaka öğrencinin fotoğrafının altında, üstünde veya çerçevesinde yer alan OKUL NUMARASINI (studentNumber) birincil kriter olarak tespit et.
3. İsimler kısaltılmış, eksik veya farklı yazılmış olsa dahi fotoğraflar için ASIL BELİRLEYİCİ KRİTER OKUL NUMARASIDIR.
4. "studentNumber": Öğrencinin okul numarası (örn: "435", "105", "12").
5. "studentName": Öğrencinin adı soyadı.
6. "pageNumber": Bulunduğu sayfa numarası (1'den başlar).
7. "box_2d": Eğer vesikalık fotoğraf bir görsel alanındaysa tahmini koordinatları [ymin, xmin, ymax, xmax] (0-1000 arası normalize).

Sistemde bu okulda kayıtlı öğrencilerin okul numaraları ve adları (Lütfen öncelikle bu numaralarla eşleştir):
${JSON.stringify(registeredHints)}

Yalnızca aşağıdaki JSON şemasına uyarak saf JSON dizisi döndür:
[
  {
    "studentNumber": "435",
    "studentName": "Zehra Beren Aydeniz",
    "pageNumber": 1,
    "box_2d": [120, 50, 260, 200]
  }
]
`;

        const model = genAI.getGenerativeModel({
          model: resolvedModel,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const visionRes = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Pdf,
              mimeType: 'application/pdf',
            },
          },
        ]);

        let rawText = '';
        try {
          rawText = visionRes.response.text().trim();
        } catch (textErr: any) {
          console.warn(LOG, 'visionRes.response.text() hatası:', textErr);
        }
        console.log(LOG, 'Gemini Vision PDF yanıtı:', rawText.slice(0, 300));
        let detectedItems: any[] = [];
        try {
          const parsed = parseJsonLenient(rawText);
          detectedItems = Array.isArray(parsed.data) 
            ? parsed.data 
            : (parsed.data?.students || parsed.data?.items || (parsed.data ? [parsed.data] : []));
        } catch (jsonErr: any) {
          console.warn(LOG, 'parseJsonLenient hatası, regex fallback deneniyor:', jsonErr);
          const itemRegex = /\{[\s\S]*?"studentNumber"\s*:\s*"?[^",}]+"?[\s\S]*?\}/g;
          let match;
          while ((match = itemRegex.exec(rawText)) !== null) {
            try {
              const item = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
              if (item.studentNumber) detectedItems.push(item);
            } catch {}
          }
        }

        if (Array.isArray(detectedItems) && detectedItems.length > 0) {
          console.log(LOG, `Gemini Vision PDF'den ${detectedItems.length} öğrenci tespit etti.`);
          // Akıştan çıkan fotoğraflarla tespit edilen numaraları sırayla eşle
          for (let i = 0; i < detectedItems.length; i++) {
            const item = detectedItems[i];
            const stdNo = String(item.studentNumber || '').trim();
            if (!stdNo) continue;
            const matched = findStudentByNumberFirst(stdNo, item.studentName, students);

            // Eğer stream'den çıkarılmış fotoğraf varsa onunla eşle
            if (i < streamPhotos.length && streamPhotos[i]?.tempUri) {
              const b64 = await readUriAsBase64(streamPhotos[i].tempUri);
              resultPhotos.push({
                studentNumber: stdNo,
                studentName: matched ? getStdFullName(matched) : item.studentName,
                photoBase64: `data:image/jpeg;base64,${b64}`,
                fileName: `${stdNo}.jpg`,
                matchedStudent: matched,
                source: 'ai-matched',
                tempUri: streamPhotos[i].tempUri,
                pageNumber: streamPhotos[i].pageNumber,
              });
            }
          }
        }
      }
    } else {
      // ─── 2. DURUM: GÖRSEL BELGE (JPG / PNG - Taranmış Liste veya Albüm) ───
      console.log(LOG, 'Görsel taranıyor (Gemini Vision Kırpma Motoru)...');
      onProgress?.('Görsel üzerindeki öğrenci yüzleri ve numaraları taranıyor...');

      const base64Img = await readUriAsBase64(fileUri);
      const dims = await getImageDimensions(fileUri);
      console.log(LOG, 'Görsel boyutları:', dims.width, 'x', dims.height, '| Base64 uzunluğu:', base64Img.length);

      const registeredHintsImg = students
        .map((s) => ({ no: getStdNum(s), name: getStdFullName(s) }))
        .filter((s) => s.no.length > 0)
        .slice(0, 100);

      const prompt = `
Sen okul albümü ve öğrenci listelerinden vesikalık fotoğrafları çıkaran yapay zeka modelisin.

🔴 ÇOK ÖNEMLİ EŞLEŞTİRME KURALI:
1. BİRİNCİ VE EN KESİN EŞLEŞTİRME ÖNCELİĞİN ÖĞRENCİ NUMARASIDIR (Okul No).
2. Her öğrenci fotoğrafını kırparken, fotoğrafın hemen altında, üstünde veya yanında yazan OKUL NUMARASINI (studentNumber) birincil kriter olarak oku.
3. İsimler eksik veya küçük puntolu olsa dahi numara önceliklidir.
4. "studentNumber": Öğrencinin fotoğrafının altında veya yanında yazan okul numarası (örn: "435", "104").
5. "studentName": Öğrencinin adı soyadı.
6. "box_2d": Öğrencinin vesikalık fotoğrafının TAM SINIRLARI [ymin, xmin, ymax, xmax]. Koordinatlar 0 ile 1000 arasında normalize edilmiş tamsayılar olmalıdır (0 üst/sol, 1000 alt/sağ).

Sistemdeki kayıtlı okul numaraları (Öncelikle bu numaralardan tespit et):
${JSON.stringify(registeredHintsImg)}

Örnek çıktı formatı:
[
  {
    "studentNumber": "435",
    "studentName": "Ahmet Yılmaz",
    "box_2d": [120, 50, 260, 200]
  }
]
Yalnızca yukarıdaki JSON dizisini döndür, başka hiçbir metin ekleme.
`;

      const model = genAI.getGenerativeModel({
        model: resolvedModel,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const visionRes = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Img,
            mimeType: resolvedMime,
          },
        },
      ]);

      let rawText = '';
      try {
        rawText = visionRes.response.text().trim();
      } catch (textErr: any) {
        console.warn(LOG, 'visionRes.response.text() hatası:', textErr);
      }
      console.log(LOG, 'Gemini Vision Yanıtı (ilk 300 karakter):', rawText.slice(0, 300));
      let detectedBoxes: any[] = [];
      try {
        const parsed = parseJsonLenient(rawText);
        detectedBoxes = Array.isArray(parsed.data)
          ? parsed.data
          : (parsed.data?.students || parsed.data?.items || (parsed.data ? [parsed.data] : []));
      } catch (jsonErr: any) {
        console.warn(LOG, 'parseJsonLenient hatası, regex fallback deneniyor:', jsonErr);
        const itemRegex = /\{[\s\S]*?"studentNumber"\s*:\s*"?[^",}]+"?[\s\S]*?\}/g;
        let match;
        while ((match = itemRegex.exec(rawText)) !== null) {
          try {
            const item = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
            if (item.studentNumber && item.box_2d) detectedBoxes.push(item);
          } catch {}
        }
      }

      if (Array.isArray(detectedBoxes) && detectedBoxes.length > 0) {
        console.log(LOG, `${detectedBoxes.length} öğrenci tespit edildi. Kırpma işlemi başlatılıyor...`);
        onProgress?.(`${detectedBoxes.length} öğrenci fotoğrafı görselden kırpılıyor...`);

        for (const item of detectedBoxes) {
          const stdNo = String(item.studentNumber || '').trim();
          if (!stdNo || !Array.isArray(item.box_2d) || item.box_2d.length !== 4) continue;

          const cropRes = await cropImageByBoundingBox(fileUri, item.box_2d as any, dims.width, dims.height);
          if (cropRes && cropRes.base64) {
            const matched = findStudentByNumberFirst(stdNo, item.studentName, students);
            resultPhotos.push({
              studentNumber: stdNo,
              studentName: matched ? getStdFullName(matched) : item.studentName,
              photoBase64: `data:image/jpeg;base64,${cropRes.base64}`,
              fileName: `${stdNo}.jpg`,
              matchedStudent: matched,
              source: 'ai-vision-crop',
              tempUri: cropRes.uri,
              pageNumber: 1,
            });
          }
        }
      }
    }

    if (resultPhotos.length === 0) {
      console.warn(LOG, 'Hiçbir fotoğraf veya numara eşleşmesi bulunamadı.');
      return {
        success: false,
        totalFound: 0,
        uploadedCount: 0,
        photos: [],
        error: 'Belgede öğrenci numarası veya yüz fotoğrafı tespit edilemedi.',
      };
    }

    if (!autoSave) {
      console.log(LOG, `${resultPhotos.length} fotoğraf önizleme ve kullanıcı onayına hazır.`);
      return {
        success: true,
        totalFound: resultPhotos.length,
        uploadedCount: 0,
        photos: resultPhotos,
      };
    }

    console.log(LOG, `${resultPhotos.length} öğrenci fotoğrafı hazırlandı. Sunucuya yükleniyor...`);
    onProgress?.(`${resultPhotos.length} fotoğraf sunucuya aktarılıyor...`);

    const payloadPhotos = resultPhotos.map((p) => ({
      studentNumber: p.studentNumber,
      photoBase64: p.photoBase64,
      base64Data: p.photoBase64,
      fileName: p.fileName,
    }));

    const uploadRes = await apiRequest<{ updatedCount?: number; successCount?: number }>(
      `uploads/batch-student-photos?schoolId=${schoolId}`,
      'POST',
      {
        schoolId,
        photos: payloadPhotos
      }
    );

    if (uploadRes.success) {
      const updated = uploadRes.data?.updatedCount || payloadPhotos.length;
      console.log(LOG, `Başarıyla tamamlandı! ${updated} öğrenci fotoğrafı yüklendi.`);
      return {
        success: true,
        totalFound: resultPhotos.length,
        uploadedCount: updated,
        photos: resultPhotos,
      };
    } else {
      console.error(LOG, 'Sunucuya yükleme başarısız:', uploadRes.error);
      return {
        success: false,
        totalFound: resultPhotos.length,
        uploadedCount: 0,
        photos: resultPhotos,
        error: uploadRes.error || 'Sunucuya kayıt yapılamadı.',
      };
    }
  } catch (err: any) {
    console.error(LOG, 'Genel Hata:', err);
    return {
      success: false,
      totalFound: 0,
      uploadedCount: 0,
      photos: [],
      error: err?.message || 'Yapay zeka ile fotoğraf analizi sırasında bir hata oluştu.',
    };
  }
}
