import React, { ReactNode, useMemo } from 'react';
import { Box } from 'folds';
import { useParams } from 'react-router-dom';
import { useCallState } from './CallProvider';
import { PersistentCallContainer } from '../call/PersistentCallContainer';
import { useMatrixClient } from '../../hooks/useMatrixClient';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const { activeCallRoomId } = useCallState();
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
          <Box
            grow="Yes"
            style={{
              display: isCall ? 'none' : 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
            }}
            className="outlet-wrapper"
          >
            {children}
          </Box>
          <PersistentCallContainer isVisible={isCall} viewedRoomId={viewedRoomId} />
        </Box>
      </Box>{' '}
    </Box>
  );
}
