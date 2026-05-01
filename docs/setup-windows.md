# Windows Setup

This project is Windows/local-first. The scaffold does not install dependencies or create a full app yet.

## Recommended Folder Layout

Use the repository for code and demo-safe content:

```text
G:\AI-DM\06_repos\black-dice-engine
```

Keep heavy/private material outside the repo:

```text
G:\AI-DM\02_models\
G:\AI-DM\03_campaigns\
G:\AI-DM\04_assets\
```

## Initial Git Setup

```powershell
mkdir G:\AI-DM\06_repos\black-dice-engine
cd G:\AI-DM\06_repos\black-dice-engine
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
3. Select `G:\AI-DM\06_repos\black-dice-engine`.
4. Publish the repository as private.

## Notes

- Do not commit models, generated images/videos, private PDFs, campaign databases, or secrets.
- Do not install dependencies until the project stack is chosen.
- Keep setup changes documented here as the runtime takes shape.
