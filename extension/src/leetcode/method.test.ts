import { describe, expect, it } from 'vitest';
import { inferMethod, orderArguments } from './method';

describe('Java method inference', () => {
  it('finds the solution method and generic parameters', () => {
    const m = inferMethod(`class Solution { public int[] twoSum(int[] nums, int target) { return null; } }`);
    expect(m).toEqual({name:'twoSum',parameterNames:['nums','target'],parameterTypes:['int[]','int']});
  });
  it('orders testcase values by method params', () => {
    expect(orderArguments({target:'9',nums:'[2,7,11,15]'}, {name:'x',parameterNames:['nums','target'],parameterTypes:[]})).toEqual(['[2,7,11,15]','9']);
  });
});
