# Windows Setup

This project is Windows/local-first. The scaffold does not install dependencies or create a full app yet.

Published GitHub repository:

```text
https://github.com/Gogo-Fogo/black-dice-engine
```

## Recommended Folder Layout

Current repository location:

```text
G:\Workspace\MyTools\Black Dice Engine
```

Use the repository for code, docs, schemas, prompts, and demo-safe content only. Keep heavy/private material outside the repo. Suggested external roots:

```text
G:\AI-DM\02_models\
G:\AI-DM\03_campaigns\
G:\AI-DM\04_assets\
```

On this machine, Ollama model storage has also been configured separately at:

```text
G:\AI_Tools\OllamaModels
```

These external paths are configurable. The important rule is that model files, real campaigns, generated assets, and private imports do not live in Git.

## Initial Git Setup

This repo is already initialized, published privately, and uses `main` as the default branch. For a fresh clone or rebuild:

```powershell
cd "G:\Workspace\MyTools"
git clone https://github.com/Gogo-Fogo/black-dice-engine.git "Black Dice Engine"
```

## Environment File

Use `.env.example` as a reference when a local runtime exists. Real `.env` files are ignored and should never be committed.

## GitHub Desktop

For this existing local repo:

1. Open GitHub Desktop.
2. Choose `File -> Add local repository`.
3. Select `G:\Workspace\MyTools\Black Dice Engine`.
4. Confirm it tracks `origin/main`.

For a fresh clone, use `File -> Clone repository` and choose `Gogo-Fogo/black-dice-engine`.

## Notes

- Do not commit models, generated images/videos, private PDFs, campaign databases, or secrets.
- Do not install dependencies until the project stack is chosen.
- Keep setup changes documented here as the runtime takes shape.
