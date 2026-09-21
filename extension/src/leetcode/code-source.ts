export async function readUserSource(): Promise<string> {
  const response = await chrome.runtime.sendMessage({ type: 'READ_SOURCE' });
  if (response?.ok && typeof response.source === 'string' && response.source.trim()) return response.source;

  const lines = [...document.querySelectorAll<HTMLElement>('.monaco-editor .view-lines .view-line')]
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map(line => line.innerText);
  const fallback = lines.join('\n').trim();
  if (fallback) return fallback;
  throw new Error(response?.error || 'Could not read the LeetCode editor source.');
}
