// ============================================================
// MidnightProvider
// ============================================================
// Owns a single instance of the wallet connection state and
// shares it with every component via context. This guarantees
// that WalletConnect, CircuitCall, and any other consumer see
// exactly the same connecting/connected/providers state,
// avoiding independent hooks racing each other.
// ============================================================

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMidnight } from './useMidnight';
import { isConnectionPending, record } from '../diagnostics/walletConnect.js';

// ReturnType<typeof useMidnight> is the MidnightState plus connect/disconnect.
type MidnightContextValue = ReturnType<typeof useMidnight>;

const MidnightContext = createContext<MidnightContextValue | null>(null);

export function MidnightProvider({ children }: { children: ReactNode }) {
  const value = useMidnight();

  useEffect(() => {
    record('provider:mounted', { pending: isConnectionPending() });
    return () => record('provider:unmounted', { pending: isConnectionPending() });
  }, []);

  return (
    <MidnightContext.Provider value={value}>
      {children}
    </MidnightContext.Provider>
  );
}

export function useMidnightState(): MidnightContextValue {
  const value = useContext(MidnightContext);

  if (!value) {
    throw new Error(
      'useMidnightState must be used within a MidnightProvider'
    );
  }

  return value;
}