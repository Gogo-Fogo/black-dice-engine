import { CampaignJournal } from "../../campaign-journal";
import { lazy, Suspense, useState } from "react";
import { usePlayerTable } from "./ttrpg/usePlayerTable";
import { CharacterPicker } from "./ttrpg/CharacterPicker";
import { CharacterSheet } from "./ttrpg/CharacterSheet";
import { RollControls } from "./ttrpg/RollControls";
import { TableFeed } from "./ttrpg/TableFeed";
import { PresentationBoundary } from "./ttrpg/PresentationBoundary";
import {CharacterPortrait} from '../../character-artwork';
import {SharedArtwork} from './ttrpg/SharedArtwork';

const Forge = lazy(() => import("./Forge").then(module=>({default:module.Forge})));
const DicePresentation = lazy(() => import("./ttrpg/DicePresentation"));

export default function App() {
  const table = usePlayerTable();
  const [forging,setForging]=useState(false),[forgeError,setForgeError]=useState("");
  const [tab,setTab]=useState<'play'|'sheet'|'table'|'lore'>('play');
  const [advanced, setAdvanced] = useState(() => {
    try { return localStorage.getItem("bde-player-advanced") === "true"; } catch { return false; }
  });
  const disabled = table.busy || !!table.pending || table.connection !== "Connected";
  return <main className="player-shell">
    <header className="player-header"><div><p className="eyebrow">Black Dice Engine</p><h1>Player Companion</h1></div>
      <div><p className="status-chip" role="status">{table.connection}</p><button type="button" aria-pressed={advanced} onClick={() => {
        const next = !advanced; setAdvanced(next); try { localStorage.setItem("bde-player-advanced", String(next)); } catch { /* Preference remains usable in memory. */ }
      }}>{advanced ? "Simple view" : "Advanced view"}</button></div>
    </header>
    <section className="companion-stack">
      {(table.connectionError || table.commandError) && <article className="panel" role="alert">{table.connectionError && <p>{table.connectionError}</p>}{table.commandError && <p>{table.commandError}</p>}<button type="button" onClick={() => void table.refresh()}>Refresh saved sheet</button></article>}
      {table.message && <p role="status">{table.message}</p>}
      {!table.storageAvailable && <p role="alert">Browser storage is unavailable. Keep this page open until your action is confirmed.</p>}
      {table.pending && <article className="panel"><h2>Pending {table.pending.action}</h2><p>Confirm this request before starting another action.</p><button type="button" disabled={table.busy} onClick={() => void table.retry()}>Confirm pending action</button></article>}
      <div id="companion-play" hidden={tab!=='play'}><article className="panel"><p className="eyebrow">Campaign</p><h2>{table.snapshot?.campaignTitle ?? "Loading…"}</h2><p>{table.snapshot?.currentScene ?? "Waiting for the saved session."}</p></article><RollControls table={table} advanced={advanced} disabled={disabled}/>{!table.claimed&&<p>Open Sheet to claim your character and add a portrait.</p>}</div>
      <div id="companion-sheet" hidden={tab!=='sheet'}><a href="?mode=ttrpg&lab=dice">Dice styles and practice lab</a><button type="button" disabled={disabled} onClick={()=>{setForgeError("");setForging(true);}}>Create a new character</button>{forgeError&&<p role="alert">{forgeError}</p>}{forging?<Suspense fallback={<p>Loading character forge…</p>}><Forge clientId={table.identity.actorId} playerLabel={table.identity.label} onCancel={()=>setForging(false)} onError={setForgeError} onCreated={()=>{setForging(false);void table.refresh();}} /></Suspense>:<CharacterPicker table={table} disabled={disabled}/>}{table.claimed&&<CharacterSheet character={table.claimed} advanced={advanced} disabled={disabled}/>}</div>
      <div id="companion-table" hidden={tab!=='table'}><article className="panel"><h2>The party</h2><div className="character-gallery">{table.snapshot?.party.map(character=><article key={character.id}><CharacterPortrait character={character}/><h3>{character.name}</h3><p>{character.classLabel}</p><p>HP {character.hp.current}/{character.hp.max} · AC {character.armorClass}</p></article>)}</div></article><TableFeed snapshot={table.snapshot} memory={false}/></div>
      <div hidden={tab!=='table'}><SharedArtwork snapshot={table.snapshot} active={tab==='table'}/></div>
      <div id="companion-lore" hidden={tab!=='lore'}><article className="panel"><h2>Campaign journal</h2><CampaignJournal progress={table.snapshot?.campaignProgress}/></article><article className="panel"><h2>Session memory</h2>{table.snapshot?.memoryEntries.length?table.snapshot.memoryEntries.map(entry=><div key={entry.id}><h3>{entry.kind}</h3><p>{entry.summary}</p></div>):<p>No shared memories yet.</p>}</article></div>
    </section>
    <nav className="companion-tabs" aria-label="Companion views">{(['play','sheet','table','lore'] as const).map(name=><button key={name} type="button" aria-current={tab===name?'page':undefined} aria-controls={`companion-${name}`} onClick={()=>setTab(name)}>{name[0].toUpperCase()+name.slice(1)}</button>)}</nav>
    {table.animation && <PresentationBoundary key={table.animation.id} total={table.animation.total} onClose={table.closeAnimation}><Suspense fallback={<article className="panel"><p>Saved roll: {table.animation.total}</p><button type="button" onClick={table.closeAnimation}>Close result</button></article>}>
      <DicePresentation key={table.animation.id} roll={table.animation} onClose={table.closeAnimation} />
    </Suspense></PresentationBoundary>}
  </main>;
}
