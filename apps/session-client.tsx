import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isIdentity, type LocalIdentity as Identity, type LocalCredential as Credential } from "../packages/contracts/dist/index.js";

export type { LocalIdentity as Identity, LocalCredential as Credential } from "../packages/contracts/dist/index.js";
let current: Credential | null = null;
const expiredEvent = "bde-session-expired";
export function expireSession() { window.dispatchEvent(new Event(expiredEvent)); }
export function rememberSession(credential: Credential) {
  if (!isIdentity(credential) || !/^[A-Za-z0-9_-]{43}$/.test(credential.token)) throw new Error("Invalid session response.");
  sessionStorage.setItem(`bde-local-session-${credential.role}`, JSON.stringify(credential));
}

export function sessionIdentity(): Identity {
  if (!current) throw new Error("Join the room before acting.");
  const { token: _token, ...identity } = current;
  return identity;
}

export function sessionProtocols() {
  if (!current) throw new Error("Join the room before connecting.");
  return ["bde.session", `bde.auth.${current.token}`];
}

/** Explicit requests; credentials never accompany external audio/provider calls. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  const localApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (localApi && current) headers.set("Authorization", `Bearer ${current.token}`);
  const commandPath = /^\/api\/(campaign-progress|claim-character|release-character|rolls|state-events(?:\/propose|\/[^/]+\/(?:approve|reject))?|set-action|set-scene|ai\/narration-toggle|characters)$/.test(url.pathname);
  let body = init?.body;
  if (localApi && current && commandPath && init?.method?.toUpperCase() === "POST" && typeof body === "string") {
    const command = JSON.parse(body);
    const requestId = command.requestId ?? (crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""));
    body = JSON.stringify({ ...command, requestId,
      _command: command._command ?? { schemaVersion: 1, sessionId: current.sessionId, mode: "ttrpg",
        actorId: current.actorId, roundId: null, stage: "table" } });
  }
  const response = await window.fetch(input, { ...init, ...(body === undefined ? {} : { body }), headers });
  if (localApi && current && response.status === 401) window.dispatchEvent(new Event(expiredEvent));
  return response;
}

export function SessionGate({ role, children }: { role: Identity["role"]; children: ReactNode }) {
  const key = `bde-local-session-${role}`;
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const [error, setError] = useState("");
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("pin") ?? "");
  const [label, setLabel] = useState("");
  const [hostToken, setHostToken] = useState("");

  useEffect(() => {
    let active = true;
    setChecking(true);
    const expire = () => {
      current = null;
      try { sessionStorage.removeItem(key); } catch { /* In-memory credentials still work. */ }
      setReady(false);
      setHasSavedSession(false);
      setError("Session expired or revoked. Join again.");
    };
    window.addEventListener(expiredEvent, expire);
    void (async () => {
      try {
        const raw = sessionStorage.getItem(key);
        const saved = raw ? JSON.parse(raw) : null;
        if (!isIdentity(saved) || !saved || !("token" in saved) || typeof saved.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(saved.token)) return;
        if (active) setHasSavedSession(true);
        const response = await window.fetch("/api/session/me", { headers: { Authorization: `Bearer ${saved.token}` }, signal: AbortSignal.timeout(5000) });
        const identity: unknown = await response.json();
        if (response.status === 401 || response.ok && (!isIdentity(identity) || identity.role !== role)) {
          try { sessionStorage.removeItem(key); } catch { /* The invalid credential is never used. */ }
          if (active) { setHasSavedSession(false); setError("Saved session ended. Join with the current room code or key."); }
        }
        if (!response.ok && response.status !== 401) throw new Error("Resume unavailable");
        if (active && response.ok && isIdentity(identity) && identity.role === role) {
          current = { ...identity, token: saved.token };
          setReady(true);
        }
      } catch { if (active) setError("Could not resume. Retry joining when the host is reachable."); }
      finally { if (active) setChecking(false); }
    })();
    return () => { active = false; window.removeEventListener(expiredEvent, expire); };
  }, [key, role, resumeAttempt]);

  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await window.fetch(role !== "player" ? "/api/session/me" : "/api/session/join", {
        method: role !== "player" ? "GET" : "POST",
        headers: role !== "player" ? { Authorization: `Bearer ${hostToken.trim()}` } : { "Content-Type": "application/json" },
        body: role !== "player" ? undefined : JSON.stringify({ code, label }), signal: AbortSignal.timeout(5000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Unable to join.");
      if (!isIdentity(result) || result.role !== role) throw new Error("This credential does not grant access to this screen.");
      const token = role !== "player" ? hostToken.trim() : (result as Credential).token;
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid session response.");
      current = { ...result, token };
      try { sessionStorage.setItem(key, JSON.stringify(current)); } catch { /* Tab stays joined until reload. */ }
      setHostToken("");
      setReady(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to join. Check the host connection."); }
    finally { setBusy(false); }
  }

  if (ready) return <>{children}</>;
  return <main style={{ maxWidth: 480, margin: "8vh auto", padding: 24, fontFamily: "system-ui", color: "#eee", background: "#191923", borderRadius: 16 }}>
    <h1>{role === "gm" ? "Host access" : role === "spectator" ? "Public TV display" : "Join the room"}</h1>
    {checking ? <p role="status">Checking saved session…</p> : <form onSubmit={join} style={{ display: "grid", gap: 16 }}>
      {role !== "player" ? <>
        <p>{role === "gm" ? "Enter the host key from the local session file. Keep it on the host device." : "Enter a read-only display key created in Party host controls. A host key cannot open this screen."}</p>
        <label>{role === "gm" ? "Host key" : "Display key"}<input type="password" autoComplete="off" required value={hostToken} onChange={event => setHostToken(event.target.value)} style={{ display: "block", width: "100%", minHeight: 44 }} /></label>
      </> : <>
        <label>Room code<input required autoCapitalize="characters" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} style={{ display: "block", width: "100%", minHeight: 44 }} /></label>
        <label>Your name<input required maxLength={24} autoComplete="nickname" value={label} onChange={event => setLabel(event.target.value)} style={{ display: "block", width: "100%", minHeight: 44 }} /></label>
      </>}
      <button disabled={busy} style={{ minHeight: 48 }}>{busy ? "Joining…" : role === "gm" ? "Open host controls" : role === "spectator" ? "Open public display" : "Join"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {!checking && hasSavedSession && <button onClick={() => setResumeAttempt(value => value + 1)} style={{ minHeight: 48 }}>Retry saved session</button>}
  </main>;
}
