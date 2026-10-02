# Version 1.0.0 release evidence

Verified October 2, 2026.

## Automated checks

- TypeScript strict compilation and Vite production build pass.
- 74 unit tests pass: simulation invariants, deterministic inputs, model boundaries, scenario transport, HTML escaping, report reproduction, and CSV cost reconciliation.
- 16 production-browser checks pass across desktop (1440px) and mobile (390px) Chromium.
- Browser checks include all presets, strategy selection, keyboard timeline/map controls, imports, malformed files and URLs, exact shared-scenario reproduction, downloads, and worker execution.
- Axe WCAG A/AA checks pass on the initial workspace, comparison view, model dialog, tour, export dialog, and share dialog. Automated scans are supplemented by keyboard/focus tests and visual inspection; they are not a certification of universal accessibility.
- The browser test observed no external requests, page errors, or horizontal page overflow.
- `npm audit --omit=dev` reports no known vulnerabilities at release verification time. This is a point-in-time dependency check.

## Product evidence

Screenshots in `artifacts/` show the real application. `scripts/capture-demo.ts` records actual interactions with the product: replay, changing strategy, comparing costs, changing disruption, and exporting evidence. It does not substitute rendered mockups for working screens.

The 21.32-second walkthrough was encoded in MP4 and WebM. Both loaded with media `readyState=4`, advanced playback, and reached `ended=true` after seeking near the end, with no media error. These checks establish basic codec/playback compatibility, not uninterrupted playback on every device.

## Scope

This release uses synthetic data and documented teaching assumptions. No real-world predictive accuracy, business savings, customer adoption, or independent hand-written engineering authorship is claimed. See [MODEL.md](MODEL.md) for numerical boundaries and [ARCHITECTURE.md](ARCHITECTURE.md) for software decisions. The automated browser matrix covers Chromium; other browser engines have not been included in this release matrix.

GitHub Actions repeats the build and automated checks before deploying `main` to GitHub Pages.
