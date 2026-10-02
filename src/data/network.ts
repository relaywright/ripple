/** Coordinates locate city nodes; they are not facility or shipment locations. */
export interface NetworkNode {
  id: 'shenzhen' | 'hcmc' | 'la' | 'monterrey' | 'houston' | 'chicago' | 'newark';
  name: string;
  country: string;
  coordinates: [number, number];
  kind: 'supplier' | 'gateway' | 'warehouse';
  role: string;
  label: [number, number];
  anchor: 'start' | 'middle' | 'end';
}

export const NETWORK_NODES: NetworkNode[] = [
  {
    id: 'shenzhen',
    name: 'Shenzhen',
    country: 'China',
    coordinates: [114.0579, 22.5431],
    kind: 'supplier',
    role: 'Primary supplier',
    label: [-14, -21],
    anchor: 'end',
  },
  {
    id: 'hcmc',
    name: 'Ho Chi Minh City',
    country: 'Vietnam',
    coordinates: [106.6297, 10.8231],
    kind: 'supplier',
    role: 'Secondary supplier',
    label: [-14, 28],
    anchor: 'end',
  },
  {
    id: 'la',
    name: 'Los Angeles',
    country: 'United States',
    coordinates: [-118.2437, 34.0522],
    kind: 'gateway',
    role: 'Pacific gateway',
    label: [-15, 27],
    anchor: 'end',
  },
  {
    id: 'monterrey',
    name: 'Monterrey',
    country: 'Mexico',
    coordinates: [-100.3161, 25.6866],
    kind: 'supplier',
    role: 'Nearshore supplier',
    label: [-14, 35],
    anchor: 'end',
  },
  {
    id: 'houston',
    name: 'Houston',
    country: 'United States',
    coordinates: [-95.3698, 29.7604],
    kind: 'gateway',
    role: 'Inland gateway',
    label: [17, 26],
    anchor: 'start',
  },
  {
    id: 'chicago',
    name: 'Chicago',
    country: 'United States',
    coordinates: [-87.6298, 41.8781],
    kind: 'warehouse',
    role: 'Warehouse & demand',
    label: [-5, -20],
    anchor: 'middle',
  },
  {
    id: 'newark',
    name: 'Newark',
    country: 'United States',
    coordinates: [-74.1724, 40.7357],
    kind: 'gateway',
    role: 'Alternate gateway',
    label: [15, -1],
    anchor: 'start',
  },
];

export const NODE_BY_ID = Object.fromEntries(
  NETWORK_NODES.map((node) => [node.id, node]),
) as Record<NetworkNode['id'], NetworkNode>;
