import { enrichTrace } from '../../../backend/src/execution/trace/enrichTrace';
import { buildStates } from '../../../backend/src/execution/trace/stateBuilder';
import type { ExecutionTrace } from '../../../backend/src/execution/trace/schema';
import type { TraceState } from '../types/trace';

export const SAME_LINE_LOOP_SOURCE = [
  'class Solution {',
  '  public int run() {',
  '    int result = helper();',
  '    return result;',
  '  }',
  '  private int helper() {',
  '    int visits = 0;',
  '    int[] history = new int[3];',
  '    while (visits++ < 3) history[visits - 1] = visits;',
  '    return visits;',
  '  }',
  '}',
].join('\n');

const history = (values: number[]) => ({
  $arrayId: 'history-1',
  $type: 'int[]',
  values,
});

// This raw event sequence mirrors the JDI fields asserted by the backend
// regression. Enrichment and stateBuilder run here before the real panel sees it.
const rawTrace: ExecutionTrace = {
  version: 1,
  events: [
    { sequence: 1, type: 'METHOD_ENTER', line: 2, method: 'run', depth: 1, data: { displayLine: 2, variables: {} } },
    { sequence: 2, type: 'STEP', line: 3, method: 'run', depth: 1, data: { variables: {} } },
    { sequence: 3, type: 'METHOD_ENTER', line: 6, method: 'helper', depth: 2, data: { displayLine: 6, variables: {} } },
    { sequence: 4, type: 'STEP', line: 8, method: 'helper', depth: 2, data: { variables: { visits: 0, history: history([0, 0, 0]) } } },
    { sequence: 5, type: 'STEP', line: 9, method: 'helper', depth: 2, data: { variables: { visits: 0, history: history([0, 0, 0]) } } },
    { sequence: 6, type: 'STEP', line: 9, method: 'helper', depth: 2, data: { variables: { visits: 1, history: history([1, 0, 0]) } } },
    { sequence: 7, type: 'STEP', line: 9, method: 'helper', depth: 2, data: { variables: { visits: 2, history: history([1, 2, 0]) } } },
    { sequence: 8, type: 'STEP', line: 9, method: 'helper', depth: 2, data: { variables: { visits: 3, history: history([1, 2, 3]) } } },
    { sequence: 9, type: 'STEP', line: 10, method: 'helper', depth: 2, data: { variables: { visits: 4, history: history([1, 2, 3]) } } },
    { sequence: 10, type: 'METHOD_EXIT', line: 10, method: 'helper', depth: 2, data: { callerLine: 3, callerMethod: 'run', callerVariables: { result: 4 } } },
    { sequence: 11, type: 'STEP', line: 3, method: 'run', depth: 1, data: { variables: { result: 4 } } },
    { sequence: 12, type: 'STEP', line: 4, method: 'run', depth: 1, data: { variables: { result: 4 } } },
    { sequence: 13, type: 'METHOD_EXIT', line: 4, method: 'run', depth: 1, data: { returnValue: 4 } },
  ],
};

export function sameLineLoopStates(): TraceState[] {
  return buildStates(enrichTrace(rawTrace)) as unknown as TraceState[];
}
