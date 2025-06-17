import React from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from 'react-use-gesture';
import { Icon, Icons } from 'folds';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { container, iconContainer, messageContent, icon } from './style.css';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';

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
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;

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
    ({ down, movement: [mvx], vxvy: [vx] }) => {
      if (!down) {
        const finalDistance = Math.abs(mvx);

        if (finalDistance > EDIT_THRESHOLD) {
          onEdit();
        } else if (finalDistance > REPLY_THRESHOLD) {
          onReply();
        }
      }

      const xTarget = down ? Math.min(0, mvx) : 0;
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
  if (isMobile) {
    return (
      <div className={container}>
        <div className={iconContainer}>
          <animated.div
            className={icon}
            style={{
              opacity: replyOpacity,
              transform: iconScale.to((s) => `scale(${s})`),
            }}
          >
            <Icon src={Icons.ReplyArrow} size="200" />
          </animated.div>

          <animated.div
            className={icon}
            style={{
              opacity: editOpacity,
              transform: iconScale.to((s) => `scale(${s})`),
            }}
          >
            <Icon src={Icons.Pencil} size="200" />
          </animated.div>
        </div>

        <animated.div {...bind()} className={messageContent} style={{ x }}>
          {children}
        </animated.div>
      </div>
    );
  }
  return <div>{children}</div>;
}
