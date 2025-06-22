import { useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Descendant } from 'slate';
import { debounce } from 'lodash-es';
import { MatrixClient, MatrixEvent, IEvent, IEncryptedContent, CryptoBackend } from 'matrix-js-sdk';

import { useMatrixClient } from './useMatrixClient';
import { atomWithIndexedDB } from '../state/utils/atomWithIndexedDB';
import { sessionsAtom } from '../state/sessions';

export interface SyncedDraft {
  content: Descendant[];
  ts: number;
}

const DRAFT_EVENT_TYPE = 'org.cinny.draft.v1';

/**
 * Encrypts a draft and returns the entire event for storage.
 */
export async function encryptDraft(
  mx: MatrixClient,
  roomId: string,
  draftData: SyncedDraft
): Promise<IEvent | null> {
  const cryptoApi = mx.getCrypto();
  const userId = mx.getUserId();

  if (!cryptoApi || !userId) {
    console.error('Cannot encrypt draft: E2EE or userId is not available.');
    return null;
  }
  const cryptoBackend = cryptoApi as CryptoBackend;

  try {
    const eventContent = {
      msgtype: 'm.text',
      body: 'draft',
      ...draftData,
    };

    const dummyEvent = new MatrixEvent({
      type: DRAFT_EVENT_TYPE,
      room_id: roomId,
      sender: userId,
      event_id: `$${mx.makeTxnId()}`,
      origin_server_ts: Date.now(),
      content: eventContent,
    });

    await cryptoBackend.encryptEvent(dummyEvent);
    if (!dummyEvent.isEncrypted()) {
      const encryptionError = (dummyEvent as any).getEncryptionError?.();
      if (encryptionError) {
        console.error('Encryption failed with an error:', encryptionError);
      } else {
        console.error('Encryption failed silently. The event was not encrypted.');
      }
      return null;
    }

    console.error(dummyEvent);
    return dummyEvent.event;
  } catch (e) {
    console.error(
      `An unexpected error was thrown while trying to encrypt draft for room ${roomId}:`,
      e
    );
    return null;
  }
}

/**
 * Decrypts a draft using the full, saved event data object.
 */
export async function decryptDraft(
  mx: MatrixClient,
  savedEventData: IEvent
): Promise<SyncedDraft | null> {
  if (!savedEventData?.content?.ciphertext) {
    console.error(savedEventData);
    return null;
  }

  const cryptoApi = mx.getCrypto();
  if (!cryptoApi) {
    console.error('Cannot decrypt draft: E2EE is not enabled.');
    return null;
  }
  const cryptoBackend = cryptoApi as CryptoBackend;

  const eventToDecrypt = new MatrixEvent(savedEventData);

  try {
    await eventToDecrypt.attemptDecryption(cryptoBackend);

    const decryptedContent = eventToDecrypt.getClearContent();
    console.warn(decryptedContent);
    if (!decryptedContent) {
      console.log(eventToDecrypt);
      console.error(`Draft decryption completed without error, but clear content is null.`);
      return null;
    }

    delete decryptedContent.body;
    delete decryptedContent.msgtype;

    return decryptedContent as SyncedDraft;
  } catch (e) {
    console.error(`An unexpected error was thrown during draft decryption:`, e);
    return null;
  }
}

const draftAtomFamily = atomFamily(
  ({ userId, roomId }: { userId: string; roomId: string }) =>
    atomWithIndexedDB<SyncedDraft | null>(`draft-${userId}-${roomId}`, null),
  (a, b) => a.userId === b.userId && a.roomId === b.roomId
);

export function useMessageDraft(roomId: string) {
  const mx = useMatrixClient();
  const [sessions] = useAtom(sessionsAtom);
  const activeSession = sessions.find((s) => s.userId === mx.getUserId());
  const userId = activeSession?.userId;

  const atomKey = { userId: userId ?? '', roomId };
  const [draft, setDraft] = useAtom(draftAtomFamily(atomKey));

  const lastSyncTimestamp = useRef(0);

  const emptyDraft = useMemo(() => [], []);

  const syncDraftToServer = useCallback(
    debounce(async (newDraft: SyncedDraft | null) => {
      if (!userId) return;
      if (newDraft && newDraft.ts === lastSyncTimestamp.current) return;

      const existingData = mx.getAccountData(DRAFT_EVENT_TYPE)?.getContent() ?? {};

      if (!newDraft) {
        delete existingData[roomId];
        await mx.setAccountData(DRAFT_EVENT_TYPE, existingData);
        return;
      }

      const eventToSave = await encryptDraft(mx, roomId, newDraft);

      if (!eventToSave) {
        console.error('Encryption failed, not saving draft to server.');
        return;
      }

      const newServerData = { ...existingData, [roomId]: eventToSave };
      await mx.setAccountData(DRAFT_EVENT_TYPE, newServerData);
    }, 1500),
    [mx, roomId, userId]
  );

  useEffect(() => {
    if (!mx) return;

    const handleAccountData = async (event: MatrixEvent) => {
      if (event.getType() !== DRAFT_EVENT_TYPE) return;

      const allSyncedDrafts = event.getContent();
      const eventDataToDecrypt = allSyncedDrafts[roomId];

      if (!eventDataToDecrypt) {
        setDraft((currentDraft) => {
          if (currentDraft === null) return null;
          console.debug('Draft deleted on another device, clearing local copy.');
          return null;
        });
        return;
      }

      const serverDraft = await decryptDraft(mx, eventDataToDecrypt);
      if (!serverDraft) return;

      setDraft((currentDraft) => {
        if (serverDraft.ts > (currentDraft?.ts ?? 0)) {
          console.debug('Received newer draft from server.', serverDraft);
          lastSyncTimestamp.current = serverDraft.ts;
          return serverDraft;
        }

        return currentDraft;
      });
    };

    const accountDataEvent = mx.getAccountData(DRAFT_EVENT_TYPE);
    if (accountDataEvent) {
      handleAccountData(accountDataEvent);
    }

    mx.on('accountData' as any, handleAccountData);
    return () => {
      mx.off('accountData' as any, handleAccountData);
    };
  }, [mx, roomId, setDraft]);

  const updateDraft = useCallback(
    (content: Descendant[]) => {
      const isEmpty = content.length <= 1 && toPlainText(content).trim() === '';

      if (isEmpty) {
        setDraft((currentDraft) => {
          if (currentDraft !== null) {
            syncDraftToServer(null);
            return null;
          }
          return null;
        });
      } else {
        const newDraft: SyncedDraft = { content, ts: Date.now() };
        setDraft(newDraft);
        syncDraftToServer(newDraft);
      }
    },

    [setDraft, syncDraftToServer]
  );

  const clearDraft = useCallback(() => {
    setDraft(null);
    syncDraftToServer(null);
  }, [setDraft, syncDraftToServer]);

  return [draft?.content ?? emptyDraft, updateDraft, clearDraft] as const;
}

function toPlainText(nodes: Descendant[]): string {
  return nodes.map((n) => (n as any).children.map((c: any) => c.text).join('')).join('\n');
}
