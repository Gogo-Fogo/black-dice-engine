const pendingRequestStorageKey = "black-dice-engine-pending-requests";

function createRequestId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `request-${Date.now().toString(36)}-${randomPart}`;
}

function readPendingRequests() {
  try {
    const raw = window.sessionStorage.getItem(pendingRequestStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writePendingRequests(value: Record<string, string>) {
  window.sessionStorage.setItem(pendingRequestStorageKey, JSON.stringify(value));
}

export function getOrCreatePendingRequestId(fingerprint: string) {
  const pending = readPendingRequests();
  const existing = pending[fingerprint];

  if (existing) {
    return existing;
  }

  const created = createRequestId();
  writePendingRequests({
    ...pending,
    [fingerprint]: created
  });
  return created;
}

export function clearPendingRequestId(fingerprint: string) {
  const pending = readPendingRequests();

  if (!(fingerprint in pending)) {
    return;
  }

  delete pending[fingerprint];
  writePendingRequests(pending);
}
