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
import {
  getTeacherCounselorClass,
  getClassCounselorTeacher,
  isRehberlikLesson,
  getAvailableDutyTeachersForHour,
  normalizeTeacherName,
  isSameTeacher,
} from '../../../utils/counselorService';
import { SchoolAdminCtx, styles } from '../schoolAdminStyles';

export function ClassesTabView({ ctx }: { ctx: SchoolAdminCtx }) {
  const {
    classes,
    handleDeleteAllClasses,
    setAddClassModalVisible,
    students,
    teachers,
    allSchoolSchedules,
    setSelectedClassForStudents,
    setClassStudentsModalVisible,
    handleDeleteClass
  } = ctx;

  return (
    <View>
                <View style={[styles.sectionHeader, { flexWrap: 'wrap', gap: 8, alignItems: 'center' }]}>
                  <Text style={styles.sectionTitle}>Sınıflar & Şubeler ({classes.length})</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {classes.length > 0 && (
                      <TouchableOpacity
                        style={styles.dangerHeaderBtn}
                        onPress={handleDeleteAllClasses}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={styles.dangerHeaderBtnText}>Tümünü Sil</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => setAddClassModalVisible(true)}
                    >
                      <Ionicons name="add-circle" size={15} color="#fff" />
                      <Text style={styles.primaryAddBtnText}>+ Sınıf Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {classes.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="school-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Henüz tanımlanmış bir sınıf veya şube yok.</Text>
                  </View>
                ) : (
                  <View style={styles.gridContainer}>
                    {classes.map((cls: any) => {
                      const currentClassName = cls.className || `${cls.grade}-${cls.section}`;
                      const actualCount = (students || []).filter((s: any) => {
                        if (s.classId === cls.id || s.class_id === cls.id) return true;
                        const sName = (s.className || `${s.grade || ''}-${s.section || ''}`).trim().toLowerCase();
                        return sName === currentClassName.trim().toLowerCase();
                      }).length;
                      const studentCountDisplay = actualCount > 0 ? actualCount : (cls.studentCount || 0);
                      const counselorTeacher = getClassCounselorTeacher(currentClassName, teachers, allSchoolSchedules);

                      return (
                        <TouchableOpacity
                          key={cls.id}
                          style={styles.classCard}
                          activeOpacity={0.85}
                          onPress={() => {
                            setSelectedClassForStudents(cls);
                            setClassStudentsModalVisible(true);
                          }}
                        >
                          <View style={styles.classCardTopRow}>
                            <View style={styles.classBadge}>
                              <Text style={styles.classBadgeText}>{currentClassName}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.deleteMiniBtn}
                              onPress={() => handleDeleteClass(cls.id, currentClassName)}
                            >
                              <Ionicons name="trash-outline" size={14} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.classStudentCount}>
                            👥 {studentCountDisplay} Öğrenci
                          </Text>

                          {/* Sınıf Rehber Öğretmeni */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: counselorTeacher ? '#F0FDF4' : '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 4, marginBottom: 4, borderWidth: 1, borderColor: counselorTeacher ? '#BBF7D0' : '#E2E8F0' }}>
                            <Ionicons name="ribbon-outline" size={12} color={counselorTeacher ? '#16A34A' : '#94A3B8'} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: counselorTeacher ? '#15803D' : '#64748B' }} numberOfLines={1}>
                              Rehber: {counselorTeacher || 'Atanmadı'}
                            </Text>
                          </View>

                          <Text style={styles.classYearText}>Dönem: {cls.academicYear || '2026-2027'}</Text>

                          <View style={styles.classCardActionBtn}>
                            <Ionicons name="people" size={13} color="#4F46E5" />
                            <Text style={styles.classCardActionBtnText}>Öğrencileri Gör & Yönet</Text>
                            <Ionicons name="chevron-forward" size={13} color="#4F46E5" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
  );
}
