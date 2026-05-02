# Comfy Workflows

Repository-safe workflow metadata and placeholder references for the local media pipeline.

Current contract:

- `registry.json` is the source of truth for known workflow entries.
- Each registry entry should describe the workflow id, type, prompt-template linkage, output category, visibility, and where the real workflow file would live.
- Real ComfyUI workflow JSONs may live here later if they are lightweight and safe to share, but private outputs, generated media, models, and large workflow-specific assets must stay outside Git.

Do not commit private ComfyUI outputs, generated images/videos, downloaded models, checkpoints, or large workflow-specific assets.

Actual generated media should be stored outside the repo, for example:

```text
G:\AI-DM\04_assets\
```
