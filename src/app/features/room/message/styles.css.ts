import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'absolute',
    top: toRem(-30),
    right: 0,
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});

export const menuBackdrop = style({
  userSelect: 'none',
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  transition: 'opacity 0.3s ease-in-out',
  opacity: 0,
});

export const menuBackdropOpen = style({
  opacity: 1,
});

export const menuSheet = style({
  userSelect: 'none',
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: color.Background.Container,
  borderTopLeftRadius: config.radii.R400,
  borderTopRightRadius: config.radii.R400,
  padding: config.space.S500,
  transform: 'translateY(100%)',
  transition: 'transform 0.3s ease-out',
  boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
});

export const menuSheetOpen = style({
  transform: 'translateY(0)',
});

export const menuItem = style({
  userSelect: 'none',
  width: '100%',
  background: 'none',
  border: 'none',
  padding: `${config.space.S300} ${config.space.S100}`,
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: config.radii.R300,
  color: color.Primary.ContainerActive,

  outline: 'none',

  WebkitTapHighlightColor: 'transparent',

  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',

  selectors: {
    '&:hover': {
      backgroundColor: color.Background.ContainerHover,
    },
    '&:focus-visible': {
      backgroundColor: color.Background.ContainerHover,
    },
  },
});

export const menuItemDestructive = style({
  color: color.Critical.ContainerActive,
});
