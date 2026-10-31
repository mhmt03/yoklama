import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
  Image,
  Linking,
  Platform,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../../theme/colors';
import {
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../../../utils/counselorService';
import { SchoolAdminCtx, styles, generateDefaultTeacherUsername } from '../schoolAdminStyles';

export function TeachersTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    teachers,
    teacherLoginFilter,
    setTeacherLoginFilter,
    filteredTeachers,
    handleDeleteAllTeachers,
    handleDownloadTeacherTemplate,
    handlePickAndParseTeacherExcel,
    setAddTeacherModalVisible,
    teacherSearchQuery,
    setTeacherSearchQuery,
    setTeacherSortOrder,
    teacherSortOrder,
    allSchoolSchedules,
    handleOpenTeacherSchedule,
    setEditingTeacher,
    setEditTeacherModalVisible,
    handleResetTeacherPassword,
    handleDeleteTeacher
  } = ctx;

  return (
    <View>
                {/* 🛡️ GÜVENLİK VE GİRİŞ TAKİP KARTI */}
                <View style={styles.securityCard}>
                  <View style={styles.securityCardHeader}>
                    <View style={styles.securityIconBox}>
                      <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.securityTitle}>Uygulama Kullanım & Güvenlik Takibi</Text>
                      <Text style={styles.securitySub}>
                        Öğretmenlerin uygulamaya giriş durumlarını denetleyin. Şifre sızıntısı veya yetkisiz erişim şüphesinde şifreyi 1234 olarak sıfırlayabilirsiniz.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.securityGrid}>
                    <View style={styles.securityStatBox}>
                      <Text style={styles.securityStatVal}>{teachers.length}</Text>
                      <Text style={styles.securityStatLbl}>Toplam Kadro</Text>
                    </View>
                    <View style={styles.securityStatBox}>
                      <Text style={[styles.securityStatVal, { color: '#0D9488' }]}>
                        {teachers.filter((t: any) => !!t.lastLoginAt).length}
                      </Text>
                      <Text style={styles.securityStatLbl}>Giriş Yapanlar</Text>
                    </View>
                    <View style={styles.securityStatBox}>
                      <Text style={[styles.securityStatVal, { color: '#E11D48' }]}>
                        {teachers.filter((t: any) => !t.lastLoginAt).length}
                      </Text>
                      <Text style={styles.securityStatLbl}>Henüz Girmeyen</Text>
                    </View>
                  </View>

                  <View style={styles.securityFilterRow}>
                    <TouchableOpacity
                      style={[styles.securityFilterBtn, teacherLoginFilter === 'all' && styles.securityFilterBtnActive]}
                      onPress={() => setTeacherLoginFilter('all')}
                    >
                      <Text style={[styles.securityFilterText, teacherLoginFilter === 'all' && styles.securityFilterTextActive]}>
                        Tümü ({teachers.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.securityFilterBtn, teacherLoginFilter === 'logged_in' && styles.securityFilterBtnActive]}
                      onPress={() => setTeacherLoginFilter('logged_in')}
                    >
                      <Text style={[styles.securityFilterText, teacherLoginFilter === 'logged_in' && styles.securityFilterTextActive]}>
                        🟢 Giriş Yapan ({teachers.filter((t: any) => !!t.lastLoginAt).length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.securityFilterBtn, teacherLoginFilter === 'not_logged_in' && styles.securityFilterBtnActive]}
                      onPress={() => setTeacherLoginFilter('not_logged_in')}
                    >
                      <Text style={[styles.securityFilterText, teacherLoginFilter === 'not_logged_in' && styles.securityFilterTextActive]}>
                        ⚪ Girmeyen ({teachers.filter((t: any) => !t.lastLoginAt).length})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.sectionHeader, { flexWrap: 'wrap', gap: 8, alignItems: 'center' }]}>
                  <Text style={styles.sectionTitle}>
                    Bağlı Öğretmen Kadrosu ({filteredTeachers.length}{filteredTeachers.length !== teachers.length ? ` / ${teachers.length}` : ''})
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {teachers.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllTeachers}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#475569' }]}
                      onPress={handleDownloadTeacherTemplate}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Şablon</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#059669' }]}
                      onPress={handlePickAndParseTeacherExcel}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="document-text" size={13} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Excel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddTeacherModalVisible(true)}
                    >
                      <Ionicons name="person-add" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Öğretmen Arama & Ada Göre Sıralama Çubuğu */}
                {teachers.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <View style={[styles.searchBox, { flex: 1, marginBottom: 0 }]}>
                      <Ionicons name="search" size={18} color={Colors.textMuted} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Öğretmen adı veya branş ile ara..."
                        value={teacherSearchQuery}
                        onChangeText={setTeacherSearchQuery}
                        placeholderTextColor={Colors.textMuted}
                      />
                      {teacherSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setTeacherSearchQuery('')}>
                          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#EEF2FF',
                        borderWidth: 1,
                        borderColor: '#C7D2FE',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        height: 38,
                        gap: 4,
                      }}
                      onPress={() => setTeacherSortOrder((prev: any) => prev === 'asc' ? 'desc' : 'asc')}
                    >
                      <Ionicons
                        name={teacherSortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                        size={14}
                        color="#4F46E5"
                      />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#4F46E5' }}>
                        {teacherSortOrder === 'desc' ? 'Z ➔ A' : 'A ➔ Z'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {filteredTeachers.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name={teacherSearchQuery.trim() ? "search-outline" : "people-outline"} size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {teacherSearchQuery.trim()
                        ? `"${teacherSearchQuery}" aramasına uygun öğretmen bulunamadı.`
                        : 'Henüz sisteme eklenmiş bir öğretmen bulunmuyor.'}
                    </Text>
                  </View>
                ) : (
                  filteredTeachers.map((teacher: any) => (
                    <View key={teacher.id} style={styles.cardItem}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.teacherAvatar}>
                          <Text style={styles.avatarText}>{teacher.fullName?.slice(0, 2).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <Text style={styles.cardTitle}>{teacher.fullName}</Text>
                            <View style={[styles.roleBadge, teacher.role === 'STAFF' ? styles.roleStaffBadge : styles.roleTeacherBadge]}>
                              <Text style={teacher.role === 'STAFF' ? styles.roleStaffBadgeText : styles.roleTeacherBadgeText}>
                                {teacher.role === 'STAFF' ? '🛡️ İdareci' : '👨‍🏫 Öğretmen'}
                              </Text>
                            </View>
                          </View>
                          {/* 👤 Belirgin Kullanıcı Adı Rozeti */}
                          {(() => {
                            const displayUsername = (teacher.username || teacher.userName || generateDefaultTeacherUsername(teacher.fullName)).trim();
                            return (
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
                                <View style={styles.teacherUsernameBadge}>
                                  <Ionicons name="person" size={11} color="#4F46E5" />
                                  <Text style={styles.teacherUsernameLabel}>Kullanıcı Adı: </Text>
                                  <Text style={styles.teacherUsernameValue} selectable>
                                    {displayUsername}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => {
                                      Clipboard.setStringAsync(displayUsername);
                                      Alert.alert('Kopyalandı', `"${displayUsername}" kullanıcı adı panoya kopyalandı.`);
                                    }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={{ marginLeft: 4 }}
                                  >
                                    <Ionicons name="copy-outline" size={12} color="#4F46E5" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })()}

                          {/* Güvenlik & Son Giriş Rozeti */}
                          {teacher.lastLoginAt ? (
                            <View style={styles.loginStatusBadgeGreen}>
                              <Ionicons name="checkmark-circle" size={12} color="#0D9488" />
                              <Text style={styles.loginStatusTextGreen}>
                                Son Giriş: {new Date(teacher.lastLoginAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.loginStatusBadgeGray}>
                              <Ionicons name="time-outline" size={12} color="#64748B" />
                              <Text style={styles.loginStatusTextGray}>
                                Henüz Giriş Yapmadı (İlk Şifre: 1234)
                              </Text>
                            </View>
                          )}
                          {teacher.branch && (
                            <Text style={styles.teacherBranchText}>📚 Branş: {teacher.branch}</Text>
                          )}
                          {(() => {
                            const cClass = getTeacherCounselorClass(teacher, allSchoolSchedules);
                            return (
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: cClass ? '#ECFDF5' : '#F8FAFC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginVertical: 3, borderWidth: 1, borderColor: cClass ? '#A7F3D0' : '#E2E8F0', alignSelf: 'flex-start' }}>
                                <Ionicons name="ribbon-outline" size={12} color={cClass ? '#059669' : '#94A3B8'} style={{ marginRight: 4 }} />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: cClass ? '#047857' : '#64748B' }}>
                                  Sınıf Rehberliği: {cClass || '—'}
                                </Text>
                              </View>
                            );
                          })()}
                          {teacher.assignedClassesJson && (
                            <Text style={styles.teacherClassesText} numberOfLines={2}>🏫 Sınıflar: {teacher.assignedClassesJson}</Text>
                          )}
                          {teacher.phone && (
                            <Text style={styles.contactText}>📞 {teacher.phone}</Text>
                          )}

                          {/* Yetki Özeti Çipleri */}
                          {(() => {
                            let perms: any = null;
                            if (teacher.permissionsJson) {
                              try { perms = JSON.parse(teacher.permissionsJson); } catch (e) { }
                            }
                            return (
                              <View style={styles.permissionChipsWrap}>
                                <View style={[styles.permissionMiniChip, perms?.canMessageStudents === false && { backgroundColor: '#FEE2E2' }]}>
                                  <Text style={[styles.permissionMiniChipText, perms?.canMessageStudents === false && { color: '#DC2626' }]}>
                                    {perms?.canMessageStudents === false ? '🚫 Öğrenci Mesaj' : '💬 Öğrenci'}
                                  </Text>
                                </View>
                                <View style={[styles.permissionMiniChip, perms?.canMessageParents === false && { backgroundColor: '#FEE2E2' }]}>
                                  <Text style={[styles.permissionMiniChipText, perms?.canMessageParents === false && { color: '#DC2626' }]}>
                                    {perms?.canMessageParents === false ? '🚫 Veli Mesaj' : '💬 Veli'}
                                  </Text>
                                </View>
                                <View style={[styles.permissionMiniChip, perms?.canMessageTeachers === false && { backgroundColor: '#FEE2E2' }]}>
                                  <Text style={[styles.permissionMiniChipText, perms?.canMessageTeachers === false && { color: '#DC2626' }]}>
                                    {perms?.canMessageTeachers === false ? '🚫 Öğretmen Mesaj' : '💬 Öğretmen'}
                                  </Text>
                                </View>
                                <View style={styles.permissionMiniChip}>
                                  <Text style={styles.permissionMiniChipText}>
                                    {perms?.canViewAllClasses === false ? '🔒 Kısıtlı Şube' : '🌐 Tüm Şubeler'}
                                  </Text>
                                </View>
                                {perms?.canUseAiAssistant === false && (
                                  <View style={[styles.permissionMiniChip, { backgroundColor: '#FEE2E2' }]}>
                                    <Text style={[styles.permissionMiniChipText, { color: '#DC2626' }]}>🚫 AI Kapalı</Text>
                                  </View>
                                )}
                              </View>
                            );
                          })()}
                        </View>
                        <View style={[styles.statusBadge, teacher.isActive ? styles.statusActive : styles.statusPassive]}>
                          <Text style={styles.statusText}>{teacher.isActive ? 'Aktif' : 'Pasif'}</Text>
                        </View>
                      </View>

                      {/* Öğretmen Aksiyon Butonları */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' }]}
                          onPress={() => handleOpenTeacherSchedule(teacher)}
                        >
                          <Ionicons name="calendar-outline" size={14} color="#4F46E5" />
                          <Text style={[styles.cardActionBtnText, { color: '#4F46E5' }]}>Ders Programı</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => {
                            let perms = {
                              canMessageStudents: true,
                              canMessageTeachers: true,
                              canMessageParents: true,
                              canViewAllClasses: true,
                              canUseAiAssistant: true,
                              canExportReports: true,
                              canManageAttendance: true,
                              canEditStudents: false,
                            };
                            if (teacher.permissionsJson) {
                              try {
                                perms = { ...perms, ...JSON.parse(teacher.permissionsJson) };
                              } catch (e) { }
                            }
                            setEditingTeacher({
                              ...teacher,
                              username: teacher.username || teacher.userName || generateDefaultTeacherUsername(teacher.fullName),
                              role: teacher.role || 'TEACHER',
                              permissions: perms,
                            });
                            setEditTeacherModalVisible(true);
                          }}
                        >
                          <Ionicons name="pencil" size={14} color="#4F46E5" />
                          <Text style={styles.cardActionBtnText}>Düzenle</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#FDE68A', backgroundColor: '#FEF3C7' }]}
                          onPress={() => handleResetTeacherPassword(teacher.id, teacher.fullName, teacher.username || teacher.userName)}
                        >
                          <Ionicons name="key-outline" size={14} color="#D97706" />
                          <Text style={[styles.cardActionBtnText, { color: '#D97706' }]}>Şifre (1234)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                          onPress={() => handleDeleteTeacher(teacher.id, teacher.fullName)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                          <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
  );
}
