"""Synthetic stdlib-only TTS checks. Never import GPU libraries or open real models."""
import builtins
import contextlib
import http.client
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

root = Path(sys.argv.pop(1)).resolve()
import_original = builtins.__import__


def reject_optional_import(name, *args, **kwargs):
    if name.split(".")[0] in {"soundfile", "kokoro_onnx", "onnxruntime"}:
        raise AssertionError("A model/GPU dependency was imported during a synthetic check")
    return import_original(name, *args, **kwargs)


builtins.__import__ = reject_optional_import
spec = importlib.util.spec_from_file_location("bde_tts_synthetic", root / "services/tts-service/tts_server.py")
tts = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = tts
spec.loader.exec_module(tts)


class TTSChecks(unittest.TestCase):
    def test_pure_configuration_and_explicit_paths(self):
        config = tts.read_config([], {})
        self.assertEqual((config.host, config.port), ("127.0.0.1", 4323))
        self.assertIsNone(config.model_path)
        self.assertIsNone(config.voices_path)
        self.assertEqual(tts.REPOSITORY_ROOT, root)
        for port in ["-1", "65536", "1e3", "NaN", "1.2"]:
            with self.assertRaises(ValueError):
                tts.read_config([], {"BDE_TTS_SERVICE_PORT": port})
        self.assertEqual(tts.read_config(["4324"], {}).port, 4324)
        self.assertEqual(tts.read_config(["--port", "0"], {}).port, 0)
        with self.assertRaises(ValueError):
            tts.read_config(["4324", "--port", "4325"], {})
        with self.assertRaises(ValueError):
            tts.require_model_files(config)
        fixture_root = root / "tmp" / "synthetic path with spaces"
        explicit = tts.read_config(["--model", "demo/model.onnx", "--voices", "demo/voices.bin"], {}, fixture_root)
        self.assertEqual(explicit.model_path, fixture_root / "demo/model.onnx")
        self.assertEqual(explicit.voices_path, fixture_root / "demo/voices.bin")

    def test_check_mode_never_loads_backend_or_opens_a_server(self):
        with tempfile.TemporaryDirectory(prefix="tts-config-", dir=root / "tmp") as folder:
            model, voices = Path(folder) / "fake.onnx", Path(folder) / "fake.bin"
            model.write_bytes(b"synthetic-not-a-model")
            voices.write_bytes(b"synthetic-not-voices")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(tts.main(["--check", "--model", str(model), "--voices", str(voices)], {}), 0)
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(tts.main(["--check"], {}), 1)
                self.assertEqual(tts.main(["--model", str(model), "--voices", str(voices) + "-missing"], {}), 1)
                # A port conflict must fail before even attempting an optional model import.
                config = tts.read_config(["--port", "0"], {})
                with tts.TTSServer(config, None, None) as occupied:
                    self.assertEqual(tts.main(["--port", str(occupied.server_port), "--model", str(model), "--voices", str(voices)], {}), 1)

    def test_synthetic_http_success_validation_and_failure_recovery(self):
        calls = []

        def synthesize(text, voice, speed):
            calls.append((text, voice, speed))
            if text == "Backend failure":
                raise RuntimeError("PRIVATE_MODEL_PATH PRIVATE_TEXT")
            return [0, 1], 24000

        server = tts.TTSServer(tts.TTSConfig("127.0.0.1", 0, None, None), synthesize, lambda _samples, _rate: b"RIFFsyntheticWAVE")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def request(body=None, path="/speak", raw=None, declared_length=None):
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
            try:
                if declared_length is not None:
                    # Check admission from headers before uploading a rejected body.
                    # Sending after the server closes can race a TCP reset on Windows.
                    connection.putrequest("POST", path)
                    connection.putheader("Content-Type", "application/json")
                    connection.putheader("Content-Length", str(declared_length))
                    connection.endheaders()
                elif body is None and raw is None:
                    connection.request("GET", path)
                else:
                    connection.request("POST", path, raw if raw is not None else json.dumps(body), {"Content-Type": "application/json"})
                response = connection.getresponse()
                return response.status, response.getheader("Content-Type"), response.read()
            finally:
                connection.close()

        try:
            self.assertEqual(json.loads(request(path="/health")[2])["status"], "ready")
            status, content_type, wav = request({"text": "Synthetic hello"})
            self.assertEqual((status, content_type, wav), (200, "audio/wav", b"RIFFsyntheticWAVE"))
            self.assertEqual(calls, [("Synthetic hello", "bm_george", 1.0)])
            for invalid in [[], {}, {"text": ""}, {"text": 123}, {"text": "x" * 4001}, {"text": "Demo", "voice": "../private"},
                            {"text": "Demo", "speed": True}, {"text": "Demo", "speed": 0}, {"text": "Demo", "speed": 10**1000}, {"text": "Demo", "speed": "1.0"}, {"text": "Demo", "speed": float("nan")}]:
                self.assertEqual(request(invalid)[0], 400)
            self.assertEqual(request(raw="not json")[0], 400)
            boundary_body = json.dumps({"text": "Body size boundary"})
            boundary_body += " " * (tts.MAX_BODY_BYTES - len(boundary_body))
            self.assertEqual(request(raw=boundary_body)[0], 200)
            before_rejection = len(calls)
            self.assertEqual(request(declared_length=tts.MAX_BODY_BYTES + 1)[0], 413)
            self.assertEqual(request(declared_length=10**7)[0], 413)
            self.assertEqual(request(declared_length="invalid")[0], 400)
            self.assertEqual(len(calls), before_rejection)
            status, _, body = request({"text": "Backend failure"})
            self.assertEqual(status, 500)
            self.assertNotIn(b"PRIVATE", body)
            self.assertEqual(request({"text": "After failure", "voice": "bm_george", "speed": 1.5})[0], 200)
            self.assertEqual(request(path="/missing")[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            self.assertFalse(thread.is_alive())


if __name__ == "__main__":
    unittest.main()
