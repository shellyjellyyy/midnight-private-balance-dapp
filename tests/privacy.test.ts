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

// ============================================================
// Sequential commits — run commitBalance repeatedly against the
// SAME contract state (each call carries the ledger forward) so
// the multi-commit ledger invariants below assert the behaviour
// that the compact-runtime VM actually exhibits.
// ============================================================

type CommitOutcome = {
  setSize: bigint;
  totalCommitted: bigint;
  commitments: Uint8Array[];
  ledgerState: ReturnType<typeof ledger>;
};

// Build a contract whose witnesses return a fixed balance and draw
// nonces in sequence. Once the supplied nonces are exhausted, the
// last one is reused — this is what makes the "exact same nonce
// twice" case expressible.
const buildDeterministicContract = (
  balance: number,
  nonces: Uint8Array[]
): Contract => {
  let call = 0;
  return new Contract({
    secretBalance: (ctx: any) => [ctx.privateState, BigInt(balance)],
    secretNonce: (ctx: any) => {
      const idx = Math.min(call, nonces.length - 1);
      call += 1;
      return [ctx.privateState, nonces[idx]];
    },
  });
};

const runSequentialCommits = (
  contract: Contract,
  balance: number,
  count: number
): { outcomes: CommitOutcome[]; context: any } => {
  const init = contract.initialState(
    createConstructorContext({ balance }, COIN_PUBLIC_KEY)
  );
  let context = createCircuitContext(
    dummyContractAddress(),
    init.currentZswapLocalState.coinPublicKey,
    init.currentContractState.data,
    init.currentPrivateState
  );
  const outcomes: CommitOutcome[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = contract.circuits.commitBalance(context);
    context = result.context;
    const decoded = ledger(result.context.currentQueryContext.state);
    outcomes.push({
      setSize: decoded.balanceCommitments.size(),
      totalCommitted: decoded.totalCommitted,
      commitments: [...decoded.balanceCommitments],
      ledgerState: decoded,
    });
  }
  return { outcomes, context };
};

describe('privacy model — multi-commit ledger invariants', () => {
  it('two commits with different nonces are both stored and counted', () => {
    const nonceA = new Uint8Array(32).fill(0xaa);
    const nonceB = new Uint8Array(32).fill(0xbb);
    const contract = buildDeterministicContract(42, [nonceA, nonceB]);
    const { outcomes } = runSequentialCommits(contract, 42, 2);
    const [first, final] = outcomes;

    expect(first.setSize).toBe(1n);
    expect(first.totalCommitted).toBe(1n);

    expect(final.setSize).toBe(2n);
    expect(final.totalCommitted).toBe(2n);
  });

  it('same balance with different nonces stores two distinct commitments', () => {
    const nonceA = new Uint8Array(32).fill(0x11);
    const nonceB = new Uint8Array(32).fill(0x22);
    const contract = buildDeterministicContract(75, [nonceA, nonceB]);
    const { outcomes } = runSequentialCommits(contract, 75, 2);
    const final = outcomes[1];

    expect(final.commitments.length).toBe(2);
    expect(final.setSize).toBe(2n);
    expect(final.totalCommitted).toBe(2n);
    expect(final.commitments[0]).not.toEqual(final.commitments[1]);
  });

  it('reusing the exact same balance and nonce: set stays one element, counter still increments', () => {
    // Observed contract semantics: Set.insert is a no-op for an element
    // that is already present, while Counter.increment(1) always applies.
    // A duplicate commitment therefore leaves the set unchanged but the
    // total commitment count still grows.
    const nonce = new Uint8Array(32).fill(0x5a);
    const contract = buildDeterministicContract(42, [nonce]);
    const { outcomes } = runSequentialCommits(contract, 42, 2);
    const [first, final] = outcomes;

    expect(first.setSize).toBe(1n);
    expect(first.totalCommitted).toBe(1n);

    expect(final.setSize).toBe(1n);
    expect(final.totalCommitted).toBe(2n);
    expect(final.commitments).toEqual(first.commitments);
  });

  it('boundary balance 100 is accepted and its commitment is stored', () => {
    const nonce = new Uint8Array(32).fill(0x64);
    const contract = buildDeterministicContract(100, [nonce]);
    const { outcomes } = runSequentialCommits(contract, 100, 1);
    const final = outcomes[0];

    expect(final.setSize).toBe(1n);
    expect(final.totalCommitted).toBe(1n);
    expect(final.commitments.length).toBe(1);
    expect(final.commitments[0]).toBeInstanceOf(Uint8Array);
    expect(final.commitments[0].length).toBe(32);
  });

  it('public ledger contains only commitment hashes, never the raw balance', () => {
    const nonceA = new Uint8Array(32).fill(0x01);
    const nonceB = new Uint8Array(32).fill(0x02);
    const contract = buildDeterministicContract(42, [nonceA, nonceB]);
    const { outcomes } = runSequentialCommits(contract, 42, 2);
    const final = outcomes[1];

    // Every element of the public set is a member of that set...
    for (const commitment of final.commitments) {
      expect(final.ledgerState.balanceCommitments.member(commitment)).toBe(true);
    }

    // ...but the raw 32-byte encoding of the balance is NOT part of the
    // public ledger. Only the persistentCommit hash is stored.
    const rawBalance = new Uint8Array(32);
    rawBalance[0] = 42;
    expect(final.ledgerState.balanceCommitments.member(rawBalance)).toBe(false);
  });

  it('getTotalCommitted circuit reads the on-chain counter after multiple commits', () => {
    const nonceA = new Uint8Array(32).fill(0x33);
    const nonceB = new Uint8Array(32).fill(0x44);
    const contract = buildDeterministicContract(42, [nonceA, nonceB]);
    const { context } = runSequentialCommits(contract, 42, 2);

    const read = contract.circuits.getTotalCommitted(context);
    expect(read.result).toBe(2n);
  });
});