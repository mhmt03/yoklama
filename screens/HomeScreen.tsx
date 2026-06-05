import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, StatusBar, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../database';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface CountResult { cnt: number; }

export default function HomeScreen({ navigation }: any) {
  const [exams, setExams] = useState<any[]>([]);
  const [stats, setStats] = useState({ exams: 0, students: 0 });

  const fetchExams = useCallback(() => {
    try {
      const result = db.getAllSync('SELECT * FROM tbl_sinavlar ORDER BY sinavId DESC');
      const examsWithCount = result.map((exam: any) => {
        const count = db.getFirstSync<CountResult>('SELECT COUNT(*) as cnt FROM tbl_salonlisteleri WHERE sinavId = ?', [exam.sinavId]).cnt;
        return { ...exam, participantCount: count };
      });
      setExams(examsWithCount);

      const totalStudents = db.getFirstSync<CountResult>('SELECT COUNT(*) as cnt FROM tbl_ogrenciListe').cnt;
      setStats({ exams: examsWithCount.length, students: totalStudents });
    } catch (error) {
      console.error('Error fetching exams:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchExams();
    }, [fetchExams])
  );

  const deleteExam = (id: number) => {
    Alert.alert('Sil', 'Bu sınavı ve yoklama kayıtlarını silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sınavı Sil',
        style: 'destructive',
        onPress: () => {
          try {
            db.execSync(`DELETE FROM tbl_salonlisteleri WHERE sinavId = ${id}`);
            db.execSync(`DELETE FROM tbl_sinavlar WHERE sinavId = ${id}`);
            fetchExams();
          } catch (e) {
            Alert.alert('Hata', 'Silinirken bir hata oluştu.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.examCard}>
      <View style={styles.cardAccent} />
      <View style={styles.cardBody}>
        <View style={styles.examInfo}>
          <Text style={styles.examName}>{item.sinavAd}</Text>
          <View style={styles.examSubInfo}>
            <Ionicons name="calendar-outline" size={14} color="#666" />
            <Text style={styles.examDate}>{item.tarih}</Text>
            <View style={styles.dot} />
            <Ionicons name="people-outline" size={14} color="#666" />
            <Text style={styles.participantCount}>{item.participantCount} Öğrenci</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity 
            style={[styles.actionIconButton, {backgroundColor: '#EEF2FF'}]} 
            onPress={() => navigation.navigate('Attendance', { exam: item })}
          >
            <Ionicons name="checkbox-outline" size={20} color="#4F46E5" />
            <Text style={[styles.actionLabel, {color: '#4F46E5'}]}>Yoklama</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionIconButton, {backgroundColor: '#FFF7ED'}]} 
            onPress={() => navigation.navigate('Report', { exam: item })}
          >
            <Ionicons name="document-text-outline" size={20} color="#EA580C" />
            <Text style={[styles.actionLabel, {color: '#EA580C'}]}>Rapor</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionIconButton, {backgroundColor: '#FEF2F2'}]} 
            onPress={() => deleteExam(item.sinavId)}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[styles.actionLabel, {color: '#EF4444'}]}>Sil</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <LinearGradient
        colors={['#4F46E5', '#3730A3']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Merhaba,</Text>
            <Text style={styles.title}>Sınav Takip Paneli</Text>
          </View>
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.exams}</Text>
              <Text style={styles.statLabel}>Sınav</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.students}</Text>
              <Text style={styles.statLabel}>Öğrenci</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.mainActions}>
        <TouchableOpacity 
          style={[styles.mainBtn, styles.shadow]} 
          onPress={() => navigation.navigate('AddExam')}
        >
          <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.btnGradient}>
            <Ionicons name="add-circle-outline" size={24} color="#fff" />
            <Text style={styles.mainBtnText}>Yeni Sınav</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.mainBtn, styles.shadow]} 
          onPress={() => navigation.navigate('Students')}
        >
          <View style={[styles.btnGradient, { backgroundColor: '#fff' }]}>
            <Ionicons name="people-circle-outline" size={24} color="#4F46E5" />
            <Text style={[styles.mainBtnText, { color: '#4F46E5' }]}>Öğrenciler</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Son Sınavlar</Text>
        <Ionicons name="chevron-down-outline" size={20} color="#666" />
      </View>

      <FlatList
        data={exams}
        keyExtractor={(item) => item.sinavId.toString()}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="copy-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Henüz sınav eklenmemiş.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTop: { flexDirection: 'column', gap: 20 },
  greeting: { color: '#E0E7FF', fontSize: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 15,
    marginTop: 10,
    alignItems: 'center',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#E0E7FF', fontSize: 12, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  
  mainActions: { 
    flexDirection: 'row', 
    paddingHorizontal: 20, 
    marginTop: -30, 
    justifyContent: 'space-between',
    gap: 15
  },
  mainBtn: { flex: 1, borderRadius: 16, height: 60, overflow: 'hidden' },
  btnGradient: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8 
  },
  mainBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  shadow: {
    elevation: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 25,
    marginBottom: 15,
  },
  listTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },

  listContent: { paddingHorizontal: 20, paddingBottom: 30 },
  examCard: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    marginBottom: 16, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    flexDirection: 'row',
    overflow: 'hidden'
  },
  cardAccent: { width: 6, backgroundColor: '#4F46E5' },
  cardBody: { flex: 1, padding: 16 },
  examInfo: { marginBottom: 16 },
  examName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  examSubInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  examDate: { fontSize: 13, color: '#6B7280', marginLeft: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginHorizontal: 8 },
  participantCount: { fontSize: 13, color: '#6B7280', marginLeft: 4 },

  cardActions: { flexDirection: 'row', gap: 10 },
  actionIconButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6
  },
  actionLabel: { fontSize: 12, fontWeight: 'bold' },

  emptyContainer: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 60,
    opacity: 0.5 
  },
  emptyText: { textAlign: 'center', color: '#6B7280', fontSize: 16, marginTop: 15 },
});
