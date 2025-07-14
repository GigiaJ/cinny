import { EventType } from "matrix-js-sdk";

const DEFAULT_NOTIFICATION_ICON = '/public/res/apple/apple-touch-icon-180x180.png';
const DEFAULT_NOTIFICATION_BADGE = '/public/res/apple-touch-icon-72x72.png';

export const usePushNotifications = (self: ServiceWorkerGlobalScope) => {

  const showNotificationWithData = async (
    title: string,
    body: string,
    data: any,
    silent: boolean | null = null
  ) => {
    await self.registration.showNotification(title, {
      body,
      icon: DEFAULT_NOTIFICATION_ICON,
      badge: DEFAULT_NOTIFICATION_BADGE,
      tag: data?.event_id ?? "Cinny",
      silent,
      data
    });
  };

  const handleRoomMessageNotification = async (pushData: any) => {
    const title = pushData?.sender_display_name && pushData?.room_name
      ? `${pushData.sender_display_name} in ${pushData.room_name}`
      : "New Notification";
    const body = pushData?.content?.body ?? "You have a new message";
    const data = {
      type: pushData!.type,
      room_id: pushData!.room_id,
      event_id: pushData!.event_id,
      timestamp: Date.now(),
      ...pushData.data
    };
    await showNotificationWithData(title, body, data, pushData.silent ?? false);
  }

  const handleEncryptedMessageNotification = async (pushData: any) => {
    const title = pushData?.sender_display_name && pushData?.room_name
      ? `${pushData.sender_display_name} in ${pushData.room_name}`
      : "New Notification";
    const body = "Encrypted message";
    const data = {
      type: pushData!.type,
      room_id: pushData!.room_id,
      event_id: pushData!.event_id,
      timestamp: Date.now(),
      ...pushData.data
    };
    await showNotificationWithData(title, body, data, pushData.silent ?? false);
  }

  const handleInvitationNotification = async (pushData: any) => {
    const sender_display_name = pushData?.sender_display_name;
    const room_name = pushData?.room_name;

    let body: string = "";
    if (sender_display_name && room_name)
      body = `${sender_display_name} invites you to ${room_name}`;
    if (sender_display_name && !room_name)
      body = `from ${sender_display_name}`;
    if (!sender_display_name && room_name)
      body = `to ${room_name}`;
    if (!sender_display_name && !room_name)
      body = "";

    const data = {
      type: pushData!.type,
      content: pushData!.content,
      timestamp: Date.now(),
      ...pushData.data
    }

    await showNotificationWithData(
      "New Invitation",
      body,
      data
    )
  };

  const handlePushNotificationPushData = async (pushData: any) => {
    const eventType = pushData?.type as (EventType | undefined);
    if (!eventType) {
      console.log("no event type");
      return;
    }

    switch (eventType) {
      case EventType.RoomMessage:
        await handleRoomMessageNotification(pushData);
        return;
      case EventType.RoomMessageEncrypted:
        await handleEncryptedMessageNotification(pushData);
        return;
      case EventType.RoomMember:
        if (!(pushData?.content?.membership == "invite")) return;
        await handleInvitationNotification(pushData);
        return;
      default:
        // no voip support in app anyway
        return;
    }
  };

  return { handlePushNotificationPushData };
}
