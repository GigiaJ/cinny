import React, { createContext, useState, useContext, useMemo, useCallback, ReactNode } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';
import { WidgetApiToWidgetAction, ITransport, WidgetApiAction } from 'matrix-widget-api';

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
}

const CallContext = createContext<CallContextState | undefined>(undefined);

interface CallProviderProps {
  children: ReactNode;
}

export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  const [activeApiTransport, setActiveApiTransport] = useState<ITransport | null>(null);
  const [transportRoomId, setTransportRoomId] = useState<string | null>(null);

  // --- Actions ---
  const setActiveCallRoomId = useCallback(
    (roomId: string | null) => {
      logger.debug(`CallContext: Setting activeCallRoomId to ${roomId}`);
      setActiveCallRoomIdState(roomId);
      if (roomId === null || roomId !== transportRoomId) {
        logger.debug(
          `CallContext: Clearing active transport because active room changed or was cleared.`
        );
        setActiveApiTransport(null);
        setTransportRoomId(null);
      }
    },
    [transportRoomId]
  );

  const hangUp = useCallback(() => {
    logger.debug(`CallContext: Hang up called.`);
    setActiveCallRoomIdState(null);
    logger.debug(`CallContext: Clearing active transport due to hangup.`);
    setActiveApiTransport(null);
    setTransportRoomId(null);
  }, []);

  const registerActiveTransport = useCallback(
    (roomId: string | null, transport: ITransport | null) => {
      if (roomId && transport) {
        logger.debug(`CallContext: Registering active transport for room ${roomId}.`);
        setActiveApiTransport(transport);
        setTransportRoomId(roomId);
      } else if (roomId === transportRoomId || roomId === null) {
        logger.debug(`CallContext: Clearing active transport for room ${transportRoomId}.`);
        setActiveApiTransport(null);
        setTransportRoomId(null);
      } else {
        logger.debug(
          `CallContext: Ignoring transport clear request for room ${roomId}, as current transport belongs to ${transportRoomId}.`
        );
      }
    },
    [transportRoomId]
  );

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
        return Promise.reject(error);
      }
    },
    [activeApiTransport, activeCallRoomId, transportRoomId]
  );

  // --- Memoize Context Value ---
  const contextValue = useMemo<CallContextState>(
    () => ({
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeApiTransport,
      registerActiveTransport,
      sendWidgetAction,
    }),
    [
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      activeApiTransport,
      registerActiveTransport,
      sendWidgetAction,
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
