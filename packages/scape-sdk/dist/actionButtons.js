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
]);
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
});
export function actionButtonIcon(button) {
    return button.preset !== undefined ? ACTION_BUTTON_PRESETS[button.preset] : button.icon;
}
