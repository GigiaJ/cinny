import React, { useEffect } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from 'react-use-gesture';
import './MobileContextMenu.scss';

export function MobileContextMenu({ isOpen, onClose, children }) {
  const { innerHeight } = window;

  const [{ y }, api] = useSpring(() => ({
    y: innerHeight,
    config: { tension: 250, friction: 25 },
  }));

  useEffect(() => {
    api.start({ y: isOpen ? 0 : innerHeight });
  }, [api, innerHeight, isOpen]);

  const bind = useDrag(
    ({ last, movement: [, my], velocities: [, vy] }) => {
      if (last) {
        if (my > innerHeight / 4) {
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
          touchAction: 'pan-y',
        }}
      >
        <div className="bottom-sheet-grabber" />
        <div className="bottom-sheet-content">{children}</div>
      </animated.div>
    </>
  );
}

export default MobileContextMenu;
