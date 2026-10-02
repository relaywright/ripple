# The RIPPLE model

RIPPLE is a synthetic, single-product educational simulation. All route volumes,
lead times, capacities, prices, policy responses, and disruption parameters are
invented for exploration. They are not measurements, live logistics intelligence,
or operational forecasts. The geographic names make the scenario legible; they do
not make its assumptions authoritative.

Implementation: [`src/simulation/index.ts`](../src/simulation/index.ts).
Model version: **1.0.0**. No network, account, credential, or external service is
required to run it. The engine is independent of React and the browser.

## What is being simulated

A single warehouse in Chicago serves demand for one interchangeable product.
Three suppliers send physical shipment cohorts into a shared warehouse pool.
Stock cannot become negative. A sale that cannot be filled that day is lost;
there is no backorder or later catch-up sale. Units can be fractional because
route shares and partial port clearances represent aggregate volume.

The model maintains every in-transit cohort, including cargo waiting at a port.
It never creates inventory just because a policy is selected.

| Route                                    | Planned share | Typical source-to-warehouse time | Normal daily production limit | Freight per unit |        Purchase price |
| ---------------------------------------- | ------------: | -------------------------------: | ----------------------------: | ---------------: | --------------------: |
| Shenzhen → Los Angeles → Chicago         |           65% |                          22 days |  75% of baseline daily demand |            $2.40 |        Base unit cost |
| Ho Chi Minh City → Los Angeles → Chicago |           25% |                          25 days |  30% of baseline daily demand |            $2.70 | 1.05 × base unit cost |
| Monterrey → Houston → Chicago            |           10% |                           7 days |  15% of baseline daily demand |            $3.60 | 1.22 × base unit cost |

These are planned purchasing shares, not guaranteed realized shares. A supplier
shortfall or a production limit can reduce actual production. Houston is a route
waypoint; there is no separately modeled Houston capacity limit. Mexico travels
directly through the road pipeline in the model. Its 7-day total includes that
waypoint.

For the two ocean routes, the last four days are an inland leg. Los Angeles can
normally clear 112.5% of baseline total daily demand: 90% ocean share multiplied
by 1.25 spare processing capacity. Cargo is cleared first-in, first-out by its
actual gateway arrival day. Partial clearance is allowed, and the remainder
stays queued. Every cleared unit takes four more days to reach the warehouse.

Newark has sufficient spare clearance capacity for all diverted cargo in this
toy network. It has no modeled congestion. That is an explicit favorable
assumption for rerouting, not a claim about the real port.

## Time and the opening pipeline

The engine uses zero-based days: `0` through `horizon - 1`. The interface displays
these as Day 1 through Day `horizon`. An event is active when:

```text
startDay <= day < startDay + duration
```

The experiment starts with paid-for warehouse inventory equal to
`initialStockDays × dailyDemand`. The buffer policy buys 10 more stock-days.
Opening inventory is priced using the weighted original supplier mix, including
its corresponding freight.

The model also starts with a paid-for, age-staggered pipeline. Before day 0,
suppliers are assumed to have dispatched their normal planned volumes each day.
Only cohorts whose sampled warehouse arrival is day 0 or later are retained.
Goods that passed the gateway before day 0 are already on their inland leg.
This avoids the artificial three-week delivery gap of an empty initial pipeline.
Every retained cohort's purchase and freight costs are included in the ledger.

Within each day, the engine:

1. Activates any eligible policy response and places new orders.
2. Applies source availability and production limits, then creates paid-for
   shipments for the units actually produced.
3. Clears eligible gateway cargo within that day's available capacity.
4. Receives shipments that have completed their inland or road journey.
5. Fills that day's demand from warehouse inventory, recording lost sales.
6. Charges holding cost on remaining warehouse stock and records a snapshot.

Nothing is destroyed by a port closure. Supplier disruption prevents new goods
from being produced; it does not remove goods already in the pipeline.

## Disruptions

Only one disruption is active in a scenario.

| Disruption            | Effect during the event                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Port slowdown         | Los Angeles clearance capacity is multiplied by `1 - severity`. A severity of 1 is complete closure.                              |
| Supplier interruption | Shenzhen's otherwise producible order quantity is multiplied by `1 - severity`. Other sources and all existing cargo keep moving. |
| Demand surge          | Mean customer demand is multiplied by `1 + severity`. A severity of 1 doubles it.                                                 |
| None                  | No event effect; normal demand and travel variability remain.                                                                     |

Every policy updates its daily demand plan three days after a demand step.
The same delay applies when the surge ends. Orders seek the planned supplier
shares of that demand plan, subject to each source's capacity. There is no
perfect advance knowledge of a demand surge, no automatic replenishment of all
lost units, and no warehouse target-stock controller.

For a supplier interruption, reduced production is not backlogged. Recovery of
the supplier restores its ordinary daily output, with the usual travel delay.
The experiment may therefore end with less reserve inventory than it began
with. Shortages may continue after the event shading ends.

## Four policies

All four use the same stochastic inputs and share the same baseline network.

**Stay the course / baseline.** Retain the original purchasing mix and opening
inventory. The normal demand-planning response still operates.

**Build a buffer.** Buy and pre-position 10 additional days of baseline demand
before the experiment. All extra goods incur purchase, freight, and warehouse
holding costs. This is preparedness selected in advance, not a response that
magically delivers goods when the event starts. Daily ordering is otherwise
identical to baseline. The extra stock is purchased even if no event occurs.

**Change the route / reroute.** For a nonzero port disruption only, react after
three days. On that activation day, ocean cargo that has not yet reached its
Los Angeles gateway is diverted to Newark. Its remaining gateway arrival date
is moved six days later and it incurs an extra $4.80 freight per unit. Cargo
already at Los Angeles, or already traveling inland, cannot be diverted.
New ocean orders during the remaining event also go via Newark, taking six
extra days and paying the same premium. After the event, new orders use
Los Angeles again. Previously diverted cargo remains on its Newark journey.
A port event lasting three days or less ends before rerouting can activate.
Rerouting does nothing for supplier or demand events.

**Diversify supply.** For any nonzero event, a sourcing agreement activates five
days after the event begins. From then through the remainder of the experiment,
new purchasing targets shift to 35% Shenzhen, 20% Ho Chi Minh City, and 45%
Monterrey. Mexico's daily production limit rises to 90% of baseline demand;
the other source limits stay unchanged. Existing cargo keeps its original
route. Mexico's normal 1.22× purchase price and $3.60 freight apply to every
unit, and its normal travel time still applies. This is a simplified assumption
of pre-negotiated backup capacity becoming available after five days. The
commitment lasts to the end of the experiment even if the event ends sooner.
There is no fixed setup fee beyond these higher unit costs.

Policies have no universal winner. A short or mild event may not repay added
costs; a late policy response may arrive too late. The preset outcomes are model
examples and should not be interpreted as routing or procurement advice.

## Randomness and reproducibility

The default experiment runs 120 trials over 90 days. The seed, trial index, day,
and stream identifier determine every random draw through an integer hash.
There is no `Math.random()`, wall-clock input, or shared mutable random state.

Demand uses a Box–Muller normal draw with relative standard deviation equal to
`demandVolatility`. The mean is baseline daily demand, multiplied by the active
demand surge if applicable. The random multiplier is floored at 0.1, demand is
rounded to a whole unit, and final demand is at least one unit. Consequently,
at large volatility the clipped distribution's mean is not exactly the nominal
mean. It is a deliberately simple demand model, with no seasonality, trend,
customer substitution, or price elasticity.

Ocean lead-time jitter is -2, -1, 0, +1, or +2 days with probabilities 10%, 20%,
40%, 20%, and 10%. Road jitter is -1, 0, or +1 day with probabilities 20%, 60%,
and 20%. Draws are keyed to original route and departure day, including opening
pipeline cohorts. Rerouting adds its six days to the same underlying draw.

Separate keyed streams ensure that a policy branch cannot consume a random
number and shift the remaining sequence. Within a trial, every policy sees
the **exact same daily demand** and **the same route/departure travel draws**.
Policies can change quantities, routing, queues, and realized delivery times;
those are modeled consequences, not differences in random luck.

The same version-1 scenario and model version reproduce the same output. A
different model version may intentionally change results. JSON scenario export
preserves every required input, including seed and trial count.

## Costs, revenue, and ranking

All dollar amounts are synthetic U.S. dollar values. There are no taxes,
discounting, financing charges, labor costs, duties, salvage credits, currency
effects, or fixed carrier fees.

```text
procurementCost = purchase cost of opening warehouse stock
                + purchase cost of opening in-transit goods
                + purchase cost of all goods produced during the horizon

transportCost = freight on those same goods
              + premiums for cargo diverted to Newark

holdingCost = sum of daily ending warehouse units × per-unit daily holding cost

lostRevenue = unfilled demand units × unitRevenue

lostMargin = unfilled demand units × (unitRevenue - base unitCost)

totalCost = procurementCost + transportCost + holdingCost + lostMargin
```

`lostMargin` uses the user-entered base unit cost as a common proxy for forgone
unit contribution across policies. It does not subtract policy-specific freight
or supplier price premiums. This deliberate simplification avoids assigning
unfilled demand to a supplier, but it is not a complete margin calculation.

**Total modeled cost is procurement-and-freight spending, holding expense, plus
forgone contribution. It is not accounting expense, profit, or net cash flow.**
Revenue is not profit. Lost revenue is shown as a separate impact metric and
is not added again to total cost.

The opening inventory and all production during the horizon are charged in
full. Goods still in stock or in transit at the end have no terminal credit;
they remain owned, paid-for goods, not waste. This means a short horizon can
favor a policy that delays purchases or leaves fewer assets at the endpoint.
Change the horizon to explore that sensitivity. A real investment analysis
would need a longer cash-flow model and explicit terminal asset valuation.

The highlighted policy has the **lowest arithmetic mean total modeled cost**
across the configured trials. Exact ties follow the listed policy order, with
baseline first. This is a transparent comparison rule, not an optimizer or a
recommendation for a real business. A user who prioritizes service may prefer
a more expensive policy.

## Reading outputs

- **Service level:** fulfilled units divided by requested units, calculated per
  trial and then averaged. It is unit fill rate, not the percentage of orders
  delivered on time.
- **Stockout days:** mean number of days with any unmet demand. Its mean can be
  fractional.
- **Snapshot / replay line:** one reproducible illustrative run, always trial
  zero. It is neither an average nor a historical observation.
- **Inventory band:** pointwise 10th, 50th, and 90th percentiles across trials.
  The 10th–90th range is an 80% simulation interval under these assumptions,
  not a statistical confidence interval or a calibrated real-world forecast.
  A percentile line is not itself an individual shipment trajectory.
- **Service range:** 10th, 50th, and 90th percentiles of complete-trial service
  levels, using linear interpolation between sorted observations.
- **Recovery:** the first seven-day window beginning after the event ends with
  at least 95% service on every day and at least 98% fulfilled units over the
  whole window. This is a finite-window service definition, not restoration of
  inventory reserves or a guarantee against later shortfalls. The reported day
  is the upper median of trial recovery days, treating unrecovered trials as
  infinity. A numeric result therefore requires more than half of an even-sized
  trial set to have recovered. `null` means that this majority recovery was not
  observed within the horizon, or that there was no nonzero event (N/A).

Every snapshot includes remaining inventory, total pipeline units (including
queued cargo), received units, demand, fulfilled units, lost units, and cumulative
lost revenue. Geographic motion is illustrative routing animation. It is never
a measurement of shipment location or progress.

## Input boundaries

The JSON boundary accepts only the exact version-1 scenario fields. Unknown
fields, missing own fields, arrays, null, unsupported versions, nonfinite numbers,
numeric strings, and out-of-bounds values are rejected without coercion. The
calling interface also caps imported file size before parsing.

| Field              | Accepted range                                 |
| ------------------ | ---------------------------------------------- |
| `version`          | Exactly `1`                                    |
| `name`             | 1–100 printable characters; whitespace trimmed |
| `disruption`       | `port`, `supplier`, `demand`, or `none`        |
| `horizon`          | Integer 30–180 days                            |
| `startDay`         | Integer 0 through `horizon - 1`                |
| `duration`         | Integer 1 through `horizon - startDay`         |
| `severity`         | 0–1                                            |
| `dailyDemand`      | 10–10,000 units                                |
| `demandVolatility` | 0–0.6                                          |
| `initialStockDays` | 0–60 days                                      |
| `unitRevenue`      | $1–$10,000                                     |
| `unitCost`         | $0.01 through `unitRevenue`                    |
| `holdingCost`      | $0–$100 per warehouse unit per day             |
| `seed`             | Integer 0–4,294,967,295                        |
| `trials`           | Integer 1–500                                  |

## Verification and limitations

The test suite verifies exact seeded replay, policy-independent demand streams,
zero-severity equivalence, strict imports, zero-based horizon boundaries,
nonnegative finite states, supplier and inland delays, charged buffer inventory,
reaction delays, contrasting policy winners, qualifying recovery windows,
extreme supported inputs, and these conservation identities:

```text
opening warehouse + opening pipeline + newly produced units
  = fulfilled units + closing warehouse + closing pipeline

requested units = fulfilled units + lost units

previous warehouse + received units - fulfilled units = current warehouse
```

`simulateTrial()` exposes a detailed audit ledger for inspection and tests.
Floating-point quantities are checked with small numeric tolerances.

The model omits multiple products, multiple warehouses, production scheduling,
container constraints, supplier financial failure, substitution, perishability,
returns, damage, emissions, correlated uncertainty, a replenishment controller,
customs, weather, weekends, live capacity, demand forecasting, and price changes.
It is useful for explaining delayed effects, inventory conservation, simulation
uncertainty, and tradeoffs. It has not been calibrated or validated against real
logistics data. Use real operational data and specialist review before making
real sourcing or routing decisions.
