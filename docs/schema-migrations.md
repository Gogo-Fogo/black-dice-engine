# Game database migrations

`services/game-server/src/schema-migrations.ts` owns the ordered SQLite schema definitions. Version 1 establishes the nine legacy JSON/meta tables; version 2 adds the five room/member and durable-command tables. Existing table and JSON formats remain unchanged. New versions must be appended: changing a published definition changes its SHA-256 checksum and causes history validation to refuse startup.

## Startup and compatibility

`openGameStore` performs read-only schema inspection before changing journal mode, then sets WAL/FULL and runs migrations. Injected legacy, authority and command repositories use the same runner on their caller-owned connection. Importing these modules does not open a database.

Empty databases start at version 0. Compatible unversioned legacy/current databases are adopted without rewriting records; missing tables are added. Adoption writes only schema/history metadata and `PRAGMA user_version`. All pending versions, table creation and history records commit in one immediate transaction. A failure rolls them back together. Repeated execution verifies the same version and history. Explicit downgrades are refused.

Inspection refuses future versions, missing/tampered history, incompatible known columns/primary keys/defaults and missing required unique keys. Unversioned databases containing only unrelated tables are refused. Compatible extra nullable/defaulted columns are retained. This is structural validation, not validation of persisted JSON, every custom constraint, trigger, index or foreign key. Unknown extra objects are preserved; their compatibility still needs review. This work does not complete ROOT-03/04 or event retention.

Starting this build against a compatible unversioned database will adopt it. Routine checks use only synthetic in-memory or owned `tmp/` databases. No real database was opened or migrated during implementation. Review and separately authorize a real-data migration before starting against a real campaign path.

## Backup, restore and rollback review

The runtime service's current backup route uses a direct main-file copy. That does **not** establish a consistent backup of an active WAL database: recent committed writes may still be in the WAL. CAP-10 remains open for a supported backup manifest, verified product restore and recovery controls. Do not treat that route as the migration prerequisite.

Before any authorized real-data adoption:

1. Stop admission and review the exact build, database path, schema/history and any custom schema objects. Preserve the original and do not work on the only copy.
2. Obtain a consistent SQLite online backup (the existing SQLite driver exposes `database.backup(destination)`) or a separately reviewed clean-close backup procedure. Keep source credentials and private backup material outside Git. A main-file copy while the source is active is insufficient.
3. Open the backup for integrity/schema checks, then restore it to a **new disposable path**. Rehearse migration there and verify authority, exact receipt replay, saved state and legacy records before selecting any real restored path. Do not overwrite an active source or replace its main file underneath an open WAL connection.
4. Retain the verified pre-migration backup. Rollback means selecting a separately restored and verified copy with its compatible build; the runner never decrements versions. These two baseline migrations are additive, but older builds do not enforce the new history/future-version protection. Do not assume they safely open future schema versions.
5. Review restored session credentials: an older backup can revive formerly revoked membership or roll back command history. Use the existing deliberate new-room/recovery flow to invalidate old authority when appropriate; do not silently reuse a restored session as current truth.

## Synthetic evidence

`tests/schema-migrations.test.mjs` runs against source and emitted modules. Six cases cover ordered upgrades/repetition, injected mid-upgrade failure with DDL/history/version rollback, byte-preserving legacy adoption and extra columns, preserved authority/receipts/state, malformed or foreign schema/history refusal, future-version refusal before persistent byte/journal changes, and WAL-aware online backup plus independent disposable restore/adoption. The backup fixture verifies committed data before and after the source changes; the restored copy retains the earlier data and passes `quick_check`.

Fixtures own their in-memory connections or ignored `tmp/migrations-*` directories and close/remove only those resources. They do not access real campaign data, private stores or providers. These fixtures establish migration compatibility and a backup mechanism, not a complete product backup/restore workflow, corruption recovery or power-loss testing.
