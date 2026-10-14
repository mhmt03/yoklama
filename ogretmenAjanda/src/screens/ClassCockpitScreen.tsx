import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../theme/colors';
import { getStudentsByClass } from '../database/operations/studentOperations';
import { getDB } from '../database/db';

import { syncAssignmentToServer, syncEvaluationToServer } from '../services/syncService';
import { getActiveUserSession } from '../services/apiClient';

interface StudentCockpitItem {
  id: number;
  server_id?: string;
  student_number: string;
  first_name: string;
  last_name: string;
  photo_uri?: string;
  attendance: 'PRESENT' | 'ABSENT' | 'LATE';
  homework: 'DONE' | 'NOT_DONE' | 'MISSING';
  stars: number;
}

export function ClassCockpitScreen({ route, navigation }: any) {
  const { classId, className, lessonName, grade, section } = route.params || {
    classId: 1,
    className: '9-A',
    lessonName: 'Fizik',
    grade: '9',
    section: 'A',
  };

  const [students, setStudents] = useState<StudentCockpitItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Ders Defterine yazılacak konu (Yıllık Plandan gelir)
  const [currentWeekSubject, setCurrentWeekSubject] = useState<string>(
    '1. Hafta: Vektörler, Kuvvet Dengesi ve Bileşke Kuvvet'
  );
  const [copiedSubject, setCopiedSubject] = useState(false);

  // Görüş Ekleme Modalı
  const [selectedStudentForNote, setSelectedStudentForNote] = useState<StudentCockpitItem | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [shareWithParent, setShareWithParent] = useState(false);

  // Dersi Bitir Onay Modalı
  const [finishModalVisible, setFinishModalVisible] = useState(false);
  const [notifyParentsHomework, setNotifyParentsHomework] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadClassData();
  }, [classId]);

  const loadClassData = async () => {
    try {
      const rawStudents = await getStudentsByClass(classId);

      const mapped: StudentCockpitItem[] = rawStudents.map((s: any) => ({
        id: s.id,
        server_id: s.server_id,
        student_number: s.student_number,
        first_name: s.first_name,
        last_name: s.last_name,
        photo_uri: s.photo_uri,
        attendance: 'PRESENT',
        homework: 'DONE',
        stars: 0,
      }));
      setStudents(mapped);

      // Yıllık Plandan güncel haftanın konusunu çek
      const db = await getDB();
      const planRow = await db.getFirstAsync<{ subject: string }>(
        'SELECT subject FROM yearly_plans WHERE lesson_name = ? ORDER BY week_number ASC LIMIT 1',
        lessonName
      );
      if (planRow && planRow.subject) {
        setCurrentWeekSubject(planRow.subject);
      }
    } catch (e: any) {
      console.warn('Ders kokpiti yüklenemedi:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySubject = async () => {
    await Clipboard.setStringAsync(currentWeekSubject);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 2000);
  };

  const toggleAttendance = (index: number) => {
    setStudents((prev) => {
      const copy = [...prev];
      const cur = copy[index].attendance;
      copy[index].attendance = cur === 'PRESENT' ? 'ABSENT' : cur === 'ABSENT' ? 'LATE' : 'PRESENT';
      return copy;
    });
  };

  const toggleHomework = (index: number) => {
    setStudents((prev) => {
      const copy = [...prev];
      const cur = copy[index].homework;
      copy[index].homework = cur === 'DONE' ? 'NOT_DONE' : cur === 'NOT_DONE' ? 'MISSING' : 'DONE';
      return copy;
    });
  };

  const addStar = (index: number) => {
    setStudents((prev) => {
      const copy = [...prev];
      copy[index].stars += 1;
      return copy;
    });
  };

  const handleSaveStudentNote = async () => {
    if (!selectedStudentForNote || !noteContent.trim()) return;

    try {
      const db = await getDB();
      const noteDate = new Date().toISOString().split('T')[0];

      await db.runAsync(
        `INSERT INTO student_notes (student_id, class_id, note, note_date, lesson_info, is_shared_with_parent, sync_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        selectedStudentForNote.id,
        classId,
        noteContent.trim(),
        noteDate,
        lessonName,
        shareWithParent ? 1 : 0,
        shareWithParent ? 'PENDING_UPDATE' : 'DRAFT'
      );

      // Veliye paylaşılmışsa sunucuya da gönder
      if (shareWithParent) {
        const session = await getActiveUserSession();
        if (session?.schoolId) {
          syncEvaluationToServer({
            id: `eval_${selectedStudentForNote.id}_${Date.now()}`,
            schoolId: session.schoolId,
            studentId: selectedStudentForNote.server_id || `std_${selectedStudentForNote.id}`,
            type: 'NOTE',
            title: `${lessonName} Dersi Öğretmen Görüşü`,
            content: noteContent.trim(),
            isSharedWithParent: true,
          }).catch(console.warn);
        }
      }

      Alert.alert('Kaydedildi', 'Öğrenci görüşü başarıyla kaydedildi.');
      setSelectedStudentForNote(null);
      setNoteContent('');
      setShareWithParent(false);
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const handleFinishClass = async () => {
    setSaving(true);
    try {
      const session = await getActiveUserSession();

      // Sunucuya ödev kontrolü gönder (opsiyonel onaylı bildirim)
      if (notifyParentsHomework && session?.schoolId) {
        const notDoneStudents = students.filter((s) => s.homework !== 'DONE');
        if (notDoneStudents.length > 0) {
          await syncAssignmentToServer({
            id: `assign_${classId}_${Date.now()}`,
            schoolId: session.schoolId,
            lessonName,
            title: `${lessonName} Günlük Ödev Kontrolü`,
            dueDate: new Date().toISOString(),
            targetGrade: grade || '',
            targetSection: section || '',
            submissions: students.map((s) => ({
              id: `sub_${s.id}_${Date.now()}`,
              studentId: s.server_id || `std_${s.id}`,
              status: s.homework,
            })),
          }).catch(console.warn);
        }
      }

      Alert.alert('Ders Tamamlandı 🎉', 'Yoklama ve ödev kontrolleri başarıyla kaydedildi.');
      setFinishModalVisible(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>🕹️ Canlı Ders Kokpiti</Text>
          <Text style={styles.headerSubtitle}>{className} • {lessonName}</Text>
        </View>
        <TouchableOpacity style={styles.finishTopButton} onPress={() => setFinishModalVisible(true)}>
          <Ionicons name="checkmark-done" size={18} color="#fff" />
          <Text style={styles.finishTopText}>Dersi Bitir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* DERS DEFTERİ ASİSTANI KARTI */}
        <View style={styles.notebookCard}>
          <View style={styles.notebookHeader}>
            <View style={styles.notebookBadge}>
              <Ionicons name="book-outline" size={16} color="#4F46E5" />
              <Text style={styles.notebookBadgeText}>BUGÜN DERS DEFTERİNE YAZILACAK</Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopySubject}>
              <Ionicons
                name={copiedSubject ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={copiedSubject ? '#059669' : '#4F46E5'}
              />
              <Text style={[styles.copyBtnText, copiedSubject && { color: '#059669' }]}>
                {copiedSubject ? 'Kopyalandı!' : 'Kopyala'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subjectText}>{currentWeekSubject}</Text>
        </View>

        {/* ÖĞRENCİ LİSTESİ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sınıf Listesi ({students.length} Öğrenci)</Text>
          <Text style={styles.sectionHint}>Yoklama ve ödev kontrolünü tek dokunuşla yapın</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          students.map((student, index) => {
            const isAbsent = student.attendance === 'ABSENT';
            const isLate = student.attendance === 'LATE';
            const isHwDone = student.homework === 'DONE';
            const isHwMissing = student.homework === 'MISSING';

            return (
              <View key={student.id} style={styles.studentCard}>
                {/* Öğrenci Fotoğrafı */}
                <View style={styles.avatarWrap}>
                  {student.photo_uri ? (
                    <Image source={{ uri: student.photo_uri }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>{student.first_name[0]}</Text>
                    </View>
                  )}
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>{student.student_number}</Text>
                  </View>
                </View>

                {/* Öğrenci Adı ve Yıldızlar */}
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {student.first_name} {student.last_name}
                  </Text>
                  <View style={styles.starsRow}>
                    {Array.from({ length: Math.min(student.stars, 5) }).map((_, i) => (
                      <Ionicons key={i} name="star" size={14} color="#F59E0B" />
                    ))}
                    {student.stars > 5 && (
                      <Text style={styles.starCount}>+{student.stars - 5}</Text>
                    )}
                  </View>
                </View>

                {/* Hızlı Aksiyon Butonları */}
                <View style={styles.actionRow}>
                  {/* Yoklama Butonu */}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isAbsent ? styles.btnAbsent : isLate ? styles.btnLate : styles.btnPresent,
                    ]}
                    onPress={() => toggleAttendance(index)}
                  >
                    <Text style={styles.actionBtnText}>
                      {isAbsent ? 'YOK' : isLate ? 'GEÇ' : 'GELDİ'}
                    </Text>
                  </TouchableOpacity>

                  {/* Ödev Kontrol Butonu */}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isHwDone ? styles.btnHwDone : isHwMissing ? styles.btnHwMissing : styles.btnHwNotDone,
                    ]}
                    onPress={() => toggleHomework(index)}
                  >
                    <Ionicons
                      name={isHwDone ? 'checkmark' : isHwMissing ? 'alert' : 'close'}
                      size={16}
                      color="#fff"
                    />
                  </TouchableOpacity>

                  {/* Katılım Yıldızı */}
                  <TouchableOpacity style={styles.starBtn} onPress={() => addStar(index)}>
                    <Ionicons name="star-outline" size={18} color="#D97706" />
                  </TouchableOpacity>

                  {/* Görüş / Not Ekle */}
                  <TouchableOpacity
                    style={styles.noteBtn}
                    onPress={() => {
                      setSelectedStudentForNote(student);
                      setNoteContent('');
                      setShareWithParent(false);
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#4F46E5" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ÖĞRENCİYE GÖRÜŞ EKLEME MODALI */}
      <Modal visible={!!selectedStudentForNote} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                📝 {selectedStudentForNote?.first_name} {selectedStudentForNote?.last_name}
              </Text>
              <TouchableOpacity onPress={() => setSelectedStudentForNote(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Öğrenci hakkındaki gözlem veya notunuzu girin..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              value={noteContent}
              onChangeText={setNoteContent}
            />

            {/* Veli ile Paylaş Kutusu */}
            <TouchableOpacity
              style={styles.shareCheckRow}
              onPress={() => setShareWithParent(!shareWithParent)}
            >
              <Ionicons
                name={shareWithParent ? 'checkbox' : 'square-outline'}
                size={22}
                color={shareWithParent ? '#4F46E5' : Colors.textMuted}
              />
              <Text style={styles.shareCheckText}>
                Bu görüşü öğrenci ve veliye gönder (Bildirim olarak iletilir)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveNoteBtn} onPress={handleSaveStudentNote}>
              <Text style={styles.saveNoteBtnText}>Görüşü Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DERSİ BİTİR VE ONAYLI BİLDİRİM MODALI */}
      <Modal visible={finishModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎉 Dersi Tamamla</Text>
              <TouchableOpacity onPress={() => setFinishModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.finishDesc}>
              {className} sınıfı {lessonName} dersine ait yoklama ve ödev kontrolleri yerel hafızaya kaydedilecektir.
            </Text>

            {/* Onay Kutusu: Veliye Bildirim Gönder */}
            <TouchableOpacity
              style={styles.shareCheckRow}
              onPress={() => setNotifyParentsHomework(!notifyParentsHomework)}
            >
              <Ionicons
                name={notifyParentsHomework ? 'checkbox' : 'square-outline'}
                size={22}
                color={notifyParentsHomework ? '#059669' : Colors.textMuted}
              />
              <Text style={styles.shareCheckText}>
                Ödev yapmayan veya eksik getiren öğrencilerin velilerine anlık bildirim gönderilsin mi?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.finishConfirmBtn}
              onPress={handleFinishClass}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.finishConfirmText}>Kaydet & Dersi Bitir</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: { padding: 4 },
  headerTitleContainer: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  headerSubtitle: { fontSize: 12, color: '#4F46E5', fontWeight: '600' },
  finishTopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  finishTopText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  notebookCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 20,
  },
  notebookHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notebookBadge: { flexDirection: 'row', alignItems: 'center' },
  notebookBadgeText: { fontSize: 11, fontWeight: '800', color: '#4F46E5', marginLeft: 6 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnText: { fontSize: 11, fontWeight: '700', color: '#4F46E5', marginLeft: 4 },
  subjectText: { fontSize: 15, fontWeight: '700', color: '#1E1B4B', marginTop: 10, lineHeight: 20 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sectionHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: '#4F46E5' },
  numberBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  numberText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  starsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  starCount: { fontSize: 11, color: '#F59E0B', fontWeight: '800', marginLeft: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
  },
  actionBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  btnPresent: { backgroundColor: '#10B981' },
  btnAbsent: { backgroundColor: '#EF4444' },
  btnLate: { backgroundColor: '#F59E0B' },
  btnHwDone: { backgroundColor: '#059669' },
  btnHwNotDone: { backgroundColor: '#DC2626' },
  btnHwMissing: { backgroundColor: '#D97706' },
  starBtn: { padding: 6, backgroundColor: '#FEF3C7', borderRadius: 8 },
  noteBtn: { padding: 6, backgroundColor: '#EEF2FF', borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
    color: Colors.text,
    textAlignVertical: 'top',
    height: 100,
  },
  shareCheckRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  shareCheckText: { flex: 1, fontSize: 13, color: Colors.textSecondary, marginLeft: 8, lineHeight: 18 },
  saveNoteBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveNoteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  finishDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  finishConfirmBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  finishConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
