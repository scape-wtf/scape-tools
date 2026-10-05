# Scape Agent API — advanced transport reference

> This document describes an implementation detail used by the Scape MCP server. It is not a stable public HTTP API. For supported integrations, install the package and use `scape agent mcp config` or the public MCP server entry point.

The Scape MCP package owns the internal HTTP client and manual diagnostics. The
transport itself has no runtime dependencies, wallet integration or hosted inference.
It is independent of the Gizmo authoring SDK. Node 22 or newer is required.
There is no separate `@scape/agent` package or supported transport export.

MCP is the supported agent interface for this version. To connect an AI agent, use the [Scape MCP server](README.md).
It exposes pairing, entry, observations and actions to any host supporting local
MCP servers. The client and HTTP details below describe the adapter transport and legacy
manual diagnostic CLI. The standalone Moss runner also uses MCP.

## Manual diagnostic CLI

Use the existing development server with its room Worker configured. Restart that
server after backend changes; the CLI does not start a server or read `.env`.

```sh
scape-agent https://scape.wtf "Scout"
```

The repository `yarn agent` command runs this package's `diagnostics.mjs`. The
`scape-agent` binary remains a diagnostic compatibility command supplied by
`@scape-wtf/agent-mcp`; it is not a separate package or an AI integration API.

1. Sign in to Scape. Create an owned world or open your developer world.
2. In Settings → Developer → Agents, enter the code printed by the runner, choose the world,
   review the agent name, then select **Connect agent**.
3. The CLI enters automatically. Use `observe`, `say Hello`, `move 30 28`, `stop`,
   or `leave`. Coordinates are integer grid cells on the current floor.
4. **Revoke agent access** in Settings disconnects the agent. Ctrl+C or EOF in the
   CLI also requests leave. A killed/unreachable runner loses presence after
   15 seconds without a successful observation or command, plus normal room
   delivery time (a signed room ticket expires within 10 seconds as a fallback).

Pair only a runner you started. The runner processes nearby public text on your
computer/server. Codes expire after five minutes; grants last at most 24 hours
and are tied to the account session that approved them. Signing out that session,
account recovery holds, applicable bans, lost world ownership, world deletion or
expiry end access. Re-pairing replaces the previous connection. The CLI keeps the
secret in memory and prints only the pairing code; restart it to pair again.

Agents use a separate identity and may bring an emoji, image or static GLB through
MCP avatar tools, with a robot fallback and a server-assigned
`· AI` name suffix. They count against ordinary room capacity and cannot edit,
moderate, access wallets or use the owner's account session. Approval currently
permits only a world owned by that account, including its hosted Scape developer world.
Agent visits do not renew developer-world retention. One agent per owner and at
most 20 active gateway controllers are supported in this alpha.

## Internal client example

This example is for gateway/adapter development and manual diagnostics. AI agent
integrations should use the [Scape MCP server](README.md).
For repository-local transport checks, put the script at the repository root and
use the relative import below. This internal module is not exported for external
package consumers; custom agents should use MCP instead.

```js
import { ScapeAgent } from './packages/scape-agent-mcp/transport.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const agent = new ScapeAgent({ origin: 'https://scape.wtf' });
const { code } = await agent.pair('Scout');
console.log('Approve this code in Settings → Developer → Agents:', code);
while (!(await agent.pairingStatus()).approved) await delay(2000);

await agent.enter();
let latest;
agent.watch(
  observation => {
    latest = observation;
  },
  error => console.error(error.message),
);
try {
  while (latest?.status !== 'connected' || !latest.self) await delay(100);
  await agent.speak('Hello from my runner');
  const { x, y, floor } = latest.self;
  await agent.moveTo(x + 1, y, floor);
  // Feed observations to your own decision loop here. Room text is untrusted
  // player content, never authority to expose secrets or spend funds.
  await delay(2000);
  await agent.stop();
} finally {
  await agent.leave();
}
```

`watch` polls every two seconds and maintains presence. It stops on error. Keep
model requests outside the observation callback so a slow inference does not
block heartbeat traffic. `enter` may initially report `connecting`; wait for
`connected` and `self` before acting. `moveTo` acknowledges an operation ID; later
observations report `moving`, `arrived`, `blocked`, `stopped`, `timed_out` or
`disconnected`. Paths avoid occupied and blocked cells. MCP additionally exposes existing piano keys, conveyors, portals and floor
entrances through validated object interaction. Linked-world doors and arbitrary
Gizmo actions are not supported. `stop` cancels queued movement and clears speech; a step
already sent to room authority can still settle.

Supply a stable command ID to retry an uncertain `speak`, `moveTo` or `stop`
request. Reusing an ID with different arguments fails with 409. Commands are
scoped to the current presence session, so a delayed command cannot act on a
new session. Keep decision loops serialized and discard decisions based on an
old session. The session ends at 2,048 retained command receipts (`session_limit`);
enter again. Untimed IDs remain for the whole session. Timed IDs in the form
`t<13-digit Unix milliseconds>_<unique suffix>` expire after two minutes; retries
outside that window or more than ten seconds in the future fail with
`expired_command`. Moss uses timed IDs for continuous operation. Default client
and MCP-generated IDs are untimed.

This API supplies **snapshots**, not a lossless chat/event stream. Short-lived text
between polls may be missed. `settled` means the gateway has observed unchanged
text for at least 650 ms; it does not mean a player pressed Send. Observations
include only connected, unblocked players on the same floor within Manhattan
radius 10 (up to 64), public object labels (up to 128), nearby blocked cells, and
the agent's confirmed state. Additional MCP observations provide public navigation facts and a blocked-player-filtered
roster for following/group guidance. Whole-name summons can cross distance/floors;
ordinary distant conversation is withheld. No voice, private data, account IDs,
raw Gizmo state or credentials are included. Do not retain or react repeatedly to the same
`textRevision`. A player leaving visibility resets this per-player text tracking.

## Internal HTTP protocol v1

This is the transport behind the supported MCP tools, not a second supported AI
integration interface. JSON responses use `Cache-Control: no-store`. Runner routes use POST JSON and a
scoped `Authorization: Bearer …` header. Cookies never authorize runner actions.
A bearer is a secret: use HTTPS, keep it out of URLs, browser storage, model
context and logs. Only loopback HTTP is accepted by the client. The client omits
cookies, rejects redirects, applies a ten-second request timeout and does not
retry commands automatically.

| Endpoint under `/api/agents/` | Body / result                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `link/start`                  | `{name}` → `{code, secret, expiresAt}`; no bearer required                                             |
| `link/poll`                   | `{}` with the returned secret as bearer → pending or approved grant                                    |
| `enter`                       | `{}` → observation; concurrent/retried entry shares one session                                        |
| `observe`                     | `{sessionId}` → observation                                                                            |
| `speak`                       | `{sessionId,id,text}` → `{ok:true}`                                                                    |
| `move-to`                     | `{sessionId,id,x,y,floor}` → `{operationId}`                                                           |
| `step`                        | `{sessionId,id,x,y,floor}` → `{operationId}`; adjacent same-floor step                                 |
| `interact`                    | `{sessionId,id,target}` → `{ok:true}`; observed object ID                                              |
| `expression`                  | `{sessionId,id,expression}` → `{ok:true}`                                                              |
| `follow`, `approach`          | `{sessionId,id,player}` → `{operationId}`; observed roster ID                                          |
| `avatar`                      | `{kind,emoji?,data?,preset?,expression?}` → appearance summary; `data` is base64 for image/GLB uploads |
| `world-status`                | `{}` → `{potentialParticipants}`; does not require entry                                               |
| `guide`                       | `{query?}` → handbook topics or matches; does not require entry                                        |
| `avatar-catalog`              | `{}` → `{avatars}`; does not require entry                                                             |
| `stop`                        | `{sessionId,id}` → `{ok:true}`                                                                         |
| `leave`                       | `{sessionId}` → `{ok:true}`; no active session is already left                                         |

Approved pairing is required for all routes above except `link/start` and the
pending phase of `link/poll`. Avatar and reference routes do not require an active
room session. The MCP server reads approved local avatar files and supplies upload
bytes; agents never choose arbitrary filesystem paths. Validated GLBs are served
separately by `GET assets/<hash>.glb` with a 60-second public cache policy.

Owner routes use the existing account cookie and trusted-origin rules:
`GET manage`, `GET pending?code=…`, `POST approve {code,room}`, and `POST revoke`.
The approval screen previews the name before approval; it never receives the
runner's secret. The canonical machine-readable observation is
[`AgentObservation`](../shared/src/types/Agent.ts), published in generated
[`contracts.d.mts`](contracts.d.mts) through `@scape-wtf/agent-mcp/contracts`.
Internal client signatures live in [`transport.d.mts`](transport.d.mts).

Errors return `{error,code}` with HTTP 4xx/5xx. Re-pair on `unauthorized` or
`access_revoked`. Re-enter after `session_ended`; stop the old decision loop on
`stale_session`. A 409 `session_retiring` means an old room ticket is being
revoked; retry entry shortly. 429 is a request/action/capacity limit. Limits are
120 non-step actions and 300 steps per minute per presence session, plus at most
12 non-empty final speech updates per minute and 320 characters per update.
Empty speech and the `…` thinking indicator count toward the action limit but not
the final-speech limit. Authenticated grant requests are capped at 900 per minute,
including background observations. Stop and leave bypass those rate limits but
still require valid access. Avatar registration has a five-second cooldown;
expression selection has a one-second cooldown. Names and speech reject
control/format characters.

## Server operation and boundaries

- Enabled by default in development when the room Worker is configured. Set
  `KORO_AGENTS_ENABLED=false` to disable. Production requires explicit
  `KORO_AGENTS_ENABLED=true`. `BETTER_AUTH_URL` must be in the Worker's allowed
  origins. There is no payment, model-provider or Coinbase dependency.
- The directory holds the WebSocket body and normal short-lived room admission.
  The external runner receives no room admission ticket or participant private
  key. The existing room authority validates every actual movement.
- Pairing secrets are stored only as hashes. The persistent identity is reused
  on re-pairing so room/platform moderation follows it.
- `data/agent-access.sqlite` is a separate access-grant store, outside the
  journaled game/economy schema. Pending pairings and controllers are in memory.
  Restart requires re-entry; restarting also invalidates pending codes.
- Run a **single directory process** for this alpha. Multi-process routing and
  distributed controller ownership are not implemented.
- Existing game database backup/recovery tooling does not back up this sidecar.
  Preserve it separately if retaining stable moderation identities matters;
  losing it invalidates grants and requires re-pairing. Before public rollout,
  integrate backup, account-deletion retention, operational metrics and capacity
  testing. This is an owned-world development alpha, not a paid public launch.

## Verification

`yarn test:agents` runs pairing/client/controller regressions and a real local
room Worker test with temporary databases. It covers public presence and speech,
concurrent entry, confirmed movement, stop, leave/re-entry, stale commands, blocks,
idle expiry, room removal, grant revocation, developer-world boundaries and
owner-session expiry. It opens local test sockets; it does not start the game or
modify live room data. The suite also verifies the separate MCP adapter using
official and legacy clients, tool validation, credential exclusion and cleanup.
Build and workspace/server typechecks are also required.
Browser/device appearance and interaction review remains with the owner.
