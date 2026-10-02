import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO,
  POLICIES,
  PRESETS,
  runExperiment,
  simulateTrial,
  validateScenario,
} from './index';
import type { Scenario } from './types';

const scenario = (changes: Partial<Scenario> = {}): Scenario => ({
  ...DEFAULT_SCENARIO,
  trials: 12,
  ...changes,
});

describe('the scenario import boundary', () => {
  it('accepts all shipped presets and returns a separate object', () => {
    for (const preset of PRESETS) {
      expect(validateScenario(preset.scenario)).toEqual(preset.scenario);
      expect(validateScenario(preset.scenario)).not.toBe(preset.scenario);
    }
  });

  it.each([
    null,
    [],
    'scenario',
    {},
    { ...DEFAULT_SCENARIO, version: 2 },
    { ...DEFAULT_SCENARIO, surprise: 1 },
    { ...DEFAULT_SCENARIO, severity: '0.5' },
    { ...DEFAULT_SCENARIO, severity: Infinity },
    { ...DEFAULT_SCENARIO, dailyDemand: NaN },
    { ...DEFAULT_SCENARIO, name: '' },
    { ...DEFAULT_SCENARIO, name: 'bad\nname' },
    { ...DEFAULT_SCENARIO, name: 'x'.repeat(101) },
    { ...DEFAULT_SCENARIO, disruption: 'alien' },
    { ...DEFAULT_SCENARIO, startDay: -1 },
    { ...DEFAULT_SCENARIO, duration: 77 },
    { ...DEFAULT_SCENARIO, horizon: 10000 },
    { ...DEFAULT_SCENARIO, trials: 501 },
    { ...DEFAULT_SCENARIO, seed: 1.5 },
    { ...DEFAULT_SCENARIO, seed: -1 },
    { ...DEFAULT_SCENARIO, unitCost: 100 },
    { ...DEFAULT_SCENARIO, holdingCost: -1 },
    { ...DEFAULT_SCENARIO, demandVolatility: 1 },
  ])('rejects malformed or unbounded inputs (%#)', (input) => {
    expect(() => validateScenario(input)).toThrow(Error);
  });

  it('requires own fields and rejects dangerous JSON keys without changing prototypes', () => {
    expect(() => validateScenario(Object.create(DEFAULT_SCENARIO))).toThrow(
      'Missing scenario field',
    );
    const input: unknown = JSON.parse(
      JSON.stringify(DEFAULT_SCENARIO).replace(
        '"version":1',
        '"__proto__":{"polluted":true},"version":1',
      ),
    );
    expect(() => validateScenario(input)).toThrow('Unknown scenario field');
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });

  it('accepts inclusive boundary values and disallows an event beyond the horizon', () => {
    expect(
      validateScenario(scenario({ horizon: 30, startDay: 29, duration: 1, trials: 1, seed: 0 })),
    ).toBeDefined();
    expect(
      validateScenario(
        scenario({ horizon: 180, startDay: 0, duration: 180, trials: 500, seed: 0xffff_ffff }),
      ),
    ).toBeDefined();
    expect(() => validateScenario(scenario({ horizon: 30, startDay: 29, duration: 2 }))).toThrow(
      'duration',
    );
  });
});

describe('reproducibility and independent random streams', () => {
  it('replays every output exactly and never changes caller input', () => {
    const input = Object.freeze(scenario());
    const before = JSON.stringify(input);
    expect(runExperiment(input)).toEqual(runExperiment(input));
    expect(JSON.stringify(input)).toBe(before);
  });

  it('uses identical demand draws across all four policies', () => {
    const result = runExperiment(scenario({ disruption: 'demand', severity: 0.8 }));
    const common = result.policies[0].sample.map((day) => day.demand);
    for (const policy of result.policies)
      expect(policy.sample.map((day) => day.demand)).toEqual(common);
  });

  it('uses matching demand and baseline travel draws when a different seed is replayed', () => {
    const first = simulateTrial(scenario({ seed: 1 }), 'baseline');
    const second = simulateTrial(scenario({ seed: 2 }), 'baseline');
    expect(first.sample.map((day) => day.demand)).not.toEqual(
      second.sample.map((day) => day.demand),
    );
    expect(first.sample).not.toEqual(second.sample);
    expect(simulateTrial(scenario({ seed: 1 }), 'baseline')).toEqual(first);
    expect(simulateTrial(scenario({ seed: 1 }), 'baseline', 1).sample).not.toEqual(first.sample);
  });

  it('makes zero severity exactly equivalent to no event for every policy', () => {
    for (const policy of POLICIES) {
      const quiet = simulateTrial(scenario({ disruption: 'none' }), policy.id);
      for (const disruption of ['port', 'supplier', 'demand'] as const) {
        expect(simulateTrial(scenario({ disruption, severity: 0 }), policy.id)).toEqual(quiet);
      }
    }
  });
});

describe('physical and financial conservation', () => {
  for (const policy of POLICIES) {
    it(`conserves stock and demand under ${policy.id}`, () => {
      for (const disruption of ['port', 'supplier', 'demand'] as const) {
        const result = simulateTrial(
          scenario({ disruption, severity: 1, demandVolatility: 0.6 }),
          policy.id,
          3,
        );
        expect(Math.abs(result.audit.conservationError)).toBeLessThan(1e-6);
        expect(result.audit.fulfilledUnits + result.audit.lostUnits).toBeCloseTo(
          result.audit.demandUnits,
          6,
        );
        let priorInventory = result.audit.initialInventory;
        for (const day of result.sample) {
          expect(priorInventory + day.received - day.fulfilled).toBeCloseTo(day.inventory, 6);
          expect(day.fulfilled + day.lost).toBeCloseTo(day.demand, 6);
          for (const value of Object.values(day)) expect(Number.isFinite(value)).toBe(true);
          expect(day.inventory).toBeGreaterThanOrEqual(0);
          expect(day.inTransit).toBeGreaterThanOrEqual(0);
          expect(day.serviceLevel).toBeGreaterThanOrEqual(0);
          expect(day.serviceLevel).toBeLessThanOrEqual(1);
          priorInventory = day.inventory;
        }
        expect(result.totalCost).toBeCloseTo(
          result.procurementCost + result.transportCost + result.holdingCost + result.lostMargin,
          6,
        );
        expect(result.lostRevenue).toBeCloseTo(
          result.audit.lostUnits * DEFAULT_SCENARIO.unitRevenue,
          6,
        );
        expect(result.lostMargin).toBeCloseTo(
          result.audit.lostUnits * (DEFAULT_SCENARIO.unitRevenue - DEFAULT_SCENARIO.unitCost),
          6,
        );
      }
    });
  }

  it('charges for extra buffer stock and its freight even when nothing goes wrong', () => {
    const quiet = scenario({ disruption: 'none', demandVolatility: 0 });
    const baseline = simulateTrial(quiet, 'baseline');
    const buffer = simulateTrial(quiet, 'buffer');
    expect(buffer.audit.initialInventory - baseline.audit.initialInventory).toBe(
      10 * quiet.dailyDemand,
    );
    expect(buffer.audit.procuredUnits).toBe(baseline.audit.procuredUnits);
    expect(buffer.procurementCost).toBeGreaterThan(baseline.procurementCost);
    expect(buffer.transportCost).toBeGreaterThan(baseline.transportCost);
    expect(buffer.holdingCost).toBeGreaterThan(baseline.holdingCost);
    expect(buffer.totalCost).toBeGreaterThan(baseline.totalCost);
    expect(baseline.audit.initialInTransit).toBeGreaterThan(quiet.dailyDemand * 20);
  });

  it('does not charge procurement for goods that a closed supplier never produces', () => {
    const quiet = simulateTrial(scenario({ disruption: 'none' }), 'baseline');
    const stopped = simulateTrial(scenario({ disruption: 'supplier', severity: 1 }), 'baseline');
    const missing = DEFAULT_SCENARIO.duration * DEFAULT_SCENARIO.dailyDemand * 0.65;
    expect(quiet.audit.procuredUnits - stopped.audit.procuredUnits).toBeCloseTo(missing, 6);
    expect(quiet.procurementCost - stopped.procurementCost).toBeCloseTo(
      missing * DEFAULT_SCENARIO.unitCost,
      6,
    );
  });
});

describe('cause, timing, and strategy tradeoffs', () => {
  it('makes a longer, complete LA shutdown more damaging than a mild slowdown', () => {
    const mild = simulateTrial(scenario({ duration: 10, severity: 0.2 }), 'baseline');
    const severe = simulateTrial(scenario({ duration: 35, severity: 1 }), 'baseline');
    expect(severe.serviceLevel).toBeLessThan(mild.serviceLevel);
    expect(severe.lostRevenue).toBeGreaterThan(mild.lostRevenue);
  });

  it('preserves the supplier-to-warehouse delay instead of destroying existing cargo', () => {
    const quiet = simulateTrial(scenario({ disruption: 'none' }), 'baseline');
    const stopped = simulateTrial(scenario({ disruption: 'supplier', severity: 1 }), 'baseline');
    for (let day = 0; day < DEFAULT_SCENARIO.startDay + 20; day++) {
      expect(stopped.sample[day].received).toBe(quiet.sample[day].received);
      expect(stopped.sample[day].inventory).toBe(quiet.sample[day].inventory);
    }
    expect(stopped.audit.receivedUnits).toBeLessThan(quiet.audit.receivedUnits);
  });

  it('retains four days of inland delivery after a port shock', () => {
    const input = scenario({ startDay: 0, severity: 1 });
    const quiet = simulateTrial({ ...input, disruption: 'none' }, 'baseline');
    const closed = simulateTrial(input, 'baseline');
    expect(closed.sample.slice(0, 4).map((day) => day.received)).toEqual(
      quiet.sample.slice(0, 4).map((day) => day.received),
    );
    expect(closed.sample[4].received).toBeLessThan(quiet.sample[4].received);
  });

  it('makes emergency sourcing reactive and limits rerouting to port events', () => {
    const baseline = simulateTrial(scenario(), 'baseline');
    const alternate = simulateTrial(scenario(), 'reroute');
    expect(alternate.sample.slice(0, DEFAULT_SCENARIO.startDay + 3)).toEqual(
      baseline.sample.slice(0, DEFAULT_SCENARIO.startDay + 3),
    );
    expect(alternate.audit.reroutedUnits).toBeGreaterThan(0);
    expect(alternate.transportCost).toBeGreaterThan(baseline.transportCost);
    expect(alternate.serviceLevel).toBeGreaterThan(baseline.serviceLevel);
    const supplier = scenario({ disruption: 'supplier' });
    expect(simulateTrial(supplier, 'reroute')).toEqual(simulateTrial(supplier, 'baseline'));
    const diverse = simulateTrial(scenario(), 'diversify');
    expect(diverse.sample.slice(0, DEFAULT_SCENARIO.startDay + 5)).toEqual(
      baseline.sample.slice(0, DEFAULT_SCENARIO.startDay + 5),
    );
    expect(diverse.audit.unitsBySource.mexico).toBeGreaterThan(baseline.audit.unitsBySource.mexico);
  });

  it('demonstrates multiple best-cost policies instead of an always-winning upgrade', () => {
    const winners = PRESETS.map(
      (preset) => runExperiment({ ...preset.scenario, trials: 16 }).bestPolicy,
    );
    expect(new Set(winners).size).toBeGreaterThanOrEqual(3);
    expect(winners[3]).toBe('baseline');
  });

  it('reports recovery only with a complete qualifying postevent seven-day window', () => {
    const input = scenario();
    for (const policy of POLICIES) {
      const trial = simulateTrial(input, policy.id);
      if (trial.recoveryDay === null) continue;
      expect(trial.recoveryDay).toBeGreaterThanOrEqual(input.startDay + input.duration);
      const window = trial.sample.slice(trial.recoveryDay, trial.recoveryDay + 7);
      expect(window).toHaveLength(7);
      expect(window.every((day) => day.serviceLevel >= 0.95)).toBe(true);
      expect(
        window.reduce((sum, day) => sum + day.fulfilled, 0) /
          window.reduce((sum, day) => sum + day.demand, 0),
      ).toBeGreaterThanOrEqual(0.98);
    }
    expect(
      simulateTrial(scenario({ startDay: 70, duration: 20 }), 'buffer').recoveryDay,
    ).toBeNull();
  });
});

describe('bounded, interpretable output', () => {
  it('covers exactly the configured zero-based horizon and orders quantiles', () => {
    const input = scenario({ horizon: 30, startDay: 29, duration: 1, trials: 1 });
    const result = runExperiment(input);
    expect(result.policies).toHaveLength(4);
    for (const policy of result.policies) {
      expect(policy.sample).toHaveLength(30);
      expect(policy.inventoryBand).toHaveLength(30);
      expect(policy.sample.map((day) => day.day)).toEqual(
        Array.from({ length: 30 }, (_, day) => day),
      );
      expect(policy.inventoryBand.map((day) => day.day)).toEqual(
        policy.sample.map((day) => day.day),
      );
      for (const point of policy.inventoryBand) {
        expect(point.p10).toBeLessThanOrEqual(point.p50);
        expect(point.p50).toBeLessThanOrEqual(point.p90);
        expect(point.p50).toBe(policy.sample[point.day].inventory);
      }
    }
  });

  it('stays finite with the largest supported costs, demand, volatility, and a full-horizon shock', () => {
    const input = scenario({
      horizon: 180,
      startDay: 0,
      duration: 180,
      severity: 1,
      dailyDemand: 10000,
      demandVolatility: 0.6,
      initialStockDays: 60,
      unitRevenue: 10000,
      unitCost: 9999,
      holdingCost: 100,
      seed: 0xffff_ffff,
      trials: 1,
    });
    for (const policy of runExperiment(input).policies) {
      expect(Number.isFinite(policy.totalCost)).toBe(true);
      expect(policy.serviceLevel).toBeGreaterThanOrEqual(0);
      expect(policy.serviceLevel).toBeLessThanOrEqual(1);
      expect(policy.recoveryDay).toBeNull();
    }
    expect(Math.abs(simulateTrial(input, 'reroute').audit.conservationError)).toBeLessThan(0.001);
  });

  it('ranks by mean modeled cost and separates sample paths from ensemble bands', () => {
    const input = scenario();
    const result = runExperiment(input);
    const best = result.policies.find((policy) => policy.policy === result.bestPolicy)!;
    expect(best.totalCost).toBe(Math.min(...result.policies.map((policy) => policy.totalCost)));
    for (const policy of result.policies) {
      expect(policy.sample).toEqual(simulateTrial(input, policy.policy, 0).sample);
      expect(policy.serviceBand.p10).toBeLessThanOrEqual(policy.serviceBand.p50);
      expect(policy.serviceBand.p50).toBeLessThanOrEqual(policy.serviceBand.p90);
    }
  });
});
