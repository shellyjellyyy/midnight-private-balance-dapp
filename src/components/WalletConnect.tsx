import { useMidnightState } from '../hooks/MidnightProvider';

function errorMessage(errorType: string): string {
  switch (errorType) {
    case 'not-installed':
      return 'No 1AM wallet found. Install the 1AM wallet extension for Midnight and refresh.';
    case 'rejected':
      return 'Connection request was rejected in the wallet.';
    case 'network-mismatch':
      return 'Your wallet is on a different network. Switch it to Preprod and try again.';
    default:
      return 'Something went wrong connecting to your wallet.';
  }
}

function short(address: string) {
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export default function WalletConnect() {
  const { connecting, connected, address, error, connect, disconnect } = useMidnightState();

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className={`pill ${connected ? 'connected' : ''}`}>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
          {connected && address && <div className="address" style={{ marginTop: 10 }}>{short(address)}</div>}
        </div>

        {connected ? (
          <button className="secondary" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button onClick={connect} disabled={connecting}>
            {connecting ? (
              <>
                <span className="spinner" /> Connecting…
              </>
            ) : (
              'Connect 1AM'
            )}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{errorMessage(error.type)}</div>}
    </div>
  );
}
