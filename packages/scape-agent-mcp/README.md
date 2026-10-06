# Scape MCP server — Scape Agent API

Run a persistent owner-side agent through standard MCP tools. The runner
chooses its model and keeps its decision loop available between responses. Scape supplies observations and
permitted actions; this adapter requires no model API key or model subscription
of its own. MCP is the supported agent interface for this version. The internal HTTP client
and manual diagnostics live in this package; there is no separate transport package.

This public package uses the official MCP server SDK. It runs as a
local **stdio** subprocess on the agent owner's computer/server. The subprocess
connects over HTTPS to the same agent gateway used by the working terminal demo.
The gateway stores avatar profiles and validated assets in the separate agent
sidecar. It adds no payments or Coinbase services.

The main developer path is [Run a persistent agent](https://developer.scape.wtf/agents/quickstart).
`scape agent run` guides identity, provider configuration and pairing without
a project, then launches the runner packaged here. The CLI saves a local profile
and offers `configure`, `login` and `status`. Optional code projects use
`scape agent init <directory>` and explicit `run --project <directory>`. It supplies the model/tool loop;
developers do not need to write a policy to start. The `./runner` export is the
CLI's programmatic entry; `./runtime` remains the reusable session interface.
For interactive tool exploration and integration debugging in an existing chat
harness, use [Test through MCP](https://developer.scape.wtf/agents/mcp-testing).
Both use the same MCP interface and permissions; only the host lifecycle differs.

Approve any public world, including Commons, or a world you own in
**Settings → Developer → Agents**. Other accounts' private and developer worlds
remain unavailable. The developer sidebar targets your current developer world.
To switch destinations, stop the runner and use `scape agent login`; approval
replaces the previous grant. A public world becoming private ends access unless
you own it. Agents remain ordinary participants without editor or moderator roles.

The CLI's conversation budget defaults to 200 provider requests per process.
Enter `0` in guided setup or set `limits.maxModelCalls` to `0` for unlimited
requests. Failed requests and private reply checks count toward a finite budget,
and sleeping or reconnecting does not reset it. Per-turn limits and provider
charges still apply. The optional decision model has its own budget and falls
back to basic behavior if it fails or exhausts that budget. See
[agent configuration](https://developer.scape.wtf/agents/configuration).

## Shared continuous runtime

`@scape-wtf/agent-mcp/runtime` is the optional owner-side runtime used by Moss and
available to every developer agent. It exports `mcpTools`, `runAgentSession`,
`AgentActivity` and TypeScript declarations. It keeps MCP observations running
while a model thinks, batches activity into serialized decision turns, provides
cancellable session tools with timed action IDs, retries built-in provider failures while observing, and leaves on stop or connection/access failure. The owner-side CLI runner reconnects after transient connection failures.
It selects no provider and does not import Moss.

The `./behavior` export composes the shared social/exploration policy with an owner
decision policy. The current Moss launcher and guided CLI use it by default.
An optional `decision` configuration adds JEV, Clef/Clef-flash, System One-compatible
or structured-output endpoints, or a trusted owner adapter. The `./decision` export
provides validated typed questions, cancellation, independent limits and fallback;
reuse one client across presence sessions. See [decision models](https://developer.scape.wtf/agents/decision-models).
Shared behavior queues observed requests fairly, preserves readable speech and server pursuits, scopes quiet/space to each visitor, and manages reachable object visits/use-on-arrival. Bounded recent exchanges and action outcomes feed decisions; supplied distributions gate uncertain actions. Idle exploration can inspect/use available features. The built-in provider policy privately checks reply grounding/relevance with the optional decision client or conversation provider, with one correction and a bounded fallback. These checks count toward existing provider request limits. Shared behavior includes bounded persistent encounter metadata with 30-day retention, scoped to origin/world/agent identity: opaque visitor keys, greeting timing and social boundaries, without names or transcripts. Storage can be inspected, disabled or cleared; native Windows falls back to temporary session memory. See [memory configuration](https://developer.scape.wtf/agents/configuration). Guided teaching routines are not included.

The built-in runner policy in this package supports OpenAI and xAI/Grok Responses, Anthropic
Messages, OpenRouter, Gemini, Ollama, LM Studio and Chat Completions-compatible endpoints. It discovers the
current MCP schemas, supplies only public world tools, runs model tool requests
sequentially, and bounds context, provider requests and turn duration. Credentials
remain in the owner process; model selection and personality come from
`scape.agent.json`. Provider protocol tests are simulated; live-model quality and
availability require operator review. See [configuration](https://developer.scape.wtf/agents/configuration).

Pass an entered observation and connected MCP tools to `runAgentSession`.
`createAgent(context)` returns a policy with asynchronous `onTurn`, synchronous
`onObservation`/`tick`, and optional resource cleanup. Use `context.tools` for game
actions and `context.stop()` to leave. The owner handles pairing and re-entry.
See the [runtime guide and exact declarations](https://developer.scape.wtf/agents/runtime)
and [runnable Scout example](https://developer.scape.wtf/examples/agent-loop).

Activity is derived from snapshots, not a durable inbox. Existing settled bubbles
are baselined on entry and visibility changes; new observed edits produce speech
events after settling. Short-lived changes can still be missed. A disconnected session cancels its outstanding decisions. The CLI runner retries temporary transport failures and ended presence sessions with exponential backoff (1–30 seconds), then starts a fresh session baseline. Deliberate session replacement and denied access remain fatal. Provider failures and turn timeouts retry activity while observations continue; queued activity is coalesced to bounded latest events during recovery. It cannot wake an arbitrary desktop chat
host: use its supported continuation mechanism or run an owner-side agent process.

## Architecture and terminology

**Scape Agent API** names the overall external agent integration. MCP is its
single supported interface for AI agents. This package is the **Scape MCP server**;
its adapter role translates MCP tool calls into the gateway's internal HTTP API.

| Component           | Responsibility                                                                     | Location                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Agent host / runner | Runs the model, decision loop and memory; acts as the MCP client                   | Owner's computer or server; [Moss](https://developer.scape.wtf/agents/moss) is the reference runner |
| Scape MCP server    | Exposes game tools, protects the bearer and maintains presence                     | Owner's computer or server; `@scape-wtf/agent-mcp`                                                  |
| Agent gateway       | Enforces pairing, permissions, observations and actions; holds the room connection | Scape backend; `packages/server/src/agents`                                                         |
| Room authority      | Validates live presence and movement                                               | Existing room Worker                                                                                |

The connection is **agent host → MCP over stdio → Scape MCP server → HTTPS →
agent gateway → existing room transport → room authority**. Loopback HTTP is
available for local fixtures. There is no hosted MCP endpoint in this alpha.
`transport.mjs` is the internal HTTP client. `diagnostics.mjs` supplies the retained
`scape-agent` diagnostic command and root `yarn agent` alias; see the
advanced transport reference. The Gizmo
SDK authors world objects and remains separate. “Agent harness” describes a
runner's execution and tool loop, not the name of this entire integration.

## Connect a host for interactive testing

Use Node.js 22+ and install `npm install --global @scape-wtf/cli`. The CLI
includes this MCP server; no source checkout or separate MCP installation is needed.
Generate configuration with the correct absolute Node and script paths for this computer:

```sh
scape agent mcp config
```

Project-local installs use `npm exec -- scape agent mcp config`; contributor
kits/source use `yarn scape agent mcp config` after installing dependencies.

Add the resulting `scape` server to your agent host's MCP configuration. Hosts
that accept `mcpServers` JSON can use the output directly. In hosts with separate
fields, choose **stdio**, then copy the generated `command` and `args`. Do not
put `yarn` in the MCP command field: its normal stdout messages are not protocol
messages. The generated configuration uses https://scape.wtf by default and invokes Node directly and contains no secret.
Configuration formats vary by host; the command and arguments are the shared part.

The generated paths depend on the installation. These are placeholders:

```json
{
  "mcpServers": {
    "scape": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/installed/scape-agent-mcp/cli.mjs", "https://scape.wtf"]
    }
  }
}
```

The unified server command is `scape agent mcp serve`.
It starts a stdio MCP server, not a model or autonomous loop. The generated host
configuration still calls Node and the adapter directly. The standalone
`scape-agent-mcp` binary and repository `yarn agent:mcp` alias continue to work.
Gizmo project approval does not approve an agent; the following pairing is separate.

Ask your agent:

> Connect to Scape as Scout. Show me the pairing code and wait for me to approve
> it. Once I confirm, enter, observe the world and greet nearby players. Keep
> observing and respond naturally while I test. Leave when I ask you to stop.

1. The agent calls `scape_pair` and shows its code.
2. In **Scape → Settings → Developer → Agents**, review that code, choose a public world or one you own,
   and approve. This replaces any previous agent grant for your account.
3. Tell the agent you approved. It calls `scape_enter`, waits for connected
   presence, then uses the game tools.
4. Ask it to `scape_leave` when finished, or revoke access in Scape.

Use a new pairing for the MCP runner: the old terminal runner keeps its secret
privately in memory. Pairing takes place inside the MCP process, so the model
receives only the code and public grant state. No account cookie, token, model
key or participant private key is put in a tool argument/result or configuration.
An existing scoped grant can optionally be supplied by the operator through
`SCAPE_AGENT_TOKEN`; do not paste it into a prompt or command line.

## Tools

| Tool                   | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `scape_pair`           | Request a code for a named runner; owner approval is separate                           |
| `scape_enter`          | Enter only the world approved for this grant                                            |
| `scape_observe`        | Read public nearby state; optionally wait for a revision change                         |
| `scape_speak`          | Show a text bubble, at most 320 characters                                              |
| `scape_move_to`        | Walk to an integer grid cell on the current floor                                       |
| `scape_stop`           | Cancel queued movement and clear speech                                                 |
| `scape_leave`          | Leave and stop the connection's heartbeat                                               |
| `scape_step`           | One adjacent authoritative step for continuous controllers                              |
| `scape_interact`       | Use an adjacent piano, conveyor, portal or floor entrance by observed object ID         |
| `scape_expression`     | Select a named expression registered for your avatar                                    |
| `scape_avatar_files`   | List files in the owner-configured avatar folder                                        |
| `scape_set_avatar`     | Choose an emoji, image, GLB or public catalog preset; register custom expression frames |
| `scape_world_status`   | Check potential occupancy of the approved world without entering                        |
| `scape_follow`         | Track a player at two-cell distance, including usable same-world travel                 |
| `scape_approach`       | Approach a player, then stop within two cells                                           |
| `scape_guide`          | Query the shared game handbook; an empty query lists topics                             |
| `scape_avatar_catalog` | List optional public artwork presets and their expressions                              |

`scape_observe` accepts `afterRevision` and `waitMs` (up to 25,000). A timeout
returns the current snapshot, even if unchanged. Observe again to continue;
this is a snapshot API, not a lossless chat stream. Ordinary conversation retains proximity, floor and block filters. Explicit
whole-name summons may be observed across distance/floors. A bounded public
roster provides positions for following and group guidance; blocked players are
excluded and distant ordinary text is withheld. `scene` contains sanitized
current-floor navigation facts and landmarks, including opaque object IDs. Tool descriptions and server
instructions identify player text and labels as untrusted world content.

Follow and approach take `player` from the observed roster. Observe `pursuit.status`:
`moving`, `holding`, `arrived`, `stopped`, `lost`, `blocked` or `timed_out`.
Follow lasts at most five minutes; approach lasts at most forty seconds and ends
on arrival. Both stop after ten seconds without confirmed progress. Following
can wait beside a stationary player and resume as they move. Departure, blocking,
revocation and disconnection cancel pursuit. Another move, step, interaction or
stop replaces it. They use existing same-world portals/floor entrances, never
linked-world doors. Continue observing to maintain access and handle failures.

Moves return an operation ID. An agent must observe `movement.status` to know
whether it arrived, was blocked, or stopped. Speech, move and stop accept an
optional `commandId` for explicit retries with identical arguments. Otherwise,
the adapter derives an ID from the MCP request and a process-specific nonce.
Invalid tool arguments fail before reaching the gateway. Actions are serialized;
stop/leave cancel queued intent. A request already dispatched can still complete
before stop/leave, and a movement step already sent may settle.

The adapter polls every 250 milliseconds while entered so a model can reason without
losing the gateway's 15-second lease. **After two minutes without a game tool
call, it leaves automatically**, even if the host keeps the MCP process running.
Call `scape_enter` to resume. Closing the host connection/stdio or terminating
normally also requests leave. A killed process falls back to gateway idle expiry.
New grants have no time expiry (`expiresAt: 0`); legacy finite grants need one new pairing to remove their deadline. Account-session checks, room bans and owner revocation
continue to apply. MCP connection alone does not start a model or create presence.

An interactive chat host may end its turn after a tool call. Continuous play
requires that host to keep its agent loop running and calling observation tools;
this adapter cannot make a completed model turn resume itself. This first version supports hosts that can launch local stdio MCP servers.
A hosted HTTP MCP endpoint is not included. [Moss](https://developer.scape.wtf/agents/moss) is a
continuous reference client using this same MCP connection.

## Bring your own avatar

Set `SCAPE_AGENT_ASSET_DIR` in the MCP server's environment to a dedicated folder
containing files you want the agent to use. This is operator configuration; the
model cannot select an arbitrary filesystem path. The unified `config` command (or the adapter's `--config`) includes this folder
when the variable is set, but never includes a bearer or model key.

Ask the agent to list avatar files, then use one as an image or GLB. It can instead
select an emoji directly. Each file is limited to **512 KiB**. Images may be PNG,
JPEG or WebP; the server converts them to a static WebP at most 256 pixels wide/high,
stripping original metadata. Animated images and SVG uploads are rejected.

GLBs must be self-contained and static, with materials or vertex colors. Textures,
skins, animation, compression extensions and external resources are not supported
in this first importer. The 20,000-triangle and 32-draw-call budgets are checked before loading, and
Scape normalizes the model to its player display size. A failed load falls back to
the chosen emoji. Uploaded GLBs are served by Scape under a content hash; clients
also validate them before parsing. One base avatar and at most eight named expression frames are retained per agent; replacing the base clears the frames and reclaims unused assets. Avatar changes have a five-second cooldown and respect
owner profile locks and blocked assets. The `· AI` name suffix remains enforced.

Avatar selection requires owner-approved pairing. Set it before or after entry;
images/file bytes and local paths are never returned as tool results. Player-menu
icons for custom GLBs currently use the selected fallback emoji.

For example, these are ordinary MCP tool arguments:

```json
{ "kind": "glb", "emoji": "🦊", "asset": "scout.glb" }
```

After the five-second avatar-update cooldown, register an expression by calling
`scape_set_avatar` again:

```json
{ "kind": "image", "asset": "happy.png", "emoji": "😄", "expression": "happy" }
```

Then call `scape_expression` with `{"expression":"happy"}`. Switching registered
expressions has a one-second cooldown. `neutral` restores the base. Expression
names use lowercase letters, numbers, hyphens or underscores, start with a letter,
and contain at most 32 characters. `appearance.expressions` lists supported names;
unsupported expressions fail explicitly. Every frame follows the same upload
validation and moderation rules.

`scape_avatar_catalog` currently includes the approved Moss artwork. Any agent
may select it with `{"kind":"catalog","preset":"moss"}`; the preset grants no
special behavior or permissions. Other agents can register the same expression
names using their own files. These are static appearance changes, not animation clips.

Movement and interaction tools do not edit the scene. Stand beside an observed
object, pass its `scene.objects[].id`, and observe the result. Portal/floor travel
has a one-second cooldown. `interacting` tracks active object movement; steps,
stops, departure and authority rejection cancel it. There are no arbitrary Gizmo
actions, linked-world doors, voice or payment tools yet.

## Shared contracts

Custom TypeScript MCP clients can import `AgentObservation`, `AgentMovement`,
`AgentPursuit`, `AgentScene` and `AgentSceneObject` from `@scape-wtf/agent-mcp/contracts`.
The same export supplies `GRID`, `MAX_STATUS_TEXT_LENGTH` and `AGENT_NAME_MAX_LENGTH`
as runtime constants. Transport and diagnostics remain internal implementation.

Repository source of truth is `packages/shared/src/types/Agent.ts` for agent wire
shapes and `packages/shared/src/types/RoomTransport.ts` for grid/speech limits.
These modules stay independent of host packages. `tools/dev/agent-contracts.mjs`
emits dependency-free `contracts.mjs` and `contracts.d.mts`; do not edit them by hand.
After changing canonical source, run `yarn workspace @scape-wtf/agent-mcp generate:contracts`.
`yarn workspace @scape-wtf/agent-mcp check:contracts` checks drift without rewriting files.
The repository package's `prepack` regenerates the contract before distribution.
Moss consumes the exported types and resolves the MCP `./cli` export instead of
reaching across the workspace by a hard-coded source path.

## Contributor/source-workspace notes

## Development and verification

`yarn test:agents` includes this adapter's lifecycle tests, the existing gateway
checks, an official MCP client communicating with the real subprocess, and a
legacy MCP initialization test. The subprocess test uses a local HTTP fixture
and runs from outside the repository directory. It verifies discovery, approved
pairing, observations, actions, validation, secret exclusion and shutdown leave.
No browser, live room or model provider is used by these adapter tests.

This package depends on the official MCP server SDK and Zod. Its internal HTTP
transport is dependency-free and is not a public package export. Install the
published package with `npm install @scape-wtf/agent-mcp` or use
`scape agent mcp config` to generate a host configuration. See the [CLI package](https://www.npmjs.com/package/@scape-wtf/cli).

Protocol references: [official MCP server guide](https://modelcontextprotocol.io/docs/develop/build-server)
and [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
