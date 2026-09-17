// ============================================================
// Midnight.js Providers Factory
// ============================================================
// This file assembles the full MidnightProviders object from
// a connected wallet. It handles ZK config, proof generation,
// indexer queries, and transaction submission.
// ============================================================

import type {
  ConnectedAPI,
  InitialAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/ledger-v8';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type {
  PrivateStateId,
  PrivateStateProvider,
  PrivateStateExport,
  ExportPrivateStatesOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  SigningKeyExport,
  ExportSigningKeysOptions,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
} from '@midnight-ntwrk/midnight-js-types';
import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/compact-runtime';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  createProofProvider,
} from '@midnight-ntwrk/midnight-js-types';
import {
  apiFingerprint,
  nextConnectCallId,
  record,
} from '../diagnostics/walletConnect.js';

// ============================================================
// Types
// ============================================================

export type { ConnectedAPI, InitialAPI };

export type InjectedWallet = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  apiVersion: string;
  api: InitialAPI;
};

export type ConnectedWallet = {
  readonly connectedApi: ConnectedAPI;
};

// ============================================================
// Private State Provider (in-memory for browser)
// ============================================================

const PrivacyCounterPrivateStateId = 'privacyCounterPrivateState' as const;

export const inMemoryPrivateStateProvider = <
  PSI extends PrivateStateId,
  PS
>(): PrivateStateProvider<PSI, PS> => {
  const privateStates = new Map<string, PS>();
  const signingKeys = new Map<string, SigningKey>();
  let currentAddress = '';

  const psKey = (id: PSI) => `${currentAddress}:${String(id)}`;

  return {
    setContractAddress(address: ContractAddress): void {
      currentAddress = address;
    },
    async set(id: PSI, state: PS): Promise<void> {
      privateStates.set(psKey(id), state);
    },
    async get(id: PSI): Promise<PS | null> {
      return privateStates.get(psKey(id)) ?? null;
    },
    async remove(id: PSI): Promise<void> {
      privateStates.delete(psKey(id));
    },
    async clear(): Promise<void> {
      for (const k of privateStates.keys()) {
        if (k.startsWith(`${currentAddress}:`)) privateStates.delete(k);
      }
    },
    async setSigningKey(
      address: ContractAddress,
      key: SigningKey
    ): Promise<void> {
      signingKeys.set(address, key);
    },
    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(address);
    },
    async clearSigningKeys(): Promise<void> {
      signingKeys.clear();
    },
    async exportPrivateStates(
      _options?: ExportPrivateStatesOptions
    ): Promise<PrivateStateExport> {
      return { states: [], version: 1 } as unknown as PrivateStateExport;
    },
    async importPrivateStates(
      _exportData: PrivateStateExport,
      _options?: ImportPrivateStatesOptions
    ): Promise<ImportPrivateStatesResult> {
      return { imported: 0 } as ImportPrivateStatesResult;
    },
    async exportSigningKeys(
      _options?: ExportSigningKeysOptions
    ): Promise<SigningKeyExport> {
      return { keys: [] } as unknown as SigningKeyExport;
    },
    async importSigningKeys(
      _exportData: SigningKeyExport,
      _options?: ImportSigningKeysOptions
    ): Promise<ImportSigningKeysResult> {
      return { imported: 0 } as ImportSigningKeysResult;
    },
  };
};

// ============================================================
// Wallet Discovery and Connection
// ============================================================

/**
 * Discover all compliant Midnight wallets from window.midnight
 */
export const listInjectedWallets = (): InjectedWallet[] => {
  if (typeof window === 'undefined') return [];

  const root = (window as unknown as { midnight?: Record<string, unknown> })
    .midnight;
  if (!root || typeof root !== 'object') return [];

  const wallets: InjectedWallet[] = [];
  for (const [uuid, entry] of Object.entries(root)) {
    const w = entry as Partial<InitialAPI> & { uuid?: string };
    if (!w || typeof w !== 'object' || !w.name) continue;

    wallets.push({
      uuid,
      name: w.name,
      icon: w.icon ?? '',
      rdns: w.rdns ?? '',
      apiVersion: w.apiVersion ?? '',
      api: w as InitialAPI,
    });
  }

  return wallets;
};

/**
 * Connect to the chosen wallet using the v4 connect(networkId) API.
 */
export const connectWallet = async (
  wallet: InjectedWallet,
  networkId = 'preprod'
): Promise<ConnectedWallet> => {
  const callId = nextConnectCallId();
  const startedAt = performance.now();

  record('connect:invoked', {
    callId,
    uuid: wallet.uuid,
    name: wallet.name,
    apiVersion: wallet.apiVersion,
    fingerprint: apiFingerprint(wallet.api),
    networkId,
  });

  try {
    const connectedApi = await wallet.api.connect(networkId);
    record('connect:resolved', {
      callId,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return { connectedApi };
  } catch (err) {
    const anyErr = err as { name?: unknown; code?: unknown; type?: unknown };
    record('connect:rejected', {
      callId,
      elapsedMs: Math.round(performance.now() - startedAt),
      errorName: err instanceof Error ? err.name : String(typeof err),
      errorCode: anyErr?.code ?? null,
      errorType: anyErr?.type ?? null,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

// ============================================================
// Providers Factory
// ============================================================

// Import types for the contract
import type { PrivacyCounterPrivateState } from './witnesses.js';
import type {
  Contract,
} from '../../managed/counter/contract/index.js';

type CounterCircuitKeys = keyof Contract<PrivacyCounterPrivateState>['impureCircuits'];
type CounterPrivateStateIdType = typeof PrivacyCounterPrivateStateId;

// Simple MidnightProviders type (simplified from SDK)
type MidnightProviders = {
  privateStateProvider: PrivateStateProvider<CounterPrivateStateIdType, PrivacyCounterPrivateState>;
  publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  zkConfigProvider: FetchZkConfigProvider<CounterCircuitKeys>;
  proofProvider: ReturnType<typeof httpClientProofProvider>;
  walletProvider: {
    getCoinPublicKey(): string;
    getEncryptionPublicKey(): string;
    balanceTx: (tx: UnboundTransaction, _ttl?: Date) => Promise<FinalizedTransaction>;
  };
  midnightProvider: {
    submitTx: (tx: FinalizedTransaction) => Promise<TransactionId>;
  };
};

/**
 * Build the full MidnightProviders set for a browser dApp using the v4 API.
 */
export const createBrowserProviders = async (
  connected: ConnectedWallet
): Promise<MidnightProviders> => {
  const { connectedApi } = connected;
  const config = await connectedApi.getConfiguration();

  // Register the network ID globally so midnight-js SDK internals can read it.
  setNetworkId(config.networkId);

  const shieldedAddresses = await connectedApi.getShieldedAddresses();

  // Fetch ZK config from the Vite dev server (keys/ and zkir/ directories)
  const keyMaterialProvider = new FetchZkConfigProvider<CounterCircuitKeys>(
    window.location.origin,
    fetch.bind(window)
  );

  // Proof provider: prefer wallet's built-in proving, fall back to HTTP proof server
  const proofProvider = await (async () => {
    if (typeof connectedApi.getProvingProvider === 'function') {
      record('proofProvider:source', { source: 'wallet-proving-api' });
      const provingProvider =
        await connectedApi.getProvingProvider(keyMaterialProvider);
      return createProofProvider(
        provingProvider as Parameters<typeof createProofProvider>[0]
      );
    }
    if (config.proverServerUri) {
      record('proofProvider:source', { source: 'http-proof-server' });
      return httpClientProofProvider(
        config.proverServerUri,
        keyMaterialProvider
      );
    }
    record('proofProvider:source', { source: 'none' });
    throw new Error(
      'No proof provider available: the wallet does not expose a proving service ' +
      'and no proverServerUri was found in the wallet configuration. ' +
      'Run a local Midnight proof server on http://localhost:6300 and ensure ' +
      'your wallet configuration includes its address.'
    );
  })();

  return {
    privateStateProvider: inMemoryPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri
    ),
    zkConfigProvider: keyMaterialProvider,
    proofProvider,
    walletProvider: {
      getCoinPublicKey(): string {
        return shieldedAddresses.shieldedCoinPublicKey;
      },
      getEncryptionPublicKey(): string {
        return shieldedAddresses.shieldedEncryptionPublicKey;
      },
      balanceTx: async (
        tx: UnboundTransaction,
        _ttl?: Date
      ): Promise<FinalizedTransaction> => {
        const serializedTx = toHex(tx.serialize());
        const received =
          await connectedApi.balanceUnsealedTransaction(serializedTx);
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(received.tx)
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedApi.submitTransaction(toHex(tx.serialize()));
        const ids = tx.identifiers();
        return ids[0];
      },
    },
  };
};

export { PrivacyCounterPrivateStateId };
