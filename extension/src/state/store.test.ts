import { describe, expect, it } from 'vitest';
import { sessionStore } from './store';

describe('session store', () => {
  it('replays without re-executing', () => {
    sessionStore.finish({success:true,kind:'OK',states:[
      {sequence:0,depth:0,variables:{x:1},arrays:{},dataStructures:{},objects:{},callStack:[]},
      {sequence:1,depth:0,variables:{x:2},arrays:{},dataStructures:{},objects:{},callStack:[]}
    ]});
    expect(sessionStore.get().index).toBe(0);
    expect(sessionStore.get().elapsedMs).toBe(0);
    sessionStore.next(); expect(sessionStore.get().index).toBe(1);
    expect(sessionStore.get().elapsedMs).toBe(650);
    sessionStore.prev(); expect(sessionStore.get().index).toBe(0);
    expect(sessionStore.get().elapsedMs).toBe(0);
    sessionStore.setPlaybackDelay(325);
    expect(sessionStore.get().playbackDelay).toBe(325);
  });
});
