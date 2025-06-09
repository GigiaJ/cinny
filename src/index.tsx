/* eslint-disable import/first */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.scss';

import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';

// import i18n (needs to be bundled ;))
import './app/i18n';

enableMapSet();

document.body.classList.add(configClass, varsClass);

if ('serviceWorker' in navigator) {
  const isProduction = import.meta.env.MODE === 'production';
  const swUrl = isProduction
      ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
      : `/dev-sw.js?dev-sw`;

  const swRegisterOptions: RegistrationOptions = {};
  if (!isProduction) {
    swRegisterOptions.type = 'module';
  }

  const showUpdateAvailablePrompt = (registration: ServiceWorkerRegistration) => {
    const DONT_SHOW_PROMPT_KEY = 'cinny_dont_show_sw_update_prompt';
    const userPreference = localStorage.getItem(DONT_SHOW_PROMPT_KEY);

    if (userPreference === 'true') {
      return;
    }

    if (window.confirm('A new version of the app is available. Refresh to update?')) {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
      } else {
        window.location.reload();
      }
    }
  };

  navigator.serviceWorker.register(swUrl, swRegisterOptions).then((registration) => {
    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (installingWorker) {
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              showUpdateAvailablePrompt(registration);
            }
          }
        };
      }
    };
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data || !event.source) {
      return;
    }

    if (event.data.type === 'token' && event.data.id) {
      const token = localStorage.getItem('cinny_access_token') ?? undefined;
      event.source.postMessage({
        replyTo: event.data.id,
        payload: token,
      });
    } else if (event.data.type === 'openRoom' && event.data.id) {
      /* Example:
      event.source.postMessage({
        replyTo: event.data.id,
        payload: success?,
      });
      */
    }
  });
}

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
