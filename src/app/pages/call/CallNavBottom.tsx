import { logger } from 'matrix-js-sdk/lib/logger';
import { NavLink, useParams } from 'react-router-dom';
import { Box, Chip, Icon, IconButton, Icons, Text, Tooltip, TooltipProvider } from 'folds';
import React from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCallState } from '../client/CallProvider';

export function CallNavBottom() {
  const { activeCallRoomId, isAudioEnabled, isVideoEnabled, toggleAudio, toggleVideo, hangUp } =
    useCallState();
  const mx = useMatrixClient();
  const { roomIdOrAlias: viewedRoomId } = useParams<{ roomIdOrAlias: string }>();

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
            <IconButton ref={triggerRef} onClick={toggleAudio}>
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
            <IconButton ref={triggerRef} onClick={toggleVideo}>
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
            <IconButton ref={triggerRef} onClick={hangUp}>
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
            {(triggerRef) =>
              viewedRoomId !== (activeCallRoomId ?? '') ? (
                <NavLink ref={triggerRef} to={activeCallRoomId}>
                  <Chip radii="Inherit" size="500" fill="Soft">
                    {mx.getRoom(activeCallRoomId)?.normalizedName}
                  </Chip>
                </NavLink>
              ) : (
                <Chip ref={triggerRef} radii="Inherit" size="500" fill="Soft">
                  {mx.getRoom(activeCallRoomId)?.normalizedName}
                </Chip>
              )
            }
          </TooltipProvider>
        </Box>
      </Box>
    </Box>
  );
}
