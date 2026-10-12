# Jump pad

A small example of same-floor offset travel. Step onto the pad, then arc four cells
east of it. Place another pad at that landing to jump again automatically. The destination must be inside the floor and clear of blocking items
and players. When travel is unavailable the tile remains walkable.

The project uses `travel` without `link`, sound, glow or spin. Change the destination
offset, landing offsets and character-motion keyframes in `src/definition.ts` to try other movement patterns.
Scape validates movement, cooldown and collisions; the recipe cannot switch
worlds or floors or move someone else.

`motion` authors the 700 ms lift, stretch and landing compression. The same
recipe animates nearby remote players. `activateOnArrival` opts this pad into
activation after stepping or landing; every leg still checks collisions and cooldown. Reduced motion omits
the arc while preserving timing. Corrections, removal and stale/background
arrivals cancel the next leg.

The example is included in every developer-world scene palette beside chat.

See [Run an example](https://developer.scape.wtf/examples/gizmos/jump-pad#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

Movement input during a flight takes effect at landing and leaves the automatic
chain, so authored loops remain escapable.
