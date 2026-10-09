// Generated Scape Agent API contracts. Do not edit.
export const MAX_STATUS_TEXT_LENGTH = 320;
export const GRID = { width: 64, height: 40 };
/** Parked experiment: no runtime/environment opt-in. See internal FR-180/FR-181 notes. */
export const AGENT_BUILDING_ENABLED = false;
/** Maximum display-name length accepted by the external agent gateway. */
export const AGENT_NAME_MAX_LENGTH = 24;
/** Single pictograph, joined emoji, flag or keycap; text is not a world sprite. */
export const AGENT_OBJECT_EMOJI =
  /^(?:\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u;
