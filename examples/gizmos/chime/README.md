# Chime

A minimal shared-action example using only `@scape-wtf/sdk`. Place 🛎️ in the developer
world and use the **Ring** play icon in its action row. The SDK control uses
`placement: 'action'`; the host supplies the default `media-play-filled` icon. Every accepted action emits a short sound and blue
burst for active participants on that floor. The 250 ms server cooldown prevents
rapid repeats. The saved timestamp enforces timing; playback comes from `react`,
not a state watcher, so opening a snapshot does not replay it.

Registered in `gizmos/examples/registry.ts`, Chime is always in the developer
sidebar and scene palette, including while another project is paired. Ordinary
worlds retain their separate built-in catalog. Release packaging includes this
source alongside the other object examples.

Edit `src/definition.ts`; `src/project.ts` exposes it to the SDK loader.
Scape owns permission checks, shared delivery, rendering and protected audio.
See [Run an example](https://developer.scape.wtf/examples/gizmos/chime#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf` by default;
use `--origin <https-url>` only for another compatible host.

The package tests verify cooldown and accepted-action feedback. Use the server
`gizmoEvents.integration.test.ts` and `roomRealtime.test.ts` checks for validation. The latter
uses local HTTP/WebSocket fixtures, not browser automation. Owner review should
include two players, a different floor, reconnecting and a backgrounded page.
