import React, { useEffect, useRef, useMemo } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';
import { ClientWidgetApi, IWidgetApiRequest, MatrixCapabilities } from 'matrix-widget-api'; // Assuming imports

// --- Required Imports (Adjust paths as needed) ---
import { useCallState } from '../client/CallProvider';
import {
  createVirtualWidget,
  Edget,
  getWidgetData,
  getWidgetUrl,
} from '../../features/room/SmallWidget';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { RoomViewHeader } from '../../features/room/RoomViewHeader';
import { PowerLevelsContextProvider, usePowerLevels } from '../../hooks/usePowerLevels';
import { Box } from 'folds';
import { IsDirectRoomProvider, RoomProvider, useRoom } from '../../hooks/useRoom';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { Page, PageRoot } from '../../components/page';
import { RouteSpaceProvider, Space, SpaceRouteRoomProvider } from '../client/space';
import { MobileFriendlyPageNav } from '../MobileFriendly';
import { SPACE_PATH } from '../paths';
import { SpaceProvider } from '../../hooks/useSpace';
import { useSelectedSpace } from '../../hooks/router/useSelectedSpace';
import { useAtomValue } from 'jotai';
import { mDirectAtom } from '../../state/mDirectList';

// --- Component Props ---
interface PersistentCallContainerProps {
  isVisible: boolean; // Prop passed from parent to control display
}

// --- PersistentCallContainer Component ---

export function PersistentCallContainer({ isVisible }: PersistentCallContainerProps) {
  // Global state access
  const { activeCallRoomId, setActiveCallRoomId } = useCallState(); // Get setter for hangup action
  const mx = useMatrixClient();

  // Refs
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetApiRef = useRef<ClientWidgetApi | null>(null);
  const edgetRef = useRef<Edget | null>(null);

  // Effect to manage iframe src and Widget API lifecycle based SOLELY on activeCallRoomId
  useEffect(() => {
    // Store the room ID associated with the current Edget instance for clearer cleanup logging
    const cleanupRoomId = edgetRef.current?.roomId;
    logger.debug(`PersistentCallContainer effect running. activeCallRoomId: ${activeCallRoomId}`);

    // --- Cleanup Function ---
    // This runs BEFORE the effect runs again OR when the component unmounts.
    // Crucially, it cleans up resources associated with the *previous* activeCallRoomId.
    const cleanup = () => {
      logger.info(`PersistentCallContainer: Cleaning up for previous room: ${cleanupRoomId}`);
      if (edgetRef.current) {
        // Ensure stopMessaging handles removing listeners etc.
        edgetRef.current.stopMessaging();
      }
      // Potentially call widgetApi.stop() or similar if the API instance has it
      if (widgetApiRef.current) {
        // widgetApiRef.current.stop?.(); // Example
      }
      // Clear refs for the old instances
      widgetApiRef.current = null;
      edgetRef.current = null;
    };

    // --- Setup Logic for NEW activeCallRoomId ---
    if (activeCallRoomId && mx?.getUserId()) {
      // --- 1. Generate new URL and App definition ---
      const newUrl = getWidgetUrl(mx, activeCallRoomId); // Use activeCallRoomId
      const userId = mx.getUserId() ?? '';
      const app = createVirtualWidget(
        mx,
        `element-call-${activeCallRoomId}`, // ID based on active room
        userId,
        'Element Call',
        'm.call',
        newUrl,
        false,
        // Pass activeCallRoomId to getWidgetData
        getWidgetData(mx, activeCallRoomId, {}, { skipLobby: true /* other configs */ }),
        activeCallRoomId // Pass activeCallRoomId as the room ID for the widget context
      );

      // --- 2. Update iframe src ---
      // This triggers the iframe reload if the src is different.
      // The cleanup function from the *previous* effect run will have already cleaned up the old API connection.
      if (iframeRef.current && iframeRef.current.src !== newUrl.toString()) {
        logger.info(
          `PersistentCallContainer: Updating iframe src for ${activeCallRoomId} to ${newUrl.toString()}`
        );
        iframeRef.current.src = newUrl.toString();
      } else if (iframeRef.current && !iframeRef.current.src) {
        // Handle initial load case if src starts blank
        logger.info(
          `PersistentCallContainer: Setting initial iframe src for ${activeCallRoomId} to ${newUrl.toString()}`
        );
        iframeRef.current.src = newUrl.toString();
      }

      // --- 3. Setup new Widget API connection ---
      const iframeElement = iframeRef.current;
      if (!iframeElement) {
        logger.error('PersistentCallContainer: iframeRef is null, cannot setup API.');
        return cleanup; // Should not happen if iframe is always rendered
      }

      // Create and store new Edget instance
      logger.debug(`PersistentCallContainer: Creating new Edget/API for ${activeCallRoomId}`);
      const edget = new Edget(app);
      edgetRef.current = edget; // Store ref to new instance

      try {
        const widgetApiInstance = edget.startMessaging(iframeElement);
        widgetApiRef.current = widgetApiInstance; // Store ref to new instance

        // --- 4. Add necessary listeners to the NEW widgetApiInstance ---
        widgetApiInstance.once('ready', () => {
          logger.info(`PersistentCallContainer: Widget for ${activeCallRoomId} is ready.`);
        });

        // Example listener for read_events (adjust as needed)
        widgetApiInstance.on(
          'action:org.matrix.msc2876.read_events',
          (ev: CustomEvent<IWidgetApiRequest>) => {
            logger.info(`PersistentCallContainer: Widget requested 'read_events':`, ev.detail.data);
            ev.preventDefault(); // Prevent default driver handling
            // Use the current widgetApiRef to reply
            widgetApiRef.current?.transport?.reply(ev.detail, { approved: true });
          }
        );

        // Listener for hangup action from the widget
        widgetApiInstance.on('action:im.vector.hangup', () => {
          logger.info(
            `PersistentCallContainer: Received hangup action from widget in room ${activeCallRoomId}.`
          );
          // Call the global state function to clear the active call
          // Check if we are still the active call before clearing, prevents race conditions
          if (edgetRef.current?.roomId === activeCallRoomId) {
            setActiveCallRoomId(null);
          }
        });

        // Add other listeners (TURN servers, etc.)...
      } catch (error) {
        logger.error(
          `PersistentCallContainer: Error initializing widget messaging for ${activeCallRoomId}:`,
          error
        );
        // Cleanup immediately if setup fails
        cleanup();
      }
    } else {
      // --- No active call ---
      // Ensure src is blank and perform cleanup for any previous instance
      if (iframeRef.current && iframeRef.current.src !== 'about:blank') {
        logger.info('PersistentCallContainer: No active call, setting src to about:blank');
        iframeRef.current.src = 'about:blank';
      }
      // Run cleanup in case an instance was active before becoming null
      cleanup();
    }

    // Return the cleanup function to be executed when dependencies change or component unmounts
    return cleanup;

    // CRITICAL Dependencies: This effect manages the lifecycle based on the active call ID
  }, [activeCallRoomId, mx, setActiveCallRoomId]);

  // --- Render ---
  // Apply conditional styling based on the isVisible prop passed by the parent
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    // --- Visibility Control ---
    top: '1',
    left: '1',
    display: isVisible ? 'flex' : 'none', // Use flex/block as appropriate for your layout
    flexDirection: 'row',
    //overflow: 'hidden',
  };
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);
  const selectedSpaceId = useSelectedSpace();
  const space = mx.getRoom(selectedSpaceId);
  const mDirects = useAtomValue(mDirectAtom);
  const powerLevels = usePowerLevels(room);

  // Assuming necessary imports: React, Box, Page, PageRoot, MobileFriendlyPageNav,
  // Space, RoomViewHeader, iframeRef, PowerLevelsContextProvider,
  // RouteSpaceProvider, SpaceRouteRoomProvider, SPACE_PATH, powerLevels, containerStyle

  return (
    // Outer container div controlled by parent via isVisible prop
    <div style={containerStyle}>
      {/* Context provider(s) needed by components inside */}
      {/* Pass actual powerLevels if required */}
      <PowerLevelsContextProvider value={powerLevels}>
        {/* Route/Space specific context providers MUST wrap both Space and Header */}
        <RouteSpaceProvider>
          <SpaceRouteRoomProvider>
            {/* Main layout container inside providers: Flex Row */}
            {/* Assuming Box handles flex layout */}
            <Box direction="Row" grow="Yes" style={{ height: '100%', width: '100%' }}>
              {/* --- Left Side (Nav/Space) --- */}
              <Box
                shrink="No"
                style={{
                  width: '250px',
                  height: '100%',
                  overflowY: 'auto',
                  borderRight: '1px solid #ccc',
                }}
              >
                {' '}
                {/* Example style */}
                {/* PageRoot likely renders the nav prop */}
                <PageRoot
                  nav={
                    <MobileFriendlyPageNav path={SPACE_PATH}>
                      {/* Space component requires the providers above */}
                      <Space />
                    </MobileFriendlyPageNav>
                  }
                />
              </Box>
              {/* --- Right Side (Header + Iframe) --- */}
              {/* This Box takes remaining space and arranges header/iframe vertically */}
              <Box
                grow="Yes"
                direction="Column"
                style={{ height: '100%', width: '100%', overflow: 'hidden' }}
              >
                {/* Header Area */}
                <Box grow="No">
                  {' '}
                  {/* Header doesn't grow/shrink */}
                  {/* RoomViewHeader requires the providers above */}
                  <RoomViewHeader />
                </Box>

                {/* Iframe Area (takes remaining space) */}
                <Box grow="Yes" style={{ position: 'relative' }}>
                  {' '}
                  {/* Use relative positioning for absolute child */}
                  <iframe
                    ref={iframeRef}
                    style={{
                      // Use absolute positioning to fill the parent Box
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
                    src="about:blank" // useEffect sets the correct src
                  />
                </Box>
              </Box>{' '}
              {/* End Right Side Box */}
            </Box>{' '}
            {/* End Main Layout Box (Row) */}
          </SpaceRouteRoomProvider>
        </RouteSpaceProvider>
      </PowerLevelsContextProvider>
    </div> // End Outer Container Div
  );
}
