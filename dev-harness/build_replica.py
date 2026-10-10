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
    // Find the real editor's parent region; fall back to #qd-content.
    const editors = [...document.querySelectorAll('.monaco-editor')];
    const anchor = editors[0]?.parentElement || document.getElementById('qd-content');
    const console = document.createElement('div');
    console.id = 'yv-console';
    const examples = parseExamples(problemData.exampleTestcases);
    console.innerHTML =
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
    // Replace the SSR editor placeholder with a live Monaco instance so the
    // extension reads real editor lines via .view-lines .view-line.
    const placeholder =
      document.querySelector('.monaco-editor') ||
      document.querySelector('[data-e2e-locator="editor"]');
    const host = document.createElement('div');
    host.id = 'yv-monaco-host';
    if (placeholder) placeholder.replaceWith(host);
    else (document.getElementById('qd-content') || document.body).appendChild(host);
    require.config({{ paths: {{ vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }} }});
    require(['vs/editor/editor.main'], () => {{
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

  // The SSR HTML has no live editor; mount ours once DOM is ready.
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => {{ mountMonaco(); mountConsole(); }});
  else {{ mountMonaco(); mountConsole(); }}
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
    return REPLICA_TEMPLATE.format(
        title=escape(title),
        body_html=body_html,
        monaco_loader=MONACO_LOADER,
        problem_json=problem_json,
    )


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
