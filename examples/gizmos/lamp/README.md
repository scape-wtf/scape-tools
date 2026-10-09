# SDK lamp example

See [Run an example](https://developer.scape.wtf/examples/gizmos/lamp#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

An interactive lamp included in your developer world. Anyone in the
world can switch a lamp on or off; its editor can choose Warm, Blue or Pink.
Each placed lamp retains its own state. The lantern emoji avoids the reserved
built-in light tile.

The package imports only `@scape-wtf/sdk`. `lighting(state)` returns the complete
world light and decorative glow for that state; `{}` switches both off. Scape
validates and displays the light, respecting floors and reduced motion. No Three.js access is needed.

To try it immediately, open **Profile → Settings → Developer → Developer world**, choose
**Lamp** in Developer tools → Gizmos → Choose a gizmo to place, then place it. Existing developer worlds
receive the example too; no local project connection is required.

Tap the Lamp to open its popover, then use the primary switch in the action row
to turn it on/off. Configure starts closed.
Its placer can open the gear **Configure** action
to choose Warm, Blue or Pink while world editing is allowed. The trash **Delete**
action follows normal removal permission and requires confirmation. Escape or a
tap outside closes the popover. Scape supplies this shared UI from the actions'
`participant`/`editor` permissions; the example owns no DOM or deletion reducer.

Edit `src/definition.ts` to change colors, controls and permissions. `src/project.ts` registers the Gizmo.

Review on both floors: switch on/off, choose colors, place several lamps beside
Fire and Disco, move/remove them, pan away/back, and reload to verify saved state.

Unreleased connections: this same lamp exposes Toggle, Turn on, Turn off, and
held Power inputs, plus a boolean Power output. In a compatible developer host,
open a Pressure pad → **Connect to…** → choose this lamp. **While occupied → Power**
uses any occupied pad and disables the manual switch while wired. Disconnecting
the final held input turns it off and restores manual switching. No additional
lamp definition is needed. See the [SDK contract](../../../packages/scape-sdk/README.md#connections).
Use the repository SDK or its packed starter until the updated SDK is published.

The event inputs include optional sentence phrases (`toggle`, `turn on`, `turn off`) so the shared connection editor reads naturally. Labels and action behavior stay the same.
