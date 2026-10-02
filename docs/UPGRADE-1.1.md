# RIPPLE 1.1: from a scenario to a decision surface

## Decision

The original release compares four policies under one set of assumptions. The highest-value extension is to expose how the preferred response changes when those assumptions change. A resilience atlas reuses the tested model and makes the limits of a plan visible.

This release adds a duration/severity sweep, a meaningful service constraint, exact-case investigation, and reproducible evidence. It preserves the original numerical model. The application release is 1.1; core model version 1.0.0 remains unchanged.

## Options considered

| Idea                                                  | Reuse  | Impact    | Decision                                                                           |
| ----------------------------------------------------- | ------ | --------- | ---------------------------------------------------------------------------------- |
| Duration/severity decision surface                    | High   | High      | Build: makes sensitivity visible across up to 36 sampled cases.                    |
| Explicit minimum fulfillment constraint               | High   | High      | Build: makes cost/service trade-offs actionable without inventing a blended score. |
| Cell-to-replay investigation                          | High   | High      | Build: carries the exact trial count, seed, and parameters into the existing lab.  |
| Reproducible atlas links and evidence bundle          | Medium | High      | Build: makes the new analysis independently inspectable.                           |
| Correct view focus and distinguish customized presets | High   | Medium    | Build alongside the new investigation flow.                                        |
| Correlated or simultaneous disruptions                | Low    | High      | Deferred: changes the model and needs separate validation.                         |
| Editable networks and multiple products               | Low    | High      | Deferred: requires a different model and input experience.                         |
| Live shipping or supplier feeds                       | Low    | Uncertain | Deferred: data access and calibration would dominate the work.                     |
| Runtime AI narrative generation                       | Medium | Low       | Deferred: deterministic explanations are more inspectable here.                    |

Monetization is outside this portfolio release. The demo remains public, local-compute, and account-free.

## Acceptance evidence required before shipping

1. The atlas wraps the unchanged simulation, uses the same seeded randomness across sampled cases, and explicitly labels its 30 trials per policy per case.
2. Duration values are deduplicated and bounded by the remaining horizon; calm scenarios have a clear route to a meaningful disruption scan.
3. For every cell, the selected policy is the lowest modeled cost among policies whose unrounded **mean** fulfillment meets the target. Exact ties and no qualifying policies are represented honestly. Coverage is a count of sampled cases, not a probability.
4. The service target reclassifies cached results without rerunning simulations. Scans show real progress, can be canceled, and cannot mix stale inputs or partial results with completed conclusions.
5. Keyboard and pointer users can select cells, inspect all four policies, and open the exact case in the existing lab. Returning to an unchanged scan preserves selection and target.
6. Atlas share links and imported manifests reproduce inputs, target, axes, trial count, and supported model/atlas versions. Exports include numerical evidence and a self-contained explanation. Invalid imports fail safely.
7. The original lab and sharing flows retain their tests. New atlas workflows pass meaningful numerical tests and production-browser checks at desktop and 390px, including accessibility.
8. Fresh screenshots and a real-interaction walkthrough demonstrate the shipped feature. README, model/architecture docs, and release evidence explain the boundaries.
9. CI passes for the release commit. The deployed site is verified at desktop and mobile sizes, and a public 1.1 release contains the static build and walkthrough.

## Visual direction

Treat the atlas like a scientific field guide: a large petrol decision surface, compact labeled cells, and a paper evidence panel. Use position, labels, and an explicit unmatched marker in addition to color. Keep the existing typography and materials. The new view should focus on the cross-scenario decision rather than repeat single-scenario summary cards.
