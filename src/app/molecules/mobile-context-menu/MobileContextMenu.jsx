import React, { useEffect } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from 'react-use-gesture';
import './MobileContextMenu.scss';

export function MobileContextMenu({ isOpen, onClose, children }) {
  const { innerHeight } = window;
  useEffect(() => {
    if (isOpen) {
      document.body.style.overscrollBehavior = 'contain';
    }
    return () => {
      document.body.style.overscrollBehavior = 'auto';
    };
  }, [isOpen]);

  const [{ y }, api] = useSpring(() => ({
    y: innerHeight,
    config: { tension: 250, friction: 25 },
  }));

  useEffect(() => {
    api.start({ y: isOpen ? 0 : innerHeight });
  }, [api, innerHeight, isOpen]);

  const bind = useDrag(
    ({ last, movement: [, my], event }) => {
      if (last) {
        if (my > innerHeight / 4) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else {
          api.start({ y: 0 });
        }
      } else {
        api.start({ y: Math.max(my, 0), immediate: true });
      }
    },
    {
      from: () => [0, y.get()],
      filterTaps: true,
      bounds: { top: 0 },
      rubberband: true,
    }
  );
  if (!isOpen) return null;

  return (
    <>
      <animated.div
        className="bottom-sheet-backdrop"
        onClick={onClose}
        style={{ opacity: y.to([0, innerHeight], [1, 0], 'clamp') }}
      />

      <animated.div
        className="bottom-sheet-container"
        {...bind()}
        style={{
          y,
          touchAction: 'none',
        }}
      >
        <div className="bottom-sheet-grabber" />
        <div className="bottom-sheet-content" style={{ overflow: 'visible' }}>
          {children}
        </div>
      </animated.div>
    </>
  );
}

export default MobileContextMenu;
