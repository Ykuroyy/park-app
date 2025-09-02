import React, { useRef, useState, useCallback } from 'react';
import './CameraCapture.css';

interface PlateInfo {
  region: string;      // 地域名 (例: "品川")
  classification: string; // 分類番号 (例: "500")
  hiragana: string;    // ひらがな (例: "あ")
  number: string;      // 番号 (例: "12-34")
  fullText: string;    // 完全なテキスト
}

interface CameraCaptureProps {
  onPlateDetected: (plateInfo: PlateInfo) => void;
  onClose: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onPlateDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualPlate, setManualPlate] = useState({
    region: '',
    classification: '',
    hiragana: '',
    number: ''
  });

  React.useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // 背面カメラを使用
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      }
    } catch (err) {
      console.error('カメラアクセスエラー:', err);
      setError('カメラにアクセスできません。ブラウザの設定を確認してください。');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);
    setError('');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('キャンバスの初期化に失敗しました');
      setIsProcessing(false);
      return;
    }

    // ビデオが再生中か確認
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      setError('カメラの準備ができていません。しばらく待ってからお試しください。');
      setIsProcessing(false);
      return;
    }

    // キャンバスのサイズを高解像度に設定
    const scale = 2;
    canvas.width = (video.videoWidth || 640) * scale;
    canvas.height = (video.videoHeight || 480) * scale;

    // 高解像度で画像を描画
    ctx.scale(scale, scale);
    ctx.drawImage(video, 0, 0, canvas.width / scale, canvas.height / scale);
    
    // 車番認識用の画像前処理
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 数字認識に最適化した画像処理
    for (let i = 0; i < data.length; i += 4) {
      // グレースケール変換
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      
      // より強力なコントラスト強化（数字の線をはっきりさせる）
      const enhanced = ((gray - 128) * 2.2) + 128;
      
      // 数字認識に最適化した二値化
      let final;
      if (enhanced > 130) {
        final = 255; // 白背景
      } else {
        final = 0;   // 黒文字（数字）
      }
      
      data[i] = final;     // R
      data[i + 1] = final; // G  
      data[i + 2] = final; // B
    }
    
    ctx.putImageData(imageData, 0, 0);

    // 撮影した画像を保存
    const capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(capturedImageData);
    console.log('撮影完了');

    try {
      // Netlify Functions OCRで高精度認識
      setDebugInfo('OCR開始... サーバーで日本語認識中');
      
      // 画像をBase64に変換
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      setDebugInfo('画像をサーバーに送信中...');
      
      // Railway Python Backend API を呼び出し（タイムアウト設定）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト
      
      const apiUrl = 'https://respectful-charisma-production.up.railway.app';
      console.log('API URL:', apiUrl); // デバッグ用
      const response = await fetch(`${apiUrl}/api/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageDataUrl
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'OCR処理エラー');
      }
      
      const detectedText = result.detected_text || '';
      const confidence = result.confidence || 0;
      
      setDebugInfo(`🎯 PaddleOCR結果:\n検出テキスト: "${detectedText}"\n信頼度: ${confidence}%\n\n✨ Railway Python + PaddleOCR 日本語認識`);
      
      // PaddleOCRの結果がある場合は直接使用
      let plateInfo = null;
      if (result.plate_info) {
        plateInfo = result.plate_info;
      } else if (detectedText) {
        plateInfo = parseJapanesePlate(detectedText);
      }
      
      console.log('パース結果:', plateInfo);
      
      if (!detectedText) {
        setError(`テキストが検出されませんでした。\n\n💡 コツ:\n・プレートにもっと近づく\n・明るい場所で撮影\n・水平に撮影`);
        setIsProcessing(false);
        return;
      }

      if (plateInfo && (plateInfo.region || plateInfo.number || plateInfo.hiragana)) {
        setShowSuccess(true);
        setTimeout(() => {
          onPlateDetected(plateInfo);
          onClose();
        }, 1500);
      } else {
        setError(`車番として認識できませんでした。\n\n📝 検出結果:\n"${detectedText}" (信頼度: ${confidence}%)\n\n💡 コツ:\n・漢字とひらがながはっきり見えるように\n・プレートを画面いっぱいに\n・手動入力もお試しください`);
      }
    } catch (err) {
      console.error('OCRエラー:', err);
      let errorMessage = '';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'APIリクエストがタイムアウトしました（30秒）';
        } else if (err.message === 'Load failed') {
          errorMessage = 'ネットワーク接続エラー - Wi-Fi/モバイル通信を確認してください';
        } else if (err.message.includes('API Error: 5')) {
          errorMessage = 'サーバーエラー - バックエンドの処理中にエラーが発生しました';
        } else if (err.message.includes('API Error: 4')) {
          errorMessage = 'リクエストエラー - 送信データに問題があります';
        } else {
          errorMessage = err.message;
        }
      } else {
        errorMessage = String(err);
      }
      
      setError(`画像の解析中にエラーが発生しました:\n${errorMessage}\n\n🔧 対処法:\n・Wi-Fi接続を確認\n・しばらく待ってから再試行\n・手動入力をお試しください`);
    } finally {
      setIsProcessing(false);
    }
  }, [onPlateDetected, onClose]);

  // 日本のナンバープレート形式をパース
  const parseJapanesePlate = (text: string): PlateInfo | null => {
    console.log('原文:', text);
    
    // シンプルなテキストクリーンアップ
    let cleanText = text
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log('クリーンアップ後:', cleanText);

    // 数字重視のパターンマッチング
    const patterns = [
      // 4桁の数字: "1234" → "12-34"
      /(\d{4})/,
      // ハイフン付き数字: "12-34"
      /(\d{1,2}[-－−]\d{2})/,
      // 3桁の分類番号: "500"
      /(\d{3})/,
      // 2桁から5桁の数字: "25", "000", など
      /(\d{2,5})/,
      // 英字も含む: "SHINAGAWA", "A", など
      /([A-Za-z]+)/,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = cleanText.match(pattern);
      console.log(`パターン${i + 1}マッチ:`, match);
      
      if (match) {
        let region = '';
        let classification = '';
        let hiragana = '';
        let number = '';

        const matched = match[1] || match[0];

        if (i === 0 && /^\d{4}$/.test(matched)) {
          // 4桁数字 → "12-34"形式に変換
          number = `${matched.slice(0, 2)}-${matched.slice(2)}`;
        } else if (i === 1) {
          // ハイフン付き数字
          number = matched;
        } else if (i === 2 && /^\d{3}$/.test(matched)) {
          // 3桁数字 → 分類番号として扱う
          classification = matched;
        } else if (i === 3 && /^\d{2,5}$/.test(matched)) {
          // その他の数字
          if (matched === '25') {
            number = '25'; // "ンー　２５" の "25" 部分
          } else {
            number = matched;
          }
        } else if (i === 4) {
          // 英字 → 地域名の可能性
          region = matched;
        }

        // 最低限でも何かが認識できれば成功とする
        if (number || classification || region) {
          const result = {
            region: region,
            classification: classification,
            hiragana: hiragana,
            number: number,
            fullText: `${region} ${classification} ${hiragana} ${number}`.replace(/\s+/g, ' ').trim()
          };

          console.log('パース成功:', result);
          return result;
        }
      }
    }

    console.log('パース失敗');
    return null;
  };

  return (
    <div className="camera-capture">
      <div className="camera-header">
        <h2>ナンバープレートをスキャン</h2>
        <button className="close-button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="camera-container">
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
            
            <div className="scan-frame">
              <div className="scan-corners">
                <div className="corner top-left"></div>
                <div className="corner top-right"></div>
                <div className="corner bottom-left"></div>
                <div className="corner bottom-right"></div>
              </div>
            </div>
          </>
        ) : (
          <img
            src={capturedImage}
            alt="撮影した画像"
            className="captured-image"
          />
        )}

        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>

      <div className="camera-controls">
        <button
          className="capture-button"
          onClick={capturedImage ? () => {
            setCapturedImage(null);
            setError('');
            setShowSuccess(false);
            setDebugInfo('');
          } : captureImage}
          disabled={isProcessing}
        >
          {isProcessing ? '解析中...' : 
           capturedImage ? '🔄 再撮影' : '📷 スキャンする'}
        </button>
        
        <button
          className="manual-input-button"
          onClick={() => setShowManualInput(true)}
          style={{
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '16px',
            margin: '10px',
            cursor: 'pointer'
          }}
        >
          ✏️ 手動で入力
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {debugInfo && (
        <div style={{
          backgroundColor: '#f0f8ff',
          border: '1px solid #4a90e2',
          borderRadius: '8px',
          padding: '15px',
          margin: '10px 0',
          fontFamily: 'monospace',
          fontSize: '14px',
          whiteSpace: 'pre-wrap',
          color: '#333'
        }}>
          <strong>🔍 デバッグ情報:</strong><br />
          {debugInfo}
        </div>
      )}

      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-content">
            <div className="spinner"></div>
            <p>ナンバープレートを解析中...</p>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="success-overlay">
          <div className="success-content">
            <div className="success-icon">✅</div>
            <p>スキャン成功！</p>
          </div>
        </div>
      )}

      {showManualInput && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginBottom: '20px', textAlign: 'center' }}>車番を手動入力</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>地域名（例：品川）</label>
              <input
                type="text"
                placeholder="品川"
                value={manualPlate.region}
                onChange={(e) => setManualPlate({...manualPlate, region: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>分類番号（例：500）</label>
              <input
                type="text"
                placeholder="500"
                value={manualPlate.classification}
                onChange={(e) => setManualPlate({...manualPlate, classification: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>ひらがな（例：あ）</label>
              <input
                type="text"
                placeholder="あ"
                value={manualPlate.hiragana}
                onChange={(e) => setManualPlate({...manualPlate, hiragana: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>番号（例：12-34）</label>
              <input
                type="text"
                placeholder="12-34"
                value={manualPlate.number}
                onChange={(e) => setManualPlate({...manualPlate, number: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  if (manualPlate.region || manualPlate.number) {
                    const plateInfo: PlateInfo = {
                      region: manualPlate.region,
                      classification: manualPlate.classification,
                      hiragana: manualPlate.hiragana,
                      number: manualPlate.number,
                      fullText: `${manualPlate.region} ${manualPlate.classification} ${manualPlate.hiragana} ${manualPlate.number}`.trim()
                    };
                    onPlateDetected(plateInfo);
                    onClose();
                  }
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                ✅ 登録
              </button>
              <button
                onClick={() => setShowManualInput(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="instructions">
        <p>📋 高精度認識のコツ:</p>
        <ul>
          <li>🎯 <strong>ナンバープレートが画面の1/2を占める</strong>まで近づく</li>
          <li>☀️ <strong>明るい場所</strong>で撮影（影を避ける）</li>
          <li>📐 <strong>水平に撮影</strong>（スマホを傾けない）</li>
          <li>🔍 <strong>文字がはっきり見える</strong>ことを確認</li>
          <li>📱 <strong>手ブレしない</strong>よう両手でしっかり持つ</li>
          <li>🎨 <strong>白いナンバープレート</strong>が最も認識しやすい</li>
        </ul>
        <div style={{
          background: '#e3f2fd',
          padding: '10px',
          borderRadius: '8px',
          margin: '10px 0',
          fontSize: '14px'
        }}>
          <p><strong>💡 認識精度向上：</strong></p>
          <p>Railway Python + PaddleOCR 日本語特化モードで「京都580 あ12-34」のような完全な車番情報を無料で高精度に読み取ります。</p>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;