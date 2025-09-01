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

    console.log('キャンバスサイズ:', canvas.width, 'x', canvas.height);

    // ビデオフレームをキャンバスに描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // デバッグ用: 撮影した画像をダウンロードできるようにする
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    console.log('撮影した画像データ:', imageData.substring(0, 100) + '...');

    try {
      // Tesseract.jsでOCR実行
      console.log('OCR開始...');
      const result = await Tesseract.recognize(canvas, 'jpn+eng', {
        logger: (m) => {
          console.log('OCR進行状況:', m);
          if (m.status === 'recognizing text') {
            // 進行状況を表示
            const progress = Math.round(m.progress * 100);
            console.log(`認識中: ${progress}%`);
          }
        },
        // OCRの精度を向上させるオプション
        oem: '1', // LSTM OCRエンジンを使用
        psm: '6', // 単一のブロックテキストとして処理
      });

      console.log('OCR完了:', result);
      const detectedText = result.data.text.trim();
      console.log('検出されたテキスト:', detectedText);
      console.log('信頼度:', result.data.confidence);

      // 空または低信頼度の場合の処理
      if (!detectedText || result.data.confidence < 30) {
        setError(`テキストが検出されませんでした。(信頼度: ${Math.round(result.data.confidence)}%)\n明るい場所でナンバープレートを明確に撮影してください。`);
        setIsProcessing(false);
        return;
      }

      const plateInfo = parseJapanesePlate(detectedText);
      console.log('パース結果:', plateInfo);

      if (plateInfo && (plateInfo.region || plateInfo.number)) {
        onPlateDetected(plateInfo);
        onClose();
      } else {
        setError(`ナンバープレートとして認識できませんでした。\n検出テキスト: "${detectedText}"\n手動入力をお試しください。`);
      }
    } catch (err) {
      console.error('OCRエラー:', err);
      setError(`画像の解析中にエラーが発生しました: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [onPlateDetected, onClose]);

  // 日本のナンバープレート形式をパース
  const parseJapanesePlate = (text: string): PlateInfo | null => {
    console.log('原文:', text);
    
    // テキストのクリーンアップをより柔軟に
    let cleanText = text
      .replace(/\r?\n/g, ' ') // 改行をスペースに
      .replace(/\s+/g, ' ') // 複数のスペースを1つに
      .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-\s０-９]/g, '') // 不要な文字を削除
      .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFF10 + 0x30)) // 全角数字を半角に
      .trim();

    console.log('クリーンアップ後:', cleanText);

    // より寛容なパターンマッチング
    const patterns = [
      // 完全形式: "品川 500 あ 12-34"
      /([^\d\s]{1,4})\s*(\d{3})\s*([あ-んア-ン])\s*(\d{1,2}[-－−]\d{2})/,
      // ハイフンなし: "品川 500 あ 1234"  
      /([^\d\s]{1,4})\s*(\d{3})\s*([あ-んア-ン])\s*(\d{4})/,
      // 分類番号なし: "品川 あ 12-34"
      /([^\d\s]{1,4})\s*([あ-んア-ン])\s*(\d{1,2}[-－−]\d{2})/,
      // 最低限: 地域名と数字
      /([^\d\s]{2,4})\s*.*(\d{1,2}[-－−]?\d{2})/,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = cleanText.match(pattern);
      console.log(`パターン${i + 1}マッチ:`, match);
      
      if (match) {
        let region = match[1] || '';
        let classification = match[2] || '';
        let hiragana = match[3] || '';
        let number = match[4] || match[3] || '';

        // パターンによって値を調整
        if (patterns.indexOf(pattern) === 2) { // 分類番号なしパターン
          hiragana = match[2];
          number = match[3];
          classification = '';
        }

        // ハイフンがない4桁の場合、ハイフンを挿入
        if (/^\d{4}$/.test(number)) {
          number = `${number.slice(0, 2)}-${number.slice(2)}`;
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

    // 最後のフォールバック: 部分的な情報でも返す
    const regionMatch = cleanText.match(/([^\d\s]{2,4})/);
    const numberMatch = cleanText.match(/(\d{1,4})/);
    const hiraganaMatch = cleanText.match(/([あ-んア-ン])/);

    if (regionMatch || numberMatch || hiraganaMatch) {
      const result = {
        region: regionMatch ? regionMatch[1] : '',
        classification: '',
        hiragana: hiraganaMatch ? hiraganaMatch[1] : '',
        number: numberMatch ? numberMatch[1] : '',
        fullText: cleanText
      };
      
      console.log('部分パース:', result);
      return result;
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

        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>

      <div className="camera-controls">
        <button
          className="capture-button"
          onClick={captureImage}
          disabled={isProcessing}
        >
          {isProcessing ? '解析中...' : '📷 撮影して読み取り'}
        </button>
        
        <button
          className="debug-button"
          onClick={() => {
            if (videoRef.current && canvasRef.current) {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // 画像をダウンロード
                const link = document.createElement('a');
                link.download = 'camera-capture.jpg';
                link.href = canvas.toDataURL('image/jpeg', 0.8);
                link.click();
              }
            }
          }}
        >
          🖼️ 画像を保存（デバッグ用）
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
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