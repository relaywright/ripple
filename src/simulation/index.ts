import type {
  DaySnapshot,
  ExperimentResult,
  Policy,
  PolicyId,
  PolicyResult,
  Scenario,
} from './types';

export type * from './types';

export const MODEL_VERSION = '1.0.0';
export const POLICIES: Policy[] = [
  {
    id: 'baseline',
    name: 'Stay the course',
    shortName: 'Baseline',
    description: 'Keep the original sourcing mix and inventory.',
    color: '#8fa1b5',
  },
  {
    id: 'buffer',
    name: 'Build a buffer',
    shortName: 'Buffer',
    description: 'Buy 10 extra days of stock before the disruption.',
    color: '#e6b96a',
  },
  {
    id: 'reroute',
    name: 'Change the route',
    shortName: 'Reroute',
    description:
      'After 3 days, divert eligible ocean cargo to Newark. Add 6 transit days and freight cost.',
    color: '#77cbb9',
  },
  {
    id: 'diversify',
    name: 'Diversify supply',
    shortName: 'Diversify',
    description: 'After 5 days, shift new orders toward Mexico, with higher purchasing costs.',
    color: '#ad9ef5',
  },
];

export const DEFAULT_SCENARIO: Scenario = {
  version: 1,
  name: 'The port goes quiet',
  disruption: 'port',
  startDay: 14,
  duration: 21,
  severity: 0.85,
  horizon: 90,
  dailyDemand: 120,
  demandVolatility: 0.15,
  initialStockDays: 6,
  unitRevenue: 85,
  unitCost: 32,
  holdingCost: 0.03,
  seed: 71429,
  trials: 120,
};

export const PRESETS: {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  scenario: Scenario;
}[] = [
  {
    id: 'port',
    title: 'The port goes quiet',
    subtitle: '21 days · 85% less throughput',
    description:
      'A severe Los Angeles slowdown traps ocean freight. See how inventory and alternate routes buy time.',
    scenario: { ...DEFAULT_SCENARIO },
  },
  {
    id: 'supplier',
    title: 'One supplier stops',
    subtitle: '24 days · 90% less output',
    description:
      'Shenzhen production falls. Existing cargo keeps moving, hiding the shortage until the pipeline runs thin.',
    scenario: {
      ...DEFAULT_SCENARIO,
      name: 'One supplier stops',
      disruption: 'supplier',
      duration: 24,
      severity: 0.9,
      initialStockDays: 5,
      seed: 29104,
    },
  },
  {
    id: 'demand',
    title: 'Demand takes off',
    subtitle: '21 days · 75% more demand',
    description:
      'A sudden sales surge runs into production limits. Faster replenishment helps, but every extra unit has a cost.',
    scenario: {
      ...DEFAULT_SCENARIO,
      name: 'Demand takes off',
      disruption: 'demand',
      duration: 21,
      severity: 0.75,
      initialStockDays: 4,
      seed: 85427,
    },
  },
  {
    id: 'none',
    title: 'A quiet quarter',
    subtitle: 'No disruption · cost of readiness',
    description:
      'Explore the price of resilience when no shock arrives. Demand and travel times still vary.',
    scenario: {
      ...DEFAULT_SCENARIO,
      name: 'A quiet quarter',
      disruption: 'none',
      severity: 0,
      seed: 18361,
    },
  },
];

const SCENARIO_KEYS = new Set(Object.keys(DEFAULT_SCENARIO));
const DISRUPTIONS = new Set(['port', 'supplier', 'demand', 'none']);
const EPSILON = 1e-8;

/** Import boundary: returns a new, fully validated scenario, never coerces values. */
export function validateScenario(input: unknown): Scenario {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('A scenario must be a JSON object.');
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!SCENARIO_KEYS.has(key))
      throw new Error(`Unknown scenario field: ${key}. Import a RIPPLE scenario file.`);
  }
  for (const key of SCENARIO_KEYS)
    if (!Object.hasOwn(value, key)) throw new Error(`Missing scenario field: ${key}.`);
  if (value.version !== 1)
    throw new Error('Unsupported scenario version. This release accepts version 1.');
  if (
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    value.name.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(value.name)
  )
    throw new Error('Scenario name must contain 1–100 printable characters.');
  if (typeof value.disruption !== 'string' || !DISRUPTIONS.has(value.disruption))
    throw new Error('Disruption must be port, supplier, demand, or none.');
  const number = (field: string, minimum: number, maximum: number, integer = false): number => {
    const result = value[field];
    if (
      typeof result !== 'number' ||
      !Number.isFinite(result) ||
      result < minimum ||
      result > maximum ||
      (integer && !Number.isInteger(result))
    ) {
      throw new Error(
        `${field} must be ${integer ? 'a whole number' : 'a finite number'} from ${minimum} to ${maximum}.`,
      );
    }
    return result;
  };
  const horizon = number('horizon', 30, 180, true);
  const startDay = number('startDay', 0, horizon - 1, true);
  number('duration', 1, horizon - startDay, true);
  number('severity', 0, 1);
  number('dailyDemand', 10, 10_000);
  number('demandVolatility', 0, 0.6);
  number('initialStockDays', 0, 60);
  const revenue = number('unitRevenue', 1, 10_000);
  number('unitCost', 0.01, revenue);
  number('holdingCost', 0, 100);
  number('seed', 0, 0xffff_ffff, true);
  number('trials', 1, 500, true);
  return { ...value, name: value.name.trim() } as unknown as Scenario;
}

type RouteId = 'shenzhen' | 'vietnam' | 'mexico';
type Gateway = 'los-angeles' | 'newark' | 'houston';
interface Route {
  id: RouteId;
  lead: number;
  share: number;
  capacity: number;
  freight: number;
  purchaseMultiplier: number;
}
const ROUTES: readonly Route[] = [
  { id: 'shenzhen', lead: 22, share: 0.65, capacity: 0.75, freight: 2.4, purchaseMultiplier: 1 },
  { id: 'vietnam', lead: 25, share: 0.25, capacity: 0.3, freight: 2.7, purchaseMultiplier: 1.05 },
  { id: 'mexico', lead: 7, share: 0.1, capacity: 0.15, freight: 3.6, purchaseMultiplier: 1.22 },
];
const DIVERSIFIED_SHARES = [0.35, 0.2, 0.45] as const;
const DIVERSIFIED_CAPACITIES = [0.75, 0.3, 0.9] as const;
const DETOUR_DAYS = 6;
const DETOUR_FREIGHT = 4.8;
const INLAND_DAYS = 4;
const BUFFER_DAYS = 10;

interface Shipment {
  route: RouteId;
  gateway: Gateway;
  quantity: number;
  gateDay: number;
  warehouseDay: number | null;
}

export interface TrialAudit {
  initialInventory: number;
  initialInTransit: number;
  procuredUnits: number;
  receivedUnits: number;
  fulfilledUnits: number;
  lostUnits: number;
  demandUnits: number;
  endingInventory: number;
  endingInTransit: number;
  /** Should be within floating-point tolerance of zero. */
  conservationError: number;
  unitsBySource: Record<RouteId, number>;
  reroutedUnits: number;
}

export interface TrialResult {
  sample: DaySnapshot[];
  serviceLevel: number;
  lostRevenue: number;
  totalCost: number;
  transportCost: number;
  holdingCost: number;
  procurementCost: number;
  lostMargin: number;
  recoveryDay: number | null;
  stockoutDays: number;
  audit: TrialAudit;
}

// Counter-based streams make demand and route lead draws independent of policy branches.
function uniform(seed: number, trial: number, day: number, channel: number): number {
  let value =
    (seed ^
      Math.imul(trial + 1, 0x9e3779b1) ^
      Math.imul(day + 64, 0x85ebca6b) ^
      Math.imul(channel + 1, 0xc2b2ae35)) >>>
    0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function demandDraw(scenario: Scenario, trial: number, day: number): number {
  const u = Math.max(Number.EPSILON, uniform(scenario.seed, trial, day, 0));
  const z =
    Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform(scenario.seed, trial, day, 1));
  const active = day >= scenario.startDay && day < scenario.startDay + scenario.duration;
  const surge = scenario.disruption === 'demand' && active ? 1 + scenario.severity : 1;
  return Math.max(
    1,
    Math.round(scenario.dailyDemand * surge * Math.max(0.1, 1 + scenario.demandVolatility * z)),
  );
}

function leadDraw(
  scenario: Scenario,
  trial: number,
  departureDay: number,
  routeIndex: number,
): number {
  const u = uniform(scenario.seed, trial, departureDay, routeIndex + 10);
  const jitter =
    routeIndex === 2
      ? u < 0.2
        ? -1
        : u < 0.8
          ? 0
          : 1
      : u < 0.1
        ? -2
        : u < 0.3
          ? -1
          : u < 0.7
            ? 0
            : u < 0.9
              ? 1
              : 2;
  return ROUTES[routeIndex].lead + jitter;
}

function findRecovery(sample: DaySnapshot[], scenario: Scenario): number | null {
  if (scenario.disruption === 'none' || scenario.severity === 0) return null;
  const firstPostEventDay = scenario.startDay + scenario.duration;
  for (let day = firstPostEventDay; day <= scenario.horizon - 7; day++) {
    const window = sample.slice(day, day + 7);
    const totalDemand = window.reduce((total, snapshot) => total + snapshot.demand, 0);
    const served = window.reduce((total, snapshot) => total + snapshot.fulfilled, 0);
    if (window.every((snapshot) => snapshot.serviceLevel >= 0.95) && served / totalDemand >= 0.98)
      return day;
  }
  return null;
}

/** A single reproducible trajectory. Intended for model inspection and invariant tests. */
export function simulateTrial(scenarioInput: Scenario, policy: PolicyId, trial = 0): TrialResult {
  const scenario = validateScenario(scenarioInput);
  if (!POLICIES.some((item) => item.id === policy)) throw new Error('Unknown policy.');
  if (!Number.isInteger(trial) || trial < 0 || trial > 10_000)
    throw new Error('Trial index must be a whole number from 0 to 10000.');
  return simulateValidatedTrial(scenario, policy, trial);
}

function simulateValidatedTrial(scenario: Scenario, policy: PolicyId, trial: number): TrialResult {
  const { dailyDemand, unitCost } = scenario;
  const eventPresent = scenario.disruption !== 'none' && scenario.severity > 0;
  const initialInventory =
    (scenario.initialStockDays + (policy === 'buffer' ? BUFFER_DAYS : 0)) * dailyDemand;
  const averageInitialUnitCost = ROUTES.reduce(
    (sum, route) => sum + route.share * route.purchaseMultiplier * unitCost,
    0,
  );
  const averageInitialFreight = ROUTES.reduce((sum, route) => sum + route.share * route.freight, 0);
  let inventory = initialInventory;
  let procurementCost = initialInventory * averageInitialUnitCost;
  let transportCost = initialInventory * averageInitialFreight;
  let holdingCost = 0;
  let shipments: Shipment[] = [];
  let initialInTransit = 0;
  let procuredUnits = 0;
  let receivedUnits = 0;
  let fulfilledUnits = 0;
  let demandUnits = 0;
  let lostUnits = 0;
  let reroutedUnits = 0;
  let stockoutDays = 0;
  const unitsBySource: Record<RouteId, number> = { shenzhen: 0, vietnam: 0, mexico: 0 };
  const sample: DaySnapshot[] = [];

  const shipmentFor = (
    routeIndex: number,
    departure: number,
    quantity: number,
    diverted: boolean,
  ): Shipment => {
    const route = ROUTES[routeIndex];
    const arrival =
      departure + leadDraw(scenario, trial, departure, routeIndex) + (diverted ? DETOUR_DAYS : 0);
    const gateDay = routeIndex === 2 ? arrival : arrival - INLAND_DAYS;
    return {
      route: route.id,
      gateway: routeIndex === 2 ? 'houston' : diverted ? 'newark' : 'los-angeles',
      quantity,
      gateDay,
      warehouseDay: routeIndex === 2 || gateDay < 0 ? arrival : null,
    };
  };

  // Seed every departure cohort that can still be on the water/road at day 0.
  // Goods that passed their port before day 0 already have an inland arrival date.
  ROUTES.forEach((route, routeIndex) => {
    for (let departure = -route.lead - 2; departure < 0; departure++) {
      const shipment = shipmentFor(routeIndex, departure, dailyDemand * route.share, false);
      if (departure + leadDraw(scenario, trial, departure, routeIndex) < 0) continue;
      shipments.push(shipment);
      initialInTransit += shipment.quantity;
      procurementCost += shipment.quantity * unitCost * route.purchaseMultiplier;
      transportCost += shipment.quantity * route.freight;
    }
  });

  for (let day = 0; day < scenario.horizon; day++) {
    const eventActive =
      eventPresent && day >= scenario.startDay && day < scenario.startDay + scenario.duration;
    const diverting =
      policy === 'reroute' &&
      scenario.disruption === 'port' &&
      eventPresent &&
      day >= scenario.startDay + 3 &&
      day < scenario.startDay + scenario.duration;
    const diversified = policy === 'diversify' && eventPresent && day >= scenario.startDay + 5;

    if (diverting && day === scenario.startDay + 3) {
      for (const shipment of shipments) {
        if (
          shipment.gateway === 'los-angeles' &&
          shipment.warehouseDay === null &&
          shipment.gateDay > day
        ) {
          shipment.gateway = 'newark';
          shipment.gateDay += DETOUR_DAYS;
          transportCost += shipment.quantity * DETOUR_FREIGHT;
          reroutedUnits += shipment.quantity;
        }
      }
    }

    // Every policy observes the demand step after the same three-day planning delay.
    const demandPlan =
      scenario.disruption === 'demand' &&
      day >= scenario.startDay + 3 &&
      day < scenario.startDay + scenario.duration + 3
        ? dailyDemand * (1 + scenario.severity)
        : dailyDemand;
    ROUTES.forEach((route, routeIndex) => {
      const share = diversified ? DIVERSIFIED_SHARES[routeIndex] : route.share;
      const capacity =
        (diversified ? DIVERSIFIED_CAPACITIES[routeIndex] : route.capacity) * dailyDemand;
      const availability =
        eventActive && scenario.disruption === 'supplier' && routeIndex === 0
          ? 1 - scenario.severity
          : 1;
      const quantity = Math.min(demandPlan * share, capacity) * availability;
      if (quantity <= EPSILON) return;
      const diverted = diverting && routeIndex < 2;
      const shipment = shipmentFor(routeIndex, day, quantity, diverted);
      shipments.push(shipment);
      procuredUnits += quantity;
      unitsBySource[route.id] += quantity;
      procurementCost += quantity * unitCost * route.purchaseMultiplier;
      transportCost += quantity * (route.freight + (diverted ? DETOUR_FREIGHT : 0));
      if (diverted) reroutedUnits += quantity;
    });

    let portCapacity =
      dailyDemand *
      0.9 *
      1.25 *
      (eventActive && scenario.disruption === 'port' ? 1 - scenario.severity : 1);
    const inland: Shipment[] = [];
    // FIFO by actual gateway arrival; a disrupted cohort cannot jump the queue.
    shipments.sort((a, b) => a.gateDay - b.gateDay);
    for (const shipment of shipments) {
      if (shipment.warehouseDay !== null || shipment.gateDay > day) continue;
      if (shipment.gateway === 'newark') {
        shipment.warehouseDay = day + INLAND_DAYS;
        continue;
      }
      const cleared = Math.min(shipment.quantity, portCapacity);
      if (cleared <= EPSILON) continue;
      portCapacity -= cleared;
      shipment.quantity -= cleared;
      inland.push({ ...shipment, quantity: cleared, warehouseDay: day + INLAND_DAYS });
    }
    shipments.push(...inland);
    let received = 0;
    const pending: Shipment[] = [];
    for (const shipment of shipments) {
      if (shipment.quantity <= EPSILON) continue;
      if (shipment.warehouseDay !== null && shipment.warehouseDay <= day)
        received += shipment.quantity;
      else pending.push(shipment);
    }
    shipments = pending;
    inventory += received;
    receivedUnits += received;
    const demand = demandDraw(scenario, trial, day);
    const fulfilled = Math.min(inventory, demand);
    const lost = Math.max(0, demand - fulfilled);
    inventory = Math.max(0, inventory - fulfilled);
    demandUnits += demand;
    fulfilledUnits += fulfilled;
    lostUnits += lost;
    if (lost > EPSILON) stockoutDays++;
    holdingCost += inventory * scenario.holdingCost;
    sample.push({
      day,
      demand,
      fulfilled,
      lost,
      inventory,
      inTransit: shipments.reduce((sum, shipment) => sum + shipment.quantity, 0),
      received,
      serviceLevel: fulfilled / demand,
      cumulativeLostRevenue: lostUnits * scenario.unitRevenue,
    });
  }

  const endingInTransit = sample.at(-1)!.inTransit;
  const lostMargin = lostUnits * (scenario.unitRevenue - unitCost);
  return {
    sample,
    serviceLevel: fulfilledUnits / demandUnits,
    lostRevenue: lostUnits * scenario.unitRevenue,
    totalCost: procurementCost + transportCost + holdingCost + lostMargin,
    transportCost,
    holdingCost,
    procurementCost,
    lostMargin,
    recoveryDay: findRecovery(sample, scenario),
    stockoutDays,
    audit: {
      initialInventory,
      initialInTransit,
      procuredUnits,
      receivedUnits,
      fulfilledUnits,
      lostUnits,
      demandUnits,
      endingInventory: inventory,
      endingInTransit,
      conservationError:
        initialInventory +
        initialInTransit +
        procuredUnits -
        fulfilledUnits -
        inventory -
        endingInTransit,
      unitsBySource,
      reroutedUnits,
    },
  };
}

/** Linear interpolation between ordered observations; deterministic even for one trial. */
function quantile(sorted: number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

export function runExperiment(scenarioInput: Scenario): ExperimentResult {
  const scenario = validateScenario(scenarioInput);
  const policies: PolicyResult[] = POLICIES.map(({ id }) => {
    const trials = Array.from({ length: scenario.trials }, (_, trial) =>
      simulateValidatedTrial(scenario, id, trial),
    );
    const average = (select: (result: TrialResult) => number): number =>
      trials.reduce((sum, result) => sum + select(result), 0) / trials.length;
    const services = trials.map((trial) => trial.serviceLevel).sort((a, b) => a - b);
    // Never claim population recovery by silently dropping unrecovered trials.
    const recoveries = trials.map((trial) => trial.recoveryDay ?? Infinity).sort((a, b) => a - b);
    const medianRecovery = recoveries[Math.floor(recoveries.length / 2)];
    return {
      policy: id,
      serviceLevel: average((trial) => trial.serviceLevel),
      lostRevenue: average((trial) => trial.lostRevenue),
      totalCost: average((trial) => trial.totalCost),
      transportCost: average((trial) => trial.transportCost),
      holdingCost: average((trial) => trial.holdingCost),
      procurementCost: average((trial) => trial.procurementCost),
      lostMargin: average((trial) => trial.lostMargin),
      recoveryDay: Number.isFinite(medianRecovery) ? medianRecovery : null,
      stockoutDays: average((trial) => trial.stockoutDays),
      sample: trials[0].sample,
      inventoryBand: Array.from({ length: scenario.horizon }, (_, day) => {
        const stocks = trials.map((trial) => trial.sample[day].inventory).sort((a, b) => a - b);
        return {
          day,
          p10: quantile(stocks, 0.1),
          p50: quantile(stocks, 0.5),
          p90: quantile(stocks, 0.9),
        };
      }),
      serviceBand: {
        p10: quantile(services, 0.1),
        p50: quantile(services, 0.5),
        p90: quantile(services, 0.9),
      },
    };
  });
  return {
    scenario,
    policies,
    bestPolicy: policies.reduce((best, candidate) =>
      candidate.totalCost < best.totalCost ? candidate : best,
    ).policy,
    modelVersion: MODEL_VERSION,
  };
}
