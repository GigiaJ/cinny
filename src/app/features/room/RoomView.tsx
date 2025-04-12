import React, { useCallback, useRef, useEffect } from 'react'; // Added useEffect
import { Box, Text, config } from 'folds';
import { EventType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
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
import { logger } from 'matrix-js-sdk/lib/logger';
import { ClientWidgetApi, Widget, WidgetKind } from 'matrix-widget-api';
import { SmallWidgetDriver } from './SmallWidgetDriver';

const FN_KEYS_REGEX = /^F\d+$/;
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
  const { code } = evt;
  if (evt.metaKey || evt.altKey || evt.ctrlKey) {
    return false;
  }

  // do not focus on F keys
  if (FN_KEYS_REGEX.test(code)) return false;

  // do not focus on numlock/scroll lock
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
    code === 'Space' ||
    code === 'Enter' ||
    code === 'NumLock' ||
    code === 'ScrollLock'
  ) {
    return false;
  }

  return true;
};

// Keep this function to generate the URL
const getWidgetUrl = (mx, roomId) => {
  const baseUrl = window.location.href;
  const params = new URLSearchParams({
    embed: "true", // We're embedding EC within another application
    widgetId: "test",
    // Template variables are used, so that this can be configured using the  data.
    preload: "$preload", // We want it to load in the background.
    // skipLobby: "true", // Skip the lobby in case we show a lobby component of our own.
    returnToLobby: "$returnToLobby", // Returns to the lobby (instead of blank screen) when the call ends. (For video rooms)
    perParticipantE2EE: "$perParticipantE2EE",
    hideHeader: "true", // Hide the header since our room header is enough
    userId: mx.getUserId()!,
    deviceId: mx.getDeviceId()!,
    roomId: roomId,
    baseUrl: window.location.href,
    parentUrl: baseUrl,
    // lang: getCurrentLanguage().replace("_", "-"),
    // fontScale: (FontWatcher.getRootFontSize() / FontWatcher.getBrowserDefaultFontSize()).toString(),
    theme: "$org.matrix.msc2873.client_theme",
});
const replacedUrl = params.toString().replace(/%24/g, "$");
const url= 'https://elementcall.example.quest' + `#?${replacedUrl}`;
logger.error(url);
  return url;
}


export function RoomView({ room, eventId }: { room: Room; eventId?: string }) {
  const roomInputRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null); // Ref for the iframe

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

  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (editableActiveElement()) return;
        // Check modal visibility more robustly if needed
        if (document.querySelector('.ReactModalPortal > *')) { // Simple check if any modal portal has content
             if (navigation.isRawModalVisible) return; // Skip if raw modal is explicitly visible
             // Add other modal checks if necessary
        }

        if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
          // Only focus editor if not in a call view where editor isn't present
          if (!isCall && editor) {
             ReactEditor.focus(editor);
          }
        }
      },
      [editor, isCall] // Add isCall dependency
    )
  );

  // Effect to setup the widget API when the iframe is mounted for a call room
  useEffect(() => {
    let widgetApi: ClientWidgetApi | null = null;
    let driver: SmallWidgetDriver | null = null;

    // Only run setup if it's a call room and the iframe ref is available
    if (isCall && iframeRef.current) {
      const iframe = iframeRef.current;
      const url = getWidgetUrl(mx, roomId);

      // Update iframe src if necessary (though it's set in JSX, this ensures it if URL changes)
      if (iframe.src !== url) {
        iframe.src = url;
      }

      logger.info(`Setting up widget API for room ${roomId}`);

      const widget = new Widget({
        id: 'test-call-widget', // Match ID used in URL params
        creatorUserId: mx.getUserId()!,
        type: 'm.custom', // Or appropriate widget type e.g., m.video
        url: url,
        roomId: roomId, // Pass roomId if needed by Widget constructor
        waitForIframeLoad: false,
        // Add other necessary Widget properties
      });

      // Ensure driver is correctly instantiated with necessary parameters
      // The second argument `[]` might need adjustment based on SmallWidgetDriver's needs (e.g., allowed capabilities)
      driver = new SmallWidgetDriver(mx, [], widget, WidgetKind.Room, true, roomId);

      widgetApi = new ClientWidgetApi(widget, iframe, driver);
      // widgetApi.start(); // Start communication if required by your setup

      // Return a cleanup function
      return () => {
        logger.info(`Cleaning up widget API for room ${roomId}`);
        // Implement proper cleanup for ClientWidgetApi and SmallWidgetDriver
        // This might involve calling stop methods, removing listeners, etc.
        // Example: widgetApi?.stop();
        // Example: driver?.stop();
        widgetApi = null;
        driver = null;
        // Clear iframe src to stop loading/activity
        if (iframeRef.current) {
            iframeRef.current.src = 'about:blank';
        }
      };
    }

    // If it's not a call room or the iframe isn't ready, ensure no setup runs/is cleaned up
    return undefined;

  }, [isCall, mx, roomId]); // Dependencies: run effect if call status, client, or room ID changes


  // Render Call View
  if (isCall) {
    const url = getWidgetUrl(mx, roomId);
    return (
      // Attach roomViewRef here if <Page> is the main container you want to reference
      <Page ref={roomViewRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <RoomViewHeader />
        {/* Embed the iframe directly. Ensure parent has definite height or use flex grow */}
        <Box grow="Yes" style={{ overflow: 'hidden' }}> {/* Use Box with grow */}
            <iframe
              ref={iframeRef}
              src={url} // Set initial source
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={`Element Call - ${room.name || roomId}`} // Accessible title
              // Add necessary sandbox/allow attributes for WebRTC, etc.
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads"
              allow="microphone; camera; display-capture; autoplay;"
            />
        </Box>
         {/* You might want a minimal footer or status bar here */}
      </Page>
    );
  }

  // Render Standard Text/Timeline Room View
  return (
    <Page ref={roomViewRef}>
      <RoomViewHeader />
      <Box grow="Yes" direction="Column">
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
      <Box shrink="No" direction="Column">
        <div style={{ padding: `0 ${config.space.S400}` }}>
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
                  fileDropContainerRef={roomViewRef} // Pass the Page ref here if needed
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
        {hideActivity ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
      </Box>
    </Page>
  );
}