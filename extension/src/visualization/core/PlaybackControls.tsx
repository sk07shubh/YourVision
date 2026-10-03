import type { ReactNode } from "react";

interface PlaybackControlsProps {
  index: number;
  length: number;
  playing: boolean;
  playbackDelay: number;
  onRestart: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPlaybackDelay: (delay: number) => void;
  children?: ReactNode;
}

const SPEEDS = [
  { label: "0.5×", delay: 1300 },
  { label: "1×", delay: 650 },
  { label: "1.5×", delay: 430 },
  { label: "2×", delay: 325 }
];

export function PlaybackControls({
  index,
  length,
  playing,
  playbackDelay,
  onRestart,
  onPrev,
  onTogglePlay,
  onNext,
  onPlaybackDelay,
  children
}: PlaybackControlsProps) {
  return (
    <footer className="yv-workspace-controls">
      <div className="yv-workspace-progress">
        <div className="yv-progress-track">
          <div className="yv-progress-fill" style={{ width: ((index + 1) / length) * 100 + "%" }}/>
        </div>
      </div>
      <div className="yv-workspace-buttons">
        <button className="yv-btn" onClick={onRestart} disabled={index <= 0}>↺ Restart</button>
        <button className="yv-btn" onClick={onPrev} disabled={index <= 0}>← Prev</button>
        <button className="yv-btn primary" onClick={onTogglePlay} disabled={length < 2}>{playing ? "Pause" : "Play"}</button>
        <button className="yv-btn" onClick={onNext} disabled={index >= length - 1}>Next →</button>
        <select className="yv-speed-select" value={playbackDelay} onChange={event => onPlaybackDelay(Number(event.target.value))} aria-label="Playback speed">
          {SPEEDS.map(speed => <option key={speed.delay} value={speed.delay}>{speed.label}</option>)}
        </select>
        {children}
      </div>
    </footer>
  );
}
