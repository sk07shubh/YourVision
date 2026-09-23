import {
  createRoot,
  type Root,
} from 'react-dom/client';

import {
  VisualizerPanel,
} from '../components/VisualizerPanel';

import styles from '../components/styles.css?inline';

import {
  readLeetCodeTheme,
  themeVariables,
} from '../theme/leetcode-theme';

import {
  findLeftContentHost,
  findLeftTabList,
  findTestcaseRegion,
} from './selectors';

import {
  readUserSource,
} from './code-source';

import {
  inferMethod,
} from './method';

import {
  readSelectedTestcase,
} from './dom-testcase';

import {
  runVisualization,
} from '../api/backend';

import {
  sessionStore,
} from '../state/store';

let root: Root | null = null;

let host: HTMLElement | null =
  null;

let tabButton: HTMLElement | null =
  null;

let tabDivider: HTMLElement | null =
  null;

let visualizeButton:
  HTMLButtonElement | null = null;

let observer:
  MutationObserver | null = null;

let yourVisionActive = false;
let originalHostOverflow = '';
let originalHostPosition = '';

const nativeDisplay =
  new Map<
    HTMLElement,
    string
  >();

const nativeTabClasses =
  new Map<
    HTMLElement,
    string
  >();

function getPanelHost():
  HTMLElement | null {
  return host?.querySelector<HTMLElement>(
    ':scope > [data-yourvision-host="true"]'
  ) ?? null;
}

function nativeTabs():
  HTMLElement[] {
  if (!tabButton) {
    return [];
  }

  const list =
    tabButton.parentElement;

  if (!list) {
    return [];
  }

  return [
    ...list.querySelectorAll<HTMLElement>(
      ':scope > .flexlayout__tab_button_top'
    ),
  ].filter(
    tab =>
      tab !== tabButton
  );
}

function hideNativeContent() {
  if (!host) {
    return;
  }

  if (!originalHostOverflow) {
    originalHostOverflow = host.style.overflow;
  }

  if (!originalHostPosition) {
    originalHostPosition = host.style.position;
  }

  host.style.overflow = 'hidden';
  host.style.position = 'relative';

  for (
    const child of [
      ...host.children,
    ] as HTMLElement[]
  ) {
    if (
      child.dataset.yourvisionHost ===
      'true'
    ) {
      continue;
    }

    if (
      !nativeDisplay.has(child)
    ) {
      nativeDisplay.set(
        child,
        child.style.display
      );
    }

    child.style.setProperty(
      'display',
      'none',
      'important'
    );

    child.style.setProperty(
      'visibility',
      'hidden',
      'important'
    );

    child.style.setProperty(
      'pointer-events',
      'none',
      'important'
    );
  }
}

function restoreNativeContent() {
  for (
    const [
      element,
      display,
    ] of nativeDisplay
  ) {
    if (!element.isConnected) {
      continue;
    }

    if (display) {
      element.style.setProperty(
        'display',
        display
      );
    } else {
      element.style.removeProperty(
        'display'
      );
    }

    element.style.removeProperty(
      'visibility'
    );

    element.style.removeProperty(
      'pointer-events'
    );
  }

  nativeDisplay.clear();

  if (host) {
    host.style.overflow =
      originalHostOverflow;

    host.style.position =
      originalHostPosition;
  }

  originalHostOverflow = '';
  originalHostPosition = '';
}

function markNativeTabsInactive() {
  for (
    const tab of nativeTabs()
  ) {
    if (
      !nativeTabClasses.has(tab)
    ) {
      nativeTabClasses.set(
        tab,
        tab.className
      );
    }

    tab.classList.remove(
      'flexlayout__tab_button--selected'
    );

    tab.classList.add(
      'flexlayout__tab_button--unselected'
    );
  }
}

function restoreNativeTabClasses() {
  for (
    const [
      tab,
      className,
    ] of nativeTabClasses
  ) {
    if (tab.isConnected) {
      tab.className =
        className;
    }
  }

  nativeTabClasses.clear();
}

function markYourVisionSelected() {
  if (!tabButton) {
    return;
  }

  tabButton.classList.remove(
    'flexlayout__tab_button--unselected'
  );

  tabButton.classList.add(
    'flexlayout__tab_button--selected'
  );

  tabButton.setAttribute(
    'aria-selected',
    'true'
  );
}

function markYourVisionUnselected() {
  if (!tabButton) {
    return;
  }

  tabButton.classList.remove(
    'flexlayout__tab_button--selected'
  );

  tabButton.classList.add(
    'flexlayout__tab_button--unselected'
  );

  tabButton.setAttribute(
    'aria-selected',
    'false'
  );
}

function enforceActiveLayout() {
  if (!yourVisionActive) {
    return;
  }

  hideNativeContent();
  markNativeTabsInactive();
  markYourVisionSelected();

  const panel =
    getPanelHost();

  if (panel) {
    panel.style.display =
      'block';
  }
}

function activateTab() {
  if (
    !host ||
    !tabButton
  ) {
    return;
  }

  yourVisionActive = true;

  enforceActiveLayout();

  tabButton.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });

  sessionStore.set({
    open: true,
  });
}

function deactivateTab() {
  if (
    !host ||
    !tabButton
  ) {
    return;
  }

  yourVisionActive = false;

  const panel =
    getPanelHost();

  if (panel) {
    panel.style.display =
      'none';
  }

  restoreNativeContent();
  restoreNativeTabClasses();
  markYourVisionUnselected();

  sessionStore.set({
    open: false,
    playing: false,
  });
}

function removeDuplicateIds(
  element: HTMLElement
) {
  element.removeAttribute('id');
  element.removeAttribute(
    'data-layout-path'
  );

  element
    .querySelectorAll<HTMLElement>(
      '[id], [data-layout-path]'
    )
    .forEach(child => {
      child.removeAttribute(
        'id'
      );

      child.removeAttribute(
        'data-layout-path'
      );
    });
}

export function injectYourVisionTab():
  boolean {
  const existing =
    document.querySelector<HTMLElement>(
      '[data-yourvision-tab="true"]'
    );

  if (existing) {
    tabButton = existing;

    if (yourVisionActive) {
      enforceActiveLayout();
    }

    return true;
  }

  const tabList =
    findLeftTabList();

  if (!tabList) {
    return false;
  }

  host =
    findLeftContentHost(
      tabList
    );

  if (!host) {
    return false;
  }

  const nativeTabs = [
    ...tabList.querySelectorAll<HTMLElement>(
      ':scope > .flexlayout__tab_button_top'
    ),
  ];

  const template =
    nativeTabs[
      nativeTabs.length - 1
    ];

  if (!template) {
    return false;
  }

  const dividerTemplate =
    [...tabList.children]
      .reverse()
      .find(
        child =>
          child instanceof
            HTMLElement &&
          child.classList.contains(
            'flexlayout__tabset_tab_divider'
          )
      ) as HTMLElement | undefined;

  tabButton =
    template.cloneNode(
      true
    ) as HTMLElement;

  removeDuplicateIds(
    tabButton
  );

  tabButton.dataset
    .yourvisionTab =
    'true';

  tabButton.setAttribute(
    'role',
    'tab'
  );

  tabButton.setAttribute(
    'aria-selected',
    'false'
  );

  tabButton.classList.remove(
    'flexlayout__tab_button--selected'
  );

  tabButton.classList.add(
    'flexlayout__tab_button--unselected'
  );

  const content =
  tabButton.querySelector<HTMLElement>(
    '.flexlayout__tab_button_content'
  );

if (content) {
  content.textContent = '';

  Object.assign(content.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    height: '100%',
    lineHeight: '1',
    whiteSpace: 'nowrap',
  });

  const icon =
    document.createElement('img');

  icon.src =
    chrome.runtime.getURL(
      'yourvision-icon.png'
    );

  icon.alt = '';

  Object.assign(icon.style, {
    width: '18px',
    height: '18px',
    display: 'block',
    objectFit: 'contain',
    flex: '0 0 18px',
    margin: '0',
    padding: '0',
    verticalAlign: 'middle',
  });

  const label =
    document.createElement('span');

  label.textContent =
    'YourVision';

  Object.assign(label.style, {
    display: 'inline-flex',
    alignItems: 'center',
    height: '100%',
    lineHeight: '1',
    margin: '0',
    padding: '0',
  });

  content.append(
    icon,
    label
  );
} else {
  tabButton.textContent =
    'YourVision';
}
  tabButton.addEventListener(
    'pointerdown',
    event => {
      event.preventDefault();
      event.stopPropagation();

      activateTab();
    }
  );

  tabButton.addEventListener(
    'click',
    event => {
      event.preventDefault();
      event.stopPropagation();

      activateTab();
    }
  );

  const descriptionTab =
  nativeTabs[0];

const solutionsTab =
  nativeTabs[1];

if (descriptionTab && solutionsTab) {
  const divider =
    dividerTemplate
      ? dividerTemplate.cloneNode(
          true
        ) as HTMLElement
      : null;

  if (divider) {
    divider.dataset
      .yourvisionDivider =
      'true';

    tabList.insertBefore(
      divider,
      solutionsTab
    );

    tabDivider = divider;
  }

  tabList.insertBefore(
    tabButton,
    solutionsTab
  );
} else {
  tabList.appendChild(
    tabButton
  );
}

  const panelHost =
    document.createElement(
      'div'
    );

  panelHost.dataset
    .yourvisionHost =
    'true';

  panelHost.style.cssText =
  [
    'display:none',
    'width:100%',
    'height:100%',
    'min-height:280px',
    'overflow:auto',
    'background:var(--bg-fill-1, #1f1f1f)',
    'position:relative',
    'z-index:2',
    'box-sizing:border-box',
  ].join(';');

  host.appendChild(
    panelHost
  );

  const shadow =
    panelHost.attachShadow({
      mode: 'open',
    });

  const style =
    document.createElement(
      'style'
    );

  style.textContent =
    themeVariables(
      readLeetCodeTheme(host)
    ) +
    styles;

  const mount =
    document.createElement(
      'div'
    );

  mount.style.width =
  '100%';

mount.style.height =
  '100%';

mount.style.minHeight =
  '100%';

mount.style.boxSizing =
  'border-box';

  shadow.append(
    style,
    mount
  );

  root =
    createRoot(mount);

  root.render(
    <VisualizerPanel />
  );

  tabList.addEventListener(
    'pointerdown',
    event => {
      const target =
        (
          event.target as Element
        ).closest<HTMLElement>(
          '.flexlayout__tab_button_top'
        );

      if (
        target &&
        target !== tabButton
      ) {
        deactivateTab();
      }
    },
    true
  );

  return true;
}

async function visualize() {
  try {
    const source =
      await readUserSource();

    const method =
      inferMethod(source);

    const testcase =
      readSelectedTestcase(
        method
      );

    sessionStore.begin(
      source,
      testcase
    );

    activateTab();

    const response =
      await runVisualization(
        source,
        method.name,
        testcase.orderedArguments
      );

    sessionStore.finish(
      response
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    sessionStore.fail(
      message
    );

    activateTab();
  }
}

function moveVisualizeToEnd(
  region: HTMLElement
) {
  if (
    !visualizeButton ||
    !visualizeButton.isConnected
  ) {
    return;
  }

  if (
    visualizeButton.parentElement !==
      region ||
    region.lastElementChild !==
      visualizeButton
  ) {
    region.appendChild(
      visualizeButton
    );
  }
}

export function injectVisualizeButton():
  boolean {
  const region =
    findTestcaseRegion();

  if (!region) {
    return false;
  }

  const existing =
    document.querySelector<HTMLButtonElement>(
      '[data-yourvision-visualize="true"]'
    );

  if (existing) {
    visualizeButton =
      existing;

    moveVisualizeToEnd(
      region
    );

    return true;
  }

  const nativeCases = [
    ...region.querySelectorAll<HTMLButtonElement>(
      '[data-e2e-locator="console-testcase-tag"]'
    ),
  ];

  const template =
    nativeCases[
      nativeCases.length - 1
    ];

  if (!template) {
    return false;
  }

  visualizeButton =
    document.createElement(
      'button'
    );

  visualizeButton.dataset
    .yourvisionVisualize =
    'true';

  visualizeButton.type =
    'button';

  visualizeButton.textContent =
    'Visualize';

  visualizeButton.className =
    template.className;

  visualizeButton.classList.remove(
    'bg-fill-3',
    'dark:bg-dark-fill-3'
  );

  visualizeButton.classList.add(
    'bg-transparent',
    'dark:bg-dark-transparent'
  );

  Object.assign(
    visualizeButton.style,
    {
      color: '#ffa116',
      cursor: 'pointer',
      flex: '0 0 auto',
      whiteSpace: 'nowrap',
    }
  );

  visualizeButton.addEventListener(
    'pointerdown',
    event => {
      event.stopPropagation();
    }
  );

  visualizeButton.addEventListener(
    'click',
    event => {
      event.preventDefault();
      event.stopPropagation();

      void visualize();
    }
  );

  region.appendChild(
    visualizeButton
  );

  return true;
}

function cleanup() {
  root?.unmount();

  root = null;
  host = null;
  tabButton = null;
  tabDivider = null;
  visualizeButton = null;

  yourVisionActive =
    false;
  originalHostOverflow = '';
originalHostPosition = '';

  nativeDisplay.clear();
  nativeTabClasses.clear();

  document
    .querySelectorAll(
      '[data-yourvision-tab],' +
      '[data-yourvision-divider],' +
      '[data-yourvision-visualize],' +
      '[data-yourvision-host]'
    )
    .forEach(node =>
      node.remove()
    );
}

export function installLeetCodeIntegration() {
  const attempt = () => {
    injectYourVisionTab();
    injectVisualizeButton();

    if (yourVisionActive) {
      enforceActiveLayout();
    }
  };

  attempt();

  observer?.disconnect();

  let scheduled = false;

  observer =
    new MutationObserver(() => {
      if (scheduled) {
        return;
      }

      scheduled = true;

      requestAnimationFrame(
        () => {
          scheduled = false;
          attempt();
        }
      );
    });

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true,
    }
  );

  let lastHref =
    location.href;

  setInterval(
    () => {
      if (
        location.href ===
        lastHref
      ) {
        return;
      }

      lastHref =
        location.href;

      cleanup();

      setTimeout(
        attempt,
        700
      );
    },
    800
  );
}