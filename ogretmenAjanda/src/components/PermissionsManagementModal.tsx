import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../services/apiClient';

interface SchoolItem {
  id: string;
  name: string;
  code: string;
}

interface UserPermissionItem {
  id: string;
  username: string;
  fullName: string;
  role: string;
  schoolId?: string;
  schoolName?: string;
  branch?: string;
  phone?: string;
  email?: string;
  assignedClassesJson?: string;
  assignedLessonsJson?: string;
  assignedSchoolIds: string[];
  permissions?: any;
  isActive: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPermissionsUpdated?: () => void;
}

export const PermissionsManagementModal: React.FC<Props> = ({
  visible,
  onClose,
  onPermissionsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'admins' | 'teachers'>('admins');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [administrators, setAdministrators] = useState<UserPermissionItem[]>([]);
  const [teachers, setTeachers] = useState<UserPermissionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('all');

  // Toplu İşlem (Batch) Durumu
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [batchModalVisible, setBatchModalVisible] = useState<boolean>(false);
  const [batchPerms, setBatchPerms] = useState<{ [key: string]: boolean }>({
    canViewAllClasses: true,
    canUseAiAssistant: true,
    canMessageStudents: true,
    canMessageParents: true,
    canExportReports: true,
    canManageAttendance: true,
    canEditStudents: false,
  });
  const [batchTargetSchoolId, setBatchTargetSchoolId] = useState<string>('keep');

  // Tekil Kullanıcı Düzenleme
  const [editingUser, setEditingUser] = useState<UserPermissionItem | null>(null);
  const [editingAssignedSchools, setEditingAssignedSchools] = useState<string[]>([]);
  const [editingPerms, setEditingPerms] = useState<any>({});
  const [editingRole, setEditingRole] = useState<string>('STAFF');

  useEffect(() => {
    if (visible) {
      loadOverview();
      setSelectedTeacherIds([]);
    }
  }, [visible]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any>('permissions/overview');
      if (res.success && res.data) {
        setSchools(res.data.schools || []);
        setAdministrators(res.data.administrators || []);
        setTeachers(res.data.teachers || []);
      } else {
        Alert.alert('Bilgi', res.error || 'Yetki verileri alınamadı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  // Tekil Kullanıcı Düzenleme Modalını Aç
  const handleOpenEditUser = (user: UserPermissionItem) => {
    setEditingUser(user);
    setEditingRole(user.role);
    setEditingAssignedSchools([...(user.assignedSchoolIds || [])]);
    setEditingPerms({ ...(user.permissions || {}) });
  };

  const handleToggleSchoolForUser = (schoolId: string) => {
    if (editingAssignedSchools.includes(schoolId)) {
      setEditingAssignedSchools(editingAssignedSchools.filter((id) => id !== schoolId));
    } else {
      setEditingAssignedSchools([...editingAssignedSchools, schoolId]);
    }
  };

  const handleSaveSingleUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const res = await apiRequest(`permissions/user/${editingUser.id}`, 'PUT', {
        role: editingRole,
        assignedSchoolIds: editingAssignedSchools,
        schoolId: editingAssignedSchools[0] || editingUser.schoolId,
        permissionsJson: JSON.stringify(editingPerms),
      });

      if (res.success) {
        Alert.alert('Başarılı 🎉', `${editingUser.fullName} kullanıcısının yetkileri güncellendi.`);
        setEditingUser(null);
        await loadOverview();
        if (onPermissionsUpdated) onPermissionsUpdated();
      } else {
        Alert.alert('Hata', res.error || 'Güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Öğretmeni İdareciye Terfi Ettir / Öğretmenliğe İndir
  const handleTogglePromotion = (user: UserPermissionItem) => {
    const isCurrentlyStaff = user.role === 'STAFF' || user.role === 'SCHOOL_ADMIN';
    const newRole = isCurrentlyStaff ? 'TEACHER' : 'STAFF';
    const roleTitle = isCurrentlyStaff ? 'Öğretmen' : 'Okul İdarecisi (Md. Yrd.)';

    Alert.alert(
      'Rol Değiştir',
      `"${user.fullName}" kullanıcısının rolünü "${roleTitle}" olarak değiştirmek istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Değiştir',
          onPress: async () => {
            setSaving(true);
            try {
              const res = await apiRequest(`permissions/user/${user.id}`, 'PUT', {
                role: newRole,
                assignedSchoolIds: user.assignedSchoolIds.length > 0 ? user.assignedSchoolIds : (user.schoolId ? [user.schoolId] : []),
                permissionsJson: JSON.stringify(user.permissions || {}),
              });
              if (res.success) {
                Alert.alert('Güncellendi', `${user.fullName} artık ${roleTitle}.`);
                await loadOverview();
                if (onPermissionsUpdated) onPermissionsUpdated();
              } else {
                Alert.alert('Hata', res.error || 'Rol güncellenemedi.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // Toplu Seçim İşlemleri
  const handleSelectAllTeachers = () => {
    if (selectedTeacherIds.length === filteredTeachers.length) {
      setSelectedTeacherIds([]);
    } else {
      setSelectedTeacherIds(filteredTeachers.map((t) => t.id));
    }
  };

  const handleToggleSelectTeacher = (id: string) => {
    if (selectedTeacherIds.includes(id)) {
      setSelectedTeacherIds(selectedTeacherIds.filter((tId) => tId !== id));
    } else {
      setSelectedTeacherIds([...selectedTeacherIds, id]);
    }
  };

  // Toplu Yetki Kaydet
  const handleApplyBatchPermissions = async () => {
    if (selectedTeacherIds.length === 0) {
      Alert.alert('Uyarı', 'Lütfen en az bir öğretmen seçin.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        userIds: selectedTeacherIds,
        permissions: batchPerms,
      };

      if (batchTargetSchoolId !== 'keep') {
        payload.assignedSchoolIds = [batchTargetSchoolId];
      }

      const res = await apiRequest('permissions/batch-update', 'POST', payload);
      if (res.success) {
        Alert.alert('Başarılı ⚡', res.data?.message || `${selectedTeacherIds.length} personelin yetkisi güncellendi.`);
        setBatchModalVisible(false);
        setSelectedTeacherIds([]);
        await loadOverview();
        if (onPermissionsUpdated) onPermissionsUpdated();
      } else {
        Alert.alert('Hata', res.error || 'Toplu işlem başarısız oldu.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtrelenmiş Listeler
  const filterList = (list: UserPermissionItem[]) => {
    return list.filter((item) => {
      const matchesSearch =
        item.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.branch && item.branch.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSchool =
        selectedSchoolFilter === 'all' ||
        (item.assignedSchoolIds && item.assignedSchoolIds.includes(selectedSchoolFilter)) ||
        item.schoolId === selectedSchoolFilter;

      return matchesSearch && matchesSchool;
    });
  };

  const filteredAdmins = filterList(administrators);
  const filteredTeachers = filterList(teachers);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Üst Başlık */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="shield-checkmark" size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Yetki & Erişim Yönetimi</Text>
                <Text style={styles.headerSubtitle}>
                  Kurum Admini Paneli • Okul idarecileri ve öğretmen yetkileri
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Sekme Seçici */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'admins' && styles.tabBtnActive]}
              onPress={() => setActiveTab('admins')}
            >
              <Ionicons
                name="shield"
                size={16}
                color={activeTab === 'admins' ? '#7C3AED' : '#64748B'}
              />
              <Text style={[styles.tabText, activeTab === 'admins' && styles.tabTextActive]}>
                🛡️ Okul İdarecileri ({administrators.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'teachers' && styles.tabBtnActive]}
              onPress={() => setActiveTab('teachers')}
            >
              <Ionicons
                name="people"
                size={16}
                color={activeTab === 'teachers' ? '#0284C7' : '#64748B'}
              />
              <Text style={[styles.tabText, activeTab === 'teachers' && styles.tabTextActive]}>
                👨‍🏫 Öğretmenler ({teachers.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Arama ve Okul Filtresi */}
          <View style={styles.filterRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="İsim, branş veya kullanıcı adı ara..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {schools.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.schoolFilterChip, selectedSchoolFilter === 'all' && styles.schoolFilterChipActive]}
                  onPress={() => setSelectedSchoolFilter('all')}
                >
                  <Text style={[styles.schoolFilterChipText, selectedSchoolFilter === 'all' && styles.schoolFilterChipTextActive]}>
                    Tüm Okullar
                  </Text>
                </TouchableOpacity>
                {schools.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.schoolFilterChip, selectedSchoolFilter === s.id && styles.schoolFilterChipActive]}
                    onPress={() => setSelectedSchoolFilter(s.id)}
                  >
                    <Text style={[styles.schoolFilterChipText, selectedSchoolFilter === s.id && styles.schoolFilterChipTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Öğretmenler Sekmesinde Toplu İşlem Çubuğu */}
          {activeTab === 'teachers' && (
            <View style={styles.batchBar}>
              <TouchableOpacity style={styles.batchSelectAllBtn} onPress={handleSelectAllTeachers}>
                <Ionicons
                  name={
                    selectedTeacherIds.length > 0 && selectedTeacherIds.length === filteredTeachers.length
                      ? 'checkbox'
                      : selectedTeacherIds.length > 0
                      ? 'remove-circle'
                      : 'square-outline'
                  }
                  size={18}
                  color="#0284C7"
                />
                <Text style={styles.batchSelectAllText}>
                  {selectedTeacherIds.length === 0 ? 'Tümünü Seç' : `${selectedTeacherIds.length} Seçildi`}
                </Text>
              </TouchableOpacity>

              {selectedTeacherIds.length > 0 && (
                <TouchableOpacity
                  style={styles.batchActionBtn}
                  onPress={() => setBatchModalVisible(true)}
                >
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={styles.batchActionBtnText}>
                    ⚡ Toplu Yetki Tanımla ({selectedTeacherIds.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* İçerik Listesi */}
          {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={{ marginTop: 10, color: '#64748B', fontSize: 13 }}>Yetki listesi yükleniyor...</Text>
            </View>
          ) : (
            <ScrollView style={styles.listContent} showsVerticalScrollIndicator={false}>
              {activeTab === 'admins' ? (
                // İDARECİLER LİSTESİ
                filteredAdmins.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="shield-outline" size={42} color="#CBD5E1" />
                    <Text style={styles.emptyTitle}>Henüz İdareci Bulunmuyor</Text>
                    <Text style={styles.emptySub}>
                      Öğretmenler sekmesinden herhangi bir öğretmeni "İdareci Yap" butonuyla terfi ettirebilirsiniz.
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.infoBanner}>
                      <Ionicons name="information-circle" size={18} color="#7C3AED" />
                      <Text style={styles.infoBannerText}>
                        Okul idarecileri birden fazla olabilir. Yetkilendirildikleri okulların öğretmen, sınıf, öğrenci ve ders programlarını yönetebilirler; ancak okul ekleyemez veya silemezler.
                      </Text>
                    </View>

                    {filteredAdmins.map((admin) => (
                      <View key={admin.id} style={styles.userCard}>
                        <View style={styles.userCardHeader}>
                          <View style={styles.userAvatarAdmin}>
                            <Ionicons name="shield-checkmark" size={20} color="#7C3AED" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.userName}>{admin.fullName}</Text>
                              <View style={styles.adminRoleBadge}>
                                <Text style={styles.adminRoleBadgeText}>🛡️ Okul İdarecisi</Text>
                              </View>
                            </View>
                            <Text style={styles.userSub}>
                              Kullanıcı Adı: {admin.username} {admin.branch ? `• ${admin.branch}` : ''}
                            </Text>
                          </View>
                        </View>

                        {/* Atanmış Okullar Özeti */}
                        <View style={styles.assignedSchoolsWrap}>
                          <Text style={styles.assignedSchoolsLabel}>Yetkili Olduğu Okullar:</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {admin.assignedSchoolIds && admin.assignedSchoolIds.length > 0 ? (
                              admin.assignedSchoolIds.map((sId) => {
                                const sch = schools.find((s) => s.id === sId);
                                return (
                                  <View key={sId} style={styles.schoolTag}>
                                    <Ionicons name="checkmark-circle" size={13} color="#059669" />
                                    <Text style={styles.schoolTagText}>{sch?.name || 'Okul'}</Text>
                                  </View>
                                );
                              })
                            ) : (
                              <View style={[styles.schoolTag, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                                <Ionicons name="alert-circle" size={13} color="#DC2626" />
                                <Text style={[styles.schoolTagText, { color: '#DC2626' }]}>Okul Atanmadı</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Butonlar */}
                        <View style={styles.cardActionsRow}>
                          <TouchableOpacity
                            style={styles.demoteBtn}
                            onPress={() => handleTogglePromotion(admin)}
                          >
                            <Ionicons name="arrow-down-circle" size={14} color="#64748B" />
                            <Text style={styles.demoteBtnText}>Öğretmen Yap</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.editPermsBtn}
                            onPress={() => handleOpenEditUser(admin)}
                          >
                            <Ionicons name="settings-outline" size={14} color="#7C3AED" />
                            <Text style={styles.editPermsBtnText}>Yetkileri & Okulları Düzenle</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </>
                )
              ) : (
                // ÖĞRETMENLER LİSTESİ
                filteredTeachers.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="people-outline" size={42} color="#CBD5E1" />
                    <Text style={styles.emptyTitle}>Kayıtlı Öğretmen Bulunamadı</Text>
                    <Text style={styles.emptySub}>Arama kriterlerinizi kontrol ediniz.</Text>
                  </View>
                ) : (
                  filteredTeachers.map((teacher) => {
                    const isSelected = selectedTeacherIds.includes(teacher.id);
                    return (
                      <View
                        key={teacher.id}
                        style={[styles.userCard, isSelected && { borderColor: '#0284C7', backgroundColor: '#F0F9FF' }]}
                      >
                        <View style={styles.userCardHeader}>
                          <TouchableOpacity
                            onPress={() => handleToggleSelectTeacher(teacher.id)}
                            style={{ marginRight: 8 }}
                          >
                            <Ionicons
                              name={isSelected ? 'checkbox' : 'square-outline'}
                              size={22}
                              color={isSelected ? '#0284C7' : '#94A3B8'}
                            />
                          </TouchableOpacity>

                          <View style={styles.userAvatarTeacher}>
                            <Ionicons name="school" size={20} color="#0284C7" />
                          </View>

                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.userName}>{teacher.fullName}</Text>
                              {teacher.branch && (
                                <View style={styles.branchTag}>
                                  <Text style={styles.branchTagText}>{teacher.branch}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.userSub}>
                              Kullanıcı Adı: {teacher.username} • {teacher.schoolName || 'Okul'}
                            </Text>
                          </View>
                        </View>

                        {/* Hızlı İzin Rozetleri */}
                        <View style={styles.permPillsRow}>
                          <View
                            style={[
                              styles.permPill,
                              teacher.permissions?.canViewAllClasses !== false
                                ? styles.permPillActive
                                : styles.permPillInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.permPillText,
                                teacher.permissions?.canViewAllClasses !== false
                                  ? styles.permPillTextActive
                                  : styles.permPillTextInactive,
                              ]}
                            >
                              {teacher.permissions?.canViewAllClasses !== false ? '✓ Tüm Sınıflar' : 'Kısıtlı Şubeler'}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.permPill,
                              teacher.permissions?.canUseAiAssistant !== false
                                ? styles.permPillActive
                                : styles.permPillInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.permPillText,
                                teacher.permissions?.canUseAiAssistant !== false
                                  ? styles.permPillTextActive
                                  : styles.permPillTextInactive,
                              ]}
                            >
                              {teacher.permissions?.canUseAiAssistant !== false ? '✓ AI Açık' : 'AI Kapalı'}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.permPill,
                              teacher.permissions?.canExportReports !== false
                                ? styles.permPillActive
                                : styles.permPillInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.permPillText,
                                teacher.permissions?.canExportReports !== false
                                  ? styles.permPillTextActive
                                  : styles.permPillTextInactive,
                              ]}
                            >
                              {teacher.permissions?.canExportReports !== false ? '✓ Rapor Alabilir' : 'Rapor Kapalı'}
                            </Text>
                          </View>
                        </View>

                        {/* Butonlar */}
                        <View style={styles.cardActionsRow}>
                          <TouchableOpacity
                            style={styles.promoteBtn}
                            onPress={() => handleTogglePromotion(teacher)}
                          >
                            <Ionicons name="shield-checkmark" size={14} color="#7C3AED" />
                            <Text style={styles.promoteBtnText}>🛡️ İdareci Yap</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.editPermsBtn, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}
                            onPress={() => handleOpenEditUser(teacher)}
                          >
                            <Ionicons name="options-outline" size={14} color="#0284C7" />
                            <Text style={[styles.editPermsBtnText, { color: '#0284C7' }]}>Yetkileri Düzenle</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )
              )}
            </ScrollView>
          )}

          {/* TEKİL KULLANICI DÜZENLEME MODALI */}
          <Modal visible={!!editingUser} animationType="slide" transparent>
            <View style={styles.subModalOverlay}>
              <View style={styles.subModalContent}>
                <View style={styles.subModalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subModalTitle}>⚙️ Yetkileri Yapılandır</Text>
                    <Text style={styles.subModalSubtitle}>{editingUser?.fullName} ({editingUser?.username})</Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditingUser(null)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                  {/* Rol Seçimi */}
                  <Text style={styles.inputSectionTitle}>Kullanıcı Rolü</Text>
                  <View style={styles.roleToggleRow}>
                    <TouchableOpacity
                      style={[styles.roleToggleBtn, editingRole === 'STAFF' && styles.roleToggleBtnActiveStaff]}
                      onPress={() => setEditingRole('STAFF')}
                    >
                      <Ionicons name="shield-checkmark" size={16} color={editingRole === 'STAFF' ? '#7C3AED' : '#64748B'} />
                      <Text style={[styles.roleToggleText, editingRole === 'STAFF' && { color: '#7C3AED', fontWeight: '800' }]}>
                        🛡️ Okul İdarecisi
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.roleToggleBtn, editingRole === 'TEACHER' && styles.roleToggleBtnActiveTeacher]}
                      onPress={() => setEditingRole('TEACHER')}
                    >
                      <Ionicons name="school" size={16} color={editingRole === 'TEACHER' ? '#0284C7' : '#64748B'} />
                      <Text style={[styles.roleToggleText, editingRole === 'TEACHER' && { color: '#0284C7', fontWeight: '800' }]}>
                        👨‍🏫 Öğretmen
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Yetkili Olduğu Okullar (Çoklu Seçim) */}
                  <Text style={[styles.inputSectionTitle, { marginTop: 14 }]}>
                    Erişebileceği Okullar ({editingAssignedSchools.length}/{schools.length})
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                    İşaretli okulların tüm verilerini ve panellerini görebilir.
                  </Text>
                  <View style={{ gap: 6 }}>
                    {schools.map((sch) => {
                      const isAssigned = editingAssignedSchools.includes(sch.id);
                      return (
                        <TouchableOpacity
                          key={sch.id}
                          style={[styles.schoolAssignRow, isAssigned && styles.schoolAssignRowActive]}
                          onPress={() => handleToggleSchoolForUser(sch.id)}
                        >
                          <Ionicons
                            name={isAssigned ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={isAssigned ? '#4F46E5' : '#94A3B8'}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.schoolAssignName, isAssigned && { color: '#1E1B4B', fontWeight: '700' }]}>
                              {sch.name}
                            </Text>
                            <Text style={styles.schoolAssignCode}>Kod: {sch.code}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Modül Yetkileri */}
                  <Text style={[styles.inputSectionTitle, { marginTop: 16 }]}>Modül & Özellik İzinleri</Text>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permSwitchTitle}>Tüm Sınıfları Görebilme</Text>
                      <Text style={styles.permSwitchSub}>Açık ise okulun tüm şubelerine erişebilir.</Text>
                    </View>
                    <Switch
                      value={editingPerms.canViewAllClasses !== false}
                      onValueChange={(v) => setEditingPerms({ ...editingPerms, canViewAllClasses: v })}
                      trackColor={{ false: '#CBD5E1', true: '#A5B4FC' }}
                      thumbColor={editingPerms.canViewAllClasses !== false ? '#4F46E5' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permSwitchTitle}>Kurumsal AI / Gemini Kullanımı</Text>
                      <Text style={styles.permSwitchSub}>Okulun yapay zeka kotasından soru ve analiz üretir.</Text>
                    </View>
                    <Switch
                      value={editingPerms.canUseAiAssistant !== false}
                      onValueChange={(v) => setEditingPerms({ ...editingPerms, canUseAiAssistant: v })}
                      trackColor={{ false: '#CBD5E1', true: '#A5B4FC' }}
                      thumbColor={editingPerms.canUseAiAssistant !== false ? '#4F46E5' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permSwitchTitle}>Öğrenci & Veli Mesajlaşması</Text>
                      <Text style={styles.permSwitchSub}>Öğrenci ve velilere doğrudan mesaj gönderebilir.</Text>
                    </View>
                    <Switch
                      value={editingPerms.canMessageStudents !== false}
                      onValueChange={(v) => setEditingPerms({ ...editingPerms, canMessageStudents: v, canMessageParents: v })}
                      trackColor={{ false: '#CBD5E1', true: '#A5B4FC' }}
                      thumbColor={editingPerms.canMessageStudents !== false ? '#4F46E5' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permSwitchTitle}>Excel & PDF Rapor Dışa Aktarma</Text>
                      <Text style={styles.permSwitchSub}>Sınıf listeleri ve yoklama raporlarını indirebilir.</Text>
                    </View>
                    <Switch
                      value={editingPerms.canExportReports !== false}
                      onValueChange={(v) => setEditingPerms({ ...editingPerms, canExportReports: v })}
                      trackColor={{ false: '#CBD5E1', true: '#A5B4FC' }}
                      thumbColor={editingPerms.canExportReports !== false ? '#4F46E5' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permSwitchTitle}>Öğrenci Bilgilerini Düzenleme</Text>
                      <Text style={styles.permSwitchSub}>Öğrenci numarası, adı veya şube bilgilerini güncelleyebilir.</Text>
                    </View>
                    <Switch
                      value={!!editingPerms.canEditStudents}
                      onValueChange={(v) => setEditingPerms({ ...editingPerms, canEditStudents: v })}
                      trackColor={{ false: '#CBD5E1', true: '#A5B4FC' }}
                      thumbColor={editingPerms.canEditStudents ? '#4F46E5' : '#F1F5F9'}
                    />
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSaveSingleUser}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Değişiklikleri Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* TOPLU YETKİ TANIMLAMA MODALI */}
          <Modal visible={batchModalVisible} animationType="slide" transparent>
            <View style={styles.subModalOverlay}>
              <View style={styles.subModalContent}>
                <View style={styles.subModalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subModalTitle}>⚡ Toplu Yetki Tanımla</Text>
                    <Text style={styles.subModalSubtitle}>
                      Seçilen {selectedTeacherIds.length} öğretmene toplu yetki uygulanacak.
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBatchModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                  {schools.length > 1 && (
                    <>
                      <Text style={styles.inputSectionTitle}>Okul Ataması (İsteğe Bağlı)</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>
                        <TouchableOpacity
                          style={[styles.batchSchoolChip, batchTargetSchoolId === 'keep' && styles.batchSchoolChipActive]}
                          onPress={() => setBatchTargetSchoolId('keep')}
                        >
                          <Text style={[styles.batchSchoolChipText, batchTargetSchoolId === 'keep' && styles.batchSchoolChipTextActive]}>
                            Mevcut Okullarını Koru
                          </Text>
                        </TouchableOpacity>
                        {schools.map((s) => (
                          <TouchableOpacity
                            key={s.id}
                            style={[styles.batchSchoolChip, batchTargetSchoolId === s.id && styles.batchSchoolChipActive]}
                            onPress={() => setBatchTargetSchoolId(s.id)}
                          >
                            <Text style={[styles.batchSchoolChipText, batchTargetSchoolId === s.id && styles.batchSchoolChipTextActive]}>
                              {s.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <Text style={[styles.inputSectionTitle, { marginTop: 10 }]}>Uygulanacak İzinler</Text>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.permSwitchTitle}>Tüm Sınıfları Görebilme</Text>
                    </View>
                    <Switch
                      value={batchPerms.canViewAllClasses}
                      onValueChange={(v) => setBatchPerms({ ...batchPerms, canViewAllClasses: v })}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.permSwitchTitle}>Kurumsal AI / Gemini Kullanımı</Text>
                    </View>
                    <Switch
                      value={batchPerms.canUseAiAssistant}
                      onValueChange={(v) => setBatchPerms({ ...batchPerms, canUseAiAssistant: v })}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.permSwitchTitle}>Öğrenci/Veli Mesajlaşması</Text>
                    </View>
                    <Switch
                      value={batchPerms.canMessageStudents}
                      onValueChange={(v) => setBatchPerms({ ...batchPerms, canMessageStudents: v, canMessageParents: v })}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.permSwitchTitle}>Excel/PDF Rapor Dışa Aktarma</Text>
                    </View>
                    <Switch
                      value={batchPerms.canExportReports}
                      onValueChange={(v) => setBatchPerms({ ...batchPerms, canExportReports: v })}
                    />
                  </View>

                  <View style={styles.permSwitchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.permSwitchTitle}>Öğrenci Düzenleme Yetkisi</Text>
                    </View>
                    <Switch
                      value={batchPerms.canEditStudents}
                      onValueChange={(v) => setBatchPerms({ ...batchPerms, canEditStudents: v })}
                    />
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#7C3AED' }, saving && { opacity: 0.6 }]}
                  onPress={handleApplyBatchPermissions}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      ⚡ {selectedTeacherIds.length} Öğretmene Uygula & Kaydet
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 10,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 820,
    maxHeight: '92%',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tabBtnActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#7C3AED',
  },
  filterRow: {
    marginBottom: 10,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    padding: 0,
  },
  schoolFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  schoolFilterChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  schoolFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  schoolFilterChipTextActive: {
    color: '#7C3AED',
    fontWeight: '800',
  },
  batchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 10,
  },
  batchSelectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchSelectAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  batchActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  batchActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  listContent: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F5F3FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#6D28D9',
    flex: 1,
    lineHeight: 16,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatarAdmin: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarTeacher: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  userSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  adminRoleBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  adminRoleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  branchTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  branchTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  assignedSchoolsWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  assignedSchoolsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  schoolTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  schoolTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  permPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  permPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  permPillActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  permPillInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  permPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  permPillTextActive: {
    color: '#166534',
  },
  permPillTextInactive: {
    color: '#94A3B8',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  demoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  demoteBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  promoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
  },
  promoteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  editPermsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  editPermsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
  // Alt Modallar (SubModals)
  subModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  subModalContent: {
    backgroundColor: '#fff',
    borderRadius: 18,
    width: '100%',
    maxWidth: 540,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },
  subModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  subModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  subModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  inputSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  roleToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  roleToggleBtnActiveStaff: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
  },
  roleToggleBtnActiveTeacher: {
    backgroundColor: '#F0F9FF',
    borderColor: '#0284C7',
  },
  roleToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  schoolAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  schoolAssignRowActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  schoolAssignName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  schoolAssignCode: {
    fontSize: 11,
    color: '#64748B',
  },
  permSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  permSwitchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  permSwitchSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  batchSchoolChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  batchSchoolChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  batchSchoolChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  batchSchoolChipTextActive: {
    color: '#7C3AED',
    fontWeight: '800',
  },
});
