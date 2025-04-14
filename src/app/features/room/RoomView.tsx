import React, { useCallback, useRef, useEffect } from 'react';
import { Box, Text, config } from 'folds'; // Assuming 'folds' is a UI library
import { EventType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import { ClientWidgetApi } from 'matrix-widget-api';
import { logger } from 'matrix-js-sdk/lib/logger';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import { usePowerLevelsAPI, usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useEditor } from '../../components/editor';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { RoomTimeline } from './RoomTimeline';
import { RoomViewTyping } from './RoomViewTyping';
import { RoomTombstone } from './RoomTombstone';
import { RoomInput } from './RoomInput';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import { Page } from '../../components/page';
import { RoomViewHeader } from './RoomViewHeader';
import { useKeyDown } from '../../hooks/useKeyDown';
import { editableActiveElement } from '../../utils/dom';
import navigation from '../../../client/state/navigation';
import { settingsAtom } from '../../state/settings';
import { useSetting } from '../../state/hooks/settings';
import { useAccessibleTagColors, usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useTheme } from '../../hooks/useTheme';
import { createVirtualWidget, Edget, getWidgetData, getWidgetUrl } from './SmallWidget';

// --- Constants ---
const FN_KEYS_REGEX = /^F\d+$/;

// --- Helper Functions ---

/**
 * Determines if a keyboard event should trigger focusing the message input field.
 * @param evt - The KeyboardEvent.
 * @returns True if the input should be focused, false otherwise.
 */
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
  const { code } = evt;
  // Ignore if modifier keys are pressed
  if (evt.metaKey || evt.altKey || evt.ctrlKey) {
    return false;
  }

  // Ignore function keys (F1, F2, etc.)
  if (FN_KEYS_REGEX.test(code)) return false;

  // Ignore specific control/navigation keys
  if (
    code.startsWith('OS') ||
    code.startsWith('Meta') ||
    code.startsWith('Shift') ||
    code.startsWith('Alt') ||
    code.startsWith('Control') ||
    code.startsWith('Arrow') ||
    code.startsWith('Page') ||
    code.startsWith('End') ||
    code.startsWith('Home') ||
    code === 'Tab' ||
    code === 'Space' || // Allow space if needed elsewhere, but not for focusing input
    code === 'Enter' || // Allow enter if needed elsewhere
    code === 'NumLock' ||
    code === 'ScrollLock'
  ) {
    return false;
  }

  // If none of the above conditions met, it's likely a character key
  return true;
};

// --- RoomView Component ---

export function RoomView({ room, eventId }: { room: Room; eventId?: string }) {
  // Refs
  const roomInputRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null); // Ref for the main Page container
  const iframeRef = useRef<HTMLIFrameElement>(null); // Ref for the iframe element
  const widgetApiRef = useRef<ClientWidgetApi | null>(null); // Ref to store the widget API instance
  const edgetRef = useRef<Edget | null>(null); // Ref to store the Edget instance

  // State & Hooks
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const { roomId } = room;
  const editor = useEditor();
  const mx = useMatrixClient();
  const tombstoneEvent = useStateEvent(room, StateEvent.RoomTombstone);
  const powerLevels = usePowerLevelsContext();
  const { getPowerLevel, canSendEvent } = usePowerLevelsAPI(powerLevels);
  const myUserId = mx.getUserId();
  const canMessage = myUserId
    ? canSendEvent(EventType.RoomMessage, getPowerLevel(myUserId))
    : false;
  const [powerLevelTags, getPowerLevelTag] = usePowerLevelTags(room, powerLevels);
  const theme = useTheme();
  const accessibleTagColors = useAccessibleTagColors(theme.kind, powerLevelTags);
  const isCall = room.isCallRoom(); // Determine if it's a call room

  // Effect for focusing input on key press (for non-call rooms)
  useKeyDown(
    window,
    useCallback(
      (evt) => {
        // Don't focus if an editable element already has focus
        if (editableActiveElement()) return;
        // Don't focus if a modal is likely open
        if (document.querySelector('.ReactModalPortal > *') || navigation.isRawModalVisible) {
          return;
        }
        // Don't focus if in a call view (no text editor)
        if (isCall) return;

        // Check if the key pressed should trigger focus or is paste hotkey
        if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
          if (editor) {
            ReactEditor.focus(editor);
          }
        }
      },
      [editor, isCall] // Dependencies
    )
  );

  // Effect to setup and cleanup the widget API for call rooms
  useEffect(() => {
    // Only run if it's a call room
    if (isCall) {
      const iframeElement = iframeRef.current;
      // Ensure iframe element exists before proceeding
      if (!iframeElement) {
        logger.warn(`Iframe element not found for room ${roomId}, cannot initialize widget.`);
        return;
      }

      logger.info(`Setting up Element Call widget for room ${roomId}`);
      const userId = mx.getUserId() ?? ''; // Ensure userId is not null
      const url = getWidgetUrl(mx, roomId); // Generate the widget URL

      // 1. Create the virtual widget definition
      const app = createVirtualWidget(
        mx,
        `element-call-${roomId}`,
        userId,
        'Element Call',
        'm.call', // Widget type
        url,
        false, // waitForIframeLoad - false as we manually control src loading
        getWidgetData(
          // Widget data
          mx,
          roomId,
          {}, // Initial data (can be fetched if needed)
          {
            // Overwrite/specific data
            skipLobby: true, // Example configuration
            preload: false, // Set preload based on whether you want background loading
            returnToLobby: false, // Example configuration
          }
        ),
        roomId
      );

      // 2. Instantiate Edget to manage widget communication
      const edget = new Edget(app);
      edgetRef.current = edget; // Store instance in ref

      // 3. Start the widget messaging *before* setting the iframe src
      try {
        const widgetApi = edget.startMessaging(iframeElement);
        widgetApiRef.current = widgetApi; // Store API instance

        // Listen for the 'ready' event from the widget API
        widgetApi.once('ready', () => {
          logger.info(`Element Call widget is ready for room ${roomId}.`);
          // Perform actions needed once the widget confirms it's ready
          // Example: widgetApi.transport.send("action", { data: "..." });
        });

        widgetApi.on('action:im.vector.hangup', () => {
          logger.info(`Received hangup action from widget in room ${roomId}.`);
          // Handle hangup logic (e.g., navigate away, update room state)
        });

        // Add other necessary event listeners from the widget API
        // widgetApi.on("action:some_other_action", (ev) => { ... });

        // 4. Set the iframe src *after* messaging is initialized
        logger.info(`Setting iframe src for room ${roomId}: ${url.toString()}`);
        iframeElement.src = url.toString();
      } catch (error) {
        logger.error(`Error initializing widget messaging for room ${roomId}:`, error);
        // Handle initialization error (e.g., show an error message to the user)
      }

      // 5. Return cleanup function
      return () => {
        logger.info(`Cleaning up Element Call widget for room ${roomId}`);
        // Stop messaging and clean up resources
        if (edgetRef.current) {
          edgetRef.current.stopMessaging();
          edgetRef.current = null;
        }
        widgetApiRef.current = null; // Clear API ref

        // Clear iframe src to stop activity and free resources
        if (iframeRef.current) {
          iframeRef.current.src = 'about:blank';
          logger.info(`Cleared iframe src for room ${roomId}`);
        }
      };
    } else {
      // If not a call room, ensure any previous call state is cleaned up
      // (This might be redundant if component unmounts/remounts correctly, but safe)
      if (widgetApiRef.current && iframeRef.current) {
        logger.info(`Room ${roomId} is no longer a call room, ensuring cleanup.`);
        if (edgetRef.current) {
          edgetRef.current.stopMessaging();
          edgetRef.current = null;
        }
        widgetApiRef.current = null;
        iframeRef.current.src = 'about:blank';
      }
    }

    // Explicitly return undefined if not a call room or no cleanup needed initially
    return undefined;
  }, [isCall, mx, roomId, editor]); // Dependencies: run effect if these change

  // --- Render Logic ---

  // Render Call View
  if (isCall) {
    // Initial src is set to about:blank. The useEffect hook will set the actual src later.
    return (
      <Page
        ref={roomViewRef}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      >
        <RoomViewHeader />
        {/* Box grows to fill available space */}
        <Box grow="Yes" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <iframe
            ref={iframeRef}
            src="about:blank" // Start with a blank page
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title={`Element Call - ${room.name || roomId}`}
            // Sandbox attributes for security. Adjust as needed by Element Call.
            //sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
            // Permissions policy for features like camera, microphone.
            allow="microphone; camera; display-capture; autoplay; clipboard-write;"
          />
        </Box>
        {/* Optional: Minimal footer or status indicators */}
      </Page>
    );
  }

  // Render Standard Text/Timeline Room View
  return (
    <Page ref={roomViewRef}>
      <RoomViewHeader />
      {/* Main timeline area */}
      <Box grow="Yes" direction="Column" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <RoomTimeline
          key={roomId} // Key helps React reset state when room changes
          room={room}
          eventId={eventId}
          roomInputRef={roomInputRef}
          editor={editor}
          getPowerLevelTag={getPowerLevelTag}
          accessibleTagColors={accessibleTagColors}
        />
        <RoomViewTyping room={room} />
      </Box>
      {/* Input area and potentially other footer elements */}
      <Box shrink="No" direction="Column">
        <div style={{ padding: `0 ${config.space.S400}` }}>
          {' '}
          {/* Use theme spacing */}
          {tombstoneEvent ? (
            <RoomTombstone
              roomId={roomId}
              body={tombstoneEvent.getContent().body}
              replacementRoomId={tombstoneEvent.getContent().replacement_room}
            />
          ) : (
            <>
              {canMessage ? (
                <RoomInput
                  room={room}
                  editor={editor}
                  roomId={roomId}
                  fileDropContainerRef={roomViewRef} // Pass the Page ref for file drops
                  ref={roomInputRef}
                  getPowerLevelTag={getPowerLevelTag}
                  accessibleTagColors={accessibleTagColors}
                />
              ) : (
                <RoomInputPlaceholder
                  style={{ padding: config.space.S200 }}
                  alignItems="Center"
                  justifyContent="Center"
                >
                  <Text align="Center">You do not have permission to post in this room</Text>
                </RoomInputPlaceholder>
              )}
            </>
          )}
        </div>
        {/* Following/Activity Feed */}
        {hideActivity ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
      </Box>
    </Page>
  );
}
