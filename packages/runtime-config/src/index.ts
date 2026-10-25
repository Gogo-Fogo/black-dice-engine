import { fileURLToPath } from "node:url";
import { isAbsolute, join, resolve } from "node:path";

/** Source and emitted modules are both one directory below this package. No I/O. */
export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** Explicit operator-selected origin; never infer a trusted URL from proxy headers. */
export function readPublicOrigin(value = "") {
  if (!value.trim()) return "";
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("BDE_PUBLIC_ORIGIN must be an HTTPS origin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BDE_PUBLIC_ORIGIN must be an HTTPS origin without credentials, path, query or fragment");
  }
  return url.origin;
}

export function readRuntimeProfile(env: NodeJS.ProcessEnv = process.env): "party" | "full" {
  const value = env.BDE_RUNTIME_PROFILE?.trim() || "full";
  if (value !== "party" && value !== "full") throw new Error("BDE_RUNTIME_PROFILE must be party or full");
  return value;
}

function settings(env: NodeJS.ProcessEnv, root: string) {
  const profile = readRuntimeProfile(env);
  const text = (key: string, fallback = "") => env[key]?.trim() || fallback;
  const port = (key: string, fallback: number) => {
    const raw = text(key, String(fallback));
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value > 65535) throw new Error(`${key} must be a valid port`);
    return value;
  };
  const path = (key: string, fallback: string) => {
    const value = text(key, fallback);
    return isAbsolute(value) ? value : resolve(root, value);
  };
  const optionalPath = (key: string) => profile === "party" || !text(key) ? "" : path(key, "");
  const endpoint = (key: string, fallback = "") => {
    if (profile === "party") return "";
    const value = text(key, fallback);
    if (!value) return "";
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`${key} must be an HTTP(S) URL`); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error(`${key} must be an HTTP(S) base URL without credentials, query or fragment`);
    return value.replace(/\/$/, "");
  };
  return { profile, text, port, path, optionalPath, endpoint };
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env, root = repositoryRoot) {
  const { profile, text, port, path, optionalPath, endpoint } = settings(env, root);
  const repoExportsRoot = path("BDE_EXPORT_ROOT", "_exports");
  const backupFlag = text("BDE_AUTO_BACKUP", "1");
  if (!["0", "1"].includes(backupFlag)) throw new Error("BDE_AUTO_BACKUP must be 0 or 1");
  return {
    profile,
    publicOrigin: readPublicOrigin(env.BDE_PUBLIC_ORIGIN),
    host: text("BDE_HOST", "127.0.0.1"),
    gameServerPort: port("BDE_GAME_SERVER_PORT", 4310),
    databasePath: path("BDE_DB_PATH", "_data/black-dice-engine.db"),
    backupsDir: path("BDE_BACKUPS_DIR", "_backups"),
    automaticBackups: backupFlag === "1",
    repoExportsRoot,
    sessionSummaryExportDir: join(repoExportsRoot, "session-summaries"),
    memoryEntryExportDir: join(repoExportsRoot, "memory-entries"),
    aiLogExportDir: join(repoExportsRoot, "ai-logs"),
    // Optional stores/endpoints have no machine-specific or secret-file fallback.
    mediaOutputRoot: optionalPath("BDE_MEDIA_OUTPUT_ROOT"),
    comfyOutputBDEDir: optionalPath("BDE_COMFY_OUTPUT_DIR"),
    comfyApiBase: endpoint("BDE_COMFY_API_BASE"),
    comfyRouterEndpoint: endpoint("BDE_COMFY_ROUTER_ENDPOINT"),
    localModelEndpoint: endpoint("BDE_LOCAL_MODEL_ENDPOINT"),
    audioServiceEndpoint: endpoint("BDE_AUDIO_SERVICE_ENDPOINT"),
    ttsServiceEndpoint: endpoint("BDE_TTS_SERVICE_ENDPOINT"),
    directorModeModel: text("BDE_DIRECTOR_MODE_MODEL"),
    playerCompanionDistDir: join(root, "apps/player-companion/dist"),
    hostDashboardDistDir: join(root, "apps/gm-dashboard/dist"),
    sampleCampaignDir: join(root, "campaigns/sample-campaign"),
    gmSystemPromptPath: join(root, "prompts/gm-system-prompt.md"),
    directorPromptPath: join(root, "prompts/director-prompt.md"),
  };
}

export type AuxiliaryService = "audio" | "comfy" | "runtime";
const servicePorts = { audio: ["BDE_AUDIO_SERVICE_PORT", 4321], comfy: ["BDE_COMFY_ROUTER_PORT", 4320], runtime: ["BDE_RUNTIME_SERVICE_PORT", 4322] } as const;
export function readServiceConfig(service: AuxiliaryService, env: NodeJS.ProcessEnv = process.env, root = repositoryRoot) {
  const { profile, text, port, path, optionalPath, endpoint } = settings(env, root);
  const [portKey, defaultPort] = servicePorts[service];
  return {
    profile, host: text("BDE_HOST", "127.0.0.1"), port: port(portKey, defaultPort),
    audioDir: service === "audio" ? optionalPath("BDE_AUDIO_DIR") : "",
    comfyApiBase: service === "comfy" ? endpoint("BDE_COMFY_API_BASE") : "",
    comfyOutputRoot: service === "comfy" ? optionalPath("BDE_COMFY_OUTPUT_ROOT") : "",
    workflowRegistryPath: join(root, "comfy-workflows/registry.json"),
    promptTemplatePath: join(root, "prompts/image-prompt-templates.json"),
    databasePath: path("BDE_DB_PATH", "_data/black-dice-engine.db"), backupsDir: path("BDE_BACKUPS_DIR", "_backups"),
    gameServerEndpoint: service === "runtime" ? endpoint("BDE_GAME_SERVER_ENDPOINT", "http://127.0.0.1:4310") : "",
    comfyRouterEndpoint: service === "runtime" ? endpoint("BDE_COMFY_ROUTER_ENDPOINT") : "",
    audioServiceEndpoint: service === "runtime" ? endpoint("BDE_AUDIO_SERVICE_ENDPOINT") : ""
  };
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env, root = repositoryRoot) {
  const { profile, text, endpoint } = settings(env, root);
  const provider = text("BDE_LLM_PROVIDER", "ollama").toLowerCase();
  if (profile !== "party" && !["ollama", "openai", "chatgpt"].includes(provider)) throw new Error("BDE_LLM_PROVIDER must be ollama or openai (chatgpt alias accepted)");
  const remoteOption = profile === "party" ? "0" : text("BDE_ALLOW_REMOTE_AI", "0");
  if (!["0", "1"].includes(remoteOption)) throw new Error("BDE_ALLOW_REMOTE_AI must be 0 or 1");
  const ollamaBaseUrl = endpoint("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  const openaiBaseUrl = endpoint("OPENAI_BASE_URL", "https://api.openai.com/v1");
  const selectedEndpoint = provider === "ollama" ? ollamaBaseUrl : openaiBaseUrl;
  const hostname = selectedEndpoint ? new URL(selectedEndpoint).hostname : "";
  // Only literal loopback or localhost is host-local. LAN/remote inference
  // requires the same explicit consent, regardless of the provider label.
  const loopback = hostname === "localhost" || hostname === "[::1]" || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname);
  const allowRemote = remoteOption === "1";
  const disabledReason = profile === "party" ? "AI is disabled in the Party profile."
    : !loopback && !allowRemote ? "Remote AI is disabled. Explicit host opt-in is required." : null;
  return {
    disabled: disabledReason !== null, disabledReason, allowRemote, provider,
    ollamaBaseUrl, ollamaModel: text("OLLAMA_MODEL", "qwen2.5:7b"),
    openaiBaseUrl, openaiApiKey: profile === "party" ? "" : text("OPENAI_API_KEY"),
    openaiModel: text("OPENAI_MODEL", "gpt-4o-mini"), directorModeModel: text("BDE_DIRECTOR_MODE_MODEL"),
    gmPromptPath: join(root, "prompts/gm-system-prompt.md"), directorPromptPath: join(root, "prompts/director-prompt.md")
  };
}
