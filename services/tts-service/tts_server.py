#!/usr/bin/env python3
"""Black Dice Engine TTS service — Kokoro ONNX GPU"""

import json, sys, io, os
from http.server import HTTPServer, BaseHTTPRequestHandler
import soundfile as sf
from kokoro_onnx import Kokoro

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, "kokoro-v1.0.onnx")
VOICES_PATH = os.path.join(MODEL_DIR, "voices-v1.0.bin")

print("Loading Kokoro TTS model...")
kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
print("TTS ready (GPU via ONNX).")

class TTSHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/speak":
            self.send_response(404); self.end_headers(); return
        
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        text = body.get("text", "")
        voice = body.get("voice", "bm_george")
        speed = float(body.get("speed", 1.0))
        
        if not text:
            self.send_response(400); self.end_headers(); return
        
        try:
            samples, sr = kokoro.create(text, voice=voice, speed=speed)
            
            wav_buf = io.BytesIO()
            sf.write(wav_buf, samples, sr, format="WAV", subtype="PCM_16")
            wav_bytes = wav_buf.getvalue()
            
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.end_headers()
            self.wfile.write(wav_bytes)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "service": "tts", "engine": "kokoro-onnx"}).encode())
        else:
            self.send_response(404); self.end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4323
    HTTPServer(("0.0.0.0", port), TTSHandler).serve_forever()
