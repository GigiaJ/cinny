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
import { PersistentCallContainer } from '../../pages/call/PersistentCallContainer';
import { CallActivationEffect } from '../../pages/call/CallActivation';

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

  // --- Render Logic ---

  // Render Call View
  if (isCall) {
    return (
      <Page
        ref={roomViewRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '0%',
          overflow: 'hidden',
        }}
      >
        <RoomViewHeader />
        <CallActivationEffect />
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
