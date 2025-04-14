import EventEmitter from 'events';
import { KnownMembership, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  ClientWidgetApi,
  IRoomEvent,
  IStickyActionRequest,
  IWidget,
  IWidgetData,
  MatrixCapabilities,
  WidgetKind,
} from 'matrix-widget-api';
import { logger } from 'matrix-js-sdk/lib/logger';
import { CinnyWidget } from './CinnyWidget';
import { SmallWidgetDriver } from './SmallWidgetDriver';

/**
 * Generates the URL for the Element Call widget.
 * @param mx - The MatrixClient instance.
 * @param roomId - The ID of the room.
 * @returns The generated URL object.
 */
export const getWidgetUrl = (mx: MatrixClient, roomId: string): URL => {
  const baseUrl = window.location.origin;
  // Ensure the path is correct relative to the application's structure
  let url = new URL('./dist/element-call/dist/index.html', baseUrl);

  const params = new URLSearchParams({
    embed: 'true',
    widgetId: `element-call-${roomId}`,
    preload: 'true', // Consider if preloading is always desired
    skipLobby: 'false', // Configurable based on needs
    returnToLobby: 'true',
    perParticipantE2EE: 'true',
    hideHeader: 'true',
    userId: mx.getUserId()!,
    deviceId: mx.getDeviceId()!,
    roomId: roomId,
    baseUrl: mx.baseUrl!, // Ensure baseUrl is available
    parentUrl: window.location.origin, // Optional, might be needed by widget
    // lang: getCurrentLanguage().replace("_", "-"), // Add language if needed
    // theme: "$org.matrix.msc2873.client_theme", // Add theme if needed
  });

  // Replace '$' encoded as %24 if necessary for template variables
  const replacedParams = params.toString().replace(/%24/g, '$');
  url.hash = `#?${replacedParams}`; // Use #? for query parameters in the hash

  logger.info('Generated Element Call Widget URL:', url.toString()); // Use info level for clarity
  return url;
};

// --- Widget Interfaces and Classes ---

// Interface describing the data structure for the widget
export interface IApp extends IWidget {
  client: MatrixClient;
  roomId: string;
  eventId?: string;
  avatar_url?: string;
  'io.element.managed_hybrid'?: boolean;
}

// Custom EventEmitter class to manage widget communication setup
export class Edget extends EventEmitter {
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
    const driver = new SmallWidgetDriver(
      this.client,
      [],
      this.mockWidget,
      WidgetKind.Room,
      true,
      this.roomId
    );

    this.messaging = new ClientWidgetApi(this.mockWidget, iframe, driver);

    // Emit events during the widget lifecycle
    this.messaging.on('preparing', () => this.emit('preparing'));
    this.messaging.on('error:preparing', (err: unknown) => this.emit('error:preparing', err));
    this.messaging.once('ready', () => this.emit('ready'));
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

    this.messaging.on('action:org.matrix.msc2876.read_events', (ev: CustomEvent) => {
      ev.preventDefault();
      const room = this.client.getRoom(this.roomId);
      logger.error('CAN WE GET MUCH HIGHER');

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

      this.messaging?.transport.reply(ev.detail, { event: ['CATS BABY'] });
    });

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
        }
      }
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
  };

  /*
  private onStateUpdate = (ev: MatrixEvent): void => {
    if (this.messaging === null) return;
    const raw = ev.getEffectiveEvent();
    logger.error(raw);
    this.messaging.feedEvent(raw as IRoomEvent).catch((e) => {
      logger.error('Error sending state update to widget: ', e);
    });
  };
  */

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

  // eslint-disable-next-line class-methods-use-this
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
          logger.error('Error sending event to widget: ', e);
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
export const getWidgetData = (
  client: MatrixClient,
  roomId: string,
  currentData: object,
  overwriteData: object
): IWidgetData => {
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
export const createVirtualWidget = (
  client: MatrixClient,
  id: string,
  creatorUserId: string,
  name: string,
  type: string,
  url: URL,
  waitForIframeLoad: boolean,
  data: IWidgetData,
  roomId: string
): IApp => ({
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
  content: {
    // Example content structure
    type,
    url: url.toString(),
    name,
    data,
    creatorUserId,
  },
});
