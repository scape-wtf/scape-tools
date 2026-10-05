# Floor fan

Inside this repository, you can run `npm run dev` directly
from this example directory after the root dependencies are installed. `npm run build`
and `npm test` also use the repository tools. The public packages are available from npm. For an independent project, use `npx @scape-wtf/cli@latest gizmo init my-gizmo`; source contributors can still use the repository exporter.

A standalone example of **walkability plus state-driven pushing**, using only
`@scape-wtf/sdk`. It is available by default in the developer-world sidebar and palette.
Place 🪭, walk onto it, and it pushes you one cell right. Put a Pressure pad at the
exit to see its normal arrival feedback. A fan has no step callback or sound of its own.

Its primary switch turns the push off; the tile remains walkable. Configure lets
the placer choose Right, Down, Left or Up from the shared dropdown. Selecting a
new direction saves automatically; a failed save restores the last saved direction.
The definition declares `kind: 'select'` and `trigger: 'change'`; those generic
controls can submit any developer-defined choices. Its reducer separately validates
the direction and editor permission. Each placed fan has independent state.
The shared host supplies Configure, Delete, the switch icons and action permissions.
Direction and on/off survive scene saving, movement, rejoining and floor changes.
Saved-drop copies start with this example's initial settings: it does not yet declare
portable configuration.

`push(state)` returns a direction or `null`, not a player mutation. Scape attempts
one adjacent-cell move at its fixed speed, retries a blocked exit at a bounded rate,
and handles collision, doors, floors and multiplayer observation. You can walk
against this fan. Conveyor arrows opt into `blockOpposingInput: true`; this example
leaves it false. Neither can bypass walls or target another player.

Change the direction logic or add a cosmetic `step` callback to experiment. The
walkable-only 🟦 example demonstrates that neither callback is required for a floor.

Export an independent copy:

```sh
yarn sdk:starter /absolute/new/fan-project --template fan
```

Inside that copy, run `npm install`, `npm test`, then
`npm run dev` to pair it with your developer world.
The packed-consumer regression builds and tests this exact source outside the
monorepo. Gameplay tests cover local and remote pushes, switching, direction changes,
blocked paths and once-per-arrival pad effects. Browser/device review belongs to the owner.
