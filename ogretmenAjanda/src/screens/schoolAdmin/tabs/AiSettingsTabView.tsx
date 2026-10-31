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
import {
  DEFAULT_GEMINI_API_KEY,
  DEFAULT_GEMINI_MODEL,
  PRESET_GEMINI_MODELS,
  fetchAvailableGeminiModels,
  testGeminiApiKey,
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
  getGeminiUsageStats,
  resetGeminiUsageStats,
  GeminiUsageStats,
} from '../../../utils/geminiScheduleService';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function AiSettingsTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    isStaff,
    selectedSchool,
    geminiApiKeyInput,
    setGeminiApiKeyInput,
    showKeyPassword,
    setShowKeyPassword,
    handleUseDefaultApiKey,
    handleTestApiKey,
    testingGeminiKey,
    selectedGeminiModel,
    handleFetchLiveModels,
    fetchingLiveModels,
    setModelDropdownModalVisible,
    handleRefreshUsageStats,
    usageStats,
    handleResetUsageStats,
    handleSaveAiSettingsToServer,
    savingAiSettings
  } = ctx;

  return (
    <View>
                {/* Bilgilendirme Banner */}
                <View style={[styles.aiConfigBanner, isStaff && { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                  <View style={[styles.aiConfigBannerIcon, isStaff && { backgroundColor: '#EDE9FE' }]}>
                    <Ionicons name={isStaff ? 'shield-checkmark' : 'hardware-chip'} size={24} color={isStaff ? '#7C3AED' : '#4F46E5'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aiConfigBannerTitle, isStaff && { color: '#6D28D9' }]}>
                      {isStaff ? '🛡️ Kurumsal AI Yapılandırması (Salt Okunur)' : `${selectedSchool?.name || 'Okul'} Kurumsal AI Yapılandırması`}
                    </Text>
                    <Text style={[styles.aiConfigBannerSub, isStaff && { color: '#5B21B6' }]}>
                      {isStaff
                        ? 'İdareci rolündesiniz. Google Gemini API anahtarı ve model seçimi okul ana yöneticisi (Admin) tarafından yönetilir. Sunucuya anahtar güncellemesi gönderilemez. Okulun ortak lisansı ve kullanım kotası üzerinden işlemler otomatik yürütülür.'
                        : 'Burada belirlenen API anahtarı ve seçilen model sunucu veritabanına yazılır. Bu okula bağlı tüm öğretmenler AI işlemlerini (ders programı OCR, yıllık plan ve öğrenci listeleri) bu kurumsal anahtar ile otomatik yürütür.'}
                    </Text>
                  </View>
                </View>

                {/* API Key Yönetim Kartı */}
                <View style={styles.aiConfigCard}>
                  <View style={styles.aiConfigCardHeader}>
                    <Ionicons name="key" size={18} color="#4F46E5" />
                    <Text style={styles.aiConfigCardTitle}>Google Gemini API Anahtarı</Text>
                  </View>

                  <View style={styles.aiInputWrap}>
                    <TextInput
                      style={styles.aiApiKeyInput}
                      placeholder="AIzaSy... veya AQ... anahtarınızı girin"
                      value={geminiApiKeyInput}
                      onChangeText={setGeminiApiKeyInput}
                      secureTextEntry={!showKeyPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor="#94A3B8"
                    />
                    <TouchableOpacity
                      onPress={() => setShowKeyPassword(!showKeyPassword)}
                      style={styles.aiEyeBtn}
                    >
                      <Ionicons
                        name={showKeyPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color="#64748B"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Hızlı Butonlar */}
                  <View style={styles.aiQuickBtnsRow}>
                    <TouchableOpacity
                      style={styles.aiQuickBtn}
                      onPress={handleUseDefaultApiKey}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={14} color="#4F46E5" />
                      <Text style={styles.aiQuickBtnText}>Varsayılan Kodu Yaz</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.aiQuickBtn}
                      onPress={async () => {
                        const text = await Clipboard.getStringAsync();
                        if (text) {
                          setGeminiApiKeyInput(text.trim());
                          Alert.alert('Yapıştırıldı 📋', 'Panodaki kod yerleştirildi.');
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="clipboard-outline" size={14} color="#64748B" />
                      <Text style={[styles.aiQuickBtnText, { color: '#64748B' }]}>Yapıştır</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.aiQuickBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                      onPress={handleTestApiKey}
                      disabled={testingGeminiKey}
                      activeOpacity={0.8}
                    >
                      {testingGeminiKey ? (
                        <ActivityIndicator size="small" color="#16A34A" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
                          <Text style={[styles.aiQuickBtnText, { color: '#16A34A' }]}>Test Et</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {geminiApiKeyInput.length > 0 && (
                      <TouchableOpacity
                        style={[styles.aiQuickBtn, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}
                        onPress={() => setGeminiApiKeyInput('')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                        <Text style={[styles.aiQuickBtnText, { color: '#DC2626' }]}>Temizle</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Model Seçimi Kartı */}
                <View style={styles.aiConfigCard}>
                  <View style={styles.aiConfigCardHeader}>
                    <Ionicons name="cube-outline" size={18} color="#4F46E5" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.aiConfigCardTitle}>Aktif Yapay Zeka Modeli</Text>
                      <Text style={styles.aiConfigCardSub}>
                        Seçili Model: <Text style={{ fontWeight: '800', color: '#4F46E5' }}>{selectedGeminiModel}</Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.fetchLiveModelsBtn}
                      onPress={handleFetchLiveModels}
                      disabled={fetchingLiveModels}
                      activeOpacity={0.8}
                    >
                      {fetchingLiveModels ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="cloud-download-outline" size={13} color="#fff" />
                          <Text style={styles.fetchLiveModelsBtnText}>Canlı Modeller</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Kompakt Model Seçim Dropdown Tetikleyicisi */}
                  {(() => {
                    const preset = PRESET_GEMINI_MODELS.find((p: any) => p.id === selectedGeminiModel);
                    const modelDisplayName = preset ? preset.name : selectedGeminiModel;
                    const isRecommended = preset?.isRecommended;

                    return (
                      <TouchableOpacity
                        style={styles.modelDropdownTrigger}
                        onPress={() => setModelDropdownModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.modelDropdownTriggerLeft}>
                          <View style={styles.modelDropdownIconBox}>
                            <Ionicons name="hardware-chip" size={22} color="#4F46E5" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.modelDropdownTriggerTitle} numberOfLines={1}>
                                {modelDisplayName}
                              </Text>
                              {isRecommended && (
                                <View style={styles.recommendedBadge}>
                                  <Text style={styles.recommendedBadgeText}>ÖNERİLEN</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.modelDropdownTriggerId} numberOfLines={1}>
                              ID: {selectedGeminiModel}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.modelDropdownTriggerRight}>
                          <Text style={styles.modelDropdownChangeText}>Model Seç</Text>
                          <Ionicons name="chevron-down" size={16} color="#4F46E5" />
                        </View>
                      </TouchableOpacity>
                    );
                  })()}
                </View>

                {/* Kota ve Kullanım Göstergesi (Real-time Gauge) */}
                <View style={styles.aiConfigCard}>
                  <View style={styles.aiConfigCardHeader}>
                    <Ionicons name="speedometer-outline" size={18} color="#4F46E5" />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.aiConfigCardTitle}>Okul Ortak TOTAL Kota & Kullanım</Text>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>TÜM OKUL HAVUZU</Text>
                        </View>
                      </View>
                      <Text style={styles.aiConfigCardSub}>
                        {selectedSchool?.name || 'Okul'} geneli (Tüm öğretmenler ve yönetici havuzu)
                      </Text>
                    </View>
                    <TouchableOpacity onPress={handleRefreshUsageStats} style={styles.refreshIconBtn}>
                      <Ionicons name="refresh" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>

                  {/* Kalan Kota Gösterge Çubuğu */}
                  <View style={styles.quotaGaugeBox}>
                    <View style={styles.quotaGaugeTop}>
                      <Text style={styles.quotaGaugeLabel}>Kalan Günlük Havuz Kotası:</Text>
                      <Text style={styles.quotaGaugeVal}>
                        %{usageStats ? usageStats.remainingPercent : 100} Kalan
                      </Text>
                    </View>
                    <View style={styles.gaugeProgressBarTrack}>
                      <View
                        style={[
                          styles.gaugeProgressBarFill,
                          {
                            width: `${Math.max(5, usageStats ? usageStats.remainingPercent : 100)}%`,
                            backgroundColor:
                              (usageStats?.remainingPercent || 100) > 40
                                ? '#10B981'
                                : (usageStats?.remainingPercent || 100) > 15
                                  ? '#F59E0B'
                                  : '#EF4444',
                          },
                        ]}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <Text style={styles.gaugePercentText}>
                        %{usageStats ? usageStats.remainingPercent : 100} Kota Mevcut (En Kritik Limit)
                      </Text>
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                        Token: %{usageStats?.tokenPercent ?? 100} • İstek: %{usageStats ? Math.round(((usageStats.dailyRequestLimit - usageStats.requestsToday) / usageStats.dailyRequestLimit) * 100) : 100}
                      </Text>
                    </View>
                  </View>

                  {/* Kullanım Grid */}
                  <View style={styles.quotaMiniGrid}>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>
                        {usageStats ? usageStats.requestsToday : 0} / {usageStats ? usageStats.dailyRequestLimit : 1500}
                      </Text>
                      <Text style={styles.quotaMiniBoxLabel}>Günlük İstek</Text>
                    </View>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>
                        {(usageStats?.tokensToday || 0).toLocaleString('tr-TR')} / {((usageStats?.dailyTokenLimit || 1000000) / 1000).toLocaleString('tr-TR')}k
                      </Text>
                      <Text style={styles.quotaMiniBoxLabel}>Harcanan Token</Text>
                    </View>
                    <View style={styles.quotaMiniBox}>
                      <Text style={styles.quotaMiniBoxVal}>
                        {usageStats?.lastTokensUsed ? `${usageStats.lastTokensUsed.toLocaleString('tr-TR')} tok` : '-'}
                      </Text>
                      <Text style={styles.quotaMiniBoxLabel}>Son İşlem ({usageStats?.lastRequestTime || '-'})</Text>
                    </View>
                  </View>

                  {/* Google AI Studio Plan Bilgisi & Sayacı Sıfırla */}
                  <View style={styles.quotaFooterRow}>
                    <TouchableOpacity
                      style={styles.openAiStudioPlanBtn}
                      onPress={() => Linking.openURL('https://aistudio.google.com/app/plan_information')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="open-outline" size={13} color="#0369A1" />
                      <Text style={styles.openAiStudioPlanText}>Google AI Studio Kotasını Aç</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.resetUsageBtn}
                      onPress={handleResetUsageStats}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={13} color="#DC2626" />
                      <Text style={styles.resetUsageText}>Sayacı Sıfırla</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sunucu DB Kaydet Butonu (İdarecide Salt Okunur) */}
                {isStaff ? (
                  <View style={[styles.aiConfigBanner, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE', marginTop: 14 }]}>
                    <Ionicons name="information-circle" size={22} color="#7C3AED" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.aiConfigBannerTitle, { color: '#6D28D9' }]}>İdareci Yetki Bildirimi</Text>
                      <Text style={[styles.aiConfigBannerSub, { color: '#5B21B6' }]}>
                        Kurumsal Gemini API anahtarı ve model seçimi okul yöneticisi (Admin) tarafından yönetilir. Sunucuya anahtar değişikliği gönderme yetkiniz bulunmamaktadır.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.saveAiSettingsBtn}
                    onPress={handleSaveAiSettingsToServer}
                    disabled={savingAiSettings}
                    activeOpacity={0.85}
                  >
                    {savingAiSettings ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={18} color="#fff" />
                        <Text style={styles.saveAiSettingsBtnText}>
                          💾 Sunucu Veritabanına Kaydet & Tüm Öğretmenlere Dağıt
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
  );
}
