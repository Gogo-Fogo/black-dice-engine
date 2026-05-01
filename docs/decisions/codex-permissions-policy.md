# Codex Permissions Policy

Codex should be treated as a powerful engineering partner with limited workspace access.

## Recommended Access

Codex may edit this repository:

```text
G:\Workspace\MyTools\Black Dice Engine
```

Codex should not be given broad write access to the whole drive or personal folders.

## Do Not Let Codex Edit

- real campaign databases
- generated asset archives
- model folders
- private PDFs
- raw paid source material
- secrets
- `.env` files
- browser profiles
- personal documents
- downloads folders
- whole `G:\` or `C:\` drives

## Safe Workflow

1. Keep the project under Git.
2. Make small, reviewable changes.
3. Check `git status` and `git diff`.
4. Do not commit ignored/private context files.
5. Commit only code, docs, schemas, prompts, and demo-safe samples.

## Database Rule

Codex may create schemas, migrations, seed data, and dev/test databases in the repo.

Codex should not directly edit a real campaign database. Real campaign data should stay outside the repo and should be migrated only after review.

## Context Files

Private context can be placed under ignored folders such as `_local-context/`. Codex may read those files when instructed, but it should summarize durable decisions into public docs rather than committing raw transcripts or private documents.

See `docs/context-file-workflow.md`.
