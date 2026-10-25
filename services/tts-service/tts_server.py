#!/usr/bin/env python3
"""Optional Kokoro service. Import/configuration never load models or GPU libraries."""

import argparse
import io
import json
import math
import os
from pathlib import Path
import re
import sys
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MAX_BODY_BYTES = 65536
MAX_TEXT_LENGTH = 4000


@dataclass(frozen=True)
class TTSConfig:
    host: str
    port: int
    model_path: Path | None
    voices_path: Path | None
    check: bool = False


def read_config(args=None, env=None, root=REPOSITORY_ROOT):
    """Pure config; relative explicit paths use repo root, never the working directory."""
    env = os.environ if env is None else env
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("legacy_port", nargs="?", help="Compatibility positional port")
    parser.add_argument("--port")
    parser.add_argument("--host")
    parser.add_argument("--model", help="Explicit Kokoro ONNX model path")
    parser.add_argument("--voices", help="Explicit voices binary path")
    parser.add_argument("--check", action="store_true", help="Validate config/file presence without loading a model or opening a port")
    values = parser.parse_args(args)
    if values.port is not None and values.legacy_port is not None:
        raise ValueError("Choose --port or the compatibility positional port")
    raw_port = values.port or values.legacy_port or env.get("BDE_TTS_SERVICE_PORT", "4323")
    if not re.fullmatch(r"[0-9]+", str(raw_port)) or not 0 <= int(raw_port) <= 65535:
        raise ValueError("BDE_TTS_SERVICE_PORT/--port must be a decimal port from 0 to 65535")
    host = values.host or env.get("BDE_HOST", "").strip() or "127.0.0.1"
    if not host.strip() or any(character.isspace() for character in host):
        raise ValueError("BDE_HOST/--host must be a hostname or IP address")

    def configured_path(value):
        if value is None or not value.strip():
            return None
        path = Path(value.strip())
        return path if path.is_absolute() else Path(root) / path

    return TTSConfig(host, int(raw_port), configured_path(values.model or env.get("BDE_TTS_MODEL_PATH")),
                     configured_path(values.voices or env.get("BDE_TTS_VOICES_PATH")), values.check)


def require_model_files(config):
    # Presence checks are used only by explicit check/startup, never at module import.
    if config.model_path is None or config.voices_path is None:
        raise ValueError("Explicit BDE_TTS_MODEL_PATH and BDE_TTS_VOICES_PATH (or --model/--voices) are required")
    if not config.model_path.is_file() or not config.voices_path.is_file():
        raise ValueError("Configured TTS model/voices file is unavailable; no model was loaded")


def load_backend(config):
    """Called only by explicit startup after config/file validation. No downloads."""
    import soundfile as sf
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(str(config.model_path), str(config.voices_path))

    def synthesize(text, voice, speed):
        return kokoro.create(text, voice=voice, speed=speed)

    def encode(samples, sample_rate):
        output = io.BytesIO()
        sf.write(output, samples, sample_rate, format="WAV", subtype="PCM_16")
        return output.getvalue()

    return synthesize, encode


class TTSHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def send_json(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "tts", "engine": "kokoro-onnx", "status": "ready"})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        # One request per connection prevents unread/invalid bodies contaminating a next request.
        self.close_connection = True
        if self.path != "/speak":
            self.send_json(404, {"error": "Not found"})
            return
        raw_length = self.headers.get("Content-Length", "")
        if not re.fullmatch(r"[0-9]+", raw_length):
            self.send_json(400, {"error": "A valid Content-Length is required"})
            return
        if len(raw_length) > 6:
            self.send_json(413, {"error": "Speech request is too large"})
            return
        length = int(raw_length)
        if length > MAX_BODY_BYTES:
            self.send_json(413, {"error": "Speech request is too large"})
            return
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError("Incomplete body")
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError("Object required")
            text, voice, speed = body.get("text"), body.get("voice", "bm_george"), body.get("speed", 1.0)
            if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_LENGTH:
                raise ValueError("Invalid text")
            if not isinstance(voice, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", voice):
                raise ValueError("Invalid voice")
            if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not .5 <= speed <= 2 or not math.isfinite(speed):
                raise ValueError("Invalid speed")
        except (ValueError, UnicodeDecodeError):
            self.send_json(400, {"error": "Expected nonempty text up to 4000 characters, a voice name and speed from 0.5 to 2"})
            return
        except (TimeoutError, ConnectionError):
            self.send_json(408, {"error": "Speech request body timed out"})
            return
        try:
            samples, sample_rate = self.server.synthesize(text, voice, float(speed))
            wav = self.server.encode(samples, sample_rate)
        except Exception:
            # Backend errors can contain private model paths or prompt text.
            self.send_json(500, {"error": "Speech generation failed"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, _format, *_args):
        # Never log request text, user-controlled paths or local model details.
        return


class TTSServer(HTTPServer):
    # Windows SO_REUSEADDR permits a second live listener; keep port ownership exclusive.
    allow_reuse_address = False
    def __init__(self, config, synthesize, encode):
        self.synthesize = synthesize
        self.encode = encode
        super().__init__((config.host, config.port), TTSHandler)


def main(args=None, env=None):
    try:
        config = read_config(args, env)
        require_model_files(config)
        if config.check:
            print("TTS configuration and file presence verified. No model loaded or port opened.")
            return 0
        # Claim the port before loading the optional backend; an occupied port never loads a model.
        with TTSServer(config, None, None) as server:
            server.synthesize, server.encode = load_backend(config)
            print(f"[tts-service] listening on http://{config.host}:{server.server_port}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
        return 0
    except (ValueError, OSError, ImportError, RuntimeError):
        print("TTS startup failed. Check explicit model/voices paths, port and installed optional backend; no files were downloaded.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
