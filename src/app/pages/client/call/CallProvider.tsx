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
  viewedCallRoomId: string | null;
  setViewedCallRoomId: (roomId: string | null) => void;
  hangUp: () => void;
  activeClientWidgetApi: ClientWidgetApi | null;
  registerActiveClientWidgetApi: (
    roomId: string | null,
    clientWidgetApi: ClientWidgetApi | null
  ) => void;
  registerViewedClientWidgetApi: (
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
const DEFAULT_PRIMARY_IFRAME = true;

export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  const [viewedCallRoomId, setViewedCallRoomIdState] = useState<string | null>(null);
  const [activeClientWidgetApi, setActiveClientWidgetApiState] = useState<ClientWidgetApi | null>(
    null
  );
  const [activeClientWidgetApiRoomId, setActiveClientWidgetApiRoomId] = useState<string | null>(
    null
  );
  const [viewedClientWidgetApi, setViewedClientWidgetApiState] = useState<ClientWidgetApi | null>(
    null
  );
  const [viewedClientWidgetApiRoomId, setViewedClientWidgetApiRoomId] = useState<string | null>(
    null
  );

  const [isAudioEnabled, setIsAudioEnabledState] = useState<boolean>(DEFAULT_AUDIO_ENABLED);
  const [isVideoEnabled, setIsVideoEnabledState] = useState<boolean>(DEFAULT_VIDEO_ENABLED);
  const [isChatOpen, setIsChatOpenState] = useState<boolean>(DEFAULT_CHAT_OPENED);
  const [isCallActive, setIsCallActive] = useState<boolean>(DEFAULT_CALL_ACTIVE);
  const [isPrimaryIframe, setIsPrimaryIframe] = useState<boolean>(DEFAULT_PRIMARY_IFRAME);

  const { roomIdOrAlias: viewedRoomId } = useParams<{ roomIdOrAlias: string }>();

  const resetMediaState = useCallback(() => {
    logger.debug('CallContext: Resetting media state to defaults.');
    setIsAudioEnabledState(DEFAULT_AUDIO_ENABLED);
    setIsVideoEnabledState(DEFAULT_VIDEO_ENABLED);
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

      if (roomId === null || roomId !== activeClientWidgetApiRoomId) {
        logger.warn(
          `CallContext: Clearing active clientWidgetApi because active room changed to ${roomId} or was cleared.`
        );
      }
    },
    [activeClientWidgetApiRoomId, resetMediaState, activeCallRoomId]
  );

  const setViewedCallRoomId = useCallback(
    (roomId: string | null) => {
      logger.warn(`CallContext: Setting activeCallRoomId to ${roomId}`);
      setViewedCallRoomIdState(roomId);
    },
    [setViewedCallRoomIdState]
  );

  const setActiveClientWidgetApi = useCallback(
    (clientWidgetApi: ClientWidgetApi | null, roomId: string | null) => {
      setActiveClientWidgetApiState(clientWidgetApi);
      setActiveClientWidgetApiRoomId(roomId);
    },
    []
  );

  const registerActiveClientWidgetApi = useCallback(
    (roomId: string | null, clientWidgetApi: ClientWidgetApi | null) => {
      if (activeClientWidgetApi && activeClientWidgetApi !== clientWidgetApi) {
        logger.debug(`CallContext: Cleaning up listeners for previous clientWidgetApi instance.`);
        activeClientWidgetApi.removeAllListeners();
      }

      if (roomId && clientWidgetApi) {
        logger.debug(`CallContext: Registering active clientWidgetApi for room ${roomId}.`);
        setActiveClientWidgetApi(clientWidgetApi, roomId);
      } else if (roomId === activeClientWidgetApiRoomId || roomId === null) {
        setActiveClientWidgetApi(null, null);
        resetMediaState();
      }
    },
    [activeClientWidgetApi, activeClientWidgetApiRoomId, setActiveClientWidgetApi, resetMediaState]
  );

  const setViewedClientWidgetApi = useCallback(
    (clientWidgetApi: ClientWidgetApi | null, roomId: string | null) => {
      setViewedClientWidgetApiState(clientWidgetApi);
      setViewedClientWidgetApiRoomId(roomId);
    },
    []
  );

  const registerViewedClientWidgetApi = useCallback(
    (roomId: string | null, clientWidgetApi: ClientWidgetApi | null) => {
      if (viewedClientWidgetApi && viewedClientWidgetApi !== clientWidgetApi) {
        logger.debug(`CallContext: Cleaning up listeners for previous clientWidgetApi instance.`);
        viewedClientWidgetApi.removeAllListeners();
        viewedClientWidgetApi.stop();
      }

      if (roomId && clientWidgetApi) {
        logger.debug(`CallContext: Registering viewed clientWidgetApi for room ${roomId}.`);
        setViewedClientWidgetApi(clientWidgetApi, roomId);
      } else if (roomId === viewedClientWidgetApiRoomId || roomId === null) {
        logger.debug(
          `CallContext: Clearing viewed clientWidgetApi for room ${viewedClientWidgetApiRoomId}.`
        );
        setViewedClientWidgetApi(null, null);
      }
    },
    [viewedClientWidgetApi, viewedClientWidgetApiRoomId, setViewedClientWidgetApi]
  );

  const hangUp = useCallback(() => {
    logger.debug(`CallContext: Hang up called.`);
    activeClientWidgetApi?.transport.send(`${WIDGET_HANGUP_ACTION}`, {});
    setActiveClientWidgetApi(null, null);
    setViewedCallRoomId(activeCallRoomId);
    setIsCallActive(false);
  }, [activeCallRoomId, activeClientWidgetApi?.transport, setActiveClientWidgetApi, setViewedCallRoomId]);

  useEffect(() => {
    if (!activeCallRoomId && !viewedCallRoomId) {
      return;
    }
    const handleHangup = (ev: CustomEvent) => {
      ev.preventDefault();
      if (ev.detail.widgetId === activeClientWidgetApi?.widget.id) {
        activeClientWidgetApi?.transport.reply(ev.detail, {});
        setIsCallActive(false);
      } else if (ev.detail.widgetId === viewedClientWidgetApi?.widget.id) {
        viewedClientWidgetApi?.transport.reply(ev.detail, {});
        setIsCallActive(false);
      }
      logger.warn(
        `CallContext: Received hangup action from widget in room ${activeCallRoomId}.`,
        ev
      );
    };

    const handleMediaStateUpdate = (ev: CustomEvent<MediaStatePayload>) => {
      ev.preventDefault();
      logger.debug(
        `CallContext: Received media state update from widget in room ${activeCallRoomId}:`,
        ev.detail
      );

      /* eslint-disable camelcase */
      const { audio_enabled, video_enabled } = ev.detail.data ?? {};

      if (typeof audio_enabled === 'boolean' && audio_enabled !== isAudioEnabled) {
        logger.debug(`CallContext: Updating audio enabled state from widget: ${audio_enabled}`);
        setIsAudioEnabledState(audio_enabled);
      }
      if (typeof video_enabled === 'boolean' && video_enabled !== isVideoEnabled) {
        logger.debug(`CallContext: Updating video enabled state from widget: ${video_enabled}`);
        setIsVideoEnabledState(video_enabled);
      }
      /* eslint-enable camelcase */
    };

    const handleOnScreenStateUpdate = (ev: CustomEvent) => {
      ev.preventDefault();
      if (isPrimaryIframe) {
        activeClientWidgetApi?.transport.reply(ev.detail, {});
      } else {
        viewedClientWidgetApi?.transport.reply(ev.detail, {});
      }
    };

    const handleJoin = (ev: CustomEvent) => {
      ev.preventDefault();
      const setViewedAsActive = () => {
        setActiveClientWidgetApi(viewedClientWidgetApi, viewedCallRoomId);
        setActiveCallRoomIdState(viewedCallRoomId);
        setViewedClientWidgetApi(null, null);
        setIsPrimaryIframe(!isPrimaryIframe);
        setIsCallActive(true);
      };

      activeClientWidgetApi?.transport.reply(ev.detail, {});
      if (ev.detail.widgetId === activeClientWidgetApi?.widget.id) {
        setIsCallActive(true);
        return;
      }
      if (activeClientWidgetApi) {
        if (isCallActive && viewedClientWidgetApi) {
          activeClientWidgetApi?.removeAllListeners();
          activeClientWidgetApi?.transport.send(WIDGET_HANGUP_ACTION, {}).then(() => {
            setViewedAsActive();
          });
        } else {
          setIsCallActive(true);
        }
      } else {
        setViewedAsActive();
      }
    };

    logger.debug(
      `CallContext: Setting up listeners for clientWidgetApi in room ${activeCallRoomId}`
    );
    activeClientWidgetApi?.on(`action:${WIDGET_HANGUP_ACTION}`, handleHangup);
    activeClientWidgetApi?.on(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
    activeClientWidgetApi?.on(`action:${WIDGET_ON_SCREEN_ACTION}`, handleOnScreenStateUpdate);
    activeClientWidgetApi?.on(`action:${WIDGET_JOIN_ACTION}`, handleJoin);

    viewedClientWidgetApi?.on(`action:${WIDGET_JOIN_ACTION}`, handleJoin);
    viewedClientWidgetApi?.on(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
    viewedClientWidgetApi?.on(`action:${WIDGET_ON_SCREEN_ACTION}`, handleOnScreenStateUpdate);
    viewedClientWidgetApi?.on(`action:${WIDGET_HANGUP_ACTION}`, handleHangup);
  }, [
    activeClientWidgetApi,
    activeCallRoomId,
    activeClientWidgetApiRoomId,
    hangUp,
    isChatOpen,
    isAudioEnabled,
    isVideoEnabled,
    isCallActive,
    viewedRoomId,
    viewedClientWidgetApi,
    isPrimaryIframe,
    viewedCallRoomId,
    setViewedClientWidgetApi,
    setActiveClientWidgetApi,
  ]);

  const sendWidgetAction = useCallback(
    async <T = unknown,>(action: WidgetApiToWidgetAction | string, data: T): Promise<void> => {
      if (!activeClientWidgetApi) {
        logger.warn(
          `CallContext: Cannot send action '${action}', no active API clientWidgetApi registered.`
        );
        return Promise.reject(new Error('No active call clientWidgetApi'));
      }
      if (!activeClientWidgetApiRoomId || activeClientWidgetApiRoomId !== activeCallRoomId) {
        logger.debug(
          `CallContext: Cannot send action '${action}', clientWidgetApi room (${activeClientWidgetApiRoomId}) does not match active call room (${activeCallRoomId}). Stale clientWidgetApi?`
        );
        return Promise.reject(new Error('Mismatched active call clientWidgetApi'));
      }
      logger.debug(
        `CallContext: Sending action '${action}' via active clientWidgetApi (room: ${activeClientWidgetApiRoomId}) with data:`,
        data
      );
      await activeClientWidgetApi.transport.send(action as WidgetApiAction, data);
    },
    [activeClientWidgetApi, activeCallRoomId, activeClientWidgetApiRoomId]
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
      viewedCallRoomId,
      setViewedCallRoomId,
      hangUp,
      activeClientWidgetApi,
      registerActiveClientWidgetApi,
      registerViewedClientWidgetApi,
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
      viewedCallRoomId,
      setViewedCallRoomId,
      hangUp,
      activeClientWidgetApi,
      registerActiveClientWidgetApi,
      registerViewedClientWidgetApi,
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
