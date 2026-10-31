import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest, getBaseApiUrl, getAuthToken } from '../services/apiClient';
import { showAlert, showConfirm } from '../utils/webAlertPolyfill';

interface BackupFileInfo {
  fileName: string;
  sizeBytes: number;
  sizeMb: number;
  createdAtUtc: string;
  scope: 'full' | 'school';
  triggerType: 'manual' | 'auto' | 'safety' | string;
  reason?: string;
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  integrityCheck: string;
  recordCounts?: Record<string, number>;
}

interface BackupSettings {
  autoBackupEnabled: boolean;
  autoBackupHourTr: number;
  retentionDays: number;
  maxQuotaMb: number;
  lastAutoBackupUtc?: string;
}

interface SchoolBackupSummary {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  lastBackupAtUtc?: string;
  lastBackupFileName?: string;
  isStale: boolean;
}

interface BackupModuleViewProps {
  schoolId?: string;
  schoolName?: string;
  isSuperAdmin?: boolean;
}

export const BackupModuleView: React.FC<BackupModuleViewProps> = ({
  schoolId,
  schoolName,
  isSuperAdmin = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [usedMb, setUsedMb] = useState(0);
  const [maxQuotaMb, setMaxQuotaMb] = useState(500);
  const [hoursSinceLast, setHoursSinceLast] = useState<number | null>(null);
  const [isStaleWarning, setIsStaleWarning] = useState(false);
  const [schoolSummaries, setSchoolSummaries] = useState<SchoolBackupSummary[]>([]);

  const [settings, setSettings] = useState<BackupSettings>({
    autoBackupEnabled: true,
    autoBackupHourTr: 3,
    retentionDays: 30,
    maxQuotaMb: 500,
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Geri Yükleme Sihirbazı (Çift Onaylı)
  const [restoreTarget, setRestoreTarget] = useState<BackupFileInfo | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreAdminPassword, setRestoreAdminPassword] = useState('');
  const [validatingInfo, setValidatingInfo] = useState<any>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const query = schoolId ? `?schoolId=${schoolId}` : '';
      const res = await apiRequest<any>(`Backup/list${query}`, 'GET');
      if (res.success && res.data) {
        setBackups(res.data.backups || []);
        setUsedMb(res.data.usedMb || 0);
        setMaxQuotaMb(res.data.maxQuotaMb || 500);
        setHoursSinceLast(res.data.hoursSinceLastBackup ?? null);
        setIsStaleWarning(!!res.data.isStaleWarning);
        if (res.data.settings) {
          setSettings(res.data.settings);
        }
        if (res.data.schoolSummaries) {
          setSchoolSummaries(res.data.schoolSummaries);
        }
      }
    } catch (e: any) {
      console.error('Yedek listesi yükleme hatası:', e);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async (scope: 'full' | 'school') => {
    if (scope === 'school' && !schoolId) {
      showAlert('Uyarı', 'Okul bazlı yedek almak için lütfen aktif bir okul seçiniz.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Backup/create', 'POST', {
        scope,
        schoolId: scope === 'school' ? schoolId : undefined,
        reason: scope === 'full' ? 'Süper Admin manuel tam sistem yedeği' : `${schoolName || 'Okul'} manuel veri yedeği`,
      });

      if (res.success) {
        showAlert('Başarılı ✅', res.data?.message || 'Yedek başarıyla oluşturuldu.');
        await loadBackups();
      } else {
        showAlert('Hata', res.error || 'Yedek oluşturulamadı.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadBackup = async (item: BackupFileInfo) => {
    try {
      const baseUrl = await getBaseApiUrl();
      const token = await getAuthToken();
      const query = schoolId ? `?schoolId=${schoolId}` : '';
      const downloadUrl = `${baseUrl.replace(/\/+$/, '')}/Backup/download/${encodeURIComponent(item.fileName)}${query}`;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const resp = await fetch(downloadUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) {
          showAlert('İndirme Hatası', 'Yedek dosyası indirilemedi.');
          return;
        }
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = item.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        showAlert('Bilgi', `Yedek dosyası sunucuda hazır: ${item.fileName}. Web panelinden doğrudan bilgisayarınıza indirebilirsiniz.`);
      }
    } catch (err: any) {
      showAlert('Hata', err?.message || 'İndirme sırasında hata oluştu.');
    }
  };

  const handleUploadBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith('.zip')) {
        showAlert('Geçersiz Dosya', 'Lütfen yalnızca .zip uzantılı bir yedek paketi seçin.');
        return;
      }

      setActionLoading(true);
      const formData = new FormData();
      if (Platform.OS === 'web' && (asset as any).file) {
        formData.append('file', (asset as any).file, asset.name);
      } else {
        formData.append('file', {
          uri: asset.uri,
          name: asset.name,
          type: 'application/zip',
        } as any);
      }

      const query = schoolId ? `?schoolId=${schoolId}` : '';
      const res = await apiRequest<any>(`Backup/upload${query}`, 'POST', formData, true);
      if (res.success) {
        showAlert('Yedek Yüklendi ve Doğrulandı ✅', res.data?.message || 'Yedek paketi başarıyla sisteme eklendi.');
        await loadBackups();
      } else {
        showAlert('Doğrulama Hatası', res.error || 'Yedek dosyası doğrulanamadı.');
      }
    } catch (e: any) {
      showAlert('Hata', e?.message || 'Dosya yüklenirken hata oluştu.');
    } finally {
      setActionLoading(false);
    }
  };

  const openRestoreWizard = async (item: BackupFileInfo) => {
    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Backup/validate', 'POST', {
        fileName: item.fileName,
        schoolId,
      });

      if (!res.success || !res.data?.isValid) {
        showAlert('Yedek Doğrulama Hatası', res.data?.message || res.error || 'Bu yedek geri yüklemeye uygun değil.');
        return;
      }

      setValidatingInfo(res.data);
      setRestoreTarget(item);
      setRestoreConfirmText('');
      setRestoreAdminPassword('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    if (restoreConfirmText.trim().toUpperCase() !== 'GERI YUKLE' && restoreConfirmText.trim().toUpperCase() !== 'GERİ YÜKLE') {
      showAlert('Onay Gerekli', "Lütfen onay kutusuna tam olarak 'GERI YUKLE' yazınız.");
      return;
    }
    if (!restoreAdminPassword.trim()) {
      showAlert('Şifre Gerekli', 'Lütfen yönetici şifrenizi giriniz.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Backup/restore', 'POST', {
        fileName: restoreTarget.fileName,
        schoolId: restoreTarget.scope === 'school' ? (restoreTarget.schoolId || schoolId) : undefined,
        adminPassword: restoreAdminPassword,
        confirmationText: restoreConfirmText.trim(),
      });

      if (res.success && res.data?.success) {
        setRestoreTarget(null);
        showAlert('Geri Yükleme Tamamlandı ♻️', res.data.message || 'Veritabanı başarıyla geri yüklendi.');
        await loadBackups();
      } else {
        showAlert('Geri Yükleme Başarısız', res.error || res.data?.message || 'Geri yükleme yapılamadı.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBackup = (item: BackupFileInfo) => {
    showConfirm(
      'Yedeği Sil',
      `'${item.fileName}' yedek dosyasını kalıcı olarak silmek istediğinize emin misiniz?`,
      async () => {
        setActionLoading(true);
        try {
          const query = schoolId ? `?schoolId=${schoolId}` : '';
          const res = await apiRequest<any>(`Backup/${encodeURIComponent(item.fileName)}${query}`, 'DELETE');
          if (res.success) {
            await loadBackups();
          } else {
            showAlert('Hata', res.error || 'Yedek silinemedi.');
          }
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleSaveSettings = async () => {
    setActionLoading(true);
    try {
      const res = await apiRequest<any>('Backup/settings', 'PUT', settings);
      if (res.success) {
        setShowSettingsModal(false);
        showAlert('Kaydedildi ✅', 'Otomatik yedekleme ayarları güncellendi.');
        await loadBackups();
      } else {
        showAlert('Hata', res.error || 'Ayarlar kaydedilemedi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const formatTrDate = (utcStr?: string) => {
    if (!utcStr) return '-';
    try {
      const d = new Date(utcStr);
      return d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return utcStr;
    }
  };

  const renderTriggerBadge = (trigger: string) => {
    const t = (trigger || 'manual').toLowerCase();
    if (t === 'auto') {
      return (
        <View style={[styles.badge, { backgroundColor: '#DBEAFE' }]}>
          <Text style={[styles.badgeText, { color: '#1D4ED8' }]}>⏰ Otomatik</Text>
        </View>
      );
    }
    if (t === 'safety') {
      return (
        <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
          <Text style={[styles.badgeText, { color: '#B45309' }]}>🛡️ Güvenlik Yedeği</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, { backgroundColor: '#DCFCE7' }]}>
        <Text style={[styles.badgeText, { color: '#15803D' }]}>👤 Manuel</Text>
      </View>
    );
  };

  const quotaPct = Math.min(100, Math.round((usedMb / Math.max(1, maxQuotaMb)) * 100));

  return (
    <View style={styles.container}>
      {/* 48 Saat Uyarı Bandı */}
      {isStaleWarning && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.warningBannerTitle}>Yedekleme Uyarısı: Son yedek 48 saatten eski!</Text>
            <Text style={styles.warningBannerSub}>
              Veri güvenliğiniz için lütfen hemen aşağıdaki "Şimdi Yedekle" butonuyla güncel bir yedek alınız.
            </Text>
          </View>
        </View>
      )}

      {/* Üst Durum ve Özet Kartı */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>💾 Veritabanı Yedekleme & Felaket Kurtarma Merkezi</Text>
            <Text style={styles.statusSub}>
              {hoursSinceLast !== null
                ? `Son başarılı yedek: ${hoursSinceLast < 1 ? 'Az önce' : `${hoursSinceLast} saat önce`} ✅`
                : 'Henüz kayıtlı yedek bulunmuyor'}
              {' · '}Toplam Yedek: {backups.length} adet
            </Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettingsModal(true)}>
            <Text style={styles.settingsBtnText}>⚙️ Otomatik Yedek Ayarları</Text>
          </TouchableOpacity>
        </View>

        {/* Kota Çubuğu */}
        <View style={styles.quotaBox}>
          <View style={styles.quotaLabelRow}>
            <Text style={styles.quotaLabel}>Kullanılan Yedekleme Alanı</Text>
            <Text style={styles.quotaValue}>
              {usedMb} MB / {maxQuotaMb} MB ({quotaPct}%)
            </Text>
          </View>
          <View style={styles.quotaTrack}>
            <View
              style={[
                styles.quotaFill,
                {
                  width: `${quotaPct}%`,
                  backgroundColor: quotaPct > 85 ? '#EF4444' : quotaPct > 65 ? '#F59E0B' : '#10B981',
                },
              ]}
            />
          </View>
        </View>

        {/* Şimdi Yedekle & Yedek Yükle Butonları */}
        <View style={styles.actionRow}>
          {schoolId ? (
            <TouchableOpacity
              style={[styles.primaryActionBtn, actionLoading && { opacity: 0.6 }]}
              disabled={actionLoading}
              onPress={() => handleCreateBackup('school')}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.primaryActionBtnText}>🏫 Şimdi Okul Yedeği Al (.ZIP)</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {isSuperAdmin && (
            <TouchableOpacity
              style={[styles.superActionBtn, actionLoading && { opacity: 0.6 }]}
              disabled={actionLoading}
              onPress={() => handleCreateBackup('full')}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.primaryActionBtnText}>🌐 Tam Sistem Yedeği Al (SQLite DB)</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryActionBtn, actionLoading && { opacity: 0.6 }]}
            disabled={actionLoading}
            onPress={handleUploadBackup}
          >
            <Text style={styles.secondaryActionBtnText}>📤 Yedek Dosyası Yükle (.ZIP)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshBtn} onPress={loadBackups} disabled={loading}>
            <Text style={styles.refreshBtnText}>🔄 Yenile</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Süper Admin Okul Bazlı Yedek Özeti */}
      {isSuperAdmin && schoolSummaries.length > 0 && (
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>🏢 Okulların Son Yedek Durumu</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {schoolSummaries.map((s) => (
              <View
                key={s.schoolId}
                style={[
                  styles.schoolSumCard,
                  { borderColor: s.isStale ? '#FCA5A5' : '#86EFAC', backgroundColor: s.isStale ? '#FEF2F2' : '#F0FDF4' },
                ]}
              >
                <Text style={styles.schoolSumName}>{s.schoolName}</Text>
                <Text style={styles.schoolSumCode}>{s.schoolCode}</Text>
                <Text style={[styles.schoolSumTime, { color: s.isStale ? '#DC2626' : '#15803D' }]}>
                  {s.lastBackupAtUtc ? `Son: ${formatTrDate(s.lastBackupAtUtc)}` : '⚠️ Yedek Yok'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Yedek Listesi */}
      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>📦 Mevcut Yedek Paketleri ({backups.length})</Text>
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={{ marginTop: 8, color: '#64748B' }}>Yedekler kontrol ediliyor...</Text>
          </View>
        ) : backups.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Henüz yedek dosyası bulunmuyor</Text>
            <Text style={styles.emptySub}>
              "Şimdi Yedekle" butonuna tıklayarak saniyeler içinde SHA-256 doğrulamalı ilk yedeğinizi oluşturabilirsiniz.
            </Text>
          </View>
        ) : (
          backups.map((item) => {
            const counts = item.recordCounts || {};
            const countSummaryParts: string[] = [];
            if (counts.students !== undefined) countSummaryParts.push(`${counts.students} öğrenci`);
            if (counts.teachers !== undefined) countSummaryParts.push(`${counts.teachers} öğretmen`);
            if (counts.users !== undefined && counts.teachers === undefined) countSummaryParts.push(`${counts.users} kullanıcı`);
            if (counts.schedules !== undefined) countSummaryParts.push(`${counts.schedules} ders saati`);
            if (counts.optikExams !== undefined && counts.optikExams > 0) countSummaryParts.push(`${counts.optikExams} optik sınav`);

            return (
              <View key={item.fileName} style={styles.backupItemCard}>
                <View style={styles.backupTopRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: item.scope === 'full' ? '#EDE9FE' : '#E0F2FE' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: item.scope === 'full' ? '#6D28D9' : '#0369A1' },
                          ]}
                        >
                          {item.scope === 'full' ? '🌐 Tam Sistem DB' : `🏫 ${item.schoolName || item.schoolCode || 'Okul Yedeği'}`}
                        </Text>
                      </View>
                      {renderTriggerBadge(item.triggerType)}
                      <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
                        <Text style={[styles.badgeText, { color: '#334155' }]}>{item.sizeMb} MB</Text>
                      </View>
                    </View>

                    <Text style={styles.backupFileName}>{item.fileName}</Text>
                    <Text style={styles.backupMetaText}>
                      📅 {formatTrDate(item.createdAtUtc)}
                      {countSummaryParts.length > 0 ? `  ·  📊 ${countSummaryParts.join(' · ')}` : ''}
                    </Text>
                    {item.reason ? <Text style={styles.backupReasonText}>📝 {item.reason}</Text> : null}
                  </View>

                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      style={[styles.itemBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                      onPress={() => handleDownloadBackup(item)}
                    >
                      <Text style={[styles.itemBtnText, { color: '#1D4ED8' }]}>📥 İndir</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.itemBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                      onPress={() => openRestoreWizard(item)}
                    >
                      <Text style={[styles.itemBtnText, { color: '#B45309' }]}>♻️ Geri Yükle</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.itemBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                      onPress={() => handleDeleteBackup(item)}
                    >
                      <Text style={[styles.itemBtnText, { color: '#DC2626' }]}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Çift Onaylı Geri Yükleme Sihirbazı Modalı */}
      <Modal visible={!!restoreTarget} transparent animationType="fade" onRequestClose={() => setRestoreTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalDangerTitle}>⚠️ Veritabanı Geri Yükleme Onayı (Çift Kilit)</Text>
            {restoreTarget && (
              <>
                <View style={styles.previewBox}>
                  <Text style={styles.previewLine}>
                    <Text style={{ fontWeight: '700' }}>Seçilen Yedek: </Text>
                    {restoreTarget.fileName}
                  </Text>
                  <Text style={styles.previewLine}>
                    <Text style={{ fontWeight: '700' }}>Yedek Tarihi: </Text>
                    {formatTrDate(restoreTarget.createdAtUtc)}
                  </Text>
                  <Text style={styles.previewLine}>
                    <Text style={{ fontWeight: '700' }}>Kapsam: </Text>
                    {restoreTarget.scope === 'full'
                      ? 'Tam Sistem Veritabanı (Tüm Kurumlar ve Okullar)'
                      : `Okul Bazlı Yedek (${restoreTarget.schoolName || restoreTarget.schoolCode})`}
                  </Text>
                  <Text style={styles.previewLine}>
                    <Text style={{ fontWeight: '700' }}>Bütünlük & SHA-256: </Text>✅ Doğrulandı ({validatingInfo?.manifest?.integrityCheck || 'ok'})
                  </Text>
                </View>

                <View style={styles.dangerNotice}>
                  <Text style={styles.dangerNoticeText}>
                    ⚠️ DİKKAT: Bu işlem öncesinde sistem otomatik bir güvenlik yedeği alacaktır. Ancak seçilen yedek tarihinden sonra girilen veriler yedekteki durumuna dönecektir.
                  </Text>
                </View>

                <Text style={styles.inputLabel}>1. Onay için aşağıdaki kutuya büyük harflerle GERI YUKLE yazınız:</Text>
                <TextInput
                  style={styles.textInput}
                  value={restoreConfirmText}
                  onChangeText={setRestoreConfirmText}
                  placeholder="GERI YUKLE"
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>2. Yönetici Şifrenizi Giriniz:</Text>
                <TextInput
                  style={styles.textInput}
                  value={restoreAdminPassword}
                  onChangeText={setRestoreAdminPassword}
                  placeholder="Yönetici şifreniz"
                  secureTextEntry
                />

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setRestoreTarget(null)}
                    disabled={actionLoading}
                  >
                    <Text style={styles.modalCancelBtnText}>Vazgeç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalDangerBtn, actionLoading && { opacity: 0.6 }]}
                    onPress={handleConfirmRestore}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalDangerBtnText}>♻️ Onayla ve Geri Yükle</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Otomatik Yedekleme Ayarları Modalı */}
      <Modal visible={showSettingsModal} transparent animationType="fade" onRequestClose={() => setShowSettingsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚙️ Otomatik Yedekleme ve Saklama Politikası</Text>

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>Günlük Otomatik Yedekleme Aktif</Text>
              <Switch
                value={settings.autoBackupEnabled}
                onValueChange={(v) => setSettings((p) => ({ ...p, autoBackupEnabled: v }))}
              />
            </View>

            <Text style={styles.inputLabel}>Otomatik Yedek Saati (TR Saati, 0-23):</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={String(settings.autoBackupHourTr)}
              onChangeText={(t) => setSettings((p) => ({ ...p, autoBackupHourTr: parseInt(t || '3', 10) || 3 }))}
            />

            <Text style={styles.inputLabel}>Yedek Saklama Süresi (Gün):</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={String(settings.retentionDays)}
              onChangeText={(t) => setSettings((p) => ({ ...p, retentionDays: parseInt(t || '30', 10) || 30 }))}
            />

            <Text style={styles.inputLabel}>Maksimum Yedek Alanı Kotası (MB):</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={String(settings.maxQuotaMb)}
              onChangeText={(t) => setSettings((p) => ({ ...p, maxQuotaMb: parseInt(t || '500', 10) || 500 }))}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowSettingsModal(false)}>
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleSaveSettings} disabled={actionLoading}>
                <Text style={styles.modalDangerBtnText}>💾 Ayarları Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  warningBannerIcon: {
    fontSize: 22,
  },
  warningBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  warningBannerSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusSub: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  settingsBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  settingsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  quotaBox: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  quotaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quotaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  quotaTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  quotaFill: {
    height: '100%',
    borderRadius: 4,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  primaryActionBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  superActionBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryActionBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    color: '#15803D',
    fontWeight: '700',
    fontSize: 13,
  },
  refreshBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  summarySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  schoolSumCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
    minWidth: 170,
  },
  schoolSumName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  schoolSumCode: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  schoolSumTime: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  listSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  backupItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  backupTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  backupFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 6,
  },
  backupMetaText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  backupReasonText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontStyle: 'italic',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  itemBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 480,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  modalDangerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 12,
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  previewLine: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 4,
  },
  dangerNotice: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  dangerNoticeText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalDangerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  modalPrimaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  modalDangerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

