# Windows Setup

This project is Windows/local-first. The scaffold does not install dependencies or create a full app yet.

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

This repo is already initialized. For a fresh clone or rebuild, use the actual repo path:

```powershell
cd "G:\Workspace\MyTools\Black Dice Engine"
git init
git add .
git commit -m "Initial Black Dice Engine scaffold"
```

## Environment File

Use `.env.example` as a reference when a local runtime exists. Real `.env` files are ignored and should never be committed.

## GitHub Desktop

After the initial commit:

1. Open GitHub Desktop.
2. Choose `File -> Add local repository`.
3. Select `G:\Workspace\MyTools\Black Dice Engine`.
4. Publish the repository as private.

## Notes

- Do not commit models, generated images/videos, private PDFs, campaign databases, or secrets.
- Do not install dependencies until the project stack is chosen.
- Keep setup changes documented here as the runtime takes shape.
