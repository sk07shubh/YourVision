const textOf = (el: Element): string =>
  (el.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const visible = (
  el: Element | null
): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) {
    return false;
  }

  const style = getComputedStyle(el);

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    el.getBoundingClientRect().width > 0
  );
};

export function findProblemWorkspace(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(
      '#qd-content'
    ) ??
    document.body
  );
}

/**
 * Exact FlexLayout container holding:
 * Description / Solutions / Editorial / Submissions.
 */
export function findLeftTabList(): HTMLElement | null {
  const containers = [
    ...document.querySelectorAll<HTMLElement>(
      '.flexlayout__tabset_tabbar_inner_tab_container_top'
    ),
  ].filter(visible);

  for (const container of containers) {
    const tabs = [
      ...container.querySelectorAll<HTMLElement>(
        ':scope > .flexlayout__tab_button_top'
      ),
    ];

    const names = tabs.map(textOf);

    if (
      names.includes('description') &&
      (
        names.includes('solutions') ||
        names.includes('editorial')
      )
    ) {
      return container;
    }
  }

  const description =
    document.querySelector<HTMLElement>(
      '[data-layout-path="/ts0/tb0"]'
    );

  if (!description) {
    return null;
  }

  return description.closest<HTMLElement>(
    '.flexlayout__tabset_tabbar_inner_tab_container_top'
  );
}

/**
 * Exact FlexLayout content container belonging to
 * Description / Solutions / Editorial / Submissions.
 */
export function findLeftContentHost(
  tabList: HTMLElement
): HTMLElement | null {
  const tabset =
    tabList.closest<HTMLElement>(
      '.flexlayout__tabset'
    );

  if (!tabset) {
    return null;
  }

  return (
    tabset.querySelector<HTMLElement>(
      ':scope > .flexlayout__tabset_content'
    ) ?? null
  );
}

/**
 * The row containing Case 1 / Case 2 / ... / +.
 */
export function findTestcaseRegion(): HTMLElement | null {
  const caseButtons = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-e2e-locator="console-testcase-tag"]'
    ),
  ].filter(visible);

  if (caseButtons.length > 0) {
    return caseButtons[0].parentElement;
  }

  const genericCase = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .filter(visible)
    .find(button => /^case\s+\d+$/i.test((button.textContent ?? '').trim()));

  return genericCase?.parentElement ?? null;
}

export function findTestResultContainers(): HTMLElement[] {
  const candidates = [...document.querySelectorAll<HTMLElement>('div,section,article')].filter(visible);
  const qualifies = (node: HTMLElement) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textParts: string[] = [];
    while (walker.nextNode()) textParts.push(walker.currentNode.textContent ?? '');
    const text = textParts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!/\btest result\b/i.test(text)) return false;
    const hasInputOutput = /\binput\b/i.test(text) && /\boutput\b/i.test(text);
    const hasCase = node.querySelector('[data-e2e-locator="console-testcase-tag"]') !== null ||
      [...node.querySelectorAll('button')].some(button => /^case\s+\d+$/i.test((button.textContent ?? '').trim()));
    return hasInputOutput && hasCase;
  };

  const matching = candidates.filter(qualifies);
  const matchingSet = new Set(matching);

  // Ancestors repeat all descendant text, so checking the parent's text
  // incorrectly rejects every valid panel. Keep the smallest matching panel.
  return matching.filter(node =>
    ![...node.querySelectorAll<HTMLElement>('div,section,article')]
      .some(descendant => matchingSet.has(descendant))
  );
}
/**
 * Finds the complete testcase panel.
 *
 * The input fields are siblings of the testcase tab row,
 * so they are NOT inside findTestcaseRegion().
 */
export function findTestcasePanel(
  region: HTMLElement
): HTMLElement | null {
  let current: HTMLElement | null =
    region;

  for (
    let depth = 0;
    current && depth < 6;
    depth++
  ) {
    if (
      current.querySelector(
        '[data-e2e-locator="console-testcase-input"]'
      )
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

export function findActiveTestcaseTab(
  region: HTMLElement
): HTMLElement | null {
  const taggedTabs = [
    ...region.querySelectorAll<HTMLElement>(
      '[data-e2e-locator="console-testcase-tag"]'
    ),
  ].filter(visible);

  const tabs = taggedTabs.length > 0
    ? taggedTabs
    : [...region.querySelectorAll<HTMLButtonElement>('button')]
        .filter(button =>
          visible(button) &&
          /^case\s+\d+$/i.test((button.textContent ?? '').trim())
        );

  return (
    tabs.find(tab =>
      tab.classList.contains('bg-fill-3') ||
      tab.classList.contains('dark:bg-dark-fill-3')
    ) ??
    tabs.find(tab =>
      tab.getAttribute('aria-selected') === 'true'
    ) ??
    tabs[0] ??
    null
  );
}

export function findEditor(): HTMLElement | null {
  return (
    [
      ...document.querySelectorAll<HTMLElement>(
        '.monaco-editor'
      ),
    ].find(visible) ?? null
  );
}
