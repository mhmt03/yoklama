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
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function LogsTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    logStats,
    handleExportLogs,
    exportingLogs,
    setLogPurgeModalVisible,
    loadAuditLogs,
    loadingLogs,
    logUsers,
    logSearch,
    setLogSearch,
    selectedLogTime,
    setSelectedLogTime,
    selectedLogRole,
    setSelectedLogRole,
    selectedLogUser,
    setSelectedLogUser,
    logActionTypes,
    selectedLogAction,
    setSelectedLogAction,
    logs,
    expandedLogId,
    setExpandedLogId
  } = ctx;

  return (
    <View>
                {/* Başlık ve Rapor Butonları */}
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>İşlem Logları & Rapor ({logStats.total})</Text>
                    <Text style={styles.sectionSubTitle}>
                      Tüm kullanıcıların okul içindeki işlemleri kayıt altındadır.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.logReportExportBtn}
                      onPress={() => handleExportLogs('txt')}
                      disabled={exportingLogs}
                    >
                      <Ionicons name="document-text-outline" size={13} color="#4F46E5" />
                      <Text style={styles.logReportExportBtnText}>.TXT Raporu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.logReportExportExcelBtn}
                      onPress={() => handleExportLogs('csv')}
                      disabled={exportingLogs}
                    >
                      <Ionicons name="stats-chart-outline" size={13} color="#059669" />
                      <Text style={styles.logReportExportExcelBtnText}>Excel / CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.logReportExportBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                      onPress={() => setLogPurgeModalVisible(true)}
                    >
                      <Ionicons name="trash-outline" size={13} color="#DC2626" />
                      <Text style={[styles.logReportExportBtnText, { color: '#DC2626' }]}>Logları Temizle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.logRefreshBtn}
                      onPress={() => loadAuditLogs()}
                      disabled={loadingLogs}
                    >
                      <Ionicons name="refresh" size={14} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Özet Kartları */}
                <View style={styles.logStatsRow}>
                  <View style={styles.logStatCard}>
                    <Ionicons name="layers" size={16} color="#4F46E5" />
                    <Text style={styles.logStatValue}>{logStats.total}</Text>
                    <Text style={styles.logStatLabel}>Toplam Kayıt</Text>
                  </View>
                  <View style={[styles.logStatCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Ionicons name="time" size={16} color="#059669" />
                    <Text style={[styles.logStatValue, { color: '#065F46' }]}>{logStats.todayCount}</Text>
                    <Text style={styles.logStatLabel}>Bugünkü İşlemler</Text>
                  </View>
                  <View style={[styles.logStatCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Ionicons name="people" size={16} color="#B45309" />
                    <Text style={[styles.logStatValue, { color: '#92400E' }]}>{logUsers.length}</Text>
                    <Text style={styles.logStatLabel}>Kayıtlı Kullanıcı</Text>
                  </View>
                </View>

                {/* Arama Kutusu */}
                <View style={styles.logSearchContainer}>
                  <Ionicons name="search" size={16} color="#64748B" />
                  <TextInput
                    style={styles.logSearchInput}
                    placeholder="Loglarda ara (Kullanıcı, işlem veya açıklama)..."
                    placeholderTextColor="#94A3B8"
                    value={logSearch}
                    onChangeText={(text: any) => {
                      setLogSearch(text);
                    }}
                    onSubmitEditing={() => loadAuditLogs(undefined, { search: logSearch })}
                    returnKeyType="search"
                  />
                  {logSearch.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setLogSearch('');
                        loadAuditLogs(undefined, { search: '' });
                      }}
                    >
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filtre: Zaman Dilimi */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionLabel}>ZAMAN FİLTRESİ:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {[
                      { id: 'all', label: 'Tüm Zamanlar' },
                      { id: 'today', label: 'Bugün' },
                      { id: 'last7', label: 'Son 7 Gün' },
                      { id: 'month', label: 'Bu Ay' },
                    ].map((f: any) => {
                      const isSel = selectedLogTime === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                          onPress={() => {
                            setSelectedLogTime(f.id as any);
                            loadAuditLogs(undefined, { time: f.id });
                          }}
                        >
                          <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>{f.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Filtre: Kullanıcı Rolü */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionLabel}>KULLANICI ROLÜ:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {[
                      { id: 'all', label: 'Tüm Roller' },
                      { id: 'SchoolAdmin', label: '🛡️ Okul Admini' },
                      { id: 'Teacher', label: '👨‍🏫 Öğretmen' },
                      { id: 'Student', label: '🎓 Öğrenci' },
                    ].map((r: any) => {
                      const isSel = selectedLogRole === r.id;
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                          onPress={() => {
                            setSelectedLogRole(r.id);
                            loadAuditLogs(undefined, { role: r.id });
                          }}
                        >
                          <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>{r.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Filtre: Kullanıcı Seçici (Varsa) */}
                {logUsers.length > 0 && (
                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionLabel}>KULLANICI SEÇ:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                      <TouchableOpacity
                        style={[styles.logFilterChip, selectedLogUser === 'all' && styles.logFilterChipActive]}
                        onPress={() => {
                          setSelectedLogUser('all');
                          loadAuditLogs(undefined, { user: 'all' });
                        }}
                      >
                        <Text style={[styles.logFilterChipText, selectedLogUser === 'all' && styles.logFilterChipTextActive]}>
                          Tüm Kullanıcılar
                        </Text>
                      </TouchableOpacity>
                      {logUsers.map((u: any) => {
                        const isSel = selectedLogUser === u.id;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                            onPress={() => {
                              setSelectedLogUser(u.id);
                              loadAuditLogs(undefined, { user: u.id });
                            }}
                          >
                            <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>
                              {u.fullName || u.username}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Filtre: İşlem Türü (ActionType) */}
                {logActionTypes.length > 0 && (
                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionLabel}>İŞLEM TÜRÜ:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                      <TouchableOpacity
                        style={[styles.logFilterChip, selectedLogAction === 'all' && styles.logFilterChipActive]}
                        onPress={() => {
                          setSelectedLogAction('all');
                          loadAuditLogs(undefined, { action: 'all' });
                        }}
                      >
                        <Text style={[styles.logFilterChipText, selectedLogAction === 'all' && styles.logFilterChipTextActive]}>
                          Tüm İşlemler
                        </Text>
                      </TouchableOpacity>
                      {logActionTypes.map((act: any) => {
                        const isSel = selectedLogAction === act;
                        return (
                          <TouchableOpacity
                            key={act}
                            style={[styles.logFilterChip, isSel && styles.logFilterChipActive]}
                            onPress={() => {
                              setSelectedLogAction(act);
                              loadAuditLogs(undefined, { action: act });
                            }}
                          >
                            <Text style={[styles.logFilterChipText, isSel && styles.logFilterChipTextActive]}>
                              {act}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Log Listesi */}
                {loadingLogs ? (
                  <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 24 }} />
                ) : logs.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="document-text-outline" size={44} color="#94A3B8" />
                    <Text style={styles.emptyText}>Seçilen filtrelere uygun işlem logu bulunamadı.</Text>
                  </View>
                ) : (
                  logs.map((item: any) => {
                    const isExpanded = expandedLogId === item.id;
                    const isDelete = item.actionType.includes('DELETE');
                    const isCreate = item.actionType.includes('CREATE') || item.actionType.includes('REGISTER');
                    const isSchedule = item.actionType.includes('SCHEDULE') || item.actionType.includes('PLAN');
                    const isLogin = item.actionType.includes('LOGIN');
                    const isSecurity = item.actionType.includes('PASSWORD') || item.actionType.includes('RESET');

                    const badgeBg = isDelete ? '#FEE2E2' : isCreate ? '#DCFCE7' : isSchedule ? '#EDE9FE' : isLogin ? '#E0F2FE' : isSecurity ? '#FEF3C7' : '#F1F5F9';
                    const badgeColor = isDelete ? '#DC2626' : isCreate ? '#16A34A' : isSchedule ? '#7C3AED' : isLogin ? '#0284C7' : isSecurity ? '#D97706' : '#475569';
                    const displayTitle = item.actionTitle || item.actionType;

                    let parsedDetailsObj: any = null;
                    if (item.detailsJson) {
                      try {
                        if (item.detailsJson.trim().startsWith('{')) {
                          parsedDetailsObj = JSON.parse(item.detailsJson);
                        }
                      } catch { }
                    }

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.logCard, isExpanded && { borderColor: '#94A3B8' }]}
                        onPress={() => setExpandedLogId(isExpanded ? null : item.id)}
                        activeOpacity={0.8}
                      >
                        {/* 1. Üst Satır: İşlem Başlığı ve Zaman */}
                        <View style={styles.logCardTop}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                            <View style={[styles.logActionBadge, { backgroundColor: badgeBg }]}>
                              <Text style={[styles.logActionBadgeText, { color: badgeColor }]}>
                                {displayTitle}
                              </Text>
                            </View>
                            {item.entityName ? (
                              <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  {item.entityName}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.logTimestamp}>
                              {item.relativeTime || item.localTimeString}
                            </Text>
                            {item.formattedDate ? (
                              <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 1 }}>
                                {item.formattedDate.split(',')[1]?.trim() || item.localTimeString}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        {/* 2. Açıklama (Ne Yapıldı) */}
                        <Text style={styles.logDescription}>{item.description || item.actionType}</Text>

                        {/* 3. Kim Yaptı ve Ne Zaman Bilgi Kutusu */}
                        <View style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F1F5F9', marginTop: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Ionicons name="person-circle" size={17} color="#4F46E5" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                                {item.userFullName || item.userName || 'Sistem'}
                              </Text>
                              {item.userName && item.userName !== item.userFullName ? (
                                <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>
                                  (@{item.userName})
                                </Text>
                              ) : null}
                              <View style={[styles.logRoleBadge, { backgroundColor: '#EEF2FF' }]}>
                                <Text style={[styles.logRoleBadgeText, { color: '#4F46E5' }]}>
                                  {item.roleLabel || item.userRole}
                                </Text>
                              </View>
                            </View>

                            {item.ipAddress ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="globe-outline" size={11} color="#94A3B8" />
                                <Text style={{ fontSize: 10, color: '#64748B' }}>IP: {item.ipAddress}</Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Tam Tarih Bilgisi */}
                          {item.formattedDate ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="calendar-outline" size={11} color="#94A3B8" />
                              <Text style={{ fontSize: 10, color: '#64748B' }}>
                                {item.formattedDate}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* 4. Detaylar Butonu ve Genişletilebilir Kutu */}
                        {item.detailsJson ? (
                          <View style={{ marginTop: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                {isExpanded ? 'Detayları Gizle ▲' : 'Teknik Detayları Göster ▼'}
                              </Text>
                            </View>

                            {isExpanded ? (
                              <View style={styles.logDetailsBox}>
                                {parsedDetailsObj ? (
                                  <View style={{ gap: 4 }}>
                                    {Object.entries(parsedDetailsObj).map(([k, v]) => (
                                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{k}:</Text>
                                        <Text style={{ fontSize: 11, color: '#0F172A', flexShrink: 1 }}>{String(v)}</Text>
                                      </View>
                                    ))}
                                  </View>
                                ) : (
                                  <Text style={styles.logDetailsText}>{item.detailsJson}</Text>
                                )}
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
  );
}
