import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Shadows } from '../../theme/colors';
import { Badge } from '../../components/Badge';
import { PdfViewerModal } from '../../components/PdfViewerModal';
import { CURRENT_APP_VERSION } from '../../services/appUpdateService';
import { viewYearlyPlanPdf } from '../../utils/pdfPlanService';
import {
  DAYS_OF_WEEK,
  getDayOfWeekIndex,
  formatDateToTR,
  getCurrentTimeString,
  getTodayDateString,
  getDateForDayOfWeek,
  formatDateShortTR,
} from '../../utils/dateUtils';
import { School, getSchools, getActiveSchool, setActiveSchool, createSchool, SCHOOL_COLORS, syncAffiliatedSchools, refreshAffiliatedSchoolsFromServer, getDefaultSchoolId, setDefaultSchoolId, activateDefaultSchoolOnStartup } from '../../database/operations/schoolOperations';
import { HomeCtx, HeroNavTarget, styles } from './homeStyles';

export function HomeModals({ ctx }: { ctx: HomeCtx }) {
  const {
    topicModalVisible,
    setTopicModalVisible,
    topicInfo,
    topicLoading,
    navigation,
    selectedTopicIndex,
    setSelectedTopicIndex,
    prevTopics,
    currentTopicItem,
    handleCopyNotebookText,
    nextTopics,
    yearlyPlanModalVisible,
    setYearlyPlanModalVisible,
    yearlyPlanMeta,
    handleScrollToTodayPlan,
    yearlyPlanPdf,
    setPdfViewerModalVisible,
    planSearchQuery,
    setPlanSearchQuery,
    setShowPlanDatePicker,
    planDateStart,
    planDateEnd,
    setPlanDateStart,
    setPlanDateEnd,
    showPlanDatePicker,
    yearlyPlanLoading,
    filteredPlanList,
    planScrollRef,
    highlightedPlanId,
    planItemOffsets,
    pdfViewerModalVisible,
    schoolModalVisible,
    setSchoolModalVisible,
    setIsAddingSchool,
    isInstitutionalTeacher,
    schoolsList,
    activeSchool,
    editingSchool,
    editSchoolName,
    setEditSchoolName,
    editSchoolColor,
    setEditSchoolColor,
    setEditingSchool,
    handleSaveEditSchool,
    handleSelectSchool,
    defaultSchoolId,
    handleSetDefaultSchool,
    handleStartEditSchool,
    handleDeleteSchoolHandler,
    isAddingSchool,
    newSchoolName,
    setNewSchoolName,
    newSchoolColor,
    setNewSchoolColor,
    handleCreateSchool,
    teacherInfoModalVisible,
    setTeacherInfoModalVisible,
    teacherDisplayName,
    assignedLessonsList,
    assignedClassesList
  } = ctx;

  return (
    <>
      <Modal
        visible={topicModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTopicModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalClassTag}>
                    {topicInfo?.className || '-'}
                  </Text>
                  <Text style={styles.modalCourseTag}>
                    {topicInfo?.courseName || '-'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>Deftere Yazılacak Metin</Text>
              </View>
              <TouchableOpacity
                onPress={() => setTopicModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {topicLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalLoadingText}>Konu ve plan yükleniyor...</Text>
              </View>
            ) : !topicInfo || !topicInfo.found || topicInfo.allTopics.length === 0 ? (
              <View style={styles.modalEmptyWrap}>
                <Ionicons name="book-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.modalEmptyTitle}>Yıllık Plan Bulunamadı</Text>
                <Text style={styles.modalEmptyDesc}>
                  Bu ders ve sınıf düzeyi için sisteme henüz yıllık plan yüklenmemiş.
                </Text>
                <TouchableOpacity
                  style={styles.modalEmptyBtn}
                  onPress={() => {
                    setTopicModalVisible(false);
                    navigation.navigate('YearlyPlan');
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.modalEmptyBtnText}>Yıllık Plan Yükle / Düzenle</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Gezinme Şeridi */}
                <View style={styles.topicStepperRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepArrowBtn,
                      selectedTopicIndex <= 0 && styles.stepArrowBtnDisabled,
                    ]}
                    disabled={selectedTopicIndex <= 0}
                    onPress={() => setSelectedTopicIndex((prev: any) => Math.max(0, prev - 1))}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={selectedTopicIndex <= 0 ? Colors.textMuted : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.stepArrowText,
                        selectedTopicIndex <= 0 && { color: Colors.textMuted },
                      ]}
                    >
                      Önceki
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.stepCounterText}>
                    Ders Sırası: {selectedTopicIndex + 1} / {topicInfo.allTopics.length}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.stepArrowBtn,
                      selectedTopicIndex >= topicInfo.allTopics.length - 1 &&
                      styles.stepArrowBtnDisabled,
                    ]}
                    disabled={selectedTopicIndex >= topicInfo.allTopics.length - 1}
                    onPress={() =>
                      setSelectedTopicIndex((prev: any) =>
                        Math.min(topicInfo.allTopics.length - 1, prev + 1)
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.stepArrowText,
                        selectedTopicIndex >= topicInfo.allTopics.length - 1 && {
                          color: Colors.textMuted,
                        },
                      ]}
                    >
                      Sonraki
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={
                        selectedTopicIndex >= topicInfo.allTopics.length - 1
                          ? Colors.textMuted
                          : Colors.primary
                      }
                    />
                  </TouchableOpacity>
                </View>

                {/* 1. SON İKİ DERS (ÖNCEKİ 2 DERSİN METNİ) */}
                <Text style={styles.topicSectionHeader}>Son İki Dersin Metni</Text>
                {prevTopics.length === 0 ? (
                  <View style={styles.noAdjacentBox}>
                    <Text style={styles.noAdjacentText}>
                      Önceki ders kaydı bulunmuyor (Dönem başlangıcı).
                    </Text>
                  </View>
                ) : (
                  prevTopics.map(({ offset, item }: any) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.adjacentCard}
                      onPress={() => {
                        const targetIdx = topicInfo.allTopics.findIndex((t: any) => t.id === item.id);
                        if (targetIdx >= 0) setSelectedTopicIndex(targetIdx);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.adjacentHeaderRow}>
                        <View style={styles.offsetBadgeGray}>
                          <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
                          <Text style={styles.offsetBadgeTextGray}>
                            {offset === -2 ? '2 Ders Önce' : '1 Ders Önce'}
                          </Text>
                        </View>
                        <Text style={styles.adjacentMetaText}>
                          {item.week_number}. Hafta {item.lesson_hours ? `(${item.lesson_hours} Saat)` : ''}
                        </Text>
                      </View>
                      <Text style={styles.adjacentTopicText} numberOfLines={3} selectable={true}>
                        {item.subject_topic}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}

                {/* 2. O DERS: DEFTERE YAZILACAK METİN (Vurgulu & Büyütülmüş & Kopyalanabilir) */}
                {currentTopicItem && (
                  <View style={styles.currentTopicHeroCard}>
                    <View style={styles.heroBadgeRow}>
                      <View style={styles.mainBadge}>
                        <Ionicons name="star" size={14} color="#FFFFFF" />
                        <Text style={styles.mainBadgeText}>BU DERSTE DEFTERE YAZILACAK</Text>
                      </View>
                      <Text style={styles.heroWeekText}>
                        {currentTopicItem.week_number}. Hafta
                      </Text>
                    </View>

                    {currentTopicItem.date_start && currentTopicItem.date_end && (
                      <Text style={styles.heroDateText}>
                        Tarih: {formatDateToTR(currentTopicItem.date_start)} - {formatDateToTR(currentTopicItem.date_end)}
                      </Text>
                    )}

                    <View style={styles.heroTopicBox}>
                      <Text style={styles.heroTopicText} selectable={true}>
                        {currentTopicItem.subject_topic}
                      </Text>
                    </View>

                    {currentTopicItem.learning_outcomes ? (
                      <View style={styles.outcomesContainer}>
                        <Text style={styles.outcomesLabel}>Kazanımlar / Açıklama:</Text>
                        <Text style={styles.outcomesBody} selectable={true}>
                          {currentTopicItem.learning_outcomes}
                        </Text>
                      </View>
                    ) : null}

                    {/* Defter Metnini Kopyala Butonu */}
                    <TouchableOpacity
                      style={styles.heroCopyBtn}
                      onPress={() => handleCopyNotebookText(currentTopicItem.subject_topic)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="copy" size={18} color="#FFFFFF" />
                      <Text style={styles.heroCopyBtnText}>Defter Metnini Kopyala</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 3. GELECEK İKİ DERS (SONRAKİ 2 DERSİN METNİ) */}
                <Text style={styles.topicSectionHeader}>Gelecek İki Dersin Metni</Text>
                {nextTopics.length === 0 ? (
                  <View style={styles.noAdjacentBox}>
                    <Text style={styles.noAdjacentText}>
                      Sonraki ders kaydı bulunmuyor (Dönem sonu).
                    </Text>
                  </View>
                ) : (
                  nextTopics.map(({ offset, item }: any) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.adjacentCard}
                      onPress={() => {
                        const targetIdx = topicInfo.allTopics.findIndex((t: any) => t.id === item.id);
                        if (targetIdx >= 0) setSelectedTopicIndex(targetIdx);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.adjacentHeaderRow}>
                        <View style={styles.offsetBadgeBlue}>
                          <Ionicons name="arrow-forward-circle-outline" size={12} color="#0284C7" />
                          <Text style={styles.offsetBadgeTextBlue}>
                            {offset === 1 ? '1 Ders Sonra' : '2 Ders Sonra'}
                          </Text>
                        </View>
                        <Text style={styles.adjacentMetaText}>
                          {item.week_number}. Hafta {item.lesson_hours ? `(${item.lesson_hours} Saat)` : ''}
                        </Text>
                      </View>
                      <Text style={styles.adjacentTopicText} numberOfLines={3} selectable={true}>
                        {item.subject_topic}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={yearlyPlanModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setYearlyPlanModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, styles.yearlyPlanModalContainer]}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalClassTag}>
                    {yearlyPlanMeta?.gradeLevel ? `${yearlyPlanMeta.gradeLevel}. Sınıf` : 'Sınıf'}
                  </Text>
                  <Text style={styles.modalCourseTag}>
                    {yearlyPlanMeta?.courseName || '-'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>
                  {yearlyPlanMeta?.className ? `${yearlyPlanMeta.className} Yıllık Müfredat Planı` : 'Yıllık Plan'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={handleScrollToTodayPlan}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.headerTodayIconBtn}
                  accessibilityLabel="Bugünün Kazanımına Git"
                >
                  <Ionicons name="locate-outline" size={17} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setYearlyPlanModalVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Üst İşlem Butonları */}
            <View style={styles.yearlyPlanActionsRow}>
              {yearlyPlanPdf && (
                <>
                  <TouchableOpacity
                    style={styles.pdfOpenBtn}
                    onPress={() => setPdfViewerModalVisible(true)}
                  >
                    <Ionicons name="document-text" size={14} color="#FFFFFF" />
                    <Text style={styles.pdfOpenBtnText}>PDF Gör</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdfOpenBtn, { backgroundColor: Colors.secondary }]}
                    onPress={() =>
                      viewYearlyPlanPdf(
                        yearlyPlanPdf.file_uri,
                        `${yearlyPlanMeta?.gradeLevel}. Sınıf ${yearlyPlanMeta?.courseName} Yıllık Planı`
                      )
                    }
                  >
                    <Ionicons name="share-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.pdfOpenBtnText}>PDF Paylaş/Aç</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.planManageBtn}
                onPress={() => {
                  setYearlyPlanModalVisible(false);
                  navigation.navigate('YearlyPlan');
                }}
              >
                <Ionicons name="create-outline" size={14} color={Colors.primary} />
                <Text style={styles.planManageBtnText}>Planı Yönet</Text>
              </TouchableOpacity>
            </View>

            {/* Arama ve Tarih Filtreleme Çubuğu */}
            <View style={styles.searchBarWrap}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Konu, hafta veya kazanım ara..."
                placeholderTextColor={Colors.textMuted}
                value={planSearchQuery}
                onChangeText={setPlanSearchQuery}
              />
              {planSearchQuery ? (
                <TouchableOpacity onPress={() => setPlanSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Tarih Aralığı Filtresi (Picker) */}
            <View style={styles.dateFilterContainer}>
              <TouchableOpacity
                style={styles.dateFilterInputBox}
                onPress={() => setShowPlanDatePicker('start')}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.dateFilterText}>
                  {planDateStart ? formatDateToTR(planDateStart) : 'Başlangıç Tarihi'}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>-</Text>
              <TouchableOpacity
                style={styles.dateFilterInputBox}
                onPress={() => setShowPlanDatePicker('end')}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.dateFilterText}>
                  {planDateEnd ? formatDateToTR(planDateEnd) : 'Bitiş Tarihi'}
                </Text>
              </TouchableOpacity>
              {(planDateStart || planDateEnd) && (
                <TouchableOpacity onPress={() => { setPlanDateStart(''); setPlanDateEnd(''); }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              {/* Mini Icon: Bugünün / Bu Haftanın Kazanımına Git */}
              <TouchableOpacity
                style={styles.todayJumpIconBtn}
                onPress={handleScrollToTodayPlan}
                activeOpacity={0.7}
                accessibilityLabel="Bugünün Kazanımına Git"
              >
                <Ionicons name="navigate-circle" size={16} color="#FFFFFF" />
                <Text style={styles.todayJumpIconBtnText}>Bugün</Text>
              </TouchableOpacity>
            </View>

            {showPlanDatePicker && (
              <DateTimePicker
                value={
                  showPlanDatePicker === 'start'
                    ? (planDateStart && !isNaN(new Date(planDateStart).getTime()) ? new Date(planDateStart) : new Date())
                    : (planDateEnd && !isNaN(new Date(planDateEnd).getTime()) ? new Date(planDateEnd) : new Date())
                }
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event: any, selectedDate: any) => {
                  const mode = showPlanDatePicker;
                  setShowPlanDatePicker(null);
                  if (selectedDate) {
                    const isoStr = selectedDate.toISOString().split('T')[0];
                    if (mode === 'start') {
                      setPlanDateStart(isoStr);
                      // Başlangıç değişirse varsayılan bitişi de 1 yıl sonrasına ayarla
                      const endDateObj = new Date(selectedDate);
                      endDateObj.setFullYear(endDateObj.getFullYear() + 1);
                      setPlanDateEnd(endDateObj.toISOString().split('T')[0]);
                    } else {
                      setPlanDateEnd(isoStr);
                    }
                  }
                }}
              />
            )}

            {yearlyPlanLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalLoadingText}>Yıllık plan listeleniyor...</Text>
              </View>
            ) : filteredPlanList.length === 0 ? (
              <View style={styles.modalEmptyWrap}>
                <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.modalEmptyTitle}>Kayıt Bulunamadı</Text>
                <Text style={styles.modalEmptyDesc}>
                  {planSearchQuery || planDateStart || planDateEnd
                    ? 'Filtrelerinize uygun plan satırı bulunamadı.'
                    : 'Bu sınıf düzeyi için henüz yıllık plan yüklenmemiş.'}
                </Text>
                {!planSearchQuery && !planDateStart && !planDateEnd && (
                  <TouchableOpacity
                    style={styles.modalEmptyBtn}
                    onPress={() => {
                      setYearlyPlanModalVisible(false);
                      navigation.navigate('YearlyPlan');
                    }}
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.modalEmptyBtnText}>Plan Yükle (Excel / PDF)</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView
                ref={planScrollRef}
                style={styles.modalScroll}
                contentContainerStyle={{ paddingBottom: 30 }}
                showsVerticalScrollIndicator={true}
              >
                {filteredPlanList.map((plan: any) => {
                  const todayStr = getTodayDateString();
                  const isThisWeek =
                    Boolean(plan.date_start && plan.date_end && plan.date_start <= todayStr && plan.date_end >= todayStr);
                  const isHighlighted = highlightedPlanId === plan.id;

                  return (
                    <View
                      key={plan.id}
                      onLayout={(event: any) => {
                        const y = event.nativeEvent.layout.y;
                        planItemOffsets.current[plan.id] = y;
                      }}
                      style={[
                        styles.planItemCard,
                        isThisWeek && styles.planItemCardActive,
                        isHighlighted && styles.planItemCardHighlighted,
                      ]}
                    >
                      {/* Hafta Numarası, Tarih Aralığı ve Bu Hafta rozeti aynı satırda */}
                      <View style={styles.planItemHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                          <View
                            style={[
                              styles.weekBadge,
                              isThisWeek && { backgroundColor: Colors.primary },
                            ]}
                          >
                            <Text
                              style={[
                                styles.weekBadgeText,
                                isThisWeek && { color: '#FFFFFF' },
                              ]}
                            >
                              {plan.week_number}. Hafta
                            </Text>
                          </View>

                          {plan.date_start && plan.date_end && (
                            <Text style={styles.planDateInlineText}>
                              📅 {formatDateToTR(plan.date_start)} - {formatDateToTR(plan.date_end)}
                            </Text>
                          )}

                          {isThisWeek && (
                            <Badge label="Bu Hafta" status="yapildi" size="sm" />
                          )}
                          {!isThisWeek && isHighlighted && (
                            <Badge label="Bugüne En Yakın" status="bekliyor" size="sm" />
                          )}
                        </View>

                        <Text style={styles.planHoursText}>
                          {plan.lesson_hours ? `${plan.lesson_hours} Sa` : ''}
                        </Text>
                      </View>

                      <Text style={styles.planSubjectText} selectable={true}>
                        {plan.subject_topic}
                      </Text>

                      {plan.learning_outcomes ? (
                        <View style={styles.planOutcomesWrap}>
                          <Text style={styles.planOutcomesLabel}>Kazanım:</Text>
                          <Text style={styles.planOutcomesBody} selectable={true}>
                            {plan.learning_outcomes}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <PdfViewerModal
        visible={pdfViewerModalVisible}
        onClose={() => setPdfViewerModalVisible(false)}
        fileUri={yearlyPlanPdf?.file_uri || null}
        fileName={yearlyPlanPdf?.file_name}
        title={`${yearlyPlanMeta?.gradeLevel || ''}. Sınıf ${yearlyPlanMeta?.courseName || ''} Yıllık Planı`}
        onShareOrExternal={() => {
          if (yearlyPlanPdf) {
            viewYearlyPlanPdf(
              yearlyPlanPdf.file_uri,
              `${yearlyPlanMeta?.gradeLevel}. Sınıf ${yearlyPlanMeta?.courseName} Yıllık Planı`
            );
          }
        }}
      />

      <Modal
        visible={schoolModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSchoolModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalClassTag}>OKUL SEÇİMİ VE YÖNETİMİ</Text>
                <Text style={styles.modalTitle}>Aktif Okulu Değiştir</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSchoolModalVisible(false);
                  setIsAddingSchool(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 10, gap: 12 }}>
              <Text style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 18 }}>
                {isInstitutionalTeacher
                  ? 'Yöneticinizin hesabına bağlı kurum okulları listelenmiştir. Dersine girdiğiniz aktif okulu seçebilirsiniz.'
                  : 'Çalıştığınız okulu seçin veya yeni okul ekleyin. Seçtiğiniz okulun renk teması uygulamaya otomatik uygulanacaktır.'}
              </Text>

              {/* Okul Listesi */}
              {schoolsList.map((sch: any) => {
                const isActive = sch.id === activeSchool?.id;
                const isEditing = editingSchool?.id === sch.id;

                if (isEditing) {
                  return (
                    <View key={sch.id} style={{ backgroundColor: '#F8FAFC', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, gap: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary }}>
                        Okul Düzenle
                      </Text>

                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 }}>
                          Okul Adı
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: Colors.border,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            fontSize: 14,
                            color: Colors.textPrimary,
                          }}
                          value={editSchoolName}
                          onChangeText={setEditSchoolName}
                        />
                      </View>

                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 }}>
                          Renk Teması
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                          {SCHOOL_COLORS.map((c: any) => (
                            <TouchableOpacity
                              key={c.color}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: c.color,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: editSchoolColor === c.color ? 3 : 0,
                                borderColor: '#0F172A',
                              }}
                              onPress={() => setEditSchoolColor(c.color)}
                            >
                              {editSchoolColor === c.color && (
                                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.cardSubtle, alignItems: 'center' }}
                          onPress={() => setEditingSchool(null)}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: editSchoolColor, alignItems: 'center' }}
                          onPress={handleSaveEditSchool}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Kaydet</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                return (
                  <View
                    key={sch.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: isActive ? '#F0FDF4' : Colors.cardSubtle,
                      borderWidth: 2,
                      borderColor: isActive ? sch.color : 'transparent',
                      gap: 10,
                    }}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      onPress={() => handleSelectSchool(sch.id)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: sch.color,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="school" size={18} color="#FFFFFF" />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                            {sch.name}
                          </Text>
                          {isActive && (
                            <View style={{ backgroundColor: sch.color, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>Aktif</Text>
                            </View>
                          )}
                          {sch.id === defaultSchoolId && (
                            <View style={{ backgroundColor: '#FEF08A', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                              <Ionicons name="star" size={10} color="#CA8A04" />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#854D0E' }}>Varsayılan</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Action buttons (Varsayılan Yap, Edit & Delete) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        style={{
                          padding: 6,
                          borderRadius: 8,
                          backgroundColor: sch.id === defaultSchoolId ? '#FEF08A' : '#F1F5F9',
                        }}
                        onPress={() => handleSetDefaultSchool(sch.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel="Varsayılan Okul Yap"
                      >
                        <Ionicons
                          name={sch.id === defaultSchoolId ? 'star' : 'star-outline'}
                          size={16}
                          color={sch.id === defaultSchoolId ? '#CA8A04' : Colors.textMuted}
                        />
                      </TouchableOpacity>

                      {!isInstitutionalTeacher && (
                        <>
                          <TouchableOpacity
                            style={{ padding: 6, borderRadius: 8, backgroundColor: '#E2E8F0' }}
                            onPress={() => handleStartEditSchool(sch)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="pencil" size={15} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          {schoolsList.length > 1 && (
                            <TouchableOpacity
                              style={{ padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2' }}
                              onPress={() => handleDeleteSchoolHandler(sch)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons name="trash-outline" size={15} color="#DC2626" />
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Yeni Okul Ekle Formu veya Kurumsal Bilgi Kartı */}
              {isInstitutionalTeacher ? (
                <View style={{ backgroundColor: '#F0FDF4', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#BBF7D0', marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="shield-checkmark" size={18} color="#16A34A" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>Kurumsal Okul Seçimi</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#15803D', marginTop: 4, lineHeight: 17 }}>
                    Bağlı olduğunuz okul yöneticisinin tanımladığı okullar arasında yukarıdan geçiş yapabilirsiniz. Yeni okul tanımlama ve düzenleme işlemleri okul yöneticisi yetkisindedir.
                  </Text>
                </View>
              ) : isAddingSchool ? (
                <View style={{ backgroundColor: '#F8FAFC', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, gap: 12, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary }}>
                    Yeni Okul Tanımla
                  </Text>

                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 }}>
                      Okul / Kurum Adı
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 14,
                        color: Colors.textPrimary,
                      }}
                      placeholder="Örn: Atatürk Anadolu Lisesi"
                      placeholderTextColor={Colors.textMuted}
                      value={newSchoolName}
                      onChangeText={setNewSchoolName}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 }}>
                      Okulun Renk Temasını Seçin
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {SCHOOL_COLORS.map((c: any) => (
                        <TouchableOpacity
                          key={c.color}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: c.color,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: newSchoolColor === c.color ? 3 : 0,
                            borderColor: '#0F172A',
                          }}
                          onPress={() => setNewSchoolColor(c.color)}
                        >
                          {newSchoolColor === c.color && (
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: Colors.cardSubtle,
                        alignItems: 'center',
                      }}
                      onPress={() => setIsAddingSchool(false)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>
                        Vazgeç
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: newSchoolColor,
                        alignItems: 'center',
                      }}
                      onPress={handleCreateSchool}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                        Okulu Kaydet & Geç
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: activeSchool?.color || Colors.primary,
                    gap: 8,
                    marginTop: 6,
                  }}
                  onPress={() => setIsAddingSchool(true)}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                    Yeni Okul Ekle
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={teacherInfoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTeacherInfoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 440, borderRadius: 16, padding: 20, backgroundColor: "#f8d8f8ff" }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={20} color={activeSchool?.color || Colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.textPrimary }}>
                    {teacherDisplayName || 'Öğretmen Bilgisi'}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Kayıtlı Ders & Şube Bilgilendirmesi</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setTeacherInfoModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Girdiğiniz Dersler */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="book" size={16} color="#4F46E5" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>Girdiğiniz Dersler</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted }}>({assignedLessonsList.length})</Text>
              </View>
              {assignedLessonsList.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {assignedLessonsList.map((ls: any, idx: any) => (
                    <View key={idx} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#3730A3' }}>{ls}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' }}>
                  Sistemde adınıza tanımlı ders henüz listelenmedi (çarşaf/program yüklenince otomatik doldurulur).
                </Text>
              )}
            </View>

            {/* Girdiğiniz Şubeler */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="school" size={16} color="#059669" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>Girdiğiniz Şubeler</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted }}>({assignedClassesList.length})</Text>
              </View>
              {assignedClassesList.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {assignedClassesList.map((cl: any, idx: any) => (
                    <View key={idx} style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>{cl}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' }}>
                  Tanımlı şube bulunamadı.
                </Text>
              )}
            </View>

            <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: activeSchool?.color || Colors.primary, marginBottom: 16 }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, lineHeight: 16 }}>
                💡 Bilgi: Yıllık plan ve haftalık program çekerken yalnızca yukarıda listelenen ders ve sınıflarınızın verileri sistemden güvenle aktarılır.
              </Text>
            </View>

            <TouchableOpacity
              style={{ backgroundColor: activeSchool?.color || Colors.primary, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
              onPress={() => setTeacherInfoModalVisible(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Tamam</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              <Ionicons name="information-circle-outline" size={12} color="#64748B" />
              <Text style={{ fontSize: 10.5, color: '#64748B' }}>
                Öğretmen Ajanda v{CURRENT_APP_VERSION} • Geliştirici: gundoner@yahoo.com
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
