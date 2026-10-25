import React from "react";
import {CharacterArtwork} from '../../../character-artwork';
import { abilities, type Character, type CharacterBuild } from "../../../../packages/contracts/dist/index.js";

function BuildSummary({ build }: { build: CharacterBuild }) {
  const magic = build.spellcasting;
  return <>
    <p className="build-review">Quick-start build — your GM may adjust these picks.</p>
    <h3>Attacks</h3>{build.attacks.length ? <ul className="build-attacks">{build.attacks.map(attack => <li key={attack.name}>
      <strong>{attack.name}</strong> {attack.bonus} · {attack.damage}{attack.notes ? <small> — {attack.notes}</small> : null}</li>)}</ul> : <p>None listed.</p>}
    {magic && <><h3>Spellcasting</h3>
      <p>{magic.ability.toUpperCase()} · save DC {magic.saveDc} · attack {magic.attackBonus}</p>
      {magic.cantrips.length > 0 && <p>Cantrips: {magic.cantrips.join(", ")}</p>}
      {magic.spells.length > 0 && <p>{magic.style === "prepared" ? "Prepared" : "Known"} spells: {magic.spells.join(", ")}</p>}</>}
  </>;
}

function BuildDetails({ build }: { build: CharacterBuild }) {
  return <>
    <h3>Background and path</h3>
    <p>{build.background}{build.subclass ? ` · ${build.subclass}` : ""} · proficiency +{build.proficiencyBonus}</p>
    <p>{build.backgroundFeature}</p>
    <h3>Features</h3><ul>{build.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
    {build.abilityImprovements && <p>{build.abilityImprovements}</p>}
  </>;
}

export function CharacterSheet({ character, advanced, disabled=false }: { character: Character; advanced: boolean; disabled?: boolean }) {
  return <article className="panel" aria-label="Your character sheet">
    <h2>{character.name}</h2><p>{character.classLabel}{character.build?.subclass ? ` · ${character.build.subclass}` : ""}</p>
    <CharacterArtwork key={character.id} character={character} editable disabled={disabled} />
    <dl className="character-vitals">
      <div><dt>HP</dt><dd>{character.hp.current}/{character.hp.max}</dd></div>
      <div><dt>AC</dt><dd>{character.armorClass}</dd></div>
      <div><dt>Initiative</dt><dd>{character.initiative ?? "—"}</dd></div>
    </dl>
    <h3>Conditions</h3><p>{character.conditions.join(", ") || "None"}</p>
    {character.build && <BuildSummary build={character.build} />}
    <h3>Resources</h3>{character.resources.length ? <ul>{character.resources.map(item => <li key={item.id}>{item.label}: {item.current}/{item.max}</li>)}</ul> : <p>None listed.</p>}
    <h3>Inventory</h3>{character.inventory.length ? <ul>{character.inventory.map(item => <li key={item.id}>{item.name} × {item.quantity}{item.detail ? ` — ${item.detail}` : ""}</li>)}</ul> : <p>None listed.</p>}
    <h3>Your notes</h3>{character.notes.length ? character.notes.map((note, index) => <p key={index}>{note}</p>) : <p>No notes.</p>}
    {advanced && <><h3>Abilities</h3><dl className="character-vitals">{abilities.map(ability => <div key={ability}><dt>{ability.toUpperCase()}</dt><dd>{character.stats?.[ability] ?? "—"}</dd></div>)}</dl>
      <p>Skills: {character.stats?.skills?.join(", ") || "None listed."}</p>
      {character.build && <BuildDetails build={character.build} />}</>}
  </article>;
}
