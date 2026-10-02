import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCENARIO, MODEL_VERSION, POLICIES, runExperiment } from './index';
import {
  ATLAS_TRIALS,
  ATLAS_VERSION,
  createAtlasPlan,
  rankCell,
  runAtlasCell,
  summarizeAtlas,
} from './atlas';
import type { AtlasCell, AtlasWorkerMessage } from './atlas';

function fixtureCell(duration: number, services: number[], costs: number[]): AtlasCell {
  return {
    id: `d${duration}-s80`,
    duration,
    severity: 0.8,
    scenario: { ...DEFAULT_SCENARIO, duration, severity: 0.8, trials: ATLAS_TRIALS },
    policies: POLICIES.map(({ id }, index) => ({
      policy: id,
      serviceLevel: services[index],
      lostRevenue: 0,
      totalCost: costs[index],
      procurementCost: costs[index],
      transportCost: 0,
      holdingCost: 0,
      lostMargin: 0,
      recoveryDay: null,
      stockoutDays: 0,
      serviceBand: { p10: services[index], p50: services[index], p90: services[index] },
    })),
  };
}

describe('bounded reproducible atlas plans', () => {
  it('builds the intended lattice without changing the original scenario or trial setting', () => {
    const source = Object.freeze({ ...DEFAULT_SCENARIO, trials: 500 });
    const plan = createAtlasPlan(source);
    expect(plan.durations).toEqual([1, 7, 14, 21, 35, 60]);
    expect(plan.severities).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(plan.totalCells).toBe(36);
    expect(plan.trialsPerCell).toBe(30);
    expect(plan.baseScenario).toEqual(source);
    expect(plan.baseScenario).not.toBe(source);
    expect(plan.modelVersion).toBe(MODEL_VERSION);
    expect(plan.atlasVersion).toBe(ATLAS_VERSION);
  });

  it('caps and deduplicates durations when little of the horizon remains', () => {
    const oneDay = createAtlasPlan({ ...DEFAULT_SCENARIO, horizon: 30, startDay: 29, duration: 1 });
    expect(oneDay.durations).toEqual([1]);
    expect(oneDay.totalCells).toBe(6);
    const tenDays = createAtlasPlan({
      ...DEFAULT_SCENARIO,
      horizon: 30,
      startDay: 20,
      duration: 10,
    });
    expect(tenDays.durations).toEqual([1, 7, 10]);
    expect(tenDays.totalCells).toBe(18);
  });

  it('rejects none and invalid scenarios while allowing a zero-severity starting scenario', () => {
    expect(() => createAtlasPlan({ ...DEFAULT_SCENARIO, disruption: 'none' })).toThrow(
      'Choose a port, supplier, or demand',
    );
    expect(() => createAtlasPlan({ ...DEFAULT_SCENARIO, version: 2 } as never)).toThrow('version');
    expect(() => createAtlasPlan({ ...DEFAULT_SCENARIO, startDay: 90 })).toThrow('startDay');
    expect(createAtlasPlan({ ...DEFAULT_SCENARIO, severity: 0 }).severities).toContain(1);
  });

  it('rejects forged plans and invalid indices before doing model work', () => {
    const plan = createAtlasPlan(DEFAULT_SCENARIO);
    for (const index of [-1, 36, 0.5, NaN, Infinity])
      expect(() => runAtlasCell(plan, index)).toThrow('index');
    expect(() => runAtlasCell({ ...plan, trialsPerCell: 500 }, 0)).toThrow('plan');
    expect(() => runAtlasCell({ ...plan, durations: [180] }, 0)).toThrow('plan');
    expect(() => runAtlasCell({ ...plan, modelVersion: '2.0.0' }, 0)).toThrow('version');
    expect(() => runAtlasCell({ ...plan, atlasVersion: '2.0.0' }, 0)).toThrow('version');
  });
});

describe('reuse of the unchanged version-1 model', () => {
  it('matches a full lab run exactly while dropping only trajectories and inventory bands', () => {
    const plan = createAtlasPlan(DEFAULT_SCENARIO);
    const cell = runAtlasCell(plan, 22);
    expect(cell.id).toBe('d21-s80');
    expect(cell.duration).toBe(21);
    expect(cell.severity).toBe(0.8);
    expect(cell.scenario).toEqual({ ...DEFAULT_SCENARIO, duration: 21, severity: 0.8, trials: 30 });
    const full = runExperiment(cell.scenario);
    expect(cell.policies).toEqual(
      full.policies.map(({ sample: _sample, inventoryBand: _band, ...metrics }) => metrics),
    );
    expect(
      cell.policies.every(
        (policy) => !Object.hasOwn(policy, 'sample') && !Object.hasOwn(policy, 'inventoryBand'),
      ),
    ).toBe(true);
    expect(rankCell(cell, 0.95).winner).toBe('reroute');
    expect(rankCell(cell, 0.99).winner).toBe('buffer');
  });

  it('keeps established core version-1 outputs unchanged', () => {
    const before = runExperiment({ ...DEFAULT_SCENARIO, trials: 1 });
    expect(before.modelVersion).toBe('1.0.0');
    expect(before.bestPolicy).toBe('reroute');
    expect(
      before.policies.map((policy) => ({
        service: policy.serviceLevel,
        cost: policy.totalCost,
        recovery: policy.recoveryDay,
      })),
    ).toEqual([
      { service: 0.8906118044477808, cost: 568356.4399999994, recovery: 39 },
      { service: 1, cost: 550610.6249999992, recovery: 35 },
      { service: 0.9772684620437271, cost: 538341.434999999, recovery: 35 },
      { service: 0.9379046636013888, cost: 566681.3900000001, recovery: 39 },
    ]);
    runAtlasCell(createAtlasPlan(DEFAULT_SCENARIO), 0);
    expect(runExperiment({ ...DEFAULT_SCENARIO, trials: 1 })).toEqual(before);
  });

  it('replays deterministically and keeps the same base seed in every coordinate', () => {
    const plan = createAtlasPlan(DEFAULT_SCENARIO);
    const first = runAtlasCell(plan, 0);
    expect(first).toEqual(runAtlasCell(plan, 0));
    expect(runAtlasCell(plan, 35).scenario.seed).toBe(first.scenario.seed);
    expect(
      runAtlasCell(createAtlasPlan({ ...DEFAULT_SCENARIO, seed: 17 }), 0).policies,
    ).not.toEqual(first.policies);
  });

  it('shares underlying stochastic inputs so zero-severity duration controls agree exactly', () => {
    const plan = createAtlasPlan(DEFAULT_SCENARIO);
    expect(runAtlasCell(plan, 0).policies).toEqual(runAtlasCell(plan, 30).policies);
  });
});

describe('fulfillment-constrained cost ranking', () => {
  it('rejects the cheapest policy when it misses the unrounded target', () => {
    const cell = fixtureCell(7, [0.94999, 0.95, 0.97, 0.99], [10, 40, 25, 50]);
    const ranked = rankCell(cell, 0.95);
    expect(ranked.eligible).toEqual(['buffer', 'reroute', 'diversify']);
    expect(ranked.winner).toBe('reroute');
    expect(ranked.runnerUp).toBe('buffer');
    expect(ranked.costGap).toBe(15);
    expect(rankCell(cell, 0.94999).winner).toBe('baseline');
  });

  it('represents no qualifying policy explicitly and handles a single qualifier', () => {
    const cell = fixtureCell(7, [0.8, 0.9, 0.92, 0.94], [10, 20, 30, 40]);
    expect(rankCell(cell, 0.95)).toEqual({
      winner: null,
      eligible: [],
      tied: [],
      runnerUp: null,
      costGap: null,
    });
    expect(rankCell(cell, 0.94)).toEqual({
      winner: 'diversify',
      eligible: ['diversify'],
      tied: ['diversify'],
      runnerUp: null,
      costGap: null,
    });
  });

  it('uses stable policy order for exact ties and exposes every co-winner', () => {
    const cell = fixtureCell(7, [1, 1, 1, 1], [20, 40, 20, 20]);
    cell.policies.reverse();
    const ranked = rankCell(cell, 1);
    expect(ranked.winner).toBe('baseline');
    expect(ranked.tied).toEqual(['baseline', 'reroute', 'diversify']);
    expect(ranked.runnerUp).toBe('reroute');
    expect(ranked.costGap).toBe(0);
    const close = fixtureCell(7, [1, 1, 1, 1], [20, 20.0000001, 40, 50]);
    expect(rankCell(close, 1).tied).toEqual(['baseline']);
  });

  it.each([-1, 1.01, NaN, Infinity])('rejects invalid targets (%s)', (target) => {
    expect(() => rankCell(fixtureCell(7, [1, 1, 1, 1], [1, 2, 3, 4]), target)).toThrow('target');
  });

  it.each([NaN, Infinity, -1])(
    'does not turn an invalid modeled cost into a winning cell (%s)',
    (cost) => {
      expect(() => rankCell(fixtureCell(7, [1, 1, 1, 1], [cost, 2, 3, 4]), 0.95)).toThrow(
        'invalid',
      );
    },
  );

  it('rejects malformed policy collections and invalid service values', () => {
    const cell = fixtureCell(7, [1, 1, 1, 1], [1, 2, 3, 4]);
    expect(() => rankCell({ ...cell, policies: cell.policies.slice(1) }, 0.95)).toThrow(
      'four policies',
    );
    expect(() =>
      rankCell(
        { ...cell, policies: [cell.policies[0], cell.policies[0], ...cell.policies.slice(2)] },
        0.95,
      ),
    ).toThrow('four policies');
    expect(() => rankCell(fixtureCell(7, [NaN, 1, 1, 1], [1, 2, 3, 4]), 0.95)).toThrow('invalid');
    expect(() => rankCell(fixtureCell(7, [1.1, 1, 1, 1], [1, 2, 3, 4]), 0.95)).toThrow('invalid');
  });
});

describe('honest descriptive grid summaries', () => {
  it('counts every distinct cell once and separates coverage from lowest-cost wins', () => {
    const cells = [
      fixtureCell(1, [1, 1, 1, 1], [10, 20, 10, 30]),
      fixtureCell(7, [0.8, 1, 0.9, 1], [10, 20, 30, 15]),
      fixtureCell(14, [0.8, 0.9, 0.9, 0.9], [10, 20, 30, 40]),
    ];
    const summary = summarizeAtlas(cells, 0.95);
    expect(summary.totalCells).toBe(3);
    expect(summary.qualifyingCells).toBe(2);
    expect(summary.noQualifyingCells).toBe(1);
    expect(summary.coverageLeaders).toEqual(['buffer', 'diversify']);
    expect(summary.fullyCovered).toEqual([]);
    const baseline = summary.policies[0];
    expect(baseline.coverage).toBe(1 / 3);
    expect(baseline.winningCells).toBe(1);
    expect(baseline.coWinningCells).toBe(1);
    expect(baseline.tiedWinningCells).toBe(1);
    expect(baseline.minimumService).toBe(0.8);
    expect(baseline.meanCost).toBe(10);
    const reroute = summary.policies[2];
    expect(reroute.winningCells).toBe(0);
    expect(reroute.coWinningCells).toBe(1);
    expect(reroute.tiedWinningCells).toBe(1);
    expect(summary.policies.reduce((sum, policy) => sum + policy.winningCells, 0)).toBe(
      summary.qualifyingCells,
    );
  });

  it('has no fabricated leaders or numeric cost summaries for an empty or unqualified grid', () => {
    const empty = summarizeAtlas([], 0.95);
    expect(empty.coverageLeaders).toEqual([]);
    expect(empty.fullyCovered).toEqual([]);
    expect(
      empty.policies.every(
        (policy) =>
          policy.meanCost === null && policy.minimumService === null && policy.coverage === 0,
      ),
    ).toBe(true);
    const impossible = summarizeAtlas([fixtureCell(1, [0.8, 0.8, 0.8, 0.8], [1, 2, 3, 4])], 0.95);
    expect(impossible.coverageLeaders).toEqual([]);
    expect(impossible.qualifyingCells).toBe(0);
    expect(impossible.noQualifyingCells).toBe(1);
  });

  it('updates eligibility without rerunning, mutating, or reweighting the experiment', () => {
    const cells = [fixtureCell(1, [0.9, 0.96, 0.98, 1], [10, 20, 30, 40])];
    const before = JSON.stringify(cells);
    expect(summarizeAtlas(cells, 0.95).fullyCovered).toEqual(['buffer', 'reroute', 'diversify']);
    expect(summarizeAtlas(cells, 0.99).fullyCovered).toEqual(['diversify']);
    expect(JSON.stringify(cells)).toBe(before);
    expect(() => summarizeAtlas([cells[0], { ...cells[0], id: 'duplicate' }], 0.95)).toThrow(
      'distinct',
    );
  });
});

describe('incremental worker protocol', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a monotonic bounded progress stream and the same exact cell data on completion', async () => {
    const messages: AtlasWorkerMessage[] = [];
    const worker = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: AtlasWorkerMessage) => messages.push(message),
    };
    vi.stubGlobal('self', worker);
    vi.resetModules();
    await import('../atlas.worker');
    worker.onmessage!({
      data: {
        type: 'run',
        requestId: 'run-a',
        scenario: { ...DEFAULT_SCENARIO, horizon: 30, startDay: 29, duration: 1 },
      },
    });
    const progress = messages.filter((message) => message.type === 'progress');
    expect(progress.map((message) => message.completed)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(
      progress.every(
        (message) =>
          message.total === 6 &&
          message.requestId === 'run-a' &&
          message.cell.scenario.trials === 30,
      ),
    ).toBe(true);
    const done = messages.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') throw new Error('Expected worker completion');
    expect(done.result.cells).toEqual(progress.map((message) => message.cell));
    expect(done.result.totalCells).toBe(6);
    expect(messages.some((message) => message.type === 'error')).toBe(false);
  });

  it('returns a tagged error and no partial results for invalid requests', async () => {
    const messages: AtlasWorkerMessage[] = [];
    const worker = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: AtlasWorkerMessage) => messages.push(message),
    };
    vi.stubGlobal('self', worker);
    vi.resetModules();
    await import('../atlas.worker');
    worker.onmessage!({
      data: {
        type: 'run',
        requestId: 'run-invalid',
        scenario: { ...DEFAULT_SCENARIO, disruption: 'none' },
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'error', requestId: 'run-invalid' });
    worker.onmessage!({ data: null });
    expect(messages.at(-1)).toMatchObject({ type: 'error', requestId: '' });
  });
});
