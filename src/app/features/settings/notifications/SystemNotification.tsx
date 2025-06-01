import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds'; // Assuming 'folds' is your UI library
// Remove IPusherRequest if not used elsewhere, or ensure it's correctly typed for SDK v24+
// import { IPusherRequest } from 'matrix-js-sdk';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { getNotificationState, usePermissionState } from '../../../hooks/usePermission';
import { useEmailNotifications } from '../../../hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  requestBrowserNotificationPermission,
  enableTruePushNotifications,
  disableTruePushNotifications,
} from './PushNotifications'; // Adjust path as needed

// Your EmailNotification component (unchanged)
function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (!mx) {
          console.error('EmailNotification: Matrix client not available.');
          return;
        }
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: navigator.language || 'en',
            data: {
              brand: 'Cinny', // Example brand
            },
            append: true,
          } as any); // Use 'as any' if IPusherRequest type is problematic
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null, // This is how you delete a pusher
        } as any); // Use 'as any' for delete
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title="Email Notification"
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Your account does not have any email attached.
            </Text>
          )}
          {result && result.email && <>Send notification to your email. {`("${result.email}")`}</>}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Unexpected Error!
            </Text>
          )}
          {result === undefined && 'Send notification to your email.'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

export function SystemNotification() {
  const mx = useMatrixClient();
  // This setting now controls the user's general desire for PUSH notifications
  // It's separate from the browser's permission and the actual subscription state.
  const [userWantsPush, setUserWantsPush] = useSetting(settingsAtom, 'showNotifications');

  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );

  // Tracks the browser's actual notification permission ('granted', 'denied', 'prompt')
  const browserPermission = usePermissionState('notifications', getNotificationState());

  // Tracks if a PushSubscription is currently active for this browser/device
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);
  // Tracks loading state for checking subscription and toggling push
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Function to check current push subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    if (
      browserPermission === 'granted' &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    ) {
      setIsLoading(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsPushSubscribed(!!subscription);
      } catch (err) {
        console.error('Error checking push subscription:', err);
        setIsPushSubscribed(false);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsPushSubscribed(false); // Not granted or not supported
    }
  }, [browserPermission]);

  // Check subscription status on component mount or when browser permission changes
  useEffect(() => {
    checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  // Handler for the "Enable Notifications" button (when permission is 'prompt')
  const handleRequestPermissionAndEnable = async () => {
    if (!mx) {
      alert('Matrix client is not ready. Please log in.');
      return;
    }
    setIsLoading(true);
    try {
      const permissionResult = await requestBrowserNotificationPermission(); // From your service
      if (permissionResult === 'granted') {
        setUserWantsPush(true); // User expressed desire and granted permission
        await enableTruePushNotifications(mx); // From your service
      } else {
        setUserWantsPush(false); // User denied or dismissed
        alert('Notification permission was not granted.');
      }
    } catch (error) {
      console.error('Error during permission request or enabling push:', error);
      alert(`Failed to enable notifications: ${error.message || 'Unknown error'}`);
      setUserWantsPush(false); // Revert optimistic setting
    } finally {
      await checkSubscriptionStatus(); // Re-check actual subscription state
      setIsLoading(false);
    }
  };

  // Handler for the Switch (when permission is 'granted')
  const handlePushSwitchChange = async (wantsPush: boolean) => {
    if (!mx) {
      alert('Matrix client is not ready. Please log in.');
      return;
    }
    setIsLoading(true);
    setUserWantsPush(wantsPush); // Update the user's preference first

    try {
      if (wantsPush) {
        await enableTruePushNotifications(mx); // From your service
      } else {
        await disableTruePushNotifications(mx); // From your service
      }
    } catch (error) {
      console.error(`Error ${wantsPush ? 'enabling' : 'disabling'} push:`, error);
      alert(
        `Failed to ${wantsPush ? 'enable' : 'disable'} notifications: ${
          error.message || 'Unknown error'
        }`
      );
      // Revert the userWantsPush setting if the operation failed
      setUserWantsPush(!wantsPush);
    } finally {
      await checkSubscriptionStatus(); // Re-check actual subscription state
      setIsLoading(false);
    }
  };

  let descriptionText = 'Receive notifications even when the app is in the background.';
  if (browserPermission === 'granted') {
    if (isLoading && !isPushSubscribed) {
      descriptionText = 'Checking subscription status...';
    } else if (isPushSubscribed) {
      descriptionText = 'Background notifications are enabled and active for this device.';
    } else if (userWantsPush) {
      descriptionText = 'Attempting to subscribe for background notifications...';
    } else {
      descriptionText = 'Background notifications are currently disabled by you.';
    }
  }

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">System & Notifications</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Background Push Notifications"
          description={
            browserPermission === 'denied' ? (
              <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                {'Notification' in window
                  ? 'Notification permission is blocked by your browser. Please allow it from browser/system settings.'
                  : 'Push Notifications are not supported by your browser.'}
              </Text>
            ) : (
              <span>{descriptionText}</span>
            )
          }
          after={
            isLoading ? (
              <Spinner variant="Secondary" />
            ) : browserPermission === 'prompt' ? (
              <Button size="300" radii="300" onClick={handleRequestPermissionAndEnable}>
                <Text size="B300">Enable Notifications</Text>
              </Button>
            ) : browserPermission === 'granted' ? (
              <Switch
                value={userWantsPush && isPushSubscribed} // Switch reflects if user wants AND is actually subscribed
                onChange={handlePushSwitchChange}
              />
            ) : null // No control if permission denied (already handled by description)
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Notification Sound (for in-app/client-side alerts)"
          description="Play sound when new message arrives and app is open."
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>
    </Box>
  );
}
