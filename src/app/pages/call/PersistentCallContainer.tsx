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
import { PowerLevelsContextProvider, usePowerLevels } from '../../hooks/usePowerLevels';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useClientConfig } from '../../hooks/useClientConfig';
import { RoomView } from '../../features/room/RoomView';
import { useParams } from 'react-router-dom';

interface PersistentCallContainerProps {
  isVisible: boolean;
}

export function PersistentCallContainer({ isVisible }: PersistentCallContainerProps) {
  const { activeCallRoomId, setActiveCallRoomId, registerActiveTransport } = useCallState();
  const { eventId } = useParams();
  const mx = useMatrixClient();
  const roomId = useSelectedRoom();
  const clientConfig = useClientConfig();
  const room = mx.getRoom(roomId);
  const powerLevels = usePowerLevels(room ?? null);

  logger.info(room);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetApiRef = useRef<ClientWidgetApi | null>(null);
  const smallWidgetRef = useRef<SmallWidget | null>(null);

  useEffect(() => {
    const cleanupRoomId = smallWidgetRef.current?.roomId;
    logger.debug(`PersistentCallContainer effect running. activeCallRoomId: ${activeCallRoomId}`);

    /**
     * TODO:
     * Need proper shutdown handling. Events from the previous widget can still come through it seems. Might need
     * to queue the events and then allow the join to actually occur. This will *work* for now as it does handle switching technically.
     * Need to look closer at it.
     *
     * Might also be able to keep the iframe alive and instead navigate to a new "room" to make the transition smoother
     */
    const cleanup = () => {
      logger.error(`PersistentCallContainer: Cleaning up for previous room: ${cleanupRoomId}`);

      if (smallWidgetRef.current) {
        // smallWidgetRef.current.stopMessaging();
      }
      // Potentially call widgetApi.stop() or similar if the API instance has it
      if (widgetApiRef.current) {
        // widgetApiRef.current.stop?.();
      }
      widgetApiRef.current = null;
      smallWidgetRef.current = null;
      if (iframeRef.current) iframeRef.current.src = 'about:blank';
    };

    if (activeCallRoomId && mx?.getUserId()) {
      if (cleanupRoomId !== activeCallRoomId) {
        const newUrl = getWidgetUrl(mx, roomId, clientConfig.elementCallUrl ?? '');

        if (iframeRef.current && iframeRef.current.src !== newUrl.toString()) {
          logger.info(
            `PersistentCallContainer: Updating iframe src for ${activeCallRoomId} to ${newUrl.toString()}`
          );
          cleanup();
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

        logger.debug(
          `PersistentCallContainer: Creating new SmallWidget/API for ${activeCallRoomId}`
        );
        const smallWidget = new SmallWidget(app);
        smallWidgetRef.current = smallWidget;

        try {
          const widgetApiInstance = smallWidget.startMessaging(iframeElement);
          widgetApiRef.current = widgetApiInstance;
          registerActiveTransport(activeCallRoomId, widgetApiRef.current.transport);
          widgetApiInstance.once('ready', () => {
            logger.info(`PersistentCallContainer: Widget for ${activeCallRoomId} is ready.`);
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
    }

    return cleanup;
  }, [activeCallRoomId, mx, setActiveCallRoomId]);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: isVisible ? 'flex' : 'none',
    flexDirection: 'row',
  };

  return (
    <Page style={containerStyle}>
      <Box direction="Row" grow="Yes" style={{ height: '100%', width: '100%' }}>
        {activeCallRoomId && roomId && (
          <Box
            shrink="No"
            style={{
              height: '100%',
              overflowY: 'auto',
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
          direction="Column"
          style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}
        >
          {activeCallRoomId && roomId && (
            <Box direction="Column" style={{ width: '100%' }}>
              <PowerLevelsContextProvider value={powerLevels}>
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
        <Box direction="Column" style={{ position: 'relative' }}>
          {activeCallRoomId && roomId !== null && (
            <PowerLevelsContextProvider value={powerLevels}>
              <RouteSpaceProvider>
                <SpaceRouteRoomProvider>
                  <RoomView room={room} eventId={eventId} />
                </SpaceRouteRoomProvider>
              </RouteSpaceProvider>
            </PowerLevelsContextProvider>
          )}
        </Box>
      </Box>
    </Page>
  );
}
