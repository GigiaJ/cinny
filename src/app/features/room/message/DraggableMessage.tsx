import React from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from 'react-use-gesture';
import { Icon, Icons } from 'folds';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

const DraggableMessageStyles = {
  container: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  iconContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '150px',
  },
  messageContent: {
    position: 'relative',
    touchAction: 'pan-y',
    backgroundColor: 'var(--folds-color-Background-Main)',
    width: '100%',
  },
  icon: {
    position: 'absolute',
  },
};

export function DraggableMessage({
  children,
  onReply,
  onEdit,
  event,
  mx,
}: {
  children: React.ReactNode;
  onReply: () => void;
  onEdit: () => void;
  event: MatrixEvent;
  mx: MatrixClient;
}) {
  const canEdit = mx.getUserId() === event.getSender();
  const REPLY_THRESHOLD = 80;
  const EDIT_THRESHOLD = canEdit ? 250 : Infinity;

  const [{ x, replyOpacity, editOpacity, iconScale }, api] = useSpring(() => ({
    x: 0,
    replyOpacity: 0,
    editOpacity: 0,
    iconScale: 0.5,
    config: { tension: 250, friction: 25 },
  }));

  const bind = useDrag(
    ({ down, movement: [x], vxvy: [vx] }) => {
      if (!down) {
        const finalDistance = Math.abs(x);

        if (finalDistance > EDIT_THRESHOLD) {
          onEdit();
        } else if (finalDistance > REPLY_THRESHOLD) {
          onReply();
        }
      }

      const xTarget = down ? Math.min(0, x) : 0;
      const distance = Math.abs(xTarget);

      let newReplyOpacity = 0;
      let newEditOpacity = 0;
      let newScale = 1.0;

      if (canEdit && distance > REPLY_THRESHOLD) {
        newReplyOpacity = 0;
        newEditOpacity = 1;
        if (down && distance > EDIT_THRESHOLD) {
          newScale = 1.1;
        }
      } else {
        newReplyOpacity = 1;
        newEditOpacity = 0;
        newScale = 0.5 + (distance / REPLY_THRESHOLD) * 0.5;
      }

      if (distance < 5) {
        newReplyOpacity = 0;
      }

      api.start({
        x: xTarget,
        replyOpacity: newReplyOpacity,
        editOpacity: newEditOpacity,
        iconScale: newScale,
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
      <div style={DraggableMessageStyles.iconContainer}>
        <animated.div
          style={{
            ...DraggableMessageStyles.icon,
            opacity: replyOpacity,
            transform: iconScale.to((s) => `scale(${s})`),
          }}
        >
          <Icon src={Icons.ReplyArrow} size="200" />
        </animated.div>

        <animated.div
          style={{
            ...DraggableMessageStyles.icon,
            opacity: editOpacity,
            transform: iconScale.to((s) => `scale(${s})`),
          }}
        >
          <Icon src={Icons.Pencil} size="200" />
        </animated.div>
      </div>

      <animated.div {...bind()} style={{ ...DraggableMessageStyles.messageContent, x }}>
        {children}
      </animated.div>
    </div>
  );
}
