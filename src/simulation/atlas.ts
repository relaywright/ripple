import { MODEL_VERSION, POLICIES, runExperiment, validateScenario } from './index';
import type { PolicyId, PolicyResult, Scenario } from './types';

/** The sweep/selection contract version, independent of the unchanged core model. */
export const ATLAS_VERSION = '1.0.0';
export const ATLAS_TRIALS = 30;
const DURATION_CANDIDATES = [1, 7, 14, 21, 35, 60] as const;
const SEVERITY_CANDIDATES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

export interface AtlasPlan {
  baseScenario: Scenario;
  durations: number[];
  severities: number[];
  trialsPerCell: number;
  totalCells: number;
  modelVersion: string;
  atlasVersion: string;
}

export type AtlasPolicyMetrics = Omit<PolicyResult, 'sample' | 'inventoryBand'>;

export interface AtlasCell {
  id: string;
  duration: number;
  severity: number;
  /** Exact inputs, including the 30-trial budget, for a matching lab replay. */
  scenario: Scenario;
  policies: AtlasPolicyMetrics[];
}

export interface AtlasResult extends AtlasPlan {
  cells: AtlasCell[];
}

export interface CellRanking {
  winner: PolicyId | null;
  /** Eligible policy IDs in the fixed policy display order. */
  eligible: PolicyId[];
  /** All exact-cost co-winners, including the winner itself. */
  tied: PolicyId[];
  /** The next eligible policy by cost, including an exact-cost co-winner. */
  runnerUp: PolicyId | null;
  /** Runner-up minus winner cost; zero for an exact tie; null without a runner-up. */
  costGap: number | null;
}

export interface AtlasPolicySummary {
  policy: PolicyId;
  eligibleCells: number;
  /** Unweighted fraction of tested cells meeting the mean service target. Not probability. */
  coverage: number;
  /** Canonical winners after stable tie-breaking; these counts match map colors. */
  winningCells: number;
  /** All co-lowest eligible cells. Counts across policies can exceed total cells. */
  coWinningCells: number;
  /** Cells sharing the lowest eligible cost with at least one other policy. */
  tiedWinningCells: number;
  /** Unweighted mean across grid cells, not an expected real-world expense. */
  meanCost: number | null;
  minimumService: number | null;
}

export interface AtlasSummary {
  totalCells: number;
  qualifyingCells: number;
  noQualifyingCells: number;
  policies: AtlasPolicySummary[];
  /** All policies with the largest nonzero eligible-cell count. */
  coverageLeaders: PolicyId[];
  fullyCovered: PolicyId[];
}

export interface AtlasWorkerRequest {
  type: 'run';
  requestId: string;
  scenario: Scenario;
}

export type AtlasWorkerMessage =
  | { type: 'progress'; requestId: string; completed: number; total: number; cell: AtlasCell }
  | { type: 'done'; requestId: string; result: AtlasResult }
  | { type: 'error'; requestId: string; message: string };

/** Build at most 36 distinct coordinates. The core scenario contract is unchanged. */
export function createAtlasPlan(input: Scenario): AtlasPlan {
  const baseScenario = validateScenario(input);
  if (baseScenario.disruption === 'none') {
    throw new Error('Choose a port, supplier, or demand disruption to build a resilience atlas.');
  }
  const remainingDays = baseScenario.horizon - baseScenario.startDay;
  const durations = [...new Set(DURATION_CANDIDATES.map((days) => Math.min(days, remainingDays)))];
  const severities = [...SEVERITY_CANDIDATES];
  return {
    baseScenario,
    durations,
    severities,
    trialsPerCell: ATLAS_TRIALS,
    totalCells: durations.length * severities.length,
    modelVersion: MODEL_VERSION,
    atlasVersion: ATLAS_VERSION,
  };
}

function validatePlan(plan: AtlasPlan): AtlasPlan {
  const expected = createAtlasPlan(plan.baseScenario);
  if (
    plan.trialsPerCell !== expected.trialsPerCell ||
    plan.totalCells !== expected.totalCells ||
    plan.modelVersion !== expected.modelVersion ||
    plan.atlasVersion !== expected.atlasVersion ||
    JSON.stringify(plan.durations) !== JSON.stringify(expected.durations) ||
    JSON.stringify(plan.severities) !== JSON.stringify(expected.severities)
  ) {
    throw new Error(
      'This atlas plan is invalid or belongs to another atlas version. Rebuild the atlas.',
    );
  }
  return expected;
}

/** Duration-major order: durationIndex * severities.length + severityIndex. */
export function runAtlasCell(input: AtlasPlan, index: number): AtlasCell {
  const plan = validatePlan(input);
  if (!Number.isInteger(index) || index < 0 || index >= plan.totalCells) {
    throw new Error(`Atlas cell index must be a whole number from 0 to ${plan.totalCells - 1}.`);
  }
  const duration = plan.durations[Math.floor(index / plan.severities.length)];
  const severity = plan.severities[index % plan.severities.length];
  const scenario: Scenario = {
    ...plan.baseScenario,
    duration,
    severity,
    trials: plan.trialsPerCell,
  };
  const result = runExperiment(scenario);
  return {
    id: `d${duration}-s${Math.round(severity * 100)}`,
    duration,
    severity,
    scenario: result.scenario,
    policies: result.policies.map((policy) => ({
      policy: policy.policy,
      serviceLevel: policy.serviceLevel,
      lostRevenue: policy.lostRevenue,
      totalCost: policy.totalCost,
      transportCost: policy.transportCost,
      holdingCost: policy.holdingCost,
      procurementCost: policy.procurementCost,
      lostMargin: policy.lostMargin,
      recoveryDay: policy.recoveryDay,
      stockoutDays: policy.stockoutDays,
      serviceBand: { ...policy.serviceBand },
    })),
  };
}

function validateTarget(target: number): void {
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 0 || target > 1) {
    throw new Error('The minimum mean fulfillment target must be a finite number from 0 to 1.');
  }
}

function validateMetrics(cell: AtlasCell): void {
  if (
    !Array.isArray(cell.policies) ||
    cell.policies.length !== POLICIES.length ||
    new Set(cell.policies.map((policy) => policy.policy)).size !== POLICIES.length
  ) {
    throw new Error('An atlas cell must contain exactly one result for each of the four policies.');
  }
  for (const policy of cell.policies) {
    if (!POLICIES.some((item) => item.id === policy.policy)) {
      throw new Error('An atlas cell contains an unknown policy.');
    }
    if (
      !Number.isFinite(policy.serviceLevel) ||
      policy.serviceLevel < 0 ||
      policy.serviceLevel > 1 ||
      !Number.isFinite(policy.totalCost) ||
      policy.totalCost < 0
    ) {
      throw new Error(
        'An atlas cell contains an invalid fulfillment rate or modeled cost. Rebuild the atlas.',
      );
    }
  }
}

/**
 * Qualify using the unrounded mean, then minimize exact modeled cost.
 * Exact ties follow core policy order: baseline, buffer, reroute, diversify.
 * No rounding tolerance, statistical significance, or probability is implied.
 */
export function rankCell(cell: AtlasCell, target: number): CellRanking {
  validateTarget(target);
  validateMetrics(cell);
  const ordered = POLICIES.map((item) =>
    cell.policies.find((policy) => policy.policy === item.id)!,
  );
  const eligible = ordered.filter((policy) => policy.serviceLevel >= target);
  const ranked = [...eligible].sort((a, b) => a.totalCost - b.totalCost);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  return {
    winner: winner?.policy ?? null,
    eligible: eligible.map((policy) => policy.policy),
    tied: winner
      ? ranked
          .filter((policy) => policy.totalCost === winner.totalCost)
          .map((policy) => policy.policy)
      : [],
    runnerUp: runnerUp?.policy ?? null,
    costGap: winner && runnerUp ? Math.max(0, runnerUp.totalCost - winner.totalCost) : null,
  };
}

/** All cells have equal descriptive weight. This is grid coverage, not event likelihood. */
export function summarizeAtlas(cells: readonly AtlasCell[], target: number): AtlasSummary {
  validateTarget(target);
  const coordinates = cells.map((cell) => `${cell.duration}:${cell.severity}`);
  if (new Set(coordinates).size !== cells.length) {
    throw new Error('Atlas summaries require distinct duration and severity cells.');
  }
  const rankings = cells.map((cell) => rankCell(cell, target));
  const policies = POLICIES.map(({ id }): AtlasPolicySummary => {
    const metrics = cells.map((cell) => cell.policies.find((policy) => policy.policy === id)!);
    const eligibleCells = rankings.filter((rank) => rank.eligible.includes(id)).length;
    return {
      policy: id,
      eligibleCells,
      coverage: cells.length ? eligibleCells / cells.length : 0,
      winningCells: rankings.filter((rank) => rank.winner === id).length,
      coWinningCells: rankings.filter((rank) => rank.tied.includes(id)).length,
      tiedWinningCells: rankings.filter((rank) => rank.tied.length > 1 && rank.tied.includes(id))
        .length,
      meanCost: metrics.length
        ? metrics.reduce((sum, metric) => sum + metric.totalCost, 0) / metrics.length
        : null,
      minimumService: metrics.length
        ? Math.min(...metrics.map((metric) => metric.serviceLevel))
        : null,
    };
  });
  const bestCoverage = Math.max(0, ...policies.map((policy) => policy.eligibleCells));
  const qualifyingCells = rankings.filter((rank) => rank.winner !== null).length;
  return {
    totalCells: cells.length,
    qualifyingCells,
    noQualifyingCells: cells.length - qualifyingCells,
    policies,
    coverageLeaders:
      bestCoverage > 0
        ? policies
            .filter((policy) => policy.eligibleCells === bestCoverage)
            .map((policy) => policy.policy)
        : [],
    fullyCovered: cells.length
      ? policies
          .filter((policy) => policy.eligibleCells === cells.length)
          .map((policy) => policy.policy)
      : [],
  };
}
