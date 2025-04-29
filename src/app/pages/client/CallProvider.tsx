import React, {
  createContext,
  useState,
  useContext,
  useMemo,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';
import { WidgetApiToWidgetAction, WidgetApiAction, ClientWidgetApi } from 'matrix-widget-api';

interface MediaStatePayload {
  data?: {
    audio_enabled?: boolean;
    video_enabled?: boolean;
  };
}

const WIDGET_MEDIA_STATE_UPDATE_ACTION = 'io.element.device_mute';
const WIDGET_HANGUP_ACTION = 'im.vector.hangup';
const SET_MEDIA_STATE_ACTION = 'io.element.device_mute';

interface CallContextState {
  activeCallRoomId: string | null;
  setActiveCallRoomId: (roomId: string | null) => void;
  hangUp: () => void;
  activeClientWidgetApi: ClientWidgetApi | null;
  registerActiveClientWidgetApi: (
    roomId: string | null,
    clientWidgetApi: ClientWidgetApi | null
  ) => void;
  sendWidgetAction: <T = unknown>(
    action: WidgetApiToWidgetAction | string,
    data: T
  ) => Promise<void>;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isChatOpen: boolean;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  toggleChat: () => Promise<void>;
}

const CallContext = createContext<CallContextState | undefined>(undefined);

interface CallProviderProps {
  children: ReactNode;
}

const DEFAULT_AUDIO_ENABLED = true;
const DEFAULT_VIDEO_ENABLED = false;
const DEFAULT_CHAT_OPENED = false;

export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  const [activeClientWidgetApi, setActiveClientWidgetApiState] = useState<ClientWidgetApi | null>(
    null
  );
  const [clientWidgetApiRoomId, setClientWidgetApiRoomId] = useState<string | null>(null);

  const [isAudioEnabled, setIsAudioEnabledState] = useState<boolean>(DEFAULT_AUDIO_ENABLED);
  const [isVideoEnabled, setIsVideoEnabledState] = useState<boolean>(DEFAULT_VIDEO_ENABLED);
  const [isChatOpen, setIsChatOpenState] = useState<boolean>(DEFAULT_CHAT_OPENED);

  const resetMediaState = useCallback(() => {
    logger.debug('CallContext: Resetting media state to defaults.');
    setIsAudioEnabledState(DEFAULT_AUDIO_ENABLED);
    setIsVideoEnabledState(DEFAULT_VIDEO_ENABLED);
    setIsChatOpenState(DEFAULT_CHAT_OPENED);
  }, []);

  const setActiveCallRoomId = useCallback(
    (roomId: string | null) => {
      logger.warn(`CallContext: Setting activeCallRoomId to ${roomId}`);
      const previousRoomId = activeCallRoomId;
      setActiveCallRoomIdState(roomId);

      if (roomId !== previousRoomId) {
        logger.debug(`CallContext: Active call room changed, resetting media state.`);
        resetMediaState();
      }

      if (roomId === null || roomId !== clientWidgetApiRoomId) {
        logger.warn(
          `CallContext: Clearing active clientWidgetApi because active room changed to ${roomId} or was cleared.`
        );
        setActiveClientWidgetApiState(null);
        setClientWidgetApiRoomId(null);
      }
    },
    [clientWidgetApiRoomId, resetMediaState, activeCallRoomId]
  );

  const hangUp = useCallback(() => {
    logger.debug(`CallContext: Hang up called.`);
    activeClientWidgetApi?.transport.send(`action:${WIDGET_HANGUP_ACTION}`, {});
    setActiveCallRoomIdState(null);
    logger.debug(`CallContext: Clearing active clientWidgetApi due to hangup.`);
    setActiveClientWidgetApiState(null);
    setClientWidgetApiRoomId(null);
    resetMediaState();
  }, [resetMediaState]);

  const setActiveClientWidgetApi = useCallback(
    (clientWidgetApi: ClientWidgetApi | null, roomId: string | null) => {
      setActiveClientWidgetApiState(clientWidgetApi);
      setClientWidgetApiRoomId(roomId);
    },
    []
  );

  const registerActiveClientWidgetApi = useCallback(
    (roomId: string | null, clientWidgetApi: ClientWidgetApi | null) => {
      if (activeClientWidgetApi && activeClientWidgetApi !== clientWidgetApi) {
        logger.debug(`CallContext: Cleaning up listeners for previous clientWidgetApi instance.`);
      }

      if (roomId && clientWidgetApi) {
        logger.debug(`CallContext: Registering active clientWidgetApi for room ${roomId}.`);
        setActiveClientWidgetApi(clientWidgetApi, roomId);
      } else if (roomId === clientWidgetApiRoomId || roomId === null) {
        logger.debug(
          `CallContext: Clearing active clientWidgetApi for room ${clientWidgetApiRoomId}.`
        );
        setActiveClientWidgetApi(null, null);
        resetMediaState();
      } else {
        logger.debug(
          `CallContext: Ignoring clientWidgetApi registration/clear request for room ${roomId}, as current clientWidgetApi belongs to ${clientWidgetApiRoomId}.`
        );
      }
    },
    [activeClientWidgetApi, clientWidgetApiRoomId, setActiveClientWidgetApi, resetMediaState]
  );

  useEffect(() => {
    if (!activeClientWidgetApi || !activeCallRoomId || clientWidgetApiRoomId !== activeCallRoomId) {
      return;
    }

    const clientWidgetApi = activeClientWidgetApi;

    const handleHangup = (ev: CustomEvent) => {
      ev.preventDefault();

      clientWidgetApi.transport.reply(ev.detail, {});
      logger.warn(
        `CallContext: Received hangup action from widget in room ${activeCallRoomId}.`,
        ev
      );
      hangUp();
    };

    const handleMediaStateUpdate = (ev: CustomEvent<MediaStatePayload>) => {
      ev.preventDefault();
      logger.debug(
        `CallContext: Received media state update from widget in room ${activeCallRoomId}:`,
        ev.detail
      );
      const { audio_enabled, video_enabled } = ev.detail.data;
      if (typeof audio_enabled === 'boolean' && audio_enabled !== isAudioEnabled) {
        logger.debug(`CallContext: Updating audio enabled state from widget: ${audio_enabled}`);
        setIsAudioEnabledState(audio_enabled);
      }
      if (typeof video_enabled === 'boolean' && video_enabled !== isVideoEnabled) {
        logger.debug(`CallContext: Updating video enabled state from widget: ${video_enabled}`);
        setIsVideoEnabledState(video_enabled);
      }
    };

    logger.debug(
      `CallContext: Setting up listeners for clientWidgetApi in room ${activeCallRoomId}`
    );
    clientWidgetApi.on(`action:${WIDGET_HANGUP_ACTION}`, handleHangup); // Use standard hangup action name
    clientWidgetApi.on(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);

    return () => {
      logger.debug(
        `CallContext: Cleaning up listeners for clientWidgetApi in room ${activeCallRoomId}`
      );
      if (clientWidgetApi) {
        clientWidgetApi.off(`action:${WIDGET_HANGUP_ACTION}`, handleHangup);
        clientWidgetApi.off(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
      }
    };
  }, [
    activeClientWidgetApi,
    activeCallRoomId,
    clientWidgetApiRoomId,
    hangUp,
    isChatOpen,
    isAudioEnabled,
    isVideoEnabled,
  ]);

  const sendWidgetAction = useCallback(
    async <T = unknown,>(action: WidgetApiToWidgetAction | string, data: T): Promise<void> => {
      if (!activeClientWidgetApi) {
        logger.warn(
          `CallContext: Cannot send action '${action}', no active API clientWidgetApi registered.`
        );
        return Promise.reject(new Error('No active call clientWidgetApi'));
      }
      if (!clientWidgetApiRoomId || clientWidgetApiRoomId !== activeCallRoomId) {
        logger.debug(
          `CallContext: Cannot send action '${action}', clientWidgetApi room (${clientWidgetApiRoomId}) does not match active call room (${activeCallRoomId}). Stale clientWidgetApi?`
        );
        return Promise.reject(new Error('Mismatched active call clientWidgetApi'));
      }
      try {
        logger.debug(
          `CallContext: Sending action '${action}' via active clientWidgetApi (room: ${clientWidgetApiRoomId}) with data:`,
          data
        );
        await activeClientWidgetApi.transport.send(action as WidgetApiAction, data);
      } catch (error) {
        logger.error(`CallContext: Error sending action '${action}':`, error);
        throw error;
      }
    },
    [activeClientWidgetApi, activeCallRoomId, clientWidgetApiRoomId]
  );

  const toggleAudio = useCallback(async () => {
    const newState = !isAudioEnabled;
    logger.debug(`CallContext: Toggling audio. New state: enabled=${newState}`);
    setIsAudioEnabledState(newState);
    try {
      await sendWidgetAction(SET_MEDIA_STATE_ACTION, {
        audio_enabled: newState,
        video_enabled: isVideoEnabled,
      });
      logger.debug(`CallContext: Successfully sent audio toggle action.`);
    } catch (error) {
      logger.error(`CallContext: Failed to send audio toggle action. Reverting state.`, error);
      setIsAudioEnabledState(!newState);
      throw error;
    }
  }, [isAudioEnabled, isVideoEnabled, sendWidgetAction]);

  const toggleVideo = useCallback(async () => {
    const newState = !isVideoEnabled;
    logger.debug(`CallContext: Toggling video. New state: enabled=${newState}`);
    setIsVideoEnabledState(newState);
    try {
      await sendWidgetAction(SET_MEDIA_STATE_ACTION, {
        audio_enabled: isAudioEnabled,
        video_enabled: newState,
      });
      logger.debug(`CallContext: Successfully sent video toggle action.`);
    } catch (error) {
      logger.error(`CallContext: Failed to send video toggle action. Reverting state.`, error);
      setIsVideoEnabledState(!newState);
      throw error;
    }
  }, [isVideoEnabled, isAudioEnabled, sendWidgetAction]);

  const toggleChat = useCallback(async () => {
    const newState = !isChatOpen;
    setIsChatOpenState(newState);
  }, [isChatOpen]);

  const contextValue = useMemo<CallContextState>(
    () => ({
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeClientWidgetApi,
      registerActiveClientWidgetApi,
      sendWidgetAction,
      isChatOpen,
      isAudioEnabled,
      isVideoEnabled,
      toggleAudio,
      toggleVideo,
      toggleChat,
    }),
    [
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeClientWidgetApi,
      registerActiveClientWidgetApi,
      sendWidgetAction,
      isChatOpen,
      isAudioEnabled,
      isVideoEnabled,
      toggleAudio,
      toggleVideo,
      toggleChat,
    ]
  );

  return <CallContext.Provider value={contextValue}>{children}</CallContext.Provider>;
}

export function useCallState(): CallContextState {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCallState must be used within a CallProvider');
  }
  return context;
}
