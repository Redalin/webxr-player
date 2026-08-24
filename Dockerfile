FROM python:3.11-slim

# Install system dependencies including ffmpeg, ffprobe, and openssl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . /app/

# Ensure /media directory exists and symlink /app/media -> /media so both paths work identically
RUN mkdir -p /media /app/.thumbnails /app/certs && \
    rm -rf /app/media && \
    ln -s /media /app/media

ENV MEDIA_DIR=/media
ENV HTTP_PORT=8000
ENV HTTPS_PORT=8443

EXPOSE 8000 8443

CMD ["python3", "run.py"]
