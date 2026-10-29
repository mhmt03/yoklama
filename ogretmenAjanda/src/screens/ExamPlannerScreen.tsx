import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../theme/colors';
import { getBaseApiUrl, getAuthToken, getActiveSchoolId } from '../services/apiClient';
import {
  fetchExamRooms,
  saveExamRoom,
  deleteExamRoom,
  seedRoomsFromClasses,
  fetchExamBranches,
  fetchWrittenExams,
  saveWrittenExam,
  deleteWrittenExam,
  toggleExamPublish,
  fetchExamDetails,
  placeStudentsInExam,
  updateProctorTeacher,
  swapOrMoveStudentSeat,
  fetchAvailableProctors,
  AvailableProctorItem,
  ExamHallItem,
  WrittenExamItem,
} from '../database/operations/examPlannerOperations';

type ActiveTab = 'exams' | 'rooms' | 'distribute' | 'results';

export const ExamPlannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ActiveTab>('exams');
  const [loading, setLoading] = useState(false);

  // Veriler
  const [exams, setExams] = useState<WrittenExamItem[]>([]);
  const [rooms, setRooms] = useState<ExamHallItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [examDetail, setExamDetail] = useState<any | null>(null);

  // Salon Filtresi & State
  const [roomTagFilter, setRoomTagFilter] = useState<string>('all');
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Partial<ExamHallItem> | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('30');
  const [newRoomTag, setNewRoomTag] = useState<'İkili Oturum' | 'Tekli Oturum' | string>('İkili Oturum');

  // Sınav Modal State
  const [examModalVisible, setExamModalVisible] = useState(false);
  const [newExamName, setNewExamName] = useState('');
  const [newExamDate, setNewExamDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [newExamLessonHour, setNewExamLessonHour] = useState('3');
  const [newExamStartTime, setNewExamStartTime] = useState('09:50');
  const [newExamIsPublished, setNewExamIsPublished] = useState(true);

  // Öğrenci Sınav Yeri Arama & Görünürlük State
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Dağıtım Sihirbazı State
  const [availableBranches, setAvailableBranches] = useState<Array<{ grade: string; section: string; key: string; count: number }>>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [branchLessons, setBranchLessons] = useState<Record<string, string>>({});
  const [selectedGradeQuick, setSelectedGradeQuick] = useState<string | null>(null);
  const [quickLessonInput, setQuickLessonInput] = useState('');
  const [selectedRoomIdsForDistribute, setSelectedRoomIdsForDistribute] = useState<string[]>([]);
  const [isButterfly, setIsButterfly] = useState(true);
  const [distributing, setDistributing] = useState(false);

  // Raporlama & Excel Export State
  const [includeSummaryInExport, setIncludeSummaryInExport] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [attendanceExportModalVisible, setAttendanceExportModalVisible] = useState(false);
  const [exportTargetRoomName, setExportTargetRoomName] = useState<string | undefined>(undefined);
  const [selectedSummaryType, setSelectedSummaryType] = useState<'course' | 'grade' | 'branch' | 'all' | 'none'>('course');
  const [includeProctorName, setIncludeProctorName] = useState<boolean>(true);

  // Öğrenci Bilgilendirme Çıktı Ayarları Modalı (A4 / A5 & Şube Seçimi)
  const [studentInfoPrintModalVisible, setStudentInfoPrintModalVisible] = useState(false);
  const [studentInfoPaperSize, setStudentInfoPaperSize] = useState<'A4' | 'A5'>('A4');
  const [studentInfoIncludeAlpha, setStudentInfoIncludeAlpha] = useState(true);
  const [studentInfoSelectedBranches, setStudentInfoSelectedBranches] = useState<string[]>([]);

  // Gözetmen Düzenleme Modalı & Akıllı Liste
  const [proctorModalVisible, setProctorModalVisible] = useState(false);
  const [proctorRoomName, setProctorRoomName] = useState('');
  const [proctorTeacherName, setProctorTeacherName] = useState('');
  const [availableProctors, setAvailableProctors] = useState<AvailableProctorItem[]>([]);
  const [proctorSearchQuery, setProctorSearchQuery] = useState('');
  const [loadingProctors, setLoadingProctors] = useState(false);

  // Öğrenci Manuel Sıra / Salon Değiştirme Modalı
  const [seatChangeModalVisible, setSeatChangeModalVisible] = useState(false);
  const [selectedSeatStudent, setSelectedSeatStudent] = useState<any>(null);
  const [targetRoomForMove, setTargetRoomForMove] = useState('');
  const [targetSeatForMove, setTargetSeatForMove] = useState('');
  const [movingSeat, setMovingSeat] = useState(false);

  // Salon Kartlarının Açılır/Kapanır (Collapsible/Accordion) Durumu
  const [collapsedRooms, setCollapsedRooms] = useState<Record<string, boolean>>({});

  const toggleRoomCollapse = (roomName: string) => {
    setCollapsedRooms((prev) => ({
      ...prev,
      [roomName]: !prev[roomName],
    }));
  };

  const collapseAllRooms = () => {
    if (!examDetail?.rooms) return;
    const all: Record<string, boolean> = {};
    examDetail.rooms.forEach((r: any) => {
      all[r.roomName] = true;
    });
    setCollapsedRooms(all);
  };

  const expandAllRooms = () => {
    setCollapsedRooms({});
  };

  const currentExam = useMemo(() => {
    return exams.find((e) => e.id === selectedExamId) || examDetail?.exam;
  }, [exams, selectedExamId, examDetail]);

  const isExamPublished = currentExam?.isPublishedToStudents ?? (examDetail?.exam?.isPublishedToStudents !== false);

  const handleToggleExamPublish = async (newValue: boolean) => {
    if (!selectedExamId) return;
    setPublishing(true);
    try {
      const ok = await toggleExamPublish(selectedExamId, newValue);
      if (ok) {
        setExams((prev) =>
          prev.map((e) => (e.id === selectedExamId ? { ...e, isPublishedToStudents: newValue } : e))
        );
        if (examDetail && examDetail.exam) {
          setExamDetail({
            ...examDetail,
            exam: { ...examDetail.exam, isPublishedToStudents: newValue },
          });
        }
        Alert.alert(
          'Görünürlük Güncellendi',
          newValue
            ? '✅ Sınav oturma yerleri öğrenci ve veli panellerinde GÖRÜNÜR yapıldı.'
            : '🔒 Sınav oturma yerleri öğrenci ve velilerden GİZLENDİ.'
        );
      } else {
        Alert.alert('Hata', 'Görünürlük ayarı kaydedilemedi.');
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Görünürlük ayarı güncellenirken hata oluştu.');
    } finally {
      setPublishing(false);
    }
  };

  const matchingStudents = useMemo(() => {
    if (!studentSearchQuery.trim() || !examDetail?.rooms) return [];
    const q = studentSearchQuery.trim().toLocaleLowerCase('tr');
    const list: Array<{
      student: any;
      roomName: string;
      proctorTeacherName?: string;
    }> = [];

    for (const rm of examDetail.rooms) {
      if (!rm.students || !Array.isArray(rm.students)) continue;
      for (const st of rm.students) {
        const fullName = String(st.fullName || '').toLocaleLowerCase('tr');
        const stNum = String(st.studentNumber || '');
        const branch = `${st.grade || ''}${st.section || ''}`.toLocaleLowerCase('tr');
        const lesson = String(st.lessonName || '').toLocaleLowerCase('tr');

        if (fullName.includes(q) || stNum.includes(q) || branch.includes(q) || lesson.includes(q)) {
          list.push({
            student: st,
            roomName: rm.roomName,
            proctorTeacherName: rm.proctorTeacherName,
          });
        }
      }
    }
    return list;
  }, [studentSearchQuery, examDetail]);

  const handleOpenSeatChangeModal = (student: any) => {
    setSelectedSeatStudent(student);
    setTargetRoomForMove(student.roomName);
    setTargetSeatForMove(String(student.seatNumber));
    setSeatChangeModalVisible(true);
  };

  const handleSaveSeatChange = async () => {
    if (!selectedExamId || !selectedSeatStudent) return;
    const seatNum = parseInt(targetSeatForMove, 10);
    if (isNaN(seatNum) || seatNum <= 0) {
      Alert.alert('Uyarı', 'Geçerli bir sıra numarası giriniz.');
      return;
    }
    if (!targetRoomForMove.trim()) {
      Alert.alert('Uyarı', 'Lütfen hedef salonu seçiniz.');
      return;
    }

    try {
      setMovingSeat(true);
      const res = await swapOrMoveStudentSeat({
        writtenExamId: selectedExamId,
        seatingId: selectedSeatStudent.id,
        targetRoomName: targetRoomForMove.trim(),
        targetSeatNumber: seatNum,
      });

      if (res && res.success) {
        setSeatChangeModalVisible(false);
        const updated = await fetchExamDetails(selectedExamId);
        setExamDetail(updated);
        Alert.alert('Başarılı', res.message || 'Öğrencinin yeri güncellendi.');
      } else {
        Alert.alert('Hata', res?.message || 'Yer değiştirilemedi.');
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'İşlem sırasında hata oluştu.');
    } finally {
      setMovingSeat(false);
    }
  };

  // Doğal salon sıralaması (9-A..E, 10-A..E, 11-A..E, 12-A..F)
  const sortRoomsNaturally = (list: ExamHallItem[]): ExamHallItem[] => {
    return [...list].sort((a, b) => {
      const matchA = a.roomName.match(/^(\d+)/);
      const matchB = b.roomName.match(/^(\d+)/);
      const gradeA = matchA ? parseInt(matchA[1], 10) : 99;
      const gradeB = matchB ? parseInt(matchB[1], 10) : 99;
      if (gradeA !== gradeB) return gradeA - gradeB;
      return a.roomName.localeCompare(b.roomName, 'tr', { numeric: true });
    });
  };

  // -------------------------------------------------------------
  // YÜKLEME VE İLK VERİLER
  // -------------------------------------------------------------

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [loadedExams, loadedRooms] = await Promise.all([
        fetchWrittenExams(),
        fetchExamRooms(undefined, roomTagFilter),
      ]);
      setExams(loadedExams);
      setRooms(sortRoomsNaturally(loadedRooms));
      if (loadedExams.length > 0 && !selectedExamId) {
        setSelectedExamId(loadedExams[0].id);
      }
    } catch (err) {
      console.warn('Veriler yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    fetchExamRooms(undefined, roomTagFilter).then((r) => setRooms(sortRoomsNaturally(r)));
  }, [roomTagFilter]);

  // Seçilen sınavın detaylarını yükle
  useEffect(() => {
    if (selectedExamId) {
      fetchExamDetails(selectedExamId).then((res) => {
        if (res && res.success) {
          setExamDetail(res);
        } else {
          setExamDetail(null);
        }
      });
    }
  }, [selectedExamId]);

  // Dağıtım için okul şubelerini yükle
  useEffect(() => {
    if (activeTab === 'distribute') {
      loadBranchesForDistribution();
    }
  }, [activeTab]);

  const loadBranchesForDistribution = async () => {
    try {
      setLoading(true);
      const branches = await fetchExamBranches();
      setAvailableBranches(branches);

      // Varsayılan tüm salonları seç
      if (selectedRoomIdsForDistribute.length === 0 && rooms.length > 0) {
        setSelectedRoomIdsForDistribute(rooms.map((r) => r.id));
      }
    } catch (err) {
      console.warn('Şubeler alınırken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // HIZLI DERS ATAMA & KADEME ÇOKLU SEÇİMİ (Multi-Grade Toggle)
  // Kullanıcı örneğin hem 9'ları hem 10'ları aynı anda seçebilir!
  // -------------------------------------------------------------
  const handleToggleGradeQuick = (gradeStr: string) => {
    const matchingKeys = availableBranches.filter((b) => b.grade.trim() === gradeStr.trim()).map((b) => b.key);
    if (matchingKeys.length === 0) return;

    const allMatchingSelected = matchingKeys.every((k) => selectedBranches.includes(k));
    if (allMatchingSelected) {
      // Bu kademeyi seçimden çıkar
      setSelectedBranches(selectedBranches.filter((k) => !matchingKeys.includes(k)));
      if (selectedGradeQuick === gradeStr) setSelectedGradeQuick(null);
    } else {
      // Bu kademeyi seçime ekle (mevcut diğer kademeleri koruyarak!)
      const next = Array.from(new Set([...selectedBranches, ...matchingKeys]));
      setSelectedBranches(next);
      setSelectedGradeQuick(gradeStr);
    }
  };

  const handleSelectAllBranches = () => {
    setSelectedBranches(availableBranches.map((b) => b.key));
    setSelectedGradeQuick(null);
  };

  const handleClearBranchSelection = () => {
    setSelectedBranches([]);
    setSelectedGradeQuick(null);
  };

  const handleApplyQuickLesson = () => {
    if (selectedBranches.length === 0) {
      Alert.alert('Uyarı', 'Lütfen ders adı atamak için en az bir şube seçin.');
      return;
    }
    if (!quickLessonInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen atanacak ders adını girin (Örn: Matematik, Fizik, Biyoloji).');
      return;
    }
    const updated = { ...branchLessons };
    for (const bKey of selectedBranches) {
      updated[bKey] = quickLessonInput.trim();
    }
    setBranchLessons(updated);
    Alert.alert('Başarılı', `${selectedBranches.length} seçili şubeye "${quickLessonInput.trim()}" dersi atandı.`);
  };

  // -------------------------------------------------------------
  // SALON EKLEME & YÖNETİMİ
  // -------------------------------------------------------------
  const handleOpenRoomModal = (room?: ExamHallItem) => {
    if (room) {
      setEditingRoom(room);
      setNewRoomName(room.roomName);
      setNewRoomCapacity(String(room.capacity));
      setNewRoomTag(room.tag || 'İkili Oturum');
    } else {
      setEditingRoom(null);
      setNewRoomName('');
      setNewRoomCapacity('30');
      setNewRoomTag('İkili Oturum');
    }
    setRoomModalVisible(true);
  };

  const handleSaveRoom = async () => {
    if (!newRoomName.trim()) {
      Alert.alert('Uyarı', 'Salon adı zorunludur.');
      return;
    }
    const cap = parseInt(newRoomCapacity, 10);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Uyarı', 'Geçerli bir kapasite sayısı girin.');
      return;
    }
    setLoading(true);
    try {
      await saveExamRoom({
        id: editingRoom?.id,
        roomName: newRoomName.trim(),
        capacity: cap,
        tag: newRoomTag,
        orderIndex: editingRoom?.orderIndex || 0,
        isActive: true,
      });
      setRoomModalVisible(false);
      const updated = await fetchExamRooms(undefined, roomTagFilter);
      setRooms(updated);
      Alert.alert('Başarılı', 'Salon kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Salon kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = (roomId: string, name: string) => {
    Alert.alert('Salonu Sil', `"${name}" salonunu silmek istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          await deleteExamRoom(roomId);
          const updated = await fetchExamRooms(undefined, roomTagFilter);
          setRooms(sortRoomsNaturally(updated));
          setLoading(false);
        },
      },
    ]);
  };

  const handleSeedRooms = async () => {
    const runSeed = async (selectedTag: string) => {
      const isTekli = selectedTag === 'Tekli Oturum';
      const capDesc = isTekli ? 'şube mevcudunun yarısı (yukarı yuvarlanmış)' : 'şube mevcudu kadar';

      try {
        setLoading(true);
        await seedRoomsFromClasses(selectedTag);
        const updated = await fetchExamRooms(undefined, roomTagFilter);
        setRooms(sortRoomsNaturally(updated));
        Alert.alert('Başarılı', `${selectedTag} salonları (${capDesc} kapasite ile) başarıyla oluşturuldu ve güncellendi.`);
      } catch (err: any) {
        Alert.alert('Hata', err?.message || 'Salonlar aktarılırken hata oluştu.');
      } finally {
        setLoading(false);
      }
    };

    if (roomTagFilter === 'all') {
      if (Platform.OS === 'web') {
        const ok = window.confirm(
          'Tümü sekmesindesiniz. Mevcut şubeler İkili Oturum (şube mevcudu kadar kapasite ile) olarak salonlara aktarılsın mı?\n\n(Not: Tekli oturum için yukarıdaki "Tekli Oturum" filtresini seçtikten sonra aktarabilirsiniz.)'
        );
        if (ok) {
          await runSeed('İkili Oturum');
        }
      } else {
        Alert.alert(
          'Şubelerden Salon Oluştur',
          'Aktarmak istediğiniz oturum tipini seçiniz:',
          [
            { text: 'İptal', style: 'cancel' },
            {
              text: '👥 İkili Oturum (Tam Mevcut)',
              onPress: () => runSeed('İkili Oturum'),
            },
            {
              text: '👤 Tekli Oturum (Mevcudun Yarısı)',
              onPress: () => runSeed('Tekli Oturum'),
            },
          ]
        );
      }
      return;
    }

    const targetTag = roomTagFilter === 'Tekli Oturum' ? 'Tekli Oturum' : 'İkili Oturum';
    const isTekli = targetTag === 'Tekli Oturum';
    const capDesc = isTekli ? 'şube mevcudunun yarısı (yukarı yuvarlanmış)' : 'şube mevcudu kadar';

    if (Platform.OS === 'web') {
      const ok = window.confirm(`Mevcut şubeler ${targetTag} (${capDesc} kapasite ile) olarak salonlara aktarılsın mı?`);
      if (ok) {
        await runSeed(targetTag);
      }
    } else {
      Alert.alert(
        'Şubelerden Salon Oluştur',
        `Mevcut şubeler ${targetTag} (${capDesc} kapasite ile) olarak aktarılsın mı?`,
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Aktar ve Güncelle',
            onPress: () => runSeed(targetTag),
          },
        ]
      );
    }
  };

  // -------------------------------------------------------------
  // SINAV EKLEME & SİLME
  // -------------------------------------------------------------
  const handleOpenExamModal = () => {
    setNewExamName('');
    setNewExamDate(new Date().toISOString().substring(0, 10));
    setNewExamLessonHour('3');
    setNewExamStartTime('09:50');
    setNewExamIsPublished(true);
    setExamModalVisible(true);
  };

  const handleSaveExam = async () => {
    if (!newExamName.trim()) {
      Alert.alert('Uyarı', 'Sınav adı zorunludur.');
      return;
    }
    const hour = parseInt(newExamLessonHour, 10);
    if (isNaN(hour) || hour < 1 || hour > 12) {
      Alert.alert('Uyarı', 'Geçerli bir ders saati girin (1-10).');
      return;
    }
    setLoading(true);
    try {
      const res = await saveWrittenExam({
        name: newExamName.trim(),
        examDate: newExamDate,
        lessonHour: hour,
        startTime: newExamStartTime.trim(),
        isActive: true,
        isPublishedToStudents: newExamIsPublished,
      });
      setExamModalVisible(false);
      const updated = await fetchWrittenExams();
      setExams(updated);
      if (res?.id) setSelectedExamId(res.id);
      Alert.alert('Başarılı', 'Yazılı sınav tanımlandı. Şimdi dağıtım sihirbazından yerleşim yapabilirsiniz.');
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Sınav kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = (examId: string, name: string) => {
    Alert.alert('Sınavı Sil', `"${name}" sınavı ve tüm oturma yerleşimi silinecektir. Devam edilsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          await deleteWrittenExam(examId);
          const updated = await fetchWrittenExams();
          setExams(updated);
          if (selectedExamId === examId) {
            setSelectedExamId(updated[0]?.id || null);
          }
          setLoading(false);
        },
      },
    ]);
  };

  // -------------------------------------------------------------
  // DAĞITIM SİHİRBAZI YÜRÜTME
  // -------------------------------------------------------------
  const totalCandidateStudents = useMemo(() => {
    return availableBranches
      .filter((b) => selectedBranches.includes(b.key))
      .reduce((sum, b) => sum + b.count, 0);
  }, [availableBranches, selectedBranches]);

  const totalSelectedRoomsCapacity = useMemo(() => {
    return rooms
      .filter((r) => selectedRoomIdsForDistribute.includes(r.id))
      .reduce((sum, r) => sum + r.capacity, 0);
  }, [rooms, selectedRoomIdsForDistribute]);

  const handleRunDistribution = async () => {
    if (!selectedExamId) {
      Alert.alert('Uyarı', 'Lütfen yerleşim yapılacak sınavı seçin.');
      return;
    }
    if (selectedBranches.length === 0) {
      Alert.alert('Uyarı', 'Lütfen en az bir şube seçin.');
      return;
    }
    if (selectedRoomIdsForDistribute.length === 0) {
      Alert.alert('Uyarı', 'Lütfen en az bir salon seçin.');
      return;
    }
    if (totalCandidateStudents > totalSelectedRoomsCapacity) {
      Alert.alert(
        'Kapasite Yetersiz',
        `Seçilen şubelerdeki toplam öğrenci sayısı (${totalCandidateStudents}), seçilen salonların toplam kapasitesini (${totalSelectedRoomsCapacity}) aşıyor. Lütfen daha fazla salon seçin.`
      );
      return;
    }

    setDistributing(true);
    try {
      const res = await placeStudentsInExam({
        examId: selectedExamId,
        selectedRoomIds: selectedRoomIdsForDistribute,
        selectedBranches: selectedBranches,
        branchLessons: branchLessons,
        isButterfly: isButterfly,
      });

      if (res.success) {
        Alert.alert('Yerleşim Tamamlandı 🎉', res.message, [
          {
            text: 'Sonuçları Gör',
            onPress: () => {
              setActiveTab('results');
              fetchExamDetails(selectedExamId).then(setExamDetail);
            },
          },
        ]);
      } else {
        Alert.alert('Yerleşim Yapılamadı', res.message);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Dağıtım sırasında bir hata oluştu.');
    } finally {
      setDistributing(false);
    }
  };

  // -------------------------------------------------------------
  // GÖZETMEN DEĞİŞTİRME & AKILLI LİSTE
  // -------------------------------------------------------------
  const handleOpenProctorModal = async (roomName: string, currentProctor?: string) => {
    setProctorRoomName(roomName);
    setProctorTeacherName(currentProctor || '');
    setProctorSearchQuery('');
    setProctorModalVisible(true);

    if (selectedExamId) {
      setLoadingProctors(true);
      try {
        const list = await fetchAvailableProctors(selectedExamId, roomName);
        setAvailableProctors(list);
      } catch (err) {
        console.warn('Gözetmen listesi alınamadı:', err);
      } finally {
        setLoadingProctors(false);
      }
    }
  };

  const handleSaveProctor = async () => {
    if (!selectedExamId || !proctorRoomName) return;
    try {
      await updateProctorTeacher(selectedExamId, proctorRoomName, proctorTeacherName.trim());
      setProctorModalVisible(false);
      // Detayları tazele
      const det = await fetchExamDetails(selectedExamId);
      setExamDetail(det);
      Alert.alert('Başarılı', `${proctorRoomName} salonunun gözetmeni güncellendi.`);
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Gözetmen güncellenemedi.');
    }
  };

  // Filtrelenmiş Gözetmen Listesi
  const filteredProctors = useMemo(() => {
    if (!proctorSearchQuery.trim()) return availableProctors;
    const q = proctorSearchQuery.toLowerCase();
    return availableProctors.filter(
      (p) =>
        p.teacherName.toLowerCase().includes(q) ||
        p.badge.toLowerCase().includes(q) ||
        (p.dutyPlace && p.dutyPlace.toLowerCase().includes(q))
    );
  }, [availableProctors, proctorSearchQuery]);

  // -------------------------------------------------------------
  // RAPOR VE ÇIKTILAR (XLSX & A4 PDF / PRINT)
  // -------------------------------------------------------------

  const handleOpenAttendanceExportModal = (roomName?: string) => {
    setExportTargetRoomName(roomName);
    setAttendanceExportModalVisible(true);
  };

  const handleDownloadAttendanceXlsx = async () => {
    if (!selectedExamId) return;
    setAttendanceExportModalVisible(false);
    setExporting(true);
    try {
      const baseUrl = await getBaseApiUrl();
      const token = await getAuthToken();
      const roomParam = exportTargetRoomName ? `&roomName=${encodeURIComponent(exportTargetRoomName)}` : '';
      const proctorParam = `&includeProctorName=${includeProctorName}`;
      const url = `${baseUrl}/ExamPlanner/exams/${selectedExamId}/export-attendance-xlsx?summaryType=${selectedSummaryType}${roomParam}${proctorParam}`;
      const filename = `Salon_Yoklama_Listesi_${exportTargetRoomName || 'Tum_Salonlar'}.xlsx`;

      if (Platform.OS === 'web') {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        const downloadRes = await FileSystem.downloadAsync(url, fileUri, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (downloadRes.status === 200 && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(downloadRes.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: filename,
          });
        }
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Excel oluşturulamadı.');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintAttendancePdf = async () => {
    if (!selectedExamId) return;
    setAttendanceExportModalVisible(false);
    try {
      const baseUrl = await getBaseApiUrl();
      const roomParam = exportTargetRoomName ? `&roomName=${encodeURIComponent(exportTargetRoomName)}` : '';
      const proctorParam = `&includeProctorName=${includeProctorName}`;
      const printUrl = `${baseUrl}/ExamPlanner/exams/${selectedExamId}/print-attendance?summaryType=${selectedSummaryType}${roomParam}${proctorParam}`;
      if (Platform.OS === 'web') {
        window.open(printUrl, '_blank');
      } else {
        Alert.alert('Bilgi', 'PDF yazdırma görünümü web tarayıcısında açılacaktır.');
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Yazdırma sayfası açılamadı.');
    }
  };

  // Sınavda yerleşimi yapılmış mevcut şubelerin listesi
  const examDistinctBranches = useMemo(() => {
    if (!examDetail?.rooms || examDetail.rooms.length === 0) {
      return availableBranches.map((b) => b.key);
    }
    const branchMap = new Map<string, number>();
    examDetail.rooms.forEach((rm: any) => {
      (rm.students || []).forEach((st: any) => {
        if (st.grade && st.section) {
          const key = `${st.grade}-${st.section}`;
          branchMap.set(key, (branchMap.get(key) || 0) + 1);
        }
      });
    });
    if (branchMap.size === 0) {
      return availableBranches.map((b) => b.key);
    }
    return Array.from(branchMap.keys()).sort((a, b) => {
      const [gA, sA] = a.split('-');
      const [gB, sB] = b.split('-');
      const numA = parseInt(gA, 10) || 0;
      const numB = parseInt(gB, 10) || 0;
      if (numA !== numB) return numA - numB;
      return (sA || '').localeCompare(sB || '');
    });
  }, [examDetail, availableBranches]);

  const handleOpenStudentInfoPrintModal = () => {
    if (!selectedExamId) {
      Alert.alert('Uyarı', 'Lütfen önce bir sınav seçiniz.');
      return;
    }
    setStudentInfoSelectedBranches(examDistinctBranches);
    setStudentInfoIncludeAlpha(true);
    setStudentInfoPaperSize('A4');
    setStudentInfoPrintModalVisible(true);
  };

  const handleSelectAllStudentInfoBranches = () => {
    setStudentInfoSelectedBranches(examDistinctBranches);
    setStudentInfoIncludeAlpha(true);
  };

  const handleClearAllStudentInfoBranches = () => {
    setStudentInfoSelectedBranches([]);
    setStudentInfoIncludeAlpha(false);
  };

  const handleExecutePrintStudentInfoPdf = async () => {
    if (!selectedExamId) return;
    if (!studentInfoIncludeAlpha && studentInfoSelectedBranches.length === 0) {
      Alert.alert('Seçim Yapılmadı', 'Lütfen en az bir şube veya Genel Alfabetik Listeyi seçiniz.');
      return;
    }
    setStudentInfoPrintModalVisible(false);
    try {
      const baseUrl = await getBaseApiUrl();
      const branchesParam = encodeURIComponent(studentInfoSelectedBranches.join(','));
      const printUrl = `${baseUrl}/ExamPlanner/exams/${selectedExamId}/print-student-info?paperSize=${studentInfoPaperSize}&includeAllAlpha=${studentInfoIncludeAlpha}&branches=${branchesParam}`;
      if (Platform.OS === 'web') {
        window.open(printUrl, '_blank');
      } else {
        Alert.alert('Bilgi', 'PDF yazdırma görünümü web tarayıcısında açılacaktır.');
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Yazdırma sayfası açılamadı.');
    }
  };

  const handleDownloadStudentInfoXlsx = async () => {
    if (!selectedExamId) return;
    setExporting(true);
    try {
      const baseUrl = await getBaseApiUrl();
      const token = await getAuthToken();
      const url = `${baseUrl}/ExamPlanner/exams/${selectedExamId}/export-student-info-xlsx`;
      const filename = `Ogrenci_Sinav_Bilgilendirme.xlsx`;

      if (Platform.OS === 'web') {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        const downloadRes = await FileSystem.downloadAsync(url, fileUri, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (downloadRes.status === 200 && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(downloadRes.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: filename,
          });
        }
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Öğrenci excel dosyası oluşturulamadı.');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintStudentInfoPdf = () => {
    handleOpenStudentInfoPrintModal();
  };

  const handleExportExcel = async (type: 'attendance' | 'student-info' | 'proctors', roomName?: string) => {
    if (type === 'attendance') {
      handleOpenAttendanceExportModal(roomName);
      return;
    }
    if (type === 'student-info') {
      handleDownloadStudentInfoXlsx();
      return;
    }
    if (!selectedExamId) return;
    setExporting(true);
    try {
      const baseUrl = await getBaseApiUrl();
      const token = await getAuthToken();
      const url = `${baseUrl}/ExamPlanner/exams/${selectedExamId}/export-proctors`;
      const filename = `Gozetmen_Gorev_Listesi.csv`;
      if (Platform.OS === 'web') {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Gözetmen listesi indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>Ortak Yazılı Oturma Planı</Text>
          <Text style={styles.headerSubtitle}>Kelebek Dağıtım, Salon & Gözetmen Yönetimi</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadInitialData}>
          <Ionicons name="refresh" size={20} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {/* TOP TABS */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'exams' && styles.tabItemActive]}
          onPress={() => setActiveTab('exams')}
        >
          <Ionicons name="document-text-outline" size={17} color={activeTab === 'exams' ? '#4F46E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'exams' && styles.tabTextActive]}>Sınavlar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'rooms' && styles.tabItemActive]}
          onPress={() => setActiveTab('rooms')}
        >
          <Ionicons name="business-outline" size={17} color={activeTab === 'rooms' ? '#4F46E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.tabTextActive]}>Salonlar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'distribute' && styles.tabItemActive]}
          onPress={() => setActiveTab('distribute')}
        >
          <Ionicons name="git-network-outline" size={17} color={activeTab === 'distribute' ? '#4F46E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'distribute' && styles.tabTextActive]}>Dağıtım</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'results' && styles.tabItemActive]}
          onPress={() => setActiveTab('results')}
        >
          <Ionicons name="grid-outline" size={17} color={activeTab === 'results' ? '#4F46E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'results' && styles.tabTextActive]}>Yerleşim & Excel</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#4F46E5" />
          <Text style={styles.loadingText}>Veriler yükleniyor...</Text>
        </View>
      )}

      {/* ============================================================= */}
      {/* TAB 1: SINAVLAR */}
      {/* ============================================================= */}
      {activeTab === 'exams' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Kayıtlı Yazılı Sınavları</Text>
              <Text style={styles.sectionSub}>Sınav tarihi, ders saati ve yerleşim durumları</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenExamModal}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Yeni Sınav Tanımla</Text>
            </TouchableOpacity>
          </View>

          {exams.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Henüz Tanımlı Yazılı Sınav Yok</Text>
              <Text style={styles.emptySub}>
                Sağ üstteki "Yeni Sınav Tanımla" butonuna basarak ilk ortak yazılı sınavınızı oluşturun.
              </Text>
            </View>
          ) : (
            exams.map((ex) => {
              const isSelected = selectedExamId === ex.id;
              return (
                <TouchableOpacity
                  key={ex.id}
                  style={[styles.examCard, isSelected && styles.examCardSelected]}
                  onPress={() => setSelectedExamId(ex.id)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={styles.examCardTitle}>{ex.name}</Text>
                      {isSelected && (
                        <View style={styles.badgeSelected}>
                          <Text style={styles.badgeSelectedText}>Seçili</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.examMetaRow}>
                      <View style={styles.metaPill}>
                        <Ionicons name="calendar" size={13} color="#4F46E5" />
                        <Text style={styles.metaPillText}>
                          {ex.examDate} ({ex.dayOfWeekStr || ''})
                        </Text>
                      </View>
                      <View style={styles.metaPill}>
                        <Ionicons name="time" size={13} color="#D97706" />
                        <Text style={styles.metaPillText}>
                          {ex.lessonHour}. Ders {ex.startTime ? `(${ex.startTime})` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <Text style={styles.examStatText}>
                        👥 <Text style={{ fontWeight: '700' }}>{ex.studentCount || 0}</Text> Yerleşen Öğrenci
                      </Text>
                      <Text style={styles.examStatText}>
                        🚪 <Text style={{ fontWeight: '700' }}>{ex.roomCount || 0}</Text> Salon
                      </Text>
                    </View>
                  </View>

                  <View style={styles.examActionCol}>
                    <TouchableOpacity
                      style={styles.actionBtnSmall}
                      onPress={() => {
                        setSelectedExamId(ex.id);
                        setActiveTab('distribute');
                      }}
                    >
                      <Ionicons name="git-network" size={18} color="#4F46E5" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtnSmall, { backgroundColor: '#FEE2E2' }]}
                      onPress={() => handleDeleteExam(ex.id, ex.name)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ============================================================= */}
      {/* TAB 2: SALONLAR */}
      {/* ============================================================= */}
      {activeTab === 'rooms' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Sınav Salonları & Oturum Tipleri</Text>
              <Text style={styles.sectionSub}>Tekli veya ikili oturum kapasiteleri</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleSeedRooms}>
                <Ionicons name="flash-outline" size={16} color="#4F46E5" />
                <Text style={styles.secondaryBtnText}>Şubelerden Aktar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => handleOpenRoomModal()}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Salon Ekle</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* OTURUM TİPİ ETİKET FİLTRESİ */}
          <View style={styles.filterChipRow}>
            <TouchableOpacity
              style={[styles.filterChip, roomTagFilter === 'all' && styles.filterChipActive]}
              onPress={() => setRoomTagFilter('all')}
            >
              <Text style={[styles.filterChipText, roomTagFilter === 'all' && styles.filterChipTextActive]}>
                Tümü ({rooms.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, roomTagFilter === 'İkili Oturum' && styles.filterChipActive]}
              onPress={() => setRoomTagFilter('İkili Oturum')}
            >
              <Text style={[styles.filterChipText, roomTagFilter === 'İkili Oturum' && styles.filterChipTextActive]}>
                👥 İkili Oturum
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, roomTagFilter === 'Tekli Oturum' && styles.filterChipActive]}
              onPress={() => setRoomTagFilter('Tekli Oturum')}
            >
              <Text style={[styles.filterChipText, roomTagFilter === 'Tekli Oturum' && styles.filterChipTextActive]}>
                👤 Tekli Oturum
              </Text>
            </TouchableOpacity>
          </View>

          {rooms.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="business-outline" size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Kayıtlı Salon Bulunamadı</Text>
              <Text style={styles.emptySub}>
                "Şubelerden Aktar" ile mevcut sınıfları tek tıkla salona dönüştürebilir veya manuel salon ekleyebilirsiniz.
              </Text>
            </View>
          ) : (
            <View style={styles.roomGrid}>
              {rooms.map((rm) => (
                <View key={rm.id} style={styles.roomCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.roomName}>{rm.roomName}</Text>
                    <View
                      style={[
                        styles.tagBadge,
                        rm.tag === 'Tekli Oturum' ? styles.tagBadgeSingle : styles.tagBadgeDouble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagBadgeText,
                          rm.tag === 'Tekli Oturum' ? styles.tagBadgeTextSingle : styles.tagBadgeTextDouble,
                        ]}
                      >
                        {rm.tag}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.roomCapacityRow}>
                    <Ionicons name="people-outline" size={16} color="#64748B" />
                    <Text style={styles.roomCapacityText}>Kapasite: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{rm.capacity}</Text> Öğrenci</Text>
                  </View>

                  <View style={styles.roomCardActions}>
                    <TouchableOpacity style={styles.roomEditBtn} onPress={() => handleOpenRoomModal(rm)}>
                      <Ionicons name="pencil" size={14} color="#4F46E5" />
                      <Text style={styles.roomEditBtnText}>Düzenle</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.roomDeleteBtn} onPress={() => handleDeleteRoom(rm.id, rm.roomName)}>
                      <Ionicons name="trash-outline" size={14} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ============================================================= */}
      {/* TAB 3: DAĞITIM SİHİRBAZI */}
      {/* ============================================================= */}
      {activeTab === 'distribute' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Sınav Seçimi Barı */}
          <View style={styles.distributeExamPickerCard}>
            <Text style={styles.cardHeaderLabel}>1. HANGİ SINAV İÇİN DAĞITIM YAPILIYOR?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {exams.map((ex) => {
                const isSel = selectedExamId === ex.id;
                return (
                  <TouchableOpacity
                    key={ex.id}
                    style={[styles.examPill, isSel && styles.examPillActive]}
                    onPress={() => setSelectedExamId(ex.id)}
                  >
                    <Text style={[styles.examPillText, isSel && styles.examPillTextActive]}>{ex.name}</Text>
                    <Text style={[styles.examPillSub, isSel && { color: '#E0E7FF' }]}>
                      {ex.lessonHour}. Ders ({ex.examDate})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ADIM A: ŞUBELER VE HIZLI DERS ATAMA */}
          <View style={styles.wizardCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardHeaderLabel}>2. SINAVA GİRECEK ŞUBELER VE DERS ATAMA</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={handleSelectAllBranches}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#4F46E5' }}>Tümünü Seç</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 12, color: '#CBD5E1' }}>|</Text>
                <TouchableOpacity onPress={handleClearBranchSelection}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>Temizle</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.cardSubText}>
              Kademe butonlarına basarak şubeleri seçime ekleyin veya kaldırın. Hem 9'lar hem 10'ları aynı anda seçip tek tıkla ortak ders atayabilirsiniz ({selectedBranches.length} şube seçili).
            </Text>

            {/* Hızlı Sınıf Düzeyi Butonları (9'lar, 10'lar, 11'ler, 12'ler) - Çoklu Seçim Toggle */}
            <View style={styles.quickGradeRow}>
              {['9', '10', '11', '12'].map((gr) => {
                const matching = availableBranches.filter((b) => b.grade.trim() === gr);
                const matchingKeys = matching.map((b) => b.key);
                const selectedCount = matchingKeys.filter((k) => selectedBranches.includes(k)).length;
                const isAllSelected = matchingKeys.length > 0 && selectedCount === matchingKeys.length;
                const isPartial = selectedCount > 0 && selectedCount < matchingKeys.length;

                return (
                  <TouchableOpacity
                    key={gr}
                    style={[
                      styles.quickGradeBtn,
                      isAllSelected && styles.quickGradeBtnFullyActive,
                      isPartial && styles.quickGradeBtnPartialActive,
                    ]}
                    onPress={() => handleToggleGradeQuick(gr)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons
                        name={isAllSelected ? 'checkbox' : isPartial ? 'remove-circle-outline' : 'square-outline'}
                        size={14}
                        color={isAllSelected ? '#FFFFFF' : isPartial ? '#4F46E5' : '#94A3B8'}
                      />
                      <Text
                        style={[
                          styles.quickGradeBtnText,
                          isAllSelected && styles.quickGradeBtnTextFullyActive,
                          isPartial && styles.quickGradeBtnTextPartialActive,
                        ]}
                      >
                        {gr}'lar ({selectedCount > 0 ? `${selectedCount}/${matching.length}` : `${matching.length} Şube`})
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hızlı Ders Adı Atama Çubuğu */}
            <View style={styles.quickLessonBar}>
              <TextInput
                style={styles.quickLessonInput}
                placeholder="Ders Adı Girin (Örn: Matematik, Fizik, Biyoloji)"
                placeholderTextColor="#94A3B8"
                value={quickLessonInput}
                onChangeText={setQuickLessonInput}
              />
              <TouchableOpacity style={styles.quickLessonApplyBtn} onPress={handleApplyQuickLesson}>
                <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                <Text style={styles.quickLessonApplyBtnText}>Seçilenlere Uygula</Text>
              </TouchableOpacity>
            </View>

            {/* Şube Listesi & Dersleri */}
            <View style={styles.branchListContainer}>
              {availableBranches.map((br) => {
                const isChecked = selectedBranches.includes(br.key);
                const currentLesson = branchLessons[br.key] || '';
                return (
                  <View key={br.key} style={[styles.branchRow, isChecked && styles.branchRowChecked]}>
                    <TouchableOpacity
                      style={styles.branchCheckboxRow}
                      onPress={() => {
                        if (isChecked) {
                          setSelectedBranches(selectedBranches.filter((k) => k !== br.key));
                        } else {
                          setSelectedBranches([...selectedBranches, br.key]);
                        }
                      }}
                    >
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={isChecked ? '#4F46E5' : '#94A3B8'}
                      />
                      <Text style={styles.branchKeyText}>{br.key}</Text>
                      <Text style={styles.branchCountText}>({br.count} Öğrenci)</Text>
                    </TouchableOpacity>

                    <TextInput
                      style={styles.branchLessonInput}
                      placeholder="Ders Adı"
                      placeholderTextColor="#94A3B8"
                      value={currentLesson}
                      onChangeText={(val) => setBranchLessons({ ...branchLessons, [br.key]: val })}
                    />
                  </View>
                );
              })}
            </View>
          </View>

          {/* ADIM B: SALON SEÇİMİ VE CANLI KAPASİTE */}
          <View style={styles.wizardCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardHeaderLabel}>3. KULLANILACAK SALONLAR</Text>
              <TouchableOpacity
                onPress={() => {
                  if (selectedRoomIdsForDistribute.length === rooms.length) {
                    setSelectedRoomIdsForDistribute([]);
                  } else {
                    setSelectedRoomIdsForDistribute(rooms.map((r) => r.id));
                  }
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#4F46E5' }}>
                  {selectedRoomIdsForDistribute.length === rooms.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Canlı Kapasite Sayacı */}
            <View
              style={[
                styles.capacityMeterCard,
                totalCandidateStudents > totalSelectedRoomsCapacity
                  ? styles.capacityMeterCardDanger
                  : styles.capacityMeterCardSuccess,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.capacityMeterTitle}>
                  {totalCandidateStudents <= totalSelectedRoomsCapacity ? '✅ Kapasite Yeterli' : '⚠️ Kapasite Yetersiz!'}
                </Text>
                <Text style={styles.capacityMeterSub}>
                  Gereken: <Text style={{ fontWeight: '800' }}>{totalCandidateStudents}</Text> Öğrenci  |  Seçilen Salon Kapasitesi: <Text style={{ fontWeight: '800' }}>{totalSelectedRoomsCapacity}</Text>
                </Text>
              </View>
              <View style={styles.capacityBadge}>
                <Text style={styles.capacityBadgeText}>
                  {totalSelectedRoomsCapacity - totalCandidateStudents >= 0
                    ? `+${totalSelectedRoomsCapacity - totalCandidateStudents} Boş Sıra`
                    : `${totalCandidateStudents - totalSelectedRoomsCapacity} Eksik`}
                </Text>
              </View>
            </View>

            <View style={styles.roomSelectGrid}>
              {rooms.map((rm) => {
                const isRoomSel = selectedRoomIdsForDistribute.includes(rm.id);
                return (
                  <TouchableOpacity
                    key={rm.id}
                    style={[styles.roomSelectCard, isRoomSel && styles.roomSelectCardActive]}
                    onPress={() => {
                      if (isRoomSel) {
                        setSelectedRoomIdsForDistribute(selectedRoomIdsForDistribute.filter((id) => id !== rm.id));
                      } else {
                        setSelectedRoomIdsForDistribute([...selectedRoomIdsForDistribute, rm.id]);
                      }
                    }}
                  >
                    <Ionicons
                      name={isRoomSel ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={isRoomSel ? '#4F46E5' : '#94A3B8'}
                    />
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={[styles.roomSelectName, isRoomSel && { color: '#4F46E5', fontWeight: '700' }]}>
                        {rm.roomName}
                      </Text>
                      <Text style={styles.roomSelectSub}>
                        {rm.capacity} Kişi • {rm.tag}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ADIM C: DAĞITIM YÖNTEMİ & ÇALIŞTIRMA */}
          <View style={styles.wizardCard}>
            <Text style={styles.cardHeaderLabel}>4. DAĞITIM STRATEJİSİ</Text>

            <View style={styles.strategyRow}>
              <TouchableOpacity
                style={[styles.strategyCard, isButterfly && styles.strategyCardActive]}
                onPress={() => setIsButterfly(true)}
              >
                <View style={styles.strategyIconWrap}>
                  <Ionicons name="sparkles" size={20} color={isButterfly ? '#4F46E5' : '#64748B'} />
                </View>
                <Text style={[styles.strategyTitle, isButterfly && { color: '#4F46E5' }]}>Kelebek Dağıtım (Önerilen)</Text>
                <Text style={styles.strategySub}>
                  Farklı ders ve kademeler yan yana / ardışık gelecek şekilde çapraz yerleştirilir.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.strategyCard, !isButterfly && styles.strategyCardActive]}
                onPress={() => setIsButterfly(false)}
              >
                <View style={styles.strategyIconWrap}>
                  <Ionicons name="shuffle" size={20} color={!isButterfly ? '#4F46E5' : '#64748B'} />
                </View>
                <Text style={[styles.strategyTitle, !isButterfly && { color: '#4F46E5' }]}>Homojen Dağıtım</Text>
                <Text style={styles.strategySub}>
                  Öğrenciler rastgele karıştırılarak salonlara eşit oranda dağıtılır.
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.runDistributeBtn, distributing && { opacity: 0.7 }]}
              onPress={handleRunDistribution}
              disabled={distributing}
            >
              {distributing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="flash" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.runDistributeBtnText}>
                {distributing ? 'Öğrenciler Yerleştiriliyor...' : 'Öğrencileri Oturt ve Planı Hazırla'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ============================================================= */}
      {/* TAB 4: YERLEŞİM SONUÇLARI & EXCEL RAPORLARI */}
      {/* ============================================================= */}
      {activeTab === 'results' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Sınav Seçici */}
          <View style={styles.distributeExamPickerCard}>
            <Text style={styles.cardHeaderLabel}>GÖRÜNTÜLENEN SINAV</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {exams.map((ex) => {
                const isSel = selectedExamId === ex.id;
                return (
                  <TouchableOpacity
                    key={ex.id}
                    style={[styles.examPill, isSel && styles.examPillActive]}
                    onPress={() => setSelectedExamId(ex.id)}
                  >
                    <Text style={[styles.examPillText, isSel && styles.examPillTextActive]}>{ex.name}</Text>
                    <Text style={[styles.examPillSub, isSel && { color: '#E0E7FF' }]}>
                      {ex.lessonHour}. Ders ({ex.examDate})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ÖĞRENCİ & VELİ GÖRÜNÜRLÜK AYARI KARTI */}
          {selectedExamId && (
            <View style={styles.visibilityCard}>
              <View style={styles.visibilityLeft}>
                <View
                  style={[
                    styles.visibilityIconBox,
                    { backgroundColor: isExamPublished ? '#ECFDF5' : '#FEF2F2' },
                  ]}
                >
                  <Ionicons
                    name={isExamPublished ? 'eye' : 'eye-off'}
                    size={22}
                    color={isExamPublished ? '#10B981' : '#EF4444'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={styles.visibilityTitle}>Sınav Yerlerini Öğrenci ve Veliler Görsün mü?</Text>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: isExamPublished ? '#D1FAE5' : '#FEE2E2' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          { color: isExamPublished ? '#065F46' : '#991B1B' },
                        ]}
                      >
                        {isExamPublished ? 'GÖREBİLİRLER (AÇIK)' : 'GİZLENDİ (KAPALI)'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.visibilitySub}>
                    {isExamPublished
                      ? 'Öğrenci ve veliler kendi ekranlarında sınav salonu ve sıra numarasını görebilir.'
                      : 'Sınav yerleri gizlendi. İzin verilene kadar öğrenci ve veliler sınav yerlerini göremez.'}
                  </Text>
                </View>
              </View>

              <Switch
                value={isExamPublished}
                onValueChange={handleToggleExamPublish}
                disabled={publishing}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                thumbColor={isExamPublished ? '#FFFFFF' : '#F8FAFC'}
              />
            </View>
          )}

          {/* EXCEL & A4 PDF RAPORLARI İNDİRME KARTI */}
          <View style={styles.reportCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="document-text" size={24} color="#16A34A" />
              <View style={{ flex: 1 }}>
                <Text style={styles.reportCardTitle}>Sınav Raporları & Çıktılar (XLSX / PDF)</Text>
                <Text style={styles.reportCardSub}>Çoklu sheet Excel (.xlsx), A4 baskı ve PDF formatında resmi raporlar</Text>
              </View>
            </View>

            <View style={styles.exportBtnGroup}>
              <TouchableOpacity
                style={[styles.exportBtn, { backgroundColor: '#16A34A' }]}
                onPress={() => handleOpenAttendanceExportModal()}
                disabled={exporting}
              >
                <Ionicons name="people" size={17} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>Salon Yoklama Listesi (XLSX / PDF)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportBtn, { backgroundColor: '#4F46E5' }]}
                onPress={handleDownloadStudentInfoXlsx}
                disabled={exporting}
              >
                <Ionicons name="newspaper" size={17} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>Öğrenci Bilgilendirme (Excel .xlsx)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportBtn, { backgroundColor: '#0D9488' }]}
                onPress={handlePrintStudentInfoPdf}
                disabled={exporting}
              >
                <Ionicons name="print-outline" size={17} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>Öğrenci Bilgilendirme (PDF / Yazdır)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportBtn, { backgroundColor: '#D97706' }]}
                onPress={() => handleExportExcel('proctors')}
                disabled={exporting}
              >
                <Ionicons name="school" size={17} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>Gözetmen Görev Listesi (Excel)</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SALONLAR VE YERLEŞEN ÖĞRENCİLER */}
          {!examDetail || !examDetail.rooms || examDetail.rooms.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="alert-circle-outline" size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Bu Sınav İçin Henüz Yerleşim Yapılmamış</Text>
              <Text style={styles.emptySub}>
                "Dağıtım" sekmesine geçerek şubeleri ve salonları seçip oturma planını oluşturabilirsiniz.
              </Text>
            </View>
          ) : (
            <>
              {/* ÖĞRENCİ SINAV YERİ ARAMA KARTI (SALONLARIN ÜZERİNDE) */}
              <View style={styles.studentSearchCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Ionicons name="search" size={20} color="#4F46E5" />
                  <Text style={styles.studentSearchCardTitle}>Öğrenci Sınav Yeri Arama</Text>
                  {studentSearchQuery.trim().length > 0 && (
                    <View style={styles.resultBadge}>
                      <Text style={styles.resultBadgeText}>{matchingStudents.length} Eşleşme</Text>
                    </View>
                  )}
                </View>

                <View style={styles.studentSearchInputWrapper}>
                  <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginLeft: 10 }} />
                  <TextInput
                    style={styles.studentSearchInput}
                    placeholder="Öğrenci adı, soyadı, sınıfı veya okul no ile ara..."
                    value={studentSearchQuery}
                    onChangeText={setStudentSearchQuery}
                    placeholderTextColor="#94A3B8"
                    clearButtonMode="while-editing"
                  />
                  {studentSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setStudentSearchQuery('')} style={{ padding: 8 }}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Arama Sonuçları Listesi */}
                {studentSearchQuery.trim().length > 0 && (
                  <View style={styles.searchResultsContainer}>
                    {matchingStudents.length === 0 ? (
                      <View style={styles.searchEmptyBox}>
                        <Ionicons name="alert-circle-outline" size={24} color="#94A3B8" />
                        <Text style={styles.searchEmptyText}>
                          "{studentSearchQuery}" ile eşleşen öğrenci bulunamadı.
                        </Text>
                      </View>
                    ) : (
                      matchingStudents.map((item, idx) => (
                        <View key={item.student.id || idx} style={styles.searchResultItem}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.searchResultName}>{item.student.fullName}</Text>
                              <View style={styles.studentNumberBadge}>
                                <Text style={styles.studentNumberBadgeText}>No: {item.student.studentNumber}</Text>
                              </View>
                              <View style={styles.studentClassBadge}>
                                <Text style={styles.studentClassBadgeText}>
                                  {item.student.grade}-{item.student.section}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.searchResultDetailsRow}>
                              <View style={styles.searchRoomPill}>
                                <Ionicons name="business" size={13} color="#4F46E5" />
                                <Text style={styles.searchRoomPillText}>Salon: {item.roomName}</Text>
                              </View>

                              <View style={styles.searchSeatPill}>
                                <Ionicons name="file-tray-full" size={13} color="#059669" />
                                <Text style={styles.searchSeatPillText}>Sıra: {item.student.seatNumber}</Text>
                              </View>

                              {item.student.lessonName ? (
                                <View style={styles.searchLessonPill}>
                                  <Ionicons name="book" size={13} color="#D97706" />
                                  <Text style={styles.searchLessonPillText}>{item.student.lessonName}</Text>
                                </View>
                              ) : null}
                            </View>

                            {item.proctorTeacherName ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <Ionicons name="person-outline" size={12} color="#64748B" />
                                <Text style={{ fontSize: 11, color: '#64748B' }}>
                                  Gözetmen: {item.proctorTeacherName}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={{ flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                            <TouchableOpacity
                              style={styles.goToRoomBtn}
                              onPress={() => {
                                setCollapsedRooms((prev) => ({ ...prev, [item.roomName]: false }));
                                Alert.alert(
                                  `${item.roomName} Salonu Açıldı`,
                                  `${item.student.fullName} (No: ${item.student.studentNumber})\nSıra: ${item.student.seatNumber}\nDers: ${item.student.lessonName || '-'}\nGözetmen: ${item.proctorTeacherName || 'Belirtilmedi'}`
                                );
                              }}
                            >
                              <Ionicons name="eye-outline" size={14} color="#FFFFFF" />
                              <Text style={styles.goToRoomBtnText}>Salonu Aç</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.changeSeatBtn}
                              onPress={() => handleOpenSeatChangeModal(item.student)}
                            >
                              <Ionicons name="swap-horizontal" size={13} color="#4F46E5" />
                              <Text style={styles.changeSeatBtnText}>Sıra Değiştir</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>

              {/* TÜMÜNÜ AÇ / TÜMÜNÜ KAPAT KONTROLÜ */}
              <View style={styles.roomAccordionControlBar}>
                <Text style={styles.roomAccordionCountText}>
                  Sınav Salonları Listesi ({examDetail.rooms.length} Salon)
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={expandAllRooms} style={styles.accordionActionBtn}>
                    <Ionicons name="chevron-down-circle-outline" size={14} color="#4F46E5" />
                    <Text style={styles.accordionActionBtnText}>Tümünü Aç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={collapseAllRooms} style={styles.accordionActionBtn}>
                    <Ionicons name="chevron-up-circle-outline" size={14} color="#64748B" />
                    <Text style={[styles.accordionActionBtnText, { color: '#64748B' }]}>Tümünü Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {examDetail.rooms.map((rm: any) => {
                const isCollapsed = collapsedRooms[rm.roomName] === true;

                return (
                  <View key={rm.roomName} style={styles.resultRoomSection}>
                    {/* SALON BAŞLIĞI VE GÖZETMEN KARTI (TIKLANABİLİR AKORDİYON) */}
                    <TouchableOpacity
                      style={styles.resultRoomHeader}
                      activeOpacity={0.7}
                      onPress={() => toggleRoomCollapse(rm.roomName)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.resultRoomTitle}>{rm.roomName} Salonu</Text>
                          <View style={styles.resultRoomCountBadge}>
                            <Text style={styles.resultRoomCountText}>{rm.studentCount} Öğrenci</Text>
                          </View>
                          <Ionicons
                            name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                            size={18}
                            color="#4F46E5"
                          />
                        </View>

                        {/* Otomatik Tespit Edilen Gözetmen Öğretmen */}
                        <View style={styles.proctorRow}>
                          <Ionicons name="person-circle" size={16} color="#4F46E5" />
                          <Text style={styles.proctorLabel}>Gözetmen: </Text>
                          <Text style={styles.proctorName}>
                            {rm.proctorTeacherName || 'Ders programından tespit edilemedi'}
                          </Text>
                          <TouchableOpacity
                            style={styles.proctorChangeBtn}
                            onPress={() => handleOpenProctorModal(rm.roomName, rm.proctorTeacherName)}
                          >
                            <Text style={styles.proctorChangeBtnText}>Değiştir</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.singleRoomExportBtn}
                        onPress={() => handleExportExcel('attendance', rm.roomName)}
                      >
                        <Ionicons name="download-outline" size={18} color="#16A34A" />
                      </TouchableOpacity>
                    </TouchableOpacity>

                    {/* KAPALIYKEN HIZLI ÖZET ROZETLERİ */}
                    {isCollapsed && (
                      <TouchableOpacity
                        style={styles.collapsedSummaryRow}
                        activeOpacity={0.7}
                        onPress={() => toggleRoomCollapse(rm.roomName)}
                      >
                        {(rm.lessonSummary && rm.lessonSummary.length > 0 ? rm.lessonSummary : rm.summary || [])
                          .slice(0, 4)
                          .map((ls: any, i: number) => (
                            <View key={i} style={styles.summaryTag}>
                              <Text style={styles.summaryTagText}>
                                {ls.label || `${ls.branch} (${ls.lessonName})`}:{' '}
                                <Text style={{ fontWeight: '700' }}>{ls.count}</Text>
                              </Text>
                            </View>
                          ))}
                        {(rm.lessonSummary?.length || 0) > 4 && (
                          <Text style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center' }}>
                            +{(rm.lessonSummary?.length || 0) - 4} daha
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {/* AÇIKKEN SIRA SIRA ÖĞRENCİ KARTLARI VE DETAYLI ÖZET */}
                    {!isCollapsed && (
                      <>
                        <View style={styles.seatingListGrid}>
                          {rm.students.map((st: any) => (
                            <TouchableOpacity
                              key={st.id}
                              style={styles.seatingCard}
                              activeOpacity={0.7}
                              onPress={() => handleOpenSeatChangeModal({ ...st, roomName: rm.roomName })}
                            >
                              <View style={styles.seatNumberCircle}>
                                <Text style={styles.seatNumberText}>{st.seatNumber}</Text>
                              </View>
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.seatingStudentName} numberOfLines={1}>
                                  {st.fullName}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                                  <Text style={styles.seatingStudentSub}>No: {st.studentNumber}</Text>
                                  <Text style={styles.seatingStudentSub}>• {st.grade}-{st.section}</Text>
                                </View>
                                <View style={styles.seatingLessonBadge}>
                                  <Text style={styles.seatingLessonText} numberOfLines={1}>
                                    {st.lessonName}
                                  </Text>
                                </View>
                              </View>
                              <View style={{ padding: 4, justifyContent: 'center' }}>
                                <Ionicons name="swap-horizontal" size={18} color="#6366F1" />
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* ALT ÖZET BİLGİSİ (DERS & KADEME & ŞUBE) */}
                        <View style={styles.roomFooterSummary}>
                          <Text style={styles.roomFooterSummaryTitle}>Salon Dağılım Özeti:</Text>

                          {/* 1. Ders Bazında Dağılım (Örn: Fizik 11 5 kişi, Fizik 12 3 kişi, Tarih 22 kişi) */}
                          {rm.lessonSummary && rm.lessonSummary.length > 0 && (
                            <View style={{ marginTop: 6 }}>
                              <Text style={styles.summarySubHeader}>📚 Ders Bazında Dağılım:</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                {rm.lessonSummary.map((ls: any, idx: number) => (
                                  <View key={idx} style={[styles.summaryTag, styles.summaryTagLesson]}>
                                    <Text style={styles.summaryTagTextLesson}>
                                      {ls.label}: <Text style={{ fontWeight: '800' }}>{ls.count} Kişi</Text>
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* 2. Sınıf Düzeyi (Kademe) Bazında Dağılım (Örn: 9. Sınıf 6 kişi, 11. Sınıf 9 kişi) */}
                          {rm.gradeSummary && rm.gradeSummary.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                              <Text style={styles.summarySubHeader}>🎓 Sınıf Düzeyi Dağılımı:</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                {rm.gradeSummary.map((gs: any, idx: number) => (
                                  <View key={idx} style={[styles.summaryTag, styles.summaryTagGrade]}>
                                    <Text style={styles.summaryTagTextGrade}>
                                      {gs.label}: <Text style={{ fontWeight: '800' }}>{gs.count} Kişi</Text>
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* 3. Şube Bazında Dağılım */}
                          {rm.summary && rm.summary.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                              <Text style={styles.summarySubHeader}>🏫 Şube Bazında Dağılım:</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                {rm.summary.map((sm: any, idx: number) => (
                                  <View key={idx} style={styles.summaryTag}>
                                    <Text style={styles.summaryTagText}>
                                      {sm.branch} ({sm.lessonName}): <Text style={{ fontWeight: '700' }}>{sm.count}</Text>
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ============================================================= */}
      {/* MODAL: SALON EKLE / DÜZENLE */}
      {/* ============================================================= */}
      <Modal visible={roomModalVisible} transparent animationType="fade" onRequestClose={() => setRoomModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRoom ? 'Salonu Düzenle' : 'Yeni Sınav Salonu Tanımla'}</Text>
              <TouchableOpacity onPress={() => setRoomModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Salon Adı (Örn: 9-A, Konferans Salonu, Salon 1)</Text>
            <TextInput
              style={styles.modalInput}
              value={newRoomName}
              onChangeText={setNewRoomName}
              placeholder="Salon adı"
            />

            <Text style={styles.inputLabel}>Kapasite (Öğrenci Sayısı)</Text>
            <TextInput
              style={styles.modalInput}
              value={newRoomCapacity}
              onChangeText={setNewRoomCapacity}
              keyboardType="numeric"
              placeholder="30"
            />

            <Text style={styles.inputLabel}>Oturum Tipi & Etiketi</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.tagOptionBtn, newRoomTag === 'İkili Oturum' && styles.tagOptionBtnActive]}
                onPress={() => setNewRoomTag('İkili Oturum')}
              >
                <Text style={[styles.tagOptionText, newRoomTag === 'İkili Oturum' && styles.tagOptionTextActive]}>
                  👥 İkili Oturum
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tagOptionBtn, newRoomTag === 'Tekli Oturum' && styles.tagOptionBtnActive]}
                onPress={() => setNewRoomTag('Tekli Oturum')}
              >
                <Text style={[styles.tagOptionText, newRoomTag === 'Tekli Oturum' && styles.tagOptionTextActive]}>
                  👤 Tekli Oturum
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRoomModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveRoom}>
                <Text style={styles.modalSaveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================= */}
      {/* MODAL: SINAV TANIMLA */}
      {/* ============================================================= */}
      <Modal visible={examModalVisible} transparent animationType="fade" onRequestClose={() => setExamModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Ortak Yazılı Sınavı</Text>
              <TouchableOpacity onPress={() => setExamModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Sınav Adı</Text>
            <TextInput
              style={styles.modalInput}
              value={newExamName}
              onChangeText={setNewExamName}
              placeholder="Örn: 1. Dönem 1. Ortak Yazılı Sınavı"
            />

            <Text style={styles.inputLabel}>Sınav Tarihi (YYYY-AA-GG)</Text>
            <TextInput
              style={styles.modalInput}
              value={newExamDate}
              onChangeText={setNewExamDate}
              placeholder="2026-10-28"
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Kaçıncı Ders Saati?</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newExamLessonHour}
                  onChangeText={setNewExamLessonHour}
                  keyboardType="numeric"
                  placeholder="3"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Başlangıç Saati</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newExamStartTime}
                  onChangeText={setNewExamStartTime}
                  placeholder="09:50"
                />
              </View>
            </View>

            <Text style={styles.hintText}>
              ℹ️ Kaçıncı ders saatinde yapılacağını girdiğinizde sistem o saatte o salonda dersi olan öğretmeni otomatik gözetmen olarak tespit edecektir.
            </Text>

            {/* Öğrenci ve Veli Görünürlüğü Seçeneği */}
            <View style={styles.modalSwitchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalSwitchLabel}>Sınav Yerlerini Öğrenci ve Veliler Görsün mü?</Text>
                <Text style={styles.modalSwitchSub}>
                  {newExamIsPublished
                    ? 'Açık: Öğrenci ve veliler sınav salon ve sıra bilgilerini kendi panellerinde görebilir.'
                    : 'Kapalı: Sınav yerleri gizlenir, öğrenci panelinde oturma yeri görünmez.'}
                </Text>
              </View>
              <Switch
                value={newExamIsPublished}
                onValueChange={setNewExamIsPublished}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                thumbColor={newExamIsPublished ? '#FFFFFF' : '#F8FAFC'}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setExamModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveExam}>
                <Text style={styles.modalSaveBtnText}>Sınavı Oluştur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================= */}
      {/* MODAL: GÖZETMEN ÖĞRETMEN DEĞİŞTİR (AKILLI SIRALAMA & ROZETLER) */}
      {/* ============================================================= */}
      <Modal visible={proctorModalVisible} transparent animationType="fade" onRequestClose={() => setProctorModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 500, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Gözetmen Öğretmen Seçimi</Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {proctorRoomName} Salonu için gözetmen belirleyin
                </Text>
              </View>
              <TouchableOpacity onPress={() => setProctorModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Arama Çubuğu */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, marginVertical: 10 }}>
              <Ionicons name="search" size={18} color="#64748B" />
              <TextInput
                style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, fontSize: 13, color: '#0F172A' }}
                placeholder="Öğretmen ismi veya rozet ara..."
                value={proctorSearchQuery}
                onChangeText={setProctorSearchQuery}
              />
              {proctorSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setProctorSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Seçili Gözetmen Önizleme */}
            <View style={{ backgroundColor: '#EEF2FF', padding: 8, borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#3730A3', fontWeight: '600' }}>
                Seçili: {proctorTeacherName || 'Henüz atanmadı'}
              </Text>
            </View>

            {/* Öğretmen Listesi */}
            {loadingProctors ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#4F46E5" />
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Öğretmen ders programı ve nöbet durumları taranıyor...</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={true}>
                {filteredProctors.map((p, idx) => {
                  const isSelected = proctorTeacherName.trim().toLowerCase() === p.teacherName.trim().toLowerCase();
                  return (
                    <TouchableOpacity
                      key={p.id || idx}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        marginBottom: 6,
                        backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onPress={() => setProctorTeacherName(p.teacherName)}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '600', color: isSelected ? '#4F46E5' : '#0F172A' }}>
                          {p.teacherName}
                        </Text>
                        {p.assignedRoom && (
                          <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 1 }}>
                            {p.assignedRoom} salonunda görevli
                          </Text>
                        )}
                      </View>

                      {/* Öncelik Rozeti */}
                      {p.badge ? (
                        <View
                          style={{
                            backgroundColor: p.badgeColor ? `${p.badgeColor}18` : '#F1F5F9',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: p.badgeColor ? `${p.badgeColor}40` : '#CBD5E1',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: p.badgeColor || '#475569' }}>
                            {p.badge}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}

                {filteredProctors.length === 0 && (
                  <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, paddingVertical: 20 }}>
                    Aramaya uygun öğretmen bulunamadı.
                  </Text>
                )}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setProctorModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveProctor}>
                <Text style={styles.modalSaveBtnText}>Gözetmeni Ata</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================= */}
      {/* MODAL: SALON YOKLAMA EXPORT VE ÖZET SEÇİMİ (XLSX / PDF) */}
      {/* ============================================================= */}
      <Modal visible={attendanceExportModalVisible} transparent animationType="fade" onRequestClose={() => setAttendanceExportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 460 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Salon Yoklama Listesi Çıktısı</Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {exportTargetRoomName ? `${exportTargetRoomName} Salonu` : 'Tüm Salonlar (Her salon ayrı sheet)'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAttendanceExportModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginTop: 8, marginBottom: 8 }}>
              Hangi özet istatistiği eklensin?
            </Text>

            {/* Seçenek 1: Sadece Derse Göre */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                marginBottom: 6,
                backgroundColor: selectedSummaryType === 'course' ? '#EEF2FF' : '#F8FAFC',
                borderWidth: 1,
                borderColor: selectedSummaryType === 'course' ? '#4F46E5' : '#E2E8F0',
              }}
              onPress={() => setSelectedSummaryType('course')}
            >
              <Ionicons
                name={selectedSummaryType === 'course' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedSummaryType === 'course' ? '#4F46E5' : '#94A3B8'}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>
                  📊 Ders Dağılımı İstatistiği (Önerilen)
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Örn: Fizik 11: 5 kişi, Fizik 12: 3 kişi, Tarih: 22 kişi
                </Text>
              </View>
            </TouchableOpacity>

            {/* Seçenek 2: Sadece Kademeye Göre */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                marginBottom: 6,
                backgroundColor: selectedSummaryType === 'grade' ? '#EEF2FF' : '#F8FAFC',
                borderWidth: 1,
                borderColor: selectedSummaryType === 'grade' ? '#4F46E5' : '#E2E8F0',
              }}
              onPress={() => setSelectedSummaryType('grade')}
            >
              <Ionicons
                name={selectedSummaryType === 'grade' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedSummaryType === 'grade' ? '#4F46E5' : '#94A3B8'}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>
                  🎓 Sınıf Düzeyi (Kademe) Dağılımı
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Örn: 9. Sınıf: 6 kişi, 11. Sınıf: 9 kişi
                </Text>
              </View>
            </TouchableOpacity>

            {/* Seçenek 3: Şube Bazında */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                marginBottom: 6,
                backgroundColor: selectedSummaryType === 'branch' ? '#EEF2FF' : '#F8FAFC',
                borderWidth: 1,
                borderColor: selectedSummaryType === 'branch' ? '#4F46E5' : '#E2E8F0',
              }}
              onPress={() => setSelectedSummaryType('branch')}
            >
              <Ionicons
                name={selectedSummaryType === 'branch' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedSummaryType === 'branch' ? '#4F46E5' : '#94A3B8'}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>
                  🏫 Şube Dağılımı İstatistiği
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Örn: 9-A: 4 kişi, 10-B: 7 kişi
                </Text>
              </View>
            </TouchableOpacity>

            {/* Seçenek 4: Tümü */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                marginBottom: 6,
                backgroundColor: selectedSummaryType === 'all' ? '#EEF2FF' : '#F8FAFC',
                borderWidth: 1,
                borderColor: selectedSummaryType === 'all' ? '#4F46E5' : '#E2E8F0',
              }}
              onPress={() => setSelectedSummaryType('all')}
            >
              <Ionicons
                name={selectedSummaryType === 'all' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedSummaryType === 'all' ? '#4F46E5' : '#94A3B8'}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>
                  📑 Tüm Özet Bilgileri Eklensin
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Ders, Kademe ve Şube istatistiklerinin hepsi
                </Text>
              </View>
            </TouchableOpacity>

            {/* Seçenek 5: Özet Olmasın */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                marginBottom: 14,
                backgroundColor: selectedSummaryType === 'none' ? '#EEF2FF' : '#F8FAFC',
                borderWidth: 1,
                borderColor: selectedSummaryType === 'none' ? '#4F46E5' : '#E2E8F0',
              }}
              onPress={() => setSelectedSummaryType('none')}
            >
              <Ionicons
                name={selectedSummaryType === 'none' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedSummaryType === 'none' ? '#4F46E5' : '#94A3B8'}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>
                  ❌ Özet Tablosu Olmasın
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Yalnızca salon öğrenci yoklama ve imza listesi
                </Text>
              </View>
            </TouchableOpacity>

            {/* Gözetmen Adı Yazsın mı Checkbox */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                marginBottom: 14,
                backgroundColor: includeProctorName ? '#F0FDF4' : '#F8FAFC',
                borderWidth: 1,
                borderColor: includeProctorName ? '#86EFAC' : '#E2E8F0',
                gap: 10,
              }}
              onPress={() => setIncludeProctorName(!includeProctorName)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={includeProctorName ? 'checkbox' : 'square-outline'}
                size={22}
                color={includeProctorName ? '#16A34A' : '#94A3B8'}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                  Gözetmen Adı Yazsın mı?
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                  {includeProctorName
                    ? 'Evet, atanan gözetmenin adı listelerde ve imza kutusunda yazdırılsın.'
                    : 'Hayır, gözetmen adı boş bırakılsın (noktalı imza çizgisi açılsın).'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Butonlar */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#16A34A',
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                onPress={handleDownloadAttendanceXlsx}
                disabled={exporting}
              >
                <Ionicons name="document-text" size={17} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Excel (.xlsx)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#2563EB',
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                onPress={handlePrintAttendancePdf}
              >
                <Ionicons name="print-outline" size={17} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>A4 PDF / Yazdır</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================= */}
      {/* MODAL: ÖĞRENCİ BİLGİLENDİRME ÇIKTI AYARLARI (A4/A5 & ŞUBE SEÇİMİ) */}
      {/* ============================================================= */}
      <Modal
        visible={studentInfoPrintModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStudentInfoPrintModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 520, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🖨️ Öğrenci Bilgilendirme Çıktısı</Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Kağıt boyutunu ve yazdırmak istediğiniz sınıfları belirleyin
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStudentInfoPrintModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* 1. Soru: Kağıt Türü */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginTop: 4, marginBottom: 8 }}>
                1. Kağıt Türü Seçiniz:
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                {/* A4 Seçeneği */}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: studentInfoPaperSize === 'A4' ? '#EEF2FF' : '#F8FAFC',
                    borderWidth: 1.5,
                    borderColor: studentInfoPaperSize === 'A4' ? '#4F46E5' : '#E2E8F0',
                  }}
                  onPress={() => setStudentInfoPaperSize('A4')}
                >
                  <Ionicons
                    name={studentInfoPaperSize === 'A4' ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={studentInfoPaperSize === 'A4' ? '#4F46E5' : '#94A3B8'}
                  />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>📄 A4 Boyutu</Text>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>Standart tam sayfa</Text>
                  </View>
                </TouchableOpacity>

                {/* A5 Seçeneği */}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: studentInfoPaperSize === 'A5' ? '#EEF2FF' : '#F8FAFC',
                    borderWidth: 1.5,
                    borderColor: studentInfoPaperSize === 'A5' ? '#4F46E5' : '#E2E8F0',
                  }}
                  onPress={() => setStudentInfoPaperSize('A5')}
                >
                  <Ionicons
                    name={studentInfoPaperSize === 'A5' ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={studentInfoPaperSize === 'A5' ? '#4F46E5' : '#94A3B8'}
                  />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>📑 A5 Boyutu</Text>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>Yarım sayfa / Kompakt</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* 2. Soru: Neleri Yazdıralım? */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
                  2. Yazdırılacak Listeleri / Sınıfları Seçiniz:
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={handleSelectAllStudentInfoBranches}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: '#EEF2FF',
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#4338CA' }}>Tümünü Seç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleClearAllStudentInfoBranches}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: '#F1F5F9',
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>İşaretleri Kaldır</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tüm Okul Alfabetik Liste Checkbox */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 8,
                  backgroundColor: studentInfoIncludeAlpha ? '#F0FDFA' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: studentInfoIncludeAlpha ? '#0D9488' : '#E2E8F0',
                  gap: 10,
                }}
                onPress={() => setStudentInfoIncludeAlpha(!studentInfoIncludeAlpha)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={studentInfoIncludeAlpha ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={studentInfoIncludeAlpha ? '#0D9488' : '#94A3B8'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                    🏢 Tüm Okul (Alfabetik Genel Liste)
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Okul panolarına asmak için sınavdaki tüm öğrencilerin isim sıralı listesi
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Şubeler Listesi Başlığı */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginTop: 4, marginBottom: 6 }}>
                Sınıf / Şube Sayfaları ({studentInfoSelectedBranches.length} / {examDistinctBranches.length} seçili):
              </Text>

              {/* Şube Seçim Grid / List */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {examDistinctBranches.map((br) => {
                  const isChecked = studentInfoSelectedBranches.includes(br);
                  return (
                    <TouchableOpacity
                      key={br}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 6,
                        backgroundColor: isChecked ? '#EEF2FF' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: isChecked ? '#4F46E5' : '#E2E8F0',
                        gap: 6,
                      }}
                      onPress={() => {
                        if (isChecked) {
                          setStudentInfoSelectedBranches(studentInfoSelectedBranches.filter((k) => k !== br));
                        } else {
                          setStudentInfoSelectedBranches([...studentInfoSelectedBranches, br]);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={17}
                        color={isChecked ? '#4F46E5' : '#94A3B8'}
                      />
                      <Text style={{ fontSize: 12, fontWeight: isChecked ? '700' : '500', color: isChecked ? '#312E81' : '#334155' }}>
                        {br}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Butonlar */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#F1F5F9',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => setStudentInfoPrintModalVisible(false)}
              >
                <Text style={{ color: '#475569', fontWeight: '600', fontSize: 13 }}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 2,
                  backgroundColor: '#0D9488',
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                onPress={handleExecutePrintStudentInfoPdf}
              >
                <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                  {studentInfoPaperSize} PDF / Yazdır
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================= */}
      {/* MODAL: MANUEL ÖĞRENCİ YERİ DEĞİŞTİRME & TAKAS */}
      {/* ============================================================= */}
      <Modal visible={seatChangeModalVisible} transparent animationType="fade" onRequestClose={() => setSeatChangeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Öğrenci Yeri Değiştir / Takas</Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Öğrenciyi başka salona veya sıraya taşıyın
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSeatChangeModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedSeatStudent && (
              <View style={{ backgroundColor: '#F1F5F9', padding: 12, borderRadius: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                  {selectedSeatStudent.fullName}
                </Text>
                <Text style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Öğrenci No: {selectedSeatStudent.studentNumber} • Şube: {selectedSeatStudent.grade}-{selectedSeatStudent.section}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Ionicons name="location-outline" size={14} color="#4F46E5" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#4F46E5' }}>
                    Mevcut Yeri: {selectedSeatStudent.roomName} Salonu, Sıra {selectedSeatStudent.seatNumber}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.inputLabel}>Hedef Salon:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(examDetail?.rooms || rooms).map((rm: any) => {
                  const rName = rm.roomName;
                  const isSel = targetRoomForMove === rName;
                  return (
                    <TouchableOpacity
                      key={rName}
                      style={[styles.filterChip, isSel && styles.filterChipActive]}
                      onPress={() => setTargetRoomForMove(rName)}
                    >
                      <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                        {rName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.inputLabel}>Hedef Sıra Numarası:</Text>
            <TextInput
              style={styles.modalInput}
              value={targetSeatForMove}
              onChangeText={setTargetSeatForMove}
              keyboardType="numeric"
              placeholder="Örn: 5"
            />

            <Text style={styles.hintText}>
              ℹ️ Eğer seçtiğiniz hedef sırada başka bir öğrenci oturuyorsa, iki öğrencinin yeri karşılıklı olarak <Text style={{ fontWeight: '700' }}>otomatik takas edilir (Swap)</Text>. Sıra boş ise öğrenci doğrudan o sıraya taşınır.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSeatChangeModalVisible(false)}
                disabled={movingSeat}
              >
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#4F46E5' }]}
                onPress={handleSaveSeatChange}
                disabled={movingSeat}
              >
                {movingSeat ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Yeri Değiştir / Takas Et</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#4F46E5',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#4F46E5',
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
  },
  loadingText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  examCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  examCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#F8FAFF',
  },
  examCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  badgeSelected: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeSelectedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  examMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  examStatText: {
    fontSize: 12,
    color: '#475569',
  },
  examActionCol: {
    justifyContent: 'center',
    gap: 8,
    marginLeft: 12,
  },
  actionBtnSmall: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  roomCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roomName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagBadgeDouble: {
    backgroundColor: '#EEF2FF',
  },
  tagBadgeSingle: {
    backgroundColor: '#FEF3C7',
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tagBadgeTextDouble: {
    color: '#4F46E5',
  },
  tagBadgeTextSingle: {
    color: '#D97706',
  },
  roomCapacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  roomCapacityText: {
    fontSize: 12,
    color: '#64748B',
  },
  roomCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  roomEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomEditBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  roomDeleteBtn: {
    padding: 4,
  },
  distributeExamPickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  cardHeaderLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  cardSubText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
  },
  examPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  examPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  examPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  examPillTextActive: {
    color: '#FFFFFF',
  },
  examPillSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  wizardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  quickGradeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickGradeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickGradeBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  quickGradeBtnFullyActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  quickGradeBtnPartialActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
    borderWidth: 1.5,
  },
  quickGradeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickGradeBtnTextActive: {
    color: '#4F46E5',
  },
  quickGradeBtnTextFullyActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  quickGradeBtnTextPartialActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  quickLessonBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickLessonInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  quickLessonApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quickLessonApplyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  branchListContainer: {
    gap: 8,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  branchRowChecked: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  branchCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  branchKeyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  branchCountText: {
    fontSize: 12,
    color: '#64748B',
  },
  branchLessonInput: {
    width: 140,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    color: '#0F172A',
  },
  capacityMeterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 14,
  },
  capacityMeterCardSuccess: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  capacityMeterCardDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  capacityMeterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  capacityMeterSub: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  capacityBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  capacityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  roomSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomSelectCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roomSelectCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC',
  },
  roomSelectName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  roomSelectSub: {
    fontSize: 10,
    color: '#64748B',
  },
  strategyRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 12,
  },
  strategyCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  strategyCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  strategyIconWrap: {
    marginBottom: 6,
  },
  strategyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  strategySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 15,
  },
  runDistributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  runDistributeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  reportCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  reportCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  summaryCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  summaryCheckboxText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
  exportBtnGroup: {
    gap: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 8,
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultRoomSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  resultRoomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  resultRoomTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  resultRoomCountBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  resultRoomCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  proctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  proctorLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  proctorName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  proctorChangeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  proctorChangeBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  singleRoomExportBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  seatingListGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  seatingCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  seatNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  seatingStudentName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  seatingStudentSub: {
    fontSize: 10,
    color: '#64748B',
  },
  seatingLessonBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 2,
  },
  seatingLessonText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  roomAccordionControlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roomAccordionCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  accordionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  accordionActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  collapsedSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  roomFooterSummary: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  roomFooterSummaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 2,
  },
  summarySubHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  summaryTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  summaryTagText: {
    fontSize: 11,
    color: '#334155',
  },
  summaryTagLesson: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  summaryTagTextLesson: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  summaryTagGrade: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  summaryTagTextGrade: {
    fontSize: 11,
    color: '#3730A3',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 14,
  },
  tagOptionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagOptionBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  tagOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tagOptionTextActive: {
    color: '#4F46E5',
  },
  hintText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Görünürlük Kartı Stilleri
  visibilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  visibilityLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  visibilityIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  visibilitySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  // Öğrenci Sınav Yeri Arama Kartı Stilleri
  studentSearchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    marginBottom: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  studentSearchCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  resultBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  resultBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  studentSearchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  studentSearchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  searchResultsContainer: {
    marginTop: 12,
    gap: 8,
  },
  searchEmptyBox: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  searchEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  searchResultItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  studentNumberBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  studentNumberBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  studentClassBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  studentClassBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  searchResultDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  searchRoomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  searchRoomPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730A3',
  },
  searchSeatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  searchSeatPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  searchLessonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  searchLessonPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
  goToRoomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  goToRoomBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  changeSeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  changeSeatBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  // Modal Switch Row Stilleri
  modalSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSwitchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSwitchSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
});
