# SDK pressure pad

See [Run an example](https://developer.scape.wtf/examples/gizmos/pressure-pad#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

An independent gizmo that lights up and plays a short synthesized note when a
player walks or rides a conveyor onto its cell. Walking produces cyan light;
push arrival produces purple light. The glow and sound expire after 600 ms.
It uses only `@scape-wtf/sdk`, with no app imports, timers, Three.js or audio engine.
The example is available in your developer world.

To try it immediately, open **Profile → Settings → Developer → Developer world**, choose
**Pressure pad** in Developer tools → Gizmos → Choose a gizmo to place, then place it. No pairing or
upload is required, including in an existing developer world. Place an arrow next
to the pad, pointing onto it, to test push arrival. To continue riding across
the pad, select an arrow and tap your pad, or select Pressure pad and tap your
arrow. A direction badge marks the combination. Place a different arrow onto it
to change direction; moving, saving or deleting affects the whole combined item.

`src/definition.ts` owns the sound and `step(state, event)` response;
`src/project.ts` registers it. Feedback is local to each viewer, using observed
movement. This cosmetic callback is not a server-authoritative trigger and never edits saved state.
Scape supplies the event ID and time, validates feedback, and clears it when it expires.

Review on both floors: walk onto the pad, stand still, leave and return, ride an
arrow onto it, continue across combined pads through a corner or loop, and watch
another player do the same. A blocked belt must trigger only its initial arrival. Joining or teleporting onto
it should stay quiet. Remove the pad or switch away during feedback; old effects
must not replay on return.

Walkability is explicit (`walkable: true`); `step` only supplies feedback. The SDK
reports `movement: 'push'` for arrivals from any push gizmo, including the
[Floor fan](../fan/README.md), not just conveyors.

Unreleased connections: the existing pad additionally declares **Someone steps on**,
**Someone steps off**, and **While occupied** outputs. A compatible Scape room
worker observes accepted movement and presence independently of `step()`, and the
directory routes those outputs to connected gizmos. Open the pad → **Connect to…**
→ choose a placed Lamp → Toggle, Turn on, Turn off, or held Power. No new gizmo is
needed. The final player leaving or disconnecting releases held Power.
See the [SDK contract](../../../packages/scape-sdk/README.md#connections).
Use the repository SDK or its packed starter until the updated SDK is published.
