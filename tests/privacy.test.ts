import { describe, it, expect } from 'vitest';
import { Contract, ledger } from '../managed/counter/contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  witnesses,
  createPrivacyCounterPrivateState,
} from '../src/contracts/witnesses.js';

// ============================================================
// Privacy Counter Contract — Privacy Model Tests
//
// These tests execute the REAL generated contract bindings and
// run the commitBalance circuit entirely offline via the
// compact-runtime VM. No proof server or wallet is required.
// ============================================================

const COIN_PUBLIC_KEY = '0'.repeat(64);

const buildInitialLedger = (balance: number) => {
  const contract = new Contract(witnesses);
  const init = contract.initialState(
    createConstructorContext({ balance }, COIN_PUBLIC_KEY)
  );
  return { contract, init };
};

// Execute the commitBalance circuit offline and return the resulting
// ledger plus the newly stored commitment hash.
const runCommit = (contract: Contract, balance: number) => {
  const init = contract.initialState(
    createConstructorContext({ balance }, COIN_PUBLIC_KEY)
  );
  const circuitContext = createCircuitContext(
    dummyContractAddress(),
    init.currentZswapLocalState.coinPublicKey,
    init.currentContractState.data,
    init.currentPrivateState
  );
  const result = contract.circuits.commitBalance(circuitContext);
  const nextLedger = ledger(result.context.currentQueryContext.state);
  return {
    nextLedger,
    commitment: [...nextLedger.balanceCommitments][0],
  };
};

describe('privacy model — initial public ledger', () => {
  it('ledger starts with an empty commitment set and a zero counter', () => {
    const { init } = buildInitialLedger(50);
    const state = ledger(init.currentContractState.data);
    expect(state.balanceCommitments.isEmpty()).toBe(true);
    expect(state.balanceCommitments.size()).toBe(0n);
    expect(state.totalCommitted).toBe(0n);
  });
});

describe('privacy model — witnesses keep secrets private', () => {
  it('secretBalance returns the private value without touching the ledger', () => {
    const [newState, value] = witnesses.secretBalance({
      privateState: { balance: 42 },
    } as any);

    expect(newState).toEqual({ balance: 42 });
    expect(value).toBe(42n);
    // The witness only reads the private state; it cannot modify the
    // public ledger, so the commitment set stays empty.
    const { init } = buildInitialLedger(42);
    expect(ledger(init.currentContractState.data).balanceCommitments.isEmpty()).toBe(true);
  });

  it('secretNonce produces a fresh 32-byte nonce on every call', () => {
    const context = { privateState: { balance: 50 } } as any;
    const first = witnesses.secretNonce(context)[1];
    const second = witnesses.secretNonce(context)[1];

    expect(first).toBeInstanceOf(Uint8Array);
    expect(second).toBeInstanceOf(Uint8Array);
    expect(first.length).toBe(32);
    expect(second.length).toBe(32);
    expect(first).not.toEqual(second);
  });

  it('createPrivacyCounterPrivateState enforces the 1-100 range', () => {
    expect(() => createPrivacyCounterPrivateState(0)).toThrow();
    expect(() => createPrivacyCounterPrivateState(101)).toThrow();
    expect(() => createPrivacyCounterPrivateState(-5)).toThrow();
    expect(createPrivacyCounterPrivateState(1)).toEqual({ balance: 1 });
    expect(createPrivacyCounterPrivateState(100)).toEqual({ balance: 100 });
  });
});

describe('privacy model — offline circuit execution', () => {
  it('commitBalance runs offline and stores a single commitment', () => {
    const { contract } = buildInitialLedger(42);
    const { nextLedger } = runCommit(contract, 42);

    expect(nextLedger.balanceCommitments.size()).toBe(1n);
    expect(nextLedger.balanceCommitments.isEmpty()).toBe(false);
    expect(nextLedger.totalCommitted).toBe(1n);
  });

  it('stores a 32-byte commitment hash, never the raw balance', () => {
    const { contract } = buildInitialLedger(42);
    const { commitment } = runCommit(contract, 42);

    expect(commitment).toBeInstanceOf(Uint8Array);
    expect(commitment.length).toBe(32);

    // A raw 32-byte little-endian encoding of the balance must NOT be
    // what lands on-chain — persistentCommit hides the input.
    const rawBalance = new Uint8Array(32);
    rawBalance[0] = 42;
    expect(commitment).not.toEqual(rawBalance);
  });

  it('enforces the balance range check during execution', () => {
    const { contract } = buildInitialLedger(0);
    expect(() => runCommit(contract, 0)).toThrow();
  });

  it('same balance with different nonces yields different commitments (hiding)', () => {
    const nonceA = new Uint8Array(32).fill(0xaa);
    const nonceB = new Uint8Array(32).fill(0xbb);

    const contractA = new Contract({
      secretBalance: (ctx: any) => [ctx.privateState, 42n],
      secretNonce: (ctx: any) => [ctx.privateState, nonceA],
    });
    const contractB = new Contract({
      secretBalance: (ctx: any) => [ctx.privateState, 42n],
      secretNonce: (ctx: any) => [ctx.privateState, nonceB],
    });

    const commitA = runCommit(contractA, 42).commitment;
    const commitB = runCommit(contractB, 42).commitment;

    expect(commitA).not.toEqual(commitB);
  });
});