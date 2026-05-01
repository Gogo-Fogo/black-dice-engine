# Context File Workflow

Use this workflow when giving Codex research files, planning docs, transcripts, exports, or other source context for Black Dice Engine.

## Current Repo Location

```text
G:\Workspace\MyTools\Black Dice Engine
```

## Recommended Prompt

When starting a future Codex session, attach or mention the context files and use instructions like this:

```text
Use these files as private source context for Black Dice Engine:

- C:\Users\georg\Downloads\DND\ChatGPT_Context_Discussion.docx
- C:\Users\georg\Downloads\DND\deep-research-report.md
- C:\Users\georg\Downloads\DND\AI Dungeon Master Tool Search.docx

Repo location:
G:\Workspace\MyTools\Black Dice Engine

Read the files, extract durable project decisions, and update only sanitized repo docs or schemas.
Do not commit the original files.
Do not copy long raw passages into the repo.
Do not add private campaign data, copyrighted text, model files, generated assets, PDFs, secrets, or .env files.
Keep changes small and reviewable.
Use AGENTS.md as the working rules for this repository.
```

## Safe Handling Rules

- Prefer committing short summaries, decisions, diagrams, schemas, and implementation plans.
- Keep original documents outside Git unless they are explicitly sanitized and approved.
- If raw context needs to sit near the repo temporarily, place it in `_local-context/` or `local-context/`; both are ignored by Git.
- Treat imported research as reference material, not as product documentation until summarized.
- Keep public/demo docs free of private campaign details and copyrighted campaign text.

## Good Outputs From Context Files

Context files are useful for creating or updating:

- `docs/research-synthesis.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/local-stack.md`
- `docs/security-and-permissions.md`
- shared JSON schemas
- prompt templates
- issue lists or implementation plans

## Bad Outputs From Context Files

Avoid committing:

- Full copied transcripts.
- Full copied research reports.
- Private notes.
- Real campaign databases.
- Paid rulebook or adventure text.
- Generated images/videos.
- Model files.
- Secrets or local credentials.
