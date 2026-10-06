# Jump pad

A small example of same-floor offset travel. Walk into the pad to move four cells
east of it. The destination must be inside the floor and clear of blocking items
and players. When travel is unavailable the tile remains walkable.

The project uses `travel` without `link`, sound, glow or spin. Change the destination
offset and landing offsets in `src/definition.ts` to try other movement patterns.
The host validates movement, cooldown and collisions; the recipe cannot switch
worlds or floors or move someone else.

The example is included in every developer-world sidebar and palette.

See [Run an example](https://developer.scape.wtf/examples/gizmos/jump-pad#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf` by default;
use `--origin <https-url>` only for another compatible host.
