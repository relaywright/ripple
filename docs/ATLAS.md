# Resilience Atlas

The Atlas asks a different question from a single experiment: **where does a strategy stop meeting the service target, and what is the cheapest eligible alternative?**

It runs the same four policies across a bounded grid of disruption durations and severities. Each cell is a complete seeded experiment. Select a cell to inspect the tradeoff, then open that exact case in the lab or export the evidence.

## Read the map

Duration candidates are 1, 7, 14, 21, 35, and 60 days. They are capped at the time remaining after the disruption starts, and duplicate durations are removed. The severity axis is 0%, 20%, 40%, 60%, 80%, and 100%. A full grid therefore contains 36 cases; a short remaining horizon produces fewer duration columns. Choose a port closure, supplier outage, or demand surge; a no-disruption scenario cannot generate an Atlas.

Each case uses **30 trials per policy**, the current scenario's seed, and its other assumptions. Duration and severity vary; demand, costs, initial stock, disruption type, start day, and horizon stay fixed. The individual trials share random conditions across policies, as in the main lab. The same seed also makes cells comparable across the explored conditions.

The Atlas is a bounded experiment, not a search over every possible disruption. A boundary can lie between the sampled durations or severities. Thirty trials reveal variability under the model; they do not establish calibrated real-world probabilities or precise statistical significance.

## What the target means

The default target is **95% mean fulfillment**. In each trial, fulfillment is the share of total demand served across the entire simulated horizon. The policy's reported service is the mean of that fraction across the trials. A policy qualifies when this unrounded mean is greater than or equal to the selected target.

This is not a promise that every day, every trial, or 95% of real disruptions will meet the target. It is also not the model's separate recovery measure. A good whole-horizon average can hide a difficult period; use the case replay to inspect that period.

Among qualifying policies, the Atlas selects the lowest mean modeled cost. If none qualify, the cell says so. It does not silently relax the target. Exact cost ties are shown as ties, with the canonical selection following the model's policy order. Changing the target reclassifies the completed results without running another simulation.

Cost has the same definition as the lab: procurement, transport, holding, and lost contribution margin. Opening inventory and goods already in transit are purchased; closing inventory receives no salvage credit. This is a model-specific comparison of spending and lost contribution, not accounting profit. See [MODEL.md](MODEL.md) for the equations.

## Coverage is not probability

Coverage counts the completed grid cases in which a policy meets the target, with each case weighted equally. The grid does not assign likelihoods to durations or severities. **“Meets the target in 24 of 36 tested cases” does not mean “a 67% chance of success.”** The count also depends on the chosen axes and assumptions.

Winning-case counts use the canonical winner once per qualifying case. Co-winning counts include every exact tied minimum, so those counts can sum to more than the number of cases. Mean cost across the grid is an unweighted average of explored cases, not an expected cost forecast. Minimum service is the lowest cell mean, not a lower confidence bound.

Incomplete cases are not zero-service results. Cancelling a run leaves an explicitly incomplete experiment, and a changed input invalidates results from the old assumptions. A completed grid is required for complete evidence exports.

## Reproduce a case

Open a selected case in the lab to inspect its four strategies, cost ledger, inventory band, and sample replay. That case retains the Atlas's **30 trials**, seed, duration, severity, and other assumptions. It does not switch silently to the lab's usual trial count. Returning to the Atlas preserves the completed grid.

A shared Atlas link records the experiment configuration. Importing an Atlas manifest or opening its link reruns the model; it does not treat downloaded output as trusted computation. Exact reproduction requires the same model version as well as the same inputs. The application release version and simulation model version are separate: the Atlas expands the interface without changing the underlying supply-chain model.

## Keep the evidence

- **Manifest JSON** records the bounded experiment and target for import and reproduction.
- **CSV** exposes every policy in every case, with its metrics, eligibility decision, model versions, and all numerical and disruption inputs needed to reconstruct the case. Fixed assumptions are repeated in every row; the start day is explicitly zero-based. Scenario names are omitted. A full 36-case grid has 144 policy rows.
- **HTML brief** presents the decision context and results in a standalone document with the reproduction data. User-controlled text is escaped, and the document does not run scripts.

The files describe synthetic experiments. They do not certify a strategy for operational use. Shared links are encoded, not encrypted; keep confidential information out of scenario names and files.

## Computation and verification

The simulation stays pure and independent of React. A dedicated Web Worker runs the grid incrementally, reports progress, and can be terminated when the user cancels or changes the input. The interface must reject obsolete progress and results from superseded work. Limits on axes, horizon, and trial count bound the amount of work.

Verification checks each selected case against the same single-experiment engine, checks service-target boundaries and ties, and checks progress, cancellation, reproduction, exports, and accessible interaction in the browser. These establish properties of the implementation under tested conditions. The synthetic model has not been calibrated or validated against observed logistics outcomes.

## Sources and scope

The Atlas applies established scenario-analysis ideas to a small, inspectable teaching model. It does not claim a novel optimization method or the breadth of a commercial supply-chain platform.

- [anyLogistix's official variation tutorial](https://anylogistix.help/tutorial/tutorial-variation-2.html) demonstrates parameter ranges, repeated stochastic runs, service checks, and cost comparisons. Those capabilities already exist in established tools; RIPPLE emphasizes a compact, open-source browser workflow with inspectable assumptions.
- [RAND's Robust Decision Making guidance](https://www.rand.org/pubs/tools/TL320/tool/robust-decision-making.html) describes examining strategies across plausible conditions and identifying where goals fail. Its warning against treating the fraction of successful explored cases as a probability directly informs the Atlas's coverage labels. Applying this framing to RIPPLE is our design choice, not a RAND endorsement.
- [NIST's summary of verification, validation, and uncertainty procedures](https://www.nist.gov/publications/summary-industrial-verification-validation-and-uncertainty-quantification-procedures) distinguishes implementation checks from assessing a model against reality. The publication concerns computational fluid dynamics; that general distinction informs these release notes. RIPPLE is not NIST-certified or externally validated.
