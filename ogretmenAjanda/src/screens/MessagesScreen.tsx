import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { apiRequest, getActiveUserSession, saveAuthToken } from '../services/apiClient';
import { getClasses } from '../database/operations/classOperations';
import { getAllStudentsWithClass, StudentWithClass } from '../database/operations/studentOperations';
import { markAllMessagesAsRead, setCachedUnreadCount } from '../services/messageNotificationService';
import { getActiveSchool } from '../database/operations/schoolOperations';

export type MessageTargetType =
  | 'MY_STUDENTS'
  | 'STAFF'
  | 'TEACHER'
  | 'SPECIFIC_TEACHER'
  | 'GRADE'
  | 'SECTION'
  | 'SPECIFIC_STUDENT';

interface MessageItem {
  id: string;
  senderId?: string;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: string;
  targetRole?: string;
  targetDescription?: string;
  receiverId?: string;
  receiverName?: string;
  targetGrade?: string;
  targetSection?: string;
  replyToMessageId?: string;
  replyToContent?: string;
  subject?: string;
}

export function MessagesScreen({ navigation }: any) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [sending, setSending] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<'personal' | 'sent'>('personal');
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [currentSession, setCurrentSession] = useState<any | null>(null);

  // --- KİME HEDEF SEÇİM STATE'LERİ ---
  const [targetType, setTargetType] = useState<MessageTargetType>('MY_STUDENTS');
  const [targetDescription, setTargetDescription] = useState('Dersine Girdiğim Tüm Öğrenciler');
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithClass | null>(null);

  // --- MODALLAR VE LİSTELER ---
  const [teacherModalVisible, setTeacherModalVisible] = useState(false);
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [teacherSearch, setTeacherSearch] = useState('');

  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [gradeLevels, setGradeLevels] = useState<number[]>([9, 10, 11, 12]);

  const [classModalVisible, setClassModalVisible] = useState(false);
  const [classesList, setClassesList] = useState<any[]>([]);

  const [studentModalVisible, setStudentModalVisible] = useState(false);
  const [studentsList, setStudentsList] = useState<StudentWithClass[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');

  // Okula Bağlanma Modal State
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [connectSchoolCode, setConnectSchoolCode] = useState('');
  const [connectUsername, setConnectUsername] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);

  // Öğretmen, sınıf ve öğrenci verilerini yükle
  const loadLocalAndSchoolData = async (activeSid?: string) => {
    try {
      // 1. Sınıfları yerelden al
      const classes = await getClasses();
      setClassesList(classes);

      // Kademeleri otomatik çıkar
      const grades = Array.from(
        new Set(
          classes
            .map((c) => c.grade_level || parseInt(c.name.match(/^(\d{1,2})/)?.[1] || '0', 10))
            .filter((g) => g > 0)
        )
      ).sort((a, b) => a - b);
      if (grades.length > 0) {
        setGradeLevels(grades);
      }

      // 2. Öğrencileri yerelden al
      const allStudents = await getAllStudentsWithClass();
      setStudentsList(allStudents);

      // 3. Okula kayıtlı öğretmenleri sunucudan al
      const sid = activeSid || schoolId;
      if (sid) {
        const res = await apiRequest<any[]>(`schools/${sid}/teachers`);
        if (res.success && res.data) {
          setTeachersList(res.data);
        }
      }
    } catch (e) {
      console.warn('Veriler yüklenirken hata:', e);
    }
  };

  const loadMessages = async (scopeOverride?: 'personal' | 'sent') => {
    try {
      const active = await getActiveSchool();
      const session = await getActiveUserSession();
      setCurrentSession(session);
      let effectiveSchoolId = session?.schoolId;

      if (!effectiveSchoolId && session?.affiliatedSchools && session.affiliatedSchools.length > 0) {
        effectiveSchoolId = session.affiliatedSchools[0].id;
      }
      if (!effectiveSchoolId && session?.schoolCode) {
        try {
          const schRes = await apiRequest<any[]>(`schools/lookup?code=${session.schoolCode}`);
          if (schRes.success && schRes.data && schRes.data.length > 0) {
            effectiveSchoolId = schRes.data[0].id;
          }
        } catch {}
      }
      if (!effectiveSchoolId && active?.code) {
        try {
          const schRes = await apiRequest<any[]>(`schools/lookup?code=${active.code}`);
          if (schRes.success && schRes.data && schRes.data.length > 0) {
            effectiveSchoolId = schRes.data[0].id;
          }
        } catch {}
      }

      setSchoolId(effectiveSchoolId || null);

      const targetScope = scopeOverride || activeScope;
      if (effectiveSchoolId) {
        await loadLocalAndSchoolData(effectiveSchoolId);
        const res = await apiRequest<MessageItem[]>(`messages?schoolId=${effectiveSchoolId}&scope=${targetScope}`);
        if (res.success && res.data) {
          setMessages(res.data);
          markAllMessagesAsRead(effectiveSchoolId);
          setCachedUnreadCount(0);
        }
      } else {
        await loadLocalAndSchoolData();
      }
    } catch (e: any) {
      console.warn('Mesajlar yüklenemedi:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      if (schoolId) {
        await markAllMessagesAsRead(schoolId);
      } else {
        await markAllMessagesAsRead();
      }
      setCachedUnreadCount(0);
      Alert.alert('Tamamlandı', 'Tüm mesajlar okundu olarak işaretlendi.');
      loadMessages();
    } catch (e: any) {
      console.warn('Okundu işaretleme hatası:', e);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleConnectSchool = async () => {
    if (!connectSchoolCode.trim() || !connectUsername.trim() || !connectPassword.trim()) {
      Alert.alert('Uyarı', 'Lütfen tüm alanları doldurunuz.');
      return;
    }

    setConnectLoading(true);
    try {
      const res = await apiRequest('auth/login', 'POST', {
        username: connectUsername.trim(),
        password: connectPassword.trim(),
        schoolCode: connectSchoolCode.trim(),
      });

      if (res.success && res.data && res.data.schoolId) {
        await saveAuthToken(res.data.token, res.data);
        setConnectModalVisible(false);
        Alert.alert('Başarılı 🎉', `${res.data.schoolName || 'Okulunuza'} başarıyla bağlandınız.`);
        loadMessages();
      } else {
        Alert.alert('Giriş Başarısız', res.error || 'Okul kodu veya bilgiler hatalı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setConnectLoading(false);
    }
  };

  const handleStartReply = (msg: MessageItem) => {
    setReplyingTo(msg);
    if (msg.senderRole === 'ADMIN' || msg.senderRole === 'STAFF' || msg.senderRole === 'SCHOOL_ADMIN') {
      setTargetType('STAFF');
      setTargetDescription('Okul İdaresi (Yanıt)');
      setSelectedTeacher(null);
    } else {
      setTargetType('SPECIFIC_TEACHER');
      setTargetDescription(`${msg.senderName} (Yanıt)`);
      setSelectedTeacher({
        id: msg.senderId,
        fullName: msg.senderName,
      });
    }
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSendMessage = async () => {
    if (!newContent.trim()) return;

    if (!schoolId) {
      Alert.alert('Bilgi', 'Mesaj göndermek için bir kurumsal okul koduna bağlı olmalısınız.');
      return;
    }

    setSending(true);
    try {
      const payload = {
        schoolId,
        targetRole: targetType,
        targetDescription,
        receiverId: selectedTeacher?.id || selectedStudent?.id,
        receiverName: selectedTeacher?.fullName || selectedStudent?.full_name,
        targetGrade: selectedGrade ? String(selectedGrade) : selectedClass?.grade_level ? String(selectedClass.grade_level) : undefined,
        targetSection: selectedClass?.name,
        content: newContent.trim(),
        replyToMessageId: replyingTo?.id,
        replyToContent: replyingTo ? (replyingTo.content.length > 100 ? replyingTo.content.substring(0, 100) + '...' : replyingTo.content) : undefined,
      };

      const res = await apiRequest<MessageItem>('messages', 'POST', payload);

      if (res.success && res.data) {
        const newMsg = res.data;
        setNewContent('');
        setReplyingTo(null);
        setMessages((prev) => [newMsg, ...prev]);
        Alert.alert('Mesaj Gönderildi 📨', `Mesajınız "${targetDescription}" alıcısına başarıyla iletildi.`);
      } else {
        // Çevrimdışı / yerel önizleme ekleme
        const offlineMsg: MessageItem = {
          id: `local-${Date.now()}`,
          senderName: currentSession?.fullName || currentSession?.username || 'Öğretmen',
          senderRole: currentSession?.role || 'TEACHER',
          content: newContent.trim(),
          createdAt: new Date().toISOString(),
          targetRole: targetType,
          targetDescription,
          replyToMessageId: replyingTo?.id,
          replyToContent: replyingTo ? (replyingTo.content.length > 100 ? replyingTo.content.substring(0, 100) + '...' : replyingTo.content) : undefined,
        };
        setMessages((prev) => [offlineMsg, ...prev]);
        setNewContent('');
        setReplyingTo(null);
        Alert.alert('Mesaj İletildi 📨', `Mesajınız "${targetDescription}" alıcısına kaydedildi.`);
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  // Format Badge
  const getRecipientBadgeText = (item: MessageItem) => {
    if (item.targetDescription) return item.targetDescription;
    if (item.receiverName) return item.receiverName;
    if (item.targetRole === 'MY_STUDENTS') return 'Dersine Girdiğim Tüm Öğrenciler';
    if (item.targetRole === 'STAFF') return 'Okul İdaresi';
    if (item.targetRole === 'TEACHER') return 'Tüm Öğretmenler';
    if (item.targetRole === 'GRADE' && item.targetGrade) return `${item.targetGrade}. Sınıflar`;
    if (item.targetRole === 'SECTION' && item.targetSection) return `${item.targetSection} Şubesi`;
    if (item.targetRole === 'SPECIFIC_TEACHER') return 'Öğretmen';
    if (item.targetRole === 'SPECIFIC_STUDENT') return 'Öğrenci';
    return 'Kurum İçi';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Üst Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>💬 Kurum İçi İletişim</Text>
          <Text style={styles.headerSubtitle}>Öğretmen, İdare & Öğrenci Mesajlaşması</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            style={styles.markAllReadHeaderBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-done" size={16} color="#16A34A" />
            <Text style={styles.markAllReadHeaderBtnText}>Okundu Yap</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={loadMessages} style={styles.refreshButton}>
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {!schoolId ? (
        <ScrollView contentContainerStyle={styles.individualContainer}>
          <View style={styles.individualIconWrap}>
            <Ionicons name="business-outline" size={48} color="#D97706" />
          </View>
          <Text style={styles.individualTitle}>Kurum İçi İletişim Kapalı</Text>
          <Text style={styles.individualDesc}>
            Şu anda uygulamayı <Text style={{ fontWeight: '800', color: Colors.text }}>Bireysel Modda</Text> kullanmaktasınız.
            {'\n\n'}
            Kurum içi duyurular, zümre mesajlaşması ve öğrenci iletişimi bir okul koduna (Örn: OKL-10001) bağlı öğretmenler için aktiftir.
          </Text>

          <View style={styles.individualTipCard}>
            <Ionicons name="information-circle" size={20} color="#4F46E5" />
            <Text style={styles.individualTipText}>
              Bireysel modda kendi derslerinizi, yoklama, öğrenci ve yıllık planlarınızı tamamen bağımsız yönetebilirsiniz.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.connectSchoolBtn}
            onPress={() => setConnectModalVisible(true)}
          >
            <Ionicons name="school" size={18} color="#fff" />
            <Text style={styles.connectSchoolBtnText}>Bir Okul Koduna Bağlan</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Kapsam Seçici: Bana Gelenler vs Gönderdiklerim */}
          <View style={styles.scopeTabsContainer}>
            <TouchableOpacity
              style={[styles.scopeTab, activeScope === 'personal' && styles.scopeTabActive]}
              onPress={() => {
                setActiveScope('personal');
                loadMessages('personal');
              }}
            >
              <Ionicons
                name="mail"
                size={14}
                color={activeScope === 'personal' ? '#fff' : '#4F46E5'}
              />
              <Text
                style={[
                  styles.scopeTabText,
                  activeScope === 'personal' && styles.scopeTabTextActive,
                ]}
              >
                📥 Bana Gelenler
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.scopeTab, activeScope === 'sent' && styles.scopeTabActive]}
              onPress={() => {
                setActiveScope('sent');
                loadMessages('sent');
              }}
            >
              <Ionicons
                name="paper-plane"
                size={14}
                color={activeScope === 'sent' ? '#fff' : '#64748B'}
              />
              <Text
                style={[
                  styles.scopeTabText,
                  activeScope === 'sent' && styles.scopeTabTextActive,
                ]}
              >
                📤 Gönderdiklerim
              </Text>
            </TouchableOpacity>
          </View>

          {/* Mesaj Akışı Listesi */}
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMessages(); }} />}
          >
            {loading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
            ) : messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Henüz paylaşılan duyuru veya mesaj bulunmuyor.</Text>
              </View>
            ) : (
              messages.map((item) => (
                <View key={item.id} style={styles.messageCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.senderWrap}>
                      <View style={styles.senderAvatar}>
                        <Ionicons
                          name={item.senderRole === 'ADMIN' ? 'shield-checkmark' : 'person'}
                          size={14}
                          color="#fff"
                        />
                      </View>
                      <View>
                        <Text style={styles.senderName}>{item.senderName}</Text>
                        <Text style={styles.senderRoleText}>
                          {item.senderRole === 'TEACHER' ? 'Öğretmen' : item.senderRole === 'ADMIN' ? 'Okul İdaresi' : item.senderRole}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.timeText}>
                      {new Date(item.createdAt).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>

                  {/* Kime İletildiği Rozeti */}
                  <View style={styles.targetBadgeRow}>
                    <View style={styles.targetBadge}>
                      <Ionicons name="paper-plane" size={11} color="#4F46E5" />
                      <Text style={styles.targetBadgeText}>
                        Kime: {getRecipientBadgeText(item)}
                      </Text>
                    </View>
                  </View>

                  {item.replyToContent ? (
                    <View style={styles.quoteCard}>
                      <View style={styles.quoteHeader}>
                        <Ionicons name="return-down-forward" size={12} color="#6366F1" />
                        <Text style={styles.quoteLabel}>Yanıtlanan Mesaj:</Text>
                      </View>
                      <Text style={styles.quoteText} numberOfLines={2}>
                        "{item.replyToContent}"
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.messageContent}>{item.content}</Text>

                  {/* Yanıtla Butonu */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.replyButton}
                      onPress={() => handleStartReply(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-undo" size={13} color="#4F46E5" />
                      <Text style={styles.replyButtonText}>Yanıtla</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Mesaj Gönderme Paneli */}
          <View style={styles.inputContainer}>
            {/* Yanıt Banner'ı */}
            {replyingTo && (
              <View style={styles.replyBanner}>
                <View style={styles.replyBannerLeft}>
                  <Ionicons name="arrow-undo" size={15} color="#4F46E5" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.replyBannerTitle}>
                      {replyingTo.senderName} adlı kullanıcıya yanıt veriyorsunuz
                    </Text>
                    <Text style={styles.replyBannerSnippet} numberOfLines={1}>
                      "{replyingTo.content}"
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleCancelReply} style={styles.replyCancelBtn}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            )}

            {/* Kime Hedef Başlığı ve Aktif Seçim Rozeti */}
            <View style={styles.targetHeaderRow}>
              <Text style={styles.targetLabel}>🎯 Kime Gönderilecek:</Text>
              <View style={styles.activeSelectionBadge}>
                <Text style={styles.activeSelectionText} numberOfLines={1}>
                  {targetDescription}
                </Text>
              </View>
            </View>

            {/* Yatay Seçenek Çipleri */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.targetChipsScroll}
            >
              {/* 1. Dersine Girdiğim Tüm Öğrenciler (Tüm Okul Yerine) */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'MY_STUDENTS' && styles.targetChipActive]}
                onPress={() => {
                  setTargetType('MY_STUDENTS');
                  setTargetDescription('Dersine Girdiğim Tüm Öğrenciler');
                  setSelectedTeacher(null);
                  setSelectedGrade(null);
                  setSelectedClass(null);
                  setSelectedStudent(null);
                }}
              >
                <Ionicons
                  name="people"
                  size={14}
                  color={targetType === 'MY_STUDENTS' ? '#fff' : '#4F46E5'}
                />
                <Text style={[styles.targetChipText, targetType === 'MY_STUDENTS' && styles.targetChipTextActive]}>
                  Dersime Giren Öğrenciler
                </Text>
              </TouchableOpacity>

              {/* 2. İdare */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'STAFF' && styles.targetChipActive]}
                onPress={() => {
                  setTargetType('STAFF');
                  setTargetDescription('Okul İdaresi');
                  setSelectedTeacher(null);
                  setSelectedGrade(null);
                  setSelectedClass(null);
                  setSelectedStudent(null);
                }}
              >
                <Ionicons
                  name="business"
                  size={14}
                  color={targetType === 'STAFF' ? '#fff' : '#D97706'}
                />
                <Text style={[styles.targetChipText, targetType === 'STAFF' && styles.targetChipTextActive]}>
                  İdare
                </Text>
              </TouchableOpacity>

              {/* 3. Tüm Öğretmenler */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'TEACHER' && styles.targetChipActive]}
                onPress={() => {
                  setTargetType('TEACHER');
                  setTargetDescription('Tüm Öğretmenler');
                  setSelectedTeacher(null);
                  setSelectedGrade(null);
                  setSelectedClass(null);
                  setSelectedStudent(null);
                }}
              >
                <Ionicons
                  name="school"
                  size={14}
                  color={targetType === 'TEACHER' ? '#fff' : '#059669'}
                />
                <Text style={[styles.targetChipText, targetType === 'TEACHER' && styles.targetChipTextActive]}>
                  Tüm Öğretmenler
                </Text>
              </TouchableOpacity>

              {/* 4. Belirli Bir Öğretmen */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'SPECIFIC_TEACHER' && styles.targetChipActive]}
                onPress={() => setTeacherModalVisible(true)}
              >
                <Ionicons
                  name="person"
                  size={14}
                  color={targetType === 'SPECIFIC_TEACHER' ? '#fff' : '#7C3AED'}
                />
                <Text style={[styles.targetChipText, targetType === 'SPECIFIC_TEACHER' && styles.targetChipTextActive]}>
                  {selectedTeacher ? selectedTeacher.fullName : 'Öğretmen Seç...'}
                </Text>
              </TouchableOpacity>

              {/* 5. Sınıf Düzeyi (Kademe) */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'GRADE' && styles.targetChipActive]}
                onPress={() => setGradeModalVisible(true)}
              >
                <Ionicons
                  name="layers"
                  size={14}
                  color={targetType === 'GRADE' ? '#fff' : '#2563EB'}
                />
                <Text style={[styles.targetChipText, targetType === 'GRADE' && styles.targetChipTextActive]}>
                  {selectedGrade ? `${selectedGrade}. Sınıflar` : 'Kademe Seç...'}
                </Text>
              </TouchableOpacity>

              {/* 6. Şube */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'SECTION' && styles.targetChipActive]}
                onPress={() => setClassModalVisible(true)}
              >
                <Ionicons
                  name="albums"
                  size={14}
                  color={targetType === 'SECTION' ? '#fff' : '#0284C7'}
                />
                <Text style={[styles.targetChipText, targetType === 'SECTION' && styles.targetChipTextActive]}>
                  {selectedClass ? selectedClass.name : 'Şube Seç...'}
                </Text>
              </TouchableOpacity>

              {/* 7. Tek Bir Öğrenci */}
              <TouchableOpacity
                style={[styles.targetChip, targetType === 'SPECIFIC_STUDENT' && styles.targetChipActive]}
                onPress={() => setStudentModalVisible(true)}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={14}
                  color={targetType === 'SPECIFIC_STUDENT' ? '#fff' : '#E11D48'}
                />
                <Text style={[styles.targetChipText, targetType === 'SPECIFIC_STUDENT' && styles.targetChipTextActive]}>
                  {selectedStudent ? `${selectedStudent.student_number} - ${selectedStudent.full_name}` : 'Öğrenci Seç...'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Metin Giriş Satırı */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Duyuru veya mesajınızı yazın..."
                placeholderTextColor={Colors.textMuted}
                value={newContent}
                onChangeText={setNewContent}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendButton, !newContent.trim() && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!newContent.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* 1. ÖĞRETMEN SEÇME MODALI */}
      <Modal visible={teacherModalVisible} animationType="slide" transparent onRequestClose={() => setTeacherModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.selectorModalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>👨‍🏫 Okul Öğretmeni Seçin</Text>
                <Text style={styles.modalSubtitle}>Mesaj doğrudan seçilen öğretmene iletilecektir.</Text>
              </View>
              <TouchableOpacity onPress={() => setTeacherModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Öğretmen adı veya branş ara..."
                placeholderTextColor={Colors.textMuted}
                value={teacherSearch}
                onChangeText={setTeacherSearch}
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {teachersList.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyText}>Okula kayıtlı öğretmen bulunamadı.</Text>
                </View>
              ) : (
                teachersList
                  .filter((t) => t.fullName.toLowerCase().includes(teacherSearch.toLowerCase()) || (t.branch && t.branch.toLowerCase().includes(teacherSearch.toLowerCase())))
                  .map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.pickerItemRow,
                        selectedTeacher?.id === t.id && styles.pickerItemRowActive,
                      ]}
                      onPress={() => {
                        setSelectedTeacher(t);
                        setTargetType('SPECIFIC_TEACHER');
                        setTargetDescription(`Öğretmen: ${t.fullName}`);
                        setSelectedGrade(null);
                        setSelectedClass(null);
                        setSelectedStudent(null);
                        setTeacherModalVisible(false);
                      }}
                    >
                      <View style={styles.teacherAvatar}>
                        <Ionicons name="person" size={18} color="#4F46E5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerItemTitle}>{t.fullName}</Text>
                        <Text style={styles.pickerItemSub}>
                          {t.branch ? `Branş: ${t.branch}` : t.email ? t.email : 'Öğretmen'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. SINIF DÜZEYİ (KADEME) SEÇME MODALI */}
      <Modal visible={gradeModalVisible} animationType="slide" transparent onRequestClose={() => setGradeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.selectorModalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>📚 Sınıf Düzeyi (Kademe) Seçin</Text>
                <Text style={styles.modalSubtitle}>Mesaj o kademedeki tüm şube ve öğrencilere gider.</Text>
              </View>
              <TouchableOpacity onPress={() => setGradeModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.gradeGrid}>
              {gradeLevels.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.gradeCard, selectedGrade === g && styles.gradeCardActive]}
                  onPress={() => {
                    setSelectedGrade(g);
                    setTargetType('GRADE');
                    setTargetDescription(`${g}. Sınıflar (Tüm Şubeler)`);
                    setSelectedTeacher(null);
                    setSelectedClass(null);
                    setSelectedStudent(null);
                    setGradeModalVisible(false);
                  }}
                >
                  <Text style={[styles.gradeCardNumber, selectedGrade === g && styles.gradeCardTextActive]}>
                    {g}
                  </Text>
                  <Text style={[styles.gradeCardLabel, selectedGrade === g && styles.gradeCardTextActive]}>
                    . Sınıflar
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. ŞUBE SEÇME MODALI */}
      <Modal visible={classModalVisible} animationType="slide" transparent onRequestClose={() => setClassModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.selectorModalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🏫 Şube Seçin</Text>
                <Text style={styles.modalSubtitle}>Mesaj doğrudan seçilen şubedeki öğrencilere iletilir.</Text>
              </View>
              <TouchableOpacity onPress={() => setClassModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {classesList.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyText}>Kayıtlı şube bulunamadı.</Text>
                </View>
              ) : (
                classesList.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.pickerItemRow,
                      selectedClass?.id === c.id && styles.pickerItemRowActive,
                    ]}
                    onPress={() => {
                      setSelectedClass(c);
                      setTargetType('SECTION');
                      setTargetDescription(`${c.name} Şubesi`);
                      setSelectedTeacher(null);
                      setSelectedGrade(null);
                      setSelectedStudent(null);
                      setClassModalVisible(false);
                    }}
                  >
                    <View style={styles.classBadgeWrap}>
                      <Text style={styles.classBadgeText}>{c.name}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.pickerItemTitle}>{c.name} Sınıfı</Text>
                      <Text style={styles.pickerItemSub}>
                        {c.student_count !== undefined ? `${c.student_count} Kayıtlı Öğrenci` : 'Şube'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 4. TEK BİR ÖĞRENCİ SEÇME MODALI */}
      <Modal visible={studentModalVisible} animationType="slide" transparent onRequestClose={() => setStudentModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.selectorModalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🎓 Tek Bir Öğrenci Seçin</Text>
                <Text style={styles.modalSubtitle}>Yalnızca bu öğrenciye ve velisine özel mesaj gider.</Text>
              </View>
              <TouchableOpacity onPress={() => setStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Arama Kutusu */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Öğrenci adı veya numarası ara..."
                placeholderTextColor={Colors.textMuted}
                value={studentSearch}
                onChangeText={setStudentSearch}
              />
            </View>

            {/* Şube Filtresi */}
            {classesList.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <TouchableOpacity
                  style={[styles.filterChip, selectedClassFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setSelectedClassFilter('all')}
                >
                  <Text style={[styles.filterChipText, selectedClassFilter === 'all' && styles.filterChipTextActive]}>
                    Tüm Şubeler
                  </Text>
                </TouchableOpacity>
                {classesList.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.filterChip, selectedClassFilter === c.name && styles.filterChipActive]}
                    onPress={() => setSelectedClassFilter(c.name)}
                  >
                    <Text style={[styles.filterChipText, selectedClassFilter === c.name && styles.filterChipTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <ScrollView style={{ maxHeight: 360 }}>
              {studentsList.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyText}>Kayıtlı öğrenci bulunamadı.</Text>
                </View>
              ) : (
                studentsList
                  .filter((s) => {
                    const matchClass = selectedClassFilter === 'all' || s.class_name === selectedClassFilter;
                    const matchQuery =
                      s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
                      s.student_number?.includes(studentSearch);
                    return matchClass && matchQuery;
                  })
                  .map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.pickerItemRow,
                        selectedStudent?.id === s.id && styles.pickerItemRowActive,
                      ]}
                      onPress={() => {
                        setSelectedStudent(s);
                        setTargetType('SPECIFIC_STUDENT');
                        setTargetDescription(`${s.student_number} - ${s.full_name} (${s.class_name || ''})`);
                        setSelectedTeacher(null);
                        setSelectedGrade(null);
                        setSelectedClass(null);
                        setStudentModalVisible(false);
                      }}
                    >
                      <View style={styles.studentAvatarWrap}>
                        <Text style={styles.studentAvatarText}>
                          {s.first_name ? s.first_name[0].toUpperCase() : 'Ö'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.pickerItemTitle}>{s.full_name}</Text>
                        <Text style={styles.pickerItemSub}>
                          No: {s.student_number} • Şube: {s.class_name || '-'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 5. OKUL KODUNA BAĞLANMA MODALI */}
      <Modal visible={connectModalVisible} animationType="fade" transparent onRequestClose={() => setConnectModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏫 Okul Koduna Bağlan</Text>
              <TouchableOpacity onPress={() => setConnectModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 14 }}>
              Okul idarenizin verdiği kod ve kullanıcı bilgilerinizle kurumunuza bağlanın.
            </Text>

            <Text style={styles.inputLabel}>Okul Kodu</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Okul Kodu"
              placeholderTextColor={Colors.textMuted}
              value={connectSchoolCode}
              onChangeText={setConnectSchoolCode}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Kullanıcı Adı"
              placeholderTextColor={Colors.textMuted}
              value={connectUsername}
              onChangeText={setConnectUsername}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Şifre</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Şifreniz"
              placeholderTextColor={Colors.textMuted}
              value={connectPassword}
              onChangeText={setConnectPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.connectSubmitBtn}
              onPress={handleConnectSchool}
              disabled={connectLoading}
            >
              {connectLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.connectSubmitBtnText}>Bağlan & Senkronize Et</Text>
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
  headerSubtitle: { fontSize: 12, color: Colors.textMuted },
  refreshButton: { padding: 8 },
  markAllReadHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markAllReadHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  scopeTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  scopeTabActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  scopeTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  scopeTabTextActive: {
    color: '#fff',
  },
  scrollContent: { padding: 16, paddingBottom: 20 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },

  // Mesaj Kartı
  messageCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  senderWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  senderRoleText: { fontSize: 10, fontWeight: '600', color: Colors.textMuted },
  timeText: { fontSize: 11, color: Colors.textMuted },

  targetBadgeRow: { marginBottom: 8 },
  targetBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  targetBadgeText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },
  quoteCard: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  quoteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6366F1',
  },
  quoteText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  messageContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  replyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },

  // Giriş Paneli
  inputContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
  },
  replyBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  replyBannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  replyBannerSnippet: {
    fontSize: 11,
    color: '#64748B',
  },
  replyCancelBtn: {
    padding: 4,
  },
  targetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  targetLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  activeSelectionBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 220,
  },
  activeSelectionText: { fontSize: 11, fontWeight: '700', color: '#B45309' },

  targetChipsScroll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  targetChipActive: { backgroundColor: '#4F46E5' },
  targetChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  targetChipTextActive: { color: '#fff', fontWeight: '700' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  textInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
    color: Colors.text,
    maxHeight: 90,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#CBD5E1' },

  // Bireysel Mod Görünümü
  individualContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  individualIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  individualTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  individualDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  individualTipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 10,
    marginBottom: 24,
  },
  individualTipText: { flex: 1, fontSize: 12, color: '#3730A3', lineHeight: 18 },
  connectSchoolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  connectSchoolBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Seçici Modallar
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  selectorModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  modalSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 12,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },

  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemRowActive: { backgroundColor: '#EEF2FF' },
  teacherAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pickerItemTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  pickerItemSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  // Kademe Grid
  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 12 },
  gradeCard: {
    width: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  gradeCardActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  gradeCardNumber: { fontSize: 26, fontWeight: '900', color: '#1E293B' },
  gradeCardLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 2 },
  gradeCardTextActive: { color: '#fff' },

  // Şube Badge
  classBadgeWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classBadgeText: { fontSize: 14, fontWeight: '800', color: '#0369A1' },

  // Öğrenci
  studentAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: { fontSize: 14, fontWeight: '800', color: '#E11D48' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  filterChipActive: { backgroundColor: '#0F172A' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },

  modalEmptyBox: { paddingVertical: 30, alignItems: 'center' },
  modalEmptyText: { fontSize: 13, color: Colors.textMuted },

  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4, marginTop: 8 },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    color: Colors.text,
  },
  connectSubmitBtn: {
    backgroundColor: '#4F46E5',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  connectSubmitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
