import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { OptikModuleView } from '../components/OptikModuleView';
import { getActiveSchool } from '../database/operations/schoolOperations';
import { getActiveUserSession } from '../services/apiClient';

export const TeacherOptikResultsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [schoolId, setSchoolId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    (async () => {
      const active = await getActiveSchool();
      const session = await getActiveUserSession();
      const resolvedId = active?.id || session?.schoolId || session?.affiliatedSchools?.[0]?.id;
      if (resolvedId) setSchoolId(String(resolvedId));
    })();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Üst Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>🎯 Optik Sınav Sonuçları & Analiz</Text>
          <Text style={styles.topBarSub}>Deneme sonuçları, netler ve konu-kazanım karneleri</Text>
        </View>
      </View>

      {/* İçerik */}
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <OptikModuleView schoolId={schoolId} mode="teacher" />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      } as any,
    }),
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  topBarSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
});

