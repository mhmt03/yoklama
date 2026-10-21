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
  onProgress?: (stageText: string) => void
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

      // Eğer doğrudan öğrenci no ile eşleşen fotoğraflar varsa onları topla
      for (const sp of streamPhotos) {
        const stdNo = sp.matchedStudent?.student_number || sp.detectedNumber;
        if (stdNo && sp.tempUri) {
          try {
            const b64 = await readUriAsBase64(sp.tempUri);
            const matched = students.find((s) => s.student_number === stdNo);
            resultPhotos.push({
              studentNumber: stdNo,
              studentName: matched?.full_name || sp.detectedName,
              photoBase64: `data:image/jpeg;base64,${b64}`,
              fileName: `${stdNo}.jpg`,
              matchedStudent: matched,
              source: 'pdf-stream',
            });
          } catch {}
        }
      }

      // Eğer akıştan eşleşme çıkmadıysa veya eksik kaldıysa: Gemini Vision ile PDF analizi yap
      if (resultPhotos.length === 0) {
        console.log(LOG, 'PDF akışında doğrudan numara eşleşmesi bulunamadı. Gemini Vision ile görsel analiz yapılıyor...');
        onProgress?.('Gemini Vision ile PDF sayfası ve vesikalık fotoğraflar taranıyor...');

        const base64Pdf = await readUriAsBase64(fileUri);
        console.log(LOG, 'PDF base64 boyutu:', base64Pdf.length);

        const prompt = `
Sen MEB okulları için öğrenci listesi ve albüm çözümleyen yapay zeka asistanısın.
Sana verilen PDF belgesinde öğrenci fotoğrafları, isimleri ve okul numaraları yer almaktadır.
Her öğrenci için:
1. "studentNumber": Öğrencinin fotoğrafının altında, yanında veya listesinde yer alan okul numarası (örn: "105", "412").
2. "studentName": Öğrencinin adı soyadı.
3. "pageNumber": Bulunduğu sayfa numarası (1'den başlar).
4. "box_2d": Eğer vesikalık fotoğraf bir görsel alanındaysa tahmini koordinatları [ymin, xmin, ymax, xmax] (0-1000 arası normalize).

Sistemde kayıtlı öğrenci numaralarından bazıları ipucu olarak:
${JSON.stringify(students.slice(0, 30).map((s) => ({ no: s.student_number, name: s.full_name })))}

Yalnızca aşağıdaki JSON şemasına uyarak saf JSON dizisi döndür:
[
  {
    "studentNumber": "104",
    "studentName": "Ahmet Yılmaz",
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
            const matched = students.find((s) => s.student_number === stdNo);

            // Eğer stream'den çıkarılmış fotoğraf varsa onunla eşle
            if (i < streamPhotos.length && streamPhotos[i]?.tempUri) {
              const b64 = await readUriAsBase64(streamPhotos[i].tempUri);
              resultPhotos.push({
                studentNumber: stdNo,
                studentName: matched?.full_name || item.studentName,
                photoBase64: `data:image/jpeg;base64,${b64}`,
                fileName: `${stdNo}.jpg`,
                matchedStudent: matched,
                source: 'ai-matched',
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

      const prompt = `
Sen okul albümü ve öğrenci listelerinden vesikalık fotoğrafları çıkaran yapay zeka modelisin.
Görseldeki her bir öğrenci için:
1. "studentNumber": Fotoğrafın altında veya yanında yazan okul numarası (örn: "214", "55").
2. "studentName": Öğrencinin adı soyadı.
3. "box_2d": Öğrencinin vesikalık fotoğrafının TAM SINIRLARI [ymin, xmin, ymax, xmax]. Koordinatlar 0 ile 1000 arasında normalize edilmiş tamsayılar olmalıdır. (0 üst/sol, 1000 alt/sağ).

Örnek çıktı formatı:
[
  {
    "studentNumber": "104",
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
            const matched = students.find((s) => s.student_number === stdNo);
            resultPhotos.push({
              studentNumber: stdNo,
              studentName: matched?.full_name || item.studentName,
              photoBase64: `data:image/jpeg;base64,${cropRes.base64}`,
              fileName: `${stdNo}.jpg`,
              matchedStudent: matched,
              source: 'ai-vision-crop',
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
