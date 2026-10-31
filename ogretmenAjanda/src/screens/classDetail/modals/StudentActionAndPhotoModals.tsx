import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../../../theme/colors';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import {
  pickSinglePhotoFromSource,
  savePhotoPermanently,
  pickBulkPhotosFromDevice,
  matchPhotosWithStudents,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTO_SIZE_LABEL,
  BulkPhotoMatchResult,
} from '../../../utils/photoService';
import { ClassDetailCtx, styles } from '../classDetailStyles';

export function StudentActionAndPhotoModals({ ctx }: { ctx: ClassDetailCtx }) {
  const {
    actionMenuVisible,
    setActionMenuVisible,
    className,
    students,
    handleSyncStudentsFromServer,
    isSchoolTeacher,
    handleOpenAdd,
    handleExcelImport,
    handleDownloadTemplate,
    handleStartPdfPhoto,
    handleStartBulkPhoto,
    handleClearClassPhotos,
    handleClearAllPhotos,
    toggleSelectionMode,
    handleDeleteAllClassStudents,
    handleDeleteAllSystemStudents,
    handleDeleteEntireClass,
    modalVisible,
    editingStudent,
    setModalVisible,
    studentNoInput,
    setStudentNoInput,
    firstNameInput,
    setFirstNameInput,
    lastNameInput,
    setLastNameInput,
    studentPhoneInput,
    setStudentPhoneInput,
    parentNameInput,
    setParentNameInput,
    parentPhoneInput,
    setParentPhoneInput,
    notesInput,
    setNotesInput,
    handleSaveStudent,
    photoModalVisible,
    photoTargetStudent,
    handlePickSinglePhoto,
    handlePickSinglePhotoFromPdf,
    handleRemovePhoto,
    setPhotoModalVisible,
    bulkPhotoModalVisible,
    setBulkPhotoModalVisible,
    bulkPhotoResult,
    bulkPhotoSaving,
    handleConfirmBulkPhotos,
    transferModalVisible,
    selectedStudentIds,
    setTransferModalVisible,
    availableClasses,
    selectedTargetClassId,
    setSelectedTargetClassId,
    handleConfirmTransfer,
    pdfPhotoModalVisible,
    setPdfPhotoModalVisible,
    insets,
    pdfExtractItems,
    handleUpdatePdfMatchStudent,
    setStudentSelectTargetPhotoIndex,
    setStudentSelectSearchQuery,
    setStudentSelectModalVisible,
    savingPdfPhotos,
    handleConfirmSavePdfPhotos,
    studentSelectModalVisible,
    studentSelectTargetPhotoIndex,
    studentSelectSearchQuery,
    singlePdfGridModalVisible,
    setSinglePdfGridModalVisible,
    singlePdfGridPhotos,
    handleSelectPhotoFromPdfForStudent
  } = ctx;

  return (
    <>
      <Modal
        visible={actionMenuVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.actionModalOverlay}
          activeOpacity={1}
          onPress={() => setActionMenuVisible(false)}
        >
          <View style={styles.actionModalSheet} onStartShouldSetResponder={() => true}>
            {/* Sheet Handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet Header */}
            <View style={styles.actionSheetHeader}>
              <View>
                <Text style={styles.actionSheetTitle}>Şube & Öğrenci İşlemleri</Text>
                <Text style={styles.actionSheetSub}>
                  {className} • {students.length} Kayıtlı Öğrenci
                </Text>
              </View>
              <TouchableOpacity
                style={styles.actionSheetCloseBtn}
                onPress={() => setActionMenuVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Action Items */}
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={true}>
              <View style={styles.actionSheetContent}>
              {/* 0. Sistemden Öğrencileri Çek (Sunucu Senk) */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleSyncStudentsFromServer(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="cloud-download" size={22} color="#4F46E5" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.actionSheetItemTitle, { color: '#4F46E5' }]}>Tüm Öğrencileri Sistemden Çek</Text>
                    <View style={[styles.actionItemBadge, { backgroundColor: '#EEF2FF' }]}>
                      <Text style={[styles.actionItemBadgeText, { color: '#4F46E5' }]}>Sunucu</Text>
                    </View>
                  </View>
                  <Text style={styles.actionSheetItemDesc}>
                    Sunucudaki resmi öğrenci listesini çeker. Quiz ve görüş notlarınız telefonda korunur.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#4F46E5" />
              </TouchableOpacity>

              {/* Okul Öğretmeni Modunda Ekleme/İçe Aktarma Kısıtlaması */}
              {isSchoolTeacher ? (
                <View style={{ backgroundColor: '#EEF2FF', borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle" size={20} color="#4F46E5" />
                  <Text style={{ fontSize: 12, color: '#312E81', flex: 1, lineHeight: 16, fontWeight: '600' }}>
                    Okul modunda öğrenci ekleme ve silme işlemleri okul idaresi tarafından merkezi olarak yönetilir. "Okuldan Çek" butonuyla listenizi güncelleyebilirsiniz.
                  </Text>
                </View>
              ) : (
                <>
                  {/* 1. Manuel Öğrenci Ekle */}
                  <TouchableOpacity
                    style={styles.actionSheetItem}
                    onPress={() => {
                      setActionMenuVisible(false);
                      setTimeout(() => handleOpenAdd(), 200);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionSheetIconWrap, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="person-add" size={22} color={Colors.primary} />
                    </View>
                    <View style={styles.actionSheetItemTextWrap}>
                      <Text style={styles.actionSheetItemTitle}>Manuel Öğrenci Ekle</Text>
                      <Text style={styles.actionSheetItemDesc}>
                        Numara, ad soyad ve fotoğraf ile tek tek öğrenci kaydı oluşturun.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>

                  {/* 2. Excel'den Yükle */}
                  <TouchableOpacity
                    style={styles.actionSheetItem}
                    onPress={() => {
                      setActionMenuVisible(false);
                      setTimeout(() => handleExcelImport(), 200);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionSheetIconWrap, { backgroundColor: '#DCFCE7' }]}>
                      <Ionicons name="document-text" size={22} color="#16A34A" />
                    </View>
                    <View style={styles.actionSheetItemTextWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.actionSheetItemTitle}>Excel'den Öğrenci Yükle</Text>
                        <View style={[styles.actionItemBadge, { backgroundColor: '#DCFCE7' }]}>
                          <Text style={[styles.actionItemBadgeText, { color: '#15803D' }]}>Toplu Ekle</Text>
                        </View>
                      </View>
                      <Text style={styles.actionSheetItemDesc}>
                        e-Okul veya hazır Excel listesindeki öğrencileri topluca şubeye aktarın.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}

              {/* 3. Örnek Excel Şablonu İndir */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  handleDownloadTemplate();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="download-outline" size={22} color="#7C3AED" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Örnek Excel Şablonu İndir</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Öğrenci yüklemesi için sütunları hazırlanmış örnek şablon dosyasını paylaşın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 4. PDF'ten Fotoğraf Aktar */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleStartPdfPhoto(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="camera" size={22} color="#DC2626" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.actionSheetItemTitle}>PDF'ten Fotoğraf Aktar</Text>
                    <View style={[styles.actionItemBadge, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.actionItemBadgeText, { color: '#B91C1C' }]}>Akıllı OCR</Text>
                    </View>
                  </View>
                  <Text style={styles.actionSheetItemDesc}>
                    e-Okul fotoğraflı sınıf listesi PDF'inden resimleri otomatik kesip öğrencilere ata.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 5. Dosyalardan Fotoğraf Eşle */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleStartBulkPhoto(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#CCFBF1' }]}>
                  <Ionicons name="images" size={22} color="#0D9488" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Dosyalardan Fotoğraf Eşle</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Galeriden veya klasörden numara/isim ile fotoğrafları otomatik eşleştirin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 5b. Sınıf Fotoğraflarını Sil */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleClearClassPhotos(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="trash" size={22} color="#EF4444" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={[styles.actionSheetItemTitle, { color: '#DC2626' }]}>Sınıf Fotoğraflarını Sil</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Bu sınıftaki tüm öğrencilerin fotoğraflarını topluca kaldırın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 5c. Tüm Fotoğrafları Sil (Sistem) */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleClearAllPhotos(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#7F1D1D' }]}>
                  <Ionicons name="trash-bin" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={[styles.actionSheetItemTitle, { color: '#991B1B' }]}>Tüm Fotoğrafları Sil (Tüm Okul)</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Tüm sınıflardaki öğrenci fotoğraflarını sistemden sıfırlayın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 6. Çoklu Seçim Modu */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  toggleSelectionMode();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FFEDD5' }]}>
                  <Ionicons name="checkbox-outline" size={22} color="#EA580C" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Çoklu Seçim Modu</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Birden fazla öğrenciyi seçerek toplu şube transferi yapın veya silin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 7. Seçili Sınıfın Tüm Öğrencilerini Sil */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleDeleteAllClassStudents(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="people" size={22} color="#DC2626" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={[styles.actionSheetItemTitle, { color: '#DC2626' }]}>Bu Sınıfın Tüm Öğrencilerini Sil</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    "{className}" şubesindeki tüm öğrencileri ve verilerini siler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 8. Sistemdeki Tüm Öğrencileri Sil */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleDeleteAllSystemStudents(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#450A0A' }]}>
                  <Ionicons name="skull" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={[styles.actionSheetItemTitle, { color: '#7F1D1D' }]}>Sistemdeki TÜM Öğrencileri Sil</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Tüm sınıflardaki öğrencileri ve ilişkili tüm verileri kalıcı olarak sıfırlayın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 9. Tüm Sınıfı ve Verileri Sil */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleDeleteEntireClass(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="trash" size={22} color="#DC2626" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={[styles.actionSheetItemTitle, { color: '#DC2626' }]}>Tüm Sınıfı Sil (Kalıcı)</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Bu şubeyi ve bu şubeye ait tüm öğrenci, not, quiz ve görüş kayıtlarını tamamen siler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStudent ? 'Öğrenciyi Düzenle' : 'Yeni Öğrenci Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Input
                label="Okul / Öğrenci No *"
                placeholder="Örn: 105"
                value={studentNoInput}
                onChangeText={setStudentNoInput}
                keyboardType="numeric"
              />

              <Input
                label="Öğrenci Adı *"
                placeholder="Örn: Ahmet"
                value={firstNameInput}
                onChangeText={setFirstNameInput}
              />

              <Input
                label="Öğrenci Soyadı"
                placeholder="Örn: Yılmaz"
                value={lastNameInput}
                onChangeText={setLastNameInput}
              />

              <Input
                label="Öğrenci Telefonu (Opsiyonel)"
                placeholder="Örn: 0555 123 4567"
                value={studentPhoneInput}
                onChangeText={setStudentPhoneInput}
                keyboardType="phone-pad"
              />

              <Input
                label="Veli Adı & Soyadı (Opsiyonel)"
                placeholder="Örn: Mehmet Yılmaz (Anne/Baba)"
                value={parentNameInput}
                onChangeText={setParentNameInput}
              />

              <Input
                label="Veli Telefonu (Opsiyonel)"
                placeholder="Örn: 0532 987 6543"
                value={parentPhoneInput}
                onChangeText={setParentPhoneInput}
                keyboardType="phone-pad"
              />

              <Input
                label="Öğrenci Hakkında Not / Açıklama"
                placeholder="Örn: Ön sırada oturuyor vb."
                value={notesInput}
                onChangeText={setNotesInput}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalVisible(false)}
              />
              <Button
                title={editingStudent ? 'Güncelle' : 'Kaydet'}
                style={{ flex: 1 }}
                onPress={handleSaveStudent}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={photoModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.photoActionCard}>
            <View style={styles.photoActionHeader}>
              <Text style={styles.photoActionTitle}>Öğrenci Fotoğrafı</Text>
              <Text style={styles.photoActionSub}>
                {photoTargetStudent?.first_name} {photoTargetStudent?.last_name} (No:{' '}
                {photoTargetStudent?.student_number})
              </Text>
            </View>

            {photoTargetStudent?.photo_uri ? (
              <View style={styles.previewImageWrap}>
                <Image
                  source={{ uri: photoTargetStudent.photo_uri }}
                  style={styles.previewAvatarLarge}
                />
              </View>
            ) : null}

            <View style={styles.photoActionButtons}>
              <TouchableOpacity
                style={styles.photoChoiceBtn}
                onPress={() => handlePickSinglePhoto('camera')}
              >
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={styles.photoChoiceText}>Kamera ile Çek</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoChoiceBtn}
                onPress={() => handlePickSinglePhoto('gallery')}
              >
                <Ionicons name="images" size={20} color={Colors.secondary} />
                <Text style={styles.photoChoiceText}>Galeriden Seç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoChoiceBtn}
                onPress={handlePickSinglePhotoFromPdf}
              >
                <Ionicons name="document-text" size={20} color="#DC2626" />
                <Text style={styles.photoChoiceText}>PDF'ten Fotoğraf Seç</Text>
              </TouchableOpacity>

              {photoTargetStudent?.photo_uri ? (
                <TouchableOpacity
                  style={[styles.photoChoiceBtn, { borderColor: '#FECACA' }]}
                  onPress={handleRemovePhoto}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  <Text style={[styles.photoChoiceText, { color: Colors.danger }]}>
                    Fotoğrafı Kaldır
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.photoCancelBtn}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Text style={styles.photoCancelText}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={bulkPhotoModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Toplu Fotoğraf Eşleştirme</Text>
                <Text style={styles.photoActionSub}>
                  Dosya adındaki numaralar ile öğrenciler eşleştirildi
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBulkPhotoModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {bulkPhotoResult && (
              <>
                {/* Stats Bar */}
                <View style={styles.bulkStatsRow}>
                  <View style={styles.bulkStatPill}>
                    <Text style={styles.bulkStatNum}>{bulkPhotoResult.totalFiles}</Text>
                    <Text style={styles.bulkStatLabel}>Seçilen</Text>
                  </View>
                  <View style={[styles.bulkStatPill, { backgroundColor: '#DCFCE7' }]}>
                    <Text style={[styles.bulkStatNum, { color: '#166534' }]}>
                      {bulkPhotoResult.matched.length}
                    </Text>
                    <Text style={[styles.bulkStatLabel, { color: '#166534' }]}>Eşleşen</Text>
                  </View>
                  {bulkPhotoResult.oversizedCount > 0 && (
                    <View style={[styles.bulkStatPill, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.bulkStatNum, { color: '#991B1B' }]}>
                        {bulkPhotoResult.oversizedCount}
                      </Text>
                      <Text style={[styles.bulkStatLabel, { color: '#991B1B' }]}>
                        {`>${MAX_PHOTO_SIZE_LABEL}`}
                      </Text>
                    </View>
                  )}
                  <View style={styles.bulkStatPill}>
                    <Text style={styles.bulkStatNum}>
                      {bulkPhotoResult.unmatched.filter((u: any) => u.reason === 'not_found').length}
                    </Text>
                    <Text style={styles.bulkStatLabel}>Eşleşmeyen</Text>
                  </View>
                </View>

                {bulkPhotoResult.oversizedCount > 0 && (
                  <View style={styles.oversizedWarningBox}>
                    <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                    <Text style={styles.oversizedWarningText}>
                      {bulkPhotoResult.oversizedCount} dosya {MAX_PHOTO_SIZE_LABEL} sınırını aştığı için yüklenmeyecektir.
                    </Text>
                  </View>
                )}

                {/* Matched List */}
                <Text style={styles.listSectionTitle}>
                  Eşleşen Öğrenciler ({bulkPhotoResult.matched.length})
                </Text>

                <ScrollView style={styles.matchedScroll}>
                  {bulkPhotoResult.matched.length === 0 ? (
                    <Text style={styles.emptyMatchText}>
                      Seçilen dosyalar ile bu şubedeki öğrencilerin numaraları eşleşmedi. Dosya adının öğrenci numarasıyla (örn: 105.jpg) aynı olduğundan emin olun.
                    </Text>
                  ) : (
                    bulkPhotoResult.matched.map((item: any, idx: any) => (
                      <View key={idx} style={styles.matchItemRow}>
                        <Image source={{ uri: item.fileUri }} style={styles.matchThumb} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.matchStudentName}>
                            {item.student.first_name} {item.student.last_name}
                          </Text>
                          <Text style={styles.matchMeta}>
                            No: {item.student.student_number} • Dosya: {item.fileName} (
                            {(item.fileSize / 1024).toFixed(0)} KB)
                          </Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                      </View>
                    ))
                  )}
                </ScrollView>

                <View style={styles.modalActions}>
                  <Button
                    title="Vazgeç"
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={() => setBulkPhotoModalVisible(false)}
                  />
                  <Button
                    title={
                      bulkPhotoSaving
                        ? 'Kaydediliyor...'
                        : `${bulkPhotoResult.matched.length} Fotoğrafı Kaydet`
                    }
                    disabled={bulkPhotoResult.matched.length === 0 || bulkPhotoSaving}
                    style={{ flex: 1.5 }}
                    onPress={handleConfirmBulkPhotos}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={transferModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Şube Değiştir</Text>
                <Text style={styles.photoActionSub}>
                  Seçilen {selectedStudentIds.length} öğrencinin aktarılacağı şubeyi seçiniz:
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 250, marginVertical: 10 }}>
              {availableClasses.map((cls: any) => {
                const isSelected = selectedTargetClassId === cls.id;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.classChoiceRow,
                      isSelected && styles.classChoiceRowSelected,
                    ]}
                    onPress={() => setSelectedTargetClassId(cls.id)}
                  >
                    <View style={styles.classChoiceInfo}>
                      <Text style={styles.classChoiceName}>{cls.name}</Text>
                      {cls.description ? (
                        <Text style={styles.classChoiceSub}>{cls.description}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setTransferModalVisible(false)}
              />
              <Button
                title="Şubeyi Değiştir"
                style={{ flex: 1 }}
                onPress={handleConfirmTransfer}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pdfPhotoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPdfPhotoModalVisible(false)}
      >
        <View style={[
          styles.modalOverlay,
          {
            justifyContent: 'flex-start',
            paddingTop: 0,
            paddingBottom: 0,
          },
        ]}>
          <View style={[
            styles.modalContent,
            {
              flex: 1,
              borderRadius: 0,
              paddingTop: Math.max(16, insets.top + 8),
              paddingBottom: Math.max(16, insets.bottom + 12),
            },
          ]}>
            <View style={styles.modalHeader}>
              <View style={styles.detailHeaderInfo}>
                <Text style={styles.modalTitle}>PDF'ten Fotoğraf Yükle</Text>
                <Text style={styles.detailModalSubTitle}>
                  {pdfExtractItems.length} vesikalık fotoğraf bulundu •{' '}
                  {pdfExtractItems.filter((i: any) => i.matchedStudent !== null).length} eşleşti
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPdfPhotoModalVisible(false)}
                style={styles.detailModalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.pdfBannerBox}>
              <Ionicons name="information-circle" size={18} color="#0369A1" />
              <Text style={styles.pdfBannerText}>
                Fotoğraflar PDF'teki okul numarası sırasına göre şube listenizle eşleştirildi. Kontrol edip onaylayınız.
              </Text>
            </View>

            <ScrollView style={styles.pdfMatchScroll} showsVerticalScrollIndicator={true}>
              {pdfExtractItems.map((item: any, idx: any) => {
                const matched = item.matchedStudent;
                const pdfDetectedStr = item.detectedNumber
                  ? `PDF No: ${item.detectedNumber}`
                  : item.detectedName
                  ? `PDF Metin: ${item.detectedName}`
                  : 'PDF\'ten numara okunamadı';

                return (
                  <View key={idx} style={styles.pdfMatchRow}>
                    <Image source={{ uri: item.tempUri }} style={styles.pdfMatchThumb} />
                    <View style={styles.pdfMatchInfo}>
                      <View style={styles.pdfMatchBadgeRow}>
                        <Text style={styles.pdfOrderText}>
                          #{idx + 1}. Fotoğraf {item.pageNumber ? `(Sayfa ${item.pageNumber})` : ''}
                        </Text>
                        {matched ? (
                          <View style={styles.matchedBadgeSuccess}>
                            <Ionicons name="checkmark-circle" size={12} color="#047857" />
                            <Text style={styles.matchedBadgeSuccessText}>Eşleşti</Text>
                          </View>
                        ) : (
                          <View style={styles.matchedBadgeWarning}>
                            <Text style={styles.matchedBadgeWarningText}>Eşleşmedi</Text>
                          </View>
                        )}
                      </View>

                      {/* PDF Detected Info */}
                      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 }}>
                        {pdfDetectedStr}
                      </Text>

                      {/* System Matched Student Info */}
                      {matched ? (
                        <View style={{ marginTop: 2 }}>
                          <Text style={styles.pdfMatchedStudentName}>
                            Sistem: {matched.first_name} {matched.last_name}
                          </Text>
                          <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
                            Öğrenci No: {matched.student_number || '-'} • Şube: {(matched as any).class_name || className}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.pdfUnmatchedText}>
                          Sistemde bu numarayla öğrenci bulunamadı
                        </Text>
                      )}

                      {/* Row Action Buttons */}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        {matched ? (
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: '#FEE2E2',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}
                            onPress={() => handleUpdatePdfMatchStudent(idx, null)}
                          >
                            <Ionicons name="close-circle-outline" size={13} color="#DC2626" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>Hatalı / Kaldır</Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: Colors.primaryLight,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                          }}
                          onPress={() => {
                            setStudentSelectTargetPhotoIndex(idx);
                            setStudentSelectSearchQuery('');
                            setStudentSelectModalVisible(true);
                          }}
                        >
                          <Ionicons name="person-add-outline" size={13} color={Colors.primary} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>
                            {matched ? 'Öğrenci Değiştir' : 'Öğrenci Seç'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setPdfPhotoModalVisible(false)}
              />
              <Button
                title={`Kaydet (${pdfExtractItems.filter((i: any) => i.matchedStudent !== null).length})`}
                icon="checkmark"
                loading={savingPdfPhotos}
                disabled={
                  pdfExtractItems.filter((i: any) => i.matchedStudent !== null).length === 0 ||
                  savingPdfPhotos
                }
                style={{ flex: 1.5 }}
                onPress={handleConfirmSavePdfPhotos}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={studentSelectModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStudentSelectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Fotoğrafa Öğrenci Atayın</Text>
                <Text style={styles.modalSubtitle}>
                  {studentSelectTargetPhotoIndex !== null ? `#${studentSelectTargetPhotoIndex + 1}. Fotoğraf için listeden öğrenci seçin:` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStudentSelectModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ marginVertical: 8 }}>
              <Input
                placeholder="Öğrenci adı veya numarası ara..."
                value={studentSelectSearchQuery}
                onChangeText={setStudentSelectSearchQuery}
              />
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              {students
                .filter((s: any) => {
                  if (!studentSelectSearchQuery.trim()) return true;
                  const q = studentSelectSearchQuery.toLowerCase();
                  return (
                    (s.first_name + ' ' + s.last_name).toLowerCase().includes(q) ||
                    (s.student_number || '').toLowerCase().includes(q)
                  );
                })
                .map((s: any) => (
                  <TouchableOpacity
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.borderLight,
                      justifyContent: 'space-between',
                    }}
                    onPress={() => {
                      if (studentSelectTargetPhotoIndex !== null) {
                        handleUpdatePdfMatchStudent(studentSelectTargetPhotoIndex, s);
                      }
                      setStudentSelectModalVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {s.photo_uri ? (
                        <Image source={{ uri: s.photo_uri }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                      ) : (
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="person" size={16} color={Colors.primary} />
                        </View>
                      )}
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary }}>
                          {s.first_name} {s.last_name}
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textSecondary }}>
                          No: {s.student_number || '-'} • {className}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={singlePdfGridModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSinglePdfGridModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>PDF'ten Fotoğraf Seç</Text>
                <Text style={styles.modalSubtitle}>
                  {photoTargetStudent ? `${photoTargetStudent.first_name} ${photoTargetStudent.last_name} için bir fotoğraf seçin:` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSinglePdfGridModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 12 }}>
              PDF dosyasından ayıklanan {singlePdfGridPhotos.length} vesikalık fotoğraf gösteriliyor. Uygulamak istediğiniz fotoğrafa tıklayın:
            </Text>

            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
              {singlePdfGridPhotos.map((photo: any, idx: any) => (
                <TouchableOpacity
                  key={idx}
                  style={{
                    width: '30%',
                    backgroundColor: Colors.cardSubtle,
                    borderRadius: 12,
                    padding: 6,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                  onPress={() => handleSelectPhotoFromPdfForStudent(photo)}
                >
                  <Image source={{ uri: photo.tempUri }} style={{ width: '100%', height: 90, borderRadius: 8 }} resizeMode="cover" />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary, marginTop: 4 }}>
                    #{idx + 1}. Foto
                  </Text>
                  {photo.detectedNumber ? (
                    <Text style={{ fontSize: 9, color: Colors.textSecondary }}>No: {photo.detectedNumber}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ marginTop: 14 }}>
              <Button
                title="Kapat"
                variant="outline"
                onPress={() => setSinglePdfGridModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
