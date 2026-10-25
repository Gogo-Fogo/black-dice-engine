import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, expireSession, sessionIdentity, sessionProtocols } from "./session-client";
import { isObject, isPartySnapshot, type PartyAction, type PartySnapshot } from "../packages/contracts/dist/index.js";
import { PartyCommandQueue } from "./party-commands";
import { LiveConnection } from "./live-connection.mts";

export function usePartyRoom() {
  const identity = sessionIdentity();
  const [snapshot, setSnapshot] = useState<PartySnapshot | null>(null);
  const [connection, setConnection] = useState("Connecting");
  const [connectionError, setConnectionError] = useState("");
  const [commandMessage, setCommandMessage] = useState("");
  const [commandError, setCommandError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, renderPending] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const receive = useCallback((value: unknown) => {
    if (!mounted.current || !isPartySnapshot(value) || value.sessionId !== identity.sessionId) return false;
    setSnapshot(previous => previous && previous.revision > value.revision ? previous : value);
    return true;
  }, [identity.sessionId]);
  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/party-game", { signal: AbortSignal.timeout(5000) });
      const body: unknown = await response.json();
      if (!response.ok || !isPartySnapshot(body)) throw new Error("Could not refresh the game. Check the host connection.");
      receive(body);
      if (mounted.current) setConnectionError("");
    } catch (error) { if (mounted.current) setConnectionError(error instanceof Error ? error.message : "Host is unreachable. Reconnecting…"); }
  }, [receive]);
  const queue = useMemo(() => new PartyCommandQueue(identity, {
    getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value), removeItem: key => sessionStorage.removeItem(key)
  }, (action, body) => apiFetch(`/api/party-game/${action}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }),
  () => crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")), [identity.sessionId, identity.actorId]);

  useEffect(() => {
    const connection = new LiveConnection({
      socket: () => {
        const url = new URL("/ws", window.location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return new WebSocket(url, sessionProtocols());
      },
      receive: message => {
        if (!isObject(message)) return false;
        const party = message.type === "connected" && isObject(message.payload) ? message.payload.party : message.type === "party_snapshot" ? message.payload : null;
        return !!party && receive(party) || message.type === "runtime_status";
      }, refresh: () => { void refresh(); }, status: setConnection, error: setConnectionError,
      expired: expireSession, online: () => navigator.onLine
    });
    const wake = () => { if (!document.hidden) connection.wake(); };
    const offline = () => connection.offline();
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    connection.start();
    return () => {
      window.removeEventListener("online", wake); window.removeEventListener("offline", offline);
      window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake);
      connection.stop();
    };
  }, [receive, refresh]);
  const run = async () => {
    setBusy(true); setCommandError(""); setCommandMessage("Waiting for the server to confirm…");
    try {
      receive(await queue.run());
      if (mounted.current) setCommandMessage("Action confirmed and saved.");
    } catch (error) {
      if (mounted.current) {
        setCommandMessage("");
        setCommandError(error instanceof Error ? error.message : "The response is uncertain. Retry the pending action.");
      }
    } finally {
      if (mounted.current) { setBusy(false); renderPending(value => value + 1); void refresh(); }
    }
  };
  const send = async (action: PartyAction, fields: Record<string, unknown> = {}) => {
    if (!snapshot) return;
    try { queue.prepare(action, snapshot, fields); renderPending(value => value + 1); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Confirm the pending action first."); return; }
    await run();
  };
  return { identity, snapshot, connection, connectionError, commandMessage, commandError, busy, pending: queue.pending(),
    storageAvailable: queue.storageAvailable, send, retry: run, refresh };
}
