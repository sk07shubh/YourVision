import { findEditor } from './selectors';

let decoratedLine: HTMLElement | null = null;

export function clearEditorExecutionMarker(): void {
  if (decoratedLine) {
    decoratedLine.style.removeProperty('background');
    decoratedLine.style.removeProperty('box-shadow');
    decoratedLine = null;
  }
}

export function highlightEditorLine(lineNumber?: number): void {
  clearEditorExecutionMarker();
  if (!lineNumber || lineNumber < 1) return;
  const editor = findEditor();
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
    void chrome.runtime.sendMessage({
      type: 'REVEAL_LINE',
      line: lineNumber
    });

    window.setTimeout(
      () => highlightEditorLine(lineNumber),
      40
    );

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
