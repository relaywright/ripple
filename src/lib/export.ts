import type { ExperimentResult } from '../simulation/types';
import { POLICIES } from '../simulation';
import { dollars, percent } from './format';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function resultsCSV(result: ExperimentResult): string {
  const rows = [
    'policy,service_level,service_p10,service_p90,lost_revenue_usd,total_cost_usd,procurement_cost_usd,transport_cost_usd,holding_cost_usd,lost_margin_usd,stockout_days,recovery_day,seed,trials,model_version',
  ];
  for (const p of result.policies)
    rows.push(
      [
        p.policy,
        p.serviceLevel,
        p.serviceBand.p10,
        p.serviceBand.p90,
        p.lostRevenue,
        p.totalCost,
        p.procurementCost,
        p.transportCost,
        p.holdingCost,
        p.lostMargin,
        p.stockoutDays,
        p.recoveryDay === null ? '' : p.recoveryDay + 1,
        result.scenario.seed,
        result.scenario.trials,
        result.modelVersion,
      ].join(','),
    );
  return rows.join('\r\n');
}
export function reportHTML(result: ExperimentResult): string {
  const best = result.policies.find((p) => p.policy === result.bestPolicy)!;
  const s = result.scenario;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>RIPPLE | ${escape(s.name)}</title><style>body{font:16px/1.6 Georgia,serif;color:#173739;background:#f4f3ec;margin:0;padding:6vw}main{max-width:1000px;margin:auto}h1{font-size:52px;line-height:1.1;letter-spacing:-2px}h2{margin-top:40px}small,th{font:12px/1.5 monospace;text-transform:uppercase}table{border-collapse:collapse;width:100%;font:14px/1.5 sans-serif}td,th{text-align:left;padding:14px 8px;border-bottom:1px solid #b9c6ba}.callout{background:#deedcf;padding:24px;border-left:4px solid #326459}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:24px;font-size:12px}@media print{body{padding:12px;background:white}h1{font-size:36px}tr{break-inside:avoid}}</style></head><body><main><small>RIPPLE / Decision brief / Model ${escape(result.modelVersion)}</small><h1>${escape(s.name)}</h1><p>A ${s.horizon}-day synthetic supply-chain experiment. ${s.trials} seeded trials per strategy. Seed ${s.seed}. All monetary values are USD.</p><div class="callout"><strong>${escape(POLICIES.find((p) => p.id === best.policy)!.name)}</strong> has the lowest mean modeled total cost: ${dollars(best.totalCost, false)}, with ${percent(best.serviceLevel)} of demand fulfilled. This ranking is conditional on the assumptions below; it is not a real-world forecast or recommendation.</div><h2>Compare the strategies</h2><table><thead><tr><th>Strategy</th><th>Demand fulfilled</th><th>10th–90th percentile</th><th>Lost revenue</th><th>Total cost</th></tr></thead><tbody>${result.policies.map((p) => `<tr><td>${escape(POLICIES.find((item) => item.id === p.policy)!.name)}</td><td>${percent(p.serviceLevel)}</td><td>${percent(p.serviceBand.p10)}–${percent(p.serviceBand.p90)}</td><td>${dollars(p.lostRevenue, false)}</td><td>${dollars(p.totalCost, false)}</td></tr>`).join('')}</tbody></table><h2>What the numbers mean</h2><p>Total cost includes procurement, freight, holding cost, and lost contribution margin. Lost revenue is shown separately and is not counted again as a cost. Summary results are means across trials; the percentile interval describes simulated variation, not confidence in the model. All policies see the same seeded demand inputs.</p><p>This is a single-product daily inventory model with synthetic routes and pooled warehouse stock. Unfilled demand becomes lost sales. It excludes multi-product dependencies, supplier contracts, customs, real-time data, fixed overhead, and liquidation value of closing inventory. Compare planning mechanisms, not real businesses.</p><h2>Reproduce this experiment</h2><p>Save the JSON below as a .json file and import it into RIPPLE. Exact replay requires the same model version. Source: <a href="https://github.com/relaywright/ripple">github.com/relaywright/ripple</a>.</p><pre>${escape(JSON.stringify(s, null, 2))}</pre><p><small>Built by relaywright with AI. Open-source educational software, MIT licensed.</small></p></main></body></html>`;
}
