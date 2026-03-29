FROM python:3.11-slim

# Install tesseract OCR (fallback) and system libs needed by easyocr/opencv
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-kor \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only PyTorch first (much smaller than GPU version)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download EasyOCR models during build (so first request is fast)
RUN python -c "import easyocr; easyocr.Reader(['ko', 'en'], gpu=False)" || true

# Create upload directory
RUN mkdir -p uploads .tts_cache

EXPOSE 8000

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
