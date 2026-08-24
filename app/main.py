import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Query, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.services.media_service import MediaService

app = FastAPI(title="WebXR 3D Video Streamer", version="1.0.0")

# Setup base directories
BASE_DIR = Path(__file__).parent.parent
STATIC_DIR = BASE_DIR / "app" / "static"
MEDIA_ROOT = os.getenv("MEDIA_DIR", "/media")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    raise HTTPException(status_code=404, detail="Index page not found")

@app.get("/api/browse")
async def browse(path: Optional[str] = Query(None)):
    target_path = path if path else MEDIA_ROOT
    if not os.path.exists(target_path):
        target_path = os.getcwd()
    result = MediaService.browse_directory(target_path)
    return result

@app.get("/api/thumbnail")
async def get_thumbnail(path: str = Query(...)):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Video file not found")
    
    thumb_path = MediaService.get_or_generate_thumbnail(path)
    if thumb_path and thumb_path.exists():
        return FileResponse(
            str(thumb_path),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    
    # SVG Fallback icon if ffmpeg thumbnail failed
    svg_placeholder = """<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" fill="#1e1e28"><rect width="480" height="270" fill="#181824"/><polygon points="210,105 290,135 210,165" fill="#6366f1"/></svg>"""
    return Response(
        content=svg_placeholder,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"}
    )

@app.get("/api/stream")
async def stream_video(request: Request, path: str = Query(...)):
    if not os.path.exists(path) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Video file not found")

    file_size = os.path.getsize(path)
    range_header = request.headers.get('range')

    if not range_header:
        return FileResponse(path, media_type=get_media_type(path))

    # Parse Range Header (e.g. bytes=0-1024)
    range_match = range_header.replace('bytes=', '').split('-')
    start = int(range_match[0]) if range_match[0] else 0
    end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1

    if start >= file_size or end >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    chunk_size = (end - start) + 1

    def iter_file(file_path: str, start_pos: int, bytes_to_read: int):
        with open(file_path, mode="rb") as file:
            file.seek(start_pos)
            bytes_left = bytes_to_read
            while bytes_left > 0:
                chunk = file.read(min(1024 * 1024, bytes_left)) # 1MB chunk size
                if not chunk:
                    break
                bytes_left -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
        "Content-Type": get_media_type(path),
    }

    return StreamingResponse(
        iter_file(path, start, chunk_size),
        status_code=206,
        headers=headers
    )

def get_media_type(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.ts': 'video/mp2t'
    }
    return types.get(ext, 'application/octet-stream')

