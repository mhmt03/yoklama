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
import { apiRequest } from '../services/apiClient';
import { showAlert, showConfirm } from '../utils/webAlertPolyfill';

export interface OptikModuleViewProps {
  schoolId?: string;
  mode: 'admin' | 'teacher' | 'student';
  studentNumber?: string;
}

export const OptikModuleView: React.FC<OptikModuleViewProps> = ({
  schoolId,
  mode,
  studentNumber,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'forms' | 'analytics'>('exams');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [forms, setForms] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // Analitik & Sonuç State
  const [analyticsTab, setAnalyticsTab] = useState<'results' | 'charts' | 'questions'>('results');
  const [examResults, setExamResults] = useState<any[]>([]);
  const [examStats, setExamStats] = useState<any | null>(null);
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestionLesson, setSelectedQuestionLesson] = useState<string>('');

  // Öğrenci Detaylı Karne Modalı
  const [reportModalData, setReportModalData] = useState<any | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Form Tanımlama / Düzenleme Modalı
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingForm, setEditingForm] = useState<any>({
    id: undefined,
    formAdi: '',
    numaraBaslangic: 0,
    numaraUzunluk: 5,
    adSoyadBaslangic: 5,
    adSoyadUzunluk: 20,
    sinifBaslangic: 25,
    sinifUzunluk: 4,
    kitapcikTuruBaslangic: 29,
    kitapcikTuruUzunluk: 1,
    sampleLine: '00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD',
    dersler: [
      { dersAdi: 'Türk Dili ve Edebiyatı', baslangicSutun: 30, karakterSayisi: 20, siraNo: 1 },
      { dersAdi: 'Matematik', baslangicSutun: 50, karakterSayisi: 20, siraNo: 2 },
      { dersAdi: 'Fizik', baslangicSutun: 70, karakterSayisi: 10, siraNo: 3 },
    ],
  });
  const [fmtRawInput, setFmtRawInput] = useState('');
  const [showFmtBox, setShowFmtBox] = useState(false);

  // Sınav Tanımlama / Düzenleme Modalı
  const [examModalVisible, setExamModalVisible] = useState(false);
  const [editingExam, setEditingExam] = useState<any>({
    id: undefined,
    sinavAdi: '',
    uygulamaTarihi: new Date().toISOString().slice(0, 10),
    yanlisDogruyuGotururSayisi: 4,
    hedefSiniflar: '',
    kitapcikTurleri: 'A,B',
    optikFormId: '',
    tabanPuan: 100,
    toplamPuan: 500,
    isPublishedToStudents: false,
    showRankingToStudents: false,
    isVisibleToTeachers: true,
    hasKazanimAnalysis: false,
    dersler: [
      { dersAdi: 'Türk Dili ve Edebiyatı', soruSayisi: 20, katsayi: 1.5, siraNo: 1, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
      { dersAdi: 'Matematik', soruSayisi: 20, katsayi: 2.0, siraNo: 2, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
      { dersAdi: 'Fizik', soruSayisi: 10, katsayi: 1.5, siraNo: 3, cevapAnahtariA: 'ABCDABCDAB', cevapAnahtariB: 'BCDABCDABA' },
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

  const loadInitialData = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const studentParam = studentNumber ? `&studentNumber=${encodeURIComponent(studentNumber)}` : '';
      const [examsRes, formsRes] = await Promise.all([
        apiRequest<any[]>(`Optik/exams?schoolId=${schoolId}${studentParam}`, 'GET'),
        mode === 'admin'
          ? apiRequest<any[]>(`Optik/forms?schoolId=${schoolId}`, 'GET')
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
  }, [schoolId, mode, studentNumber, selectedExamId]);

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
    // Optimistic UI update
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

  // Optik Form Kaydetme
  const handleSaveForm = async () => {
    if (!editingForm.formAdi?.trim()) {
      showAlert('Uyarı', 'Lütfen form şablonu için bir ad giriniz.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Optik/forms', 'POST', {
        ...editingForm,
        schoolId,
      });
      if (res.success) {
        setFormModalVisible(false);
        showAlert('Başarılı ✅', 'Optik form şablonu kaydedildi.');
        loadInitialData();
      } else {
        showAlert('Hata', res.error || 'Form kaydedilemedi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // .FMT Dosyası Çözümleme
  const handleParseFmt = async () => {
    if (!fmtRawInput.trim()) {
      showAlert('Uyarı', 'Lütfen .fmt dosya içeriğini yapıştırın veya dosya seçin.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Optik/forms/parse-fmt', 'POST', {
        fmtContent: fmtRawInput,
        formName: editingForm.formAdi || 'Çözümlenen Optik Form',
      });
      if (res.success && res.data?.parsedForm) {
        const pf = res.data.parsedForm;
        setEditingForm((prev: any) => ({
          ...prev,
          formAdi: pf.formAdi || prev.formAdi,
          numaraBaslangic: pf.numaraBaslangic,
          numaraUzunluk: pf.numaraUzunluk,
          adSoyadBaslangic: pf.adSoyadBaslangic,
          adSoyadUzunluk: pf.adSoyadUzunluk,
          sinifBaslangic: pf.sinifBaslangic,
          sinifUzunluk: pf.sinifUzunluk,
          kitapcikTuruBaslangic: pf.kitapcikTuruBaslangic,
          kitapcikTuruUzunluk: pf.kitapcikTuruUzunluk,
          dersler: pf.dersler?.length > 0 ? pf.dersler : prev.dersler,
        }));
        setShowFmtBox(false);
        showAlert('Başarılı 🪄', res.data.message);
      } else {
        showAlert('Hata', res.error || '.FMT çözümlenemedi.');
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
      const res = await apiRequest<any>('Optik/exams', 'POST', {
        ...editingExam,
        schoolId,
        optikFormId: editingExam.optikFormId || (forms[0]?.id ?? null),
      });
      if (res.success) {
        setExamModalVisible(false);
        showAlert('Başarılı ✅', 'Optik sınav ve cevap anahtarları kaydedildi.');
        loadInitialData();
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

  // Kazanım Modalı Açma
  const handleOpenKazanimModal = async (exam: any) => {
    setKazanimExam(exam);
    const firstLesson = exam.dersler?.[0]?.dersAdi || '';
    setKazanimSelectedLesson(firstLesson);
    setActionLoading(true);
    try {
      const res = await apiRequest<any[]>(`Optik/exams/${exam.id}/kazanimlar`, 'GET');
      const existing = res.success && Array.isArray(res.data) ? res.data : [];

      // Her dersin her sorusu için satır oluştur
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
      // Format: "1;Konu Adı;Kazanım Açıklaması" veya sadece "Konu Adı"
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

  // Optik Okuma Modalını Açma
  const handleOpenEvalModal = (exam: any) => {
    setEvalExam(exam);
    setEvalFormId(exam.optikFormId || forms[0]?.id || '');
    setEvalPreviewResults(null);
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

      if (Platform.OS === 'web' && (asset as any).file) {
        const text = await (asset as any).file.text();
        setEvalTxtContent(text);
      } else {
        const resp = await fetch(asset.uri);
        const text = await resp.text();
        setEvalTxtContent(text);
      }
    } catch (e: any) {
      showAlert('Dosya Okuma Hatası', e?.message || 'Optik dosya okunamadı.');
    }
  };

  // Okuldaki gerçek öğrencilerle tek tıkla örnek optik TXT verisi üretme
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
      const numBas = selectedForm?.numaraBaslangic ?? 0;
      const numUz = selectedForm?.numaraUzunluk ?? 5;
      const adBas = selectedForm?.adSoyadBaslangic ?? 5;
      const adUz = selectedForm?.adSoyadUzunluk ?? 20;
      const sinifBas = selectedForm?.sinifBaslangic ?? 25;
      const sinifUz = selectedForm?.sinifUzunluk ?? 4;
      const kitBas = selectedForm?.kitapcikTuruBaslangic ?? 29;

      const options = ['A', 'B', 'C', 'D', 'E'];
      const generatedLines: string[] = [];

      students.forEach((st: any, idx: number) => {
        const lineArr = new Array(240).fill(' ');
        const noStr = String(st.studentNumber || idx + 1).padStart(numUz, '0').slice(0, numUz);
        for (let i = 0; i < noStr.length; i++) lineArr[numBas + i] = noStr[i];

        const nameStr = String(st.fullName || 'OGRENCI').toUpperCase().padEnd(adUz, ' ').slice(0, adUz);
        for (let i = 0; i < nameStr.length; i++) lineArr[adBas + i] = nameStr[i];

        const clsStr = `${st.grade || '9'}${st.section || 'A'}`.padEnd(sinifUz, ' ').slice(0, sinifUz);
        for (let i = 0; i < clsStr.length; i++) lineArr[sinifBas + i] = clsStr[i];

        const booklet = idx % 2 === 0 ? 'A' : 'B';
        lineArr[kitBas] = booklet;

        let currentCol = 30;
        (evalExam.dersler || []).forEach((d: any, dIdx: number) => {
          const formDers = selectedForm?.dersler?.[dIdx];
          const colStart = formDers?.baslangicSutun ?? currentCol;
          const qCount = d.soruSayisi || 20;
          const keyStr = (booklet === 'B' && d.cevapAnahtariB ? d.cevapAnahtariB : d.cevapAnahtariA) || 'ABCDABCDABCDABCDABCD';

          for (let q = 0; q < qCount; q++) {
            const correctChar = keyStr[q] || 'A';
            // Gerçekçi başarı dağılımı: %70 doğru, %20 yanlış, %10 boş
            const roll = (idx * 7 + q * 3 + dIdx * 5) % 10;
            let ans = correctChar;
            if (roll === 8) ans = ' ';
            else if (roll === 9 || (idx % 4 === 3 && q % 3 === 0)) {
              ans = options[(options.indexOf(correctChar) + 1) % 4];
            }
            lineArr[colStart + q] = ans;
          }
          currentCol = colStart + qCount;
        });

        generatedLines.push(lineArr.join('').trimEnd());
      });

      setEvalTxtContent(generatedLines.join('\n'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunEvaluation = async (saveResults: boolean) => {
    if (!evalExam || !evalTxtContent.trim()) {
      showAlert('Uyarı', 'Lütfen optik veri satırlarını yükleyin veya yapıştırın.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Optik/evaluate', 'POST', {
        sinavId: evalExam.id,
        formId: evalFormId || undefined,
        txtContent: evalTxtContent,
        saveResults,
        numarasizlariDahilEt: true,
      });

      if (res.success && res.data) {
        setEvalPreviewResults(res.data.results || []);
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
              <TouchableOpacity style={styles.closeBtn} onPress={() => setReportModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕ Kapat</Text>
              </TouchableOpacity>
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

                  {/* 1. Ders Bazlı Karşılaştırma ve Cevap Anahtarı Şeridi */}
                  <Text style={styles.sectionHeading}>📚 Ders Bazlı Performans & Soru Cevap Anahtarı</Text>
                  {lessons.map((l: any, idx: number) => (
                    <View key={idx} style={styles.reportLessonBox}>
                      <View style={styles.reportLessonHeader}>
                        <Text style={styles.reportLessonTitle}>{l.dersAdi}</Text>
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
  // ÖĞRETMEN VE ADMİN GÖRÜNÜMÜ (mode === 'admin' | mode === 'teacher')
  // =========================================================================
  const uniqueClasses = Array.from(new Set(examResults.map((r) => r.sinif).filter(Boolean)));
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

  // Canlı örnek satır önizlemesi (Optik Form Sihirbazı için)
  const sampleLine = editingForm.sampleLine || '';
  const slicePreview = (start: number, len: number) => {
    if (!sampleLine || start < 0 || len <= 0) return '-';
    return sampleLine.substring(start, start + len) || '(boş)';
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
                  uygulamaTarihi: new Date().toISOString().slice(0, 10),
                  yanlisDogruyuGotururSayisi: 4,
                  hedefSiniflar: '',
                  kitapcikTurleri: 'A,B',
                  optikFormId: forms[0]?.id || '',
                  tabanPuan: 100,
                  toplamPuan: 500,
                  isPublishedToStudents: false,
                  showRankingToStudents: false,
                  isVisibleToTeachers: true,
                  hasKazanimAnalysis: false,
                  dersler: [
                    { dersAdi: 'Türk Dili ve Edebiyatı', soruSayisi: 20, katsayi: 1.5, siraNo: 1, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
                    { dersAdi: 'Matematik', soruSayisi: 20, katsayi: 2.0, siraNo: 2, cevapAnahtariA: 'ABCDABCDABCDABCDABCD', cevapAnahtariB: 'BCDABCDABCDABCDABCDA' },
                    { dersAdi: 'Fizik', soruSayisi: 10, katsayi: 1.5, siraNo: 3, cevapAnahtariA: 'ABCDABCDAB', cevapAnahtariB: 'BCDABCDABA' },
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
                    <Text style={styles.examTitle}>{exam.sinavAdi}</Text>
                    <Text style={styles.examMeta}>
                      📅 {new Date(exam.uygulamaTarihi).toLocaleDateString('tr-TR')} · 👥 Katılımcı: {exam.participantCount} Öğrenci · 📈 Ort. Net: {exam.averageNet} · Ort. Puan: {exam.averageScore}
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
            <Text style={styles.sectionHeading}>📋 Optik Form Koordinat Şablonları</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setEditingForm({
                  id: undefined,
                  formAdi: `Optik Form Şablonu - ${forms.length + 1}`,
                  numaraBaslangic: 0,
                  numaraUzunluk: 5,
                  adSoyadBaslangic: 5,
                  adSoyadUzunluk: 20,
                  sinifBaslangic: 25,
                  sinifUzunluk: 4,
                  kitapcikTuruBaslangic: 29,
                  kitapcikTuruUzunluk: 1,
                  sampleLine: '00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD',
                  dersler: [
                    { dersAdi: 'Türk Dili ve Edebiyatı', baslangicSutun: 30, karakterSayisi: 20, siraNo: 1 },
                    { dersAdi: 'Matematik', baslangicSutun: 50, karakterSayisi: 20, siraNo: 2 },
                  ],
                });
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
                    Öğrenci No: [{f.numaraBaslangic}..{f.numaraBaslangic + f.numaraUzunluk}] · Ad Soyad: [{f.adSoyadBaslangic}..{f.adSoyadBaslangic + f.adSoyadUzunluk}] · Sınıf: [{f.sinifBaslangic}..{f.sinifBaslangic + f.sinifUzunluk}] · Kitapçık: [{f.kitapcikTuruBaslangic ?? '-'}]
                  </Text>
                  <View style={styles.lessonChipsRow}>
                    {(f.dersler || []).map((d: any, i: number) => (
                      <View key={i} style={styles.lessonNetChip}>
                        <Text style={styles.lessonNetName}>{d.dersAdi}</Text>
                        <Text style={styles.lessonNetDetail}>
                          Sütun: {d.baslangicSutun} · Uzunluk: {d.karakterSayisi} Soru
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  onPress={() => {
                    setEditingForm(f);
                    setFormModalVisible(true);
                  }}
                >
                  <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>✏️ Şablonu Düzenle</Text>
                </TouchableOpacity>
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
                /* A. ÖĞRENCİ SONUÇ LİSTESİ & KARNE BUTONU */
                <View style={styles.examCard}>
                  <View style={styles.filterBar}>
                    <TextInput
                      style={[styles.textInput, { flex: 1, minWidth: 180 }]}
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
                      {uniqueClasses.map((cls) => (
                        <TouchableOpacity
                          key={cls}
                          style={[styles.classFilterChip, classFilter === cls && styles.classFilterChipActive]}
                          onPress={() => setClassFilter(cls)}
                        >
                          <Text style={[styles.classFilterText, classFilter === cls && { color: '#FFF' }]}>{cls}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {filteredResults.length === 0 ? (
                    <Text style={{ padding: 16, color: '#64748B', textAlign: 'center' }}>
                      Bu kriterlere uygun değerlendirilmiş öğrenci sonucu bulunamadı.
                    </Text>
                  ) : (
                    filteredResults.map((r) => (
                      <View key={r.id} style={styles.resultRow}>
                        <View style={styles.rankBadgeBox}>
                          <Text style={styles.rankBadgeNum}>#{r.okulSirasi}</Text>
                          <Text style={styles.rankBadgeSub}>{r.sinif} #{r.sinifSirasi}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultStudentName}>
                            {r.adSoyad} <Text style={{ fontWeight: '500', color: '#64748B' }}>({r.ogrenciNo} · {r.sinif} · Kitapçık {r.kitapcikTuru})</Text>
                          </Text>
                          <Text style={styles.resultStudentStats}>
                            ✅ {r.toplamDogru}D · ❌ {r.toplamYanlis}Y · ⭕ {r.toplamBos}B ·{' '}
                            <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>{r.toplamNet} Net</Text> ·{' '}
                            <Text style={{ fontWeight: '800', color: '#7C3AED' }}>{r.puan} Puan</Text>
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.karneBtn}
                          onPress={() => handleOpenStudentReport(selectedExamId, r.id || r.ogrenciNo)}
                        >
                          <Text style={styles.karneBtnText}>📄 Karne</Text>
                        </TouchableOpacity>
                      </View>
                    ))
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
                    ).map((q: any) => (
                      <View key={q.soruNo} style={styles.questionStatRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                            Soru #{q.soruNo} (Doğru Cevap: {q.dogruCevapA}) — {q.konuAdi}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                            Şık Dağılımı: A:{q.secenekDagilimi.A} · B:{q.secenekDagilimi.B} · C:{q.secenekDagilimi.C} · D:{q.secenekDagilimi.D} · E:{q.secenekDagilimi.E} · Boş:{q.secenekDagilimi.Bos}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor:
                                q.dogruYuzdesi >= 75 ? '#DCFCE7' : q.dogruYuzdesi >= 45 ? '#FEF3C7' : '#FEE2E2',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              {
                                color:
                                  q.dogruYuzdesi >= 75 ? '#15803D' : q.dogruYuzdesi >= 45 ? '#B45309' : '#DC2626',
                              },
                            ]}
                          >
                            %{q.dogruYuzdesi} ({q.zorlukDuzeyi})
                          </Text>
                        </View>
                      </View>
                    ))}
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
          <View style={[styles.modalLargeCard, { maxHeight: '92%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalLargeTitle}>📋 Optik Form Sihirbazı & Koordinat Doğrulama</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setFormModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.inputLabel}>Form Şablon Adı:</Text>
                <TouchableOpacity onPress={() => setShowFmtBox(!showFmtBox)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>
                    🪄 {showFmtBox ? '.FMT Kutusunu Gizle' : '.FMT Dosyası Yükle / Yapıştır'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.textInput}
                value={editingForm.formAdi}
                onChangeText={(t) => setEditingForm((p: any) => ({ ...p, formAdi: t }))}
                placeholder="Örn: LGS / YKS 120 Soru Standart Optik Form"
              />

              {showFmtBox && (
                <View style={styles.fmtBox}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#4C1D95', marginBottom: 4 }}>
                    🪄 .FMT İçeriğini Yapıştırın (Öğrenci No, Ad, Sınıf ve Ders Koordinatlarını Otomatik Çıkarır):
                  </Text>
                  <TextInput
                    style={[styles.textInput, { height: 90, textAlignVertical: 'top' }]}
                    multiline
                    value={fmtRawInput}
                    onChangeText={setFmtRawInput}
                    placeholder={'OGRENCINO=1,5\nADSOYAD=6,20\nSINIF=26,4\nKITAPCIK=30,1\nTURKCE=31,20\nMATEMATIK=51,20'}
                  />
                  <TouchableOpacity style={[styles.primaryBtn, { marginTop: 8, alignSelf: 'flex-start' }]} onPress={handleParseFmt}>
                    <Text style={styles.primaryBtnText}>🪄 Koordinatları Otomatik Çözümle</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.inputLabel}>Canlı Doğrulama İçin Örnek Optik TXT Satırı:</Text>
              <TextInput
                style={[styles.textInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}
                value={editingForm.sampleLine}
                onChangeText={(t) => setEditingForm((p: any) => ({ ...p, sampleLine: t }))}
              />

              {/* Koordinat Girişleri + Canlı Kesit Önizlemesi */}
              <View style={styles.coordGrid}>
                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Öğrenci No (Önizleme: "{slicePreview(editingForm.numaraBaslangic, editingForm.numaraUzunluk)}")
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.numaraBaslangic)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, numaraBaslangic: parseInt(t || '0', 10) || 0 }))}
                      placeholder="Başlangıç"
                    />
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.numaraUzunluk)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, numaraUzunluk: parseInt(t || '5', 10) || 5 }))}
                      placeholder="Uzunluk"
                    />
                  </View>
                </View>

                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Ad Soyad (Önizleme: "{slicePreview(editingForm.adSoyadBaslangic, editingForm.adSoyadUzunluk)}")
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.adSoyadBaslangic)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, adSoyadBaslangic: parseInt(t || '0', 10) || 0 }))}
                    />
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.adSoyadUzunluk)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, adSoyadUzunluk: parseInt(t || '20', 10) || 20 }))}
                    />
                  </View>
                </View>

                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Sınıf/Şube (Önizleme: "{slicePreview(editingForm.sinifBaslangic, editingForm.sinifUzunluk)}")
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.sinifBaslangic)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, sinifBaslangic: parseInt(t || '0', 10) || 0 }))}
                    />
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.sinifUzunluk)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, sinifUzunluk: parseInt(t || '4', 10) || 4 }))}
                    />
                  </View>
                </View>

                <View style={styles.coordItem}>
                  <Text style={styles.coordTitle}>
                    Kitapçık (Önizleme: "{slicePreview(editingForm.kitapcikTuruBaslangic ?? 29, editingForm.kitapcikTuruUzunluk ?? 1)}")
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.kitapcikTuruBaslangic ?? 29)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, kitapcikTuruBaslangic: parseInt(t || '0', 10) || 0 }))}
                    />
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      keyboardType="numeric"
                      value={String(editingForm.kitapcikTuruUzunluk ?? 1)}
                      onChangeText={(t) => setEditingForm((p: any) => ({ ...p, kitapcikTuruUzunluk: parseInt(t || '1', 10) || 1 }))}
                    />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={styles.sectionHeading}>📚 Formdaki Ders Sütunları</Text>
                <TouchableOpacity
                  onPress={() => {
                    const list = [...(editingForm.dersler || [])];
                    const last = list[list.length - 1];
                    const nextStart = last ? last.baslangicSutun + last.karakterSayisi : 30;
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

              {(editingForm.dersler || []).map((d: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <TextInput
                    style={[styles.textInput, { flex: 2 }]}
                    value={d.dersAdi}
                    placeholder="Ders Adı"
                    onChangeText={(t) => {
                      const arr = [...editingForm.dersler];
                      arr[idx] = { ...arr[idx], dersAdi: t };
                      setEditingForm((p: any) => ({ ...p, dersler: arr }));
                    }}
                  />
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    keyboardType="numeric"
                    value={String(d.baslangicSutun)}
                    placeholder="Başlangıç"
                    onChangeText={(t) => {
                      const arr = [...editingForm.dersler];
                      arr[idx] = { ...arr[idx], baslangicSutun: parseInt(t || '0', 10) || 0 };
                      setEditingForm((p: any) => ({ ...p, dersler: arr }));
                    }}
                  />
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    keyboardType="numeric"
                    value={String(d.karakterSayisi)}
                    placeholder="Soru Sayısı"
                    onChangeText={(t) => {
                      const arr = [...editingForm.dersler];
                      arr[idx] = { ...arr[idx], karakterSayisi: parseInt(t || '10', 10) || 10 };
                      setEditingForm((p: any) => ({ ...p, dersler: arr }));
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const arr = editingForm.dersler.filter((_: any, i: number) => i !== idx);
                      setEditingForm((p: any) => ({ ...p, dersler: arr }));
                    }}
                  >
                    <Text style={{ color: '#DC2626', fontWeight: '700', paddingHorizontal: 6 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setFormModalVisible(false)}>
                  <Text style={styles.modalCancelBtnText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveForm} disabled={actionLoading}>
                  <Text style={styles.primaryBtnText}>💾 Form Şablonunu Kaydet</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 2: OPTİK SINAV & CEVAP ANAHTARI TANIMLAMA                        */}
      {/* ===================================================================== */}
      <Modal visible={examModalVisible} transparent animationType="fade" onRequestClose={() => setExamModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalLargeCard, { maxHeight: '92%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalLargeTitle}>📝 Optik Sınav & Cevap Anahtarı Tanımlama</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setExamModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
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
                  <Text style={styles.inputLabel}>Kaç Yanlış 1 Doğruyu Götürür? (0 = Götürmez):</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={String(editingExam.yanlisDogruyuGotururSayisi)}
                    onChangeText={(t) => setEditingExam((p: any) => ({ ...p, yanlisDogruyuGotururSayisi: parseFloat(t || '0') || 0 }))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <Text style={styles.sectionHeading}>🔑 Dersler ve Kitapçık Cevap Anahtarları</Text>
                <TouchableOpacity
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
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>+ Yeni Ders Ekle</Text>
                </TouchableOpacity>
              </View>

              {(editingExam.dersler || []).map((d: any, idx: number) => (
                <View key={idx} style={styles.lessonKeyCard}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <TextInput
                      style={[styles.textInput, { flex: 2 }]}
                      value={d.dersAdi}
                      placeholder="Ders Adı (Örn: Fizik)"
                      onChangeText={(t) => {
                        const arr = [...editingExam.dersler];
                        arr[idx] = { ...arr[idx], dersAdi: t };
                        setEditingExam((p: any) => ({ ...p, dersler: arr }));
                      }}
                    />
                    <TextInput
                      style={[styles.textInput, { width: 70 }]}
                      keyboardType="numeric"
                      value={String(d.soruSayisi)}
                      placeholder="Soru"
                      onChangeText={(t) => {
                        const arr = [...editingExam.dersler];
                        arr[idx] = { ...arr[idx], soruSayisi: parseInt(t || '20', 10) || 20 };
                        setEditingExam((p: any) => ({ ...p, dersler: arr }));
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const arr = editingExam.dersler.filter((_: any, i: number) => i !== idx);
                        setEditingExam((p: any) => ({ ...p, dersler: arr }));
                      }}
                    >
                      <Text style={{ color: '#DC2626', fontWeight: '700', paddingHorizontal: 6 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 2 }}>
                    A Kitapçığı Cevap Anahtarı ({(d.cevapAnahtariA || '').length}/{d.soruSayisi} Karakter - İptal: X, Herkese Doğru: H):
                  </Text>
                  <TextInput
                    style={[styles.textInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 6 }]}
                    value={d.cevapAnahtariA}
                    autoCapitalize="characters"
                    onChangeText={(t) => {
                      const arr = [...editingExam.dersler];
                      arr[idx] = { ...arr[idx], cevapAnahtariA: t.toUpperCase() };
                      setEditingExam((p: any) => ({ ...p, dersler: arr }));
                    }}
                  />

                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 2 }}>
                    B Kitapçığı Cevap Anahtarı ({(d.cevapAnahtariB || '').length}/{d.soruSayisi} Karakter):
                  </Text>
                  <TextInput
                    style={[styles.textInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}
                    value={d.cevapAnahtariB || ''}
                    autoCapitalize="characters"
                    onChangeText={(t) => {
                      const arr = [...editingExam.dersler];
                      arr[idx] = { ...arr[idx], cevapAnahtariB: t.toUpperCase() };
                      setEditingExam((p: any) => ({ ...p, dersler: arr }));
                    }}
                  />
                </View>
              ))}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setExamModalVisible(false)}>
                  <Text style={styles.modalCancelBtnText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveExam} disabled={actionLoading}>
                  <Text style={styles.primaryBtnText}>💾 Sınavı ve Anahtarları Kaydet</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
          <View style={[styles.modalLargeCard, { maxHeight: '92%' }]}>
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
                  style={[styles.smallActionBtn, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}
                  onPress={handleGenerateSampleOpticalLines}
                  disabled={actionLoading}
                >
                  <Text style={[styles.smallActionBtnText, { color: '#15803D' }]}>
                    🧪 Okuldaki Gerçek Öğrencilerle Örnek Optik Veri Üret (Test)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>
                Optik Veri Satırları ({evalTxtContent ? evalTxtContent.split(/\r?\n/).filter((x) => x.trim()).length : 0} Öğrenci Satırı):
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    height: 150,
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

              {evalPreviewResults && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.sectionHeading}>
                    🔎 Ön Değerlendirme Özeti ({evalPreviewResults.length} Öğrenci Okundu)
                  </Text>
                  {evalPreviewResults.slice(0, 6).map((r, i) => (
                    <Text key={i} style={{ fontSize: 12, color: '#334155', marginBottom: 3 }}>
                      #{r.okulSirasi} {r.adSoyad} ({r.ogrenciNo} - {r.sinif}) ➔ {r.toplamDogru}D {r.toplamYanlis}Y {r.toplamBos}B ={' '}
                      <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>{r.toplamNet} Net ({r.puan} Puan)</Text>
                    </Text>
                  ))}
                </View>
              )}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.smallActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  onPress={() => handleRunEvaluation(false)}
                  disabled={actionLoading}
                >
                  <Text style={[styles.smallActionBtnText, { color: '#1D4ED8' }]}>🔎 Önizle (Kaydetmeden Test Et)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => handleRunEvaluation(true)}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>🎯 Değerlendir, Dereceleri ve Karneleri Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {renderStudentReportModal()}
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
    padding: 18,
    width: '100%',
    maxWidth: 780,
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
    gap: 10,
    marginTop: 10,
  },
  coordItem: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
});

