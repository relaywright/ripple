# Contributing to RIPPLE

Keep the project easy to run, honest about its assumptions, and useful without an account. Small fixes, clearer explanations, accessibility improvements, and independently reproducible model corrections are welcome.

## Get started

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Read [AGENTS.md](AGENTS.md), [the design system](docs/design-system.md), and [the architecture](docs/ARCHITECTURE.md). The interface uses TypeScript, React, and Vite. The simulation must remain independent of React and browser APIs.

## Make a change reviewable

Explain the problem and the resulting behavior in your pull request. Include a scenario seed and input file when reporting a simulation issue. For a visual change, include desktop and narrow-screen screenshots. State how you checked keyboard use and reduced motion when relevant.

For a model change, explain which assumption changed, why the new behavior is preferable, and which existing results will change. Add a focused invariant or reproducibility test. Preserve the distinction between a sample replay and an aggregate across trials. Update the model version whenever the meaning of an exported result changes.

New imports must be validated before computation. Keep limits bounded so an imported file cannot ask the browser to do unlimited work. Do not add runtime external services, accounts, tracking, or secrets.

Dependencies should solve a concrete problem and have a compatible license. Commit the lockfile, preserve notices for distributed assets, and explain any increase in download size.

## Check before opening a pull request

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests run against the production preview. On Linux, the initial Playwright installation may need `npx playwright install --with-deps chromium`.

Automated accessibility checks catch a subset of problems. Also check the changed flow with the keyboard and at 390px width. Text, colors, and focus should remain understandable without animation.

AI-assisted contributions are welcome. You are responsible for reviewing their output, verifying claims, and explaining the resulting behavior. Include material limitations in the pull request rather than claiming that a generated change is correct because an agent said so.
