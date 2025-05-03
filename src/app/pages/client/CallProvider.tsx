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
import { useParams } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';

interface MediaStatePayload {
  data?: {
    audio_enabled?: boolean;
    video_enabled?: boolean;
  };
}

const WIDGET_MEDIA_STATE_UPDATE_ACTION = 'io.element.device_mute';
const WIDGET_HANGUP_ACTION = 'im.vector.hangup';
const WIDGET_ON_SCREEN_ACTION = 'set_always_on_screen';
const WIDGET_JOIN_ACTION = 'io.element.join';

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
  isCallActive: boolean;
  isPrimaryIframe: boolean;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  toggleChat: () => Promise<void>;
  toggleIframe: () => Promise<void>;
}

const CallContext = createContext<CallContextState | undefined>(undefined);

interface CallProviderProps {
  children: ReactNode;
}

const DEFAULT_AUDIO_ENABLED = true;
const DEFAULT_VIDEO_ENABLED = false;
const DEFAULT_CHAT_OPENED = false;
const DEFAULT_CALL_ACTIVE = false;
const DEFAULT_PRIMARY_IFRAME = false;

export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  const [activeClientWidgetApi, setActiveClientWidgetApiState] = useState<ClientWidgetApi | null>(
    null
  );
  const [clientWidgetApiRoomId, setClientWidgetApiRoomId] = useState<string | null>(null);

  const [isAudioEnabled, setIsAudioEnabledState] = useState<boolean>(DEFAULT_AUDIO_ENABLED);
  const [isVideoEnabled, setIsVideoEnabledState] = useState<boolean>(DEFAULT_VIDEO_ENABLED);
  const [isChatOpen, setIsChatOpenState] = useState<boolean>(DEFAULT_CHAT_OPENED);
  const [isCallActive, setIsCallActive] = useState<boolean>(DEFAULT_CALL_ACTIVE);
  const [isPrimaryIframe, setIsPrimaryIframe] = useState<boolean>(DEFAULT_PRIMARY_IFRAME);

  const { roomIdOrAlias: viewedRoomId } = useParams<{ roomIdOrAlias: string }>();
  const mx = useMatrixClient();
  const room = mx.getRoom(viewedRoomId);

  const resetMediaState = useCallback(() => {
    logger.debug('CallContext: Resetting media state to defaults.');
    setIsAudioEnabledState(DEFAULT_AUDIO_ENABLED);
    setIsVideoEnabledState(DEFAULT_VIDEO_ENABLED);
    //setIsChatOpenState(DEFAULT_CHAT_OPENED);
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
    activeClientWidgetApi?.transport.send(`${WIDGET_HANGUP_ACTION}`, {});
    setIsCallActive(false);
    //setActiveCallRoomId(null);
    //setActiveCallRoomIdState(null);
    //logger.debug(`CallContext: Clearing active clientWidgetApi due to hangup.`);
    //setActiveClientWidgetApiState(null);
    //setClientWidgetApiRoomId(null);
  }, [activeClientWidgetApi?.transport]);

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
    if (
      !activeClientWidgetApi ||
      !activeCallRoomId ||
      clientWidgetApiRoomId !== activeCallRoomId ||
      isCallActive
    ) {
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
      setIsPrimaryIframe(true);
      setIsCallActive(false);
      //hangUp();
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

    const handleOnScreenStateUpdate = (ev: CustomEvent) => {
      ev.preventDefault();
      activeClientWidgetApi.transport.reply(ev.detail, {});
    };

    const handleJoin = (ev: CustomEvent) => {
      ev.preventDefault();
      if (isCallActive) {
        setIsPrimaryIframe(false);
      } else {
        setIsPrimaryIframe(true);
      }
      setIsCallActive(true);
    };

    logger.debug(
      `CallContext: Setting up listeners for clientWidgetApi in room ${activeCallRoomId}`
    );
    clientWidgetApi.on(`action:${WIDGET_HANGUP_ACTION}`, handleHangup);
    clientWidgetApi.on(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
    clientWidgetApi.on(`action:${WIDGET_ON_SCREEN_ACTION}`, handleOnScreenStateUpdate);
    clientWidgetApi.on(`action:${WIDGET_JOIN_ACTION}`, handleJoin);

    return () => {
      logger.debug(
        `CallContext: Cleaning up listeners for clientWidgetApi in room ${activeCallRoomId}`
      );
      if (clientWidgetApi) {
        //clientWidgetApi.off(`action:${WIDGET_HANGUP_ACTION}`, handleHangup);
        //clientWidgetApi.off(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
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
    isCallActive,
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
      await sendWidgetAction(WIDGET_MEDIA_STATE_UPDATE_ACTION, {
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
      await sendWidgetAction(WIDGET_MEDIA_STATE_UPDATE_ACTION, {
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

  const toggleIframe = useCallback(async () => {
    const newState = !isPrimaryIframe;
    setIsPrimaryIframe(newState);
  }, [isPrimaryIframe]);

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
      isCallActive,
      isPrimaryIframe,
      toggleAudio,
      toggleVideo,
      toggleChat,
      toggleIframe,
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
      isCallActive,
      isPrimaryIframe,
      toggleAudio,
      toggleVideo,
      toggleChat,
      toggleIframe,
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
