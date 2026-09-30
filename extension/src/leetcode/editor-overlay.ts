import { findEditor } from './selectors';

let decoratedLine: HTMLElement | null = null;
let retryTimer: number | undefined;
let generation = 0;
let revealRequestedGeneration = -1;

function removeDecoration(): void {
  if (!decoratedLine) return;
  decoratedLine.style.removeProperty('background');
  decoratedLine.style.removeProperty('box-shadow');
  decoratedLine = null;
}

export function clearEditorExecutionMarker(): void {
  generation++;
  if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  retryTimer = undefined;
  removeDecoration();
}

export function highlightEditorLine(lineNumber?: number, source?: string): void {
  clearEditorExecutionMarker();
  if (!lineNumber || lineNumber < 1) return;
  const currentGeneration = generation;
  const retry = () => {
    if (currentGeneration !== generation) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      highlight(lineNumber, source, currentGeneration, retry);
    }, 40);
  };
  highlight(lineNumber, source, currentGeneration, retry);
}

function highlight(
  lineNumber: number,
  source: string | undefined,
  currentGeneration: number,
  retry: () => void
): void {
  const editor = findEditor(source);
  if (!editor) return;

  const viewLines = editor.querySelector<HTMLElement>('.view-lines');
  if (!viewLines) return;
  const visibleLines = [...viewLines.querySelectorAll<HTMLElement>('.view-line')];
  if (!visibleLines.length) return;

  const gutterLines = [
    ...editor.querySelectorAll<HTMLElement>(
      '.margin-view-overlays .line-numbers'
    )
  ];

  const gutter =
    gutterLines.find(
      node =>
        node.textContent?.trim() ===
        String(lineNumber)
    );

  if (!gutter) {
    if (currentGeneration !== generation) return;
    if (revealRequestedGeneration !== currentGeneration && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      revealRequestedGeneration = currentGeneration;
      void chrome.runtime.sendMessage({
        type: 'REVEAL_LINE',
        line: lineNumber,
        source
      });
    }
    retry();

    return;
  }

  const gutterTop =
    gutter.getBoundingClientRect().top;

  const target =
    visibleLines.reduce(
      (closest, candidate) => {
        const distance =
          Math.abs(
            candidate.getBoundingClientRect().top -
            gutterTop
          );

        const closestDistance =
          Math.abs(
            closest.getBoundingClientRect().top -
            gutterTop
          );

        return distance < closestDistance
          ? candidate
          : closest;
      },
      visibleLines[0]
    );
  decoratedLine = target;
  target.style.setProperty('background', 'rgba(255, 161, 22, 0.10)', 'important');
  target.style.setProperty('box-shadow', 'inset 2px 0 0 #ffa116', 'important');

  // Orange line highlight only; no separate arrow marker.
}
