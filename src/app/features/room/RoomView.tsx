import React, { useCallback, useRef, useEffect } from 'react';
import { Box, Text, config } from 'folds'; // Assuming 'folds' is a UI library
import { CallEvent, ClientEvent, Direction, EventType, MatrixClient, MatrixEvent, MatrixEventEvent, Room, RoomStateEvent } from 'matrix-js-sdk';
import { KnownMembership } from "matrix-js-sdk/src/types";
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import { useStateEvent } from '../../hooks/useStateEvent'; // Assuming custom hook
import { StateEvent } from '../../../types/matrix/room'; // Assuming custom types
import { usePowerLevelsAPI, usePowerLevelsContext } from '../../hooks/usePowerLevels'; // Assuming custom hook
import { useMatrixClient } from '../../hooks/useMatrixClient'; // Assuming custom hook
import { useEditor } from '../../components/editor'; // Assuming custom hook/component
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { RoomTimeline } from './RoomTimeline';
import { RoomViewTyping } from './RoomViewTyping';
import { RoomTombstone } from './RoomTombstone';
import { RoomInput } from './RoomInput';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import { Page } from '../../components/page'; // Assuming custom component
import { RoomViewHeader } from './RoomViewHeader';
import { useKeyDown } from '../../hooks/useKeyDown'; // Assuming custom hook
import { editableActiveElement } from '../../utils/dom'; // Assuming utility function
import navigation from '../../../client/state/navigation'; // Assuming navigation state management
import { settingsAtom } from '../../state/settings'; // Assuming state management (e.g., Jotai/Recoil)
import { useSetting } from '../../state/hooks/settings'; // Assuming custom hook
import { useAccessibleTagColors, usePowerLevelTags } from '../../hooks/usePowerLevelTags'; // Assuming custom hook
import { useTheme } from '../../hooks/useTheme'; // Assuming custom hook
import { logger } from 'matrix-js-sdk/lib/logger';
import { ClientWidgetApi, IRoomEvent, IStickyActionRequest, IWidget, IWidgetData, MatrixCapabilities, Widget, WidgetApiFromWidgetAction, type IWidgetApiRequestEmptyData, WidgetKind, IWidgetApiRequest } from 'matrix-widget-api';
import { SmallWidgetDriver } from './SmallWidgetDriver'; // Assuming custom widget driver
import EventEmitter from 'events';

// --- Constants ---
const FN_KEYS_REGEX = /^F\d+$/;

// --- Helper Functions ---

/**
 * Determines if a keyboard event should trigger focusing the message input field.
 * @param evt - The KeyboardEvent.
 * @returns True if the input should be focused, false otherwise.
 */
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
  const { code } = evt;
  // Ignore if modifier keys are pressed
  if (evt.metaKey || evt.altKey || evt.ctrlKey) {
    return false;
  }

  // Ignore function keys (F1, F2, etc.)
  if (FN_KEYS_REGEX.test(code)) return false;

  // Ignore specific control/navigation keys
  if (
    code.startsWith('OS') ||
    code.startsWith('Meta') ||
    code.startsWith('Shift') ||
    code.startsWith('Alt') ||
    code.startsWith('Control') ||
    code.startsWith('Arrow') ||
    code.startsWith('Page') ||
    code.startsWith('End') ||
    code.startsWith('Home') ||
    code === 'Tab' ||
    code === 'Space' || // Allow space if needed elsewhere, but not for focusing input
    code === 'Enter' || // Allow enter if needed elsewhere
    code === 'NumLock' ||
    code === 'ScrollLock'
  ) {
    return false;
  }

  // If none of the above conditions met, it's likely a character key
  return true;
};

/**
 * Generates the URL for the Element Call widget.
 * @param mx - The MatrixClient instance.
 * @param roomId - The ID of the room.
 * @returns The generated URL object.
 */
const getWidgetUrl = (mx: MatrixClient, roomId: string): URL => {
  const baseUrl = window.location.origin;
  // Ensure the path is correct relative to the application's structure
  let url = new URL("./dist/element-call/dist/index.html", baseUrl);

  const params = new URLSearchParams({
    embed: "true",
    widgetId: `element-call-${roomId}`,
    preload: "true", // Consider if preloading is always desired
    skipLobby: "false", // Configurable based on needs
    returnToLobby: "true",
    perParticipantE2EE: "true",
    hideHeader: "true",
    userId: mx.getUserId()!,
    deviceId: mx.getDeviceId()!,
    roomId: roomId,
    baseUrl: mx.baseUrl!, // Ensure baseUrl is available
    parentUrl: window.location.origin, // Optional, might be needed by widget
    // lang: getCurrentLanguage().replace("_", "-"), // Add language if needed
    // theme: "$org.matrix.msc2873.client_theme", // Add theme if needed
  });

  // Replace '$' encoded as %24 if necessary for template variables
  const replacedParams = params.toString().replace(/%24/g, "$");
  url.hash = `#?${replacedParams}`; // Use #? for query parameters in the hash

  logger.info("Generated Element Call Widget URL:", url.toString()); // Use info level for clarity
  return url;
}

// --- Widget Interfaces and Classes ---

// Interface describing the data structure for the widget
interface IApp extends IWidget {
  "client": MatrixClient;
  "roomId": string;
  "eventId"?: string;
  "avatar_url"?: string;
  "io.element.managed_hybrid"?: boolean;
}

// Wrapper class for the widget definition
class CinnyWidget extends Widget {
  public constructor(private rawDefinition: IApp) {
    super(rawDefinition);
  }
}

// Custom EventEmitter class to manage widget communication setup
class Edget extends EventEmitter {
  private client: MatrixClient;
  private messaging: ClientWidgetApi | null = null;
  private mockWidget: CinnyWidget;
  private roomId?: string;
  private type: string; // Type of the widget (e.g., 'm.call')
  private readUpToMap: { [roomId: string]: string } = {}; // room ID to event ID
  private readonly eventsToFeed = new WeakSet<MatrixEvent>();
  private stickyPromise?: () => Promise<void>;


  constructor(private iapp: IApp) {
    super();
    this.client = iapp.client;
    this.roomId = iapp.roomId;
    this.type = iapp.type;
    this.mockWidget = new CinnyWidget(iapp);
  }

  /**
   * Initializes the widget messaging API.
   * @param iframe - The HTMLIFrameElement to bind to.
   * @returns The initialized ClientWidgetApi instance.
   */
  startMessaging(iframe: HTMLIFrameElement): ClientWidgetApi {
    // Ensure the driver is correctly instantiated
    // The capabilities array might need adjustment based on required permissions
    const driver = new SmallWidgetDriver(this.client, [], this.mockWidget, WidgetKind.Room, true, this.roomId);

    this.messaging = new ClientWidgetApi(this.mockWidget, iframe, driver);

    // Emit events during the widget lifecycle
    this.messaging.on("preparing", () => this.emit("preparing"));
    this.messaging.on("error:preparing", (err: unknown) => this.emit("error:preparing", err));
    this.messaging.once("ready", () => this.emit("ready"));
    // this.messaging.on("capabilitiesNotified", () => this.emit("capabilitiesNotified")); // Uncomment if needed

        // Populate the map of "read up to" events for this widget with the current event in every room.
        // This is a bit inefficient, but should be okay. We do this for all rooms in case the widget
        // requests timeline capabilities in other rooms down the road. It's just easier to manage here.
        for (const room of this.client.getRooms()) {
          // Timelines are most recent last
          const events = room.getLiveTimeline()?.getEvents() || [];
          const roomEvent = events[events.length - 1];
          if (!roomEvent) continue; // force later code to think the room is fresh
          this.readUpToMap[room.roomId] = roomEvent.getId()!;
      }
      
    this.messaging.on("action:org.matrix.msc2876.read_events", ((ev: CustomEvent) => {
      ev.preventDefault();
      const room = this.client.getRoom(this.roomId);
      logger.error("CAN WE GET MUCH HIGHER");

      if (room === null) return [];
      const state = room.getLiveTimeline().getState(Direction.Forward);
      if (state === undefined) return [];
      
      //logger.error("CAN WE GET MUCH HIGHER");
      const event = state.getStateEvents(ev.type, 'true');
      logger.error(event);
      logger.error(ev);
      logger.error(state);
      if (true === undefined) {
          return state.getStateEvents(ev.type).map((e) => e.getEffectiveEvent() as IRoomEvent);
      }
      //const event = state.getStateEvents(ev.type, 'true');
      logger.error(event);
      return event === null ? [] : [event.getEffectiveEvent() as IRoomEvent];

      this.messaging?.transport.reply(ev.detail, {event: ['CATS BABY']});
    }));


  
    

    this.client.on(ClientEvent.Event, this.onEvent);
    this.client.on(MatrixEventEvent.Decrypted, this.onEventDecrypted);
    //this.client.on(RoomStateEvent.Events, this.onStateUpdate);
    this.client.on(ClientEvent.ToDeviceEvent, this.onToDeviceEvent);
    //this.client.on(RoomStateEvent.Events, this.onReadEvent);
    // this.messaging.setViewedRoomId(this.roomId ?? null);
    this.messaging.on(
      `action:${WidgetApiFromWidgetAction.UpdateAlwaysOnScreen}`,
      async (ev: CustomEvent<IStickyActionRequest>) => {
          if (this.messaging?.hasCapability(MatrixCapabilities.AlwaysOnScreen)) {
              ev.preventDefault();
              if (ev.detail.data.value) {
                  // If the widget wants to become sticky we wait for the stickyPromise to resolve
                  if (this.stickyPromise) await this.stickyPromise();
                    this.messaging.transport.reply(ev.detail, {});
              }
              // Stop being persistent can be done instantly
              //MAKE PERSISTENT HERE
              // Send the ack after the widget actually has become sticky.
             ;
          }
       },
    );

    
    logger.info(`Widget messaging started for widgetId: ${this.mockWidget.id}`);
    return this.messaging;
  }
    private onEvent = (ev: MatrixEvent): void => {
        this.client.decryptEventIfNeeded(ev);
        this.feedEvent(ev);
    };

    private onEventDecrypted = (ev: MatrixEvent): void => {
        this.feedEvent(ev);
    };

  private onReadEvent = (ev: MatrixEvent): void => {
    this.feedEvent(ev);
  }


  private onStateUpdate = (ev: MatrixEvent): void => {
    if (this.messaging === null) return;
    const raw = ev.getEffectiveEvent();
    logger.error(raw);
    this.messaging.feedEvent(raw as IRoomEvent).catch((e) => {
        logger.error("Error sending state update to widget: ", e);
    });
  };

  private onToDeviceEvent = async (ev: MatrixEvent): Promise<void> => {
    await this.client.decryptEventIfNeeded(ev);
    if (ev.isDecryptionFailure()) return;
    await this.messaging?.feedToDevice(ev.getEffectiveEvent() as IRoomEvent, ev.isEncrypted());
};

    /**
     * Determines whether the event comes from a room that we've been invited to
     * (in which case we likely don't have the full timeline).
     */
    private isFromInvite(ev: MatrixEvent): boolean {
      const room = this.client.getRoom(ev.getRoomId());
      return room?.getMyMembership() === KnownMembership.Invite;
  }

    /**
     * Determines whether the event has a relation to an unknown parent.
     */
    private relatesToUnknown(ev: MatrixEvent): boolean {
      // Replies to unknown events don't count
      if (!ev.relationEventId || ev.replyEventId) return false;
      const room = this.client.getRoom(ev.getRoomId());
      return room === null || !room.findEventById(ev.relationEventId);
  }

  private arrayFastClone<T>(a: T[]): T[] {
    return a.slice(0, a.length);
  }

  private advanceReadUpToMarker(ev: MatrixEvent): boolean {
    const evId = ev.getId();
    if (evId === undefined) return false;
    const roomId = ev.getRoomId();
    if (roomId === undefined) return false;
    const room = this.client.getRoom(roomId);
    if (room === null) return false;

    const upToEventId = this.readUpToMap[ev.getRoomId()!];
    if (!upToEventId) {
        // There's no marker yet; start it at this event
        this.readUpToMap[roomId] = evId;
        return true;
    }

    // Small optimization for exact match (skip the search)
    if (upToEventId === evId) return false;

    // Timelines are most recent last, so reverse the order and limit ourselves to 100 events
    // to avoid overusing the CPU.
    const timeline = room.getLiveTimeline();
    const events = this.arrayFastClone(timeline.getEvents()).reverse().slice(0, 100);

    for (const timelineEvent of events) {
        if (timelineEvent.getId() === upToEventId) {
            // The event must be somewhere before the "read up to" marker
            return false;
        } else if (timelineEvent.getId() === ev.getId()) {
            // The event is after the marker; advance it
            this.readUpToMap[roomId] = evId;
            return true;
        }
    }

    // We can't say for sure whether the widget has seen the event; let's
    // just assume that it has
    return false;
}


private feedEvent(ev: MatrixEvent): void {
  if (this.messaging === null) return;

  if (
      // If we had decided earlier to feed this event to the widget, but
      // it just wasn't ready, give it another try
      this.eventsToFeed.delete(ev) ||
      // Skip marker timeline check for events with relations to unknown parent because these
      // events are not added to the timeline here and will be ignored otherwise:
      // https://github.com/matrix-org/matrix-js-sdk/blob/d3dfcd924201d71b434af3d77343b5229b6ed75e/src/models/room.ts#L2207-L2213
      this.relatesToUnknown(ev) ||
      // Skip marker timeline check for rooms where membership is
      // 'invite', otherwise the membership event from the invitation room
      // will advance the marker and new state events will not be
      // forwarded to the widget.
      this.isFromInvite(ev) ||
      // Check whether this event would be before or after our "read up to" marker. If it's
      // before, or we can't decide, then we assume the widget will have already seen the event.
      // If the event is after, or we don't have a marker for the room, then the marker will advance and we'll
      // send it through.
      // This approach of "read up to" prevents widgets receiving decryption spam from startup or
      // receiving ancient events from backfill and such.
      this.advanceReadUpToMarker(ev)
  ) {
      // If the event is still being decrypted, remember that we want to
      // feed it to the widget (even if not strictly in the order given by
      // the timeline) and get back to it later
      if (ev.isBeingDecrypted() || ev.isDecryptionFailure()) {
          this.eventsToFeed.add(ev);
      } else {
          const raw = ev.getEffectiveEvent();
          this.messaging.feedEvent(raw as IRoomEvent, this.roomId ?? '').catch((e) => {
              logger.error("Error sending event to widget: ", e);
          });
      }
  }
}

  /**
   * Stops the widget messaging and cleans up resources.
   */
  stopMessaging() {
    if (this.messaging) {
      // Potentially call stop() or remove listeners if the API provides such methods
      // this.messaging.stop(); // Example if a stop method exists
      this.messaging.removeAllListeners(); // Remove listeners attached by Edget
      logger.info(`Widget messaging stopped for widgetId: ${this.mockWidget.id}`);
      this.messaging = null;
    }
    // Clean up driver resources if necessary
    // driver.stop(); // Example
  }
}

/**
 * Creates the data object for the widget.
 * @param client - The MatrixClient instance.
 * @param roomId - The ID of the room.
 * @param currentData - Existing widget data.
 * @param overwriteData - Data to merge or overwrite.
 * @returns The final widget data object.
 */
const getWidgetData = (client: MatrixClient, roomId: string, currentData: object, overwriteData: object): IWidgetData => {
  // Example: Determine E2EE based on room state if needed
  let perParticipantE2EE = true; // Default or based on logic
  // const roomEncryption = client.getRoom(roomId)?.currentState.getStateEvents(EventType.RoomEncryption, "");
  // if (roomEncryption) perParticipantE2EE = true; // Simplified example

  return {
    ...currentData,
    ...overwriteData,
    perParticipantE2EE,
  };
};

/**
 * Creates a virtual widget definition (IApp).
 * @param client - MatrixClient instance.
 * @param id - Widget ID.
 * @param creatorUserId - User ID of the creator.
 * @param name - Widget display name.
 * @param type - Widget type (e.g., 'm.call').
 * @param url - Widget URL.
 * @param waitForIframeLoad - Whether to wait for iframe load signal.
 * @param data - Widget data.
 * @param roomId - Room ID.
 * @returns The IApp widget definition.
 */
const createVirtualWidget = (
  client: MatrixClient,
  id: string,
  creatorUserId: string,
  name: string,
  type: string,
  url: URL,
  waitForIframeLoad: boolean,
  data: IWidgetData,
  roomId: string
): IApp => {
  return {
    client,
    id,
    creatorUserId,
    name,
    type,
    url: url.toString(), // Store URL as string in the definition
    waitForIframeLoad,
    data,
    roomId,
    // Add other required fields from IWidget if necessary
    sender: creatorUserId, // Example: Assuming sender is the creator
    content: { // Example content structure
        type,
        url: url.toString(),
        name,
        data,
        creatorUserId,
    }
  };
};


// --- RoomView Component ---

export function RoomView({ room, eventId }: { room: Room; eventId?: string }) {
  // Refs
  const roomInputRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null); // Ref for the main Page container
  const iframeRef = useRef<HTMLIFrameElement>(null); // Ref for the iframe element
  const widgetApiRef = useRef<ClientWidgetApi | null>(null); // Ref to store the widget API instance
  const edgetRef = useRef<Edget | null>(null); // Ref to store the Edget instance

  // State & Hooks
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const { roomId } = room;
  const editor = useEditor();
  const mx = useMatrixClient();
  const tombstoneEvent = useStateEvent(room, StateEvent.RoomTombstone);
  const powerLevels = usePowerLevelsContext();
  const { getPowerLevel, canSendEvent } = usePowerLevelsAPI(powerLevels);
  const myUserId = mx.getUserId();
  const canMessage = myUserId ? canSendEvent(EventType.RoomMessage, getPowerLevel(myUserId)) : false;
  const [powerLevelTags, getPowerLevelTag] = usePowerLevelTags(room, powerLevels);
  const theme = useTheme();
  const accessibleTagColors = useAccessibleTagColors(theme.kind, powerLevelTags);
  const isCall = room.isCallRoom(); // Determine if it's a call room

  // Effect for focusing input on key press (for non-call rooms)
  useKeyDown(
    window,
    useCallback(
      (evt) => {
        // Don't focus if an editable element already has focus
        if (editableActiveElement()) return;
        // Don't focus if a modal is likely open
        if (document.querySelector('.ReactModalPortal > *') || navigation.isRawModalVisible) {
             return;
        }
        // Don't focus if in a call view (no text editor)
        if (isCall) return;

        // Check if the key pressed should trigger focus or is paste hotkey
        if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
          if (editor) {
             ReactEditor.focus(editor);
          }
        }
      },
      [editor, isCall] // Dependencies
    )
  );

  // Effect to setup and cleanup the widget API for call rooms
  useEffect(() => {
    // Only run if it's a call room
    if (isCall) {
      const iframeElement = iframeRef.current;
      // Ensure iframe element exists before proceeding
      if (!iframeElement) {
        logger.warn(`Iframe element not found for room ${roomId}, cannot initialize widget.`);
        return;
      }

      logger.info(`Setting up Element Call widget for room ${roomId}`);
      const userId = mx.getUserId() ?? ''; // Ensure userId is not null
      const url = getWidgetUrl(mx, roomId); // Generate the widget URL

      // 1. Create the virtual widget definition
      const app = createVirtualWidget(
        mx,
        `element-call-${roomId}`,
        userId,
        'Element Call',
        'm.call', // Widget type
        url,
        false, // waitForIframeLoad - false as we manually control src loading
        getWidgetData( // Widget data
          mx,
          roomId,
          {}, // Initial data (can be fetched if needed)
          { // Overwrite/specific data
            skipLobby: true, // Example configuration
            preload: false, // Set preload based on whether you want background loading
            returnToLobby: false, // Example configuration
          }
        ),
        roomId
      );

      // 2. Instantiate Edget to manage widget communication
      const edget = new Edget(app);
      edgetRef.current = edget; // Store instance in ref

      // 3. Start the widget messaging *before* setting the iframe src
      try {
        const widgetApi = edget.startMessaging(iframeElement);
        widgetApiRef.current = widgetApi; // Store API instance

        // Listen for the 'ready' event from the widget API
        widgetApi.once("ready", () => {
            logger.info(`Element Call widget is ready for room ${roomId}.`);
            // Perform actions needed once the widget confirms it's ready
            // Example: widgetApi.transport.send("action", { data: "..." });
        });

        widgetApi.on("action:im.vector.hangup", () => {
            logger.info(`Received hangup action from widget in room ${roomId}.`);
            // Handle hangup logic (e.g., navigate away, update room state)
        });

        // Add other necessary event listeners from the widget API
        // widgetApi.on("action:some_other_action", (ev) => { ... });

        // 4. Set the iframe src *after* messaging is initialized
        logger.info(`Setting iframe src for room ${roomId}: ${url.toString()}`);
        iframeElement.src = url.toString();

      } catch (error) {
        logger.error(`Error initializing widget messaging for room ${roomId}:`, error);
        // Handle initialization error (e.g., show an error message to the user)
      }

      // 5. Return cleanup function
      return () => {
        logger.info(`Cleaning up Element Call widget for room ${roomId}`);
        // Stop messaging and clean up resources
        if (edgetRef.current) {
          edgetRef.current.stopMessaging();
          edgetRef.current = null;
        }
        widgetApiRef.current = null; // Clear API ref

        // Clear iframe src to stop activity and free resources
        if (iframeRef.current) {
            iframeRef.current.src = 'about:blank';
            logger.info(`Cleared iframe src for room ${roomId}`);
        }
      };
    } else {
      // If not a call room, ensure any previous call state is cleaned up
      // (This might be redundant if component unmounts/remounts correctly, but safe)
      if (widgetApiRef.current && iframeRef.current) {
        logger.info(`Room ${roomId} is no longer a call room, ensuring cleanup.`);
         if (edgetRef.current) {
          edgetRef.current.stopMessaging();
          edgetRef.current = null;
        }
        widgetApiRef.current = null;
        iframeRef.current.src = 'about:blank';
      }
    }

    // Explicitly return undefined if not a call room or no cleanup needed initially
    return undefined;

  }, [isCall, mx, roomId, editor]); // Dependencies: run effect if these change


  // --- Render Logic ---

  // Render Call View
  if (isCall) {
    // Initial src is set to about:blank. The useEffect hook will set the actual src later.
    return (
      <Page ref={roomViewRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <RoomViewHeader />
        {/* Box grows to fill available space */}
        <Box grow="Yes" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <iframe
              ref={iframeRef}
              src="about:blank" // Start with a blank page
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={`Element Call - ${room.name || roomId}`}
              // Sandbox attributes for security. Adjust as needed by Element Call.
              //sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
              // Permissions policy for features like camera, microphone.
              allow="microphone; camera; display-capture; autoplay; clipboard-write;"
            />
        </Box>
         {/* Optional: Minimal footer or status indicators */}
      </Page>
    );
  }

  // Render Standard Text/Timeline Room View
  return (
    <Page ref={roomViewRef}>
      <RoomViewHeader />
      {/* Main timeline area */}
      <Box grow="Yes" direction="Column" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <RoomTimeline
          key={roomId} // Key helps React reset state when room changes
          room={room}
          eventId={eventId}
          roomInputRef={roomInputRef}
          editor={editor}
          getPowerLevelTag={getPowerLevelTag}
          accessibleTagColors={accessibleTagColors}
        />
        <RoomViewTyping room={room} />
      </Box>
      {/* Input area and potentially other footer elements */}
      <Box shrink="No" direction="Column">
        <div style={{ padding: `0 ${config.space.S400}` }}> {/* Use theme spacing */}
          {tombstoneEvent ? (
            <RoomTombstone
              roomId={roomId}
              body={tombstoneEvent.getContent().body}
              replacementRoomId={tombstoneEvent.getContent().replacement_room}
            />
          ) : (
            <>
              {canMessage ? (
                <RoomInput
                  room={room}
                  editor={editor}
                  roomId={roomId}
                  fileDropContainerRef={roomViewRef} // Pass the Page ref for file drops
                  ref={roomInputRef}
                  getPowerLevelTag={getPowerLevelTag}
                  accessibleTagColors={accessibleTagColors}
                />
              ) : (
                <RoomInputPlaceholder
                  style={{ padding: config.space.S200 }}
                  alignItems="Center"
                  justifyContent="Center"
                >
                  <Text align="Center">You do not have permission to post in this room</Text>
                </RoomInputPlaceholder>
              )}
            </>
          )}
        </div>
        {/* Following/Activity Feed */}
        {hideActivity ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
      </Box>
    </Page>
  );
}
