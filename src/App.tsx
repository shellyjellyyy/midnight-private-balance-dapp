import WalletConnect from './components/WalletConnect';
import CircuitCall from './components/CircuitCall';
import { MidnightProvider } from './hooks/MidnightProvider';

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Midnight Privacy Counter</h1>
        <p>Commit private balances using ZK proofs — values never revealed on-chain.</p>
      </header>

      <MidnightProvider>
        <WalletConnect />
        <CircuitCall />
      </MidnightProvider>

      {/* Privacy Model Explanation */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Privacy Model</h3>
        <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          <p>
            This dApp demonstrates Midnight's privacy capabilities through a
            <strong> Private Balance Commitment</strong> system.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
            <div>
              <strong style={{ color: 'var(--accent-2)' }}>What's Private:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                <li>Your balance value (1-100)</li>
                <li>Your secret nonce</li>
                <li>ZK proof details</li>
              </ul>
            </div>

            <div>
              <strong style={{ color: 'var(--accent)' }}>What's Public:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                <li>Commitment hash (unreversible)</li>
                <li>Total number of commitments</li>
                <li>Transaction metadata</li>
              </ul>
            </div>
          </div>

          <p style={{ marginTop: 12, color: 'var(--muted)' }}>
            <strong>Key Insight:</strong> An observer can see THAT someone committed,
            but NOT what value they committed. The commitment uses
            <code>persistentCommit</code> with a random nonce, making it computationally
            infeasible to reverse the hash and discover the balance.
          </p>
        </div>
      </div>

      {/* How It Works */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>How It Works</h3>
        <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>Private Input:</strong> You provide a balance (1-100) as a private witness.
              This value never leaves your browser.
            </li>
            <li>
              <strong>ZK Proof:</strong> The circuit generates a proof that your balance is valid
              (within range) without revealing the actual value.
            </li>
            <li>
              <strong>Commitment:</strong> A cryptographic commitment hash is created using
              <code>persistentCommit(balance, nonce)</code>.
            </li>
            <li>
              <strong>On-Chain:</strong> Only the commitment hash is stored on the public ledger.
              The actual balance remains private.
            </li>
            <li>
              <strong>Verification:</strong> Anyone can verify the commitment exists, but cannot
              determine the balance value from it.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
