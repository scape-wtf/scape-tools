# Scape SDK (experimental)

Gizmos are things you place in Scape that do something. The current API defines them with
`defineObject` and collects them with `defineProject({ objects: [...] })`.

A dependency-free ESM package for defining Scape gizmos. Version 0.1.0 is local and
published under the `@scape-wtf` scope; releases remain experimental until a
stable compatibility policy is declared.
The standalone starter and CLI require Node 22 or newer.

- `@scape-wtf/sdk`: `defineObject`, `defineProject`, `PROJECT_OBJECT_LIMIT`, typed definitions, state, action context, declarative fields/buttons,
  validation helpers and `ObjectActionError`.
- `@scape-wtf/sdk/runtime`: `ObjectRegistry`, `isObjectEnvelope` and `OBJECT_STATE_BYTE_LIMIT`
  for hosts and local tests. This entry has no built-in gizmos or game dependencies.

Definitions supply a namespaced type, state version, emoji, initial state, validator,
actions and optional view. Actions declare `participant` or `editor` permission.
The Scape popover keeps participant controls directly available and groups editor
controls/associated fields under its gear **Configure** action by default.
An explicit action-row placement changes presentation, never permission. It provides its own
two-step **Delete** action according to host removal permission. Authors should not
add duplicate configuration, close or delete controls to their views. Dismissal,
loading, errors, feedback and keyboard behavior belong to the shared host.
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
for hosts; the uploaded runtime and Scape popover use the same validator.
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

In Scape the server supplies identity, permission, time and randomness. In a local test,
you supply them; local tests do not authenticate anyone or prove world access.

State is visible to room participants. Payloads are limited to 2 KiB, state to 32 KiB,
and JSON depth to 16. Reducers receive cloned data; invalid results are rejected.
Reducers must be synchronous and free of side effects. This runtime validates data
and permissions, but does not isolate code or bound its execution time.

The SDK contains no renderer, game distribution, credentials, world connection, upload
client, private storage, live-media/gem APIs, or version migration machinery. The separate `@scape-wtf/cli` tool can connect a local project to its private developer world;
Scape uses its separate restricted runtime for uploaded gizmo definitions.
The unified CLI uses `scape gizmo init` and `scape gizmo dev`; `scape init` and
`scape dev` remain aliases. It also configures/serves MCP through `scape agent mcp`,
without giving agents Gizmo upload grants or supplying an agent model.

Export the initial kit from source with `yarn sdk:starter <new-directory>`. It contains
`scape-sdk.tgz`, `scape-cli.tgz` and `scape-agent-mcp.tgz`. Keep these
archives and the manifest's Yarn resolutions together. After `yarn install`, the kit
supports both Gizmo development and agent MCP configuration without a source checkout.
Public third-party dependencies still need installation. See the
[CLI guide](../scape-cli/README.md) for commands and pairing.
The authoring package itself does not provide isolation.
A project default-exports `defineProject({ objects: [first, second] })`. The current
host accepts up to 16 gizmos, validates the entire update before activation and retains
independent state per placed instance. Types and emojis must be unique; remove placed
instances before removing a definition. Single-gizmo default exports remain compatible.
The interface is experimental and may change before public distribution.

From the Scape repository, run `yarn build:sdk` after editing this package. Normal root
installation, game build, development start and typecheck build it automatically.
`yarn sdk:starter /path/to/new-project` exports an independent blank project
with packed copies of this SDK and the development command. The destination's parent directory must already exist.
Use `--template voting-booth` for the optional worked example. The blank project has empty
state and no actions; `src/project.ts` collects definitions to register in your private
world. See the [developer guide](../../docs/developer-playground.md) for reserved names/emojis,
connection approval and compatibility rules. No package is published and no separate repository is created.

Gizmos can also declare models, animation, interaction and independent audio through the experimental
[presentation contract](../../docs/gizmo-presentation.md). The SDK contains the JSON types,
validation, quaternion helpers and shared procedural sound rendering; platform rendering/output stays in Scape.

Text gizmos can declare `worldText(state)`, `textEditor` and `editPolicy`. The host
renders bounded plain text and reuses its anchored editor; Sign is the built-in
reference. `ObjectRegistry.configuration(instance)` exports only the declared editor
field as `{ type, version, values }`; `configure(instance, configuration, context)`
applies it through the declared action and normal editing authority. Configuration
values have the same 2 KiB JSON limit as action payloads. Scape uses this for saved
drops and fresh placements; identities, ownership and unrelated live state are never
copied. Matching default values require no edit action, while nondefault values require
editor permission. Unsupported types/versions and undeclared fields are rejected.
See the repository's `docs/gizmo-presentation.md` for bounds and permissions.

Audio uses compact `GizmoSynth` or layered `GizmoNoiseSound` definitions in `sounds`, independent `audio(state, previous)`
play/stop timelines, optional ambient playlists and author-owned `sequence(context)` callbacks. Compose sine/triangle/square/sawtooth
oscillators or noise with pitch/volume envelopes, filters, delay and reverb. Dice and
Mushroom use this same public API. Fire uses filtered noise layers, slow modulation
and randomized grains through `GizmoNoiseSound`. Sequences choose per-strike parameters and timing;
shared `ambience.bus` effects retain delay, convolution and compressor state. Scape renders samples in bounded background workers
and routes cached sounds or continuous chunks to the browser or native iOS engine. No generated audio file is
required. Diffuse `noise-reverb` renders a seeded, normalized stereo impulse; it and
`delay` support parallel wet sends that preserve the dry sound. `renderGizmoSound` is also available for local tests; `gizmoSynthError` reports
field-specific errors without rendering. Model animations are not required.

Playback supports looping, gain, pitch/speed and spatial range. Optional PCM16 WAV imports
remain supported for recordings. `encodeGizmoWav` is a tooling helper, not a requirement
for procedural authoring. The SDK has no built-in instrument names or preset dispatch.

Passive gizmos can declare `ambience`, `glow` and/or `light` without an action or panel. Clocks,
proximity, voice budgets, platform routing and cleanup belong to Scape. The presentation
contract above provides a complete procedural example, limits and recovery behavior.


Host catalogs use strict `ObjectRegistry` validation by default. Trusted built-in hosts
can opt into `{ isolateInvalidDefinitions: true }` during startup, inspect `failures()`,
and `disable(definition, reason)` after a model-preparation failure. `fork()` carries
these diagnostics and disabled-placement guards to a separate catalog. `reset()` remains
strict and atomic; a successful reset clears failures for restored types/emojis while
retaining unavailable built-ins. This host-only recovery is not a sandbox for trusted
code and must not replace atomic uploaded-project activation.

`light` describes bounded world illumination: colors, radius, falloff and optional
noise motion. It works independently of audio. Ambient loops can declare
`normalizeSources`, `loopPhase` and partial `duckGain`; see the presentation contract
for ranges, defaults and native compatibility. Scape retains output protection and
player volume regardless of authored sound or lighting choices.

`lighting(state)` can replace fixed `light`/`glow` recipes with a complete result
for each accepted state; return `{}` to turn both off. Scape validates every result
and caches it outside the frame loop. The optional bounded `light.pattern` adds
palette-based scattered masks. See the [lighting contract](../../docs/gizmo-presentation.md#state-driven-lighting)
and [standalone lamp](../../gizmos/examples/lamp/README.md). Export the lamp using
`yarn sdk:starter /absolute/new/directory --template lamp`.

### Step feedback

A `step(state, event)` callback supplies bounded cosmetic feedback on walking or
push arrival. Declare `walkable: true` separately to let players enter its cell. Return `null` or
`{ durationMs, lighting?, audio? }`: 1–2,000 ms, existing light/glow recipes and
non-looping audio commands. The host supplies `event.id`, `event.at` and
`event.movement` (`walk` or `push`), restores normal lighting on expiration,
and cancels stale playback. State remains unchanged. Joins, teleports and standing
still do not trigger it. This is observed local feedback, not shared authority.

Export the independent example with
`yarn sdk:starter /absolute/path/my-pad --template pressure-pad` from the Scape
repository. It is an ordinary SDK consumer and is available by default in developer
worlds alongside Counter, Voting booth and Lamp. Ordinary worlds keep their built-in catalog.

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
saved state, not an arrival event: the host caches results until state/code changes.
It receives no player object, credentials or world mutation access. The host moves
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

The [Conveyor package](../../gizmos/built-in/conveyor/README.md) combines walkability, a fixed
push and opposing-input blocking. The [Floor fan](../../gizmos/examples/fan/README.md)
chooses direction from each instance's saved state and can switch off independently.
Both use exactly the same SDK and movement engine. The
[walkable tile](../../gizmos/examples/walkable-tile/src/definition.ts) has neither push nor step.
These examples are available by default in developer worlds; built-in conveyors
are also available in ordinary worlds. Export the fan with `--template fan`.

Scape's existing arrow placement supports combining a conveyor with a walkable
gizmo that does not already declare `push`, in either order. Saved arrow identity,
overlay badges and compact old saves are host compatibility adapters. They obtain
movement behavior from the installed Conveyor definition. Composition is an
owner-authorized scene edit and never flattens an arbitrary stateful push gizmo
into an arrow. Saved drops retain the overlay and declared portable configuration
(or initial state), with fresh identity. There is no conveyor-specific SDK API.


### Updating local prototypes

This replaces the earlier unpublished `conveyor` property. Change it to
`walkable: true` plus `push: () => ({ direction, blockOpposingInput: true })`.
Existing `step` definitions must declare walkability explicitly and check
`event.movement === 'push'` for transported arrivals. Rebuild and upload paired
projects after updating their source/SDK. The existing live-upload guard requires
removing placed instances before changing their walkability. Bundled examples are
already updated; saved scenes are not rewritten.

### State-dependent sound, previews and layered sprites

The complete [`@scape/gizmo-piano`](../../gizmos/built-in/piano/README.md) demonstrates these
capabilities; the SDK has no note names, sound presets or instrument dispatch.

- `configuration: { action, fields, remember?, open? }` declares portable settings.
  `action` must be an editor reducer. Saved drops copy only these fields; the host
  may remember successfully saved settings for later placements in the session.
- `soundBank(state)` returns up to 16 named sound recipes, at most 64 KiB of JSON.
  It replaces static `sounds` and cannot accompany ambience. The host caches by
  definition/state and synthesizes in a bounded background worker.
- `{ kind: 'partials', duration, layers, amplitude, ... }` describes additive
  oscillators, optional vibrato, one-pole filters, seeded excitation, distortion
  and echoes. Limits: 4 seconds, 8 layers, 32 partials/layer, 8 stages/chain,
  oversampling 1/2/4 and a total work budget of 512 operator-seconds. No executable
  DSP, device handles or arbitrary audio graph access crosses this contract.
- `previews[name] = { permission, run(state, payload) }` returns `{ sound, gain }`.
  A control with `kind: 'preview'` invokes it locally; a saving control can name
  `preview` to audition its payload before saving. Previews never execute reducers
  or send world actions. Target, selection, permission and lifecycle guards cancel
  obsolete output; installed iOS still uses native output exclusively.
- `sprite(state)` returns a 64–512-pixel recipe with 1–4 named layers and up to 16
  shapes/layer: rounded rectangles, bounded text, or a host composition marker.
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
Host integrations call `ObjectRegistry.execute` to receive `{ instance, reaction }`;
`act` still returns just the instance and cannot deliver effects on its own.

```ts
react: () => ({
  feedback: {
    durationMs: 600,
    burst: { color: '#a9e8ff', radiusCells: 1.5, particles: 0 },
    audio: [{ kind: 'play', voice: 'bell', sound: 'bell', delayMs: 0,
      gain: 1, rate: 1, loop: false, rangeCells: [1, 8], stereo: .7 }],
  },
})
```

Declare `bell` in `sounds` or `soundBank`. Feedback is bounded to 16 KiB and
1–2000 ms. Audio must be non-looping and start before feedback expires. Action
sound ranges are 0–16 cells; ambience remains bounded to 12. Optional `lighting`
uses the existing light/glow contract and restores saved lighting on expiry.
A `burst` has radius .1–8 cells, 0–24 particles, a hex color and optional `flash`
emoji/1–4 `particleEmojis` (single pictographs). Optional `impulse` uses scale
1–1.5 and rotation ±.3 radians, with an optional shorter `durationMs`.
`cameraShake` is limited to strength 0–18 and 1–500 ms; the host attenuates it
within 14 cells and suppresses it for reduced motion. `haptic: 'light' | 'heavy'`
is optional initiating-player feedback; device support determines delivery.

Scape validates feedback before committing state, then broadcasts an ephemeral
event after the scene transaction succeeds. Position, floor, instance, build,
server time and operation ID come from the host. Only referenced sounds travel
with it, within an 80 KB event limit. Playback is best effort, not a durable queue:
HTTP/socket duplicates and action retries do not replay; snapshots and late joins
contain no history. Events older than two seconds, hidden/blocked sessions,
other floors and mismatched developer builds are discarded. Prepared audio has
a further 250 ms deadline. Floor/session changes cancel queued audio and visuals.
Reduced motion suppresses particle travel, sprite impulses and camera shake.
Installed iOS sound uses native output with no browser fallback.

A separate `areaRemoval: { radiusCells: 0..3 }` declaration allows
`react` to request `removeArea: { radiusCells }` within that maximum. The host
anchors the square to the current instance and floor. The actor must be allowed
to remove the source; every candidate is checked separately, and unauthorized
items are skipped. Entry protection, world editing and radio authority still
apply. State and removals commit atomically in one scene operation. A reducer
cannot select arbitrary coordinates, other floors or item IDs. Use action
`permission: 'remover'` when the action itself also requires source removal rights.
Host contexts supply `canRemove`; it defaults to false.

See [Chime](../../gizmos/examples/chime/README.md) for a shared signal and
[Bomb](../../gizmos/built-in/bomb/README.md) for an independent composition of bump input,
server timing, shared feedback and area removal.

## Linking and same-floor travel

`link: { size: 2 }` asks the host to group placements of the same definition/version
on one floor. The host joins the oldest incomplete group or creates an opaque
`ObjectInstance.linkId`. Grouping is independent of travel. Authors cannot change
that metadata in an action, and saved drops carry configuration rather than group IDs.
No arbitrary cross-project linking or messaging is granted.

`travel(state)` returns `null` or a bounded movement recipe. It activates when a
player tries to enter the gizmo's cell. `destination` is either `{ kind: 'linked' }`
(requires `link`) or `{ kind: 'offset', x, y }` (integer offsets within ±64 cells).
`exits` contains 1–9 ordered offsets within one cell of that destination, including
`[0, 0]` when desired. Set `relative: true` to rotate those offsets with the incoming
direction, where `[1, 0]` means forward. The host selects a clear in-bounds landing;
a player's occupied landing rejects the move. No recipe can bypass collision,
change floors/worlds, select another player or confer admission.

`cooldownMs` is 650–5000 ms. The accepted source recipe determines the next-travel
deadline. Server-signed geometry describes the allowed edges; ordinary movement
credit and player occupancy checks still apply. Stale or removed edges are rejected.
A missing/ambiguous linked destination is inert. Walkability remains independent.

Optional `feedback` contains `durationMs`, non-looping `audio` and `haptic` (`light`
or `heavy`); only the moving player receives this feedback. Optional `arrival`
contains `durationMs` (1–2000), starting `scale` (0.1–1), and `trail` with hex `color`
and `opacity` (0–1). Reduced motion suppresses arrival scale/trails. Pending audio
uses the shared native/browser output and is cancelled when its source, floor or
build changes or gameplay becomes inactive.

`spin` is decorative rotation, −4 to 4 radians/second, disabled under reduced motion.
`lighting(state, environment)` receives `{ linked: boolean }`; this read-only host
context never changes saved state. Use `resolveGizmoLighting` when evaluating a
recipe in tests; it supplies an unlinked context by default.

[Portal](../../gizmos/built-in/portal/README.md) combines these primitives.
[Jump pad](../../gizmos/examples/jump-pad/README.md) uses offset travel without
linking, special artwork, sound or glow. Both use the same movement host.

Generic travel geometry requires the updated room worker. Equivalent reciprocal
adjacent-exit pairs also retain the old signed pair representation so existing
workers can continue validating built-in Portal movement during rollout. Offset
travel or longer cooldown recipes require the updated authority; do not announce
those hosted capabilities before deploying that worker.

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
The host owns admission, private-world access, capacity, bans, credentials and
session cleanup. Uploaded code receives none of those authorities and cannot
navigate to an arbitrary URL. Placing or changing an active world link requires
world administration, even if an author declares a less restrictive action.

Optional departure cosmetics use
`transition: { durationMs, scale, opacity, trail?: { color, opacity } }` (1–1000 ms,
scale/opacity 0.02–1, six-digit hex trail color). Reduced motion skips those
cosmetics. Optional `feedback` supplies bounded shared audio and a haptic, with
sounds from the ordinary sound bank; playback respects native routing and stale
source cancellation. Removing, reconfiguring or replacing the source cancels an
in-flight departure. Rejected host navigation restores the player.

`worldTextRange` independently limits `worldText` visibility to a distance in cells
(greater than zero, at most 32). Omit it for normal always-visible world text.

The [Door package](../../gizmos/built-in/door/README.md) composes these contracts:
its destination state, label, blue glow, departure recipe and sound live entirely
in the package. Entry/spawn markers remain host infrastructure. This migration is
implemented and owner-approved October 3, 2026; it is not yet a published
or deployed SDK release.
