// Netlify Functions用のOCR API
// 複数のOCRサービスを組み合わせて高精度認識を実現

const Tesseract = require('tesseract.js');
const axios = require('axios');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { image } = JSON.parse(event.body);
    
    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No image provided'
        })
      };
    }

    console.log('OCR処理開始...');

    let bestResult = null;
    let bestConfidence = 0;
    let detectedText = '';

    // 戦略1: OCR.space API（無料枠：月500回）
    try {
      const ocrSpaceResult = await recognizeWithOCRSpace(image);
      if (ocrSpaceResult.confidence > bestConfidence) {
        bestResult = ocrSpaceResult;
        bestConfidence = ocrSpaceResult.confidence;
        detectedText = ocrSpaceResult.text;
      }
      console.log('OCR.space結果:', ocrSpaceResult.text);
    } catch (error) {
      console.log('OCR.space失敗:', error.message);
    }

    // 戦略2: Tesseract.js（完全無料のフォールバック）
    try {
      const tesseractResult = await Tesseract.recognize(image, 'jpn+eng', {
        logger: m => console.log(m.status, m.progress),
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        tessedit_char_whitelist: '京都品川新宿練馬世田谷杉並江東足立葛飾江戸川板橋台東墨田荒川北豊島中野目黒大田港千代田中央文京渋谷横浜川崎相模湘南名古屋大阪神戸福岡札幌仙台広島あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん0123456789-',
        preserve_interword_spaces: '1'
      });

      const tesseractText = tesseractResult.data.text.trim();
      const tesseractConf = tesseractResult.data.confidence;
      
      console.log('Tesseract.js結果:', tesseractText, 'confidence:', tesseractConf);

      if (tesseractConf > bestConfidence) {
        bestConfidence = tesseractConf;
        detectedText = tesseractText;
      }
    } catch (error) {
      console.log('Tesseract.js失敗:', error.message);
    }

    console.log('最終検出テキスト:', detectedText);

    // 日本のナンバープレートをパース
    const plateInfo = parseJapanesePlate(detectedText);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        detected_text: detectedText,
        plate_info: plateInfo,
        confidence: Math.round(bestConfidence),
        ocr_method: bestResult ? 'OCR.space' : 'Tesseract.js'
      })
    };

  } catch (error) {
    console.error('OCRエラー:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        detected_text: '',
        confidence: 0
      })
    };
  }
};

// OCR.space API（無料枠：月500回）
async function recognizeWithOCRSpace(imageData) {
  const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld'; // 無料デモキー
  
  // Base64データからFormDataを作成
  const formData = new URLSearchParams();
  formData.append('base64Image', imageData);
  formData.append('language', 'jpn'); // 日本語
  formData.append('apikey', OCR_SPACE_API_KEY);
  formData.append('scale', 'true');
  formData.append('detectOrientation', 'true');
  formData.append('OCREngine', '2'); // エンジン2が日本語に適している

  const response = await axios.post('https://api.ocr.space/parse/image', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (response.data.OCRExitCode !== 1) {
    throw new Error('OCR.space API失敗');
  }

  const text = response.data.ParsedResults[0]?.ParsedText || '';
  
  return {
    text: text.trim(),
    confidence: 85 // OCR.spaceは信頼度を返さないため固定値
  };
}

function parseJapanesePlate(text) {
  console.log('パース対象:', text);
  
  const cleanText = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  const result = {
    region: '',
    classification: '',
    hiragana: '',
    number: '',
    fullText: cleanText
  };
  
  // パターンマッチング
  const patterns = [
    /([^\d\s]{1,4})\s*(\d{3})\s*([あ-ん])\s*(\d{1,2}[-－−]\d{2})/,
    /([^\d\s]{1,4})\s*(\d{3})\s*([あ-ん])\s*(\d{4})/,
    /([^\d\s]{1,4})\s*([あ-ん])\s*(\d{1,2}[-－−]\d{2})/
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = cleanText.match(patterns[i]);
    if (match) {
      if (i === 0) {
        result.region = match[1];
        result.classification = match[2];
        result.hiragana = match[3];
        result.number = match[4];
      } else if (i === 1) {
        result.region = match[1];
        result.classification = match[2];
        result.hiragana = match[3];
        result.number = `${match[4].slice(0, 2)}-${match[4].slice(2)}`;
      } else if (i === 2) {
        result.region = match[1];
        result.hiragana = match[2];
        result.number = match[3];
      }
      console.log('パース成功:', result);
      return result;
    }
  }
  
  // 部分認識
  const regions = ['品川', '新宿', '練馬', '世田谷', '杉並', '江東', '足立'];
  for (const region of regions) {
    if (cleanText.includes(region)) {
      result.region = region;
      break;
    }
  }
  
  // 数字とひらがなの部分検索
  const numberMatch = cleanText.match(/(\d{1,2}[-－−]\d{2}|\d{4})/);
  if (numberMatch) {
    const num = numberMatch[1];
    result.number = num.length === 4 ? `${num.slice(0, 2)}-${num.slice(2)}` : num;
  }
  
  const hiraganaMatch = cleanText.match(/([あ-ん])/);
  if (hiraganaMatch) {
    result.hiragana = hiraganaMatch[1];
  }
  
  return result;
}