import { SessionError, type LocalIdentity } from "./session-authority.js";
import { partyChoices, partyClientActions, type PartyAction as ClientAction, type Choice, type PartyStage, type PartyState,
  type PartyOutcome as Outcome, type PartySnapshot } from "../../../packages/contracts/dist/index.js";
export type { Choice, PartyStage, PartyState } from "../../../packages/contracts/dist/index.js";

export const partyScenes = [
  { prompt: "The clocktower's brass door sneezes sparks.", mend: "Repair the latch", dare: "Ride the spring", guard: "Shield the entrance" },
  { prompt: "Wind-up pigeons carry away the minute hand.", mend: "Build a decoy", dare: "Leap for the hand", guard: "Catch falling gears" },
  { prompt: "The stairs rotate into a sideways maze.", mend: "Align the steps", dare: "Race the turning stairs", guard: "Anchor the rope" },
  { prompt: "A kettle-shaped thundercloud fills the workshop.", mend: "Patch the vent", dare: "Bottle the lightning", guard: "Ground the benches" },
  { prompt: "The midnight bell begins to glow.", mend: "Tune the bell", dare: "Strike the wild chord", guard: "Brace the tower" }
] as const;
export type PartyAction = ClientAction | "deadline";
export const partyActions: PartyAction[] = [...partyClientActions, "deadline"];
const choices: readonly Choice[] = partyChoices;
export function newPartyState(sessionId: string): PartyState {
  return { schemaVersion: 1, sessionId, mode: "party", revision: 0, roundId: 0, stage: "lobby", roster: [], participants: [],
    choices: {}, outcomes: [], history: [], danger: 3, deadline: null, paused: false, remainingMs: null, ending: null, winners: [] };
}
function requireStage(state: PartyState, ...stages: PartyStage[]) {
  if (!stages.includes(state.stage)) throw new SessionError(409, `This action is unavailable during ${state.stage}.`);
}
function lock(state: PartyState, skip = false) {
  requireStage(state, "choosing");
  for (const id of state.participants) if (skip || !state.choices[id]) state.choices[id] = "pass";
  state.stage = "locked";
  state.deadline = null;
  state.remainingMs = null;
}
/** Pure state transition: only its returned value may be committed/published. */
export function applyPartyAction(previous: PartyState, actor: LocalIdentity, action: PartyAction,
  input: Record<string, unknown>, now: number, d6: () => number): PartyState {
  const state = structuredClone(previous);
  if (actor.sessionId !== state.sessionId) throw new SessionError(409, "Wrong party session.");
  const playerAction = action === "enter" || action === "ready" || action === "choose";
  if (playerAction ? actor.role !== "player" : actor.role !== "gm") throw new SessionError(403, playerAction ? "Use a player seat for this action." : "Host access required.");
  if (state.paused && !["resume", "extend", "enter", "ready"].includes(action)) throw new SessionError(409, "The game is paused. Ask the host to resume.");
  let seat = state.roster.find(seat => seat.actorId === actor.actorId);
  if (action === "enter") {
    if (state.stage === "ending") throw new SessionError(409, "This game has ended. Ask the host for a new room.");
    if (!seat) {
      if (state.roster.length >= 7) throw new SessionError(409, "The seven player seats are occupied.");
      if (state.roster.some(seat => seat.label.toLocaleLowerCase() === actor.label.toLocaleLowerCase())) throw new SessionError(409, "That player label is already seated.");
      seat = { actorId: actor.actorId, label: actor.label, seat: state.roster.length + 1, ready: false, score: 0 };
      state.roster.push(seat);
    }
  } else if (action === "ready") {
    if (!seat) throw new SessionError(409, "Enter the lobby first.");
    if (state.participants.includes(actor.actorId) && ["choosing", "locked", "reveal", "resolving"].includes(state.stage)) throw new SessionError(409, "Your participation is fixed until the next round.");
    if (typeof input.ready !== "boolean") throw new SessionError(400, "A ready flag is required.");
    seat.ready = input.ready;
  } else if (action === "start") {
    requireStage(state, "lobby");
    const ready = state.roster.filter(seat => seat.ready);
    if (ready.length < 6 || ready.length > 7) throw new SessionError(409, "Start requires six or seven ready players.");
    state.roundId = 1;
    state.stage = "briefing";
  } else if (action === "advance") {
    if (state.stage === "briefing") {
      state.participants = state.roster.filter(seat => seat.ready).map(seat => seat.actorId);
      if (state.participants.length < 6) throw new SessionError(409, "Six ready players are required to open the round.");
      state.choices = {};
      state.outcomes = [];
      state.deadline = now + 60000;
      state.stage = "choosing";
    } else if (state.stage === "locked") state.stage = "reveal";
    else if (state.stage === "reveal") {
      state.stage = "resolving";
      for (const seat of state.roster.filter(seat => state.participants.includes(seat.actorId))) {
        const choice = state.choices[seat.actorId];
        const roll = choice === "pass" ? null : d6();
        if (roll !== null && (!Number.isInteger(roll) || roll < 1 || roll > 6)) throw new Error("Invalid authoritative d6 result");
        const success = roll !== null && roll >= (choice === "mend" ? 3 : choice === "dare" ? 5 : 2);
        const points = success ? choice === "mend" ? 2 : choice === "dare" ? 4 : 1 : 0;
        const dangerDelta = choice === "mend" ? success ? -1 : 1 : choice === "dare" ? success ? 0 : 2 : choice === "guard" && success ? -1 : 0;
        state.danger = Math.max(0, Math.min(12, state.danger + dangerDelta));
        seat.score += points;
        state.outcomes.push({ actorId: seat.actorId, seat: seat.seat, choice, roll, success, points, dangerAfter: state.danger,
          text: choice === "pass" ? `${seat.label} passes safely.` : `${seat.label} chooses ${choice}, rolls ${roll}: ${success ? "success" : "setback"}. +${points} points; danger ${state.danger}.` });
      }
      state.history.push({ roundId: state.roundId, outcomes: structuredClone(state.outcomes), danger: state.danger });
    } else if (state.stage === "resolving") state.stage = "summary";
    else if (state.stage === "summary") {
      if (state.roundId < 5) { state.roundId++; state.stage = "briefing"; }
      else {
        state.stage = "ending";
        state.ending = state.danger <= 3 ? "The tower rings a harmless rainbow. You save the town!" : state.danger <= 7
          ? "The town survives a spectacular shower of confetti!" : "The tower becomes a giant cuckoo. Everyone escapes, but you must explain the bird!";
        const high = Math.max(...state.roster.map(seat => seat.score));
        state.winners = state.roster.filter(seat => seat.score === high).map(seat => seat.actorId);
      }
    } else throw new SessionError(409, "Lock choices before advancing, or start a new room after the ending.");
  } else if (action === "choose") {
    requireStage(state, "choosing");
    if (state.deadline === null || now >= state.deadline) throw new SessionError(409, "The choice deadline has passed.");
    if (!state.participants.includes(actor.actorId)) throw new SessionError(403, "Wait for the next round to participate.");
    if (!choices.includes(input.choice as Choice)) throw new SessionError(400, "Choose mend, dare, guard or pass.");
    state.choices[actor.actorId] = input.choice as Choice;
    if (state.participants.every(id => state.choices[id])) lock(state);
  } else if (action === "lock" || action === "skip") lock(state, action === "skip");
  else if (action === "deadline") {
    requireStage(state, "choosing");
    if (state.deadline === null || now < state.deadline) throw new SessionError(409, "Deadline has not passed.");
    lock(state);
  } else if (action === "pause") {
    if (state.stage === "ending" || state.stage === "lobby") throw new SessionError(409, "Start a game before pausing.");
    state.remainingMs = state.deadline === null ? null : Math.max(0, state.deadline - now);
    state.deadline = null;
    state.paused = true;
  } else if (action === "resume") {
    if (!state.paused) throw new SessionError(409, "The game is already running.");
    state.paused = false;
    if (state.stage === "choosing") state.deadline = now + (state.remainingMs ?? 0);
    state.remainingMs = null;
  } else if (action === "extend") {
    requireStage(state, "choosing");
    if (!Number.isInteger(input.seconds) || Number(input.seconds) < 1 || Number(input.seconds) > 300) throw new SessionError(400, "Extend by 1–300 seconds.");
    if (state.paused) state.remainingMs = (state.remainingMs ?? 0) + Number(input.seconds) * 1000;
    else state.deadline = Math.max(now, state.deadline ?? now) + Number(input.seconds) * 1000;
  }
  return state;
}

/** Host and TV also wait for reveal; only the submitting player's own choice is private. */
export function projectParty(state: PartyState, viewer: LocalIdentity): PartySnapshot {
  const revealed = ["reveal", "resolving", "summary", "ending"].includes(state.stage);
  const outcome = (value: Outcome) => ({ actorId: value.actorId, seat: value.seat, choice: value.choice, roll: value.roll,
    success: value.success, points: value.points, dangerAfter: value.dangerAfter, text: value.text });
  return { schemaVersion: state.schemaVersion, sessionId: state.sessionId, mode: state.mode, revision: state.revision,
    roundId: state.roundId, stage: state.stage, roster: state.roster.map(seat => ({ actorId: seat.actorId, label: seat.label, seat: seat.seat, ready: seat.ready, score: seat.score })), participants: [...state.participants], danger: state.danger,
    deadline: state.deadline, paused: state.paused, remainingMs: state.remainingMs, ending: state.ending, winners: state.winners,
    scene: state.roundId ? partyScenes[state.roundId - 1] : null, submittedCount: state.participants.filter(id => state.choices[id]).length,
    choices: revealed ? { ...state.choices } : {}, outcomes: revealed ? state.outcomes.map(outcome) : [],
    history: state.history.map(round => ({ roundId: round.roundId, danger: round.danger, outcomes: round.outcomes.map(outcome) })),
    ownChoice: viewer.role === "player" ? state.choices[viewer.actorId] ?? null : null };
}
