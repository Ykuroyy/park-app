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
    const scale = 4; // 解像度を4倍に増加（より高精度）
    canvas.width = (video.videoWidth || 640) * scale;
    canvas.height = (video.videoHeight || 480) * scale;

    console.log('キャンバスサイズ:', canvas.width, 'x', canvas.height);

    // 高品質な描画設定
    ctx.imageSmoothingEnabled = true; // アンチエイリアスを有効に
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(scale, scale);
    ctx.drawImage(video, 0, 0, canvas.width / scale, canvas.height / scale);
    
    // 改良された画像前処理（シャープネスとエッジ強調）
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // 1. グレースケール変換
    const grayData = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const idx = i / 4;
      grayData[idx] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    
    // 2. アンシャープマスク（シャープネス強調）
    const sharpened = new Float32Array(width * height);
    const radius = 2;
    const amount = 1.5;
    
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const idx = y * width + x;
        let sum = 0;
        let count = 0;
        
        // ガウシアンブラー
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nIdx = (y + dy) * width + (x + dx);
            const weight = Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius));
            sum += grayData[nIdx] * weight;
            count += weight;
          }
        }
        
        const blurred = sum / count;
        sharpened[idx] = grayData[idx] + amount * (grayData[idx] - blurred);
      }
    }
    
    // 3. 適応的二値化（Otsu法）
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < sharpened.length; i++) {
      const val = Math.max(0, Math.min(255, Math.round(sharpened[i])));
      histogram[val]++;
    }
    
    // Otsu閾値計算
    let total = sharpened.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVar = 0;
    let threshold = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      
      if (varBetween > maxVar) {
        maxVar = varBetween;
        threshold = t;
      }
    }
    
    // 4. 最終的な二値化とコントラスト調整
    for (let i = 0; i < data.length; i += 4) {
      const idx = i / 4;
      let val = sharpened[idx] || grayData[idx];
      
      // より積極的なコントラスト強化
      const contrast = 2.5;
      val = ((val - 128) * contrast) + 128;
      
      // 適応的閾値で二値化
      if (val > threshold + 10) {
        val = 255;
      } else if (val < threshold - 10) {
        val = 0;
      } else {
        val = val > threshold ? 230 : 25;
      }
      
      val = Math.max(0, Math.min(255, val));
      
      data[i] = val;     // R
      data[i + 1] = val; // G  
      data[i + 2] = val; // B
    }
    
    ctx.putImageData(imageData, 0, 0);

    // 撮影した画像を保存して画面を静止
    const capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(capturedImageData);
    console.log('撮影した画像データ:', capturedImageData.substring(0, 100) + '...');

    try {
      // Tesseract.jsでOCR実行（改良版）
      console.log('OCR開始...');
      // ナンバープレートに最適化されたPSMモード
      const psmModes = [11, 8, 7, 13]; // 11: スパーステキスト、8: 単一単語、7: 単一テキスト行
      let bestResult = null;
      let bestConfidence = 0;

      // 日本のナンバープレートで使用される全ての文字
      const plateChars = '0123456789' + 
        'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
        '品川足立練馬世田谷杉並江東葛飾江戸川' +
        '横浜川崎相模湘南' +
        '名古屋豊田岡崎' +
        '大阪なにわ和泉堺' +
        '神戸姫路' +
        '京都' +
        '福岡北九州筑豊' +
        '札幌函館旭川' +
        '仙台宮城' +
        '新潟長岡' +
        '広島福山' +
        '・ー－-';

      for (const psm of psmModes) {
        console.log(`PSMモード ${psm} で試行中...`);
        
        try {
          const result = await Tesseract.recognize(canvas, 'jpn', {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                const progress = Math.round(m.progress * 100);
                console.log(`PSM${psm} 認識中: ${progress}%`);
              }
            },
            // 最適化されたOCR設定
            psm: psm,
            // ナンバープレート特化設定
            preserve_interword_spaces: '0',
            tessedit_char_whitelist: plateChars,
            tessedit_pageseg_mode: psm.toString(),
            // 日本語認識の最適化
            language_model_penalty_non_dict_word: '0.15',
            language_model_penalty_non_freq_dict_word: '0.1',
            tessedit_zero_rejection: '1',
            tessedit_zero_kelvin_rejection: '1',
            edges_max_children_per_outline: '40',
            // 追加の最適化
            tessedit_char_blacklist: '!@#$%^&*()_+{}|:<>?[];\'",./\\`~',
            load_system_dawg: '0',
            load_freq_dawg: '0',
            textord_heavy_nr: '1',
            segment_penalty_garbage: '1',
            segment_penalty_dict_nonword: '1',
          });

          console.log(`PSM${psm} 結果:`, result.data.text.trim(), `信頼度: ${result.data.confidence}`);

          if (result.data.confidence > bestConfidence && result.data.text.trim()) {
            bestResult = result;
            bestConfidence = result.data.confidence;
          }

          // 高信頼度の結果が得られたら早期終了
          if (result.data.confidence > 60) {
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
      if (!detectedText || result.data.confidence < 10) {
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
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`画像の解析中にエラーが発生しました: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [onPlateDetected, onClose]);

  // 日本のナンバープレート形式をパース（改良版）
  const parseJapanesePlate = (text: string): PlateInfo | null => {
    console.log('原文:', text);
    
    // より積極的なテキストクリーンアップ
    let cleanText = text
      .replace(/\r?\n/g, ' ') // 改行をスペースに
      .replace(/[・]/g, ' ') // 中点をスペースに
      .replace(/\s+/g, ' ') // 複数のスペースを1つに
      .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-\s０-９]/g, '') // 不要な文字を削除
      .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFF10 + 0x30)) // 全角数字を半角に
      .replace(/[Ａ-Ｚａ-ｚ]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFF10 - 7)) // 全角英字を半角に
      // よくある誤認識を修正（改良版）
      .replace(/[|Il1]/g, '1') // 縦線、I、l、1を統一
      .replace(/[Oo]/g, '0') // O、oを0に
      .replace(/[Ss]/g, '5') // S、sを5に
      .replace(/[Zz]/g, '2') // Z、zを2に
      .replace(/[Bb]/g, '8') // B、bを8に
      .replace(/[Gg]/g, '6') // G、gを6に
      .replace(/[qg]/g, '9') // q、gを9に
      // 数字の連続を正規化
      .replace(/(\d)\s+(\d)/g, '$1$2') // 数字間のスペースを削除
      .trim();

    console.log('クリーンアップ後:', cleanText);

    // より寛容なパターンマッチング（改良版）
    const patterns = [
      // 完全形式: "品川 500 あ 12-34" または "品川 5 00 あ 12-34"
      /([^\d\s]{1,4})\s*(\d{1,3})\s*(\d{0,2})\s*([あ-んア-ン])\s*(\d{1,2}[-－−]?\d{2})/,
      // 完全形式: "品川 500 あ 12-34"
      /([^\d\s]{1,4})\s*(\d{3})\s*([あ-んア-ン])\s*(\d{1,2}[-－−]\d{2})/,
      // ハイフンなし: "品川 500 あ 1234"  
      /([^\d\s]{1,4})\s*(\d{3})\s*([あ-んア-ン])\s*(\d{4})/,
      // 分類番号が分離: "品川 5 00 あ 1234"
      /([^\d\s]{1,4})\s*(\d)\s*(\d{2})\s*([あ-んア-ン])\s*(\d{4})/,
      // 分類番号なし: "品川 あ 12-34"
      /([^\d\s]{1,4})\s*([あ-んア-ン])\s*(\d{1,2}[-－−]\d{2})/,
      // 地域名と番号のみ: "品川 1234"
      /([^\d\s]{1,4})\s*(\d{4})/,
      // 最低限: 地域名と数字
      /([^\d\s]{2,4})\s*.*(\d{1,2}[-－−]?\d{2})/,
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

        // パターンによって値を調整
        if (i === 0) { // 分離した分類番号パターン
          classification = (match[2] || '') + (match[3] || '');
          hiragana = match[4] || '';
          number = match[5] || '';
        } else if (i === 1 || i === 2) { // 完全形式
          classification = match[2] || '';
          hiragana = match[3] || '';
          number = match[4] || '';
        } else if (i === 3) { // 分類番号が分離
          classification = match[2] + match[3];
          hiragana = match[4] || '';
          number = match[5] || '';
        } else if (i === 4) { // 分類番号なしパターン
          hiragana = match[2];
          number = match[3];
          classification = '';
        } else if (i === 5) { // 地域名と番号のみ
          number = match[2] || '';
        } else if (i === 6) { // 最低限
          number = match[2] || '';
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