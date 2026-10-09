# Floor fan

See [Run an example](https://developer.scape.wtf/examples/gizmos/fan#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

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
Scape supplies Configure, Delete, the switch icons and action permissions.
Direction and on/off survive scene saving, movement, rejoining and floor changes.
Saved-drop copies start with this example's initial settings: portable configuration is not declared.

`push(state)` returns a direction or `null`, not a player mutation. Scape attempts
one adjacent-cell move at its fixed speed, retries a blocked exit at a bounded rate,
and handles collision, doors, floors and multiplayer observation. You can walk
against this fan. Conveyor arrows opt into `blockOpposingInput: true`; this example
leaves it false. Neither can bypass walls or target another player.

Change the direction logic or add a cosmetic `step` callback to experiment. The
walkable-only 🟦 example demonstrates that neither callback is required for a floor.

After editing, test each direction, switching off, blocked exits and arrival onto a Pressure pad. Check that separate fans retain independent settings.
