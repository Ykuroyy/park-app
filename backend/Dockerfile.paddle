# Railway用 軽量Python Dockerfile
FROM python:3.11-slim

# 必要最小限のライブラリのインストール
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを設定
WORKDIR /app

# requirements.txtをコピーして依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションファイルをコピー
COPY app.py .

# ポート8080を公開
EXPOSE 8080

# PaddleOCRモデルは初回実行時にダウンロード（ビルド時は不要）

# アプリケーションを起動
CMD ["python", "app.py"]