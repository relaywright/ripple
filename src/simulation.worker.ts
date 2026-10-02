import { runExperiment, validateScenario } from './simulation';
self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    self.postMessage({ ok: true, result: runExperiment(validateScenario(event.data)) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'The simulation could not finish.',
    });
  }
};
