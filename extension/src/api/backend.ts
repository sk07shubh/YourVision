import type { ExtensionResponse } from '../types/messages';
import type { VisualizationResponse } from '../types/trace';

export async function runVisualization(source: string, method: string, args: string[]): Promise<VisualizationResponse> {
  const response = await chrome.runtime.sendMessage({ type: 'RUN_VISUALIZATION', source, method, arguments: args }) as ExtensionResponse;
  if (!response?.ok || !('data' in response)) throw new Error(response && 'error' in response ? response.error : 'Backend request failed.');
  return response.data;
}

export interface DesignOperationInput { method: string; arguments: string[] }

export async function runDesignVisualization(
  source: string,
  className: string,
  constructorArguments: string[],
  operations: DesignOperationInput[],
): Promise<VisualizationResponse> {
  const response = await chrome.runtime.sendMessage({
    type: 'RUN_DESIGN_VISUALIZATION', source, className, constructorArguments, operations,
  }) as ExtensionResponse;
  if (!response?.ok || !('data' in response)) throw new Error(response && 'error' in response ? response.error : 'Backend request failed.');
  return response.data;
}
