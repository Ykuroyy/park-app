# 車番認識API - Railway Backend

## Railway デプロイ手順

1. **新しいプロジェクト作成**
   - Railway ダッシュボードで "New Project"
   - "Deploy from GitHub repo" を選択

2. **バックエンドサービス設定**
   - Root Directory: `backend`
   - Build Command: (空白 - Dockerfileを使用)
   - Start Command: (空白 - Dockerfileを使用)

3. **環境変数**
   - 設定不要（すべて自動）

## ローカルテスト
```bash
cd backend
python app.py
```

ポート8080でAPIが起動します。

## API エンドポイント

### POST /api/ocr
日本語ナンバープレート認識

**リクエスト:**
```json
{
  "image": "data:image/jpeg;base64,..."
}
```

**レスポンス:**
```json
{
  "success": true,
  "detected_text": "京都580 あ12-34",
  "plate_info": {
    "region": "京都",
    "classification": "580", 
    "hiragana": "あ",
    "number": "12-34",
    "full_text": "京都580 あ12-34"
  },
  "confidence": 95,
  "ocr_engine": "PaddleOCR"
}
```

### GET /health
ヘルスチェック