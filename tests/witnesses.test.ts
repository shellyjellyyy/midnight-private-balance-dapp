import { describe, it, expect } from 'vitest';
import {
  witnesses,
  createPrivacyCounterPrivateState,
} from '../src/contracts/witnesses.js';

// ============================================================
// Witness Implementation Tests
//
// The witnesses supply the SECRET inputs to the commitBalance
// circuit (the balance value and the commitment nonce). They
// live entirely in the browser, operate only on the private
// state, and never interact with the public ledger.
// ============================================================

const walletContext = (balance: number) =>
  ({
    privateState: { balance },
  }) as any;

describe('createPrivacyCounterPrivateState — range enforcement', () => {
  it('accepts the lower boundary value 1', () => {
    expect(createPrivacyCounterPrivateState(1)).toEqual({ balance: 1 });
  });

  it('accepts the upper boundary value 100', () => {
    expect(createPrivacyCounterPrivateState(100)).toEqual({ balance: 100 });
  });

  it('accepts in-range values', () => {
    expect(createPrivacyCounterPrivateState(42)).toEqual({ balance: 42 });
    expect(createPrivacyCounterPrivateState(50)).toEqual({ balance: 50 });
  });

  it('rejects values below 1', () => {
    expect(() => createPrivacyCounterPrivateState(0)).toThrow();
    expect(() => createPrivacyCounterPrivateState(-1)).toThrow();
    expect(() => createPrivacyCounterPrivateState(-100)).toThrow();
  });

  it('rejects values above 100', () => {
    expect(() => createPrivacyCounterPrivateState(101)).toThrow();
    expect(() => createPrivacyCounterPrivateState(1000)).toThrow();
  });
});

describe('secretBalance witness', () => {
  it('returns the private balance as a bigint (Uint<16>)', () => {
    const [next, value] = witnesses.secretBalance(walletContext(42));
    expect(value).toBe(42n);
    expect(next).toEqual({ balance: 42 });
  });

  it('passes boundary values 1 and 100 through as bigint', () => {
    expect(witnesses.secretBalance(walletContext(1))[1]).toBe(1n);
    expect(witnesses.secretBalance(walletContext(100))[1]).toBe(100n);
  });

  it('does not modify the private state', () => {
    const privateState = { balance: 77 };
    const [next] = witnesses.secretBalance({ privateState } as any);
    expect(next).toEqual(privateState);
  });
});

describe('secretNonce witness', () => {
  it('returns a fresh 32-byte nonce and preserves private state', () => {
    const [next, nonce] = witnesses.secretNonce(walletContext(50));
    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(32);
    expect(next).toEqual({ balance: 50 });
  });

  it('produces different nonces across calls (freshness for hiding)', () => {
    const first = witnesses.secretNonce(walletContext(50))[1];
    const second = witnesses.secretNonce(walletContext(50))[1];

    // A commitment is hiding only while each call draws a fresh,
    // unlinkable nonce. We assert freshness, not any deterministic
    // byte value.
    expect(first).not.toEqual(second);
  });
});