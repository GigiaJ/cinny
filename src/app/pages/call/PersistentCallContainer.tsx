import React, { useEffect, useRef } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';
import { ClientWidgetApi, IWidgetApiRequest } from 'matrix-widget-api';
import { Box } from 'folds';
import { useCallState } from '../client/CallProvider';
import {
  createVirtualWidget,
  SmallWidget,
  getWidgetData,
  getWidgetUrl,
} from '../../features/room/SmallWidget';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { RoomViewHeader } from '../../features/room/RoomViewHeader';
import { Page, PageRoot } from '../../components/page';
import { RouteSpaceProvider, Space, SpaceRouteRoomProvider } from '../client/space';
import { MobileFriendlyPageNav } from '../MobileFriendly';
import { SPACE_PATH } from '../paths';
import { PowerLevelsContextProvider } from '../../hooks/usePowerLevels';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';

interface PersistentCallContainerProps {
  isVisible: boolean;
}

export function PersistentCallContainer({ isVisible }: PersistentCallContainerProps) {
  const { activeCallRoomId, setActiveCallRoomId } = useCallState();
  const mx = useMatrixClient();
  const room = useSelectedRoom();

  logger.info(room);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetApiRef = useRef<ClientWidgetApi | null>(null);
  const smallWidgetRef = useRef<SmallWidget | null>(null);

  useEffect(() => {
    const cleanupRoomId = smallWidgetRef.current?.roomId;
    logger.debug(`PersistentCallContainer effect running. activeCallRoomId: ${activeCallRoomId}`);

    const cleanup = () => {
      logger.error(`PersistentCallContainer: Cleaning up for previous room: ${cleanupRoomId}`);
      if (smallWidgetRef.current) {
        smallWidgetRef.current.stopMessaging();
      }
      // Potentially call widgetApi.stop() or similar if the API instance has it
      if (widgetApiRef.current) {
        // widgetApiRef.current.stop?.();
      }
      widgetApiRef.current = null;
      smallWidgetRef.current = null;
    };

    if (activeCallRoomId && mx?.getUserId()) {
      const newUrl = getWidgetUrl(mx, activeCallRoomId);
      const userId = mx.getUserId() ?? '';
      const app = createVirtualWidget(
        mx,
        `element-call-${activeCallRoomId}`,
        userId,
        'Element Call',
        'm.call',
        newUrl,
        false,
        getWidgetData(mx, activeCallRoomId, {}, { skipLobby: true }),
        activeCallRoomId
      );

      if (iframeRef.current && iframeRef.current.src !== newUrl.toString()) {
        logger.info(
          `PersistentCallContainer: Updating iframe src for ${activeCallRoomId} to ${newUrl.toString()}`
        );
        iframeRef.current.src = newUrl.toString();
      } else if (iframeRef.current && !iframeRef.current.src) {
        logger.info(
          `PersistentCallContainer: Setting initial iframe src for ${activeCallRoomId} to ${newUrl.toString()}`
        );
        iframeRef.current.src = newUrl.toString();
      }

      const iframeElement = iframeRef.current;
      if (!iframeElement) {
        logger.error('PersistentCallContainer: iframeRef is null, cannot setup API.');
        return cleanup;
      }

      logger.debug(`PersistentCallContainer: Creating new SmallWidget/API for ${activeCallRoomId}`);
      const smallWidget = new SmallWidget(app);
      smallWidgetRef.current = smallWidget;

      try {
        const widgetApiInstance = smallWidget.startMessaging(iframeElement);
        widgetApiRef.current = widgetApiInstance;
        widgetApiInstance.once('ready', () => {
          logger.info(`PersistentCallContainer: Widget for ${activeCallRoomId} is ready.`);
        });

        /* Default handling seems bugged on this. Element does not need this in their driver or codebase, but
           we do. I believe down the road update_state will be used by element-call and this can be removed.
        */
        widgetApiInstance.on(
          'action:org.matrix.msc2876.read_events',
          (ev: CustomEvent<IWidgetApiRequest>) => {
            logger.info(`PersistentCallContainer: Widget requested 'read_events':`, ev.detail.data);
            ev.preventDefault();
            widgetApiRef.current?.transport?.reply(ev.detail, { approved: true });
          }
        );

        widgetApiInstance.on('action:im.vector.hangup', () => {
          logger.info(
            `PersistentCallContainer: Received hangup action from widget in room ${activeCallRoomId}.`
          );
          if (smallWidgetRef.current?.roomId === activeCallRoomId) {
            setActiveCallRoomId(null);
          }
        });
      } catch (error) {
        logger.error(
          `PersistentCallContainer: Error initializing widget messaging for ${activeCallRoomId}:`,
          error
        );
        cleanup();
      }
    } else {
      if (iframeRef.current && iframeRef.current.src !== 'about:blank') {
        logger.info('PersistentCallContainer: No active call, setting src to about:blank');
        iframeRef.current.src = 'about:blank';
      }
      cleanup();
    }
    return cleanup;
  }, [activeCallRoomId, mx, setActiveCallRoomId]);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    top: '1',
    left: '1',
    display: isVisible ? 'flex' : 'none',
    flexDirection: 'row',
  };

  return (
    <Page style={containerStyle}>
      <Box direction="Row" grow="Yes" style={{ height: '100%', width: '100%' }}>
        {activeCallRoomId && room && (
          <Box
            shrink="No"
            style={{
              width: '250px',
              height: '100%',
              overflowY: 'auto',
              borderRight: '1px solid #ccc',
            }}
          >
            <RouteSpaceProvider>
              <SpaceRouteRoomProvider>
                <PageRoot
                  nav={
                    <MobileFriendlyPageNav path={SPACE_PATH}>
                      <Space />
                    </MobileFriendlyPageNav>
                  }
                />
              </SpaceRouteRoomProvider>
            </RouteSpaceProvider>
          </Box>
        )}

        <Box
          grow="Yes"
          direction="Column"
          style={{ height: '100%', width: '100%', overflow: 'hidden' }}
        >
          {activeCallRoomId && room && (
            <Box grow="No">
              <PowerLevelsContextProvider value={null}>
                <RouteSpaceProvider>
                  <SpaceRouteRoomProvider>
                    <RoomViewHeader />
                  </SpaceRouteRoomProvider>
                </RouteSpaceProvider>
              </PowerLevelsContextProvider>
            </Box>
          )}
          <Box grow="Yes" style={{ position: 'relative' }}>
            <iframe
              ref={iframeRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title={`Persistent Element Call`}
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
              allow="microphone; camera; display-capture; autoplay; clipboard-write;"
              src="about:blank"
            />
          </Box>
        </Box>
      </Box>
    </Page>
  );
}
