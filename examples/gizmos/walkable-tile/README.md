# Walkable tile

A stateless floor tile demonstrating `walkable: true` independently of actions,
push or arrival feedback. It has no configuration panel, light or sound.

`src/definition.ts` owns the metadata and empty-state validation;
`src/project.ts` exposes it to the SDK loader. Scape supplies collision,
movement, placement and removal through the same rules used by other gizmos.
The example imports only `@scape-wtf/sdk`.

After installing root dependencies and running `npm run build:gizmos`, run
`npm run build` and `npm test` here. Pair changes using
`npm run dev`.
Export with `npm exec -- scape gizmo init /absolute/path/my-tile --template walkable-tile`
at the repository root, then install and test in the exported project.

Tests cover empty-state validation and independence from push and arrival effects.
In the developer world, place the tile and walk onto and off it on both floors.
