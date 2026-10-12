# Counter

A minimal shared-state example. Anyone can bump it to add one; an editor can reset the count.
It stays solid, with the normal collision sound and shake. Holding movement
against it increments on every repeated bump. The count is bounded to 0–9999. Each accepted increment shows its total as a shared animated number. Reset keeps
its confirmation in the editor controls and emits no number.

`src/definition.ts` owns state validation, permissions, bump actions, number feedback and reset controls.
`src/project.ts` exposes the definition to the SDK loader. Scape supplies the
shared state, identity, permissions and popover UI; the example imports only
`@scape-wtf/sdk`.

See [Run an example](https://developer.scape.wtf/examples/gizmos/counter#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

Tests cover participant increments, number feedback, editor-only reset and the upper bound.
In the developer world, place Counter and try those actions with two players.
