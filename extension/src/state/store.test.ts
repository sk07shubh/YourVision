import { describe, expect, it } from 'vitest';
import { sessionStore } from './store';

describe('session store', () => {
  it('replays without re-executing', () => {
    sessionStore.finish({success:true,kind:'OK',states:[
      {sequence:0,depth:0,variables:{x:1},arrays:{},objects:{},callStack:[]},
      {sequence:1,depth:0,variables:{x:2},arrays:{},objects:{},callStack:[]}
    ]});
    expect(sessionStore.get().index).toBe(0);
    sessionStore.next(); expect(sessionStore.get().index).toBe(1);
    sessionStore.prev(); expect(sessionStore.get().index).toBe(0);
  });
});
