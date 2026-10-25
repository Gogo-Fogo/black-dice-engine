import { useEffect, useRef, useState } from "react";
import { expireSession, sessionProtocols } from "../../../session-client";
import { LiveConnection } from "../../../live-connection.mts";
import { HostUpdates, type HostUpdateHooks } from "./host-updates";

/** Owns transport/listeners only; host panel and command state stays with the caller. */
export function useHostConnection(hooks: HostUpdateHooks) {
  const latest = useRef(hooks); latest.current = hooks;
  const [connectionLabel, setConnectionLabel] = useState("Connecting");
  const [connectionError, setConnectionError] = useState("");
  useEffect(() => {
    let active = true;
    const updates = new HostUpdates({
      runtime: value => { if (active) latest.current.runtime(value); },
      snapshot: value => { if (active) latest.current.snapshot(value); },
      roll: value => { if (active) latest.current.roll(value); },
      changed: () => { if (active) latest.current.changed(); }
    });
    const live = new LiveConnection({
      socket: () => {
        const url = new URL("/ws", window.location.href); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return new WebSocket(url, sessionProtocols());
      },
      receive: message => updates.receive(message),
      // Initial and resumed snapshots arrive in the authenticated connected envelope.
      // The existing bootstrap REST read stays with the caller; there is no extra polling timer.
      refresh: () => {},
      status: setConnectionLabel, error: setConnectionError, expired: expireSession, online: () => navigator.onLine
    });
    const wake = () => { if (!document.hidden) live.wake(); };
    const offline = () => live.offline();
    window.addEventListener("online", wake); window.addEventListener("focus", wake); window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    live.start();
    return () => {
      active = false; live.stop();
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake); window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  return { connectionLabel, connectionError };
}
