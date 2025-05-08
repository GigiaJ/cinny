import { Room } from 'matrix-js-sdk';
import React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box } from 'folds';
import { RoomViewHeader } from './RoomViewHeader';

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func(...args), waitFor);
  };
}

type OriginalStyles = {
  position?: string;
  top?: string;
  left?: string;
  width?: string;
  height?: string;
  zIndex?: string;
  display?: string;
  visibility?: string;
  pointerEvents?: string;
  border?: string;
};

export function CallView({ room, eventId }: { room: Room; eventId?: string }) {
  const { iframeRef } = useOutletContext<{
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
  }>();
  const iframeHostRef = useRef<HTMLDivElement>(null);

  const originalIframeStylesRef = useRef<OriginalStyles | null>(null);

  const shouldDisplayCallIFrame =
    room && typeof room.isCallRoom === 'function' && room.isCallRoom();

  const applyFixedPositioningToIframe = useCallback(() => {
    const iframeElement = iframeRef?.current;
    const hostElement = iframeHostRef?.current;

    if (iframeElement && hostElement) {
      // Save original styles only ONCE per "portaling" session
      if (!originalIframeStylesRef.current) {
        const computed = window.getComputedStyle(iframeElement);
        originalIframeStylesRef.current = {
          position: iframeElement.style.position || computed.position,
          top: iframeElement.style.top || computed.top,
          left: iframeElement.style.left || computed.left,
          width: iframeElement.style.width || computed.width,
          height: iframeElement.style.height || computed.height,
          zIndex: iframeElement.style.zIndex || computed.zIndex,
          display: iframeElement.style.display || computed.display,
          visibility: iframeElement.style.visibility || computed.visibility,
          pointerEvents: iframeElement.style.pointerEvents || computed.pointerEvents,
          border: iframeElement.style.border || computed.border,
        };
      }

      const hostRect = hostElement.getBoundingClientRect();

      // Apply fixed positioning relative to the viewport, but aligned with the host
      iframeElement.style.position = 'fixed';
      iframeElement.style.top = `${hostRect.top}px`;
      iframeElement.style.left = `${hostRect.left}px`;
      iframeElement.style.width = `${hostRect.width}px`;
      iframeElement.style.height = `${hostRect.height}px`;
      iframeElement.style.border = 'none';
      iframeElement.style.zIndex = '1000'; // Ensure it's on top
      iframeElement.style.display = 'block';
      iframeElement.style.visibility = 'visible';
      iframeElement.style.pointerEvents = 'auto';
    }
  }, [iframeRef, iframeHostRef]);

  const debouncedApplyFixedPositioning = useCallback(debounce(applyFixedPositioningToIframe, 50), [
    applyFixedPositioningToIframe,
  ]);

  useEffect(() => {
    const iframeElement = iframeRef?.current;
    const hostElement = iframeHostRef?.current;

    if (shouldDisplayCallIFrame && iframeElement && hostElement) {
      applyFixedPositioningToIframe();

      const resizeObserver = new ResizeObserver(debouncedApplyFixedPositioning);
      resizeObserver.observe(hostElement);
      window.addEventListener('scroll', debouncedApplyFixedPositioning, true);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('scroll', debouncedApplyFixedPositioning, true);

        if (iframeElement && originalIframeStylesRef.current) {
          const originalStyles = originalIframeStylesRef.current;
          (Object.keys(originalStyles) as Array<keyof OriginalStyles>).forEach((key) => {
            iframeElement.style[key] = originalStyles[key] || '';
          });
        }
        originalIframeStylesRef.current = null;
      };
    }
    if (iframeElement && originalIframeStylesRef.current) {
      const originalStyles = originalIframeStylesRef.current;
      (Object.keys(originalStyles) as Array<keyof OriginalStyles>).forEach((key) => {
        iframeElement.style[key] = originalStyles[key] || '';
      });
      originalIframeStylesRef.current = null;
    }
  }, [
    shouldDisplayCallIFrame,
    iframeRef,
    applyFixedPositioningToIframe,
    debouncedApplyFixedPositioning,
  ]);

  return (
    <Box
      direction="Column"
      style={{
        width: '60%',
        display: room.isCallRoom() ? 'flex' : 'none',
      }}
    >
      <RoomViewHeader />
      <div
        ref={iframeHostRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}
