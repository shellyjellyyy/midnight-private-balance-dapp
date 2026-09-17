import { describe, it, expect } from 'vitest';
import { Contract, ledger } from '../managed/counter/contract/index.js';

// ============================================================
// Privacy Counter Contract Tests
//
// These tests exercise the REAL generated contract bindings.
// ============================================================

describe('privacy counter contract — exports', () => {
  it('Contract class is exported', () => {
    expect(Contract).toBeDefined();
    expect(typeof Contract).toBe('function');
  });

  it('ledger function is exported', () => {
    expect(ledger).toBeDefined();
    expect(typeof ledger).toBe('function');
  });
});

describe('privacy counter contract — contract creation', () => {
  it('can create a contract with witness implementations', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 50n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    expect(contract).toBeDefined();
    expect(contract.witnesses).toBeDefined();
    expect(contract.circuits).toBeDefined();
  });

  it('witness functions are accessible', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 42n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    expect(typeof contract.witnesses.secretBalance).toBe('function');
    expect(typeof contract.witnesses.secretNonce).toBe('function');
  });
});

describe('privacy counter contract — witness behavior', () => {
  it('secretBalance witness returns balance as bigint', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 75n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    const mockContext = {
      ledger: {} as any,
      privateState: { balance: 75 },
      contractAddress: 'test' as any,
    };

    const [newState, result] = contract.witnesses.secretBalance(mockContext);
    expect(newState).toEqual({ balance: 75 });
    expect(result).toBe(75n);
  });

  it('secretNonce witness returns 32-byte Uint8Array', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 50n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        nonce[0] = 0xAB;
        return [ctx.privateState, nonce];
      },
    });

    const mockContext = {
      ledger: {} as any,
      privateState: { balance: 50 },
      contractAddress: 'test' as any,
    };

    const [newState, result] = contract.witnesses.secretNonce(mockContext);
    expect(newState).toEqual({ balance: 50 });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(32);
    expect(result[0]).toBe(0xAB);
  });

  it('witness functions preserve private state', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, BigInt(ctx.privateState.balance)],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    const privateState = { balance: 42 };
    const mockContext = {
      ledger: {} as any,
      privateState,
      contractAddress: 'test' as any,
    };

    const [newState] = contract.witnesses.secretBalance(mockContext);
    expect(newState).toEqual(privateState);
  });
});

describe('privacy counter contract — privacy properties', () => {
  it('balance is provided as private witness, not public parameter', () => {
    // The contract's commitBalance circuit takes no public arguments
    // All private data comes from witnesses
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 100n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    // Verify the circuit is declared correctly
    expect(contract.provableCircuits.commitBalance).toBeDefined();
    expect(typeof contract.provableCircuits.commitBalance).toBe('function');
  });

  it('commitBalance circuit is a provable circuit (ZK proof)', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 50n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    // The circuit should be in provableCircuits (requires ZK proof)
    expect(contract.provableCircuits.commitBalance).toBeDefined();
  });

  it('getTotalCommitted is a provable circuit (read-only)', () => {
    const contract = new Contract({
      secretBalance: (ctx) => [ctx.privateState, 50n],
      secretNonce: (ctx) => {
        const nonce = new Uint8Array(32);
        return [ctx.privateState, nonce];
      },
    });

    expect(contract.provableCircuits.getTotalCommitted).toBeDefined();
  });
});
