# Asset And Storage Policy

Generated assets, model files, private campaigns, and imports should live outside the repository.

## Repository Contains

- code
- docs
- schemas
- prompt templates
- config examples
- workflow placeholders
- SRD-safe/demo-safe sample content

## Repository Does Not Contain

- model files
- generated images/videos/audio
- private campaign databases
- private PDFs
- paid adventure text
- API keys or secrets
- real player information
- private/adult table assets

## Local Asset Roots

Recommended external roots:

```text
G:\AI-DM\02_models\
G:\AI-DM\03_campaigns\
G:\AI-DM\04_assets\
```

Recommended local audio library root:

```text
G:\AI-DM\04_assets\audio\
```

Current known Ollama model root on this machine:

```text
G:\AI_Tools\OllamaModels
```

The current Git repo lives at:

```text
G:\Workspace\MyTools\Black Dice Engine
```

## Generated Media Policy

Keep:

- final images
- final videos
- selected final audio tracks or generated audio
- final prompts
- workflow id/settings
- seeds where available
- selected reference images

Delete or expire:

- temporary frames
- failed generations
- draft variations
- previews
- intermediate PNG sequences
- stale workflow copies

## Video Defaults

Short cinematic clips should be rare and queued.

Practical defaults:

- generate a still image first
- animate from image to video
- generate around 720p, then upscale if needed
- 2 to 5 seconds for normal cinematic moments
- 5 to 8 seconds for major reveals
- final 1080p maximum for early builds
- delete temp frames after successful export

## Audio Defaults

Audio should improve atmosphere without slowing the table.

Practical defaults:

- use local/cached loops before live generation
- start ambience and music loops when a scene begins
- use stingers as one-shot event sounds
- crossfade between moods instead of hard cuts
- let the GM override, mute, pause, or replace any cue
- treat AI-generated audio as prep-time or queued content, not a per-turn requirement
- keep local audio files outside Git

## Cleanup Controls

Future dashboard controls should include:

- clean temp files
- delete failed generations
- archive old session assets
- export campaign backup
- show asset disk usage

The final compressed media is usually manageable. The risky space growth comes from model hoarding, temp frames, failed generations, and draft outputs.
