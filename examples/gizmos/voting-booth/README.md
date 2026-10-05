# Voting booth starter

Inside this repository, you can run `npm run dev` directly
from this example directory after the root dependencies are installed. `npm run build`
and `npm test` also use the repository tools. The public packages are available from npm. For an independent project, use `npx @scape-wtf/cli@latest gizmo init my-gizmo`; source contributors can still use the repository exporter.

Gizmos are things you place in Scape that do something. The current API defines them with
`defineObject` and collects them with `defineProject({ objects: [...] })`.

Build and test a Scape gizmo using only the SDK. This project does not need the game
source, a Scape account, a running world, a tunnel or a VPN.

For a public project, scaffold directly with the published CLI:

```sh
npx @scape-wtf/cli@latest gizmo init my-project
```

Choose a new directory that does not already exist. The generated project uses the published SDK and CLI packages.

In the generated project (Node 22+ and npm):

```sh
npm install
npm test
```

Edit `src/definition.ts`, then run `npm test` again. `npm run build` produces plain ESM
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
npm run dev
```

The exported `dev` script runs `scape gizmo dev`. The same installed kit also
supports `scape agent mcp config`;
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
