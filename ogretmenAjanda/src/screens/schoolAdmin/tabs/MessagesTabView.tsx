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
import { Colors } from '../../../theme/colors';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function MessagesTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    adminMessageScope,
    schoolMessages,
    setAdminNewMsgModalVisible,
    loadSchoolMessages,
    setAdminMessageScope,
    messageSearch,
    setMessageSearch,
    selectedMessageFilter,
    setSelectedMessageFilter,
    loadingMessages,
    handleOpenAdminReply,
    adminReplyModalVisible,
    setAdminReplyModalVisible,
    adminReplyingMessage,
    adminReplyContent,
    setAdminReplyContent,
    handleSendAdminReply,
    sendingAdminReply,
    adminNewMsgModalVisible,
    adminNewMsgTargetType,
    setAdminNewMsgTargetType,
    setAdminNewMsgTargetTeacher,
    teachers,
    adminNewMsgTargetTeacher,
    adminNewMsgContent,
    setAdminNewMsgContent,
    handleSendAdminNewMessage,
    sendingAdminNewMsg
  } = ctx;

  return (
    <View>
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.sectionTitle}>
                      💬 {adminMessageScope === 'personal' ? 'Şahsıma / İdareye Gelenler' : adminMessageScope === 'sent' ? 'İdareden Gönderilenler' : 'Tüm Okul Mesaj Trafiği'} ({schoolMessages.length})
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {adminMessageScope === 'personal'
                        ? 'Doğrudan şahsınıza ve idareye gelen mesajları görüp hemen yanıtlayabilirsiniz.'
                        : adminMessageScope === 'sent'
                          ? 'İdare olarak öğretmen, öğrenci ve velilere ilettiğiniz mesajlar.'
                          : 'Okul genelindeki tüm öğretmen, öğrenci ve veli mesaj trafiği (denetim amaçlı).'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#059669', paddingHorizontal: 12 }]}
                      onPress={() => setAdminNewMsgModalVisible(true)}
                    >
                      <Ionicons name="paper-plane" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Yeni Mesaj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryAddBtn, { backgroundColor: '#4F46E5', paddingHorizontal: 10 }]}
                      onPress={() => loadSchoolMessages()}
                    >
                      <Ionicons name="refresh" size={14} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>Yenile</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 3 Ana Görünüm Sekmesi (Scope Tabs) */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1.2,
                      minWidth: 160,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: adminMessageScope === 'personal' ? '#4F46E5' : '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: adminMessageScope === 'personal' ? '#4F46E5' : '#E2E8F0',
                      elevation: adminMessageScope === 'personal' ? 2 : 0,
                    }}
                    onPress={() => {
                      setAdminMessageScope('personal');
                      loadSchoolMessages(undefined, 'personal');
                    }}
                  >
                    <Ionicons name="mail" size={15} color={adminMessageScope === 'personal' ? '#FFFFFF' : '#4F46E5'} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: adminMessageScope === 'personal' ? '#FFFFFF' : '#1E293B' }}>
                      📥 Şahsıma Gelenler
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1.2,
                      minWidth: 160,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: adminMessageScope === 'all' ? '#4F46E5' : '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: adminMessageScope === 'all' ? '#4F46E5' : '#E2E8F0',
                      elevation: adminMessageScope === 'all' ? 2 : 0,
                    }}
                    onPress={() => {
                      setAdminMessageScope('all');
                      loadSchoolMessages(undefined, 'all');
                    }}
                  >
                    <Ionicons name="globe-outline" size={15} color={adminMessageScope === 'all' ? '#FFFFFF' : '#64748B'} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: adminMessageScope === 'all' ? '#FFFFFF' : '#334155' }}>
                      🌐 Tüm Okul Trafiği
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      minWidth: 130,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: adminMessageScope === 'sent' ? '#4F46E5' : '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: adminMessageScope === 'sent' ? '#4F46E5' : '#E2E8F0',
                      elevation: adminMessageScope === 'sent' ? 2 : 0,
                    }}
                    onPress={() => {
                      setAdminMessageScope('sent');
                      loadSchoolMessages(undefined, 'sent');
                    }}
                  >
                    <Ionicons name="paper-plane-outline" size={15} color={adminMessageScope === 'sent' ? '#FFFFFF' : '#64748B'} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: adminMessageScope === 'sent' ? '#FFFFFF' : '#334155' }}>
                      📤 Gönderdiklerim
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Filtre ve Arama */}
                <View style={styles.logSearchContainer}>
                  <Ionicons name="search" size={16} color="#64748B" />
                  <TextInput
                    style={styles.logSearchInput}
                    placeholder="Mesaj içeriği, gönderen veya alıcı ara..."
                    value={messageSearch}
                    onChangeText={setMessageSearch}
                    placeholderTextColor="#94A3B8"
                  />
                  {messageSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setMessageSearch('')}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {adminMessageScope === 'all' && (
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[styles.logFilterChip, selectedMessageFilter === 'all' && styles.logFilterChipActive]}
                      onPress={() => setSelectedMessageFilter('all')}
                    >
                      <Text style={[styles.logFilterChipText, selectedMessageFilter === 'all' && styles.logFilterChipTextActive]}>
                        Tümü ({schoolMessages.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.logFilterChip, selectedMessageFilter === 'students' && styles.logFilterChipActive]}
                      onPress={() => setSelectedMessageFilter('students')}
                    >
                      <Text style={[styles.logFilterChipText, selectedMessageFilter === 'students' && styles.logFilterChipTextActive]}>
                        Öğrenciye
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.logFilterChip, selectedMessageFilter === 'teachers' && styles.logFilterChipActive]}
                      onPress={() => setSelectedMessageFilter('teachers')}
                    >
                      <Text style={[styles.logFilterChipText, selectedMessageFilter === 'teachers' && styles.logFilterChipTextActive]}>
                        Öğretmenlere
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.logFilterChip, selectedMessageFilter === 'parents' && styles.logFilterChipActive]}
                      onPress={() => setSelectedMessageFilter('parents')}
                    >
                      <Text style={[styles.logFilterChipText, selectedMessageFilter === 'parents' && styles.logFilterChipTextActive]}>
                        Velilere
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {loadingMessages ? (
                  <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 20 }} />
                ) : schoolMessages.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {adminMessageScope === 'personal'
                        ? 'Şahsınıza veya idareye gelen bir mesaj bulunmuyor.'
                        : adminMessageScope === 'sent'
                          ? 'Henüz gönderdiğiniz bir mesaj bulunmuyor.'
                          : 'Henüz kayıtlı bir okul mesajı bulunamadı.'}
                    </Text>
                  </View>
                ) : (
                  schoolMessages
                    .filter((m: any) => {
                      if (adminMessageScope !== 'all') return true;
                      if (selectedMessageFilter === 'students') {
                        const t = (m.targetRole || '').toUpperCase();
                        return t.includes('STUDENT') || t === 'GRADE' || t === 'SECTION' || t === 'MY_STUDENTS';
                      }
                      if (selectedMessageFilter === 'teachers') {
                        const t = (m.targetRole || '').toUpperCase();
                        return t.includes('TEACHER');
                      }
                      if (selectedMessageFilter === 'parents') {
                        const t = (m.targetRole || '').toUpperCase();
                        return t.includes('PARENT');
                      }
                      return true;
                    })
                    .filter((m: any) => {
                      if (!messageSearch.trim()) return true;
                      const q = messageSearch.toLowerCase();
                      return (
                        (m.content || '').toLowerCase().includes(q) ||
                        (m.senderName || '').toLowerCase().includes(q) ||
                        (m.receiverName || '').toLowerCase().includes(q) ||
                        (m.targetDescription || '').toLowerCase().includes(q)
                      );
                    })
                    .map((msg: any) => (
                      <View key={msg.id} style={styles.cardItem}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons
                              name={msg.senderRole === 'STAFF' ? 'shield-checkmark' : 'person-circle'}
                              size={18}
                              color={msg.senderRole === 'STAFF' ? '#7C3AED' : '#4F46E5'}
                            />
                            <Text style={{ fontWeight: '800', fontSize: 13, color: '#1E293B' }}>
                              {msg.senderName || 'İsimsiz'}
                            </Text>
                            <View style={[styles.roleBadge, { paddingVertical: 1, paddingHorizontal: 6, marginTop: 0 }]}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>
                                {msg.senderRole === 'STAFF' ? 'İdareci' : msg.senderRole === 'TEACHER' ? 'Öğretmen' : msg.senderRole}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                          </Text>
                        </View>

                        <View style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>
                            🎯 Alıcı / Hedef: <Text style={{ color: '#0F172A', fontWeight: '700' }}>{msg.targetDescription || msg.receiverName || msg.targetRole || 'Genel'}</Text>
                          </Text>
                        </View>

                        {/* Varsa yanıtlanan mesaj alıntısı */}
                        {msg.replyToContent && (
                          <View style={{ backgroundColor: '#EEF2FF', borderLeftWidth: 3, borderLeftColor: '#4F46E5', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="return-down-forward" size={12} color="#4F46E5" />
                              <Text style={{ fontSize: 11, color: '#4338CA', fontWeight: '800' }}>Yanıtlanan Mesaj:</Text>
                            </View>
                            <Text style={{ fontSize: 12, color: '#334155', fontStyle: 'italic', marginTop: 2 }} numberOfLines={2}>
                              "{msg.replyToContent}"
                            </Text>
                          </View>
                        )}

                        <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>
                          {msg.content}
                        </Text>

                        {/* Buton: Doğrudan Cevapla */}
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                          <TouchableOpacity
                            onPress={() => handleOpenAdminReply(msg)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              backgroundColor: '#EEF2FF',
                              borderWidth: 1.5,
                              borderColor: '#C7D2FE',
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 8,
                            }}
                          >
                            <Ionicons name="arrow-undo" size={14} color="#4F46E5" />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#4F46E5' }}>Yanıtla</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                )}

                {/* Admin Mesaj Yanıtlama Modalı */}
                <Modal visible={adminReplyModalVisible} animationType="fade" transparent onRequestClose={() => setAdminReplyModalVisible(false)}>
                  <View style={styles.promptOverlay}>
                    <View style={[styles.promptCard, { maxWidth: 520, width: '92%' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="arrow-undo" size={20} color="#4F46E5" />
                          </View>
                          <View>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>Mesajı Yanıtla</Text>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>
                              Alıcı: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{adminReplyingMessage?.senderName || 'İsimsiz'}</Text>
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => setAdminReplyModalVisible(false)}>
                          <Ionicons name="close-circle" size={24} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>

                      {/* Orijinal Mesaj Kutusu */}
                      <View style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 }}>Gelen Mesaj:</Text>
                        <Text style={{ fontSize: 13, color: '#334155', fontStyle: 'italic', lineHeight: 18 }}>
                          "{adminReplyingMessage?.content}"
                        </Text>
                      </View>

                      <Text style={[styles.inputLabel, { marginBottom: 6 }]}>İdare Yanıtı:</Text>
                      <TextInput
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1.5,
                          borderColor: '#CBD5E1',
                          borderRadius: 10,
                          padding: 12,
                          fontSize: 13,
                          color: '#0F172A',
                          minHeight: 110,
                          textAlignVertical: 'top',
                        }}
                        placeholder="Yanıtınızı buraya yazınız..."
                        placeholderTextColor="#94A3B8"
                        value={adminReplyContent}
                        onChangeText={setAdminReplyContent}
                        multiline
                      />

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                        <TouchableOpacity
                          style={[styles.cancelBtn, { paddingHorizontal: 16 }]}
                          onPress={() => setAdminReplyModalVisible(false)}
                        >
                          <Text style={styles.cancelBtnText}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.confirmBtn, { backgroundColor: '#4F46E5', paddingHorizontal: 20 }]}
                          onPress={handleSendAdminReply}
                          disabled={sendingAdminReply}
                        >
                          {sendingAdminReply ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="send" size={14} color="#fff" />
                              <Text style={styles.confirmBtnText}>Yanıtı Gönder</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>

                {/* Admin Yeni Mesaj / Duyuru Modalı */}
                <Modal visible={adminNewMsgModalVisible} animationType="fade" transparent onRequestClose={() => setAdminNewMsgModalVisible(false)}>
                  <View style={styles.promptOverlay}>
                    <View style={[styles.promptCard, { maxWidth: 520, width: '92%' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="paper-plane" size={20} color="#059669" />
                          </View>
                          <View>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>Yeni İdari Mesaj / Duyuru</Text>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>Öğretmenlere veya tüm okula mesaj gönderin</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => setAdminNewMsgModalVisible(false)}>
                          <Ionicons name="close-circle" size={24} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.inputLabel, { marginBottom: 6 }]}>Hedef Alıcı:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <TouchableOpacity
                          style={[styles.logFilterChip, adminNewMsgTargetType === 'TEACHER' && styles.logFilterChipActive]}
                          onPress={() => { setAdminNewMsgTargetType('TEACHER'); setAdminNewMsgTargetTeacher(null); }}
                        >
                          <Text style={[styles.logFilterChipText, adminNewMsgTargetType === 'TEACHER' && styles.logFilterChipTextActive]}>
                            Tüm Öğretmenler
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.logFilterChip, adminNewMsgTargetType === 'ALL' && styles.logFilterChipActive]}
                          onPress={() => { setAdminNewMsgTargetType('ALL'); setAdminNewMsgTargetTeacher(null); }}
                        >
                          <Text style={[styles.logFilterChipText, adminNewMsgTargetType === 'ALL' && styles.logFilterChipTextActive]}>
                            Tüm Okul (Duyuru)
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.logFilterChip, adminNewMsgTargetType === 'SPECIFIC_TEACHER' && styles.logFilterChipActive]}
                          onPress={() => setAdminNewMsgTargetType('SPECIFIC_TEACHER')}
                        >
                          <Text style={[styles.logFilterChipText, adminNewMsgTargetType === 'SPECIFIC_TEACHER' && styles.logFilterChipTextActive]}>
                            Belirli Bir Öğretmen
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {adminNewMsgTargetType === 'SPECIFIC_TEACHER' && (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={[styles.inputLabel, { marginBottom: 4 }]}>Öğretmen Seçin:</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                            {teachers.map((t: any) => {
                              const isSel = adminNewMsgTargetTeacher?.id === t.id;
                              return (
                                <TouchableOpacity
                                  key={t.id}
                                  onPress={() => setAdminNewMsgTargetTeacher(t)}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 8,
                                    backgroundColor: isSel ? '#4F46E5' : '#F1F5F9',
                                    borderWidth: 1,
                                    borderColor: isSel ? '#4F46E5' : '#CBD5E1',
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? '#fff' : '#334155' }}>
                                    {t.fullName}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}

                      <Text style={[styles.inputLabel, { marginBottom: 6 }]}>Mesaj Metni:</Text>
                      <TextInput
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1.5,
                          borderColor: '#CBD5E1',
                          borderRadius: 10,
                          padding: 12,
                          fontSize: 13,
                          color: '#0F172A',
                          minHeight: 110,
                          textAlignVertical: 'top',
                        }}
                        placeholder="İletmek istediğiniz duyuru veya mesajı yazınız..."
                        placeholderTextColor="#94A3B8"
                        value={adminNewMsgContent}
                        onChangeText={setAdminNewMsgContent}
                        multiline
                      />

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                        <TouchableOpacity
                          style={[styles.cancelBtn, { paddingHorizontal: 16 }]}
                          onPress={() => setAdminNewMsgModalVisible(false)}
                        >
                          <Text style={styles.cancelBtnText}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.confirmBtn, { backgroundColor: '#059669', paddingHorizontal: 20 }]}
                          onPress={handleSendAdminNewMessage}
                          disabled={sendingAdminNewMsg}
                        >
                          {sendingAdminNewMsg ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="send" size={14} color="#fff" />
                              <Text style={styles.confirmBtnText}>Mesajı Gönder</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>
              </View>
  );
}
