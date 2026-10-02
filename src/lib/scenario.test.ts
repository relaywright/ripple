import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO } from '../simulation';
import { decodeScenario, encodeScenario, MAX_SCENARIO_BYTES, parseScenario } from './scenario';

describe('portable scenario files and links', () => {
  it('round-trips every field, including multilingual and astral Unicode characters', () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      name: '港口 → México / Montréal 🧭 & café',
      seed: 0xffff_ffff,
      dailyDemand: 123.45,
      severity: 0.357,
      demandVolatility: 0.1234,
      trials: 7,
    };
    expect(parseScenario(JSON.stringify(scenario))).toEqual(scenario);
    const encoded = encodeScenario(scenario);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');
    expect(decodeScenario(encoded)).toEqual(scenario);
    const url = new URL(`https://ripple.example/lab/#scenario=${encoded}`);
    expect(decodeScenario(url.hash.slice('#scenario='.length))).toEqual(scenario);
  });

  it('reproduces a stable link without modifying the input', () => {
    const scenario = Object.freeze({ ...DEFAULT_SCENARIO, name: 'Repeatable experiment' });
    const before = JSON.stringify(scenario);
    expect(encodeScenario(scenario)).toBe(encodeScenario(scenario));
    expect(JSON.stringify(scenario)).toBe(before);
    expect(parseScenario(JSON.stringify(scenario))).not.toBe(scenario);
  });

  it('does not bypass model validation in files, encoded links, or link creation', () => {
    const invalid = { ...DEFAULT_SCENARIO, trials: 501 };
    expect(() => parseScenario(JSON.stringify(invalid))).toThrow('trials');
    expect(() => decodeScenario(btoa(JSON.stringify(invalid)))).toThrow('trials');
    expect(() => encodeScenario(invalid)).toThrow('trials');
    expect(() => parseScenario(JSON.stringify({ ...DEFAULT_SCENARIO, unknownField: 1 }))).toThrow(
      'Unknown scenario field',
    );
  });

  it.each(['', '{', 'null', '[]', 'true', '"hello"'])(
    'rejects malformed or wrong-shape JSON (%s)',
    (text) => {
      expect(() => parseScenario(text)).toThrow(Error);
    },
  );

  it('checks actual UTF-8 bytes before parsing or validating the name', () => {
    const text = JSON.stringify({ ...DEFAULT_SCENARIO, name: 'é'.repeat(9000) });
    expect(text.length).toBeLessThan(MAX_SCENARIO_BYTES);
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(MAX_SCENARIO_BYTES);
    expect(() => parseScenario(text)).toThrow('too large');
  });

  it('accepts the exact byte boundary and rejects the next byte', () => {
    const json = JSON.stringify(DEFAULT_SCENARIO);
    const boundary = json.padEnd(MAX_SCENARIO_BYTES, ' ');
    expect(parseScenario(boundary)).toEqual(DEFAULT_SCENARIO);
    expect(() => parseScenario(`${boundary} `)).toThrow('too large');
  });

  it('bounds both link length and decoded content size', () => {
    expect(() => decodeScenario('A'.repeat(Math.floor(MAX_SCENARIO_BYTES * 1.4) + 1))).toThrow(
      'too long',
    );
    const oversizedText = JSON.stringify(DEFAULT_SCENARIO).padEnd(MAX_SCENARIO_BYTES + 1, ' ');
    const oversizedLink = btoa(oversizedText);
    expect(oversizedLink.length).toBeLessThan(MAX_SCENARIO_BYTES * 1.4);
    expect(() => decodeScenario(oversizedLink)).toThrow('too large');
  });

  it.each(['%', '!!!', 'a', '====', '💥', btoa('{'), btoa('null')])(
    'rejects malformed links with a useful message (%s)',
    (text) => {
      expect(() => decodeScenario(text)).toThrow('scenario link could not be loaded');
    },
  );

  it('rejects invalid UTF-8 instead of silently replacing bytes', () => {
    const invalidUtf8 = btoa(String.fromCharCode(0xc3, 0x28));
    expect(() => decodeScenario(invalidUtf8)).toThrow('scenario link could not be loaded');
  });

  it('keeps HTML-like names as inert data through the transport boundary', () => {
    const scenario = { ...DEFAULT_SCENARIO, name: '</title><script>alert("x")</script> & 🧭' };
    expect(decodeScenario(encodeScenario(scenario)).name).toBe(scenario.name);
    expect(parseScenario(JSON.stringify(scenario)).name).toBe(scenario.name);
  });
});
