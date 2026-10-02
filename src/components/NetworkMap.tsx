import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoMercator, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-110m.json';
import { Anchor, ArrowUpRight, Compass, Factory, Warehouse } from 'lucide-react';
import type { PolicyId, Scenario } from '../simulation/types';
import { NETWORK_NODES, NODE_BY_ID } from '../data/network';
import type { NetworkNode } from '../data/network';
import './network-map.css';

interface NetworkMapProps {
  scenario: Scenario;
  policy: PolicyId;
  day: number;
  playing: boolean;
}
interface Route {
  id: string;
  from: NetworkNode['id'];
  to: NetworkNode['id'];
  share: number;
  affected: boolean;
  waypoints?: [number, number][];
}

const topology = atlas as unknown as Topology<{
  countries: GeometryCollection;
  land: GeometryCollection;
}>;
const projection = geoMercator().rotate([180, 0]).center([0, 20]).scale(205).translate([470, 238]);
const draw = geoPath(projection);
const landPath = draw(feature(topology, topology.objects.land)) ?? '';
const borderPath = draw(mesh(topology, topology.objects.countries, (a, b) => a !== b)) ?? '';
const gridPath = draw(geoGraticule10()) ?? '';
const positions = Object.fromEntries(
  NETWORK_NODES.map((node) => [node.id, projection(node.coordinates)!]),
) as Record<NetworkNode['id'], [number, number]>;

function routePath(route: Route) {
  return (
    draw({
      type: 'LineString',
      coordinates: [
        NODE_BY_ID[route.from].coordinates,
        ...(route.waypoints ?? []),
        NODE_BY_ID[route.to].coordinates,
      ],
    }) ?? ''
  );
}

function coordinateLabel([longitude, latitude]: [number, number]) {
  return `${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'}  ${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

export default function NetworkMap({ scenario, policy, day, playing }: NetworkMapProps) {
  const [selectedId, setSelectedId] = useState<NetworkNode['id']>('la');
  const svgRef = useRef<SVGSVGElement>(null);
  const reducedMotion = useReducedMotion();
  const instance = useId().replace(/:/g, '');
  const gradientId = `map-ocean-${instance}`;
  const glowId = `map-route-glow-${instance}`;
  const hasEvent = scenario.disruption !== 'none' && scenario.severity > 0;
  const active =
    hasEvent && day >= scenario.startDay && day < scenario.startDay + scenario.duration;
  const rerouted =
    policy === 'reroute' &&
    scenario.disruption === 'port' &&
    hasEvent &&
    day >= scenario.startDay + 3 &&
    day < scenario.startDay + scenario.duration;
  const diversified = policy === 'diversify' && hasEvent && day >= scenario.startDay + 5;
  const gateway = rerouted ? 'newark' : 'la';
  const shares = diversified ? [35, 20, 45] : [65, 25, 10];
  const impactedNode = active
    ? (
        {
          port: 'la',
          supplier: 'shenzhen',
          demand: 'chicago',
          none: '',
        } as const
      )[scenario.disruption]
    : '';
  const selected = NODE_BY_ID[selectedId];
  const isSelectedAffected = selected.id === impactedNode;
  const Icon =
    selected.kind === 'supplier' ? Factory : selected.kind === 'warehouse' ? Warehouse : Anchor;

  const routes = useMemo<Route[]>(() => {
    const supplyShares = diversified ? [35, 20, 45] : [65, 25, 10];
    const oceanGate = rerouted ? 'newark' : 'la';
    const portAffected = active && scenario.disruption === 'port' && !rerouted;
    // Waypoints communicate the alternate ocean gateway without implying a navigable route.
    const waypoints: [number, number][] | undefined = rerouted
      ? [
          [-155, 13],
          [-111, 10],
          [-79.6, 9.1],
          [-74, 25],
        ]
      : undefined;
    return [
      {
        id: 'shenzhen-ocean',
        from: 'shenzhen',
        to: oceanGate,
        share: supplyShares[0],
        affected: portAffected || (active && scenario.disruption === 'supplier'),
        waypoints,
      },
      {
        id: 'hcmc-ocean',
        from: 'hcmc',
        to: oceanGate,
        share: supplyShares[1],
        affected: portAffected,
        waypoints,
      },
      {
        id: 'ocean-inland',
        from: oceanGate,
        to: 'chicago',
        share: supplyShares[0] + supplyShares[1],
        affected: portAffected,
      },
      {
        id: 'mexico-inland',
        from: 'monterrey',
        to: 'houston',
        share: supplyShares[2],
        affected: false,
      },
      {
        id: 'houston-inland',
        from: 'houston',
        to: 'chicago',
        share: supplyShares[2],
        affected: false,
      },
    ];
  }, [active, diversified, rerouted, scenario.disruption]);

  useEffect(() => {
    if (!svgRef.current) return;
    if (playing && !reducedMotion) svgRef.current.unpauseAnimations();
    else svgRef.current.pauseAnimations();
  }, [playing, reducedMotion]);

  const supplierIndex = ['shenzhen', 'hcmc', 'monterrey'].indexOf(selected.id);
  const nominalDays = selected.id === 'shenzhen' ? 22 : selected.id === 'hcmc' ? 25 : 7;
  const metric =
    supplierIndex >= 0
      ? `${shares[supplierIndex]}%`
      : selected.id === 'chicago'
        ? scenario.dailyDemand.toLocaleString()
        : selected.id === 'la'
          ? Math.round(scenario.dailyDemand * 1.125).toLocaleString()
          : selected.id === 'newark'
            ? '+6d'
            : '7d';
  const metricLabel =
    supplierIndex >= 0
      ? 'planned order share'
      : selected.id === 'chicago'
        ? 'base units / day'
        : selected.id === 'la'
          ? 'nominal units / day'
          : selected.id === 'newark'
            ? 'reroute transit'
            : 'nominal Mexico transit';
  const detail =
    selected.kind === 'supplier'
      ? `${nominalDays + (rerouted && selected.id !== 'monterrey' ? 6 : 0)} days nominal to Chicago, via ${selected.id === 'monterrey' ? 'Houston' : NODE_BY_ID[gateway].name}.`
      : selected.id === 'la'
        ? 'Ocean arrivals share a capacity-limited port, then travel inland to Chicago.'
        : selected.id === 'newark'
          ? 'Alternate ocean gateway. Rerouting starts three days after a port shock.'
          : selected.id === 'houston'
            ? 'Nearshore supply enters through Houston and continues to the warehouse.'
            : 'All supply meets demand here. Unfilled demand becomes lost sales.';
  const eventLabel =
    scenario.disruption === 'port'
      ? 'Port capacity constrained'
      : scenario.disruption === 'supplier'
        ? 'Supplier output constrained'
        : 'Demand surge active';
  const eventState = active
    ? eventLabel
    : !hasEvent
      ? 'No disruption'
      : day < scenario.startDay
        ? `Shock begins day ${scenario.startDay + 1}`
        : 'Shock window complete';
  const policyNote =
    policy === 'buffer'
      ? 'Buffer policy: 10 extra stock-days at the warehouse.'
      : policy === 'reroute'
        ? rerouted
          ? 'New orders and eligible ocean cargo use Newark; queued freight stays in Los Angeles.'
          : scenario.disruption !== 'port' || !hasEvent
            ? 'Rerouting responds to port disruptions only.'
            : day < scenario.startDay + 3
              ? `Alternate routing begins day ${scenario.startDay + 4}, if the port shock is still active.`
              : 'New ocean orders use Los Angeles. Earlier rerouted cargo keeps its route.'
        : policy === 'diversify'
          ? diversified
            ? 'Planned orders now use a 35 / 20 / 45 supplier split. Earlier cargo keeps its route.'
            : hasEvent
              ? `Supplier mix changes five days after the shock, on day ${scenario.startDay + 6}.`
              : 'Supplier mix stays at 65 / 25 / 10 without a shock.'
          : 'Target mix: 65% Shenzhen · 25% Ho Chi Minh City · 10% Monterrey.';

  return (
    <div className="ripple-map" data-playing={playing && !reducedMotion}>
      <div className="ripple-map__stage">
        <div className="ripple-map__heading">
          <div className="ripple-map__eyebrow">
            <Compass size={14} aria-hidden="true" /> NETWORK ATLAS <span>01</span>
          </div>
          <p>One product. Three origins.</p>
        </div>
        <div className={`ripple-map__event ${active ? 'is-active' : ''}`}>
          <span />
          {eventState}
        </div>
        <svg
          ref={svgRef}
          className="ripple-map__canvas"
          viewBox="0 0 1000 415"
          role="group"
          aria-label="Interactive supply network map. Select a location to inspect its model role."
        >
          <title>RIPPLE supply network, centered on the Pacific</title>
          <desc>
            Fictional suppliers in Shenzhen, Ho Chi Minh City and Monterrey feed a Chicago
            warehouse. Paths show new-order routing. Motion is illustrative, not shipment tracking.
          </desc>
          <defs>
            <radialGradient id={gradientId} cx="49%" cy="36%" r="70%">
              <stop offset="0" stopColor="#1c4141" />
              <stop offset="1" stopColor="#0e282b" />
            </radialGradient>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <rect width="1000" height="415" fill={`url(#${gradientId})`} />
          <g aria-hidden="true">
            <path className="ripple-map__graticule" d={gridPath} />
            <path className="ripple-map__land" d={landPath} />
            <path className="ripple-map__borders" d={borderPath} />
            <text className="ripple-map__continent" x="182" y="133">
              EAST ASIA
            </text>
            <text className="ripple-map__continent" x="749" y="96">
              NORTH AMERICA
            </text>
            <text className="ripple-map__ocean" x="490" y="235" textAnchor="middle">
              PACIFIC OCEAN
            </text>
            <path className="ripple-map__compass" d="M946 338v30m-15-15h30m-15-23-4 8h8Z" />
            <text className="ripple-map__coordinate" x="946" y="322" textAnchor="middle">
              N
            </text>
            {routes.map((route) => {
              const d = routePath(route);
              return (
                <g
                  key={route.id}
                  className={`ripple-map__route ${route.affected ? 'is-affected' : ''}`}
                >
                  <path className="ripple-map__route-glow" d={d} filter={`url(#${glowId})`} />
                  <path
                    className="ripple-map__route-line"
                    d={d}
                    style={{ strokeWidth: 1.2 + route.share / 60 }}
                  />
                  {!reducedMotion &&
                    [0, 1].map((dot) => (
                      <circle
                        key={dot}
                        className="ripple-map__shipment"
                        r={route.share > 40 ? 3 : 2.4}
                      >
                        <animateMotion
                          dur={`${route.id.includes('ocean') && !route.id.includes('inland') ? 13 : 7}s`}
                          begin={`${-dot * 6 - 1}s`}
                          repeatCount="indefinite"
                          path={d}
                        />
                      </circle>
                    ))}
                </g>
              );
            })}
          </g>
          {NETWORK_NODES.map((node) => {
            const [x, y] = positions[node.id];
            const isSelected = node.id === selectedId;
            const affected = node.id === impactedNode;
            const inactive = (node.id === 'newark' && !rerouted) || (node.id === 'la' && rerouted);
            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                className={`ripple-map__node ${isSelected ? 'is-selected' : ''} ${affected ? 'is-affected' : ''} ${inactive ? 'is-inactive' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${node.name}, ${node.role}${affected ? ', disruption active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(node.id);
                  }
                }}
              >
                <circle className="ripple-map__hit-target" r="19" />
                {affected && <circle className="ripple-map__shock-halo" r="20" />}
                <circle className="ripple-map__selection-ring" r="12" />
                {node.kind === 'warehouse' ? (
                  <rect
                    className="ripple-map__node-core"
                    x="-5"
                    y="-5"
                    width="10"
                    height="10"
                    rx="2"
                  />
                ) : (
                  <circle className="ripple-map__node-core" r="5" />
                )}
                <text
                  className="ripple-map__node-label"
                  x={node.label[0]}
                  y={node.label[1]}
                  textAnchor={node.anchor}
                >
                  {node.name}
                </text>
                <text
                  className="ripple-map__node-sublabel"
                  x={node.label[0]}
                  y={node.label[1] + 15}
                  textAnchor={node.anchor}
                >
                  {node.kind === 'supplier'
                    ? `${shares[['shenzhen', 'hcmc', 'monterrey'].indexOf(node.id)]}% planned share`
                    : node.kind === 'warehouse'
                      ? 'WAREHOUSE'
                      : node.id === 'newark' && !rerouted
                        ? 'ALTERNATE'
                        : 'GATEWAY'}
                </text>
              </g>
            );
          })}
        </svg>
        <div
          className={`ripple-map__inspector ${isSelectedAffected ? 'is-affected' : ''}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="ripple-map__inspector-top">
            <span className="ripple-map__node-type">
              <Icon size={13} aria-hidden="true" />
              {selected.role}
            </span>
            <span className="ripple-map__node-country">{selected.country}</span>
          </div>
          <div className="ripple-map__inspector-main">
            <div>
              <h3>{selected.name}</h3>
              <span className="ripple-map__coordinates">
                {coordinateLabel(selected.coordinates)}
              </span>
            </div>
            <div className="ripple-map__metric">
              <strong>{metric}</strong>
              <span>{metricLabel}</span>
            </div>
          </div>
          <p>
            {isSelectedAffected
              ? `${Math.round(scenario.severity * 100)}% ${scenario.disruption === 'demand' ? 'demand increase' : scenario.disruption === 'port' ? 'capacity reduction' : 'output reduction'} during this shock. `
              : ''}
            {detail}
          </p>
        </div>
        <span className="ripple-map__select-hint">
          <ArrowUpRight size={13} aria-hidden="true" /> Select a location to explore
        </span>
      </div>
      <div
        className="ripple-map__mobile-nodes"
        role="group"
        aria-label="Inspect a network location"
      >
        {NETWORK_NODES.map((node) => (
          <button
            key={node.id}
            type="button"
            aria-pressed={selectedId === node.id}
            onClick={() => setSelectedId(node.id)}
          >
            {node.name}
          </button>
        ))}
      </div>
      <div className="ripple-map__footer">
        <div className="ripple-map__legend">
          <span>
            <i className="is-route" />
            New-order routes
          </span>
          <span>
            <i className="is-shock" />
            Disruption
          </span>
          <span className="ripple-map__illustration">
            Illustrative paths &amp; motion · not tracking
          </span>
        </div>
        <p className="ripple-map__policy-note">{policyNote}</p>
      </div>
    </div>
  );
}
