import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameLineLoopStates, SAME_LINE_LOOP_SOURCE } from '../src/test/sameLineLoopTrace';

const extensionDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const pageUrl = 'https://leetcode.com/problems/browser-harness/';
const source = [
  'class Solution {',
  '  public int sum(int[] nums) {',
  '    int total = 0;',
  '    for (int i = 0; i < nums.length; i++) {',
  '      total += nums[i];',
  '    }',
  '    return total;',
  '  }',
  '}',
].join('\n');

const response = {
  success: true,
  kind: 'OK',
  result: '3',
  states: [
    { sequence: 1, line: 2, method: 'sum', depth: 1, variables: { nums: { $arrayId: 'a1', $type: 'int[]', values: [1, 2] } }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['sum'], lastEvent: { type: 'METHOD_ENTER', line: 2, method: 'sum' } },
    { sequence: 2, line: 3, method: 'sum', depth: 1, variables: { total: 0 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['sum'], lastEvent: { type: 'STEP', line: 3, method: 'sum' } },
    { sequence: 3, line: 7, method: 'sum', depth: 0, variables: { total: 3 }, arrays: {}, dataStructures: {}, objects: {}, callStack: [], lastEvent: { type: 'PROGRAM_END', line: 7, method: 'sum' } },
  ],
};
let activeResponse: Record<string, unknown> = response;

const received: Array<Record<string, unknown>> = [];
let backend: Server;

test.beforeAll(async () => {
  backend = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/visualize') {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push(JSON.parse(body) as Record<string, unknown>);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(activeResponse));
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    backend.once('error', reject);
    backend.listen(3000, '0.0.0.0', resolveListen);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose, reject) => backend.close(error => error ? reject(error) : resolveClose()));
});

function leetCodePage(flow: 'default' | 'custom' | 'failed', editorSource = source): string {
  const cases = flow === 'custom'
    ? '<button data-e2e-locator="console-testcase-tag" class="bg-fill-3" aria-selected="true">Custom</button>'
    : flow === 'default'
      ? '<button data-e2e-locator="console-testcase-tag" class="bg-fill-3" aria-selected="true">Case 1</button><button data-e2e-locator="console-testcase-tag" aria-selected="false">Case 2</button>'
      : '<button data-e2e-locator="console-testcase-tag" class="bg-fill-3" aria-selected="true">Case 1</button>';
  const input = flow === 'custom' ? '[4,5]' : flow === 'default' ? '[1,2]' : '[7,8]';
  const testcase = flow === 'failed'
    ? `<section class="result-panel"><h2>Test Result</h2><div class="result-details"><div>Wrong Answer — Use Testcase</div><div>Input <input data-e2e-locator="console-testcase-input" value="${input}"> Output <span>9</span></div><div class="case-region">${cases}</div></div></section>`
    : `<section class="testcase-panel"><div class="case-region">${cases}</div><input data-e2e-locator="console-testcase-input" value="${input}"></section>`;
  const lines = editorSource.split('\n').map((line, i) => `<div class="view-line" data-line="${i + 1}" style="top:${i * 20}px">${line.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>`).join('');
  const gutters = editorSource.split('\n').map((_, i) => `<div class="line-numbers" style="top:${i * 20}px">${i + 1}</div>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:14px Arial;margin:0;padding:16px}.flexlayout__tabset{width:900px;height:620px}
    .flexlayout__tabset_tabbar_inner_tab_container_top{height:44px;display:flex;gap:8px}
    .flexlayout__tab_button_top{display:inline-flex;align-items:center;padding:8px;border:0}
    .flexlayout__tabset_content{height:560px;position:relative}.native-content{height:100%}
    .monaco-editor{position:absolute;top:90px;left:20px;width:600px;height:220px;overflow:auto}
    .view-lines{position:absolute;left:40px;top:0}.view-line{position:absolute;white-space:pre;height:20px;font:14px monospace}
    .margin-view-overlays{position:absolute;left:0;top:0}.line-numbers{position:absolute;height:20px;width:30px;text-align:right}
    .case-region{display:flex;gap:8px}.bg-fill-3{background:#ddd}
  </style></head><body>
    <div id="qd-content"><div class="flexlayout__tabset">
      <div class="flexlayout__tabset_tabbar_inner"><div class="flexlayout__tabset_tabbar_inner_tab_container_top">
        <div class="flexlayout__tab_button_top flexlayout__tab_button--selected"><div class="flexlayout__tab_button_content">Description</div></div>
        <div class="flexlayout__tab_button_top flexlayout__tab_button--unselected"><div class="flexlayout__tab_button_content">Solutions</div></div>
        <div class="flexlayout__tab_button_top flexlayout__tab_button--unselected"><div class="flexlayout__tab_button_content">Editorial</div></div>
      </div></div><div class="flexlayout__tabset_content"><div class="native-content">Problem description</div></div>
    </div>${testcase}
    <div class="monaco-editor"><div class="view-lines">${lines}</div><div class="margin-view-overlays">${gutters}</div></div></div>
    <script>window.monaco={editor:{getModels(){return [{getValue(){return ${JSON.stringify(editorSource)}},getLanguageId(){return 'java'}}]},getEditors(){return []}}};
      document.querySelectorAll('[data-e2e-locator="console-testcase-tag"]').forEach(button=>button.addEventListener('click',()=>{
        document.querySelectorAll('[data-e2e-locator="console-testcase-tag"]').forEach(tab=>{tab.classList.remove('bg-fill-3');tab.setAttribute('aria-selected','false')});
        button.classList.add('bg-fill-3');button.setAttribute('aria-selected','true');
      }));
    </script></body></html>`;
}

async function launchPage(flow: 'default' | 'custom' | 'failed', editorSource = source): Promise<{ context: BrowserContext; page: Page; profile: string }> {
  const profile = await mkdtemp(join(tmpdir(), 'yourvision-chrome-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-sandbox',
    ],
  });
  await context.route('https://leetcode.com/problems/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: leetCodePage(flow, editorSource),
  }));
  const page = await context.newPage();
  await page.goto(pageUrl);
  await expect(page.locator('[data-yourvision-tab="true"]')).toBeVisible();
  return { context, page, profile };
}

for (const flow of [
  { name: 'selected default testcase', kind: 'default' as const, label: 'Case 2', argument: '[1,2]' },
  { name: 'custom testcase', kind: 'custom' as const, label: 'Custom', argument: '[4,5]' },
  { name: 'failed submission Use Testcase', kind: 'failed' as const, label: 'Case 1', argument: '[7,8]' },
]) {
  test(`Chrome extension visualizes the ${flow.name} and steps the real editor highlight`, async () => {
    activeResponse = response;
    received.length = 0;
    const { context, page, profile } = await launchPage(flow.kind);
    try {
      if (flow.kind === 'default') await page.getByRole('button', { name: 'Case 2' }).click();
      await page.locator('[data-yourvision-tab="true"]').click();
      const visualize = flow.kind === 'failed'
        ? page.locator('[data-yourvision-result-visualize="true"]')
        : page.locator('[data-yourvision-visualize="true"]');
      await visualize.click();

      const statement = page.locator('[data-yourvision-host="true"] .yv-statement');
      await expect(statement).toContainText('public int sum');
      await expect(page.locator('.monaco-editor .view-line[data-line="2"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
      await expect(page.locator('[data-yourvision-host="true"] .yv-case')).toHaveText(flow.label);
      if (flow.kind !== 'default') {
        await expect(page.locator('[data-yourvision-host="true"] .yv-case-kind')).toHaveText(flow.kind === 'failed' ? 'Failed testcase' : 'Custom');
      }

      await page.keyboard.press('ArrowRight');
      await expect(statement).toContainText('int total = 0');
      await expect(page.locator('.monaco-editor .view-line[data-line="3"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-yourvision-host="true"] .yv-output')).toContainText('3');
      await expect(page.locator('.monaco-editor .view-line[data-line="7"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        language: 'java',
        source,
        testcase: { method: 'sum', arguments: [flow.argument] },
      });
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}

test('Chrome extension navigates real repeated-line checkpoints through return and caller resume', async () => {
  const states = sameLineLoopStates();
  activeResponse = { success: true, kind: 'OK', result: '4', states };
  received.length = 0;
  const { context, page, profile } = await launchPage('default', SAME_LINE_LOOP_SOURCE);
  try {
    await page.locator('[data-yourvision-tab="true"]').click();
    await page.locator('[data-yourvision-visualize="true"]').click();
    const host = page.locator('[data-yourvision-host="true"]');
    const statement = host.locator('.yv-statement');
    const next = host.getByRole('button', { name: 'Next →' });
    const previous = host.getByRole('button', { name: '← Prev' });
    const visits = host.locator('.yv-var').filter({ has: host.locator('.yv-var-name', { hasText: 'visits' }) });
    const loopStates = states
      .map((state, index) => ({ state, index }))
      .filter(({ state }) => state.method === 'helper' && state.lastEvent?.type === 'STEP' && state.lastEvent.line === 9);
    expect(loopStates.map(({ state }) => state.variables.visits)).toEqual([0, 1, 2, 3]);

    for (let step = 0; step < loopStates[1]!.index; step++) await next.click();
    await expect(statement).toContainText('while (visits++ < 3)');
    await expect(page.locator('.monaco-editor .view-line[data-line="9"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
    await expect(visits).toContainText('1');
    await expect(host.locator('.yv-cell-value').allTextContents()).resolves.toEqual(['1', '0', '0']);
    await next.click();
    await expect(statement).toContainText('while (visits++ < 3)');
    await expect(page.locator('.monaco-editor .view-line[data-line="9"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
    await expect(visits).toContainText('2');
    await expect(host.locator('.yv-cell-value').allTextContents()).resolves.toEqual(['1', '2', '0']);
    await previous.click();
    await expect(visits).toContainText('1');
    await expect(host.locator('.yv-cell-value').allTextContents()).resolves.toEqual(['1', '0', '0']);
    await next.click();
    await next.click();
    await expect(visits).toContainText('3');
    await expect(host.locator('.yv-cell-value').allTextContents()).resolves.toEqual(['1', '2', '3']);

    const returnIndex = states.findIndex(state => state.method === 'helper' && state.lastEvent?.type === 'METHOD_EXIT');
    for (let step = loopStates[3]!.index + 1; step <= returnIndex; step++) await next.click();
    await expect(statement).toContainText('return visits;');
    await expect(page.locator('.monaco-editor .view-line[data-line="10"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
    const resumeIndex = states.findIndex(state => state.method === 'run' && state.lastEvent?.type === 'STEP' && state.line === 3);
    for (let step = returnIndex + 1; step <= resumeIndex; step++) await next.click();
    await expect(statement).toContainText('int result = helper();');
    await expect(host.locator('.yv-stack')).toContainText('run');
    await expect(host.locator('.yv-stack')).not.toContainText('helper');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ language: 'java', source: SAME_LINE_LOOP_SOURCE });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
