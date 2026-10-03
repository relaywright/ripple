# Customizing RIPPLE

This guide is for anyone changing RIPPLE's code: adjusting the network, tuning a response, adding a preset, or changing what the atlas scans. If you only want different prices, demand, or disruption timing, you don't need to touch code: edit a scenario file instead (see [the user guide](GUIDE.md#change-any-setting-with-a-scenario-file)).

## What lives where

| To change...                                        | Edit                                                      | Notes                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default experiment and the four sidebar presets     | `src/simulation/index.ts` (`DEFAULT_SCENARIO`, `PRESETS`) | Presets are ordinary scenarios with a title and subtitle.                                                                                                                                                                                                                                                                                                          |
| Response names and descriptions                     | `src/simulation/index.ts` (`POLICIES`)                    | Display text only. Behavior lives in the simulation loop. The `color` field there is unused. Atlas response colors live in `src/components/ResilienceAtlas.tsx`, `src/components/resilience-atlas.css`, and `src/lib/atlas-export.ts`; the inventory chart's line colors are in `src/components/InventoryChart.tsx`, and the cost-bar colors are in `src/App.tsx`. |
| Supplier shares, travel times, capacity, and prices | `src/simulation/index.ts` (`ROUTES`)                      | The map repeats some of these values; see below.                                                                                                                                                                                                                                                                                                                   |
| How each response behaves                           | `src/simulation/index.ts` (constants and the daily loop)  | See [Tuning a response](#tuning-a-response).                                                                                                                                                                                                                                                                                                                       |
| Input limits (allowed ranges)                       | `src/simulation/index.ts` (`validateScenario`)            | Also update the bounds in the sidebar inputs in `src/App.tsx`.                                                                                                                                                                                                                                                                                                     |
| Atlas durations, severities, and trials per case    | `src/simulation/atlas.ts`                                 | `DURATION_CANDIDATES`, `SEVERITY_CANDIDATES`, `ATLAS_TRIALS`.                                                                                                                                                                                                                                                                                                      |
| City positions, labels, and roles on the map        | `src/data/network.ts`                                     | Visual only; the simulation never reads it.                                                                                                                                                                                                                                                                                                                        |
| Map routes, labels, and inspector text              | `src/components/NetworkMap.tsx`                           |                                                                                                                                                                                                                                                                                                                                                                    |
| On-screen copy (headings, tour, model dialog)       | `src/App.tsx`, `src/components/ResilienceAtlas.tsx`       |                                                                                                                                                                                                                                                                                                                                                                    |
| Colors, type sizes, spacing                         | `src/styles.css` and the component CSS files              | Follow [the design system](design-system.md).                                                                                                                                                                                                                                                                                                                      |

## Change the network's numbers

The three supply routes are defined in one array in `src/simulation/index.ts`:

```ts
const ROUTES: readonly Route[] = [
  { id: 'shenzhen', lead: 22, share: 0.65, capacity: 0.75, freight: 2.4, purchaseMultiplier: 1 },
  { id: 'vietnam', lead: 25, share: 0.25, capacity: 0.3, freight: 2.7, purchaseMultiplier: 1.05 },
  { id: 'mexico', lead: 7, share: 0.1, capacity: 0.15, freight: 3.6, purchaseMultiplier: 1.22 },
];
```

| Field                | Meaning                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `lead`               | Typical days from the supplier to the Chicago warehouse. For ocean routes this includes the 4-day inland leg. |
| `share`              | Planned share of each day's orders. The three shares should add up to 1.                                      |
| `capacity`           | The most this supplier can produce per day, as a fraction of baseline daily demand.                           |
| `freight`            | Shipping cost per unit, in dollars.                                                                           |
| `purchaseMultiplier` | Purchase price relative to the scenario's `unitCost`. `1.22` means 22% more.                                  |

Nearby constants control the rest of the network: `INLAND_DAYS` (time from Los Angeles to Chicago) and the Los Angeles spare-capacity factor (`1.25`, inside the gateway clearing step).

**The map repeats some of these values.** `src/components/NetworkMap.tsx` has its own copies of the planned shares (`[65, 25, 10]` and `[35, 20, 45]`), the nominal travel days (22, 25, 7), and the "Target mix" sentence. Update them together with `ROUTES`, or the map will describe a different network from the one being simulated.

Adding or removing a supplier is a larger change. The route list, the `RouteId` type, the diversification arrays, the road-versus-ocean logic in `leadDraw` (which treats route index 2 as the road route), the map nodes, and the map paths all assume exactly three routes. Treat it as a model redesign with new tests, not a configuration change.

## Tuning a response

| Response             | Constant or code                                                              | Default                                                       |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Build a buffer**   | `BUFFER_DAYS`                                                                 | 10 extra days of stock                                        |
| **Change the route** | `DETOUR_DAYS`, `DETOUR_FREIGHT`; reaction delay `scenario.startDay + 3`       | 6 extra days, $4.80 per unit, reacts after 3 days             |
| **Diversify supply** | `DIVERSIFIED_SHARES`, `DIVERSIFIED_CAPACITIES`; delay `scenario.startDay + 5` | 35% / 20% / 45% mix, Mexico capacity 90%, reacts after 5 days |

The reaction delays are written inline in the daily loop (search for `startDay + 3` and `startDay + 5`); the rerouting delay appears in more than one place. If you change a response, also update its wording in these places, which describe the defaults in plain text:

- `POLICIES` descriptions in `src/simulation/index.ts`
- the model dialog and tour in `src/App.tsx`
- the map's response notes in `src/components/NetworkMap.tsx`
- `README.md`, `docs/GUIDE.md`, and `docs/MODEL.md`

## Add or change a preset

Presets are entries in the `PRESETS` array. Each has an `id`, a `title` and `subtitle` for the sidebar, a `description` (used on the atlas's "choose a disruption" screen), and a full `scenario`. Give each preset its own `seed` so they don't share identical random draws.

One limitation: the sidebar decides which preset is highlighted by comparing disruption types, so it expects **one preset per disruption type** (`port`, `supplier`, `demand`, `none`). Two presets with the same type would both appear selected. To support more, change the highlight logic in `src/App.tsx` to track the chosen preset's `id` instead.

The browser tests check the default preset's name and seed, so update `tests/e2e/` if you change `DEFAULT_SCENARIO`.

## Change the atlas grid

`src/simulation/atlas.ts` defines the axes:

```ts
export const ATLAS_TRIALS = 30;
const DURATION_CANDIDATES = [1, 7, 14, 21, 35, 60] as const;
const SEVERITY_CANDIDATES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
```

More cases or trials mean a slower scan, because every case runs all four responses. The atlas manifest format records these values, so changing them is a reason to bump `ATLAS_VERSION`; shared atlas links from an older version will then be refused with a clear message rather than silently producing different results.

## Version numbers matter

RIPPLE promises that the same scenario plus the same model version gives the same results. Keep that promise:

- Bump `MODEL_VERSION` in `src/simulation/index.ts` whenever a change alters simulation results (routes, responses, costs, randomness).
- Bump `ATLAS_VERSION` in `src/simulation/atlas.ts` when the atlas grid or decision rule changes.
- Bump `version` in `package.json` for an application release.
- Record what changed in `docs/MODEL.md` (and `docs/ATLAS.md` for atlas changes).

Changing display text, colors, or layout doesn't need a model version bump.

## Rules the code must keep

These come from [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md):

- The simulation in `src/simulation/` stays pure: no React, no browser APIs, no `Math.random()`, no clock. All randomness comes from the seed.
- Every response sees the same random demand and travel draws in each trial. Use the keyed `uniform()` streams; never draw random numbers in a way that depends on the response.
- New inputs must be validated in `validateScenario` with explicit bounds, so an imported file can't ask the browser for unlimited work.
- No accounts, tracking, secrets, or runtime network calls.
- Animation illustrates flow; never present it as real shipment positions.

## Check your change

```sh
npm run check        # TypeScript and simulation unit tests
npm run build        # production build
npx playwright install chromium firefox
npm run test:e2e     # browser tests against the production build
```

The unit tests in `src/simulation/simulation.test.ts` check conservation of goods, reproducibility, and that different scenarios favor different responses. If you change the network or a response, some expected winners may legitimately change. Update those tests deliberately, and explain why in your pull request.
