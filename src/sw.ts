/// <reference lib="WebWorker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

export type {};
declare const self: ServiceWorkerGlobalScope;

const DEFAULT_NOTIFICATION_ICON = '/public/res/apple/apple-touch-icon-180x180.png';
const DEFAULT_NOTIFICATION_BADGE = '/public/res/apple-touch-icon-72x72.png';

const pendingReplies = new Map();
let messageIdCounter = 0;
function sendAndWaitForReply(client: WindowClient, type: string, payload: object) {
  messageIdCounter += 1;
  const id = messageIdCounter;
  const promise = new Promise((resolve) => {
    pendingReplies.set(id, resolve);
  });
  client.postMessage({ type, id, payload });
  return promise;
}

async function fetchWithRetry(
  url: string,
  token: string,
  retries = 3,
  delay = 250
): Promise<Response> {
  let lastError: Error | undefined;

  /*  eslint-disable no-await-in-loop */
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        console.warn(
          `Fetch attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );
        await new Promise((res) => {
          setTimeout(res, delay);
        });
      }
    }
  }
  /*  eslint-enable no-await-in-loop */
  throw new Error(`Fetch failed after ${retries} retries. Last error: ${lastError?.message}`);
}

function fetchConfig(token?: string): RequestInit | undefined {
  if (!token) return undefined;

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'default',
  };
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data.type === 'togglePush') {
    const token = event.data?.token;
    const fetchOptions = fetchConfig(token);
    event.waitUntil(
      fetch(`${event.data.url}/_matrix/client/v3/pushers/set`, {
        method: 'POST',
        ...fetchOptions,
        body: JSON.stringify(event.data.pusherData),
      })
    );
    return;
  }
  const { replyTo } = event.data;
  if (replyTo) {
    const resolve = pendingReplies.get(replyTo);
    if (resolve) {
      pendingReplies.delete(replyTo);
      resolve(event.data.payload);
    }
  }
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
    })()
  );
});

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;
  if (method !== 'GET') return;
  if (
    !url.includes('/_matrix/client/v1/media/download') &&
    !url.includes('/_matrix/client/v1/media/thumbnail')
  ) {
    return;
  }
  event.respondWith(
    (async (): Promise<Response> => {
      if (!event.clientId) throw new Error('Missing clientId');
      const client = await self.clients.get(event.clientId);
      if (!client) throw new Error('Client not found');
      const token = await sendAndWaitForReply(client, 'token', {});
      if (!token) throw new Error('Failed to retrieve token');
      const response = await fetchWithRetry(url, token);
      return response;
    })()
  );
  event.waitUntil(
    (async function () {
      console.log('Ensuring fetch processing completes before worker termination.');
    })()
  );
});

const handlePushNotificationEventData = async (eventData: PushMessageData) => {
  const pushData = eventData.json();
  console.log(pushData); // TODO: delete this

  if (typeof pushData?.unread === 'number') {
    try {
      self.navigator.setAppBadge(pushData.unread);
    } catch (e) {
      // Likely Firefox/Gecko-based and doesn't support badging API
    }
  } else {
    await navigator.clearAppBadge();
  }

  let title = undefined;
  if (pushData?.sender_display_name && pushData?.room_name) {
    title = `${pushData.sender_display_name} in ${pushData.room_name}`;
  }
  title = title ?? "New Notification";

  let body = "You have a new message";
  if (pushData?.content?.ciphertext) {
    body = `Encrypted message`;
  } else if (pushData?.content?.body) {
    body = pushData.content.body;
  } else {
    return;
  }

  self.registration.showNotification(title, {
    body: body,
    icon: DEFAULT_NOTIFICATION_ICON,
    badge: DEFAULT_NOTIFICATION_BADGE,
    data: {
      url: self.registration.scope,
      timestamp: Date.now(),
      room_id: pushData.room_id,
      event_id: pushData.event_id,
      ...pushData.data,
    },
    tag: "Cinny",
    silent: pushData.silent ?? false,
  });
};

const onPushNotification = async (event: PushEvent) => {
  if (!event.data) {
    return;
  }

  handlePushNotificationEventData(event.data);
};

self.addEventListener('push', (event: PushEvent) => event.waitUntil(onPushNotification(event)));

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const messageData = event.notification.data;
  const scope = self.registration.scope;
  const targetUrl = (messageData?.room_id && messageData?.event_id)
    ? `${scope}to/${messageData.room_id}/${messageData.event_id}`
    : `${scope}inbox/notifications/`;
  const postMessageToClient = (client: WindowClient) => {
    client.postMessage({
      type: "notificationToRoomEvent",
      room_id: event.notification.data?.room_id,
      event_id: event.notification.data?.event_id,
    });
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return (client as WindowClient).focus().then(postMessageToClient);
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return Promise.resolve();
    })
  );
});

if (self.__WB_MANIFEST) {
  precacheAndRoute(self.__WB_MANIFEST);
}
cleanupOutdatedCaches();
