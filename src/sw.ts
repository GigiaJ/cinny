/// <reference lib="WebWorker" />

export type {};
declare const self: ServiceWorkerGlobalScope;

// DEBUGGING TAGS
const PUSH_DEBUG_TAG = '[SW PUSH]';
const FETCH_DEBUG_TAG = '[SW FETCH]';
const LIFECYCLE_DEBUG_TAG = '[SW LIFECYCLE]';
const TOKEN_DEBUG_TAG = '[SW TOKEN]';
const NOTIFICATION_CLICK_DEBUG_TAG = '[SW NOTIFICATION CLICK]';

// NOTIFICATION DEFAULTS
const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192x192.png'; // Replace with your actual default icon path
const DEFAULT_NOTIFICATION_BADGE = '/icons/badge-72x72.png'; // Replace with your actual default badge icon path (for notification UI)

/**
 * Asks an active client for an access token.
 * Includes a timeout to prevent the Service Worker from hanging indefinitely.
 */
async function askForAccessToken(
  client: Client,
  timeoutMs: number = 5000
): Promise<string | undefined> {
  console.log(TOKEN_DEBUG_TAG, `Attempting to get token from client: ${client.id}`);
  return new Promise((resolve) => {
    const responseKey = `sw-token-req-${Math.random().toString(36).substring(2, 15)}`;
    let timeoutId: number | undefined = undefined;

    const listener = (event: ExtendableMessageEvent) => {
      if (event.data?.responseKey !== responseKey) return;

      if (timeoutId) clearTimeout(timeoutId);
      self.removeEventListener('message', listener);
      console.log(
        TOKEN_DEBUG_TAG,
        `Token received for key ${responseKey}:`,
        event.data.token ? 'Yes' : 'No'
      );
      resolve(event.data.token as string | undefined);
    };

    timeoutId = self.setTimeout(() => {
      self.removeEventListener('message', listener);
      console.warn(
        TOKEN_DEBUG_TAG,
        `Timeout waiting for token for responseKey ${responseKey} from client ${client.id}`
      );
      resolve(undefined); // Resolve with undefined, let the caller handle the absence of a token
    }, timeoutMs);

    self.addEventListener('message', listener);

    try {
      client.postMessage({ responseKey, type: 'token_request_from_sw' }); // Ensure client listens for this type
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      self.removeEventListener('message', listener);
      console.error(TOKEN_DEBUG_TAG, `Error posting message to client ${client.id}:`, e);
      resolve(undefined);
    }
  });
}

/**
 * Creates RequestInit options for fetching with an Authorization header.
 */
function fetchConfig(token?: string): RequestInit | undefined {
  if (!token) return undefined;
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'default',
  };
}

/**
 * INSTALL Event
 */
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log(LIFECYCLE_DEBUG_TAG, 'Install event');
  // event.waitUntil(self.skipWaiting()); // Optional: if you want the new SW to activate immediately
});

/**
 * ACTIVATE Event
 * Clean up old caches and claim clients.
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log(LIFECYCLE_DEBUG_TAG, 'Activate event');
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      console.log(LIFECYCLE_DEBUG_TAG, 'Clients claimed.');
    })()
  );
});

/**
 * FETCH Event
 * Intercepts network requests. Used here for Matrix media.
 */
self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;
  if (method !== 'GET') return;
  if (
    !url.includes('/_matrix/client/v1/media/download') &&
    !url.includes('/_matrix/client/v1/media/thumbnail')
  ) {
    return;
  }

  console.log(FETCH_DEBUG_TAG, 'Intercepting fetch for Matrix media:', url);
  event.respondWith(
    (async (): Promise<Response> => {
      let clientToAsk: Client | undefined;
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      clientToAsk = windowClients.find((c) => (c as WindowClient).focused) || windowClients[0];

      if (!clientToAsk && event.clientId) {
        clientToAsk = await self.clients.get(event.clientId);
      }

      let token: string | undefined;
      if (clientToAsk) {
        token = await askForAccessToken(clientToAsk);
      } else {
        console.warn(FETCH_DEBUG_TAG, 'No client found to ask for access token for URL:', url);
      }

      const authenticatedOptions = fetchConfig(token); // Use your fetchConfig function
      console.log(
        FETCH_DEBUG_TAG,
        `Fetching ${url} ${authenticatedOptions ? 'with token' : 'without token'}`
      );

      try {
        const response = await fetch(event.request, authenticatedOptions);
        return response;
      } catch (error) {
        console.error(FETCH_DEBUG_TAG, `Error fetching ${url}:`, error);
        return new Response('Network error fetching media', { status: 500 });
      }
    })()
  );
});

// ===================================================================================
// ADDED: PUSH NOTIFICATION HANDLING
// ===================================================================================

/**
 * PUSH Event
 * Handles incoming push messages from a push service (via Sygnal).
 */
self.addEventListener('push', (event: PushEvent) => {
  console.log(PUSH_DEBUG_TAG, 'Push Received.');

  let title = 'New Notification'; // Default title
  let options: NotificationOptions = {
    body: 'You have a new message!', // Default body
    icon: DEFAULT_NOTIFICATION_ICON, // Make sure this path is correct and file exists
    badge: DEFAULT_NOTIFICATION_BADGE, // For the notification UI, not the app icon badge
    data: {
      url: self.registration.scope, // Default URL to open is the PWA's scope
      timestamp: Date.now(),
    },
    // tag: 'cinny-notification-tag', // Optional: Replaces existing notification with same tag
    // renotify: true, // Optional: If using tag, renotify will alert user even if tag matches
    // silent: false, // Optional: Set to true for no sound/vibration
  };
  let badgeCount: number | undefined = undefined; // For app icon badging

  if (event.data) {
    try {
      const pushData = event.data.json();
      console.log(PUSH_DEBUG_TAG, 'Push data (JSON):', pushData);

      title = pushData.title || title;
      options.body = pushData.body || options.body;
      options.icon = pushData.icon || options.icon;
      options.badge = pushData.badge || options.badge;

      if (pushData.image) options.image = pushData.image;
      if (pushData.vibrate) options.vibrate = pushData.vibrate; // e.g., [200, 100, 200]
      if (pushData.actions) options.actions = pushData.actions;
      if (pushData.tag) options.tag = pushData.tag;
      if (typeof pushData.renotify === 'boolean') options.renotify = pushData.renotify;
      if (typeof pushData.silent === 'boolean') options.silent = pushData.silent;

      // Merge custom data from push, ensuring 'url' is prioritized if present
      if (pushData.data) {
        options.data = { ...options.data, ...pushData.data };
      }
      if (typeof pushData.badgeCount === 'number') {
        badgeCount = pushData.badgeCount;
      }
    } catch (e) {
      // If parsing JSON fails, try to get text
      const pushText = event.data.text();
      console.log(PUSH_DEBUG_TAG, 'Push data (Text):', pushText);
      options.body = pushText || options.body;
    }
  } else {
    console.log(PUSH_DEBUG_TAG, 'Push event received but no data was sent.');
  }

  // --- App Icon Badging ---
  // The SW messages an active client to update the app icon badge.
  if (typeof badgeCount === 'number') {
    console.log(PUSH_DEBUG_TAG, `Requesting client to update badge to: ${badgeCount}`);
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'UPDATE_BADGE_COUNT', // Client should listen for this
          count: badgeCount,
        });
      });
    });
  }

  // CRITICAL: Show the notification
  const notificationPromise = self.registration.showNotification(title, options);

  // CRITICAL: Keep the service worker alive until the notification is shown
  // and potentially other async work related to the push is done.
  event.waitUntil(
    notificationPromise
      .then(() => console.log(PUSH_DEBUG_TAG, 'Notification displayed successfully.'))
      .catch((err) => console.error(PUSH_DEBUG_TAG, 'Error displaying notification:', err))
  );
});

/**
 * NOTIFICATION CLICK Event
 * Handles user clicks on displayed notifications.
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log(NOTIFICATION_CLICK_DEBUG_TAG, 'Notification click Received.');
  console.log(NOTIFICATION_CLICK_DEBUG_TAG, 'Notification data:', event.notification.data);
  console.log(NOTIFICATION_CLICK_DEBUG_TAG, 'Action clicked:', event.action);

  // Close the notification that was clicked
  event.notification.close();

  // Example: Handle specific notification actions
  // if (event.action === 'archive') {
  //   event.waitUntil(archiveMessageAndThenFocus(event.notification.data.messageId));
  //   return;
  // }

  // Default behavior: Open a window to the URL specified in notification.data.url
  // or focus an existing window if one is already open to that URL.
  const targetUrl = event.notification.data?.url || self.registration.scope;
  console.log(NOTIFICATION_CLICK_DEBUG_TAG, `Attempting to open or focus URL: ${targetUrl}`);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Check if client URL matches target. Adjust if you need more complex URL matching.
          if (client.url === targetUrl && 'focus' in client) {
            console.log(NOTIFICATION_CLICK_DEBUG_TAG, `Focusing existing client: ${client.id}`);
            try {
              return (client as WindowClient).focus(); // Type assertion for focus
            } catch (e) {
              console.error(
                NOTIFICATION_CLICK_DEBUG_TAG,
                'Failed to focus client, attempting to open new window:',
                e
              );
              // Fall through to openWindow if focus fails
            }
          }
        }
        // If no existing window is found or focus failed, open a new one.
        if (self.clients.openWindow) {
          console.log(NOTIFICATION_CLICK_DEBUG_TAG, `Opening new window for: ${targetUrl}`);
          return self.clients.openWindow(targetUrl);
        }
        console.warn(NOTIFICATION_CLICK_DEBUG_TAG, 'clients.openWindow is not available.');
        return Promise.resolve();
      })
      .catch((err) => {
        console.error(NOTIFICATION_CLICK_DEBUG_TAG, 'Error handling notification click:', err);
      })
  );
});

/**
 * MESSAGE Event
 * Handles messages sent from client windows.
 * The `askForAccessToken` function sets up its own temporary listener for token responses,
 * so specific handling for 'token_response_to_sw' is not strictly needed here unless
 * you want a centralized message handler.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  console.log(LIFECYCLE_DEBUG_TAG, 'Message received from client in general listener:', event.data);

  // Example: Handling a 'SKIP_WAITING' message from the client to activate new SW immediately
  // if (event.data && event.data.type === 'SKIP_WAITING') {
  //   console.log(LIFECYCLE_DEBUG_TAG, 'Executing self.skipWaiting() due to client message.');
  //   self.skipWaiting();
  // }
});

// --- Optional: Workbox Pre-caching ---
// If you are using vite-plugin-pwa with injectManifest strategy and Workbox
// for pre-caching your app shell and assets, you would uncomment and use something like this:
/*
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
// ... other Workbox imports and strategies
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };
if (self.__WB_MANIFEST) {
  precacheAndRoute(self.__WB_MANIFEST);
}
cleanupOutdatedCaches();
// ...
*/
// --- End of Optional: Workbox Pre-caching ---
