import React, { useState } from "react";
import { abilities, isActionConfirmation, type PlayerSessionSnapshot } from "../../../../packages/contracts/dist/index.js";
import { apiFetch } from "../../../session-client";
import { readHostResponse } from "./read-host-response";

const checks = ["Perception", "Stealth", "Athletics", "Insight", "Persuasion", "Investigation", "Arcana", "Dexterity save", "Wisdom save", "Constitution save"];

/** Manual roll call: works without any AI provider. Players see it on phones and the Stage. */
export function RollCallPanel({ snapshot }: { snapshot: Pick<PlayerSessionSnapshot, "currentAction"> | null }) {
  const [call, setCall] = useState({ type: "Perception", description: "", ability: "wis", dc: "12" });
  const [status, setStatus] = useState<"" | "sending" | "failed">("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const type = call.type.trim(), dc = call.dc.trim() ? Number(call.dc) : null;
    if (!type || dc !== null && !(Number.isInteger(dc) && dc >= 1 && dc <= 40)) return;
    setStatus("sending");
    try {
      const response = await apiFetch("/api/set-action", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, description: call.description.trim() || type, ability: call.ability, dc }) });
      if (!response.ok) throw Error();
      await readHostResponse(response, isActionConfirmation);
      setStatus("");
    } catch { setStatus("failed"); }
  }
  const live = snapshot?.currentAction;
  return <article className="panel">
    <div className="panel-header"><h2>Call for a roll</h2><span>{live ? `Live: ${live.type}${live.dc === null ? "" : ` DC ${live.dc}`}` : "Shows on phones and the TV"}</span></div>
    <form className="character-form" onSubmit={event => void submit(event)}>
      <label className="label" htmlFor="rc-type">Check</label>
      <input id="rc-type" list="rc-checks" value={call.type} onChange={event => setCall({ ...call, type: event.target.value })} />
      <datalist id="rc-checks">{checks.map(check => <option key={check} value={check} />)}</datalist>
      <label className="label" htmlFor="rc-ability">Ability</label>
      <select id="rc-ability" value={call.ability} onChange={event => setCall({ ...call, ability: event.target.value })}>
        {abilities.map(ability => <option key={ability} value={ability}>{ability.toUpperCase()}</option>)}
      </select>
      <label className="label" htmlFor="rc-dc">DC (blank if hidden or unknown)</label>
      <input id="rc-dc" type="number" min={1} max={40} value={call.dc} onChange={event => setCall({ ...call, dc: event.target.value })} />
      <label className="label" htmlFor="rc-desc">What's happening (optional)</label>
      <input id="rc-desc" value={call.description} placeholder="Something moves on the stairs…" onChange={event => setCall({ ...call, description: event.target.value })} />
      <button className="primary-button" type="submit" disabled={!call.type.trim() || status === "sending"}>{status === "sending" ? "Sending…" : "Call for the roll"}</button>
      {status === "failed" && <p role="alert">Couldn't set the action. The scene may be closed, or the server is unreachable.</p>}
    </form>
  </article>;
}
