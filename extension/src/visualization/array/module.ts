import type { TraceState } from "../../types/trace";
import type { VisualizationModule } from "../core/module";
import { buildArrayAnimationTimeline } from "./timeline";
import type { ArraySemanticEvent, ArrayScene } from "./types";
import { compileArrayEvents } from "./compiler";
import { createArrayScene } from "./scene";
import { presentArrayScene } from "./presentation";

export const arrayVisualizationModule: VisualizationModule<ArraySemanticEvent, ArrayScene> = {
  id: "array",
  dataStructure: "array",
  createScene: createArrayScene,
  compileEvents: compileArrayEvents,
  presentScene: presentArrayScene,
  createAnimationTimeline: buildArrayAnimationTimeline
};

export function buildArrayVisualization(
  state: TraceState,
  source = "",
  previous?: TraceState
) {
  const scene = arrayVisualizationModule.createScene(state, source, previous);
  const events = arrayVisualizationModule.compileEvents(state, previous, source);
  return {
    events,
    scene: arrayVisualizationModule.presentScene(scene, events)
  };
}
