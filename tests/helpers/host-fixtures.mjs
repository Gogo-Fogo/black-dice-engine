/** Original, in-memory wire fixtures; never import a service or read campaign data. */
export function hostSnapshot() {
  const safety = { rating: 'demo', lines: [], veils: [] };
  return { schemaVersion: 1, sessionId: 'synthetic', mode: 'ttrpg', roundId: null, stage: 'table', revision: 0,
    campaignId: 'demo', campaignTitle: 'Synthetic table', currentScene: 'A quiet crossroads', tablePin: '', joinUrl: '/player/',
    campaignBible: { id: 'demo', title: 'Synthetic table', subtitle: 'Demo', visibility: 'public_demo', tone: [], safety, facts: [] },
    activeSceneContext: { title: 'A quiet crossroads', location: null, npcs: [], facts: [], tone: [], safety },
    party: [], rollLog: [], eventLog: [], approvalQueue: [], mediaJobs: [], assetRecords: [], memoryEntries: [], audioCueQueue: [], currentAction: null };
}
export function hostRuntime() {
  return { id: 'demo', status: 'ok', mode: 'fast', updatedAt: 'demo', services: [], clients: [], warnings: [],
    mediaPressure: { level: 'low', summary: 'Ready', reasons: [], blockedJobTypes: [] } };
}
export function mediaJob() {
  return { id: 'demo-job', campaignId: 'demo', type: 'image', status: 'draft', priority: 'low', visibility: 'gm_only',
    runWhen: 'manual', createdAt: 'demo', settings: {} };
}
export function assetRecord() {
  return { id: 'demo-asset', campaignId: 'demo', kind: 'image', visibility: 'gm_only', status: 'generated', metadata: {} };
}
