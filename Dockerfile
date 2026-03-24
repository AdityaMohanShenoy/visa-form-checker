FROM python:3.12-slim

# Install Tesseract OCR and OpenCV system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download MRZ trained data for Tesseract
RUN curl -L -o /usr/share/tesseract-ocr/5/tessdata/mrz.traineddata \
    https://github.com/DoubangoTelecom/tesseractMRZ/raw/master/tessdata_best/mrz.traineddata

WORKDIR /app

# Copy and install dependencies first (layer caching)
COPY backend/pyproject.toml backend/
COPY backend/src/ backend/src/
RUN pip install --no-cache-dir ./backend

# Create persistent data directory
RUN mkdir -p /data

ENV VISA_CHECKER_HOST=0.0.0.0
ENV VISA_CHECKER_PORT=5050
ENV VISA_CHECKER_DATA_DIR=/data
ENV VISA_CHECKER_RELOAD=false

EXPOSE 5050

CMD ["python", "-m", "visa_checker.main"]
