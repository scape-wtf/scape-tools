# SDK pressure pad

Inside this repository, you can run `yarn dev --origin <Scape origin>` directly
from this example directory after the root dependencies are installed. `yarn build`
and `yarn test` also use the repository tools. Do not install the unpublished
packages from the registry here. Export with `yarn sdk:starter` for an independent
project; the exporter switches its scripts to the locally installed SDK tools.

An independent gizmo that lights up and plays a short synthesized note when a
player walks or rides a conveyor onto its cell. Walking produces cyan light;
push arrival produces purple light. The glow and sound expire after 600 ms.
It uses only `@scape-wtf/sdk`, with no app imports, timers, Three.js or audio engine.
The example is included by default in developer worlds and excluded from ordinary worlds.

To try it immediately, open **Profile → Settings → Developer → Developer world**, choose
**Pressure pad** in Developer tools → Build → Gizmo, then place it. No pairing or
upload is required, including in an existing developer world. Place an arrow next
to the pad, pointing onto it, to test push arrival. To continue riding across
the pad, select an arrow and tap your pad, or select Pressure pad and tap your
arrow. A direction badge marks the combination. Place a different arrow onto it
to change direction; moving, saving or deleting affects the whole combined item.

To edit its source independently, export a standalone project:

```sh
yarn sdk:starter /absolute/path/my-pressure-pad --template pressure-pad
```

In the exported directory, run `yarn install`, `yarn test`, then
`yarn dev --origin https://your-scape-host`. Approve pairing in your developer
world and place **Pressure pad** (🔘). Place an arrow next to it, pointing onto
it, to try a push arrival. Combine it with your arrow to carry riders onward.
Scape owns the [conveyor surface](../../built-in/conveyor/README.md); the pad continues
to own only its arrival response. Other players cannot combine your items.

`src/definition.ts` owns the sound and `step(state, event)` response;
`src/project.ts` registers it. Feedback is local to each viewer, using observed
movement. It is not a server-authoritative trigger and never edits saved state.
The host assigns an event ID/time, validates output, handles expiration and
cleanup, and uses the existing shared protected browser/native audio path.
The SDK and CLI remain unpublished; the exporter includes packed local archives.

Review on both floors: walk onto the pad, stand still, leave and return, ride an
arrow onto it, continue across combined pads through a corner or loop, and watch
another player do the same. A blocked belt must trigger only its initial arrival. Joining or teleporting onto
it should stay quiet. Remove the pad or switch away during feedback; old effects
must not replay on return. The owner accepted conveyor composition on October 3; separate physical-device
listening results are not recorded.

Walkability is explicit (`walkable: true`); `step` only supplies feedback. The SDK
reports `movement: 'push'` for arrivals from any push gizmo, including the
[Floor fan](../fan/README.md), not just conveyors.
