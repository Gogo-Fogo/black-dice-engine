import { useEffect, useRef, useState } from "react";
import { abilities, abilityModifier, formatMod, getJson, getPendingRequestId, clearPendingRequestId, haptic, postJson } from "./lib";
import type { SessionSnapshot } from "./types";

// Quick character creation: four fast questions, three proposals with portraits, pick one.

type Option = { id: string; label: string; hint?: string };
type ForgeOptions = { roles: Option[]; ancestries: Option[]; vibes: Option[]; lookIdeas: string[]; level: number };

type Answers = {
  role: string;
  ancestry: string;
  vibes: string[];
  presentation: "any" | "feminine" | "masculine" | "androgynous";
  look: string;
  name: string;
};

type Portrait = { status: "queued" | "running" | "ready" | "failed" | "offline"; url: string | null };

type Proposal = {
  id: string;
  name: string;
  ancestryLabel: string;
  classLabel: string;
  hp: number;
  armorClass: number;
  stats: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number> & { skills: string[] };
  inventory: Array<{ id: string; name: string; detail?: string }>;
  appearance: string;
  personality: string;
  hook: string;
  portraits: Portrait[];
};

type ForgeSession = { id: string; round: number; flavorSource: "llm" | "template"; proposals: Proposal[] };

type Step = "role" | "ancestry" | "vibe" | "details" | "forging" | "proposals";

const questionSteps: Step[] = ["role", "ancestry", "vibe", "details"];

const forgingLines = ["Rolling ability scores…", "Choosing gear…", "Naming your heroes…", "Sending portraits to the painter…"];

export function Forge({
  clientId,
  playerLabel,
  onCancel,
  onCreated,
  onError
}: {
  clientId: string;
  playerLabel: string;
  onCancel: () => void;
  onCreated: (snapshot: SessionSnapshot) => void;
  onError: (message: string) => void;
}) {
  const [options, setOptions] = useState<ForgeOptions | null>(null);
  const [step, setStep] = useState<Step>("role");
  const [answers, setAnswers] = useState<Answers>({ role: "", ancestry: "", vibes: [], presentation: "any", look: "", name: "" });
  const [session, setSession] = useState<ForgeSession | null>(null);
  const [busy, setBusy] = useState<"" | "reroll" | "choose">("");

  useEffect(() => {
    getJson<ForgeOptions>("/api/character-forge/options")
      .then(setOptions)
      .catch(() => onError("Couldn't load character options from the table."));
  }, [onError]);

  // Portraits finish one by one in ComfyUI; poll until they're all settled.
  const pending = session?.proposals.some((p) => p.portraits.some((x) => x.status === "queued" || x.status === "running"));
  useEffect(() => {
    if (!session || !pending) return;
    const timer = window.setTimeout(async () => {
      try {
        const data = await getJson<{ session: ForgeSession }>(
          `/api/character-forge/sessions/${session.id}?clientId=${encodeURIComponent(clientId)}`
        );
        setSession(data.session);
      } catch {
        // keep the last state; try again on the next tick
        setSession((s) => (s ? { ...s } : s));
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [session, pending, clientId]);

  function choose<K extends keyof Answers>(key: K, value: Answers[K], next?: Step) {
    haptic(8);
    setAnswers((a) => ({ ...a, [key]: value }));
    if (next) setStep(next);
  }

  async function forge() {
    setStep("forging");
    try {
      const data = await postJson<{ session: ForgeSession }>("/api/character-forge/sessions", { clientId, answers });
      setSession(data.session);
      setStep("proposals");
      haptic([15, 40, 15]);
    } catch (error) {
      onError(error instanceof Error ? error.message : "The forge went cold. Try again.");
      setStep("details");
    }
  }

  async function reroll() {
    if (!session) return;
    setBusy("reroll");
    try {
      const data = await postJson<{ session: ForgeSession }>(`/api/character-forge/sessions/${session.id}/reroll`, { clientId });
      setSession(data.session);
      haptic(15);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't forge new options.");
    } finally {
      setBusy("");
    }
  }

  async function pickProposal(proposal: Proposal, portraitIndex: number) {
    if (!session) return;
    setBusy("choose");
    const fingerprint = `forge-choose:${session.id}:${proposal.id}`;
    try {
      const data = await postJson<{ sessionSnapshot: SessionSnapshot }>(`/api/character-forge/sessions/${session.id}/choose`, {
        clientId,
        proposalId: proposal.id,
        portraitIndex,
        playerLabel,
        requestId: getPendingRequestId(fingerprint)
      });
      clearPendingRequestId(fingerprint);
      haptic([20, 50, 30]);
      onCreated(data.sessionSnapshot);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't create that character.");
      setBusy("");
    }
  }

  function back() {
    const index = questionSteps.indexOf(step);
    if (step === "proposals") setStep("details");
    else if (index > 0) setStep(questionSteps[index - 1]);
    else onCancel();
  }

  const stepIndex = questionSteps.indexOf(step);

  return (
    <div className="forge">
      <header className="forge-top">
        <button type="button" className="icon-btn" onClick={back} aria-label={step === "role" ? "Close" : "Back"} disabled={step === "forging"}>
          {step === "role" ? "✕" : "←"}
        </button>
        <span className="forge-title">{step === "proposals" ? "Pick your hero" : "New character"}</span>
        {stepIndex >= 0 ? (
          <span className="forge-dots" aria-label={`Step ${stepIndex + 1} of ${questionSteps.length}`}>
            {questionSteps.map((s, i) => (
              <i key={s} className={i <= stepIndex ? "on" : ""} />
            ))}
          </span>
        ) : (
          <span className="forge-dots" />
        )}
      </header>

      {!options ? (
        <div className="forge-center">
          <span className="spinner" aria-label="Loading" />
        </div>
      ) : step === "role" ? (
        <section className="forge-step" key="role">
          <h1>How do you want to play?</h1>
          <div className="forge-cards">
            {options.roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`forge-card ${answers.role === role.id ? "selected" : ""}`}
                onClick={() => choose("role", role.id, "ancestry")}
              >
                <strong>{role.label}</strong>
                <span>{role.hint}</span>
              </button>
            ))}
          </div>
        </section>
      ) : step === "ancestry" ? (
        <section className="forge-step" key="ancestry">
          <h1>What are you?</h1>
          <div className="forge-grid">
            {options.ancestries.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`forge-chip big ${answers.ancestry === a.id ? "selected" : ""}`}
                onClick={() => choose("ancestry", a.id, "vibe")}
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              className={`forge-chip big surprise ${answers.ancestry === "any" ? "selected" : ""}`}
              onClick={() => choose("ancestry", "any", "vibe")}
            >
              Surprise me
            </button>
          </div>
        </section>
      ) : step === "vibe" ? (
        <section className="forge-step" key="vibe">
          <h1>What's your personality?</h1>
          <p className="muted">Pick up to two.</p>
          <div className="forge-grid">
            {options.vibes.map((v) => {
              const on = answers.vibes.includes(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  className={`forge-chip big ${on ? "selected" : ""}`}
                  onClick={() => {
                    const next = on ? answers.vibes.filter((x) => x !== v.id) : [...answers.vibes, v.id].slice(-2);
                    choose("vibes", next, next.length === 2 ? "details" : undefined);
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn primary forge-next" onClick={() => setStep("details")}>
            {answers.vibes.length ? "Next" : "Skip"}
          </button>
        </section>
      ) : step === "details" ? (
        <section className="forge-step" key="details">
          <h1>Last touches</h1>
          <p className="forge-label">Presentation</p>
          <div className="segmented">
            {(["any", "feminine", "masculine", "androgynous"] as const).map((p) => (
              <button key={p} type="button" className={answers.presentation === p ? "active" : ""} onClick={() => choose("presentation", p)}>
                {p === "any" ? "Any" : p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <label className="forge-label" htmlFor="forge-look">
            Look <span className="muted">(optional)</span>
          </label>
          <textarea
            id="forge-look"
            className="text-input"
            rows={2}
            maxLength={160}
            value={answers.look}
            placeholder="Silver braid, burn scar, patched red coat…"
            onChange={(e) => setAnswers((a) => ({ ...a, look: e.target.value }))}
          />
          <div className="chip-row">
            {options.lookIdeas.map((idea) => (
              <button
                key={idea}
                type="button"
                className="forge-chip"
                onClick={() =>
                  setAnswers((a) => ({
                    ...a,
                    look: a.look.toLowerCase().includes(idea.toLowerCase()) ? a.look : (a.look ? `${a.look}, ` : "") + idea.toLowerCase()
                  }))
                }
              >
                + {idea}
              </button>
            ))}
          </div>
          <label className="forge-label" htmlFor="forge-name">
            Name <span className="muted">(optional)</span>
          </label>
          <input
            id="forge-name"
            className="text-input"
            maxLength={40}
            value={answers.name}
            placeholder="Leave blank for suggestions"
            onChange={(e) => setAnswers((a) => ({ ...a, name: e.target.value }))}
          />
          <button type="button" className="btn primary forge-go" onClick={() => void forge()}>
            Forge my character
          </button>
        </section>
      ) : step === "forging" ? (
        <ForgingScreen />
      ) : session ? (
        <Proposals
          session={session}
          level={options.level}
          busy={busy}
          onPick={pickProposal}
          onReroll={() => void reroll()}
          onChangeAnswers={() => setStep("role")}
        />
      ) : null}
    </div>
  );
}

function ForgingScreen() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLine((l) => (l + 1) % forgingLines.length), 1400);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="forge-center" role="status" aria-live="polite">
      <span className="forge-anvil" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" />
          <path d="M12 2.5v6.3m0 0L3.5 16.6M12 8.8l8.5 7.8M3.5 16.6h17" />
        </svg>
      </span>
      <h1>Forging three heroes</h1>
      <p className="muted forge-line" key={line}>
        {forgingLines[line]}
      </p>
    </div>
  );
}

function Proposals({
  session,
  level,
  busy,
  onPick,
  onReroll,
  onChangeAnswers
}: {
  session: ForgeSession;
  level: number;
  busy: "" | "reroll" | "choose";
  onPick: (proposal: Proposal, portraitIndex: number) => void;
  onReroll: () => void;
  onChangeAnswers: () => void;
}) {
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActive(0);
    railRef.current?.scrollTo({ left: 0 });
  }, [session.round]);

  function onScroll() {
    const rail = railRef.current;
    if (!rail) return;
    setActive(Math.round(rail.scrollLeft / rail.clientWidth));
  }

  return (
    <section className="forge-proposals">
      <p className="muted forge-sub">
        Level {level}, ready to play. Swipe to compare{session.flavorSource === "template" ? "" : " — written by the table's AI"}.
      </p>
      <div className="forge-rail" ref={railRef} onScroll={onScroll}>
        {session.proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} busy={busy} onPick={onPick} />
        ))}
      </div>
      <div className="forge-pager" aria-hidden="true">
        {session.proposals.map((p, i) => (
          <i key={p.id} className={i === active ? "on" : ""} />
        ))}
      </div>
      <div className="forge-actions">
        <button type="button" className="btn ghost" disabled={!!busy} onClick={onReroll}>
          {busy === "reroll" ? "Forging…" : "Show me 3 others"}
        </button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={onChangeAnswers}>
          Change my answers
        </button>
      </div>
    </section>
  );
}

function ProposalCard({ proposal, busy, onPick }: { proposal: Proposal; busy: string; onPick: (p: Proposal, portraitIndex: number) => void }) {
  const firstReady = proposal.portraits.findIndex((p) => p.status === "ready");
  const [variant, setVariant] = useState<number | null>(null);
  const shown = variant ?? Math.max(0, firstReady);
  const portrait = proposal.portraits[shown];
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const imageOk = portrait?.url && !broken.has(portrait.url);
  const painting = portrait && (portrait.status === "queued" || portrait.status === "running");
  const initials = proposal.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="forge-proposal">
      <div className="forge-portrait">
        {imageOk ? (
          <img
            key={portrait.url!}
            src={portrait.url!}
            alt={`Portrait design ${shown + 1} for ${proposal.name}`}
            onError={() => setBroken((s) => new Set(s).add(portrait.url!))}
          />
        ) : (
          <div className={`forge-portrait-empty ${painting ? "painting" : ""}`}>
            <span>{initials}</span>
            <small>{painting ? "Painting portrait…" : portrait?.status === "offline" ? "Image generator offline" : "No portrait yet"}</small>
          </div>
        )}
        {proposal.portraits.length > 1 ? (
          <div className="forge-variants" role="radiogroup" aria-label="Portrait design">
            {proposal.portraits.map((p, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={shown === i}
                className={`${shown === i ? "on" : ""} ${p.status}`}
                onClick={() => setVariant(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="forge-body">
        <h2>{proposal.name}</h2>
        <p className="forge-class">
          {proposal.ancestryLabel} {proposal.classLabel}
        </p>
        <div className="forge-vitals">
          <span>
            <small>HP</small>
            <b>{proposal.hp}</b>
          </span>
          <span>
            <small>AC</small>
            <b>{proposal.armorClass}</b>
          </span>
          {abilities.map((a) => (
            <span key={a.key}>
              <small>{a.short}</small>
              <b>{formatMod(abilityModifier(proposal.stats[a.key]))}</b>
            </span>
          ))}
        </div>
        <p className="forge-text">{proposal.appearance}</p>
        <p className="forge-text">{proposal.personality}</p>
        <p className="forge-hook">{proposal.hook}</p>
        <div className="chip-row">
          {proposal.stats.skills.map((s) => (
            <span key={s} className="chip">
              {s.replace(/_/g, " ")}
            </span>
          ))}
        </div>
        <p className="forge-gear">{proposal.inventory.map((i) => i.name).join(" · ")}</p>
      </div>

      <button type="button" className="btn primary forge-pick" disabled={!!busy} onClick={() => onPick(proposal, shown)}>
        {busy === "choose" ? "Creating…" : `Play ${proposal.name.split(" ")[0]}`}
      </button>
    </article>
  );
}
