# A two-minute RIPPLE walkthrough

Use a current desktop browser. Start from a fresh page with the default port-closure scenario. All numbers you see are synthetic simulation results.

## Start with the decision

“What happens if a port closes for longer than the stock we have on hand? And at what point is it worth paying for a different response?”

Point to the network and inventory curve. The map illustrates the model; moving marks are not shipment tracking. Compare keeping the current plan, adding stock, rerouting freight, and changing the sourcing mix.

## Show the Atlas

Open **Resilience atlas** and run the experiment. The progress display covers a bounded grid of disruption durations and severities, with 30 trials per policy in each case. Let the grid complete before presenting its coverage or exporting the evidence.

“Instead of optimizing for one assumption, I can see where a plan stops meeting a service target. Each cell selects the cheapest qualifying strategy. If none qualify, the map says so.”

Change the service target and point out that the completed grid updates without a new simulation. Explain the target precisely: it is mean fulfilled demand over the simulated horizon, averaged across trials. It does not guarantee service on every day.

“These are equally weighted cases I chose to explore. The fraction that meets the target is not a probability.”

## Open the evidence behind a cell

Select a demanding case and inspect the four alternatives. Open that case in the lab. Confirm its duration, severity, seed, and 30-trial count, then move **Simulation day** through the disruption.

“The replay follows one seeded trial. The shaded inventory band summarizes the ensemble. The drilldown uses the exact case from the Atlas.”

Use **Back to resilience atlas** to return to the completed grid. Share its configuration or export the manifest, full policy CSV, and HTML brief. Open the model notes to expose the assumptions rather than presenting a ranking as a universal recommendation.

“This runs in the browser without a server or API key. The simulation is separate from React, computation runs in a worker, and the repository contains repeatability tests and browser checks.”

## Describe the collaboration accurately

“I set out to build a portfolio piece around operations decisions, with a high standard for usability and a working open-source release. I worked with AI agents to develop the application and its verification. The source, model assumptions, and tests are available for review.”

Do not imply real customer deployment, measured cost savings, a novel simulation method, or hand-written implementation. The strongest evidence is a working decision that another person can trace and reproduce.
