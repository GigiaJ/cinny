import React from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from 'react-use-gesture';
import { Icon, Icons } from 'folds';

const DraggableMessageStyles = {
  container: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  replyIconContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '80px',
  },
  messageContent: {
    position: 'relative',
    touchAction: 'pan-y',
    backgroundColor: 'var(--folds-color-Background-Main)',
    width: '100%',
  },
};

export function DraggableMessage({ children, onReply }) {
  const REPLY_THRESHOLD = 80;

  const [{ x, iconScale }, api] = useSpring(() => ({
    x: 0,
    iconScale: 0.5,
    config: { tension: 250, friction: 25 },
  }));

  const bind = useDrag(
    ({ down, movement: [mx], direction: [xDir], vxvy: [vx], cancel }) => {
      if (!down && Math.abs(xDir) < 0.7) {
        cancel();
      }

      const xTarget = down ? Math.min(0, mx) : 0;
      let scaleTarget = down
        ? 0.5 + Math.min(Math.abs(mx), REPLY_THRESHOLD) / (REPLY_THRESHOLD * 2)
        : 0.5;

      if (mx < -REPLY_THRESHOLD) {
        onReply();
      }

      /*
      if (!down) {
        if (mx < -REPLY_THRESHOLD && vx < -0.5) {
          onReply();
        }
      } else {
        if (mx < -REPLY_THRESHOLD) {
          scaleTarget = 1;
        }
      }
*/
      api.start({
        x: xTarget,
        iconScale: scaleTarget,
      });
    },
    {
      axis: 'x',
      filterTaps: true,
      threshold: 10,
    }
  );

  return (
    <div style={DraggableMessageStyles.container}>
      <animated.div
        style={{
          ...DraggableMessageStyles.replyIconContainer,
          transform: iconScale.to((s) => `scale(${s})`),
          opacity: iconScale.to((s) => (s - 0.5) * 2),
        }}
      >
        <Icon src={Icons.ReplyArrow} size="200" />
      </animated.div>

      <animated.div
        {...bind()}
        style={{
          ...DraggableMessageStyles.messageContent,
          x,
        }}
      >
        {children}
      </animated.div>
    </div>
  );
}
