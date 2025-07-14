import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useRoomNavigate } from "../../hooks/useRoomNavigate";
import { useMatrixClient } from "../../hooks/useMatrixClient";
import { useAtomValue } from "jotai";
import { roomToParentsAtom } from "../../state/room/roomToParents";
import { mDirectAtom } from "../../state/mDirectList";

export function ToRoomEvent() {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const { room_id, event_id } = useParams();
  const { navigateRoom } = useRoomNavigate();

  useEffect(() => {
    if (!room_id || !mx) { return; }
    if (!roomToParents.size || !mDirects.size) { return; }

    navigateRoom(room_id, event_id);
  }, [
    mx,
    roomToParents,
    mDirects,
    room_id,
    event_id,
    navigateRoom
  ]);

  return null;
}
