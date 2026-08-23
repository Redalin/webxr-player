import os
import subprocess
from pathlib import Path

CERT_DIR = Path(__file__).parent.parent.parent / "certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE = CERT_DIR / "key.pem"

def generate_self_signed_cert():
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    if CERT_FILE.exists() and KEY_FILE.exists():
        return str(CERT_FILE), str(KEY_FILE)

    print("🔑 Generating self-signed SSL certificate for HTTPS/WebXR support...")
    try:
        cmd = [
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", str(KEY_FILE),
            "-out", str(CERT_FILE),
            "-days", "365", "-nodes",
            "-subj", "/CN=WebXR-Player/O=WebXR/C=US"
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            print("✅ Self-signed SSL certificate generated successfully!")
            return str(CERT_FILE), str(KEY_FILE)
        else:
            print(f"Warning: OpenSSL cert generation returned code {result.returncode}: {result.stderr}")
    except Exception as e:
        print(f"Warning: Failed to generate SSL cert via OpenSSL: {e}")

    return None, None
