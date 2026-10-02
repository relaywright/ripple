export type Disruption = 'port' | 'supplier' | 'demand' | 'none';
export type PolicyId = 'baseline' | 'buffer' | 'reroute' | 'diversify';
export interface Scenario {
  version: 1;
  name: string;
  disruption: Disruption;
  startDay: number;
  duration: number;
  severity: number;
  horizon: number;
  dailyDemand: number;
  demandVolatility: number;
  initialStockDays: number;
  unitRevenue: number;
  unitCost: number;
  holdingCost: number;
  seed: number;
  trials: number;
}
export interface Policy {
  id: PolicyId;
  name: string;
  shortName: string;
  description: string;
  color: string;
}
export interface DaySnapshot {
  day: number;
  demand: number;
  fulfilled: number;
  lost: number;
  inventory: number;
  inTransit: number;
  received: number;
  serviceLevel: number;
  cumulativeLostRevenue: number;
}
export interface QuantilePoint {
  day: number;
  p10: number;
  p50: number;
  p90: number;
}
export interface PolicyResult {
  policy: PolicyId;
  serviceLevel: number;
  lostRevenue: number;
  totalCost: number;
  transportCost: number;
  holdingCost: number;
  procurementCost: number;
  lostMargin: number;
  recoveryDay: number | null;
  stockoutDays: number;
  sample: DaySnapshot[];
  inventoryBand: QuantilePoint[];
  serviceBand: { p10: number; p50: number; p90: number };
}
export interface ExperimentResult {
  scenario: Scenario;
  policies: PolicyResult[];
  bestPolicy: PolicyId;
  modelVersion: string;
}
