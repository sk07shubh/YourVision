import type { ExtensionResponse } from '../types/messages';
import type { VisualizationResponse } from '../types/trace';

export interface DesignClassRequest {
  constructorArguments: string[];
  calls: Array<{ method: string; arguments: string[] }>;
}

export async function runVisualization(
  source: string,
  method: string,
  args: string[],
  designClass?: DesignClassRequest
): Promise<VisualizationResponse> {
  const response = await chrome.runtime.sendMessage({
    type: 'RUN_VISUALIZATION',
    source,
    method,
    arguments: args,
    ...(designClass ? {
      constructorArguments: designClass.constructorArguments,
      calls: designClass.calls
    } : {})
  }) as ExtensionResponse;
  if (!response?.ok || !('data' in response)) throw new Error(response && 'error' in response ? response.error : 'Backend request failed.');
  return response.data;
}
