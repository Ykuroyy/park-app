import React, { useState, useEffect } from 'react';
import CameraCapture from './components/CameraCapture';
import './App.css';

interface ParkingRecord {
  id: string;
  plateNumber: string;
  entryDate: string;
  exitDate?: string;
  duration?: number;
}

function App() {
  const [parkingRecords, setParkingRecords] = useState<ParkingRecord[]>([]);
  const [currentTab, setCurrentTab] = useState<'scan' | 'history' | 'analytics'>('scan');
  const [manualPlateNumber, setManualPlateNumber] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    loadParkingRecords();
  }, []);

  const loadParkingRecords = () => {
    try {
      const stored = localStorage.getItem('parkingRecords');
      if (stored) {
        const records = JSON.parse(stored);
        setParkingRecords(records);
        console.log('読み込まれた駐車記録:', records.length, '件');
      } else {
        console.log('保存された駐車記録がありません');
        // テスト用のサンプルデータを追加（初回のみ）
        const sampleData = [
          {
            id: '1',
            plateNumber: '品川 500 あ 12-34',
            entryDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2時間前
            exitDate: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30分前
            duration: 90 // 90分
          },
          {
            id: '2', 
            plateNumber: '横浜 300 か 56-78',
            entryDate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1時間前
            // 現在駐車中（exitDate なし）
          }
        ];
        setParkingRecords(sampleData);
        localStorage.setItem('parkingRecords', JSON.stringify(sampleData));
        console.log('サンプルデータを作成しました');
      }
    } catch (error) {
      console.error('データ読み込みエラー:', error);
    }
  };

  const saveParkingRecords = (records: ParkingRecord[]) => {
    localStorage.setItem('parkingRecords', JSON.stringify(records));
    setParkingRecords(records);
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
      alert(`車両退場\n車番: ${plateNumber}\n退場時刻: ${new Date().toLocaleString('ja-JP')}`);
    } else {
      const newRecord: ParkingRecord = {
        id: Date.now().toString(),
        plateNumber,
        entryDate: new Date().toISOString()
      };
      saveParkingRecords([newRecord, ...parkingRecords]);
      alert(`車両入場\n車番: ${plateNumber}\n入場時刻: ${new Date().toLocaleString('ja-JP')}`);
    }
  };

  const handleManualEntry = () => {
    if (manualPlateNumber.trim()) {
      addParkingRecord(manualPlateNumber.trim().toUpperCase());
      setManualPlateNumber('');
      setShowManualEntry(false);
    }
  };

  const exportToCSV = () => {
    console.log('CSV出力開始');
    console.log('駐車記録数:', parkingRecords.length);
    
    if (parkingRecords.length === 0) {
      alert('出力するデータがありません。まず車両を登録してください。');
      return;
    }

    try {
      const csvContent = [
        'ID,車番,入場時刻,退場時刻,滞在時間(分)',
        ...parkingRecords.map(r =>
          `${r.id},"${r.plateNumber}","${new Date(r.entryDate).toLocaleString('ja-JP')}","${
            r.exitDate ? new Date(r.exitDate).toLocaleString('ja-JP') : '駐車中'
          }","${r.duration || '計算中'}"`
        )
      ].join('\n');

      console.log('CSVコンテンツ:', csvContent);

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.href = url;
      link.download = `parking_records_${new Date().toISOString().split('T')[0]}.csv`;
      
      // クリック処理を確実に実行
      document.body.appendChild(link);
      link.click();
      
      // クリーンアップ
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      console.log('CSV出力完了');
      
      // 成功メッセージ
      alert('CSVファイルのダウンロードを開始しました。');
      
    } catch (error) {
      console.error('CSV出力エラー:', error);
      alert('CSVファイルの出力中にエラーが発生しました。');
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

  const handlePlateDetected = (plateInfo: any) => {
    const fullPlate = plateInfo.fullText || `${plateInfo.region} ${plateInfo.classification} ${plateInfo.hiragana} ${plateInfo.number}`.trim();
    addParkingRecord(fullPlate);
  };

  return (
    <div className="app">
      <div className="header">
        <h1>駐車場管理</h1>
        <button onClick={exportToCSV} className="export-button">
          📥 CSV出力
        </button>
      </div>

      <div className="tab-container">
        <button
          className={`tab ${currentTab === 'scan' ? 'active' : ''}`}
          onClick={() => setCurrentTab('scan')}
        >
          スキャン
        </button>
        <button
          className={`tab ${currentTab === 'history' ? 'active' : ''}`}
          onClick={() => setCurrentTab('history')}
        >
          履歴
        </button>
        <button
          className={`tab ${currentTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setCurrentTab('analytics')}
        >
          分析
        </button>
      </div>

      {currentTab === 'scan' && (
        <div className="scan-container">
          <button
            className="scan-button"
            onClick={() => setShowCamera(true)}
          >
            📷 カメラでスキャン
          </button>
          
          <button
            className="manual-button"
            onClick={() => setShowManualEntry(true)}
          >
            ✏️ 手動入力
          </button>
          
          <div className="current-status">
            <p>現在駐車中: {analytics.currentlyParked}台</p>
          </div>
        </div>
      )}

      {currentTab === 'history' && (
        <div className="history-container">
          <input
            className="search-input"
            placeholder="車番で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="records-list">
            {filteredRecords.map(record => (
              <div key={record.id} className="record-item">
                <div className="record-header">
                  <span className="plate-number">{record.plateNumber}</span>
                  {!record.exitDate && <span className="parking-badge">駐車中</span>}
                </div>
                <p className="record-date">
                  入場: {new Date(record.entryDate).toLocaleString('ja-JP')}
                </p>
                {record.exitDate && (
                  <>
                    <p className="record-date">
                      退場: {new Date(record.exitDate).toLocaleString('ja-JP')}
                    </p>
                    <p className="record-duration">
                      滞在時間: {record.duration}分
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {currentTab === 'analytics' && (
        <div className="analytics-container">
          <div className="analytics-card">
            <h3>本日の利用</h3>
            <p className="analytics-value">{analytics.todayCount}台</p>
          </div>
          
          <div className="analytics-card">
            <h3>今月の利用</h3>
            <p className="analytics-value">{analytics.monthCount}台</p>
          </div>
          
          <div className="analytics-card">
            <h3>現在駐車中</h3>
            <p className="analytics-value">{analytics.currentlyParked}台</p>
          </div>
          
          <div className="analytics-card">
            <h3>平均滞在時間</h3>
            <p className="analytics-value">{analytics.avgDuration}分</p>
          </div>
        </div>
      )}

      {showManualEntry && (
        <div className="modal">
          <div className="modal-content">
            <h2>車番を入力</h2>
            <input
              className="modal-input"
              placeholder="例: 品川 500 あ 12-34"
              value={manualPlateNumber}
              onChange={(e) => setManualPlateNumber(e.target.value)}
              style={{ textTransform: 'uppercase' }}
            />
            <div className="modal-buttons">
              <button
                className="modal-button cancel"
                onClick={() => {
                  setShowManualEntry(false);
                  setManualPlateNumber('');
                }}
              >
                キャンセル
              </button>
              <button
                className="modal-button confirm"
                onClick={handleManualEntry}
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <CameraCapture
          onPlateDetected={handlePlateDetected}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

export default App;