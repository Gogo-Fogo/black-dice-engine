import type { CampaignProgress, ProgressEntry } from '../packages/contracts/dist/index.js';
import './campaign-progress.css';

export function CampaignJournal({ progress, edit }: { progress?: CampaignProgress; edit?(entry: ProgressEntry): void }) {
  return <section className="campaign-journal" aria-label="Campaign progress">
    {!progress?.entries.length && <p>No recorded progress yet.</p>}
    {progress?.entries.map(entry => <article key={entry.id}>
      <p className="eyebrow">{entry.kind} · {entry.status}{edit ? ` · ${entry.visibility.replaceAll('_', ' ')}` : ''}</p>
      <h3>{entry.title}</h3><p>{entry.detail}</p>
      {entry.resolution && <p><strong>Approved outcome:</strong> {entry.resolution}</p>}
      {edit && <button type="button" onClick={() => edit(entry)}>Edit {entry.title}</button>}
    </article>)}
    {!!progress?.actions.some(action => action.consequence) && <h3>Approved consequences</h3>}
    {progress?.actions.filter(action => action.consequence).slice(-8).reverse().map(action => <article key={action.id}>
      <strong>{action.description}</strong><p>{action.consequence}</p>
    </article>)}
  </section>;
}
