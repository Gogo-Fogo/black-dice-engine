import React from "react";
import {CharacterArtwork} from '../../../character-artwork';
import { abilities, type Character } from "../../../../packages/contracts/dist/index.js";

export function CharacterSheet({ character, advanced, disabled=false }: { character: Character; advanced: boolean; disabled?: boolean }) {
  return <article className="panel" aria-label="Your character sheet">
    <h2>{character.name}</h2><p>{character.classLabel}</p>
    <CharacterArtwork key={character.id} character={character} editable disabled={disabled} />
    <dl className="character-vitals">
      <div><dt>HP</dt><dd>{character.hp.current}/{character.hp.max}</dd></div>
      <div><dt>AC</dt><dd>{character.armorClass}</dd></div>
      <div><dt>Initiative</dt><dd>{character.initiative ?? "—"}</dd></div>
    </dl>
    <h3>Conditions</h3><p>{character.conditions.join(", ") || "None"}</p>
    <h3>Resources</h3>{character.resources.length ? <ul>{character.resources.map(item => <li key={item.id}>{item.label}: {item.current}/{item.max}</li>)}</ul> : <p>None listed.</p>}
    <h3>Inventory</h3>{character.inventory.length ? <ul>{character.inventory.map(item => <li key={item.id}>{item.name} × {item.quantity}{item.detail ? ` — ${item.detail}` : ""}</li>)}</ul> : <p>None listed.</p>}
    <h3>Your notes</h3>{character.notes.length ? character.notes.map((note, index) => <p key={index}>{note}</p>) : <p>No notes.</p>}
    {advanced && <><h3>Abilities</h3><dl className="character-vitals">{abilities.map(ability => <div key={ability}><dt>{ability.toUpperCase()}</dt><dd>{character.stats?.[ability] ?? "—"}</dd></div>)}</dl>
      <p>Skills: {character.stats?.skills?.join(", ") || "None listed."}</p></>}
  </article>;
}
