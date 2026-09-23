import { beforeEach, describe, expect, it } from 'vitest';
import {
  findLeftTabList,
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
});