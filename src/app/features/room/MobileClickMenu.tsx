/* eslint-disable react/destructuring-assignment */
import React from 'react';
import { Box, Icon, Icons, Text } from 'folds';
import classNames from 'classnames';
import * as css from './RoomTimeline.css';

export function BottomSheetMenu({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: isOpen ? 'auto' : 'none' }}
    >
      <div
        className={classNames(css.menuBackdrop, { [css.menuBackdropOpen]: isOpen })}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={classNames(css.menuSheet, { [css.menuSheetOpen]: isOpen })}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function MenuItemButton({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      alignItems="Center"
      gap="400"
      className={classNames(css.menuItem, { [css.menuItemDestructive]: destructive })}
    >
      <Icon src={Icons.Alphabet} size="100" />
      <Text size="B300" style={{ color: 'inherit' }}>
        {label}
      </Text>
    </Box>
  );
}
