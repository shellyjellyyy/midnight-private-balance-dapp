# Privacy Model

This document describes the privacy properties of the Midnight Privacy Counter
dApp as implemented and tested today. It documents what the current
implementation actually provides — it is not a formal cryptographic security
guarantee. The behavior described here is covered by the offline privacy tests
in `tests/privacy.test.ts`, which execute the real `commitBalance` circuit via
the compact-runtime VM.

## What is public

The contract's public ledger (readable by anyone through a Midnight indexer on
Preprod) contains:

- **Commitment hashes** — `balanceCommitments: Set<Bytes<32>>`, 32-byte hashes
  produced by `persistentCommit(balance, nonce)`. Only the hash is stored, so
  the raw balance is not a public ledger value.
- **Total commitment count** — `totalCommitted: Counter`, the number of times
  the commit circuit has been called.
- **The deployed contract address** — the address of the contract on the
  Midnight Preprod network.

The raw private balance is **not** stored as a public ledger value. The ledger
contains only the 32-byte commitment hash and the counter.

## What remains private

- **`secretBalance`** — the user's balance (1–100). It is supplied through a
  private witness and never leaves the user's device.
- **`secretNonce`** — a fresh cryptographically random 32-byte nonce per
  commitment. It is supplied through a private witness.
- **The commitment** is derived from the private balance and nonce via
  `persistentCommit(balance, nonce)`; the raw balance is not directly written
  to the public ledger.

## What the ZK proof demonstrates

The `commitBalance` circuit provably performs the commitment operation using
the private witness/state — proving the balance is within `1..100` and that the
published commitment hash is consistent with it — **without exposing the raw
balance as a public ledger value**.

This does **not** claim that the ZK proof hides every possible piece of
information about the user or their transaction. It establishes one specific
property: the balance value is committed via `persistentCommit` and is never
placed directly on the public ledger.

## What an observer can still learn

Anyone monitoring the public contract on Preprod can observe public contract
activity, including:

- the contract address;
- the commitment hashes (`Set` membership / additions);
- the commitment count / public state changes (`totalCommitted` changes);
- transaction and public metadata available on Preprod (including the fact
  that a commit transaction happened and when).

Transaction activity itself is **not** invisible. An observer can see *that* a
commitment was made, but the tests only support the claim that the *value*
committed is not revealed as a public ledger value.

## Nonce and commitment behavior

Different nonces produce different commitment hashes **even for the same
balance** — this is covered by the privacy tests (same balance, different
nonces → distinct commitments, both stored in `balanceCommitments`).

The tests also document the current behavior when the **exact same balance and
nonce** are reused:

- Inserting an identical commitment into the `Set` is a **no-op** — the set
  keeps a single element.
- `Counter.increment(1)` still runs, so `totalCommitted` **still increments**.

This is the observed contract semantics, not an assumption.

## Local storage

The frontend persists **only the public contract address** in `localStorage`
(`midnight.privacyCounter.contractAddress`) so a user can reconnect to the same
deployed contract across page refreshes.

It does **not** intentionally persist:

- wallet credentials;
- seed phrases;
- the private balance;
- the secret nonce;
- proving keys;
- transaction secrets.

## Trust and limitations

- **1AM** is used for wallet connection, in-browser proving, balancing, and
  transaction submission. The DApp relies on the Midnight/1AM infrastructure
  for those operations.
- This is a **hackathon Preprod application**, not a production security audit.
- This document describes the **current implementation** — not a formal
  cryptographic security guarantee.