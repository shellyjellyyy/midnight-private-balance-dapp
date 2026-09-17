// ============================================================
// Witness Implementations
// ============================================================
// These are the TypeScript implementations of the witness functions
// declared in the Compact contract. They provide private inputs
// to the ZK circuit without leaving the browser.
// ============================================================

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../../managed/counter/contract/index.js';

/**
 * Private state for the privacy counter contract.
 * This holds the user's secret balance and is never sent to the chain.
 */
export type PrivacyCounterPrivateState = {
  /** The user's secret balance (1-100). Never leaves the browser. */
  readonly balance: number;
};

/**
 * Create the initial private state with the user's balance.
 */
export const createPrivacyCounterPrivateState = (
  balance: number
): PrivacyCounterPrivateState => {
  if (balance < 1 || balance > 100) {
    throw new Error(`Balance must be between 1 and 100, got ${balance}`);
  }
  return { balance };
};

/**
 * Witness: secretBalance
 * Returns the user's private balance as a Uint<16> (bigint).
 * This value is NEVER sent to the chain - it stays in the browser.
 */
const secretBalance = ({
  privateState,
}: WitnessContext<Ledger, PrivacyCounterPrivateState>): [
  PrivacyCounterPrivateState,
  bigint,
] => {
  // Return the balance as a bigint (Uint<16>)
  return [privateState, BigInt(privateState.balance)];
};

/**
 * Witness: secretNonce
 * Generates a random 32-byte nonce for the commitment.
 * This ensures each commitment is unique and unlinkable.
 */
const secretNonce = ({
  privateState,
}: WitnessContext<Ledger, PrivacyCounterPrivateState>): [
  PrivacyCounterPrivateState,
  Uint8Array,
] => {
  // Generate a cryptographically secure random nonce
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return [privateState, nonce];
};

/**
 * All witness implementations for the privacy counter contract.
 */
export const witnesses = {
  secretBalance,
  secretNonce,
};
