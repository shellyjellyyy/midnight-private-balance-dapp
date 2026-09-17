// ============================================================
// Privacy Counter Contract API
// ============================================================
// This module wraps deployContract and findDeployedContract
// and exposes the operations the frontend needs.
// ============================================================

import type {
  ContractAddress,
  StateValue,
} from '@midnight-ntwrk/compact-runtime';
import {
  deployContract,
  findDeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import {
  CompiledCounterContract,
  counterLedger,
} from './compiled.js';
import {
  createPrivacyCounterPrivateState,
  type PrivacyCounterPrivateState,
} from './witnesses.js';
import { type Observable, map } from 'rxjs';
import {
  PrivacyCounterPrivateStateId,
} from './providers.js';
import type {
  Contract,
  Witnesses,
  Ledger,
} from '../../managed/counter/contract/index.js';

// ============================================================
// Types
// ============================================================

export type CounterDerivedState = {
  readonly balanceCommitmentsCount: bigint;
  readonly totalCommitted: bigint;
};

export type CounterAPI = {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<CounterDerivedState>;
  commitBalance: () => Promise<CounterDerivedState>;
  getTotalCommitted: () => Promise<bigint>;
};

// ============================================================
// Helper Functions
// ============================================================

const buildDerivedState = (ledgerState: Ledger): CounterDerivedState => {
  return {
    balanceCommitmentsCount: ledgerState.balanceCommitments.size(),
    totalCommitted: ledgerState.totalCommitted,
  };
};

// ============================================================
// Deploy / Join
// ============================================================

/**
 * Deploy a new privacy counter contract.
 */
export const deployCounter = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers: any,
  balance: number
): Promise<{ api: CounterAPI; secretKey: PrivacyCounterPrivateState }> => {
  const privateState = createPrivacyCounterPrivateState(balance);

  const deployed = await deployContract(providers, {
    compiledContract: CompiledCounterContract,
    privateStateId: PrivacyCounterPrivateStateId,
    initialPrivateState: privateState,
  });

  const api = buildAPI(deployed, providers);

  return { api, secretKey: privateState };
};

/**
 * Join an existing privacy counter contract.
 */
export const joinCounter = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers: any,
  contractAddress: ContractAddress,
  balance: number
): Promise<CounterAPI> => {
  const privateState = createPrivacyCounterPrivateState(balance);

  const found = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: CompiledCounterContract,
    privateStateId: PrivacyCounterPrivateStateId,
    initialPrivateState: privateState,
  });

  const api = buildAPI(found, providers);

  return api;
};

// ============================================================
// Build API
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildAPI = (deployed: any, providers: any): CounterAPI => {
  const deployedContractAddress = deployed.deployTxData.public.contractAddress;

  const state$: Observable<CounterDerivedState> = providers.publicDataProvider
    .contractStateObservable(deployedContractAddress, { type: 'latest' })
    .pipe(
      map((contractState: any) => {
        const ledgerState = counterLedger(contractState.data) as Ledger;
        return buildDerivedState(ledgerState);
      })
    );

  const commitBalance = async (): Promise<CounterDerivedState> => {
    const txData = (await deployed.callTx.commitBalance()) as {
      public?: {
        nextContractState?: unknown;
        txId?: unknown;
        txHash?: unknown;
        status?: unknown;
      };
    };

    // IMPORTANT: `callTx.commitBalance()` blocks (via submitTx ->
    // watchForTxData) until this transaction is IN A BLOCK on-chain, and
    // scoped() throws CallTxFailedError unless its status is
    // SucceedEntirely. The resolved value therefore carries the
    // CONFIRMED post-commit contract state:
    //   public.nextContractState : StateValue (ledger AFTER the circuit ran)
    //   public.txId / txHash     : the transaction identifiers
    // We decode nextContractState directly below instead of re-querying.
    // (state$ is NOT reliable for this: in midnight-js v4.0.4,
    // contractStateObservable({type:'latest'}) ends in `take(1)` and emits
    // exactly ONE state — never subsequent updates.)
    const nextState = txData?.public?.nextContractState;
    if (!nextState) {
      throw new Error(
        `commitBalance resolved without nextContractState for ${deployedContractAddress}`
      );
    }
    const ledgerState = counterLedger(nextState as StateValue) as Ledger;
    const derived = buildDerivedState(ledgerState);

    return derived;
  };

  const getTotalCommitted = async (): Promise<bigint> => {
    const contractState = await providers.publicDataProvider
      .queryContractState(deployedContractAddress);
    if (!contractState) {
      throw new Error(
        `No contract state found on chain for ${deployedContractAddress}`
      );
    }
    const ledgerState = counterLedger(contractState.data) as Ledger;
    const derived = buildDerivedState(ledgerState);
    return derived.totalCommitted;
  };

  return {
    deployedContractAddress,
    state$,
    commitBalance,
    getTotalCommitted,
  };
};
