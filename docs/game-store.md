# Explicit game-store ownership

## Boundary and compatibility

The game-server entrypoint reads validated runtime configuration once and explicitly calls `openGameStore(databasePath)` before constructing session authority and command storage. Importing `src/db.ts` reads no environment/configuration, creates no directory and opens no SQLite database. The configured/default database path still comes from the Node-only runtime-config workspace: repository-root `_data/black-dice-engine.db` by default, or an explicit override. No database is moved and no real data migration is performed by this refactor.

`openGameStore` requires an absolute path (or explicit `:memory:`), creates the parent when needed, opens SQLite, sets WAL and synchronous FULL, initializes the existing legacy tables and returns the repository plus its owned `database` and idempotent `close()`. Initialization failure closes an opened connection before throwing. Server SIGINT/SIGTERM handlers persist through the existing transaction and explicitly close the store before exiting. The [server lifecycle owner](server-lifecycle.md) stops scheduled/request work and drains owned transports before that final save/close.

`createLegacyRepository(connection)` binds helpers to an injected caller-owned connection. It does not close or configure that connection; the caller invokes `initDb()` where needed. Authority, command receipts and legacy rows still use the same server connection. Nested replacement transactions therefore remain inside the outer command commit; a failed write rolls back rows together with receipts/state instead of creating a second store.

## Table behavior and discovered defect

Legacy table layouts, JSON payloads, metadata keys and descending timestamp/creation ordering are preserved. Generic JSON helpers accept only the two existing application table choices, `party` and `asset_records`; other tables retain dedicated helpers. Values remain bound parameters.

The prior asset save path wrote only `(id, data)` into a table with required `status`. Nonempty asset persistence failed with SQLITE_CONSTRAINT_NOTNULL. The asset-specific insert now writes `(id, data, status)`. Its TypeScript overload requires status, while SQLite still rejects a malformed runtime row and rolls back the table replacement. No column or stored JSON format changed. This repairs persistence, not generated-file existence, asset publication policy or complete legacy-record validation.

## Evidence and limits

`tests/legacy-persistence.test.mjs` imports a fresh module with invalid config canaries and an unused synthetic path, proving it does not initialize a store. It checks independent injected memory connections, outer-transaction rollback across multiple helpers, relative-path refusal, WAL/FULL, idempotent close, reopen, all eight legacy table formats, meta and ordering. Invalid asset replacement and unsupported table identifiers preserve valid rows. `BDE_TEST_BUILT=1` selects emitted persistence code as well as emitted server children.

`tests/host-responses.test.mjs` creates original synthetic asset metadata through authenticated routes, saves and restarts, and checks restored records. Existing Party/TTRPG API and launcher suites exercise the same configured startup, atomic command rollback, lost-reply retry and restart boundaries. These tests never inspect `_data`, private campaigns/models/assets or a real `.env`.

ENGINE-08 now also has [clock/dice/request injection and lifecycle ownership](server-lifecycle.md). ENGINE-06 adds [versioned additive migrations and backup/restore compatibility review](schema-migrations.md): read-only preflight precedes WAL configuration, and one transactional runner owns legacy, authority and command schemas. ENGINE-07 [bounds redundant command metadata while preserving exact receipts/checkpoints](command-history.md). Legacy JSON validation and the product backup/restore workflow remain open. To roll back the API extraction, restore the database module and server startup caller together; preserve the corrected asset insert and review schema compatibility. Never alter user records to compensate for a code rollback.
