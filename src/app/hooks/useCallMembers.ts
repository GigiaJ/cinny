/*import { MatrixClient } from 'matrix-js-sdk';
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useEffect, useState } from 'react';

export const useCallMembers = (
  mx: MatrixClient,
  mxr: MatrixRTCSession,
  roomId: string
): CallMembership[] => {
  const [memberships, setMemberships] = useState<CallMembership[]>([]);

  useEffect(() => {
    const room = mx.getRoom(roomId);

    const updateMemberships = () => {
      if (!room?.isCallRoom()) return;
      setMemberships(MatrixRTCSession.callMembershipsForRoom(room));
      //setMemberships(mxr.memberships);
      //console.log('MEMBERSHIPS:');
      //console.log(memberships);
    };

    updateMemberships();

    mxr.on(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    return () => {
      mxr.removeListener(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    };
  }, [mx, mxr, roomId]);

  return memberships;
};*/

// TEMPORARY
import { MatrixClient, MatrixEvent, RoomStateEvent } from 'matrix-js-sdk';
import { useEffect, useMemo, useState } from 'react';
import { getStateEvents } from '../utils/room';
import { StateEvent } from '../../types/matrix/room';

export const useCallMembers = (mx: MatrixClient, roomId: string): string[] => {
  const [events, setEvents] = useState<MatrixEvent[]>([]);

  useEffect(() => {
    const room = mx.getRoom(roomId);

    const updateEvents = (event?: MatrixEvent) => {
      if (!room?.isCallRoom() || (event && event.getRoomId() !== roomId)) return;
      setEvents(getStateEvents(room, StateEvent.GroupCallMemberPrefix));
    };

    updateEvents();

    mx.on(RoomStateEvent.Events, updateEvents);
    return () => {
      mx.removeListener(RoomStateEvent.Events, updateEvents);
    };
  }, [mx, roomId]);

  const participants = useMemo(
    () =>
      events
        .filter((ev) => {
          const content = ev.getContent();
          return (
            content &&
            ev.getSender() &&
            content.expires &&
            ev.getTs() + content.expires > Date.now()
          );
        })
        /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
        .map((ev) => ev.getSender()!),
    [events]
  );

  return participants;
};
