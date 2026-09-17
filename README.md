# Midnight Privacy Counter dApp

> A privacy-preserving balance commitment system on the Midnight network. Users commit to a private balance (1–100) using a ZK proof; the actual value is never revealed on-chain.

## What This Does

1. A user connects with the **1AM wallet** on the **Preprod** network.
2. They pick a private balance (1–100) — this is a **witness** input that never leaves their browser.
3. The contract's `commitBalance` circuit proves the balance is valid, creates a commitment via `persistentCommit(balance, nonce)`, and stores **only the 32-byte commitment hash** in the on-chain ledger (a `Set<Bytes<32>>`).
4. A public counter tracks how many commitments exist.

An on-chain observer can see **THAT** a commitment was made, but not **WHAT** value was committed.

## Privacy Model

> For the full threat model, see [docs/PRIVACY.md](docs/PRIVACY.md).

### Public on-chain state (readable via the indexer)

- `balanceCommitments: Set<Bytes<32>>` — commitment hashes only. Each hash is produced by `persistentCommit(balance, nonce)`; the random 32-byte nonce makes any given hash impractical to reverse, so the balance is hidden.
- `totalCommitted: Counter` — number of commitments made.
- Transaction metadata.

### Private (never leaves the user's device)

- `secretBalance` — the user's balance (1–100). Supplied via witness, never written to the ledger.
- `secretNonce` — a fresh cryptographically random 32-byte nonce per commitment. Supplies the hiding property.
- ZK proof details.

### What committing proves without revealing

The `commitBalance` circuit asserts `0 < balance <= 100` inside the proof. The verifier learns the balance is in range and sees the commitment hash — nothing else.

## Repository Layout

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
  │  ├─ useMidnight.ts          wallet state + connect/disconnect (1AM, with wallet diagnostics)
  │  └─ MidnightProvider.tsx    shared context: one wallet state for all components
  └─ components/                WalletConnect, CircuitCall (React UI)
tests/                         Vitest suites (see Testing below)
scripts/                       cross-platform build helpers (Windows/Linux/macOS)
```

### Contract summary (`contracts/counter.compact`)

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

Key properties:

- `persistentCommit` uses the supplied random nonce, so the commitment is **binding** (cannot change an already-published commitment) and **hiding** (the balance cannot be recovered from the hash).
- No `disclose()` is ever called on the balance — only the commitment hash is stored.
- Running the same balance with a different nonce produces a different commitment, so multiple commitments are unlinkable.

## Tech Stack

- **Midnight** — `compact-runtime@0.16.0`, compiled with toolchain `compact 0.31.1` (artifacts checked into `managed/`)
- **Midnight.js SDK** — `midnight-js-*@4.0.4`
- **DApp Connector API** — `@midnight-ntwrk/dapp-connector-api@4.0.1` (v4 `connect(networkId)` API)
- **React + Vite** — frontend (React 18, Vite 5)
- **Vitest** — tests
- **1AM wallet** — Midnight browser extension (injects the DApp Connector v4 API at `window.midnight['1am']`, reports `apiVersion 4.0.0`, and handles proving and DUST sponsorship in-browser; the app targets **Preprod**)

## Prerequisites

- Node.js 22.x
- [1AM wallet](https://1am.xyz/) browser extension (Chrome/Firefox), installed and pointed at **Preprod**
- Docker (only if you use a local proof server)

## Local Setup

### 1. Install

```bash
npm install
```

### 2. Compiling the contract (optional)

The compiled contract and ZK artifacts are already checked in under `managed/`, so the app builds and runs without recompiling. To regenerate them you need the Compact toolchain:

```bash
npm run compact:compile
```

The generated key/zkir files are copied into the project-root `keys/` and `zkir/` directories by `scripts/post-compile.mjs` (cross-platform). On Windows the Compact compiler runs inside WSL2 — see Midnight's docs for the WSL2 setup. Recompilation changes the on-chain contract address, so a freshly compiled contract requires a fresh deployment.

### 3. Build (any OS)

```bash
npm run build
```

`tsc -b` type-checks, `vite build` bundles, and `scripts/copy-artifacts.mjs` copies `keys/` and `zkir/` into `dist/` so the deployed bundle can fetch its ZK artifacts. No shell `cp`/`mkdir -p` required — works on Windows `cmd.exe`, PowerShell, and Linux/macOS.

### 4. Run the app

```bash
npm run dev
```

Then, in the browser:

1. Install the 1AM wallet extension and set its network to **Preprod** in the wallet settings. 1AM handles ZK proving in-browser and sponsors DUST fees, so no local proof server is required.
2. Load the dApp, click **Connect 1AM**, and approve the connection in the wallet.
3. Move the slider to a private balance (1–100) and deploy/join the contract.
4. Click **Commit Private Balance** — a ZK proof is generated, and only the commitment hash is submitted.

## Testing

```bash
npm test
```

18 tests across two suites:

- `tests/counter.test.ts` (10) — the generated contract bindings: exports, contract construction, witness behavior, and circuit structure.
- `tests/privacy.test.ts` (8) — privacy-model checks that **execute the real `commitBalance` circuit offline** via the compact-runtime VM (no wallet, no proof server): initial public ledger, witnesses never touching public state, fresh nonces, the 1–100 range check, the 32-byte/hidden commitment, and unlinkability across nonces.

The tests prove, without any network, that the contract stores only commitment hashes and enforces the range check inside the circuit.

## Known Limitations

- **Windows contract recompilation** requires WSL2 (managed artifacts are checked in so this is not needed for day-to-day builds).
- **Wallet connectivity** depends on the 1AM extension implementing the DApp Connector v4 protocol on Preprod. The app targets 1AM exclusively (`window.midnight['1am']`); if `connect('preprod')` rejects, confirm the 1AM extension is installed, is on the latest build, and its network setting is Preprod. The UI logs `[wallet-connect]` diagnostics to the browser console to pin down the failing step. Browser verification of the 1AM connection flow is still pending.
- **Proof generation** uses 1AM's in-browser proving (`getProvingProvider`); if the wallet exposes no proving service, it falls back to the `proverServerUri` from the wallet configuration.

## Contract Address

| Network | Address |
|----------|----------------------------------|
| Midnight Preprod | 7e946de8c1b44ff30a74d5d86d68db1203b53d4cc5a5132f6a78dc116f7e027a |

This is the **Midnight Preprod contract address** of the deployed privacy counter contract.

The address is **public on-chain data**: anyone can look it up on a Midnight indexer. It identifies *where* the contract lives on the Midnight Preprod network so the dApp (and other users) can join it and read its public state. The address does **not** reveal any user's private balance — the ledger stores only 32-byte `persistentCommit(balance, nonce)` hashes, and the raw balance never appears on-chain. Sharing this address is safe; it is exactly what other users need to join the same deployed contract.

## Demo Flow

A hackathon reviewer can verify the privacy behavior end-to-end in a couple of minutes:

1. **Connect 1AM** — click **Connect 1AM** and approve the connection in the wallet.
2. **Use Midnight Preprod** — ensure the 1AM wallet's network setting is **Preprod**, the network the contract is deployed on.
3. **Join the deployed contract** — paste the Midnight Preprod contract address above, or click **Deploy New Contract** to deploy a fresh one, then click **Join**.
4. **Enter a private balance** — move the slider to a secret balance between 1 and 100. This value is a private *witness* and never leaves the browser.
5. **Call `commitBalance`** — click **Commit Private Balance**. 1AM generates a ZK proof in-browser and submits the transaction.
6. **Observe the commitment count increase** — the **Total Commitments** counter increments, confirming the proof was accepted and the transaction landed on-chain.
7. **Observe the raw balance stays private** — the public ledger (readable via the indexer) contains a 32-byte commitment hash and the counter — **not** your balance value. An observer can see *that* a commitment was made but not *what* value was committed.

The same flow is also proven offline by `tests/privacy.test.ts`, which executes the real `commitBalance` circuit and asserts the ledger stores only the 32-byte commitment hash.

## Live Demo

[PASTE LIVE URL AFTER DEPLOYING FRONTEND]

## Demo Video

[TO BE ADDED AFTER RECORDING]

## Screenshots

[TO BE ADDED AFTER DEPLOYMENT]

## Deployment

### Frontend (Vercel/Netlify)

```bash
npm run build
# then deploy dist/ with your provider
npx vercel --prod        # or
npx netlify deploy --prod
```

Make sure the committed `dist/` includes `dist/keys/` and `dist/zkir/` (added by `scripts/copy-artifacts.mjs`).

### Contract deployment

Requires a funded Preprod wallet (tNIGHT/tDUST) and a proof server:

```bash
npm run deploy:preprod
```

Fill in the deployed contract address in the table above. See [Midnight Documentation](https://docs.midnight.network/) for environment endpoints (indexer, proof server) and deployment steps.

## License

MIT