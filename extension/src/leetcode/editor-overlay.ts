import { findEditor } from './selectors';

let marker: HTMLDivElement | null = null;
let decoratedLine: HTMLElement | null = null;

export function clearEditorExecutionMarker(): void {
  marker?.remove(); marker = null;
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

  const first = visibleLines[0];
  const firstTop = parseFloat(first.style.top || '0');
  const lineHeight = first.getBoundingClientRect().height || 19;
  const editorScroll = editor.querySelector<HTMLElement>('.monaco-scrollable-element');
  const scrollTop = editorScroll?.scrollTop ?? 0;
  const apparentFirstLine = Math.max(1, Math.round((scrollTop + firstTop) / lineHeight) + 1);
  const index = lineNumber - apparentFirstLine;

  if (index < 0 || index >= visibleLines.length) {
    void chrome.runtime.sendMessage({ type: 'REVEAL_LINE', line: lineNumber });
    return;
  }

  const target = visibleLines[index];
  decoratedLine = target;
  target.style.setProperty('background', 'rgba(255, 161, 22, 0.10)', 'important');
  target.style.setProperty('box-shadow', 'inset 2px 0 0 #ffa116', 'important');

  const editorRect = editor.getBoundingClientRect();
  const lineRect = target.getBoundingClientRect();
  marker = document.createElement('div');
  marker.dataset.yourvisionEditorMarker = 'true';
  marker.textContent = '▶';
  Object.assign(marker.style, {
    position: 'fixed', zIndex: '2147483646', pointerEvents: 'none',
    left: `${Math.max(editorRect.left + 4, lineRect.left - 20)}px`, top: `${lineRect.top + 1}px`,
    color: '#ffa116', fontSize: '11px', lineHeight: `${lineHeight}px`, fontFamily: 'monospace'
  });
  document.documentElement.appendChild(marker);
}
