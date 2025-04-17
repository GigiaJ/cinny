import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { logger } from 'matrix-js-sdk/lib/logger';

import { useCallState } from '../client/CallProvider';
import { useMatrixClient } from '../../hooks/useMatrixClient';

export function CallActivationEffect() {
  const { roomIdOrAlias: viewedRoomId } = useParams<{ roomIdOrAlias: string }>();
  const { activeCallRoomId, setActiveCallRoomId } = useCallState();
  const mx = useMatrixClient();
  const room = mx.getRoom(viewedRoomId);

  useEffect(() => {
    if (!viewedRoomId || !mx) {
      logger.error('CallActivationEffect: Missing viewedRoomId or MatrixClient.');
      return;
    }

    const isViewingCallRoom = room?.isCallRoom?.() ?? false;

    if (isViewingCallRoom) {
      if (viewedRoomId !== activeCallRoomId) {
        logger.info(`CallActivationEffect: Auto-activating call for viewed room: ${viewedRoomId}`);
        setActiveCallRoomId(viewedRoomId);
      } else {
        logger.debug(
          `CallActivationEffect: Viewed room ${viewedRoomId} is already the active call.`
        );
      }
    }
  }, [viewedRoomId, activeCallRoomId, setActiveCallRoomId, mx, room]);

  return null;
}
