# Voting booth starter

Inside this repository, you can run `yarn dev --origin <Scape origin>` directly
from this example directory after the root dependencies are installed. `yarn build`
and `yarn test` also use the repository tools. Do not install the unpublished
packages from the registry here. Export with `yarn sdk:starter` for an independent
project; the exporter switches its scripts to the locally installed SDK tools.

Gizmos are things you place in Scape that do something. The current API defines them with
`defineObject` and collects them with `defineProject({ objects: [...] })`.

Build and test a Scape gizmo using only the SDK. This project does not need the game
source, a Scape account, a running world, a tunnel or a VPN.

Before public distribution, export a copy from the Scape repository:

```sh
yarn sdk:starter /path/to/new-project --template voting-booth
```

Choose a new directory whose parent already exists. The export includes
`vendor/scape-sdk.tgz`, `vendor/scape-cli.tgz` and `vendor/scape-agent-mcp.tgz`. The manifest points to the local SDK/CLI archives and
uses a Yarn resolution for the private transitive MCP dependency. Keep all three
archives and those resolutions together. There is no public `@scape-wtf/sdk` release;
public third-party dependencies still need installation.
The checked-in template's version dependency is replaced during export.

In the exported project (Node 22+ and Yarn 1):

```sh
yarn install
yarn test
```

Edit `src/definition.ts`, then run `yarn test` again. `yarn build` produces plain ESM
and declarations in `dist`. Tests exercise two voters, changing a vote, saved state,
editor permission, stale rounds, malformed input and declarative controls. The local
`ObjectRegistry` is the same validation runtime used by Scape; actors and permissions
are supplied by the test and do not represent authenticated world sessions.

The booth supports two to four answers and up to 256 voters. Votes are public state,
with one changeable ballot per device identity. It is a casual poll, not an anonymous
or account-unique election. The host grants editing only to the placer with building
permission. Changing a question, closing/reopening, or resetting advances the round;
old submissions are rejected.

To see edits in your private developer world, run:

```sh
yarn dev --origin https://your-scape-host
```

The exported `dev` script runs `scape gizmo dev`. The same installed kit also
supports `yarn --silent scape agent mcp config --origin https://your-scape-host`;
agent pairing is separate from this project's upload grant.

For a local desktop Scape server, use `http://127.0.0.1:3000`. Open the printed link,
sign in, compare the pairing code with your terminal, and choose **Connect this project**
in the developer sidebar. Change a button label, save, and watch the existing booth's
controls update while votes stay intact. Your host must run the current developer-link backend.

The CLI bundles the default export from `src/definition.ts`. Compilation/validation errors
keep the previous accepted build active. Keep the booth's type, emoji and state version;
existing saved state must remain valid. Stopping the command disconnects live updates without
deleting the world or accepted build. Sessions expire after two hours and can be revoked
from the sidebar. No token is written to disk or printed.

Uploads run in Scape's restricted gizmo runtime and use normal signed world actions.
The game also uses this source as its bundled starter. The standalone project contains no
game renderer or world server. Shared preview publishing and tester invitations remain pending; this connection updates the owner's private world only.
