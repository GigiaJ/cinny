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
  Button,
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
} from 'folds'; // Assuming 'folds' is your UI library
import { useVirtualizer } from '@tanstack/react-virtual';
import { JoinRule, Room } from 'matrix-js-sdk';
import { RoomJoinRulesEventContent } from 'matrix-js-sdk/lib/types';
import FocusTrap from 'focus-trap-react';
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
import { useCallState } from '../CallProvider'; // Assuming path
import { WidgetApiToWidgetAction } from 'matrix-widget-api';
import { logger } from 'matrix-js-sdk/lib/logger';

// --- Helper Functions ---

// Determine if a room is a voice room (assuming Room object has this method)
const isVoiceRoom = (room: Room): boolean => room.isCallRoom?.() ?? false;
// Determine if a room is a text room
const isTextRoom = (room: Room): boolean => !isVoiceRoom(room);

// Helper function to generate unique category IDs for channel type headers
const makeChannelTypeId = (parentId: string, type: 'text' | 'voice'): string => {
  return `${parentId}_${type}_channels`;
};

/**
 * Processes the raw hierarchy from useSpaceJoinedHierarchy into a flat list
 * suitable for the virtualizer, including collapsible headers for text/voice channels.
 * Removes the top-level "Channels" category header.
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
  // Start with the root space as the initial parent context
  let currentParentId: string = spaceRoomId;

  // Function to add collected text/voice rooms under their respective headers
  const addCollectedRoomsToProcessed = (parentId: string) => {
    const textCategoryId = makeChannelTypeId(parentId, 'text');
    const voiceCategoryId = makeChannelTypeId(parentId, 'voice');
    const isTextClosed = closedCategories.has(textCategoryId);
    const isVoiceClosed = closedCategories.has(voiceCategoryId);

    // Add Text Channels Header and Rooms (if any exist)
    if (currentCategoryRooms.text.length > 0) {
      processed.push({
        type: 'channel_header', // Use specific type for collapsible channel headers
        title: 'Text Channels',
        categoryId: textCategoryId, // ID used for collapse state
        key: `${parentId}-text-header`,
      });
      // Only add room items if this category is not closed
      if (!isTextClosed) {
        currentCategoryRooms.text.forEach((room) =>
          processed.push({ type: 'room', room, key: room.roomId })
        );
      }
    }

    // Add Voice Channels Header and Rooms (if any exist)
    if (currentCategoryRooms.voice.length > 0) {
      processed.push({
        type: 'channel_header', // Use specific type
        title: 'Voice Channels',
        categoryId: voiceCategoryId, // ID used for collapse state
        key: `${parentId}-voice-header`,
      });
      // Only add room items if this category is not closed
      if (!isVoiceClosed) {
        currentCategoryRooms.voice.forEach((room) =>
          processed.push({ type: 'room', room, key: room.roomId })
        );
      }
    }
    // Reset collected rooms for the next category/space
    currentCategoryRooms = { text: [], voice: [] };
  };

  // Iterate through the raw hierarchy provided by the hook
  hierarchy.forEach((item) => {
    const room = mx.getRoom(item.roomId);
    if (!room) {
      logger.warn(`processHierarchyForVirtualizer: Room not found for ID ${item.roomId}`);
      return; // Skip if room data isn't available
    }

    if (room.isSpaceRoom()) {
      // When encountering a new space, first process the rooms collected under the *previous* parent
      addCollectedRoomsToProcessed(currentParentId);

      // Now, set the current parent context to this new space
      currentParentId = room.roomId;

      // Add the space category item itself to the processed list,
      // *UNLESS* it's the root space (we want to skip the top-level "Channels" header)
      if (room.roomId !== spaceRoomId) {
        const spaceCategoryId = makeSpaceNavCategoryId(spaceRoomId, room.roomId); // Use original ID generator for spaces
        processed.push({
          type: 'category', // Type for main space categories
          room,
          categoryId: spaceCategoryId, // ID for this space's collapse state
          key: room.roomId,
        });
      }
      // Note: We assume the `hierarchy` list is already filtered based on closed *space* categories.
    } else {
      // This is a regular room (not a space). Add it to the appropriate list (text/voice)
      // for the *current* parent space.
      if (isVoiceRoom(room)) {
        currentCategoryRooms.voice.push(room);
      } else if (isTextRoom(room)) {
        currentCategoryRooms.text.push(room);
      } else {
        // Fallback or handle unexpected room types if necessary
        logger.warn(
          `processHierarchyForVirtualizer: Room ${room.roomId} is neither text nor voice.`
        );
        currentCategoryRooms.text.push(room); // Default to text for now
      }
    }
  });

  // After iterating through all items, process any remaining rooms collected under the last parent
  addCollectedRoomsToProcessed(currentParentId);

  return processed;
};

// --- Space Menu Component (Remains Unchanged) ---
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

// --- Space Header Component (Remains Unchanged) ---
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

// --- Fixed Bottom Nav Area Component (Remains Unchanged) ---
function FixedBottomNavArea() {
  const { sendWidgetAction, activeCallRoomId } = useCallState();
  const mx = useMatrixClient();
  const userName = mx.getUser(mx.getUserId() ?? '')?.displayName ?? mx.getUserId() ?? 'User';

  const handleSendMessageClick = () => {
    const action = 'my.custom.action'; // Replace with your actual action
    const data = { message: `Hello from ${userName}!` };
    logger.debug(`FixedBottomNavArea: Sending action '${action}'`);
    sendWidgetAction(action, data)
      .then(() => logger.info(`FixedBottomNavArea: Action '${action}' sent.`))
      .catch((err) => logger.error(`FixedBottomNavArea: Failed action '${action}':`, err));
  };

  const handleToggleMuteClick = () => {
    const action = WidgetApiToWidgetAction.SetAudioInputMuted;
    const data = {}; // Sending empty data might imply toggle for some widgets
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
        style={{ flexShrink: 0, borderTop: `1px solid ${config?.color?.LineStrong ?? '#ccc'}` }} // Use theme color if possible
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

// --- Main Space Component (Updated Rendering Logic) ---
export function Space() {
  const mx = useMatrixClient();
  const space = useSpace(); // The current top-level space being viewed
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

  // State for managing collapsed categories (includes spaces and channel types)
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  // Memoized callback to get room objects
  const getRoom = useCallback(
    (rId: string): Room | undefined => {
      if (allJoinedRooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, allJoinedRooms]
  );

  // Fetch the raw hierarchy using the hook
  // Note: The filtering callbacks passed here primarily affect *which* rooms/spaces
  // are included in the raw list *before* processing.
  const hierarchy = useSpaceJoinedHierarchy(
    space.roomId,
    getRoom,
    // isRoomHidden callback: Hides room if parent space category is closed, unless room is unread/selected.
    useCallback(
      (parentId, roomId) => {
        // Generate the category ID for the parent *space*
        const parentSpaceCategoryId = makeSpaceNavCategoryId(space.roomId, parentId);
        // If the parent space category is not closed, the room is not hidden by this rule.
        if (!closedCategories.has(parentSpaceCategoryId)) {
          return false;
        }
        // Parent space is closed. Hide the room unless it's unread or currently selected.
        const showRoomAnyway = roomToUnread.has(roomId) || roomId === selectedRoomId;
        return !showRoomAnyway; // Return true to hide, false to show
      },
      [space.roomId, closedCategories, roomToUnread, selectedRoomId] // Dependencies
    ),
    // isSubCategoryClosed callback: Checks if a *space* subcategory is closed.
    useCallback(
      (subCategoryId) => closedCategories.has(makeSpaceNavCategoryId(space.roomId, subCategoryId)),
      [closedCategories, space.roomId] // Dependencies
    )
  );

  // Process the raw hierarchy into a list with collapsible channel headers
  const processedHierarchy = useMemo(
    () =>
      processHierarchyForVirtualizer(
        hierarchy,
        mx,
        space.roomId,
        closedCategories // Pass closed state to the processing function
      ),
    [hierarchy, mx, space.roomId, closedCategories] // Dependencies for memoization
  );

  // Setup the virtualizer with the processed list
  const virtualizer = useVirtualizer({
    count: processedHierarchy.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32, // Adjust based on average item height
    overscan: 10, // Render items slightly outside the viewport
  });

  // Click handler for toggling category collapse state (works for spaces and channel types)
  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  // Function to generate navigation links for rooms
  const getToLink = (roomId: string) =>
    getSpaceRoomPath(spaceIdOrAlias, getCanonicalAliasOrRoomId(mx, roomId));

  // --- Render ---
  return (
    <PageNav style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Fixed Header */}
      <SpaceHeader />

      {/* Scrollable Content Area */}
      <PageNavContent
        scrollRef={scrollRef}
        style={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}
      >
        {/* Static Top Links (Lobby, Search) */}
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

        {/* Virtualized List Area */}
        <NavCategory
          style={{
            height: `${virtualizer.getTotalSize()}px`, // Set height for virtualizer scroll calculations
            width: '100%',
            position: 'relative', // Needed for absolute positioning of virtual items
          }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const item = processedHierarchy[vItem.index];
            if (!item) return null; // Should not happen with correct processing

            // --- Render Logic based on Item Type ---
            const renderContent = () => {
              switch (item.type) {
                // Render a main space category header (for nested spaces)
                case 'category': {
                  // item has: room, categoryId, key
                  const { room, categoryId } = item;
                  // Determine name: Use the room name for nested spaces
                  const name = room.name;
                  // Add padding above subsequent categories
                  // Removed index === 0 check as root category is gone
                  const paddingTop = config?.space?.S400 ?? '1rem';
                  return (
                    <div style={{ paddingTop: paddingTop }}>
                      <NavCategoryHeader>
                        <RoomNavCategoryButton
                          data-category-id={categoryId} // ID for collapse state
                          onClick={handleCategoryClick} // Toggle collapse
                          closed={closedCategories.has(categoryId)} // Pass closed state
                        >
                          {name}
                        </RoomNavCategoryButton>
                      </NavCategoryHeader>
                    </div>
                  );
                }
                // Render a collapsible header for Text or Voice channels
                case 'channel_header': {
                  // item has: title, categoryId, key
                  const { title, categoryId } = item;
                  return (
                    // Add indentation and padding for visual hierarchy
                    <Box paddingLeft="400" paddingTop="200" paddingBottom="100">
                      <NavCategoryHeader variant="Subtle">
                        {' '}
                        {/* Use subtle variant if available */}
                        <RoomNavCategoryButton
                          data-category-id={categoryId} // ID for collapse state
                          onClick={handleCategoryClick} // Toggle collapse
                          closed={closedCategories.has(categoryId)} // Pass closed state
                          isSubCategory // Optional prop for styling tweaks
                        >
                          {title}
                        </RoomNavCategoryButton>
                      </NavCategoryHeader>
                    </Box>
                  );
                }
                // Render a regular room item (text or voice channel)
                case 'room': {
                  // item has: room, key
                  const { room } = item;
                  return (
                    // Add indentation for rooms under headers
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
                  // Log error for unexpected item types
                  logger.error('Unknown item type in virtualized list:', item);
                  return null;
              }
            };

            // Render the virtual tile wrapper with the content
            return (
              <VirtualTile virtualItem={vItem} key={item.key} ref={virtualizer.measureElement}>
                {renderContent()}
              </VirtualTile>
            );
          })}
        </NavCategory>
      </PageNavContent>

      {/* Fixed Bottom Section (Remains Unchanged) */}
      <FixedBottomNavArea />
    </PageNav>
  );
}
