// ============================================================
// Wallet Connect Diagnostics
// ============================================================
// Minimal, non-invasive instrumentation for the browser wallet
// connection flow. Records identity/timing events to a bounded
// in-memory buffer and mirrors them to the console with the
// prefix "[wallet-connect-diag]".
//
// SAFETY: nothing sensitive is ever recorded. We only capture
// wallet display metadata (name / apiVersion / injected UUID),
// numeric identity fingerprints (no object contents), call
// counts, and timings. No addresses, balances, keys, transcripts
// or seeds are logged.
// ============================================================

type DiagEvent = {
  t: number;
  label: string;
  data?: unknown;
};

const MAX_EVENTS = 256;
const events: DiagEvent[] = [];

export const record = (label: string, data?: unknown): void => {
  const evt: DiagEvent = {
    t: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    label,
    data,
  };
  events.push(evt);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  console.debug('[wallet-connect-diag]', label, data ?? '');
};

export const getDiagEvents = (): DiagEvent[] => events.slice();

export const resetDiags = (): void => {
  events.length = 0;
};

// ------------------------------------------------------------
// Identity fingerprints
// ------------------------------------------------------------
// Numeric, memory-stable ids for injected API objects. Lets us
// tell whether the same InitialAPI object is reused across
// clicks or whether the extension re-injected a new one — without
// ever serializing the wallet object itself.
// ------------------------------------------------------------

const apiIds = new WeakMap<object, number>();
let apiIdCounter = 0;

export const apiFingerprint = (api: unknown): number => {
  if (api && typeof api === 'object') {
    const existing = apiIds.get(api);
    if (existing !== undefined) return existing;
    apiIdCounter += 1;
    apiIds.set(api, apiIdCounter);
    return apiIdCounter;
  }
  return -1;
};

// ------------------------------------------------------------
// window.midnight snapshot (metadata only)
// ------------------------------------------------------------

type InjectedEntryMeta = {
  uuid: string;
  name: string | null;
  apiVersion: string | null;
  rdns: string | null;
  fingerprint: number;
};

export const snapWindowMidnight = (): InjectedEntryMeta[] => {
  const root = (
    window as unknown as { midnight?: Record<string, unknown> }
  ).midnight;
  if (!root || typeof root !== 'object') return [];

  return Object.entries(root).map(([uuid, entry]) => {
    const w = entry as Partial<{
      name: unknown;
      apiVersion: unknown;
      rdns: unknown;
    }>;
    return {
      uuid,
      name: typeof w.name === 'string' ? w.name : null,
      apiVersion: typeof w.apiVersion === 'string' ? w.apiVersion : null,
      rdns: typeof w.rdns === 'string' ? w.rdns : null,
      fingerprint: apiFingerprint(entry),
    };
  });
};

const snapKey = (snap: InjectedEntryMeta[]): string =>
  JSON.stringify(
    snap.map((e) => ({
      uuid: e.uuid,
      name: e.name,
      apiVersion: e.apiVersion,
      rdns: e.rdns,
      fingerprint: e.fingerprint,
    }))
  );

export const sameSnap = (
  a: InjectedEntryMeta[],
  b: InjectedEntryMeta[]
): boolean => snapKey(a) === snapKey(b);

// ------------------------------------------------------------
// connect() invocation counter
// ------------------------------------------------------------

let connectCalls = 0;

export const nextConnectCallId = (): number => {
  connectCalls += 1;
  return connectCalls;
};

export const getConnectCallCount = (): number => connectCalls;

// ------------------------------------------------------------
// Pending-connection tracking (mount/unmount diagnostics)
// ------------------------------------------------------------

let pendingConnections = 0;

export const markPendingStart = (): void => {
  pendingConnections += 1;
};

export const markPendingEnd = (): void => {
  pendingConnections = Math.max(0, pendingConnections - 1);
};

export const isConnectionPending = (): boolean => pendingConnections > 0;

// ------------------------------------------------------------
// Console self-service
// ------------------------------------------------------------

if (typeof window !== 'undefined') {
  const win = window as unknown as {
    __walletConnectDiag?: {
      events: () => unknown[];
      reset: () => void;
      connectCallCount: () => number;
    };
  };
  win.__walletConnectDiag = {
    events: getDiagEvents,
    reset: resetDiags,
    connectCallCount: getConnectCallCount,
  };
}