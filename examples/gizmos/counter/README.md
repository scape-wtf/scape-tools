# Counter

A minimal shared-state example. Anyone can add one; an editor can reset the count.
The count is bounded to 0–9999. Reset keeps its confirmation and existing content
placement; neither action is moved into the popover action row.

`src/definition.ts` owns state validation, permissions and declarative controls.
`src/project.ts` exposes the definition to the SDK loader. Scape supplies the
shared state, identity, permissions and popover UI; the example imports only
`@scape-wtf/sdk`.

See [Run an example](https://developer.scape.wtf/examples/gizmos/counter#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

Tests cover participant increments, editor-only reset and the upper bound.
In the developer world, place Counter and try those actions with two players.
