import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const SAME_LINE_LOOP_SOURCE = [
  'class Solution {',
  '  public int run() {',
  '    int result = helper();',
  '    return result;',
  '  }',
  '  private int helper() {',
  '    int visits = 0;',
  '    while (visits < 3) visits++;',
  '    return visits;',
  '  }',
  '}',
].join('\n');

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
    : `<section class="testcase-panel"><div class="console-tabs"><button>Testcase</button><button>Test Result</button></div><div class="case-region">${cases}</div><div>Input <input data-e2e-locator="console-testcase-input" value="${input}"> Output —</div><div class="result-panel" style="display:none" aria-hidden="true"><h2>Test Result</h2><div>Wrong Answer</div>Input ${input} Output mismatch<div class="case-region">${cases}</div></div></section>`;
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

const arrayResponse = {
  success: true,
  kind: 'OK',
  result: '9',
  states: [
    { sequence: 1, line: 2, method: 'sum', depth: 1, variables: { nums: { $arrayId: 'nums1', $type: 'int[]', values: [2, 7, 11, 15] }, i: 0, total: 0 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['sum'], lastEvent: { type: 'METHOD_ENTER', line: 2, method: 'sum' } },
    { sequence: 2, line: 4, method: 'sum', depth: 1, variables: { nums: { $arrayId: 'nums1', $type: 'int[]', values: [2, 7, 11, 15] }, i: 1, total: 2 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['sum'], lastEvent: { type: 'STEP', line: 4, method: 'sum' } },
    { sequence: 3, line: 5, method: 'sum', depth: 1, variables: { nums: { $arrayId: 'nums1', $type: 'int[]', values: [2, 7, 11, 15] }, i: 1, total: 9 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['sum'], lastEvent: { type: 'STEP', line: 5, method: 'sum' } },
    { sequence: 4, line: 7, method: 'sum', depth: 0, variables: { total: 9 }, arrays: {}, dataStructures: {}, objects: {}, callStack: [], lastEvent: { type: 'PROGRAM_END', line: 7, method: 'sum' } },
  ],
};

for (const flow of [
  { name: 'selected default testcase', kind: 'default' as const, label: 'Case 2', argument: '[1,2]' },
  { name: 'custom testcase', kind: 'custom' as const, label: 'Custom', argument: '[4,5]' },
  { name: 'failed submission Use Testcase', kind: 'failed' as const, label: 'Case 1', argument: '[7,8]' },
]) {
  test(`Chrome extension visualizes the ${flow.name} in the new workspace`, async () => {
    activeResponse = response;
    received.length = 0;
    const { context, page, profile } = await launchPage(flow.kind);
    try {
      if (flow.kind === 'default') await page.getByRole('button', { name: 'Case 2' }).click();
      const visualize = flow.kind === 'failed'
        ? page.locator('[data-yourvision-result-visualize="true"]')
        : page.locator('[data-yourvision-visualize="true"]');
      await visualize.click();

      const host = page.locator('[data-yourvision-host="true"]');
      await expect(host.locator('.yv-workspace')).toBeVisible();
      await expect(host.locator('.yv-statement')).toContainText('public int sum');
      await expect(host.locator('.yv-case')).toHaveText(flow.label);
      await expect(host.locator('.yv-array-scene')).toBeVisible();
      await expect(page.locator('.monaco-editor .view-line[data-line="2"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
      if (flow.kind !== 'default') {
        await expect(host.locator('.yv-case-kind')).toHaveText(flow.kind === 'failed' ? 'Failed testcase' : 'Custom');
      }
      if (flow.kind === 'default') {
        await page.locator('.native-content').evaluate(node => node.append(document.createElement('span')));
        await expect(page.locator('[data-yourvision-tab="true"]')).toHaveAttribute('aria-selected', 'true');
      }
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

test('Chrome extension renders the new array scene and pointer state', async () => {
  activeResponse = arrayResponse;
  const { context, page, profile } = await launchPage('default');
  try {
    await page.locator('[data-yourvision-visualize="true"]').click();
    const host = page.locator('[data-yourvision-host="true"]');
    await expect(host.locator('.yv-array-name')).toContainText('nums');
    await expect(host.locator('.yv-array-cell')).toHaveCount(4);
    await expect(host.locator('.yv-array-value').first()).toHaveText('2');
    await expect(host.locator('.yv-array-value').nth(3)).toHaveText('15');
    await expect(host.locator('.yv-array-index')).toHaveCount(4);
    await expect(host.locator('.yv-array-pointer')).toContainText('i');
    await host.getByRole('button', { name: 'Next →' }).click();
    await expect(host.locator('.yv-array-pointer')).toContainText('i');
    await expect(host.locator('.yv-var-name').filter({ hasText: 'total' })).toHaveText('total');
  } finally {
    await context.close();
    await rm(profile, { recursive: true });
  }
});

test('Chrome extension keeps source highlighting and keyboard stepping working', async () => {
  activeResponse = response;
  const { context, page, profile } = await launchPage('default');
  try {
    await page.locator('[data-yourvision-visualize="true"]').click();
    const host = page.locator('[data-yourvision-host="true"]');
    await host.getByRole('button', { name: 'Next →' }).click();
    await expect(host.locator('.yv-workspace-step')).toContainText('2 / 3');
    await expect(host.locator('.yv-statement')).toContainText('int total = 0');
    await host.getByRole('button', { name: '← Prev' }).click();
    await expect(host.locator('.yv-workspace-step')).toContainText('1 / 3');
    await page.keyboard.press('ArrowRight');
    await expect(host.locator('.yv-workspace-step')).toContainText('2 / 3');
    await expect(page.locator('.monaco-editor .view-line[data-line="3"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
    await page.keyboard.press('ArrowLeft');
    await expect(host.locator('.yv-workspace-step')).toContainText('1 / 3');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Chrome extension uses the source-matching Monaco editor when a decoy exists', async () => {
  activeResponse = response;
  const { context, page, profile } = await launchPage('default');
  try {
    await page.evaluate(() => {
      const decoy = document.createElement('div');
      decoy.className = 'monaco-editor';
      decoy.innerHTML = '<div class="view-lines"><div class="view-line" data-line="1" style="top:0px">class Example {</div><div class="view-line" data-line="2" style="top:20px">  public int unrelated() {</div></div><div class="margin-view-overlays"><div class="line-numbers" style="top:0px">1</div><div class="line-numbers" style="top:20px">2</div></div>';
      document.querySelector('.monaco-editor')?.before(decoy);
    });
    await page.locator('[data-yourvision-visualize="true"]').click();
    const editors = page.locator('.monaco-editor');
    await expect(editors).toHaveCount(2);
    await expect(editors.nth(1).locator('.view-line[data-line="2"]')).toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
    await expect(editors.nth(0).locator('.view-line[data-line="2"]')).not.toHaveCSS('box-shadow', 'rgb(255, 161, 22) 2px 0px 0px 0px inset');
  } finally {
    await context.close();
    await rm(profile, { recursive: true });
  }
});

test('Chrome extension renders runtime errors without breaking the workspace', async () => {
  activeResponse = {
    success: false,
    kind: 'RUNTIME_ERROR',
    result: '',
    error: 'java.lang.ArithmeticException: / by zero',
    errorLine: 5,
    states: [
      { sequence: 1, line: 5, method: 'sum', depth: 1, variables: { i: 0 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['sum'], lastEvent: { type: 'RUNTIME_ERROR', line: 5, method: 'sum', data: { message: 'java.lang.ArithmeticException: / by zero' } } }
    ],
  };
  const { context, page, profile } = await launchPage('default');
  try {
    await page.locator('[data-yourvision-visualize="true"]').click();
    const host = page.locator('[data-yourvision-host="true"]');
    await expect(host.locator('.yv-workspace-error')).toContainText('RUNTIME_ERROR');
  } finally {
    await context.close();
    await rm(profile, { recursive: true });
  }
});

test('Chrome extension navigates repeated-line checkpoints through the new workspace', async () => {
  activeResponse = {
    success: true,
    kind: 'OK',
    result: '3',
    states: [
      { sequence: 1, line: 2, method: 'run', depth: 1, variables: {}, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run'], lastEvent: { type: 'METHOD_ENTER', line: 2, method: 'run' } },
      { sequence: 2, line: 9, method: 'helper', depth: 2, variables: { visits: 0 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run', 'helper'], lastEvent: { type: 'STEP', line: 9, method: 'helper' } },
      { sequence: 3, line: 9, method: 'helper', depth: 2, variables: { visits: 1 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run', 'helper'], lastEvent: { type: 'STEP', line: 9, method: 'helper' } },
      { sequence: 4, line: 9, method: 'helper', depth: 2, variables: { visits: 2 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run', 'helper'], lastEvent: { type: 'STEP', line: 9, method: 'helper' } },
      { sequence: 5, line: 9, method: 'helper', depth: 2, variables: { visits: 3 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run', 'helper'], lastEvent: { type: 'STEP', line: 9, method: 'helper' } },
      { sequence: 6, line: 9, method: 'helper', depth: 2, variables: { visits: 3 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run', 'helper'], lastEvent: { type: 'METHOD_EXIT', line: 10, method: 'helper' } },
      { sequence: 7, line: 3, method: 'run', depth: 1, variables: { result: 3 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run'], lastEvent: { type: 'STEP', line: 3, method: 'run' } },
      { sequence: 8, line: 4, method: 'run', depth: 1, variables: { result: 3 }, arrays: {}, dataStructures: {}, objects: {}, callStack: ['run'], lastEvent: { type: 'STEP', line: 4, method: 'run' } },
      { sequence: 9, line: 4, method: 'run', depth: 0, variables: { result: 3 }, arrays: {}, dataStructures: {}, objects: {}, callStack: [], lastEvent: { type: 'PROGRAM_END', line: 4, method: 'run', data: { returnValue: 3 } } },
    ],
  };
  const { context, page, profile } = await launchPage('default', SAME_LINE_LOOP_SOURCE);
  try {
    await page.locator('[data-yourvision-visualize="true"]').click();
    const host = page.locator('[data-yourvision-host="true"]');
    for (let i = 0; i < 5; i++) await host.getByRole('button', { name: 'Next →' }).click();
    await expect(host.locator('.yv-statement')).toContainText('return visits');
    await host.getByRole('button', { name: 'Next →' }).click();
    await expect(host.locator('.yv-statement')).toContainText('int result');
    await host.getByRole('button', { name: 'Next →' }).click();
    await expect(host.locator('.yv-statement')).toContainText('return result');
    await host.getByRole('button', { name: 'Next →' }).click();
    await expect(host.locator('.yv-output')).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { recursive: true });
  }
});