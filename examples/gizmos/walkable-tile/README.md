# Walkable tile

A stateless floor tile demonstrating `walkable: true` independently of actions,
push or arrival feedback. It has no configuration panel, light or sound.

`src/definition.ts` owns the metadata and empty-state validation;
`src/project.ts` exposes it to the SDK loader. Scape supplies collision,
movement, placement and removal through the same rules used by other gizmos.
The example imports only `@scape-wtf/sdk`.

See [Run an example](https://developer.scape.wtf/examples/gizmos/walkable-tile#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

Tests cover empty-state validation and independence from push and arrival effects.
In the developer world, place the tile and walk onto and off it on both floors.
