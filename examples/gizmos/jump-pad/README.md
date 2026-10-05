# Jump pad

A small example of same-floor offset travel. Walk into the pad to move four cells
east of it. The destination must be inside the floor and clear of blocking items
and players. When travel is unavailable the tile remains walkable.

The project uses `travel` without `link`, sound, glow or spin. Change the destination
offset and landing offsets in `src/definition.ts` to try other movement patterns.
The host validates movement, cooldown and collisions; the recipe cannot switch
worlds or floors or move someone else.

Run `yarn build`, `yarn test`, or `yarn dev --origin <Scape origin>` here.
The example is included in every developer-world sidebar and palette.
Export it with `yarn sdk:starter /absolute/path/jump-pad --template jump-pad`.
