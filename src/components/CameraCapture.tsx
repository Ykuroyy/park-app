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

    if (!ctx) return;

    // キャンバスのサイズをビデオに合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // ビデオフレームをキャンバスに描画
    ctx.drawImage(video, 0, 0);

    // 画像をBlob形式で取得
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsProcessing(false);
        return;
      }

      try {
        // Tesseract.jsでOCR実行
        const result = await Tesseract.recognize(blob, 'jpn+eng', {
          logger: m => console.log(m) // 進行状況をログ出力
        });

        const detectedText = result.data.text.trim();
        console.log('検出されたテキスト:', detectedText);

        if (detectedText) {
          const plateInfo = parseJapanesePlate(detectedText);
          if (plateInfo) {
            onPlateDetected(plateInfo);
            onClose();
          } else {
            setError('ナンバープレートを認識できませんでした。もう一度お試しください。');
          }
        } else {
          setError('テキストが検出されませんでした。ナンバープレートを明確に撮影してください。');
        }
      } catch (err) {
        console.error('OCRエラー:', err);
        setError('画像の解析中にエラーが発生しました。');
      } finally {
        setIsProcessing(false);
      }
    }, 'image/jpeg', 0.8);
  }, [onPlateDetected, onClose]);

  // 日本のナンバープレート形式をパース
  const parseJapanesePlate = (text: string): PlateInfo | null => {
    // テキストのクリーンアップ
    const cleanText = text
      .replace(/\s+/g, ' ') // 複数のスペースを1つに
      .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-\s]/g, '') // 不要な文字を削除
      .trim();

    console.log('クリーンアップ後のテキスト:', cleanText);

    // 様々なパターンでマッチングを試行
    const patterns = [
      // 標準形式: "品川 500 あ 12-34"
      /^(.{1,4})\s*(\d{3})\s*([あ-ん])\s*(\d{1,2}[-－]\d{2})$/,
      // ハイフンなし: "品川 500 あ 1234"
      /^(.{1,4})\s*(\d{3})\s*([あ-ん])\s*(\d{4})$/,
      // スペースが多い: "品川  500  あ  12-34"
      /^(.{1,4})\s+(\d{3})\s+([あ-ん])\s+(\d{1,2}[-－]\d{2})$/,
    ];

    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match) {
        let number = match[4];
        // ハイフンがない4桁の場合、ハイフンを挿入
        if (/^\d{4}$/.test(number)) {
          number = `${number.slice(0, 2)}-${number.slice(2)}`;
        }

        return {
          region: match[1],
          classification: match[3],
          hiragana: match[3],
          number: number,
          fullText: `${match[1]} ${match[2]} ${match[3]} ${number}`
        };
      }
    }

    // フォールバック: 部分的なマッチング
    const regionMatch = cleanText.match(/([^\d\s]{1,4})/);
    const numberMatch = cleanText.match(/(\d{1,2}[-－]?\d{2})/);
    const hiraganaMatch = cleanText.match(/([あ-ん])/);

    if (regionMatch || numberMatch) {
      return {
        region: regionMatch ? regionMatch[1] : '',
        classification: '',
        hiragana: hiraganaMatch ? hiraganaMatch[1] : '',
        number: numberMatch ? numberMatch[1] : '',
        fullText: cleanText
      };
    }

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