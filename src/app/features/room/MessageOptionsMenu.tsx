import { Box, Icon, IconButton, Icons, Line, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import React, { MouseEventHandler, useEffect } from 'react';

import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import { MatrixClient, MatrixEvent, Relations, Room } from 'matrix-js-sdk';
import { EmojiBoard } from '../../components/emoji-board';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './message/styles.css';

import {
  MessageAllReactionItem,
  MessageCopyLinkItem,
  MessageDeleteItem,
  MessagePinItem,
  MessageQuickReactions,
  MessageReadReceiptItem,
  MessageReportItem,
  MessageSourceCodeItem,
} from './message/Message';

type BaseOptionProps = {
  mEvent: MatrixEvent;
  room: Room;
  mx: MatrixClient;
  relations: Relations | undefined;
  eventId: string;
  canSendReaction: boolean | undefined;
  canEdit: boolean | undefined;
  canDelete: boolean | undefined;
  canPinEvent: boolean | undefined;
  hideReadReceipts: boolean | undefined;
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string | undefined) => void;
  onReplyClick: MouseEventHandler<HTMLButtonElement>;
  onEditId: ((eventId?: string | undefined) => void) | undefined;
  handleAddReactions: MouseEventHandler<HTMLButtonElement>;
  closeMenu: () => void;
};

export function MessageDropdownMenu({
  mEvent,
  room,
  mx,
  relations,
  eventId,
  canSendReaction,
  canEdit,
  canDelete,
  canPinEvent,
  hideReadReceipts,
  onReactionToggle,
  onReplyClick,
  onEditId,
  handleAddReactions,
  closeMenu,
}) {
  return (
    <Menu>
      {canSendReaction && (
        <MessageQuickReactions
          onReaction={(key, shortcode) => {
            onReactionToggle(eventId, key, shortcode);
            closeMenu();
          }}
        />
      )}
      <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
        {canSendReaction && (
          <MenuItem
            size="300"
            after={<Icon size="100" src={Icons.SmilePlus} />}
            radii="300"
            onClick={handleAddReactions}
          >
            <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
              Add Reaction
            </Text>
          </MenuItem>
        )}
        {relations && (
          <MessageAllReactionItem room={room} relations={relations} onClose={closeMenu} />
        )}
        <MenuItem
          size="300"
          after={<Icon size="100" src={Icons.ReplyArrow} />}
          radii="300"
          data-event-id={eventId}
          onClick={(evt) => {
            onReplyClick(evt);
            closeMenu();
          }}
        >
          <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
            Reply
          </Text>
        </MenuItem>
        {canEdit && onEditId && (
          <MenuItem
            size="300"
            after={<Icon size="100" src={Icons.Pencil} />}
            radii="300"
            data-event-id={eventId}
            onClick={() => {
              onEditId(eventId);
              closeMenu();
            }}
          >
            <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
              Edit Message
            </Text>
          </MenuItem>
        )}
        {!hideReadReceipts && (
          <MessageReadReceiptItem room={room} eventId={eventId} onClose={closeMenu} />
        )}
        <MessageSourceCodeItem room={room} mEvent={mEvent} onClose={closeMenu} />
        <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
        {canPinEvent && <MessagePinItem room={room} mEvent={mEvent} onClose={closeMenu} />}
      </Box>
      {/* Redact and Report actions */}
      {((!mEvent.isRedacted() && canDelete) || mEvent.getSender() !== mx.getUserId()) && (
        <>
          <Line size="300" />
          <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
            {!mEvent.isRedacted() && canDelete && (
              <MessageDeleteItem room={room} mEvent={mEvent} onClose={closeMenu} />
            )}
            {mEvent.getSender() !== mx.getUserId() && (
              <MessageReportItem room={room} mEvent={mEvent} onClose={closeMenu} />
            )}
          </Box>
        </>
      )}
    </Menu>
  );
}

export function MessageOptionsMenu({
  mEvent,
  room,
  mx,
  relations,
  imagePackRooms,
  canSendReaction,
  canEdit,
  canDelete,
  canPinEvent,
  hideReadReceipts,
  onReactionToggle,
  onReplyClick,
  onEditId,
  onActiveStateChange,
  closeMenu,
  menuAnchor,
  emojiBoardAnchor,
  handleOpenEmojiBoard,
  handleOpenMenu,
  handleAddReactions,
  setMenuAnchor,
  setEmojiBoardAnchor,
}) {
  // const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  // const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();

  useEffect(() => {
    onActiveStateChange?.(!!menuAnchor || !!emojiBoardAnchor);
  }, [emojiBoardAnchor, menuAnchor, onActiveStateChange]);

  const eventId = mEvent.getId();
  if (!eventId) return null;

  return (
    <div className={css.MessageOptionsBase}>
      <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
        <Box gap="100">
          {canSendReaction && (
            <PopOut
              position="Bottom"
              align={emojiBoardAnchor?.width === 0 ? 'Start' : 'End'}
              offset={emojiBoardAnchor?.width === 0 ? 0 : undefined}
              anchor={emojiBoardAnchor}
              content={
                <EmojiBoard
                  imagePackRooms={imagePackRooms ?? []}
                  returnFocusOnDeactivate={false}
                  allowTextCustomEmoji
                  onEmojiSelect={(key) => {
                    onReactionToggle(eventId, key);
                    setEmojiBoardAnchor(undefined);
                  }}
                  onCustomEmojiSelect={(mxc, shortcode) => {
                    onReactionToggle(eventId, mxc, shortcode);
                    setEmojiBoardAnchor(undefined);
                  }}
                  requestClose={() => setEmojiBoardAnchor(undefined)}
                />
              }
            >
              <IconButton
                onClick={handleOpenEmojiBoard}
                variant="SurfaceVariant"
                size="300"
                radii="300"
                aria-pressed={!!emojiBoardAnchor}
              >
                <Icon src={Icons.SmilePlus} size="100" />
              </IconButton>
            </PopOut>
          )}
          <IconButton
            onClick={onReplyClick}
            data-event-id={eventId}
            variant="SurfaceVariant"
            size="300"
            radii="300"
          >
            <Icon src={Icons.ReplyArrow} size="100" />
          </IconButton>
          {canEdit && onEditId && (
            <IconButton
              onClick={() => onEditId(eventId)}
              variant="SurfaceVariant"
              size="300"
              radii="300"
            >
              <Icon src={Icons.Pencil} size="100" />
            </IconButton>
          )}
          <PopOut
            anchor={menuAnchor}
            position="Bottom"
            align={menuAnchor?.width === 0 ? 'Start' : 'End'}
            offset={menuAnchor?.width === 0 ? 0 : undefined}
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <MessageDropdownMenu
                  mEvent={mEvent}
                  room={room}
                  mx={mx}
                  relations={relations}
                  eventId={eventId}
                  canSendReaction={canSendReaction}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canPinEvent={canPinEvent}
                  hideReadReceipts={hideReadReceipts}
                  onReactionToggle={onReactionToggle}
                  onReplyClick={onReplyClick}
                  onEditId={onEditId}
                  handleAddReactions={handleAddReactions}
                  closeMenu={closeMenu}
                />
              </FocusTrap>
            }
          >
            <IconButton
              variant="SurfaceVariant"
              size="300"
              radii="300"
              onClick={handleOpenMenu}
              aria-pressed={!!menuAnchor}
            >
              <Icon src={Icons.VerticalDots} size="100" />
            </IconButton>
          </PopOut>
        </Box>
      </Menu>
    </div>
  );
}
