import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO } from '../simulation';
import { createAtlasPlan, rankCell, runAtlasCell } from '../simulation/atlas';
import type { AtlasResult } from '../simulation/atlas';
import {
  atlasBriefHTML,
  atlasCSV,
  atlasManifest,
  decodeAtlas,
  encodeAtlas,
  parseAtlasManifest,
  validateAtlasManifest,
} from './atlas-export';
import { MAX_SCENARIO_BYTES } from './scenario';

const plan = createAtlasPlan({
  ...DEFAULT_SCENARIO,
  name: '港口 / México 🧭 & "inspect"',
  horizon: 30,
  startDay: 29,
  duration: 1,
});
const result: AtlasResult = {
  ...plan,
  cells: Array.from({ length: plan.totalCells }, (_, index) => runAtlasCell(plan, index)),
};
const target = 0.950005;
const manifest = atlasManifest(result, target);

function readCSV(input: AtlasResult, minimum: number): Record<string, string>[] {
  const [header, ...rows] = atlasCSV(input, minimum).split('\r\n');
  const columns = header.split(',');
  return rows.map((row) => {
    const fields = row.split(',');
    expect(fields).toHaveLength(columns.length);
    return Object.fromEntries(columns.map((column, index) => [column, fields[index]]));
  });
}

function rename(input: AtlasResult, name: string): AtlasResult {
  return {
    ...input,
    baseScenario: { ...input.baseScenario, name },
    cells: input.cells.map((cell) => ({ ...cell, scenario: { ...cell.scenario, name } })),
  };
}

function rankingFixture(): AtlasResult {
  // Deliberately fabricated compact metrics exercise exact threshold and tie
  // semantics while retaining valid plan coordinates and cost conservation.
  const rows = [
    { services: [0.950004, target, 0.97, 0.98], costs: [10, 40, 20, 20] },
    { services: [0.94, target, 0.97, 0.99], costs: [10, 40, 20, 30] },
    { services: [0.8, 0.9, 0.9, 0.9], costs: [10, 20, 30, 40] },
  ];
  return {
    ...result,
    cells: result.cells.map((cell, index) => {
      const row = rows[index];
      if (!row) return cell;
      return {
        ...cell,
        policies: cell.policies.map((policy, policyIndex) => ({
          ...policy,
          serviceLevel: row.services[policyIndex],
          serviceBand: {
            p10: row.services[policyIndex],
            p50: row.services[policyIndex],
            p90: row.services[policyIndex],
          },
          totalCost: row.costs[policyIndex],
          procurementCost: row.costs[policyIndex],
          transportCost: 0,
          holdingCost: 0,
          lostMargin: 0,
        })),
      };
    }),
  };
}

describe('versioned reproducible atlas manifests', () => {
  it('round-trips Unicode inputs and an exact target through JSON and URL-safe links', () => {
    const before = JSON.stringify(manifest);
    expect(parseAtlasManifest(before)).toEqual(manifest);
    const encoded = encodeAtlas(manifest);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');
    expect(decodeAtlas(encoded)).toEqual(manifest);
    const url = new URL(`https://ripple.example/#atlas=${encoded}`);
    expect(decodeAtlas(url.hash.slice('#atlas='.length))).toEqual(manifest);
    expect(decodeAtlas(encoded).target).toBe(target);
    expect(JSON.stringify(manifest)).toBe(before);
    expect(manifest.baseScenario.trials).toBe(120);
    expect(manifest.trialsPerCell).toBe(30);
  });

  it('rejects unsupported kinds, versions, axes, and trial budgets', () => {
    for (const patch of [
      { kind: 'ripple-scenario' },
      { version: 2 },
      { version: '1' },
      { atlasVersion: '2.0.0' },
      { modelVersion: '2.0.0' },
      { durations: [1, 1] },
      { durations: [7] },
      { severities: [0, 0.2, 0.4, 0.6, 0.8] },
      { severities: [0, 0.2, 0.4, 0.6, 0.8, 0.999] },
      { trialsPerCell: 120 },
      { trialsPerCell: '30' },
    ]) {
      expect(() => validateAtlasManifest({ ...manifest, ...patch })).toThrow(Error);
    }
  });

  it('requires exact own fields and a valid core scenario', () => {
    expect(() => validateAtlasManifest({ ...manifest, unexpected: true })).toThrow('fields');
    const missing = { ...manifest } as Record<string, unknown>;
    delete missing.target;
    expect(() => validateAtlasManifest(missing)).toThrow('fields');
    expect(() => validateAtlasManifest(Object.create(manifest))).toThrow('fields');
    expect(() =>
      validateAtlasManifest({
        ...manifest,
        baseScenario: { ...manifest.baseScenario, surprise: true },
      }),
    ).toThrow('Unknown scenario field');
    expect(() =>
      validateAtlasManifest({
        ...manifest,
        baseScenario: { ...manifest.baseScenario, version: 2 },
      }),
    ).toThrow('version');
    expect(() =>
      validateAtlasManifest({
        ...manifest,
        baseScenario: { ...manifest.baseScenario, disruption: 'none' },
      }),
    ).toThrow('Choose a port');
    const dangerous: unknown = JSON.parse(
      JSON.stringify(manifest).replace('"kind":', '"__proto__":{"polluted":true},"kind":'),
    );
    expect(() => validateAtlasManifest(dangerous)).toThrow('fields');
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });

  it.each([NaN, Infinity, -0.1, 1.01, '0.95', null])(
    'rejects invalid targets without rounding or coercion (%s)',
    (minimum) => {
      expect(() => validateAtlasManifest({ ...manifest, target: minimum })).toThrow('target');
    },
  );

  it('accepts inclusive target bounds and returns independent canonical arrays', () => {
    expect(validateAtlasManifest({ ...manifest, target: 0 }).target).toBe(0);
    expect(validateAtlasManifest({ ...manifest, target: 1 }).target).toBe(1);
    const copy = validateAtlasManifest(manifest);
    expect(copy).toEqual(manifest);
    expect(copy.baseScenario).not.toBe(manifest.baseScenario);
    expect(copy.durations).not.toBe(manifest.durations);
    expect(copy.severities).not.toBe(manifest.severities);
  });
});

describe('bounded atlas transport', () => {
  it('measures UTF-8 bytes rather than JavaScript character count', () => {
    const text = JSON.stringify({
      ...manifest,
      baseScenario: { ...manifest.baseScenario, name: 'é'.repeat(9000) },
    });
    expect(text.length).toBeLessThan(MAX_SCENARIO_BYTES);
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(MAX_SCENARIO_BYTES);
    expect(() => parseAtlasManifest(text)).toThrow('16 KB');
  });

  it('enforces the exact byte boundary and both encoded and decoded link limits', () => {
    const json = JSON.stringify(manifest);
    const padded = json + ' '.repeat(MAX_SCENARIO_BYTES - new TextEncoder().encode(json).length);
    expect(parseAtlasManifest(padded)).toEqual(manifest);
    expect(() => parseAtlasManifest(`${padded} `)).toThrow('16 KB');
    expect(() => decodeAtlas('A'.repeat(Math.floor(MAX_SCENARIO_BYTES * 1.4) + 1))).toThrow(
      'too long',
    );
    const oversized = btoa(String.fromCharCode(...new TextEncoder().encode(`${padded} `)));
    expect(oversized.length).toBeLessThan(MAX_SCENARIO_BYTES * 1.4);
    expect(() => decodeAtlas(oversized)).toThrow('16 KB');
  });

  it.each(['', '{', 'null', '[]', 'true', '"atlas"'])(
    'rejects malformed or wrong-shape JSON (%s)',
    (text) => {
      expect(() => parseAtlasManifest(text)).toThrow(Error);
    },
  );

  it.each([
    '!',
    '%',
    'a',
    '====',
    '💥',
    btoa('{'),
    btoa('null'),
    btoa(String.fromCharCode(0xc3, 0x28)),
  ])('rejects malformed encodings and invalid UTF-8 (%s)', (text) => {
    expect(() => decodeAtlas(text)).toThrow('atlas link could not be loaded');
  });

  it('does not allow link encoding to bypass manifest validation', () => {
    expect(() => encodeAtlas({ ...manifest, target: NaN })).toThrow('target');
    expect(() =>
      decodeAtlas(
        btoa(JSON.stringify({ ...manifest, version: 2, baseScenario: DEFAULT_SCENARIO })),
      ),
    ).toThrow(Error);
  });
});

describe('complete, full-precision CSV evidence', () => {
  it('exports every policy in every sampled cell and preserves the complete cost ledger', () => {
    const rows = readCSV(result, target);
    expect(rows).toHaveLength(plan.totalCells * 4);
    for (const row of rows) {
      const cell = result.cells.find((cell) => cell.id === row.case_id)!;
      const policy = cell.policies.find((policy) => policy.policy === row.policy)!;
      const ranking = rankCell(cell, target);
      expect(Number(row.duration_days)).toBe(cell.duration);
      expect(Number(row.severity)).toBe(cell.severity);
      expect(Number(row.mean_service_level)).toBe(policy.serviceLevel);
      expect(Number(row.service_p10)).toBe(policy.serviceBand.p10);
      expect(Number(row.service_p90)).toBe(policy.serviceBand.p90);
      expect(Number(row.total_cost_usd)).toBe(policy.totalCost);
      expect(Number(row.total_cost_usd)).toBeCloseTo(
        Number(row.procurement_cost_usd) +
          Number(row.transport_cost_usd) +
          Number(row.holding_cost_usd) +
          Number(row.lost_margin_usd),
        6,
      );
      expect(Number(row.lost_revenue_usd)).toBe(policy.lostRevenue);
      expect(Number(row.target_mean_service)).toBe(target);
      expect(row.meets_target).toBe(String(policy.serviceLevel >= target));
      expect(row.selected).toBe(String(ranking.winner === policy.policy));
      expect(Number(row.seed)).toBe(plan.baseScenario.seed);
      expect(Number(row.trials)).toBe(30);
      expect(row.model_version).toBe(plan.modelVersion);
      expect(row.atlas_version).toBe(plan.atlasVersion);
      expect(Number(row.scenario_version)).toBe(cell.scenario.version);
      expect(row.disruption).toBe(cell.scenario.disruption);
      expect(Number(row.start_day_zero_based)).toBe(cell.scenario.startDay);
      expect(Number(row.horizon_days)).toBe(cell.scenario.horizon);
      expect(Number(row.daily_demand)).toBe(cell.scenario.dailyDemand);
      expect(Number(row.demand_volatility)).toBe(cell.scenario.demandVolatility);
      expect(Number(row.initial_stock_days)).toBe(cell.scenario.initialStockDays);
      expect(Number(row.unit_revenue_usd)).toBe(cell.scenario.unitRevenue);
      expect(Number(row.unit_cost_usd)).toBe(cell.scenario.unitCost);
      expect(Number(row.holding_cost_per_unit_day_usd)).toBe(cell.scenario.holdingCost);
    }
  });

  it('uses unrounded eligibility and distinguishes shared minima from unique winners', () => {
    const rows = readCSV(rankingFixture(), target);
    const first = rows.filter((row) => row.case_id === result.cells[0].id);
    expect(first.find((row) => row.policy === 'baseline')?.meets_target).toBe('false');
    expect(first.find((row) => row.policy === 'buffer')?.meets_target).toBe('true');
    expect(first.find((row) => row.policy === 'reroute')?.selected).toBe('true');
    expect(
      first.filter((row) => row.tied_for_lowest_eligible_cost === 'true').map((row) => row.policy),
    ).toEqual(['reroute', 'diversify']);
    const second = rows.filter((row) => row.case_id === result.cells[1].id);
    expect(second.find((row) => row.policy === 'reroute')?.selected).toBe('true');
    expect(second.every((row) => row.tied_for_lowest_eligible_cost === 'false')).toBe(true);
    const third = rows.filter((row) => row.case_id === result.cells[2].id);
    expect(
      third.every(
        (row) =>
          row.meets_target === 'false' &&
          row.selected === 'false' &&
          row.tied_for_lowest_eligible_cost === 'false',
      ),
    ).toBe(true);
  });

  it('does not place imported names into formula-capable CSV cells', () => {
    expect(atlasCSV(rename(result, '=HYPERLINK("https://example.invalid", "click")'), target)).toBe(
      atlasCSV(result, target),
    );
  });

  it('refuses incomplete results and duplicated IDs instead of exporting partial evidence', () => {
    const incomplete = { ...result, cells: result.cells.slice(1) };
    const duplicated = {
      ...result,
      cells: [result.cells[0], result.cells[0], ...result.cells.slice(2)],
    };
    for (const input of [incomplete, duplicated]) {
      expect(() => atlasCSV(input, target)).toThrow('Finish');
      expect(() => atlasBriefHTML(input, target)).toThrow('Finish');
    }
  });

  it('rejects unsupported result metadata and wrong coordinates before exporting', () => {
    const badResults: AtlasResult[] = [
      { ...result, modelVersion: '2.0.0' },
      { ...result, atlasVersion: '2.0.0' },
      { ...result, trialsPerCell: 500 },
      { ...result, durations: [7] },
      { ...result, cells: [{ ...result.cells[0], severity: 0.1 }, ...result.cells.slice(1)] },
      {
        ...result,
        cells: [
          { ...result.cells[0], scenario: { ...result.cells[0].scenario, seed: 1 } },
          ...result.cells.slice(1),
        ],
      },
    ];
    for (const input of badResults) {
      expect(() => atlasCSV(input, target)).toThrow(Error);
      expect(() => atlasBriefHTML(input, target)).toThrow(Error);
    }
  });
});

describe('safe standalone atlas briefs', () => {
  it('escapes hostile imported names in title, body, and manifest', () => {
    const name = '</title></pre><script>alert("x")</script> & \' 🧭';
    const html = atlasBriefHTML(rename(result, name), target);
    expect(html).not.toContain(name);
    expect(html).not.toMatch(/<(script|iframe|img|object|embed)\b/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
    expect(html).toContain('🧭');
    expect(html.match(/<pre>/g)).toHaveLength(1);
    expect(html.match(/<\/pre>/g)).toHaveLength(1);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<\/title>/g)).toHaveLength(1);
  });

  it('embeds the exact replay manifest and reconstructs the same plan and cell', () => {
    const html = atlasBriefHTML(result, target);
    const escapedJSON = html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1];
    expect(escapedJSON).toBeDefined();
    const text = escapedJSON!.replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_match, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]!,
    );
    const imported = parseAtlasManifest(text);
    expect(imported).toEqual(manifest);
    const replayPlan = createAtlasPlan(imported.baseScenario);
    expect(replayPlan).toEqual(plan);
    expect(runAtlasCell(replayPlan, 0)).toEqual(result.cells[0]);
    expect(html).toContain('same supported model and atlas versions');
  });

  it('includes a restrictive CSP and needs no external scripts, fonts, or styles', () => {
    const html = atlasBriefHTML(result, target);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('@media print');
    expect(html).not.toMatch(/<(script|link|iframe|img|object|embed|form)\b/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });

  it('states the distinction between grid coverage, uncertainty, and service guarantees', () => {
    const html = atlasBriefHTML(rankingFixture(), target);
    expect(html).toContain('This count is not a probability');
    expect(html).toContain('None meets target');
    expect(html).toContain('using unrounded mean fulfillment');
    expect(html).toContain('not confidence bounds on mean service');
    expect(html).toContain('no guarantee of meeting the target in every trial or every day');
    expect(html).toContain('demand levels can change under a demand surge');
    expect(html).toContain('no terminal salvage credit');
    expect(html).toContain('does not establish real-world predictive accuracy');
  });

  it('keeps outputs deterministic and does not mutate the evidence', () => {
    const before = JSON.stringify(result);
    expect(encodeAtlas(manifest)).toBe(encodeAtlas(manifest));
    expect(atlasCSV(result, target)).toBe(atlasCSV(result, target));
    expect(atlasBriefHTML(result, target)).toBe(atlasBriefHTML(result, target));
    expect(JSON.stringify(result)).toBe(before);
  });
});
