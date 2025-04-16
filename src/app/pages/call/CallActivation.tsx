import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom'; // Or your router's equivalent hook
import { logger } from 'matrix-js-sdk/lib/logger';

import { useCallState } from '../client/CallProvider'; // Adjust path if needed
import { useMatrixClient } from '../../hooks/useMatrixClient'; // Adjust path if needed

// Helper function (replace with your actual implementation)
// This function determines if a room ID corresponds to a call/voice channel
const isRoomVoiceChannel = (roomId: string, mx: ReturnType<typeof useMatrixClient>): boolean => {
  if (!mx) return false;
  const room = mx.getRoom(roomId);
  // Example check - use your specific logic (e.g., checking room type, state events)
  return room?.isCallRoom?.() ?? false;
};

/**
 * This component runs an effect to automatically activate the call state
 * when the user navigates to a room designated as a call/voice channel.
 */
export function CallActivationEffect() {
  // Get the currently viewed room ID from the router
  const { roomIdOrAlias: viewedRoomId } = useParams<{ roomIdOrAlias: string }>();
  // Get the call state and setter from context
  const { activeCallRoomId, setActiveCallRoomId } = useCallState();
  // Get the Matrix client instance
  const mx = useMatrixClient();

  useEffect(() => {
    // Ensure we have the necessary data to proceed
    if (!viewedRoomId || !mx) {
      logger.error('CallActivationEffect: Missing viewedRoomId or MatrixClient.');
      return;
    }

    // Check if the currently viewed room is a voice/call channel
    const isViewingCallChannel = isRoomVoiceChannel(viewedRoomId, mx);

    if (isViewingCallChannel) {
      // If the user is viewing a call channel and it's not already the
      // one active in the persistent container, activate it.
      if (viewedRoomId !== activeCallRoomId) {
        logger.info(`CallActivationEffect: Auto-activating call for viewed room: ${viewedRoomId}`);
        setActiveCallRoomId(viewedRoomId);
      } else {
        logger.debug(
          `CallActivationEffect: Viewed room ${viewedRoomId} is already the active call.`
        );
      }
    }
    // No 'else' block needed here if we want the call to persist when navigating
    // to a non-call room. If you wanted to auto-hangup on navigating away,
    // you would add: else if (activeCallRoomId === viewedRoomId) { setActiveCallRoomId(null); }
  }, [viewedRoomId, activeCallRoomId, setActiveCallRoomId, mx]); // Effect dependencies

  // This component doesn't render any UI itself
  return null;
}
