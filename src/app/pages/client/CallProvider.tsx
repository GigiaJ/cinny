import React, { createContext, useState, useContext, useMemo, useCallback, ReactNode } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';
// Import the transport type and action types from matrix-widget-api
import { WidgetApiToWidgetAction, ITransport, AnyWidgetAction } from 'matrix-widget-api'; // Ensure ITransport and AnyWidgetAction are imported

// Define the shape of the context value
interface CallContextState {
  activeCallRoomId: string | null;
  setActiveCallRoomId: (roomId: string | null) => void;
  hangUp: () => void;
  // --- New additions for API interaction ---
  activeApiTransport: ITransport | null; // Hold the active transport
  registerActiveTransport: (roomId: string | null, transport: ITransport | null) => void; // Function for PersistentCallContainer to register/unregister
  sendWidgetAction: <T = unknown>(
    action: WidgetApiToWidgetAction | string, // Allow standard actions or custom string actions
    data: T
  ) => Promise<void>; // Function for any component to send actions
}

// Create the context
const CallContext = createContext<CallContextState | undefined>(undefined);

interface CallProviderProps {
  children: ReactNode;
}

// Create the Provider component
export function CallProvider({ children }: CallProviderProps) {
  const [activeCallRoomId, setActiveCallRoomIdState] = useState<string | null>(null);
  // --- New State: Hold the transport of the currently active widget API ---
  const [activeApiTransport, setActiveApiTransport] = useState<ITransport | null>(null);
  // Store the room ID associated with the current active transport
  const [transportRoomId, setTransportRoomId] = useState<string | null>(null);

  // --- Actions ---
  const setActiveCallRoomId = useCallback(
    (roomId: string | null) => {
      logger.debug(`CallContext: Setting activeCallRoomId to ${roomId}`);
      setActiveCallRoomIdState(roomId);
      // If the room being cleared is the one associated with the transport, clear the transport
      if (roomId === null || roomId !== transportRoomId) {
        logger.debug(
          `CallContext: Clearing active transport because active room changed or was cleared.`
        );
        setActiveApiTransport(null);
        setTransportRoomId(null);
      }
    },
    [transportRoomId]
  ); // Depends on transportRoomId to avoid clearing unnecessarily

  const hangUp = useCallback(() => {
    logger.debug(`CallContext: Hang up called.`);
    setActiveCallRoomIdState(null);
    // Also clear the transport on hangup
    logger.debug(`CallContext: Clearing active transport due to hangup.`);
    setActiveApiTransport(null);
    setTransportRoomId(null);
  }, []);

  // --- New Action: Register/Unregister Transport ---
  // Called by PersistentCallContainer when its widget API is ready or cleaned up
  // Now accepts the roomId associated with the transport
  const registerActiveTransport = useCallback(
    (roomId: string | null, transport: ITransport | null) => {
      if (roomId && transport) {
        logger.debug(`CallContext: Registering active transport for room ${roomId}.`);
        setActiveApiTransport(transport);
        setTransportRoomId(roomId);
      } else {
        // Only clear if the transport being cleared belongs to the currently stored roomId
        // or if roomId is explicitly null (global cleanup)
        if (roomId === transportRoomId || roomId === null) {
          logger.debug(`CallContext: Clearing active transport for room ${transportRoomId}.`);
          setActiveApiTransport(null);
          setTransportRoomId(null);
        } else {
          logger.debug(
            `CallContext: Ignoring transport clear request for room ${roomId}, as current transport belongs to ${transportRoomId}.`
          );
        }
      }
    },
    [transportRoomId] // Depends on the currently stored transportRoomId
  );

  // --- New Action: Send Action to Widget ---
  // Can be called by any component within the provider
  const sendWidgetAction = useCallback(
    async <T = unknown,>(
      action: WidgetApiToWidgetAction | string, // Use the imported type or allow custom strings
      data: T
    ): Promise<void> => {
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
        // Use the transport's send method.
        // The 'action' parameter should match expected Widget API actions.
        // The transport handles wrapping this in the correct message format.
        await activeApiTransport.send<T>(action as AnyWidgetAction, data); // Cast action type if needed by transport method signature
      } catch (error) {
        logger.error(`CallContext: Error sending action '${action}':`, error);
        return Promise.reject(error);
        // Handle error appropriately
      }
    },
    [activeApiTransport, activeCallRoomId, transportRoomId] // Depends on the current transport and active room IDs
  );

  // --- Memoize Context Value ---
  const contextValue = useMemo<CallContextState>(
    () => ({
      activeCallRoomId,
      setActiveCallRoomId,
      hangUp,
      // Add new state and actions to the context value
      activeApiTransport, // Keep exposing transport if direct access is ever needed, but prefer sendWidgetAction
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

  // Provide the context value to children
  return <CallContext.Provider value={contextValue}>{children}</CallContext.Provider>;
}

// --- Custom Hook ---
// Remains the same, but now returns the extended context value
export function useCallState(): CallContextState {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCallState must be used within a CallProvider');
  }
  return context;
}
