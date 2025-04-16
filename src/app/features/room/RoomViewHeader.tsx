import React, { MouseEventHandler, forwardRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Avatar,
  Text,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  IconButton,
  Icon,
  Icons,
  Tooltip,
  TooltipProvider,
  Menu,
  MenuItem,
  toRem,
  config,
  Line,
  PopOut,
  RectCords,
  Badge,
  Spinner,
} from 'folds'; // Assuming 'folds' is your UI library
import { useNavigate } from 'react-router-dom';
import { JoinRule, Room } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';

// --- Required Imports (Adjust paths as needed) ---
import { useStateEvent } from '../../hooks/useStateEvent';
import { PageHeader } from '../../components/page';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { UseStateProvider } from '../../components/UseStateProvider';
import { RoomTopicViewer } from '../../components/room-topic-viewer';
import { StateEvent } from '../../../types/matrix/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { useSetSetting, useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getHomeSearchPath, getSpaceSearchPath, withSearchParam } from '../../pages/pathUtils';
import { getCanonicalAliasOrRoomId, isRoomAlias, mxcUrlToHttp } from '../../utils/matrix';
import { _SearchPathSearchParams } from '../../pages/paths';
import * as css from './RoomViewHeader.css'; // Assuming CSS Modules
import { useRoomUnread } from '../../state/hooks/unread';
import { usePowerLevelsAPI, usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { markAsRead } from '../../../client/action/notifications';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { openInviteUser } from '../../../client/action/navigation';
import { copyToClipboard } from '../../utils/dom';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomAvatar, useRoomName, useRoomTopic } from '../../hooks/useRoomMeta';
import { mDirectAtom } from '../../state/mDirectList';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getViaServers } from '../../plugins/via-servers';
import { BackRouteHandler } from '../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '../../hooks/useRoomPinnedEvents';
import { RoomPinMenu } from './room-pin-menu';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import {
  getRoomNotificationMode,
  getRoomNotificationModeIcon,
  useRoomsNotificationPreferencesContext,
} from '../../hooks/useRoomsNotificationPreferences';

// --- RoomMenu Component (Assuming it's defined elsewhere or here) ---
// (Include the RoomMenu component code from the previous snippet here if needed)
type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(({ room, requestClose }, ref) => {
  // ... (RoomMenu implementation from previous snippet) ...
  const mx = useMatrixClient();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const powerLevels = usePowerLevelsContext();
  const { getPowerLevel, canDoAction } = usePowerLevelsAPI(powerLevels);
  const canInvite = canDoAction('invite', getPowerLevel(mx.getUserId() ?? ''));
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);

  const handleMarkAsRead = () => {
    markAsRead(mx, room.roomId, hideActivity);
    requestClose();
  };

  const handleInvite = () => {
    openInviteUser(room.roomId);
    requestClose();
  };

  const handleCopyLink = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
    requestClose();
  };

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleOpenSettings = () => {
    openSettings(room.roomId, parentSpace?.roomId);
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
        <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
          {(handleOpen, opened, changing) => (
            <MenuItem
              size="300"
              after={
                changing ? (
                  <Spinner size="100" variant="Secondary" />
                ) : (
                  <Icon size="100" src={getRoomNotificationModeIcon(notificationMode)} />
                )
              }
              radii="300"
              aria-pressed={opened}
              onClick={handleOpen}
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                Notifications
              </Text>
            </MenuItem>
          )}
        </RoomNotificationModeSwitcher>
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
          onClick={handleOpenSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Room Settings
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
                  Leave Room
                </Text>
              </MenuItem>
              {promptLeave && (
                <LeaveRoomPrompt
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

// --- RoomViewHeader Component ---
export function RoomViewHeader() {
  // --- Hooks ---
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const space = useSpaceOptionally();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const mDirects = useAtomValue(mDirectAtom);

  const pinnedEvents = useRoomPinnedEvents(room);
  const encryptionEvent = useStateEvent(room, StateEvent.RoomEncryption);
  const ecryptedRoom = !!encryptionEvent;
  const avatarMxc = useRoomAvatar(room, mDirects.has(room.roomId));
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const setPeopleDrawer = useSetSetting(settingsAtom, 'isPeopleDrawer');

  // --- Event Handlers ---
  const isDirectMessage = () => {
    // Simplified check - consider optimizing if performance is an issue
    const mDirectsEvent = mx.getAccountData('m.direct');
    const { roomId } = room;
    return (
      !!mDirectsEvent?.event.content &&
      Object.values(mDirectsEvent.event.content).flat().includes(roomId)
    );
  };

  const handleCall: MouseEventHandler<HTMLButtonElement> = (evt) => {
    // Placeholder for call initiation logic
    console.log('Initiate call');
    // Potentially set anchor for a call menu if needed, similar to other menus
    // setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleSearchClick = () => {
    const searchParams: _SearchPathSearchParams = {
      rooms: room.roomId,
    };
    const path = space
      ? getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))
      : getHomeSearchPath();
    navigate(withSearchParam(path, searchParams));
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  // --- Render ---
  return (
    // Use PageHeader component for consistent header styling
    <PageHeader balance={screenSize === ScreenSize.Mobile}>
      {/* Main container Box: Uses Flexbox (row), aligns items vertically centered */}
      <Box grow="Yes" alignItems="Center" gap="300">
        {' '}
        {/* Adjust gap as needed */}
        {/* --- LEFT GROUP --- */}
        {/* This Box groups elements intended for the left side */}
        {/* It takes only the width required by its content */}
        <Box alignItems="Center" gap="300">
          {/* Back button shown only on mobile */}
          {screenSize === ScreenSize.Mobile && (
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              )}
            </BackRouteHandler>
          )}
          {/* Avatar shown only on desktop */}
          {screenSize !== ScreenSize.Mobile && (
            <Avatar size="300">
              <RoomAvatar
                roomId={room.roomId}
                src={avatarUrl}
                alt={name}
                renderFallback={() => (
                  <RoomIcon
                    size="200"
                    joinRule={room.getJoinRule() ?? JoinRule.Restricted}
                    filled
                  />
                )}
              />
            </Avatar>
          )}
          {/* Room name and topic */}
          <Box direction="Column">
            <Text size={topic ? 'H5' : 'H3'} truncate>
              {name}
            </Text>
            {/* Topic is conditionally rendered and includes logic for an overlay */}
            {topic && (
              <UseStateProvider initial={false}>
                {(viewTopic, setViewTopic) => (
                  <>
                    {/* Overlay for viewing full topic */}
                    <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                      <OverlayCenter>
                        <FocusTrap
                          focusTrapOptions={{
                            initialFocus: false,
                            clickOutsideDeactivates: true,
                            onDeactivate: () => setViewTopic(false),
                            escapeDeactivates: stopPropagation,
                          }}
                        >
                          <RoomTopicViewer
                            name={name}
                            topic={topic}
                            requestClose={() => setViewTopic(false)}
                          />
                        </FocusTrap>
                      </OverlayCenter>
                    </Overlay>
                    {/* Clickable truncated topic text */}
                    <Text
                      as="button"
                      type="button"
                      onClick={() => setViewTopic(true)}
                      className={css.HeaderTopic} // Apply specific styles if needed
                      size="T200"
                      priority="300"
                      truncate
                    >
                      {topic}
                    </Text>
                  </>
                )}
              </UseStateProvider>
            )}
          </Box>
        </Box>{' '}
        {/* --- END OF LEFT GROUP --- */}
        {/* --- SPACER --- */}
        {/* This empty Box has 'grow="Yes"', making it expand */}
        {/* It pushes the Left Group and Right Group to opposite ends */}
        <Box grow="Yes" />
        {/* --- RIGHT GROUP --- */}
        {/* This Box groups elements intended for the right side */}
        {/* 'shrink="No"' prevents it from collapsing if space is tight */}
        {/* Items are vertically centered, gap adjusted for icons */}
        <Box shrink="No" alignItems="Center" gap="100">
          {/* Call button, shown only for Direct Messages */}
          {isDirectMessage() && (
            <TooltipProvider
              position="Bottom"
              align="End"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Start a call</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton onClick={handleCall} ref={triggerRef}>
                  <Icon size="400" src={Icons.Phone} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {/* Search button, hidden for encrypted rooms */}
          {!ecryptedRoom && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Search</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton ref={triggerRef} onClick={handleSearchClick}>
                  <Icon size="400" src={Icons.Search} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {/* Pinned Messages button */}
          <TooltipProvider
            position="Bottom"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Pinned Messages</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                style={{ position: 'relative' }} // Needed for Badge positioning
                onClick={handleOpenPinMenu}
                ref={triggerRef}
                aria-pressed={!!pinMenuAnchor} // Indicate state when menu is open
              >
                {/* Badge showing pin count */}
                {pinnedEvents.length > 0 && (
                  <Badge
                    style={{ position: 'absolute', left: toRem(3), top: toRem(3) }}
                    variant="Secondary"
                    size="400"
                    fill="Solid"
                    radii="Pill"
                  >
                    <Text as="span" size="L400">
                      {pinnedEvents.length}
                    </Text>
                  </Badge>
                )}
                <Icon size="400" src={Icons.Pin} filled={!!pinMenuAnchor} />
              </IconButton>
            )}
          </TooltipProvider>
          {/* Members button, shown only on desktop */}
          {screenSize === ScreenSize.Desktop && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Members</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton ref={triggerRef} onClick={() => setPeopleDrawer((drawer) => !drawer)}>
                  <Icon size="400" src={Icons.User} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {/* More Options button */}
          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>More Options</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton onClick={handleOpenMenu} ref={triggerRef} aria-pressed={!!menuAnchor}>
                <Icon size="400" src={Icons.VerticalDots} filled={!!menuAnchor} />
              </IconButton>
            )}
          </TooltipProvider>
        </Box>{' '}
        {/* --- END OF RIGHT GROUP --- */}
        {/* PopOuts render their content outside the normal flow (usually via React Portals) */}
        {/* They are placed here logically near their trigger buttons */}
        <PopOut
          anchor={pinMenuAnchor} // Anchored to the pin button's position
          position="Bottom"
          content={
            // FocusTrap manages keyboard focus within the menu
            <FocusTrap
              focusTrapOptions={{ /* ... focus options ... */ escapeDeactivates: stopPropagation }}
            >
              <RoomPinMenu room={room} requestClose={() => setPinMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
        <PopOut
          anchor={menuAnchor} // Anchored to the 'more options' button's position
          position="Bottom"
          align="End"
          content={
            // FocusTrap manages keyboard focus within the menu
            <FocusTrap
              focusTrapOptions={{ /* ... focus options ... */ escapeDeactivates: stopPropagation }}
            >
              <RoomMenu room={room} requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      </Box>{' '}
      {/* --- END OF MAIN CONTAINER BOX --- */}
    </PageHeader>
  );
}
