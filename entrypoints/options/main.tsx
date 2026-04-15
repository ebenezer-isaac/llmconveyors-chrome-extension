// entrypoints/options/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { createLogger } from '@/src/background/log';

const logger = createLogger('options');
const container = document.getElementById('root');
if (!container) {
  throw new Error('options root missing');
}
logger.info('options mounted');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
