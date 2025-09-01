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

    // キャンバスのサイズをビデオに合わせる（超高解像度で処理）
    const scale = 3; // 解像度を3倍に増加
    canvas.width = (video.videoWidth || 640) * scale;
    canvas.height = (video.videoHeight || 480) * scale;

    console.log('キャンバスサイズ:', canvas.width, 'x', canvas.height);

    // 高品質な描画設定
    ctx.imageSmoothingEnabled = false; // ピクセル補間を無効にしてシャープに
    ctx.scale(scale, scale);
    ctx.drawImage(video, 0, 0, canvas.width / scale, canvas.height / scale);
    
    // より積極的な画像前処理
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 二値化とコントラスト強化
    for (let i = 0; i < data.length; i += 4) {
      // RGB to グレースケール
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      
      // 強力なコントラスト強化（2.0倍に増加）
      const contrast = 2.0;
      const enhanced = ((gray - 128) * contrast) + 128;
      
      // 二値化に近い処理（閾値120）
      const threshold = 120;
      let final;
      if (enhanced > threshold + 30) {
        final = Math.min(255, enhanced * 1.2); // 白をより白く
      } else if (enhanced < threshold - 30) {
        final = Math.max(0, enhanced * 0.7);   // 黒をより黒く
      } else {
        final = enhanced > threshold ? 220 : 60; // 中間値を二値化
      }
      
      final = Math.max(0, Math.min(255, final));
      
      data[i] = final;     // R
      data[i + 1] = final; // G  
      data[i + 2] = final; // B
    }
    
    ctx.putImageData(imageData, 0, 0);

    // 撮影した画像を保存して画面を静止
    const capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(capturedImageData);
    console.log('撮影した画像データ:', capturedImageData.substring(0, 100) + '...');

    try {
      // Tesseract.jsでOCR実行
      console.log('OCR開始...');
      // 複数のPSMモードで試行して最適な結果を選択
      const psmModes = [8, 7, 13, 6]; // 最適な順で試行
      let bestResult = null;
      let bestConfidence = 0;

      for (const psm of psmModes) {
        console.log(`PSMモード ${psm} で試行中...`);
        
        try {
          const result = await Tesseract.recognize(canvas, 'jpn+eng', {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                const progress = Math.round(m.progress * 100);
                console.log(`PSM${psm} 認識中: ${progress}%`);
              }
            },
            // 最適化されたOCR設定
            oem: '1', // LSTM OCRエンジン
            psm: psm.toString(),
            // ナンバープレート特化設定
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん品川新宿渋谷世田谷練馬板橋足立葛飾江戸川台東墨田荒川北豊島中野杉並目黒大田港千代田中央文京江東横浜川崎相模厚木藤沢茅ヶ崎平塚小田原',
            tessedit_pageseg_mode: psm.toString(),
            // 追加の最適化
            tessedit_char_blacklist: '!@#$%^&*()_+{}|:<>?[];\'",./\\`~',
            load_system_dawg: '0',
            load_freq_dawg: '0',
          });

          console.log(`PSM${psm} 結果:`, result.data.text.trim(), `信頼度: ${result.data.confidence}`);

          if (result.data.confidence > bestConfidence && result.data.text.trim()) {
            bestResult = result;
            bestConfidence = result.data.confidence;
          }

          // 高信頼度の結果が得られたら早期終了
          if (result.data.confidence > 70) {
            console.log(`高信頼度結果を取得、PSM${psm}で終了`);
            bestResult = result;
            break;
          }
        } catch (error) {
          console.error(`PSM${psm}でエラー:`, error);
          continue;
        }
      }

      const result = bestResult;

      if (!result) {
        setError('テキスト認識に失敗しました。\n\n💡 改善方法:\n・より明るい場所で撮影\n・プレートに近づく\n・プレートが水平になるように\n・手ブレしないようにしっかり持つ');
        setIsProcessing(false);
        return;
      }

      console.log('最終OCR結果:', result);
      const detectedText = result.data.text.trim();
      console.log('検出されたテキスト:', detectedText);
      console.log('最終信頼度:', result.data.confidence);

      // より寛容な閾値に変更
      if (!detectedText || result.data.confidence < 15) {
        setError(`テキストが検出されませんでした。(信頼度: ${Math.round(result.data.confidence)}%)\n\n🔄 複数のモードで試行済み\n\n💡 コツ:\n・プレートが水平になるように\n・文字がはっきり見えるまで近づく\n・影がかからないように\n・手動入力もご利用ください`);
        setIsProcessing(false);
        return;
      }

      const plateInfo = parseJapanesePlate(detectedText);
      console.log('パース結果:', plateInfo);

      if (plateInfo && (plateInfo.region || plateInfo.number)) {
        setShowSuccess(true);
        setTimeout(() => {
          onPlateDetected(plateInfo);
          onClose();
        }, 1500);
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
    
    // より積極的なテキストクリーンアップ
    let cleanText = text
      .replace(/\r?\n/g, ' ') // 改行をスペースに
      .replace(/\s+/g, ' ') // 複数のスペースを1つに
      .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-\s０-９]/g, '') // 不要な文字を削除
      .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFF10 + 0x30)) // 全角数字を半角に
      .replace(/[Ａ-Ｚａ-ｚ]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFF10 - 7)) // 全角英字を半角に
      // よくある誤認識を修正
      .replace(/[|Il1]/g, '1') // 縦線、I、l、1を統一
      .replace(/[Oo0]/g, '0') // O、o、0を統一
      .replace(/[Ss5]/g, '5') // S、s、5を統一
      .replace(/[Zz2]/g, '2') // Z、z、2を統一
      .replace(/[Bb8]/g, '8') // B、b、8を統一
      .replace(/[Gg6]/g, '6') // G、g、6を統一
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
          } : captureImage}
          disabled={isProcessing}
        >
          {isProcessing ? '解析中...' : 
           capturedImage ? '🔄 再撮影' : '📷 スキャンする'}
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