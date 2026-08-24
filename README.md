# WebXR 3D Video Streaming Web Application

A WebXR 3D video streaming application designed for VR headsets and AR/3D glasses (Meta Quest, Apple Vision Pro, XREAL, Pico, HTC Vive, etc.).

Vibe coded using Google Antigravity on Gemini Flash 3.6 (High)

Features:
- 📁 **Filesystem Directory Picker**: Browse and select any folder on the host/server filesystem or Docker volume mount.
- 🖼️ **Thumbnail & Video Metadata Page**: Dynamic FFmpeg thumbnail generation, video resolution, duration, codec, file size, and auto-detected 3D mode badges.
- 🥽 **WebXR 3D Stereo Video Player**: Supports 3D Side-by-Side (SBS), 3D Top-Bottom / Over-Under (TB/OU), 180° VR hemisphere, and 360° VR sphere stereo projection modes using Three.js and WebXR.
- 🐳 **Docker Ready**: Pre-packaged with Python 3.11, FastAPI, and FFmpeg/FFprobe.

---

## 🚀 Quick Start with Docker

### 1. Run with Docker Compose
To build and start the container:

```bash
docker compose up --build
```

The application will be accessible at `http://localhost:8000`.

This will auto-redirect to `https://localhost:8443` using a self-signed certificate.

### 2. Mounting Host Video Folders
By default, `./media` is mounted to `/media` inside the container. To mount your host video library (e.g. `/home/user/Videos` or `/mnt/storage`), update `docker-compose.yml`:

```yaml
services:
  webxr-player:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - /path/to/your/host/videos:/media:ro
```

---

## 🥽 Connecting WebXR Compatible Glasses / Headsets

1. Ensure your VR headset or 3D glasses (e.g., Meta Quest Browser, Safari on Apple Vision Pro, Wolvic, Chrome/Firefox with WebXR) is on the same local network.
2. Open the browser on your headset/glasses and navigate to `http://<your-computer-ip>:8000`.
3. Browse your videos, select a 3D video thumbnail, and click **🥽 ENTER WEBXR**.
4. Put on your glasses/headset to enjoy immersive 3D video playback.

---

## 🛠️ Local Development (without Docker)

1. Install system requirements:
   ```bash
   sudo apt-get install ffmpeg
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start FastAPI server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

