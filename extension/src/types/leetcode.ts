export type TestcaseSource = 'default' | 'custom' | 'failed' | 'unknown';

export interface LeetCodeTestcase {
  id: string;
  label: string;
  source: TestcaseSource;
  raw: string;
  inputs: Record<string, string>;
  orderedArguments: string[];
  expected?: string;
}

export interface JavaMethod {
  name: string;
  parameterNames: string[];
  parameterTypes: string[];
}
