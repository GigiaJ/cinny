import React, {
  MouseEventHandler,
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { JoinRule, Room } from 'matrix-js-sdk';
import { RoomJoinRulesEventContent } from 'matrix-js-sdk/lib/types';
import FocusTrap from 'focus-trap-react';
import { logger } from 'matrix-js-sdk/lib/logger';
import { WidgetApiToWidgetAction } from 'matrix-widget-api';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mDirectAtom } from '../../../state/mDirectList';
import {
  NavCategory,
  NavCategoryHeader,
  NavItem,
  NavItemContent,
  NavLink,
} from '../../../components/nav';
import { getSpaceLobbyPath, getSpaceRoomPath, getSpaceSearchPath } from '../../pathUtils';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '../../../utils/matrix';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import {
  useSpaceLobbySelected,
  useSpaceSearchSelected,
} from '../../../hooks/router/useSelectedSpace';
import { useSpace } from '../../../hooks/useSpace';
import { VirtualTile } from '../../../components/virtualizer';
import { RoomNavCategoryButton, RoomNavItem } from '../../../features/room-nav';
// Using the original name for clarity when generating space category IDs
import { makeNavCategoryId as makeSpaceNavCategoryId } from '../../../state/closedNavCategories';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { useCategoryHandler } from '../../../hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { useRoomName } from '../../../hooks/useRoomMeta';
import { useSpaceJoinedHierarchy } from '../../../hooks/useSpaceHierarchy';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { PageNav, PageNavContent, PageNavHeader } from '../../../components/page';
import { usePowerLevels, usePowerLevelsAPI } from '../../../hooks/usePowerLevels';
import { openInviteUser } from '../../../../client/action/navigation';
import { useRecursiveChildScopeFactory, useSpaceChildren } from '../../../state/hooks/roomList';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { markAsRead } from '../../../../client/action/notifications';
import { useRoomsUnread } from '../../../state/hooks/unread';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { LeaveSpacePrompt } from '../../../components/leave-space-prompt';
import { copyToClipboard } from '../../../utils/dom';
import { useClosedNavCategoriesAtom } from '../../../state/hooks/closedNavCategories';
import { useStateEvent } from '../../../hooks/useStateEvent';
import { StateEvent } from '../../../../types/matrix/room';
import { stopPropagation } from '../../../utils/keyboard';
import { getMatrixToRoom } from '../../../plugins/matrix-to';
import { getViaServers } from '../../../plugins/via-servers';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';
import { useOpenSpaceSettings } from '../../../state/hooks/spaceSettings';
import { useCallState } from '../CallProvider';

/**
 * Processes the raw hierarchy from useSpaceJoinedHierarchy into a flat list
 * suitable for the virtualizer, including collapsible headers for text/voice channels.
 * Removes the top-level "Rooms" category header.
 *
 * @param hierarchy - The raw hierarchy data (array of { roomId: string }).
 * @param mx - The Matrix client instance.
 * @param spaceRoomId - The ID of the root space being viewed.
 * @param closedCategories - The Set of currently closed category IDs.
 * @returns An array of processed items for rendering.
 */
const processHierarchyForVirtualizer = (
  hierarchy: { roomId: string }[],
  mx: ReturnType<typeof useMatrixClient>,
  spaceRoomId: string,
  closedCategories: Set<string>
): Array<{ type: string; key: string; [key: string]: any }> => {
  const processed: Array<{ type: string; key: string; [key: string]: any }> = [];
  let currentCategoryRooms = { text: [], voice: [] };
  let currentParentId: string = spaceRoomId;

  const addCollectedRoomsToProcessed = (parentId: string) => {
    const textCategoryId = `${parentId}_text_rooms`;
    const voiceCategoryId = `${parentId}_call_rooms`;
    const isTextClosed = closedCategories.has(textCategoryId);
    const isCallClosed = closedCategories.has(voiceCategoryId);

    if (currentCategoryRooms.text.length > 0) {
      processed.push({
        type: 'channel_header',
        title: 'Text Rooms',
        categoryId: textCategoryId,
        key: `${parentId}-text-header`,
      });
      if (!isTextClosed) {
        currentCategoryRooms.text.forEach((room) =>
          processed.push({ type: 'room', room, key: room.roomId })
        );
      }
    }

    if (currentCategoryRooms.voice.length > 0) {
      processed.push({
        type: 'channel_header',
        title: 'Call Rooms',
        categoryId: voiceCategoryId,
        key: `${parentId}-voice-header`,
      });
      if (!isCallClosed) {
        currentCategoryRooms.voice.forEach((room) =>
          processed.push({ type: 'room', room, key: room.roomId })
        );
      }
    }
    currentCategoryRooms = { text: [], voice: [] };
  };

  hierarchy.forEach((item) => {
    const room = mx.getRoom(item.roomId);
    if (!room) {
      logger.warn(`processHierarchyForVirtualizer: Room not found for ID ${item.roomId}`);
    }

    if (room.isSpaceRoom()) {
      addCollectedRoomsToProcessed(currentParentId);
      currentParentId = room.roomId;
      if (room.roomId !== spaceRoomId) {
        const spaceCategoryId = makeSpaceNavCategoryId(spaceRoomId, room.roomId);
        processed.push({
          type: 'category',
          room,
          categoryId: spaceCategoryId,
          key: room.roomId,
        });
      }
    } else if (room.isCallRoom()) {
      currentCategoryRooms.voice.push(room);
    } else if (!room.isCallRoom()) {
      currentCategoryRooms.text.push(room);
    } else {
      logger.warn(`processHierarchyForVirtualizer: Room ${room.roomId} is neither text nor voice.`);
      currentCategoryRooms.text.push(room);
    }
  });

  addCollectedRoomsToProcessed(currentParentId);

  return processed;
};

type SpaceMenuProps = {
  room: Room;
  requestClose: () => void;
};
const SpaceMenu = forwardRef<HTMLDivElement, SpaceMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const roomToParents = useAtomValue(roomToParentsAtom);
  const powerLevels = usePowerLevels(room);
  const { getPowerLevel, canDoAction } = usePowerLevelsAPI(powerLevels);
  const canInvite = canDoAction('invite', mx.getUserId() ?? '');
  const openSpaceSettings = useOpenSpaceSettings();

  const allChild = useSpaceChildren(
    allRoomsAtom,
    room.roomId,
    useRecursiveChildScopeFactory(mx, roomToParents)
  );
  const unread = useRoomsUnread(allChild, roomToUnreadAtom);

  const handleMarkAsRead = () => {
    allChild.forEach((childRoomId) => markAsRead(mx, childRoomId, hideActivity));
    requestClose();
  };

  const handleCopyLink = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
    requestClose();
  };

  const handleInvite = () => {
    openInviteUser(room.roomId);
    requestClose();
  };

  const handleRoomSettings = () => {
    openSpaceSettings(room.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={<Icon size="100" src={Icons.CheckTwice} />}
          radii="300"
          disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Mark as Read
          </Text>
        </MenuItem>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleInvite}
          variant="Primary"
          fill="None"
          size="300"
          after={<Icon size="100" src={Icons.UserPlus} />}
          radii="300"
          disabled={!canInvite}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Invite
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleCopyLink}
          size="300"
          after={<Icon size="100" src={Icons.Link} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Copy Link
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleRoomSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Space Settings
          </Text>
        </MenuItem>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <UseStateProvider initial={false}>
          {(promptLeave, setPromptLeave) => (
            <>
              <MenuItem
                onClick={() => setPromptLeave(true)}
                variant="Critical"
                fill="None"
                size="300"
                after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                radii="300"
                aria-pressed={promptLeave}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Leave Space
                </Text>
              </MenuItem>
              {promptLeave && (
                <LeaveSpacePrompt
                  roomId={room.roomId}
                  onDone={requestClose}
                  onCancel={() => setPromptLeave(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
      </Box>
    </Menu>
  );
});

function SpaceHeader() {
  const space = useSpace();
  const spaceName = useRoomName(space);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const joinRules = useStateEvent(
    space,
    StateEvent.RoomJoinRules
  )?.getContent<RoomJoinRulesEventContent>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };
  return (
    <>
      <PageNavHeader>
        <Box alignItems="Center" grow="Yes" gap="300">
          <Box grow="Yes" alignItems="Center" gap="100">
            <Text size="H4" truncate>
              {spaceName}
            </Text>
            {joinRules?.join_rule !== JoinRule.Public && <Icon src={Icons.Lock} size="50" />}
          </Box>
          <Box>
            <IconButton aria-pressed={!!menuAnchor} variant="Background" onClick={handleOpenMenu}>
              <Icon src={Icons.VerticalDots} size="200" />
            </IconButton>
          </Box>
        </Box>
      </PageNavHeader>
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Bottom"
          align="End"
          offset={6}
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              {space && <SpaceMenu room={space} requestClose={() => setMenuAnchor(undefined)} />}
            </FocusTrap>
          }
        />
      )}
    </>
  );
}

function FixedBottomNavArea() {
  const { sendWidgetAction, activeCallRoomId } = useCallState();
  const mx = useMatrixClient();
  const userName = mx.getUser(mx.getUserId() ?? '')?.displayName ?? mx.getUserId() ?? 'User';

  const handleSendMessageClick = () => {
    const action = 'my.custom.action';
    const data = { message: `Hello from ${userName}!` };
    logger.debug(`FixedBottomNavArea: Sending action '${action}'`);
    sendWidgetAction(action, data)
      .then(() => logger.info(`FixedBottomNavArea: Action '${action}' sent.`))
      .catch((err) => logger.error(`FixedBottomNavArea: Failed action '${action}':`, err));
  };

  const handleToggleMuteClick = () => {
    const action = WidgetApiToWidgetAction.SetAudioInputMuted;
    const data = {};
    logger.debug(`FixedBottomNavArea: Sending action '${action}'`);
    sendWidgetAction(action, data)
      .then(() => logger.info(`FixedBottomNavArea: Action '${action}' sent.`))
      .catch((err) => logger.error(`FixedBottomNavArea: Failed action '${action}':`, err));
  };

  if (!activeCallRoomId) {
    return (
      <Box
        direction="Column"
        gap="200"
        padding="300"
        style={{ flexShrink: 0, borderTop: `1px solid` }}
      >
        <Text size="T200" color="Muted" align="Center">
          No active call
        </Text>
      </Box>
    );
  }

  return (
    <Text size="T200" color="Muted" align="Center">
      {mx.getRoom(activeCallRoomId)?.normalizedName}
    </Text>
  );
} /*
<Box
      direction="Column"
      gap="200"
      padding="300"
      style={{ flexShrink: 0, borderTop: `1px solid ${config?.color?.LineStrong ?? '#ccc'}` }}
    >
      <Box direction="Row" gap="200" justifyContent="Center">
        <Button onClick={handleSendMessageClick} size="200" variant="Primary" fill="Outline">
          <Icon src={Icons.Alphabet} size="100" />
        </Button>
        <Button onClick={handleToggleMuteClick} size="200" variant="Surface">
          <Icon src={Icons.VolumeMute} size="100" />
        </Button>
      </Box>
    </Box>
    */

export function Space() {
  const mx = useMatrixClient();
  const space = useSpace();
  useNavToActivePathMapper(space.roomId);
  const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, space.roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);
  const notificationPreferences = useRoomsNotificationPreferencesContext();

  const selectedRoomId = useSelectedRoom();
  const lobbySelected = useSpaceLobbySelected(spaceIdOrAlias);
  const searchSelected = useSpaceSearchSelected(spaceIdOrAlias);

  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  const getRoom = useCallback(
    (rId: string): Room | undefined => {
      if (allJoinedRooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, allJoinedRooms]
  );

  const hierarchy = useSpaceJoinedHierarchy(
    space.roomId,
    getRoom,
    useCallback(
      (parentId, roomId) => {
        const parentSpaceCategoryId = makeSpaceNavCategoryId(space.roomId, parentId);
        if (!closedCategories.has(parentSpaceCategoryId)) {
          return false;
        }
        const showRoomAnyway = roomToUnread.has(roomId) || roomId === selectedRoomId;
        return !showRoomAnyway;
      },
      [space.roomId, closedCategories, roomToUnread, selectedRoomId]
    ),

    useCallback(
      (subCategoryId) => closedCategories.has(makeSpaceNavCategoryId(space.roomId, subCategoryId)),
      [closedCategories, space.roomId]
    )
  );

  const processedHierarchy = useMemo(
    () => processHierarchyForVirtualizer(hierarchy, mx, space.roomId, closedCategories),
    [hierarchy, mx, space.roomId, closedCategories]
  );

  const virtualizer = useVirtualizer({
    count: processedHierarchy.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const getToLink = (roomId: string) =>
    getSpaceRoomPath(spaceIdOrAlias, getCanonicalAliasOrRoomId(mx, roomId));

  return (
    <PageNav style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SpaceHeader />
      <PageNavContent
        scrollRef={scrollRef}
        style={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}
      >
        <Box direction="Column" gap="300" paddingBottom="400">
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={lobbySelected}>
              <NavLink to={getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Flag} size="100" filled={lobbySelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Lobby
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <NavItem variant="Background" radii="400" aria-selected={searchSelected}>
              <NavLink to={getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Search} size="100" filled={searchSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Message Search
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
          </NavCategory>
        </Box>
        <NavCategory
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const item = processedHierarchy[vItem.index];
            if (!item) return null;
            const renderContent = () => {
              switch (item.type) {
                case 'category': {
                  const { room, categoryId } = item;
                  const name = room.name;
                  const paddingTop = config?.space?.S400 ?? '1rem';
                  return (
                    <div style={{ paddingTop: paddingTop }}>
                      <NavCategoryHeader>
                        <RoomNavCategoryButton
                          data-category-id={categoryId}
                          onClick={handleCategoryClick}
                          closed={closedCategories.has(categoryId)}
                        >
                          {name}
                        </RoomNavCategoryButton>
                      </NavCategoryHeader>
                    </div>
                  );
                }
                case 'channel_header': {
                  const { title, categoryId } = item;
                  return (
                    <Box paddingLeft="400" paddingTop="200" paddingBottom="100">
                      <NavCategoryHeader variant="Subtle">
                        <RoomNavCategoryButton
                          data-category-id={categoryId}
                          onClick={handleCategoryClick}
                          closed={closedCategories.has(categoryId)}
                          isSubCategory
                        >
                          {title}
                        </RoomNavCategoryButton>
                      </NavCategoryHeader>
                    </Box>
                  );
                }
                case 'room': {
                  const { room } = item;
                  return (
                    <Box paddingLeft="500">
                      <RoomNavItem
                        room={room}
                        selected={selectedRoomId === room.roomId}
                        showAvatar={mDirects.has(room.roomId)}
                        direct={mDirects.has(room.roomId)}
                        linkPath={getToLink(room.roomId)}
                        notificationMode={getRoomNotificationMode(
                          notificationPreferences,
                          room.roomId
                        )}
                      />
                    </Box>
                  );
                }
                default:
                  logger.error('Unknown item type in virtualized list:', item);
                  return null;
              }
            };

            return (
              <VirtualTile virtualItem={vItem} key={item.key} ref={virtualizer.measureElement}>
                {renderContent()}
              </VirtualTile>
            );
          })}
        </NavCategory>
      </PageNavContent>
      <FixedBottomNavArea />
    </PageNav>
  );
}
