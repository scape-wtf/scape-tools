# floored website example

This learning project demonstrates the generic SDK `ObjectDefinition.web`
capability with a fixed `https://floored.app/` source. Developers can declare their
own site in their own gizmo; Scape has no floored-specific renderer or allowlist.

Click/tap 🌐 floored to open the embed immediately. Delete is the only management
action. There is no URL field, Configure action or second opening button. State is
empty and the example requests no Scape context or gameplay bridge. The owner
confirmed there are no old placements; configurable URL state is removed.

Browser rendering and developer-palette access are local implementation only;
publication/activation remain separate. Website shop distribution is still paused.
Installed iOS opens the fixed site externally instead of creating an iframe.
Sites must permit framing. Scape preserves the site's own origin for module loading
and storage inside a scriptless wrapper whose CSP permits only the declared origin.
Off-origin redirects are blocked; browser third-party storage rules still apply.
Browser compatibility is owner-reviewed.

Export with `yarn sdk:starter <new-directory> --template website`, then run
`yarn install`, `yarn build`, `yarn test` and `yarn scape gizmo dev` in that project.
For interfaces served entirely by the gizmo, use `--template html-panel`.

## App icon

`src/icon.ts` bundles floored's 192px standalone web app icon from
`app/public/icons/app/icon-192x192.png` in the floored project. PNG metadata was
stripped without changing pixels. The definition uses the SDK's static `image`
sprite shape, so placements and previews reuse the icon without fetching remote
artwork. Keep 🌐 as the stable identity; the displayed name is lowercase `floored`.
