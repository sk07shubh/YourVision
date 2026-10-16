export type TestcaseSource = 'default' | 'custom' | 'failed' | 'unknown';

export interface LeetCodeDesignCall {
  method: string;
  arguments: string[];
}

export interface LeetCodeDesignTestcase {
  constructorArguments: string[];
  calls: LeetCodeDesignCall[];
}

export interface LeetCodeTestcase {
  id: string;
  label: string;
  source: TestcaseSource;
  raw: string;
  inputs: Record<string, string>;
  orderedArguments: string[];
  designClass?: LeetCodeDesignTestcase;
}

export interface JavaMethod {
  name: string;
  parameterNames: string[];
  parameterTypes: string[];
}
