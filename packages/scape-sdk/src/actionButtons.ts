/** Approved host-rendered icon IDs. Artwork stays in Scape, never in the SDK. */
export const ACTION_ICONS = Object.freeze([
  'check',
  'refresh',
  'media-play-filled',
  'media-pause-filled',
  'lock',
  'trash',
  'plus',
  'xmark',
  'gear',
  'clone-2',
  'download',
  'import',
  'paper-plane-2',
  'external-link',
  'volume',
  'ban',
  'broom',
  'star',
] as const);
export type ActionIcon = (typeof ACTION_ICONS)[number];
/** Presets choose an icon; authors still supply meaningful labels and actions. */
export const ACTION_BUTTON_PRESETS = Object.freeze({
  save: 'check',
  reset: 'refresh',
  start: 'media-play-filled',
  pause: 'media-pause-filled',
  close: 'lock',
  delete: 'trash',
  add: 'plus',
  cancel: 'xmark',
} as const satisfies Record<string, ActionIcon>);
export type ActionButtonPreset = keyof typeof ACTION_BUTTON_PRESETS;
/** Icon first, then the same icon and confirmation text. No custom artwork. */
export type ActionButton =
  { preset: ActionButtonPreset; icon?: never } | { icon: ActionIcon; preset?: never };
export function actionButtonIcon(button: ActionButton): ActionIcon {
  return button.preset !== undefined ? ACTION_BUTTON_PRESETS[button.preset] : button.icon;
}
