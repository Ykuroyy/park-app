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
  const [showGuide, setShowGuide] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ParkingRecord | null>(null);

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
      // UTF-8 BOMを追加して文字化けを防ぐ
      const BOM = '\uFEFF';
      const csvContent = [
        'ID,車番,入場時刻,退場時刻,滞在時間(分)',
        ...parkingRecords.map(r =>
          `${r.id},"${r.plateNumber}","${new Date(r.entryDate).toLocaleString('ja-JP')}","${
            r.exitDate ? new Date(r.exitDate).toLocaleString('ja-JP') : '駐車中'
          }","${r.duration || '計算中'}"`
        )
      ].join('\n');

      console.log('CSVコンテンツ:', csvContent);

      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
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
      
      // 成功メッセージ（スマホ向けに詳細に）
      alert('CSVファイルのダウンロードを開始しました。\n\n📱 確認方法:\n• iPhone: ファイルアプリ → ダウンロード\n• Android: ファイルマネージャー → Download\n\n📊 開き方:\n• CSVファイルをタップ → 共有 → Googleスプレッドシート\n• または Numbers/Excel で開く\n\n✅ UTF-8 BOM付きで文字化けを防止済み');
      
    } catch (error) {
      console.error('CSV出力エラー:', error);
      alert('CSVファイルの出力中にエラーが発生しました。');
    }
  };

  const exportToGoogleSheets = () => {
    console.log('Googleスプレッドシート出力開始');
    
    if (parkingRecords.length === 0) {
      alert('出力するデータがありません。まず車両を登録してください。');
      return;
    }

    try {
      // TSV形式（タブ区切り）でデータを作成
      const tsvContent = [
        'ID\t車番\t入場時刻\t退場時刻\t滞在時間(分)',
        ...parkingRecords.map(r =>
          `${r.id}\t${r.plateNumber}\t${new Date(r.entryDate).toLocaleString('ja-JP')}\t${
            r.exitDate ? new Date(r.exitDate).toLocaleString('ja-JP') : '駐車中'
          }\t${r.duration || '計算中'}`
        )
      ].join('\n');

      console.log('TSVコンテンツ:', tsvContent);

      // クリップボードにコピー
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsvContent).then(() => {
          alert('データをクリップボードにコピーしました！\n\n📊 使い方:\n1. Googleスプレッドシートアプリを開く\n2. 新しいシートを作成\n3. セルA1をタップして貼り付け\n4. データが表形式で自動整理されます');
        }).catch(() => {
          // フォールバック: 手動コピー用のテキストエリアを表示
          showCopyDialog(tsvContent);
        });
      } else {
        // クリップボードAPIが使えない場合
        showCopyDialog(tsvContent);
      }
      
    } catch (error) {
      console.error('Googleスプレッドシート出力エラー:', error);
      alert('データの出力中にエラーが発生しました。');
    }
  };

  const showCopyDialog = (content: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('データをクリップボードにコピーしました！\n\n📊 使い方:\n1. Googleスプレッドシートアプリを開く\n2. 新しいシートを作成\n3. セルA1をタップして貼り付け\n4. データが表形式で自動整理されます');
    } catch (err) {
      document.body.removeChild(textarea);
      alert('コピーに失敗しました。手動でCSV出力をご利用ください。');
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

  const deleteRecord = (recordId: string) => {
    if (confirm('この記録を削除しますか？')) {
      const updatedRecords = parkingRecords.filter(r => r.id !== recordId);
      saveParkingRecords(updatedRecords);
    }
  };

  const startEditRecord = (record: ParkingRecord) => {
    setEditingRecord({...record});
  };

  const saveEditRecord = () => {
    if (!editingRecord) return;
    
    const updatedRecords = parkingRecords.map(r => 
      r.id === editingRecord.id ? editingRecord : r
    );
    saveParkingRecords(updatedRecords);
    setEditingRecord(null);
  };

  const cancelEdit = () => {
    setEditingRecord(null);
  };

  return (
    <div className="app">
      <div className="header">
        <h1>駐車場管理</h1>
        <div className="header-buttons">
          <button onClick={() => setShowGuide(true)} className="guide-button">
            ❓ 使い方
          </button>
          <button onClick={exportToGoogleSheets} className="sheets-button">
            📊 スプレッドシート
          </button>
          <button onClick={exportToCSV} className="export-button">
            📥 CSV出力
          </button>
        </div>
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
                  <div className="record-actions">
                    {!record.exitDate && <span className="parking-badge">駐車中</span>}
                    <button
                      className="edit-button"
                      onClick={() => startEditRecord(record)}
                      title="修正"
                    >
                      ✏️
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => deleteRecord(record.id)}
                      title="削除"
                    >
                      🗑️
                    </button>
                  </div>
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

      {showGuide && (
        <div className="modal">
          <div className="modal-content guide-modal">
            <h2>📋 駐車場管理アプリの使い方</h2>
            
            <div className="guide-section">
              <h3>🚗 車両の入場・退場</h3>
              <ol>
                <li><strong>カメラスキャン:</strong> 「📷 カメラでスキャン」→ ナンバープレートを枠内に合わせ「スキャンする」ボタン</li>
                <li><strong>手動入力:</strong> 「✏️ 手動入力」→ 車番を入力して登録</li>
                <li><strong>自動判定:</strong> 同じ車番なら自動で入場/退場を判定</li>
              </ol>
            </div>

            <div className="guide-section">
              <h3>📊 データ管理</h3>
              <ul>
                <li><strong>履歴:</strong> 全ての入退場記録を検索・確認</li>
                <li><strong>分析:</strong> 本日・今月の利用状況を表示</li>
                <li><strong>CSV出力:</strong> データをExcelで確認可能</li>
              </ul>
            </div>

            <div className="guide-section">
              <h3>💡 カメラスキャンのコツ</h3>
              <ul>
                <li>明るい場所で撮影する</li>
                <li>ナンバープレートを水平にする</li>
                <li>文字がはっきり見えることを確認</li>
                <li>枠内にプレート全体を収める</li>
              </ul>
            </div>

            <button
              className="modal-button confirm"
              onClick={() => setShowGuide(false)}
            >
              分かりました
            </button>
          </div>
        </div>
      )}

      {editingRecord && (
        <div className="modal">
          <div className="modal-content">
            <h2>駐車記録の修正</h2>
            
            <div className="edit-form">
              <label>
                車番:
                <input
                  className="modal-input"
                  value={editingRecord.plateNumber}
                  onChange={(e) => setEditingRecord({
                    ...editingRecord,
                    plateNumber: e.target.value
                  })}
                />
              </label>
              
              <label>
                入場時刻:
                <input
                  className="modal-input"
                  type="datetime-local"
                  value={new Date(editingRecord.entryDate).toISOString().slice(0, 16)}
                  onChange={(e) => setEditingRecord({
                    ...editingRecord,
                    entryDate: new Date(e.target.value).toISOString()
                  })}
                />
              </label>
              
              {editingRecord.exitDate && (
                <label>
                  退場時刻:
                  <input
                    className="modal-input"
                    type="datetime-local"
                    value={new Date(editingRecord.exitDate).toISOString().slice(0, 16)}
                    onChange={(e) => {
                      const exitDate = new Date(e.target.value).toISOString();
                      const duration = Math.floor(
                        (new Date(exitDate).getTime() - new Date(editingRecord.entryDate).getTime()) / 1000 / 60
                      );
                      setEditingRecord({
                        ...editingRecord,
                        exitDate: exitDate,
                        duration: duration
                      });
                    }}
                  />
                </label>
              )}
            </div>

            <div className="modal-buttons">
              <button
                className="modal-button cancel"
                onClick={cancelEdit}
              >
                キャンセル
              </button>
              <button
                className="modal-button confirm"
                onClick={saveEditRecord}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;