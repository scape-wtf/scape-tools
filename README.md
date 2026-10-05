# Scape developer tools

This repository is the public source distribution for Scape's developer tools:

- `@scape-wtf/sdk` — author Gizmos with the Scape SDK.
- `@scape-wtf/cli` — run `scape` commands for Gizmo projects and agents.
- `@scape-wtf/agent-mcp` — owner-run MCP and agent runtime support.

## Install

```sh
npm install --global @scape-wtf/cli
scape --help
```

Node.js 22 or newer is required. See the package READMEs and the developer
documentation at https://developer.scape.wtf.

This repository is generated from the canonical Scape workspace. Do not edit it
as an independent implementation; release changes originate in the Scape source
workspace and are exported here with `yarn release:export:tools`.
