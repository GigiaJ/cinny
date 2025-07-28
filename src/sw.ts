/// <reference lib="WebWorker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { usePushNotifications } from './sw/pushNotification';
import { EventType } from "matrix-js-sdk/lib/@types/event";

export type {};
declare const self: ServiceWorkerGlobalScope;

const { handlePushNotificationPushData } = usePushNotifications(self);

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


const onPushNotification = async (event: PushEvent) => {
  if (!event?.data) {
    return;
  }
  const pushData = event.data.json();
  console.log(pushData);

  // try {
  //   if (typeof pushData?.unread === 'number') {
  //     self.navigator.setAppBadge(pushData.unread);
  //
  //     if (pushData.unread == 0) {
  //       self.registration.getNotifications()
  //         .then((notifications) => notifications
  //           .forEach((notification) => notification.close()));
  //       await navigator.clearAppBadge();
  //       return;
  //     }
  //   } else {
  //     await navigator.clearAppBadge();
  //   }
  // } catch (_) {
  //   // Likely Firefox/Gecko-based and doesn't support badging API
  // }

  await handlePushNotificationPushData(pushData);
};

self.addEventListener('push', (event: PushEvent) => event.waitUntil(onPushNotification(event)));

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const messageData = event.notification.data;
  const scope = self.registration.scope;

  console.log(messageData);
  const eventType = messageData?.type as (EventType | undefined);
  if (!eventType) return Promise.resolve();

  let targetUrl: string = `${scope}inbox/`;
  if (
    (eventType == EventType.RoomMessage || eventType == EventType.RoomMessageEncrypted) &&
    messageData?.room_id && messageData?.event_id
  ) targetUrl = `${scope}to/${messageData.room_id}/${messageData.event_id}`;
  if (
    eventType == EventType.RoomMember &&
    messageData?.content?.membership == "invite"
  ) targetUrl = `${scope}inbox/invites/`;
  console.log(`target url = ${targetUrl}`);

  const postMessageToClient = (client: WindowClient) => {
    client.postMessage({
      type: "notificationToRoomEvent",
      message: messageData
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
