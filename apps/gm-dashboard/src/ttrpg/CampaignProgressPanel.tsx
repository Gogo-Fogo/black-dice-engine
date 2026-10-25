import { useRef, useState } from 'react';
import { isSnapshotResponse, progressKinds, progressStatuses, type CampaignProgress, type ProgressCommand,
  type ProgressEntry, type ProgressVisibility, type SessionSnapshot } from '../../../../packages/contracts/dist/index.js';
import { CampaignJournal } from '../../../campaign-journal';
import { apiFetch } from '../../../session-client';
import { getOrCreatePendingRequestId, clearPendingRequestId } from './pending-requests';

const empty = (): Extract<ProgressCommand, { operation: 'record' }> => ({ operation: 'record', kind: 'objective',
  title: '', detail: '', status: 'active', visibility: 'gm_only', resolution: '' });

function Visibility({ value, change }: { value: ProgressVisibility; change(value: ProgressVisibility): void }) {
  return <label>Who can see this?<select value={value} onChange={e => change(e.target.value as ProgressVisibility)}>
    <option value="gm_only">GM only</option><option value="player_visible">Players</option><option value="public_demo">Players and display</option>
  </select></label>;
}

function ConsequenceForm({ action, disabled, save }: { action: CampaignProgress['actions'][number]; disabled: boolean;
  save(command: ProgressCommand): Promise<boolean> }) {
  const [consequence, setConsequence] = useState('');
  const [visibility, setVisibility] = useState<ProgressVisibility>('gm_only');
  return <form className="progress-form" onSubmit={e => { e.preventDefault(); void save({ operation: 'consequence', actionId: action.id, consequence, visibility }); }}>
    <fieldset disabled={disabled}><legend>{action.description}</legend>
      <ul>{action.participants.map(p => <li key={p.actorId}>{p.actorName}: {p.total} / DC {action.dc ?? 'unset'} — {p.success === null ? 'GM ruling needed' : p.success ? 'success' : 'failure'}</li>)}</ul>
      <label>Approve the consequence<textarea required maxLength={2000} value={consequence} onChange={e => setConsequence(e.target.value)} placeholder="What actually changed? Include the payoff, cost or alternative route." /></label>
      <Visibility value={visibility} change={setVisibility}/><button type="submit">Save approved consequence</button>
    </fieldset>
  </form>;
}

export function CampaignProgressPanel({ snapshot, setSnapshot }: { snapshot: SessionSnapshot | null; setSnapshot(value: SessionSnapshot): void }) {
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const form = useRef<HTMLFormElement>(null);
  async function save(command: ProgressCommand) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const fingerprint = `progress:${JSON.stringify(command)}`;
    try {
      const response = await apiFetch('/api/campaign-progress', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...command, requestId: getOrCreatePendingRequestId(fingerprint) }) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(typeof body === 'object' && body && 'error' in body ? String(body.error) : 'Could not save progress.');
      if (!isSnapshotResponse(body)) throw new Error('Invalid server response. Retry to confirm the saved command.');
      setSnapshot(body.sessionSnapshot); clearPendingRequestId(fingerprint); setMessage('Progress saved.'); return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Connection lost. Retry the same command to confirm it.'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function edit(entry: ProgressEntry) {
    setDraft({ operation: 'record', id: entry.id, kind: entry.kind, title: entry.title, detail: entry.detail, status: entry.status, visibility: entry.visibility, resolution: entry.resolution, reason: '' });
    form.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    form.current?.querySelector('input')?.focus();
  }
  const progress = snapshot?.campaignProgress;
  return <article className="panel"><h2>Campaign progress</h2>
    <p>Record goals, clues, resolved obstacles and earned milestones. For a scene, describe its purpose and closure conditions. Completed entries require an approved payoff or consequence.</p>
    {(progress?.actionsSinceProgress ?? 0) >= 3 && <p role="status">Pacing check: {progress?.actionsSinceProgress} group actions without recorded progress. Approve a payoff, cost or new route before repeating a challenge.</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form ref={form} className="progress-form" onSubmit={e => { e.preventDefault(); void save(draft).then(saved => { if (saved) setDraft(empty()); }); }}>
      <fieldset disabled={busy || !progress}>
        <label>Record type<select value={draft.kind} disabled={!!draft.id} onChange={e => setDraft({ ...draft, kind: e.target.value as ProgressEntry['kind'] })}>{progressKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>Title<input required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
        <label>Context / completion conditions<textarea required={draft.kind === 'scene'} maxLength={2000} value={draft.detail} onChange={e => setDraft({ ...draft, detail: e.target.value })}/></label>
        <label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as ProgressEntry['status'] })}>{progressStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label>Approved payoff / consequence<textarea required={draft.status !== 'active'} maxLength={2000} value={draft.resolution} onChange={e => setDraft({ ...draft, resolution: e.target.value })}/></label>
        <Visibility value={draft.visibility} change={visibility => setDraft({ ...draft, visibility })}/>
        {draft.id && <label>Reason for changing resolved progress<input maxLength={2000} value={draft.reason ?? ''} onChange={e => setDraft({ ...draft, reason: e.target.value })}/></label>}
        <button type="submit">{busy ? 'Saving…' : draft.id ? 'Save changes' : 'Record progress'}</button>
        {draft.id && <button type="button" onClick={() => setDraft(empty())}>Cancel edit</button>}
      </fieldset>
    </form>
    <CampaignJournal progress={progress} edit={edit}/>
    <details><summary>Actions awaiting approved consequences ({progress?.actions.filter(a => !a.consequence).length ?? 0})</summary>
      {progress?.actions.filter(a => !a.consequence).slice(-12).reverse().map(action => <ConsequenceForm key={action.id} action={action} disabled={busy} save={save}/>)}</details>
  </article>;
}
