import { useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useCallback, useEffect, useRef } from 'react';
import { Descendant } from 'slate';
import { debounce } from 'lodash-es';
import { MatrixEvent } from 'matrix-js-sdk';

import { useMatrixClient } from './useMatrixClient';
import { atomWithIndexedDB } from '../state/utils/atomWithIndexedDB';
import { sessionsAtom } from '../state/sessions'; 

export interface SyncedDraft {
  content: Descendant[];
  ts: number;
}

const DRAFT_EVENT_TYPE = 'org.cinny.draft.v1';

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

  const syncDraftToServer = useCallback(
    debounce(async (newDraft: SyncedDraft | null) => {
      if (!userId || newDraft?.ts === lastSyncTimestamp.current) return;

      console.debug('Syncing draft to server...', newDraft);
      const existingData = mx.getAccountData(DRAFT_EVENT_TYPE)?.getContent() ?? {};

      // TODO: Encrypt here
      const newServerData = { ...existingData, [roomId]: newDraft };

      await mx.setAccountData(DRAFT_EVENT_TYPE, newServerData);
    }, 1500), // Debounce for 1.5 seconds
    [mx, roomId, userId]
  );

  useEffect(() => {
    if (!mx) return;

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== DRAFT_EVENT_TYPE) return;

      // TODO: Decrypt here
      const allSyncedDrafts = event.getContent();
      const serverDraft = allSyncedDrafts[roomId] as SyncedDraft | undefined;

      if (serverDraft && serverDraft.ts > (draft?.ts ?? 0)) {
        console.debug('Received newer draft from server.', serverDraft);
        lastSyncTimestamp.current = serverDraft.ts;
        setDraft(serverDraft);
      }
    };

    const accountDataEvent = mx.getAccountData(DRAFT_EVENT_TYPE);
    if (accountDataEvent) handleAccountData(accountDataEvent);

    mx.on('accountData', handleAccountData);
    return () => {
      mx.off('accountData', handleAccountData);
    };
  }, [mx, roomId, draft?.ts, setDraft]);

  const updateDraft = useCallback(
    (content: Descendant[]) => {
      const isEmpty = content.length <= 1 && toPlainText(content).trim() === '';

      if (isEmpty) {
        setDraft(null);
        syncDraftToServer(null);
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

  return [draft?.content ?? [], updateDraft, clearDraft] as const;
}

function toPlainText(nodes: Descendant[]): string {
  return nodes.map((n) => (n as any).children.map((c: any) => c.text).join('')).join('\n');
}
