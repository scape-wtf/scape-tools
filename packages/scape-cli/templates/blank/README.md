# Your Scape project

Gizmos are things you place in Scape that do something. The current API defines them with
`defineObject` and collects them with `defineProject({ objects: [...] })`.

Use Node.js 22 or newer. In this project directory:

```sh
npm install
npm run build
npm exec -- scape gizmo dev
```

This uses the project's installed CLI and connects to https://scape.wtf. Use
`--origin <https-url>` only for another compatible host. After installing the CLI
with `npm install --global @scape-wtf/cli`, you can also use the sidebar's
`scape gizmo dev --origin <https-url>` command here. `npm run dev` is a shortcut
for the same `scape gizmo dev` script; it requires this project's dependencies.

Open the printed link, sign in, and choose **Connect project** in the developer
sidebar after comparing the code with your terminal. Select **My gizmo** in the
sidebar or placement palette, place it, and open it. Saving source updates the preview.

`src/project.ts` is the project entry and collects your gizmos. Start in `src/definition.ts`. The starter has empty state and no actions: choose
your own namespaced `type`, emoji, label and behavior. Keep the default export.
`initial` creates saved state; `valid` checks it; `actions` change it on the server;
`view` describes the panel and its controls. No game source or world is bundled.

To add another gizmo, define it in a new file, import it into `src/project.ts`, and add it
to the `objects` list passed to `defineProject`. Up to 16 gizmos share one build; each
needs a unique type and emoji. They appear together in the game. State belongs to each
placed instance, and reordering the list preserves it. Any invalid definition rejects
the entire update. The project shares a 1 MiB upload and 500 ms activation budget. Built-in
Scape types, interactive emojis and example emojis are reserved. Remove placed
gizmos before changing their type, emoji or state version. Compatible edits keep
saved state; invalid builds leave the last working preview running. Returning to
a different project also requires removing any gizmos whose definition it removes or
makes incompatible. An empty `objects: []` project is allowed once those instances are gone.

Code runs in an isolated engine with JSON state and resource limits. DOM, network,
filesystem, live audio/video, soundboards and gems are not SDK capabilities yet.
Optional `presentation` and `animate` fields describe bounded 3D models, animation,
number labels and developer-authored procedural audio. Import a self-contained, textureless `.glb`
or uncompressed PCM16 `.wav` file to embed it in the build; `src/assets.d.ts` declares
both. Sounds use `sounds` definitions (`kind: 'synth'`, layered oscillators/noise, envelopes
and effects), or optional recorded imports, with independent `audio(state, previous)` play/stop
timelines or `ambience` playlists. WAVs must be mono/stereo, 8–48 kHz and at most ten
seconds. All code/assets, including base64 expansion, share the 1 MiB project limit.
The CLI watches imported models alongside your source. The
normal world tools remain available in the game. Disconnecting stops updates but
keeps your world and last uploaded build. Developer worlds are private, limited to
one per account, marked after 90 days without a visit and removed after 120 days.

## Agent commands

With this project's dependencies installed, use `npm exec -- scape agent run`
for guided agent setup and pairing. A globally installed CLI can run
`scape agent run` from any directory without an agent project.

For an existing MCP host, run `npm exec -- scape agent mcp config` and copy the
generated absolute Node command and arguments into that host. Use Node directly
for stdio MCP; package-manager output can interfere with the protocol.
Your MCP host supplies the model and decision loop. `scape agent mcp serve`
starts only the MCP server. Agent approval in the sidebar's **Agents** tab or
**Settings → Developer → Agents** is separate from Gizmo upload approval.

Create another blank project with `npm exec -- scape gizmo init /path/to/new-project`.
The destination must be new and its parent must exist. `scape init` and `scape dev`
remain compatibility aliases. See the [CLI guide](https://developer.scape.wtf/reference/cli).

## Contributor/source-workspace kits

Public starters use published npm dependencies. Source exports may instead include
SDK, CLI and MCP archives in `vendor/`. Keep those archives and the manifest's
Yarn resolutions together. Inside such a kit, use `yarn install`, `yarn build`
and `yarn scape gizmo dev`. `yarn scape gizmo init /path/to/new-project` carries
all three archives forward. Use `yarn scape agent run` or
`yarn scape agent mcp config` for the kit's local agent commands.
