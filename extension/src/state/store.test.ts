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
    sessionStore.finish({success:true,kind:'OK',states:[
      {sequence:0,depth:0,variables:{x:1},arrays:{},dataStructures:{},objects:{},callStack:[]},
      {sequence:1,depth:0,variables:{x:2},arrays:{},dataStructures:{},objects:{},callStack:[]},
      {sequence:2,depth:0,variables:{x:3},arrays:{},dataStructures:{},objects:{},callStack:[]}
    ]});
    sessionStore.togglePlay();
    sessionStore.tick();
    expect(sessionStore.get().index).toBe(1);
    expect(sessionStore.get().elapsedMs).toBe(650);
    sessionStore.tick();
    expect(sessionStore.get().index).toBe(2);
    expect(sessionStore.get().playing).toBe(false);
    sessionStore.setPlaybackDelay(325);
    expect(sessionStore.get().playbackDelay).toBe(325);
  });
});
