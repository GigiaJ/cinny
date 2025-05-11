import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';
import { ClientWidgetApi } from 'matrix-widget-api';
import { Box } from 'folds';
import { useParams } from 'react-router-dom';
import { useCallState } from '../client/CallProvider';
import {
  createVirtualWidget,
  SmallWidget,
  getWidgetData,
  getWidgetUrl,
} from '../../features/room/SmallWidget';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useClientConfig } from '../../hooks/useClientConfig';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

interface PersistentCallContainerProps {
  children: ReactNode;
}

export const PrimaryRefContext = createContext(null);
export const BackupRefContext = createContext(null);

export function PersistentCallContainer({ children }: PersistentCallContainerProps) {
  const primaryIframeRef = useRef<HTMLIFrameElement | null>(null);
  const primaryWidgetApiRef = useRef<ClientWidgetApi | null>(null);
  const primarySmallWidgetRef = useRef<SmallWidget | null>(null);

  const backupIframeRef = useRef<HTMLIFrameElement | null>(null);
  const backupWidgetApiRef = useRef<ClientWidgetApi | null>(null);
  const backupSmallWidgetRef = useRef<SmallWidget | null>(null);
  const {
    activeCallRoomId,
    viewedCallRoomId,
    isChatOpen,
    isCallActive,
    isPrimaryIframe,
    registerActiveClientWidgetApi,
    registerViewedClientWidgetApi,
  } = useCallState();
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const { roomIdOrAlias: viewedRoomId } = useParams();
  const isViewingActiveCall = useMemo(
    () => activeCallRoomId !== null && activeCallRoomId === viewedRoomId,
    [activeCallRoomId, viewedRoomId]
  );

  //  logger.error('RANDOM LOG RANDOM LOG RANDOM LOG\n\n\n\n\n\n');
  //  logger.error(room?.normalizedName);

  const setupWidget = useCallback(
    (widgetApiRef, smallWidgetRef, iframeRef, skipLobby) => {
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
        // logger.error(`CallContext: Cleaning up for previous room: ${cleanupRoomId}`);

        if (smallWidgetRef.current) {
          // smallWidgetRef.current.stopMessaging();
        }
        // Potentially call widgetApi.stop() or similar if the API instance has it
        if (widgetApiRef.current) {
          // widgetApiRef.current.stop?.();
        }
        // widgetApiRef.current = null;
        // smallWidgetRef.current = null;
        // if (iframeRef.current) iframeRef.current.src = 'about:blank';
      };

      if (mx?.getUserId()) {
        if (
          (isCallActive && activeCallRoomId !== viewedCallRoomId) ||
          //          &&  backupIframeRef.current && primaryIframeRef.current.src
          (cleanupRoomId !== activeCallRoomId && !isCallActive)
        ) {
          //logger.error('PersistentCallContainer Re-render');
          const roomIdToSet = skipLobby ? activeCallRoomId : viewedCallRoomId;
          const newUrl = getWidgetUrl(mx, roomIdToSet, clientConfig.elementCallUrl ?? '', {
            skipLobby: skipLobby.toString(),
            returnToLobby: 'true',
            perParticipentE2EE: 'true',
          });
          if (iframeRef.current && iframeRef.current.src !== newUrl.toString()) {
            logger.info(
              `PersistentCallContainer: Updating iframe src for ${roomIdToSet} to ${newUrl.toString()}`
            );
            cleanup();
            iframeRef.current.src = newUrl.toString();
          } else if (iframeRef.current && !iframeRef.current.src) {
            logger.info(
              `PersistentCallContainer: Setting initial iframe src for ${roomIdToSet} to ${newUrl.toString()}`
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
            `element-call-${roomIdToSet}-${Date.now()}`,
            userId,
            'Element Call',
            'm.call',
            newUrl,
            true,
            getWidgetData(mx, roomIdToSet, {}, { skipLobby: true }),
            roomIdToSet
          );

          logger.error(`PersistentCallContainer: Creating new SmallWidget/API for ${roomIdToSet}`);
          const smallWidget = new SmallWidget(app);
          smallWidgetRef.current = smallWidget;

          try {
            const widgetApiInstance = smallWidget.startMessaging(iframeElement);
            widgetApiRef.current = widgetApiInstance;
            logger.error('Pre-register');

            logger.error(`This is our check: ${skipLobby}`);
            if (skipLobby) {
              registerActiveClientWidgetApi(activeCallRoomId, widgetApiRef.current);
            } else {
              registerViewedClientWidgetApi(viewedCallRoomId, widgetApiRef.current);
              logger.error('Post view register');
            }

            widgetApiInstance.once('ready', () => {
              logger.info(`PersistentCallContainer: Widget for ${roomIdToSet} is ready.`);
            });
          } catch (error) {
            logger.error(
              `PersistentCallContainer: Error initializing widget messaging for ${roomIdToSet}:`,
              error
            );
            cleanup();
          }
        } else {
          /*
        if (iframeRef.current && iframeRef.current.src !== 'about:blank') {
          logger.info('PersistentCallContainer: No active call, setting src to about:blank');
          iframeRef.current.src = 'about:blank';
        }
          */
          cleanup();
        }
      }
      return cleanup;
    },
    [
      activeCallRoomId,
      mx,
      viewedCallRoomId,
      isCallActive,
      clientConfig.elementCallUrl,
      registerActiveClientWidgetApi,
      registerViewedClientWidgetApi,
    ]
  );

  useEffect(() => {
    logger.error(`This is our param: ${isPrimaryIframe}`);
    setupWidget(primaryWidgetApiRef, primarySmallWidgetRef, primaryIframeRef, isPrimaryIframe);
    setupWidget(backupWidgetApiRef, backupSmallWidgetRef, backupIframeRef, !isPrimaryIframe);
  }, [
    setupWidget,
    primaryWidgetApiRef,
    primarySmallWidgetRef,
    primaryIframeRef,
    backupWidgetApiRef,
    backupSmallWidgetRef,
    backupIframeRef,
    registerActiveClientWidgetApi,
    registerViewedClientWidgetApi,
    activeCallRoomId,
    viewedCallRoomId,
    isCallActive,
    isPrimaryIframe,
  ]);

  const memoizedIframeRef = useMemo(() => primaryIframeRef, [primaryIframeRef]);
  const memoizedBackupIframeRef = useMemo(() => backupIframeRef, [backupIframeRef]);

  return (
    <PrimaryRefContext.Provider value={memoizedIframeRef}>
      <BackupRefContext.Provider value={memoizedBackupIframeRef}>
        <Box grow="No">
          <Box
            direction="Column"
            style={{
              position: 'relative',
              zIndex: 0,
              display: isMobile && isChatOpen ? 'none' : 'flex',
              width: isMobile && isChatOpen ? '0%' : '100%',
              height: isMobile && isChatOpen ? '0%' : '100%',
            }}
          >
            <Box
              grow="Yes"
              style={{
                position: 'relative',
              }}
            >
              <iframe
                ref={primaryIframeRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  display: isPrimaryIframe || isViewingActiveCall ? 'flex' : 'none',
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                title={`Persistent Element Call`}
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
                allow="microphone; camera; display-capture; autoplay; clipboard-write;"
                src="about:blank"
              />
              <iframe
                ref={backupIframeRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: !isPrimaryIframe && isViewingActiveCall ? 'flex' : 'none',
                }}
                title={`Persistent Element Call`}
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
                allow="microphone; camera; display-capture; autoplay; clipboard-write;"
                src="about:blank"
              />
            </Box>
          </Box>
        </Box>
        {children}
      </BackupRefContext.Provider>
    </PrimaryRefContext.Provider>
  );
}
