import { createRoot, type Root } from 'react-dom/client';
import { VisualizerPanel } from '../components/VisualizerPanel';
import styles from '../components/styles.css?inline';
import { readLeetCodeTheme, themeVariables } from '../theme/leetcode-theme';
import { findLeftContentHost, findLeftTabList, findTestcaseRegion } from './selectors';
import { readUserSource } from './code-source';
import { inferMethod } from './method';
import { readSelectedTestcase } from './dom-testcase';
import { runVisualization } from '../api/backend';
import { sessionStore } from '../state/store';

let root: Root | null = null;
let host: HTMLElement | null = null;
let tabButton: HTMLButtonElement | null = null;
let nativeChildren = new Map<HTMLElement, string>();
let observer: MutationObserver | null = null;

function setNativeHidden(hidden: boolean) {
  if (!host) return;
  for (const child of [...host.children] as HTMLElement[]) {
    if (child.dataset.yourvisionHost === 'true') continue;
    if (hidden) {
      if (!nativeChildren.has(child)) nativeChildren.set(child, child.style.display);
      child.style.display = 'none';
    } else if (nativeChildren.has(child)) {
      child.style.display = nativeChildren.get(child) ?? '';
      nativeChildren.delete(child);
    }
  }
}

function activateTab() {
  if (!host || !tabButton) return;
  setNativeHidden(true);
  host.style.position ||= 'relative';
  const yv = host.querySelector<HTMLElement>('[data-yourvision-host="true"]');
  if (yv) yv.style.display = 'block';
  tabButton.dataset.state = 'active';
  tabButton.setAttribute('aria-selected', 'true');
  tabButton.style.color = 'inherit';
  tabButton.style.borderBottom = '2px solid #ffa116';
  sessionStore.set({ open: true });
}

function deactivateTab() {
  if (!host || !tabButton) return;
  const yv = host.querySelector<HTMLElement>('[data-yourvision-host="true"]');
  if (yv) yv.style.display = 'none';
  setNativeHidden(false);
  tabButton.dataset.state = 'inactive';
  tabButton.setAttribute('aria-selected', 'false');
  tabButton.style.borderBottom = '';
  sessionStore.set({ open: false, playing: false });
}

export function injectYourVisionTab(): boolean {
  if (document.querySelector('[data-yourvision-tab="true"]')) return true;
  const tabList = findLeftTabList();
  if (!tabList) return false;
  host = findLeftContentHost(tabList);
  if (!host) return false;

  const nativeTab = tabList.querySelector<HTMLElement>('[role="tab"],button');
  tabButton = document.createElement('button');
  tabButton.dataset.yourvisionTab = 'true';
  tabButton.setAttribute('role','tab');
  tabButton.setAttribute('aria-selected','false');
  tabButton.textContent = 'YourVision';
  if (nativeTab?.className) tabButton.className = nativeTab.className;
  Object.assign(tabButton.style, { background:'transparent', cursor:'pointer', whiteSpace:'nowrap' });
  tabButton.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); activateTab(); });
  tabList.appendChild(tabButton);

  const panelHost = document.createElement('div');
  panelHost.dataset.yourvisionHost = 'true';
  panelHost.style.cssText = 'display:none;height:100%;min-height:280px;overflow:hidden;';
  host.appendChild(panelHost);
  const shadow = panelHost.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = themeVariables(readLeetCodeTheme(host)) + styles;
  const mount = document.createElement('div'); mount.style.height='100%';
  shadow.append(style,mount);
  root = createRoot(mount); root.render(<VisualizerPanel/>);

  tabList.addEventListener('click', e => {
    const target = (e.target as Element).closest('[role="tab"],button');
    if (target && target !== tabButton && !target.closest('[data-yourvision-tab="true"]')) deactivateTab();
  }, true);
  return true;
}

async function visualize() {
  try {
    const source = await readUserSource();
    const method = inferMethod(source);
    const testcase = readSelectedTestcase(method);
    sessionStore.begin(source, testcase);
    activateTab();
    const response = await runVisualization(source, method.name, testcase.orderedArguments);
    sessionStore.finish(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    sessionStore.fail(message);
    activateTab();
  }
}

export function injectVisualizeButton(): boolean {
  if (document.querySelector('[data-yourvision-visualize="true"]')) return true;
  const region = findTestcaseRegion();
  if (!region) return false;

  const button = document.createElement('button');
  button.dataset.yourvisionVisualize = 'true';
  button.textContent = 'Visualize';
  const native = [...region.querySelectorAll<HTMLButtonElement>('button')].find(b => /run/i.test(b.innerText));
  if (native?.className) button.className = native.className;
  Object.assign(button.style, { marginLeft:'8px', color:'#ffa116', cursor:'pointer' });
  button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); void visualize(); });

  const actionRow = native?.parentElement ?? region;
  if (native?.parentElement) native.insertAdjacentElement('afterend',button);
  else {
    Object.assign(button.style, { position:'absolute', right:'12px', bottom:'10px', zIndex:'3' });
    const rs = getComputedStyle(actionRow); if (rs.position === 'static') actionRow.style.position='relative';
    actionRow.appendChild(button);
  }
  return true;
}

export function installLeetCodeIntegration() {
  const attempt = () => { injectYourVisionTab(); injectVisualizeButton(); };
  attempt();
  observer?.disconnect();
  observer = new MutationObserver(() => requestAnimationFrame(attempt));
  observer.observe(document.body,{childList:true,subtree:true});
  let lastHref = location.href;
  setInterval(()=>{ if(location.href!==lastHref){lastHref=location.href; root?.unmount(); root=null; tabButton=null; host=null; nativeChildren.clear(); document.querySelectorAll('[data-yourvision-tab],[data-yourvision-visualize],[data-yourvision-host]').forEach(n=>n.remove()); setTimeout(attempt,700);} },800);
}
