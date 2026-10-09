# Scape Gizmo examples

## Run an example

Each project under examples/gizmos/ uses the published Scape SDK and CLI. Use
Node.js 22+. Clone https://github.com/scape-wtf/scape-tools and run npm install at
the checkout root. Inside examples/gizmos/<name>, run:

    npm run build
    npm test
    npm exec -- scape gizmo dev

Gizmo development connects to https://scape.wtf. Compare the printed code in the developer sidebar's
Gizmos tab and choose Connect project. The project's npm run dev script is a
shortcut for scape gizmo dev.

To make an independent copy, copy an example directory outside this checkout,
run npm install there, then use the same build, test and development commands.
Use scape gizmo init to create a blank project.

These examples contain no credentials and do not connect during installation or builds.
