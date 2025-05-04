import { logger } from 'matrix-js-sdk/lib/logger';
import { NavLink, useParams } from 'react-router-dom';
import { Box, Chip, Icon, IconButton, Icons, Text, Tooltip, TooltipProvider } from 'folds';
import React from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCallState } from '../client/CallProvider';
import { getSpaceRoomPath } from '../pathUtils';
import { getCanonicalAliasOrRoomId } from '../../utils/matrix';
import { useNavToActivePathMapper } from '../../hooks/useNavToActivePathMapper';
import { useSpace } from '../../hooks/useSpace';
import { Room } from 'matrix-js-sdk';
import { useMentionClickHandler } from '../../hooks/useMentionClickHandler';
import {
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../plugins/react-custom-html-parser';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';

type CallNavStatusProps = {
  space: Room | null;
};
export function CallNavStatus({ space }: CallNavStatusProps) {
  const { activeCallRoomId, isAudioEnabled, isVideoEnabled, toggleAudio, toggleVideo, hangUp } =
    useCallState();
  const mx = useMatrixClient();
  const { navigateRoom } = useRoomNavigate();
  const { roomIdOrAlias: viewedRoomId } = useParams<{ roomIdOrAlias: string }>();
  const handleGoToCallRoom = () => {
    if (activeCallRoomId) {
      navigateRoom(activeCallRoomId);
    }
  };
  if (!activeCallRoomId) {
    return (
      <Box
        direction="Column"
        gap="500"
        style={{
          flexShrink: 0,
          borderTop: `1px solid #e0e0e0`,
        }}
      >
        <Text size="T200" color="Muted" align="Center">
          No active call
        </Text>
      </Box>
    );
  }

  return (
    <Box
      direction="Column"
      style={{
        flexShrink: 0,
        borderTop: `1px solid #e0e0e0`,
        justifyContent: 'center',
      }}
    >
      <Box direction="Row" style={{ justifyContent: 'center' }}>
        {/* Going to need better icons for this */}
        <TooltipProvider
          position="Top"
          offset={4}
          tooltip={
            <Tooltip>
              <Text>{!isAudioEnabled ? 'Unmute' : 'Mute'}</Text>
            </Tooltip>
          }
        >
          {(triggerRef) => (
            <IconButton variant="Background" ref={triggerRef} onClick={toggleAudio}>
              <Icon src={!isAudioEnabled ? Icons.VolumeHigh : Icons.VolumeMute} />
            </IconButton>
          )}
        </TooltipProvider>
        <TooltipProvider
          position="Top"
          offset={4}
          tooltip={
            <Tooltip>
              <Text>{!isVideoEnabled ? 'Video on' : 'Video off'}</Text>
            </Tooltip>
          }
        >
          {(triggerRef) => (
            <IconButton variant="Background" ref={triggerRef} onClick={toggleVideo}>
              <Icon src={!isVideoEnabled ? Icons.Vlc : Icons.Lock} />
            </IconButton>
          )}
        </TooltipProvider>

        <TooltipProvider
          position="Top"
          offset={4}
          tooltip={
            <Tooltip>
              <Text>Hang up</Text>
            </Tooltip>
          }
        >
          {(triggerRef) => (
            <IconButton variant="Background" ref={triggerRef} onClick={hangUp}>
              <Icon src={Icons.Phone} />
            </IconButton>
          )}
        </TooltipProvider>

        <Box grow="Yes">
          <TooltipProvider
            position="Top"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Go to room</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <Chip
                radii="Inherit"
                size="500"
                fill="Soft"
                as="button"
                onClick={handleGoToCallRoom}
                ref={triggerRef}
              >
                {mx.getRoom(activeCallRoomId)?.normalizedName}
              </Chip>
            )}
          </TooltipProvider>
        </Box>
      </Box>
    </Box>
  );
}
