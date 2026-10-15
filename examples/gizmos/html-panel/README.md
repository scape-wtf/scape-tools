# Puzzle terminal — bundled HTML example

A self-contained code puzzle with clues, a keypad and a shared solved state.
The participant submits a four-digit guess; the authoritative gizmo validates it
before activating its boolean **Solved** output. A declared connection can power
another gizmo without giving the HTML access to arbitrary objects or host APIs.

## Try the connection

1. Place **🧮 Puzzle terminal** and **🏮 Lamp** from the developer-world palette.
2. Open the terminal's **Connect** controls and connect **Solved** to the Lamp's
   **Power** input. The lamp turns off while the puzzle is unsolved.
3. Open the terminal and follow the four clues. The solution is `3142`.
4. Submit the code: the lamp turns on for everyone. The solved state persists.
5. As the object editor, choose **Reset puzzle** and confirm to turn the output
   off and play again. Visitors and embedded HTML cannot reset it or change wiring.

The Lamp's manual power controls are locked while connected. Other compatible
boolean inputs work too. Door navigation currently has no lock input, so this
example does not change room admission or door access. The solution lives in
public developer source: this is a gameplay puzzle, never an authentication or
payment boundary. The server validates guesses; it does not accept a claimed
`solved` value from the HTML.

## Develop

Export with `yarn sdk:starter <new-directory> --template html-panel`, then use
`yarn install`, `yarn build` and `yarn scape gizmo dev` in that directory.
The folder/template name and `scape.html-panel` type stay stable. Previously
placed counters remain readable as unsolved terminals. Their count is retained;
new submissions increment it, and reset clears it. It is not exposed in the UI.
This capability requires the updated host and SDK; it is not yet published.

`ObjectDefinition.web` contains the fixed document. `ObjectView.webData` sends
only the public solved flag. Local keypad drafts remain local and shared updates
preserve the document. `outputs` and `signals` expose the solved boolean through
the existing SDK connection system. The host owns wiring permissions, target
validation and authoritative delivery; the HTML bridge only exposes `submit`.

Click/tap to open. Escape asks Scape to dismiss the panel. Closing, backgrounding,
navigating or changing worlds revokes the bridge. Installed iOS does not run
embedded panels. There is no wallet or gem access.

Inline scripts are explicitly enabled with `interactive: true`. Network resources,
fetch, forms, workers, nested frames and media remain blocked by host policy.
This is not a CPU quota or a guarantee against all outgoing navigation traffic.
Never include private state or credentials. See the SDK web-content contract.
