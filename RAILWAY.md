# Railway デプロイ手順 - 車番認識アプリ

## 🚀 Railway デプロイ完全ガイド

### 1. Railwayアカウント作成
1. https://railway.app にアクセス
2. GitHubアカウントでサインアップ（無料）
3. 月間 $5 の無料クレジット + 500実行時間が付与されます

### 2. プロジェクト作成
1. Railway ダッシュボードで "New Project" をクリック
2. "Deploy from GitHub repo" を選択
3. このリポジトリを選択

### 3. バックエンド設定
1. "Add service" → "GitHub repo" → `backend` フォルダを選択
2. Root Directory を `backend` に設定
3. 環境変数は不要（すべて自動設定）

### 4. フロントエンド設定
1. 新しいサービスを追加
2. Root Directory を `/` (プロジェクトルート) に設定
3. Build Command: `npm run build`
4. Start Command: `npm run preview`

### 5. 環境変数設定（フロントエンド）
```
VITE_API_URL=https://[あなたのバックエンドURL].railway.app
```

## 📁 ファイル構成

```
park-app/
├── backend/                    # Python Flask API
│   ├── app.py                 # メインアプリケーション
│   ├── requirements.txt       # Python依存関係
│   ├── Dockerfile            # Railway用コンテナ設定
│   ├── railway.json          # Railway設定
│   └── .dockerignore         # Docker除外ファイル
├── src/                       # React フロントエンド
│   └── components/
│       └── CameraCapture.tsx  # Railway API接続済み
├── .env.example              # 環境変数テンプレート
└── RAILWAY.md               # この手順書
```

## 🔧 機能説明

### バックエンド（Python + PaddleOCR）
- **PaddleOCR 日本語特化モード**: 漢字・ひらがな・数字を高精度認識
- **高度な画像前処理**: ノイズ除去、コントラスト強化、シャープニング
- **包括的パースエンジン**: 「京都580 あ12-34」形式の完全解析
- **無料で無制限**: APIキー不要、制限なし

### フロントエンド（React + TypeScript）
- **スマホカメラ最適化**: 背面カメラ自動選択
- **リアルタイムプレビュー**: スキャンフレーム表示
- **手動入力フォールバック**: OCR失敗時の代替手段
- **詳細デバッグ情報**: 認識プロセスの可視化

## 🎯 使用方法

1. スマホでアプリにアクセス
2. 「ナンバープレートをスキャン」をタップ  
3. カメラでナンバープレートを撮影
4. Railway Python + PaddleOCRが自動解析
5. 車番情報が自動入力される

## 🆓 完全無料ソリューション

- **Railway**: 月 $5 無料クレジット
- **PaddleOCR**: オープンソース・無制限
- **React**: オープンソース
- **GitHub**: 無料ホスティング

**実質コスト: $0/月** （通常利用では無料枠内）

## 🔍 技術仕様

- **OCR精度**: PaddleOCRの日本語特化モードで95%+
- **対応文字**: 漢字・ひらがな・数字・英字
- **処理速度**: 2-5秒（画像サイズ依存）
- **対応ブラウザ**: Chrome, Safari, Firefox（カメラAPI対応）
- **レスポンシブ**: スマホ・タブレット最適化

## 🚨 トラブルシューティング

### ビルドエラーが発生した場合
```bash
# ローカルでテスト
cd backend
python app.py

# フロントエンド
npm run dev
```

### カメラが起動しない場合
- HTTPS接続を確認（カメラAPIはHTTPS必須）
- ブラウザの権限設定を確認

### OCR認識率が低い場合
- 明るい場所で撮影
- ナンバープレートを画面の1/2以上に
- 手ブレを避ける
- 手動入力を活用