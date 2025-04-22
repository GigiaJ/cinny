import { logger } from 'matrix-js-sdk/lib/logger';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCallState } from '../client/CallProvider';
import { Box, Chip, Icon, IconButton, Icons, Text } from 'folds';
import { useMentionClickHandler } from '../../hooks/useMentionClickHandler';
import {
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../plugins/react-custom-html-parser';

export function CallNavBottom() {
  const {
    sendWidgetAction,
    activeCallRoomId,
    isAudioEnabled,
    isVideoEnabled,
    toggleAudio,
    toggleVideo,
    hangUp,
  } = useCallState();
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

  const mentionClickHandler = useMentionClickHandler(activeCallRoomId ?? mx.getUserId());

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

  //Muted:{(!isAudioEnabled).toString()}
  //Videosn't:{(!isVideoEnabled).toString()}
  /*



*/
  const test = `https://matrix.to/#/${activeCallRoomId}`;
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
        <IconButton onClick={toggleAudio}>
          <Icon src={!isAudioEnabled ? Icons.VolumeHigh : Icons.VolumeMute} />
        </IconButton>
        <IconButton onClick={toggleVideo}>
          <Icon src={!isVideoEnabled ? Icons.Vlc : Icons.Lock}></Icon>
        </IconButton>
        <IconButton onClick={hangUp}>
          <Icon src={Icons.Phone}></Icon>
        </IconButton>
        <Box grow="Yes">
          <Chip size="600">
            {renderMatrixMention(
              mx,
              undefined,
              test,
              makeMentionCustomProps(
                mentionClickHandler,
                mx.getRoom(activeCallRoomId)?.normalizedName
              )
            )}
          </Chip>
        </Box>
      </Box>
    </Box>
  );
}
