import React, { useEffect, useState, type ComponentType } from "react";
import { apiFetch, rememberSession, type Credential } from "./session-client";
import { usePartyRoom } from "./party-connection";
import type { Choice, PartySnapshot } from "../packages/contracts/dist/index.js";

type Role = "host" | "player" | "display";
type Room = ReturnType<typeof usePartyRoom>;
type Qr = ComponentType<{ url: string }>;
const instructions: Record<PartySnapshot["stage"], string> = {
  lobby: "Join on your phone and get ready. Six or seven players can start.",
  briefing: "Discuss the scene. The host will open a one-minute choice window.",
  choosing: "Choose privately on your phone. You can change your choice until lock.",
  locked: "Choices are locked. Missing players pass. Wait for the reveal.",
  reveal: "Choices revealed. The host will resolve them in seat order.",
  resolving: "These dice and outcomes are saved. Read the results together.",
  summary: "Discuss the round, then continue to the next bell.",
  ending: "The fifth bell has rung. Celebrate your Clockkeepers!"
};
const optionRules: Record<Choice, string> = {
  mend: "3+ on d6: +2 points, danger −1. Otherwise danger +1.",
  dare: "5+ on d6: +4 points. Otherwise danger +2.",
  guard: "2+ on d6: +1 point, danger −1. Otherwise unchanged.",
  pass: "No roll, no points and no change to danger."
};
function Clock({ state }: { state: PartySnapshot }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (state.stage !== "choosing") return null;
  const remaining = state.paused ? state.remainingMs : state.deadline === null ? null : state.deadline - now;
  return <p className="party-clock">{state.paused ? `Timer paused · ${Math.max(0, Math.ceil((remaining ?? 0) / 1000))} seconds saved` : remaining !== null && remaining <= 0 ? "Waiting for the server to lock" : `${Math.max(0, Math.ceil((remaining ?? 0) / 1000))} seconds to choose`}</p>;
}

function JoinInformation({ QrCode }: { QrCode?: Qr }) {
  const [info, setInfo] = useState<{ code: string; url: string; localOnly: boolean } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await apiFetch("/api/session/join-info", { signal: AbortSignal.timeout(5000) });
        const value = await response.json();
        if (!response.ok || typeof value.code !== "string" || typeof value.url !== "string") throw new Error("Join details are unavailable. Check the host connection.");
        const url = new URL(value.url);
        if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/player/") throw new Error("Join address could not be verified.");
        if (active) { setInfo(value); setError(""); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Join details unavailable."); }
    })();
    return () => { active = false; };
  }, [attempt]);
  return <section className="party-card party-join" aria-label="Join on your phone">
    <h2>Join on your phone</h2>
    {info ? <>
      {QrCode && <QrCode url={info.url} />}
      <p>Room code <strong className="party-room-code">{info.code}</strong></p>
      <a className="party-join-url" href={info.url}>{info.url}</a>
      {info.localOnly && <p className="party-warning">Local access only. Phones need the host to enable LAN hosting.</p>}
    </> : <p role="status">Loading join details…</p>}
    {error && <><p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry join details</button></>}
  </section>;
}

function Roster({ state }: { state: PartySnapshot }) {
  return <section className="party-card" aria-label="Players and scores">
    <h2>{state.stage === "lobby" ? "Players" : "Clockkeepers"}</h2>
    {state.roster.length ? <ol className="party-roster">
      {state.roster.map(seat => <li key={seat.actorId}>
        <span className="party-seat">{seat.seat}</span>
        <span>{seat.label}<small>{state.winners.includes(seat.actorId) ? "Clockkeeper" : state.stage === "lobby" ? seat.ready ? "Ready" : "Getting ready" : state.participants.includes(seat.actorId) ? "In this round" : "Next round"}</small></span>
        <strong>{seat.score}<small>points</small></strong>
      </li>)}
    </ol> : <p>Waiting for the first player.</p>}
  </section>;
}

function Results({ state, compact = false }: { state: PartySnapshot; compact?: boolean }) {
  if (!["reveal", "resolving", "summary", "ending"].includes(state.stage)) return null;
  return <section className="party-card" aria-label="Revealed choices and saved results">
    <h2>{state.stage === "reveal" ? "The reveal" : "Saved results"}</h2>
    {state.outcomes.length ? <ol className={compact ? "party-results party-results-compact" : "party-results"}>{state.outcomes.map(outcome => <li key={outcome.actorId}>
      <span className="party-die" aria-label={outcome.roll === null ? "No roll" : `d6 result ${outcome.roll}`}>{outcome.roll ?? "—"}</span>
      {compact ? <p><strong>{outcome.seat}. {state.roster.find(seat => seat.actorId === outcome.actorId)?.label}</strong>
        <small>{outcome.choice} · {outcome.roll === null ? "Pass" : outcome.success ? "Success" : "Setback"} · +{outcome.points} points</small>
        <small>{state.roster.find(seat => seat.actorId === outcome.actorId)?.score ?? 0} total</small></p> : <p>{outcome.text}</p>}
    </li>)}</ol> : <ol className={compact ? "party-results party-results-compact" : "party-results"}>{state.participants.map(id => <li key={id}>
      {state.roster.find(seat => seat.actorId === id)?.label}: <strong>{state.choices[id] ?? "pass"}</strong>
    </li>)}</ol>}
  </section>;
}

function PhoneControls({ room }: { room: Room }) {
  const state = room.snapshot!;
  const me = state.roster.find(seat => seat.actorId === room.identity.actorId);
  const active = state.participants.includes(room.identity.actorId);
  const [choice, setChoice] = useState<Choice>(state.ownChoice ?? "mend");
  useEffect(() => { setChoice(state.ownChoice ?? "mend"); }, [state.roundId, state.ownChoice]);
  const disabled = room.busy || !!room.pending || room.connection !== "Connected";
  if (!me) return <section className="party-card"><h2>Take your seat</h2><p>Welcome, {room.identity.label}. No character sheet is needed.</p>
    <button className="party-primary" disabled={disabled || state.stage === "ending"} onClick={() => void room.send("enter")}>Join game</button></section>;
  if (state.stage === "lobby" || !active && state.stage !== "ending") return <section className="party-card">
    <h2>{state.stage === "lobby" ? "Ready for the first bell?" : "Your seat is saved for the next round"}</h2>
    <p>{me.ready ? "You're ready. Wait for the host to open your round." : "Get ready when you can stay for five rounds."}</p>
    <button className={me.ready ? "" : "party-primary"} disabled={disabled} onClick={() => void room.send("ready", { ready: !me.ready })}>{me.ready ? "I'm not ready yet" : "I'm ready"}</button>
  </section>;
  if (state.stage === "choosing") return <section className="party-card">
    <h2>Your private choice</h2>
    {state.ownChoice && <p className="party-accepted" role="status">Saved: {state.ownChoice}. You can update it until lock.</p>}
    <form onSubmit={event => { event.preventDefault(); void room.send("choose", { choice }); }}>
      <fieldset className="party-options" disabled={disabled || state.paused}>
        <legend>Choose one action</legend>
        {(["mend", "dare", "guard", "pass"] as Choice[]).map(option => <label key={option} className={choice === option ? "party-option selected" : "party-option"}>
          <input type="radio" name="choice" value={option} checked={choice === option} onChange={() => setChoice(option)} />
          <span><strong>{option === "pass" ? "Pass safely" : state.scene?.[option] ?? option}</strong><small>{optionRules[option]}</small></span>
        </label>)}
      </fieldset>
      <button className="party-primary" disabled={disabled || state.paused || choice === state.ownChoice}>{room.busy ? "Saving…" : choice === state.ownChoice ? "Choice saved" : state.ownChoice ? "Update choice" : "Save choice"}</button>
    </form>
  </section>;
  return <section className="party-card"><h2>{state.stage === "ending" ? `You earned ${me.score} points` : "Your seat is saved"}</h2>
    <p>{state.stage === "locked" ? state.ownChoice === "pass" ? "Pass recorded. You won't roll this round." : `Locked choice: ${state.ownChoice ?? "pass"}. Wait for the reveal.` : instructions[state.stage]}</p></section>;
}

function DisplaySetup() {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/session/display", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (!response.ok || body.role !== "spectator" || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw new Error("Could not create a display key. Check the host connection.");
      setCredential(body);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create a display key."); }
    finally { setBusy(false); }
  };
  return <section className="party-card"><h2>Set up the TV</h2>
    <p>Use an extended display. Open the public screen, move it to the TV, then use full screen. Keep these host controls on your own screen.</p>
    <button disabled={busy || !!credential} onClick={() => void create()}>{busy ? "Creating…" : credential ? "Display key created" : "Create read-only display key"}</button>
    {credential && <><label className="party-field">Display key — copy into the public screen<input readOnly value={credential.token} onFocus={event => event.target.select()} autoComplete="off" /></label>
      <a className="party-link-button" href="/display/" target="_blank" rel="noopener noreferrer">Open public TV screen</a>
      <p>This key gives public viewing only. The host key stays here.</p></>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

function HostControls({ room }: { room: Room }) {
  const state = room.snapshot!;
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState("");
  useEffect(() => { setConfirmSkip(false); }, [state.roundId, state.stage]);
  const disabled = room.busy || !!room.pending || room.connection !== "Connected" || newBusy;
  const advanceText = { briefing: "Open choices · 60 seconds", locked: "Reveal choices", reveal: "Resolve saved choices", resolving: "Show round summary", summary: state.roundId === 5 ? "Show ending" : "Next round" };
  const advance = advanceText[state.stage as keyof typeof advanceText];
  const newRoom = async () => {
    setNewBusy(true); setNewError("");
    try {
      const response = await apiFetch("/api/session/new-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(5000) });
      const credential = await response.json();
      if (!response.ok || credential.role !== "gm") throw new Error("Room creation could not be confirmed. Reopen host access using the current local host key.");
      rememberSession(credential);
      window.location.reload();
    } catch (error) { setNewError(error instanceof Error ? error.message : "Room creation is uncertain. Reopen host access with the current local key."); }
    finally { setNewBusy(false); }
  };
  return <>
    <section className="party-card"><h2>Host controls</h2>
      {state.stage === "lobby" ? <><p>{state.roster.filter(seat => seat.ready).length} of 6–7 players ready. Join from a separate player tab if you're playing.</p>
        <button className="party-primary" disabled={disabled || state.roster.filter(seat => seat.ready).length < 6} onClick={() => void room.send("start")}>Start five-round game</button></>
        : state.stage !== "ending" && <>
          {state.paused ? <button className="party-primary" disabled={disabled} onClick={() => void room.send("resume")}>Resume game</button>
            : advance && <button className="party-primary" disabled={disabled} onClick={() => void room.send("advance")}>{advance}</button>}
          {!state.paused && <button disabled={disabled} onClick={() => void room.send("pause")}>Pause game</button>}
          {state.stage === "choosing" && <>
            <button disabled={disabled} onClick={() => void room.send("extend", { seconds: 30 })}>Add 30 seconds</button>
            <button disabled={disabled || state.paused} onClick={() => void room.send("lock")}>Lock now · missing players pass</button>
            <label className="party-check"><input type="checkbox" checked={confirmSkip} onChange={event => setConfirmSkip(event.target.checked)} />Pass for everyone in this unresolved round</label>
            <button disabled={disabled || state.paused || !confirmSkip} onClick={() => void room.send("skip")}>Skip this round's choices</button>
          </>}
        </>}
      <a className="party-link-button" href="/player/?mode=party" target="_blank" rel="noopener noreferrer">Open a normal player seat</a>
    </section>
    <DisplaySetup />
    <section className="party-card"><h2>New game</h2><p>A new room disconnects every player and display. The previous game's saved results remain on the host.</p>
      <label className="party-check"><input type="checkbox" checked={confirmNew} onChange={event => setConfirmNew(event.target.checked)} />End this room and require everyone to join again</label>
      <button disabled={disabled || !confirmNew} onClick={() => void newRoom()}>{newBusy ? "Creating room…" : "Create new room"}</button>
      {newError && <p role="alert">{newError}</p>}
    </section>
  </>;
}

export function PartyRoom({ role, QrCode }: { role: Role; QrCode?: Qr }) {
  const room = usePartyRoom();
  return <PartyView role={role} room={room} QrCode={QrCode} />;
}

/** Presentational surface, independently inspectable without live credentials or sockets. */
export function PartyView({ role, room, QrCode }: { role: Role; room: Room; QrCode?: Qr }) {
  const state = room.snapshot;
  return <main className={`party-shell party-${role}`}>
    <header className="party-header"><p className="party-kicker">Black Dice Engine · {role === "display" ? "Public display" : role === "host" ? "Private host controls" : room.identity.label}</p>
      <h1>The Midnight Bell</h1>
      <p className="party-status" role="status">{room.connection}{state?.paused ? " · Game paused" : ""}</p>
      {role !== "display" && <a href={role === "host" ? "/host/?mode=ttrpg" : "/player/?mode=ttrpg"}>Open TTRPG mode</a>}
    </header>
    {room.connectionError && <section className="party-notice" role="alert"><p>{room.connectionError}</p><button onClick={() => void room.refresh()}>Refresh saved state</button></section>}
    {role !== "display" && <>
      {room.commandMessage && <p className="party-notice" role="status">{room.commandMessage}</p>}
      {room.commandError && <p className="party-notice" role="alert">{room.commandError}</p>}
      {room.pending && <section className="party-notice"><p>{room.busy ? "Confirming your action…" : "An action is not yet confirmed. Retry to retrieve its saved result; this will not apply it twice."}</p>
        <button disabled={room.busy} onClick={() => void room.retry()}>{room.busy ? "Waiting…" : "Confirm pending action"}</button></section>}
      {!room.storageAvailable && <p className="party-warning" role="alert">This tab cannot save a pending request for refresh. Keep it open until your action is confirmed.</p>}
    </>}
    {!state ? <p role="status">Loading the saved game…</p> : <>
      <section className="party-card party-scene">
        <p className="party-kicker">{state.roundId ? `Bell ${state.roundId} of 5 · ${state.stage}` : "Lobby · 6–7 players"}</p>
        <h2>{state.ending ?? state.scene?.prompt ?? "Save the town before the fifth midnight bell."}</h2>
        <p>{state.paused ? "The host has paused the game. Your saved choice and results are safe." : instructions[state.stage]}</p>
        <Clock state={state} />
        <div className="party-metrics"><span>Danger <strong>{state.danger}/12</strong></span>
          <span>{state.stage === "lobby" ? "Ready" : "Submitted"} <strong>{state.stage === "lobby" ? state.roster.filter(seat => seat.ready).length : state.submittedCount}/{state.stage === "lobby" ? state.roster.length : state.participants.length}</strong></span></div>
      </section>
      <div className="party-layout"><div>
        {role === "player" && <PhoneControls room={room} />}
        {(role !== "display" || state.stage !== "ending") && <Results state={state} compact={role === "display"} />}
        {(role !== "display" || ["lobby", "briefing", "choosing", "locked", "ending"].includes(state.stage)) && <Roster state={state} />}
      </div><aside>
        {role === "host" && <HostControls room={room} />}
        {role !== "player" && <JoinInformation QrCode={QrCode} />}
      </aside></div>
    </>}
  </main>;
}
