// Netlify Functions用のOCR API
// PaddleOCRの代わりにTesseract.jsのNode.js版を使用

const Tesseract = require('tesseract.js');

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

    // Tesseract.jsで日本語＋英語認識（Node.js版は高性能）
    const result = await Tesseract.recognize(image, 'jpn+eng', {
      logger: m => console.log(m),
      // より高精度な設定
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
      tessedit_char_whitelist: '品川新宿練馬世田谷杉並江東足立葛飾江戸川板橋台東墨田荒川北豊島中野目黒大田港千代田中央文京渋谷横浜川崎相模湘南名古屋大阪神戸京都福岡札幌仙台広島あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん0123456789-'
    });

    const detectedText = result.data.text.trim();
    console.log('検出テキスト:', detectedText);

    // 日本のナンバープレートをパース
    const plateInfo = parseJapanesePlate(detectedText);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        detected_text: detectedText,
        plate_info: plateInfo,
        confidence: Math.round(result.data.confidence)
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