import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initDb } from './database';
import HomeScreen from './screens/HomeScreen';
import StudentListScreen from './screens/StudentListScreen';
import AddExamScreen from './screens/AddExamScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import ReportScreen from './screens/ReportScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    initDb();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Students" component={StudentListScreen} options={{ title: 'Öğrenci Yönetimi' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Yoklama Ana Ekran' }} />
        <Stack.Screen name="AddExam" component={AddExamScreen} options={{ title: 'Yeni Sınav Ekle' }} />
        <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Yoklama Al' }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Rapor Al' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
