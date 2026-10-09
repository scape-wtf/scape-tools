# Scape SDK

Gizmos are interactive objects in [scape.wtf](https://scape.wtf). Define them with
`defineObject` and collect them with `defineProject({ objects: [...] })`.

A dependency-free TypeScript and ESM package for defining Gizmos.
The standalone starter and CLI require Node 22 or newer.

- `@scape-wtf/sdk`: `defineObject`, `defineProject`, `PROJECT_OBJECT_LIMIT`, typed definitions, state, action context, declarative fields/buttons,
  validation helpers and `ObjectActionError`.
- `@scape-wtf/sdk/runtime`: `ObjectRegistry`, `isObjectEnvelope` and `OBJECT_STATE_BYTE_LIMIT`
  for local tests. This entry has no built-in gizmos or game dependencies.

Definitions supply a namespaced type, state version, emoji, initial state, validator,
actions and optional view. Actions declare `participant` or `editor` permission.
The Scape popover keeps participant controls directly available and groups editor
controls/associated fields under its gear **Configure** action by default.
An explicit action-row placement changes presentation, never permission. It provides its own
two-step **Delete** action according to removal permission. Authors should not
add duplicate configuration, close or delete controls to their views. Dismissal,
loading, errors, feedback and keyboard behavior belong to Scape.
Views may supply text fields (`{ id, label, value, maxLength }`) or finite choices:

```ts
fields: [{
  id: 'style', label: 'Style', kind: 'select', value: state.style,
  options: [{ value: 'soft', label: 'Soft' }, { value: 'hard', label: 'Hard' }],
}],
controls: [{
  id: 'style', label: 'Set style', fields: ['style'], trigger: 'change',
  action: { name: 'configure', payload: {} },
}],
```

A select has 1–64 unique, nonempty string values (up to 128 characters each),
labels up to 240 characters, and a current value present in its options. A view
supports at most 16 fields and 32 controls. `validObjectView` checks these bounds
in tests; the uploaded runtime and Scape popover use the same validator.
The reducer must still validate submitted values: a UI choice never grants
permission or replaces server validation.

Omit `trigger` to submit referenced fields with an ordinary button. Set
`trigger: 'change'` for automatic saving when a select changes; it renders no
extra Save button. Each field may belong to only one automatic control, all of
its fields must be selects, and it cannot request confirmation or a toggle icon.
Normal action permissions and `disabled` still apply. Scape disables the form
while saving, restores focus afterward, and restores saved selections on failure.
Explicit-save forms retain drafts for retry. Changed option sets invalidate an
old submission; ordinary refreshes retain valid drafts and focused controls.
Automatic saves do not implicitly play a sound, preview, remember placement
settings or write fields outside the declared action. Those are separate capabilities.
Floor fan demonstrates this contract in every developer world and in the standalone export.

Configure starts closed. For a participant switch with no input fields, set
`icon: 'toggle'` and a boolean `pressed` value. Scape places it first in the action
row and uses `toggle-3` for on and `toggle-2` for off. Keep `label` meaningful
(for example, “Turn off”/“Turn on”); it remains the accessible name and tooltip.
For a regular action or local preview, set `placement: 'action'` to put its button
in the same row before Configure/Delete. Its default icon is `media-play-filled`;
`label` remains the accessible name and tooltip. For example:

```ts
{ id: 'ring', label: 'Ring', placement: 'action', action: { name: 'ring', payload: {} } }
```

Chime uses this for Ring. Piano uses it with `kind: 'preview'` for Play note,
which works with Configure open or closed and remains local and editor-only.
Referenced editor fields remain under Configure; placement does not grant access
to an action or expose its fields. `trigger: 'change'` cannot also be an action-row
button. Action buttons use the shared icon-sized pending spinner. Existing
`icon: 'toggle'` controls keep the switch icons and behavior above.

### Two-step content actions and icon IDs

Use `button` and a nonempty `confirm` message for an icon-first content action:

```ts
{
  id: 'save', label: 'Save question', button: { preset: 'save' },
  confirm: 'Save question?', fields: ['question'],
  action: { name: 'configure', payload: {} },
}
// A unique action uses the same component and an approved ID:
{
  id: 'close', label: 'Close voting', button: { icon: 'lock' },
  confirm: 'Close voting?', action: { name: 'toggle', payload: {} },
}
```

The first activation reveals the same icon beside the confirmation text; the
second submits. The initial label is the accessible name and tooltip. Editing
fields, changing actions, leaving the button, pressing Escape, or changing the
view/target/permissions clears review. Pending actions use Scape's shared spinner
and cannot be submitted twice. A failed action requires fresh confirmation.
Permissions and reducer validation still apply. Buttons cannot also specify
`icon`, `placement`, `trigger`, `kind`, or `pressed`; immediate choices and switches
keep their existing controls.

`ACTION_BUTTON_PRESETS` supplies these icon mappings:

| Preset | Icon ID |
| --- | --- |
| `save` | `check` |
| `reset` | `refresh` |
| `start` | `media-play-filled` |
| `pause` | `media-pause-filled` |
| `close` | `lock` |
| `delete` | `trash` |
| `add` | `plus` |
| `cancel` | `xmark` |

Presets select artwork, not action behavior, permission, or wording. Supply your
own concise labels and confirmation questions. Do not duplicate Scape's object
removal control with a `delete` preset; use it for action-specific content removal.

`ACTION_ICONS` is the runtime list and `ActionIcon` provides TypeScript completion:
`check`, `refresh`, `media-play-filled`, `media-pause-filled`, `lock`, `trash`,
`plus`, `xmark`, `gear`, `clone-2`, `download`, `import`, `paper-plane-2`,
`external-link`, `volume`, `ban`, `broom`, `star`.

Browse the artwork on [Nucleo's Micro Bold catalog](https://nucleoapp.com/micro-bold-icons).
Scape supplies the licensed game assets; referencing a supported ID in a Gizmo
does not require developers to purchase icons. The SDK includes identifiers only,
not artwork or a republished gallery. Nucleo's full catalog is larger than Scape's
approved list. If an action needs another icon, request its addition to Scape's
shared set. SVG, URLs, emoji and arbitrary icon names are rejected.

In Scape the server supplies identity, permission, time and randomness. In a local test,
you supply them; local tests do not authenticate anyone or prove world access.

State is visible to room participants. Payloads are limited to 2 KiB, state to 32 KiB,
and JSON depth to 16. Reducers receive cloned data; invalid results are rejected.
Reducers must be synchronous and free of side effects. The local `ObjectRegistry` test runtime validates data
and permissions, but does not isolate code or bound its execution time. Scape isolates uploaded Gizmo code.

## Start a project

```sh
npx @scape-wtf/cli@latest gizmo init my-gizmo
cd my-gizmo
npm install
npm run build
npm exec -- scape gizmo dev
```

Approve the printed pairing code in your developer world on scape.wtf. The CLI watches your files and uploads changes. See the [quickstart](https://developer.scape.wtf/gizmos/quickstart).

A project default-exports `defineProject({ objects: [first, second] })`. Scape accepts up to 16 definitions and validates the entire update before activation. Each placed instance has independent state. Types and emojis must be unique; remove placed instances before removing their definition or changing its type, state version or fixed walkability.

## Presentation and effects

Gizmos can also declare models, animation, interaction and independent audio through the
[presentation contract](https://developer.scape.wtf/gizmos/presentation). The SDK contains the JSON types,
validation, quaternion helpers and shared procedural sound rendering; platform rendering/output stays in Scape.

Text gizmos can declare `worldText(state)`, `textEditor` and `editPolicy`. Scape
renders bounded plain text and reuses its anchored editor; Sign is the built-in
reference. `ObjectRegistry.configuration(instance)` exports only the declared editor
field as `{ type, version, values }`; `configure(instance, configuration, context)`
applies it through the declared action and normal editing authority. Configuration
values have the same 2 KiB JSON limit as action payloads. Scape uses this for saved
drops and fresh placements; identities, ownership and unrelated live state are never
copied. Matching default values require no edit action, while nondefault values require
editor permission. Unsupported types/versions and undeclared fields are rejected.
See [controls and configuration](https://developer.scape.wtf/gizmos/controls) for bounds and permissions.

Audio uses compact `GizmoSynth` or layered `GizmoNoiseSound` definitions in `sounds`, independent `audio(state, previous)`
play/stop timelines, optional ambient playlists and author-owned `sequence(context)` callbacks. Compose sine/triangle/square/sawtooth
oscillators or noise with pitch/volume envelopes, filters, delay and reverb. Dice and
Mushroom use this same public API. Fire uses filtered noise layers, slow modulation
and randomized grains through `GizmoNoiseSound`. Sequences choose per-strike parameters and timing;
shared `ambience.bus` effects retain delay, convolution and compressor state. Scape handles playback; no generated audio file is required. Diffuse `noise-reverb` renders a seeded, normalized stereo impulse; it and
`delay` support parallel wet sends that preserve the dry sound. `renderGizmoSound` is also available for local tests; `gizmoSynthError` reports
field-specific errors without rendering. Model animations are not required.

Playback supports looping, gain, pitch/speed and spatial range. Optional PCM16 WAV imports
remain supported for recordings. `encodeGizmoWav` is a tooling helper, not a requirement
for procedural authoring. The SDK has no built-in instrument names or preset dispatch.

Passive gizmos can declare `ambience`, `glow` and/or `light` without an action or panel. Clocks,
proximity, voice budgets, platform routing and cleanup belong to Scape. The presentation
contract above provides a complete procedural example, limits and recovery behavior.

`light` describes bounded world illumination: colors, radius, falloff and optional
noise motion. It works independently of audio. Ambient loops can declare
`normalizeSources`, `loopPhase` and partial `duckGain`; see the presentation contract
for ranges and defaults. Scape retains output protection and
player volume regardless of authored sound or lighting choices.

`lighting(state)` can replace fixed `light`/`glow` recipes with a complete result
for each accepted state; return `{}` to turn both off. Scape validates every result
and caches it outside the frame loop. The optional bounded `light.pattern` adds
palette-based scattered masks. See the [lighting contract](https://developer.scape.wtf/gizmos/effects#light-versus-glow)
and [Lamp example](https://developer.scape.wtf/examples/gizmos/lamp).

### Step feedback

A `step(state, event)` callback supplies bounded cosmetic feedback on walking or
push arrival. Declare `walkable: true` separately to let players enter its cell. Return `null` or
`{ durationMs, lighting?, audio? }`: 1–2,000 ms, existing light/glow recipes and
non-looping audio commands. Scape supplies `event.id`, `event.at` and
`event.movement` (`walk` or `push`), restores normal lighting on expiration,
and cancels stale playback. State remains unchanged. Joins, teleports and standing
still do not trigger it. This is observed local feedback, not shared authority.

The [Pressure pad example](https://developer.scape.wtf/examples/gizmos/pressure-pad) demonstrates arrival feedback and is available in your developer world.

## Walkability and directional push

`walkable: true` lets players enter a gizmo's cell. It defaults to `false` and is
independent of `step`, lighting, sound and UI. A walkable tile needs no callbacks.
The installed matching definition controls collision on both client and server;
unknown/invalid saved instances remain blocking. Remove placed instances before a
live upload changes this fixed property.

```ts
walkable: true,
push: state => state.on ? { direction: state.direction } : null,
```

`push(state)` declares a direction (`right`, `down`, `left`, `up`) or returns `null`
to stop pushing. It requires explicit walkability. The callback is a pure query of
saved state, not an arrival event: Scape caches results until state/code changes.
It receives no player object, credentials or world mutation access. Scape moves
an occupying local player one adjacent cell in 200 ms, with a 120 ms entry grace
and blocked-exit retry. Chained pushes continue smoothly. Normal collision, floor,
portal and room-door rules still apply; observers are never pushed. A started move
finishes normally if the source turns off. No arbitrary speed, vectors, teleports,
force, remote-player targeting or callbacks during the movement are exposed.

Players may steer out. Optional `blockOpposingInput: true` rejects input opposite
the declared direction while still allowing lateral exits. Its default is false.
This is a reusable directional-input rule, not a special case for arrow emojis.
Blocked pushes never replay cosmetic step effects. Walking and observed pushed
arrivals produce `event.movement: 'walk' | 'push'`; joins and teleports stay quiet.

The [built-in Conveyor](https://developer.scape.wtf/gizmos/movement) combines walkability, a fixed
push and opposing-input blocking. The [Floor fan](https://developer.scape.wtf/examples/gizmos/fan)
chooses direction from each instance's saved state and can switch off independently.
Both use exactly the same SDK and movement engine. The
[walkable tile](https://developer.scape.wtf/examples/gizmos/walkable-tile) has neither push nor step.
These examples are available by default in developer worlds; built-in conveyors
are also available in ordinary worlds.

You can combine a conveyor with a walkable Gizmo that does not already declare `push`. Scape preserves the Gizmo state and portable settings.

### State-dependent sound, previews and layered sprites

The built-in Piano demonstrates [these capabilities](https://developer.scape.wtf/gizmos/effects); the SDK has no note names, sound presets or instrument dispatch.

- `configuration: { action, fields, remember?, open? }` declares portable settings.
  `action` must be an editor reducer. Saved drops copy only these fields; Scape
  may remember successfully saved settings for later placements in the session.
- `soundBank(state)` returns up to 16 named sound recipes, at most 64 KiB of JSON.
  It replaces static `sounds` and cannot accompany ambience. Scape updates playback when the state changes.
- `{ kind: 'partials', duration, layers, amplitude, ... }` describes additive
  oscillators, optional vibrato, one-pole filters, seeded excitation, distortion
  and echoes. Limits: 4 seconds, 8 layers, 32 partials/layer, 8 stages/chain,
  oversampling 1/2/4 and a total work budget of 512 operator-seconds. No executable
  DSP, device handles or arbitrary audio graph access crosses this contract.
- `previews[name] = { permission, run(state, payload) }` returns `{ sound, gain }`.
  A control with `kind: 'preview'` invokes it locally; a saving control can name
  `preview` to audition its payload before saving. Previews never execute reducers
  or send world actions. Target, selection, permission and lifecycle guards cancel
  obsolete output.
- `sprite(state)` returns a 64–512-pixel recipe with 1–4 named layers and up to 16
  shapes/layer: rounded rectangles, bounded text, or a Scape composition marker.
  Colors are hex or vertical gradients. `step().animation` names a child layer and
  supplies 2–16 normalized frames (`at`, `offset`, linear-RGB `tint`, optional
  `curve`). The first layer anchors the drawing and cannot animate. Reduced motion
  retains tint. No HTML, URLs, canvas handles or shader code is accepted.

Short visual feedback does not cut a sound's release. Playback remains subject to
voice budgets, a short arrival deadline, current item/state identity and lifecycle
cancellation. Artwork, controls and recipes are validated for uploaded definitions
as well as bundled ones.

## Accepted actions, shared feedback and area removal

A definition may declare `interaction: { tap?: ObjectAction, bump?: ObjectAction }`.
These map input intent to a normal permission-checked action. Bump does not grant
walkability or movement. Existing `presentation.tap` remains supported.

`react(nextState, previousState, action, { now })` returns `null` or a
`GizmoReaction` after a successful reducer. It is pure and synchronous, including
inside the restricted runtime. It receives no scene, player list, services,
timers or network handles. Returning feedback does not require a state change.
In tests, call `ObjectRegistry.execute` to receive `{ instance, reaction }`;
`act` still returns just the instance and cannot deliver effects on its own.

```ts
react: () => ({
  feedback: {
    durationMs: 600,
    burst: { color: '#a9e8ff', radiusCells: 1.5, particles: 0 },
    audio: [
      {
        kind: 'play',
        voice: 'bell',
        sound: 'bell',
        delayMs: 0,
        gain: 1,
        rate: 1,
        loop: false,
        rangeCells: [1, 8],
        stereo: 0.7,
      },
    ],
  },
});
```

Declare `bell` in `sounds` or `soundBank`. Feedback is bounded to 16 KiB and
1–2000 ms. Audio must be non-looping and start before feedback expires. Action
sound ranges are 0–16 cells; ambience remains bounded to 12. Optional `lighting`
uses the existing light/glow contract and restores saved lighting on expiry.
A `burst` has radius .1–8 cells, 0–24 particles, a hex color and optional `flash`
emoji/1–4 `particleEmojis` (single pictographs). Optional `impulse` uses scale
1–1.5 and rotation ±.3 radians, with an optional shorter `durationMs`.
`cameraShake` is limited to strength 0–18 and 1–500 ms; Scape attenuates it
within 14 cells and suppresses it for reduced motion. `haptic: 'light' | 'heavy'`
is optional initiating-player feedback; device support determines delivery.

Scape validates feedback before applying an action, then shares it with active participants on the same floor. Retries and repeated snapshots do not replay it; late joins do not receive old effects. Floor changes, removed sources and inactive gameplay cancel stale output. Delivery is best effort. Reduced motion suppresses particle travel, sprite impulses and camera shake.

A separate `areaRemoval: { radiusCells: 0..3 }` declaration allows
`react` to request `removeArea: { radiusCells }` within that maximum. Scape
anchors the square to the current instance and floor. The actor must be allowed
to remove the source; every candidate is checked separately, and unauthorized
items are skipped. Entry protection, world editing and radio authority still
apply. State and removals commit atomically in one scene operation. A reducer
cannot select arbitrary coordinates, other floors or item IDs. Use action
`permission: 'remover'` when the action itself also requires source removal rights.
Test contexts supply `canRemove`; it defaults to false.

See [Chime](https://developer.scape.wtf/examples/gizmos/chime) for a shared signal and
[Bomb](https://developer.scape.wtf/gizmos/reactions) for an independent composition of bump input,
server timing, shared feedback and area removal.

## Linking and same-floor travel

`link: { size: 2 }` asks Scape to group placements of the same definition/version
on one floor. Scape joins the oldest incomplete group or creates an opaque
`ObjectInstance.linkId`. Grouping is independent of travel. Authors cannot change
that metadata in an action, and saved drops carry configuration rather than group IDs.
No arbitrary cross-project linking or messaging is granted.

`travel(state)` returns `null` or a bounded movement recipe. It activates when a
player tries to enter the gizmo's cell. `destination` is either `{ kind: 'linked' }`
(requires `link`) or `{ kind: 'offset', x, y }` (integer offsets within ±64 cells).
`exits` contains 1–9 ordered offsets within one cell of that destination, including
`[0, 0]` when desired. Set `relative: true` to rotate those offsets with the incoming
direction, where `[1, 0]` means forward. Scape selects a clear in-bounds landing;
a player's occupied landing rejects the move. No recipe can bypass collision,
change floors/worlds, select another player or confer admission.

`cooldownMs` is 650–5000 ms. The accepted source recipe determines the next-travel
deadline. Scape checks collision and player occupancy. Removed destinations cannot be used.
A missing/ambiguous linked destination is inert. Walkability remains independent.

Optional `feedback` contains `durationMs`, non-looping `audio` and `haptic` (`light`
or `heavy`); only the moving player receives this feedback. Optional `arrival`
contains `durationMs` (1–2000), starting `scale` (0.1–1), and `trail` with hex `color`
and `opacity` (0–1). Reduced motion suppresses arrival scale/trails. Pending audio
is cancelled when its source, floor or
build changes or gameplay becomes inactive.

`spin` is decorative rotation, −4 to 4 radians/second, disabled under reduced motion.
`lighting(state, environment)` receives `{ linked: boolean }`; this read-only Scape
context never changes saved state. Use `resolveGizmoLighting` when evaluating a
recipe in tests; it supplies an unlinked context by default.

[Portal](https://developer.scape.wtf/gizmos/movement) combines these primitives.
[Jump pad](https://developer.scape.wtf/examples/gizmos/jump-pad) uses offset travel without
linking, special artwork, sound or glow. Both use the same Scape movement system.

### World picking and navigation

`worldEditor: { field, action, label }` asks Scape to display its anchored world
picker. The field holds `GizmoWorldDestination | null`: `{ id, name }` is display
metadata, and `null` clears the selection. Scape resolves a public-world selection
or entered world code, then submits `{ [field]: destination }` to the declared
editor action. Declare the same field in `configuration` to preserve it in copied
or saved drops. The picker is independent of movement, lighting and text.

`navigate(state)` returns `null` or a `GizmoNavigation` with a `world` code. When
the local player tries to enter the gizmo's cell, Scape starts its normal world-entry
flow. This also works without a picker—for example, an authored fixed destination.
Scape owns admission, private-world access, capacity, bans, credentials and
session cleanup. Uploaded code receives none of those authorities and cannot
navigate to an arbitrary URL. Placing or changing an active world link requires
world administration, even if an author declares a less restrictive action.

Optional departure cosmetics use
`transition: { durationMs, scale, opacity, trail?: { color, opacity } }` (1–1000 ms,
scale/opacity 0.02–1, six-digit hex trail color). Reduced motion skips those
cosmetics. Optional `feedback` supplies bounded shared audio and a haptic, with
sounds from the ordinary sound bank. Stale playback is cancelled. Removing, reconfiguring or replacing the source cancels an
in-flight departure. Rejected navigation restores the player.

`worldTextRange` independently limits `worldText` visibility to a distance in cells
(greater than zero, at most 32). Omit it for normal always-visible world text.

The [built-in Door](https://developer.scape.wtf/gizmos/movement) composes these contracts:
its destination state, label, blue glow, departure recipe and sound live entirely
in the package. Scape manages protected entry/spawn markers.

## Connections

Event inputs and outputs may provide an optional `phrase` (1–80 characters) for
natural-language connection controls. Input phrases are imperative text placed
before the receiving item, such as `phrase: 'turn on'`; output phrases introduce
the source, such as `phrase: 'a round ends on'`. The host can then write
“When [a round ends on] [Game], [turn on] [Lamp].” Keep `label` as the standalone
port name. Without a phrase, the host uses an explicit event/action fallback;
it never guesses grammar from arbitrary labels. Phrases are presentation only
and cannot change the action, permissions, payload, port IDs or signal kind.
Boolean ports retain their value labels and do not accept `phrase`.


Unreleased: Scape hosts can connect placed gizmos through explicit **inputs** and
**outputs**. No definition imports or calls another gizmo. Stable port IDs and
matching `kind: 'event' | 'boolean'` provide interoperability; labels are UI copy,
not routing keys. An event is a one-time pulse (`null`); a boolean is current state.

```ts
inputs: {
  toggle: { label: 'Toggle', kind: 'event', action: 'toggle' },
  power: {
    label: 'Power', kind: 'boolean', action: 'power', value: 'on',
    combine: 'any', locks: ['toggle', 'power'],
  },
},
outputs: { power: { label: 'Power', kind: 'boolean' } },
signals: state => ({ power: state.on }),
```

An input invokes a declared participant action with optional fixed `payload`.
Boolean inputs add their value in the declared `value` payload field. Actions
still validate their payloads and return authored state. Inputs cannot expose
editor/remover actions or navigation/area-removal capabilities. Delivery uses a
host actor (`gizmo-signal`) with no editing or removal authority, never a player's
credentials. A switch icon does not automatically expose an input.

`signals(state, previous, action)` is a pure callback. Report every authored
boolean output on every call, including when `action` is `null` (initial binding
and state reads). Include event outputs with `null` only for actions that should
emit that event. For example, a game can emit `{ won: null }` only when an action
changes a round from playing to won. Never emit events on a null-action read.

Walkable definitions can opt into room-observed outputs without callbacks:

```ts
outputs: {
  pressed: { label: 'Someone steps on', kind: 'event', source: 'arrival' },
  released: { label: 'Someone steps off', kind: 'event', source: 'departure' },
  occupied: { label: 'While occupied', kind: 'boolean', source: 'occupancy' },
},
```

`source` outputs cannot be emitted by author code. `step()` remains cosmetic and
cannot mutate shared state. Normal walking and pushed arrivals generate pulses;
joining/reconnecting and teleporting do not. Occupancy reflects connected players
on the same floor and recovers after departures and authority restarts.

Boolean inputs accept one wire unless `combine: 'any'` is declared, which uses OR.
The host applies a held input when its value changes and sets it to false when
its final wire is removed. `locks` lists manual actions disabled while connected;
it defaults to the input action. Conflicting event inputs targeting those actions
are rejected. Event inputs may have multiple sources; they do not lock manual use.

Scape owns `ObjectInstance.connections` and `signalInputs`; author callbacks must
not write them. Wires reference stable placed instance IDs and remain outside
portable configuration. Only editors of both endpoints may connect same-owner,
same-floor items. Unsupported definitions keep inert saved connections. Hot reload
must preserve valid connected ports. Cycles, mismatched kinds, duplicates, more
than eight ports per direction, eight outgoing wires per item, 128 world wires,
16-link chains, or 32 action deliveries in one propagation are rejected. The host
also applies a 250 ms propagation budget. Failed
propagation rolls back its state changes and feedback. Disconnected boolean inputs
release to false; manual use then resumes.

The existing [Lamp](https://developer.scape.wtf/examples/gizmos/lamp) and
[Pressure pad](https://developer.scape.wtf/examples/gizmos/pressure-pad) demonstrate this contract.
Repository/packed development builds include it. npm SDK publication and compatible
host deployment are separate release steps; the currently published 0.1.1 package
does not yet provide these additions.
