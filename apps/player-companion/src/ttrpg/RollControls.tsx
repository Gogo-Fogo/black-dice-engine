import React, { useState } from "react";
import type { PlayerTable } from "./usePlayerTable";
import { abilityModifier } from "./model";

export function RollControls({ table, advanced, disabled }: { table: PlayerTable; advanced: boolean; disabled: boolean }) {
  const action = table.snapshot?.currentAction;
  const modifier = abilityModifier(table.claimed, action ?? null);
  const [dice, setDice] = useState("d20");
  const [note, setNote] = useState("Custom roll");
  const [customModifier, setCustomModifier] = useState(0);
  return <article className="panel"><h2>Roll</h2>
    {action ? <><h3>{action.type}</h3><p>{action.description}</p>{action.dc !== null && <p>DC {action.dc}</p>}</> : <p>Waiting for the GM to set an action.</p>}
    <button className="big-roll-btn" type="button" disabled={disabled || !table.claimed || !action}
      onClick={() => void table.roll()}>Roll d20 {modifier < 0 ? "−" : "+"} {Math.abs(modifier)}</button>
    {advanced && <form onSubmit={event => { event.preventDefault(); void table.roll(dice, note, customModifier); }}>
      <label className="label" htmlFor="custom-dice">Dice</label><input id="custom-dice" value={dice} onChange={event => setDice(event.target.value)} maxLength={64} required />
      <label className="label" htmlFor="custom-note">Roll label</label><input id="custom-note" value={note} onChange={event => setNote(event.target.value)} maxLength={256} />
      <label className="label" htmlFor="custom-modifier">Modifier</label><input id="custom-modifier" type="number" value={customModifier} min={-1000} max={1000} step={1} required onChange={event => setCustomModifier(event.target.valueAsNumber)} />
      <button type="submit" disabled={disabled || !table.claimed || !Number.isInteger(customModifier)}>Roll chosen dice</button>
    </form>}
  </article>;
}
