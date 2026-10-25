import type { SessionSnapshot } from "../../../packages/contracts/dist/index.js";
import type { SceneContext } from "./ai-adapter.js";

/** Construct provider input from explicit source audiences before assembling any prompt. */
export function buildAiSceneContext(snapshot: SessionSnapshot, audience: "gm_only" | "public_demo"): SceneContext {
  const allowed = (visibility: string) => audience === "gm_only" || visibility === "public_demo";
  const text = (value: string, maximum = 2000) => value.slice(0, maximum);
  const scene = snapshot.activeSceneContext;
  const location = scene.location && allowed(scene.location.visibility) ? scene.location : null;
  // Facts have no independent visibility; inherit their campaign-bible container.
  const facts = allowed(snapshot.campaignBible.visibility) ? scene.facts.slice(0, 8) : [];
  const events = snapshot.eventLog.filter(event => allowed(event.visibility)).slice(0, 5);
  const memories = (snapshot.memoryEntries ?? []).filter(entry => entry.status === 'confirmed' &&
    entry.campaignId === snapshot.campaignId && allowed(entry.visibility))
    .sort((a, b) => Number(b.sceneId === snapshot.campaignProgress?.sceneId) - Number(a.sceneId === snapshot.campaignProgress?.sceneId))
    .slice(0, 12);
  const progress = snapshot.campaignProgress;
  const ledger = (progress?.entries ?? []).filter(entry => allowed(entry.visibility));
  const actions = (progress?.actions ?? []).filter(action => allowed(action.visibility)).slice(-8);
  const sources: NonNullable<SceneContext["sources"]> = [
    ...memories.map(entry => ({ source: 'memory' as const, visibility: entry.visibility, text: text(`${entry.id} [${entry.kind}] ${entry.summary}`) })),
    // Preserve every ledger entry, including old completed gates; do not rotate them out with the event feed.
    ...ledger.map(entry => ({ source: 'progress' as const, visibility: entry.visibility,
      text: `${entry.id} [${entry.kind}/${entry.status}] ${entry.title}; scene=${entry.sceneId}; condition/context=${text(entry.detail, 800)}; approved payoff=${text(entry.resolution, 800)}` })),
    ...actions.map(action => ({ source: 'action_resolution' as const, visibility: action.visibility,
      text: JSON.stringify({ action: action.description, sceneId: action.sceneId, dc: action.dc, participants: action.participants,
        approvedConsequence: action.consequence || 'Not yet approved. Do not invent consequences.' }) })),
    ...facts.map(fact => ({ source: "campaign_bible" as const, visibility: snapshot.campaignBible.visibility, text: text(fact.text) })),
    ...events.map(event => ({ source: "table_event" as const, visibility: event.visibility, text: text(event.summary) })),
    ...(location ? [{ source: "location" as const, visibility: location.visibility, text: text(location.summary) }] : [])
  ];
  return { audience, sources,
    ...(progress && audience === 'gm_only' ? { pacing: { sceneId: progress.sceneId, actionsSinceProgress: progress.actionsSinceProgress,
      stalled: progress.actionsSinceProgress >= 3 } } : {}), campaignTitle: text(snapshot.campaignTitle, 256), currentScene: text(snapshot.currentScene, 1024),
    ...(location ? { sceneDescription: text(location.summary), location: { name: text(location.name, 256), summary: text(location.summary) } } : {}),
    tone: allowed(snapshot.campaignBible.visibility) ? scene.tone.slice(0, 8).map(value => text(value, 128)) : [],
    facts: facts.map(fact => text(fact.text)), recentEvents: events.map(event => text(event.summary)),
    activeCharacters: snapshot.party.slice(0, 20).map(character => ({ name: text(character.name, 128), raceClass: text(character.classLabel, 128), hp: character.hp.current, maxHp: character.hp.max })) };
}
