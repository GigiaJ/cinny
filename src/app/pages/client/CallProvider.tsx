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
import {
  WidgetApiToWidgetAction,
  ITransport,
  WidgetApiAction,
  WidgetApiFromWidgetAction,
} from 'matrix-widget-api';

interface MediaStatePayload {
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

const WIDGET_MEDIA_STATE_UPDATE_ACTION = 'io.element.device_mute';

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
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
}

const CallContext = createContext<CallContextState | undefined>(undefined);

interface CallProviderProps {
  children: ReactNode;
}

const DEFAULT_AUDIO_ENABLED = false;
const DEFAULT_VIDEO_ENABLED = false;

export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  const [activeApiTransport, setActiveApiTransportState] = useState<ITransport | null>(null);
  const [transportRoomId, setTransportRoomId] = useState<string | null>(null);

  const [isAudioEnabled, setIsAudioEnabledState] = useState<boolean>(DEFAULT_AUDIO_ENABLED);
  const [isVideoEnabled, setIsVideoEnabledState] = useState<boolean>(DEFAULT_VIDEO_ENABLED);

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
      const { audioEnabled, videoEnabled } = ev.detail;
      if (typeof audioEnabled === 'boolean' && audioEnabled !== isAudioEnabled) {
        logger.debug(`CallContext: Updating audio enabled state from widget: ${audioEnabled}`);
        setIsAudioEnabledState(audioEnabled);
      }
      if (typeof videoEnabled === 'boolean' && videoEnabled !== isVideoEnabled) {
        logger.debug(`CallContext: Updating video enabled state from widget: ${videoEnabled}`);
        setIsVideoEnabledState(videoEnabled);
      }
    };

    logger.debug(`CallContext: Setting up listeners for transport in room ${activeCallRoomId}`);
    transport.on(`action:${WidgetApiFromWidgetAction.HangupCall}`, handleHangup); // Use standard hangup action name
    transport.on(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);

    return () => {
      logger.debug(`CallContext: Cleaning up listeners for transport in room ${activeCallRoomId}`);
      if (transport) {
        transport.off(`action:${WidgetApiFromWidgetAction.HangupCall}`, handleHangup);
        transport.off(`action:${WIDGET_MEDIA_STATE_UPDATE_ACTION}`, handleMediaStateUpdate);
      }
    };
  }, [
    activeApiTransport,
    activeCallRoomId,
    transportRoomId,
    hangUp,
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
        audioEnabled: newState,
        videoEnabled: isVideoEnabled,
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
        audioEnabled: isAudioEnabled,
        videoEnabled: newState,
      });
      logger.debug(`CallContext: Successfully sent video toggle action.`);
    } catch (error) {
      logger.error(`CallContext: Failed to send video toggle action. Reverting state.`, error);
      setIsVideoEnabledState(!newState);
      throw error;
    }
  }, [isVideoEnabled, isAudioEnabled, sendWidgetAction]);

  const contextValue = useMemo<CallContextState>(
    () => ({
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeApiTransport,
      registerActiveTransport,
      sendWidgetAction,
      isAudioEnabled,
      isVideoEnabled,
      toggleAudio,
      toggleVideo,
    }),
    [
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeApiTransport,
      registerActiveTransport,
      sendWidgetAction,
      isAudioEnabled,
      isVideoEnabled,
      toggleAudio,
      toggleVideo,
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
