import type { ExtensionResponse } from '../types/messages';
import type { VisualizationResponse } from '../types/trace';

export async function runVisualization(source: string, method: string, args: string[]): Promise<VisualizationResponse> {
  const response = await chrome.runtime.sendMessage({ type: 'RUN_VISUALIZATION', source, method, arguments: args }) as ExtensionResponse;
  if (!response?.ok || !('data' in response)) throw new Error(response && 'error' in response ? response.error : 'Backend request failed.');
  return response.data;
}
\nexport interface DesignOperationInput { method: string; arguments: string[] }\n\nexport async function runDesignVisualization(\n  source: string,\n  className: string,\n  constructorArguments: string[],\n  operations: DesignOperationInput[],\n): Promise<VisualizationResponse> {\n  const response = await chrome.runtime.sendMessage({\n    type: 'RUN_DESIGN_VISUALIZATION', source, className, constructorArguments, operations,\n  }) as ExtensionResponse;\n  if (!response?.ok || !('data' in response)) throw new Error(response && 'error' in response ? response.error : 'Backend request failed.');\n  return response.data;\n}\n