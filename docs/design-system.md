# RIPPLE visual direction

A contemporary operations atlas: warm paper around a deep petrol cartographic stage. Precise, calm, tactile. Editorial typography, Swiss grid discipline, real data graphics. The primary product is an experiment workspace, not a marketing page.

- Canvas #f4f3ec; surfaces #ffffff; text #173739; muted #687773; lines #dce0d7.
- Map #102a2c / #193e40; lime #c4ee9d for action; orange #e98b60 for disruption; dark teal #1a5553 for emphasis.
- Display and UI: self-hosted Manrope (400, 500, 600, 700, 800). Data: self-hosted IBM Plex Mono (400, 500).
- Compact uppercase mono eyebrows; generous editorial title; rounded controls but restrained panel radii (12–18px).
- Respect reduced motion. All controls must have keyboard focus, labels, and adequate contrast. Decorative map motion must stop when paused.
- Mobile layout must retain every function without horizontal page overflow.

## Typography

Use the shared `:root` scale in `src/styles.css`: `--type-label` 12px,
`--type-body` 14px, `--type-body-lg` 16px, `--type-heading` 20px,
`--type-heading-lg` 24px, `--type-title` 32px, and `--type-display` 48px.
Reading text and form labels use the body steps; compact uppercase labels and
chart annotations use the label step. Headings stay larger than reading text.
All visible text must render at least 12px on screen, including at 390px.
SVG annotations compensate for viewBox scaling using their container width;
judge their minimum by the computed font size multiplied by the screen scale.

## Release bar

Seeded simulation with invariant tests. Worker computation. Four working policies. Adjustable disruptions. Replay. Transparent model. JSON round trip and validation. Shareable URL. Downloadable results. Browser checks at desktop and 390px. MIT license, setup docs, limitations, CI, screenshots.
