import React, { useRef, useState, useCallback } from 'react';
import Tesseract from 'tesseract.js';
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

    // キャンバスのサイズをビデオに合わせる
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // 画像を描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 撮影した画像を保存
    const capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(capturedImageData);
    console.log('撮影完了');

    try {
      // シンプルなOCR実行
      setDebugInfo('OCR開始...');
      
      const result = await Tesseract.recognize(canvas, 'jpn+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            setDebugInfo(`認識中: ${progress}%`);
          }
        }
      });

      const detectedText = result.data.text.trim();
      const confidence = Math.round(result.data.confidence);
      setDebugInfo(`検出テキスト: "${detectedText}"\n信頼度: ${confidence}%`);

      if (!detectedText) {
        setError(`テキストが検出されませんでした。\n\n💡 コツ:\n・プレートにもっと近づく\n・明るい場所で撮影\n・水平に撮影\n\n検出テキスト: "${detectedText}"`);
        setIsProcessing(false);
        return;
      }

      const plateInfo = parseJapanesePlate(detectedText);
      console.log('パース結果:', plateInfo);

      if (plateInfo && (plateInfo.region || plateInfo.number || plateInfo.hiragana)) {
        setShowSuccess(true);
        setTimeout(() => {
          onPlateDetected(plateInfo);
          onClose();
        }, 1500);
      } else {
        setError(`車番として認識できませんでした。\n\n📝 検出されたテキスト:\n"${detectedText}" (信頼度: ${Math.round(result.data.confidence)}%)\n\n💡 コツ:\n・文字がはっきり見えるまで近づく\n・明るい場所で撮影\n・水平に撮影\n・手動入力もお試しください`);
      }
    } catch (err) {
      console.error('OCRエラー:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`画像の解析中にエラーが発生しました: ${errorMessage}\n\nTesseract.jsが正常に読み込まれているか確認してください。`);
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

    // シンプルなパターンマッチング
    const patterns = [
      // 完全形式: "品川 500 あ 12-34"
      /([^\d\s]{1,4})\s*(\d{3})\s*([\u3042-\u3093\u30a2-\u30f3])\s*(\d{1,2}[-－−]\d{2})/,
      // ハイフンなし: "品川 500 あ 1234"
      /([^\d\s]{1,4})\s*(\d{3})\s*([\u3042-\u3093\u30a2-\u30f3])\s*(\d{4})/,
      // 分類番号なし: "品川 あ 12-34"
      /([^\d\s]{1,4})\s*([\u3042-\u3093\u30a2-\u30f3])\s*(\d{1,2}[-－−]\d{2})/,
      // 最低限: 地域名と数字
      /([^\d\s]{2,4})\s*.*([\d\-]{2,5})/,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = cleanText.match(pattern);
      console.log(`パターン${i + 1}マッチ:`, match);
      
      if (match) {
        let region = match[1] || '';
        let classification = '';
        let hiragana = '';
        let number = '';

        if (i === 0) {
          classification = match[2] || '';
          hiragana = match[3] || '';
          number = match[4] || '';
        } else if (i === 1) {
          classification = match[2] || '';
          hiragana = match[3] || '';
          number = match[4];
          // ハイフンがない4桁の場合、ハイフンを挿入
          if (/^\d{4}$/.test(number)) {
            number = `${number.slice(0, 2)}-${number.slice(2)}`;
          }
        } else if (i === 2) {
          hiragana = match[2];
          number = match[3];
          classification = '';
        } else if (i === 3) {
          number = match[2] || '';
        }

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

      <div className="instructions">
        <p>📋 使い方:</p>
        <ul>
          <li>ナンバープレートを枠内に収める</li>
          <li>明るい場所で撮影する</li>
          <li>プレートが水平になるようにする</li>
          <li>文字がはっきり見えることを確認</li>
        </ul>
      </div>
    </div>
  );
};

export default CameraCapture;