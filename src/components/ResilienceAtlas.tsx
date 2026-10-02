import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Download,
  Factory,
  Layers3,
  Play,
  RotateCcw,
  Share2,
  Ship,
  Square,
  TrendingUp,
} from 'lucide-react';
import { POLICIES, PRESETS } from '../simulation';
import type { PolicyId, Scenario } from '../simulation/types';
import { createAtlasPlan, rankCell, summarizeAtlas } from '../simulation/atlas';
import type { AtlasCell, AtlasPlan, AtlasResult, AtlasWorkerMessage } from '../simulation/atlas';
import { atlasBriefHTML, atlasCSV, atlasManifest } from '../lib/atlas-export';
import type { AtlasManifest } from '../lib/atlas-export';
import { dollars, number, percent } from '../lib/format';
import { downloadFile } from '../lib/scenario';
import './resilience-atlas.css';

interface ResilienceAtlasProps {
  scenario: Scenario;
  active: boolean;
  onOpenScenario: (scenario: Scenario, policy: PolicyId) => void;
  onChooseDisruption: (scenario: Scenario) => void;
  onModel: () => void;
  onShare: (manifest: AtlasManifest) => void;
  loadRequest?: { key: number; target: number };
}

type ScanStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error';
const POLICY_DISPLAY: Record<PolicyId, { code: string; name: string; color: string }> = {
  baseline: { code: 'BAS', name: 'Baseline', color: '#b1c6cc' },
  buffer: { code: 'BUF', name: 'Buffer', color: '#e6c278' },
  reroute: { code: 'RTE', name: 'Reroute', color: '#bce79f' },
  diversify: { code: 'DIV', name: 'Diversify', color: '#eaa58a' },
};
const DISRUPTION_NAMES = {
  port: 'Port slowdown',
  supplier: 'Supplier interruption',
  demand: 'Demand surge',
  none: 'No disruption',
};
const cellKey = (duration: number, severity: number) => `${duration}:${severity}`;

// Swept values, labels and the lab's trial budget do not invalidate the held-constant inputs.
function basisKey(scenario: Scenario) {
  return JSON.stringify([
    scenario.version,
    scenario.disruption,
    scenario.startDay,
    scenario.horizon,
    scenario.dailyDemand,
    scenario.demandVolatility,
    scenario.initialStockDays,
    scenario.unitRevenue,
    scenario.unitCost,
    scenario.holdingCost,
    scenario.seed,
  ]);
}

function serviceText(value: number, target: number) {
  return value < target && Number((value * 100).toFixed(1)) >= target * 100
    ? `<${(target * 100).toFixed(1)}%`
    : percent(value);
}

function nearest(values: number[], value: number) {
  return values.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  );
}

export default function ResilienceAtlas({
  scenario,
  active,
  onOpenScenario,
  onChooseDisruption,
  onModel,
  onShare,
  loadRequest,
}: ResilienceAtlasProps) {
  const [target, setTarget] = useState(0.95);
  const [plan, setPlan] = useState<AtlasPlan | null>(null);
  const [cells, setCells] = useState<AtlasCell[]>([]);
  const [result, setResult] = useState<AtlasResult | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [error, setError] = useState('');
  const [invalidated, setInvalidated] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [policyChoice, setPolicyChoice] = useState<{ key: string; policy: PolicyId } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestCounter = useRef(0);
  const handledLoad = useRef<number | null>(null);
  const userSelected = useRef(false);
  const gridButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const sourceKey = basisKey(scenario);
  const prospective = useMemo(() => {
    if (scenario.disruption === 'none') return null;
    try {
      return createAtlasPlan(scenario);
    } catch {
      return null;
    }
  }, [scenario]);

  const stopWorker = useCallback(() => {
    requestCounter.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const runScan = useCallback(
    (input: Scenario) => {
      stopWorker();
      setError('');
      setInvalidated(false);
      setCells([]);
      setResult(null);
      setSelectedKey(null);
      setPolicyChoice(null);
      userSelected.current = false;
      try {
        const nextPlan = createAtlasPlan(input);
        setPlan(nextPlan);
        setStatus('running');
        const wantedDuration = nearest(nextPlan.durations, input.duration);
        const wantedSeverity = nearest(nextPlan.severities, input.severity);
        const wantedKey = cellKey(wantedDuration, wantedSeverity);
        const wantedFocus =
          (nextPlan.severities.length - 1 - nextPlan.severities.indexOf(wantedSeverity)) *
            nextPlan.durations.length +
          nextPlan.durations.indexOf(wantedDuration);
        setFocusIndex(wantedFocus);
        const requestId = `atlas-${requestCounter.current}`;
        const worker = new Worker(new URL('../atlas.worker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<AtlasWorkerMessage>) => {
          const message = event.data;
          if (workerRef.current !== worker || message.requestId !== requestId) return;
          if (message.type === 'progress') {
            setCells((current) => [...current, message.cell]);
            setSelectedKey(
              (current) => current ?? cellKey(message.cell.duration, message.cell.severity),
            );
          } else if (message.type === 'done') {
            setCells(message.result.cells);
            setResult(message.result);
            setStatus('complete');
            if (!userSelected.current) setSelectedKey(wantedKey);
            worker.terminate();
            workerRef.current = null;
          } else {
            setError(message.message);
            setStatus('error');
            worker.terminate();
            workerRef.current = null;
          }
        };
        worker.onerror = () => {
          if (workerRef.current !== worker) return;
          setError(
            'The scan stopped before it finished. Run it again to rebuild the complete atlas.',
          );
          setStatus('error');
          worker.terminate();
          workerRef.current = null;
        };
        worker.postMessage({ type: 'run', requestId, scenario: nextPlan.baseScenario });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'This scan could not start. Try again.');
        setStatus('error');
      }
    },
    [stopWorker],
  );

  useEffect(() => {
    if (loadRequest && handledLoad.current !== loadRequest.key) {
      handledLoad.current = loadRequest.key;
      setTarget(loadRequest.target);
      runScan(scenario);
      return;
    }
    if (plan && basisKey(plan.baseScenario) !== sourceKey) {
      stopWorker();
      setPlan(null);
      setCells([]);
      setResult(null);
      setSelectedKey(null);
      setPolicyChoice(null);
      setStatus('idle');
      setError('');
      setInvalidated(true);
    }
  }, [loadRequest, plan, runScan, scenario, sourceKey, stopWorker]);
  useEffect(
    () => () => {
      stopWorker();
      handledLoad.current = null;
    },
    [stopWorker],
  );

  const stale = !!plan && basisKey(plan.baseScenario) !== sourceKey;
  const shownPlan = stale ? prospective : (plan ?? prospective);
  const shownCells = stale ? [] : cells;
  const completedResult = !stale && status === 'complete' ? result : null;
  const summary = useMemo(
    () => (completedResult ? summarizeAtlas(completedResult.cells, target) : null),
    [completedResult, target],
  );
  const byKey = useMemo(
    () => new Map(shownCells.map((cell) => [cellKey(cell.duration, cell.severity), cell])),
    [shownCells],
  );
  const selectedCell = selectedKey ? byKey.get(selectedKey) : undefined;
  const selectedRank = selectedCell ? rankCell(selectedCell, target) : null;
  const lowestOverall = selectedCell?.policies.reduce((best, candidate) =>
    candidate.totalCost < best.totalCost ? candidate : best,
  ).policy;
  const inspectedPolicy =
    policyChoice?.key === selectedKey
      ? policyChoice.policy
      : (selectedRank?.winner ?? lowestOverall);
  const inspectedMetrics = selectedCell?.policies.find(
    (policy) => policy.policy === inspectedPolicy,
  );
  const running = !stale && status === 'running';
  const total = shownPlan?.totalCells ?? 36;
  const completed = shownCells.length;
  const targetLabel = Number((target * 100).toFixed(8)).toLocaleString('en-US', {
    maximumFractionDigits: 8,
  });
  const severityRows = shownPlan ? [...shownPlan.severities].reverse() : [];
  const progressAnnouncement = running
    ? `Scan ${Math.floor((completed / total) * 4) * 25}% complete.`
    : status === 'complete' && !stale
      ? `Scan complete. ${total} cases ready.`
      : status === 'cancelled' && !stale
        ? `Scan cancelled. ${completed} of ${total} cases computed; results are incomplete.`
        : '';

  function chooseCell(cell: AtlasCell) {
    userSelected.current = true;
    setSelectedKey(cellKey(cell.duration, cell.severity));
    setPolicyChoice(null);
  }

  function moveInGrid(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!shownPlan) return;
    const columns = shownPlan.durations.length;
    const rows = shownPlan.severities.length;
    const row = Math.floor(index / columns);
    const column = index % columns;
    let next = index;
    if (event.key === 'ArrowRight') next = row * columns + Math.min(column + 1, columns - 1);
    else if (event.key === 'ArrowLeft') next = row * columns + Math.max(column - 1, 0);
    else if (event.key === 'ArrowDown') next = Math.min(row + 1, rows - 1) * columns + column;
    else if (event.key === 'ArrowUp') next = Math.max(row - 1, 0) * columns + column;
    else if (event.key === 'Home') next = event.ctrlKey ? 0 : row * columns;
    else if (event.key === 'End')
      next = event.ctrlKey ? columns * rows - 1 : row * columns + columns - 1;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    gridButtons.current[next]?.focus();
  }

  return (
    <section
      className="resilience-atlas"
      hidden={!active}
      data-target={target}
      aria-label="Resilience Atlas"
    >
      <header className="atlas-heading">
        <div>
          <span className="atlas-eyebrow">
            <Layers3 size={13} aria-hidden="true" /> RESILIENCE ATLAS
          </span>
          <h1>Good plans have limits.</h1>
          <p>
            Find the lowest-cost response that meets your service target, as disruptions get longer
            and harder.
          </p>
        </div>
        <button className="atlas-about" onClick={onModel}>
          <CircleHelp size={15} aria-hidden="true" /> How to read this
        </button>
      </header>

      {scenario.disruption === 'none' ? (
        <div className="atlas-choose">
          <span className="atlas-eyebrow">CHOOSE THE PRESSURE TO TEST</span>
          <h2>A quiet quarter has no shock to map.</h2>
          <p>
            Start with a disruption. The Atlas will test its duration and severity while keeping
            other assumptions fixed.
          </p>
          <div className="atlas-choose-options">
            {PRESETS.filter((preset) => preset.scenario.disruption !== 'none').map((preset) => {
              const Icon =
                preset.scenario.disruption === 'port'
                  ? Ship
                  : preset.scenario.disruption === 'supplier'
                    ? Factory
                    : TrendingUp;
              return (
                <button key={preset.id} onClick={() => onChooseDisruption({ ...preset.scenario })}>
                  <Icon size={22} aria-hidden="true" />
                  <strong>{DISRUPTION_NAMES[preset.scenario.disruption]}</strong>
                  <span>{preset.description}</span>
                  <span className="atlas-choose-action">
                    Explore this disruption <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="atlas-controls">
            <div className="atlas-target-control">
              <div className="atlas-target-label">
                <label htmlFor="atlas-target">Minimum mean demand fulfilled</label>
                <div className="atlas-target-value">
                  <input
                    aria-label="Service target percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={Number((target * 100).toFixed(8))}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 0 && value <= 100)
                        setTarget(value / 100);
                    }}
                  />
                  <span>%</span>
                </div>
              </div>
              <input
                id="atlas-target"
                type="range"
                min="0"
                max="100"
                step="any"
                value={target * 100}
                onChange={(event) => setTarget(Number(event.target.value) / 100)}
              />
              <p>
                Move the target. Completed cases update instantly. This is a mean, not a guarantee
                for every trial.
              </p>
            </div>
            <div className="atlas-scan-control">
              <button
                className={`atlas-run ${running ? 'is-cancel' : ''}`}
                onClick={() => {
                  if (running) {
                    stopWorker();
                    setStatus('cancelled');
                  } else runScan(scenario);
                }}
                disabled={!shownPlan && !running}
              >
                {running ? (
                  <Square size={14} aria-hidden="true" />
                ) : status === 'idle' || stale ? (
                  <Play size={15} aria-hidden="true" />
                ) : (
                  <RotateCcw size={15} aria-hidden="true" />
                )}
                {running
                  ? 'Cancel scan'
                  : status === 'idle' || stale
                    ? 'Run resilience scan'
                    : 'Run again'}
              </button>
              <span>{total} cases · 30 trials × 4 strategies each</span>
              <small>Computed on your device. No data uploads.</small>
            </div>
          </div>
          {(invalidated || stale) && (
            <div className="atlas-notice" role="status">
              The fixed inputs changed. Run a new scan to map this experiment.
            </div>
          )}
          {error && (
            <div className="atlas-error" role="alert">
              <strong>The scan did not finish.</strong>
              <span>{error}</span>
            </div>
          )}

          <div className="atlas-workbench">
            <div className="atlas-map-card">
              <div className="atlas-map-heading">
                <div>
                  <span className="atlas-eyebrow">THE DECISION SURFACE</span>
                  <h2>{DISRUPTION_NAMES[scenario.disruption]}</h2>
                </div>
                <span className={`atlas-scan-badge ${running ? 'is-running' : ''}`}>
                  <i />
                  {completedResult
                    ? 'SCAN COMPLETE'
                    : running
                      ? 'SCANNING'
                      : status === 'cancelled'
                        ? 'INCOMPLETE'
                        : status === 'error'
                          ? 'STOPPED'
                          : 'READY TO SCAN'}
                </span>
              </div>
              <p className="atlas-map-rule">
                Each cell shows the lowest modeled cost among strategies meeting{' '}
                <strong>{targetLabel}% mean fulfillment.</strong>
                <span className="atlas-severity-explanation">
                  {scenario.disruption === 'port'
                    ? 'Severity is the share of port capacity removed.'
                    : scenario.disruption === 'supplier'
                      ? 'Severity is the share of Shenzhen output removed.'
                      : 'Severity is added demand above the baseline.'}
                </span>
              </p>
              <div className="atlas-axis-titles">
                <span>SEVERITY ↑</span>
                <span>DISRUPTION DURATION →</span>
              </div>
              {shownPlan && (
                <div
                  className="atlas-cell-grid"
                  role="grid"
                  aria-label="Resilience atlas: duration by severity"
                  aria-rowcount={severityRows.length + 1}
                  aria-colcount={shownPlan.durations.length + 1}
                  style={{ '--atlas-columns': shownPlan.durations.length } as CSSProperties}
                >
                  <div className="atlas-grid-row" role="row">
                    <span className="atlas-grid-corner" role="columnheader" aria-label="Severity" />
                    {shownPlan.durations.map((duration) => (
                      <span className="atlas-column-header" role="columnheader" key={duration}>
                        {duration}
                        <small>d</small>
                      </span>
                    ))}
                  </div>
                  {severityRows.map((severity, row) => (
                    <div className="atlas-grid-row" role="row" key={severity}>
                      <span className="atlas-row-header" role="rowheader">
                        {Math.round(severity * 100)}
                        <small>%</small>
                      </span>
                      {shownPlan.durations.map((duration, column) => {
                        const key = cellKey(duration, severity);
                        const cell = byKey.get(key);
                        const rank = cell ? rankCell(cell, target) : null;
                        const winner = cell?.policies.find(
                          (policy) => policy.policy === rank?.winner,
                        );
                        const code = rank?.winner
                          ? POLICY_DISPLAY[rank.winner].code
                          : cell
                            ? '×'
                            : '·';
                        const index = row * shownPlan.durations.length + column;
                        const selected = key === selectedKey && !!cell;
                        const label = `${duration} ${duration === 1 ? 'day' : 'days'}, ${Math.round(severity * 100)}% severity: ${!cell ? 'not computed' : rank?.winner ? `${POLICY_DISPLAY[rank.winner].name}, ${percent(winner!.serviceLevel)} mean demand fulfilled${rank.tied.length > 1 ? ', shared lowest cost' : ''}` : 'No strategy meets target'}`;
                        return (
                          <div
                            role="gridcell"
                            aria-selected={selected}
                            className="atlas-grid-cell"
                            key={key}
                          >
                            <button
                              ref={(element) => {
                                gridButtons.current[index] = element;
                              }}
                              type="button"
                              className={`atlas-cell ${cell ? (rank?.winner ? `is-${rank.winner}` : 'is-unqualified') : 'is-pending'} ${selected ? 'is-selected' : ''}`}
                              tabIndex={index === Math.min(focusIndex, total - 1) ? 0 : -1}
                              aria-label={label}
                              aria-pressed={selected}
                              aria-disabled={!cell}
                              data-duration={duration}
                              data-severity={severity}
                              data-winner={rank?.winner ?? ''}
                              data-computed={!!cell}
                              onFocus={() => setFocusIndex(index)}
                              onKeyDown={(event) => moveInGrid(event, index)}
                              onClick={() => {
                                if (cell) chooseCell(cell);
                              }}
                            >
                              <strong>{code}</strong>
                              <span>
                                {winner
                                  ? serviceText(winner.serviceLevel, target)
                                  : cell
                                    ? 'unmet'
                                    : '—'}
                              </span>
                              {rank && rank.tied.length > 1 && (
                                <i className="atlas-tie-mark" aria-hidden="true">
                                  =
                                </i>
                              )}
                              {selected && (
                                <Check className="atlas-cell-check" size={11} aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              <div className="atlas-grid-instruction">
                <span>
                  {running
                    ? `${completed} / ${total} cases computed. Partial results.`
                    : status === 'cancelled'
                      ? `${completed} / ${total} cases. Run again for a complete scan.`
                      : completedResult
                        ? 'Select a case to inspect the evidence.'
                        : 'Run a scan to reveal the decision surface.'}
                </span>
                <span>Arrow keys to move · Enter to inspect</span>
              </div>
              <progress
                className="atlas-progress"
                aria-label="Resilience scan progress"
                max={total}
                value={completed}
              />
              <span className="sr-only" role="status" aria-live="polite">
                {progressAnnouncement}
              </span>
              <div className="atlas-map-legend">
                {POLICIES.map((policy) => (
                  <span key={policy.id}>
                    <i style={{ background: POLICY_DISPLAY[policy.id].color }} />
                    <b>{POLICY_DISPLAY[policy.id].code}</b>
                    {POLICY_DISPLAY[policy.id].name}
                  </span>
                ))}
                <span>
                  <i className="atlas-unqualified-swatch">×</i>No strategy meets target
                </span>
                <span className="atlas-tie-legend">= shared lowest cost</span>
              </div>
              <div className="atlas-fixed-inputs">
                <span className="atlas-eyebrow">HELD CONSTANT</span>
                <span>{shownPlan?.baseScenario.horizon ?? scenario.horizon}-day horizon</span>
                <span>
                  Shock starts day {(shownPlan?.baseScenario.startDay ?? scenario.startDay) + 1}
                </span>
                <span>
                  {shownPlan?.baseScenario.initialStockDays ?? scenario.initialStockDays} stock-days
                </span>
                <span>Seed {shownPlan?.baseScenario.seed ?? scenario.seed}</span>
                <button onClick={onModel}>
                  Model assumptions <ArrowUpRight size={11} aria-hidden="true" />
                </button>
              </div>
            </div>

            <section className="atlas-inspector" aria-label="Selected atlas case">
              <div className="atlas-inspector-heading">
                <span className="atlas-eyebrow">CASE INSPECTOR</span>
                <span>
                  {selectedCell
                    ? `D${selectedCell.duration} / S${Math.round(selectedCell.severity * 100)}`
                    : '— / —'}
                </span>
              </div>
              {selectedCell && selectedRank ? (
                <>
                  <h2>
                    {selectedCell.duration} {selectedCell.duration === 1 ? 'day' : 'days'}.<br />
                    <span>{Math.round(selectedCell.severity * 100)}% severity.</span>
                  </h2>
                  <div
                    className={`atlas-case-verdict ${!selectedRank.winner ? 'is-unqualified' : ''}`}
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <strong>
                      {selectedRank.winner
                        ? `${POLICY_DISPLAY[selectedRank.winner].name} ${selectedRank.tied.length > 1 ? 'shares the lowest cost' : 'has the lowest qualifying cost'}.`
                        : 'No strategy meets this target.'}
                    </strong>
                    <p>
                      {selectedRank.winner
                        ? `${selectedRank.eligible.length} of 4 strategies meet ${targetLabel}% mean fulfillment.${selectedRank.tied.length > 1 ? ' Exact ties use the listed strategy order for the cell color.' : ''}`
                        : `All four fall below ${targetLabel}% mean fulfillment. Inspect their trade-offs or lower the target.`}
                    </p>
                  </div>
                  <div
                    className="atlas-policy-table"
                    aria-label="Strategy evidence for selected case"
                  >
                    {selectedCell.policies.map((metrics) => {
                      const qualifies = selectedRank.eligible.includes(metrics.policy);
                      const chosen = inspectedPolicy === metrics.policy;
                      return (
                        <button
                          key={metrics.policy}
                          className={`atlas-policy-row ${chosen ? 'is-chosen' : ''}`}
                          aria-pressed={chosen}
                          aria-label={`Inspect ${POLICY_DISPLAY[metrics.policy].name} policy`}
                          data-policy={metrics.policy}
                          data-service={metrics.serviceLevel}
                          data-cost={metrics.totalCost}
                          onClick={() =>
                            setPolicyChoice({ key: selectedKey!, policy: metrics.policy })
                          }
                        >
                          <span className="atlas-policy-name">
                            <i style={{ background: POLICY_DISPLAY[metrics.policy].color }} />
                            {POLICY_DISPLAY[metrics.policy].name}
                            <small className={qualifies ? 'meets-target' : ''}>
                              {qualifies ? 'Meets target' : 'Below target'}
                            </small>
                          </span>
                          <span className="atlas-policy-numbers">
                            <strong>
                              {serviceText(metrics.serviceLevel, target)}
                              <small>mean fulfilled</small>
                            </strong>
                            <strong>
                              {dollars(metrics.totalCost)}
                              <small>modeled cost</small>
                            </strong>
                          </span>
                          <span className="atlas-policy-range">
                            10–90% of trials: {percent(metrics.serviceBand.p10)}–
                            {percent(metrics.serviceBand.p90)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {inspectedPolicy && inspectedMetrics && (
                    <div className="atlas-open-case">
                      <button
                        onClick={() =>
                          onOpenScenario({ ...selectedCell.scenario }, inspectedPolicy)
                        }
                      >
                        Open {POLICY_DISPLAY[inspectedPolicy].name} in the lab{' '}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </button>
                      <p>
                        Exact inputs · same seed · 30 trials per strategy.
                        {!selectedRank.winner
                          ? ' This selection is for inspection, not a qualifying recommendation.'
                          : ''}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="atlas-inspector-empty">
                  <Layers3 size={30} strokeWidth={1} aria-hidden="true" />
                  <h2>
                    Every cell
                    <br />
                    has a story.
                  </h2>
                  <p>
                    Run the scan, then select a case to compare all four responses and replay the
                    exact experiment.
                  </p>
                  <div>
                    <span>01</span> Find a boundary
                  </div>
                  <div>
                    <span>02</span> Inspect the trade-offs
                  </div>
                  <div>
                    <span>03</span> Open it in the lab
                  </div>
                </div>
              )}
            </section>
          </div>

          {summary && completedResult && (
            <section className="atlas-summary" aria-label="Atlas coverage summary">
              <div className="atlas-summary-lead">
                <span className="atlas-eyebrow">COVERAGE, NOT PROBABILITY</span>
                <h2>
                  <strong>{summary.qualifyingCells}</strong>
                  <span> / {summary.totalCells}</span>
                </h2>
                <p>sampled cases have at least one strategy meeting your target.</p>
                {summary.noQualifyingCells > 0 && (
                  <small>
                    {summary.noQualifyingCells}{' '}
                    {summary.noQualifyingCells === 1 ? 'case remains' : 'cases remain'} below target
                    for every strategy.
                  </small>
                )}
              </div>
              <div className="atlas-summary-policies">
                {summary.policies.map((policy) => (
                  <div key={policy.policy}>
                    <div>
                      <span>
                        <i style={{ background: POLICY_DISPLAY[policy.policy].color }} />
                        {POLICY_DISPLAY[policy.policy].name}
                      </span>
                      <strong>
                        {policy.eligibleCells}
                        <small> / {summary.totalCells} meet target</small>
                      </strong>
                    </div>
                    <div className="atlas-coverage-track">
                      <span
                        style={{
                          width: `${policy.coverage * 100}%`,
                          background: POLICY_DISPLAY[policy.policy].color,
                        }}
                      />
                    </div>
                    <p>
                      Selected in {policy.winningCells} cells
                      {policy.tiedWinningCells
                        ? ` · shares ${policy.tiedWinningCells} exact-cost ties`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <footer className="atlas-bottom">
            <p>
              <strong>A controlled stress test, not a forecast.</strong> These sampled conditions
              have no assigned likelihood. Service ranges describe simulated variation; they are not
              confidence intervals. Exact-cost ties follow the listed policy order.
            </p>
            <div className="atlas-export-actions">
              <button
                disabled={!completedResult}
                onClick={() => {
                  if (completedResult) onShare(atlasManifest(completedResult, target));
                }}
              >
                <Share2 size={14} aria-hidden="true" />
                Share atlas
              </button>
              <button
                disabled={!completedResult}
                onClick={() => {
                  if (completedResult)
                    downloadFile(
                      'ripple-atlas.csv',
                      atlasCSV(completedResult, target),
                      'text/csv;charset=utf-8',
                    );
                }}
              >
                <Download size={14} aria-hidden="true" />
                Download atlas CSV
              </button>
              <button
                disabled={!completedResult}
                onClick={() => {
                  if (completedResult)
                    downloadFile(
                      'ripple-atlas-brief.html',
                      atlasBriefHTML(completedResult, target),
                      'text/html;charset=utf-8',
                    );
                }}
              >
                <Download size={14} aria-hidden="true" />
                Download atlas brief
              </button>
              <button
                disabled={!completedResult}
                onClick={() => {
                  if (completedResult)
                    downloadFile(
                      'ripple-atlas.json',
                      JSON.stringify(atlasManifest(completedResult, target), null, 2),
                      'application/json',
                    );
                }}
              >
                <Download size={14} aria-hidden="true" />
                Download atlas settings
              </button>
            </div>
            <span className="atlas-run-footnote">
              {completedResult
                ? `${number(completedResult.totalCells * completedResult.trialsPerCell * 4)} simulated policy runs · model ${completedResult.modelVersion} · atlas ${completedResult.atlasVersion}`
                : 'Complete the scan to share or export a reproducible atlas.'}
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
