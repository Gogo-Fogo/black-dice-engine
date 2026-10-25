import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { SessionGate } from "../../session-client";
import { PartyRoom } from "../../party-client";
import "./styles.css";
import "./dice.css";
import "./forge.css";
import "../../party-client.css";
import "../../character-artwork.css";

const DiceLab = lazy(() => import("./DiceLab").then(module => ({default:module.DiceLab})));
const lab = new URLSearchParams(window.location.search).get("lab") === "dice";
const App = lazy(() => import("./App"));
const legacy = new URLSearchParams(window.location.search).get("mode") === "ttrpg";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionGate role="player">{lab ? <Suspense fallback={<p>Loading Dice Lab…</p>}><DiceLab /></Suspense> : legacy ? <><nav className="party-mode-navigation" aria-label="Game mode"><a href="?mode=party">Return to Party Mode</a></nav><Suspense fallback={<p role="status">Loading your TTRPG sheet…</p>}><App /></Suspense></> : <PartyRoom role="player" />}</SessionGate>
  </React.StrictMode>
);
