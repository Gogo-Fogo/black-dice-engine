import React from "react";
import type { PlayerSessionSnapshot } from "../../../../packages/contracts/dist/index.js";

export function TableFeed({ snapshot, memory=true }: { snapshot: PlayerSessionSnapshot | null; memory?:boolean }) {
  return <><article className="panel"><h2>Recent table rolls</h2><div className="roll-log">
    {snapshot?.rollLog.length ? snapshot.rollLog.map(roll => <div className="roll-row" key={roll.id}>
      <div><strong>{roll.actorName}</strong><p>{roll.note} — {roll.dice}</p></div>
      <div className="roll-values"><strong>{roll.total}</strong><time dateTime={roll.timestamp}>{new Date(roll.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
    </div>) : <p>Waiting for live rolls.</p>}
  </div></article>
    {memory&&!!snapshot?.memoryEntries.length && <article className="panel"><h2>Session memory</h2>{snapshot.memoryEntries.map(entry => <div className="roll-row" key={entry.id}><strong>{entry.kind}</strong><p>{entry.summary}</p></div>)}</article>}
  </>;
}
