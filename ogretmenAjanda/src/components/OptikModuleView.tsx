import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest, getActiveSchoolId } from '../services/apiClient';
import { showAlert, showConfirm } from '../utils/webAlertPolyfill';
import {
  downloadAnswerKeyExcelTemplate,
  parseAnswerKeyExcelArrayBuffer,
  exportOptikResultsToExcel,
  printOptikResultsTablePdf,
  printOptikStudentReportsPdf,
  findLessonResultForStudent,
  readTextWithEncodingAutoDetect,
} from './optik/optikExportAndExcelHelpers';

export interface OptikModuleViewProps {
  schoolId?: string;
  mode: 'admin' | 'teacher' | 'student';
  studentNumber?: string;
}

/**
 * .FMT formatını istemci tarafında anında çözen yardımcı algoritma.
 * Oturum düşmesi veya çevrimdışı olma durumunda tam koruma sağlar.
 */
function parseFmtLocally(fmtContent: string, existingFormName?: string) {
  const lines = fmtContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  let numaraBaslangic = 1, numaraUzunluk = 5;
  let adSoyadBaslangic = 6, adSoyadUzunluk = 20;
  let adSoyadAyriMi = false, soyadBaslangic = 16, soyadUzunluk = 10;
  let sinifBaslangic = 26, sinifUzunluk = 0;
  let kitapcikTuruBaslangic = 30, kitapcikTuruUzunluk = 1;
  const dersler: any[] = [];
  let currentTxtCol = 1;
  let explicitNoFound = false;
  let sira = 1;

  for (const line of lines) {
    const parts = line.split('=').map((p) => p.trim());
    if (parts.length >= 4 && !isNaN(parseInt(parts[0], 10))) {
      const r1 = parseInt(parts[0], 10);
      const r2 = parseInt(parts[1], 10);
      const c1 = parseInt(parts[2], 10);
      const c2 = parseInt(parts[3], 10);
      const direction = (parts[4] || 'D').toUpperCase();
      const normCharset = (parts[5] || '').toUpperCase();
      const rawLabel = parts[parts.length - 1] || parts[parts.length - 2] || '';
      const upper = rawLabel.toUpperCase();
      const txtLen = direction === 'D' ? Math.max(1, r2 - r1 + 1) : Math.max(1, c2 - c1 + 1);
      const txtStart = currentTxtCol;
      currentTxtCol += txtLen;

      if (upper.includes('NO') || upper.includes('NUMARA') || upper.includes('OGRE')) {
        numaraBaslangic = txtStart;
        numaraUzunluk = txtLen;
        explicitNoFound = true;
      } else if (upper.includes('AD') || upper.includes('ISIM') || upper.includes('NAME') || upper.includes('ALAN 3')) {
        adSoyadBaslangic = txtStart;
        adSoyadUzunluk = txtLen;
      } else if (upper.includes('SOYAD')) {
        adSoyadAyriMi = true;
        soyadBaslangic = txtStart;
        soyadUzunluk = txtLen;
      } else if (upper.includes('SINIF') || upper.includes('SUBE')) {
        sinifBaslangic = txtStart;
        sinifUzunluk = txtLen;
      } else if (upper.includes('KITAP')) {
        kitapcikTuruBaslangic = txtStart;
        kitapcikTuruUzunluk = txtLen;
      } else if (direction === 'Y' && (normCharset.includes('ABCD') || normCharset.includes('ABC')) && txtLen >= 3) {
        let dAdi = rawLabel;
        let dGrubu: string | undefined;
        if (upper.includes('TURK')) { dAdi = 'Türkçe'; dGrubu = 'Türkçe'; }
        else if (upper.includes('SOS')) { dAdi = 'Sosyal Bilimler'; dGrubu = 'Sosyal Bilimler'; }
        else if (upper.includes('MAT')) { dAdi = 'Temel Matematik'; dGrubu = 'Temel Matematik'; }
        else if (upper.includes('FEN')) { dAdi = 'Fen Bilimleri'; dGrubu = 'Fen Bilimleri'; }
        else if (upper.includes('FIZ')) { dAdi = 'Fizik'; dGrubu = 'Fen Bilimleri'; }
        else if (upper.includes('KIM')) { dAdi = 'Kimya'; dGrubu = 'Fen Bilimleri'; }
        else if (upper.includes('BIY')) { dAdi = 'Biyoloji'; dGrubu = 'Fen Bilimleri'; }
        else if (upper.includes('TAR')) { dAdi = 'Tarih'; dGrubu = 'Sosyal Bilimler'; }
        else if (upper.includes('COG')) { dAdi = 'Coğrafya'; dGrubu = 'Sosyal Bilimler'; }
        else if (upper.includes('FEL')) { dAdi = 'Felsefe'; dGrubu = 'Sosyal Bilimler'; }
        else if (upper.includes('DIN')) { dAdi = 'Din Kültürü'; dGrubu = 'Sosyal Bilimler'; }

        dersler.push({
          dersAdi: dAdi,
          dersGrubu: dGrubu,
          baslangicSutun: txtStart,
          karakterSayisi: txtLen,
          siraNo: sira++,
        });
      } else if (!explicitNoFound && normCharset.includes('0123456789') && txtLen >= 3 && txtLen <= 6) {
        numaraBaslangic = txtStart;
        numaraUzunluk = txtLen;
        explicitNoFound = true;
      }
    }
  }

  return {
    formAdi: existingFormName || 'Çözümlenen .FMT Formu',
    numaraBaslangic,
    numaraUzunluk,
    adSoyadBaslangic,
    adSoyadUzunluk,
    adSoyadAyriMi,
    soyadBaslangic,
    soyadUzunluk,
    sinifBaslangic,
    sinifUzunluk,
    kitapcikTuruBaslangic,
    kitapcikTuruUzunluk,
    dersler,
  };
}

export const OptikModuleView: React.FC<OptikModuleViewProps> = ({
  schoolId,
  mode,
  studentNumber,
}) => {
  const [effectiveSchoolId, setEffectiveSchoolId] = useState<string | undefined>(schoolId);

  useEffect(() => {
    if (schoolId) {
      setEffectiveSchoolId(schoolId);
    } else {
      getActiveSchoolId().then((sid) => {
        if (sid) setEffectiveSchoolId(sid);
      });
    }
  }, [schoolId]);

  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'forms' | 'analytics'>('exams');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [forms, setForms] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // Analitik & Sonuç State
  const [analyticsTab, setAnalyticsTab] = useState<'results' | 'charts' | 'questions'>('results');
  const [examResults, setExamResults] = useState<any[]>([]);
  const [examResultsMeta, setExamResultsMeta] = useState<any | null>(null);
  const [examStats, setExamStats] = useState<any | null>(null);
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestionLesson, setSelectedQuestionLesson] = useState<string>('');

  // Detaylı Tablo Sıralama ve Çoklu Seçim State'leri
  const [sortField, setSortField] = useState<string>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);

  // Öğrenci Detaylı Karne Modalı
  const [reportModalData, setReportModalData] = useState<any | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Form Tanımlama / Düzenleme Modalı (Sütun numaraları dosyada 1'den başlar!)
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingForm, setEditingForm] = useState<any>({
    id: undefined,
    formAdi: '',
    numaraBaslangic: 1,
    numaraUzunluk: 5,
    adSoyadBaslangic: 6,
    adSoyadUzunluk: 20,
    adSoyadAyriMi: false,
    soyadBaslangic: 26,
    soyadUzunluk: 15,
    sinifBaslangic: 26,
    sinifUzunluk: 4,
    kitapcikTuruBaslangic: 30,
    kitapcikTuruUzunluk: 1,
    sampleLine: '00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD',
    dersler: [
      { dersAdi: 'Türk Dili ve Edebiyatı', baslangicSutun: 31, karakterSayisi: 20, siraNo: 1 },
      { dersAdi: 'Matematik', baslangicSutun: 51, karakterSayisi: 20, siraNo: 2 },
      { dersAdi: 'Fizik', baslangicSutun: 71, karakterSayisi: 10, siraNo: 3 },
    ],
  });
  const [fmtRawInput, setFmtRawInput] = useState('');
  const [showFmtBox, setShowFmtBox] = useState(false);
  const [parsedFmtFields, setParsedFmtFields] = useState<any[]>([]);

  // Optik Form Sihirbazı İlk 5 Satır & Tıklanan Sütun Ölçer (1-Tabanlı)
  const [wizardSampleLines, setWizardSampleLines] = useState<string[]>([
    '00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD',
  ]);
  const [wizardActiveLineIdx, setWizardActiveLineIdx] = useState<number>(0);
  const [wizardCursorCol, setWizardCursorCol] = useState<number>(1);
  const [wizardSelLen, setWizardSelLen] = useState<number>(1);
  const [wizardRangeAnchorCol, setWizardRangeAnchorCol] = useState<number | null>(null);

  // Sınav Tanımlama / Düzenleme Modalı
  const [examModalVisible, setExamModalVisible] = useState(false);
  const [pendingExcelKazanimlar, setPendingExcelKazanimlar] = useState<any[]>([]);
  const [editingExam, setEditingExam] = useState<any>({
    id: undefined,
    sinavAdi: '',
    sinavTuru: 'SERBEST',
    bagliTytSinavId: null,
    varsayilanTytPuani: 150,
    uygulamaTarihi: new Date().toISOString().slice(0, 10),
    yanlisDogruyuGotururSayisi: 4,
    hedefSiniflar: '',
    kitapcikTurleri: 'A,B',
    optikFormId: '',
    tabanPuan: 0,
    toplamPuan: 500,
    isPublishedToStudents: false,
    showRankingToStudents: false,
    isVisibleToTeachers: true,
    hasKazanimAnalysis: false,
    dersler: [
      { dersAdi: 'Türk Dili ve Edebiyatı', soruSayisi: 20, katsayi: 1.0, siraNo: 1, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
      { dersAdi: 'Matematik', soruSayisi: 20, katsayi: 1.0, siraNo: 2, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
      { dersAdi: 'Fizik', soruSayisi: 10, katsayi: 1.0, siraNo: 3, cevapAnahtariA: 'ABCDABCDAB', cevapAnahtariB: 'BCDABCDABA' },
    ],
  });

  // Konu & Kazanım Düzenleme Modalı
  const [kazanimModalVisible, setKazanimModalVisible] = useState(false);
  const [kazanimExam, setKazanimExam] = useState<any | null>(null);
  const [kazanimSelectedLesson, setKazanimSelectedLesson] = useState<string>('');
  const [kazanimItems, setKazanimItems] = useState<any[]>([]);
  const [bulkKazanimText, setBulkKazanimText] = useState<string>('');

  // Optik Okuma (TXT / DAT Değerlendirme) Modalı
  const [evalModalVisible, setEvalModalVisible] = useState(false);
  const [evalExam, setEvalExam] = useState<any | null>(null);
  const [evalFormId, setEvalFormId] = useState<string>('');
  const [evalTxtContent, setEvalTxtContent] = useState<string>('');
  const [evalPreviewResults, setEvalPreviewResults] = useState<any[] | null>(null);
  const [evalFilterClassesEnabled, setEvalFilterClassesEnabled] = useState<boolean>(false);
  const [evalSelectedClasses, setEvalSelectedClasses] = useState<string[]>([]);
  const [evalAvailableClasses, setEvalAvailableClasses] = useState<Array<{ sinif: string; count: number }>>([]);
  const [evalPreviewFilter, setEvalPreviewFilter] = useState<'ALL' | 'MISSING_BOOKLET' | 'UNMATCHED' | 'NAME_MISMATCH'>('ALL');
  const [evalExcludedLines, setEvalExcludedLines] = useState<number[]>([]);
  const [evalRowOverrides, setEvalRowOverrides] = useState<Record<number, any>>({});
  const [evalDiagCounts, setEvalDiagCounts] = useState<{
    unmatchedCount: number;
    nameMismatchCount: number;
    missingBookletCount: number;
  }>({ unmatchedCount: 0, nameMismatchCount: 0, missingBookletCount: 0 });
  const [evalSearchQuery, setEvalSearchQuery] = useState<string>('');

  // Öğrenci Kodlama ve Detay Düzenleme Modalı (Önizleme Satırı Detayı)
  const [studentDetailModalVisible, setStudentDetailModalVisible] = useState(false);
  const [editingStudentRow, setEditingStudentRow] = useState<any | null>(null);
  const [tempStudentNo, setTempStudentNo] = useState('');
  const [tempStudentName, setTempStudentName] = useState('');
  const [tempStudentClass, setTempStudentClass] = useState('');
  const [tempBooklet, setTempBooklet] = useState('A');
  const [tempRowAnswers, setTempRowAnswers] = useState<Record<string, string>>({});

  const loadInitialData = useCallback(async () => {
    const activeSid = effectiveSchoolId || schoolId;
    setLoading(true);
    try {
      const schoolQuery = activeSid ? `schoolId=${activeSid}` : '';
      const studentParam = studentNumber ? `&studentNumber=${encodeURIComponent(studentNumber)}` : '';
      const queryStr = schoolQuery ? `${schoolQuery}${studentParam}` : (studentParam ? studentParam.slice(1) : '');
      const examsEndpoint = queryStr ? `Optik/exams?${queryStr}` : 'Optik/exams';
      const formsEndpoint = schoolQuery ? `Optik/forms?${schoolQuery}` : 'Optik/forms';

      const [examsRes, formsRes] = await Promise.all([
        apiRequest<any[]>(examsEndpoint, 'GET'),
        mode === 'admin'
          ? apiRequest<any[]>(formsEndpoint, 'GET')
          : Promise.resolve({ success: true, data: [] }),
      ]);

      if (examsRes.success && Array.isArray(examsRes.data)) {
        setExams(examsRes.data);
        if (examsRes.data.length > 0 && !selectedExamId) {
          setSelectedExamId(examsRes.data[0].id);
        }
      }
      if (formsRes.success && Array.isArray(formsRes.data)) {
        setForms(formsRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, effectiveSchoolId, mode, studentNumber, selectedExamId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const loadExamAnalyticsAndResults = useCallback(async (examId: string) => {
    if (!examId || mode === 'student') return;
    setActionLoading(true);
    try {
      const [resList, statsRes] = await Promise.all([
        apiRequest<any>(`Optik/exams/${examId}/results`, 'GET'),
        apiRequest<any>(`Optik/exams/${examId}/statistics`, 'GET'),
      ]);

      if (resList.success && resList.data) {
        setExamResults(resList.data.results || []);
        setExamResultsMeta(resList.data.exam || null);
        setSelectedResultIds([]);
      }
      if (statsRes.success && statsRes.data) {
        setExamStats(statsRes.data);
        const firstLesson = statsRes.data.lessonItemAnalyses?.[0]?.dersAdi || '';
        setSelectedQuestionLesson((prev) => prev || firstLesson);
      }
    } finally {
      setActionLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (selectedExamId && (activeSubTab === 'analytics' || mode === 'teacher')) {
      loadExamAnalyticsAndResults(selectedExamId);
    }
  }, [selectedExamId, activeSubTab, mode, loadExamAnalyticsAndResults]);

  // Görünürlük Anahtarı Güncelleme
  const handleToggleVisibility = async (
    exam: any,
    field: 'isPublishedToStudents' | 'showRankingToStudents' | 'isVisibleToTeachers',
    value: boolean
  ) => {
    setExams((prev) => prev.map((e) => (e.id === exam.id ? { ...e, [field]: value } : e)));
    const res = await apiRequest<any>(`Optik/exams/${exam.id}/visibility`, 'PUT', {
      [field]: value,
    });
    if (!res.success) {
      showAlert('Hata', res.error || 'Görünürlük ayarı güncellenemedi.');
      loadInitialData();
    }
  };

  // Öğrenci Karnesi Açma
  const handleOpenStudentReport = async (examId: string, studentKey: string) => {
    if (!examId || !studentKey) return;
    setActionLoading(true);
    try {
      const res = await apiRequest<any>(`Optik/exams/${examId}/student-report/${encodeURIComponent(studentKey)}`, 'GET');
      if (res.success && res.data) {
        setReportModalData(res.data);
        setReportModalVisible(true);
      } else {
        showAlert('Karne Bulunamadı', res.error || 'Öğrenciye ait detaylı karne verisi alınamadı.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Filtrelenen veya Seçilen Öğrencilerin Karnelerini Toplu PDF Olarak Alma
  const handleBulkExportReportCardsPdf = async (targetStudents: any[]) => {
    if (!selectedExamId) return;
    if (!targetStudents || targetStudents.length === 0) {
      showAlert('Uyarı', 'Karne PDF alınacak öğrenci bulunmuyor.');
      return;
    }
    setActionLoading(true);
    try {
      const idsToExport =
        selectedResultIds.length > 0
          ? selectedResultIds
          : targetStudents.map((r) => r.id).filter(Boolean);

      const res = await apiRequest<any>(`Optik/exams/${selectedExamId}/bulk-reports`, 'POST', {
        resultIds: idsToExport,
      });

      if (res.success && res.data?.reports?.length > 0) {
        printOptikStudentReportsPdf(res.data.exam, res.data.reports);
      } else {
        showAlert('Hata', res.error || 'Toplu karne verileri alınamadı.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Sonuçlar Ekranından Tekil veya Çoklu Öğrenci Silme
  const handleDeleteResultsFromExam = (idsToDelete: string[], labelInfo: string) => {
    if (!selectedExamId || idsToDelete.length === 0) return;
    showConfirm(
      'Sınav Sonucundan Öğrenci Sil',
      `${labelInfo} bu sınavın değerlendirme listesinden silinecek ve kalan öğrencilerin sınıf/okul sıralamaları yeniden hesaplanacaktır. Onaylıyor musunuz?`,
      async () => {
        setActionLoading(true);
        try {
          const res = await apiRequest<any>(`Optik/exams/${selectedExamId}/results/bulk-delete`, 'POST', {
            resultIds: idsToDelete,
          });
          if (res.success) {
            showAlert('Silindi ✅', res.data?.message || 'Öğrenci sonuçları silindi ve sıralamalar güncellendi.');
            setSelectedResultIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
            await loadInitialData();
            await loadExamAnalyticsAndResults(selectedExamId);
          } else {
            showAlert('Hata', res.error || 'Öğrenci sonucu silinemedi.');
          }
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  // Excel'den Cevap Anahtarı Yükleme
  const handleUploadAnswerKeyExcel = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];

      let buffer: ArrayBuffer;
      if (Platform.OS === 'web' && (asset as any).file) {
        buffer = await (asset as any).file.arrayBuffer();
      } else {
        const resp = await fetch(asset.uri);
        buffer = await resp.arrayBuffer();
      }

      const parsed = parseAnswerKeyExcelArrayBuffer(buffer, editingExam.dersler || []);
      setEditingExam((prev: any) => ({
        ...prev,
        dersler: parsed.dersler,
      }));
      setPendingExcelKazanimlar(parsed.kazanimlar || []);

      const kazMsg =
        parsed.kazanimlar.length > 0
          ? ` Ayrıca ${parsed.kazanimlar.length} sorunun konu/kazanım bilgisi algılandı (sınav kaydedildiğinde otomatik eklenecek).`
          : '';
      showAlert(
        'Cevap Anahtarı Yüklendi ✅',
        `${parsed.dersler.length} dersin cevap anahtarları Excel şablonundan başarıyla aktarıldı.${kazMsg}`
      );
    } catch (err: any) {
      showAlert('Excel Okuma Hatası', err?.message || 'Cevap anahtarı Excel dosyası okunamadı.');
    }
  };

  // Optik Form Kaydetme
  const handleSaveForm = async () => {
    if (!editingForm.formAdi?.trim()) {
      showAlert('Uyarı', 'Lütfen form şablonu için bir ad giriniz.');
      return;
    }
    setActionLoading(true);
    try {
      const activeSid = effectiveSchoolId || schoolId;
      const safeId =
        editingForm.id && String(editingForm.id).trim() !== '' && String(editingForm.id).length > 10
          ? editingForm.id
          : undefined;

      const cleanDersler = (editingForm.dersler || [])
        .map((d: any, i: number) => ({
          dersAdi: String(d.dersAdi || '').trim(),
          dersGrubu: d.dersGrubu ? String(d.dersGrubu).trim() : null,
          baslangicSutun: parseInt(String(d.baslangicSutun || '1'), 10) || 1,
          karakterSayisi: parseInt(String(d.karakterSayisi || '20'), 10) || 20,
          siraNo: parseInt(String(d.siraNo || i + 1), 10) || i + 1,
        }))
        .filter((d: any) => d.dersAdi.length > 0);

      const payload = {
        id: safeId,
        schoolId: activeSid || undefined,
        formAdi: editingForm.formAdi.trim(),
        numaraBaslangic: parseInt(String(editingForm.numaraBaslangic || '1'), 10) || 1,
        numaraUzunluk: parseInt(String(editingForm.numaraUzunluk || '5'), 10) || 5,
        adSoyadBaslangic: parseInt(String(editingForm.adSoyadBaslangic || '6'), 10) || 6,
        adSoyadUzunluk: parseInt(String(editingForm.adSoyadUzunluk || '20'), 10) || 20,
        adSoyadAyriMi: Boolean(editingForm.adSoyadAyriMi),
        soyadBaslangic:
          editingForm.adSoyadAyriMi && editingForm.soyadBaslangic
            ? parseInt(String(editingForm.soyadBaslangic), 10) || null
            : null,
        soyadUzunluk:
          editingForm.adSoyadAyriMi && editingForm.soyadUzunluk
            ? parseInt(String(editingForm.soyadUzunluk), 10) || null
            : null,
        sinifBaslangic: parseInt(String(editingForm.sinifBaslangic || '26'), 10) || 26,
        sinifUzunluk: parseInt(String(editingForm.sinifUzunluk ?? '4'), 10) || 0,
        kitapcikTuruBaslangic: editingForm.kitapcikTuruBaslangic
          ? parseInt(String(editingForm.kitapcikTuruBaslangic), 10) || null
          : null,
        kitapcikTuruUzunluk: editingForm.kitapcikTuruUzunluk
          ? parseInt(String(editingForm.kitapcikTuruUzunluk), 10) || 1
          : null,
        fmtRawContent: editingForm.fmtRawContent || fmtRawInput || null,
        sampleLine: editingForm.sampleLine || null,
        dersler: cleanDersler,
      };

      const res = await apiRequest<any>('Optik/forms', 'POST', payload);
      if (res.success) {
        setFormModalVisible(false);
        showAlert('Başarılı ✅', 'Optik form şablonu kaydedildi.');
        await loadInitialData();
      } else {
        showAlert('Hata', res.error || 'Form kaydedilemedi.');
      }
    } catch (err: any) {
      showAlert('Kritik Hata', err?.message || 'Form kaydedilirken bir hata oluştu.');
    } finally {
      setActionLoading(false);
    }
  };

  // .FMT Dosyası Seçme (Bilgisayardan)
  const handlePickFmtFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      let text = '';
      if (Platform.OS === 'web' && (asset as any).file) {
        text = await readTextWithEncodingAutoDetect((asset as any).file);
      } else {
        const resp = await fetch(asset.uri);
        const buf = await resp.arrayBuffer();
        text = await readTextWithEncodingAutoDetect(buf);
      }
      setFmtRawInput(text);
    } catch (e: any) {
      showAlert('Dosya Okuma Hatası', e?.message || '.fmt dosyası okunamadı.');
    }
  };

  // Optik Form Sihirbazı İçin Örnek TXT Dosyası Yükleme (İlk 5 Satırı Okur - Türkçe Karakter Destekli)
  const handlePickWizardSampleTxtFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      let text = '';
      if (Platform.OS === 'web' && (asset as any).file) {
        text = await readTextWithEncodingAutoDetect((asset as any).file);
      } else {
        const resp = await fetch(asset.uri);
        const buf = await resp.arrayBuffer();
        text = await readTextWithEncodingAutoDetect(buf);
      }
      const firstFive = text
        .split(/\r?\n/)
        .map((l) => l.replace(/\r$/, ''))
        .filter((l) => l.trim().length > 0)
        .slice(0, 5);

      if (firstFive.length === 0) {
        showAlert('Uyarı', 'Seçilen TXT dosyasında dolu satır bulunamadı.');
        return;
      }

      setWizardSampleLines(firstFive);
      setWizardActiveLineIdx(0);
      setWizardCursorCol(1);
      setWizardSelLen(1);
      setWizardRangeAnchorCol(null);
      setEditingForm((prev: any) => ({
        ...prev,
        sampleLine: firstFive[0],
      }));
    } catch (e: any) {
      showAlert('Dosya Okuma Hatası', e?.message || 'Örnek TXT dosyası okunamadı.');
    }
  };

  // Sınav Türü (SERBEST, TYT, AYT, LGS) Şablon ve Puanlama Modeli Uygulayıcı
  const applyExamTypePreset = (presetKey: 'SERBEST' | 'LGS' | 'TYT' | 'AYT' | 'AYT_SAY' | 'AYT_EA' | 'AYT_SOZ') => {
    const makeKeyA = (n: number) => 'ABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD'.slice(0, n);
    const makeKeyB = (n: number) => 'BCDABCDABCDABCDABCDABCDABCDABCDABCDABCDA'.slice(0, n);

    if (presetKey === 'SERBEST') {
      setEditingExam((p: any) => ({
        ...p,
        sinavTuru: 'SERBEST',
        tabanPuan: 0,
        toplamPuan: 0,
      }));
      return;
    }

    if (presetKey === 'LGS') {
      setEditingExam((p: any) => ({
        ...p,
        sinavTuru: 'LGS',
        yanlisDogruyuGotururSayisi: 3,
        tabanPuan: 194.75,
        toplamPuan: 500,
        dersler: [
          { dersAdi: 'Türkçe', dersGrubu: 'Türkçe', soruSayisi: 20, katsayi: 4.0, siraNo: 1, cevapAnahtariA: makeKeyA(20), cevapAnahtariB: makeKeyB(20) },
          { dersAdi: 'T.C. İnkılap Tarihi', dersGrubu: 'Sosyal Bilgiler', soruSayisi: 10, katsayi: 1.0, siraNo: 2, cevapAnahtariA: makeKeyA(10), cevapAnahtariB: makeKeyB(10) },
          { dersAdi: 'Din Kültürü', dersGrubu: 'Din Kültürü', soruSayisi: 10, katsayi: 1.0, siraNo: 3, cevapAnahtariA: makeKeyA(10), cevapAnahtariB: makeKeyB(10) },
          { dersAdi: 'Yabancı Dil', dersGrubu: 'Yabancı Dil', soruSayisi: 10, katsayi: 1.0, siraNo: 4, cevapAnahtariA: makeKeyA(10), cevapAnahtariB: makeKeyB(10) },
          { dersAdi: 'Matematik', dersGrubu: 'Matematik', soruSayisi: 20, katsayi: 4.0, siraNo: 5, cevapAnahtariA: makeKeyA(20), cevapAnahtariB: makeKeyB(20) },
          { dersAdi: 'Fen Bilimleri', dersGrubu: 'Fen Bilimleri', soruSayisi: 20, katsayi: 4.0, siraNo: 6, cevapAnahtariA: makeKeyA(20), cevapAnahtariB: makeKeyB(20) },
        ],
      }));
      return;
    }

    if (presetKey === 'TYT') {
      setEditingExam((p: any) => ({
        ...p,
        sinavTuru: 'TYT',
        yanlisDogruyuGotururSayisi: 4,
        tabanPuan: 100,
        toplamPuan: 500,
        dersler: [
          { dersAdi: 'Türkçe', dersGrubu: 'Türkçe', soruSayisi: 40, katsayi: 3.3, siraNo: 1, cevapAnahtariA: makeKeyA(40), cevapAnahtariB: makeKeyB(40) },
          { dersAdi: 'Tarih', dersGrubu: 'Sosyal Bilimler', soruSayisi: 5, katsayi: 3.4, siraNo: 2, cevapAnahtariA: makeKeyA(5), cevapAnahtariB: makeKeyB(5) },
          { dersAdi: 'Coğrafya', dersGrubu: 'Sosyal Bilimler', soruSayisi: 5, katsayi: 3.4, siraNo: 3, cevapAnahtariA: makeKeyA(5), cevapAnahtariB: makeKeyB(5) },
          { dersAdi: 'Felsefe', dersGrubu: 'Sosyal Bilimler', soruSayisi: 5, katsayi: 3.4, siraNo: 4, cevapAnahtariA: makeKeyA(5), cevapAnahtariB: makeKeyB(5) },
          { dersAdi: 'Din Kültürü', dersGrubu: 'Sosyal Bilimler', soruSayisi: 5, katsayi: 3.4, siraNo: 5, cevapAnahtariA: makeKeyA(5), cevapAnahtariB: makeKeyB(5) },
          { dersAdi: 'Temel Matematik', dersGrubu: 'Temel Matematik', soruSayisi: 40, katsayi: 3.3, siraNo: 6, cevapAnahtariA: makeKeyA(40), cevapAnahtariB: makeKeyB(40) },
          { dersAdi: 'Fizik', dersGrubu: 'Fen Bilimleri', soruSayisi: 7, katsayi: 3.4, siraNo: 7, cevapAnahtariA: makeKeyA(7), cevapAnahtariB: makeKeyB(7) },
          { dersAdi: 'Kimya', dersGrubu: 'Fen Bilimleri', soruSayisi: 7, katsayi: 3.4, siraNo: 8, cevapAnahtariA: makeKeyA(7), cevapAnahtariB: makeKeyB(7) },
          { dersAdi: 'Biyoloji', dersGrubu: 'Fen Bilimleri', soruSayisi: 6, katsayi: 3.4, siraNo: 9, cevapAnahtariA: makeKeyA(6), cevapAnahtariB: makeKeyB(6) },
        ],
      }));
      return;
    }

    if (presetKey === 'AYT' || presetKey === 'AYT_SAY' || presetKey === 'AYT_EA' || presetKey === 'AYT_SOZ') {
      let aytDersler = [
        { dersAdi: 'Türk Dili ve Edebiyatı', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 24, katsayi: 3.0, siraNo: 1, cevapAnahtariA: makeKeyA(24), cevapAnahtariB: makeKeyB(24) },
        { dersAdi: 'Tarih-1', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 10, katsayi: 2.8, siraNo: 2, cevapAnahtariA: makeKeyA(10), cevapAnahtariB: makeKeyB(10) },
        { dersAdi: 'Coğrafya-1', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 6, katsayi: 3.33, siraNo: 3, cevapAnahtariA: makeKeyA(6), cevapAnahtariB: makeKeyB(6) },
        { dersAdi: 'Matematik', dersGrubu: 'Matematik', soruSayisi: 40, katsayi: 3.0, siraNo: 4, cevapAnahtariA: makeKeyA(40), cevapAnahtariB: makeKeyB(40) },
        { dersAdi: 'Fizik', dersGrubu: 'Fen Bilimleri', soruSayisi: 14, katsayi: 2.85, siraNo: 5, cevapAnahtariA: makeKeyA(14), cevapAnahtariB: makeKeyB(14) },
        { dersAdi: 'Kimya', dersGrubu: 'Fen Bilimleri', soruSayisi: 13, katsayi: 3.07, siraNo: 6, cevapAnahtariA: makeKeyA(13), cevapAnahtariB: makeKeyB(13) },
        { dersAdi: 'Biyoloji', dersGrubu: 'Fen Bilimleri', soruSayisi: 13, katsayi: 3.07, siraNo: 7, cevapAnahtariA: makeKeyA(13), cevapAnahtariB: makeKeyB(13) },
        { dersAdi: 'Tarih-2', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 11, katsayi: 2.91, siraNo: 8, cevapAnahtariA: makeKeyA(11), cevapAnahtariB: makeKeyB(11) },
        { dersAdi: 'Coğrafya-2', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 11, katsayi: 2.91, siraNo: 9, cevapAnahtariA: makeKeyA(11), cevapAnahtariB: makeKeyB(11) },
        { dersAdi: 'Felsefe Grubu', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 12, katsayi: 2.91, siraNo: 10, cevapAnahtariA: makeKeyA(12), cevapAnahtariB: makeKeyB(12) },
        { dersAdi: 'Din Kültürü', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 6, katsayi: 2.91, siraNo: 11, cevapAnahtariA: makeKeyA(6), cevapAnahtariB: makeKeyB(6) },
      ];
      if (presetKey === 'AYT_SAY') {
        aytDersler = [
          { dersAdi: 'Matematik', dersGrubu: 'Matematik', soruSayisi: 40, katsayi: 3.0, siraNo: 1, cevapAnahtariA: makeKeyA(40), cevapAnahtariB: makeKeyB(40) },
          { dersAdi: 'Fizik', dersGrubu: 'Fen Bilimleri', soruSayisi: 14, katsayi: 2.85, siraNo: 2, cevapAnahtariA: makeKeyA(14), cevapAnahtariB: makeKeyB(14) },
          { dersAdi: 'Kimya', dersGrubu: 'Fen Bilimleri', soruSayisi: 13, katsayi: 3.07, siraNo: 3, cevapAnahtariA: makeKeyA(13), cevapAnahtariB: makeKeyB(13) },
          { dersAdi: 'Biyoloji', dersGrubu: 'Fen Bilimleri', soruSayisi: 13, katsayi: 3.07, siraNo: 4, cevapAnahtariA: makeKeyA(13), cevapAnahtariB: makeKeyB(13) },
        ];
      } else if (presetKey === 'AYT_EA') {
        aytDersler = [
          { dersAdi: 'Türk Dili ve Edebiyatı', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 24, katsayi: 3.0, siraNo: 1, cevapAnahtariA: makeKeyA(24), cevapAnahtariB: makeKeyB(24) },
          { dersAdi: 'Tarih-1', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 10, katsayi: 2.8, siraNo: 2, cevapAnahtariA: makeKeyA(10), cevapAnahtariB: makeKeyB(10) },
          { dersAdi: 'Coğrafya-1', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 6, katsayi: 3.33, siraNo: 3, cevapAnahtariA: makeKeyA(6), cevapAnahtariB: makeKeyB(6) },
          { dersAdi: 'Matematik', dersGrubu: 'Matematik', soruSayisi: 40, katsayi: 3.0, siraNo: 4, cevapAnahtariA: makeKeyA(40), cevapAnahtariB: makeKeyB(40) },
        ];
      } else if (presetKey === 'AYT_SOZ') {
        aytDersler = [
          { dersAdi: 'Türk Dili ve Edebiyatı', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 24, katsayi: 3.0, siraNo: 1, cevapAnahtariA: makeKeyA(24), cevapAnahtariB: makeKeyB(24) },
          { dersAdi: 'Tarih-1', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 10, katsayi: 2.8, siraNo: 2, cevapAnahtariA: makeKeyA(10), cevapAnahtariB: makeKeyB(10) },
          { dersAdi: 'Coğrafya-1', dersGrubu: 'Türk Dili ve Edebiyatı - Sosyal-1', soruSayisi: 6, katsayi: 3.33, siraNo: 3, cevapAnahtariA: makeKeyA(6), cevapAnahtariB: makeKeyB(6) },
          { dersAdi: 'Tarih-2', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 11, katsayi: 2.91, siraNo: 4, cevapAnahtariA: makeKeyA(11), cevapAnahtariB: makeKeyB(11) },
          { dersAdi: 'Coğrafya-2', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 11, katsayi: 2.91, siraNo: 5, cevapAnahtariA: makeKeyA(11), cevapAnahtariB: makeKeyB(11) },
          { dersAdi: 'Felsefe Grubu', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 12, katsayi: 2.91, siraNo: 6, cevapAnahtariA: makeKeyA(12), cevapAnahtariB: makeKeyB(12) },
          { dersAdi: 'Din Kültürü', dersGrubu: 'Sosyal Bilimler-2', soruSayisi: 6, katsayi: 2.91, siraNo: 7, cevapAnahtariA: makeKeyA(6), cevapAnahtariB: makeKeyB(6) },
        ];
      }

      const defaultTytExam = exams.find(
        (ex: any) => ex.id !== editingExam.id && (ex.sinavTuru || '').toUpperCase() === 'TYT'
      );

      setEditingExam((p: any) => ({
        ...p,
        sinavTuru: 'AYT',
        bagliTytSinavId: p.bagliTytSinavId || defaultTytExam?.id || null,
        varsayilanTytPuani: p.varsayilanTytPuani > 0 ? p.varsayilanTytPuani : 150,
        yanlisDogruyuGotururSayisi: 4,
        tabanPuan: 100,
        toplamPuan: 500,
        dersler: aytDersler,
      }));
    }
  };

  // .FMT Dosyası Çözümleme (Sunucu Destekli + Yerel Güvenlik Korumalı)
  const handleParseFmt = async () => {
    if (!fmtRawInput.trim()) {
      showAlert('Uyarı', 'Lütfen .fmt dosya içeriğini yapıştırın veya dosya seçin.');
      return;
    }
    setActionLoading(true);

    const applyParsedData = (pf: any, fields: any[], msg: string) => {
      setParsedFmtFields(fields);
      setEditingForm((prev: any) => ({
        ...prev,
        formAdi: pf.formAdi || prev.formAdi,
        numaraBaslangic: pf.numaraBaslangic,
        numaraUzunluk: pf.numaraUzunluk,
        adSoyadBaslangic: pf.adSoyadBaslangic,
        adSoyadUzunluk: pf.adSoyadUzunluk,
        adSoyadAyriMi: pf.adSoyadAyriMi ?? prev.adSoyadAyriMi,
        soyadBaslangic: pf.soyadBaslangic ?? prev.soyadBaslangic,
        soyadUzunluk: pf.soyadUzunluk ?? prev.soyadUzunluk,
        sinifBaslangic: pf.sinifBaslangic,
        sinifUzunluk: pf.sinifUzunluk,
        kitapcikTuruBaslangic: pf.kitapcikTuruBaslangic,
        kitapcikTuruUzunluk: pf.kitapcikTuruUzunluk,
        sampleLine: pf.sampleLine || prev.sampleLine,
        dersler: pf.dersler?.length > 0 ? pf.dersler : prev.dersler,
      }));
      if (pf.sampleLine && wizardSampleLines.length <= 1) {
        setWizardSampleLines([pf.sampleLine]);
      }
      showAlert('Başarılı 🪄', msg);
    };

    try {
      try {
        const res = await apiRequest<any>('Optik/forms/parse-fmt', 'POST', {
          fmtContent: fmtRawInput,
          formName: editingForm.formAdi || 'Çözümlenen Optik Form',
        });
        if (res.success && res.data?.parsedForm) {
          const pf = res.data.parsedForm;
          const fields = Array.isArray(res.data.fmtFields) ? res.data.fmtFields : [];
          applyParsedData(pf, fields, res.data.message || '.FMT başarıyla çözümlendi.');
          return;
        }
      } catch {
        // Sunucuya erişilemez veya oturum geçersizse yerel çözümleyiciye geç
      }

      // YEREL ÇÖZÜMLEME YEDEĞİ (Oturum hatası veya offline durumlara karşı tam koruma):
      try {
        const localPf = parseFmtLocally(fmtRawInput, editingForm.formAdi);
        if (localPf && localPf.dersler && localPf.dersler.length > 0) {
          applyParsedData(localPf, [], `.FMT dosyası başarıyla çözümlendi (${localPf.dersler.length} ders).`);
        } else {
          showAlert('Uyarı', '.FMT formatı çözümlenemedi. Lütfen dosya içeriğini kontrol ediniz.');
        }
      } catch (e: any) {
        showAlert('Hata', e?.message || '.FMT çözümlenemedi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Sınav Kaydetme
  const handleSaveExam = async () => {
    if (!editingExam.sinavAdi?.trim()) {
      showAlert('Uyarı', 'Lütfen sınav adını giriniz.');
      return;
    }
    setActionLoading(true);
    try {
      const isAyt = (editingExam.sinavTuru || '').toUpperCase().startsWith('AYT');
      const res = await apiRequest<any>('Optik/exams', 'POST', {
        ...editingExam,
        schoolId,
        bagliTytSinavId: isAyt && editingExam.bagliTytSinavId ? editingExam.bagliTytSinavId : null,
        varsayilanTytPuani: isAyt ? Number(editingExam.varsayilanTytPuani) || 150 : 150,
        optikFormId: editingExam.optikFormId || (forms[0]?.id ?? null),
      });
      if (res.success) {
        const savedExamId = res.data?.id || editingExam.id;
        if (savedExamId && pendingExcelKazanimlar.length > 0) {
          await apiRequest<any>(`Optik/exams/${savedExamId}/kazanimlar`, 'POST', {
            items: pendingExcelKazanimlar,
          });
          setPendingExcelKazanimlar([]);
        }
        setExamModalVisible(false);
        showAlert('Başarılı ✅', 'Optik sınav ve cevap anahtarları kaydedildi.');
        loadInitialData();
        if (savedExamId && selectedExamId === savedExamId) {
          loadExamAnalyticsAndResults(savedExamId);
        }
      } else {
        showAlert('Hata', res.error || 'Sınav kaydedilemedi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExam = (exam: any) => {
    showConfirm(
      'Optik Sınavı Sil',
      `'${exam.sinavAdi}' sınavını ve değerlendirilmiş tüm öğrenci sonuçlarını silmek istediğinize emin misiniz?`,
      async () => {
        const res = await apiRequest<any>(`Optik/exams/${exam.id}`, 'DELETE');
        if (res.success) {
          if (selectedExamId === exam.id) setSelectedExamId(null);
          loadInitialData();
        } else {
          showAlert('Hata', res.error || 'Sınav silinemedi.');
        }
      }
    );
  };

  const handleDeleteForm = (form: any) => {
    showConfirm(
      'Optik Form Şablonunu Sil',
      `"${form.formAdi}" adlı optik form şablonunu silmek istediğinize emin misiniz?`,
      async () => {
        setActionLoading(true);
        try {
          const res = await apiRequest<any>(`Optik/forms/${form.id}`, 'DELETE');
          if (res.success) {
            showAlert('Başarılı ✅', 'Optik form şablonu silindi.');
            loadInitialData();
          } else {
            showAlert('Hata', res.error || 'Form şablonu silinemedi.');
          }
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  // Kazanım Modalı Açma
  const handleOpenKazanimModal = async (exam: any) => {
    setKazanimExam(exam);
    const firstLesson = exam.dersler?.[0]?.dersAdi || '';
    setKazanimSelectedLesson(firstLesson);
    setActionLoading(true);
    try {
      const res = await apiRequest<any[]>(`Optik/exams/${exam.id}/kazanimlar`, 'GET');
      const existing = res.success && Array.isArray(res.data) ? res.data : [];

      const allRows: any[] = [];
      for (const d of exam.dersler || []) {
        for (let q = 1; q <= d.soruSayisi; q++) {
          const found = existing.find((x: any) => x.dersAdi === d.dersAdi && x.soruNo === q);
          allRows.push({
            dersAdi: d.dersAdi,
            soruNo: q,
            bSoruNo: found?.bSoruNo ?? q,
            konuAdi: found?.konuAdi ?? '',
            kazanimKodu: found?.kazanimKodu ?? '',
            kazanimAciklamasi: found?.kazanimAciklamasi ?? '',
          });
        }
      }
      setKazanimItems(allRows);
      setBulkKazanimText('');
      setKazanimModalVisible(true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyBulkKazanim = () => {
    if (!bulkKazanimText.trim() || !kazanimSelectedLesson) return;
    const lines = bulkKazanimText.split(/\r?\n/).filter((l) => l.trim());
    const updated = [...kazanimItems];

    lines.forEach((line, idx) => {
      const parts = line.split(/[;\t]/).map((s) => s.trim());
      let qNo = idx + 1;
      let konu = parts[0] || '';
      let aciklama = parts[1] || '';

      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        qNo = parseInt(parts[0], 10);
        konu = parts[1] || '';
        aciklama = parts[2] || '';
      }

      const targetIdx = updated.findIndex((x) => x.dersAdi === kazanimSelectedLesson && x.soruNo === qNo);
      if (targetIdx !== -1 && konu) {
        updated[targetIdx] = {
          ...updated[targetIdx],
          konuAdi: konu,
          kazanimAciklamasi: aciklama || updated[targetIdx].kazanimAciklamasi,
        };
      }
    });

    setKazanimItems(updated);
    setBulkKazanimText('');
    showAlert('Uygulandı ✅', `${kazanimSelectedLesson} dersi için konu/kazanımlar tablodaki sorulara yerleştirildi.`);
  };

  const handleSaveKazanimlar = async () => {
    if (!kazanimExam) return;
    setActionLoading(true);
    try {
      const filled = kazanimItems.filter((x) => x.konuAdi && x.konuAdi.trim() !== '');
      const res = await apiRequest<any>(`Optik/exams/${kazanimExam.id}/kazanimlar`, 'POST', {
        items: filled,
      });
      if (res.success) {
        setKazanimModalVisible(false);
        showAlert('Başarılı ✅', res.data?.message || 'Konu ve kazanımlar kaydedildi.');
        loadInitialData();
      } else {
        showAlert('Hata', res.error || 'Kazanımlar kaydedilemedi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Sınav Cevap Anahtarları Eksiklik ve Karakter Sayısı Doğrulayıcı
  const validateExamAnswerKeys = (exam: any): { isValid: boolean; error?: string } => {
    if (!exam || !Array.isArray(exam.dersler) || exam.dersler.length === 0) {
      return { isValid: false, error: 'Sınava ait tanımlı ders bulunamadı.' };
    }
    const rawTurler = exam.kitapcikTurleri || 'A,B';
    const activeBooklets = rawTurler
      .split(',')
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean);
    if (activeBooklets.length === 0) activeBooklets.push('A');

    for (const d of exam.dersler) {
      const expected = Number(d.soruSayisi) || 0;
      if (expected <= 0) {
        return { isValid: false, error: `"${d.dersAdi}" dersinin soru sayısı geçerli değil (0 veya boş).` };
      }
      for (const b of activeBooklets) {
        const propName = `cevapAnahtari${b}`;
        const keyVal = String(d[propName] || '').trim();
        if (!keyVal) {
          return {
            isValid: false,
            error: `"${d.dersAdi}" dersi için ${b} kitapçığı cevap anahtarı girilmemiştir (${expected} karakter bekleniyor).\n\nLütfen önce sınavı düzenleyip cevap anahtarını kaydediniz.`,
          };
        }
        if (keyVal.length !== expected) {
          return {
            isValid: false,
            error: `"${d.dersAdi}" dersi ${b} kitapçığı için ${expected} soru tanımlanmış, ancak cevap anahtarında ${keyVal.length} karakter girilmiştir!\n\nEksik veya fazla karakter olduğu için optik okuma yapılamaz. Lütfen önce sınavı düzenleyip cevap anahtarını düzeltiniz.`,
          };
        }
      }
    }
    return { isValid: true };
  };

  // Optik Okuma Modalını Açma
  const handleOpenEvalModal = (exam: any) => {
    const val = validateExamAnswerKeys(exam);
    if (!val.isValid) {
      showAlert('Cevap Anahtarı Uyuşmazlığı ⚠️', val.error);
      return;
    }
    setEvalExam(exam);
    setEvalFormId(exam.optikFormId || forms[0]?.id || '');
    setEvalPreviewResults(null);
    setEvalFilterClassesEnabled(false);
    setEvalSelectedClasses([]);
    setEvalAvailableClasses([]);
    setEvalPreviewFilter('ALL');
    setEvalSearchQuery('');
    setEvalExcludedLines([]);
    setEvalRowOverrides({});
    setEvalDiagCounts({ unmatchedCount: 0, nameMismatchCount: 0, missingBookletCount: 0 });
    setEvalModalVisible(true);
  };

  const handlePickOpticalTxtFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];

      let text = '';
      if (Platform.OS === 'web' && (asset as any).file) {
        text = await readTextWithEncodingAutoDetect((asset as any).file);
      } else {
        const resp = await fetch(asset.uri);
        const buf = await resp.arrayBuffer();
        text = await readTextWithEncodingAutoDetect(buf);
      }
      setEvalTxtContent(text);
      setEvalExcludedLines([]);
      setEvalRowOverrides({});
    } catch (e: any) {
      showAlert('Dosya Okuma Hatası', e?.message || 'Optik dosya okunamadı.');
    }
  };

  // Okuldaki gerçek öğrencilerle tek tıkla örnek optik TXT verisi üretme (test için birkaç hatalı/kitapçıksız örnek de içerir)
  const handleGenerateSampleOpticalLines = async () => {
    if (!evalExam || !schoolId) return;
    setActionLoading(true);
    try {
      const stuRes = await apiRequest<any[]>(`schools/${schoolId}/students`, 'GET');
      const students = stuRes.success && Array.isArray(stuRes.data) && stuRes.data.length > 0
        ? stuRes.data.slice(0, 25)
        : [
            { studentNumber: '101', fullName: 'ALİ YILMAZ', grade: '9', section: 'A' },
            { studentNumber: '102', fullName: 'AYŞE DEMİR', grade: '9', section: 'A' },
            { studentNumber: '201', fullName: 'CAN YILDIZ', grade: '10', section: 'A' },
          ];

      const selectedForm = forms.find((f) => f.id === evalFormId) || forms[0];
      // Dosyada sütun numaraları 1'den başlar -> dizi indeksi (sütun - 1)
      const toIdx0 = (col1: number | undefined, def1: number) => {
        const val = col1 ?? def1;
        return val > 0 ? val - 1 : 0;
      };
      const numBas = toIdx0(selectedForm?.numaraBaslangic, 1);
      const numUz = selectedForm?.numaraUzunluk ?? 5;
      const adBas = toIdx0(selectedForm?.adSoyadBaslangic, 6);
      const adUz = selectedForm?.adSoyadUzunluk ?? 20;
      const sinifBas = toIdx0(selectedForm?.sinifBaslangic, 26);
      const sinifUz = selectedForm?.sinifUzunluk ?? 4;
      const kitBas = toIdx0(selectedForm?.kitapcikTuruBaslangic, 30);

      const options = ['A', 'B', 'C', 'D', 'E'];
      const generatedLines: string[] = [];

      students.forEach((st: any, idx: number) => {
        const lineArr = new Array(240).fill(' ');
        // Örnek olarak son öğrencide numara hatası, bir önceki öğrencide kitapçık boş bırakma simülasyonu
        const isUnmatchedDemo = idx === students.length - 1 && students.length > 4;
        const isMissingBookletDemo = idx === students.length - 2 && students.length > 4;

        const noStr = isUnmatchedDemo
          ? '99999'.slice(0, numUz)
          : String(st.studentNumber || idx + 1).padStart(numUz, '0').slice(0, numUz);
        for (let i = 0; i < noStr.length; i++) lineArr[numBas + i] = noStr[i];

        const nameStr = String(st.fullName || 'OGRENCI').toUpperCase().padEnd(adUz, ' ').slice(0, adUz);
        for (let i = 0; i < nameStr.length; i++) lineArr[adBas + i] = nameStr[i];

        if (sinifUz > 0) {
          const clsStr = `${st.grade || '9'}${st.section || 'A'}`.padEnd(sinifUz, ' ').slice(0, sinifUz);
          for (let i = 0; i < clsStr.length; i++) lineArr[sinifBas + i] = clsStr[i];
        }

        const booklet = isMissingBookletDemo ? ' ' : idx % 2 === 0 ? 'A' : 'B';
        lineArr[kitBas] = booklet;

        let currentCol0 = 30;
        (evalExam.dersler || []).forEach((d: any, dIdx: number) => {
          const formDers = selectedForm?.dersler?.[dIdx];
          const colStart0 = formDers?.baslangicSutun != null ? toIdx0(formDers.baslangicSutun, 31) : currentCol0;
          const qCount = d.soruSayisi || 20;
          const keyStr = (booklet === 'B' && d.cevapAnahtariB ? d.cevapAnahtariB : d.cevapAnahtariA) || 'ABCDABCDABCDABCDABCD';

          for (let q = 0; q < qCount; q++) {
            const correctChar = keyStr[q] || 'A';
            const roll = (idx * 7 + q * 3 + dIdx * 5) % 10;
            let ans = correctChar;
            if (roll === 8) ans = ' ';
            else if (roll === 9 || (idx % 4 === 3 && q % 3 === 0)) {
              ans = options[(options.indexOf(correctChar) + 1) % 4];
            }
            lineArr[colStart0 + q] = ans;
          }
          currentCol0 = colStart0 + qCount;
        });

        generatedLines.push(lineArr.join('').trimEnd());
      });

      setEvalTxtContent(generatedLines.join('\n'));
      setEvalExcludedLines([]);
      setEvalRowOverrides({});
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePreviewRowOverride = (
    lineIndex: number,
    patch: { ogrenciNo?: string; adSoyad?: string; sinif?: string; kitapcikTuru?: string }
  ) => {
    setEvalRowOverrides((prev) => {
      const existing = prev[lineIndex] || { lineIndex };
      return {
        ...prev,
        [lineIndex]: {
          ...existing,
          ...patch,
        },
      };
    });
    // Anlık görsel güncelleme
    setEvalPreviewResults((prev) =>
      prev
        ? prev.map((r) => {
            if (r.lineIndex !== lineIndex) return r;
            const nextKit = patch.kitapcikTuru !== undefined ? patch.kitapcikTuru : r.kitapcikTuru;
            const validKit = nextKit === 'A' || nextKit === 'B' || nextKit === 'C' || nextKit === 'D';
            return {
              ...r,
              ogrenciNo: patch.ogrenciNo !== undefined ? patch.ogrenciNo : r.ogrenciNo,
              adSoyad: patch.adSoyad !== undefined ? patch.adSoyad : r.adSoyad,
              sinif: patch.sinif !== undefined ? patch.sinif : r.sinif,
              kitapcikTuru: nextKit,
              hasMissingBooklet: !validKit,
            };
          })
        : prev
    );
  };

  const handleExcludePreviewLine = (lineIndex: number) => {
    setEvalExcludedLines((prev) => (prev.includes(lineIndex) ? prev : [...prev, lineIndex]));
    setEvalPreviewResults((prev) => (prev ? prev.filter((r) => r.lineIndex !== lineIndex) : prev));
  };

  const handleBulkExcludePreviewRows = (modeType: 'MISSING_BOOKLET' | 'UNMATCHED') => {
    if (!evalPreviewResults) return;
    const toExclude = evalPreviewResults
      .filter((r) => (modeType === 'MISSING_BOOKLET' ? r.hasMissingBooklet : !r.isMatchedInDb))
      .map((r) => r.lineIndex);

    if (toExclude.length === 0) {
      showAlert('Bilgi', 'Bu kriterde silinecek öğrenci satırı bulunmuyor.');
      return;
    }

    setEvalExcludedLines((prev) => Array.from(new Set([...prev, ...toExclude])));
    setEvalPreviewResults((prev) => (prev ? prev.filter((r) => !toExclude.includes(r.lineIndex)) : prev));
    showAlert(
      'Listeden Çıkarıldı 🗑️',
      `${toExclude.length} öğrenci değerlendirme listesinden çıkarıldı. Dilerseniz "Silinenleri Geri Al" ile geri alabilirsiniz.`
    );
  };

  // Öğrenci Kodlama & Detay Popup'ı Açma
  const handleOpenStudentDetailModal = (r: any) => {
    setEditingStudentRow(r);
    setTempStudentNo(String(r.ogrenciNo || ''));
    setTempStudentName(String(r.adSoyad || ''));
    setTempStudentClass(String(r.sinif || ''));
    setTempBooklet(r.kitapcikTuru && r.kitapcikTuru !== '?' ? r.kitapcikTuru : 'A');

    const ansMap: Record<string, string> = {};
    (r.dersSonuclari || []).forEach((ds: any) => {
      ansMap[ds.dersAdi] = ds.ogrenciCevaplari || '';
    });
    const existingOverride = evalRowOverrides[r.lineIndex];
    if (existingOverride?.dersCevaplari) {
      Object.assign(ansMap, existingOverride.dersCevaplari);
    }
    setTempRowAnswers(ansMap);
    setStudentDetailModalVisible(true);
  };

  const handleSaveStudentRowDetail = async () => {
    if (!editingStudentRow) return;
    const lineIndex = editingStudentRow.lineIndex;
    const patch = {
      lineIndex,
      ogrenciNo: tempStudentNo.trim(),
      adSoyad: tempStudentName.trim(),
      sinif: tempStudentClass.trim(),
      kitapcikTuru: tempBooklet,
      dersCevaplari: tempRowAnswers,
    };

    setEvalRowOverrides((prev) => ({
      ...prev,
      [lineIndex]: patch,
    }));

    setStudentDetailModalVisible(false);

    // Otomatik olarak yeni cevap ve kodlamalarla önizlemeyi yeniden değerlendir
    await handleRunEvaluation(false);
  };

  const handleRunEvaluation = async (
    saveResults: boolean,
    customExcludedLines?: number[],
    customSelectedClasses?: string[]
  ) => {
    if (!evalExam || !evalTxtContent.trim()) {
      showAlert('Uyarı', 'Lütfen optik veri satırlarını yükleyin veya yapıştırın.');
      return;
    }
    const val = validateExamAnswerKeys(evalExam);
    if (!val.isValid) {
      showAlert('Cevap Anahtarı Uyuşmazlığı ⚠️', val.error);
      return;
    }
    const activeClasses = customSelectedClasses ?? (evalFilterClassesEnabled ? evalSelectedClasses : []);
    if (evalFilterClassesEnabled && activeClasses.length === 0) {
      showAlert('Uyarı', '"Sadece Seçilen Şubeleri Değerlendir" aktif. Lütfen en az bir şube seçiniz.');
      return;
    }

    setActionLoading(true);
    try {
      const overridesList = Object.values(evalRowOverrides);
      const res = await apiRequest<any>('Optik/evaluate', 'POST', {
        sinavId: evalExam.id,
        formId: evalFormId || undefined,
        txtContent: evalTxtContent,
        saveResults,
        numarasizlariDahilEt: true,
        selectedClasses: evalFilterClassesEnabled && activeClasses.length > 0 ? activeClasses : undefined,
        excludedLineIndices: customExcludedLines ?? evalExcludedLines,
        rowOverrides: overridesList.length > 0 ? overridesList : undefined,
      });

      if (res.success && res.data) {
        setEvalPreviewResults(res.data.results || []);
        if (Array.isArray(res.data.availableClasses)) {
          setEvalAvailableClasses(res.data.availableClasses);
        }
        setEvalDiagCounts({
          unmatchedCount: res.data.unmatchedCount || 0,
          nameMismatchCount: res.data.nameMismatchCount || 0,
          missingBookletCount: res.data.missingBookletCount || 0,
        });
        if (saveResults) {
          showAlert('Değerlendirme Tamamlandı 🎯', res.data.message);
          setEvalModalVisible(false);
          setSelectedExamId(evalExam.id);
          setActiveSubTab('analytics');
          await loadInitialData();
          await loadExamAnalyticsAndResults(evalExam.id);
        }
      } else {
        showAlert('Değerlendirme Hatası', res.error || 'Optik veriler değerlendirilemedi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // =========================================================================
  // ÖĞRENCİ & VELİ GÖRÜNÜMÜ (mode === 'student')
  // =========================================================================
  if (mode === 'student') {
    return (
      <View style={styles.container}>
        <View style={styles.headerBanner}>
          <Text style={styles.headerBannerTitle}>🎯 Optik Deneme Sınavı Sonuçlarım & Kazanım Karnem</Text>
          <Text style={styles.headerBannerSub}>
            Okul idaresi tarafından açıklanan optik sınav sonuçlarınızı, netlerinizi ve konu bazlı eksik kazanımlarınızı buradan inceleyebilirsiniz.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 24 }} />
        ) : exams.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>Henüz açıklanan bir optik deneme sınavı bulunmuyor</Text>
            <Text style={styles.emptyCardSub}>
              Sınav sonuçları okul idaresi tarafından erişime açıldığında bu ekranda otomatik olarak listelenecektir.
            </Text>
          </View>
        ) : (
          exams.map((exam) => {
            const myRes = exam.myResult;
            return (
              <View key={exam.id} style={styles.examCard}>
                <View style={styles.examCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.examTitle}>{exam.sinavAdi}</Text>
                    <Text style={styles.examMeta}>
                      📅 {new Date(exam.uygulamaTarihi).toLocaleDateString('tr-TR')} ·{' '}
                      {exam.yanlisDogruyuGotururSayisi > 0
                        ? `${exam.yanlisDogruyuGotururSayisi} Yanlış 1 Doğruyu Götürür`
                        : 'Yanlış Doğruyu Götürmez'}
                    </Text>
                  </View>
                  {myRes && (
                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreBadgeLabel}>PUAN</Text>
                      <Text style={styles.scoreBadgeValue}>{myRes.puan}</Text>
                    </View>
                  )}
                </View>

                {myRes ? (
                  <>
                    <View style={styles.studentSummaryRow}>
                      <View style={styles.statMiniBox}>
                        <Text style={styles.statMiniVal}>{myRes.toplamDogru}</Text>
                        <Text style={[styles.statMiniLbl, { color: '#16A34A' }]}>Doğru</Text>
                      </View>
                      <View style={styles.statMiniBox}>
                        <Text style={styles.statMiniVal}>{myRes.toplamYanlis}</Text>
                        <Text style={[styles.statMiniLbl, { color: '#DC2626' }]}>Yanlış</Text>
                      </View>
                      <View style={styles.statMiniBox}>
                        <Text style={styles.statMiniVal}>{myRes.toplamBos}</Text>
                        <Text style={[styles.statMiniLbl, { color: '#64748B' }]}>Boş</Text>
                      </View>
                      <View style={[styles.statMiniBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                        <Text style={[styles.statMiniVal, { color: '#1D4ED8' }]}>{myRes.toplamNet}</Text>
                        <Text style={[styles.statMiniLbl, { color: '#1D4ED8' }]}>Toplam Net</Text>
                      </View>
                    </View>

                    {/* İdare Sıralamayı Açtıysa Dereceleri Göster */}
                    {exam.showRankingToStudents && myRes.okulSirasi ? (
                      <View style={styles.rankingRow}>
                        <View style={styles.rankChip}>
                          <Text style={styles.rankChipText}>
                            🏆 Okul Derecesi: {myRes.okulSirasi}. / {myRes.toplamKatilimci} Öğrenci
                          </Text>
                        </View>
                        <View style={[styles.rankChip, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                          <Text style={[styles.rankChipText, { color: '#15803D' }]}>
                            🥇 Sınıf ({myRes.sinif}) Derecesi: {myRes.sinifSirasi}. / {myRes.sinifKatilimci} Öğrenci
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Ders Bazlı Net Özeti */}
                    <View style={styles.lessonChipsRow}>
                      {(myRes.dersSonuclari || []).map((ds: any, i: number) => (
                        <View key={i} style={styles.lessonNetChip}>
                          <Text style={styles.lessonNetName}>{ds.dersAdi}</Text>
                          <Text style={styles.lessonNetDetail}>
                            {ds.dogruSayisi}D · {ds.yanlisSayisi}Y · <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>{ds.net} Net</Text>
                          </Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={styles.openReportBtn}
                      onPress={() => handleOpenStudentReport(exam.id, myRes.id || myRes.ogrenciNo)}
                    >
                      <Text style={styles.openReportBtnText}>📄 Detaylı Konu & Kazanım Karnemi Görüntüle ➔</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>
                    Bu sınavda öğrenci numaranızla eşleşen optik katılım kaydı bulunamadı.
                  </Text>
                )}
              </View>
            );
          })
        )}

        {renderStudentReportModal()}
      </View>
    );
  }

  // =========================================================================
  // DETAYLI ÖĞRENCİ KARNESİ MODALI (TÜM ROLLER İÇİN ORTAK)
  // =========================================================================
  function renderStudentReportModal() {
    const stu = reportModalData?.student;
    const ex = reportModalData?.exam;
    const lessons = reportModalData?.lessons || [];
    const kazanimlar = reportModalData?.kazanimAnalizi || [];

    return (
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { maxHeight: '92%' }]}>
            <View style={styles.modalTopBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLargeTitle}>🎓 Detaylı Sınav & Konu-Kazanım Karnesi</Text>
                <Text style={styles.modalLargeSub}>
                  {ex?.sinavAdi} · {stu?.adSoyad} (No: {stu?.ogrenciNo} · Sınıf: {stu?.sinif} · Kitapçık: {stu?.kitapcikTuru})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {reportModalData && (
                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}
                    onPress={() => printOptikStudentReportsPdf(ex, [reportModalData])}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>🖨️ PDF / Yazdır</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.closeBtn} onPress={() => setReportModalVisible(false)}>
                  <Text style={styles.closeBtnText}>✕ Kapat</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {stu && (
                <>
                  {/* Karne Üst Özet Kartları */}
                  <View style={styles.studentSummaryRow}>
                    <View style={styles.statMiniBox}>
                      <Text style={styles.statMiniVal}>{stu.puan}</Text>
                      <Text style={[styles.statMiniLbl, { color: '#7C3AED' }]}>Sınav Puanı</Text>
                    </View>
                    <View style={styles.statMiniBox}>
                      <Text style={styles.statMiniVal}>{stu.toplamNet}</Text>
                      <Text style={[styles.statMiniLbl, { color: '#1D4ED8' }]}>Öğrenci Net</Text>
                    </View>
                    <View style={styles.statMiniBox}>
                      <Text style={styles.statMiniVal}>{stu.sinifOrtalamaNet}</Text>
                      <Text style={styles.statMiniLbl}>Sınıf Ort. Net</Text>
                    </View>
                    <View style={styles.statMiniBox}>
                      <Text style={styles.statMiniVal}>{stu.okulOrtalamaNet}</Text>
                      <Text style={styles.statMiniLbl}>Okul Ort. Net</Text>
                    </View>
                    {stu.okulSirasi ? (
                      <View style={[styles.statMiniBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                        <Text style={[styles.statMiniVal, { color: '#B45309' }]}>
                          #{stu.okulSirasi}/{stu.toplamKatilimci}
                        </Text>
                        <Text style={[styles.statMiniLbl, { color: '#B45309' }]}>Okul Sırası</Text>
                      </View>
                    ) : null}
                    {stu.sinifSirasi ? (
                      <View style={[styles.statMiniBox, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
                        <Text style={[styles.statMiniVal, { color: '#15803D' }]}>
                          #{stu.sinifSirasi}/{stu.sinifKatilimci}
                        </Text>
                        <Text style={[styles.statMiniLbl, { color: '#15803D' }]}>Sınıf Sırası</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Ders Grubu Özet Kartları (Fen Bilimleri, Sosyal Bilimler vb.) */}
                  {Array.isArray(reportModalData?.grupOzetleri) && reportModalData.grupOzetleri.length > 0 && (
                    <View style={{ marginBottom: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>
                        🏷️ Ders Grubu Toplam Netleri:
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {reportModalData.grupOzetleri.map((grp: any, gIdx: number) => (
                          <View key={gIdx} style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F172A' }}>{grp.grupAdi}</Text>
                            <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                              {grp.dogruSayisi}D · {grp.yanlisSayisi}Y · <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>{grp.net} Net</Text> (%{grp.basariYuzdesi})
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Son Sınavların Karşılaştırmalı Sonuçları (Gelişim Takibi - karne örnek.pdf gibi) */}
                  {Array.isArray(reportModalData?.recentExams) && reportModalData.recentExams.length > 0 && (
                    <View style={{ marginBottom: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E3A8A', marginBottom: 6 }}>
                        📈 Son Sınavların Karşılaştırmalı Sonuçları (Gelişim Takibi)
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View>
                          <View style={{ flexDirection: 'row', backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderColor: '#BFDBFE', paddingVertical: 6, paddingHorizontal: 8 }}>
                            <Text style={{ width: 85, fontSize: 10, fontWeight: '800', color: '#1E3A8A' }}>Tarih</Text>
                            <Text style={{ width: 140, fontSize: 10, fontWeight: '800', color: '#1E3A8A' }}>Sınav Adı</Text>
                            <Text style={{ width: 80, fontSize: 10, fontWeight: '800', color: '#1D4ED8', textAlign: 'center' }}>Toplam Net</Text>
                            <Text style={{ width: 70, fontSize: 10, fontWeight: '800', color: '#7C3AED', textAlign: 'center' }}>Puan</Text>
                            <Text style={{ width: 70, fontSize: 10, fontWeight: '800', color: '#B45309', textAlign: 'center' }}>Okul Sıra</Text>
                          </View>
                          {reportModalData.recentExams.map((re: any, reIdx: number) => (
                            <View key={reIdx} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E2E8F0', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: reIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                              <Text style={{ width: 85, fontSize: 10, color: '#475569' }}>
                                {re.uygulamaTarihi ? new Date(re.uygulamaTarihi).toLocaleDateString('tr-TR') : '-'}
                              </Text>
                              <Text style={{ width: 140, fontSize: 10, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                                {re.sinavAdi}
                              </Text>
                              <Text style={{ width: 80, fontSize: 11, fontWeight: '800', color: '#1D4ED8', textAlign: 'center' }}>
                                {re.toplamNet}
                              </Text>
                              <Text style={{ width: 70, fontSize: 11, fontWeight: '800', color: '#7C3AED', textAlign: 'center' }}>
                                {re.puan}
                              </Text>
                              <Text style={{ width: 70, fontSize: 10, fontWeight: '700', color: '#B45309', textAlign: 'center' }}>
                                {re.okulSirasi ? `#${re.okulSirasi}` : '-'}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* 1. Ders Bazlı Karşılaştırma ve Cevap Anahtarı Şeridi */}
                  <Text style={styles.sectionHeading}>📚 Ders Bazlı Performans & Soru Cevap Anahtarı</Text>
                  {lessons.map((l: any, idx: number) => (
                    <View key={idx} style={styles.reportLessonBox}>
                      <View style={styles.reportLessonHeader}>
                        <Text style={styles.reportLessonTitle}>
                          {l.dersAdi}
                          {l.dersGrubu ? <Text style={{ fontSize: 11, fontWeight: '600', color: '#6366F1' }}> ({l.dersGrubu})</Text> : null}
                        </Text>
                        <Text style={styles.reportLessonStats}>
                          {l.dogruSayisi}D · {l.yanlisSayisi}Y · {l.bosSayisi}B ·{' '}
                          <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>{l.net} Net</Text> (Sınıf Ort: {l.sinifOrtalamaNet} · Okul Ort: {l.okulOrtalamaNet})
                        </Text>
                      </View>

                      {/* Başarı Çubuğu */}
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, l.basariYuzdesi)}%`,
                              backgroundColor: l.basariYuzdesi >= 75 ? '#10B981' : l.basariYuzdesi >= 50 ? '#3B82F6' : '#EF4444',
                            },
                          ]}
                        />
                      </View>

                      {/* Soru Soru Optik Şerit */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {(l.sorular || []).map((q: any) => {
                            const bg =
                              q.durum === 'DOGRU'
                                ? '#DCFCE7'
                                : q.durum === 'YANLIS'
                                ? '#FEE2E2'
                                : '#F1F5F9';
                            const fg =
                              q.durum === 'DOGRU'
                                ? '#15803D'
                                : q.durum === 'YANLIS'
                                ? '#DC2626'
                                : '#64748B';
                            return (
                              <View key={q.soruNo} style={[styles.qCell, { backgroundColor: bg }]}>
                                <Text style={styles.qCellNum}>{q.soruNo}</Text>
                                <Text style={[styles.qCellAns, { color: fg }]}>{q.ogrenciCevabi}</Text>
                                <Text style={styles.qCellKey}>{q.dogruCevap}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  ))}

                  {/* Soru Bazlı Konu ve Doğru/Öğrenci Cevabı Tablosu (karne örnek.pdf Sayfa 2 gibi) */}
                  {(() => {
                    const qList: any[] = [];
                    lessons.forEach((l: any) => {
                      (l.sorular || []).forEach((q: any) => {
                        if (q.konuAdi || q.kazanimAciklamasi) {
                          qList.push({ ...q, dersAdi: l.dersAdi });
                        }
                      });
                    });
                    if (qList.length === 0) return null;

                    return (
                      <View style={{ marginBottom: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E3A8A', marginBottom: 6 }}>
                          📋 Soru Bazlı Konu & Doğru / Öğrenci Cevabı Analizi
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View>
                            <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: '#CBD5E1' }}>
                              <Text style={{ width: 35, fontSize: 9.5, fontWeight: '800', textAlign: 'center' }}>No</Text>
                              <Text style={{ width: 110, fontSize: 9.5, fontWeight: '800' }}>Ders</Text>
                              <Text style={{ width: 220, fontSize: 9.5, fontWeight: '800' }}>Konu / Kazanım</Text>
                              <Text style={{ width: 35, fontSize: 9.5, fontWeight: '800', textAlign: 'center' }}>DC</Text>
                              <Text style={{ width: 35, fontSize: 9.5, fontWeight: '800', textAlign: 'center' }}>ÖC</Text>
                              <Text style={{ width: 45, fontSize: 9.5, fontWeight: '800', textAlign: 'center' }}>Durum</Text>
                            </View>
                            {qList.map((qr: any, qIdx: number) => {
                              const isCorr = qr.durum === 'DOGRU';
                              const isWrn = qr.durum === 'YANLIS';
                              const bg = isCorr ? '#DCFCE7' : isWrn ? '#FEE2E2' : '#F1F5F9';
                              const fg = isCorr ? '#15803D' : isWrn ? '#DC2626' : '#64748B';
                              const icon = isCorr ? '✔' : isWrn ? '✘' : '-';
                              return (
                                <View key={qIdx} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#F1F5F9', paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center' }}>
                                  <Text style={{ width: 35, fontSize: 9, textAlign: 'center', fontWeight: '700' }}>{qr.soruNo}</Text>
                                  <Text style={{ width: 110, fontSize: 9, fontWeight: '600', color: '#334155' }} numberOfLines={1}>{qr.dersAdi}</Text>
                                  <Text style={{ width: 220, fontSize: 9, color: '#0F172A' }} numberOfLines={1}>{qr.konuAdi || qr.kazanimAciklamasi}</Text>
                                  <Text style={{ width: 35, fontSize: 9.5, textAlign: 'center', fontWeight: '800' }}>{qr.dogruCevap}</Text>
                                  <Text style={{ width: 35, fontSize: 9.5, textAlign: 'center', fontWeight: '800', color: fg }}>{qr.ogrenciCevabi}</Text>
                                  <View style={{ width: 45, alignItems: 'center' }}>
                                    <View style={{ backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 }}>
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: fg }}>{icon}</Text>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    );
                  })()}

                  {/* 2. Konu & Kazanım Analizi Tablosu */}
                  <Text style={styles.sectionHeading}>🎯 Konu ve Kazanım Bazlı Başarı Analizi</Text>
                  {kazanimlar.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyCardSub}>
                        Bu sınav için henüz soru-konu/kazanım eşleştirmesi tanımlanmamış. İdare veya öğretmen panelinden kazanımlar eklendiğinde burada otomatik konu analizi görüntülenir.
                      </Text>
                    </View>
                  ) : (
                    kazanimlar.map((k: any, i: number) => {
                      const badgeBg =
                        k.basariYuzdesi >= 75 ? '#DCFCE7' : k.basariYuzdesi >= 50 ? '#FEF3C7' : '#FEE2E2';
                      const badgeFg =
                        k.basariYuzdesi >= 75 ? '#15803D' : k.basariYuzdesi >= 50 ? '#B45309' : '#DC2626';

                      return (
                        <View key={i} style={styles.kazanimRowCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.kazanimTopicTitle}>
                              [{k.dersAdi}] {k.konuAdi}
                            </Text>
                            {k.kazanimAciklamasi ? (
                              <Text style={styles.kazanimDescText}>{k.kazanimAciklamasi}</Text>
                            ) : null}
                            <Text style={styles.kazanimCountsText}>
                              Toplam {k.toplamSoru} Soru: {k.dogruSayisi} Doğru · {k.yanlisSayisi} Yanlış · {k.bosSayisi} Boş
                            </Text>
                          </View>
                          <View style={[styles.badge, { backgroundColor: badgeBg, alignSelf: 'center' }]}>
                            <Text style={[styles.badgeText, { color: badgeFg }]}>
                              %{k.basariYuzdesi} ({k.durum})
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // =========================================================================
  // ÖĞRENCİ OPTİK KODLAMA & DETAY DÜZENLEME MODALI (POPUP)
  // =========================================================================
  function renderStudentDetailModal() {
    if (!studentDetailModalVisible || !editingStudentRow || !evalExam) return null;

    const row = editingStudentRow;
    const lessons = evalExam.dersler || [];

    return (
      <Modal
        visible={studentDetailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setStudentDetailModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { maxWidth: 780, maxHeight: '92%' }]}>
            <View style={styles.modalTopBar}>
              <View>
                <Text style={styles.modalLargeTitle}>
                  ✏️ Öğrenci Kodlama & Detay Düzenleme
                </Text>
                <Text style={styles.modalLargeSub}>
                  Satır #{Number(row.lineIndex ?? 0) + 1} · {row.adSoyad || 'Öğrenci'} ({row.sinif || 'Şubesiz'})
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setStudentDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10, paddingRight: 4 }}>
              {/* Orijinal Optik Satır */}
              <View style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                  📄 Orijinal Optik TXT Satırı:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11.5, color: '#0F172A' }}>
                    {row.orijinalSatir || 'Satır verisi bulunamadı.'}
                  </Text>
                </ScrollView>
              </View>

              {/* Öğrenci Temel Bilgileri */}
              <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E3A8A', marginBottom: 8 }}>
                  👤 Öğrenci Kimlik ve Kitapçık Bilgileri
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ width: 110 }}>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '700' }}>Öğrenci No</Text>
                    <TextInput
                      style={[styles.textInput, { marginTop: 4 }]}
                      value={tempStudentNo}
                      onChangeText={setTempStudentNo}
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '700' }}>Ad Soyad</Text>
                    <TextInput
                      style={[styles.textInput, { marginTop: 4 }]}
                      value={tempStudentName}
                      onChangeText={setTempStudentName}
                    />
                  </View>

                  <View style={{ width: 90 }}>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '700' }}>Sınıf / Şube</Text>
                    <TextInput
                      style={[styles.textInput, { marginTop: 4 }]}
                      value={tempStudentClass}
                      onChangeText={setTempStudentClass}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '700' }}>Kitapçık Türü</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {['A', 'B', 'C', 'D'].map((bType) => {
                        const isSel = tempBooklet === bType;
                        return (
                          <TouchableOpacity
                            key={bType}
                            style={[
                              styles.bookletPickBtn,
                              isSel && styles.bookletPickBtnActive,
                              { minWidth: 34, height: 34 },
                            ]}
                            onPress={() => setTempBooklet(bType)}
                          >
                            <Text style={[styles.bookletPickBtnText, isSel && { color: '#FFFFFF' }]}>
                              {bType}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {row.dbStudentName && row.isNameMismatch && (
                  <View style={{ marginTop: 8, padding: 6, backgroundColor: '#FFF7ED', borderRadius: 6, borderWidth: 1, borderColor: '#FDBA74' }}>
                    <Text style={{ fontSize: 11, color: '#C2410C', fontWeight: '600' }}>
                      ℹ️ Sistemdeki Kayıtlı Öğrenci: {row.dbStudentName} ({row.dbStudentClass || 'Şubesiz'})
                    </Text>
                  </View>
                )}
              </View>

              {/* Ders Ders Kodlamalar ve Karşılaştırma */}
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                🔑 Ders Kodlamaları ve Cevap Anahtarı Karşılaştırması ({tempBooklet} Kitapçığı)
              </Text>

              {lessons.map((d: any, dIdx: number) => {
                const qCount = d.soruSayisi || 20;
                const activeKey = (
                  tempBooklet === 'B' ? d.cevapAnahtariB :
                  tempBooklet === 'C' ? d.cevapAnahtariC :
                  tempBooklet === 'D' ? d.cevapAnahtariD :
                  d.cevapAnahtariA
                ) || d.cevapAnahtariA || '';

                const studentAns = tempRowAnswers[d.dersAdi] ?? (
                  row.dersSonuclari?.find((ds: any) => ds.dersAdi === d.dersAdi)?.ogrenciCevaplari || ''
                );

                return (
                  <View
                    key={dIdx}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>
                        {d.siraNo || dIdx + 1}. {d.dersAdi} ({qCount} Soru)
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        Karakter: {studentAns.length} / {qCount}
                      </Text>
                    </View>

                    {/* Cevap Anahtarı Gösterimi */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857', width: 140 }}>
                        Cevap Anahtarı ({tempBooklet}):
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, fontWeight: '700', color: '#047857', letterSpacing: 2 }}>
                          {activeKey || '(Tanımsız)'}
                        </Text>
                      </ScrollView>
                    </View>

                    {/* Öğrenci Kodlaması Düzenleme */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8', marginBottom: 2 }}>
                        Öğrenci Kodlaması (Düzenlenebilir):
                      </Text>
                      <TextInput
                        style={[
                          styles.textInput,
                          {
                            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                            fontSize: 12,
                            letterSpacing: 2,
                            paddingVertical: 6,
                          },
                        ]}
                        value={studentAns}
                        autoCapitalize="characters"
                        maxLength={qCount}
                        placeholder={`${qCount} soru kodlamasını giriniz...`}
                        onChangeText={(text) => {
                          const up = text.toUpperCase();
                          setTempRowAnswers((prev) => ({
                            ...prev,
                            [d.dersAdi]: up,
                          }));
                        }}
                      />
                    </View>

                    {/* Soru Soru Karşılaştırma Kutucukları */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 3 }}>
                        {Array.from({ length: qCount }).map((_, qIdx) => {
                          const keyChar = activeKey[qIdx] || ' ';
                          const stuChar = studentAns[qIdx] || ' ';
                          const isBlank = stuChar === ' ' || stuChar === '*' || stuChar === '-' || !stuChar;
                          const isCorrect = !isBlank && (keyChar === 'H' || stuChar === keyChar);
                          const isCancel = keyChar === 'X';

                          let bg = '#F1F5F9';
                          let fg = '#64748B';
                          let border = '#CBD5E1';
                          if (isCancel) {
                            bg = '#E0E7FF'; fg = '#4338CA'; border = '#A5B4FC';
                          } else if (isCorrect) {
                            bg = '#DCFCE7'; fg = '#15803D'; border = '#86EFAC';
                          } else if (!isBlank) {
                            bg = '#FEE2E2'; fg = '#DC2626'; border = '#FCA5A5';
                          }

                          return (
                            <View
                              key={qIdx}
                              style={{
                                width: 26,
                                paddingVertical: 3,
                                alignItems: 'center',
                                backgroundColor: bg,
                                borderWidth: 1,
                                borderColor: border,
                                borderRadius: 4,
                              }}
                            >
                              <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }}>{qIdx + 1}</Text>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: fg }}>{stuChar === ' ' ? '-' : stuChar}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}
            </ScrollView>

            {/* Sabit Footer Butonları */}
            <View style={[styles.modalBtnRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10, marginTop: 6 }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setStudentDetailModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { minWidth: 200 }]}
                onPress={handleSaveStudentRowDetail}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>💾 Kaydet & Sonucu Güncelle</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // =========================================================================
  // ÖĞRETMEN VE ADMİN GÖRÜNÜMÜ (mode === 'admin' | mode === 'teacher')
  // =========================================================================
  const uniqueClasses = Array.from(new Set(examResults.map((r) => r.sinif).filter(Boolean))).sort();

  // Sınavdaki derslerin sıralı listesini belirle
  const activeExamObj = exams.find((e) => e.id === selectedExamId) || examResultsMeta;
  const examLessonNames: string[] = React.useMemo(() => {
    const fromMeta = (examResultsMeta?.dersler || activeExamObj?.dersler || [])
      .map((d: any) => d.dersAdi)
      .filter(Boolean);
    if (fromMeta.length > 0) return Array.from(new Set(fromMeta));
    const set = new Set<string>();
    examResults.forEach((r) => {
      (r.dersSonuclari || []).forEach((ds: any) => {
        if (ds.dersAdi) set.add(ds.dersAdi);
      });
    });
    return Array.from(set);
  }, [examResultsMeta, activeExamObj, examResults]);

  const examLessonGroupMap = React.useMemo(() => {
    const map = new Map<string, string>();
    const dersler = examResultsMeta?.dersler || activeExamObj?.dersler || [];
    dersler.forEach((d: any) => {
      if (d.dersAdi && d.dersGrubu) {
        map.set(d.dersAdi, d.dersGrubu);
      }
    });
    if (map.size === 0) {
      examResults.forEach((r) => {
        (r.dersSonuclari || []).forEach((ds: any) => {
          if (ds.dersAdi && ds.dersGrubu) {
            map.set(ds.dersAdi, ds.dersGrubu);
          }
        });
      });
    }
    return map;
  }, [examResultsMeta, activeExamObj, examResults]);

  const multiLessonGroups = React.useMemo(() => {
    const groupLessonsMap = new Map<string, string[]>();
    examLessonNames.forEach((lName) => {
      const grp = examLessonGroupMap.get(lName);
      if (grp && grp.trim()) {
        const list = groupLessonsMap.get(grp) || [];
        list.push(lName);
        groupLessonsMap.set(grp, list);
      }
    });
    const result = new Map<string, string[]>();
    groupLessonsMap.forEach((lessons, grp) => {
      if (lessons.length >= 2) {
        result.set(grp, lessons);
      }
    });
    return result;
  }, [examLessonNames, examLessonGroupMap]);

  const getStudentGroupNet = React.useCallback((student: any, grpName: string) => {
    const gLessons = multiLessonGroups.get(grpName) || [];
    let total = 0;
    gLessons.forEach((ln) => {
      const ds = findLessonResultForStudent(student, ln);
      if (ds) total += Number(ds.net) || 0;
    });
    return Math.round(total * 100) / 100;
  }, [multiLessonGroups]);

  const getStudentGroupCorrect = React.useCallback((student: any, grpName: string) => {
    const gLessons = multiLessonGroups.get(grpName) || [];
    let total = 0;
    gLessons.forEach((ln) => {
      const ds = findLessonResultForStudent(student, ln);
      if (ds) total += Number(ds.dogruSayisi) || 0;
    });
    return total;
  }, [multiLessonGroups]);

  const getStudentGroupWrong = React.useCallback((student: any, grpName: string) => {
    const gLessons = multiLessonGroups.get(grpName) || [];
    let total = 0;
    gLessons.forEach((ln) => {
      const ds = findLessonResultForStudent(student, ln);
      if (ds) total += Number(ds.yanlisSayisi) || 0;
    });
    return total;
  }, [multiLessonGroups]);

  const filteredResults = examResults.filter((r) => {
    if (classFilter !== 'ALL' && r.sinif !== classFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        String(r.adSoyad || '').toLowerCase().includes(q) ||
        String(r.ogrenciNo || '').toLowerCase().includes(q) ||
        String(r.sinif || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleToggleSort = (field: string, defaultDir: 'asc' | 'desc' = 'desc') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection(defaultDir);
    }
  };

  const sortedResults = React.useMemo(() => {
    const arr = [...filteredResults];
    const dir = sortDirection === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortField === 'score') {
        const diff = (Number(a.puan) || 0) - (Number(b.puan) || 0);
        if (diff !== 0) return diff * dir;
        return ((Number(a.toplamNet) || 0) - (Number(b.toplamNet) || 0)) * dir;
      }
      if (sortField === 'totalNet') {
        return ((Number(a.toplamNet) || 0) - (Number(b.toplamNet) || 0)) * dir;
      }
      if (sortField === 'totalCorrect') {
        return ((Number(a.toplamDogru) || 0) - (Number(b.toplamDogru) || 0)) * dir;
      }
      if (sortField === 'totalWrong') {
        return ((Number(a.toplamYanlis) || 0) - (Number(b.toplamYanlis) || 0)) * dir;
      }
      if (sortField === 'name') {
        return String(a.adSoyad || '').localeCompare(String(b.adSoyad || ''), 'tr') * dir;
      }
      if (sortField === 'studentNo') {
        const nA = parseInt(String(a.ogrenciNo || '').replace(/\D/g, ''), 10);
        const nB = parseInt(String(b.ogrenciNo || '').replace(/\D/g, ''), 10);
        if (!isNaN(nA) && !isNaN(nB) && nA !== nB) return (nA - nB) * dir;
        return String(a.ogrenciNo || '').localeCompare(String(b.ogrenciNo || ''), 'tr') * dir;
      }
      if (sortField === 'class') {
        const cCmp = String(a.sinif || '').localeCompare(String(b.sinif || ''), 'tr', { numeric: true });
        if (cCmp !== 0) return cCmp * dir;
        return ((Number(b.puan) || 0) - (Number(a.puan) || 0));
      }
      if (sortField.startsWith('lessonNet:')) {
        const lName = sortField.slice('lessonNet:'.length);
        const dA = findLessonResultForStudent(a, lName)?.net ?? 0;
        const dB = findLessonResultForStudent(b, lName)?.net ?? 0;
        return (Number(dA) - Number(dB)) * dir;
      }
      if (sortField.startsWith('lessonCorrect:')) {
        const lName = sortField.slice('lessonCorrect:'.length);
        const dA = findLessonResultForStudent(a, lName)?.dogruSayisi ?? 0;
        const dB = findLessonResultForStudent(b, lName)?.dogruSayisi ?? 0;
        return (Number(dA) - Number(dB)) * dir;
      }
      if (sortField.startsWith('groupNet:')) {
        const gName = sortField.slice('groupNet:'.length);
        const netA = getStudentGroupNet(a, gName);
        const netB = getStudentGroupNet(b, gName);
        return (Number(netA) - Number(netB)) * dir;
      }
      if (sortField.startsWith('groupCorrect:')) {
        const gName = sortField.slice('groupCorrect:'.length);
        const corA = getStudentGroupCorrect(a, gName);
        const corB = getStudentGroupCorrect(b, gName);
        return (Number(corA) - Number(corB)) * dir;
      }
      return 0;
    });
    return arr;
  }, [filteredResults, sortField, sortDirection]);

  const getSortDescription = () => {
    const dirLbl = sortDirection === 'asc' ? 'Artan ↑' : 'Azalan ↓';
    if (sortField === 'score') return `Puana Göre (${dirLbl})`;
    if (sortField === 'totalNet') return `Toplam Nete Göre (${dirLbl})`;
    if (sortField === 'totalCorrect') return `Toplam Doğruya Göre (${dirLbl})`;
    if (sortField === 'totalWrong') return `Toplam Yanlışa Göre (${dirLbl})`;
    if (sortField === 'name') return `Ada Göre (${dirLbl})`;
    if (sortField === 'studentNo') return `Öğrenci Numarasına Göre (${dirLbl})`;
    if (sortField === 'class') return `Sınıfa / Şubeye Göre (${dirLbl})`;
    if (sortField.startsWith('lessonNet:')) return `${sortField.slice(10)} Netine Göre (${dirLbl})`;
    if (sortField.startsWith('lessonCorrect:')) return `${sortField.slice(14)} Doğrusuna Göre (${dirLbl})`;
    if (sortField.startsWith('groupNet:')) return `[${sortField.slice(9)}] Grup Netine Göre (${dirLbl})`;
    if (sortField.startsWith('groupCorrect:')) return `[${sortField.slice(13)}] Grup Doğrusuna Göre (${dirLbl})`;
    return dirLbl;
  };

  // Canlı örnek satır önizlemesi (Optik Form Sihirbazı için - Dosyada sütun numaraları 1'den başlar, kodda indeks 0'dan başlar)
  const sampleLine = editingForm.sampleLine || '';
  const slicePreview = (startCol1Based: number, len: number) => {
    if (!sampleLine || len <= 0) return '-';
    const startIdx0 = startCol1Based > 0 ? startCol1Based - 1 : 0;
    if (startIdx0 < 0 || startIdx0 >= sampleLine.length) return '(boş)';
    return sampleLine.substring(startIdx0, startIdx0 + len) || '(boş)';
  };

  return (
    <View style={styles.container}>
      {/* Üst Sekme Çubuğu */}
      {mode === 'admin' ? (
        <View style={styles.subTabBar}>
          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'exams' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('exams')}
          >
            <Text style={[styles.subTabText, activeSubTab === 'exams' && styles.subTabTextActive]}>
              📝 Optik Sınavlar & Okuma ({exams.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'forms' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('forms')}
          >
            <Text style={[styles.subTabText, activeSubTab === 'forms' && styles.subTabTextActive]}>
              📋 Optik Form Şablonları ({forms.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'analytics' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('analytics')}
          >
            <Text style={[styles.subTabText, activeSubTab === 'analytics' && styles.subTabTextActive]}>
              📊 Sonuçlar, Karneler & İstatistikler
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.headerBanner}>
          <Text style={styles.headerBannerTitle}>🎯 Branş & Sınıf Optik Sınav Analizlerim</Text>
          <Text style={styles.headerBannerSub}>
            Derse girdiğiniz şubelerin optik sınav sonuçlarını, soru zorluk/çeldirici analizlerini ve tekrar edilmesi gereken kazanımları inceleyebilirsiniz.
          </Text>
        </View>
      )}

      {/* 1. ADMİN: OPTİK SINAVLAR VE OKUMA SEKMESİ */}
      {mode === 'admin' && activeSubTab === 'exams' && (
        <View>
          <View style={styles.topActionBar}>
            <Text style={styles.sectionHeading}>📝 Tanımlı Optik Sınavlar</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setEditingExam({
                  id: undefined,
                  sinavAdi: `${new Date().getFullYear()} Kurumsal Deneme Sınavı - ${exams.length + 1}`,
                  sinavTuru: 'SERBEST',
                  bagliTytSinavId: null,
                  varsayilanTytPuani: 150,
                  uygulamaTarihi: new Date().toISOString().slice(0, 10),
                  yanlisDogruyuGotururSayisi: 4,
                  hedefSiniflar: '',
                  kitapcikTurleri: 'A,B',
                  optikFormId: forms[0]?.id || '',
                  tabanPuan: 0,
                  toplamPuan: 0,
                  isPublishedToStudents: false,
                  showRankingToStudents: false,
                  isVisibleToTeachers: true,
                  hasKazanimAnalysis: false,
                  dersler: [
                    { dersAdi: 'Türk Dili ve Edebiyatı', soruSayisi: 20, katsayi: 1.0, siraNo: 1, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
                    { dersAdi: 'Matematik', soruSayisi: 20, katsayi: 1.0, siraNo: 2, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
                    { dersAdi: 'Fizik', soruSayisi: 10, katsayi: 1.0, siraNo: 3, cevapAnahtariA: 'ABCDABCDAB', cevapAnahtariB: 'BCDABCDABA' },
                  ],
                });
                setExamModalVisible(true);
              }}
            >
              <Text style={styles.primaryBtnText}>+ Yeni Optik Sınav Oluştur</Text>
            </TouchableOpacity>
          </View>

          {exams.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardTitle}>Henüz tanımlı bir optik sınav bulunmuyor</Text>
              <Text style={styles.emptyCardSub}>
                "+ Yeni Optik Sınav Oluştur" butonuna tıklayarak cevap anahtarlarını tanımlayabilir ve optik TXT dosyasını okutabilirsiniz.
              </Text>
            </View>
          ) : (
            exams.map((exam) => (
              <View key={exam.id} style={styles.examCard}>
                <View style={styles.examCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.examTitle}>{exam.sinavAdi}</Text>
                      <View
                        style={{
                          backgroundColor:
                            exam.sinavTuru === 'TYT'
                              ? '#DBEAFE'
                              : exam.sinavTuru === 'AYT'
                              ? '#F3E8FF'
                              : exam.sinavTuru === 'LGS'
                              ? '#FEF3C7'
                              : '#E2E8F0',
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color:
                              exam.sinavTuru === 'TYT'
                                ? '#1D4ED8'
                                : exam.sinavTuru === 'AYT'
                                ? '#6D28D9'
                                : exam.sinavTuru === 'LGS'
                                ? '#B45309'
                                : '#334155',
                          }}
                        >
                          {exam.sinavTuru === 'SERBEST' || !exam.sinavTuru
                            ? 'SERBEST (Sadece Net)'
                            : exam.sinavTuru}
                        </Text>
                      </View>
                      {exam.sinavTuru === 'AYT' && (
                        <View
                          style={{
                            backgroundColor: '#EEF2FF',
                            borderWidth: 1,
                            borderColor: '#C7D2FE',
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#3730A3' }}>
                            🔗 Bağlı TYT: {exam.bagliTytSinavAdi || 'Seçilmedi'} · Girilmeyen TYT Taban: {exam.varsayilanTytPuani ?? 150} Puan
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.examMeta}>
                      📅 {new Date(exam.uygulamaTarihi).toLocaleDateString('tr-TR')} · 👥 Katılımcı: {exam.participantCount} Öğrenci · 📈 Ort. Net: {exam.averageNet}
                      {exam.sinavTuru && exam.sinavTuru !== 'SERBEST' ? ` · 🏆 Ort. Puan: ${exam.averageScore}` : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={[styles.smallActionBtn, { backgroundColor: '#2563EB' }]}
                      onPress={() => handleOpenEvalModal(exam)}
                    >
                      <Text style={[styles.smallActionBtnText, { color: '#FFF' }]}>🎯 Optik TXT Okut</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}
                      onPress={() => downloadAnswerKeyExcelTemplate(exam)}
                    >
                      <Text style={[styles.smallActionBtnText, { color: '#166534' }]}>🔑 Cevap Anahtarı</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { backgroundColor: '#F3E8FF', borderColor: '#D8B4FE' }]}
                      onPress={() => handleOpenKazanimModal(exam)}
                    >
                      <Text style={[styles.smallActionBtnText, { color: '#7E22CE' }]}>
                        📑 Kazanımlar ({exam.kazanimCount || 0})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                      onPress={() => {
                        setSelectedExamId(exam.id);
                        setActiveSubTab('analytics');
                      }}
                    >
                      <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>📊 Sonuç & Analiz</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}
                      onPress={() => {
                        setEditingExam({
                          ...exam,
                          sinavTuru: exam.sinavTuru || 'SERBEST',
                          bagliTytSinavId: exam.bagliTytSinavId || null,
                          varsayilanTytPuani: exam.varsayilanTytPuani ?? 150,
                          uygulamaTarihi: new Date(exam.uygulamaTarihi).toISOString().slice(0, 10),
                        });
                        setExamModalVisible(true);
                      }}
                    >
                      <Text style={[styles.smallActionBtnText, { color: '#334155' }]}>✏️ Düzenle</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                      onPress={() => handleDeleteExam(exam)}
                    >
                      <Text style={[styles.smallActionBtnText, { color: '#DC2626' }]}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 3 Temel Görünürlük ve Yetki Anahtarı */}
                <View style={styles.visibilityBar}>
                  <View style={styles.visibilitySwitchItem}>
                    <Text style={styles.visibilityLabel}>🎓 Öğrenci & Veliye Açık</Text>
                    <Switch
                      value={!!exam.isPublishedToStudents}
                      onValueChange={(v) => handleToggleVisibility(exam, 'isPublishedToStudents', v)}
                    />
                  </View>

                  <View style={styles.visibilitySwitchItem}>
                    <Text style={styles.visibilityLabel}>🏆 Öğrenciye Sıralama/Derece Göster</Text>
                    <Switch
                      value={!!exam.showRankingToStudents}
                      onValueChange={(v) => handleToggleVisibility(exam, 'showRankingToStudents', v)}
                    />
                  </View>

                  <View style={styles.visibilitySwitchItem}>
                    <Text style={styles.visibilityLabel}>👨‍🏫 Öğretmenlere Açık (Branş/Sınıf İzole)</Text>
                    <Switch
                      value={!!exam.isVisibleToTeachers}
                      onValueChange={(v) => handleToggleVisibility(exam, 'isVisibleToTeachers', v)}
                    />
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* 2. ADMİN: OPTİK FORM ŞABLONLARI SEKMESİ */}
      {mode === 'admin' && activeSubTab === 'forms' && (
        <View>
          <View style={styles.topActionBar}>
            <Text style={styles.sectionHeading}>📋 Optik Form Koordinat Şablonları (Sütun No 1'den Başlar)</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                const defLine = '00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD';
                setEditingForm({
                  id: undefined,
                  formAdi: `Optik Form Şablonu - ${forms.length + 1}`,
                  numaraBaslangic: 1,
                  numaraUzunluk: 5,
                  adSoyadBaslangic: 6,
                  adSoyadUzunluk: 20,
                  sinifBaslangic: 26,
                  sinifUzunluk: 4,
                  kitapcikTuruBaslangic: 30,
                  kitapcikTuruUzunluk: 1,
                  sampleLine: defLine,
                  dersler: [
                    { dersAdi: 'Türk Dili ve Edebiyatı', baslangicSutun: 31, karakterSayisi: 20, siraNo: 1 },
                    { dersAdi: 'Matematik', baslangicSutun: 51, karakterSayisi: 20, siraNo: 2 },
                  ],
                });
                setWizardSampleLines([defLine]);
                setWizardActiveLineIdx(0);
                setWizardCursorCol(1);
                setWizardSelLen(1);
                setWizardRangeAnchorCol(null);
                setParsedFmtFields([]);
                setFormModalVisible(true);
              }}
            >
              <Text style={styles.primaryBtnText}>+ Yeni Optik Form Şablonu</Text>
            </TouchableOpacity>
          </View>

          {forms.map((f) => (
            <View key={f.id} style={styles.examCard}>
              <View style={styles.examCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examTitle}>{f.formAdi}</Text>
                  <Text style={styles.examMeta}>
                    Öğrenci No: Sütun {f.numaraBaslangic}..{f.numaraBaslangic + f.numaraUzunluk - 1} ({f.numaraUzunluk} hane) ·{' '}
                    {f.adSoyadAyriMi
                      ? `Ad: Sütun ${f.adSoyadBaslangic}..${f.adSoyadBaslangic + f.adSoyadUzunluk - 1} · Soyad: Sütun ${f.soyadBaslangic}..${(f.soyadBaslangic || 1) + (f.soyadUzunluk || 10) - 1} (Ayrı Alanlar)`
                      : `Ad Soyad: Sütun ${f.adSoyadBaslangic}..${f.adSoyadBaslangic + f.adSoyadUzunluk - 1} (${f.adSoyadUzunluk} hane, Tek Alan)`}{' '}
                    · Sınıf: {f.sinifUzunluk > 0 ? `Sütun ${f.sinifBaslangic}..${f.sinifBaslangic + f.sinifUzunluk - 1}` : 'Yok'} · Kitapçık: Sütun {f.kitapcikTuruBaslangic ?? '-'}
                  </Text>
                  <View style={styles.lessonChipsRow}>
                    {(f.dersler || []).map((d: any, i: number) => (
                      <View key={i} style={styles.lessonNetChip}>
                        <Text style={styles.lessonNetName}>{d.dersAdi}</Text>
                        <Text style={styles.lessonNetDetail}>
                          Sütun: {d.baslangicSutun}..{d.baslangicSutun + d.karakterSayisi - 1} ({d.karakterSayisi} Soru)
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                    onPress={() => {
                      setEditingForm(f);
                      setWizardSampleLines([f.sampleLine || '00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD']);
                      setWizardActiveLineIdx(0);
                      setWizardCursorCol(1);
                      setWizardSelLen(1);
                      setWizardRangeAnchorCol(null);
                      setParsedFmtFields([]);
                      setFormModalVisible(true);
                    }}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>✏️ Düzenle</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                    onPress={() => handleDeleteForm(f)}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#DC2626' }]}>🗑️ Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 3. SONUÇLAR, KARNELER VE GÖRSEL İSTATİSTİKLER (ADMİN & ÖĞRETMEN) */}
      {(activeSubTab === 'analytics' || mode === 'teacher') && (
        <View>
          {/* Sınav Seçici Şerit */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {exams.map((ex) => {
              const isSel = selectedExamId === ex.id;
              return (
                <TouchableOpacity
                  key={ex.id}
                  style={[styles.examSelectorChip, isSel && styles.examSelectorChipActive]}
                  onPress={() => setSelectedExamId(ex.id)}
                >
                  <Text style={[styles.examSelectorChipText, isSel && { color: '#FFFFFF' }]}>
                    🎯 {ex.sinavAdi} ({ex.participantCount} Öğr.)
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!selectedExamId ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardTitle}>İncelenecek bir optik sınav seçiniz</Text>
            </View>
          ) : (
            <>
              {/* Alt Görünüm Seçici */}
              <View style={styles.analyticsSwitchRow}>
                <TouchableOpacity
                  style={[styles.analyticsSwitchBtn, analyticsTab === 'results' && styles.analyticsSwitchBtnActive]}
                  onPress={() => setAnalyticsTab('results')}
                >
                  <Text style={[styles.analyticsSwitchText, analyticsTab === 'results' && { color: '#1D4ED8' }]}>
                    🏆 Öğrenci Sonuçları & Karneler ({examResults.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.analyticsSwitchBtn, analyticsTab === 'charts' && styles.analyticsSwitchBtnActive]}
                  onPress={() => setAnalyticsTab('charts')}
                >
                  <Text style={[styles.analyticsSwitchText, analyticsTab === 'charts' && { color: '#1D4ED8' }]}>
                    📊 Okul & Şube Başarı Grafikleri
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.analyticsSwitchBtn, analyticsTab === 'questions' && styles.analyticsSwitchBtnActive]}
                  onPress={() => setAnalyticsTab('questions')}
                >
                  <Text style={[styles.analyticsSwitchText, analyticsTab === 'questions' && { color: '#1D4ED8' }]}>
                    🔬 Soru, Çeldirici & Kazanım Analizi
                  </Text>
                </TouchableOpacity>
              </View>

              {actionLoading ? (
                <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 24 }} />
              ) : analyticsTab === 'results' ? (
                /* A. DETAYLI ÖĞRENCİ SONUÇ TABLOSU (DERS DERS D/Y/NET, SIRALAMA, EXCEL/PDF, TOPLU KARNE & ÖĞRENCİ SİLME) */
                <View style={styles.examCard}>
                  {/* 1. Arama & Sınıf Filtre Çubuğu */}
                  <View style={styles.filterBar}>
                    <TextInput
                      style={[styles.textInput, { flex: 1, minWidth: 200 }]}
                      placeholder="🔍 Öğrenci adı, numarası veya sınıf ara..."
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <TouchableOpacity
                        style={[styles.classFilterChip, classFilter === 'ALL' && styles.classFilterChipActive]}
                        onPress={() => setClassFilter('ALL')}
                      >
                        <Text style={[styles.classFilterText, classFilter === 'ALL' && { color: '#FFF' }]}>
                          Tüm Sınıflar ({examResults.length})
                        </Text>
                      </TouchableOpacity>
                      {uniqueClasses.map((cls) => {
                        const clsCount = examResults.filter((x) => x.sinif === cls).length;
                        return (
                          <TouchableOpacity
                            key={cls}
                            style={[styles.classFilterChip, classFilter === cls && styles.classFilterChipActive]}
                            onPress={() => setClassFilter(cls)}
                          >
                            <Text style={[styles.classFilterText, classFilter === cls && { color: '#FFF' }]}>
                              {cls} ({clsCount})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* 2. Sıralama Seçenekleri Şeridi (Çok Satırlı Flex) */}
                  <View style={styles.sortToolbarBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 2 }}>
                      <Ionicons name="swap-vertical" size={14} color="#475569" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569' }}>Sırala:</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', flex: 1 }}>
                      {[
                        { key: 'score', label: '🏆 Puana Göre', defDir: 'desc' as const },
                        { key: 'totalNet', label: '📈 Toplam Nete Göre', defDir: 'desc' as const },
                        { key: 'totalCorrect', label: '✅ Toplam Doğruya Göre', defDir: 'desc' as const },
                        { key: 'name', label: '🔤 Ada Göre (A-Z)', defDir: 'asc' as const },
                        { key: 'class', label: '🏫 Sınıfa Göre', defDir: 'asc' as const },
                        { key: 'studentNo', label: '🔢 Numaraya Göre', defDir: 'asc' as const },
                      ].map((sp) => {
                        const active = sortField === sp.key;
                        return (
                          <TouchableOpacity
                            key={sp.key}
                            style={[styles.sortPill, active && styles.sortPillActive]}
                            onPress={() => handleToggleSort(sp.key, sp.defDir)}
                          >
                            <Text style={[styles.sortPillText, active && { color: '#FFF' }]}>
                              {sp.label} {active ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Çoklu Ders Grupları İçin Grup Neti Sıralama Butonları */}
                      {Array.from(multiLessonGroups.keys()).map((gName) => {
                        const gNetKey = `groupNet:${gName}`;
                        const activeGNet = sortField === gNetKey;
                        return (
                          <TouchableOpacity
                            key={gNetKey}
                            style={[
                              styles.sortPill,
                              { backgroundColor: activeGNet ? '#0284C7' : '#F0F9FF', borderColor: activeGNet ? '#0369A1' : '#BAE6FD' },
                            ]}
                            onPress={() => handleToggleSort(gNetKey, 'desc')}
                          >
                            <Text style={[styles.sortPillText, { color: activeGNet ? '#FFF' : '#0369A1', fontWeight: '800' }]}>
                              ⚡ [{gName}] Grup Neti {activeGNet ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}

                      {examLessonNames.map((lName) => {
                        const netKey = `lessonNet:${lName}`;
                        const corKey = `lessonCorrect:${lName}`;
                        const activeNet = sortField === netKey;
                        const activeCor = sortField === corKey;
                        const grp = examLessonGroupMap.get(lName);
                        const prefix = grp ? `[${grp}] ` : '';
                        return (
                          <React.Fragment key={lName}>
                            <TouchableOpacity
                              style={[styles.sortPill, activeNet && styles.sortPillActive]}
                              onPress={() => handleToggleSort(netKey, 'desc')}
                            >
                              <Text style={[styles.sortPillText, activeNet && { color: '#FFF' }]}>
                                📚 {prefix}{lName} (Net) {activeNet ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.sortPill, activeCor && styles.sortPillActive]}
                              onPress={() => handleToggleSort(corKey, 'desc')}
                            >
                              <Text style={[styles.sortPillText, activeCor && { color: '#FFF' }]}>
                                ✅ {prefix}{lName} (D) {activeCor ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                              </Text>
                            </TouchableOpacity>
                          </React.Fragment>
                        );
                      })}
                    </View>
                  </View>

                  {/* 3. Toplu Dışa Aktarım (Excel, PDF Liste, Toplu Karne PDF) ve Toplu Silme Çubuğu */}
                  <View style={styles.exportActionBar}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                      📋 Gösterilen: <Text style={{ color: '#1D4ED8', fontWeight: '800' }}>{sortedResults.length} Öğrenci</Text>
                      {selectedResultIds.length > 0 ? ` · Seçili: ${selectedResultIds.length} Öğrenci` : ''}
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}
                        onPress={() =>
                          exportOptikResultsToExcel(
                            activeExamObj?.sinavAdi || 'Optik Sınav',
                            sortedResults,
                            examLessonNames
                          )
                        }
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#047857' }]}>
                          📊 Sonuç Listesi Excel (.xlsx)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}
                        onPress={() =>
                          printOptikResultsTablePdf(
                            activeExamObj?.sinavAdi || 'Optik Sınav',
                            activeExamObj?.uygulamaTarihi
                              ? new Date(activeExamObj.uygulamaTarihi).toLocaleDateString('tr-TR')
                              : '-',
                            classFilter === 'ALL' ? 'Tüm Sınıflar' : `${classFilter} Şubesi`,
                            getSortDescription(),
                            sortedResults,
                            examLessonNames
                          )
                        }
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>
                          🖨️ Sonuç Listesi PDF
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#F5F3FF', borderColor: '#C4B5FD' }]}
                        onPress={() => handleBulkExportReportCardsPdf(sortedResults)}
                        disabled={actionLoading}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#6D28D9' }]}>
                          📑 {selectedResultIds.length > 0
                            ? `Seçili (${selectedResultIds.length}) Karneyi PDF Al`
                            : `Filtrelenen (${sortedResults.length}) Karneyi PDF Al`}
                        </Text>
                      </TouchableOpacity>

                      {mode === 'admin' && selectedResultIds.length > 0 && (
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
                          onPress={() =>
                            handleDeleteResultsFromExam(
                              selectedResultIds,
                              `Seçilen ${selectedResultIds.length} öğrenci`
                            )
                          }
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#DC2626' }]}>
                            🗑️ Seçilenleri Sil ({selectedResultIds.length})
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* 4. Zengin Ders Bazlı (D / Y / Net) Sonuç Tablosu */}
                  {sortedResults.length === 0 ? (
                    <Text style={{ padding: 16, color: '#64748B', textAlign: 'center' }}>
                      Bu kriterlere uygun değerlendirilmiş öğrenci sonucu bulunamadı.
                    </Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ marginTop: 6 }}>
                      <View>
                        {/* TABLO ÜST BAŞLIK SATIRI 1 (DERS GRUPLARI) */}
                        <View style={styles.tableHeaderRowTop}>
                          <TouchableOpacity
                            style={[styles.tCell, { width: 36, alignItems: 'center', justifyContent: 'center' }]}
                            onPress={() => {
                              const allFilteredIds = sortedResults.map((r) => r.id).filter(Boolean);
                              const allSelected =
                                allFilteredIds.length > 0 &&
                                allFilteredIds.every((id) => selectedResultIds.includes(id));
                              if (allSelected) {
                                setSelectedResultIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
                              } else {
                                setSelectedResultIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
                              }
                            }}
                          >
                            <Text style={styles.tHeaderText}>
                              {sortedResults.length > 0 &&
                              sortedResults.every((r) => selectedResultIds.includes(r.id))
                                ? '☑️'
                                : '⬜'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.tCell, { width: 54 }]}
                            onPress={() => handleToggleSort('score', 'desc')}
                          >
                            <Text style={styles.tHeaderText}>Okul</Text>
                            <Text style={styles.tHeaderSubText}>Sıra</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.tCell, { width: 54 }]}
                            onPress={() => handleToggleSort('class', 'asc')}
                          >
                            <Text style={styles.tHeaderText}>Sınıf</Text>
                            <Text style={styles.tHeaderSubText}>Sıra</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.tCell, { width: 72 }]}
                            onPress={() => handleToggleSort('studentNo', 'asc')}
                          >
                            <Text style={styles.tHeaderText}>
                              Öğr. No {sortField === 'studentNo' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.tCell, { width: 170, alignItems: 'flex-start', paddingLeft: 8 }]}
                            onPress={() => handleToggleSort('name', 'asc')}
                          >
                            <Text style={styles.tHeaderText}>
                              Ad Soyad {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.tCell, { width: 64 }]}
                            onPress={() => handleToggleSort('class', 'asc')}
                          >
                            <Text style={styles.tHeaderText}>
                              Sınıf {sortField === 'class' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                            </Text>
                          </TouchableOpacity>

                          <View style={[styles.tCell, { width: 42 }]}>
                            <Text style={styles.tHeaderText}>Kit.</Text>
                          </View>

                          {/* Her Ders İçin 3 Sütunluk (D / Y / Net) Başlık Grubu ve Çoklu Gruplar İçin Grup Toplam Sütunu */}
                          {examLessonNames.map((lName) => {
                            const grp = examLessonGroupMap.get(lName);
                            const isMulti = grp && multiLessonGroups.has(grp);
                            const isLastInGroup = isMulti && multiLessonGroups.get(grp)![multiLessonGroups.get(grp)!.length - 1] === lName;

                            return (
                              <React.Fragment key={lName}>
                                <View style={[styles.tLessonGroupHeader, { width: 126 }]}>
                                  <TouchableOpacity
                                    onPress={() => handleToggleSort(`lessonNet:${lName}`, 'desc')}
                                    style={{ paddingVertical: 2, alignItems: 'center' }}
                                  >
                                    {grp ? (
                                      <Text style={{ fontSize: 9, color: '#93C5FD', fontWeight: '800' }} numberOfLines={1}>
                                        {grp}
                                      </Text>
                                    ) : null}
                                    <Text style={styles.tLessonGroupTitle} numberOfLines={1}>
                                      {lName}
                                    </Text>
                                  </TouchableOpacity>
                                  <View style={styles.tLessonSubRow}>
                                    <TouchableOpacity
                                      style={[styles.tSubCell, { width: 38 }]}
                                      onPress={() => handleToggleSort(`lessonCorrect:${lName}`, 'desc')}
                                    >
                                      <Text style={[styles.tSubHeaderText, { color: '#15803D' }]}>
                                        D{sortField === `lessonCorrect:${lName}` ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                      </Text>
                                    </TouchableOpacity>
                                    <View style={[styles.tSubCell, { width: 38 }]}>
                                      <Text style={[styles.tSubHeaderText, { color: '#DC2626' }]}>Y</Text>
                                    </View>
                                    <TouchableOpacity
                                      style={[styles.tSubCell, { width: 50, backgroundColor: '#DBEAFE' }]}
                                      onPress={() => handleToggleSort(`lessonNet:${lName}`, 'desc')}
                                    >
                                      <Text style={[styles.tSubHeaderText, { color: '#1D4ED8', fontWeight: '900' }]}>
                                        Net{sortField === `lessonNet:${lName}` ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>

                                {/* Ders Grubunun Son Dersi İse: Grup Toplam Sütunu */}
                                {isLastInGroup && (
                                  <View style={[styles.tLessonGroupHeader, { width: 136, backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}>
                                    <TouchableOpacity
                                      onPress={() => handleToggleSort(`groupNet:${grp}`, 'desc')}
                                      style={{ paddingVertical: 2, alignItems: 'center' }}
                                    >
                                      <Text style={{ fontSize: 9, color: '#1D4ED8', fontWeight: '900' }}>⚡ GRUP TOPLAM</Text>
                                      <Text style={[styles.tLessonGroupTitle, { color: '#1E3A8A' }]} numberOfLines={1}>
                                        {grp}
                                      </Text>
                                    </TouchableOpacity>
                                    <View style={styles.tLessonSubRow}>
                                      <TouchableOpacity
                                        style={[styles.tSubCell, { width: 42 }]}
                                        onPress={() => handleToggleSort(`groupCorrect:${grp}`, 'desc')}
                                      >
                                        <Text style={[styles.tSubHeaderText, { color: '#15803D' }]}>
                                          D{sortField === `groupCorrect:${grp}` ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                        </Text>
                                      </TouchableOpacity>
                                      <View style={[styles.tSubCell, { width: 42 }]}>
                                        <Text style={[styles.tSubHeaderText, { color: '#DC2626' }]}>Y</Text>
                                      </View>
                                      <TouchableOpacity
                                        style={[styles.tSubCell, { width: 52, backgroundColor: '#DBEAFE' }]}
                                        onPress={() => handleToggleSort(`groupNet:${grp}`, 'desc')}
                                      >
                                        <Text style={[styles.tSubHeaderText, { color: '#1D4ED8', fontWeight: '900' }]}>
                                          Net{sortField === `groupNet:${grp}` ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                )}
                              </React.Fragment>
                            );
                          })}

                          {/* TOPLAM GRUBU (Top. D / Y / B / Net) */}
                          <View style={[styles.tLessonGroupHeader, { width: 176, backgroundColor: '#DCFCE7' }]}>
                            <TouchableOpacity
                              onPress={() => handleToggleSort('totalNet', 'desc')}
                              style={{ paddingVertical: 3, alignItems: 'center' }}
                            >
                              <Text style={[styles.tLessonGroupTitle, { color: '#166534' }]}>GENEL TOPLAM</Text>
                            </TouchableOpacity>
                            <View style={styles.tLessonSubRow}>
                              <TouchableOpacity
                                style={[styles.tSubCell, { width: 40 }]}
                                onPress={() => handleToggleSort('totalCorrect', 'desc')}
                              >
                                <Text style={[styles.tSubHeaderText, { color: '#15803D' }]}>
                                  D{sortField === 'totalCorrect' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.tSubCell, { width: 40 }]}
                                onPress={() => handleToggleSort('totalWrong', 'desc')}
                              >
                                <Text style={[styles.tSubHeaderText, { color: '#DC2626' }]}>
                                  Y{sortField === 'totalWrong' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </Text>
                              </TouchableOpacity>
                              <View style={[styles.tSubCell, { width: 38 }]}>
                                <Text style={[styles.tSubHeaderText, { color: '#64748B' }]}>B</Text>
                              </View>
                              <TouchableOpacity
                                style={[styles.tSubCell, { width: 58, backgroundColor: '#BFDBFE' }]}
                                onPress={() => handleToggleSort('totalNet', 'desc')}
                              >
                                <Text style={[styles.tSubHeaderText, { color: '#1E3A8A', fontWeight: '900' }]}>
                                  Net{sortField === 'totalNet' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={[styles.tCell, { width: 92, backgroundColor: '#F3E8FF' }]}
                            onPress={() => handleToggleSort('score', 'desc')}
                          >
                            <Text style={[styles.tHeaderText, { color: '#6D28D9' }]}>
                              PUAN {sortField === 'score' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                            </Text>
                          </TouchableOpacity>

                          <View style={[styles.tCell, { width: mode === 'admin' ? 115 : 80 }]}>
                            <Text style={styles.tHeaderText}>İşlemler</Text>
                          </View>
                        </View>

                        {/* ÖĞRENCİ SATIRLARI */}
                        {sortedResults.map((r, rIdx) => {
                          const isChecked = selectedResultIds.includes(r.id);
                          return (
                            <View
                              key={r.id || rIdx}
                              style={[
                                styles.tableDataRow,
                                { backgroundColor: isChecked ? '#EFF6FF' : rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' },
                              ]}
                            >
                              <TouchableOpacity
                                style={[styles.tDataCell, { width: 36 }]}
                                onPress={() => {
                                  setSelectedResultIds((prev) =>
                                    prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                                  );
                                }}
                              >
                                <Text style={{ fontSize: 13 }}>{isChecked ? '☑️' : '⬜'}</Text>
                              </TouchableOpacity>

                              <View style={[styles.tDataCell, { width: 54 }]}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8' }}>
                                  #{r.okulSirasi ?? rIdx + 1}
                                </Text>
                              </View>

                              <View style={[styles.tDataCell, { width: 54 }]}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>
                                  #{r.sinifSirasi ?? '-'}
                                </Text>
                              </View>

                              <View style={[styles.tDataCell, { width: 72 }]}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                                  {r.ogrenciNo}
                                </Text>
                              </View>

                              <View style={[styles.tDataCell, { width: 170, alignItems: 'flex-start', paddingHorizontal: 8 }]}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
                                  {r.adSoyad}
                                </Text>
                              </View>

                              <View style={[styles.tDataCell, { width: 64 }]}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{r.sinif}</Text>
                              </View>

                              <View style={[styles.tDataCell, { width: 42 }]}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>
                                  {r.kitapcikTuru}
                                </Text>
                              </View>

                              {/* Ders Ders D / Y / Net Hücreleri ve Çoklu Gruplar İçin Grup Toplam Hücreleri */}
                              {examLessonNames.map((lName) => {
                                const ds = findLessonResultForStudent(r, lName);
                                const grp = examLessonGroupMap.get(lName);
                                const isMulti = grp && multiLessonGroups.has(grp);
                                const isLastInGroup = isMulti && multiLessonGroups.get(grp)![multiLessonGroups.get(grp)!.length - 1] === lName;

                                return (
                                  <React.Fragment key={lName}>
                                    <View style={{ flexDirection: 'row', width: 126 }}>
                                      <View style={[styles.tDataCell, { width: 38 }]}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>
                                          {ds?.dogruSayisi ?? 0}
                                        </Text>
                                      </View>
                                      <View style={[styles.tDataCell, { width: 38 }]}>
                                        <Text style={{ fontSize: 11, color: '#DC2626' }}>
                                          {ds?.yanlisSayisi ?? 0}
                                        </Text>
                                      </View>
                                      <View style={[styles.tDataCell, { width: 50, backgroundColor: '#F0F9FF' }]}>
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#1D4ED8' }}>
                                          {ds?.net ?? 0}
                                        </Text>
                                      </View>
                                    </View>

                                    {/* Grup Toplam Hücreleri */}
                                    {isLastInGroup && (
                                      <View style={{ flexDirection: 'row', width: 136, backgroundColor: '#F0F9FF', borderRightWidth: 1, borderRightColor: '#BAE6FD' }}>
                                        <View style={[styles.tDataCell, { width: 42 }]}>
                                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D' }}>
                                            {getStudentGroupCorrect(r, grp)}
                                          </Text>
                                        </View>
                                        <View style={[styles.tDataCell, { width: 42 }]}>
                                          <Text style={{ fontSize: 11, color: '#DC2626' }}>
                                            {getStudentGroupWrong(r, grp)}
                                          </Text>
                                        </View>
                                        <View style={[styles.tDataCell, { width: 52, backgroundColor: '#E0F2FE' }]}>
                                          <Text style={{ fontSize: 11, fontWeight: '900', color: '#0284C7' }}>
                                            {getStudentGroupNet(r, grp)}
                                          </Text>
                                        </View>
                                      </View>
                                    )}
                                  </React.Fragment>
                                );
                              })}

                              {/* Genel Toplam D / Y / B / Net Hücreleri */}
                              <View style={{ flexDirection: 'row', width: 176 }}>
                                <View style={[styles.tDataCell, { width: 40 }]}>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803D' }}>
                                    {r.toplamDogru}
                                  </Text>
                                </View>
                                <View style={[styles.tDataCell, { width: 40 }]}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                                    {r.toplamYanlis}
                                  </Text>
                                </View>
                                <View style={[styles.tDataCell, { width: 38 }]}>
                                  <Text style={{ fontSize: 11, color: '#64748B' }}>{r.toplamBos}</Text>
                                </View>
                                <View style={[styles.tDataCell, { width: 58, backgroundColor: '#EFF6FF' }]}>
                                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#1D4ED8' }}>
                                    {r.toplamNet}
                                  </Text>
                                </View>
                              </View>

                              {/* Puan Hücresi */}
                              <View style={[styles.tDataCell, { width: 92, backgroundColor: '#FAF5FF' }]}>
                                <Text style={{ fontSize: 12, fontWeight: '900', color: '#6D28D9' }}>
                                  {(activeExamObj?.sinavTuru || 'SERBEST').toUpperCase() === 'SERBEST'
                                    ? 'Sadece Net'
                                    : r.puan}
                                </Text>
                                {(activeExamObj?.sinavTuru || '').toUpperCase().startsWith('AYT') &&
                                  r.tytPuan !== undefined &&
                                  r.tytPuan !== null && (
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: '700',
                                        color: r.tytGirildiMi ? '#1D4ED8' : '#B45309',
                                        marginTop: 1,
                                      }}
                                    >
                                      TYT: {r.tytPuan}
                                      {r.tytGirildiMi ? '' : ' (Taban)'}
                                    </Text>
                                  )}
                              </View>

                              {/* İşlem Butonları (Karne & Sil) */}
                              <View
                                style={[
                                  styles.tDataCell,
                                  {
                                    width: mode === 'admin' ? 115 : 80,
                                    flexDirection: 'row',
                                    gap: 4,
                                    justifyContent: 'center',
                                  },
                                ]}
                              >
                                <TouchableOpacity
                                  style={styles.karneBtn}
                                  onPress={() => handleOpenStudentReport(selectedExamId, r.id || r.ogrenciNo)}
                                >
                                  <Text style={styles.karneBtnText}>📄 Karne</Text>
                                </TouchableOpacity>

                                {mode === 'admin' && (
                                  <TouchableOpacity
                                    style={styles.deleteRowMiniBtn}
                                    onPress={() =>
                                      handleDeleteResultsFromExam(
                                        [r.id],
                                        `'${r.adSoyad} (${r.ogrenciNo})'`
                                      )
                                    }
                                  >
                                    <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '800' }}>🗑️</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                </View>
              ) : analyticsTab === 'charts' && examStats ? (
                /* B. OKUL VE ŞUBE GÖRSEL BAŞARI GRAFİKLERİ */
                <View>
                  {/* 1. Genel KPI Kartları */}
                  <View style={styles.studentSummaryRow}>
                    <View style={styles.statMiniBox}>
                      <Text style={styles.statMiniVal}>{examStats.schoolSummary?.participantCount}</Text>
                      <Text style={styles.statMiniLbl}>Katılımcı (%{examStats.schoolSummary?.participationRate})</Text>
                    </View>
                    <View style={styles.statMiniBox}>
                      <Text style={[styles.statMiniVal, { color: '#1D4ED8' }]}>{examStats.schoolSummary?.averageNet}</Text>
                      <Text style={styles.statMiniLbl}>Ortalama Net</Text>
                    </View>
                    <View style={styles.statMiniBox}>
                      <Text style={[styles.statMiniVal, { color: '#7C3AED' }]}>{examStats.schoolSummary?.averageScore}</Text>
                      <Text style={styles.statMiniLbl}>Ortalama Puan</Text>
                    </View>
                    <View style={styles.statMiniBox}>
                      <Text style={[styles.statMiniVal, { color: '#16A34A' }]}>{examStats.schoolSummary?.maxScore}</Text>
                      <Text style={styles.statMiniLbl}>En Yüksek Puan</Text>
                    </View>
                  </View>

                  {/* 2. Puan Dağılım Grafiği */}
                  <View style={styles.examCard}>
                    <Text style={styles.sectionHeading}>📈 Puan Aralığı Dağılım Grafiği</Text>
                    {(examStats.schoolSummary?.scoreDistribution || []).map((b: any, i: number) => {
                      const total = Math.max(1, examStats.schoolSummary?.participantCount || 1);
                      const pct = Math.round((b.count * 100) / total);
                      return (
                        <View key={i} style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>{b.label}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: b.color }}>
                              {b.count} Öğrenci (%{pct})
                            </Text>
                          </View>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: b.color }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* 3. Ders Bazında Başarı Ortalamaları */}
                  <View style={styles.examCard}>
                    <Text style={styles.sectionHeading}>📚 Ders Bazında Başarı Yüzdesi & Net Ortalamaları</Text>
                    {(examStats.lessonAverages || []).map((la: any, i: number) => (
                      <View key={i} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                            {la.dersAdi} ({la.soruSayisi} Soru)
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D4ED8' }}>
                            Ort: {la.ortalamaNet} Net ({la.ortalamaDogru}D / {la.ortalamaYanlis}Y) · Başarı: %{la.basariYuzdesi}
                          </Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.min(100, la.basariYuzdesi)}%`,
                                backgroundColor:
                                  la.basariYuzdesi >= 70 ? '#10B981' : la.basariYuzdesi >= 45 ? '#3B82F6' : '#EF4444',
                              },
                            ]}
                          />
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* 4. Şubeler Arası Karşılaştırma Grafiği */}
                  <View style={styles.examCard}>
                    <Text style={styles.sectionHeading}>🏫 Sınıf / Şube Karşılaştırmalı Başarı Analizi</Text>
                    {(examStats.classComparisons || []).map((cc: any, i: number) => {
                      const pct = Math.min(100, Math.round((cc.ortalamaPuan / 500) * 100));
                      return (
                        <View key={i} style={styles.classCompareRow}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                              🏫 {cc.sinif} Şubesi ({cc.katilimciSayisi} Öğrenci)
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D4ED8' }}>
                              Ort. Net: {cc.ortalamaNet} · Ort. Puan: {cc.ortalamaPuan}
                            </Text>
                          </View>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: '#6366F1' }]} />
                          </View>
                          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                            🥇 Şube Birincisi: {cc.birinciOgrenci}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : analyticsTab === 'questions' && examStats ? (
                /* C. SORU ZORLUK İNDEKSİ, ÇELDİRİCİ & KONU-KAZANIM ANALİZİ */
                <View>
                  {/* 1. En Çok Fire Verilen Konu ve Kazanımlar */}
                  <View style={styles.examCard}>
                    <Text style={styles.sectionHeading}>🎯 Konu & Kazanım Başarı Özeti (Öncelikli Tekrar Konuları)</Text>
                    {(examStats.topicSummaries || []).length === 0 ? (
                      <Text style={{ fontSize: 12, color: '#64748B' }}>
                        Bu sınav için henüz konu/kazanım eşleştirmesi girilmemiştir.
                      </Text>
                    ) : (
                      (examStats.topicSummaries || []).map((t: any, i: number) => (
                        <View key={i} style={styles.kazanimRowCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.kazanimTopicTitle}>
                              [{t.dersAdi}] {t.konuAdi}
                            </Text>
                            {t.kazanimAciklamasi ? (
                              <Text style={styles.kazanimDescText}>{t.kazanimAciklamasi}</Text>
                            ) : null}
                            <Text style={styles.kazanimCountsText}>
                              Doğru: {t.toplamDogru} · Yanlış: {t.toplamYanlis} · Boş: {t.toplamBos}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor:
                                  t.basariYuzdesi >= 75 ? '#DCFCE7' : t.basariYuzdesi >= 50 ? '#FEF3C7' : '#FEE2E2',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                {
                                  color:
                                    t.basariYuzdesi >= 75 ? '#15803D' : t.basariYuzdesi >= 50 ? '#B45309' : '#DC2626',
                                },
                              ]}
                            >
                              %{t.basariYuzdesi} · {t.durum}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  {/* 2. Ders Ders Soru Zorluk ve Şık (Çeldirici) Dağılımı */}
                  <View style={styles.examCard}>
                    <Text style={styles.sectionHeading}>🔬 Soru Zorluk İndeksi ve Çeldirici (Şık) Analizi</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      {(examStats.lessonItemAnalyses || []).map((la: any) => (
                        <TouchableOpacity
                          key={la.dersAdi}
                          style={[
                            styles.classFilterChip,
                            selectedQuestionLesson === la.dersAdi && styles.classFilterChipActive,
                          ]}
                          onPress={() => setSelectedQuestionLesson(la.dersAdi)}
                        >
                          <Text
                            style={[
                              styles.classFilterText,
                              selectedQuestionLesson === la.dersAdi && { color: '#FFF' },
                            ]}
                          >
                            {la.dersAdi}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {(
                      examStats.lessonItemAnalyses?.find((x: any) => x.dersAdi === selectedQuestionLesson)?.sorular ||
                      examStats.lessonItemAnalyses?.[0]?.sorular ||
                      []
                    ).map((q: any) => {
                      const totalStudents = (Number(q.dogruSayisi) || 0) + (Number(q.yanlisSayisi) || 0) + (Number(q.bosSayisi) || 0);
                      const pctDogru = Number(q.dogruYuzdesi) || 0;
                      const pctYanlis = totalStudents > 0 ? Math.round(((Number(q.yanlisSayisi) || 0) * 1000) / totalStudents) / 10 : 0;
                      const pctBos = totalStudents > 0 ? Math.round(((Number(q.bosSayisi) || 0) * 1000) / totalStudents) / 10 : 0;

                      // En Güçlü Çeldirici (Doğru cevap dışındaki en çok işaretlenen şık)
                      const correctKey = String(q.dogruCevapA || '').toUpperCase().trim();
                      const optionsList = ['A', 'B', 'C', 'D', 'E'];
                      let topDistractorKey = '';
                      let topDistractorCount = 0;
                      optionsList.forEach((opt) => {
                        if (opt !== correctKey) {
                          const count = Number(q.secenekDagilimi?.[opt]) || 0;
                          if (count > topDistractorCount) {
                            topDistractorCount = count;
                            topDistractorKey = opt;
                          }
                        }
                      });

                      const diffBg = pctDogru >= 75 ? '#DCFCE7' : pctDogru >= 45 ? '#FEF3C7' : '#FEE2E2';
                      const diffColor = pctDogru >= 75 ? '#15803D' : pctDogru >= 45 ? '#B45309' : '#DC2626';

                      return (
                        <View
                          key={q.soruNo}
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 10,
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                          }}
                        >
                          {/* Üst Başlık Satırı */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#4F46E5' }}>Soru #{q.soruNo}</Text>
                              </View>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', flex: 1 }} numberOfLines={1}>
                                {q.konuAdi || `Soru #${q.soruNo}`}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#BBF7D0' }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534' }}>
                                  Cevap: {correctKey || '-'}
                                </Text>
                              </View>
                              <View style={{ backgroundColor: diffBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: diffColor }}>
                                  %{pctDogru} ({q.zorlukDuzeyi})
                                </Text>
                              </View>
                            </View>
                          </View>

                          {q.kazanimAciklamasi ? (
                            <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                              {q.kazanimAciklamasi}
                            </Text>
                          ) : null}

                          {/* 📊 Segmented Bar Grafik (Doğru [Yeşil] / Yanlış [Kırmızı] / Boş [Gri]) */}
                          <View style={{ height: 12, backgroundColor: '#E2E8F0', borderRadius: 6, overflow: 'hidden', flexDirection: 'row', marginVertical: 6 }}>
                            {pctDogru > 0 && (
                              <View style={{ width: `${pctDogru}%`, backgroundColor: '#22C55E' }} />
                            )}
                            {pctYanlis > 0 && (
                              <View style={{ width: `${pctYanlis}%`, backgroundColor: '#EF4444' }} />
                            )}
                            {pctBos > 0 && (
                              <View style={{ width: `${pctBos}%`, backgroundColor: '#94A3B8' }} />
                            )}
                          </View>

                          {/* Doğru / Yanlış / Boş Sayıları */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>
                                ✅ Doğru: {q.dogruSayisi} (%{pctDogru})
                              </Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                                ❌ Yanlış: {q.yanlisSayisi} (%{pctYanlis})
                              </Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                                ⚪ Boş: {q.bosSayisi} (%{pctBos})
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, color: '#475569' }}>
                              Toplam: {totalStudents} öğr.
                            </Text>
                          </View>

                          {/* Şık Dağılımı Rozetleri (Çeldirici Vurgulu) */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                            {optionsList.map((opt) => {
                              const count = Number(q.secenekDagilimi?.[opt]) || 0;
                              const optPct = totalStudents > 0 ? Math.round((count * 1000) / totalStudents) / 10 : 0;
                              const isCorrect = opt === correctKey;
                              const isTopDistractor = !isCorrect && opt === topDistractorKey && count > 0;

                              return (
                                <View
                                  key={opt}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 6,
                                    backgroundColor: isCorrect ? '#DCFCE7' : isTopDistractor ? '#FEF2F2' : '#F8FAFC',
                                    borderWidth: 1,
                                    borderColor: isCorrect ? '#86EFAC' : isTopDistractor ? '#FCA5A5' : '#E2E8F0',
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: isCorrect || isTopDistractor ? '800' : '600',
                                      color: isCorrect ? '#166534' : isTopDistractor ? '#991B1B' : '#334155',
                                    }}
                                  >
                                    {opt}: {count} (%{optPct})
                                  </Text>
                                  {isCorrect && (
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>✓ DOĞRU</Text>
                                  )}
                                  {isTopDistractor && (
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626' }}>⚠️ Çeldirici</Text>
                                  )}
                                </View>
                              );
                            })}

                            {/* Boş Bırakanlar Rozeti */}
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 6,
                                backgroundColor: '#F8FAFC',
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                              }}
                            >
                              <Text style={{ fontSize: 11, color: '#64748B' }}>
                                Boş: {q.secenekDagilimi?.Bos || 0} (%{pctBos})
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: OPTİK FORM TANIMLAMA SİHİRBAZI & .FMT PARSER                 */}
      {/* ===================================================================== */}
      <Modal visible={formModalVisible} transparent animationType="fade" onRequestClose={() => setFormModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { height: '90%', maxHeight: '94%', display: 'flex', flexDirection: 'column' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalLargeTitle}>📋 Optik Form Sihirbazı & 1-Tabanlı Koordinat Doğrulama</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setFormModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginTop: 10 }} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={styles.inputLabel}>Form Şablon Adı:</Text>
                <TouchableOpacity onPress={() => setShowFmtBox(!showFmtBox)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>
                    🪄 {showFmtBox ? '.FMT Kutusunu Gizle' : '.FMT Dosyası / Metni Çözümle'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.textInput}
                value={editingForm.formAdi}
                onChangeText={(t) => setEditingForm((p: any) => ({ ...p, formAdi: t }))}
                placeholder="Örn: LGS / YKS 120 Soru Standart Optik Form"
              />

              {/* 1-Tabanlı Sütun Numaralandırma Bilgi Kutusu */}
              <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, padding: 8, marginTop: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF' }}>
                  ℹ️ Sütun Numarası Kuralı: Optik TXT dosyalarında sütun numaraları 1'den başlar (1. karakter = Sütun 1). Sistem arka planda kodlama indeksine (0-tabanlı) otomatik çevirir; bu nedenle başlangıç sütunlarını doğrudan 1'den başlayarak giriniz.
                </Text>
              </View>

              {showFmtBox && (
                <View style={[styles.fmtBox, { marginTop: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#4C1D95' }}>
                      🪄 OMR .FMT İçeriğini Yapıştırın veya Dosyadan Yükleyin (Koordinat ve Yön bilgisinden 1-tabanlı sütunları otomatik çıkarır):
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EDE9FE', borderColor: '#C4B5FD' }]}
                        onPress={() =>
                          setFmtRawInput(
                            '61=46=04=D=*= =\n' +
                              '33=61=02=21=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=Alan 3=\n' +
                              '01=10=02=09=K=D=0123456789=X2=okulkod=\n' +
                              '01=10=11=15=K=D=0123456789=X2=okulkod=\n' +
                              '13=13=08=10=K=Y=A B=X2=kitap=\n' +
                              '20=29=02=15=K=D=0123456789=X2=TC=\n' +
                              '16=55=24=28=K=Y=ABCDE=X2=türk=\n' +
                              '16=61=30=34=K=Y=ABCDE=X2=sos=\n' +
                              '16=55=36=40=K=Y=ABCDE=X2=mat=\n' +
                              '16=61=42=46=K=Y=ABCDE=X2=fen='
                          )
                        }
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#5B21B6' }]}>📋 Örnek OMR .FMT Yükle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#DDD6FE', borderColor: '#A78BFA' }]}
                        onPress={handlePickFmtFile}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#4C1D95' }]}>📂 .FMT Dosyası Seç</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TextInput
                    style={[styles.textInput, { height: 115, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 }]}
                    multiline
                    value={fmtRawInput}
                    onChangeText={setFmtRawInput}
                    placeholder={'61=46=04=D=*= =\n33=61=02=21=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=Alan 3=\n01=10=02=09=K=D=0123456789=X2=okulkod=\n13=13=08=10=K=Y=A B=X2=kitap=\n16=55=24=28=K=Y=ABCDE=X2=türk='}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={handleParseFmt}>
                      <Text style={styles.primaryBtnText}>🪄 .FMT Koordinatlarını Otomatik Çözümle</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 11, color: '#5B21B6', flex: 1 }}>
                      Format: SatırBaş=SatırBit=SütunBaş=SütunBit=K=D/Y=KarakterDizisi=X2=AlanAdı= (D: Dikey sütun sayısı kadar, Y: Yatay satır sayısı kadar karakter üretir).
                    </Text>
                  </View>

                  {parsedFmtFields.length > 0 && (
                    <View style={{ marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#DDD6FE' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#4C1D95', marginBottom: 6 }}>
                        ✅ Çözümlenen .FMT Alanları (1-Tabanlı TXT Sütun Haritası):
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {parsedFmtFields.map((pf: any, idx: number) => (
                          <View
                            key={idx}
                            style={{
                              backgroundColor: '#F5F3FF',
                              borderWidth: 1,
                              borderColor: '#C4B5FD',
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#4C1D95' }}>
                              #{pf.sira}: {pf.etiket}{' '}
                              <Text style={{ fontWeight: '600', color: '#6D28D9' }}>
                                [Sütun {pf.baslangicSutun}–{pf.bitisSutun} · {pf.uzunluk} kar. · {pf.yon === 'D' ? 'Dikey' : pf.yon === 'Y' ? 'Yatay' : pf.yon}]
                              </Text>
                            </Text>
                            <Text style={{ fontSize: 10, color: '#64748B' }}>{pf.atananAlan}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* =============================================================== */}
              {/* CANLI DOĞRULAMA: ÖRNEK TXT (İLK 5 SATIR) & TIKLANABİLİR CETVEL */}
              {/* =============================================================== */}
              <View style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 10, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                      🔍 Canlı Doğrulama İçin Örnek Optik TXT (İlk 5 Satır) & Sütun Bulucu
                    </Text>
                    <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      Örnek TXT yükleyin; satırdaki herhangi bir karakterin önüne tıkladığınızda veya seçtiğinizde kaçıncı sütunda olduğunu (1'den başlayarak) anında görün.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}
                    onPress={handlePickWizardSampleTxtFile}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>
                      📂 Örnek TXT Yükle (İlk 5 Satır)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* İlk 5 Satır Seçici Sekmeler */}
                {wizardSampleLines.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 4 }}>
                      📄 Dosyadan Okunan İlk {wizardSampleLines.length} Satır (İncelemek istediğiniz satıra tıklayın):
                    </Text>
                    {wizardSampleLines.map((ln, idx) => {
                      const isActive = wizardActiveLineIdx === idx;
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => {
                            setWizardActiveLineIdx(idx);
                            setEditingForm((p: any) => ({ ...p, sampleLine: ln }));
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isActive ? '#DBEAFE' : '#FFFFFF',
                            borderWidth: 1,
                            borderColor: isActive ? '#3B82F6' : '#E2E8F0',
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            marginBottom: 4,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: isActive ? '#1D4ED8' : '#64748B', width: 58 }}>
                            {idx + 1}. Satır:
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontSize: 11,
                              fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                              color: '#0F172A',
                            }}
                          >
                            {ln}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#475569', marginLeft: 6 }}>({ln.length} krk)</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Tıklanan Karakterin Sütun Numarası Gösterge Paneli */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    backgroundColor: '#FEF3C7',
                    borderWidth: 1,
                    borderColor: '#F59E0B',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    marginTop: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#92400E' }}>
                      📍 Tıklanan Sütun (1-Tabanlı):{' '}
                      <Text style={{ fontSize: 14, color: '#B45309' }}>
                        {wizardCursorCol ? `${wizardCursorCol}. Sütun` : 'Henüz tıklanmadı'}
                      </Text>
                    </Text>
                    {wizardCursorCol && (editingForm.sampleLine || '')[wizardCursorCol - 1] !== undefined && (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350F' }}>
                        Karakter: "{(editingForm.sampleLine || '')[wizardCursorCol - 1]}"
                      </Text>
                    )}
                    {wizardSelLen > 1 && wizardCursorCol && (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8' }}>
                        | Seçilen Aralık: {wizardCursorCol}–{wizardCursorCol + wizardSelLen - 1} (Uzunluk: {wizardSelLen})
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: '#78350F' }}>
                    Toplam Satır Uzunluğu: {(editingForm.sampleLine || '').length} karakter
                  </Text>
                </View>

                {/* Metin Kutusu (İmleç Tıklaması / Seçim Yakalayıcı) */}
                <Text style={[styles.inputLabel, { marginTop: 8 }]}>
                  Aktif Örnek Satır (Metin içinde bir karakterin önüne tıklayın veya fareyle blok seçin):
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                      fontSize: 13,
                      backgroundColor: '#FFFFFF',
                    },
                  ]}
                  value={editingForm.sampleLine}
                  onChangeText={(t) => setEditingForm((p: any) => ({ ...p, sampleLine: t }))}
                  onSelectionChange={(e) => {
                    const start = e.nativeEvent.selection.start ?? 0;
                    const end = e.nativeEvent.selection.end ?? start;
                    const col1Based = start + 1;
                    const len = Math.max(1, end - start);
                    setWizardCursorCol(col1Based);
                    setWizardSelLen(len);
                  }}
                />

                {/* İnteraktif Tıklanabilir Karakter ve 1-Tabanlı Sütun Cetveli */}
                {(editingForm.sampleLine || '').length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>
                        📏 Tıklanabilir Sütun Cetveli (İlk tıklama = Başlangıç sütunu, İkinci tıklama = Bitiş sütunu ve uzunluk):
                      </Text>
                      {wizardRangeAnchorCol !== null && (
                        <TouchableOpacity onPress={() => setWizardRangeAnchorCol(null)}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                            ✕ Aralık Seçimini Sıfırla
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ backgroundColor: '#0F172A', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4 }}>
                      <View style={{ flexDirection: 'row' }}>
                        {Array.from(String(editingForm.sampleLine || '')).map((ch: string, cIdx: number) => {
                          const colNum = cIdx + 1; // 1-Based column
                          const isSelected =
                            wizardCursorCol !== null &&
                            colNum >= wizardCursorCol &&
                            colNum < wizardCursorCol + Math.max(1, wizardSelLen);
                          const isCursorStart = wizardCursorCol === colNum;
                          return (
                            <TouchableOpacity
                              key={cIdx}
                              onPress={() => {
                                if (wizardRangeAnchorCol === null) {
                                  setWizardRangeAnchorCol(colNum);
                                  setWizardCursorCol(colNum);
                                  setWizardSelLen(1);
                                } else {
                                  const sCol = Math.min(wizardRangeAnchorCol, colNum);
                                  const eCol = Math.max(wizardRangeAnchorCol, colNum);
                                  setWizardCursorCol(sCol);
                                  setWizardSelLen(eCol - sCol + 1);
                                  setWizardRangeAnchorCol(null);
                                }
                              }}
                              style={{
                                width: 22,
                                alignItems: 'center',
                                paddingVertical: 3,
                                borderRightWidth: 1,
                                borderRightColor: '#1E293B',
                                backgroundColor: isCursorStart
                                  ? '#F59E0B'
                                  : isSelected
                                  ? '#2563EB'
                                  : colNum % 10 === 0
                                  ? '#1E293B'
                                  : 'transparent',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: colNum % 5 === 0 || isSelected ? '800' : '500',
                                  color: isCursorStart ? '#0F172A' : isSelected ? '#FFFFFF' : colNum % 5 === 0 ? '#38BDF8' : '#94A3B8',
                                }}
                              >
                                {colNum}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: '800',
                                  fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                                  color: isCursorStart ? '#0F172A' : '#F8FAFC',
                                  marginTop: 2,
                                }}
                              >
                                {ch === ' ' ? '␣' : ch}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>

                    {/* Seçili Sütunu / Aralığı Tek Tıkla Parametreye Aktarma Butonları */}
                    {wizardCursorCol !== null && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>
                          ⚡ Seçili ({wizardCursorCol}. Sütun{wizardSelLen > 1 ? `, ${wizardSelLen} krk` : ''}) değerini ata:
                        </Text>
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD', paddingVertical: 4 }]}
                          onPress={() =>
                            setEditingForm((p: any) => ({
                              ...p,
                              numaraBaslangic: wizardCursorCol,
                              ...(wizardSelLen > 1 ? { numaraUzunluk: wizardSelLen } : {}),
                            }))
                          }
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#1D4ED8', fontSize: 11 }]}>→ Öğrenci No</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD', paddingVertical: 4 }]}
                          onPress={() =>
                            setEditingForm((p: any) => ({
                              ...p,
                              adSoyadBaslangic: wizardCursorCol,
                              ...(wizardSelLen > 1 ? { adSoyadUzunluk: wizardSelLen } : {}),
                            }))
                          }
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#1D4ED8', fontSize: 11 }]}>
                            {editingForm.adSoyadAyriMi ? '→ Ad' : '→ Ad Soyad'}
                          </Text>
                        </TouchableOpacity>
                        {editingForm.adSoyadAyriMi && (
                          <TouchableOpacity
                            style={[styles.smallActionBtn, { backgroundColor: '#F5F3FF', borderColor: '#C4B5FD', paddingVertical: 4 }]}
                            onPress={() =>
                              setEditingForm((p: any) => ({
                                ...p,
                                soyadBaslangic: wizardCursorCol,
                                ...(wizardSelLen > 1 ? { soyadUzunluk: wizardSelLen } : {}),
                              }))
                            }
                          >
                            <Text style={[styles.smallActionBtnText, { color: '#6D28D9', fontSize: 11 }]}>→ Soyad</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD', paddingVertical: 4 }]}
                          onPress={() =>
                            setEditingForm((p: any) => ({
                              ...p,
                              sinifBaslangic: wizardCursorCol,
                              ...(wizardSelLen > 1 ? { sinifUzunluk: wizardSelLen } : {}),
                            }))
                          }
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#1D4ED8', fontSize: 11 }]}>→ Sınıf/Şube</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD', paddingVertical: 4 }]}
                          onPress={() =>
                            setEditingForm((p: any) => ({
                              ...p,
                              kitapcikTuruBaslangic: wizardCursorCol,
                              ...(wizardSelLen > 1 ? { kitapcikTuruUzunluk: wizardSelLen } : {}),
                            }))
                          }
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#1D4ED8', fontSize: 11 }]}>→ Kitapçık</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Ad & Soyad Yapı Seçimi (Aynı Alanda mı, Ayrı Alanlarda mı?) */}
              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 8,
                  padding: 10,
                  marginTop: 10,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>
                  👤 Ad & Soyad Alan Yapısı Seçimi:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setEditingForm((p: any) => ({ ...p, adSoyadAyriMi: false }))}
                    style={{
                      flex: 1,
                      minWidth: 160,
                      backgroundColor: !editingForm.adSoyadAyriMi ? '#EFF6FF' : '#FFFFFF',
                      borderWidth: !editingForm.adSoyadAyriMi ? 2 : 1,
                      borderColor: !editingForm.adSoyadAyriMi ? '#2563EB' : '#CBD5E1',
                      borderRadius: 6,
                      padding: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: !editingForm.adSoyadAyriMi ? '#1D4ED8' : '#334155' }}>
                      {!editingForm.adSoyadAyriMi ? '☑️ ' : '⬜ '}
                      Ad ve Soyad Aynı Alanda
                    </Text>
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      Tek bir blok içinde hem ad hem soyad yer alır (Örn: "ALİ YILMAZ").
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setEditingForm((p: any) => ({ ...p, adSoyadAyriMi: true }))}
                    style={{
                      flex: 1,
                      minWidth: 160,
                      backgroundColor: editingForm.adSoyadAyriMi ? '#F5F3FF' : '#FFFFFF',
                      borderWidth: editingForm.adSoyadAyriMi ? 2 : 1,
                      borderColor: editingForm.adSoyadAyriMi ? '#7C3AED' : '#CBD5E1',
                      borderRadius: 6,
                      padding: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: editingForm.adSoyadAyriMi ? '#6D28D9' : '#334155' }}>
                      {editingForm.adSoyadAyriMi ? '☑️ ' : '⬜ '}
                      Ad ve Soyad Ayrı Alanlarda
                    </Text>
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      Ad ayrı sütunda, Soyad ayrı sütunda kodlanır (Değerlendirirken otomatik birleştirilir).
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Koordinat Girişleri (1-Tabanlı) + Canlı Kesit Önizlemesi */}
              <View style={styles.coordGrid}>
                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Öğrenci No (Önizleme: "{slicePreview(editingForm.numaraBaslangic, editingForm.numaraUzunluk)}")
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>Başl:</Text>
                    <TextInput
                      style={styles.compactNumInput}
                      keyboardType="numeric"
                      value={String(editingForm.numaraBaslangic)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, numaraBaslangic: parseInt(t || '1', 10) || 1 }))}
                      placeholder="1"
                    />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>Uzn:</Text>
                    <TextInput
                      style={[styles.compactNumInput, { width: 56 }]}
                      keyboardType="numeric"
                      value={String(editingForm.numaraUzunluk)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, numaraUzunluk: parseInt(t || '5', 10) || 5 }))}
                      placeholder="5"
                    />
                  </View>
                </View>

                {editingForm.adSoyadAyriMi ? (
                  <>
                    <View style={styles.coordItem}>
                      <Text style={styles.coordTitle}>
                        Öğrenci Adı (Önizleme: "{slicePreview(editingForm.adSoyadBaslangic, editingForm.adSoyadUzunluk)}")
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>Başl:</Text>
                        <TextInput
                          style={styles.compactNumInput}
                          keyboardType="numeric"
                          value={String(editingForm.adSoyadBaslangic)}
                          onChangeText={(t) => setEditingForm((p: any) => ({ ...p, adSoyadBaslangic: parseInt(t || '1', 10) || 1 }))}
                          placeholder="1"
                        />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>Uzn:</Text>
                        <TextInput
                          style={[styles.compactNumInput, { width: 56 }]}
                          keyboardType="numeric"
                          value={String(editingForm.adSoyadUzunluk)}
                          onChangeText={(t) => setEditingForm((p: any) => ({ ...p, adSoyadUzunluk: parseInt(t || '12', 10) || 12 }))}
                          placeholder="12"
                        />
                      </View>
                    </View>

                    <View style={styles.coordItem}>
                      <Text style={styles.coordTitle}>
                        Öğrenci Soyadı (Önizleme: "{slicePreview(editingForm.soyadBaslangic ?? 21, editingForm.soyadUzunluk ?? 12)}")
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>Başl:</Text>
                        <TextInput
                          style={styles.compactNumInput}
                          keyboardType="numeric"
                          value={String(editingForm.soyadBaslangic ?? 21)}
                          onChangeText={(t) => setEditingForm((p: any) => ({ ...p, soyadBaslangic: parseInt(t || '1', 10) || 1 }))}
                          placeholder="1"
                        />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>Uzn:</Text>
                        <TextInput
                          style={[styles.compactNumInput, { width: 56 }]}
                          keyboardType="numeric"
                          value={String(editingForm.soyadUzunluk ?? 12)}
                          onChangeText={(t) => setEditingForm((p: any) => ({ ...p, soyadUzunluk: parseInt(t || '12', 10) || 12 }))}
                          placeholder="12"
                        />
                      </View>
                      <Text style={{ fontSize: 10, color: '#4338CA', marginTop: 4, fontWeight: '700' }}>
                        🔗 Birleşik: "{slicePreview(editingForm.adSoyadBaslangic, editingForm.adSoyadUzunluk)} {slicePreview(editingForm.soyadBaslangic ?? 21, editingForm.soyadUzunluk ?? 12)}"
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.coordItem}>
                    <Text style={styles.coordTitle}>
                      Ad Soyad (Önizleme: "{slicePreview(editingForm.adSoyadBaslangic, editingForm.adSoyadUzunluk)}")
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>Başl:</Text>
                      <TextInput
                        style={styles.compactNumInput}
                        keyboardType="numeric"
                        value={String(editingForm.adSoyadBaslangic)}
                        onChangeText={(t) => setEditingForm((p: any) => ({ ...p, adSoyadBaslangic: parseInt(t || '1', 10) || 1 }))}
                        placeholder="1"
                      />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>Uzn:</Text>
                      <TextInput
                        style={[styles.compactNumInput, { width: 56 }]}
                        keyboardType="numeric"
                        value={String(editingForm.adSoyadUzunluk)}
                        onChangeText={(t) => setEditingForm((p: any) => ({ ...p, adSoyadUzunluk: parseInt(t || '20', 10) || 20 }))}
                        placeholder="20"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Sınıf/Şube (Önizleme: "{slicePreview(editingForm.sinifBaslangic, editingForm.sinifUzunluk)}")
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>Başl:</Text>
                    <TextInput
                      style={styles.compactNumInput}
                      keyboardType="numeric"
                      value={String(editingForm.sinifBaslangic)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, sinifBaslangic: parseInt(t || '1', 10) || 1 }))}
                      placeholder="1"
                    />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>Uzn:</Text>
                    <TextInput
                      style={[styles.compactNumInput, { width: 56 }]}
                      keyboardType="numeric"
                      value={String(editingForm.sinifUzunluk)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, sinifUzunluk: parseInt(t || '4', 10) || 4 }))}
                      placeholder="4"
                    />
                  </View>
                </View>

                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Kitapçık (Önizleme: "{slicePreview(editingForm.kitapcikTuruBaslangic ?? 30, editingForm.kitapcikTuruUzunluk ?? 1)}")
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>Başl:</Text>
                    <TextInput
                      style={styles.compactNumInput}
                      keyboardType="numeric"
                      value={String(editingForm.kitapcikTuruBaslangic ?? 30)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, kitapcikTuruBaslangic: parseInt(t || '1', 10) || 1 }))}
                      placeholder="1"
                    />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>Uzn:</Text>
                    <TextInput
                      style={[styles.compactNumInput, { width: 56 }]}
                      keyboardType="numeric"
                      value={String(editingForm.kitapcikTuruUzunluk ?? 1)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, kitapcikTuruUzunluk: parseInt(t || '1', 10) || 1 }))}
                      placeholder="1"
                    />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={styles.sectionHeading}>📚 Formdaki Ders Sütunları (1-Tabanlı Başlangıç Sütunu & Soru Sayısı)</Text>
                <TouchableOpacity
                  style={{ cursor: 'pointer' as any }}
                  onPress={() => {
                    const list = [...(editingForm.dersler || [])];
                    const last = list[list.length - 1];
                    const nextStart = last ? last.baslangicSutun + last.karakterSayisi : 31;
                    list.push({
                      dersAdi: `Ders ${list.length + 1}`,
                      baslangicSutun: nextStart,
                      karakterSayisi: 20,
                      siraNo: list.length + 1,
                    });
                    setEditingForm((p: any) => ({ ...p, dersler: list }));
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>+ Ders Sütunu Ekle</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 6, marginBottom: 4, marginTop: 4, alignItems: 'center' }}>
                <Text style={{ flex: 2, minWidth: 90, fontSize: 11, fontWeight: '700', color: '#64748B' }}>Ders Adı</Text>
                <Text style={{ flex: 1.2, minWidth: 65, fontSize: 11, fontWeight: '700', color: '#64748B' }}>Grup (Opsiyonel)</Text>
                <Text style={{ width: 68, fontSize: 11, fontWeight: '700', color: '#64748B', textAlign: 'center' }}>Başl. Sütun</Text>
                <Text style={{ width: 58, fontSize: 11, fontWeight: '700', color: '#64748B', textAlign: 'center' }}>Soru Say.</Text>
                <View style={{ width: 85 }} />
              </View>

              {(editingForm.dersler || []).map((d: any, idx: number) => (
                <View key={idx} style={{ marginBottom: 6, backgroundColor: '#F8FAFC', padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TextInput
                      style={[styles.textInput, { flex: 2, minWidth: 90, paddingVertical: 5, fontSize: 12 }]}
                      value={d.dersAdi}
                      placeholder="Ders Adı"
                      onChangeText={(t) => {
                        const arr = [...editingForm.dersler];
                        arr[idx] = { ...arr[idx], dersAdi: t };
                        setEditingForm((p: any) => ({ ...p, dersler: arr }));
                      }}
                    />
                    <TextInput
                      style={[styles.textInput, { flex: 1.2, minWidth: 65, paddingVertical: 5, fontSize: 12 }]}
                      value={d.dersGrubu || ''}
                      placeholder="Grup"
                      onChangeText={(t) => {
                        const arr = [...editingForm.dersler];
                        arr[idx] = { ...arr[idx], dersGrubu: t };
                        setEditingForm((p: any) => ({ ...p, dersler: arr }));
                      }}
                    />
                    <TextInput
                      style={styles.compactNumInput}
                      keyboardType="numeric"
                      value={String(d.baslangicSutun)}
                      placeholder="1.."
                      onChangeText={(t) => {
                        const arr = [...editingForm.dersler];
                        arr[idx] = { ...arr[idx], baslangicSutun: parseInt(t || '1', 10) || 1 };
                        setEditingForm((p: any) => ({ ...p, dersler: arr }));
                      }}
                    />
                    <TextInput
                      style={[styles.compactNumInput, { width: 58 }]}
                      keyboardType="numeric"
                      value={String(d.karakterSayisi)}
                      placeholder="Soru"
                      onChangeText={(t) => {
                        const arr = [...editingForm.dersler];
                        arr[idx] = { ...arr[idx], karakterSayisi: parseInt(t || '10', 10) || 10 };
                        setEditingForm((p: any) => ({ ...p, dersler: arr }));
                      }}
                    />
                    {wizardCursorCol !== null && (
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD', paddingVertical: 4, paddingHorizontal: 6, cursor: 'pointer' as any }]}
                        onPress={() => {
                          const arr = [...editingForm.dersler];
                          arr[idx] = {
                            ...arr[idx],
                            baslangicSutun: wizardCursorCol,
                            ...(wizardSelLen > 1 ? { karakterSayisi: wizardSelLen } : {}),
                          };
                          setEditingForm((p: any) => ({ ...p, dersler: arr }));
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#1D4ED8' }}>📍 Sütun Al</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={{ cursor: 'pointer' as any }}
                      onPress={() => {
                        const arr = editingForm.dersler.filter((_: any, i: number) => i !== idx);
                        setEditingForm((p: any) => ({ ...p, dersler: arr }));
                      }}
                    >
                      <Text style={{ color: '#DC2626', fontWeight: '700', paddingHorizontal: 6, fontSize: 14 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>
                    Sütun {d.baslangicSutun}–{d.baslangicSutun + d.karakterSayisi - 1} ({d.karakterSayisi} krk) Önizleme: "{slicePreview(d.baslangicSutun, d.karakterSayisi)}"
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* SABİT FOOTER BUTON ÇUBUĞU - HER ZAMAN EKRANDA VE TIKLANABİLİR */}
            <View style={[styles.modalBtnRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12, marginTop: 6 }]}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { cursor: 'pointer' as any }]}
                onPress={() => setFormModalVisible(false)}
                {...({ onClick: () => setFormModalVisible(false) } as any)}
              >
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { cursor: 'pointer' as any, minWidth: 220 }]}
                onPress={handleSaveForm}
                disabled={actionLoading}
                accessibilityRole="button"
                {...({ onClick: handleSaveForm } as any)}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>💾 Form Şablonunu Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 2: OPTİK SINAV & CEVAP ANAHTARI TANIMLAMA                        */}
      {/* ===================================================================== */}
      <Modal visible={examModalVisible} transparent animationType="fade" onRequestClose={() => setExamModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { maxHeight: '94%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalLargeTitle}>📝 Optik Sınav Türü, Format & Cevap Anahtarı Tanımlama</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setExamModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
              {/* SINAV TÜRÜ SEÇİMİ (SERBEST, LGS, TYT, AYT) */}
              <View style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 6 }}>
                  🎯 Sınav Türü ve Puan Hesaplama Sistemi Seçin:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(
                    [
                      { key: 'SERBEST', label: '📊 Serbest Sınav (Sadece Net)', desc: 'Puan hesaplanmaz, sadece Doğru / Yanlış / Net hesabı ve net sıralaması yapılır.' },
                      { key: 'LGS', label: '🎓 LGS (8. Sınıf - 90 Soru)', desc: '3 Yanlış 1 Doğruyu götürür. Katsayılar: Türkçe/Mat/Fen (4), İnkılap/Din/İng (1). 100–500 Puan.' },
                      { key: 'TYT', label: '🏛️ YKS - TYT (120 Soru)', desc: '4 Yanlış 1 Doğruyu götürür. Türkçe (3.3), Sosyal (3.4), Temel Mat (3.3), Fen (3.4) + 100 Taban Puan.' },
                      { key: 'AYT', label: '🚀 YKS - AYT (Alan Sınavı)', desc: '4 Yanlış 1 Doğruyu götürür. SAY / EA / SÖZ alan katsayıları + 100 Taban Puan (500 tam puan).' },
                    ] as const
                  ).map((st) => {
                    const isSelected = (editingExam.sinavTuru || 'SERBEST').toUpperCase() === st.key;
                    return (
                      <TouchableOpacity
                        key={st.key}
                        onPress={() => applyExamTypePreset(st.key)}
                        style={{
                          flex: 1,
                          minWidth: 180,
                          backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? '#2563EB' : '#CBD5E1',
                          borderRadius: 8,
                          padding: 8,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#1D4ED8' : '#0F172A' }}>
                          {isSelected ? '☑️ ' : '⬜ '}
                          {st.label}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>{st.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {(editingExam.sinavTuru || 'SERBEST').toUpperCase() === 'AYT' && (
                  <View style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#4338CA' }}>⚡ AYT Hazır Ders Şablonu Yükle:</Text>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' }]}
                        onPress={() => applyExamTypePreset('AYT')}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#3730A3' }]}>Tüm AYT (160 Soru)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' }]}
                        onPress={() => applyExamTypePreset('AYT_SAY')}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#3730A3' }]}>AYT Sayısal (80 Soru)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' }]}
                        onPress={() => applyExamTypePreset('AYT_EA')}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#3730A3' }]}>AYT Eşit Ağırlık (80 Soru)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' }]}
                        onPress={() => applyExamTypePreset('AYT_SOZ')}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#3730A3' }]}>AYT Sözel (80 Soru)</Text>
                      </TouchableOpacity>
                    </View>

                    {/* BAĞLI TYT SINAVI SEÇİMİ VE GİRİLMEYEN TYT VARSAYILAN TABAN PUANI */}
                    <View
                      style={{
                        marginTop: 10,
                        backgroundColor: '#EEF2FF',
                        borderWidth: 1,
                        borderColor: '#C7D2FE',
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#312E81', marginBottom: 4 }}>
                        🔗 AYT Puan Hesabı İçin Bağlı TYT Sınavı (%40 TYT + %60 AYT):
                      </Text>
                      <Text style={{ fontSize: 11, color: '#4338CA', marginBottom: 8 }}>
                        YKS (AYT) puanı hesaplanırken öğrencinin seçtiğiniz TYT sınavından aldığı puanın %40'ı ile AYT puanının %60'ı birleştirilir. Öğrenci bağlı TYT sınavına girmemişse aşağıdaki varsayılan TYT taban puanı (100 veya 150 gibi) kullanılır.
                      </Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        <TouchableOpacity
                          onPress={() => setEditingExam((p: any) => ({ ...p, bagliTytSinavId: null }))}
                          style={{
                            backgroundColor: !editingExam.bagliTytSinavId ? '#4F46E5' : '#FFFFFF',
                            borderWidth: 1,
                            borderColor: !editingExam.bagliTytSinavId ? '#4338CA' : '#CBD5E1',
                            borderRadius: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: !editingExam.bagliTytSinavId ? '#FFFFFF' : '#334155',
                            }}
                          >
                            {!editingExam.bagliTytSinavId ? '☑️ ' : '⬜ '}
                            Bağlı TYT Yok (Varsayılan Taban Puanı Kullan)
                          </Text>
                        </TouchableOpacity>

                        {exams
                          .filter((ex: any) => ex.id !== editingExam.id && (ex.sinavTuru || '').toUpperCase() !== 'AYT')
                          .map((ex: any) => {
                            const isLinked = editingExam.bagliTytSinavId === ex.id;
                            const isTytType = (ex.sinavTuru || '').toUpperCase() === 'TYT';
                            return (
                              <TouchableOpacity
                                key={ex.id}
                                onPress={() => setEditingExam((p: any) => ({ ...p, bagliTytSinavId: ex.id }))}
                                style={{
                                  backgroundColor: isLinked ? '#2563EB' : '#FFFFFF',
                                  borderWidth: 1,
                                  borderColor: isLinked ? '#1D4ED8' : isTytType ? '#93C5FD' : '#CBD5E1',
                                  borderRadius: 6,
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: isLinked ? '#FFFFFF' : '#1E293B',
                                  }}
                                >
                                  {isLinked ? '☑️ ' : '⬜ '}
                                  {isTytType ? '🏛️ [TYT] ' : ''}
                                  {ex.sinavAdi} ({ex.participantCount || 0} Öğr.)
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#312E81' }}>
                          🛡️ Öğrenci TYT'ye Girmemişse Kullanılacak Varsayılan TYT Taban Puanı:
                        </Text>
                        <TextInput
                          style={[styles.textInput, { width: 80, backgroundColor: '#FFFFFF', paddingVertical: 4 }]}
                          keyboardType="numeric"
                          value={String(editingExam.varsayilanTytPuani ?? 150)}
                          onChangeText={(t) =>
                            setEditingExam((p: any) => ({
                              ...p,
                              varsayilanTytPuani: parseFloat(t.replace(',', '.') || '0') || 0,
                            }))
                          }
                        />
                        {[100, 150, 180].map((val) => {
                          const isValSelected = Number(editingExam.varsayilanTytPuani ?? 150) === val;
                          return (
                            <TouchableOpacity
                              key={val}
                              onPress={() => setEditingExam((p: any) => ({ ...p, varsayilanTytPuani: val }))}
                              style={[
                                styles.smallActionBtn,
                                {
                                  backgroundColor: isValSelected ? '#312E81' : '#FFFFFF',
                                  borderColor: isValSelected ? '#312E81' : '#A5B4FC',
                                  paddingVertical: 4,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.smallActionBtnText,
                                  { color: isValSelected ? '#FFFFFF' : '#312E81', fontSize: 11 },
                                ]}
                              >
                                {val} Puan
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                )}
              </View>

              <Text style={styles.inputLabel}>Sınav Adı:</Text>
              <TextInput
                style={styles.textInput}
                value={editingExam.sinavAdi}
                onChangeText={(t) => setEditingExam((p: any) => ({ ...p, sinavAdi: t }))}
                placeholder="Örn: 1. Dönem Genel Deneme Sınavı"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Uygulama Tarihi (YYYY-AA-GG):</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editingExam.uygulamaTarihi}
                    onChangeText={(t) => setEditingExam((p: any) => ({ ...p, uygulamaTarihi: t }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Kaç Yanlış 1 Doğruyu Götürür? (LGS: 3, TYT/AYT: 4, Götürmez: 0):</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={String(editingExam.yanlisDogruyuGotururSayisi)}
                    onChangeText={(t) => setEditingExam((p: any) => ({ ...p, yanlisDogruyuGotururSayisi: parseFloat(t || '0') || 0 }))}
                  />
                </View>
              </View>

              {/* Kitapçık Sayısı / Türleri Seçimi */}
              <View style={{ marginTop: 10, marginBottom: 8, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1' }}>
                <Text style={[styles.inputLabel, { marginBottom: 6 }]}>
                  📚 Sınavda Kullanılacak Kitapçık Türleri:
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Tek Kitapçık (Yalnızca A)', val: 'A' },
                    { label: '2 Kitapçık (A, B)', val: 'A,B' },
                    { label: '4 Kitapçık (A, B, C, D)', val: 'A,B,C,D' },
                  ].map((item) => {
                    const isSelected = (editingExam.kitapcikTurleri || 'A,B') === item.val;
                    return (
                      <TouchableOpacity
                        key={item.val}
                        style={[
                          styles.sortPill,
                          isSelected && styles.sortPillActive,
                          { paddingHorizontal: 12, paddingVertical: 6 }
                        ]}
                        onPress={() => {
                          setEditingExam((p: any) => ({ ...p, kitapcikTurleri: item.val }));
                        }}
                      >
                        <Text style={[styles.sortPillText, isSelected && { color: '#FFFFFF' }]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
                <Text style={styles.sectionHeading}>🔑 Dersler, Katsayılar ve Kitapçık Cevap Anahtarları</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}
                    onPress={() => downloadAnswerKeyExcelTemplate(editingExam)}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#047857' }]}>
                      📥 Excel Şablonu İndir
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}
                    onPress={handleUploadAnswerKeyExcel}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>
                      📤 Excel'den Anahtar Yükle
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}
                    onPress={() => {
                      const list = [...(editingExam.dersler || [])];
                      list.push({
                        dersAdi: `Ders ${list.length + 1}`,
                        soruSayisi: 20,
                        katsayi: 1.0,
                        siraNo: list.length + 1,
                        cevapAnahtariA: 'ABCDABCDABCDABCDABCD',
                        cevapAnahtariB: 'BCDABCDABCDABCDABCDA',
                      });
                      setEditingExam((p: any) => ({ ...p, dersler: list }));
                    }}
                  >
                    <Text style={[styles.smallActionBtnText, { color: '#2563EB' }]}>+ Yeni Ders Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {pendingExcelKazanimlar.length > 0 && (
                <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#15803D' }}>
                    ✅ Excel şablonundan {pendingExcelKazanimlar.length} sorunun konu/kazanım bilgisi de okundu. Sınavı kaydettiğinizde otomatik olarak kaydedilecektir.
                  </Text>
                </View>
              )}

              {(editingExam.dersler || []).map((d: any, idx: number) => (
                <View key={idx} style={styles.lessonKeyCard}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 2 }}>Ders Adı</Text>
                      <TextInput
                        style={styles.textInput}
                        value={d.dersAdi}
                        placeholder="Ders Adı (Örn: Fizik)"
                        onChangeText={(t) => {
                          const arr = [...editingExam.dersler];
                          arr[idx] = { ...arr[idx], dersAdi: t };
                          setEditingExam((p: any) => ({ ...p, dersler: arr }));
                        }}
                      />
                    </View>
                    <View style={{ flex: 1.5 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 2 }}>Ders Grubu (Opsiyonel)</Text>
                      <TextInput
                        style={styles.textInput}
                        value={d.dersGrubu || ''}
                        placeholder="Örn: Fen Bilimleri"
                        onChangeText={(t) => {
                          const arr = [...editingExam.dersler];
                          arr[idx] = { ...arr[idx], dersGrubu: t };
                          setEditingExam((p: any) => ({ ...p, dersler: arr }));
                        }}
                      />
                    </View>
                    <View style={{ width: 75 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 2 }}>Soru Sayısı</Text>
                      <TextInput
                        style={styles.textInput}
                        keyboardType="numeric"
                        value={String(d.soruSayisi)}
                        placeholder="Soru"
                        onChangeText={(t) => {
                          const arr = [...editingExam.dersler];
                          arr[idx] = { ...arr[idx], soruSayisi: parseInt(t || '20', 10) || 20 };
                          setEditingExam((p: any) => ({ ...p, dersler: arr }));
                        }}
                      />
                    </View>
                    {(editingExam.sinavTuru || 'SERBEST').toUpperCase() !== 'SERBEST' && (
                      <View style={{ width: 75 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 2 }}>Katsayı</Text>
                        <TextInput
                          style={styles.textInput}
                          keyboardType="numeric"
                          value={String(d.katsayi ?? 1)}
                          placeholder="Katsayı"
                          onChangeText={(t) => {
                            const arr = [...editingExam.dersler];
                            arr[idx] = { ...arr[idx], katsayi: parseFloat(t.replace(',', '.') || '1') || 1 };
                            setEditingExam((p: any) => ({ ...p, dersler: arr }));
                          }}
                        />
                      </View>
                    )}
                    <TouchableOpacity
                      style={{ marginTop: 14 }}
                      onPress={() => {
                        const arr = editingExam.dersler.filter((_: any, i: number) => i !== idx);
                        setEditingExam((p: any) => ({ ...p, dersler: arr }));
                      }}
                    >
                      <Text style={{ color: '#DC2626', fontWeight: '700', paddingHorizontal: 6 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Aktif Kitapçık Türlerine Göre Cevap Anahtarı Girişleri */}
                  {(() => {
                    const activeTurler = (editingExam.kitapcikTurleri || 'A,B')
                      .split(',')
                      .map((s: string) => s.trim().toUpperCase())
                      .filter(Boolean);
                    if (activeTurler.length === 0) activeTurler.push('A');

                    return activeTurler.map((bType: string) => {
                      const propName = `cevapAnahtari${bType}`;
                      const currentVal = d[propName] || '';
                      const isMatch = currentVal.length === d.soruSayisi;

                      return (
                        <View key={bType} style={{ marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isMatch ? '#047857' : '#DC2626' }}>
                              {bType} Kitapçığı Cevap Anahtarı ({currentVal.length}/{d.soruSayisi} Karakter): {isMatch ? '✅' : '⚠️ Eksik veya Fazla!'}
                            </Text>
                            {bType === 'A' && (
                              <Text style={{ fontSize: 10, color: '#64748B' }}>
                                (İptal: X, Herkese Doğru: H)
                              </Text>
                            )}
                          </View>
                          <TextInput
                            style={[
                              styles.textInput,
                              {
                                fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                                borderColor: isMatch ? '#CBD5E1' : '#FCA5A5',
                                backgroundColor: isMatch ? '#FFFFFF' : '#FEF2F2',
                              },
                            ]}
                            value={currentVal}
                            autoCapitalize="characters"
                            placeholder={`${d.soruSayisi} karakterlik ${bType} anahtarı giriniz...`}
                            onChangeText={(t) => {
                              const arr = [...editingExam.dersler];
                              arr[idx] = { ...arr[idx], [propName]: t.toUpperCase() };
                              setEditingExam((p: any) => ({ ...p, dersler: arr }));
                            }}
                          />
                        </View>
                      );
                    });
                  })()}
                </View>
              ))}

            </ScrollView>

            {/* SABİT FOOTER BUTON ÇUBUĞU */}
            <View style={[styles.modalBtnRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12, marginTop: 6 }]}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { cursor: 'pointer' as any }]}
                onPress={() => setExamModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { cursor: 'pointer' as any, minWidth: 220 }]}
                onPress={handleSaveExam}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>💾 Sınavı ve Anahtarları Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 3: KONU VE KAZANIM TANIMLAMA MODALI                             */}
      {/* ===================================================================== */}
      <Modal visible={kazanimModalVisible} transparent animationType="fade" onRequestClose={() => setKazanimModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { maxHeight: '92%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalLargeTitle}>📑 Soru Bazlı Konu ve Kazanım Eşleştirme ({kazanimExam?.sinavAdi})</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setKazanimModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8, maxHeight: 40 }}>
              {(kazanimExam?.dersler || []).map((d: any) => (
                <TouchableOpacity
                  key={d.dersAdi}
                  style={[styles.classFilterChip, kazanimSelectedLesson === d.dersAdi && styles.classFilterChipActive]}
                  onPress={() => setKazanimSelectedLesson(d.dersAdi)}
                >
                  <Text style={[styles.classFilterText, kazanimSelectedLesson === d.dersAdi && { color: '#FFF' }]}>
                    {d.dersAdi} ({d.soruSayisi} Soru)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView style={{ flex: 1 }}>
              {/* Hızlı Toplu Yapıştırma Kutusu */}
              <View style={styles.fmtBox}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#4C1D95', marginBottom: 4 }}>
                  ⚡ Hızlı Toplu Konu Yapıştırma (Her satıra "SoruNo;Konu Adı;Kazanım" veya doğrudan "Konu Adı" yazabilirsiniz):
                </Text>
                <TextInput
                  style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
                  multiline
                  value={bulkKazanimText}
                  onChangeText={setBulkKazanimText}
                  placeholder={'1;Vektörler ve Kuvvet;11.1.1 Bileşke vektörü hesaplar\n2;Bağıl Hareket;11.1.2 Bağıl hız problemlerini çözer'}
                />
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 6, alignSelf: 'flex-start' }]} onPress={handleApplyBulkKazanim}>
                  <Text style={styles.primaryBtnText}>⚡ Seçili Derse ({kazanimSelectedLesson}) Uygula</Text>
                </TouchableOpacity>
              </View>

              {kazanimItems
                .filter((x) => x.dersAdi === kazanimSelectedLesson)
                .map((item) => (
                  <View key={`${item.dersAdi}-${item.soruNo}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ width: 55, fontSize: 12, fontWeight: '700', color: '#334155' }}>
                      Soru #{item.soruNo}
                    </Text>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      placeholder="Konu Adı (Örn: Trigonometri)"
                      value={item.konuAdi}
                      onChangeText={(t) => {
                        setKazanimItems((prev) =>
                          prev.map((p) =>
                            p.dersAdi === item.dersAdi && p.soruNo === item.soruNo ? { ...p, konuAdi: t } : p
                          )
                        );
                      }}
                    />
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      placeholder="Kazanım Açıklaması (Opsiyonel)"
                      value={item.kazanimAciklamasi}
                      onChangeText={(t) => {
                        setKazanimItems((prev) =>
                          prev.map((p) =>
                            p.dersAdi === item.dersAdi && p.soruNo === item.soruNo ? { ...p, kazanimAciklamasi: t } : p
                          )
                        );
                      }}
                    />
                  </View>
                ))}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setKazanimModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveKazanimlar} disabled={actionLoading}>
                <Text style={styles.primaryBtnText}>💾 Kazanımları Kaydet & Karneleri Güncelle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 4: OPTİK TXT / DAT OKUMA VE DEĞERLENDİRME                       */}
      {/* ===================================================================== */}
      <Modal visible={evalModalVisible} transparent animationType="fade" onRequestClose={() => setEvalModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { maxWidth: 960, maxHeight: '94%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalLargeTitle}>🎯 Optik Okuyucu TXT / DAT Değerlendirme ({evalExam?.sinavAdi})</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setEvalModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handlePickOpticalTxtFile}>
                  <Text style={styles.primaryBtnText}>📂 Bilgisayardan / Cihazdan .TXT / .DAT Seç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}
                  onPress={() => handleRunEvaluation(false)}
                  disabled={actionLoading}
                >
                  <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>
                    🔎 TXT Verisini Çözümle & Kontrol Et
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SADECE SEÇİLEN ŞUBELERİ DEĞERLENDİR FİLTRESİ */}
              <View style={styles.evalClassFilterBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Switch
                      value={evalFilterClassesEnabled}
                      onValueChange={(val) => {
                        setEvalFilterClassesEnabled(val);
                        if (val && evalAvailableClasses.length === 0 && evalTxtContent.trim()) {
                          handleRunEvaluation(false, evalExcludedLines, []);
                        }
                      }}
                    />
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                        🏫 Sadece Seçilen Şubeleri Değerlendir
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        Yoğun bir TXT dosyasında yalnızca seçtiğiniz sınıf/şubelerdeki öğrencileri filtreleyip değerlendirmeye alır.
                      </Text>
                    </View>
                  </View>

                  {evalFilterClassesEnabled && evalAvailableClasses.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#E0E7FF', paddingVertical: 4 }]}
                        onPress={() => setEvalSelectedClasses(evalAvailableClasses.map((c) => c.sinif))}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#3730A3' }}>Tümünü Seç</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#F1F5F9', paddingVertical: 4 }]}
                        onPress={() => setEvalSelectedClasses([])}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Temizle</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {evalFilterClassesEnabled && (
                  <View style={{ marginTop: 8 }}>
                    {evalAvailableClasses.length === 0 ? (
                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', alignSelf: 'flex-start' }]}
                        onPress={() => handleRunEvaluation(false, evalExcludedLines, [])}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#4338CA' }}>
                          🔍 TXT Dosyasındaki Şubeleri Algılamak İçin Tıklayın
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {evalAvailableClasses.map((item) => {
                          const isSel = evalSelectedClasses.includes(item.sinif);
                          return (
                            <TouchableOpacity
                              key={item.sinif}
                              style={[
                                styles.classFilterChip,
                                { borderWidth: 1, borderColor: isSel ? '#1D4ED8' : '#CBD5E1' },
                                isSel && styles.classFilterChipActive,
                              ]}
                              onPress={() => {
                                const next = isSel
                                  ? evalSelectedClasses.filter((x) => x !== item.sinif)
                                  : [...evalSelectedClasses, item.sinif];
                                setEvalSelectedClasses(next);
                              }}
                            >
                              <Text style={[styles.classFilterText, isSel && { color: '#FFF' }]}>
                                {isSel ? '☑️ ' : '⬜ '}
                                {item.sinif} ({item.count} Öğr.)
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>

              <Text style={styles.inputLabel}>
                Optik Veri Satırları ({evalTxtContent ? evalTxtContent.split(/\r?\n/).filter((x) => x.trim()).length : 0} Öğrenci Satırı):
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    height: evalPreviewResults ? 95 : 140,
                    textAlignVertical: 'top',
                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                    fontSize: 11,
                  },
                ]}
                multiline
                value={evalTxtContent}
                onChangeText={setEvalTxtContent}
                placeholder="Optik okuyucudan alınan TXT/DAT satırlarını buraya yapıştırın veya yukarıdan dosya seçin..."
              />

              {/* ÖN DEĞERLENDİRME, SORUNLU ÖĞRENCİ TESPİTİ, SATIR ÜZERİNDE DÜZELTME VE SİLME TABLOSU */}
              {evalPreviewResults && (
                <View style={styles.previewContainerBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Text style={styles.sectionHeading}>
                      🔎 Ön Değerlendirme & Doğrulama ({evalPreviewResults.length} Öğrenci)
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {evalPreviewResults.some((r) => r.hasMissingBooklet) && (
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
                          onPress={() => handleBulkExcludePreviewRows('MISSING_BOOKLET')}
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#DC2626' }]}>
                            🗑️ Kitapçıksızları Çıkar ({evalPreviewResults.filter((r) => r.hasMissingBooklet).length})
                          </Text>
                        </TouchableOpacity>
                      )}

                      {evalPreviewResults.some((r) => !r.isMatchedInDb) && (
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }]}
                          onPress={() => handleBulkExcludePreviewRows('UNMATCHED')}
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#B45309' }]}>
                            🗑️ Eşleşmeyenleri Çıkar ({evalPreviewResults.filter((r) => !r.isMatchedInDb).length})
                          </Text>
                        </TouchableOpacity>
                      )}

                      {evalExcludedLines.length > 0 && (
                        <TouchableOpacity
                          style={[styles.smallActionBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}
                          onPress={() => {
                            setEvalExcludedLines([]);
                            handleRunEvaluation(false, []);
                          }}
                        >
                          <Text style={[styles.smallActionBtnText, { color: '#334155' }]}>
                            ↩️ Silinenleri Geri Al ({evalExcludedLines.length})
                          </Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}
                        onPress={() => handleRunEvaluation(false)}
                      >
                        <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>
                          🔄 Düzeltmelerle Yeniden Hesapla
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Hata / Durum Filtre Sekmeleri ve Arama */}
                  {(() => {
                    const missingBookletList = evalPreviewResults.filter((r) => r.hasMissingBooklet);
                    const unmatchedList = evalPreviewResults.filter((r) => !r.isMatchedInDb);
                    const nameMismatchList = evalPreviewResults.filter((r) => r.isNameMismatch);

                    const displayedPreviewRows = evalPreviewResults.filter((r) => {
                      if (evalSearchQuery.trim()) {
                        const q = evalSearchQuery.trim().toLowerCase();
                        const matchNo = String(r.ogrenciNo || '').toLowerCase().includes(q);
                        const matchName = String(r.adSoyad || '').toLowerCase().includes(q);
                        const matchClass = String(r.sinif || '').toLowerCase().includes(q);
                        const matchBooklet = String(r.kitapcikTuru || '').toLowerCase() === q;
                        if (!matchNo && !matchName && !matchClass && !matchBooklet) return false;
                      }
                      if (evalPreviewFilter === 'MISSING_BOOKLET') return r.hasMissingBooklet;
                      if (evalPreviewFilter === 'UNMATCHED') return !r.isMatchedInDb;
                      if (evalPreviewFilter === 'NAME_MISMATCH') return r.isNameMismatch;
                      return true;
                    });

                    return (
                      <>
                        {/* Öğrenci Arama Çubuğu */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, marginVertical: 6 }}>
                          <Text style={{ fontSize: 13, marginRight: 6 }}>🔍</Text>
                          <TextInput
                            style={{ flex: 1, height: 36, fontSize: 13, color: '#0F172A' }}
                            placeholder="Öğrenci ara (Ad Soyad, Numara, Sınıf/Şube veya Kitapçık)..."
                            value={evalSearchQuery}
                            onChangeText={setEvalSearchQuery}
                          />
                          {evalSearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setEvalSearchQuery('')}>
                              <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '700' }}>✕ Temizle</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>
                          <TouchableOpacity
                            style={[
                              styles.sortPill,
                              evalPreviewFilter === 'ALL' && styles.sortPillActive,
                            ]}
                            onPress={() => setEvalPreviewFilter('ALL')}
                          >
                            <Text style={[styles.sortPillText, evalPreviewFilter === 'ALL' && { color: '#FFF' }]}>
                              📋 Tümü ({evalPreviewResults.length})
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.sortPill,
                              { borderColor: '#FCA5A5', backgroundColor: evalPreviewFilter === 'MISSING_BOOKLET' ? '#DC2626' : '#FEF2F2' },
                            ]}
                            onPress={() => setEvalPreviewFilter('MISSING_BOOKLET')}
                          >
                            <Text
                              style={[
                                styles.sortPillText,
                                { color: evalPreviewFilter === 'MISSING_BOOKLET' ? '#FFF' : '#DC2626' },
                              ]}
                            >
                              🔴 Kitapçık İşaretlemeyenler ({missingBookletList.length})
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.sortPill,
                              { borderColor: '#FCD34D', backgroundColor: evalPreviewFilter === 'UNMATCHED' ? '#D97706' : '#FFFBEB' },
                            ]}
                            onPress={() => setEvalPreviewFilter('UNMATCHED')}
                          >
                            <Text
                              style={[
                                styles.sortPillText,
                                { color: evalPreviewFilter === 'UNMATCHED' ? '#FFF' : '#B45309' },
                              ]}
                            >
                              ⚠️ Numarası Eşleşmeyenler ({unmatchedList.length})
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.sortPill,
                              { borderColor: '#FDBA74', backgroundColor: evalPreviewFilter === 'NAME_MISMATCH' ? '#EA580C' : '#FFF7ED' },
                            ]}
                            onPress={() => setEvalPreviewFilter('NAME_MISMATCH')}
                          >
                            <Text
                              style={[
                                styles.sortPillText,
                                { color: evalPreviewFilter === 'NAME_MISMATCH' ? '#FFF' : '#C2410C' },
                              ]}
                            >
                              🟠 Ad-Soyad Uyuşmazlığı ({nameMismatchList.length})
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {displayedPreviewRows.length === 0 ? (
                          <Text style={{ padding: 12, color: '#64748B', fontSize: 12, textAlign: 'center' }}>
                            Bu filtrede sorunlu öğrenci kaydı bulunmuyor. ✅
                          </Text>
                        ) : (
                          <View style={{ maxHeight: 310 }}>
                            <ScrollView nestedScrollEnabled={true}>
                              {displayedPreviewRows.map((r) => {
                                const hasIssue = r.hasMissingBooklet || !r.isMatchedInDb || r.isNameMismatch;
                                return (
                                  <View
                                    key={r.lineIndex ?? r.id}
                                    style={[
                                      styles.previewRowCard,
                                      hasIssue && {
                                        backgroundColor: r.hasMissingBooklet ? '#FEF2F2' : '#FFFBEB',
                                        borderColor: r.hasMissingBooklet ? '#FCA5A5' : '#FCD34D',
                                      },
                                    ]}
                                  >
                                    {/* Durum Rozetleri ve Öneri */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569' }}>
                                          Satır #{Number(r.lineIndex ?? 0) + 1} · Derece: #{r.okulSirasi}
                                        </Text>

                                        {r.isMatchedInDb ? (
                                          <View style={[styles.badge, { backgroundColor: '#DCFCE7' }]}>
                                            <Text style={[styles.badgeText, { color: '#15803D' }]}>✅ Sistemle Eşleşti</Text>
                                          </View>
                                        ) : (
                                          <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                                            <Text style={[styles.badgeText, { color: '#B45309' }]}>
                                              ⚠️ Numara Sistemde Yok (TXT: "{r.rawOgrenciNo || 'Boş'}")
                                            </Text>
                                          </View>
                                        )}

                                        {r.isNameMismatch && (
                                          <View style={[styles.badge, { backgroundColor: '#FFEDD5' }]}>
                                            <Text style={[styles.badgeText, { color: '#C2410C' }]}>
                                              🟠 TXT Adı: "{r.rawAdSoyad}" ≠ Sistem: "{r.dbStudentName}"
                                            </Text>
                                          </View>
                                        )}

                                        {r.hasMissingBooklet && (
                                          <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                                            <Text style={[styles.badgeText, { color: '#DC2626' }]}>
                                              🔴 Kitapçık Türü İşaretlenmemiş!
                                            </Text>
                                          </View>
                                        )}

                                        {!r.isMatchedInDb && r.suggestedStudentNo && (
                                          <TouchableOpacity
                                            style={[styles.smallActionBtn, { backgroundColor: '#DBEAFE', paddingVertical: 3 }]}
                                            onPress={() => {
                                              handleUpdatePreviewRowOverride(r.lineIndex, {
                                                ogrenciNo: r.suggestedStudentNo,
                                                adSoyad: r.suggestedStudentName,
                                                sinif: r.suggestedStudentClass,
                                              });
                                            }}
                                          >
                                            <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#1E40AF' }}>
                                              💡 İsimden Eşleştir: {r.suggestedStudentNo} - {r.suggestedStudentName} ({r.suggestedStudentClass}) Uygula
                                            </Text>
                                          </TouchableOpacity>
                                        )}
                                      </View>

                                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8' }}>
                                        {r.toplamDogru}D · {r.toplamYanlis}Y · {r.toplamBos}B = {r.toplamNet} Net ({r.puan} Puan)
                                      </Text>
                                    </View>

                                    {/* Satır Üzerinde Düzeltme Inputları (Öğr No, Ad Soyad, Sınıf, Kitapçık Seçici, Sil) */}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                      <View style={{ width: 90 }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700' }}>Öğrenci No</Text>
                                        <TextInput
                                          style={[styles.textInput, { paddingVertical: 4, fontSize: 12 }]}
                                          value={String(r.ogrenciNo || '')}
                                          onChangeText={(val) =>
                                            handleUpdatePreviewRowOverride(r.lineIndex, { ogrenciNo: val })
                                          }
                                        />
                                      </View>

                                      <View style={{ flex: 1, minWidth: 150 }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700' }}>Ad Soyad</Text>
                                        <TextInput
                                          style={[styles.textInput, { paddingVertical: 4, fontSize: 12 }]}
                                          value={String(r.adSoyad || '')}
                                          onChangeText={(val) =>
                                            handleUpdatePreviewRowOverride(r.lineIndex, { adSoyad: val })
                                          }
                                        />
                                      </View>

                                      <View style={{ width: 76 }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700' }}>Sınıf/Şube</Text>
                                        <TextInput
                                          style={[styles.textInput, { paddingVertical: 4, fontSize: 12 }]}
                                          value={String(r.sinif || '')}
                                          onChangeText={(val) =>
                                            handleUpdatePreviewRowOverride(r.lineIndex, { sinif: val })
                                          }
                                        />
                                      </View>

                                      <View>
                                        <Text style={{ fontSize: 10, color: r.hasMissingBooklet ? '#DC2626' : '#64748B', fontWeight: '700' }}>
                                          Kitapçık Türü
                                        </Text>
                                        <View style={{ flexDirection: 'row', gap: 4 }}>
                                          {['A', 'B', 'C', 'D'].map((bType) => {
                                            const isKitSel = r.kitapcikTuru === bType && !r.hasMissingBooklet;
                                            return (
                                              <TouchableOpacity
                                                key={bType}
                                                style={[
                                                  styles.bookletPickBtn,
                                                  isKitSel && styles.bookletPickBtnActive,
                                                  r.hasMissingBooklet && { borderColor: '#EF4444' },
                                                ]}
                                                onPress={() =>
                                                  handleUpdatePreviewRowOverride(r.lineIndex, { kitapcikTuru: bType })
                                                }
                                              >
                                                <Text
                                                  style={[
                                                    styles.bookletPickBtnText,
                                                    isKitSel && { color: '#FFFFFF' },
                                                  ]}
                                                >
                                                  {bType}
                                                </Text>
                                              </TouchableOpacity>
                                            );
                                          })}
                                        </View>
                                      </View>

                                      <TouchableOpacity
                                        style={[
                                          styles.smallActionBtn,
                                          { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', marginTop: 14 },
                                        ]}
                                        onPress={() => handleOpenStudentDetailModal(r)}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#1D4ED8' }}>
                                          ✏️ Kodlamaları Gör & Düzenle
                                        </Text>
                                      </TouchableOpacity>

                                      <TouchableOpacity
                                        style={[
                                          styles.smallActionBtn,
                                          { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', marginTop: 14 },
                                        ]}
                                        onPress={() => handleExcludePreviewLine(r.lineIndex)}
                                      >
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>
                                          🗑️ Sil / Hariç Tut
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
              )}

            </ScrollView>

            {/* SABİT FOOTER BUTON ÇUBUĞU */}
            <View style={[styles.modalBtnRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12, marginTop: 6 }]}>
              <TouchableOpacity
                style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', cursor: 'pointer' as any }]}
                onPress={() => handleRunEvaluation(false)}
                disabled={actionLoading}
              >
                <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>
                  🔎 Önizle & Hataları Kontrol Et
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, { cursor: 'pointer' as any }]}
                onPress={() => handleRunEvaluation(true)}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    🎯 Değerlendir, Dereceleri ve Karneleri Kaydet
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {renderStudentReportModal()}
      {renderStudentDetailModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  headerBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  headerBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  headerBannerSub: {
    fontSize: 12,
    color: '#1D4ED8',
    marginTop: 4,
  },
  subTabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  subTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  subTabBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  subTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  subTabTextActive: {
    color: '#FFFFFF',
  },
  topActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginVertical: 8,
  },
  primaryBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  smallActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  smallActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptyCardSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  examCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  examCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
  },
  examTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  examMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  visibilityBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  visibilitySwitchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visibilityLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  scoreBadge: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  scoreBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E9D5FF',
  },
  scoreBadgeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  statMiniBox: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statMiniVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statMiniLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  rankingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  rankChip: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rankChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  lessonChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  lessonNetChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lessonNetName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  lessonNetDetail: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  openReportBtn: {
    marginTop: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  openReportBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  examSelectorChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 8,
  },
  examSelectorChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1E40AF',
  },
  examSelectorChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  analyticsSwitchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  analyticsSwitchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  analyticsSwitchBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  analyticsSwitchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  classFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  classFilterChipActive: {
    backgroundColor: '#2563EB',
  },
  classFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rankBadgeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    minWidth: 58,
  },
  rankBadgeNum: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  rankBadgeSub: {
    fontSize: 10,
    color: '#64748B',
  },
  resultStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  resultStudentStats: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  karneBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  karneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  classCompareRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kazanimRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 8,
  },
  kazanimTopicTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  kazanimDescText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  kazanimCountsText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
  questionStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  modalLargeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '96%',
    maxWidth: 880,
  },
  modalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  modalLargeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalLargeSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  reportLessonBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  reportLessonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  reportLessonTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  reportLessonStats: {
    fontSize: 12,
    color: '#475569',
  },
  qCell: {
    width: 28,
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qCellNum: {
    fontSize: 9,
    color: '#64748B',
  },
  qCellAns: {
    fontSize: 11,
    fontWeight: '800',
  },
  qCellKey: {
    fontSize: 9,
    color: '#94A3B8',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  fmtBox: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
  },
  coordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  coordItem: {
    flex: 1,
    minWidth: 155,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactNumInput: {
    width: 68,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  coordTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  lessonKeyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  sortToolbarBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    cursor: 'pointer' as any,
  },
  sortPillActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1E40AF',
  },
  sortPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  exportActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 6,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeaderRowTop: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderTopWidth: 1,
    borderBottomWidth: 2,
    borderColor: '#CBD5E1',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
  },
  tCell: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  tHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
  },
  tHeaderSubText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tLessonGroupHeader: {
    backgroundColor: '#EFF6FF',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    justifyContent: 'space-between',
  },
  tLessonGroupTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1E3A8A',
    paddingHorizontal: 4,
  },
  tLessonSubRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  tSubCell: {
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  tSubHeaderText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
  },
  tDataCell: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  deleteRowMiniBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evalClassFilterBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  previewContainerBox: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
  },
  previewRowCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  bookletPickBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookletPickBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  bookletPickBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
});

