# Midnight Privacy Counter

A privacy-preserving Midnight DApp that lets a user commit a private balance on-chain using a zero-knowledge proof. The raw balance is supplied as private witness data and is never written to the public contract ledger — the public state contains only a cryptographic commitment and the total commitment count.

**Live demo:** <https://midnight-private-balance-dapp.vercel.app/>

**Demo video:** <https://www.loom.com/share/d0e6556d7234425ab6b323692d36c14b>

**Repository:** <https://github.com/shellyjellyyy/midnight-private-balance-dapp>

---

## What This DApp Does

1. A user connects with the **1AM wallet** on the **Midnight Preprod** network.
2. They pick a private balance (1–100). This is a **witness** input handled entirely in the browser.
3. The contract's `commitBalance` circuit asserts the balance is in range, computes `persistentCommit(balance, nonce)`, and stores **only the 32-byte commitment hash** in the public ledger (`Set<Bytes<32>>`).
4. A public counter (`totalCommitted`) tracks how many commitments exist.
5. The confirmed on-chain state (commitment set size and counter) is read back and shown in the UI.

An on-chain observer can see **that** a commitment was made — but not **what** value was committed.

## Why Privacy Matters

Public blockchains make every value visible by default. For anything balance-like — holdings, salary, eligibility thresholds — that visibility is a feature and a liability at once. This DApp demonstrates the alternative Midnight enables: prove a fact about a private value and publish only a commitment, so the network can verify the action without learning the number behind it.

## How It Works

- The frontend collects a private balance (1–100) and a fresh, cryptographically random 32-byte nonce, both supplied to the circuit via **witnesses** that never leave the browser.
- `commitBalance` runs inside the ZK proof: it asserts `0 < balance <= 100` and computes the commitment `persistentCommit<Uint<16>>(balance, nonce)` from the private witness data.
- Only the commitment hash is inserted into the public ledger; the raw balance and nonce are never written on-chain.
- The transaction is balanced and submitted through the 1AM wallet; proving happens in-browser via the wallet's proving service (with fallback to the wallet-configured proof server).
- After confirmation, the app decodes the resulting public contract state (`nextContractState`) and displays the total commitment count.

## Privacy Model

> Full threat model: [docs/PRIVACY.md](docs/PRIVACY.md)

### Public

- **Contract address** (Midnight Preprod).
- **Commitment hashes** — `balanceCommitments: Set<Bytes<32>>`, produced by `persistentCommit(balance, nonce)`.
- **Total commitment count** — `totalCommitted: Counter`.
- **Public transaction/state metadata** — that a commit transaction occurred, and when.

### Private

- **Raw balance value** (`secretBalance`, 1–100) — witness input, never written to the ledger.
- **Secret nonce** (`secretNonce`, fresh 32 bytes per commitment) — witness input.
- **Witness data** used to construct the commitment.

### What the proof establishes (and what it does not)

The circuit proves the commitment was constructed from a valid private balance — the verifier learns the balance is in range and sees the commitment hash, nothing else. The random nonce makes recovering the balance from the commitment **computationally infeasible** under the intended cryptographic assumptions; different nonces yield different commitments, so repeated commitments are unlinkable.

This is **not** full transaction anonymity. Observers can still see public blockchain metadata: the contract address, commitment hashes, contract state changes, and the fact and timing of transactions. The claim is specific — the raw balance is not a public ledger value — not that all metadata is hidden.

## Contract Details

Source: [`contracts/counter.compact`](contracts/counter.compact)

```compact
export ledger balanceCommitments: Set<Bytes<32>>;   // commitment hashes only
export ledger totalCommitted: Counter;              // number of commitments

witness secretBalance(): Uint<16>;                  // private
witness secretNonce(): Bytes<32>;                   // private

export circuit commitBalance(): [] {
  const balance = secretBalance();
  const nonce   = secretNonce();
  assert(balance > 0 && balance <= 100, "Balance must be between 1 and 100");
  balanceCommitments.insert(persistentCommit<Uint<16>>(balance, nonce));
  totalCommitted.increment(1);
}

export circuit getTotalCommitted(): Uint<64> { return totalCommitted; }
```

- **`balanceCommitments: Set<Bytes<32>>`** — public set of commitment hashes; the only place commitment data lives on-chain.
- **`totalCommitted: Counter`** — public count of `commitBalance` calls.
- **`secretBalance` / `secretNonce`** — private witnesses supplying the balance and nonce.
- **`commitBalance()`** — the circuit that validates the range and constructs the commitment from witness data.
- **`getTotalCommitted()`** — read-only query of the public counter.
- Commitment construction uses `persistentCommit`, so an already-published commitment is binding and the nonce provides the hiding property.

## Deployed Contract

| Network | Address |
|----------|----------------------------------|
| Midnight Preprod | `7e946de8c1b44ff30a74d5d86d68db1203b53d4cc5a5132f6a78dc116f7e027a` |

This is the deployed contract the live demo joins. The address is public on-chain data anyone can look up on a Midnight indexer; it reveals no user's private balance, since the ledger stores only commitment hashes. The frontend pre-fills this address for joining and persists it in `localStorage` (key `midnight.privacyCounter.contractAddress`) so users reconnect to the same contract across refreshes. Nothing sensitive — balances, nonces, credentials — is stored client-side.

A successful real `commitBalance` transaction has been performed against this contract on Preprod; the total commitment count reached **1** after that commitment was confirmed.

## Demo Flow

1. **Connect 1AM** — click **Connect 1AM** and approve the connection in the wallet.
2. **Connect to Midnight Preprod** — the app connects via the DApp Connector v4 API; the 1AM wallet's network setting must be **Preprod**.
3. **Use/join the deployed contract** — the verified Preprod address is pre-filled; click **Join** (or **Deploy New Contract** to deploy a fresh one).
4. **Choose a private balance** — move the slider to a secret balance (1–100). This value is a witness and never leaves the browser.
5. **Call `commitBalance`** — click **Commit Private Balance** to invoke the circuit from the frontend.
6. **Generate the ZK proof** — 1AM generates the proof in-browser and balances the transaction.
7. **Submit the transaction** — the transaction is submitted to Midnight Preprod and the app waits for on-chain confirmation.
8. **Observe the public result** — the **Total Commitments** counter reflects the confirmed state.
9. **Confirm privacy** — the public ledger contains a 32-byte commitment hash and the counter — **not** your balance value. An observer sees *that* a commitment was made, not *what* value was committed.

## Tech Stack

- **Compact** — `compact-runtime@0.16.0`, compiled with the Compact toolchain (artifacts checked in under `managed/`)
- **Midnight.js SDK** — `midnight-js-*@4.0.4`
- **DApp Connector API** — `@midnight-ntwrk/dapp-connector-api@4.0.1` (v4 `connect(networkId)` API)
- **React 18 + Vite 5** — frontend
- **Vitest** — test runner
- **1AM wallet** — Midnight browser extension; handles connection, in-browser proving, balancing, and transaction submission; app targets **Preprod**

## Repository Structure

```
contracts/counter.compact     Compact contract source (privacy model + circuits)
managed/counter/              Compiled contract output checked into the repo:
  ├─ contract/                  generated TS bindings (contract, ledger, circuits)
  ├─ keys/                      proving/verifying keys (commitBalance, getTotalCommitted)
  └─ zkir/                      ZK circuit intermediates
keys/ , zkir/                 Copies of the ZK artifacts served by the dev server / build
src/
  ├─ contracts/
  │  ├─ compiled.ts             compact-js CompiledContract binding
  │  ├─ witnesses.ts            TS implementations of secretBalance / secretNonce
  │  ├─ providers.ts            wallet discovery, v4 connect(), providers factory
  │  └─ counter-api.ts          deployContract / findDeployedContract wrapper + API
  ├─ hooks/
  │  ├─ useMidnight.ts          wallet state + connect/disconnect
  │  └─ MidnightProvider.tsx    shared context: one wallet state for all components
  └─ components/                WalletConnect, CircuitCall (React UI)
tests/                         Vitest suites (see Testing below)
docs/PRIVACY.md                privacy threat model
scripts/                       cross-platform build helpers (Windows/Linux/macOS)
.github/workflows/ci.yml       CI: tests, build, artifact verification
```

## Prerequisites

- Node.js 22.x
- [1AM wallet](https://1am.xyz/) browser extension, installed and set to **Preprod**
- Docker (only if you run a local proof server; 1AM's in-browser proving means this is normally not needed)

## Local Setup

```bash
npm install
```

Compiling the contract is optional: the compiled artifacts are checked in under `managed/`, so the app builds and runs without recompiling. To regenerate them, run `npm run compact:compile` (requires the Compact toolchain; on Windows this runs inside WSL2). Note that recompilation changes the on-chain contract address, so a freshly compiled contract requires a fresh deployment.

## Running the App

```bash
npm run dev
```

Then: install/enable the 1AM extension on **Preprod**, load the app, click **Connect 1AM**, join the deployed contract, pick a private balance, and click **Commit Private Balance**. See **Demo Flow** above for the full walkthrough.

## Testing

```bash
npm test
```

**Verified result: 42/42 tests passing** across four suites:

- `tests/counter.test.ts` — the generated contract bindings: exports, contract construction, witness behavior, and circuit structure.
- `tests/privacy.test.ts` — privacy-model checks that **execute the real `commitBalance` circuit offline** via the compact-runtime VM (no wallet, no proof server): initial public ledger, witnesses never touching public state, fresh nonces, the 1–100 range check, the 32-byte hidden commitment, and unlinkability across nonces.
- `tests/storage.test.ts` — contract-address persistence in `localStorage`: only the public address is stored, operations are best-effort and never throw.
- `tests/witnesses.test.ts` — witness implementations: range enforcement, correct types, and cryptographically random nonces.

The offline privacy tests prove, without any network, that the contract stores only commitment hashes and enforces the range check inside the circuit.

## Build / Artifact Verification

```bash
npm run build
```

`tsc -b` type-checks, `vite build` bundles, and `scripts/copy-artifacts.mjs` copies `keys/` and `zkir/` into `dist/` so the deployed bundle can fetch its ZK artifacts. Works on Windows `cmd.exe`, PowerShell, and Linux/macOS.

```bash
npm run verify:artifacts
```

Checks that the committed Compact artifacts are present and consistent. **Verified result: passes.**

GitHub Actions CI (`.github/workflows/ci.yml`) runs tests, build, and artifact verification on push and pull requests to `main` and is **green**.

## Privacy Limitations / Threat Model

- **Not transaction anonymity.** Observers see the contract address, commitment hashes (and their additions), state changes to `totalCommitted`, and public transaction metadata including timing. Only the balance *value* is protected from being a public ledger value.
- **Computationally, not absolutely, hidden.** Hiding relies on the nonce-based `persistentCommit` construction under its intended cryptographic assumptions; the balance is computationally infeasible to recover from the commitment, not mathematically impossible.
- **Infrastructure trust.** Wallet connection, in-browser proving, balancing, and submission rely on the 1AM wallet and Midnight Preprod infrastructure.
- **Hackathon scope.** This is a Preprod hackathon application, not an audited production system. See [docs/PRIVACY.md](docs/PRIVACY.md) for the full threat model.

## Deployment

- **Frontend:** deployed on **Vercel** at <https://midnight-private-balance-dapp.vercel.app/> (build command `npm run build`, output `dist/`, including the copied `dist/keys/` and `dist/zkir/` artifacts).
- **Contract:** deployed on **Midnight Preprod** at `7e946de8c1b44ff30a74d5d86d68db1203b53d4cc5a5132f6a78dc116f7e027a`.

## Hackathon-Relevant Notes

- Real Compact privacy-preserving contract with a real frontend circuit call.
- Real 1AM wallet connection (DApp Connector v4) on Midnight Preprod.
- Real ZK proving and real transaction submission — a confirmed `commitBalance` transaction exists on Preprod, with the total commitment count reaching 1.
- Private balance and nonce handled strictly as witness/private data; only commitment hashes and the commitment count are public.
- Contract address persists through `localStorage` for seamless reconnection.
- 42/42 tests pass; `npm run build` and `npm run verify:artifacts` pass; CI is green.
- Privacy threat model documented in [docs/PRIVACY.md](docs/PRIVACY.md).

## License

MIT
