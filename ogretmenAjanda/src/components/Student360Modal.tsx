import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../theme/colors';
import { TopSlideModal } from './TopSlideModal';

interface Student360Data {
  id: number;
  student_number: string;
  first_name: string;
  last_name: string;
  grade?: string;
  section?: string;
  photo_uri?: string;
  parent_name?: string;
  parent_phone?: string;
  student_phone?: string;
  homeworkStats: {
    total: number;
    done: number;
    missing: number;
    notDone: number;
    successRate: number; // Yüzde örn: 88
  };
  attendanceStats: {
    present: number;
    absent: number;
    late: number;
  };
  evaluations: Array<{
    id: string | number;
    date: string;
    type: string;
    title?: string;
    content: string;
    score?: number;
  }>;
}

interface Student360ModalProps {
  visible: boolean;
  onClose: () => void;
  student: Student360Data | null;
}

export const Student360Modal: React.FC<Student360ModalProps> = ({ visible, onClose, student }) => {
  if (!student) return null;

  // WhatsApp'tan Veliye 360° Durum Raporu Gönderme
  const handleSendWhatsAppReport = () => {
    if (!student.parent_phone) {
      Alert.alert('Bilgi', 'Kayıtlı veli telefon numarası bulunamadı.');
      return;
    }

    const cleanPhone = student.parent_phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90') ? cleanPhone : `90${cleanPhone.replace(/^0/, '')}`;

    const message = `Sayın Velimiz,\n\nÖğrencimiz *${student.first_name} ${student.last_name}* (${student.student_number}) için ders gelişim özeti:\n\n` +
      `📚 *Ödev Başarısı:* %${student.homeworkStats.successRate} (${student.homeworkStats.done}/${student.homeworkStats.total} Tamamlandı)\n` +
      `📅 *Devamsızlık:* ${student.attendanceStats.absent} Gün Yok, ${student.attendanceStats.late} Gün Geç\n` +
      (student.evaluations.length > 0 ? `📝 *Son Öğretmen Notu:* "${student.evaluations[0].content}"\n\n` : '\n') +
      `Bilgilerinize sunar, iyi günler dileriz.\n*Öğretmen Ajandası*`;

    const url = `whatsapp://send?phone=${phoneWithCountry}&text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Hata', 'WhatsApp uygulaması açılamadı.');
    });
  };

  // Tek Tıkla Karne Dosyası Paylaşımı
  const handleShareReportFile = async () => {
    try {
      const reportHtml = `
        <html>
          <body style="font-family: sans-serif; padding: 20px;">
            <h2 style="color: #4F46E5;">Öğrenci Gelişim & Başarı Raporu</h2>
            <p><strong>Öğrenci:</strong> ${student.first_name} ${student.last_name} (${student.student_number})</p>
            <p><strong>Sınıf:</strong> ${student.grade || ''}-${student.section || ''}</p>
            <hr/>
            <h3>Ödev Başarısı: %${student.homeworkStats.successRate}</h3>
            <p>Tamamlanan: ${student.homeworkStats.done} | Eksik: ${student.homeworkStats.missing} | Yapılmayan: ${student.homeworkStats.notDone}</p>
            <hr/>
            <h3>Öğretmen Gözlem Notları</h3>
            ${student.evaluations.map(e => `<p><em>${e.date}:</em> ${e.content}</p>`).join('')}
          </body>
        </html>
      `;

      const uri = `${FileSystem.cacheDirectory}karne_${student.student_number}.html`;
      await FileSystem.writeAsStringAsync(uri, reportHtml, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/html', dialogTitle: 'Öğrenci Raporunu Paylaş' });
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Rapor paylaşılamadı: ' + e.message);
    }
  };

  return (
    <TopSlideModal visible={visible} onClose={onClose} maxHeightPercent={0.88}>
      <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.avatarWrap}>
                {student.photo_uri ? (
                  <Image source={{ uri: student.photo_uri }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{student.first_name[0]}</Text>
                  </View>
                )}
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.studentName}>
                  {student.first_name} {student.last_name}
                </Text>
                <Text style={styles.studentSub}>
                  No: {student.student_number} • {student.grade}-{student.section}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* 360 İSTATİSTİK KARTLARI */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statRate}>%{student.homeworkStats.successRate}</Text>
                <Text style={styles.statLabel}>Ödev Başarısı</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statRate, { color: '#059669' }]}>{student.homeworkStats.done}</Text>
                <Text style={styles.statLabel}>Tamamlanan</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statRate, { color: '#DC2626' }]}>{student.homeworkStats.notDone}</Text>
                <Text style={styles.statLabel}>Yapılmayan</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statRate, { color: '#D97706' }]}>{student.attendanceStats.absent}</Text>
                <Text style={styles.statLabel}>Devamsızlık</Text>
              </View>
            </View>

            {/* İletişim Bilgileri */}
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Veli & İletişim Bilgileri</Text>
              <Text style={styles.infoText}>Veli: {student.parent_name || 'Tanımlı Değil'}</Text>
              <Text style={styles.infoText}>Telefon: {student.parent_phone || 'Tanımlı Değil'}</Text>
            </View>

            {/* Öğretmen Görüşleri */}
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Görüş & Gözlem Notları ({student.evaluations.length})</Text>
              {student.evaluations.length === 0 ? (
                <Text style={styles.emptyNoteText}>Henüz kayıtlı görüş bulunmuyor.</Text>
              ) : (
                student.evaluations.map((item, idx) => (
                  <View key={idx} style={styles.evalItem}>
                    <Text style={styles.evalDate}>{item.date}</Text>
                    <Text style={styles.evalContent}>{item.content}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Hızlı Eylemler (WhatsApp ve Karne Paylaş) */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.whatsappButton} onPress={handleSendWhatsAppReport}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>WhatsApp ile Veliye Gönder</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareReportButton} onPress={handleShareReportFile}>
                <Ionicons name="document-text-outline" size={20} color="#4F46E5" />
                <Text style={[styles.actionBtnText, { color: '#4F46E5' }]}>Karne Paylaş / Çıkar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </TopSlideModal>
    );
};

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 4,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  avatarWrap: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '800', color: '#4F46E5' },
  studentName: { fontSize: 17, fontWeight: '800', color: Colors.text },
  studentSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  closeBtn: { padding: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statRate: { fontSize: 18, fontWeight: '900', color: '#4F46E5' },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  infoText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  emptyNoteText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  evalItem: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, marginTop: 8 },
  evalDate: { fontSize: 11, color: '#4F46E5', fontWeight: '700' },
  evalContent: { fontSize: 13, color: Colors.text, marginTop: 2, lineHeight: 18 },
  actionsContainer: { marginTop: 8, gap: 10 },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: 12,
    height: 48,
  },
  shareReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 8 },
});
