import os
import uvicorn
from app.services.ssl_service import generate_self_signed_cert

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    use_https = os.getenv("USE_HTTPS", "true").lower() in ("true", "1", "yes")

    ssl_key, ssl_cert = None, None
    if use_https:
        ssl_cert, ssl_key = generate_self_signed_cert()

    if ssl_cert and ssl_key:
        print(f"🔒 Starting HTTPS WebXR Server on https://0.0.0.0:{port}")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            ssl_keyfile=ssl_key,
            ssl_certfile=ssl_cert
        )
    else:
        print(f"⚠️ Starting HTTP Server on http://0.0.0.0:{port} (WebXR requires HTTPS or localhost)")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port
        )

