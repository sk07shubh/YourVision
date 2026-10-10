#!/usr/bin/env python3
"""Build a faithful local replica of a LeetCode problem page.

Fetches the REAL server-rendered HTML from leetcode.com (no Cloudflare
block on this endpoint), preserves the genuine DOM structure the
YourVision extension hooks into (#qd-content, FlexLayout tabs, etc.),
strips the Next.js client bundles that can't hydrate offline, and injects
a working Monaco editor + test-case UI in the exact locations the
extension's selectors expect.

Usage:
    python3 build_replica.py <problem-slug> [output.html]
    e.g. python3 build_replica.py two-sum

The output is a self-contained HTML file. Serve it over HTTP(S) and point
the extension's content-script matches at it (see dev-harness README).
Problem content (description, starter code, examples) comes from the real
page's __NEXT_DATA__ — nothing is mocked.
"""
import json
import re
import subprocess
import sys
from html import escape

LEETCODE_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
)

# LeetCode's compiled CSS bundles (fetched once, inlined into replicas so the
# page renders faithfully without depending on leetcode.com at view time).
CSS_URLS = [
    "https://leetcode.com/_next/static/css/001e89d2b970c068.css",
    "https://leetcode.com/_next/static/css/56303832030f10b5.css",
]


def fetch_css() -> str:
    """Download and concatenate LeetCode's real stylesheets."""
    parts = []
    for url in CSS_URLS:
        out = subprocess.run(
            ["curl", "-s", "-m", "20", url,
             "-H", f"User-Agent: {LEETCODE_UA}"],
            capture_output=True, text=True, check=True,
        )
        parts.append(out.stdout)
    return "\n".join(parts)

# ---------------------------------------------------------------------------
# 1. Fetch the real page
# ---------------------------------------------------------------------------

def fetch_page(slug: str) -> str:
    url = f"https://leetcode.com/problems/{slug}/"
    out = subprocess.run(
        ["curl", "-s", "-m", "20", url,
         "-H", f"User-Agent: {LEETCODE_UA}",
         "-H", "Accept: text/html"],
        capture_output=True, text=True, check=True,
    )
    html = out.stdout
    if "qd-content" not in html:
        raise RuntimeError(
            f"Fetched page for '{slug}' lacks #qd-content "
            "(blocked or unexpected response)."
        )
    return html


# ---------------------------------------------------------------------------
# 2. Extract real problem data from __NEXT_DATA__
# ---------------------------------------------------------------------------

def extract_next_data(html: str) -> dict:
    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html, re.DOTALL,
    )
    if not m:
        raise RuntimeError("__NEXT_DATA__ not found in page")
    return json.loads(m.group(1))


def find_question(node):
    """Walk the Next.js data tree looking for the question object."""
    if isinstance(node, dict):
        if "titleSlug" in node and "content" in node:
            return node
        for v in node.values():
            found = find_question(v)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = find_question(v)
            if found:
                return found
    return None


# ---------------------------------------------------------------------------
# 3. Build the replica
# ---------------------------------------------------------------------------

MONACO_LOADER = (
    "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js"
)

REPLICA_TEMPLATE = """<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title} - LeetCode Replica (YourVision dev)</title>
<style>
/* ==== REAL LEETCODE CSS (inlined from leetcode.com/_next/static/css) ==== */
{real_css}
</style>
<style>
  /* Minimal replica chrome: real LeetCode DOM is preserved below.
     Only the stripped Next.js runtime is replaced with these basics. */
  html, body {{ margin: 0; padding: 0; height: 100%; background: #1a1a1a;
    color: #eff1f6; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }}
  #replica-banner {{ background: #ffa116; color: #000; font-size: 12px;
    font-weight: 700; padding: 4px 12px; }}
  #replica-banner button {{ margin-left: 12px; }}
  /* Ensure the real FlexLayout containers lay out sanely without the
     Next.js runtime CSS. */
  #qd-content {{ height: calc(100vh - 26px); }}
  .flexlayout__layout {{ height: 100%; }}
  /* Monaco host injected where the real editor mounts */
  #yv-monaco-host {{ width: 100%; height: 420px; min-height: 300px; }}
  /* Test-case console injected below the editor */
  #yv-console {{ border-top: 1px solid #3a3a3a; background: #262626;
    padding: 10px 12px; }}
  #yv-console .testcase-tags {{ display: flex; gap: 6px; margin-bottom: 8px; }}
  #yv-console .testcase-tags button {{ background: #333; border: 1px solid #4a4a4a;
    color: #a3a3a3; padding: 4px 12px; border-radius: 6px; font-size: 12px;
    cursor: pointer; }}
  #yv-console .testcase-tags button.bg-fill-3 {{ background: #404040; color: #eff1f6; }}
  #yv-console textarea[data-e2e-locator="console-testcase-input"] {{
    width: 100%; background: #1a1a1a; border: 1px solid #3a3a3a; color: #eff1f6;
    border-radius: 6px; padding: 8px; font-family: monospace; font-size: 13px; }}
  #yv-console label {{ display: block; font-size: 12px; color: #a3a3a3;
    margin: 8px 0 4px; font-family: monospace; }}
</style>
</head>
<body>
<div id="replica-banner">LEETCODE REPLICA — real captured DOM &middot; problem data from leetcode.com
  <button id="yv-swap-code">Replace code in editor</button>
  <span id="yv-status"></span>
</div>
{body_html}
<script src="{monaco_loader}"></script>
<script>
/* YourVision replica bootstrap: mounts a real Monaco editor and the
   test-case console into the genuine LeetCode DOM, exactly where the
   extension's selectors (extension/src/leetcode/selectors.ts) look. */
(function () {{
  const status = (m) => {{ document.getElementById('yv-status').textContent = m; }};
  const problemData = {problem_json};

  function javaCode() {{
    const s = (problemData.codeSnippets || []).find((x) => x.langSlug === 'java');
    return s ? s.code : '// no Java starter code';
  }}

  function parseExamples(blob) {{
    if (!blob) return [];
    const groups = blob.trim().split(/\\n\\s*\\n/).filter(Boolean);
    if (groups.length > 1) return groups.map((g) => g.trim().split('\\n'));
    const lines = blob.trim().split('\\n');
    const out = [];
    for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2));
    return out;
  }}

  function mountConsole() {{
    // Place the console right after the Monaco host (not after #qd-content,
    // which would put it outside the visible layout).
    let host = document.getElementById('yv-monaco-host');
    if (!host) {{
      // Fallback: create a visible container at the end of body
      host = document.body;
    }}
    let console = document.getElementById('yv-console');
    if (!console) {{
      console = document.createElement('div');
      console.id = 'yv-console';
      console.style.cssText = 'border-top:2px solid #ffa116;background:#262626;' +
        'padding:12px;margin-top:8px;';
      host.after(console);
    }}
    const examples = parseExamples(problemData.exampleTestcases);
    console.innerHTML =
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">Testcases</div>' +
      '<div class="testcase-tags" id="yv-tags"></div><div id="yv-inputs"></div>';
    anchor.after(console);
    const tags = console.querySelector('#yv-tags');
    const inputs = console.querySelector('#yv-inputs');
    function show(i) {{
      inputs.innerHTML = '';
      (examples[i] || []).forEach((line, k) => {{
        const label = document.createElement('label');
        label.textContent = examples[i].length > 1 ? `param${{k + 1}} =` : 'input =';
        const ta = document.createElement('textarea');
        ta.setAttribute('data-e2e-locator', 'console-testcase-input');
        ta.rows = 1;
        ta.value = line.trim();
        inputs.appendChild(label); inputs.appendChild(ta);
      }});
      tags.querySelectorAll('button').forEach((b, j) =>
        b.classList.toggle('bg-fill-3', j === i));
    }}
    examples.forEach((_, i) => {{
      const b = document.createElement('button');
      b.setAttribute('data-e2e-locator', 'console-testcase-tag');
      b.textContent = `Case ${{i + 1}}`;
      b.addEventListener('click', () => show(i));
      tags.appendChild(b);
    }});
    if (examples.length) show(0);
  }}

  function mountMonaco() {{
    // Find the Code tab's tabset, or fall back to creating our own layout.
    // The SSR HTML has tab bars but no content areas (client-rendered).
    const codeTab = [...document.querySelectorAll('.flexlayout__tab_button_top')]
      .find((b) => (b.textContent || '').trim().toLowerCase().startsWith('code'));
    let host = document.getElementById('yv-monaco-host');
    if (!host) {{
      host = document.createElement('div');
      host.id = 'yv-monaco-host';
      // NOTE: do NOT pre-add 'monaco-editor' class — the extension's
      // findEditor() looks for real Monaco instances; Monaco adds the
      // class itself on creation.
      host.style.cssText = 'width:100%;height:400px;min-height:300px;' +
        'border:1px solid #3a3a3a;margin:8px 0;';
      if (codeTab) {{
        // Insert after the Code tab's tabset container
        const tabset = codeTab.closest('.flexlayout__tabset') ||
                       codeTab.closest('[class*="flexlayout"]');
        if (tabset) {{
          tabset.appendChild(host);
        }} else {{
          codeTab.parentElement.after(host);
        }}
      }} else {{
        (document.getElementById('qd-content') || document.body).appendChild(host);
      }}
    }}
    // Load Monaco
    if (typeof require === 'undefined') {{
      status('Monaco loader failed — check network');
      return;
    }}
    require.config({{ paths: {{ vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }} }});
    require(['vs/editor/editor.main'], () => {{
      if (window.yvEditor) window.yvEditor.dispose();
      window.yvEditor = monaco.editor.create(host, {{
        value: javaCode(), language: 'java', theme: 'vs-dark',
        fontSize: 14, minimap: {{ enabled: false }},
        scrollBeyondLastLine: false, automaticLayout: true,
      }});
      status('Editor ready — ' + problemData.title);
    }});
  }}

  document.getElementById('yv-swap-code').addEventListener('click', () => {{
    const code = prompt('Paste Java code to load into the editor:');
    if (code && window.yvEditor) {{
      window.yvEditor.setValue(code);
      status('Code replaced');
    }}
  }});

  /* ---- Full console interactivity: Run wired to the real backend ----
     Mirrors the extension's own flow: editor code + test cases go to
     POST http://127.0.0.1:3000/visualize, and the trace/result renders
     in the Test Result tab. Requires `npm run dev` in backend/. */
  const BACKEND = 'http://127.0.0.1:3000';

  async function backendAlive() {{
    try {{
      const r = await fetch(BACKEND + '/health');
      return r.ok;
    }} catch {{ return false; }}
  }}

  function collectTestcase() {{
    // Gather the currently visible test-case inputs as the backend expects.
    const tas = [...document.querySelectorAll(
      'textarea[data-e2e-locator="console-testcase-input"]'
    )];
    return tas.map((ta) => ta.value);
  }}

  function ensureRunUI() {{
    // Add Run / Test-Result UI to the injected console if not present.
    let bar = document.getElementById('yv-runbar');
    if (bar) return bar;
    const consoleEl = document.getElementById('yv-console');
    if (!consoleEl) return null;
    bar = document.createElement('div');
    bar.id = 'yv-runbar';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin:10px 0;';
    bar.innerHTML =
      '<button id="yv-run" style="background:#2cbb5d;border:none;color:#fff;' +
      'padding:8px 22px;border-radius:6px;font-weight:600;cursor:pointer;">Run</button>' +
      '<button id="yv-result-tab" style="background:#333;border:1px solid #4a4a4a;' +
      'color:#eff1f6;padding:8px 16px;border-radius:6px;cursor:pointer;">Test Result</button>' +
      '<span id="yv-backend" style="font-size:12px;color:#a3a3a3;"></span>';
    consoleEl.prepend(bar);
    const out = document.createElement('div');
    out.id = 'yv-result';
    out.style.cssText = 'display:none;background:#1a1a1a;border:1px solid #3a3a3a;' +
      'border-radius:6px;padding:10px;font-family:monospace;font-size:12px;' +
      'white-space:pre-wrap;max-height:220px;overflow:auto;margin-top:8px;';
    consoleEl.appendChild(out);

    bar.querySelector('#yv-run').addEventListener('click', runCode);
    bar.querySelector('#yv-result-tab').addEventListener('click', () => {{
      const o = document.getElementById('yv-result');
      o.style.display = o.style.display === 'none' ? 'block' : 'none';
    }});
    backendAlive().then((ok) => {{
      bar.querySelector('#yv-backend').textContent = ok
        ? '● backend connected (127.0.0.1:3000)'
        : '○ backend not reachable — start it with `npm run dev` in backend/';
      bar.querySelector('#yv-backend').style.color = ok ? '#2cbb5d' : '#ff375f';
    }});
    return bar;
  }}

  async function runCode() {{
    const out = document.getElementById('yv-result');
    const code = window.yvEditor ? window.yvEditor.getValue() : '';
    const testcase = collectTestcase();
    out.style.display = 'block';
    out.textContent = 'Running…';
    try {{
      const res = await fetch(BACKEND + '/visualize', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ language: 'java', source: code, testcase }}),
      }});
      const json = await res.json();
      const ex = json.execution || json;
      out.textContent = JSON.stringify(ex, null, 2).slice(0, 4000);
      status('Ran — ' + (ex.kind || ex.status || 'done'));
    }} catch (e) {{
      out.textContent = 'Backend error: ' + e.message +
        '\\nIs the backend running? (cd backend && npm run dev)';
      status('Backend unreachable');
    }}
  }}

  /* ---- Working tab switching (Description/Solutions/Editorial/...) ----
     The extension injects its own tab button into this bar and manages
     selection state, so the native tabs must behave like the real site:
     click switches the selected button and swaps the content host. */  function initTabs() {{
    const tabList = document.querySelector(
      '.flexlayout__tabset_tabbar_inner_tab_container_top'
    );
    if (!tabList) return;
    const tabset = tabList.closest('.flexlayout__tabset');
    const contentHost = tabset
      ? tabset.querySelector(':scope > .flexlayout__tabset_content')
      : null;
    // Snapshot the real Description content so we can restore it.
    const originalContent = contentHost ? contentHost.innerHTML : '';
    const tabName = (btn) =>
      (btn.textContent || '').replace(/\\s+/g, ' ').trim();

    // Observe for the extension's injected tab button and wire it too.
    function wireButton(btn) {{
      if (btn.dataset.yvWired) return;
      btn.dataset.yvWired = 'true';
      btn.addEventListener('click', () => {{
        const buttons = [...tabList.querySelectorAll(
          ':scope > .flexlayout__tab_button_top, :scope > [role="tab"]'
        )];
        buttons.forEach((b) => {{
          b.classList.remove('flexlayout__tab_button--selected');
          b.setAttribute('aria-selected', 'false');
        }});
        btn.classList.add('flexlayout__tab_button--selected');
        btn.setAttribute('aria-selected', 'true');
        const name = tabName(btn).toLowerCase();
        if (contentHost) {{
          if (name.includes('description')) {{
            contentHost.innerHTML = originalContent;
          }} else if (btn.dataset.yourvisionTab === 'true') {{
            // Leave the host alone: the extension manages its own panel.
          }} else {{
            contentHost.innerHTML =
              '<div style="padding:20px;color:#a3a3a3;font-size:14px;">' +
              `<p><strong>${{tabName(btn)}}</strong> — replica placeholder.</p>` +
              '<p>Real content for this tab is not captured in the static ' +
              'replica. The Description tab carries the full real problem.</p></div>';
          }}
        }}
        status('Tab: ' + tabName(btn));
      }});
    }}

    tabList.querySelectorAll(':scope > .flexlayout__tab_button_top')
      .forEach(wireButton);
    // Pick up the extension's injected tab (and any late native tabs).
    new MutationObserver((mutations) => {{
      for (const m of mutations)
        for (const n of m.addedNodes)
          if (n instanceof HTMLElement &&
              (n.classList.contains('flexlayout__tab_button_top') ||
               n.getAttribute('role') === 'tab')) wireButton(n);
    }}).observe(tabList, {{ childList: true }});
  }}
  initTabs();

  // The SSR HTML has no live editor; mount ours once DOM is ready.
  function boot() {{
    mountDescription();
    mountMonaco();
    mountConsole();
    ensureRunUI();
    initTabs();
  }}
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function mountDescription() {{
    // Inject the real problem description into the Description tab's area.
    // The SSR has the tab bar but no content area (client-rendered).
    const descTab = [...document.querySelectorAll('.flexlayout__tab_button_top')]
      .find((b) => (b.textContent || '').trim().toLowerCase().startsWith('description'));
    if (!descTab || document.getElementById('yv-description')) return;
    const desc = document.createElement('div');
    desc.id = 'yv-description';
    desc.style.cssText = 'padding:20px;max-width:800px;';
    desc.innerHTML =
      `<h2 style="font-size:20px;margin-bottom:4px;">${{problemData.questionId}}. ${{problemData.title}}</h2>` +
      `<div style="color:${{problemData.difficulty === 'Easy' ? '#00b8a3' : problemData.difficulty === 'Medium' ? '#ffc01e' : '#ff375f'}};font-size:13px;margin-bottom:16px;">${{problemData.difficulty}}</div>` +
      `<div style="font-size:14px;line-height:1.7;">${{problemData.content || ''}}</div>`;
    // Place it after the description tab's tabset, or at a sensible location
    const tabset = descTab.closest('.flexlayout__tabset') ||
                   descTab.closest('[class*="flexlayout"]');
    if (tabset) tabset.appendChild(desc);
    else (document.getElementById('qd-content') || document.body).prepend(desc);
  }}
}})();
</script>
</body>
</html>
"""


def build_replica(slug: str) -> str:
    html = fetch_page(slug)
    next_data = extract_next_data(html)
    question = find_question(next_data)
    if not question:
        raise RuntimeError("question object not found in __NEXT_DATA__")

    print("Fetching real LeetCode CSS …")
    real_css = fetch_css()
    print(f"  got {len(real_css)//1024} KB of CSS")

    # Keep the real <body> DOM; drop Next.js runtime scripts that cannot
    # hydrate offline (they would throw and break the replica).
    body = re.search(r"<body[^>]*>(.*)</body>", html, re.DOTALL)
    if not body:
        raise RuntimeError("<body> not found")
    body_html = body.group(1)
    # Remove Next.js chunk scripts + hydration payload (keep __NEXT_DATA__ out too;
    # we embed a trimmed problem JSON instead).
    body_html = re.sub(
        r'<script[^>]*src="/_next/[^"]*"[^>]*></script>', "", body_html
    )
    body_html = re.sub(
        r'<script id="__NEXT_DATA__".*?</script>', "", body_html, flags=re.DOTALL
    )
    body_html = re.sub(
        r"<script>self\.__next_f\.push.*?</script>", "", body_html, flags=re.DOTALL
    )

    problem_json = json.dumps(
        {
            "questionId": question.get("questionId"),
            "title": question.get("title"),
            "titleSlug": question.get("titleSlug"),
            "difficulty": question.get("difficulty"),
            "exampleTestcases": question.get("exampleTestcases"),
            "codeSnippets": question.get("codeSnippets"),
        }
    )

    title = question.get("title", slug)
    # NOTE: real_css is substituted AFTER .format() because CSS braces
    # would collide with format placeholders.
    page = REPLICA_TEMPLATE.format(
        title=escape(title),
        real_css="__REAL_CSS__",
        body_html=body_html,
        monaco_loader=MONACO_LOADER,
        problem_json=problem_json,
    )
    return page.replace("__REAL_CSS__", real_css)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    slug = sys.argv[1].strip()
    out_path = sys.argv[2] if len(sys.argv) > 2 else f"replica-{slug}.html"
    print(f"Fetching real page for '{slug}' …")
    replica = build_replica(slug)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(replica)
    print(f"Wrote {out_path} ({len(replica)//1024} KB)")
    print("Serve over HTTP(S) and add its origin to the extension's")
    print("content-script matches (dev only, do not commit).")


if __name__ == "__main__":
    main()
