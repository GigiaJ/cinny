import { MatrixClient, PushRuleKind } from 'matrix-js-sdk';
import { ClientConfig } from '../../../hooks/useClientConfig';

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission: NotificationPermission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    return 'denied';
  }
}

export async function enablePushNotifications(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push messaging is not supported in this browser.');
  }
  if (!mx || !mx.getHomeserverUrl() || !mx.getAccessToken()) {
    throw new Error('Matrix client is not properly initialized or authenticated.');
  }

  if (
    !clientConfig.pushNotificationDetails?.vapidPublicKey ||
    !clientConfig.pushNotificationDetails?.webPushAppID ||
    !clientConfig.pushNotificationDetails?.pushNotifyUrl
  ) {
    throw new Error('One or more push configuration constants are missing.');
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: clientConfig.pushNotificationDetails?.vapidPublicKey,
      });
    } catch (subscribeError: any) {
      if (Notification.permission === 'denied') {
        throw new Error('Notification permission denied. Please enable in browser settings.');
      }
      throw new Error(`Failed to subscribe: ${subscribeError.message || String(subscribeError)}`);
    }
  }

  const pwaAppIdForPlatform = clientConfig.pushNotificationDetails?.webPushAppID;
  if (!pwaAppIdForPlatform) {
    await subscription.unsubscribe();
    throw new Error('Could not determine PWA App ID for push endpoint.');
  }

  const subJson = subscription.toJSON();
  const p256dhKey = subJson.keys?.p256dh;
  const authKey = subJson.keys?.auth;

  if (!p256dhKey || !authKey) {
    await subscription.unsubscribe();
    throw new Error('Push subscription keys (p256dh, auth) are missing.');
  }

  const pusherData = {
    kind: 'http' as const,
    app_id: pwaAppIdForPlatform,
    pushkey: p256dhKey,
    app_display_name: 'Cinny',
    device_display_name:
      (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Unknown device',
    lang: navigator.language || 'en',
    data: {
      url: clientConfig.pushNotificationDetails?.pushNotifyUrl,
      format: 'event_id_only' as const,
      endpoint: subscription.endpoint,
      p256dh: p256dhKey,
      auth: authKey,
    },
    enabled: false,
    'org.matrix.msc3881.enabled': false,
    'org.matrix.msc3881.device_id': mx.getDeviceId(),
    append: false,
  };

  try {
    navigator.serviceWorker.controller?.postMessage({
      url: mx.baseUrl,
      type: 'togglePush',
      pusherData,
      token: mx.getAccessToken(),
    });
  } catch (pusherError: any) {
    await subscription.unsubscribe();
    throw new Error(
      `Failed to set up push with Matrix server: ${pusherError.message || String(pusherError)}`
    );
  }
}

export async function disablePushNotifications(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const pwaAppIdForPlatform = clientConfig.pushNotificationDetails?.webPushAppID;

  await subscription.unsubscribe();

  const subJson = subscription.toJSON();
  const p256dhKey = subJson.keys?.p256dh;
  const authKey = subJson.keys?.auth;

  if (mx && mx.getAccessToken() && pwaAppIdForPlatform) {
    const pusherData = {
      kind: null,
      app_id: pwaAppIdForPlatform,
      pushkey: p256dhKey,
    };

    navigator.serviceWorker.controller?.postMessage({
      url: mx.baseUrl,
      type: 'togglePush',
      pusherData,
      token: mx.getAccessToken(),
    });
  }
}

export async function deRegisterAllPushers(mx: MatrixClient): Promise<void> {
  const response = await mx.getPushers();
  const pushers = response.pushers || [];

  if (pushers.length === 0) {
    return;
  }

  const deletionPromises = pushers.map((pusher) => {
    const pusherToDelete: Partial<IPusher> & { kind: null; app_id: string; pushkey: string } = {
      kind: null,
      app_id: pusher.app_id,
      pushkey: pusher.pushkey,
      ...(pusher.data && { data: pusher.data }),
      ...(pusher.profile_tag && { profile_tag: pusher.profile_tag }),
    };

    return mx
      .setPusher(pusherToDelete as any)
      .then(() => ({ status: 'fulfilled', app_id: pusher.app_id }))
      .catch((err) => ({ status: 'rejected', app_id: pusher.app_id, error: err }));
  });

  await Promise.allSettled(deletionPromises);
}

const MUTE_RULE_ID = 'cc.cinny.mute_push';

export async function togglePusher(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  visible: boolean
): Promise<void> {
  if (visible) {
    disablePushNotifications(mx, clientConfig);
    await mx.deletePushRule('global', PushRuleKind.Override, `${MUTE_RULE_ID}`);
  } else {
    enablePushNotifications(mx, clientConfig);
  }
}
