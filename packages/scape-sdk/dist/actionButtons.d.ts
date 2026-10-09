/** Approved host-rendered icon IDs. Artwork stays in Scape, never in the SDK. */
export declare const ACTION_ICONS: readonly ["check", "refresh", "media-play-filled", "media-pause-filled", "lock", "trash", "plus", "xmark", "gear", "clone-2", "download", "import", "paper-plane-2", "external-link", "volume", "ban", "broom", "star"];
export type ActionIcon = (typeof ACTION_ICONS)[number];
/** Presets choose an icon; authors still supply meaningful labels and actions. */
export declare const ACTION_BUTTON_PRESETS: Readonly<{
    readonly save: "check";
    readonly reset: "refresh";
    readonly start: "media-play-filled";
    readonly pause: "media-pause-filled";
    readonly close: "lock";
    readonly delete: "trash";
    readonly add: "plus";
    readonly cancel: "xmark";
}>;
export type ActionButtonPreset = keyof typeof ACTION_BUTTON_PRESETS;
/** Icon first, then the same icon and confirmation text. No custom artwork. */
export type ActionButton = {
    preset: ActionButtonPreset;
    icon?: never;
} | {
    icon: ActionIcon;
    preset?: never;
};
export declare function actionButtonIcon(button: ActionButton): ActionIcon;
