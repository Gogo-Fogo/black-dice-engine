import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.BDE_HOST ?? "0.0.0.0";
const port = Number(process.env.BDE_AUDIO_SERVICE_PORT ?? 4321);
const audioDir = process.env.BDE_AUDIO_DIR?.trim() || "";
const currentDir = dirname(fileURLToPath(import.meta.url));

const audioExtensions = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".webm", ".opus"]);

type AudioTrackKind = "music" | "ambience" | "stinger" | "unknown";

type AudioTrack = {
  id: string;
  filename: string;
  relativePath: string;
  localPath: string;
  urlPath: string;
  kind: AudioTrackKind;
  tags: string[];
  durationSeconds?: number;
  notes?: string;
};

type PlaybackState = {
  status: "idle" | "playing" | "paused";
  currentTrackId: string | null;
  volume: number;
  muted: boolean;
  loop: boolean;
  startedAt: string | null;
  pausedAt: string | null;
};

function inferKindFromPath(pathLower: string): AudioTrackKind {
  if (pathLower.includes("stinger")) return "stinger";
  if (pathLower.includes("ambien")) return "ambience";
  if (pathLower.includes("music")) return "music";
  return "unknown";
}

function encodeTrackId(relPath: string) {
  return Buffer.from(relPath).toString("base64url");
}

function decodeTrackId(id: string) {
  try {
    return Buffer.from(id, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function scanLibrary(root: string): AudioTrack[] {
  if (!existsSync(root)) {
    return [];
  }

  const tracks: AudioTrack[] = [];
  const allFiles = readdirSync(root, { recursive: true }) as string[];

  for (const rawRel of allFiles) {
    const relPath = rawRel.replace(/\//g, sep);
    const fullPath = join(root, relPath);

    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    const ext = extname(relPath).toLowerCase();
    if (!audioExtensions.has(ext)) continue;

    const folderParts = dirname(relPath).split(sep).filter((p) => p && p !== ".");
    const pathLower = relPath.toLowerCase();
    let kind = inferKindFromPath(pathLower);
    let tags = [...folderParts];
    let durationSeconds: number | undefined;
    let notes: string | undefined;

    const sidecarPath = `${fullPath}.json`;
    if (existsSync(sidecarPath)) {
      try {
        const meta = JSON.parse(readFileSync(sidecarPath, "utf8")) as Record<string, unknown>;
        if (typeof meta.kind === "string" && ["music", "ambience", "stinger", "unknown"].includes(meta.kind)) {
          kind = meta.kind as AudioTrackKind;
        }
        if (Array.isArray(meta.tags)) {
          tags = meta.tags.filter((t): t is string => typeof t === "string");
        }
        if (typeof meta.durationSeconds === "number") {
          durationSeconds = meta.durationSeconds;
        }
        if (typeof meta.notes === "string") {
          notes = meta.notes;
        }
      } catch {
        // ignore malformed sidecar
      }
    }

    const id = encodeTrackId(relPath);
    tracks.push({
      id,
      filename: basename(relPath),
      relativePath: relPath,
      localPath: fullPath,
      urlPath: `/audio/${relPath.replace(/\\/g, "/")}`,
      kind,
      tags,
      durationSeconds,
      notes
    });
  }

  return tracks;
}

let library = scanLibrary(audioDir);

const playbackState: PlaybackState = {
  status: "idle",
  currentTrackId: null,
  volume: 0.7,
  muted: false,
  loop: false,
  startedAt: null,
  pausedAt: null
};

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

// Serve actual audio files
app.use("/audio", express.static(audioDir, {
  dotfiles: "ignore",
  index: false,
  fallthrough: false
}));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "audio-service",
    port,
    configured: Boolean(audioDir),
    audioDir: audioDir || null,
    trackCount: library.length
  });
});

app.get("/api/library", (_request, response) => {
  response.json({
    root: audioDir || null,
    trackCount: library.length,
    tracks: library
  });
});

app.get("/api/library/:trackId", (request, response) => {
  const relPath = decodeTrackId(request.params.trackId);
  if (!relPath) {
    response.status(400).json({ error: "Invalid track id" });
    return;
  }

  const track = library.find((t) => t.id === request.params.trackId);
  if (!track) {
    response.status(404).json({ error: "Track not found" });
    return;
  }

  response.json(track);
});

app.post("/api/play", (request, response) => {
  const trackId = typeof request.body.trackId === "string" ? request.body.trackId : "";
  const track = library.find((t) => t.id === trackId);

  if (!track) {
    response.status(404).json({ error: "Track not found" });
    return;
  }

  playbackState.currentTrackId = track.id;
  playbackState.status = "playing";
  playbackState.startedAt = new Date().toISOString();
  playbackState.pausedAt = null;

  if (typeof request.body.loop === "boolean") {
    playbackState.loop = request.body.loop;
  }
  if (typeof request.body.volume === "number" && !Number.isNaN(request.body.volume)) {
    playbackState.volume = Math.max(0, Math.min(1, request.body.volume));
  }

  response.json({
    ok: true,
    playbackState,
    track
  });
});

app.post("/api/pause", (_request, response) => {
  if (playbackState.status === "playing") {
    playbackState.status = "paused";
    playbackState.pausedAt = new Date().toISOString();
  }

  response.json({
    ok: true,
    playbackState
  });
});

app.post("/api/stop", (_request, response) => {
  playbackState.status = "idle";
  playbackState.currentTrackId = null;
  playbackState.startedAt = null;
  playbackState.pausedAt = null;

  response.json({
    ok: true,
    playbackState
  });
});

app.post("/api/volume", (request, response) => {
  const volume = typeof request.body.volume === "number" ? request.body.volume : NaN;

  if (Number.isNaN(volume)) {
    response.status(400).json({ error: "volume number is required" });
    return;
  }

  playbackState.volume = Math.max(0, Math.min(1, volume));

  response.json({
    ok: true,
    playbackState
  });
});

app.post("/api/mute", (request, response) => {
  const muted = typeof request.body.muted === "boolean" ? request.body.muted : null;

  if (muted === null) {
    response.status(400).json({ error: "muted boolean is required" });
    return;
  }

  playbackState.muted = muted;

  response.json({
    ok: true,
    playbackState
  });
});

app.get("/api/status", (_request, response) => {
  const currentTrack = playbackState.currentTrackId
    ? library.find((t) => t.id === playbackState.currentTrackId) ?? null
    : null;

  response.json({
    playbackState,
    currentTrack
  });
});

app.post("/api/rescan", (_request, response) => {
  library = scanLibrary(audioDir);
  response.json({
    ok: true,
    trackCount: library.length
  });
});

// Error handler for static file 404s
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal error" });
});

server.listen(port, host, () => {
  console.log(`[audio-service] listening on http://${host}:${port}`);
  console.log(`[audio-service] library root: ${audioDir || "(not configured)"}`);
  console.log(`[audio-service] tracks loaded: ${library.length}`);
});
