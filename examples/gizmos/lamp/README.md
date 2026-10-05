# SDK lamp example

Inside this repository, you can run `npm run dev` directly
from this example directory after the root dependencies are installed. `npm run build`
and `npm test` also use the repository tools. The public packages are available from npm. For an independent project, use `npx @scape-wtf/cli@latest gizmo init my-gizmo`; source contributors can still use the repository exporter.

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
npm exec -- scape gizmo init /absolute/path/my-lamp --template lamp
```

In that new directory, run `npm install`, `npm test`, then
`npm run dev`. Approve pairing in your developer
world and place **Lamp**. `src/definition.ts` owns colors, controls and permissions;
`src/project.ts` registers the gizmo. The SDK and CLI are published packages. Source exports may still include local archives for repository contributors.

Review on both floors: switch on/off, choose colors, place several lamps beside
Fire and Disco, move/remove them, pan away/back, and reload to verify saved state.
Automated checks cover the standalone package, restricted upload execution,
authoritative actions, state updates, invalid output and rendering lifecycle.
Browser appearance and device GPU performance require owner review.
