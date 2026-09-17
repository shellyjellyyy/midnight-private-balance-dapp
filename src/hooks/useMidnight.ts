// ============================================================
// useMidnight Hook
// ============================================================
// This hook manages wallet connection and provides access to
// the Midnight.js providers for contract interaction.
// ============================================================

import { useCallback, useState } from 'react';
import type {
  ConnectedAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import {
  listInjectedWallets,
  connectWallet,
  createBrowserProviders,
  type InjectedWallet,
  type ConnectedWallet,
} from '../contracts/providers.js';
import type {
  ContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  deployCounter,
  joinCounter,
  type CounterAPI,
} from '../contracts/counter-api.js';
import {
  loadSavedContractAddress,
  saveContractAddress,
  clearSavedContractAddress,
} from './contractAddressStorage.js';
import {
  apiFingerprint,
  getConnectCallCount,
  markPendingEnd,
  markPendingStart,
  record,
  sameSnap,
  snapWindowMidnight,
} from '../diagnostics/walletConnect.js';

// ============================================================
// Types
// ============================================================

export type WalletError =
  | { type: 'not-installed' }
  | { type: 'rejected' }
  | { type: 'network-mismatch' }
  | { type: 'unknown'; message: string };

// Provider type (simplified to avoid complex generic issues)
export type Providers = Awaited<ReturnType<typeof createBrowserProviders>>;

interface MidnightState {
  connecting: boolean;
  connected: boolean;
  address: string | null;
  wallet: ConnectedWallet | null;
  providers: Providers | null;
  error: WalletError | null;
}

// ============================================================
// Hook
// ============================================================

export function useMidnight() {
  const [state, setState] = useState<MidnightState>({
    connecting: false,
    connected: false,
    address: null,
    wallet: null,
    providers: null,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    // Diagnostic helper: logs the outcome of each connection sub-step
    // so a failing step can be pinned down from the browser console.
    const runStep = async <T>(step: string, promise: Promise<T>): Promise<T> => {
      try {
        const value = await promise;
        console.debug(`[wallet-connect] step "${step}" resolved`);
        return value;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.debug(`[wallet-connect] step "${step}" failed: ${message}`);
        throw err;
      }
    };

    // Discover wallets
    const wallets = listInjectedWallets();
    record('connect:click', {
      callNumberAtClick: getConnectCallCount() + 1,
      detected: wallets.map(({ uuid, name, apiVersion, rdns }) => ({
        uuid,
        name,
        apiVersion,
        rdns,
      })),
    });

    // Select 1AM as the exclusive wallet target. The 1AM wallet injects
    // under the fixed key window.midnight['1am']; we also match on the
    // documented name/rdns ("1am") for robustness against injection-key
    // variation. No other wallet is used and there is no fallback target.
    const oneAmWallet =
      wallets.find((w) => w.uuid === '1am') ??
      wallets.find(
        (w) =>
          w.name.toLowerCase().includes('1am') ||
          String(w.rdns).toLowerCase().includes('1am')
      );
    const wallet = oneAmWallet ?? null;
    if (!wallet) {
      record('connect:wallet-not-found', {
        totalDetected: wallets.length,
        all: wallets.map((w) => ({
          uuid: w.uuid,
          name: w.name,
          apiVersion: w.apiVersion,
          fingerprint: apiFingerprint(w.api),
        })),
      });
      setState((s) => ({
        ...s,
        connecting: false,
        error: { type: 'not-installed' },
      }));
      return;
    }
    record('connect:wallet-selected', {
      totalDetected: wallets.length,
      chosen: {
        uuid: wallet.uuid,
        name: wallet.name,
        apiVersion: wallet.apiVersion,
        fingerprint: apiFingerprint(wallet.api),
      },
    });

    markPendingStart();
    let lastSnap = snapWindowMidnight();
    const poller = window.setInterval(() => {
      const snap = snapWindowMidnight();
      if (!sameSnap(snap, lastSnap)) {
        record('window:midnight-changed', {
          duringConnect: true,
          previous: lastSnap,
          current: snap,
        });
        lastSnap = snap;
      }
    }, 500);

    try {
      // Connect to wallet
      const connected = await runStep('connectWallet', connectWallet(wallet, 'preprod'));

      // Verify the connection is live as documented by the connector API.
      const connectionStatus = await runStep(
        'getConnectionStatus',
        connected.connectedApi.getConnectionStatus()
      );
      record('connect:connection-status', connectionStatus);

      // Get wallet address
      const addresses = await runStep(
        'getShieldedAddresses',
        connected.connectedApi.getShieldedAddresses()
      );
      const address = addresses.shieldedAddress ?? null;

      // Create providers
      const providers = await runStep('createBrowserProviders', createBrowserProviders(connected));

      setState({
        connecting: false,
        connected: true,
        address,
        wallet: connected,
        providers,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[wallet-connect-error]', err);
      console.error('[wallet-connect-error-string]', message);
      if (err instanceof Error) {
        console.error('[wallet-connect-error-stack]', err.stack);
      }
      const isRejection = /reject|denied|cancel/i.test(message);
      const isNetworkIssue = /network/i.test(message);

      setState({
        connecting: false,
        connected: false,
        address: null,
        wallet: null,
        providers: null,
        error: isRejection
          ? { type: 'rejected' }
          : isNetworkIssue
            ? { type: 'network-mismatch' }
            : { type: 'unknown', message },
      });
    } finally {
      window.clearInterval(poller);
      markPendingEnd();
      const finalSnap = snapWindowMidnight();
      if (!sameSnap(finalSnap, lastSnap)) {
        record('window:midnight-changed', {
          duringConnect: true,
          previous: lastSnap,
          current: finalSnap,
        });
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    // The DApp Connector API (v4.0.1) does not provide an explicit disconnect method.
    // The connection is session-based and will be cleared when the page is reloaded.
    // We clear the local state to reflect the disconnected state in the UI.
    setState({
      connecting: false,
      connected: false,
      address: null,
      wallet: null,
      providers: null,
      error: null,
    });
  }, []);

  return { ...state, connect, disconnect };
}

// ============================================================
// Contract Hook
// ============================================================

export function useContract() {
  // Restore the saved public contract address, if any. This only stores the
  // address — never wallet credentials, private state, balances, or secrets.
  // No deploy and no transaction is triggered just because the address exists.
  const [contractAddress, setContractAddress] = useState<ContractAddress | null>(
    () => loadSavedContractAddress()
  );
  const [counterApi, setCounterApi] = useState<CounterAPI | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deploy = useCallback(async (
    providers: Providers,
    balance: number
  ) => {
    setDeploying(true);
    setError(null);

    try {
      const { api } = await deployCounter(providers, balance);
      setContractAddress(api.deployedContractAddress);
      saveContractAddress(api.deployedContractAddress);
      setCounterApi(api);
      setDeploying(false);
      return api;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setDeploying(false);
      throw err;
    }
  }, []);

  const join = useCallback(async (
    providers: Providers,
    address: ContractAddress,
    balance: number
  ) => {
    setJoining(true);
    setError(null);

    try {
      const api = await joinCounter(providers, address, balance);
      setContractAddress(address);
      saveContractAddress(address);
      setCounterApi(api);
      setJoining(false);
      return api;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setJoining(false);
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setContractAddress(null);
    setCounterApi(null);
    setError(null);
  }, []);

  const clearContract = useCallback(() => {
    setContractAddress(null);
    setCounterApi(null);
    setError(null);
    clearSavedContractAddress();
  }, []);

  return {
    contractAddress,
    counterApi,
    deploying,
    joining,
    error,
    deploy,
    join,
    reset,
    clearContract,
  };
}
