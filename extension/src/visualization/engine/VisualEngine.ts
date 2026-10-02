import type { TraceState } from '../../types/trace';
import { diffStates } from './stateDiff';
import type { VisualEvent } from './visualEvents';

export class VisualEngine {
  private previous: TraceState | undefined;

  reset(): void {
    this.previous = undefined;
  }

  eventsFor(state: TraceState | undefined): VisualEvent[] {
    const events = diffStates(this.previous, state);
    this.previous = state;
    return events;
  }

  eventsBetween(previous: TraceState | undefined, current: TraceState | undefined): VisualEvent[] {
    return diffStates(previous, current);
  }
}
