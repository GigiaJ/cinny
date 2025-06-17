import {
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
} from 'folds';
import React, { forwardRef, MouseEventHandler, useEffect, useState } from 'react';

import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import { MatrixClient, MatrixEvent, Relations, Room } from 'matrix-js-sdk';
import { EmojiBoard } from '../../../components/emoji-board';
import { stopPropagation } from '../../../utils/keyboard';
import * as css from './styles.css';

import {
  MessageAllReactionItem,
  MessageCopyLinkItem,
  MessageDeleteItem,
  MessagePinItem,
  MessageQuickReactions,
  MessageReadReceiptItem,
  MessageReportItem,
  MessageSourceCodeItem,
} from './Message';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { BottomSheetMenu } from './MobileContextMenu';

type BaseOptionProps = {
  mEvent: MatrixEvent;
  room: Room;
  mx: MatrixClient;
  relations: Relations | undefined;
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

export const MessageDropdownMenu = forwardRef<HTMLDivElement, BaseOptionProps>(
  (
    {
      mEvent,
      room,
      mx,
      relations,
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
    },
    ref
  ) => (
    <Menu ref={ref}>
      {canSendReaction && (
        <MessageQuickReactions
          onReaction={(key, shortcode) => {
            onReactionToggle(mEvent.getId() ?? '', key, shortcode);
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
          data-event-id={mEvent.getId()}
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
            data-event-id={mEvent.getId()}
            onClick={() => {
              onEditId(mEvent.getId());
              closeMenu();
            }}
          >
            <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
              Edit Message
            </Text>
          </MenuItem>
        )}
        {!hideReadReceipts && (
          <MessageReadReceiptItem room={room} eventId={mEvent.getId() ?? ''} onClose={closeMenu} />
        )}
        <MessageSourceCodeItem room={room} mEvent={mEvent} onClose={closeMenu} />
        <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
        {canPinEvent && <MessagePinItem room={room} mEvent={mEvent} onClose={closeMenu} />}
      </Box>
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
  )
);

type ExtendedOptionsProps = BaseOptionProps & {
  imagePackRooms: Room[] | undefined;
  onActiveStateChange: React.Dispatch<React.SetStateAction<boolean>>;
  menuAnchor: RectCords | undefined;
  emojiBoardAnchor: RectCords | undefined;
  handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement>;
  handleOpenMenu: MouseEventHandler<HTMLButtonElement>;
  setMenuAnchor: React.Dispatch<React.SetStateAction<RectCords | undefined>>;
  setEmojiBoardAnchor: React.Dispatch<React.SetStateAction<RectCords | undefined>>;
  isMobileSheetOpen;
  setMobileSheetOpen;
};

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
  isMobileSheetOpen,
  setMobileSheetOpen,
}: ExtendedOptionsProps) {
  useEffect(() => {
    onActiveStateChange?.(!!menuAnchor || !!emojiBoardAnchor);
  }, [emojiBoardAnchor, menuAnchor, onActiveStateChange]);

  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const [view, setView] = useState('options');

  const eventId = mEvent.getId();
  if (!eventId) return null;

  const optionProps: BaseOptionProps = {
    mEvent,
    room,
    mx,
    relations,
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
  };

  if (isMobile) {
    return (
      <BottomSheetMenu onClose={() => setMobileSheetOpen(false)} isOpen={isMobileSheetOpen}>
        {view === 'options' ? (
          <MessageDropdownMenu
            {...optionProps}
            closeMenu={() => {
              closeMenu();
              setMobileSheetOpen(false);
            }}
            handleAddReactions={() => setView('emoji')}
          />
        ) : (
          <Box direction="Column" style={{ width: '100%' }}>
            <Header variant="Surface" size="500">
              <IconButton size="300" onClick={() => setView('options')}>
                <Icon src={Icons.ArrowLeft} />
              </IconButton>
              <Box grow="Yes" alignItems="Center">
                <Text size="H4">Add Reaction</Text>
              </Box>
            </Header>
            <EmojiBoard
              imagePackRooms={imagePackRooms ?? []}
              returnFocusOnDeactivate={false}
              allowTextCustomEmoji
              onEmojiSelect={(key) => {
                onReactionToggle(mEvent.getId(), key);
                setEmojiBoardAnchor(undefined);
                closeMenu();
                setMobileSheetOpen(false);
              }}
              onCustomEmojiSelect={(mxc, shortcode) => {
                onReactionToggle(mEvent.getId(), mxc, shortcode);
                setEmojiBoardAnchor(undefined);
                closeMenu();
                setMobileSheetOpen(false);
              }}
              requestClose={() => setEmojiBoardAnchor(undefined)}
            />
          </Box>
        )}
      </BottomSheetMenu>
    );
  }

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
                <MessageDropdownMenu {...optionProps} />
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
