import React, { ReactNode } from "react";
import { useSelectedRoom } from "../../hooks/router/useSelectedRoom";
import { useMatrixClient } from "../../hooks/useMatrixClient";
import { PowerLevelsContextProvider, usePowerLevels } from "../../hooks/usePowerLevels";
import { RouteSpaceProvider, SpaceRouteRoomProvider } from "../client/space";



type PowerLevelsContainerProps = {
  children: ReactNode;
};
export function PowerLevelsContainer({ children }: PowerLevelsContainerProps) {

  const mx = useMatrixClient();
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);
  const powerLevels = usePowerLevels(room ?? null);


    return (
                    <PowerLevelsContextProvider value={powerLevels}>
            <RouteSpaceProvider>
              <SpaceRouteRoomProvider>
              { children }
              </SpaceRouteRoomProvider>
            </RouteSpaceProvider>
                        </PowerLevelsContextProvider>
    );
}