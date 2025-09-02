# フロントエンド Railway デプロイ手順

## 🚀 Railway デプロイ（フロントエンド）

### 1. 新しいサービス作成
1. 既存のRailwayプロジェクトで "Add Service" をクリック
2. "GitHub Repo" を選択
3. 同じリポジトリを選択

### 2. フロントエンド設定
- **Root Directory**: `/` (空白でOK)
- **Build Command**: `npm run build`
- **Start Command**: `npm run preview`

### 3. 環境変数設定
```
VITE_API_URL=https://[バックエンドURL].railway.app
```

### 4. 変更をpush
新しいpackage-lock.jsonをコミット：

```bash
git add package-lock.json
git commit -m "Fix package-lock.json for Railway deployment"
git push
```

## 🔧 デプロイ後の確認

1. バックエンド: `https://[backend-url]/health`
2. フロントエンド: `https://[frontend-url]`

両方正常に動作していることを確認してください。