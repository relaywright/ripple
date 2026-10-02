import { validateScenario } from '../simulation';
import type { Scenario } from '../simulation/types';

export const MAX_SCENARIO_BYTES = 16384;
export function parseScenario(text: string): Scenario {
  if (new TextEncoder().encode(text).length > MAX_SCENARIO_BYTES)
    throw new Error('That file is too large. Scenario files must be under 16 KB.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid JSON scenario. Import a file exported by RIPPLE.');
  }
  return validateScenario(input);
}
export function encodeScenario(scenario: Scenario): string {
  const bytes = new TextEncoder().encode(JSON.stringify(validateScenario(scenario)));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export function decodeScenario(encoded: string): Scenario {
  if (encoded.length > MAX_SCENARIO_BYTES * 1.4) throw new Error('The scenario link is too long.');
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
    return parseScenario(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
      ),
    );
  } catch (error) {
    throw new Error(
      `This scenario link could not be loaded. ${error instanceof Error ? error.message : 'Try another link.'}`,
    );
  }
}
export function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
