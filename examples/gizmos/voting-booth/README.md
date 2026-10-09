# Voting booth starter

See [Run an example](https://developer.scape.wtf/examples/gizmos/voting-booth#run-this-example) for public setup and making an
independent copy. Inside this example directory, run `npm run build`, `npm test`
and `npm exec -- scape gizmo dev`. It connects to `https://scape.wtf`.

Gizmos are things you place in Scape that do something. Define them with
`defineObject` and collect them with `defineProject({ objects: [...] })`.

Build and test this Gizmo locally with the SDK, then connect it to your developer world.

For an independent voting project, copy this example as described in the
[public example setup](https://developer.scape.wtf/examples/gizmos/voting-booth#run-this-example), then install and test there.
The public CLI’s `gizmo init` creates a blank project without voting behavior or tests.

Edit `src/definition.ts`, then run `npm test` again. `npm run build` produces plain ESM
and declarations in `dist`. Tests exercise two voters, changing a vote, saved state,
editor permission, stale rounds, malformed input and declarative controls. The local
`ObjectRegistry` is the same validation runtime used by Scape; actors and permissions
are supplied by the test and do not represent authenticated world sessions.

The booth supports two to four answers and up to 256 voters. Votes are public state,
with one changeable ballot per device identity. It is a casual poll, not an anonymous
or account-unique election. Scape grants editing only to the placer with building
permission. Changing a question, closing/reopening, or resetting advances the round;
old submissions are rejected.

To see edits in your developer world on scape.wtf, run:

```sh
npm exec -- scape gizmo dev
```

Open the printed scape.wtf link,
sign in, compare the pairing code with your terminal, and choose **Connect project**
in the developer sidebar. Change a button label, save, and watch the existing booth's
controls update while votes stay intact.

The CLI bundles the project default export from `src/project.ts`, which registers
the voting definition from `src/definition.ts`. Compilation/validation errors
keep the previous accepted build active. Keep the booth's type, emoji and state version;
existing saved state must remain valid. Stopping the command disconnects live updates without
deleting the world or accepted build. Sessions expire after two hours and can be revoked
from the sidebar. No token is written to disk or printed.

Scape isolates uploaded code and validates its actions.
This connection updates your private developer world on scape.wtf.
