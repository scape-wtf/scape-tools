# SDK lamp example

Inside this repository, you can run `yarn dev --origin <Scape origin>` directly
from this example directory after the root dependencies are installed. `yarn build`
and `yarn test` also use the repository tools. Do not install the unpublished
packages from the registry here. Export with `yarn sdk:starter` for an independent
project; the exporter switches its scripts to the locally installed SDK tools.

An independent interactive lamp, included by default in developer worlds and excluded from ordinary worlds. Anyone in the
world can switch a lamp on or off; its editor can choose Warm, Blue or Pink.
Each placed lamp retains its own state. The lantern emoji avoids the reserved
built-in light tile.

The package imports only `@scape-wtf/sdk`. `lighting(state)` returns the complete
world light and decorative glow for that state; `{}` switches both off. Scape
validates results, renders and batches them, animates numeric recipes, and owns
floor isolation, reduced motion and cleanup. No Three.js access is needed.

To try it immediately, open **Profile → Settings → Developer → Developer world**, choose
**Lamp** in Developer tools → Build → Gizmo, then place it. Existing developer worlds
receive the example too; no local project connection is required.

Tap the Lamp to open its popover, then use the primary switch in the action row
to turn it on/off (`toggle-3` for on, `toggle-2` for off). Configure starts closed.
Its placer can open the gear **Configure** action
to choose Warm, Blue or Pink while world editing is allowed. The trash **Delete**
action follows normal removal permission and requires confirmation. Escape or a
tap outside closes the popover. Scape supplies this shared UI from the actions'
`participant`/`editor` permissions; the example owns no DOM or deletion reducer.

To edit its source independently, export a standalone project from the repository:

```sh
yarn sdk:starter /absolute/path/my-lamp --template lamp
```

In that new directory, run `yarn install`, `yarn test`, then
`yarn dev --origin https://your-scape-host`. Approve pairing in your developer
world and place **Lamp**. `src/definition.ts` owns colors, controls and permissions;
`src/project.ts` registers the gizmo. The SDK and CLI remain unpublished and are
included as local package archives by the exporter.

Review on both floors: switch on/off, choose colors, place several lamps beside
Fire and Disco, move/remove them, pan away/back, and reload to verify saved state.
Automated checks cover the standalone package, restricted upload execution,
authoritative actions, state updates, invalid output and rendering lifecycle.
Browser appearance and device GPU performance require owner review.
