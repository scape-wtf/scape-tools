# Event form

A native form with a single-line event name, separate date/time strings, explicit timezone selection, a color
picker with suggested palette, bounded capacity, boolean checkbox, duration slider, format radio group, activity checklist and multiline notes.
Open Configure to edit. Save validates all typed values again in the action.
Empty date/time drafts are allowed by the SDK; this action requires both before saving.
No timestamp conversion, scheduling service, notification or external data is involved.
The palette suggests colors and does not restrict the full native picker.

Run `yarn build` and `yarn test`. This is a developer-only reference, not a shop product. The project is registered in the developer-world
scene palette and uses the production popover in the style guide.

`rows` groups Date + Time and Capacity + Open to visitors with equal widths.
Notes + Save demonstrates mixed fields/buttons at natural widths. Saved notes
share a public summary row with the description. Rows wrap on narrow screens;
editor fields and actions stay under Configure. The color picker and optional
palette remain one field. Layout does not alter saved state or action payloads.

Duration saves a number in 15-minute steps. Format saves one allowed string; activities
save unique allowed strings, including an empty list. Earlier saved forms default
to 60 minutes, Social and no activities until the next explicit save.
