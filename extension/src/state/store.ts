import type { LeetCodeTestcase } from '../types/leetcode';
import type { TraceState, VisualizationResponse } from '../types/trace';

export interface SessionState {
  open: boolean; loading: boolean; playing: boolean; source: string; testcase?: LeetCodeTestcase;
  response?: VisualizationResponse; states: TraceState[]; index: number; error?: string;
}

type Listener = () => void;
let state: SessionState = { open: false, loading: false, playing: false, source: '', states: [], index: 0 };
const listeners = new Set<Listener>();

export const sessionStore = {
  get: () => state,
  subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); },
  set(patch: Partial<SessionState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); },
  begin(source: string, testcase: LeetCodeTestcase) {
    this.set({ open: true, loading: true, playing: false, source, testcase, response: undefined, states: [], index: 0, error: undefined });
  },
  finish(response: VisualizationResponse) {
    const states = response.states ?? [];
    this.set({ loading: false, response, states, index: 0, playing: false, error: response.success ? undefined : (response.message || response.stderr || response.kind) });
  },
  fail(message: string) { this.set({ loading: false, playing: false, error: message }); },
  next() { if (state.index < state.states.length - 1) this.set({ index: state.index + 1 }); else this.set({ playing: false }); },
  prev() { if (state.index > 0) this.set({ index: state.index - 1, playing: false }); },
  restart() { this.set({ index: 0, playing: false }); },
  togglePlay() { if (state.states.length > 1) this.set({ playing: !state.playing }); },
};
