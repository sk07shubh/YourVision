const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
};

export function findProblemWorkspace(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-layout-path="/problems/[slug]/"]')
    ?? document.querySelector<HTMLElement>('#qd-content')
    ?? document.body;
}

export function findLeftTabList(): HTMLElement | null {
  const candidates = [...document.querySelectorAll<HTMLElement>('[role="tablist"]')];
  return candidates.find(el => {
    const t = el.innerText.toLowerCase();
    return t.includes('description') && (t.includes('editorial') || t.includes('solutions'));
  }) ?? [...document.querySelectorAll<HTMLElement>('div')].find(el => {
    const own = [...el.children].map(c => (c.textContent ?? '').trim().toLowerCase());
    return own.includes('description') && (own.includes('editorial') || own.includes('solutions')) && visible(el);
  }) ?? null;
}

export function findLeftContentHost(tabList: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = tabList.parentElement;
  for (let i = 0; node && i < 6; i++, node = node.parentElement) {
    const tabPanels = [...node.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(visible);
    if (tabPanels.length) return tabPanels[0].parentElement ?? tabPanels[0];
    const rect = node.getBoundingClientRect();
    if (rect.height > 250 && rect.width > 250) {
      const editorInside = node.querySelector('.monaco-editor');
      if (!editorInside) return node;
    }
  }
  return null;
}

export function findTestcaseRegion(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>('[role="tablist"], [role="tabpanel"], section, div')].filter(visible);
  const scored = all.map(el => {
    const t = (el.innerText || '').toLowerCase();
    let score = 0;
    if (t.includes('testcase')) score += 5;
    if (t.includes('test result')) score += 5;
    if (/case\s*1/.test(t)) score += 3;
    if (t.includes('run')) score += 1;
    if (t.includes('submit')) score -= 2;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight * 0.45) score += 3;
    if (r.height < 450) score += 2;
    return { el, score, area: r.width * r.height };
  }).filter(x => x.score >= 7).sort((a,b) => b.score - a.score || a.area - b.area);
  return scored[0]?.el ?? null;
}

export function findActiveTestcaseTab(region: HTMLElement): HTMLElement | null {
  const tabs = [...region.querySelectorAll<HTMLElement>('[role="tab"], button')].filter(visible);
  return tabs.find(t => t.getAttribute('aria-selected') === 'true' || t.dataset.state === 'active')
    ?? tabs.find(t => /case\s*\d+|testcase|custom/i.test(t.innerText))
    ?? null;
}

export function findEditor(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('.monaco-editor')].find(visible) ?? null;
}
