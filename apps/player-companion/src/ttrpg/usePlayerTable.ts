import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, expireSession, sessionIdentity, sessionProtocols } from "../../../session-client";
import { LiveConnection } from "../../../live-connection.mts";
import { isPlayerSessionSnapshot, type PlayerSessionSnapshot, type RollRecord } from "../../../../packages/contracts/dist/index.js";
import { PlayerCommandQueue, playerCommandPaths, type PlayerCommand } from "./commands";
import { PlayerTableModel, abilityModifier } from "./model";

export function usePlayerTable() {
  const identity = sessionIdentity();
  const [snapshot, setSnapshot] = useState<PlayerSessionSnapshot | null>(null);
  const [animation, setAnimation] = useState<RollRecord | null>(null);
  const [connection, setConnection] = useState("Connecting");
  const [connectionError, setConnectionError] = useState("");
  const [commandError, setCommandError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [, updatePending] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const model = useMemo(() => new PlayerTableModel(identity, {
    snapshot: value => { if (mounted.current) setSnapshot(value); }, roll: value => { if (mounted.current) setAnimation(value); }
  }), [identity.actorId, identity.sessionId]);
  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/session-snapshot", { signal: AbortSignal.timeout(5000) });
      const value: unknown = await response.json();
      if (!response.ok || !isPlayerSessionSnapshot(value) || value.sessionId !== identity.sessionId) throw new Error("Saved sheet could not be refreshed. Check the host connection.");
      model.acceptSnapshot(value); // Valid older in-flight responses cannot replace newer state.
      if (mounted.current) setConnectionError("");
    } catch (error) { if (mounted.current) setConnectionError(error instanceof Error ? error.message : "Host unreachable. Reconnecting…"); }
  }, [model, identity.sessionId]);
  const queue = useMemo(() => new PlayerCommandQueue(identity, {
    getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value), removeItem: key => sessionStorage.removeItem(key)
  }, (action, body) => apiFetch(playerCommandPaths[action], { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }), () => crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")), [identity.actorId, identity.sessionId]);
  useEffect(() => {
    const live = new LiveConnection({ socket: () => {
      const url = new URL("/ws", window.location.href); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return new WebSocket(url, sessionProtocols());
    }, receive: value => model.receive(value), refresh: () => { void refresh(); }, status: setConnection, error: setConnectionError,
      expired: expireSession, online: () => navigator.onLine });
    const wake = () => { if (!document.hidden) live.wake(); };
    const offline = () => live.offline();
    window.addEventListener("online", wake); window.addEventListener("focus", wake); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", wake);
    live.start();
    return () => { live.stop(); window.removeEventListener("online", wake); window.removeEventListener("focus", wake); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", wake); };
  }, [model, refresh]);
  const run = async () => {
    setBusy(true); setCommandError(""); setMessage("Waiting for the server to confirm…");
    try {
      const receipt = await queue.run();
      if (receipt.snapshot) model.acceptSnapshot(receipt.snapshot);
      if (receipt.roll) model.acceptRoll(receipt.roll, receipt.revision);
      if (mounted.current) setMessage("Action confirmed and saved.");
    } catch (error) { if (mounted.current) { setMessage(""); setCommandError(error instanceof Error ? error.message : "Action uncertain. Confirm the pending request."); } }
    finally { if (mounted.current) { setBusy(false); updatePending(value => value + 1); void refresh(); } }
  };
  const send = async (action: PlayerCommand, fields: Record<string, unknown>) => {
    try { queue.prepare(action, fields); updatePending(value => value + 1); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Confirm the pending request first."); return; }
    await run();
  };
  const claimed = snapshot?.party.find(character => character.claimedByClientId === identity.actorId) ?? null;
  return { identity, snapshot, claimed, connection, connectionError, commandError, message, busy, pending: queue.pending(), storageAvailable: queue.storageAvailable,
    animation, closeAnimation: () => setAnimation(null), refresh, retry: run,
    claim: (characterId: string) => send("claim", { characterId, clientId: identity.actorId, playerLabel: identity.label }),
    release: () => send("release", { clientId: identity.actorId }),
    roll: (dice = "d20", note = snapshot?.currentAction?.type ?? "Check", modifier = abilityModifier(claimed, snapshot?.currentAction ?? null)) => {
      if (!claimed) return Promise.resolve();
      return send("roll", { actorId: claimed.id, actorName: claimed.name, dice, note, modifier });
    }
  };
}
export type PlayerTable = ReturnType<typeof usePlayerTable>;
