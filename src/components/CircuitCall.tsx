// ============================================================
// Circuit Call Component
// ============================================================
// This component demonstrates a privacy-preserving contract interaction.
// The user commits to a private balance (1-100) that is NEVER revealed
// on-chain. Only a cryptographic commitment (hash) is stored publicly.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { useContract } from '../hooks/useMidnight';
import { useMidnightState } from '../hooks/MidnightProvider';

// ============================================================
// Types
// ============================================================

type CallStatus = 'idle' | 'deploying' | 'proving' | 'success' | 'error';
type CopyStatus = 'idle' | 'copied' | 'failed';

// ============================================================
// Verified deployment
// ============================================================
// Publicly deployed privacy counter contract on Midnight Preprod.
// The address is pre-filled into the "join existing contract" input
// as a convenience — joining still requires an explicit click of the
// Join button. Nothing is deployed, connected, or submitted
// automatically because of this value.
const VERIFIED_PREPROD_CONTRACT_ADDRESS =
  '7e946de8c1b44ff30a74d5d86d68db1203b53d4cc5a5132f6a78dc116f7e027a';

// ============================================================
// Component
// ============================================================

export default function CircuitCall() {
  const { connected, providers } = useMidnightState();
  const {
    contractAddress,
    counterApi,
    deploying,
    joining,
    deploy,
    join,
    clearContract,
  } = useContract();

  const [status, setStatus] = useState<CallStatus>('idle');
  const [txResult, setTxResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(50);
  const [totalCommitted, setTotalCommitted] = useState<bigint | null>(null);
  const [joinAddress, setJoinAddress] = useState<string>(
    VERIFIED_PREPROD_CONTRACT_ADDRESS
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

  // ============================================================
  // Deploy Contract
  // ============================================================

  const handleDeploy = useCallback(async () => {
    if (!connected || !providers) return;

    setErrorMsg(null);
    setTxResult(null);
    setStatus('deploying');

    try {
      await deploy(providers, balance);
      setTotalCommitted(0n);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Deployment failed.');
      setStatus('error');
    }
  }, [connected, providers, balance, deploy]);

  // ============================================================
  // Join Existing Contract
  // ============================================================

  const handleJoin = useCallback(async () => {
    if (!connected || !providers || !joinAddress) return;

    setErrorMsg(null);
    setTxResult(null);
    setStatus('deploying');

    try {
      const api = await join(providers, joinAddress as any, balance);
      // Read the CURRENT on-chain total. getTotalCommitted() is a
      // one-shot indexer query (queryContractState) — no transaction, no
      // fees, no proving.
      const total = await api.getTotalCommitted();
      setTotalCommitted(total);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Join failed.');
      setStatus('error');
    }
  }, [connected, providers, joinAddress, balance, join]);

  // ============================================================
  // Commit Balance
  // ============================================================

  const handleCommitBalance = useCallback(async () => {
    if (!counterApi) return;

    setErrorMsg(null);
    setTxResult(null);

    try {
      setStatus('proving');
      // In the real contract, this generates a ZK proof
      // The private witness (balance) never leaves the browser
      // Only the proof is sent to the verifier

      // Submit the transaction to the network.
      // commitBalance() blocks until the tx is included on-chain and
      // resolves with the CONFIRMED post-commit contract state
      // (public.nextContractState decoded via the contract ledger).
      const derived = await counterApi.commitBalance();
      setTotalCommitted(derived.totalCommitted);

      // Do NOT call getTotalCommitted() here. It used to submit a
      // SECOND ZK transaction that read stale state, which is why
      // totalCommitted stayed 0. The value above comes from the
      // confirmed nextContractState carried by the commit result itself.
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Circuit call failed.');
      setStatus('error');
    }
  }, [counterApi]);

  // ============================================================
  // Reset
  // ============================================================

  const handleReset = useCallback(() => {
    setStatus('idle');
    setTxResult(null);
    setErrorMsg(null);
  }, []);

  // ============================================================
  // Copy Deployed Contract Address
  // ============================================================

  // Copies the public contract address to the clipboard and shows a brief
  // "Copied" / "Copy failed" state. Uses the async Clipboard API when
  // available, with a small legacy fallback, and gracefully swallows
  // failures (e.g. non-secure contexts without the API).
  const handleCopy = useCallback(async () => {
    if (!contractAddress) return;

    let ok = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(contractAddress);
        ok = true;
      }
    } catch {
      // Fall through to the fallback below.
    }

    if (!ok) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = contractAddress;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        ok = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        ok = false;
      }
    }

    setCopyStatus(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyStatus('idle'), 1500);
  }, [contractAddress]);

  // On reconnect with a saved contract address, restore the session by joining
  // the persisted address. joinCounter only reads from the indexer — it does
  // NOT deploy a new contract and does NOT submit any transaction. The user can
  // still clear or replace the saved address via "Use different contract".
  useEffect(() => {
    if (!connected || !providers) return;
    if (!contractAddress || counterApi || joining) return;
    join(providers, contractAddress, balance)
      .then((api) => api.getTotalCommitted())
      .then(setTotalCommitted)
      .catch(() => {
        setErrorMsg(
          'Saved contract could not be restored — you can still join it manually.'
        );
      });
  }, [
    connected,
    providers,
    contractAddress,
    counterApi,
    joining,
    balance,
    join,
  ]);

  // ============================================================
  // Render
  // ============================================================

  // If no contract deployed yet, show deploy/join UI
  if (!contractAddress) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Deploy or Join Contract</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Deploy a new privacy counter contract or join an existing one.
        </p>

        {/* Balance Input */}
        <div style={{ marginTop: 16 }}>
          <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Private Balance (will NOT be revealed):
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <input
              type="range"
              min="1"
              max="100"
              value={balance}
              onChange={(e) => setBalance(parseInt(e.target.value))}
              disabled={!connected}
              style={{ flex: 1 }}
            />
            <span style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 40 }}>
              {balance}
            </span>
          </div>
        </div>

        {/* Deploy Button */}
        <button
          onClick={handleDeploy}
          disabled={!connected || deploying}
          style={{ marginTop: 16, marginRight: 8 }}
        >
          {deploying ? (
            <>
              <span className="spinner" /> Deploying…
            </>
          ) : (
            'Deploy New Contract'
          )}
        </button>

        {/* Join Section */}
        <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
          <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Or join existing contract:
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="text"
              value={joinAddress}
              onChange={(e) => setJoinAddress(e.target.value)}
              placeholder="Contract address (mn_contract_preprod1...)"
              disabled={!connected}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
            />
            <button
              onClick={handleJoin}
              disabled={!connected || !joinAddress || deploying}
              className="secondary"
            >
              Join
            </button>
          </div>
        </div>

        {/* Wallet Connection Warning */}
        {!connected && (
          <div className="error-banner" style={{ marginTop: 12 }}>
            Connect your wallet first to interact with the contract.
          </div>
        )}

        {/* Error Display */}
        {errorMsg && <div className="error-banner">{errorMsg}</div>}
      </div>
    );
  }

  // Contract is deployed, show commit UI
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Privacy Balance Commitment</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Commit a private balance (1-100) that is NEVER revealed on-chain.
        Only a cryptographic commitment is stored publicly.
      </p>

      {/* Contract Address */}
      <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--muted)' }}>
        <span>Contract: </span>
        <span className="address">{contractAddress}</span>
        <button
          className="secondary"
          onClick={handleCopy}
          style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 8px' }}
        >
          {copyStatus === 'copied'
            ? 'Copied'
            : copyStatus === 'failed'
              ? 'Copy failed'
              : 'Copy'}
        </button>
        <button
          className="secondary"
          onClick={() => {
            clearContract();
            setStatus('idle');
            setTxResult(null);
            setErrorMsg(null);
            setTotalCommitted(null);
          }}
          style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 8px' }}
        >
          Use different contract
        </button>
      </div>

      {/* Balance Input */}
      <div style={{ marginTop: 16 }}>
        <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Private Balance (will NOT be revealed):
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <input
            type="range"
            min="1"
            max="100"
            value={balance}
            onChange={(e) => setBalance(parseInt(e.target.value))}
            disabled={status === 'proving'}
            style={{ flex: 1 }}
          />
          <span style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 40 }}>
            {balance}
          </span>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={status === 'success' ? handleReset : handleCommitBalance}
        disabled={status === 'proving' || joining}
        style={{ marginTop: 16 }}
      >
        {status === 'proving' && (
          <>
            <span className="spinner" /> Generating ZK Proof & Submitting…
          </>
        )}
        {joining && (
          <>
            <span className="spinner" /> Restoring…
          </>
        )}
        {(status === 'idle' || status === 'error') && !joining && 'Commit Private Balance'}
        {status === 'success' && 'Commit Another'}
      </button>

      {/* Error Display */}
      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      {/* Success Result */}
      {status === 'success' && (
        <div className="card" style={{ marginTop: 16, background: 'rgba(53,214,196,0.08)' }}>
          <strong>✓ Transaction Submitted</strong>
          {totalCommitted !== null && (
            <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
              Total Commitments: <span style={{ color: 'var(--accent)' }}>{totalCommitted.toString()}</span>
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--muted)' }}>
            <strong>What's on-chain:</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
              <li>Commitment hash (public, but unreversible)</li>
              <li>Transaction metadata</li>
              <li>Total commitment count</li>
            </ul>
            <strong style={{ color: 'var(--accent-2)' }}>What's private:</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
              <li>Your actual balance value ({balance})</li>
              <li>Your secret nonce</li>
              <li>The ZK proof details</li>
            </ul>
          </div>
        </div>
      )}

      {/* Privacy Explanation */}
      <div className="privacy-note">
        <strong>Privacy Guarantee:</strong> Your balance is committed using a ZK proof.
        The cryptographic commitment (hash) is stored on-chain, but the actual value
        is computationally infeasible to reverse. An observer can see THAT you committed,
        but NOT what value you committed.
      </div>

      {/* Technical Details */}
      <details style={{ marginTop: 16, fontSize: '0.8rem', color: 'var(--muted)' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>
          How the ZK Proof Works
        </summary>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          <p>
            <strong>1. Private Input:</strong> You provide your balance (1-100) as a private
            witness. This value never leaves your browser.
          </p>
          <p>
            <strong>2. ZK Proof Generation:</strong> The circuit generates a cryptographic proof
            that your balance is within the valid range [1, 100], without revealing the actual value.
          </p>
          <p>
            <strong>3. Commitment Creation:</strong> A commitment hash is computed using
            persistentCommit(balance, nonce). The random nonce ensures the commitment is
            binding and hiding.
          </p>
          <p>
            <strong>4. On-Chain Verification:</strong> The verifier checks that the proof is valid.
            Only the commitment hash is stored on-chain.
          </p>
          <p>
            <strong>5. Privacy Preserved:</strong> An observer can see the commitment hash, but
            cannot determine the balance value from it. The balance remains private.
          </p>
        </div>
      </details>
    </div>
  );
}
