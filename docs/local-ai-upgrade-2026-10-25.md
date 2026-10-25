# Local AI upgrade and character verification — October 25, 2026

## Installed and preserved

- RTX 5070 Ti: 16 GB VRAM; host RAM approximately 64 GB.
- Existing Ollama 0.23.0 rejected Qwen3.5 with HTTP 412. Downloaded official portable **Ollama 0.40.11** into ignored `tmp/tools/ollama-0.40.11`, verifying its published SHA256. Existing installed Ollama and old models were preserved.
- Installed **Qwen3.5 4B and 9B** through Ollama's official pull API in the existing model store. Both were tested using the production director adapter.
- Downloaded **FLUX.2 Klein distilled 4B**, official Comfy-Org single-file weights, into the existing ComfyUI diffusion model store. Verified all 7,751,105,712 bytes and official SHA256 `ec3d4e733a771f61c052fb4856c48b336c55eaf2c65487c2a1faeb9bbda7a343`. Reused existing Qwen3 4B text encoder and Flux2 VAE. No models were deleted.
- Existing ComfyUI **0.31.0**, PyTorch **2.10.0+cu130**, supports the required core nodes. It was started on loopback with custom nodes disabled. No ComfyUI/Python dependency update was needed for this tested model. Newer Flux3 needs a newer ComfyUI family; it was not substituted into an untested stack.
- No TTS was started. No new hosted provider was enabled. Total metered DeepSeek test estimate remains **$0.0134742** across 16 calls; local downloads/inference do not use that API balance.

Sources: [Ollama official release](https://github.com/ollama/ollama/releases/tag/v0.40.11), [Qwen3.5 library](https://ollama.com/library/qwen3.5), [Comfy-Org Flux weights](https://huggingface.co/Comfy-Org/Flux-2-Klein-4B), [ComfyUI Flux2 guide](https://docs.comfy.org/tutorials/flux/flux-2-klein).

## Working image pipeline

Forge previously requested an SDXL checkpoint that was absent from the installed checkpoint list. Forge now uses the repository's Flux2 portrait template. Registry scene, portrait, location and item jobs use matching Flux2 templates. Character portrait/scene jobs feed the uploaded approved image into `VAEEncode → ReferenceLatent → BasicGuider`; they retain the existing saved reference hash/seed, authorization, GM review, known SaveImage node and output validation boundaries. The old SDXL/IPAdapter files remain available for rollback.

Three real 768×1024 portraits completed through production Forge queue/poll functions in **32.3 seconds total**, including first-load overhead. A subsequent original reference scene completed through the actual Comfy router upload/prepare/submit path. Warm portrait execution was approximately 2.2 seconds in the Comfy log; that is model execution, not a guaranteed end-to-end latency.

Manual image review: all portraits show the requested elf, silver braids, amber eyes and teal clothing. The reference scene retains braids, glasses and cloak, but identity is not pixel-identical. The boat/art details can drift from the intended fantasy setting. Stable seeds and reference conditioning improve continuity, not guarantee it.

## Character creation fixes and evidence

- Forge's choose endpoint now accepts the same bounded 750 KB JSON envelope as portrait uploads; previously Express's 100 KB default rejected real portrait selections.
- Quick-start full casters now receive higher spell-slot tiers, rather than only level-one slots. Paladin/ranger slot progression, pact slot level/count and fighter Action Surge availability were corrected. Druid AC now matches equipped hide armor.
- Character mechanics remain deterministic; model output supplies flavor only.
- Actual live DeepSeek character flavor was generated once, then replayed through isolated authenticated HTTP creation routes for three demo members. Each saved its own generated/normalized portrait; the demo GM approved it; spectator credentials fetched the exact approved bytes. Save receipts replay exactly and characters/portraits survive restart.
- The isolated campaign starts at level five, so persisted demo sheets are level five even though the separate initial live-flavor proposal example was level three. HP, slots and labels follow the table's level.
- Focused source checks passed, 33 affected checks passed against emitted services, and the full source suite passed **182/182**. Game-server lint/build and Comfy-router lint/build passed. New large-PNG coverage exercises a real body larger than 100 KB. Runtime download hashes and real local generation are separate from mocked provider regressions.

Generated demo outputs remain ignored under `tmp/character-creation-results/`: `sheets.html` renders the actual companion sheet component with static approved-image URLs, `sheets.json` contains saved projected sheets, `portrait-1.png` through `portrait-3.png` are real GPU outputs, and `reference-scene.png` demonstrates reference conditioning. The HTML's controls are disabled. Browser automation is disabled in Work settings; browser canvas normalization, touch interaction and physical-phone rendering were not verified.

These are **quick-start sheets**, not complete rules characters: spell choices, subclass/background choices, attacks and level-up ability choices still need GM review. Existing characters are not silently rewritten by corrected Forge defaults.

## Local director

The old `BDE_DIRECTOR_MODE_MODEL` setting was advertised in status but never selected a model. An explicit configured director now calls loopback Ollama while narration/action proposals can continue using the hosted provider. Local failures return an error without paid fallback. Qwen thinking is disabled for interactive calls, and `keep_alive: 0` unloads director weights after a reply to release GPU memory for images. Party profile still disables all inference. Mocked tests cover selected model, routing, unload, non-loopback denial, sanitized failures and no fallback.

Qwen3.5 4B produced replies in 8.8/3.4 seconds on the first uncontended pair and 3.5/3.3 seconds on the next pair. **It failed the manual continuity quality gate:** it suggested a secondary objective before finishing the active goal, introduced unsupported secret/lore details, and drifted into a science-fiction mood. Successful transport and unloading are not a campaign-quality pass. The first attempt while image models were resident timed out at 60 seconds. The current ignored `.env` keeps `BDE_DIRECTOR_MODE_MODEL` empty so the tested DeepSeek path remains active. Installed local models remain optional candidates rather than automatic fallbacks.

Qwen3.5 9B completed the same two synthetic scenarios in **4.9 and 4.3 seconds**. Its completed-adventure response respected the celebration, but its active-objective response suggested negotiating access or proving worthiness at an already accessible platform, plus an optional drone/hacking complication in the fantasy setting. It also **failed the continuity/genre quality gate**. These are two-scenario checks, not a broad model benchmark; neither local model is enabled as the live director. Both unloaded after each reply. The purchased DeepSeek provider remains the active path, and no additional paid calls were made for these comparisons.

## Start the verified local runtimes

Run from the repository using existing model storage:

```powershell
.\scripts\start-local-ai.ps1 `
  -ComfyRoot 'G:\AI_Tools\ComfyUI_windows_portable' `
  -OllamaExe "$PWD\tmp\tools\ollama-0.40.11\ollama.exe" `
  -OllamaModels 'G:\AI_Tools\OllamaModels'
```

The script starts hidden loopback processes and preserves existing port owners. It installs nothing; missing paths fail. Existing port occupancy is not readiness evidence. Output/input/log directories are ignored `_data/generated`, `_data/local-ai-inputs` and `_data/local-ai-logs`. Private local configuration now points media roots at this dedicated new output directory, replacing a nonexistent asset path, and sets the upgraded optional Ollama model. It does not enumerate or move existing generated media.

Load configuration explicitly when starting the full game and router:

```powershell
node --env-file=.env scripts/session-launch.mjs --services comfy --no-build
```

This is a startup command, not permission to replace an existing server or open private data during tests. The existing live Party process/tunnel were preserved. They do not gain full-mode AI features until a separately configured full session is started. The router is not automatically started by the local-runtime helper. Preserve ignored portable tools/model storage when cleaning temporary files; the installed desktop Ollama was not overwritten.
