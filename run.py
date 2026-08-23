import os
import multiprocessing
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from app.services.ssl_service import generate_self_signed_cert

# Lightweight HTTP Auto-Redirect App
redirect_app = FastAPI(title="HTTP to HTTPS Redirector")

@redirect_app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"])
async def redirect_to_https(request: Request, path: str):
    host_header = request.headers.get("host", "")
    host = host_header.split(":")[0] if host_header else "localhost"
    https_port = os.getenv("HTTPS_PORT", "8443")
    
    # Build target HTTPS URL
    target_url = f"https://{host}:{https_port}/{path}"
    if request.query_params:
        target_url += f"?{request.query_params}"
        
    print(f"🔄 Redirecting HTTP request from {request.client.host} -> {target_url}")
    return RedirectResponse(url=target_url, status_code=307)

def run_http_server(port: int):
    uvicorn.run(redirect_app, host="0.0.0.0", port=port, log_level="warning")

def run_https_server(port: int, ssl_cert: str, ssl_key: str):
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, ssl_keyfile=ssl_key, ssl_certfile=ssl_cert)

if __name__ == "__main__":
    http_port = int(os.getenv("HTTP_PORT", 8000))
    https_port = int(os.getenv("HTTPS_PORT", 8443))

    ssl_cert, ssl_key = generate_self_signed_cert()

    print(f"==================================================")
    print(f"🔄 HTTP Auto-Redirect Server listening on http://0.0.0.0:{http_port}")
    print(f"🔒 HTTPS WebXR Server listening on      https://0.0.0.0:{https_port}")
    print(f"==================================================")

    # Launch HTTP Redirect Server in background process
    http_process = multiprocessing.Process(target=run_http_server, args=(http_port,))
    http_process.daemon = True
    http_process.start()

    try:
        # Run HTTPS WebXR Server on main process
        run_https_server(https_port, ssl_cert, ssl_key)
    except KeyboardInterrupt:
        print("Stopping servers...")
    finally:
        http_process.terminate()
