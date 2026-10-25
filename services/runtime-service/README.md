# Runtime service

This optional Node service exposes health/runtime diagnostics. It does not start external models or own the game database.

Backup endpoints now delegate to the running game server with the caller's Bearer credential: `POST /api/backup`, `GET /api/backups`, and `POST /api/backups/:backupId/validate`. The database owner uses SQLite online backup, not a raw copy of the main file. Missing/invalid credentials fail; player credentials cannot create, list or validate backups. Runtime health no longer returns database/backup paths.

The old unauthenticated five-second startup copy is removed. Backups are currently explicit host operations; automatic session start/end policy remains unfinished under CAP-10. See [backup operations and restore limits](../../docs/backups.md). Resource telemetry and some diagnostic contracts also remain incomplete; configured URLs are not readiness evidence.
