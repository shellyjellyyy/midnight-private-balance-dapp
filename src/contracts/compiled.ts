// ============================================================
// Contract Binding
// ============================================================
// This file binds the compiled Compact contract with witnesses
// and prepares it for use with the Midnight.js SDK.
// ============================================================

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as ManagedCounter from '../../managed/counter/contract/index.js';
import { witnesses, type PrivacyCounterPrivateState } from './witnesses.js';

// Re-export the managed contract types
export {
  Contract as CounterContract,
  ledger as counterLedger,
  pureCircuits as counterPureCircuits,
} from '../../managed/counter/contract/index.js';

export type { Witnesses } from '../../managed/counter/contract/index.js';

// PrivacyCounterContract is the compact-js CompiledContract binding used by
// the v4 SDK's deployContract / findDeployedContract functions.
export const CompiledCounterContract = CompiledContract.make<
  ManagedCounter.Contract<PrivacyCounterPrivateState>
>('Counter', ManagedCounter.Contract<PrivacyCounterPrivateState>).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('./managed/counter')
);

export type { PrivacyCounterPrivateState } from './witnesses.js';
