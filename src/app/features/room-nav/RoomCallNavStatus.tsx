import { Box, Chip, Icon, IconButton, Icons, Text, Tooltip, TooltipProvider } from 'folds';
import React from 'react';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCallState } from '../../pages/client/call/CallProvider';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';

type CallNavStatusProps = {
  space: Room | null;
};
export function CallNavStatus({ space }: CallNavStatusProps) {
  const {
    activeCallRoomId,
    isAudioEnabled,
    isVideoEnabled,
    isCallActive,
    toggleAudio,
    toggleVideo,
    hangUp,
  } = useCallState();
  const mx = useMatrixClient();
  const { navigateRoom } = useRoomNavigate();
  const handleGoToCallRoom = () => {
    if (activeCallRoomId) {
      navigateRoom(activeCallRoomId);
    }
  };
  if (!isCallActive) {
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
                variant="Background"
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
