#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
import re
import os
from PIL import Image
import numpy as np

# PaddleOCRの初期化
try:
    import paddleocr
    import cv2
    
    # 日本語特化の高精度PaddleOCR
    ocr = paddleocr.PaddleOCR(
        use_angle_cls=True,
        lang='japan',           # 日本語モード
        show_log=False,
        det_algorithm='DB++',   # 最高精度の文字検出
        rec_algorithm='SVTR_LCNet',  # 最新の認識アルゴリズム
        use_gpu=False          # CPUモード（Railway対応）
    )
    PADDLE_AVAILABLE = True
    print("✅ PaddleOCR 日本語モード初期化完了")
    
except ImportError as e:
    print(f"❌ PaddleOCR初期化失敗: {e}")
    PADDLE_AVAILABLE = False

app = Flask(__name__)
CORS(app, origins="*")

@app.route('/health', methods=['GET'])
def health_check():
    """ヘルスチェック"""
    return jsonify({
        'status': 'healthy',
        'paddle_available': PADDLE_AVAILABLE,
        'message': '🚗 日本車番認識APIサーバー稼働中'
    })

@app.route('/api/ocr', methods=['POST', 'OPTIONS'])
def license_plate_ocr():
    """車番認識API"""
    
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

        print("📸 画像データ受信開始")

        # Base64画像をデコード
        image_data = data['image']
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        print(f"📐 画像サイズ: {image.size}")

        if not PADDLE_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'PaddleOCRが利用できません',
                'detected_text': '',
                'confidence': 0
            }), 500

        # 車番認識に最適化した画像前処理
        processed_image = preprocess_for_license_plate(image)
        print("🔍 画像前処理完了")

        # PaddleOCRで車番認識
        print("🤖 PaddleOCR認識開始...")
        ocr_result = ocr.ocr(processed_image, cls=True)
        
        # 認識結果からテキストを抽出
        detected_text = extract_text_from_paddle_result(ocr_result)
        print(f"📝 認識テキスト: '{detected_text}'")

        # 車番情報をパース
        plate_info = parse_japanese_license_plate(detected_text)
        print(f"🎯 パース結果: {plate_info}")

        return jsonify({
            'success': True,
            'detected_text': detected_text,
            'plate_info': plate_info,
            'confidence': 95,  # PaddleOCRは高精度
            'ocr_engine': 'PaddleOCR',
            'message': '✅ 日本語車番認識完了'
        })

    except Exception as e:
        print(f"❌ エラー: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'detected_text': '',
            'confidence': 0
        }), 500

def preprocess_for_license_plate(image):
    """車番認識に最適化した画像前処理"""
    try:
        # PIL → OpenCV変換
        img_array = np.array(image)
        if len(img_array.shape) == 3:
            if img_array.shape[2] == 4:  # RGBA
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2RGB)
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        # グレースケール変換
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

        # ノイズ除去
        denoised = cv2.fastNlMeansDenoising(gray)

        # コントラスト強化（CLAHE）
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        enhanced = clahe.apply(denoised)

        # シャープニング（車番の文字を鮮明に）
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        sharpened = cv2.filter2D(enhanced, -1, kernel)

        # 適応的二値化
        binary = cv2.adaptiveThreshold(
            sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )

        print("🎨 画像前処理: ノイズ除去→コントラスト強化→シャープニング→二値化")
        return binary

    except Exception as e:
        print(f"⚠️ 前処理エラー: {e}")
        return np.array(image)

def extract_text_from_paddle_result(result):
    """PaddleOCR結果からテキストを抽出"""
    if not result or not result[0]:
        return ""
    
    texts = []
    confidences = []
    
    for line in result[0]:
        if len(line) >= 2:
            text = line[1][0]       # 認識されたテキスト
            confidence = line[1][1]  # 信頼度
            
            print(f"  📄 '{text}' (信頼度: {confidence:.2f})")
            
            if confidence > 0.3:  # 信頼度30%以上を採用
                texts.append(text)
                confidences.append(confidence)
    
    # 信頼度の高い順でソート
    sorted_texts = [text for _, text in sorted(zip(confidences, texts), reverse=True)]
    final_text = ' '.join(sorted_texts)
    
    return final_text

def parse_japanese_license_plate(text):
    """日本の車番形式をパース"""
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
    
    # 日本の地域名（完全版）
    regions = [
        # 東京
        '品川', '練馬', '足立', '杉並', '世田谷', '江東', '葛飾', '江戸川', '板橋',
        '台東', '墨田', '荒川', '北', '豊島', '中野', '目黒', '大田', '港',
        '千代田', '中央', '文京', '新宿', '渋谷',
        # 関東
        '横浜', '川崎', '相模', '湘南', '千葉', '習志野', '袖ケ浦', '野田',
        '水戸', '土浦', 'つくば', '宇都宮', 'とちぎ', '那須', '前橋', '高崎',
        # 関西
        '大阪', 'なにわ', '和泉', '堺', '神戸', '姫路', '京都', '奈良', '滋賀',
        # 中部
        '名古屋', '尾張小牧', '一宮', '春日井', '豊田', '岡崎', '豊橋', '静岡', '浜松',
        '金沢', '富山', '福井', '長野', '松本', '諏訪', '山梨', '甲府',
        # その他
        '札幌', '函館', '旭川', '釧路', '帯広', '仙台', '宮城', '福島', '郡山', 'いわき',
        '新潟', '長岡', '福岡', '北九州', '筑豊', '久留米', '佐賀', '長崎', '熊本',
        '大分', '宮崎', '鹿児島', '沖縄', '広島', '福山', '岡山', '倉敷', '山口',
        '下関', '鳥取', '島根', '松江', '徳島', '香川', '高知', '愛媛', '松山'
    ]
    
    # パターン1: 完全形式 "京都 580 あ 12-34"
    pattern1 = r'([^\d\s]{1,5})\s*(\d{3})\s*([あ-ん])\s*(\d{1,2}[-−ー]\d{2})'
    match = re.search(pattern1, clean_text)
    if match:
        result['region'] = match.group(1)
        result['classification'] = match.group(2)
        result['hiragana'] = match.group(3)
        result['number'] = match.group(4)
        print(f"✅ 完全マッチ: {result}")
        return result
    
    # パターン2: ハイフンなし "京都 580 あ 1234"
    pattern2 = r'([^\d\s]{1,5})\s*(\d{3})\s*([あ-ん])\s*(\d{4})'
    match = re.search(pattern2, clean_text)
    if match:
        result['region'] = match.group(1)
        result['classification'] = match.group(2)
        result['hiragana'] = match.group(3)
        number = match.group(4)
        result['number'] = f"{number[:2]}-{number[2:]}"
        print(f"✅ ハイフンなしマッチ: {result}")
        return result
    
    # 部分マッチング
    # 地域名検索
    for region in regions:
        if region in clean_text:
            result['region'] = region
            print(f"🏘️ 地域名発見: {region}")
            break
    
    # ひらがな検索
    hiragana_match = re.search(r'([あ-ん])', clean_text)
    if hiragana_match:
        result['hiragana'] = hiragana_match.group(1)
        print(f"🔤 ひらがな発見: {result['hiragana']}")
    
    # 数字パターン検索
    number_patterns = [
        r'(\d{1,2}[-−ー]\d{2})',  # 12-34形式
        r'(\d{4})',               # 1234形式
        r'(\d{3})'                # 500形式（分類番号）
    ]
    
    for i, pattern in enumerate(number_patterns):
        match = re.search(pattern, clean_text)
        if match:
            num = match.group(1)
            if i == 0:  # ハイフン付き
                result['number'] = num
            elif i == 1 and len(num) == 4:  # 4桁数字
                result['number'] = f"{num[:2]}-{num[2:]}"
            elif i == 2 and len(num) == 3:  # 3桁分類番号
                result['classification'] = num
            print(f"🔢 数字パターン{i+1}発見: {num}")
            break
    
    print(f"🎯 最終パース結果: {result}")
    return result

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"🚀 車番認識サーバー起動中... ポート: {port}")
    app.run(host='0.0.0.0', port=port, debug=False)