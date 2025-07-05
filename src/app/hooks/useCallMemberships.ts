import { MatrixClient } from 'matrix-js-sdk';
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useEffect, useState } from 'react';

export const useCallMembers = (mx: MatrixClient, roomId: string): CallMembership[] => {
  const [memberships, setMemberships] = useState<CallMembership[]>([]);
  const room = mx.getRoom(roomId);
  const mxr = mx.matrixRTC.getRoomSession(room);
  useEffect(() => {
    const updateMemberships = () => {
      if (!room?.isCallRoom()) return;
      setMemberships(MatrixRTCSession.callMembershipsForRoom(room));
    };

    updateMemberships();

    mxr.on(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    return () => {
      mxr.removeListener(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    };
  }, [mx, mxr, room, roomId]);

  return memberships;
};
