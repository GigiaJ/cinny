import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useRoomNavigate } from "../../hooks/useRoomNavigate";

export function ToRoomEvent() {
  const { room_id, event_id } = useParams();
  const { navigateRoom } = useRoomNavigate();

  useEffect(() => {
    if (!room_id) { return; }

    navigateRoom(room_id, event_id);
  }, [room_id, event_id, navigateRoom]);

  return null;
}
