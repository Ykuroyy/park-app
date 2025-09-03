#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
import re
import os
from PIL import Image
import pytesseract
import numpy as np

app = Flask(__name__)
CORS(app, origins="*")

# Tesseractの設定
try:
    # Tesseractを使用（PaddleOCRより軽量）
    import cv2
    TESSERACT_AVAILABLE = True
    print("✅ Tesseract OCR 初期化完了")
except ImportError as e:
    print(f"❌ OpenCV初期化失敗: {e}")
    TESSERACT_AVAILABLE = False

@app.route('/health', methods=['GET'])
def health_check():
    """ヘルスチェック"""
    return jsonify({
        'status': 'healthy',
        'tesseract_available': TESSERACT_AVAILABLE,
        'message': '🚗 日本車番認識APIサーバー稼働中（Tesseract版）'
    })

@app.route('/api/ocr', methods=['POST', 'OPTIONS'])
def license_plate_ocr():
    """車番認識API（簡易版）"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return response

    try:
        # リクエストデータを取得
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': '画像データが提供されていません'
            }), 400

        print("📸 画像データ受信")

        # Base64画像をデコード
        image_data = data['image']
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # グレースケール変換
        image = image.convert('L')
        
        # NumPy配列に変換
        img_array = np.array(image)
        
        # 画像の前処理（コントラスト強化）
        if TESSERACT_AVAILABLE:
            # 二値化処理
            _, img_array = cv2.threshold(img_array, 127, 255, cv2.THRESH_BINARY)
            # ノイズ除去
            img_array = cv2.medianBlur(img_array, 3)
        
        # Tesseract OCRで認識（日本語対応）
        try:
            # 車番プレート用の設定（1行のテキストとして認識）
            custom_config = r'--oem 3 --psm 8 -l jpn -c tessedit_char_whitelist=0123456789あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん品川練馬横浜名古屋大阪京都神戸福岡札幌仙台広島-'
            detected_text = pytesseract.image_to_string(img_array, config=custom_config)
            detected_text = detected_text.strip()
            print(f"📝 認識テキスト: '{detected_text}'")
        except Exception as ocr_error:
            print(f"❌ OCRエラー: {ocr_error}")
            detected_text = ""

        # 簡易的な車番パース
        plate_info = parse_simple_plate(detected_text)

        return jsonify({
            'success': True,
            'detected_text': detected_text,
            'plate_info': plate_info,
            'confidence': 75,  # 固定値
            'ocr_engine': 'Tesseract',
            'message': '✅ 車番認識完了（Tesseract版）'
        })

    except Exception as e:
        print(f"❌ エラー: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'detected_text': '',
            'confidence': 0
        }), 500

def parse_simple_plate(text):
    """簡易的な車番パース"""
    print(f"🔍 パース対象: '{text}'")
    
    # テキスト正規化
    clean_text = text.replace('\n', ' ').replace('\r', ' ')
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    
    result = {
        'region': '',
        'classification': '',
        'hiragana': '',
        'number': '',
        'full_text': clean_text
    }
    
    # 地域名を探す
    regions = ['品川', '練馬', '横浜', '名古屋', '大阪', '京都', '神戸', '福岡']
    for region in regions:
        if region in clean_text:
            result['region'] = region
            break
    
    # 数字パターンを探す（12-34形式）
    number_match = re.search(r'(\d{1,2}[-−ー]?\d{2})', clean_text)
    if number_match:
        result['number'] = number_match.group(1)
    
    # ひらがなを探す
    hiragana_match = re.search(r'([あ-ん])', clean_text)
    if hiragana_match:
        result['hiragana'] = hiragana_match.group(1)
    
    # 3桁数字（分類番号）を探す
    class_match = re.search(r'(\d{3})', clean_text)
    if class_match:
        result['classification'] = class_match.group(1)
    
    return result

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"🚀 車番認識サーバー起動中（Tesseract版）... ポート: {port}")
    app.run(host='0.0.0.0', port=port, debug=False)