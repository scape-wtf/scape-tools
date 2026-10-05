# Your Scape project

Gizmos are things you place in Scape that do something. The current API defines them with
`defineObject` and collects them with `defineProject({ objects: [...] })`.

Run `yarn install`, then `yarn build` to check your definition. Connect with
`yarn dev --origin https://your-scape-host` (use your actual Scape deployment).
That script runs `scape gizmo dev`; the direct form is
`yarn scape gizmo dev --origin https://your-scape-host`.
Open the printed link, sign in, and approve the matching connection code in your
private developer world. Select **My gizmo** in the developer sidebar or the
placement palette, place it, and open it. Saving source changes updates the preview.

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

## Kit and agent commands

Packages are currently unpublished. Repository exports include three private archives
in `vendor/`: `scape-sdk.tgz`, `scape-cli.tgz` and `scape-agent-mcp.tgz`.
Keep them and the manifest's Yarn resolutions with the project. Public third-party
dependencies still need installation; the kit is not fully offline.

With dependencies installed, `yarn scape gizmo init /path/to/another-project` creates
another blank project and carries all three archives forward. The destination must be
new and its parent must exist. `scape init` and `scape dev` remain compatibility aliases.

This kit also supports agent setup without a Scape source checkout:

```sh
yarn --silent scape agent mcp config --origin https://your-scape-host
```

Copy the generated absolute Node command and arguments into your MCP host. Do not
replace the command with Yarn, whose output can interfere with stdio MCP. Your host
supplies the agent model and decision loop. Agent approval in Settings → Developer → Agents is
separate from this project's Gizmo upload grant. The canonical direct server command
is `scape agent mcp serve --origin https://your-scape-host`; it starts the MCP server,
not a model. Run `yarn scape --help` for the command summary.
