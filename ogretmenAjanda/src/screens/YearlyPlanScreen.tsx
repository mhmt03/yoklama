import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { PdfViewerModal } from '../components/PdfViewerModal';
import {
  getYearlyPlans,
  createYearlyPlan,
  updateYearlyPlan,
  deleteYearlyPlan,
  deleteYearlyPlansByCourseAndGrade,
  getScheduleInfoForCourseAndGrade,
  bulkCreateYearlyPlanItems,
  CourseGradeScheduleInfo,
  getYearlyPlanDocument,
  YearlyPlanDocument,
} from '../database/operations/yearlyPlanOperations';
import { getCourses } from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import {
  generateYearlyPlanTemplateExcel,
  pickAndParseYearlyPlanExcel,
  pickAndAdaptYearlyPlanExcelWithAi,
  exportYearlyPlanToExcel,
  ParsedYearlyPlanRow,
} from '../utils/excelService';
import * as DocumentPicker from 'expo-document-picker';
import {
  analyzeUploadedDocument,
  convertRowsWithMapping,
  DocumentAnalysisResult,
  ColumnMappingSelection,
} from '../utils/columnMappingService';
import { getGeminiApiKey } from '../utils/geminiScheduleService';
import {
  pickAndSaveYearlyPlanPdf,
  viewYearlyPlanPdf,
  removeYearlyPlanPdf,
} from '../utils/pdfPlanService';
import { getTodayDateString, formatDateToTR } from '../utils/dateUtils';
import { getGradeLevels } from '../database/operations/gradeLevelOperations';
import { YearlyPlanItem, CourseName, ClassItem, GradeLevelItem } from '../types';
import { syncYearlyPlansFromSchool } from '../services/yearlyPlanSyncService';

import { ensureGradesAndClassesDefined } from '../utils/setupChecks';
export const YearlyPlanScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [courses, setCourses] = useState<CourseName[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelItem[]>([]);
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<number>(11);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [plans, setPlans] = useState<YearlyPlanItem[]>([]);
  const [syncingPlan, setSyncingPlan] = useState(false);

  // Schedule verification for selected course + grade level
  const [scheduleInfo, setScheduleInfo] = useState<CourseGradeScheduleInfo | null>(null);

  // Single Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<YearlyPlanItem | null>(null);
  const [formCourseId, setFormCourseId] = useState<number | null>(null);
  const [formGradeLevel, setFormGradeLevel] = useState<number>(11);
  const [formLessonHours, setFormLessonHours] = useState('4');
  const [formWeek, setFormWeek] = useState('1');
  const [formTopic, setFormTopic] = useState('');
  const [formOutcomes, setFormOutcomes] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  // Bulk Excel Import Modal State
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedYearlyPlanRow[]>([]);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelLoadingMsg, setExcelLoadingMsg] = useState('Excel dosyası okunuyor...');
  const [isAiPlanMode, setIsAiPlanMode] = useState(false);

  // Dynamic Document Column Mapping State
  const [docAnalysis, setDocAnalysis] = useState<DocumentAnalysisResult | null>(null);
  const [userMapping, setUserMapping] = useState<ColumnMappingSelection>({
    topicColIndex: null,
    outcomesColIndex: null,
    dateColIndex: null,
    weekColIndex: null,
    hoursColIndex: null,
  });
  const [activePickerField, setActivePickerField] = useState<
    'topic' | 'outcomes' | 'date' | 'week' | 'hours' | null
  >(null);

  // PDF Document State
  const [pdfDoc, setPdfDoc] = useState<YearlyPlanDocument | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfViewerModalVisible, setPdfViewerModalVisible] = useState(false);

  const loadData = async () => {
    try {
      const [crs, cls, gLevels] = await Promise.all([
        getCourses(),
        getClasses(),
        getGradeLevels(),
      ]);
      setCourses(crs);
      setClasses(cls);
      setGradeLevels(gLevels);

      let targetGrade = selectedGradeLevel;
      if (gLevels.length > 0 && !gLevels.some((g) => g.level === targetGrade)) {
        targetGrade = gLevels[0].level;
        setSelectedGradeLevel(targetGrade);
      }

      let targetCourseId = selectedCourseId;
      if (!targetCourseId && crs.length > 0) {
        // Try selecting S.FZK or first course
        const defaultCourse = crs.find((c) => c.code === 'S.FZK') || crs[0];
        targetCourseId = defaultCourse.id;
        setSelectedCourseId(targetCourseId);
      }

      if (targetCourseId) {
        // Verify schedule for selected course and grade
        const schedInfo = await getScheduleInfoForCourseAndGrade(targetCourseId, targetGrade);
        setScheduleInfo(schedInfo);

        // Fetch plans and pdf document for this grade level and course
        const [planList, doc] = await Promise.all([
          getYearlyPlans(targetCourseId, targetGrade),
          getYearlyPlanDocument(targetCourseId, targetGrade),
        ]);
        setPlans(planList);
        setPdfDoc(doc);
      }
    } catch (e) {
      console.error('Error loading yearly plans:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedCourseId, selectedGradeLevel])
  );

  const handleSelectGrade = (grade: number) => {
    setSelectedGradeLevel(grade);
  };

  const handleSelectCourse = (courseId: number) => {
    setSelectedCourseId(courseId);
  };

  // Single Add / Edit
  const handleOpenAdd = () => {
    if (!scheduleInfo?.hasSchedule) {
      Alert.alert(
        'Ders Programı Bulunamadı',
        `${selectedGradeLevel}. Sınıf için seçilen derse ait ders programı henüz tanımlanmamıştır. Yıllık plan konularının haftalık ders saatlerinize göre dağıtılabilmesi için önce Ders Programınızı oluşturunuz.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Ders Programına Git',
            onPress: () => navigation.navigate('Main', { screen: 'ScheduleTab' }),
          },
        ]
      );
      return;
    }

    setEditingPlan(null);
    setFormCourseId(selectedCourseId || (courses[0]?.id ?? null));
    setFormGradeLevel(selectedGradeLevel);
    setFormLessonHours(String(scheduleInfo?.totalWeeklyHours || 4));
    const nextWeek = plans.length > 0 ? Math.max(...plans.map((p) => p.week_number)) + 1 : 1;
    setFormWeek(String(nextWeek));
    setFormTopic('');
    setFormOutcomes('');
    setFormStartDate(getTodayDateString());
    setFormEndDate('');
    setModalVisible(true);
  };

  const handleOpenEdit = (item: YearlyPlanItem) => {
    setEditingPlan(item);
    setFormCourseId(item.course_id);
    setFormGradeLevel(item.grade_level || selectedGradeLevel);
    setFormLessonHours(String(item.lesson_hours || scheduleInfo?.totalWeeklyHours || 4));
    setFormWeek(String(item.week_number));
    setFormTopic(item.subject_topic);
    setFormOutcomes(item.learning_outcomes || '');
    setFormStartDate(item.date_start || '');
    setFormEndDate(item.date_end || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formCourseId) {
      Alert.alert('Uyarı', 'Lütfen bir ders seçiniz.');
      return;
    }
    if (!formTopic.trim()) {
      Alert.alert('Uyarı', 'Lütfen deftere yazılacak konuyu giriniz.');
      return;
    }
    const weekNum = parseInt(formWeek, 10);
    if (isNaN(weekNum) || weekNum < 1) {
      Alert.alert('Uyarı', 'Geçerli bir hafta numarası giriniz.');
      return;
    }
    const hoursNum = parseInt(formLessonHours, 10) || 0;
    if (hoursNum < 1) {
      Alert.alert('Uyarı', 'Lütfen bu konu için geçerli bir ders saati giriniz (Zorunlu - Örn: 2 veya 4).');
      return;
    }

    try {
      if (editingPlan) {
        await updateYearlyPlan(
          editingPlan.id,
          formCourseId,
          weekNum,
          formTopic.trim(),
          null,
          formStartDate.trim() || undefined,
          formEndDate.trim() || undefined,
          formOutcomes.trim() || undefined,
          formGradeLevel,
          hoursNum
        );
      } else {
        await createYearlyPlan(
          formCourseId,
          weekNum,
          formTopic.trim(),
          null,
          formStartDate.trim() || undefined,
          formEndDate.trim() || undefined,
          formOutcomes.trim() || undefined,
          formGradeLevel,
          hoursNum
        );
      }
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Yıllık plan kaydedilemedi.');
    }
  };

  const handleDelete = (item: YearlyPlanItem) => {
    Alert.alert(
      'Planı Sil',
      `"${item.week_number}. Hafta: ${item.subject_topic}" konusunu silmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteYearlyPlan(item.id);
              loadData();
            } catch (e) {
              Alert.alert('Hata', 'Kayıt silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleSyncYearlyPlanFromSchool = async () => {
    const currentCourse = courses.find((c) => c.id === selectedCourseId);
    const currentCourseName = currentCourse ? currentCourse.name : '';

    Alert.alert(
      'Okuldan Müfredat Planını Çek',
      'Okul idaresi (Admin) tarafından sisteme yüklenmiş olan yıllık müfredat planını sisteminize aktarmak istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: currentCourseName ? `Yalnızca "${currentCourseName}" Planını Çek` : 'Seçili Dersi Çek',
          onPress: async () => {
            try {
              setSyncingPlan(true);
              const res = await syncYearlyPlansFromSchool({
                courseId: selectedCourseId,
                courseName: currentCourseName,
                gradeLevel: selectedGradeLevel,
                syncAll: false,
              });
              setSyncingPlan(false);
              if (res.success) {
                Alert.alert('Başarılı ✨', res.message);
                loadData();
              } else {
                Alert.alert('Bilgi', res.message);
              }
            } catch (e: any) {
              setSyncingPlan(false);
              Alert.alert('Hata', e?.message || 'Plan çekilemedi.');
            }
          },
        },
        {
          text: 'Okuldaki Tüm Planları Çek',
          onPress: async () => {
            try {
              setSyncingPlan(true);
              const res = await syncYearlyPlansFromSchool({
                syncAll: true,
              });
              setSyncingPlan(false);
              if (res.success) {
                Alert.alert('Başarılı ✨', res.message);
                loadData();
              } else {
                Alert.alert('Bilgi', res.message);
              }
            } catch (e: any) {
              setSyncingPlan(false);
              Alert.alert('Hata', e?.message || 'Planlar çekilemedi.');
            }
          },
        },
      ]
    );
  };

  // Bulk Delete Entire Plan for this grade level & course
  const handleClearAllPlans = () => {
    if (!selectedCourseId || plans.length === 0) return;
    const courseObj = courses.find((c) => c.id === selectedCourseId);
    const courseName = courseObj ? courseObj.name : 'Ders';

    const buttons: any[] = [
      { text: 'Vazgeç', style: 'cancel' },
    ];

    if (pdfDoc) {
      buttons.push({
        text: 'Sadece Konuları Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteYearlyPlansByCourseAndGrade(selectedCourseId, selectedGradeLevel);
            await loadData();
            Alert.alert('Başarılı', `${selectedGradeLevel}. Sınıf ${courseName} yıllık plan konuları başarıyla silindi.`);
          } catch (e: any) {
            Alert.alert('Hata', 'Yıllık plan silinirken hata oluştu: ' + (e?.message || e));
          }
        },
      });
      buttons.push({
        text: "Konuları ve PDF'i Sil",
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteYearlyPlansByCourseAndGrade(selectedCourseId, selectedGradeLevel);
            await removeYearlyPlanPdf(selectedCourseId, selectedGradeLevel, pdfDoc.file_uri);
            setPdfDoc(null);
            await loadData();
            Alert.alert('Başarılı', `${selectedGradeLevel}. Sınıf ${courseName} yıllık planı ve PDF dosyası tamamen silindi.`);
          } catch (e: any) {
            Alert.alert('Hata', 'Yıllık plan silinirken hata oluştu: ' + (e?.message || e));
          }
        },
      });
    } else {
      buttons.push({
        text: 'Yıllık Planı Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteYearlyPlansByCourseAndGrade(selectedCourseId, selectedGradeLevel);
            await loadData();
            Alert.alert('Başarılı', `${selectedGradeLevel}. Sınıf ${courseName} yıllık planı (${plans.length} hafta) silindi.`);
          } catch (e: any) {
            Alert.alert('Hata', 'Yıllık plan silinirken hata oluştu: ' + (e?.message || e));
          }
        },
      });
    }

    Alert.alert(
      'Yıllık Planı Sil',
      `${selectedGradeLevel}. Sınıf ${courseName} dersine ait yüklü olan ${plans.length} haftalık müfredat planını tamamen silmek istediğinize emin misiniz?`,
      buttons
    );
  };

  // PDF / Word Document Handlers
  const handleUploadPdf = async () => {
    if (!selectedCourseId) {
      Alert.alert('Uyarı', 'Lütfen önce bir ders seçiniz.');
      return;
    }
    if (!(await ensureGradesAndClassesDefined('Yıllık plan ekleme'))) return;
    try {
      setLoadingPdf(true);
      const res = await pickAndSaveYearlyPlanPdf(selectedCourseId, selectedGradeLevel);
      if (res.success && res.document) {
        setPdfDoc(res.document);
        const isWord =
          res.document.file_name.toLowerCase().endsWith('.docx') ||
          res.document.file_name.toLowerCase().endsWith('.doc');
        Alert.alert(
          'Başarılı',
          `${selectedGradeLevel}. Sınıf yıllık plan ${isWord ? 'Word belgesi' : 'PDF dosyası'} sisteme başarıyla kaydedildi.`
        );
      } else if (res.error && res.error !== 'Dosya seçimi iptal edildi.') {
        Alert.alert('Hata', res.error);
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Belge yüklenirken bir sorun oluştu: ' + (e?.message || e));
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleViewPdf = () => {
    if (!pdfDoc) return;
    const isWord =
      pdfDoc.file_name.toLowerCase().endsWith('.docx') ||
      pdfDoc.file_name.toLowerCase().endsWith('.doc');

    if (isWord) {
      const activeCourse = courses.find((c) => c.id === selectedCourseId);
      const courseTitle = activeCourse ? activeCourse.name : 'Ders';
      viewYearlyPlanPdf(
        pdfDoc.file_uri,
        `${selectedGradeLevel}. Sınıf ${courseTitle} Yıllık Planı`
      );
    } else {
      setPdfViewerModalVisible(true);
    }
  };

  const handleDeletePdf = () => {
    if (!pdfDoc || !selectedCourseId) return;
    const isWord =
      pdfDoc.file_name.toLowerCase().endsWith('.docx') ||
      pdfDoc.file_name.toLowerCase().endsWith('.doc');
    Alert.alert(
      isWord ? 'Word Belgesini Sil' : 'PDF Planı Sil',
      `"${pdfDoc.file_name}" dosyasını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await removeYearlyPlanPdf(selectedCourseId, selectedGradeLevel, pdfDoc.file_uri);
            setPdfDoc(null);
          },
        },
      ]
    );
  };

  // Bulk Excel Handlers
  const handleOpenBulkModal = async () => {
    if (!(await ensureGradesAndClassesDefined('Yıllık plan ekleme'))) return;
    if (!scheduleInfo?.hasSchedule) {
      Alert.alert(
        'Ders Programı Bulunamadı',
        `${selectedGradeLevel}. Sınıf için seçilen derse ait ders programı henüz tanımlanmamıştır. Yıllık plan konularının haftalık ders saatlerinize göre dağıtılabilmesi için önce Ders Programınızı oluşturunuz.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Ders Programına Git',
            onPress: () => navigation.navigate('Main', { screen: 'ScheduleTab' }),
          },
        ]
      );
      return;
    }
    setParsedRows([]);
    setDocAnalysis(null);
    setActivePickerField(null);
    setBulkModalVisible(true);
  };

  // Dinamik Sütun Eşleştirme için Belge (Word / Excel) Seçimi
  const handlePickDocumentForMapping = async () => {
    try {
      setLoadingExcel(true);
      setExcelLoadingMsg('Belge seçiliyor ve başlık sütunları taranıyor...');

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/octet-stream',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setLoadingExcel(false);
        return;
      }

      const asset = result.assets[0];
      const fileName = (asset.name || '').toLowerCase();
      if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
        setLoadingExcel(false);
        Alert.alert(
          'Eski Format Uyarısı',
          'Seçtiğiniz dosya eski Word (.doc) formatındadır. Tablo analizi için lütfen dosyayı Word programında "Farklı Kaydet" yaparak .docx formatında kaydedip tekrar seçiniz.'
        );
        return;
      }

      setExcelLoadingMsg('Tablo sütunları ve yapay zeka önerileri taranıyor...');
      const analysis = await analyzeUploadedDocument(asset);
      setDocAnalysis(analysis);
      setUserMapping(analysis.suggestedMapping);
      setParsedRows([]);
      setIsAiPlanMode(true);
      setBulkModalVisible(true);
    } catch (e: any) {
      Alert.alert('Belge Analiz Hatası', e?.message || 'Dosya analiz edilemedi.');
    } finally {
      setLoadingExcel(false);
    }
  };

  // Kullanıcının onayladığı eşleştirmeyi satırlara uygula ve önizlemeye geç
  const handleApplyMappingAndPreview = () => {
    if (!docAnalysis) return;
    if (userMapping.topicColIndex === null) {
      Alert.alert('Eksik Seçim', 'Lütfen "Deftere Yazılacak Konu" sütununu seçiniz.');
      return;
    }

    try {
      const weeklyHours = scheduleInfo?.totalWeeklyHours || 4;
      const rows = convertRowsWithMapping(
        docAnalysis.rawRows,
        docAnalysis.headerRowIndex,
        userMapping,
        weeklyHours
      );
      setParsedRows(rows);
    } catch (e: any) {
      Alert.alert('Dönüştürme Hatası', e?.message || 'Plan satırları oluşturulamadı.');
    }
  };

  // Sisteme yüklenmiş planı Excel (.xlsx) veya orijinal belge olarak indir/paylaş
  const handleExportPlan = async () => {
    if (!selectedCourseId || plans.length === 0) return;
    const courseObj = courses.find((c) => c.id === selectedCourseId);
    const courseName = courseObj ? courseObj.name : 'Ders';
    const weeklyHours = scheduleInfo?.totalWeeklyHours || 4;

    if (pdfDoc) {
      const isWord =
        pdfDoc.file_name.toLowerCase().endsWith('.docx') ||
        pdfDoc.file_name.toLowerCase().endsWith('.doc');
      Alert.alert(
        'Yıllık Planı İndir / Paylaş',
        'Lütfen indirmek istediğiniz dosya biçimini seçiniz:',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: '📊 Excel Tablosu Olarak İndir (.xlsx)',
            onPress: async () => {
              try {
                await exportYearlyPlanToExcel(courseName, selectedGradeLevel, plans, weeklyHours);
              } catch (e: any) {
                Alert.alert('Hata', 'Excel indirilemedi: ' + (e?.message || e));
              }
            },
          },
          {
            text: `📄 Orijinal Belgeyi İndir / Paylaş (${isWord ? 'Word' : 'PDF'})`,
            onPress: () => {
              viewYearlyPlanPdf(
                pdfDoc.file_uri,
                `${selectedGradeLevel}. Sınıf ${courseName} Yıllık Planı`
              );
            },
          },
        ]
      );
    } else {
      try {
        await exportYearlyPlanToExcel(courseName, selectedGradeLevel, plans, weeklyHours);
      } catch (e: any) {
        Alert.alert('Hata', 'Excel oluşturulamadı: ' + (e?.message || e));
      }
    }
  };

  const handleDownloadTemplate = async () => {
    const activeCourse = courses.find((c) => c.id === selectedCourseId);
    const courseName = activeCourse ? activeCourse.name : 'Ders';
    const weeklyHours = scheduleInfo?.totalWeeklyHours || 4;

    try {
      setLoadingExcel(true);
      await generateYearlyPlanTemplateExcel(courseName, selectedGradeLevel, weeklyHours);
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı: ' + (e?.message || e));
    } finally {
      setLoadingExcel(false);
    }
  };

  const handlePickExcel = async () => {
    try {
      setExcelLoadingMsg('Excel dosyası okunuyor...');
      setLoadingExcel(true);
      const rows = await pickAndParseYearlyPlanExcel();
      if (rows.length === 0) {
        setLoadingExcel(false);
        return;
      }
      setIsAiPlanMode(false);
      setParsedRows(rows);
    } catch (e: any) {
      setLoadingExcel(false);
      Alert.alert(
        'Standart Format Uyarısı',
        (e?.message || 'Excel dosyası standart şablona uymuyor.') +
          '\n\nFarklı sitelerden (MEB, Zümre siteleri vb.) indirilmiş Excel dosyalarını Yapay Zeka (Gemini AI) ile otomatik analiz edip uygulamamıza uyarlamak ister misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: '✨ Yapay Zeka ile Dönüştür',
            onPress: handlePickExcelWithAi,
          },
        ]
      );
    } finally {
      setLoadingExcel(false);
    }
  };

  const handlePickExcelWithAi = async () => {
    const key = await getGeminiApiKey();
    if (!key) {
      Alert.alert(
        'Gemini API Anahtarı Gerekli 🔑',
        'Yapay zeka ile Excel dosyalarını otomatik dönüştürebilmek için önce Google Gemini API anahtarınızı tanımlamalısınız.\n\nİşlemler menüsünden ücretsiz anahtarınızı ekleyebilirsiniz.',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'İşlemler Menüsüne Git',
            onPress: () => {
              setBulkModalVisible(false);
              navigation.navigate('Main', { screen: 'OperationsTab' });
            },
          },
        ]
      );
      return;
    }

    const weeklyHours = scheduleInfo?.totalWeeklyHours || 4;

    try {
      setExcelLoadingMsg(
        'Yıllık plan belgesi (Excel / Word) yapay zeka (Gemini AI) ile taranıyor...\nFarklı sütun ve tablo başlıkları sınıf defterine uygun hale getiriliyor.'
      );
      setLoadingExcel(true);
      const rows = await pickAndAdaptYearlyPlanExcelWithAi(weeklyHours);
      if (rows.length === 0) {
        setLoadingExcel(false);
        return;
      }
      setIsAiPlanMode(true);
      setParsedRows(rows);
    } catch (e: any) {
      Alert.alert('Yapay Zeka Dönüştürme Hatası', e?.message || 'Belge yapay zeka ile dönüştürülemedi.');
    } finally {
      setLoadingExcel(false);
    }
  };

  const handleConfirmBulkSave = async () => {
    if (!selectedCourseId || parsedRows.length === 0) return;

    try {
      setLoadingExcel(true);
      const payload = parsedRows.map((r) => ({
        weekNumber: r.weekNumber,
        dateStart: r.dateStart || undefined,
        dateEnd: r.dateEnd || undefined,
        lessonHours: r.lessonHours || scheduleInfo?.totalWeeklyHours || 4,
        subjectTopic: r.subjectTopic,
        learningOutcomes: r.learningOutcomes || undefined,
      }));

      const res = await bulkCreateYearlyPlanItems(
        selectedCourseId,
        selectedGradeLevel,
        payload,
        true // replace existing
      );

      setBulkModalVisible(false);
      setParsedRows([]);
      await loadData();

      Alert.alert(
        'Yıllık Plan Yüklendi 🎉',
        `${selectedGradeLevel}. Sınıf için toplam ${res.insertedCount} haftalık müfredat planı başarıyla kaydedildi!\n\n` +
          `Haftalık ders saatleriniz: ${scheduleInfo?.totalWeeklyHours} Saat\n` +
          `Şubeler: ${scheduleInfo?.distinctClasses.join(', ')}\n\n` +
          `Derse girdiğinizde deftere yazılacak konu ana sayfada otomatik gösterilecektir.`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Yıllık plan kaydedilirken bir hata oluştu: ' + (e?.message || e));
    } finally {
      setLoadingExcel(false);
    }
  };

  const today = getTodayDateString();
  const activeCourseObj = courses.find((c) => c.id === selectedCourseId);

  return (
    <View style={styles.container}>
      <Header
        title="Yıllık Müfredat Planı"
        subtitle="Haftalık konu ve defter takibi"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'add',
          label: 'Ekle',
          onPress: handleOpenAdd,
        }}
      />

      {/* 1. Sınıf Düzeyi Seçicisi */}
      <View style={styles.levelBar}>
        <View style={styles.levelBarHeader}>
          <Text style={styles.levelBarLabel}>Sınıf Düzeyi:</Text>
          <TouchableOpacity
            style={styles.manageLevelsBtn}
            onPress={() => navigation.navigate('ScheduleManage', { initialTab: 'grades' })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={13} color={Colors.primary} />
            <Text style={styles.manageLevelsBtnText}>Düzeyleri Yönet</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levelScroll}>
          {gradeLevels.map((g) => {
            const isSel = selectedGradeLevel === g.level;
            return (
              <TouchableOpacity
                key={g.level}
                style={[styles.levelChip, isSel && styles.levelChipActive]}
                onPress={() => handleSelectGrade(g.level)}
              >
                <Text style={[styles.levelChipText, isSel && styles.levelChipTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Ders Seçicisi */}
      <View style={styles.courseChipsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {courses.map((crs) => {
            const isSelected = selectedCourseId === crs.id;
            return (
              <TouchableOpacity
                key={crs.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => handleSelectCourse(crs.id)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {crs.code ? `[${crs.code}] ` : ''}
                  {crs.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 5. Yıllık Plan Listesi */}
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeaderWrapper}>
            {/* 3. Ders Programı Doğrulama ve Saat Bilgi Kartı */}
            <View style={styles.statusSection}>
              {scheduleInfo?.hasSchedule ? (
                <View style={styles.verifiedScheduleCard}>
                  <View style={styles.verifiedRow}>
                    <View style={styles.verifiedIconWrap}>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.verifiedTitle}>
                          {selectedGradeLevel}. Sınıf Ders Programı Doğrulandı
                        </Text>
                        <View style={styles.hoursBadge}>
                          <Text style={styles.hoursBadgeText}>
                            Haftalık {scheduleInfo.totalWeeklyHours} Saat
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.verifiedSub}>
                        Şubeler: {scheduleInfo.distinctClasses.join(', ')} ({scheduleInfo.daysSummary})
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.warningScheduleCard}>
                  <View style={styles.warningRow}>
                    <Ionicons name="warning-outline" size={20} color="#B45309" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.warningTitle}>
                        {selectedGradeLevel}. Sınıf İçin Ders Programı Bulunamadı
                      </Text>
                      <Text style={styles.warningSub}>
                        Haftalık ders saatinin hesaplanması ve günlere dağıtılabilmesi için önce ders programınızı oluşturunuz.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.goToScheduleBtn}
                      onPress={() => navigation.navigate('Main', { screen: 'ScheduleTab' })}
                    >
                      <Text style={styles.goToScheduleBtnText}>Programa Git</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Okuldan Plan Çekme Butonu */}
            <View style={{ marginBottom: 10 }}>
              <TouchableOpacity
                style={styles.schoolSyncPlanBtn}
                onPress={handleSyncYearlyPlanFromSchool}
                disabled={syncingPlan}
                activeOpacity={0.8}
              >
                <View style={styles.schoolSyncPlanIconWrap}>
                  <Ionicons name="cloud-download" size={18} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.schoolSyncPlanTitle}>Okuldan Planı Çek</Text>
                    <View style={styles.schoolSyncPlanBadge}>
                      <Text style={styles.schoolSyncPlanBadgeText}>İDARE / MEB</Text>
                    </View>
                  </View>
                  <Text style={styles.schoolSyncPlanSub}>
                    {syncingPlan ? 'Planlar indiriliyor...' : 'Adminin eklediği müfredat planını kendi sisteminize tek tıkla aktarın'}
                  </Text>
                </View>
                {syncingPlan ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#4F46E5" />
                )}
              </TouchableOpacity>
            </View>

            {/* 4. Hızlı Aksiyon Şeridi (Excel/Word Yükle & Şablon İndir) */}
            <View style={styles.actionStrip}>
              <TouchableOpacity
                style={styles.actionStripBtn}
                onPress={handleOpenBulkModal}
              >
                <Ionicons name="cloud-upload-outline" size={17} color={Colors.primary} />
                <Text style={styles.actionStripBtnText}>Excel / Word ile Yıllık Plan Yükle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionStripSecondaryBtn}
                onPress={handleDownloadTemplate}
                disabled={loadingExcel}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.actionStripSecondaryBtnText}>Şablon İndir</Text>
              </TouchableOpacity>
            </View>

            {/* PDF / Word Dosyası Yönetim Çubuğu */}
            <View style={styles.pdfSectionContainer}>
              {pdfDoc ? (
                (() => {
                  const isWord =
                    pdfDoc.file_name.toLowerCase().endsWith('.docx') ||
                    pdfDoc.file_name.toLowerCase().endsWith('.doc');
                  return (
                    <View style={[styles.pdfBanner, isWord && styles.wordBanner]}>
                      <View style={[styles.pdfIconCircle, isWord && styles.wordIconCircle]}>
                        <Ionicons
                          name="document-text"
                          size={18}
                          color={isWord ? '#2563EB' : '#DC2626'}
                        />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text
                          style={[styles.pdfBannerTitle, isWord && styles.wordBannerTitle]}
                          numberOfLines={1}
                        >
                          {pdfDoc.file_name}
                        </Text>
                        <Text style={[styles.pdfBannerSub, isWord && styles.wordBannerSub]}>
                          {isWord
                            ? 'Yıllık Planın Orijinal Word Belgesi'
                            : 'Yıllık Planın Orijinal PDF Dosyası'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.pdfViewBtn, isWord && styles.wordViewBtn]}
                        onPress={handleViewPdf}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={isWord ? 'open-outline' : 'eye-outline'}
                          size={14}
                          color="#FFFFFF"
                        />
                        <Text style={styles.pdfViewBtnText}>{isWord ? 'Word Aç' : 'PDF Aç'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.pdfDeleteBtn}
                        onPress={handleDeletePdf}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  );
                })()
              ) : (
                <TouchableOpacity
                  style={styles.pdfAttachBtn}
                  onPress={handleUploadPdf}
                  activeOpacity={0.8}
                  disabled={loadingPdf}
                >
                  <Ionicons name="document-attach-outline" size={17} color={Colors.primary} />
                  <Text style={styles.pdfAttachBtnText}>
                    {loadingPdf
                      ? 'Belge Yükleniyor...'
                      : 'Yıllık Planın Orijinal Word (.docx) veya PDF Halini Sakla / Yükle'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 5. Yüklü Plan Bilgisi, İndirme ve Silme Butonları */}
            {plans.length > 0 && (
              <View style={styles.planSummaryBar}>
                <View style={styles.planSummaryLeft}>
                  <Ionicons name="layers-outline" size={16} color={Colors.primaryDark} />
                  <Text style={styles.planSummaryText}>
                    Yüklü Plan: <Text style={styles.planSummaryCount}>{plans.length} Hafta / Konu</Text>
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.exportPlanBtn}
                    onPress={handleExportPlan}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="download-outline" size={14} color="#059669" />
                    <Text style={styles.exportPlanBtnText}>Planı İndir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deletePlanAllBtn}
                    onPress={handleClearAllPlans}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                    <Text style={styles.deletePlanAllBtnText}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View>
            <EmptyState
              icon="calendar-outline"
              title={`${selectedGradeLevel}. Sınıf Planı Bulunmuyor`}
              description={`Bu ders ve sınıf düzeyi için henüz haftalık müfredat planı yüklenmemiş. İdarenin eklediği planı çekebilir veya Excel ile yükleyebilirsiniz.`}
              actionTitle="Excel ile Yükle"
              onAction={handleOpenBulkModal}
            />
            <View style={{ alignItems: 'center', marginTop: -6, marginBottom: 20 }}>
              <TouchableOpacity
                style={styles.emptySchoolSyncBtn}
                onPress={handleSyncYearlyPlanFromSchool}
                disabled={syncingPlan}
                activeOpacity={0.8}
              >
                <Ionicons name="cloud-download-outline" size={16} color="#4F46E5" />
                <Text style={styles.emptySchoolSyncBtnText}>Okuldan Planı Çek</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentWeek =
            item.date_start && item.date_end && item.date_start <= today && item.date_end >= today;

          return (
            <Card
              style={[styles.planCard, isCurrentWeek ? styles.planCardActive : null]}
              highlightBorder={isCurrentWeek ? Colors.success : Colors.primary}
            >
              <View style={styles.cardHeader}>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekText}>{item.week_number}. Hafta</Text>
                </View>

                <View style={styles.gradeBadge}>
                  <Text style={styles.gradeBadgeText}>
                    {item.grade_level || selectedGradeLevel}. Sınıf
                  </Text>
                </View>

                {item.lesson_hours ? (
                  <View style={styles.hoursPill}>
                    <Text style={styles.hoursPillText}>{item.lesson_hours} Saat</Text>
                  </View>
                ) : null}

                {isCurrentWeek ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Bu Hafta (Aktif)</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => handleOpenEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.topicTitle}>{item.subject_topic}</Text>

              {item.learning_outcomes ? (
                <Text style={styles.outcomesText}>{item.learning_outcomes}</Text>
              ) : null}

              {(item.date_start || item.date_end) && (
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.dateText}>
                    {formatDateToTR(item.date_start)} - {formatDateToTR(item.date_end)}
                  </Text>
                </View>
              )}
            </Card>
          );
        }}
      />

      {/* BULK EXCEL IMPORT MODAL */}
      <Modal visible={bulkModalVisible} animationType="fade" transparent onRequestClose={() => setBulkModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {selectedGradeLevel}. Sınıf Yıllık Plan Yükle
                </Text>
                <Text style={styles.modalSub}>
                  {activeCourseObj?.name} • Haftalık {scheduleInfo?.totalWeeklyHours || 4} Saat
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBulkModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingExcel ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#7C3AED" />
                  <Text style={styles.loadingText}>{excelLoadingMsg}</Text>
                </View>
              ) : parsedRows.length > 0 ? (
                <View>
                  <View style={[styles.previewHeader, isAiPlanMode && styles.previewHeaderAi]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#059669"
                      />
                      <Text style={styles.previewTitle}>
                        Plan Önizlemesi Hazır
                      </Text>
                    </View>
                    <Text style={styles.previewSub}>
                      Toplam {parsedRows.length} ders konusu {selectedGradeLevel}. Sınıf programınıza ({scheduleInfo?.totalWeeklyHours} Saat) göre hazırlandı.
                    </Text>
                  </View>

                  <Text style={styles.previewListTitle}>
                    Plan Önizlemesi (İlk {Math.min(parsedRows.length, 6)} Ders Bölümü):
                  </Text>
                  {parsedRows.slice(0, 6).map((r, idx) => (
                    <View key={`${r.weekNumber}-${idx}`} style={styles.previewItemCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.previewItemWeek}>{r.weekNumber}. Hafta</Text>
                        <View style={styles.previewHoursPill}>
                          <Text style={styles.previewHoursPillText}>{r.lessonHours} Saat</Text>
                        </View>
                      </View>
                      <Text style={styles.previewItemTopic}>{r.subjectTopic}</Text>
                      {r.learningOutcomes ? (
                        <Text style={styles.previewItemOutcomes} numberOfLines={2}>
                          {r.learningOutcomes}
                        </Text>
                      ) : null}
                      {(r.dateStart || r.dateEnd) && (
                        <Text style={styles.previewItemDates}>
                          {formatDateToTR(r.dateStart)} — {formatDateToTR(r.dateEnd)}
                        </Text>
                      )}
                    </View>
                  ))}
                  {parsedRows.length > 6 && (
                    <Text style={styles.moreWeeksText}>
                      ... ve diğer {parsedRows.length - 6} ders konusu
                    </Text>
                  )}
                </View>
              ) : docAnalysis ? (
                <View style={styles.mappingContainer}>
                  {/* Belge ve AI Durum Kartı */}
                  <View style={styles.mappingDocBanner}>
                    <View style={styles.mappingDocIconWrap}>
                      <Ionicons
                        name={docAnalysis.fileType === 'docx' ? 'document-text' : 'stats-chart'}
                        size={20}
                        color={docAnalysis.fileType === 'docx' ? '#2563EB' : '#059669'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mappingDocName} numberOfLines={1}>
                        {docAnalysis.fileName}
                      </Text>
                      <Text style={styles.mappingDocStats}>
                        {docAnalysis.columns.length} Sütun Tespit Edildi • {docAnalysis.rawRows.length} Satır
                      </Text>
                    </View>
                  </View>

                  {docAnalysis.aiReason ? (
                    <View style={styles.aiSuggestionNotice}>
                      <Ionicons name="sparkles" size={16} color="#7C3AED" />
                      <Text style={styles.aiSuggestionNoticeText}>
                        {docAnalysis.aiReason}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.mappingSectionTitle}>
                    Tablo Sütunlarını Eşleştirin:
                  </Text>

                  {/* 1. Konu Sütunu (Zorunlu) */}
                  <View style={styles.mappingFieldCard}>
                    <View style={styles.mappingFieldHeader}>
                      <Text style={styles.mappingFieldLabel}>📌 Deftere Yazılacak Konu Sütunu *</Text>
                      <Text style={styles.requiredBadge}>Zorunlu</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mappingSelectBtn}
                      onPress={() => setActivePickerField(activePickerField === 'topic' ? null : 'topic')}
                    >
                      <Text style={styles.mappingSelectBtnText}>
                        {userMapping.topicColIndex !== null
                          ? `Sütun ${userMapping.topicColIndex + 1}: ${docAnalysis.columns[userMapping.topicColIndex]?.headerName}`
                          : 'Sütun Seçiniz...'}
                      </Text>
                      <Ionicons
                        name={activePickerField === 'topic' ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {userMapping.topicColIndex !== null && docAnalysis.columns[userMapping.topicColIndex]?.sampleValues[0] && (
                      <Text style={styles.samplePreviewText} numberOfLines={2}>
                        Örnek Veri: "{docAnalysis.columns[userMapping.topicColIndex]?.sampleValues[0]}"
                      </Text>
                    )}

                    {activePickerField === 'topic' && (
                      <View style={styles.columnDropdown}>
                        {docAnalysis.columns.map((c) => (
                          <TouchableOpacity
                            key={c.index}
                            style={[
                              styles.columnOption,
                              userMapping.topicColIndex === c.index && styles.columnOptionSelected,
                            ]}
                            onPress={() => {
                              setUserMapping({ ...userMapping, topicColIndex: c.index });
                              setActivePickerField(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.columnOptionText,
                                userMapping.topicColIndex === c.index && styles.columnOptionTextSelected,
                              ]}
                            >
                              Sütun {c.index + 1}: {c.headerName}
                            </Text>
                            {c.sampleValues[0] && (
                              <Text style={styles.columnOptionSample} numberOfLines={1}>
                                ({c.sampleValues[0]})
                              </Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* 2. Kazanımlar Sütunu (Opsiyonel) */}
                  <View style={styles.mappingFieldCard}>
                    <View style={styles.mappingFieldHeader}>
                      <Text style={styles.mappingFieldLabel}>🎯 Kazanımlar / Açıklamalar Sütunu</Text>
                      <Text style={styles.optionalBadge}>Opsiyonel</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mappingSelectBtn}
                      onPress={() => setActivePickerField(activePickerField === 'outcomes' ? null : 'outcomes')}
                    >
                      <Text style={styles.mappingSelectBtnText}>
                        {userMapping.outcomesColIndex !== null
                          ? `Sütun ${userMapping.outcomesColIndex + 1}: ${docAnalysis.columns[userMapping.outcomesColIndex]?.headerName}`
                          : 'Seçilmedi (Yok)'}
                      </Text>
                      <Ionicons
                        name={activePickerField === 'outcomes' ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {userMapping.outcomesColIndex !== null && docAnalysis.columns[userMapping.outcomesColIndex]?.sampleValues[0] && (
                      <Text style={styles.samplePreviewText} numberOfLines={2}>
                        Örnek Veri: "{docAnalysis.columns[userMapping.outcomesColIndex]?.sampleValues[0]}"
                      </Text>
                    )}

                    {activePickerField === 'outcomes' && (
                      <View style={styles.columnDropdown}>
                        <TouchableOpacity
                          style={[styles.columnOption, userMapping.outcomesColIndex === null && styles.columnOptionSelected]}
                          onPress={() => {
                            setUserMapping({ ...userMapping, outcomesColIndex: null });
                            setActivePickerField(null);
                          }}
                        >
                          <Text
                            style={[
                              styles.columnOptionText,
                              userMapping.outcomesColIndex === null && styles.columnOptionTextSelected,
                            ]}
                          >
                            — Seçilmedi (Bu alanı boş bırak) —
                          </Text>
                        </TouchableOpacity>
                        {docAnalysis.columns.map((c) => (
                          <TouchableOpacity
                            key={c.index}
                            style={[
                              styles.columnOption,
                              userMapping.outcomesColIndex === c.index && styles.columnOptionSelected,
                            ]}
                            onPress={() => {
                              setUserMapping({ ...userMapping, outcomesColIndex: c.index });
                              setActivePickerField(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.columnOptionText,
                                userMapping.outcomesColIndex === c.index && styles.columnOptionTextSelected,
                              ]}
                            >
                              Sütun {c.index + 1}: {c.headerName}
                            </Text>
                            {c.sampleValues[0] && (
                              <Text style={styles.columnOptionSample} numberOfLines={1}>
                                ({c.sampleValues[0]})
                              </Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* 3. Tarih Aralığı Sütunu (Opsiyonel) */}
                  <View style={styles.mappingFieldCard}>
                    <View style={styles.mappingFieldHeader}>
                      <Text style={styles.mappingFieldLabel}>📅 Tarih Aralığı Sütunu</Text>
                      <Text style={styles.optionalBadge}>Opsiyonel</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mappingSelectBtn}
                      onPress={() => setActivePickerField(activePickerField === 'date' ? null : 'date')}
                    >
                      <Text style={styles.mappingSelectBtnText}>
                        {userMapping.dateColIndex !== null
                          ? `Sütun ${userMapping.dateColIndex + 1}: ${docAnalysis.columns[userMapping.dateColIndex]?.headerName}`
                          : 'Seçilmedi (Tarih yok)'}
                      </Text>
                      <Ionicons
                        name={activePickerField === 'date' ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {userMapping.dateColIndex !== null && docAnalysis.columns[userMapping.dateColIndex]?.sampleValues[0] && (
                      <Text style={styles.samplePreviewText} numberOfLines={2}>
                        Örnek Veri: "{docAnalysis.columns[userMapping.dateColIndex]?.sampleValues[0]}"
                      </Text>
                    )}

                    {activePickerField === 'date' && (
                      <View style={styles.columnDropdown}>
                        <TouchableOpacity
                          style={[styles.columnOption, userMapping.dateColIndex === null && styles.columnOptionSelected]}
                          onPress={() => {
                            setUserMapping({ ...userMapping, dateColIndex: null });
                            setActivePickerField(null);
                          }}
                        >
                          <Text
                            style={[
                              styles.columnOptionText,
                              userMapping.dateColIndex === null && styles.columnOptionTextSelected,
                            ]}
                          >
                            — Seçilmedi (Tarihsiz aktar) —
                          </Text>
                        </TouchableOpacity>
                        {docAnalysis.columns.map((c) => (
                          <TouchableOpacity
                            key={c.index}
                            style={[
                              styles.columnOption,
                              userMapping.dateColIndex === c.index && styles.columnOptionSelected,
                            ]}
                            onPress={() => {
                              setUserMapping({ ...userMapping, dateColIndex: c.index });
                              setActivePickerField(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.columnOptionText,
                                userMapping.dateColIndex === c.index && styles.columnOptionTextSelected,
                              ]}
                            >
                              Sütun {c.index + 1}: {c.headerName}
                            </Text>
                            {c.sampleValues[0] && (
                              <Text style={styles.columnOptionSample} numberOfLines={1}>
                                ({c.sampleValues[0]})
                              </Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* 4. Hafta Numarası Sütunu (Opsiyonel) */}
                  <View style={styles.mappingFieldCard}>
                    <View style={styles.mappingFieldHeader}>
                      <Text style={styles.mappingFieldLabel}>🔢 Hafta Numarası Sütunu</Text>
                      <Text style={styles.optionalBadge}>Opsiyonel</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mappingSelectBtn}
                      onPress={() => setActivePickerField(activePickerField === 'week' ? null : 'week')}
                    >
                      <Text style={styles.mappingSelectBtnText}>
                        {userMapping.weekColIndex !== null
                          ? `Sütun ${userMapping.weekColIndex + 1}: ${docAnalysis.columns[userMapping.weekColIndex]?.headerName}`
                          : 'Otomatik (1, 2, 3.. 36 olarak sırala)'}
                      </Text>
                      <Ionicons
                        name={activePickerField === 'week' ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>

                    {activePickerField === 'week' && (
                      <View style={styles.columnDropdown}>
                        <TouchableOpacity
                          style={[styles.columnOption, userMapping.weekColIndex === null && styles.columnOptionSelected]}
                          onPress={() => {
                            setUserMapping({ ...userMapping, weekColIndex: null });
                            setActivePickerField(null);
                          }}
                        >
                          <Text
                            style={[
                              styles.columnOptionText,
                              userMapping.weekColIndex === null && styles.columnOptionTextSelected,
                            ]}
                          >
                            — Otomatik Sırala (1, 2, 3.. 36) —
                          </Text>
                        </TouchableOpacity>
                        {docAnalysis.columns.map((c) => (
                          <TouchableOpacity
                            key={c.index}
                            style={[
                              styles.columnOption,
                              userMapping.weekColIndex === c.index && styles.columnOptionSelected,
                            ]}
                            onPress={() => {
                              setUserMapping({ ...userMapping, weekColIndex: c.index });
                              setActivePickerField(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.columnOptionText,
                                userMapping.weekColIndex === c.index && styles.columnOptionTextSelected,
                              ]}
                            >
                              Sütun {c.index + 1}: {c.headerName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.guideCard}>
                    <Text style={styles.guideStepTitle}>Adım 1: Hazır Şablonu İndirin</Text>
                    <Text style={styles.guideStepDesc}>
                      Ders programınızdaki haftalık {scheduleInfo?.totalWeeklyHours || 4} saatlik dağılıma göre hazırlanmış hazır Excel şablonudur.
                    </Text>
                    <TouchableOpacity
                      style={styles.templateDownloadBtn}
                      onPress={handleDownloadTemplate}
                    >
                      <Ionicons name="download-outline" size={16} color={Colors.primary} />
                      <Text style={styles.templateDownloadBtnText}>
                        {selectedGradeLevel}. Sınıf Şablonunu İndir (.xlsx)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.guideCard, { marginTop: 12 }]}>
                    <Text style={styles.guideStepTitle}>Adım 2: Excel veya Word Dosyasını Yükleyin</Text>
                    <Text style={styles.guideStepDesc}>
                      Dosyanızı seçtiğinizde başlıktaki sütunlar otomatik algılanır, yapay zeka en uygun eşleştirmeyi önerir ve dilerseniz sütunları kendiniz belirleyebilirsiniz.
                    </Text>

                    <View style={{ gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        style={styles.pickExcelAiBtn}
                        onPress={handlePickDocumentForMapping}
                        activeOpacity={0.8}
                      >
                        <View style={styles.pickExcelAiIconWrap}>
                          <Ionicons name="sparkles" size={20} color="#7C3AED" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.pickExcelAiBtnTitle}>Dinamik Excel / Word Yükle</Text>
                            <View style={styles.aiBadgeSmall}>
                              <Text style={styles.aiBadgeSmallText}>Akıllı Sütun</Text>
                            </View>
                          </View>
                          <Text style={styles.pickExcelAiBtnSub}>
                            Sütun başlıklarını otomatik tarar, yapay zeka önerisiyle istediğiniz sütunu eşleştirir.
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.pickExcelBtn}
                        onPress={handlePickExcel}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="document-text-outline" size={18} color="#fff" />
                        <Text style={styles.pickExcelBtnText}>Standart Şablon Excel Seç</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title={parsedRows.length > 0 ? 'Eşleştirmeyi Düzenle' : docAnalysis ? 'Dosyayı Değiştir' : 'Kapat'}
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  if (parsedRows.length > 0) {
                    setParsedRows([]);
                  } else if (docAnalysis) {
                    setDocAnalysis(null);
                  } else {
                    setBulkModalVisible(false);
                  }
                }}
              />
              {parsedRows.length > 0 ? (
                <Button
                  title={`Onayla ve Kaydet (${parsedRows.length} Hafta)`}
                  style={{ flex: 2 }}
                  onPress={handleConfirmBulkSave}
                  loading={loadingExcel}
                />
              ) : docAnalysis ? (
                <Button
                  title="Planı Dönüştür ve Önizle"
                  style={{ flex: 2 }}
                  onPress={handleApplyMappingAndPreview}
                  loading={loadingExcel}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* SINGLE ADD / EDIT PLAN MODAL */}
      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlan ? 'Müfredat Konusunu Düzenle' : 'Yeni Konu Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Hafta No *"
                    placeholder="Örn: 3"
                    value={formWeek}
                    onChangeText={setFormWeek}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Ders Saati (Zorunlu) *"
                    placeholder="Örn: 2"
                    value={formLessonHours}
                    onChangeText={setFormLessonHours}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 12, marginTop: -4 }}>
                💡 Bir haftada birden fazla konu varsa aynı hafta numarasıyla konuları sırayla ekleyebilirsiniz (Örn: Kuvvet 2 saat, Hareket 2 saat).
              </Text>

              <Input
                label="Deftere Yazılacak Konu *"
                placeholder="Örn: Vektörler ve Kuvvet Dengesi"
                value={formTopic}
                onChangeText={setFormTopic}
              />

              <Input
                label="Kazanımlar / Açıklama (Opsiyonel)"
                placeholder="Örn: İki boyutlu kartezyen koordinat sisteminde..."
                value={formOutcomes}
                onChangeText={setFormOutcomes}
                multiline
                numberOfLines={2}
              />

              <View style={styles.datesRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Başlangıç Tarihi"
                    placeholder="YYYY-AA-GG"
                    value={formStartDate}
                    onChangeText={setFormStartDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Bitiş Tarihi"
                    placeholder="YYYY-AA-GG"
                    value={formEndDate}
                    onChangeText={setFormEndDate}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalVisible(false)}
              />
              <Button title="Kaydet" style={{ flex: 1 }} onPress={handleSave} />
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF IN-APP VIEWER MODAL */}
      <PdfViewerModal
        visible={pdfViewerModalVisible}
        onClose={() => setPdfViewerModalVisible(false)}
        fileUri={pdfDoc?.file_uri || null}
        fileName={pdfDoc?.file_name}
        title={`${selectedGradeLevel}. Sınıf ${courses.find((c) => c.id === selectedCourseId)?.name || 'Ders'} Yıllık Planı`}
        onShareOrExternal={() => {
          if (pdfDoc) {
            const activeCourse = courses.find((c) => c.id === selectedCourseId);
            const courseTitle = activeCourse ? activeCourse.name : 'Ders';
            viewYearlyPlanPdf(
              pdfDoc.file_uri,
              `${selectedGradeLevel}. Sınıf ${courseTitle} Yıllık Planı`
            );
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  levelBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  levelBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  levelBarLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  manageLevelsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  manageLevelsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  levelScroll: {
    gap: 8,
  },
  levelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  levelChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  levelChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  levelChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  courseChipsBar: {
    backgroundColor: Colors.card,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  listHeaderWrapper: {
    paddingBottom: 4,
  },
  statusSection: {
    paddingTop: 8,
  },
  verifiedScheduleCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  hoursBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hoursBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  verifiedSub: {
    fontSize: 11,
    color: '#166534',
    marginTop: 2,
  },
  warningScheduleCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  warningSub: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 1,
    lineHeight: 15,
  },
  goToScheduleBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  goToScheduleBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  actionStrip: {
    flexDirection: 'row',
    paddingVertical: 10,
    gap: 8,
  },
  actionStripBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionStripBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  actionStripSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 5,
  },
  actionStripSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pdfSectionContainer: {
    paddingBottom: 8,
  },
  pdfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  wordBanner: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  pdfIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordIconCircle: {
    backgroundColor: '#DBEAFE',
  },
  pdfBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  wordBannerTitle: {
    color: '#1E40AF',
  },
  pdfBannerSub: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 1,
  },
  wordBannerSub: {
    color: '#2563EB',
  },
  pdfViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 4,
  },
  wordViewBtn: {
    backgroundColor: '#2563EB',
  },
  pdfViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pdfDeleteBtn: {
    padding: 6,
  },
  pdfAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  pdfAttachBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  previewHoursPill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  previewHoursPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },
  planCard: {
    padding: 14,
    marginBottom: 10,
  },
  planCardActive: {
    backgroundColor: '#F0FDF4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  weekBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  gradeBadge: {
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  hoursPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hoursPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  currentBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.successDark,
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 12,
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  outcomesText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 17,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  datesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  guideCard: {
    backgroundColor: Colors.cardSubtle,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guideStepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  guideStepDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  templateDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  templateDownloadBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  pickExcelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: 8,
    gap: 6,
  },
  pickExcelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  pickExcelAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  pickExcelAiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickExcelAiBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6D28D9',
  },
  pickExcelAiBtnSub: {
    fontSize: 11,
    color: '#7C3AED',
    marginTop: 2,
    lineHeight: 15,
  },
  aiBadgeSmall: {
    backgroundColor: '#DDD6FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  aiBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6D28D9',
  },
  previewHeaderAi: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  previewHeader: {
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  previewSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  previewListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  previewItemCard: {
    backgroundColor: Colors.cardSubtle,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewItemWeek: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  previewItemHours: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  previewItemTopic: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  previewItemDates: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  moreWeeksText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 8,
  },
  planSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  planSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planSummaryText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  planSummaryCount: {
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  deletePlanAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    gap: 4,
  },
  deletePlanAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  exportPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    gap: 4,
  },
  exportPlanBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  mappingContainer: {
    paddingVertical: 4,
  },
  mappingDocBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 10,
  },
  mappingDocIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mappingDocName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  mappingDocStats: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  aiSuggestionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  aiSuggestionNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#6D28D9',
    lineHeight: 16,
    fontWeight: '600',
  },
  mappingSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  mappingFieldCard: {
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  mappingFieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mappingFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  requiredBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionalBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    backgroundColor: Colors.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mappingSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  mappingSelectBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginRight: 8,
  },
  samplePreviewText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  columnDropdown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 180,
    overflow: 'hidden',
  },
  columnOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  columnOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  columnOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  columnOptionTextSelected: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  columnOptionSample: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  previewItemOutcomes: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  schoolSyncPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  schoolSyncPlanIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolSyncPlanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  schoolSyncPlanBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  schoolSyncPlanBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4338CA',
  },
  schoolSyncPlanSub: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
  },
  emptySchoolSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  emptySchoolSyncBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
});
