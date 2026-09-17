import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadSavedContractAddress,
  saveContractAddress,
  clearSavedContractAddress,
} from '../src/hooks/contractAddressStorage.js';

// ============================================================
// Contract Address Storage Tests
//
// ContractAddressStorage persists ONLY the public contract
// address in localStorage so a user can reconnect to the same
// deployed contract across page refreshes. Nothing sensitive is
// ever stored (no wallets, seeds, balances, nonces, or private
// state), and all operations are best-effort: they must never
// throw, even when the browser storage is unavailable.
// ============================================================

const VERIFIED_PREPROD_ADDRESS =
  '7e946de8c1b44ff30a74d5d86d68db1203b53d4cc5a5132f6a78dc116f7e027a';

// Minimal localStorage-compatible mock backed by an in-memory map.
const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

describe('contract address storage — persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves an address and loads it back unchanged', () => {
    vi.stubGlobal('window', { localStorage: createLocalStorageMock() });

    saveContractAddress(VERIFIED_PREPROD_ADDRESS);
    expect(loadSavedContractAddress()).toBe(VERIFIED_PREPROD_ADDRESS);
  });

  it('returns null when nothing has been saved', () => {
    vi.stubGlobal('window', { localStorage: createLocalStorageMock() });

    expect(loadSavedContractAddress()).toBeNull();
  });

  it('ignores unrelated keys that other apps may have written', () => {
    const storage = createLocalStorageMock();
    storage.setItem('some.other.app.key', 'not-our-address');
    vi.stubGlobal('window', { localStorage: storage });

    expect(loadSavedContractAddress()).toBeNull();
  });

  it('clearSavedContractAddress removes a previously saved address', () => {
    vi.stubGlobal('window', { localStorage: createLocalStorageMock() });

    saveContractAddress(VERIFIED_PREPROD_ADDRESS);
    expect(loadSavedContractAddress()).toBe(VERIFIED_PREPROD_ADDRESS);

    clearSavedContractAddress();
    expect(loadSavedContractAddress()).toBeNull();
  });

  it('a cleared address does not reappear on later loads', () => {
    vi.stubGlobal('window', { localStorage: createLocalStorageMock() });

    saveContractAddress(VERIFIED_PREPROD_ADDRESS);
    clearSavedContractAddress();

    expect(loadSavedContractAddress()).toBeNull();
    expect(loadSavedContractAddress()).toBeNull();
  });
});

describe('contract address storage — resilient when storage is unavailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads null without throwing when no window exists', () => {
    // The default node test environment has no window.
    expect(typeof window).toBe('undefined');

    expect(loadSavedContractAddress()).toBeNull();
  });

  it('save/clear silently no-op when no window exists', () => {
    expect(typeof window).toBe('undefined');

    expect(() => saveContractAddress(VERIFIED_PREPROD_ADDRESS)).not.toThrow();
    expect(() => clearSavedContractAddress()).not.toThrow();
    expect(loadSavedContractAddress()).toBeNull();
  });

  it('tolerates a localStorage implementation that throws (private mode / quota)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage access denied');
        },
        setItem: () => {
          throw new Error('quota exceeded');
        },
        removeItem: () => {
          throw new Error('storage access denied');
        },
      },
    });

    expect(loadSavedContractAddress()).toBeNull();
    expect(() => saveContractAddress(VERIFIED_PREPROD_ADDRESS)).not.toThrow();
    expect(() => clearSavedContractAddress()).not.toThrow();
  });
});