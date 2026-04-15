// entrypoints/sidepanel/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { createLogger } from '@/src/background/log';

const logger = createLogger('sidepanel');
const container = document.getElementById('root');
if (!container) {
  throw new Error('sidepanel root missing');
}
logger.info('sidepanel mounted');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
