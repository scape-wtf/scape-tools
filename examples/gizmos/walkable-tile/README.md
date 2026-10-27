# Walkable tile

A walkable 🔳 floor tile demonstrating the SDK's native `kind: 'emoji'` field.
World owners and moderators can open Configure and choose an appearance from
Scape's existing scene emoji library. The shared picker provides categories and
name search and saves a deliberate selection immediately. Other participants
can walk across the tile but cannot change its appearance, even when they placed it.
Choosing a fire, door or conveyor emoji changes only the picture.

The SDK's `configuration.remember: true` reuses the last successfully saved emoji
for later placements in the current session. Configure stays closed on placement;
changing one tile updates the next placement's default without changing existing
tiles. Reloading starts with 🔳 again. No checkbox or separate copy action is needed.
If configuration permission is lost, ordinary placement uses 🔳 instead of
submitting the remembered owner/moderator settings.

`src/definition.ts` owns state, validation, owner/moderator policy, the field and
sprite recipe. `src/project.ts` exposes the project. Scape supplies the curated
picker, authoritative permissions, rendering, movement, placement and removal.
The example imports only `@scape-wtf/sdk`.

The canonical identity is 🔳. `legacyEmojis: ['🟦']` retains old blue tile identities,
and version 1 still accepts their empty saved state. Missing appearance displays
🔳 without rewriting the saved scene. Copying resolves that missing configuration
from the initial default; explicit saves store `{ emoji }`. Selected appearances
never change the catalog identity, instance ID, walkability or conveyor component.

Inside this example directory, run `yarn build`, `yarn test`, and `yarn dev`.
See [Run an example](https://developer.scape.wtf/examples/gizmos/walkable-tile#run-this-example)
for independent setup. This example requires the host and SDK emoji-field and
legacy-identity support; source changes do not publish the SDK or update installed
immutable shop releases.

Package tests cover validation, permissions, legacy state, sprite recipes and
portable configuration. Host tests cover the curated choices, pending/stale UI,
authoritative restrictions, both floors and conveyor composition. Browser/device
review is owner-run.
