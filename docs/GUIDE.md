# RIPPLE user guide

This guide walks through every part of RIPPLE: what each screen shows, what each number means, and how to change the settings. You don't need any supply-chain or statistics background.

[Open RIPPLE](https://relaywright.github.io/ripple/) in a second window and follow along.

## Contents

- [The idea in one minute](#the-idea-in-one-minute)
- [Your first experiment](#your-first-experiment)
- [The stress lab, piece by piece](#the-stress-lab-piece-by-piece)
- [The Compare view](#the-compare-view)
- [The resilience atlas](#the-resilience-atlas)
- [Change any setting with a scenario file](#change-any-setting-with-a-scenario-file)
- [Share, export, and reproduce](#share-export-and-reproduce)
- [Frequently asked questions](#frequently-asked-questions)

## The idea in one minute

A supply chain is a line of handoffs: a factory makes goods, a ship or truck carries them, a port unloads them, and a warehouse ships them to customers. When one link breaks, the damage doesn't show up right away. Goods already on the water keep arriving for a while. Then the pipeline runs dry, the warehouse empties, and orders go unfilled. Fixing the break doesn't fix things instantly either, because new goods still take weeks to arrive.

That delayed, spreading effect is the "ripple" in RIPPLE. The app lets you see it happen and test four ways of responding:

1. **Stay the course:** do nothing different (the comparison point).
2. **Build a buffer:** hold 10 extra days of stock in advance.
3. **Change the route:** send ocean freight through a different port.
4. **Diversify supply:** buy more from a closer, more expensive supplier.

Each response protects you in a different way and costs a different amount. RIPPLE shows both sides.

### The pretend company

All experiments use one invented business, "Northwind Goods," with one product and one warehouse in Chicago. It buys from three suppliers:

- **Shenzhen, China** supplies 65% of orders. Goods sail to Los Angeles, then travel inland. About 22 days door to door. The cheapest source.
- **Ho Chi Minh City, Vietnam** supplies 25%. Same route through Los Angeles. About 25 days. Costs 5% more.
- **Monterrey, Mexico** supplies 10%. Goods travel by road through Houston. About 7 days. Costs 22% more, with higher freight.

Newark is a backup port on the East Coast, used only by the "Change the route" response.

Customers want about 120 units a day by default, with random day-to-day variation. When the warehouse is empty, unfilled orders are lost; customers don't wait.

## Your first experiment

1. **Open RIPPLE.** It loads "The port goes quiet": Los Angeles loses 85% of its unloading capacity for 21 days, starting on day 15.
2. **Look at the four numbers at the top.** They show how "Stay the course" performs: what share of orders it fills, how much revenue it loses, what it costs in total, and when it recovers.
3. **Press play** under the map. Watch the day counter move. The map turns orange around Los Angeles while the disruption is active.
4. **Scroll to the inventory chart.** Stock falls to zero during the shaded disruption window, stays empty for a while, then climbs back.
5. **Click "Change the route"** in the row of four cards. The numbers and chart update. Notice that more orders get filled, and check whether the total cost went up or down.
6. **Open Compare** at the top to see all four responses in one table.
7. **Drag the "Disruption duration" slider** in the left panel down to 5 days. Compare again. With a short disruption, doing nothing may be cheapest. That shift is the main lesson: the right response depends on the size of the problem.

## The stress lab, piece by piece

### Left panel: the controls

On a phone, tap **Scenario & controls** to open it.

**01 / Choose a disruption** offers four starting points:

| Preset                  | What breaks                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| **The port goes quiet** | Los Angeles loses 85% of its capacity for 21 days.                   |
| **One supplier stops**  | Shenzhen loses 90% of its output for 24 days.                        |
| **Demand takes off**    | Customers order 75% more than usual for 21 days.                     |
| **A quiet quarter**     | Nothing breaks. Shows what each response costs when it isn't needed. |

When you change a preset's settings, its label switches to "Custom conditions."

**02 / Set the conditions** has three sliders:

- **Disruption duration:** how many days the problem lasts.
- **Severity:** how bad it is. For a port, it's the share of unloading capacity lost (100% is a full closure). For a supplier, it's the share of Shenzhen's output lost. For demand, it's how much extra customers order (100% doubles demand).
- **Starting stock:** how many days of normal sales the warehouse holds when the experiment begins.

**Model assumptions** (click to expand) has four more settings:

- **Daily demand:** average units customers order per day.
- **Demand variability:** how much demand swings from day to day. 15% means a typical day lands within about 15% of the average.
- **Random seed:** the number that fixes the random variation. Change it to see a different but equally plausible run of luck.
- **Simulation trials:** how many times RIPPLE replays the experiment. More trials give smoother averages but take a little longer.

**Reset experiment** returns everything to the default port scenario.

### The four headline numbers

| Number                 | What it tells you                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Demand fulfilled**   | The share of all customer orders that were filled over the whole experiment, averaged across trials. 100% means no lost sales.                                                                                                              |
| **Lost sales revenue** | Unfilled units multiplied by the selling price.                                                                                                                                                                                             |
| **Total modeled cost** | Everything this response cost: buying stock, shipping it, storing it, and the margin lost on orders you couldn't fill. Lower is better, but see the FAQ on why cheapest isn't always best.                                                  |
| **Median recovery**    | The first day, after the disruption ends, that starts a full week of filling nearly every order (at least 95% each day and 98% across the week). "Not observed" means at least half the trials never got there before the experiment ended. |

When you select a response other than "Stay the course," the small text under the first two numbers compares it to doing nothing. For a cost comparison, open Compare.

### The map

The map shows the three suppliers, the ports, and the Chicago warehouse. Lines are the shipping routes in use; they change when a response reroutes freight or shifts orders. Orange marks the disrupted location.

Click any city to see its role in the network. The moving dots illustrate goods flowing; they are not real shipments.

### The replay bar

Under the map: **play/pause**, **reset to day 1**, and the **Simulation day** slider. The label shows which days the disruption covers. The status at the top of the map reads "Network operating," "Disruption active," or "Recovery window."

The strip at the very bottom of the page shows what happened on the selected day in one sample trial: units received, orders filled out of orders placed, units still in transit, and units in stock.

### The four response cards

Click a card to see that response's results everywhere on the page. The card tagged **Lowest modeled cost** is the cheapest response for the current settings.

### The inventory chart

The chart shows warehouse stock over the whole experiment for the selected response.

- **Solid line:** the median stock level on each day (half the trials had more, half had less).
- **Shaded band:** the range covering the middle 80% of trials on each day.
- **Dashed line:** "Stay the course," for comparison.
- **Peach area:** the disruption window.

Click the chart, or use the Simulation day slider, to move through time.

### The decision brief

The green card beside the chart names the cheapest response, how much it saves compared with doing nothing, and the share of orders it fills. **Inspect the trade-offs** opens the Compare view.

## The Compare view

Compare shows all four responses for the current experiment.

**The table** lists, for each response: the share of orders filled (with the range across trials underneath), lost revenue, total cost, and cost compared with doing nothing (green when cheaper, red when more expensive). Click a response name to view it in the stress lab.

**"What are you paying for?"** splits each response's total cost into four parts:

- **Procurement:** buying the goods.
- **Freight:** shipping them, including any rerouting premium.
- **Holding:** storing goods in the warehouse each day.
- **Lost margin:** profit missed on orders you couldn't fill.

This is usually where the trade-off becomes obvious. A buffer adds procurement and holding cost but shrinks lost margin. Rerouting adds freight. Doing nothing has the smallest bill for goods but the biggest lost-margin slice.

## The resilience atlas

A single experiment answers "what happens if the port loses 85% of its capacity for 21 days?" The atlas answers a bigger question: **"Across many versions of this disruption, where does each response stop being good enough, and what's the cheapest one that still works?"**

### Run a scan

1. In the stress lab, pick the disruption you want to study (port, supplier, or demand). The atlas can't scan "A quiet quarter," because there's nothing to vary.
2. Open **Resilience atlas** at the top.
3. Set the **service target**: the minimum share of orders a response must fill to count as good enough. The default is 95%.
4. Select **Run resilience scan**. A progress bar shows the cases as they finish. You can cancel at any time.

### Read the grid

- **Columns** are disruption lengths: 1, 7, 14, 21, 35, and 60 days.
- **Rows** are severities: 0% at the bottom up to 100% at the top.
- **Each square** shows the cheapest response that meets your target, as a three-letter code (BAS, BUF, RTE, DIV), with its fill rate underneath.
- **A cross** means no response met the target in that case.
- **An equals sign** in the corner means two or more responses tied for cheapest.

Reading across a row shows what happens as a disruption gets longer. Typically, "Stay the course" is cheapest for short, mild problems, and you need a stronger response as things get worse. The point where the squares change color is the decision boundary.

Move the target slider after a scan finishes and the grid updates instantly. No new simulation is needed, because RIPPLE already has the results.

### Inspect a case

Click a square, or use the arrow keys and press Enter. The **case inspector** on the right lists all four responses for that case, whether each met the target, and its cost. **Open [response] in the lab** loads that exact case in the stress lab so you can replay it day by day. **Back to resilience atlas** returns you to the grid with your scan intact.

### Coverage

The panel under the grid counts how many squares have at least one response meeting the target, and how often each response meets it or is the cheapest.

This count is not a probability. "34 of 36 cases" doesn't mean a 94% chance of success: every square counts equally, and RIPPLE has no idea how likely a 60-day total port closure really is. The count describes the cases tested, nothing more.

### Atlas settings and limits

Each case runs 30 trials per response, fewer than the stress lab's default 120, so a full 36-case scan stays fast. Everything except duration and severity stays fixed at your stress lab settings: starting stock, demand, costs, seed, and start day. Durations longer than the time left in the experiment are shortened to fit, and any resulting duplicates are removed, so a short experiment produces fewer columns. The [atlas reference](ATLAS.md) has the full details.

## Change any setting with a scenario file

A scenario file is a small text file (JSON format) that holds every input for one experiment. Editing one is the way to change settings that aren't on screen, like prices, costs, the start day, or the length of the experiment.

### Steps

1. Set up the experiment as close as you can in the app.
2. Select **Export results**, then **Reproducible scenario**. Your browser downloads `ripple-scenario.json`.
3. Open the file in any text editor (Notepad, TextEdit, VS Code).
4. Change the values you want and save. Keep the quotes, commas, and field names exactly as they are.
5. In RIPPLE, select **Import experiment** at the bottom of the page and choose the file.

If something is wrong, RIPPLE shows a message naming the field and its allowed range, and leaves your current experiment untouched.

### Every field

| Field              | What it controls                                                                          | Allowed values                                  | Default               |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- |
| `version`          | File format version. Don't change it.                                                     | `1`                                             | `1`                   |
| `name`             | The experiment's title, shown above the results.                                          | 1–100 characters                                | "The port goes quiet" |
| `disruption`       | What breaks.                                                                              | `"port"`, `"supplier"`, `"demand"`, or `"none"` | `"port"`              |
| `startDay`         | When the disruption begins. Counts from 0, so `14` is shown as day 15.                    | Whole number, 0 up to `horizon` − 1             | `14`                  |
| `duration`         | How many days the disruption lasts.                                                       | Whole number, 1 up to `horizon` − `startDay`    | `21`                  |
| `severity`         | How bad it is, as a decimal. `0.85` means 85%.                                            | 0 to 1                                          | `0.85`                |
| `horizon`          | How many days to simulate.                                                                | Whole number, 30 to 180                         | `90`                  |
| `dailyDemand`      | Average units ordered per day.                                                            | 10 to 10,000                                    | `120`                 |
| `demandVolatility` | Day-to-day demand variation, as a decimal. `0.15` means 15%.                              | 0 to 0.6                                        | `0.15`                |
| `initialStockDays` | Starting warehouse stock, in days of normal demand.                                       | 0 to 60                                         | `6`                   |
| `unitRevenue`      | Selling price per unit, in dollars.                                                       | 1 to 10,000                                     | `85`                  |
| `unitCost`         | Base purchase price per unit from Shenzhen. Other suppliers charge more.                  | 0.01 up to `unitRevenue`                        | `32`                  |
| `holdingCost`      | Cost to store one unit in the warehouse for one day.                                      | 0 to 100                                        | `0.03`                |
| `seed`             | Fixes the random variation. Any whole number works; the same seed gives the same results. | Whole number, 0 to 4,294,967,295                | `71429`               |
| `trials`           | How many times to replay the experiment.                                                  | Whole number, 1 to 500                          | `120`                 |

Every field must be present, and RIPPLE rejects fields it doesn't recognize.

### Example: a high-margin product with an early, long disruption

Say you sell a $250 product that costs $60, storage is more expensive, and you want the port to close completely for 30 days starting in the first week, over a six-month window:

```json
{
  "version": 1,
  "name": "Premium product, early closure",
  "disruption": "port",
  "startDay": 5,
  "duration": 30,
  "severity": 1,
  "horizon": 180,
  "dailyDemand": 120,
  "demandVolatility": 0.15,
  "initialStockDays": 10,
  "unitRevenue": 250,
  "unitCost": 60,
  "holdingCost": 0.2,
  "seed": 71429,
  "trials": 120
}
```

With a fat margin, every lost sale hurts more, so the protective responses tend to look better than they do in the default scenario. Try it and see whether the cheapest response changes.

### Changing the network itself

Suppliers, routes, travel times, supplier price differences, and how each response behaves are built into the code, not the scenario file. The [customization guide](CUSTOMIZING.md) explains how to change them.

## Share, export, and reproduce

**Share scenario** (top right of the stress lab) creates a link containing every setting and copies it to your clipboard. Anyone who opens it gets the identical experiment and identical results.

**Export results** offers three downloads:

- **Decision brief:** a standalone web page summarizing the experiment, the results for all four responses, and the assumptions. Open it in a browser or print it to PDF.
- **Results spreadsheet:** a CSV file with each response's metrics and cost breakdown, for Excel or Google Sheets.
- **Reproducible scenario:** the scenario file described above.

The atlas has its own buttons: **Share atlas**, **Download atlas CSV** (every response in every case), **Download atlas brief**, and **Download atlas settings** (a file you can import to rebuild the same scan).

Share links and scenario files contain only settings; the brief and spreadsheets add results. None of them contain personal data, and nothing is sent to a server. Links are encoded, not encrypted, so anyone with the link can read the settings. Keep confidential information out of scenario names.

RIPPLE also remembers your last experiment in your browser, so it's still there when you come back.

## Frequently asked questions

**Is this real data?**
No. The company, suppliers, routes, prices, and travel times are invented to make the trade-offs easy to see. City names make the map readable; they don't make the numbers real.

**Why isn't the response that fills the most orders marked as the best?**
RIPPLE highlights the lowest total cost, which already includes the margin lost on missed orders. A response can fill more orders and still cost more overall, for example by holding a large buffer you barely needed. If service matters more to you than cost, use the atlas and set a service target: it picks the cheapest response that meets your minimum.

**Why does "Change the route" do nothing for a supplier problem or a demand surge?**
Rerouting only helps when the port is the problem. If Shenzhen stops producing, or customers suddenly want more, sending freight through Newark doesn't create more goods. RIPPLE models it that way on purpose.

**Why do things keep getting worse after the disruption ends?**
Goods take weeks to travel. When a supplier or port recovers, new goods still need the full journey to reach Chicago, so the warehouse can stay empty for a while after the shaded window ends.

**Why does "Build a buffer" cost money even in "A quiet quarter"?**
The extra stock is bought and stored before anyone knows whether a disruption will happen. That's the real cost of insurance, and the quiet scenario shows it.

**Why do the replay numbers at the bottom not match the chart?**
The chart shows the median across all trials. The replay strip follows one specific sample trial so you can see concrete daily events. They describe different things and needn't match.

**What happens if I change the seed?**
You get a different run of random demand and travel delays. The results will shift a little. If the cheapest response changes when you only change the seed, the decision is close.

**Can I model my own business?**
Partly. A scenario file lets you change demand, prices, costs, stock levels, and the disruption. The network shape (three suppliers, one warehouse) is fixed unless you edit the code; see the [customization guide](CUSTOMIZING.md). Either way, treat the results as a way to build intuition, not a forecast.

**Does anything get uploaded?**
No. The simulation runs entirely in your browser. There are no accounts, analytics, or tracking.

**Where can I see the exact math?**
The [model reference](MODEL.md) lists every equation and assumption.
