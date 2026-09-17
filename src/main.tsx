import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from "buffer";
Object.assign(globalThis, { Buffer });
import App from './App';
import './index.css';

// Midnight SDK deps (@midnight-ntwrk/wallet-sdk-address-format, @subsquid/*)
// reference the Node global `Buffer` with no import. Provide it from the
// browser-compatible `buffer` package that midnight-js-utils already bundles.
Object.assign(globalThis, { Buffer });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
