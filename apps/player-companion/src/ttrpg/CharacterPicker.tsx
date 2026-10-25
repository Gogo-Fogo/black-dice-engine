import React from "react";
import type { PlayerTable } from "./usePlayerTable";

export function CharacterPicker({ table, disabled }: { table: PlayerTable; disabled: boolean }) {
  return <article className="panel"><h2>Your seat</h2><p>Joined as {table.identity.label}</p>
    {table.claimed ? <><p>Playing {table.claimed.name}.</p><button type="button" disabled={disabled} onClick={() => void table.release()}>Release character</button></> : <>
      <p>Choose your character to claim it.</p>
      {table.snapshot?.party.map(character => <button className="character-choice" type="button" key={character.id}
        disabled={disabled || !!character.claimedByClientId} onClick={() => void table.claim(character.id)}>
        {character.name} · {character.classLabel}{character.claimedByClientId ? ` — taken by ${character.claimedByLabel || "another player"}` : " — Claim"}
      </button>)}
      {table.snapshot?.party.length === 0 && <p>Ask the host to add a character.</p>}
    </>}
  </article>;
}
