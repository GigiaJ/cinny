import React, { forwardRef, MouseEventHandler, useEffect, useMemo } from 'react';
import { MatrixError, Room } from 'matrix-js-sdk';
import { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';
import { Box, config, Text } from 'folds';
import {
  HierarchyItem,
  HierarchyItemRoom,
  HierarchyItemSpace,
  useFetchSpaceHierarchyLevel,
} from '../../hooks/useSpaceHierarchy';
import { IPowerLevels, powerLevelAPI } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { SpaceItemCard } from './SpaceItem';
import { AfterItemDropTarget, CanDropCallback } from './DnD';
import { HierarchyItemMenu } from './HierarchyItemMenu';
import { RoomItemCard } from './RoomItem';
import { RoomType } from '../../../types/matrix/room';
import { SequenceCard } from '../../components/sequence-card';

type SpaceHierarchyProps = {
  summary: IHierarchyRoom | undefined;
  spaceItem: HierarchyItemSpace;
  roomItems?: HierarchyItemRoom[];
  allJoinedRooms: Set<string>;
  mDirects: Set<string>;
  roomsPowerLevels: Map<string, IPowerLevels>;
  canEditSpaceChild: (powerLevels: IPowerLevels) => boolean;
  categoryId: string;
  closed: boolean;
  handleClose: MouseEventHandler<HTMLButtonElement>;
  draggingItem?: HierarchyItem;
  onDragging: (item?: HierarchyItem) => void;
  canDrop: CanDropCallback;
  disabledReorder?: boolean;
  nextSpaceId?: string;
  getRoom: (roomId: string) => Room | undefined;
  pinned: boolean;
  togglePinToSidebar: (roomId: string) => void;
  onSpacesFound: (spaceItems: IHierarchyRoom[]) => void;
  onOpenRoom: MouseEventHandler<HTMLButtonElement>;
};
export const SpaceHierarchy = forwardRef<HTMLDivElement, SpaceHierarchyProps>(
  (
    {
      summary,
      spaceItem,
      roomItems,
      allJoinedRooms,
      mDirects,
      roomsPowerLevels,
      canEditSpaceChild,
      categoryId,
      closed,
      handleClose,
      draggingItem,
      onDragging,
      canDrop,
      disabledReorder,
      nextSpaceId,
      getRoom,
      pinned,
      togglePinToSidebar,
      onOpenRoom,
      onSpacesFound,
    },
    ref
  ) => {
    const mx = useMatrixClient();

    const { fetching, error, rooms } = useFetchSpaceHierarchyLevel(spaceItem.roomId, true);

    const subspaces = useMemo(() => {
      const s: Map<string, IHierarchyRoom> = new Map();
      rooms.forEach((r) => {
        if (r.room_type === RoomType.Space) {
          s.set(r.room_id, r);
        }
      });
      return s;
    }, [rooms]);

    const spacePowerLevels = roomsPowerLevels.get(spaceItem.roomId) ?? {};
    const userPLInSpace = powerLevelAPI.getPowerLevel(
      spacePowerLevels,
      mx.getUserId() ?? undefined
    );
    const canInviteInSpace = powerLevelAPI.canDoAction(spacePowerLevels, 'invite', userPLInSpace);

    const draggingSpace =
      draggingItem?.roomId === spaceItem.roomId && draggingItem.parentId === spaceItem.parentId;

    const { parentId } = spaceItem;
    const parentPowerLevels = parentId ? roomsPowerLevels.get(parentId) ?? {} : undefined;

    useEffect(() => {
      onSpacesFound(Array.from(subspaces.values()));
    }, [subspaces, onSpacesFound]);

    let childItems = roomItems?.filter((i) => !subspaces.has(i.roomId));
    if (!canEditSpaceChild(spacePowerLevels)) {
      // hide unknown rooms for normal user
      childItems = childItems?.filter((i) => {
        const forbidden = error instanceof MatrixError ? error.errcode === 'M_FORBIDDEN' : false;
        const inaccessibleRoom = !rooms.get(i.roomId) && !fetching && (error ? forbidden : true);
        return !inaccessibleRoom;
      });
    }

    return (
      <Box direction="Column" gap="100" ref={ref}>
        <SpaceItemCard
          summary={rooms.get(spaceItem.roomId) ?? summary}
          loading={fetching}
          item={spaceItem}
          joined={allJoinedRooms.has(spaceItem.roomId)}
          categoryId={categoryId}
          closed={closed}
          handleClose={handleClose}
          getRoom={getRoom}
          canEditChild={canEditSpaceChild(spacePowerLevels)}
          canReorder={
            parentPowerLevels && !disabledReorder ? canEditSpaceChild(parentPowerLevels) : false
          }
          options={
            parentId &&
            parentPowerLevels && (
              <HierarchyItemMenu
                item={{ ...spaceItem, parentId }}
                canInvite={canInviteInSpace}
                joined={allJoinedRooms.has(spaceItem.roomId)}
                canEditChild={canEditSpaceChild(parentPowerLevels)}
                pinned={pinned}
                onTogglePin={togglePinToSidebar}
              />
            )
          }
          after={
            <AfterItemDropTarget
              item={spaceItem}
              nextRoomId={closed ? nextSpaceId : childItems?.[0]?.roomId}
              afterSpace
              canDrop={canDrop}
            />
          }
          onDragging={onDragging}
          data-dragging={draggingSpace}
        />
        {childItems && childItems.length > 0 ? (
          <Box direction="Column" gap="100">
            {childItems.map((roomItem, index) => {
              const roomSummary = rooms.get(roomItem.roomId);

              const roomPowerLevels = roomsPowerLevels.get(roomItem.roomId) ?? {};
              const userPLInRoom = powerLevelAPI.getPowerLevel(
                roomPowerLevels,
                mx.getUserId() ?? undefined
              );
              const canInviteInRoom = powerLevelAPI.canDoAction(
                roomPowerLevels,
                'invite',
                userPLInRoom
              );

              const lastItem = index === childItems.length;
              const nextRoomId = lastItem ? nextSpaceId : childItems[index + 1]?.roomId;

              const roomDragging =
                draggingItem?.roomId === roomItem.roomId &&
                draggingItem.parentId === roomItem.parentId;

              return (
                <RoomItemCard
                  key={roomItem.roomId}
                  item={roomItem}
                  loading={fetching}
                  error={error}
                  summary={roomSummary}
                  dm={mDirects.has(roomItem.roomId)}
                  onOpen={onOpenRoom}
                  getRoom={getRoom}
                  canReorder={canEditSpaceChild(spacePowerLevels) && !disabledReorder}
                  options={
                    <HierarchyItemMenu
                      item={roomItem}
                      canInvite={canInviteInRoom}
                      joined={allJoinedRooms.has(roomItem.roomId)}
                      canEditChild={canEditSpaceChild(spacePowerLevels)}
                    />
                  }
                  after={
                    <AfterItemDropTarget
                      item={roomItem}
                      nextRoomId={nextRoomId}
                      canDrop={canDrop}
                    />
                  }
                  data-dragging={roomDragging}
                  onDragging={onDragging}
                />
              );
            })}
          </Box>
        ) : (
          childItems && (
            <SequenceCard variant="SurfaceVariant" gap="300" alignItems="Center">
              <Box
                grow="Yes"
                style={{
                  padding: config.space.S700,
                }}
                direction="Column"
                alignItems="Center"
                justifyContent="Center"
                gap="100"
              >
                <Text size="H5" align="Center">
                  No Rooms
                </Text>
                <Text align="Center" size="T300" priority="300">
                  This space does not contains rooms yet.
                </Text>
              </Box>
            </SequenceCard>
          )
        )}
      </Box>
    );
  }
);
