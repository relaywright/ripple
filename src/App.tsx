import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  Factory,
  FlaskConical,
  GitBranch,
  Code2,
  Layers3,
  Play,
  Pause,
  Radio,
  RotateCcw,
  Settings2,
  Share2,
  ShieldCheck,
  Ship,
  Sparkles,
  TrendingUp,
  Upload,
  Waves,
  X,
} from 'lucide-react';
import { DEFAULT_SCENARIO, POLICIES, PRESETS } from './simulation';
import type { ExperimentResult, PolicyId, Scenario } from './simulation/types';
import NetworkMap from './components/NetworkMap';
import InventoryChart from './components/InventoryChart';
import Dialog from './components/Dialog';
import { dollars, number, percent } from './lib/format';
import {
  decodeScenario,
  downloadFile,
  encodeScenario,
  MAX_SCENARIO_BYTES,
  parseScenario,
} from './lib/scenario';
import { reportHTML, resultsCSV } from './lib/export';

type Tab = 'lab' | 'compare';
type Modal = 'model' | 'tour' | 'export' | 'share' | null;
const iconFor = { port: Ship, supplier: Factory, demand: TrendingUp, none: Waves };
const storageKey = 'ripple-scenario-v1';

function initialWorkspace(): { scenario: Scenario; message: string } {
  try {
    if (location.hash.startsWith('#scenario='))
      return {
        scenario: decodeScenario(location.hash.slice(10)),
        message: 'Shared experiment loaded. Every strategy uses the same seed.',
      };
    const stored = localStorage.getItem(storageKey);
    if (stored) return { scenario: parseScenario(stored), message: '' };
  } catch (error) {
    return {
      scenario: DEFAULT_SCENARIO,
      message:
        error instanceof Error
          ? error.message
          : 'Saved scenario could not be loaded. A fresh experiment is ready.',
    };
  }
  return { scenario: DEFAULT_SCENARIO, message: '' };
}

export default function App() {
  const [initial] = useState(initialWorkspace);
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initial.message);
  const [policy, setPolicy] = useState<PolicyId>('baseline');
  const [day, setDay] = useState(Math.min(28, initial.scenario.horizon - 1));
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>('lab');
  const [modal, setModal] = useState<Modal>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBusy(true);
    setError('');
    setPlaying(false);
    setResult(null);
    let active = true;
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (
          event: MessageEvent<{ ok: boolean; result?: ExperimentResult; error?: string }>,
        ) => {
          if (!active) return;
          if (event.data.ok && event.data.result) {
            setResult(event.data.result);
            setBusy(false);
            try {
              localStorage.setItem(storageKey, JSON.stringify(scenario));
            } catch {
              /* Ephemeral sessions still work. */
            }
          } else {
            setError(event.data.error ?? 'Simulation failed. Reset the experiment to retry.');
            setBusy(false);
          }
          worker?.terminate();
        };
        worker.onerror = () => {
          if (active) {
            setError('The simulation worker could not start. Reload or reset the experiment.');
            setBusy(false);
          }
          worker?.terminate();
        };
        worker.postMessage(scenario);
      } catch {
        setError(
          'Your browser could not start the simulation. Try a current browser or reload this page.',
        );
        setBusy(false);
      }
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [scenario, retry]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setDay((current) => {
          if (current >= scenario.horizon - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      280,
    );
    return () => clearInterval(timer);
  }, [playing, scenario.horizon]);
  useEffect(() => {
    const loadHash = () => {
      if (!location.hash.startsWith('#scenario=')) return;
      try {
        setScenario(decodeScenario(location.hash.slice(10)));
        setNotice('Shared experiment loaded.');
        setDay(28);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Invalid scenario link.');
      }
    };
    window.addEventListener('hashchange', loadHash);
    return () => window.removeEventListener('hashchange', loadHash);
  }, []);

  const selected = result?.policies.find((p) => p.policy === policy);
  const baseline = result?.policies.find((p) => p.policy === 'baseline');
  const best = result?.policies.find((p) => p.policy === result.bestPolicy);
  const bestPolicy = POLICIES.find((p) => p.id === result?.bestPolicy);
  const hasDisruption = scenario.disruption !== 'none' && scenario.severity > 0;
  const disrupted =
    hasDisruption && day >= scenario.startDay && day < scenario.startDay + scenario.duration;
  const sample = selected?.sample[day];
  const ready = !!result && !busy && !error;
  const savings = baseline && best ? baseline.totalCost - best.totalCost : 0;

  function update(patch: Partial<Scenario>) {
    setScenario((current) => ({ ...current, ...patch }));
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  function selectPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id)!;
    setScenario({ ...preset.scenario });
    setDay(Math.min(28, preset.scenario.horizon - 1));
    setNotice('');
    setPolicy('baseline');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  function reset() {
    setScenario({ ...DEFAULT_SCENARIO });
    setPolicy('baseline');
    setDay(28);
    setNotice('A fresh experiment is ready.');
    setRetry((v) => v + 1);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  async function importScenario(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_SCENARIO_BYTES)
        throw new Error('That file is too large. Use a RIPPLE scenario under 16 KB.');
      const imported = parseScenario(await file.text());
      setScenario(imported);
      setDay(Math.min(28, imported.horizon - 1));
      setPolicy('baseline');
      setNotice(`Imported “${imported.name}”.`);
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That scenario could not be imported.');
    }
    event.target.value = '';
  }
  async function share() {
    const link = `${location.origin}${location.pathname}#scenario=${encodeScenario(scenario)}`;
    setShareLink(link);
    setCopied(false);
    setModal('share');
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* Dialog provides a selectable fallback. */
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to experiment
      </a>
      <aside
        className={`sidebar ${settingsOpen ? 'is-open' : ''}`}
        aria-label="Experiment settings"
      >
        <a className="brand" href={location.pathname} aria-label="RIPPLE home">
          <img src="./ripple.svg" width="40" height="40" alt="" />
          <span>
            ripple<span className="brand-dot">.</span>
          </span>
          <small>LAB</small>
        </a>
        <button
          className="mobile-settings"
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-expanded={settingsOpen}
          aria-controls="sidebar-content"
        >
          <Settings2 size={17} />
          Scenario & controls
          <ChevronDown size={16} />
        </button>
        <div className="sidebar-content" id="sidebar-content">
          <div className="workspace-label">
            <span className="workspace-icon">
              <Layers3 size={15} />
            </span>
            <div>
              <strong>Atlas Supply Co.</strong>
              <span>Synthetic demo network</span>
            </div>
            <span className="workspace-version">01</span>
          </div>
          <div className="side-section-head">
            <span className="eyebrow">01 / CHOOSE A DISRUPTION</span>
            <CircleHelp size={14} aria-hidden="true" />
          </div>
          <div className="scenario-list">
            {PRESETS.map((p) => {
              const Icon = iconFor[p.scenario.disruption];
              const active = scenario.disruption === p.scenario.disruption;
              return (
                <button
                  key={p.id}
                  className={`scenario-button ${active ? 'active' : ''}`}
                  onClick={() => selectPreset(p.id)}
                  aria-pressed={active}
                >
                  <span className="scenario-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{p.title}</strong>
                    <small>{p.subtitle}</small>
                  </span>
                  {active && <span className="active-dot" />}
                </button>
              );
            })}
          </div>
          <div className="side-divider" />
          <div className="side-section-head">
            <span className="eyebrow">02 / SET THE CONDITIONS</span>
            <Settings2 size={14} aria-hidden="true" />
          </div>
          <div className="range-field">
            <div>
              <label htmlFor="duration">Disruption duration</label>
              <output htmlFor="duration">{scenario.duration} days</output>
            </div>
            <input
              id="duration"
              type="range"
              min="1"
              max={scenario.horizon - scenario.startDay}
              value={scenario.duration}
              disabled={scenario.disruption === 'none'}
              onChange={(e) => update({ duration: Number(e.target.value) })}
            />
            <div className="range-endpoints">
              <span>1 day</span>
              <span>{scenario.horizon - scenario.startDay} days</span>
            </div>
          </div>
          <div className="range-field">
            <div>
              <label htmlFor="severity">Severity</label>
              <output htmlFor="severity">{Math.round(scenario.severity * 100)}%</output>
            </div>
            <input
              id="severity"
              type="range"
              min="0"
              max="100"
              step="any"
              value={scenario.severity * 100}
              disabled={scenario.disruption === 'none'}
              onChange={(e) => update({ severity: Number(e.target.value) / 100 })}
            />
            <p className="field-hint">
              {scenario.disruption === 'demand'
                ? 'Additional demand during the surge.'
                : scenario.disruption === 'supplier'
                  ? 'Production capacity removed.'
                  : scenario.disruption === 'none'
                    ? 'No disruption. Explore everyday uncertainty.'
                    : 'Port handling capacity removed.'}
            </p>
          </div>
          <div className="range-field">
            <div>
              <label htmlFor="stock">Starting stock</label>
              <output htmlFor="stock">{scenario.initialStockDays} days</output>
            </div>
            <input
              id="stock"
              type="range"
              min="0"
              max="60"
              step="any"
              value={scenario.initialStockDays}
              onChange={(e) => update({ initialStockDays: Number(e.target.value) })}
            />
          </div>
          <details className="advanced">
            <summary>
              Model assumptions
              <ChevronDown size={14} />
            </summary>
            <div className="advanced-fields">
              <label>
                Daily demand <span>units</span>
                <input
                  aria-label="Daily demand"
                  type="number"
                  min="10"
                  max="10000"
                  step="any"
                  value={scenario.dailyDemand}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 10 && v <= 10000) update({ dailyDemand: v });
                  }}
                />
              </label>
              <label>
                Demand variability <span>%</span>
                <input
                  aria-label="Demand variability"
                  type="number"
                  min="0"
                  max="60"
                  step="any"
                  value={Number((scenario.demandVolatility * 100).toFixed(8))}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 0 && v <= 60) update({ demandVolatility: v / 100 });
                  }}
                />
              </label>
              <label>
                Random seed
                <input
                  aria-label="Random seed"
                  type="number"
                  min="0"
                  max="4294967295"
                  value={scenario.seed}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isInteger(v) && v >= 0 && v <= 4294967295) update({ seed: v });
                  }}
                />
              </label>
              <label>
                Simulation trials
                <select
                  aria-label="Simulation trials"
                  value={scenario.trials}
                  onChange={(e) => update({ trials: Number(e.target.value) })}
                >
                  {[...new Set([60, 120, 300, scenario.trials])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n} per strategy
                      </option>
                    ))}
                </select>
              </label>
              <p>
                Price {dollars(scenario.unitRevenue, false)} · unit cost{' '}
                {dollars(scenario.unitCost, false)} · holding{' '}
                {scenario.holdingCost.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}
                /unit/day. Edit all assumptions through a scenario file.
              </p>
              <button className="text-button" onClick={() => setModal('model')}>
                Read the full model
                <ArrowUpRight size={13} />
              </button>
            </div>
          </details>
          <button className="reset-button" onClick={reset}>
            <RotateCcw size={14} />
            Reset experiment
          </button>
          <div className="sidebar-bottom">
            <span className="privacy-dot" />
            <span>
              Computed on your device.
              <br />
              No account. No data uploads.
            </span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <nav aria-label="Workspace views">
            <button
              className={tab === 'lab' ? 'active' : ''}
              onClick={() => setTab('lab')}
              aria-current={tab === 'lab' ? 'page' : undefined}
            >
              <FlaskConical size={15} />
              Stress lab
            </button>
            <button
              className={tab === 'compare' ? 'active' : ''}
              onClick={() => setTab('compare')}
              aria-current={tab === 'compare' ? 'page' : undefined}
            >
              <GitBranch size={15} />
              Strategy comparison
            </button>
          </nav>
          <div className="topbar-right">
            <span className="demo-tag">OPEN-SOURCE EXPERIMENT</span>
            <a
              href="https://github.com/relaywright/ripple"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
            >
              <Code2 size={18} />
            </a>
          </div>
        </header>
        <main id="main">
          <div className="intro">
            <div>
              <div className="intro-eyebrow">
                <span className="tiny-cross">+</span> SUPPLY CHAIN STRESS LAB{' '}
                <span className="intro-version">v1.0</span>
              </div>
              <h1>
                Break the chain.
                <br />
                <span>Find a better plan.</span>
              </h1>
              <p>One disruption. A thousand consequences. Explore them before they happen.</p>
            </div>
            <div className="intro-actions">
              <button className="secondary-button" onClick={share}>
                <Share2 size={15} />
                Share scenario
              </button>
              <button
                className="primary-button"
                onClick={() => setModal('export')}
                disabled={!ready}
              >
                <Download size={15} />
                Export results
              </button>
              <button
                className="tour-link"
                onClick={() => {
                  setTourStep(0);
                  setModal('tour');
                }}
              >
                <Play size={11} />
                Take the 60-second tour
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
          {notice && (
            <div className="notice" role="status">
              <CircleHelp size={17} />
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="Dismiss notification">
                <X size={15} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-notice" role="alert">
              <strong>Experiment could not finish.</strong>
              <p>{error}</p>
              <button onClick={reset}>Reset and retry</button>
            </div>
          )}
          <div className="experiment-heading">
            <div>
              <span className={`status-dot ${busy ? 'working' : ''}`} />
              <strong>{scenario.name}</strong>
              <span className="experiment-label">{scenario.horizon}-day horizon</span>
            </div>
            <span className="run-status" role="status">
              {busy
                ? 'Computing strategies…'
                : error
                  ? 'Simulation unavailable'
                  : `${scenario.trials} trials × 4 strategies · seed ${scenario.seed}`}
            </span>
          </div>

          {selected && baseline && (
            <section
              className={`metrics ${!ready ? 'is-pending' : ''}`}
              aria-label="Simulation results"
              aria-busy={busy}
            >
              <div className="metric">
                <span className="metric-label">
                  Demand fulfilled
                  <ShieldCheck size={15} />
                </span>
                <strong>{percent(selected.serviceLevel)}</strong>
                <span
                  className={
                    selected.serviceLevel >= baseline.serviceLevel ? 'positive' : 'negative'
                  }
                >
                  {policy === 'baseline'
                    ? 'Mean across simulated trials'
                    : `${((selected.serviceLevel - baseline.serviceLevel) * 100).toFixed(1)} percentage points vs baseline`}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">
                  Lost sales revenue
                  <TrendingUp size={15} />
                </span>
                <strong>{dollars(selected.lostRevenue)}</strong>
                <span>
                  {policy === 'baseline'
                    ? 'Unfilled orders × selling price'
                    : `${dollars(Math.abs(baseline.lostRevenue - selected.lostRevenue))} ${selected.lostRevenue <= baseline.lostRevenue ? 'less' : 'more'} than baseline`}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">
                  Total modeled cost
                  <Layers3 size={15} />
                </span>
                <strong>{dollars(selected.totalCost)}</strong>
                <span>Stock + freight + holding + lost margin</span>
              </div>
              <div className="metric">
                <span className="metric-label">
                  Median recovery
                  <RotateCcw size={15} />
                </span>
                <strong className={selected.recoveryDay === null ? 'word-metric' : ''}>
                  {!hasDisruption
                    ? 'Not applicable'
                    : selected.recoveryDay === null
                      ? 'Not observed'
                      : `Day ${Math.round(selected.recoveryDay) + 1}`}
                </strong>
                <span>
                  {hasDisruption ? '7 days ≥95%; window ≥98%' : 'No disruption to recover from'}
                </span>
              </div>
            </section>
          )}

          {tab === 'lab' ? (
            <>
              <section className="network-panel" aria-label="Supply network and replay">
                <div className="panel-topline">
                  <div>
                    <span className="eyebrow">NETWORK / PACIFIC CORRIDOR</span>
                    <span className="network-subtitle">
                      Three supply routes. One connected system.
                    </span>
                  </div>
                  <span className={`network-status ${disrupted ? 'disrupted' : ''}`}>
                    <span />
                    {disrupted
                      ? 'Disruption active'
                      : hasDisruption && day >= scenario.startDay + scenario.duration
                        ? 'Recovery window'
                        : 'Network operating'}
                  </span>
                </div>
                <NetworkMap scenario={scenario} policy={policy} day={day} playing={playing} />
                <div className="replay">
                  <button
                    className="play-button"
                    aria-label={playing ? 'Pause replay' : 'Play replay'}
                    onClick={() => {
                      if (day === scenario.horizon - 1) setDay(0);
                      setPlaying(!playing);
                    }}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Reset replay"
                    onClick={() => {
                      setPlaying(false);
                      setDay(0);
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                  <div className="day-label">
                    <strong>DAY {String(day + 1).padStart(2, '0')}</strong>
                    <span>of {scenario.horizon}</span>
                  </div>
                  <div className="timeline">
                    <label className="sr-only" htmlFor="replay">
                      Simulation day
                    </label>
                    <input
                      id="replay"
                      type="range"
                      min="0"
                      max={scenario.horizon - 1}
                      value={Math.min(day, scenario.horizon - 1)}
                      onChange={(e) => {
                        setDay(Number(e.target.value));
                        setPlaying(false);
                      }}
                    />
                    <div className="timeline-labels">
                      <span>Day 1</span>
                      <span>
                        {hasDisruption
                          ? `Disruption: days ${scenario.startDay + 1}–${scenario.startDay + scenario.duration}`
                          : 'No disruption injected'}
                      </span>
                      <span>Day {scenario.horizon}</span>
                    </div>
                  </div>
                  <span className="replay-speed">1 DAY / TICK</span>
                </div>
              </section>
              <section className="strategy-section" aria-label="Recovery strategy">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">03 / CHANGE THE RESPONSE</span>
                    <h2>Same disruption. Different decisions.</h2>
                  </div>
                  <button className="text-button" onClick={() => setTab('compare')}>
                    Compare strategies
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div className="policy-list">
                  {POLICIES.map((p, index) => (
                    <button
                      key={p.id}
                      className={`policy-card ${policy === p.id ? 'selected' : ''}`}
                      onClick={() => setPolicy(p.id)}
                      aria-pressed={policy === p.id}
                    >
                      <span className="policy-top">
                        <span className="policy-number">0{index + 1}</span>
                        <span className="policy-check">
                          {policy === p.id && <Check size={12} />}
                        </span>
                      </span>
                      <strong>{p.name}</strong>
                      <span className="policy-description">{p.description}</span>
                      {result?.bestPolicy === p.id && (
                        <span className="best-tag">Lowest modeled cost</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
              {selected && baseline && (
                <section className={`analysis-grid ${!ready ? 'is-pending' : ''}`}>
                  <InventoryChart
                    result={selected}
                    baseline={baseline}
                    scenario={result!.scenario}
                    day={day}
                    onDay={(value) => {
                      setDay(value);
                      setPlaying(false);
                    }}
                  />
                  <div className="decision-card">
                    <div className="decision-top">
                      <span className="eyebrow">THE DECISION BRIEF</span>
                      <Sparkles size={16} />
                    </div>
                    <h2>
                      {bestPolicy?.name ?? 'Calculating'}
                      <span>
                        {result?.bestPolicy === 'baseline'
                          ? 'holds its own.'
                          : 'changes the outcome.'}
                      </span>
                    </h2>
                    <p>
                      {savings > 1 ? (
                        <>
                          Under these assumptions, this strategy cuts modeled cost by{' '}
                          <strong>{dollars(savings)}</strong> versus the baseline.
                        </>
                      ) : (
                        <>
                          Adding a response costs more than it saves in this experiment. The
                          baseline has the lowest modeled cost.
                        </>
                      )}
                    </p>
                    <div className="decision-stat">
                      <strong>{best ? percent(best.serviceLevel) : '—'}</strong>
                      <span>
                        of demand fulfilled
                        <br />
                        with this strategy
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (result) setPolicy(result.bestPolicy);
                        setTab('compare');
                      }}
                    >
                      Inspect the trade-offs
                      <ArrowUpRight size={17} />
                    </button>
                    <small>
                      Calculated from this experiment.
                      <br />
                      Synthetic data, not an operating forecast.
                    </small>
                  </div>
                </section>
              )}
              {sample && (
                <div className="day-inspector">
                  <Radio size={16} />
                  <span>
                    <strong>Replay · day {day + 1}</strong> · one seeded trial
                  </span>
                  <span>{number(sample.received)} received</span>
                  <span>
                    {number(sample.fulfilled)} / {number(sample.demand)} fulfilled
                  </span>
                  <span>{number(sample.inTransit)} in transit</span>
                  <span>{number(sample.inventory)} in stock</span>
                </div>
              )}
            </>
          ) : (
            <section className={`comparison-panel ${!ready ? 'is-pending' : ''}`} aria-busy={busy}>
              <div className="comparison-intro">
                <span className="eyebrow">A CONTROLLED EXPERIMENT</span>
                <h2>Make the trade-off visible.</h2>
                <p>
                  Every strategy faces the same demand and random seed. Lower cost can mean more
                  lost sales. Decide which outcome matters.
                </p>
              </div>
              {result && baseline && (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Response strategy</th>
                          <th scope="col">Demand fulfilled</th>
                          <th scope="col">Lost revenue</th>
                          <th scope="col">Total cost</th>
                          <th scope="col">Cost vs baseline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.policies.map((p) => (
                          <tr
                            key={p.policy}
                            className={p.policy === result.bestPolicy ? 'best-row' : ''}
                          >
                            <th scope="row">
                              <button
                                onClick={() => {
                                  setPolicy(p.policy);
                                  setTab('lab');
                                }}
                              >
                                {POLICIES.find((item) => item.id === p.policy)!.name}
                                <ArrowUpRight size={14} />
                              </button>
                              {p.policy === result.bestPolicy && <span>Lowest modeled cost</span>}
                            </th>
                            <td>
                              <strong>{percent(p.serviceLevel)}</strong>
                              <small>
                                {percent(p.serviceBand.p10)}–{percent(p.serviceBand.p90)} range
                              </small>
                            </td>
                            <td>{dollars(p.lostRevenue, false)}</td>
                            <td>
                              <strong>{dollars(p.totalCost, false)}</strong>
                            </td>
                            <td
                              className={
                                p.totalCost <= baseline.totalCost ? 'positive' : 'negative'
                              }
                            >
                              {p.policy === 'baseline'
                                ? 'Reference'
                                : `${p.totalCost <= baseline.totalCost ? '−' : '+'}${dollars(Math.abs(p.totalCost - baseline.totalCost), false)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="cost-section">
                    <div>
                      <h3>What are you paying for?</h3>
                      <p>Cost composition, mean across {result.scenario.trials} trials</p>
                    </div>
                    <div className="cost-legend">
                      <span>
                        <i style={{ background: '#1e5754' }} />
                        Procurement
                      </span>
                      <span>
                        <i style={{ background: '#6c998b' }} />
                        Freight
                      </span>
                      <span>
                        <i style={{ background: '#bfce9b' }} />
                        Holding
                      </span>
                      <span>
                        <i style={{ background: '#dc885f' }} />
                        Lost margin
                      </span>
                    </div>
                    {result.policies.map((p) => (
                      <div className="cost-row" key={p.policy}>
                        <span>{POLICIES.find((item) => item.id === p.policy)!.shortName}</span>
                        <div
                          className="cost-bar"
                          role="img"
                          aria-label={`${p.policy}: procurement ${dollars(p.procurementCost, false)}, freight ${dollars(p.transportCost, false)}, holding ${dollars(p.holdingCost, false)}, lost margin ${dollars(p.lostMargin, false)}`}
                          style={{
                            width: `${(p.totalCost / Math.max(...result.policies.map((item) => item.totalCost))) * 100}%`,
                          }}
                        >
                          {[
                            { value: p.procurementCost, color: '#1e5754' },
                            { value: p.transportCost, color: '#6c998b' },
                            { value: p.holdingCost, color: '#bfce9b' },
                            { value: p.lostMargin, color: '#dc885f' },
                          ].map((segment, i) => (
                            <span
                              key={i}
                              style={{
                                width: `${(segment.value / Math.max(1, p.totalCost)) * 100}%`,
                                background: segment.color,
                              }}
                            />
                          ))}
                        </div>
                        <strong>{dollars(p.totalCost)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="comparison-footnote">
                    <BookOpen size={18} />
                    <p>
                      Ranges show the 10th–90th percentile across simulated trials, not a confidence
                      interval. Total cost includes lost contribution margin, not lost revenue.
                      Closing inventory has no salvage credit.{' '}
                      <button onClick={() => setModal('model')}>Read assumptions</button>
                    </p>
                  </div>
                </>
              )}
              <button className="secondary-button" onClick={() => setTab('lab')}>
                <ArrowLeft size={15} />
                Back to the network
              </button>
            </section>
          )}

          {!result && !error && (
            <div className="loading-state" role="status">
              <div className="loading-orbit" />
              <h2>Finding the ripple effects…</h2>
              <p>Simulating four responses to the same disruption.</p>
            </div>
          )}
          <footer className="footer">
            <div>
              <span className="footer-mark">◎</span>
              <span>
                Built by{' '}
                <a href="https://github.com/relaywright" target="_blank" rel="noreferrer">
                  relaywright
                </a>{' '}
                with AI.
                <br />
                <small>An open experiment in better decisions.</small>
              </span>
            </div>
            <div>
              <button onClick={() => setModal('model')}>
                <BookOpen size={14} />
                About the model
              </button>
              <button onClick={() => uploadRef.current?.click()}>
                <Upload size={14} />
                Import scenario
              </button>
              <a href="https://github.com/relaywright/ripple" target="_blank" rel="noreferrer">
                Source code
                <ExternalLink size={13} />
              </a>
            </div>
          </footer>
          <input
            ref={uploadRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import scenario file"
            onChange={importScenario}
          />
        </main>
      </div>

      {modal === 'model' && (
        <Dialog title="A model you can inspect." onClose={() => setModal(null)} wide>
          <div className="model-content">
            <p className="modal-lead">
              RIPPLE is a synthetic supply-chain wind tunnel. It makes the consequences of a
              decision visible, while keeping the assumptions in view.
            </p>
            <div className="model-grid">
              <section>
                <span className="eyebrow">01 / THE SYSTEM</span>
                <h3>One product. Three supply routes.</h3>
                <p>
                  Shenzhen and Ho Chi Minh City supply goods through Los Angeles. Monterrey supplies
                  through Houston. All inventory is pooled at a Chicago fulfillment hub. Routes and
                  volumes are illustrative.
                </p>
                <p>
                  Each simulated day places orders, clears port queues, receives shipments, and
                  fulfills demand. Unfilled demand becomes lost sales.
                </p>
              </section>
              <section>
                <span className="eyebrow">02 / THE UNCERTAINTY</span>
                <h3>Repeatable, not predictable.</h3>
                <p>
                  Demand and transit times vary across {scenario.trials} trials. A seeded random
                  generator gives each policy the same underlying uncertainty. The same scenario and
                  model version produce the same result.
                </p>
                <p>
                  Summary metrics are averages, except recovery: it is the upper median across
                  trials, with unrecovered trials ranked last. “Not observed” means at least half
                  the trials did not recover within the horizon. Chart bands show the 10th–90th
                  percentile. The timeline inspector shows one trial, so its numbers need not match
                  the median.
                </p>
              </section>
              <section>
                <span className="eyebrow">03 / THE TRADE-OFF</span>
                <h3>Resilience has a price.</h3>
                <p>
                  Buffer stock buys 10 extra days of inventory before the event. Rerouting responds
                  after 3 days, using Newark at extra cost. Diversification responds after 5 days by
                  shifting new orders to Mexico.
                </p>
                <p>
                  The highlighted strategy minimizes procurement + freight + holding cost + lost
                  contribution margin. It does not optimize every business objective.
                </p>
              </section>
              <section>
                <span className="eyebrow">04 / THE BOUNDARIES</span>
                <h3>A teaching tool, not a forecast.</h3>
                <p>
                  No live shipment data, supplier integrations, AI predictions, multi-product
                  dependencies, or inventory salvage values. Costs and timings are synthetic inputs.
                  Correlated demand shocks and real contracts are outside this model.
                </p>
                <p>
                  Map routes show the current ordering policy. Animated dots are illustrative; they
                  are not tracked shipments. There are no runtime AI calls or data uploads.
                </p>
              </section>
            </div>
            <div className="model-current">
              <strong>Your experiment</strong>
              <span>{scenario.horizon} days</span>
              <span>{number(scenario.dailyDemand)} units/day</span>
              <span>{scenario.trials} trials/strategy</span>
              <span>Seed {scenario.seed}</span>
              <span>Model {result?.modelVersion ?? 'loading'}</span>
            </div>
            <a
              className="primary-button"
              href="https://github.com/relaywright/ripple/blob/main/docs/MODEL.md"
              target="_blank"
              rel="noreferrer"
            >
              Inspect the equations and tests
              <ArrowUpRight size={16} />
            </a>
          </div>
        </Dialog>
      )}
      {modal === 'tour' && (
        <Dialog title="Your first experiment." onClose={() => setModal(null)}>
          <div className="tour-content">
            <span className="eyebrow">{String(tourStep + 1).padStart(2, '0')} / 03</span>
            <div className="tour-art">
              {tourStep === 0 ? (
                <Ship size={64} strokeWidth={1} />
              ) : tourStep === 1 ? (
                <GitBranch size={64} strokeWidth={1} />
              ) : (
                <Layers3 size={64} strokeWidth={1} />
              )}
            </div>
            <h3>
              {
                ['Start with a broken port.', 'Change the response.', 'Show your evidence.'][
                  tourStep
                ]
              }
            </h3>
            <p>
              {
                [
                  'The default experiment removes port capacity at Los Angeles. Drag the timeline to see the disruption and recovery window. Click a map node to understand its role.',
                  'Below the map, switch between baseline, buffer stock, rerouting, and diversified supply. The charts update from the same seeded demand, so you can compare fairly.',
                  'Open Strategy comparison to see the full cost trade-off. Export a decision brief, download the data, or share an exact, reproducible scenario.',
                ][tourStep]
              }
            </p>
            <div className="tour-footer">
              <div>
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    className={i === tourStep ? 'active' : ''}
                    aria-label={`Tour step ${i + 1}`}
                    onClick={() => setTourStep(i)}
                  />
                ))}
              </div>
              <button
                className="primary-button"
                onClick={() => (tourStep < 2 ? setTourStep(tourStep + 1) : setModal(null))}
              >
                {tourStep < 2 ? 'Next' : 'Start exploring'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {modal === 'export' && result && (
        <Dialog title="Take the evidence with you." onClose={() => setModal(null)}>
          <p className="modal-lead">
            Everything needed to inspect, present, and reproduce this experiment.
          </p>
          <div className="export-options">
            <button
              onClick={() =>
                downloadFile('ripple-decision-brief.html', reportHTML(result), 'text/html')
              }
            >
              <BookOpen size={22} />
              <span>
                <strong>Decision brief</strong>
                <small>A self-contained report. Open in a browser or print to PDF.</small>
              </span>
              <ArrowDownToLine size={17} />
            </button>
            <button
              onClick={() => downloadFile('ripple-results.csv', resultsCSV(result), 'text/csv')}
            >
              <Layers3 size={22} />
              <span>
                <strong>Results spreadsheet</strong>
                <small>Strategy metrics and cost breakdowns as CSV.</small>
              </span>
              <ArrowDownToLine size={17} />
            </button>
            <button
              onClick={() =>
                downloadFile(
                  'ripple-scenario.json',
                  JSON.stringify(result.scenario, null, 2),
                  'application/json',
                )
              }
            >
              <GitBranch size={22} />
              <span>
                <strong>Reproducible scenario</strong>
                <small>All inputs and the seed. Import to run it again.</small>
              </span>
              <ArrowDownToLine size={17} />
            </button>
          </div>
          <p className="export-note">
            Model {result.modelVersion} · {result.scenario.trials} trials per strategy · No
            information is uploaded.
          </p>
        </Dialog>
      )}
      {modal === 'share' && (
        <Dialog title="Same scenario. Same outcome." onClose={() => setModal(null)}>
          <p className="modal-lead">
            This link contains your experiment settings and random seed. Anyone can reproduce it
            with this model version.
          </p>
          <label className="share-label" htmlFor="share-link">
            Scenario link
          </label>
          <textarea
            id="share-link"
            className="share-input"
            readOnly
            value={shareLink}
            onFocus={(e) => e.target.select()}
            rows={3}
          />
          <button
            className="primary-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareLink);
                setCopied(true);
              } catch {
                setCopied(false);
                setNotice('Clipboard is unavailable. Select and copy the scenario link.');
              }
            }}
          >
            {copied ? <Check size={15} /> : <Share2 size={15} />}{' '}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <p className="export-note">
            Settings travel in the link. There is no server-side account or saved record.
          </p>
        </Dialog>
      )}
    </div>
  );
}
