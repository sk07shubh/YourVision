import type { VisualizationResponse } from './trace';

export type ExtensionRequest =
  | { type: 'READ_SOURCE' }
  | { type: 'RUN_VISUALIZATION'; source: string; method: string; arguments: string[] };

export type ExtensionResponse =
  | { ok: true; source: string }
  | { ok: true; data: VisualizationResponse }
  | { ok: false; error: string };
