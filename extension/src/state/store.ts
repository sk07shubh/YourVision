import type { LeetCodeTestcase } from '../types/leetcode';
import type { TraceState, VisualizationResponse } from '../types/trace';
import { createAnimationPlayer, pause, play, restart, seek } from '../visualization/core/player';

export interface SessionState {
  open: boolean; loading: boolean; playing: boolean; elapsedMs: number; playbackDelay: number; source: string; testcase?: LeetCodeTestcase;
  response?: VisualizationResponse; states: TraceState[]; index: number; error?: string;
}

type Listener = () => void;
const initialPlayer = createAnimationPlayer();
let state: SessionState = { open: false, loading: false, playing: initialPlayer.playing, elapsedMs: initialPlayer.elapsedMs, playbackDelay: 650, source: '', states: [], index: 0 };
const listeners = new Set<Listener>();

export const sessionStore = {
  get: () => state,
  subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); },
  set(patch: Partial<SessionState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); },
  begin(source: string, testcase: LeetCodeTestcase) {
    this.set({ open: true, loading: true, playing: false, elapsedMs: 0, playbackDelay: 650, source, testcase, response: undefined, states: [], index: 0, error: undefined });
  },
  finish(response: VisualizationResponse) {
    const states = response.states ?? [];
    this.set({ loading: false, response, states, index: 0, playing: false, elapsedMs: 0, error: response.success ? undefined : (response.message || response.stderr || response.kind) });
  },
  fail(message: string) { this.set({ loading: false, playing: false, elapsedMs: 0, error: message }); },
  next() {
    if (state.index < state.states.length - 1) {
      const nextIndex = state.index + 1;
      const player = seek(play(createAnimationPlayer()), nextIndex * state.playbackDelay, Math.max(0, (state.states.length - 1) * state.playbackDelay));
      this.set({ index: nextIndex, playing: player.playing, elapsedMs: player.elapsedMs });
    } else {
      this.set({ playing: false });
    }
  },
  prev() {
    if (state.index > 0) {
      const player = pause(seek(createAnimationPlayer(), (state.index - 1) * state.playbackDelay, Math.max(0, (state.states.length - 1) * state.playbackDelay)));
      this.set({ index: state.index - 1, playing: player.playing, elapsedMs: player.elapsedMs });
    }
  },
  restart() {
    const player = restart(createAnimationPlayer());
    this.set({ index: 0, playing: player.playing, elapsedMs: player.elapsedMs });
  },
  togglePlay() {
    if (state.states.length > 1) {
      const player = state.playing ? pause(createAnimationPlayer()) : play(createAnimationPlayer());
      this.set({ playing: player.playing });
    }
  },
  setPlaybackDelay(playbackDelay: number) { this.set({ playbackDelay }); },
};
