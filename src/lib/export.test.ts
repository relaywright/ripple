import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, runExperiment } from '../simulation';
import type { ExperimentResult } from '../simulation/types';
import { reportHTML, resultsCSV } from './export';
import { parseScenario } from './scenario';

const result = runExperiment({ ...DEFAULT_SCENARIO, trials: 5 });
const unescapeHTMLText = (text: string): string =>
  text.replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_match, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]!,
  );

function csvRecords(experiment: ExperimentResult): Record<string, string>[] {
  const [header, ...rows] = resultsCSV(experiment).split('\r\n');
  const columns = header.split(',');
  return rows.map((row) => {
    const fields = row.split(',');
    expect(fields).toHaveLength(columns.length);
    return Object.fromEntries(columns.map((column, index) => [column, fields[index]]));
  });
}

describe('inspectable results CSV', () => {
  it('exports all four policies without silently rounding the ledger', () => {
    const records = csvRecords(result);
    expect(records).toHaveLength(4);
    expect(records.map((row) => row.policy)).toEqual(
      result.policies.map((policy) => policy.policy),
    );
    for (const row of records) {
      const policy = result.policies.find((policy) => policy.policy === row.policy)!;
      const ledgerSum =
        Number(row.procurement_cost_usd) +
        Number(row.transport_cost_usd) +
        Number(row.holding_cost_usd) +
        Number(row.lost_margin_usd);
      expect(Number(row.total_cost_usd)).toBeCloseTo(ledgerSum, 6);
      expect(Number(row.total_cost_usd)).toBe(policy.totalCost);
      expect(Number(row.lost_revenue_usd)).toBe(policy.lostRevenue);
      expect(Number(row.service_level)).toBe(policy.serviceLevel);
      expect(Number(row.service_p10)).toBe(policy.serviceBand.p10);
      expect(Number(row.service_p90)).toBe(policy.serviceBand.p90);
      expect(Number(row.stockout_days)).toBe(policy.stockoutDays);
      expect(Number(row.seed)).toBe(result.scenario.seed);
      expect(Number(row.trials)).toBe(result.scenario.trials);
      expect(row.model_version).toBe(result.modelVersion);
    }
  });

  it('leaves nonapplicable recovery empty rather than claiming Day 0', () => {
    const quiet = runExperiment({ ...DEFAULT_SCENARIO, disruption: 'none', trials: 1 });
    expect(quiet.policies.every((policy) => policy.recoveryDay === null)).toBe(true);
    for (const row of csvRecords(quiet)) expect(row.recovery_day).toBe('');
  });

  it('does not interpolate an imported name as a spreadsheet formula', () => {
    const malicious = {
      ...result,
      scenario: { ...result.scenario, name: '=HYPERLINK("https://example.invalid", "click")' },
    };
    const csv = resultsCSV(malicious);
    expect(csv).not.toContain('HYPERLINK');
    expect(csv).not.toContain('example.invalid');
    expect(csv).toBe(resultsCSV(result));
  });

  it('produces deterministic, timestamp-free output', () => {
    expect(resultsCSV(result)).toBe(resultsCSV(runExperiment(result.scenario)));
    expect(resultsCSV(result)).not.toMatch(/NaN|Infinity|undefined|null/);
  });
});

describe('self-contained decision brief', () => {
  it('escapes a hostile scenario name in the title, heading, and embedded JSON', () => {
    const name = '</title></pre><script>alert("x")</script> & \' 🧭';
    const hostile = { ...result, scenario: { ...result.scenario, name } };
    const html = reportHTML(hostile);
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

  it('embeds sufficient exact inputs to replay all outputs, including UTF-8 names', () => {
    const original = runExperiment({
      ...DEFAULT_SCENARIO,
      trials: 3,
      name: '港口 🧭 México & <inspect>',
      severity: 0.615,
      dailyDemand: 125.75,
      seed: 4294967295,
    });
    const html = reportHTML(original);
    const encodedJSON = html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1];
    expect(encodedJSON).toBeDefined();
    const imported = parseScenario(unescapeHTMLText(encodedJSON!));
    expect(imported).toEqual(original.scenario);
    expect(runExperiment(imported)).toEqual(original);
    expect(html).toContain(`Model ${original.modelVersion}`);
    expect(html).toContain('Exact replay requires the same model version');
  });

  it('constrains active content and requires no external styles, fonts, or scripts', () => {
    const html = reportHTML(result);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).not.toMatch(/<(script|link|iframe|img|object|embed|form)\b/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('@media print');
  });

  it('distinguishes model variation, foregone sales, and conditional ranking', () => {
    const html = reportHTML(result);
    expect(html).toContain('lowest mean modeled total cost');
    expect(html).toContain('not a real-world forecast or recommendation');
    expect(html).toContain('Lost revenue is shown separately and is not counted again as a cost');
    expect(html).toContain('simulated variation, not confidence in the model');
    expect(html).toContain('All policies see the same seeded demand inputs');
    expect(html).toContain('liquidation value of closing inventory');
  });

  it('does not mutate the result and is deterministic for an identical experiment', () => {
    const before = JSON.stringify(result);
    expect(reportHTML(result)).toBe(reportHTML(runExperiment(result.scenario)));
    expect(JSON.stringify(result)).toBe(before);
  });
});
