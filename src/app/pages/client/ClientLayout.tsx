import React, { ReactNode, useMemo, useRef } from 'react';
import { Box } from 'folds';
import { Outlet, useParams } from 'react-router-dom';
import { useCallState } from './CallProvider';
import { PersistentCallContainer } from '../call/PersistentCallContainer';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { ClientWidgetApi } from 'matrix-widget-api';
import { SmallWidget } from '../../features/room/SmallWidget';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const { activeCallRoomId } = useCallState();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetApiRef = useRef<ClientWidgetApi | null>(null);
  const smallWidgetRef = useRef<SmallWidget | null>(null);

  const backupIframeRef = useRef<HTMLIFrameElement | null>(null);
  const backupWidgetApiRef = useRef<ClientWidgetApi | null>(null);
  const backupSmallWidgetRef = useRef<SmallWidget | null>(null);
  const { roomIdOrAlias: viewedRoomId } = useParams();
  const mx = useMatrixClient();
  const isCall = mx.getRoom(viewedRoomId)?.isCallRoom();

  return (
    <Box grow="Yes" direction="Row" style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Box shrink="No" className="nav-container-styles">
        {nav}
      </Box>
      <Box grow="Yes" direction="Column" style={{ position: 'relative', overflowY: 'auto' }}>
        <Box grow="Yes" style={{ position: 'relative' }}>
          <PersistentCallContainer
            isVisible={false}
            viewedRoomId={viewedRoomId}
            iframeRef={iframeRef}
            widgetApiRef={widgetApiRef}
            smallWidgetRef={smallWidgetRef}
            backupIframeRef={backupIframeRef}
            backupWidgetApiRef={backupWidgetApiRef}
            backupSmallWidgetRef={backupSmallWidgetRef}
          />
          <Box
            grow="Yes"
            style={{
              flexDirection: 'column',
              width: '100%',
              height: '100%',
            }}
            className="outlet-wrapper"
          >
            <Outlet
              context={{
                iframeRef,
                widgetApiRef,
                smallWidgetRef,
                backupIframeRef,
                backupWidgetApiRef,
                backupSmallWidgetRef,
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
