# Third-party skill notices

These files guide development agents and are not application runtime dependencies. Reused on October 24, 2026 from the owner's local project skill collections. Source projects were read only. Their recorded upstream revisions are listed below; Black Dice Engine adaptations are described separately and must not be represented as pristine upstream snapshots.

## Matt Pocock skills, via Gym_App

- Upstream: https://github.com/mattpocock/skills
- Revision recorded by the source project: `d81f3a183412e71a5b1e84ca21bc1a35eea03a60`
- License: MIT; preserved in each copied skill's `LICENSE`.
- Copied: `codebase-design`, including `DEEPENING.md` and `DESIGN-IT-TWICE.md`; `diagnosing-bugs`.
- Adaptations: project decision paths and verification links; flexible project terminology and side-effect boundaries; preservation of useful tests; Windows-compatible debugging without the Bash helper; scoped reproduction requirements; locally performed design comparisons unless the user requests parallel agent work.
- Also adapted architecture-survey guidance from `improve-codebase-architecture` into `bde-root-refactor/references/architecture-survey.md`. Its license is retained as `bde-root-refactor/LICENSE-mattpocock`. The original skill's HTML/CDN report, mandatory interview, and glossary/ADR workflow were not imported.

## Thomas Ricouard skills, via Gym_App

- Upstream: https://github.com/Dimillian/Skills
- Revision recorded by the source project: `05ba982bfeb0d77d3c97d4542b0ee15034d05f84`
- License: MIT; preserved in `review-and-simplify-changes/LICENSE`.
- Copied: `review-and-simplify-changes`.
- Adaptations: four review lenses run locally by default; optional explicitly requested read-only parallel review respects available capacity; project validation and state/privacy constraints are linked.

## Frontend agent skills, via tsvetanski-portfolio

- Upstream: https://github.com/hueyexe/frontend-agent-skills
- Revision recorded by the source project: `2841c079dd8a9c634882227194dc42e25227710d`
- License: MIT; preserved in `information-architecture-navigation/LICENSE`.
- Copied: `information-architecture-navigation` and its four supporting references.
- Adaptation: project context for GM/player tasks, existing decision docs, private URL state, optional questions, and the requirement for authorization before telemetry.

## Vercel Web Interface Guidelines, via tsvetanski-portfolio

- Upstream: https://github.com/vercel-labs/web-interface-guidelines
- Revision recorded by the source project: `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1`
- License: MIT; preserved in `web-interface-guidelines/LICENSE`.
- Copied: pinned `guidelines.md` and the portfolio's `SKILL.md` wrapper.
- Adaptations: the wrapper uses Black Dice Engine's React/Vite and verification workflows, protects private URL state, avoids unnecessary scope questions, and treats framework/package/style examples as contextual guidance. The pinned rules remain unchanged.

## OpenAI security skill

- Upstream: https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices
- Installed from `main` on October 24, 2026; no immutable revision was recorded by that installation.
- License: retained in `security-best-practices/LICENSE.txt`.
- Its entrypoint, metadata, and references were retained without local adaptations.

Keep the license files when retaining or redistributing this guidance. Updating a source collection does not automatically update this repository's copies.
