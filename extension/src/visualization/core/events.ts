import type { VisualPrimitiveEvent } from "./semantic";

export type VisualizationEvent = VisualPrimitiveEvent;

export interface VisualizationTimeline<TEvent extends VisualizationEvent = VisualizationEvent> {
  events: TEvent[];
  sourceLine?: number;
  method?: string;
}

export function eventTarget(event: VisualizationEvent): string | undefined {
  return event.target;
}

export function eventSourceLine(event: VisualizationEvent): number | undefined {
  return event.context?.sourceLine;
}
