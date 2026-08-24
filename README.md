# 🥽 WebXR 3D Media Hub & Player

A modern WebXR 3D video streaming web application designed for VR headsets and AR/3D glasses (**Meta Quest 2/3/Pro**, **Apple Vision Pro**, **Pico**, **XREAL**, **Wolvic**, **HTC Vive**, and **Chrome/Firefox WebXR**).

Vibe coded using **Google Antigravity** on **Gemini 3.6 (High)**.

---

## ✨ Features

- 📁 **Filesystem & Subfolder Dashboard**:
  - Scans and displays subdirectories as clickable `📁 Subfolder` cards directly on the main dashboard grid alongside video thumbnails.
  - Interactive **Path Breadcrumbs**: Every directory level is rendered as a clickable button segment (e.g. `Path: [🏠 /] / [📁 media] / [📁 vrfiles]`).
  - **Root-Side Breadcrumb Truncation**: Deeply nested paths collapse intermediate parent folders into a clickable `[...]` button.
  - Includes an **`[⬆️ Up]`** button at the end of the breadcrumb trail for 1-click upward navigation.

- ⭐ **Editable Quick Locations (Favorites)**:
  - 1-click ⭐ **Star Favorite Button** to add or remove any directory from Quick Locations.
  - Interactive `×` remove buttons on each chip to manage shortcuts.
  - Automatically persists favorite locations across browser sessions via `localStorage`.

- 🎥 **Universal Format & Codec Streaming Engine**:
  - **Native HTTP Range Streaming**: Fast, 0-CPU overhead byte-range streaming for `.mp4` and `.webm` files with H.264/HEVC video & AAC/MP3 audio.
  - **FFmpeg On-The-Fly Transcoder**: Real-time stream remuxing and live transcoding for `.mkv` (AC3/DTS audio converted to AAC with `-c:v copy` 0% CPU video passthrough), `.avi` (MPEG-4 Part 2/Xvid converted to H.264 ultrafast), `.wmv`, `.flv`, and `.ts` files.

- ⚡ **Performance & Intelligent Caching**:
  - **Parallel Metadata Scanning**: Probes video metadata concurrently up to 8 threads per subfolder scan via `ThreadPoolExecutor`.
  - **In-Memory Metadata Cache**: Caches `ffprobe` metadata by path, mtime, and file size for instant 0ms repeat directory scans.
  - **Bounded Thumbnail Disk Cleanup**: Automatically monitors `.thumbnails/` disk usage and cleans up oldest thumbnails when cache exceeds 150 MB or 500 files.
  - **Browser HTTP Caching**: Sets `Cache-Control: public, max-age=86400` headers on thumbnail responses for 24-hour browser caching.

- 🥽 **Native In-VR 3D HUD Control Panel**:
  - Floating 3D canvas control panel inside WebXR space with laser pointer rays.
  - 🎯 **Reticle Target Ring Dot & Laser Trimming**: Laser beam automatically scales and terminates at a magenta target dot on button hover.
  - 📳 **Controller Haptic Vibration Feedback**: Integrated WebXR Haptics API (`gamepad.hapticActuators`) triggering subtle 30ms pulses on hover and 60ms click pulses on selection.
  - ✋ **3D Drag Handle (`≡ DRAG PANEL TO MOVE`)**: Move and position the control panel anywhere in 3D VR space.
  - 🎯 **`[🎯 RE-CENTER]` Button**: Instantly re-aligns 2D cinema screens, 3D SBS/TB screens, and 180° / 360° VR video domes directly in front of your head view.
  - 🔊 **`[🔊 MUTE]` Toggle Button**: Toggle audio mute directly in VR and 2D player modes.
  - ✖ **Click-Away Auto-Hide**: Pulling the VR trigger away from the panel automatically hides the 3D HUD and laser beams; pulling the trigger in open space re-opens the HUD.
  - 🔄 **Initial 180° / 360° VR Forward Alignment**: 180° domes and 360° spheres open facing dead-ahead by default on startup.

- 📱 **Mobile & Tablet Responsive Design**:
  - Responsive card grid and stacked header controls.
  - Auto-hiding button text (`.btn-text`) on narrow screens (`≤900px`) for maximum path input space.
  - Hover tooltips displaying full un-truncated filenames across video cards, player headers, and breadcrumb paths.

- 🔒 **WebXR Secure Context Compliance**:
  - Built-in dual-server launcher (`run.py` & `ssl_service.py`): HTTP auto-redirect server on port `8000` (redirects all HTTP traffic to HTTPS) and HTTPS WebXR server on port `8443` with auto-generated self-signed SSL certificates.

---

## 🚀 Quick Start with Docker / Podman

### 1. Launch with Podman or Docker Compose

```bash
# Build and start container in background
sudo podman compose up -d --build
# or with docker compose:
docker compose up -d --build
```

The application will launch on:
- **HTTP Auto-Redirect**: `http://localhost:8000` (Redirects to HTTPS)
- **HTTPS WebXR Player**: `https://localhost:8443`

### 2. Mounting Custom Host Video Directories

By default, the host video directory points to `/media/vrfiles`. To mount your host video library (e.g. `/home/user/Videos` or `/mnt/storage`), set the `HOST_MEDIA_DIR` environment variable or edit `.env`:

```bash
# Set environment variable inline:
HOST_MEDIA_DIR=/home/user/Videos sudo podman compose up -d --build

# Or copy .env.example to .env and edit HOST_MEDIA_DIR:
cp .env.example .env
```

---

## 🥽 Connecting WebXR Compatible Headsets & Glasses

1. Ensure your VR headset (Meta Quest 2/3/Pro, Apple Vision Pro, Pico, XREAL, etc.) is connected to the same Wi-Fi network as your server.
2. Open your headset browser and navigate to `http://<your-server-ip>:8000` (which automatically redirects to `https://<your-server-ip>:8443`).
3. Accept the self-signed SSL certificate warning in your headset browser.
4. Browse your video library, choose your 3D projection format (2D, 3D SBS, 3D TB, 180° VR, 360° VR), and click **🥽 ENTER WEBXR**.

---

## 🎞️ Supported 3D & Video Formats

| Format Tag | Description | Projection Mode |
| :--- | :--- | :--- |
| **2D** | Flat Cinema Screen | Flat 2D plane 3m ahead |
| **3D SBS** | Side-by-Side Stereo | Stereo camera split (Layer 1 Left, Layer 2 Right) |
| **3D TB / OU** | Top-Bottom / Over-Under | Stereo camera split top/bottom |
| **3D 180° VR** | 180° Hemisphere VR | Equirectangular stereo dome centered forward |
| **3D 360° VR** | 360° Sphere VR | Full 360° equirectangular stereo sphere |

*Format Auto-Detection*: Automatically detects 3D mode based on filename keywords (`180`, `360`, `sbs`, `tb`, `3d`) and video resolution aspect ratios.

---

## 🛠️ Local Development (without Docker)

1. **Install System Dependencies**:
   ```bash
   sudo apt-get update && sudo apt-get install -y ffmpeg openssl
   ```

2. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run Server**:
   ```bash
   python3 run.py
   ```
   Access at `https://localhost:8443`.
