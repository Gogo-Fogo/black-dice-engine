import React, {useEffect,useMemo,useState} from 'react';
import {apiFetch} from '../../session-client';
import {CharacterPortrait} from '../../character-artwork';
import {AssetImage} from './ttrpg/AssetImage';
import type {Character,PlayerSessionSnapshot,RollRecord} from '../../../packages/contracts/dist/index.js';
type StageSnapshot=PlayerSessionSnapshot;
type StageRoll=RollRecord;
type StageAction=NonNullable<PlayerSessionSnapshot['currentAction']>;
type SceneImage={filename:string;url:string};
type SceneArt={latest:SceneImage|null;generating:{title:string;since:number}|null};
type Narration={text:string;speaking:boolean;progress:number};
const abilityNames:Record<string,string>={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
// --- Presentational pieces ------------------------------------------------------------

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, "")[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function hpTone(hp: { current: number; max: number }) {
  const ratio = hp.max > 0 ? hp.current / hp.max : 0;
  if (hp.current <= 0 || ratio <= 0.25) return "critical";
  if (ratio <= 0.6) return "wounded";
  return "healthy";
}

function ArtFrame({ art, stageRequest }: { art: SceneArt; stageRequest: typeof fetch }) {
  // Keep the previous image underneath so a new one fades in rather than popping.
  const [layers, setLayers] = useState<SceneImage[]>([]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!art.latest || failed.has(art.latest.url)) {setLayers([]);return;}
    setLayers([art.latest]);
  }, [art.latest, failed]);

  useEffect(() => {
    if (!art.generating) return;
    const tick = () => setElapsed(Math.floor((Date.now() - art.generating!.since) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [art.generating]);

  const hasArt = layers.length > 0;

  return (
    <div className={`stage-art ${art.generating ? "is-generating" : ""}`}>
      {layers.map((layer, index) => (
        <AssetImage
          key={layer.url}
          className={`stage-art-img ${index === layers.length - 1 ? "top" : ""}`}
          src={layer.url} request={stageRequest}
          alt=""
          onError={() => {
            setFailed((current) => new Set(current).add(layer.url));
            setLayers((current) => current.filter((l) => l.url !== layer.url));
          }}
        />
      ))}

      {!hasArt && !art.generating ? (
        <div className="stage-art-empty">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" />
            <path d="M12 2.5v6.3m0 0L3.5 16.6M12 8.8l8.5 7.8M3.5 16.6h17" />
          </svg>
          <p>Scene art appears here when the GM sets a scene.</p>
        </div>
      ) : null}

      {art.generating ? (
        <div className="stage-generating" role="status" aria-live="polite">
          <div className="stage-generating-sheen" aria-hidden="true" />
          <div className="stage-generating-card">
            <span className="stage-brush" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p className="stage-generating-label">Painting the scene</p>
            <p className="stage-generating-title">{art.generating.title}</p>
            <p className="stage-generating-time">{elapsed}s</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NarrationText({ narration, scene }: { narration: Narration; scene: string }) {
  const words = useMemo(() => narration.text.split(/(\s+)/).filter(Boolean), [narration.text]);
  const wordCount = words.filter((w) => !/^\s+$/.test(w)).length;
  const spokenCount = narration.speaking ? Math.floor(narration.progress * wordCount) : wordCount;
  const size = narration.text.length > 420 ? "long" : narration.text.length > 220 ? "medium" : "short";

  if (!narration.text) {
    return <p className="stage-narration placeholder">The story continues at {scene || "the table"}…</p>;
  }

  let wordIndex = 0;
  return (
    <p className={`stage-narration ${size} ${narration.speaking ? "is-speaking" : ""}`} key={narration.text}>
      {words.map((word, i) => {
        if (/^\s+$/.test(word)) return word;
        const spoken = wordIndex < spokenCount;
        wordIndex += 1;
        return (
          <span key={i} className={spoken ? "w spoken" : "w"}>
            {word}
          </span>
        );
      })}
    </p>
  );
}

function RollCall({ action, snapshot }: { action: StageAction; snapshot: StageSnapshot }) {

  return (
    <div className="stage-rollcall">
      <p className="stage-kicker">Roll for it</p>
      <p className="stage-rollcall-title">
        {action.type}
        {action.dc !== null ? <span className="stage-dc">DC {action.dc}</span> : null}
      </p>
      <p className="stage-rollcall-sub">{abilityNames[action.ability] ?? action.ability}</p>

    </div>
  );
}

function PartyStrip({ party, stageRequest }: { party: Character[]; stageRequest: typeof fetch }) {
  const shown = party.filter((c) => c.claimedByLabel).length ? party.filter((c) => c.claimedByLabel) : party;
  return (
    <div className="stage-party">
      {shown.map((c) => {
        const pct = c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;
        return (
          <div key={c.id} className="stage-member">
            <span className="stage-portrait">
              <CharacterPortrait character={c} request={stageRequest} />
            </span>
            <span className="stage-member-body">
              <span className="stage-member-name">{c.name}</span>
              <span className={`stage-hp ${hpTone(c.hp)}`}>
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="stage-member-meta">
                {c.hp.current}/{c.hp.max} HP{c.conditions.length ? ` · ${c.conditions.join(", ")}` : ""}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RollBanner({ roll, onDone }: { roll: StageRoll; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 6000);
    return () => window.clearTimeout(timer);
  }, [roll.id, onDone]);
  const natural = Array.isArray(roll.rolled) ? roll.rolled : [roll.rolled];
  const d20 = /d20/.test(roll.dice) && natural.length === 1;
  const flag = d20 && natural[0] === 20 ? "crit" : d20 && natural[0] === 1 ? "fumble" : "";
  return (
    <div className={`stage-roll-banner ${flag}`} role="status" aria-live="polite" key={roll.id}>
      <span className="stage-roll-who">
        {roll.actorName}
        <small>
          {roll.note} · {roll.dice}
        </small>
      </span>
      <span className="stage-roll-total">{roll.total}</span>
      {flag ? <span className="stage-roll-flag">{flag === "crit" ? "Natural 20" : "Natural 1"}</span> : null}
    </div>
  );
}

// --- Stage ----------------------------------------------------------------------------

export function Stage({
  snapshot,
  art,
  narration,
  latestRoll,
  onRollShown,
  fullscreen,
  stageRequest=apiFetch
}: {
  snapshot: StageSnapshot | null;
  art: SceneArt;
  narration: Narration;
  latestRoll: StageRoll | null;
  onRollShown: () => void;
  fullscreen?: boolean;
  stageRequest?: typeof fetch;
}) {
  const action = snapshot?.currentAction ?? null;
  return (
    <div className={`stage ${fullscreen ? "stage-full" : ""}`}>
      <ArtFrame art={art} stageRequest={stageRequest} />
      <div className="stage-text">
        <div className="stage-heading">
          <p className="stage-kicker">{snapshot?.campaignTitle ?? "Black Dice Engine"}</p>
          <h1 className="stage-scene">{snapshot?.currentScene ?? "Waiting for the table…"}</h1>
        </div>
        <div className="stage-narration-wrap">
          <NarrationText narration={narration} scene={snapshot?.currentScene ?? ""} />
        </div>
        {action && snapshot ? <RollCall action={action} snapshot={snapshot} /> : null}
      </div>
      {snapshot?.party.length ? <PartyStrip party={snapshot.party} stageRequest={stageRequest} /> : null}
      {latestRoll ? <RollBanner roll={latestRoll} onDone={onRollShown} /> : null}
    </div>
  );
}
