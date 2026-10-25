import React from "react";
import type { SessionSnapshot } from "./types";
import type { useTableControls } from "./useTableControls";
import { formatTime, formatInitiative } from "./format";

type Table = ReturnType<typeof useTableControls>;

type Build = NonNullable<SessionSnapshot["party"][number]["build"]>;
/** Quick-start picks are defaults; the GM reviews them here. */
function BuildSummary({ build }: { build: Build }) {
  const magic = build.spellcasting;
  return <details className="party-build">
    <summary>{[build.subclass, build.background, ...build.attacks.slice(0, 2).map(a => `${a.name} ${a.bonus}`)].filter(Boolean).join(" · ")}</summary>
    <ul>{build.attacks.map(a => <li key={a.name}>{a.name} {a.bonus} · {a.damage}{a.notes ? ` (${a.notes})` : ""}</li>)}</ul>
    {magic && <p>{magic.ability.toUpperCase()} save DC {magic.saveDc}, attack {magic.attackBonus}. Cantrips: {magic.cantrips.join(", ") || "none"}. {magic.style === "prepared" ? "Prepared" : "Known"}: {magic.spells.join(", ") || "none"}.</p>}
    <p>Features: {build.features.join(", ")}</p>
    {build.abilityImprovements && <p>{build.abilityImprovements}</p>}
  </details>;
}

export function TableStatePanel({ snapshot, advancedMode, pendingActionKey, table, queueCharacterVisualCanonJob }: { snapshot: SessionSnapshot | null; advancedMode: boolean; pendingActionKey: string; table: Table; queueCharacterVisualCanonJob(characterId: string): Promise<void> }) {
const { conditionDrafts, setConditionDrafts, queueApprovalMode, setQueueApprovalMode, combatMode, setCombatMode, combatRound, setCombatRound, combatTurnIndex, setCombatTurnIndex, submitStateEvent, resolveProposal } = table;
return (<article className="panel">
          <div className="panel-header">
            <h2>Party State</h2>
            <span>{snapshot?.party.length ?? 0} linked</span>
            {advancedMode ? (
              <button
                className="mini-button"
                disabled={pendingActionKey !== ""}
                onClick={() => {
                  snapshot?.party.forEach((character) => {
                    if (character.initiative !== null) {
                      void submitStateEvent(
                        { type: "initiative_set", characterId: character.id, value: null },
                        `init-clear:${character.id}`,
                        `init-clear-${character.id}`
                      );
                    }
                  });
                }}
                type="button"
              >
                Clear Initiative
              </button>
            ) : null}
          </div>
          {advancedMode ? (
            <label className="mode-toggle">
              <input
                checked={queueApprovalMode}
                onChange={(event) => setQueueApprovalMode(event.target.checked)}
                type="checkbox"
              />
              <span>Queue risky state changes for approval</span>
            </label>
          ) : null}

          {snapshot?.party.some((c) => c.initiative !== null) ? (
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              <button
                className="mini-button"
                onClick={() => {
                  setCombatMode(!combatMode);
                  if (!combatMode) {
                    setCombatRound(1);
                    setCombatTurnIndex(0);
                  }
                }}
                type="button"
              >
                {combatMode ? "End Combat" : "Start Combat"}
              </button>
            </div>
          ) : null}

          {combatMode && snapshot?.party.some((c) => c.initiative !== null) ? (
            <div className="combat-tracker" style={{ marginBottom: "14px" }}>
              <div className="combat-header">
                <span className="combat-round">Round {combatRound}</span>
                <button
                  className="combat-next-btn"
                  onClick={() => {
                    const combatants = snapshot.party
                      .filter((c) => c.initiative !== null)
                      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
                    if (combatTurnIndex + 1 >= combatants.length) {
                      setCombatTurnIndex(0);
                      setCombatRound((r) => r + 1);
                    } else {
                      setCombatTurnIndex((i) => i + 1);
                    }
                  }}
                  type="button"
                >
                  Next Turn →
                </button>
              </div>
              <div className="combat-order">
                {snapshot.party
                  .filter((c) => c.initiative !== null)
                  .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
                  .map((character, idx) => (
                    <div
                      key={character.id}
                      className={`combat-turn ${idx === combatTurnIndex ? "combat-active" : ""}`}
                    >
                      <span className="combat-init">{character.initiative}</span>
                      <div>
                        <strong>{character.name}</strong>
                        <span className="combat-hp">HP {character.hp.current}/{character.hp.max}</span>
                        {character.conditions.length > 0 ? (
                          <span className="combat-conditions">{character.conditions.join(", ")}</span>
                        ) : null}
                      </div>
                      {idx === combatTurnIndex ? <span className="combat-badge">ACTIVE</span> : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="party-list">
            {snapshot?.party
              .slice()
              .sort((a, b) => {
                const ai = a.initiative ?? -1;
                const bi = b.initiative ?? -1;
                if (ai !== bi) return bi - ai;
                return a.name.localeCompare(b.name);
              })
              .map((character) => {
                const hpPct = Math.max(0, Math.min(100, Math.round((character.hp.current / character.hp.max) * 100)));
                const hpClass = character.hp.current <= character.hp.max * 0.25 ? "hp-critical" : character.hp.current <= character.hp.max * 0.5 ? "hp-wounded" : "";
                return advancedMode ? (
                  <div key={character.id} className="party-card">
                    <div>
                      <h3>{character.name}</h3>
                      <p>{character.classLabel}</p>
                    </div>
                    <div className="party-stats">
                      <span>HP {character.hp.current}/{character.hp.max}</span>
                      <span>AC {character.armorClass}</span>
                      <span>{formatInitiative(character.initiative)}</span>
                    </div>
                    {character.build && <BuildSummary build={character.build} />}
                    <div className="initiative-row">
                      <input
                        className="initiative-input"
                        type="number"
                        value={character.initiative ?? ""}
                        onChange={(event) => {
                          const value = event.target.value ? Number(event.target.value) : null;
                          void submitStateEvent(
                            { type: "initiative_set", characterId: character.id, value },
                            `init:${character.id}:${value}`,
                            `init-${character.id}`
                          );
                        }}
                        placeholder="Init"
                      />
                    </div>
                    <div className="tag-row">
                      {character.conditions.length > 0 ? (
                        character.conditions.map((condition) => (
                          <span key={condition} className="tag-chip">{condition}</span>
                        ))
                      ) : (
                        <span className="tag-chip muted-chip">No conditions</span>
                      )}
                    </div>
                    <div className="party-detail-grid">
                      <div>
                        <p className="detail-label">Resources</p>
                        <ul className="detail-list">
                          {character.resources.map((resource) => (
                            <li key={resource.id}>
                              <span>{resource.label}</span>
                              <div className="detail-actions">
                                <strong>{resource.current}/{resource.max}</strong>
                                <div className="stepper-row">
                                  <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "resource_set", characterId: character.id, resourceId: resource.id, value: resource.current - 1 }, `resource:${character.id}:${resource.id}:${resource.current - 1}`, `resource-dec-${character.id}-${resource.id}`)} type="button">-</button>
                                  <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "resource_set", characterId: character.id, resourceId: resource.id, value: resource.current + 1 }, `resource:${character.id}:${resource.id}:${resource.current + 1}`, `resource-inc-${character.id}-${resource.id}`)} type="button">+</button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="detail-label">Inventory</p>
                        <ul className="detail-list">
                          {character.inventory.map((item) => (
                            <li key={item.id}><span>{item.name}</span><strong>x{item.quantity}</strong></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="gm-action-grid">
                      <div className="action-panel">
                        <p className="detail-label">Quick HP</p>
                        <div className="hp-quick-row">
                          <input
                            type="number"
                            className="hp-quick-input"
                            placeholder="DMG"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = Number((e.target as HTMLInputElement).value);
                                if (!isNaN(val) && val !== 0) {
                                  void submitStateEvent(
                                    { type: "hp_delta", characterId: character.id, amount: -Math.abs(val) },
                                    `hp:${character.id}:-${Math.abs(val)}`,
                                    `hp-dmg-${character.id}`
                                  );
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                          <input
                            type="number"
                            className="hp-quick-input heal"
                            placeholder="HEAL"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = Number((e.target as HTMLInputElement).value);
                                if (!isNaN(val) && val !== 0) {
                                  void submitStateEvent(
                                    { type: "hp_delta", characterId: character.id, amount: Math.abs(val) },
                                    `hp:${character.id}:+${Math.abs(val)}`,
                                    `hp-heal-${character.id}`
                                  );
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                        </div>
                        <div className="quick-action-row">
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -1 }, `hp:${character.id}:-1`, `hp-1-${character.id}`)} type="button">-1</button>
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -5 }, `hp:${character.id}:-5`, `hp-5-${character.id}`)} type="button">-5</button>
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 1 }, `hp:${character.id}:1`, `hp+1-${character.id}`)} type="button">+1</button>
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 5 }, `hp:${character.id}:5`, `hp+5-${character.id}`)} type="button">+5</button>
                        </div>
                      </div>
                      <div className="action-panel">
                        <p className="detail-label">Condition Controls</p>
                        <div className="condition-entry-row">
                          <input className="inline-input" onChange={(event) => setConditionDrafts((current) => ({ ...current, [character.id]: event.target.value }))} placeholder="Add condition" value={conditionDrafts[character.id] ?? ""} />
                          <button className="mini-button" disabled={pendingActionKey !== "" || !(conditionDrafts[character.id] ?? "").trim()} onClick={() => void submitStateEvent({ type: "condition_add", characterId: character.id, condition: (conditionDrafts[character.id] ?? "").trim() }, `condition-add:${character.id}:${(conditionDrafts[character.id] ?? "").trim()}`, `condition-add-${character.id}`, { clearConditionDraftFor: character.id })} type="button">Add</button>
                        </div>
                        {character.conditions.length > 0 ? (
                          <div className="removal-chip-row">
                            {character.conditions.map((condition) => (
                              <button className="tag-chip removable-chip" disabled={pendingActionKey !== ""} key={`${character.id}-${condition}`} onClick={() => void submitStateEvent({ type: "condition_remove", characterId: character.id, condition }, `condition-remove:${character.id}:${condition}`, `condition-remove-${character.id}-${condition}`)} type="button">{condition} x</button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <p className="party-note">{character.notes[0]}</p>
                    <p className="claim-note">{character.claimedByLabel ? `Claimed by ${character.claimedByLabel}` : "Unclaimed"}</p>
                    <button className="mini-button secondary-button" disabled={pendingActionKey !== ""||!character.portrait?.approvedId} title={character.portrait?.approvedId?'Generate from the approved reference':'Approve a portrait reference first'} onClick={() => void queueCharacterVisualCanonJob(character.id)} type="button">Queue Visual Canon Job</button>
                  </div>
                ) : (
                  <div key={character.id} className="simple-party-card">
                    <div className="simple-party-header">
                      <h3>{character.name}</h3>
                      <span>{character.classLabel}</span>
                    </div>
                    <div className="hp-bar">
                      <div className={`hp-bar-fill ${hpClass}`} style={{ width: `${hpPct}%` }} />
                    </div>
                    <div className="simple-party-stats">
                      <span>HP<strong>{character.hp.current}/{character.hp.max}</strong></span>
                      <span>AC<strong>{character.armorClass}</strong></span>
                      {character.initiative !== null ? <span>INIT<strong>{character.initiative}</strong></span> : null}
                    </div>
                    {character.build && <BuildSummary build={character.build} />}
                    <div className="tag-row">
                      {character.conditions.length > 0 ? (
                        character.conditions.map((condition) => (
                          <span key={condition} className="tag-chip">{condition}</span>
                        ))
                      ) : (
                        <span className="tag-chip muted-chip">No conditions</span>
                      )}
                    </div>
                    <div className="hp-simple-row">
                      <button className="hp-big-btn dmg" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -5 }, `hp:${character.id}:-5`, `hp-5-${character.id}`)} type="button">-5</button>
                      <button className="hp-big-btn dmg" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -1 }, `hp:${character.id}:-1`, `hp-1-${character.id}`)} type="button">-1</button>
                      <button className="hp-big-btn heal" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 1 }, `hp:${character.id}:1`, `hp+1-${character.id}`)} type="button">+1</button>
                      <button className="hp-big-btn heal" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 5 }, `hp:${character.id}:5`, `hp+5-${character.id}`)} type="button">+5</button>
                    </div>
                  </div>
                );
              }) ?? <p>No party state yet.</p>}
          </div>
        </article>);
}

export function ApprovalPanel({ snapshot, pendingActionKey, table }: { snapshot: SessionSnapshot | null; pendingActionKey: string; table: Table }) {
const { conditionDrafts, setConditionDrafts, queueApprovalMode, setQueueApprovalMode, combatMode, setCombatMode, combatRound, setCombatRound, combatTurnIndex, setCombatTurnIndex, submitStateEvent, resolveProposal } = table;
return (<article className="panel">
          <div className="panel-header">
            <h2>Approval Queue</h2>
            <span>{snapshot?.approvalQueue.length ?? 0} waiting</span>
          </div>
          <p className="muted-line">
            Risky state changes land here before they become canon. Approve to apply them to the table, or reject
            to discard them.
          </p>
          <div className="approval-list">
            {snapshot?.approvalQueue.length ? (
              snapshot.approvalQueue.map((proposal) => (
                <div className="approval-row" key={proposal.id}>
                  <div>
                    <strong>{proposal.summary}</strong>
                    <p>
                      queued by {proposal.submittedBy.label} · {formatTime(proposal.createdAt)}
                    </p>
                  </div>
                  <div className="approval-actions">
                    <button
                      className="mini-button"
                      disabled={pendingActionKey !== ""}
                      onClick={() => void resolveProposal(proposal.id, "approve")}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      className="mini-button secondary-button"
                      disabled={pendingActionKey !== ""}
                      onClick={() => void resolveProposal(proposal.id, "reject")}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>No queued state changes.</p>
            )}
          </div>
        </article>);
}
