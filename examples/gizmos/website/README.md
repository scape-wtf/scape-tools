# Website

**On hold by owner request October 9, 2026.** The game hides this example and
disables all web popover rendering. Source and saved configuration are retained.
The instructions below apply only after the host feature is re-enabled.

Place 🌐 Website in the developer-world palette, open Configure and save an HTTPS
embed URL. Everyone opens that same address; the external application owns its
multiplayer rooms. Use the site's embed endpoint when it offers one.

This example owns URL validation and editor-only configuration. Scape supplies
its popover, isolated frame, lifecycle and optional public room-context bridge.
An empty URL shows static HTML. Source imports only `@scape-wtf/sdk`.

Run `yarn sdk:starter <new-directory> --template website` from the Scape repository
to export a kit with the locally built SDK. This capability is not yet published
in the npm SDK. In the exported project use `yarn install`, `yarn build`,
`yarn test` and `yarn scape gizmo dev` after the matching host is available.

Sites must allow embedding. The initial sandbox runs scripts and forms without
same-origin storage, popups or device access; cookie/login-dependent apps may
need an embed-specific mode. Installed iOS offers the external-browser link.
The bridge sends public room/object context, never Scape credentials. Browser
context is not proof of room membership and cannot enforce a secure backend ban.
See the SDK README's Web content section for the protocol and room policies.
