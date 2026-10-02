import { POLICIES, validateScenario } from '../simulation';
import { createAtlasPlan, rankCell, summarizeAtlas } from '../simulation/atlas';
import type { AtlasResult } from '../simulation/atlas';
import type { Scenario } from '../simulation/types';
import { MAX_SCENARIO_BYTES } from './scenario';
import { dollars, percent } from './format';

export interface AtlasManifest {
  kind: 'ripple-atlas';
  version: 1;
  atlasVersion: string;
  modelVersion: string;
  baseScenario: Scenario;
  durations: number[];
  severities: number[];
  trialsPerCell: number;
  target: number;
}

function validateTarget(target: unknown): asserts target is number {
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 0 || target > 1)
    throw new Error('Atlas target must be a finite number between 0 and 1.');
}

export function validateAtlasManifest(input: unknown): AtlasManifest {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('An atlas manifest must be a JSON object.');
  const value = input as Record<string, unknown>;
  const keys = [
    'kind',
    'version',
    'atlasVersion',
    'modelVersion',
    'baseScenario',
    'durations',
    'severities',
    'trialsPerCell',
    'target',
  ];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    throw new Error(
      'Atlas manifest fields are missing or unsupported. Import a file exported by RIPPLE.',
    );
  if (value.kind !== 'ripple-atlas' || value.version !== 1)
    throw new Error('Unsupported atlas manifest format or version.');
  const plan = createAtlasPlan(value.baseScenario as Scenario);
  if (value.atlasVersion !== plan.atlasVersion || value.modelVersion !== plan.modelVersion)
    throw new Error(
      'This atlas requires a different model or atlas version. Use the release that exported it.',
    );
  if (
    value.trialsPerCell !== plan.trialsPerCell ||
    JSON.stringify(value.durations) !== JSON.stringify(plan.durations) ||
    JSON.stringify(value.severities) !== JSON.stringify(plan.severities)
  )
    throw new Error(
      'Atlas axes or trial count do not match this release. Import an unmodified atlas manifest.',
    );
  validateTarget(value.target);
  return {
    kind: 'ripple-atlas',
    version: 1,
    atlasVersion: plan.atlasVersion,
    modelVersion: plan.modelVersion,
    baseScenario: plan.baseScenario,
    durations: [...plan.durations],
    severities: [...plan.severities],
    trialsPerCell: plan.trialsPerCell,
    target: value.target,
  };
}

export function atlasManifest(result: AtlasResult, target: number): AtlasManifest {
  return validateAtlasManifest({
    kind: 'ripple-atlas',
    version: 1,
    atlasVersion: result.atlasVersion,
    modelVersion: result.modelVersion,
    baseScenario: result.baseScenario,
    durations: result.durations,
    severities: result.severities,
    trialsPerCell: result.trialsPerCell,
    target,
  });
}

export function parseAtlasManifest(text: string): AtlasManifest {
  if (new TextEncoder().encode(text).length > MAX_SCENARIO_BYTES)
    throw new Error('Atlas manifests must be under 16 KB.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid JSON atlas manifest.');
  }
  return validateAtlasManifest(input);
}

export function encodeAtlas(manifest: AtlasManifest): string {
  const bytes = new TextEncoder().encode(JSON.stringify(validateAtlasManifest(manifest)));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodeAtlas(encoded: string): AtlasManifest {
  if (encoded.length > MAX_SCENARIO_BYTES * 1.4) throw new Error('The atlas link is too long.');
  try {
    return parseAtlasManifest(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (char) =>
          char.charCodeAt(0),
        ),
      ),
    );
  } catch (error) {
    throw new Error(
      `This atlas link could not be loaded. ${error instanceof Error ? error.message : 'Try another link.'}`,
    );
  }
}

function completeResult(result: AtlasResult) {
  atlasManifest(result, 0);
  const plan = createAtlasPlan(result.baseScenario);
  if (
    result.totalCells !== plan.totalCells ||
    result.cells.length !== plan.totalCells ||
    new Set(result.cells.map((cell) => cell.id)).size !== plan.totalCells
  )
    throw new Error('Finish the resilience scan before exporting results.');
  const expectedIds = new Set(
    plan.durations.flatMap((duration) =>
      plan.severities.map((severity) => `d${duration}-s${Math.round(severity * 100)}`),
    ),
  );
  for (const cell of result.cells) {
    const expectedId = `d${cell.duration}-s${Math.round(cell.severity * 100)}`;
    if (
      cell.id !== expectedId ||
      !expectedIds.delete(expectedId) ||
      !plan.durations.includes(cell.duration) ||
      !plan.severities.includes(cell.severity)
    )
      throw new Error('Atlas evidence contains invalid or repeated coordinates. Rebuild the scan.');
    const expected = {
      ...plan.baseScenario,
      duration: cell.duration,
      severity: cell.severity,
      trials: plan.trialsPerCell,
    };
    const actual = validateScenario(cell.scenario);
    if ((Object.keys(expected) as (keyof Scenario)[]).some((key) => expected[key] !== actual[key]))
      throw new Error('Atlas case inputs do not match the recorded scan. Rebuild the scan.');
  }
}

export function atlasCSV(result: AtlasResult, target: number): string {
  completeResult(result);
  validateTarget(target);
  const rows = [
    'case_id,duration_days,severity,policy,mean_service_level,service_p10,service_p90,total_cost_usd,procurement_cost_usd,transport_cost_usd,holding_cost_usd,lost_margin_usd,lost_revenue_usd,target_mean_service,meets_target,selected,tied_for_lowest_eligible_cost,seed,trials,model_version,atlas_version,scenario_version,disruption,start_day_zero_based,horizon_days,daily_demand,demand_volatility,initial_stock_days,unit_revenue_usd,unit_cost_usd,holding_cost_per_unit_day_usd',
  ];
  for (const cell of result.cells) {
    const rank = rankCell(cell, target);
    for (const policy of cell.policies)
      rows.push(
        [
          cell.id,
          cell.duration,
          cell.severity,
          policy.policy,
          policy.serviceLevel,
          policy.serviceBand.p10,
          policy.serviceBand.p90,
          policy.totalCost,
          policy.procurementCost,
          policy.transportCost,
          policy.holdingCost,
          policy.lostMargin,
          policy.lostRevenue,
          target,
          rank.eligible.includes(policy.policy),
          rank.winner === policy.policy,
          rank.tied.length > 1 && rank.tied.includes(policy.policy),
          cell.scenario.seed,
          cell.scenario.trials,
          result.modelVersion,
          result.atlasVersion,
          cell.scenario.version,
          cell.scenario.disruption,
          cell.scenario.startDay,
          cell.scenario.horizon,
          cell.scenario.dailyDemand,
          cell.scenario.demandVolatility,
          cell.scenario.initialStockDays,
          cell.scenario.unitRevenue,
          cell.scenario.unitCost,
          cell.scenario.holdingCost,
        ].join(','),
      );
  }
  return rows.join('\r\n');
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const name = (id: string | null) =>
  POLICIES.find((policy) => policy.id === id)?.name ?? 'None meets target';
const colors = {
  baseline: '#cbd9d3',
  buffer: '#e4c981',
  reroute: '#9dceb9',
  diversify: '#e5af90',
  none: '#e9e8e1',
};

export function atlasBriefHTML(result: AtlasResult, target: number): string {
  completeResult(result);
  validateTarget(target);
  const manifest = atlasManifest(result, target);
  const summary = summarizeAtlas(result.cells, target);
  const table = [...result.severities]
    .reverse()
    .map(
      (severity) =>
        `<tr><th>${percent(severity)}</th>${result.durations
          .map((duration) => {
            const cell = result.cells.find(
              (item) => item.severity === severity && item.duration === duration,
            )!;
            const rank = rankCell(cell, target);
            return `<td style="background:${colors[rank.winner ?? 'none']}">${escape(name(rank.winner))}${rank.tied.length > 1 ? ' (exact tie)' : ''}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  const evidence = result.cells
    .map((cell) => {
      const rank = rankCell(cell, target);
      return cell.policies
        .map(
          (policy) =>
            `<tr><td>${cell.duration}d / ${percent(cell.severity)}</td><td>${escape(name(policy.policy))}</td><td>${percent(policy.serviceLevel)}</td><td>${percent(policy.serviceBand.p10)}–${percent(policy.serviceBand.p90)}</td><td>${dollars(policy.totalCost, false)}</td><td>${rank.eligible.includes(policy.policy) ? 'Meets target' : 'Below target'}${rank.winner === policy.policy ? ' · selected' : ''}${rank.tied.includes(policy.policy) && rank.tied.length > 1 ? ' · exact tie' : ''}</td></tr>`,
        )
        .join('');
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>RIPPLE resilience atlas | ${escape(result.baseScenario.name)}</title><style>body{margin:0;background:#f4f3ec;color:#173739;font:15px/1.65 Georgia,serif;padding:5vw}main{max-width:1100px;margin:auto}h1{font-size:48px;letter-spacing:-1.5px;line-height:1.12}h2{margin-top:36px;font-size:24px}small,th{font:11px/1.6 monospace}table{width:100%;border-collapse:collapse;font:11px/1.5 sans-serif}td,th{padding:12px 8px;border:1px solid #b8c7b6;text-align:left}th{background:#e7ecdf}.scroll{overflow-x:auto}.callout{padding:22px;background:#deebcf;border-left:4px solid #3c725c}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;font:11px/1.6 monospace}@media print{body{padding:0;background:white}h1{font-size:34px}tr{break-inside:avoid}.scroll{overflow:visible}}</style></head><body><main><small>RIPPLE / RESILIENCE ATLAS / MODEL ${escape(result.modelVersion)} / ATLAS ${escape(result.atlasVersion)}</small><h1>Where does your plan<br>stop holding up?</h1><p>${escape(result.baseScenario.name)} · ${result.cells.length} sampled cases · ${result.trialsPerCell} trials per strategy per case · seed ${result.baseScenario.seed}</p><div class="callout">Target: at least <strong>${percent(target)} mean demand fulfilled</strong> across each simulated horizon. At least one strategy qualifies in <strong>${summary.qualifyingCells} of ${result.cells.length} tested cases</strong>. This count is not a probability.</div><h2>The decision surface</h2><p>Columns vary disruption duration. Rows vary severity. A cell selects the cheapest eligible strategy using unrounded mean fulfillment and mean modeled cost. Exact cost ties use the documented policy order. “None meets target” is a result, not missing data.</p><div class="scroll"><table><thead><tr><th>Severity / days</th>${result.durations.map((duration) => `<th>${duration} days</th>`).join('')}</tr></thead><tbody>${table}</tbody></table></div><h2>Evidence for every strategy</h2><p>Intervals are the 10th–90th percentile of simulated service levels, not confidence bounds on mean service. Eligibility uses the unrounded mean, so displayed rounded values may appear equal at a boundary. Export CSV for full numerical precision.</p><div class="scroll"><table><thead><tr><th>Case</th><th>Strategy</th><th>Mean fulfilled</th><th>10th–90th percentile</th><th>Total cost (USD)</th><th>Decision</th></tr></thead><tbody>${evidence}</tbody></table></div><h2>Assumptions and limits</h2><p>Only duration and severity vary. Other model inputs remain fixed. Every policy and cell shares the same seed and trial indices; demand levels can change under a demand surge. The sampled cases are not an estimated distribution of future events. There is no interpolation between cells, and no guarantee of meeting the target in every trial or every day.</p><p>Total modeled cost is procurement + freight + holding + lost contribution margin. The synthetic single-product model has pooled inventory, lost sales, simplified routes, and no terminal salvage credit. This analysis does not establish real-world predictive accuracy.</p><h2>Reproduce the atlas</h2><p>Save this manifest as JSON and import it in RIPPLE. The importer requires the same supported model and atlas versions. <a href="https://github.com/relaywright/ripple">Source and model documentation</a>.</p><pre>${escape(JSON.stringify(manifest, null, 2))}</pre><p><small>Built by relaywright with AI. Open-source educational software. MIT licensed.</small></p></main></body></html>`;
}
