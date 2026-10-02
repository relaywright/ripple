import { createAtlasPlan, runAtlasCell } from './simulation/atlas';
import type { AtlasCell, AtlasWorkerMessage } from './simulation/atlas';
import { validateScenario } from './simulation';

function send(message: AtlasWorkerMessage): void {
  self.postMessage(message);
}

// One request per worker. The owner cancels work by terminating this worker and
// ignores responses with an old requestId. Every cell has a bounded 30-trial run.
self.onmessage = (event: MessageEvent<unknown>) => {
  const input = event.data;
  let requestId = '';
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('An atlas request must contain a scenario and request ID.');
    }
    const request = input as Record<string, unknown>;
    if (typeof request.requestId === 'string' && request.requestId.length <= 100) {
      requestId = request.requestId;
    }
    if (request.type !== 'run' || requestId.length === 0) {
      throw new Error('This atlas request is invalid. Start a new atlas run.');
    }
    const plan = createAtlasPlan(validateScenario(request.scenario));
    const cells: AtlasCell[] = [];
    for (let index = 0; index < plan.totalCells; index++) {
      const cell = runAtlasCell(plan, index);
      cells.push(cell);
      send({ type: 'progress', requestId, completed: cells.length, total: plan.totalCells, cell });
    }
    send({ type: 'done', requestId, result: { ...plan, cells } });
  } catch (error) {
    send({
      type: 'error',
      requestId,
      message:
        error instanceof Error ? error.message : 'The atlas could not finish. Start a new run.',
    });
  }
};
