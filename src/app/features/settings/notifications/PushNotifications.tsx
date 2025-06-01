import { MatrixClient } from 'matrix-js-sdk'; // Ensure you have MatrixClient type

/**
 * Your VAPID public key.
 */
const VAPID_PUBLIC_KEY =
  'BHLwykXs79AbKNiblEtZZRAgnt7o5_ieImhVJD8QZ01MVwAHnXwZzNgQEJJEU3E5CVsihoKtb7yaNe5x3vmkWkI';

/**
 * App_id for FCM-based browsers for Sygnal.
 */
const PWA_APP_ID_FCM = 'cc.cinny.cinny.fcm';

/**
 * App_id for APNs-based browsers for Sygnal.
 */
const PWA_APP_ID_APNS = 'cc.cinny.web';

/**
 * Full HTTPS URL to YOUR Sygnal instance's notify endpoint.
 */
const SYGNAL_NOTIFY_URL = 'https://cinny.cc/_matrix/push/v1/notify';

/**
 * PWA display name.
 */
const PWA_DISPLAY_NAME = 'CinnyPWATest';

/**
 * Generic device display name for the pusher.
 */
const PWA_DEVICE_DISPLAY_NAME = 'Browser Push (Cinny)';

/**
 * Determines the correct pushkey format for Sygnal based on the push subscription.
 * For APNs, Sygnal expects the raw APNs device token, standard base64 encoded (with padding).
 * The subscription.endpoint for APNs is a URL where the last path segment
 * is the URL-safe base64 encoded device token.
 * For FCM/WebPush, Sygnal expects the full endpoint URL.
 * @param pushSubscription The PushSubscription object.
 * @returns The pushkey string formatted for Sygnal.
 */
function getPushkeyForSygnal(pushSubscription: PushSubscription): string {
  const endpoint = pushSubscription.endpoint;
  const endpointLowercase = endpoint.toLowerCase();

  if (
    endpointLowercase.includes('apple.com/push') ||
    endpointLowercase.includes('push.apple.com')
  ) {
    // APNs platform
    const endpointParts = endpoint.split('/');
    const apnsTokenUrlSafe = endpointParts[endpointParts.length - 1];

    /*
    if (!apnsTokenUrlSafe) {
      const errorMessage = `[PushService] Could not extract APNs token from endpoint: ${endpoint}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Convert URL-safe base64 (from APNs endpoint) to standard base64 for Sygnal
    let standardBase64Token = apnsTokenUrlSafe.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (standardBase64Token.length % 4)) % 4);
    standardBase64Token += padding;

    console.log('[PushService] APNs platform: Extracted URL-safe token part:', apnsTokenUrlSafe);
    console.log(
      '[PushService] APNs platform: Converted to standard base64 pushkey for Sygnal:',
      standardBase64Token
    );
    return standardBase64Token;
    */
    return apnsTokenUrlSafe;
  } else {
    // FCM or other WebPush platforms
    console.log(
      '[PushService] FCM/WebPush platform: Using full endpoint as pushkey for Sygnal:',
      endpoint
    );
    return endpoint;
  }
}

// =====================================================================================
// Service Functions
// =====================================================================================

/**
 * Requests notification permission from the user via the browser.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  console.log('[PushService] Requesting browser notification permission...');
  if (!('Notification' in window)) {
    console.warn('[PushService] Notifications API not supported by this browser.');
    return 'denied';
  }
  try {
    const permission: NotificationPermission = await Notification.requestPermission();
    console.log('[PushService] Browser permission status:', permission);
    return permission;
  } catch (error) {
    console.error('[PushService] Error requesting notification permission:', error);
    return 'denied';
  }
}

/**
 * Detects the push service platform from the subscription endpoint and returns the appropriate app_id.
 */
function detectPlatformAndGetAppId(pushSubscription: PushSubscription): string | null {
  const endpoint = pushSubscription.endpoint.toLowerCase();
  console.log('[PushService] Detecting platform from endpoint:', endpoint);

  if (
    endpoint.includes('googleapis.com/fcm') ||
    endpoint.includes('updates.push.services.mozilla.com')
  ) {
    console.log('[PushService] Detected FCM/WebPush. Using FCM App ID:', PWA_APP_ID_FCM);
    return PWA_APP_ID_FCM;
  } else if (endpoint.includes('apple.com/push') || endpoint.includes('push.apple.com')) {
    console.log('[PushService] Detected APNs. Using APNs App ID:', PWA_APP_ID_APNS);
    return PWA_APP_ID_APNS;
  } else {
    console.warn('[PushService] Could not determine push service type from endpoint:', endpoint);
    return null;
  }
}

/**
 * Enables true push notifications.
 */
export async function enableTruePushNotifications(matrixClient: MatrixClient): Promise<void> {
  console.log('[PushService] Attempting to enable TRUE push notifications...');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push messaging is not supported in this browser.');
  }
  if (!matrixClient || !matrixClient.getHomeserverUrl() || !matrixClient.getAccessToken()) {
    throw new Error('Matrix client is not properly initialized or authenticated.');
  }

  if (!VAPID_PUBLIC_KEY || !PWA_APP_ID_FCM || !PWA_APP_ID_APNS || !SYGNAL_NOTIFY_URL) {
    throw new Error('One or more push configuration constants are missing.');
  }

  const registration = await navigator.serviceWorker.ready;
  console.log('[PushService] Service Worker is ready.');

  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    console.log('[PushService] Found existing push subscription:', subscription.toJSON());
  } else {
    console.log('[PushService] No existing subscription. Subscribing to PushManager...');
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      console.log('[PushService] Successfully subscribed to push:', subscription.toJSON());
    } catch (subscribeError: any) {
      console.error('[PushService] Failed to subscribe to PushManager:', subscribeError);
      if (Notification.permission === 'denied') {
        throw new Error('Notification permission denied. Please enable in browser settings.');
      }
      throw new Error(`Failed to subscribe: ${subscribeError.message || String(subscribeError)}`);
    }
  }

  const pwaAppIdForPlatform = detectPlatformAndGetAppId(subscription);
  if (!pwaAppIdForPlatform) {
    await subscription
      .unsubscribe()
      .catch((unsubError) =>
        console.warn(
          '[PushService] Failed to unsubscribe after unknown platform detection:',
          unsubError
        )
      );
    throw new Error('Could not determine PWA App ID for push endpoint.');
  }

  const subJson = subscription.toJSON();
  const p256dhKey = subJson.keys?.p256dh;
  const authKey = subJson.keys?.auth;

  if (!p256dhKey || !authKey) {
    console.error(
      '[PushService] CRITICAL: Missing p256dh or auth keys from subscription:',
      subJson
    );
    await subscription
      .unsubscribe()
      .catch((e) =>
        console.warn('[PushService] Failed to unsubscribe after key fetch failure:', e)
      );
    throw new Error('Push subscription keys (p256dh, auth) are missing.');
  }

  // Get the correctly formatted pushkey for Sygnal
  const sygnalPushkey = getPushkeyForSygnal(subscription);

  const pusherData = {
    kind: 'http' as const,
    app_id: pwaAppIdForPlatform,
    pushkey: p256dhKey, // Use the processed pushkey
    app_display_name: PWA_DISPLAY_NAME,
    device_display_name: PWA_DEVICE_DISPLAY_NAME,
    lang: navigator.language || 'en',
    data: {
      url: SYGNAL_NOTIFY_URL,
      format: 'event_id_only' as const,
      endpoint: subscription.endpoint,
      p256dh: p256dhKey,
      auth: authKey,
    },
    append: false,
  };

  console.log(
    '[PushService] Registering pusher with homeserver. Data:',
    JSON.stringify(pusherData, null, 2)
  );
  try {
    await matrixClient.setPusher(pusherData);
    console.log('[PushService] Successfully registered/updated pusher with Matrix homeserver.');
  } catch (pusherError: any) {
    console.error('[PushService] Failed to register pusher with Matrix homeserver:', pusherError);
    console.error(
      `[PushService] Pusher registration error details: Code: ${pusherError.errcode}, Message: ${
        pusherError.error || pusherError.message
      }`
    );
    await subscription
      .unsubscribe()
      .catch((unsubError) =>
        console.warn(
          '[PushService] Failed to unsubscribe after pusher registration error:',
          unsubError
        )
      );
    throw new Error(
      `Failed to set up push with Matrix server: ${pusherError.message || String(pusherError)}`
    );
  }
}

/**
 * Disables true push notifications.
 */
export async function disableTruePushNotifications(matrixClient: MatrixClient): Promise<void> {
  console.log('[PushService] Attempting to disable TRUE push notifications...');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[PushService] Push messaging not supported. Cannot disable.');
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    console.log('[PushService] No active push subscription found to disable.');
    return;
  }

  console.log('[PushService] Found active subscription to remove:', subscription.endpoint);

  // Get app_id and the correctly formatted pushkey for removal
  const pwaAppIdForPlatform = detectPlatformAndGetAppId(subscription);
  const sygnalPushkey = getPushkeyForSygnal(subscription); // Must match the key used for registration

  try {
    const unsubscribed = await subscription.unsubscribe();
    console.log(
      unsubscribed
        ? '[PushService] Successfully unsubscribed from browser push service.'
        : '[PushService] Unsubscribe call returned false (already unsubscribed or failed).'
    );
  } catch (unsubscribeError) {
    console.error('[PushService] Error unsubscribing from push service:', unsubscribeError);
  }

  if (matrixClient && matrixClient.getAccessToken() && pwaAppIdForPlatform) {
    const pusherToRemove = {
      kind: null,
      app_id: pwaAppIdForPlatform,
      pushkey: sygnalPushkey, // Use the same formatted pushkey as for registration
    };
    console.log('[PushService] Attempting to remove pusher from homeserver:', pusherToRemove);
    try {
      await matrixClient.setPusher(pusherToRemove as any);
      console.log('[PushService] Pusher removal request sent to homeserver.');
    } catch (pusherError: any) {
      console.error('[PushService] Failed to remove pusher from Matrix homeserver:', pusherError);
      console.error(
        `[PushService] Pusher removal error: ${pusherError.errcode || ''} ${
          pusherError.error || ''
        } ${pusherError.message || ''}`
      );
    }
  } else if (!pwaAppIdForPlatform) {
    console.warn(
      '[PushService] Could not determine app_id for pusher removal. Pusher might remain on homeserver.'
    );
  } else {
    console.log(
      '[PushService] Matrix client not available/authenticated; skipping pusher removal from homeserver.'
    );
  }
}
