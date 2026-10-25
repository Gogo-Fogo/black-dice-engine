// Loaded only by the isolated legacy server child. Never load a provider/model.
globalThis.fetch = async () => {
  process.stderr.write('UNEXPECTED_OUTGOING_FETCH\n');
  throw new Error('Outgoing fetch disabled in isolated verification');
};
