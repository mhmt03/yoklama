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

interface MessageItem {
  id: string;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: string;
  targetRole?: string;
}

export function MessagesScreen({ navigation }: any) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [targetRole, setTargetRole] = useState<'ALL' | 'TEACHER' | 'STAFF'>('ALL');
  const [sending, setSending] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Okula Bağlanma Modal State
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [connectSchoolCode, setConnectSchoolCode] = useState('OKL-10001');
  const [connectUsername, setConnectUsername] = useState('mehmetogretmen');
  const [connectPassword, setConnectPassword] = useState('1234');
  const [connectLoading, setConnectLoading] = useState(false);

  const loadMessages = async () => {
    try {
      const session = await getActiveUserSession();
      if (!session?.schoolId) {
        setSchoolId(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setSchoolId(session.schoolId);

      const res = await apiRequest<MessageItem[]>(`messages?schoolId=${session.schoolId}`);
      if (res.success && res.data) {
        setMessages(res.data);
      }
    } catch (e: any) {
      console.warn('Mesajlar yüklenemedi:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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

  useEffect(() => {
    loadMessages();
  }, []);

  const handleSendMessage = async () => {
    if (!newContent.trim() || !schoolId) return;

    setSending(true);
    const res = await apiRequest('messages', 'POST', {
      schoolId,
      targetRole,
      content: newContent.trim(),
    });

    if (res.success) {
      setNewContent('');
      loadMessages();
    } else {
      Alert.alert('Hata', res.error || 'Mesaj gönderilemedi.');
    }
    setSending(false);
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
          <Text style={styles.headerSubtitle}>Öğretmenler & İdare Mesaj Panosu</Text>
        </View>
        <TouchableOpacity onPress={loadMessages} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {!schoolId ? (
        <ScrollView contentContainerStyle={styles.individualContainer}>
          <View style={styles.individualIconWrap}>
            <Ionicons name="business-outline" size={48} color="#D97706" />
          </View>
          <Text style={styles.individualTitle}>Kurum İçi İletişim Kapalı</Text>
          <Text style={styles.individualDesc}>
            Şu anda uygulamayı <Text style={{ fontWeight: '800', color: Colors.text }}>Bireysel Modda</Text> kullanmaktasınız.
            {"\n\n"}
            Kurum içi duyurular, zümre mesajlaşması ve idare panosu yalnızca bir okul koduna (Örn: OKL-10001) bağlı öğretmenler için aktiftir.
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
                      <Text style={styles.senderName}>{item.senderName}</Text>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>{item.senderRole}</Text>
                      </View>
                    </View>
                    <Text style={styles.timeText}>
                      {new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={styles.messageContent}>{item.content}</Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Mesaj Yazma Alanı */}
          <View style={styles.inputContainer}>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Kime:</Text>
              <TouchableOpacity
                style={[styles.targetChip, targetRole === 'ALL' && styles.targetChipActive]}
                onPress={() => setTargetRole('ALL')}
              >
                <Text style={[styles.targetChipText, targetRole === 'ALL' && styles.targetChipTextActive]}>
                  Tüm Okul
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.targetChip, targetRole === 'TEACHER' && styles.targetChipActive]}
                onPress={() => setTargetRole('TEACHER')}
              >
                <Text style={[styles.targetChipText, targetRole === 'TEACHER' && styles.targetChipTextActive]}>
                  Öğretmenler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.targetChip, targetRole === 'STAFF' && styles.targetChipActive]}
                onPress={() => setTargetRole('STAFF')}
              >
                <Text style={[styles.targetChipText, targetRole === 'STAFF' && styles.targetChipTextActive]}>
                  İdare
                </Text>
              </TouchableOpacity>
            </View>

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

      {/* Okul Koduna Bağlanma Modalı */}
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
              placeholder="Örn: OKL-10001"
              placeholderTextColor={Colors.textMuted}
              value={connectSchoolCode}
              onChangeText={setConnectSchoolCode}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: mehmetogretmen"
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
  scrollContent: { padding: 16, paddingBottom: 20 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  messageCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  senderWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  senderName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  roleBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleText: { fontSize: 10, fontWeight: '700', color: '#4F46E5' },
  timeText: { fontSize: 11, color: Colors.textMuted },
  messageContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  inputContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  targetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  targetLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  targetChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#F1F5F9' },
  targetChipActive: { backgroundColor: '#4F46E5' },
  targetChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  targetChipTextActive: { color: '#fff', fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
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
    maxHeight: 100,
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
  individualTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  individualDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
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
  individualTipText: {
    flex: 1,
    fontSize: 12,
    color: '#3730A3',
    lineHeight: 18,
  },
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
  connectSchoolBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
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
  connectSubmitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
