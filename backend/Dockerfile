# Railway用 軽量Python Dockerfile
FROM python:3.11-slim

# システムパッケージの更新とOpenCV用ライブラリのインストール
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0 \
    libgl1-mesa-glx \
    libglib2.0-dev \
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

# PaddleOCRのダウンロードを事前実行（ビルド時にモデルをダウンロード）
RUN python -c "import paddleocr; paddleocr.PaddleOCR(use_angle_cls=True, lang='japan', show_log=False, use_gpu=False)"

# アプリケーションを起動
CMD ["python", "app.py"]