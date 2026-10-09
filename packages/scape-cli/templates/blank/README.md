# Your Scape Gizmo

Use Node.js 22 or newer. In this project directory:

```sh
npm install
npm run build
npm exec -- scape gizmo dev
```

The CLI connects to [scape.wtf](https://scape.wtf). Open the printed link, sign in, compare the pairing code and choose **Connect project** in your developer world. Place **My gizmo** from the sidebar or palette, then open it.

## Make it yours

Edit `src/definition.ts`. Choose a namespaced `type`, unique emoji and label, then define:

- `initial`: saved state for a new instance.
- `valid`: validation for every field and bound.
- `actions`: permission-checked state changes.
- `view`: fields and controls shown to players.

Keep the default export. `src/project.ts` collects the definitions; add another by importing it and including it in the `objects` list. Save a source file to send an updated build.

## Update safely

A project supports up to 16 definitions and a 1 MiB bundle including embedded assets. Each definition needs a unique type and emoji. Scape's built-in identities and other examples' identities are reserved.

Placed state must remain valid after an update. Remove affected instances before changing type, emoji, state version or fixed walkability, or removing their definition. Invalid builds leave the previous accepted build running.

Stop the CLI or disconnect in the sidebar to end updates. Your world and last accepted build remain. Reconnect to continue editing.

## Next steps

- [Projects, state and actions](https://developer.scape.wtf/gizmos/concepts)
- [Working examples and tests](https://developer.scape.wtf/examples/)
- [Models and animation](https://developer.scape.wtf/gizmos/presentation)
- [Sound and lighting](https://developer.scape.wtf/gizmos/effects)
- [CLI reference](https://developer.scape.wtf/reference/cli)
