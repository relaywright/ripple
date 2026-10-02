# A two-minute RIPPLE walkthrough

Use a current desktop browser. Start from a fresh page with the default port-closure scenario. All numbers you see are synthetic simulation results.

## The opening: a decision with consequences

"What happens if a port closes for longer than the stock we have on hand? RIPPLE lets me stress a small supply network and compare the responses."

Point to the network, inventory curve, and the controls. Explain that the map is an illustration of the model, not a live tracking display.

## Change one assumption

Increase **Disruption duration**, then select **Compare strategies**. Compare fulfilled demand and total cost for the four policies. Inspect the uncertainty band. Avoid quoting a savings number from an earlier run: the result changes with the inputs and model version.

"Every strategy sees matched random conditions. That makes the differences easier to attribute to the strategy. The shaded band shows the spread across simulated trials."

## Trace the result

Move **Simulation day** through the disruption. Show the inventory depletion and recovery in the sample replay.

"The replay follows one seeded trial. The range on the chart summarizes many trials. Those are different views of the same experiment."

Switch to **One supplier stops** or **Demand takes off** and inspect the comparison again. Explain why the assumptions can change which strategy performs well. There is no universal best plan.

## Show the engineering

Use **About the model** to expose the assumptions. Use **Share scenario**, open the resulting link, and reproduce the experiment. Export results so the numerical output can be inspected beyond the interface.

"This runs in the browser without a server or API key. The simulation is separate from React, computation runs in a worker, and the repository contains repeatability tests and browser checks."

## Describe the collaboration accurately

"I set out to build a portfolio piece around operations decisions, with a high standard for usability and a working open-source release. I worked with AI agents to develop the application and its validation. The source, model assumptions, and tests are available for review."

Do not imply real customer deployment, measured cost savings, or hand-written implementation. The strongest evidence is a working experiment someone else can reproduce.
