import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { School } from '../types';
import { UserRole, setActiveUserRole, logoutUserRole } from '../utils/roleService';
import { SchoolAdminModal } from './SchoolAdminModal';
import { TeacherSchoolModal } from './TeacherSchoolModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  activeSchool: School | null;
  currentRole: UserRole | null;
  onRoleChanged: (role: UserRole | null) => void;
  onSchoolUpdated: () => void;
  navigation: any;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  visible,
  onClose,
  activeSchool,
  currentRole,
  onRoleChanged,
  onSchoolUpdated,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [teacherModalVisible, setTeacherModalVisible] = useState(false);

  const handleCopyCode = async () => {
    if (activeSchool?.code) {
      await Clipboard.setStringAsync(activeSchool.code);
      Alert.alert('Kopyalandı', `Okul Kodu (${activeSchool.code}) panoya kopyalandı.`);
    }
  };

  const handleSwitchToAdmin = () => {
    setAdminModalVisible(true);
  };

  const handleSwitchToTeacher = async () => {
    await setActiveUserRole('teacher');
    onRoleChanged('teacher');
    Alert.alert('Bilgi', 'Öğretmen moduna geçildi.');
  };

  const handleLogout = () => {
    Alert.alert('Rol Değiştir', 'Mevcut rolünüzden çıkıp karşılama ekranına dönmek istiyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await logoutUserRole();
          onRoleChanged(null);
          onClose();
        },
      },
    ]);
  };

  const navigateToScreen = (screenName: string) => {
    onClose();
    if (navigation && navigation.navigate) {
      navigation.navigate(screenName);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

          <View style={[styles.drawerContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
            {/* Header / Brand */}
            <View style={styles.brandHeader}>
              <View style={styles.logoBadge}>
                <Ionicons name="book" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brandTitle}>Öğretmen Ajanda</Text>
                <Text style={styles.brandSub}>Çok Rollü Okul Platformu</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* School & Role Card */}
            <View style={styles.schoolCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.schoolName} numberOfLines={1}>
                  {activeSchool?.name || 'Okul Tanımlı Değil'}
                </Text>
                <View style={[styles.roleBadge, currentRole === 'admin' && styles.roleBadgeAdmin]}>
                  <Text style={styles.roleBadgeText}>
                    {currentRole === 'admin' ? 'YÖNETİCİ' : currentRole === 'teacher' ? 'ÖĞRETMEN' : 'VELİ / ÖĞRENCİ'}
                  </Text>
                </View>
              </View>

              {activeSchool?.code ? (
                <View style={styles.schoolCodeRow}>
                  <Text style={styles.schoolCodeLabel}>OKUL KODU:</Text>
                  <Text style={styles.schoolCodeVal}>{activeSchool.code}</Text>
                  <TouchableOpacity onPress={handleCopyCode} style={styles.copySmallBtn}>
                    <Ionicons name="copy-outline" size={13} color="#4F46E5" />
                    <Text style={styles.copySmallBtnText}>Kopyala</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* SECTION: YÖNETİCİ / ADMİN İŞLEMLERİ */}
              {/* SECTION: İDARECİ / ADMİN GEÇİŞİ */}
              <View style={styles.menuSection}>
                <Text style={styles.sectionTitle}>👑 İDARECİ / OKUL ADMİNİ MİSİNİZ?</Text>
                <TouchableOpacity
                  style={styles.adminSwitchCard}
                  onPress={async () => {
                    onClose();
                    await onRoleChanged('admin');
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.adminSwitchIconWrap}>
                    <Ionicons name="shield-checkmark" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adminSwitchTitle}>Okul Admin Paneline Geç</Text>
                    <Text style={styles.adminSwitchSub}>
                      AI çarşaf ders programı, okul kodu, öğretmen onayları ve idari ayarlar
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D97706" />
                </TouchableOpacity>
              </View>

              {/* SECTION: ÖĞRETMEN İŞLEMLERİ */}
              <View style={styles.menuSection}>
                <Text style={styles.sectionTitle}>👨‍🏫 ÖĞRETMEN MENÜSÜ</Text>

                {activeSchool?.code ? (
                  <View
                    style={[styles.menuItem, { backgroundColor: '#F0FDF4', borderRadius: 12, paddingVertical: 10 }]}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: '#DCFCE7' }]}>
                      <Ionicons name="school" size={18} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuItemTitle, { color: '#166534' }]}>Bağlı Kurum Okulu</Text>
                      <Text style={[styles.menuItemSub, { color: '#15803D' }]} numberOfLines={1}>
                        {activeSchool.name} (Kod: {activeSchool.code})
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#16A34A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>Bağlı</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      onClose();
                      setTeacherModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: '#F3E8FF' }]}>
                      <Ionicons name="key" size={18} color="#9333EA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemTitle}>Okul Koduna Bağlan</Text>
                      <Text style={styles.menuItemSub}>Kod girerek okulun hazır sınıflarına eriş</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    onClose();
                    setTeacherModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#E0F2FE' }]}>
                    <Ionicons name="checkbox" size={18} color="#0284C7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>Girdiğim Sınıf & Branşımı Seç</Text>
                    <Text style={styles.menuItemSub}>Dersine girdiğin şubeleri işaretle</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => navigateToScreen('ClassCockpit')}
                  activeOpacity={0.7}
                >

                  <View style={[styles.menuIconWrap, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="game-controller" size={18} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>Canlı Ders Kokpiti</Text>
                    <Text style={styles.menuItemSub}>Defter konusu, yoklama ve hızlı ödev</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => navigateToScreen('Messages')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="chatbubbles" size={18} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>Kurum İçi Mesajlar</Text>
                    <Text style={styles.menuItemSub}>Öğretmenler & İdare duyuru panosu</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>


              {/* SECTION: GENEL ARAÇLAR */}
              <View style={styles.menuSection}>
                <Text style={styles.sectionTitle}>🛠️ HIZLI ARAÇLAR</Text>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => navigateToScreen('YearlyPlan')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name="calendar-number" size={18} color={Colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>Yıllık Planlar</Text>
                    <Text style={styles.menuItemSub}>Word/Excel/PDF plan yükleme ve takip</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => navigateToScreen('Operations')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name="sparkles" size={18} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>Yapay Zekâ ve Yedekleme</Text>
                    <Text style={styles.menuItemSub}>AI asistanı modelleri ve veri yedekleri</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => navigateToScreen('Agenda')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name="time" size={18} color="#E11D48" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemTitle}>Ajanda & Hatırlatıcılar</Text>
                    <Text style={styles.menuItemSub}>Nöbet ve görev takvimi</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Footer: Rol Değiştir / Çıkış */}
            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                <Ionicons name="swap-horizontal" size={18} color="#DC2626" />
                <Text style={styles.logoutBtnText}>Rolü Değiştir / Çıkış Yap</Text>
              </TouchableOpacity>
              <Text style={styles.versionText}>Öğretmen Ajanda • Çok Rollü Sistem</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Modalı */}
      <SchoolAdminModal
        visible={adminModalVisible}
        onClose={() => setAdminModalVisible(false)}
        activeSchool={activeSchool}
        onSchoolUpdated={onSchoolUpdated}
      />

      {/* Öğretmen Modalı */}
      <TeacherSchoolModal
        visible={teacherModalVisible}
        onClose={() => setTeacherModalVisible(false)}
        activeSchool={activeSchool}
        onSchoolChanged={onSchoolUpdated}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  drawerContent: {
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    height: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 16,
    paddingHorizontal: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  brandSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  schoolCard: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  schoolName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E1B4B',
    flex: 1,
  },
  roleBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeAdmin: {
    backgroundColor: '#FEF3C7',
  },
  roleBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#4F46E5',
  },
  schoolCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(99, 102, 241, 0.15)',
  },
  schoolCodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6366F1',
  },
  schoolCodeVal: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#1E1B4B',
    letterSpacing: 1,
  },
  copySmallBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  copySmallBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  menuSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingLeft: 4,
  },
  adminSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 4,
  },
  adminSwitchIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminSwitchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  adminSwitchSub: {
    fontSize: 10.5,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 2,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  menuItemSub: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  drawerFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  versionText: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
