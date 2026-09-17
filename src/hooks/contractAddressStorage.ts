// ============================================================
// Contract Address Persistence
// ============================================================
// Persists ONLY the public contract address in localStorage so a
// user can reconnect to the same deployed contract across page
// refreshes without re-deploying. Nothing else is ever stored:
// no wallet credentials, seeds, balances, nonces, private state,
// proving keys, or transaction secrets.
// ============================================================

import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';

const STORAGE_KEY = 'midnight.privacyCounter.contractAddress';

export const loadSavedContractAddress = (): ContractAddress | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) as ContractAddress | null;
  } catch {
    return null;
  }
};

export const saveContractAddress = (address: ContractAddress): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, address);
  } catch {
    // Ignore storage errors (e.g. private mode, quota) — persistence is best-effort.
  }
};

export const clearSavedContractAddress = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors — clearing is best-effort.
  }
};