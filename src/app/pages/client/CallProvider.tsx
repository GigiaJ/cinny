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
import { WidgetApiToWidgetAction, ITransport, WidgetApiAction } from 'matrix-widget-api';

interface MediaStatePayload {
  audio_enabled?: boolean;
  video_enabled?: boolean;
}

const WIDGET_MEDIA_STATE_UPDATE_ACTION = 'io.element.device_mute';
const WIDGET_HANGUP_ACTION = 'io.element.hangup';
const SET_MEDIA_STATE_ACTION = 'io.element.device_mute';

interface CallContextState {
  activeCallRoomId: string | null;
  setActiveCallRoomId: (roomId: string | null) => void;
  hangUp: () => void;
  activeApiTransport: ITransport | null;
  registerActiveTransport: (roomId: string | null, transport: ITransport | null) => void;
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

const DEFAULT_AUDIO_ENABLED = false;
const DEFAULT_VIDEO_ENABLED = false;
const DEFAULT_CHAT_OPENED = false;

export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  const [activeApiTransport, setActiveApiTransportState] = useState<ITransport | null>(null);
  const [transportRoomId, setTransportRoomId] = useState<string | null>(null);

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

      if (roomId === null || roomId !== transportRoomId) {
        logger.warn(
          `CallContext: Clearing active transport because active room changed to ${roomId} or was cleared.`
        );
        setActiveApiTransportState(null);
        setTransportRoomId(null);
      }
    },
    [transportRoomId, resetMediaState, activeCallRoomId]
  );

  const hangUp = useCallback(() => {
    logger.debug(`CallContext: Hang up called.`);
    setActiveCallRoomIdState(null);
    logger.debug(`CallContext: Clearing active transport due to hangup.`);
    setActiveApiTransportState(null);
    setTransportRoomId(null);
    resetMediaState();
  }, [resetMediaState]);

  const setActiveTransport = useCallback((transport: ITransport | null, roomId: string | null) => {
    setActiveApiTransportState(transport);
    setTransportRoomId(roomId);
  }, []);

  const registerActiveTransport = useCallback(
    (roomId: string | null, transport: ITransport | null) => {
      if (activeApiTransport && activeApiTransport !== transport) {
        logger.debug(`CallContext: Cleaning up listeners for previous transport instance.`);
      }

      if (roomId && transport) {
        logger.debug(`CallContext: Registering active transport for room ${roomId}.`);
        setActiveTransport(transport, roomId);
      } else if (roomId === transportRoomId || roomId === null) {
        logger.debug(`CallContext: Clearing active transport for room ${transportRoomId}.`);
        setActiveTransport(null, null);
        resetMediaState();
      } else {
        logger.debug(
          `CallContext: Ignoring transport registration/clear request for room ${roomId}, as current transport belongs to ${transportRoomId}.`
        );
      }
    },
    [activeApiTransport, transportRoomId, setActiveTransport, resetMediaState]
  );

  useEffect(() => {
    if (!activeApiTransport || !activeCallRoomId || transportRoomId !== activeCallRoomId) {
      return;
    }

    const transport = activeApiTransport;

    const handleHangup = (ev: CustomEvent) => {
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
      const { audio_enabled, video_enabled } = ev.detail;
      if (typeof audio_enabled === 'boolean' && audio_enabled !== isAudioEnabled) {
        logger.debug(`CallContext: Updating audio enabled state from widget: ${audio_enabled}`);
        setIsAudioEnabledState(audio_enabled);
      }
      if (typeof video_enabled === 'boolean' && video_enabled !== isVideoEnabled) {
        logger.debug(`CallContext: Updating video enabled state from widget: ${video_enabled}`);
        setIsVideoEnabledState(video_enabled);
      }
    };

    logger.debug(`CallContext: Setting up listeners for transport in room ${activeCallRoomId}`);
    transport.on(`action:${WIDGET_HANGUP_ACTION}`, handleHangup); // Use standard hangup action name
    transport.on(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);

    return () => {
      logger.debug(`CallContext: Cleaning up listeners for transport in room ${activeCallRoomId}`);
      if (transport) {
        transport.off(`action:${WIDGET_HANGUP_ACTION}`, handleHangup);
        transport.off(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
      }
    };
  }, [
    activeApiTransport,
    activeCallRoomId,
    transportRoomId,
    hangUp,
    isChatOpen,
    isAudioEnabled,
    isVideoEnabled,
  ]);

  const sendWidgetAction = useCallback(
    async <T = unknown,>(action: WidgetApiToWidgetAction | string, data: T): Promise<void> => {
      if (!activeApiTransport) {
        logger.warn(
          `CallContext: Cannot send action '${action}', no active API transport registered.`
        );
        return Promise.reject(new Error('No active call transport'));
      }
      if (!transportRoomId || transportRoomId !== activeCallRoomId) {
        logger.warn(
          `CallContext: Cannot send action '${action}', transport room (${transportRoomId}) does not match active call room (${activeCallRoomId}). Stale transport?`
        );
        return Promise.reject(new Error('Mismatched active call transport'));
      }
      try {
        logger.debug(
          `CallContext: Sending action '${action}' via active transport (room: ${transportRoomId}) with data:`,
          data
        );
        await activeApiTransport.send<T>(action as WidgetApiAction, data);
      } catch (error) {
        logger.error(`CallContext: Error sending action '${action}':`, error);
        throw error;
      }
    },
    [activeApiTransport, activeCallRoomId, transportRoomId]
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
    setIsChatOpenState(!newState);
  }, [isChatOpen]);

  const contextValue = useMemo<CallContextState>(
    () => ({
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeApiTransport,
      registerActiveTransport,
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
      activeApiTransport,
      registerActiveTransport,
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
