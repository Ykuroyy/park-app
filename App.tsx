import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  FlatList
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

interface ParkingRecord {
  id: string;
  plateNumber: string;
  entryDate: string;
  exitDate?: string;
  duration?: number;
}

export default function App() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [parkingRecords, setParkingRecords] = useState<ParkingRecord[]>([]);
  const [currentTab, setCurrentTab] = useState<'scan' | 'history' | 'analytics'>('scan');
  const [manualPlateNumber, setManualPlateNumber] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadParkingRecords();
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const loadParkingRecords = async () => {
    try {
      const stored = await AsyncStorage.getItem('parkingRecords');
      if (stored) {
        setParkingRecords(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading records:', error);
    }
  };

  const saveParkingRecords = async (records: ParkingRecord[]) => {
    try {
      await AsyncStorage.setItem('parkingRecords', JSON.stringify(records));
      setParkingRecords(records);
    } catch (error) {
      console.error('Error saving records:', error);
    }
  };

  const addParkingRecord = (plateNumber: string) => {
    const existingRecord = parkingRecords.find(
      r => r.plateNumber === plateNumber && !r.exitDate
    );

    if (existingRecord) {
      const updatedRecords = parkingRecords.map(r =>
        r.id === existingRecord.id
          ? {
              ...r,
              exitDate: new Date().toISOString(),
              duration: Math.floor(
                (new Date().getTime() - new Date(r.entryDate).getTime()) / 1000 / 60
              )
            }
          : r
      );
      saveParkingRecords(updatedRecords);
      Alert.alert('車両退場', `車番: ${plateNumber}\n退場時刻: ${new Date().toLocaleString('ja-JP')}`);
    } else {
      const newRecord: ParkingRecord = {
        id: Date.now().toString(),
        plateNumber,
        entryDate: new Date().toISOString()
      };
      saveParkingRecords([newRecord, ...parkingRecords]);
      Alert.alert('車両入場', `車番: ${plateNumber}\n入場時刻: ${new Date().toLocaleString('ja-JP')}`);
    }
  };

  const handleManualEntry = () => {
    if (manualPlateNumber.trim()) {
      addParkingRecord(manualPlateNumber.trim().toUpperCase());
      setManualPlateNumber('');
      setShowManualEntry(false);
    }
  };

  const exportToCSV = async () => {
    const csvContent = [
      'ID,車番,入場時刻,退場時刻,滞在時間(分)',
      ...parkingRecords.map(r =>
        `${r.id},${r.plateNumber},${new Date(r.entryDate).toLocaleString('ja-JP')},${
          r.exitDate ? new Date(r.exitDate).toLocaleString('ja-JP') : '駐車中'
        },${r.duration || '計算中'}`
      )
    ].join('\n');

    const fileUri = FileSystem.documentDirectory + 'parking_records.csv';
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    } else {
      Alert.alert('エラー', 'このデバイスでは共有機能が利用できません');
    }
  };

  const getAnalytics = () => {
    const now = new Date();
    const today = now.toDateString();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const todayRecords = parkingRecords.filter(r =>
      new Date(r.entryDate).toDateString() === today
    );

    const monthRecords = parkingRecords.filter(r => {
      const date = new Date(r.entryDate);
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
    });

    const currentlyParked = parkingRecords.filter(r => !r.exitDate).length;

    const avgDuration = parkingRecords
      .filter(r => r.duration)
      .reduce((acc, r) => acc + (r.duration || 0), 0) / 
      parkingRecords.filter(r => r.duration).length || 0;

    return {
      todayCount: todayRecords.length,
      monthCount: monthRecords.length,
      currentlyParked,
      avgDuration: Math.round(avgDuration)
    };
  };

  const filteredRecords = parkingRecords.filter(r =>
    r.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const analytics = getAnalytics();

  if (showCamera && hasPermission) {
    return (
      <View style={styles.container}>
        <CameraView style={styles.camera}>
          <View style={styles.cameraOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanText}>ナンバープレートを枠内に収めてください</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowCamera(false)}
            >
              <Ionicons name="close-circle" size={50} color="white" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>駐車場管理</Text>
        <TouchableOpacity onPress={exportToCSV} style={styles.exportButton}>
          <Ionicons name="download-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'scan' && styles.activeTab]}
          onPress={() => setCurrentTab('scan')}
        >
          <Text style={[styles.tabText, currentTab === 'scan' && styles.activeTabText]}>
            スキャン
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'history' && styles.activeTab]}
          onPress={() => setCurrentTab('history')}
        >
          <Text style={[styles.tabText, currentTab === 'history' && styles.activeTabText]}>
            履歴
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'analytics' && styles.activeTab]}
          onPress={() => setCurrentTab('analytics')}
        >
          <Text style={[styles.tabText, currentTab === 'analytics' && styles.activeTabText]}>
            分析
          </Text>
        </TouchableOpacity>
      </View>

      {currentTab === 'scan' && (
        <View style={styles.scanContainer}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setShowCamera(true)}
          >
            <Ionicons name="camera" size={50} color="white" />
            <Text style={styles.scanButtonText}>カメラでスキャン</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => setShowManualEntry(true)}
          >
            <Ionicons name="keypad" size={30} color="white" />
            <Text style={styles.manualButtonText}>手動入力</Text>
          </TouchableOpacity>

          <View style={styles.currentStatus}>
            <Text style={styles.statusText}>現在駐車中: {analytics.currentlyParked}台</Text>
          </View>
        </View>
      )}

      {currentTab === 'history' && (
        <View style={styles.historyContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="車番で検索..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <FlatList
            data={filteredRecords}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.recordItem}>
                <View style={styles.recordHeader}>
                  <Text style={styles.plateNumber}>{item.plateNumber}</Text>
                  {!item.exitDate && <Text style={styles.parkingBadge}>駐車中</Text>}
                </View>
                <Text style={styles.recordDate}>
                  入場: {new Date(item.entryDate).toLocaleString('ja-JP')}
                </Text>
                {item.exitDate && (
                  <>
                    <Text style={styles.recordDate}>
                      退場: {new Date(item.exitDate).toLocaleString('ja-JP')}
                    </Text>
                    <Text style={styles.recordDuration}>
                      滞在時間: {item.duration}分
                    </Text>
                  </>
                )}
              </View>
            )}
          />
        </View>
      )}

      {currentTab === 'analytics' && (
        <ScrollView style={styles.analyticsContainer}>
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>本日の利用</Text>
            <Text style={styles.analyticsValue}>{analytics.todayCount}台</Text>
          </View>
          
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>今月の利用</Text>
            <Text style={styles.analyticsValue}>{analytics.monthCount}台</Text>
          </View>
          
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>現在駐車中</Text>
            <Text style={styles.analyticsValue}>{analytics.currentlyParked}台</Text>
          </View>
          
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>平均滞在時間</Text>
            <Text style={styles.analyticsValue}>{analytics.avgDuration}分</Text>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={showManualEntry}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>車番を入力</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例: 品川 500 あ 12-34"
              value={manualPlateNumber}
              onChangeText={setManualPlateNumber}
              autoCapitalize="characters"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowManualEntry(false);
                  setManualPlateNumber('');
                }}
              >
                <Text style={styles.modalButtonText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleManualEntry}
              >
                <Text style={styles.modalButtonText}>登録</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2196F3',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  exportButton: {
    padding: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  scanContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scanButton: {
    backgroundColor: '#2196F3',
    padding: 30,
    borderRadius: 100,
    alignItems: 'center',
    marginBottom: 20,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
    fontWeight: 'bold',
  },
  manualButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  manualButtonText: {
    color: 'white',
    fontSize: 16,
    marginLeft: 10,
  },
  currentStatus: {
    marginTop: 40,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  historyContainer: {
    flex: 1,
    padding: 20,
  },
  searchInput: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 16,
  },
  recordItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  plateNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  parkingBadge: {
    backgroundColor: '#4CAF50',
    color: 'white',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    fontSize: 12,
  },
  recordDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  recordDuration: {
    fontSize: 14,
    color: '#2196F3',
    marginTop: 5,
    fontWeight: 'bold',
  },
  analyticsContainer: {
    flex: 1,
    padding: 20,
  },
  analyticsCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  analyticsTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  analyticsValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 300,
    height: 150,
    borderWidth: 3,
    borderColor: '#4CAF50',
    borderRadius: 10,
  },
  scanText: {
    color: 'white',
    fontSize: 16,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 5,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  confirmButton: {
    backgroundColor: '#2196F3',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});