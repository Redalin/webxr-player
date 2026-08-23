import os
import hashlib
import subprocess
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.ts', '.wmv'}
THUMBNAIL_DIR = Path(__file__).parent.parent / ".thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

class MediaService:
    @staticmethod
    def is_video_file(file_path: Path) -> bool:
        return file_path.suffix.lower() in VIDEO_EXTENSIONS

    @staticmethod
    def browse_directory(dir_path: str) -> Dict[str, Any]:
        path = Path(dir_path).resolve()
        if not path.exists() or not path.is_dir():
            path = Path("/media").resolve()
            if not path.exists():
                path = Path(os.getcwd()).resolve()

        directories = []
        video_files = []

        try:
            entries = sorted(list(path.iterdir()), key=lambda e: (not e.is_dir(), e.name.lower()))
            for entry in entries:
                if entry.name.startswith('.'):
                    continue
                if entry.is_dir():
                    directories.append({
                        "name": entry.name,
                        "path": str(entry.resolve())
                    })
                elif entry.is_file() and MediaService.is_video_file(entry):
                    video_files.append(MediaService.get_video_info(entry))
        except PermissionError:
            pass

        parent = str(path.parent.resolve()) if path != path.parent else None

        return {
            "current": str(path),
            "parent": parent,
            "directories": directories,
            "videos": video_files
        }

    @staticmethod
    def get_video_info(file_path: Path) -> Dict[str, Any]:
        path_str = str(file_path.resolve())
        file_size = file_path.stat().st_size if file_path.exists() else 0
        
        # Default fallback metadata
        info = {
            "name": file_path.name,
            "path": path_str,
            "size": file_size,
            "formatted_size": MediaService.format_size(file_size),
            "width": 0,
            "height": 0,
            "duration": 0,
            "formatted_duration": "00:00",
            "mode_3d": MediaService.detect_3d_mode(file_path.name, 0, 0)
        }

        # Try extracting ffprobe metadata if available
        ffprobe_data = MediaService.run_ffprobe(path_str)
        if ffprobe_data:
            duration = float(ffprobe_data.get("format", {}).get("duration", 0))
            info["duration"] = duration
            info["formatted_duration"] = MediaService.format_duration(duration)

            for stream in ffprobe_data.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = int(stream.get("width", 0))
                    height = int(stream.get("height", 0))
                    info["width"] = width
                    info["height"] = height
                    info["codec"] = stream.get("codec_name", "")
                    info["mode_3d"] = MediaService.detect_3d_mode(file_path.name, width, height)
                    break

        return info

    @staticmethod
    def run_ffprobe(video_path: str) -> Optional[Dict[str, Any]]:
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                video_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
            if result.returncode == 0:
                return json.loads(result.stdout)
        except Exception:
            pass
        return None

    @staticmethod
    def detect_3d_mode(filename: str, width: int, height: int) -> str:
        fn = filename.lower()
        
        # Check VR180 / VR360 patterns first
        if re.search(r'180[_\-\.\s]?(sbs|ou|tb)?|vr180', fn):
            return "3d_180_sbs"
        if re.search(r'360[_\-\.\s]?(sbs|ou|tb)?|vr360', fn):
            return "3d_360_sbs"

        # Check Side-by-Side (SBS) patterns
        if re.search(r'sbs|3dsbs|\.sbs\.|_sbs|3dh|hsbs|half-sbs|half_sbs', fn):
            return "3d_sbs"
        
        # Check Top-Bottom / Over-Under (TB / OU) patterns
        if re.search(r'3dtb|3dou|\.tb\.|\.ou\.|_tb|_ou|overunder|over-under|topbottom|top-bottom|hou|half-ou', fn):
            return "3d_tb"

        # Generic 3D in name
        if re.search(r'\b3d\b', fn):
            # Check aspect ratio hint
            if width > 0 and height > 0:
                aspect = width / height
                if aspect >= 2.5: # e.g. 3840x1080 = 3.55 (SBS)
                    return "3d_sbs"
                elif aspect <= 1.0: # e.g. 1920x2160 = 0.88 (TB)
                    return "3d_tb"
            return "3d_sbs"

        return "2d"

    @staticmethod
    def get_or_generate_thumbnail(video_path: str) -> Optional[Path]:
        if not os.path.exists(video_path):
            return None

        # Create unique hash for video path
        path_hash = hashlib.md5(video_path.encode('utf-8')).hexdigest()
        thumb_path = THUMBNAIL_DIR / f"{path_hash}.jpg"

        if thumb_path.exists() and thumb_path.stat().st_size > 0:
            return thumb_path

        # Generate thumbnail using ffmpeg
        try:
            # First get duration to seek to ~15% or 10s
            info = MediaService.get_video_info(Path(video_path))
            duration = info.get("duration", 0)
            seek_time = max(5, int(duration * 0.15)) if duration > 10 else 1

            cmd = [
                "ffmpeg",
                "-y",
                "-ss", str(seek_time),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "3",
                "-vf", "scale=480:-1",
                str(thumb_path)
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            if result.returncode == 0 and thumb_path.exists():
                return thumb_path
        except Exception as e:
            print(f"Error generating thumbnail for {video_path}: {e}")

        return None

    @staticmethod
    def format_size(size_bytes: int) -> str:
        if size_bytes == 0:
            return "0 B"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} PB"

    @staticmethod
    def format_duration(seconds: float) -> str:
        secs = int(seconds)
        mins, secs = divmod(secs, 60)
        hrs, mins = divmod(mins, 60)
        if hrs > 0:
            return f"{hrs:02d}:{mins:02d}:{secs:02d}"
        return f"{mins:02d}:{secs:02d}"

