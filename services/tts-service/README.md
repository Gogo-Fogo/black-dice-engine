# Optional local TTS

This Python adapter is separate from npm workspaces and is never automatically launched by either session launcher. It requires an existing Python 3.10+ interpreter and, for real speech, separately provisioned `kokoro-onnx`, `soundfile`, model and voice files. No installation or download is performed by the service.

Import and `read_config()` use only the standard library and never load models. Startup requires explicit `--model`/`--voices` or `BDE_TTS_MODEL_PATH`/`BDE_TTS_VOICES_PATH`; relative paths resolve from the repository root, independent of cwd. There is no fallback model location or `.env` discovery. `BDE_HOST` defaults to `127.0.0.1`; `--host` overrides it. `--port` overrides `BDE_TTS_SERVICE_PORT` (default 4323); the old positional port remains supported. Ports must be decimal 0–65535.

```powershell
python services/tts-service/tts_server.py --check --model "<explicit model path>" --voices "<explicit voices path>"
```

`--check` validates configuration and file presence without importing the optional backend, loading models or binding a port. Real startup omits `--check`, claims the port first, then loads the configured backend. `/health` reports readiness after startup. `/speak` accepts JSON `text` (1–4000 characters), optional `voice` (default `bm_george`) and numeric `speed` (0.5–2), returning WAV bytes. Requests have a 64 KiB body limit and a five-second body-read timeout. Validation and backend errors contain no model paths or submitted speech. Inference remains synchronous; backend inference timeout/cancellation and real voice/model compatibility are separate unverified capability work.

`tests/tts-config.test.mjs` invokes an existing `python` interpreter with isolated standard-library-only tests. It rejects any import of Kokoro/soundfile/ONNX, checks only synthetic files under ignored `tmp`, and injects fake synthesis/encoding for actual loopback HTTP checks. These tests prove configuration, port-conflict behavior, request validation and failure recovery, not live speech quality or GPU readiness.
