# Database And Memory Design

The database is what turns Black Dice Engine from a chatbot into a campaign engine.

## Principle

The LLM never owns campaign truth.

AI can propose changes. The tool server validates and writes them. The database records what actually happened.

## Storage Layers

- `SQLite`: hard truth for MVP.
- `Vector index`: semantic search for lore, rules notes, scene summaries, and old sessions later.
- `JSON lorebooks`: export/import format for prompt memory and optional external tools.
- `File storage`: generated images, videos, handouts, maps, imports, and exports outside the repo.
- `Git repo`: code, schemas, prompts, docs, and demo-safe samples.

## Hard Truth

SQLite should store exact game state:

- campaigns
- sessions
- players
- characters
- NPCs
- locations
- items
- inventory entries
- quests and quest steps
- combat encounters
- initiative entries
- dice rolls
- state events
- scene packets
- asset jobs
- memory entries

The most important table is `state_events`. Current state can be derived, audited, rolled back, or replayed from state changes.

## Soft Memory

Memory/search should store:

- campaign bible facts
- scene summaries
- session summaries
- NPC motivations
- faction lore
- location notes
- open threads
- rules references
- imported source summaries

Soft memory is not authoritative for HP, gold, spell slots, conditions, initiative, or inventory.

## Prompt Memory

Prompt context should be compact and relevant:

- active scene summary
- current party state
- relevant lore entries
- current quest state
- rules snippets or tool results
- recent scene consequences

Do not paste the entire campaign into every turn. Build compact turn packets.

## Asset Metadata

Generated files should live outside the repo. The database stores metadata:

- asset id
- type
- local path
- source scene
- linked entities
- prompt and negative prompt
- workflow id
- model/checkpoint
- seed/settings where available
- visibility
- retention status

This keeps continuity possible without storing binary assets in Git.

## Future Upgrades

Start with SQLite and local files. Consider later:

- Postgres for multi-user scale.
- Qdrant or Chroma for vector search.
- Neo4j for relationship graphs.
- Redis for live session cache.
- Local object storage for very large asset archives.
