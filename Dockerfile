FROM python:3.11-slim

# Install tesseract OCR (lightweight fallback) and minimal system deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-kor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads .tts_cache

EXPOSE 8000

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
