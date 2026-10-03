# Release evidence

## Version 1.1.0

Local release verification completed October 2, 2026. The Resilience Atlas adds a bounded duration/severity grid, an explicit mean-fulfillment target, exact case drilldown, and reproducible evidence. The application version is 1.1.0; the supply-chain model and Atlas algorithm each identify their own version as 1.0.0.

### Automated checks

- `npm run check` passes strict TypeScript checks and **135 unit tests** across five test files.
- `npm run build` produces the static application and both workers successfully.
- `npm run test:e2e` passes **28 production-browser checks** across desktop (1440px) and mobile (390px) Chromium. The final local run completed in approximately 1.1 minutes.
- Numerical checks cover the original conservation, cost, validation, and reproducibility invariants plus Atlas axes, exact case equivalence, unrounded target boundaries, ties, no eligible policy, coverage, worker messages, manifests, and exports.
- Integrated Atlas checks compare all four selected-cell metrics with the single-case engine, verify a full 144-row policy CSV, reconstruct a scenario from a CSV row, and confirm exact 30-trial drilldown and preserved return state.
- Shared-link reload reproduces the entire exported CSV for a capped six-case grid. Unsupported manifest, model, and Atlas versions fail safely. An invalid shared link returns a readable error and a working default lab.
- Cancellation closes the worker, a superseding import replaces old work, and an intentionally failed worker load recovers through retry. Changing the service target updates results without creating another Atlas worker.
- A regression check moves a 90-day lab to its final day, imports a 30-day Atlas, and verifies that the lab replay resets within the shorter horizon.
- Axe WCAG A/AA checks pass on the lab, comparison, existing dialogs, and Atlas idle, help, complete, selected-case, no-qualifier, and no-disruption states. Keyboard checks cover focus restoration, cell selection, directional grid navigation, and first/last-cell shortcuts. Reduced motion and page width are also checked.
- Normal lab and Atlas execution checks observed no external HTTP requests or page errors. The explicit worker-failure test intentionally blocks its local worker request.
- The production dependency audit reports no known vulnerabilities at this release check. This is a point-in-time check, not a guarantee about future advisories.

### Media and publication verification

Fresh screenshots in `artifacts/` show the real desktop and mobile application, including the completed Atlas. `scripts/capture-demo.ts` records real replay, comparison, scanning, target changes, exact-case drilldown, sharing, and export interactions.

The current MP4 and WebM walkthrough runs **25.08 seconds**. It was re-recorded on 2026-10-03 so the footer shows the relaywright credit. Both formats were tested at 1440px and 390px: `readyState=4`, playback advanced beyond one second, and seeking near the end reached `ended=true` with no media error. This establishes the tested playback behavior, not uninterrupted playback on every device.

The [version 1.1.0 release](https://github.com/relaywright/ripple/releases/tag/v1.1.0) carries the downloadable static build, its checksums, and the walkthrough. The repository was republished under the relaywright account on 2026-10-03 with rewritten commit identities, so commit IDs changed. The original CI, Pages, and live-check evidence referred to the previous repository and was not carried over; successful verification runs deploy `main` to Pages, and their records live in GitHub Actions. Local checks alone do not establish that a deployment has updated.

### Scope

These checks establish implementation behavior under tested conditions. They do not calibrate the synthetic model against real operations or certify universal accessibility. The browser matrix uses Chromium, including mobile emulation; it does not establish Safari or Firefox compatibility. See [ATLAS.md](ATLAS.md) for target and coverage definitions, [MODEL.md](MODEL.md) for model boundaries, and [ARCHITECTURE.md](ARCHITECTURE.md) for software decisions.

No real-world predictive accuracy, business savings, customer adoption, or independent hand-written engineering authorship is claimed. GitHub Actions repeats the build and automated checks before deploying `main` to GitHub Pages.

## Version 1.0.0 history

The original release was verified October 2, 2026 with 74 passing unit tests and 16 passing production-browser checks. It included the single-scenario lab, four policy comparisons, replay, validated imports, shared scenarios, CSV results, and an escaped standalone HTML brief. Automated accessibility checks covered the workspace, comparison, and all dialogs. The point-in-time production dependency audit reported no known vulnerabilities.

Its original 21.32-second MP4 and WebM walkthrough loaded, advanced playback, and reached `ended=true` after seeking near the end, with no media error. The version 1.0 release assets preserve that historical media; the files in `artifacts/` now showcase the current application.
