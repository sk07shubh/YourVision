import type { TraceState } from "../../types/trace";
import type { VisualDataStructure } from "./semantic";

export interface VisualizationModule<TEvent, TScene> {
  id: string;
  dataStructure: VisualDataStructure;
  createScene(state: TraceState, source?: string, previous?: TraceState): TScene;
  compileEvents(state: TraceState, previous?: TraceState, source?: string): TEvent[];
  presentScene(scene: TScene, events: TEvent[]): TScene;
  createAnimationTimeline?: (events: TEvent[]) => import("./animation").AnimationTimeline<TEvent>;
}
