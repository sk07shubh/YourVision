import { describe, expect, it } from 'vitest';
import { detectSource, parseAssignments } from './testcase';

describe('testcase parser', () => {
  it('parses nested arrays and strings', () => {
    expect(parseAssignments('nums = [1,2,3], target = 3\ns = "a,b"')).toEqual({nums:'[1,2,3]',target:'3',s:'"a,b"'});
  });
  it('classifies failed/custom/default', () => {
    expect(detectSource('Case 1','Testcase')).toBe('default');
    expect(detectSource('Custom','Testcase')).toBe('custom');
    expect(detectSource('Case 3','Wrong Answer Use Testcase')).toBe('failed');
  });
});
