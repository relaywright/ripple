import { useId } from 'react';
import type { PolicyResult, Scenario } from '../simulation/types';
import { number } from '../lib/format';

export default function InventoryChart({
  result,
  baseline,
  scenario,
  day,
  onDay,
}: {
  result: PolicyResult;
  baseline: PolicyResult;
  scenario: Scenario;
  day: number;
  onDay: (day: number) => void;
}) {
  const id = useId().replaceAll(':', '');
  const w = 800,
    h = 225,
    left = 50,
    top = 18,
    right = 20,
    bottom = 35;
  const max = Math.max(
    1,
    ...result.inventoryBand.map((p) => p.p90),
    ...baseline.inventoryBand.map((p) => p.p50),
  );
  const step = Math.pow(10, Math.floor(Math.log10(max))) / 2;
  const ceiling = Math.ceil((max * 1.08) / step) * step;
  const x = (d: number) => left + (d / Math.max(1, scenario.horizon - 1)) * (w - left - right);
  const y = (v: number) => h - bottom - (v / ceiling) * (h - top - bottom);
  const line = (data: { day: number; p50: number }[]) =>
    data.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(2)},${y(p.p50).toFixed(2)}`).join(' ');
  const area =
    result.inventoryBand.map((p, i) => `${i ? 'L' : 'M'}${x(p.day)},${y(p.p90)}`).join(' ') +
    [...result.inventoryBand]
      .reverse()
      .map((p) => `L${x(p.day)},${y(p.p10)}`)
      .join(' ') +
    ' Z';
  const current = result.inventoryBand[day];
  return (
    <div className="inventory-chart">
      <div className="chart-heading">
        <div>
          <span className="eyebrow">THE RIPPLE EFFECT</span>
          <h2>Inventory, over time</h2>
        </div>
        <div className="chart-readout">
          <strong>{number(current?.p50 ?? 0)}</strong>
          <span>median units · day {day + 1}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const raw = ((event.clientX - rect.left) / rect.width) * w;
          onDay(
            Math.round(
              Math.max(
                0,
                Math.min(
                  scenario.horizon - 1,
                  ((raw - left) / (w - left - right)) * (scenario.horizon - 1),
                ),
              ),
            ),
          );
        }}
      >
        <title id={`${id}-title`}>Inventory simulation: median and 10th to 90th percentile</title>
        <desc id={`${id}-desc`}>
          Selected strategy compared with the baseline across {scenario.trials} trials. At day{' '}
          {day + 1}, median inventory is {number(current?.p50 ?? 0)} units. Use the Simulation day
          slider to explore.
        </desc>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#67a897" stopOpacity=".32" />
            <stop offset="100%" stopColor="#67a897" stopOpacity=".06" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((n) => (
          <g key={n}>
            <line
              x1={left}
              x2={w - right}
              y1={y(n * ceiling)}
              y2={y(n * ceiling)}
              stroke="#e4e8df"
              strokeDasharray="3 5"
            />
            <text x={left - 10} y={y(n * ceiling) + 4} textAnchor="end">
              {n * ceiling >= 1000
                ? `${Number(((n * ceiling) / 1000).toFixed(2))}k`
                : number(n * ceiling)}
            </text>
          </g>
        ))}
        {scenario.disruption !== 'none' && scenario.severity > 0 && (
          <rect
            x={x(scenario.startDay)}
            y={top}
            width={
              x(Math.min(scenario.horizon - 1, scenario.startDay + scenario.duration)) -
              x(scenario.startDay)
            }
            height={h - top - bottom}
            fill="#e98b60"
            opacity=".10"
          />
        )}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line(baseline.inventoryBand)}
          fill="none"
          stroke="#a18d7e"
          strokeDasharray="5 5"
          strokeWidth="1.6"
        />
        <path d={line(result.inventoryBand)} fill="none" stroke="#23695b" strokeWidth="2.5" />
        {[
          0,
          Math.round((scenario.horizon - 1) * 0.25),
          Math.round((scenario.horizon - 1) * 0.5),
          Math.round((scenario.horizon - 1) * 0.75),
          scenario.horizon - 1,
        ].map((d) => (
          <text key={d} x={x(d)} y={h - 10} textAnchor="middle">
            Day {d + 1}
          </text>
        ))}
        {current && (
          <g>
            <line
              x1={x(day)}
              x2={x(day)}
              y1={top}
              y2={h - bottom}
              stroke="#427566"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(day)}
              cy={y(current.p50)}
              r="5"
              fill="#23695b"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="line-swatch selected" />
          Selected strategy
        </span>
        <span>
          <i className="line-swatch" />
          Baseline
        </span>
        <span>
          <i className="band-swatch" />
          10–90% of trials
        </span>
        <span>
          <i className="disruption-swatch" />
          Disruption window
        </span>
      </div>
    </div>
  );
}
