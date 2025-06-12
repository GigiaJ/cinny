import React, { MouseEventHandler, ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HttpApiEvent, HttpApiEventHandlerMap, MatrixClient } from 'matrix-js-sdk';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import {
  clearCacheAndReload,
  clearLoginData,
  initClient,
  logoutClient,
  startClient,
} from '../../../client/initMatrix';
import { getSecret } from '../../../client/state/auth';
import { useAsyncCallback, AsyncStatus } from '../../hooks/useAsyncCallback';
import { useSyncState } from '../../hooks/useSyncState';
import { getHomePath } from '../pathUtils';
import { SplashScreen } from '../../components/splash-screen';
import { CapabilitiesAndMediaConfigLoader } from '../../components/CapabilitiesAndMediaConfigLoader';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import { MediaConfigProvider } from '../../hooks/useMediaConfig';
import { AuthLayout, Login } from '../auth';
import { SyncStatus } from './SyncStatus';
import Windows from '../../organisms/pw/Windows';
import Dialogs from '../../organisms/pw/Dialogs';
import ReusableContextMenu from '../../atoms/context-menu/ReusableContextMenu';
import { SpecVersions } from './SpecVersions';
import { RoomSettingsRenderer } from '../../features/room-settings';
import { SpaceSettingsRenderer } from '../../features/space-settings';
import { ReceiveSelfDeviceVerification } from '../../components/DeviceVerification';
import { AutoRestoreBackupOnVerification } from '../../components/BackupRestore';
import { stopPropagation } from '../../utils/keyboard';

function ClientRootLoading() {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text>Heating up</Text>
      </Box>
    </SplashScreen>
  );
}

function ClientRootOptions({ mx }: { mx?: MatrixClient }) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleToggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => (currentState ? undefined : cords));
  };

  return (
    <IconButton
      style={{ position: 'absolute', top: config.space.S100, right: config.space.S100 }}
      variant="Background"
      fill="None"
      onClick={handleToggle}
    >
      <Icon size="200" src={Icons.VerticalDots} />
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {mx && (
                  <MenuItem onClick={() => clearCacheAndReload(mx)} size="300" radii="300">
                    <Text as="span" size="T300" truncate>
                      Clear Cache and Reload
                    </Text>
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    if (mx) {
                      logoutClient(mx);
                    } else {
                      clearLoginData();
                    }
                  }}
                  size="300"
                  radii="300"
                  variant="Critical"
                  fill="None"
                >
                  <Text as="span" size="T300" truncate>
                    Logout
                  </Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </IconButton>
  );
}

const useLogoutListener = (mx?: MatrixClient) => {
  useEffect(() => {
    if (!mx) return;
    const handleLogout: HttpApiEventHandlerMap[HttpApiEvent.SessionLoggedOut] = async () => {
      mx.stopClient();
      await mx.clearStores();
      window.localStorage.clear();
      window.location.reload();
    };
    mx?.on(HttpApiEvent.SessionLoggedOut, handleLogout);
    return () => {
      mx?.removeListener(HttpApiEvent.SessionLoggedOut, handleLogout);
    };
  }, [mx]);
};

type ClientRootProps = {
  children: ReactNode;
};
export function ClientRoot({ children }: ClientRootProps) {
  const [loading, setLoading] = useState(true);
  const { baseUrl } = getSecret();

  const [loadState, loadMatrix] = useAsyncCallback<MatrixClient, Error, []>(
    useCallback(() => initClient(getSecret() as any), [])
  );
  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;
  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback((m) => startClient(m), [])
  );

  useLogoutListener(mx);

  useEffect(() => {
    if (loadState.status === AsyncStatus.Idle) {
      loadMatrix();
    }
  }, [loadState, loadMatrix]);

  useEffect(() => {
    if (mx && !mx.clientRunning) {
      startMatrix(mx);
    }
  }, [mx, startMatrix]);

  useSyncState(
    mx,
    useCallback((state) => {
      if (state === 'PREPARED') {
        setLoading(false);
      }
    }, [])
  );

  return (
    <SpecVersions baseUrl={baseUrl!}>
      {mx && <SyncStatus mx={mx} />}
      {loading && <ClientRootOptions mx={mx} />}
      {(loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error) && (
        <SplashScreen>
          <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
            <Dialog>
              <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                {loadState.status === AsyncStatus.Error && (
                  <Text>{`Failed to load. ${loadState.error.message}`}</Text>
                )}
                {startState.status === AsyncStatus.Error && (
                  <Text>{`Failed to start. ${startState.error.message}`}</Text>
                )}
                <Button variant="Critical" onClick={mx ? () => startMatrix(mx) : loadMatrix}>
                  <Text as="span" size="B400">
                    Retry
                  </Text>
                </Button>
              </Box>
            </Dialog>
          </Box>
        </SplashScreen>
      )}
      {loading || !mx ? (
        <ClientRootLoading />
      ) : (
        <MatrixClientProvider value={mx}>
          <CapabilitiesAndMediaConfigLoader>
            {(capabilities, mediaConfig) => (
              <CapabilitiesProvider value={capabilities ?? {}}>
                <MediaConfigProvider value={mediaConfig ?? {}}>
                  {children}
                  <Windows />
                  <Dialogs />
                  <ReusableContextMenu />
                </MediaConfigProvider>
              </CapabilitiesProvider>
            )}
          </CapabilitiesAndMediaConfigLoader>
        </MatrixClientProvider>
      )}
    </SpecVersions>
  );
}
