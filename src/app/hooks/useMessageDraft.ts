import { useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Descendant } from 'slate';
import { debounce } from 'lodash-es';
import { MatrixClient, MatrixEvent, IEvent, CryptoBackend, IContent } from 'matrix-js-sdk';

import { useMatrixClient } from './useMatrixClient';
import { atomWithIndexedDB } from '../state/utils/atomWithIndexedDB';
import { sessionsAtom } from '../state/sessions';

const DRAFT_EVENT_TYPE = 'org.cinny.draft.v1';

const getContentFromEvent = (event: MatrixEvent) => {
  const decryptedContent = event.getClearContent();

  if (!decryptedContent) {
    return event?.event?.content?.content;
  }

  delete decryptedContent.body;
  delete decryptedContent.msgtype;

  return decryptedContent;
};

export async function encryptDraft(
  mx: MatrixClient,
  event: IEvent
): Promise<Partial<IEvent> | null> {
  const cryptoApi = mx.getCrypto();
  const userId = mx.getUserId();

  if (!cryptoApi || !userId) {
    console.error('Cannot encrypt draft: E2EE or userId is not available.');
    return null;
  }
  const cryptoBackend = cryptoApi as CryptoBackend;

  try {
    const dummyEvent = new MatrixEvent({
      ...event,
    });

    await cryptoBackend.encryptEvent(dummyEvent);
    if (!dummyEvent.isEncrypted()) {
      console.error('Encryption failed silently. The event was not encrypted.');
      return null;
    }

    return dummyEvent.event;
  } catch (e) {
    console.error(
      `An unexpected error was thrown while trying to encrypt draft for room ${event?.room_id}:`,
      e
    );
    return null;
  }
}

export async function decryptDraft(
  mx: MatrixClient,
  savedEventData: IEvent
): Promise<IContent | null> {
  const cryptoApi = mx.getCrypto();
  if (!cryptoApi) {
    console.error('Cannot decrypt draft: E2EE is not enabled.');
    return null;
  }
  const cryptoBackend = cryptoApi as CryptoBackend;

  const eventToDecrypt = new MatrixEvent(savedEventData);

  try {
    await eventToDecrypt.attemptDecryption(cryptoBackend);
    return getContentFromEvent(eventToDecrypt);
  } catch (e) {
    console.error('An unexpected error was thrown during draft decryption:', e);
    return null;
  }
}

function toPlainText(nodes: Descendant[]): string {
  return nodes.map((n) => (n as any).children?.map((c: any) => c.text).join('') ?? '').join('\n');
}

const draftEventAtomFamily = atomFamily(
  ({ userId, roomId }: { userId: string; roomId: string }) =>
    atomWithIndexedDB<Partial<IEvent> | null>(`draft-event-${userId}-${roomId}`, null),
  (a, b) => a.userId === b.userId && a.roomId === b.roomId
);

const encryptEventAtRest = async (
  mx: MatrixClient,
  event: Partial<IEvent>
): Promise<Partial<IEvent> | null> => await encryptDraft(mx, event);

export function useMessageDraft(roomId: string) {
  const mx = useMatrixClient();
  const [sessions] = useAtom(sessionsAtom);
  const activeSession = sessions.find((s) => s.userId === mx.getUserId());
  const userId = activeSession?.userId;
  const atomKey = { userId: userId ?? '', roomId };
  const [draftEvent, setDraftEvent] = useAtom(draftEventAtomFamily(atomKey));
  const [content, setContent] = useState<Descendant[] | null>(null);
  const emptyDraft = useMemo(() => [{ type: 'paragraph', children: [{ text: '' }] }], []);

  useEffect(() => {
    if (draftEvent) {
      if (draftEvent?.type === 'm.room.encrypted') {
        decryptDraft(mx, draftEvent).then((decryptedEvent) => {
          setContent(decryptedEvent.content);
        });
      } else {
        const event = new MatrixEvent(draftEvent);
        setContent(getContentFromEvent(event) ?? null);
      }
    } else {
      setContent(null);
    }
  }, [draftEvent, mx]);

  const syncDraftToServer = useMemo(
    () =>
      debounce(async (eventToSave: Partial<IEvent> | null) => {
        eventToSave.type = mx.getRoom(roomId)?.hasEncryptionStateEvent()
          ? 'm.room.encrypted'
          : 'm.room.message';
        const existingData = mx.getAccountData(DRAFT_EVENT_TYPE)?.getContent() ?? {};
        let event;
        if (eventToSave?.type === 'm.room.encrypted') {
          event = await encryptEventAtRest(mx, eventToSave);
        } else {
          event = eventToSave;
        }

        if (!event) {
          if (existingData[roomId]) {
            delete existingData[roomId];
            await mx.setAccountData(DRAFT_EVENT_TYPE, existingData);
          }
        } else {
          const newServerData = { ...existingData, [roomId]: event };
          await mx.setAccountData(DRAFT_EVENT_TYPE, newServerData);
        }
      }, 500),
    [mx, roomId]
  );

  useEffect(() => {
    if (!mx) return;

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== DRAFT_EVENT_TYPE) return;

      const allSyncedDrafts = event.getContent();
      const serverEvent = allSyncedDrafts[roomId] as IEvent | undefined;

      // TODO: Fix but should never occur. If this does generate a new event.
      if (!serverEvent) {
        setDraftEvent(null);
        return;
      }

      if (serverEvent.origin_server_ts > (draftEvent?.origin_server_ts ?? 0)) {
        setDraftEvent(serverEvent);
      }
    };

    const accountDataEvent = mx.getAccountData(DRAFT_EVENT_TYPE);
    if (accountDataEvent) {
      handleAccountData(accountDataEvent);
    }

    mx.on('accountData' as any, handleAccountData);
    return () => {
      mx.off('accountData' as any, handleAccountData);
    };
  }, [mx, roomId, draftEvent, setDraftEvent]);

  const clearDraft = useCallback(async () => {
    const partial = {
      sender: userId ?? '',
      type: 'm.room.message', // If encryption at rest for rooms that support it is desired this can be shifted to be a ternary too
      content: { msgtype: 'm.text', body: 'draft', content: [] },
      room_id: roomId,
      origin_server_ts: Date.now(),
      event_id: `$${mx.makeTxnId()}`,
    };

    if (partial) {
      setDraftEvent(partial);
      await syncDraftToServer(partial);
    }
  }, [mx, roomId, setDraftEvent, syncDraftToServer, userId]);

  const updateDraft = useMemo(
    () =>
      debounce(async (newContent: Descendant[]) => {
        const isEmpty = newContent.length <= 1 && toPlainText(newContent).trim() === '';


        if (isEmpty || !draftEvent?.event_id) {
          clearDraft();
          return;
        }
        
        const partial = {
          sender: userId,
          type: 'm.room.message', // If encryption at rest for rooms that support it is desired this can be shifted to be a ternary too
          room_id: roomId,
          content: { msgtype: 'm.text', body: 'draft', content: newContent },
          origin_server_ts: Date.now(),
          event_id: draftEvent?.event_id,
        };

        if (partial) {
          setDraftEvent(partial);
          await syncDraftToServer(partial);
        }
      }, 500),
    [clearDraft, draftEvent?.event_id, roomId, setDraftEvent, syncDraftToServer, userId]
  );

  return [content ?? emptyDraft, updateDraft, clearDraft] as const;
}
