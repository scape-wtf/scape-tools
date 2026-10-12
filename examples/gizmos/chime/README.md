# Chime

A shared-action example using only `@scape-wtf/sdk`. Bump into 🛎️ to ring it.
Each fresh accepted bump shares a short sound and blue burst with nearby participants
on the same floor. Your own sound and burst start on contact, without waiting for the server.
Repeated hits replace the previous sound and burst on that placed chime. `interactionFeedback`
declares the immediate sound and burst; the accepted reaction shares them with other
players. Matching confirmations never replay your contact feedback. Saved timestamps retain
compatibility, and the action still runs with normal participant permissions.

Chime is available in the developer-world scene palette beside chat.

Edit `src/definition.ts`; `src/project.ts` exposes it to the SDK loader.
Scape owns permission checks, shared delivery, rendering and protected audio.
See [Run an example](https://developer.scape.wtf/examples/gizmos/chime#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

The package tests verify bump metadata, rapid repeats and accepted-action feedback. In your developer world, also check multiple instances, different floors, reconnecting and a backgrounded page.
