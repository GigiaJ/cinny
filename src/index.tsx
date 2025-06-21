import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';
import './index.scss';
import App from './app/pages/App';
import './app/i18n';
import { readyServiceWorker } from './serviceWorkerBridge';

enableMapSet();

document.body.classList.add(configClass, varsClass);

readyServiceWorker();

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(<App />);
};

mountApp();
