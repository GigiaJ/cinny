import {
  Avatar,
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Text,
  Tooltip,
  TooltipProvider,
} from 'folds';
import React, { useState } from 'react';
import { Room } from 'matrix-js-sdk';
import { useFocusWithin, useHover } from 'react-aria';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { NavItem, NavItemContent, NavItemOptions } from '../../components/nav';
import { UserAvatar } from '../../components/user-avatar';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCallState } from '../../pages/client/call/CallProvider';
import { getMxIdLocalPart } from '../../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { openProfileViewer } from '../../../client/action/navigation';

type RoomNavUserProps = {
  room: Room;
  callMembership: CallMembership;
};
export function RoomNavUser({ room, callMembership }: RoomNavUserProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [navUserExpanded, setNavUserExpanded] = useState(false);
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({
    onFocusWithinChange: (isFocused) => {
      setHover(isFocused);
      if (!isFocused) setNavUserExpanded(false);
    },
  });
  const { isCallActive, activeCallRoomId } = useCallState();
  const isActiveCall = isCallActive && activeCallRoomId === room.roomId;
  const userId = callMembership.sender ?? '';
  const avatarMxcUrl = getMemberAvatarMxc(room, userId);
  const avatarUrl = avatarMxcUrl
    ? mx.mxcUrlToHttp(avatarMxcUrl, 32, 32, 'crop', undefined, false, useAuthentication)
    : undefined;
  const getName = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId);
  const isCallParticipant = isActiveCall && userId !== mx.getUserId();

  const handleNavUserClick = () => {
    if (isCallParticipant) {
      setNavUserExpanded((prev) => !prev);
    }
  };

  const handleClickUser = () => {
    openProfileViewer(userId, room.roomId);
  };

  // PLACEHOLDER
  const [userMuted, setUserMuted] = useState(false);
  const handleToggleMute = () => {
    setUserMuted(!userMuted);
  };

  const optionsVisible = (hover || userMuted || navUserExpanded) && isCallParticipant && false; // Disable until individual volume control and mute have been added
  const ariaLabel = isCallParticipant
    ? `Call Participant: ${getName}${userMuted ? ', Muted' : ''}`
    : getName;

  return (
    <NavItem
      tabIndex={0}
      variant="Background"
      radii="400"
      style={{ paddingTop: config.space.S200, paddingBottom: config.space.S200 }}
      {...hoverProps}
      {...focusWithinProps}
      aria-label={ariaLabel}
    >
      <NavItemContent onClick={handleNavUserClick}>
        <Box direction="Column" grow="Yes" gap="200" justifyContent="Stretch">
          <Box as="span" alignItems="Center" gap="200">
            <Avatar size="200">
              <UserAvatar
                userId={userId}
                src={avatarUrl ?? undefined}
                alt={getName}
                renderFallback={() => <Icon size="50" src={Icons.User} filled />}
              />
            </Avatar>
            <Text
              size="B400"
              priority="300"
              // Set priority based on if talking
              truncate
            >
              {getName}
            </Text>
          </Box>
          {navUserExpanded && (
            <Box as="span" grow="Yes" alignItems="Center" gap="200">
              {/* Slider here, when implemented into folds */}
              <Text>---- THIS IS A SLIDER ---</Text>
            </Box>
          )}
        </Box>
      </NavItemContent>
      {optionsVisible && (
        <NavItemOptions direction="Column" justifyContent="SpaceBetween">
          <TooltipProvider
            position="Bottom"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>{userMuted ? 'Unmute' : 'Mute'}</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                ref={triggerRef}
                onClick={handleToggleMute}
                aria-pressed={userMuted}
                aria-label={userMuted ? `Unmute ${getName}` : `Mute ${getName}`}
                variant={userMuted ? 'Critical' : 'Background'}
                fill="None"
                size="300"
                radii="300"
              >
                <Icon size="50" src={userMuted ? Icons.VolumeMute : Icons.VolumeHigh} />
              </IconButton>
            )}
          </TooltipProvider>
          {navUserExpanded && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>View Profile</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  ref={triggerRef}
                  onClick={handleClickUser}
                  aria-label="View Profile"
                  variant="Background"
                  fill="None"
                  size="300"
                  radii="300"
                >
                  <Icon size="50" src={Icons.User} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
        </NavItemOptions>
      )}
    </NavItem>
  );
}
