import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const CategoryButton = style({
  flexGrow: 1,
  userSelect: 'none',
});
export const CategoryButtonIcon = style({
  opacity: config.opacity.P400,
});
