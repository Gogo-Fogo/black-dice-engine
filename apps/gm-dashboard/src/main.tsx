import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { SessionGate } from "../../session-client";
import { PartyRoom } from "../../party-client";
import { PartyQr } from "./PartyQr";
import "./styles.css";
import "./stage.css";
import "../../party-client.css";
import "../../character-artwork.css";

const StageApp=lazy(()=>import("./StageApp"));
const stage=new URLSearchParams(window.location.search).get("view")==="stage";
const App = lazy(() => import("./App"));
const display = window.location.pathname.startsWith("/display") || new URLSearchParams(window.location.search).get("view") === "display";
const legacy = !display && new URLSearchParams(window.location.search).get("mode") === "ttrpg";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionGate role={display || stage ? "spectator" : "gm"}>
      {stage?<Suspense fallback={<p>Loading public table display…</p>}><StageApp/></Suspense>:legacy ? <><nav className="party-mode-navigation" aria-label="Game mode"><a href="?mode=party">Return to Party Mode</a></nav><Suspense fallback={<p role="status">Loading TTRPG controls…</p>}><App /></Suspense></> : <PartyRoom role={display || stage ? "display" : "host"} QrCode={PartyQr} />}
    </SessionGate>
  </React.StrictMode>
);
