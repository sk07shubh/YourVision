import type { VisualizationResponse } from './trace';

export type ExtensionRequest =
  | { type: 'READ_SOURCE' }
  | { type: 'READ_ENTRY_METHOD' }
  | { type: 'RUN_VISUALIZATION'; source: string; method: string; arguments: string[] }\n  | { type: 'RUN_DESIGN_VISUALIZATION'; source: string; className: string; constructorArguments: string[]; operations: Array<{ method: string; arguments: string[] }> };

export type ExtensionResponse =
  | { ok: true; source: string }
  | { ok: true; data: VisualizationResponse }
  | { ok: false; error: string };
