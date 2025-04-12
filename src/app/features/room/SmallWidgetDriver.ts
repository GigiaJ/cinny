import {
    type Capability,
    EventDirection,
    type IOpenIDCredentials,
    type IOpenIDUpdate,
    type ISendDelayedEventDetails,
    type ISendEventDetails,
    type ITurnServer,
    type IReadEventRelationsResult,
    type IRoomEvent,
    MatrixCapabilities,
    OpenIDRequestState,
    type SimpleObservable,
    type Widget,
    WidgetDriver,
    WidgetEventCapability,
    WidgetKind,
    type IWidgetApiErrorResponseDataDetails,
    type ISearchUserDirectoryResult,
    type IGetMediaConfigResult,
    type UpdateDelayedEventAction,
} from "matrix-widget-api";
import {
    ClientEvent,
    type ITurnServer as IClientTurnServer,
    EventType,
    type IContent,
    MatrixError,
    type MatrixEvent,
    Direction,
    THREAD_RELATION_TYPE,
    type SendDelayedEventResponse,
    type StateEvents,
    type TimelineEvents,
    MatrixClient,
} from "matrix-js-sdk";
import {
    type ApprovalOpts,
    type CapabilitiesOpts,
    WidgetLifecycle,
} from "@matrix-org/react-sdk-module-api/lib/lifecycles/WidgetLifecycle";


export class SmallWidgetDriver extends WidgetDriver {
    private allowedCapabilities: Set<Capability>;
    private readonly mxClient: MatrixClient; // Store the client instance

    public constructor(
        mx: MatrixClient,
        allowedCapabilities: Capability[],
        private forWidget: Widget,
        private forWidgetKind: WidgetKind,
        virtual: boolean,
        private inRoomId?: string,
    ) {
        super();
        this.mxClient = mx; // Store the passed instance

        this.allowedCapabilities = new Set([
            ...allowedCapabilities,
            MatrixCapabilities.Screenshots,
        ]);

        // This is a trusted Element Call widget that we control
        this.allowedCapabilities.add(MatrixCapabilities.AlwaysOnScreen);
        this.allowedCapabilities.add(MatrixCapabilities.MSC3846TurnServers);

        // Capability to access the room timeline (MSC2762)
        // Ensure inRoomId is correctly passed during SmallWidgetDriver instantiation
        if (inRoomId) {
            this.allowedCapabilities.add(`org.matrix.msc2762.timeline:${inRoomId}`);
        } else {
            console.warn("inRoomId is undefined, cannot add timeline capability.");
        }
        this.allowedCapabilities.add(MatrixCapabilities.MSC4157SendDelayedEvent);
        this.allowedCapabilities.add(MatrixCapabilities.MSC4157UpdateDelayedEvent);

        this.allowedCapabilities.add(
            WidgetEventCapability.forStateEvent(EventDirection.Receive, EventType.RoomMember).raw,
        );
        this.allowedCapabilities.add(
            WidgetEventCapability.forStateEvent(EventDirection.Receive, "org.matrix.msc3401.call").raw,
        );
        this.allowedCapabilities.add(
            WidgetEventCapability.forStateEvent(EventDirection.Receive, EventType.RoomEncryption).raw,
        );
        const clientUserId = this.mxClient.getUserId();
        // For the legacy membership type
        this.allowedCapabilities.add(
            WidgetEventCapability.forStateEvent(EventDirection.Send, "org.matrix.msc3401.call.member", clientUserId ?? undefined)
                .raw,
        );
        const clientDeviceId = this.mxClient.getDeviceId();
        if (clientDeviceId !== null) {
            // For the session membership type compliant with MSC4143
            this.allowedCapabilities.add(
                WidgetEventCapability.forStateEvent(
                    EventDirection.Send,
                    "org.matrix.msc3401.call.member",
                    `_${clientUserId}_${clientDeviceId}`,
                ).raw,
            );
            // Version with no leading underscore, for room versions whose auth rules allow it
            this.allowedCapabilities.add(
                WidgetEventCapability.forStateEvent(
                    EventDirection.Send,
                    "org.matrix.msc3401.call.member",
                    `${clientUserId}_${clientDeviceId}`,
                ).raw,
            );
        }
        this.allowedCapabilities.add(
            WidgetEventCapability.forStateEvent(EventDirection.Receive, "org.matrix.msc3401.call.member").raw,
        );
        // for determining auth rules specific to the room version
        this.allowedCapabilities.add(
            WidgetEventCapability.forStateEvent(EventDirection.Receive, EventType.RoomCreate).raw,
        );

        const sendRecvRoomEvents = [
            "io.element.call.encryption_keys",
            "org.matrix.rageshake_request",
            EventType.Reaction,
            EventType.RoomRedaction,
            "io.element.call.reaction",
        ];
        for (const eventType of sendRecvRoomEvents) {
            this.allowedCapabilities.add(WidgetEventCapability.forRoomEvent(EventDirection.Send, eventType).raw);
            this.allowedCapabilities.add(WidgetEventCapability.forRoomEvent(EventDirection.Receive, eventType).raw);
        }

        const sendRecvToDevice = [
            EventType.CallInvite,
            EventType.CallCandidates,
            EventType.CallAnswer,
            EventType.CallHangup,
            EventType.CallReject,
            EventType.CallSelectAnswer,
            EventType.CallNegotiate,
            EventType.CallSDPStreamMetadataChanged,
            EventType.CallSDPStreamMetadataChangedPrefix,
            EventType.CallReplaces,
            EventType.CallEncryptionKeysPrefix,
        ];
        for (const eventType of sendRecvToDevice) {
            this.allowedCapabilities.add(
                WidgetEventCapability.forToDeviceEvent(EventDirection.Send, eventType).raw,
            );
            this.allowedCapabilities.add(
                WidgetEventCapability.forToDeviceEvent(EventDirection.Receive, eventType).raw,
            );
        }

        // To always allow OIDC requests for element call, the widgetPermissionStore is used:


    }
}