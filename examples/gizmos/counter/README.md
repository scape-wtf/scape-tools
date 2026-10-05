# Counter

A minimal shared-state example. Anyone can add one; an editor can reset the count.
The count is bounded to 0–9999. Reset keeps its confirmation and existing content
placement; neither action is moved into the popover action row.

`src/definition.ts` owns state validation, permissions and declarative controls.
`src/project.ts` exposes the definition to the SDK loader. Scape supplies the
shared state, identity, permissions and popover UI; the example imports only
`@scape-wtf/sdk`.

After installing root dependencies and running `yarn build:gizmos`, run
`yarn build` and `yarn test` here. Use
`yarn dev --origin https://mac-studio.tail22994d.ts.net:3000` to pair edits.
Export with `yarn sdk:starter /absolute/path/my-counter --template counter` at
the repository root, then install and test inside the exported project.

Tests cover participant increments, editor-only reset and the upper bound.
In the developer world, place Counter and try those actions with two players.
