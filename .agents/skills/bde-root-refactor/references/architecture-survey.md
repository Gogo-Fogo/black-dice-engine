# Architecture survey for root refactoring

Adapted from Gym_App's `improve-codebase-architecture` skill (Matt Pocock, MIT; license retained in `../LICENSE-mattpocock`). Use when the user requests an architectural survey or when a requested extraction has a material design tradeoff.

Start with the user's named pain point. If the request is broad, use recent relevant history and changed files to find where maintenance work concentrates. Inspect current imports, callers, duplicated contracts, initialization effects, and decision docs. Read `docs/decisions/` instead of assuming the project has `GLOSSARY.md` or `docs/adr/`.

Look for complexity callers repeatedly manage: many files needed to understand one operation, duplicated orchestration, validation separated from application, permissions that depend on caller discipline, and resource paths coupled to file locations. A large file alone is not evidence that splitting it improves the design; a small pass-through wrapper may make navigation harder.

For each useful candidate, report:

- Concrete files/symbols and an observed maintenance problem.
- What behavior would sit behind the proposed interface, and what callers would still need to know.
- Preserved ordering, failure modes, permissions, state versions, and database/resource paths.
- The smallest migration slice, compatibility checks, and rollback path.
- Expected benefit and confidence, distinguishing observed friction from speculation.

Compare alternative interfaces only when they materially change the tradeoff. Use the deletion test: if removing an abstraction scatters necessary logic across callers, it earns its place; if its removal eliminates only forwarding, it may not.

Use a small before/after diagram when relationships are easier to assess visually. Default to Markdown/Mermaid or a self-contained in-repository artifact when requested; do not introduce a CDN, framework, or mandatory HTML reporting workflow. Keep findings synthetic and demo-safe.

Recommend a candidate and explain why it addresses the requested problem. If the task asks for implementation, continue the authorized refactor rather than turning the survey into a mandatory interview. If it asks only for options, stop with concrete recommendations. Record durable decisions in the existing documentation when the task warrants it; do not create a separate glossary or ADR system by default.
