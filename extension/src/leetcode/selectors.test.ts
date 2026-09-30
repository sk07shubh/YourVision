import { beforeEach, describe, expect, it } from 'vitest';
import {
  findLeftTabList,
  findTestResultContainers,
  findTestcaseRegion,
} from './selectors';

beforeEach(() => {
  Object.defineProperty(
    HTMLElement.prototype,
    'getBoundingClientRect',
    {
      configurable: true,
      value() {
        return {
          width: 500,
          height: 300,
          top: 500,
          left: 0,
          right: 500,
          bottom: 800,
          x: 0,
          y: 500,
          toJSON() {
            return {};
          },
        };
      },
    }
  );
});

describe('LeetCode selectors', () => {
  it('finds the current FlexLayout left tab container', () => {
    document.body.innerHTML = `
      <div class="flexlayout__tabset_tabbar_inner">
        <div class="flexlayout__tabset_tabbar_inner_tab_container_top">

          <div
            data-layout-path="/ts0/tb0"
            class="flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--selected"
          >
            <div class="flexlayout__tab_button_content">
              <div>Description</div>
            </div>
          </div>

          <div
            data-layout-path="/ts0/tb1"
            class="flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--unselected"
          >
            <div class="flexlayout__tab_button_content">
              <div>Solutions</div>
            </div>
          </div>

          <div
            data-layout-path="/ts0/tb2"
            class="flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--unselected"
          >
            <div class="flexlayout__tab_button_content">
              <div>Editorial</div>
            </div>
          </div>

        </div>
      </div>
    `;

    const result = findLeftTabList();

    expect(result).not.toBeNull();

    expect(
      result?.classList.contains(
        'flexlayout__tabset_tabbar_inner_tab_container_top'
      )
    ).toBe(true);
  });

  it('finds testcase region', () => {
    document.body.innerHTML = `
      <div class="flex flex-wrap items-center gap-x-2 gap-y-4">

        <button
          data-e2e-locator="console-testcase-tag"
          class="font-medium items-center whitespace-nowrap bg-transparent"
        >
          Case 1
        </button>

        <button
          data-e2e-locator="console-testcase-tag"
          class="font-medium items-center whitespace-nowrap bg-transparent"
        >
          Case 2
        </button>

        <button
          data-e2e-locator="console-testcase-tag"
          class="font-medium items-center whitespace-nowrap bg-fill-3"
        >
          Case 3
        </button>

        <button data-state="closed">
          +
        </button>

      </div>
    `;

    const result = findTestcaseRegion();

    expect(result).not.toBeNull();

    expect(
      result?.querySelectorAll(
        '[data-e2e-locator="console-testcase-tag"]'
      ).length
    ).toBe(3);
  });

  it('finds the smallest nested failed-result panel for testcase actions', () => {
    document.body.innerHTML = `
      <section>
        <div class="result-panel">
          <h2>Test Result</h2>
          <div class="result-details">
            <div>Wrong Answer — Use Testcase</div>
            <div>Input <code>nums = [1,2]</code> Output <code>3</code></div>
            <div class="result-cases">
              <button data-e2e-locator="console-testcase-tag">Case 1</button>
            </div>
          </div>
        </div>
      </section>
    `;

    const containers = findTestResultContainers();

    expect(containers).toHaveLength(1);
    expect(containers[0]?.textContent).toContain('Wrong Answer');
    expect(containers[0]?.textContent).toContain('Input');
    expect(containers[0]?.textContent).toContain('Output');
  });

  it('does not treat an inactive Test Result tab as a failed result panel', () => {
    document.body.innerHTML = `
      <section class="console-shell">
        <div class="console-tabs"><button>Testcase</button><button>Test Result</button></div>
        <div class="active-testcase">
          <div class="result-cases"><button data-e2e-locator="console-testcase-tag">Case 2</button></div>
          <div>Input nums = [3,2,4] Output —</div>
        </div>
        <div class="result-panel" style="display:none" aria-hidden="true">
          <h2>Test Result</h2>
          <div>Wrong Answer</div>
          <div>Input nums = [3,2,4] Output [1,2]</div>
          <div class="result-cases"><button data-e2e-locator="console-testcase-tag">Case 2</button></div>
        </div>
      </section>
    `;

    expect(findTestResultContainers()).toHaveLength(0);
  });
});
