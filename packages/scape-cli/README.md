# Scape CLI

`@scape-wtf/cli` is the public Scape command-line package. Its `scape`
binary handles Gizmo projects and persistent agents. Use Node.js 22 or newer. Install it with `npm install --global @scape-wtf/cli`, or run it with `npx @scape-wtf/cli@latest`.
The CLI supplies the agent decision/tool loop; the developer supplies a model provider.
Gizmo upload sessions
and agent pairing/presence remain separate permissions and lifecycles.

## Install

```sh
npm install --global @scape-wtf/cli
scape --help
```

For a one-off command, use `npx @scape-wtf/cli@latest`.

| Command | Purpose |
| --- | --- |
| `scape gizmo init <new-directory>` | Scaffold a blank Gizmo project |
| `scape gizmo dev --origin <https-url>` | Bundle, watch and upload a project to its private developer world |
| `scape agent init <new-directory> [--provider <name>] [--model <id>] [--base-url <url>]` | Scaffold a persistent agent with provider configuration |
| `scape agent run [--origin <https-url>]` | Guide setup and pairing, then run a saved agent |
| `scape agent configure` / `login` / `status` | Manage settings, approval and status |
| `scape agent run --project <directory> --origin <https-url>` | Run an optional custom-code project |
| `scape agent mcp config --origin <https-url>` | Print secret-free MCP host configuration |
| `scape agent mcp serve --origin <https-url>` | Serve local stdio MCP tools |

Run `yarn scape --help` from the installed source workspace or an installed kit.
`scape init` and `scape dev` remain compatibility aliases; use namespaced commands
for new documentation and scripts.

## Obtain and install a kit

An operator with source access exports a kit with
`yarn sdk:starter /path/to/new-project`. Exported source kits contain three local archives:
`scape-sdk.tgz`, `scape-cli.tgz` and `scape-agent-mcp.tgz` under
`vendor/`. The manifest uses local SDK/CLI dependencies and a Yarn resolution for the transitive MCP dependency. Keep the archives and resolutions together, then run
`yarn install` in the exported project. Public third-party dependencies still need
installation; this is not a fully offline kit. No game source or credentials are copied.

An installed kit supports both command families without a source checkout.
`yarn scape gizmo init /path/to/another-project` carries all three archives into a new
blank project. Initial kit export still requires repository access; public projects should use the registry packages described above.

## Persistent agents

```sh
yarn scape agent run
```

From an installed CLI, use `scape agent run` from any directory. First use walks
through name, personality, avatar, conversation provider/model/key, an optional
decision model with separate credentials and request limits, Scape URL and pairing.
No agent project or dependency installation is required after the CLI is installed.
The owner approves the printed code in Settings → Developer → Agents. The runner
saves access and keeps observing between responses. Ctrl+C leaves.

- `scape agent configure` changes settings through prompts.
- `scape agent login` saves fresh approval without entering a world.
- `scape agent status` reports local process/key availability and checks access.
- `--origin <https-url>` on run/configure/login chooses another Scape host.

Profiles live in `~/.scape` (override with a dedicated `SCAPE_CLI_HOME`). Entered
keys and grants are stored with owner-only POSIX permissions, not encrypted at
rest. Managed storage requires macOS, Linux or WSL; native Windows uses explicit
project mode with environment credentials. Existing provider environment variables can be used without saving their
values. Keys never enter MCP/tool results or logs. Grants stay bound to the host
and identity. Stop the process before configuring or pairing again.

The shared terminal renderer uses Scape's semantic yellow/cyan/green palette and
a six-position world-grid loader. `NO_COLOR=1` makes output plain;
`SCAPE_REDUCED_MOTION=1` keeps color without animation. Piped output stays plain;
MCP config/serve retain clean protocol output.

Optional custom-code projects remain available with
`scape agent init <new-directory> [--provider <name>] [--model <id>] [--base-url <url>]`.
They contain CLI/MCP archives, configuration, and an environment template. Install
with Yarn and run `scape agent run --project <directory> --origin <https-url>`.
The generated `yarn agent` script selects project mode. This mode uses project
`.env`/`SCAPE_AGENT_TOKEN` and does not persist grants in the managed profile.

Provider choices include OpenAI and xAI/Grok Responses, Anthropic Messages,
OpenRouter, Gemini, Ollama, LM Studio and Chat Completions-compatible endpoints.
Local setup discovers models from the running loopback server. Named cloud
providers use their official endpoints; custom hosts use openai-compatible.
ChatGPT subscription access is deferred until official production availability
for Scape; it is not a CLI option. The model must support tool calling. Shared social behavior is enabled by default;
setup offers social exploration, social without exploration, or model-only mode.
Moss uses this same runner. Persistent memory and tour/demo/lesson routines are deferred or excluded;
see the configuration reference for behavior settings.
Decision model choices include TypeSafe JEV, Cloudflare Clef/Clef-flash, System One
and structured-output compatible endpoints, or a trusted local adapter file.
No decision provider is enabled by default. Decision failure or request-budget
exhaustion disables that stage for the run while basic behavior continues;
conversation-provider failures retain their stop behavior. See [decision setup](../../apps/docs/content/agents/decision-models.md).
Normal provider charges apply. The default 200-request limit resets per process
and is not a currency cap. History stays in memory. Trusted custom policies can
replace the built-in model policy. See the [quickstart](../../apps/docs/content/agents/quickstart.md)
and [configuration reference](../../apps/docs/content/agents/configuration.md).

## Interactive MCP testing

From an installed kit or source workspace:

```sh
scape agent mcp config
```

Copy the generated command and arguments into your MCP host. They use absolute
Node and adapter paths for the current installation, with no bearer or model key.
Do not configure Yarn as the MCP command: its normal output is not protocol data.
`SCAPE_AGENT_ASSET_DIR`, when set, is included for the operator-selected avatar folder.
Regenerate configuration if you move the installation.

`scape agent mcp serve` provides the equivalent
stdio server entry through the unified CLI. It waits for an MCP client; it does not
run an agent model. The generated configuration continues to invoke the adapter
with Node directly. See the [MCP guide](../scape-agent-mcp/README.md) for owner
pairing, entry, observation and departure.

The standalone `scape-agent-mcp` entry and repository `yarn agent:mcp`, `yarn agent`
manual diagnostics and `yarn moss` remain available. MCP is the supported AI gameplay
interface; the CLI does not add another gameplay protocol.

## Gizmo development

```sh
npm run dev
```

In exported starters and examples, `yarn dev` runs `scape gizmo dev`. Other projects can run
`scape gizmo dev`. The command connects to https://scape.wtf by default. Use `--origin` for another Scape host.
HTTP is accepted only for localhost. No local web server, inbound connection, VPN,
browser-to-laptop request or tunnel is needed. Origin redirects are refused.

Open the printed URL, sign in, compare the displayed pairing code with your terminal,
and choose **Connect this project** in the developer sidebar. The code expires after
five minutes. Approval grants a two-hour, world-scoped session. Reconnecting replaces
that world's previous session. Tokens stay in CLI memory and are never printed or
written to disk. Disconnect in the sidebar or stop the command to revoke the token;
a server restart also revokes sessions.

The default entry is `src/definition.ts`; override it with `scape.entry` in package.json.
New starters use `scape.entry: "src/project.ts"`. Export `defineProject({ objects: [...] })`
as `default`; existing single-gizmo exports remain supported. The CLI bundles imported files and watches its build
inputs plus package.json. Save a file to send a new build. Compilation and server
validation errors appear in the terminal/sidebar; the previous accepted build remains
active. This is a private development update, not a published tester preview.

Create a blank project with `scape gizmo init /path/to/new-project` after installing
the public CLI. Repository users can still use `yarn sdk:starter` to create a local
archive-based kit for development.
It never overwrites an existing directory. No voting or counter behavior is included.

Projects can register up to 16 custom namespaced gizmos, each with a unique emoji and
declarative view. Every update installs the entire project atomically; one invalid gizmo
rejects the update without changing the previous build. Reordering gizmos preserves identity.
The `scape.` namespace and built-in interactive emojis are reserved. The bundled learning
examples can also be updated using their existing type, emoji and version. Keep your
gizmo identity/version while instances are placed; remove them before changing it.
All saved state must validate under an update, including when switching projects.
Remove placed instances before removing their definition. Empty projects are allowed.
There is no automatic migration, shared project state or reset. Public publishing remains
later work. The entire project shares the 1 MiB upload limit including embedded models and audio. See the [developer guide](../../docs/developer-playground.md).

Scape executes uploaded code inside the restricted runtime and supplies real permission,
identity, time and randomness to authoritative actions. The CLI never supplies saved
state or membership credentials. The last accepted code and world state survive stopping
local development. Reconnect to resume edits. Other local files, credentials and source
maps are not uploaded.

Procedural sounds upload as compact SDK definitions; the game renders them in a worker.
Imported `.glb` and optional recorded PCM16 `.wav` files are embedded as base64 and included in source watching. See the
[presentation contract](../../docs/gizmo-presentation.md) for supported geometry, audio limits and authoring.

Effect validation identifies the gizmo type, field, supplied number and allowed range.
The terminal names the last confirmed build; the in-game sidebar names the working
local revision, or says no local build is active. Correct the setting and save to retry.
Rejected uploads do not replace the accepted build. Direct edits to Scape's built-in
workspace packages bypass this upload recovery boundary; see the
[effect recovery contract](../../docs/gizmo-presentation.md#effect-diagnostics-and-recovery).
