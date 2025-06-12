import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Text,
  Switch,
  Button,
  color,
  Spinner,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Dialog,
  Header,
  IconButton,
  Icon,
  Icons,
  config,
} from 'folds';
import { IPusher, IPusherRequest, MatrixClient } from 'matrix-js-sdk';
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
  enablePushNotifications,
  disablePushNotifications,
} from './PushNotifications';
import { useClientConfig } from '../../../hooks/useClientConfig';
import FocusTrap from 'focus-trap-react';

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

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Cinny',
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
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

function WebPushNotificationSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const [userPushPreference, setUserPushPreference] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const browserPermission = usePermissionState('notifications', getNotificationState());
  useEffect(() => {
    const storedPreference = localStorage.getItem('cinny_web_push_enabled');
    setUserPushPreference(storedPreference === 'true');
    setIsLoading(false);
  }, []);
  const handleRequestPermissionAndEnable = async () => {
    setIsLoading(true);
    try {
      const permissionResult = await requestBrowserNotificationPermission();
      if (permissionResult === 'granted') {
        await enablePushNotifications(mx, clientConfig);
        localStorage.setItem('cinny_web_push_enabled', 'true');
        setUserPushPreference(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePushSwitchChange = async (wantsPush: boolean) => {
    setIsLoading(true);

    try {
      if (wantsPush) {
        await enablePushNotifications(mx, clientConfig);
      } else {
        await disablePushNotifications(mx, clientConfig);
      }
      localStorage.setItem('cinny_web_push_enabled', String(wantsPush));
      setUserPushPreference(wantsPush);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingTile
      title="Background Push Notifications"
      description={
        browserPermission === 'denied' ? (
          <Text as="span" style={{ color: color.Critical.Main }} size="T200">
            Permission blocked. Please allow notifications in your browser settings.
          </Text>
        ) : (
          'Receive notifications when the app is closed or in the background.'
        )
      }
      after={
        isLoading ? (
          <Spinner variant="Secondary" />
        ) : browserPermission === 'prompt' ? (
          <Button size="300" radii="300" onClick={handleRequestPermissionAndEnable}>
            <Text size="B300">Enable</Text>
          </Button>
        ) : browserPermission === 'granted' ? (
          <Switch value={userPushPreference} onChange={handlePushSwitchChange} />
        ) : null
      }
    />
  );
}

type ConfirmDeregisterDialogProps = {
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
};

function ConfirmDeregisterDialog({ onClose, onConfirm, isLoading }: ConfirmDeregisterDialogProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            clickOutsideDeactivates: true,
            onDeactivate: onClose,
          }}
        >
          <Dialog variant="Surface">
            <Header style={{ padding: `0 ${config.space.S400}` }} variant="Surface" size="500">
              <Box grow="Yes">
                <Text size="H4">Reset All Push Notifications</Text>
              </Box>
              <IconButton size="300" radii="300" onClick={onClose} disabled={isLoading}>
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text>
                This will remove push notifications from all your sessions and devices. This action
                cannot be undone. Are you sure you want to continue?
              </Text>
              <Box direction="Column" gap="200" style={{ paddingTop: config.space.S200 }}>
                <Button
                  variant="Critical"
                  fill="Solid"
                  onClick={onConfirm}
                  disabled={isLoading}
                  before={isLoading && <Spinner size="100" variant="Critical" />}
                >
                  <Text size="B400">Reset All</Text>
                </Button>
                <Button variant="Secondary" fill="Soft" onClick={onClose} disabled={isLoading}>
                  <Text size="B400">Cancel</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

function DeregisterAllPushersSetting() {
  const mx = useMatrixClient();
  const [deregister, deregisterState] = useAsyncCallback(deRegisterAllPushers, []);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleOpenConfirmDialog = () => {
    setIsConfirming(true);
  };

  const handleCloseConfirmDialog = () => {
    if (deregisterState.status === AsyncStatus.Loading) return;
    setIsConfirming(false);
  };

  const handleConfirmDeregister = async () => {
    await deRegisterAllPushers(mx);
    setIsConfirming(false);
  };

  return (
    <>
      {isConfirming && (
        <ConfirmDeregisterDialog
          onClose={handleCloseConfirmDialog}
          onConfirm={handleConfirmDeregister}
          isLoading={deregisterState.status === AsyncStatus.Loading}
        />
      )}

      <SettingTile
        title="Reset all push notifications"
        description={
          <div>
            <Text>
              This will remove push notifications from all your sessions/devices. You will need to
              re-enable them on each device individually.
            </Text>
            {deregisterState.status === AsyncStatus.Error && (
              <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                <br />
                Failed to deregister devices. Please try again.
              </Text>
            )}
            {deregisterState.status === AsyncStatus.Success && (
              <Text as="span" style={{ color: color.Success.Main }} size="T200">
                <br />
                Successfully deregistered all devices.
              </Text>
            )}
          </div>
        }
        after={
          <Button size="300" radii="300" onClick={handleOpenConfirmDialog}>
            <Text size="B300" style={{ color: color.Critical.Main }}>
              Reset All
            </Text>
          </Button>
        }
      />
    </>
  );
}

export function SystemNotification() {
  const [showInAppNotifs, setShowInAppNotifs] = useSetting(settingsAtom, 'showNotifications');
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">System & Notifications</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <WebPushNotificationSetting />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="In-App Notifications"
          description="Show a notification when a message arrives while the app is open (but not focused on the room)."
          after={<Switch value={showInAppNotifs} onChange={setShowInAppNotifs} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Notification Sound"
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
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <DeregisterAllPushersSetting />
      </SequenceCard>
    </Box>
  );
}
