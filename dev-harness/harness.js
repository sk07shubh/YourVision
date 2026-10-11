/* YourVision Dev Harness — drives the LeetCode page replica.
 *
 * Loads real problem data through the local /api/leetcode proxy
 * (which forwards to leetcode.com/graphql), renders it into the
 * LeetCode-faithful DOM, and hosts a real Monaco editor instance
 * so the extension's content script behaves exactly as on the site.
 */

let editor = null;
let currentProblem = null;

const status = (msg) => {
  document.getElementById('harness-status').textContent = msg;
};

/** Fetch full problem data through the local proxy. */
async function fetchProblem(titleSlug) {
  const query = `
    query getQuestion($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        content
        difficulty
        exampleTestcases
        codeSnippets { langSlug code }
      }
    }`;
  const res = await fetch('/api/leetcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { titleSlug } }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');
  return json.data.question;
}

function javaSnippet(problem) {
  const s = (problem.codeSnippets || []).find((x) => x.langSlug === 'java');
  return s ? s.code : '// no Java snippet available';
}

/** Parse LeetCode's exampleTestcases blob into [input, ...] groups.
 *  The blob is newline-separated values; inputs come in pairs/groups
 *  per example. We keep it simple: split into examples by blank lines,
 *  then split each example's lines as separate inputs. */
function parseExamples(blob) {
  if (!blob) return [];
  const groups = blob.trim().split(/\n\s*\n/).filter(Boolean);
  if (groups.length > 1) return groups.map((g) => g.trim().split('\n'));
  const lines = blob.trim().split('\n');
  // Heuristic: pair up lines (most examples have 2 inputs)
  const out = [];
  for (let i = 0; i < lines.length; i += 2) {
    out.push(lines.slice(i, i + 2));
  }
  return out;
}

function renderProblem(problem) {
  currentProblem = problem;
  document.getElementById('problem-title').textContent =
    `${problem.questionId}. ${problem.title}`;
  const diff = document.getElementById('problem-difficulty');
  diff.textContent = problem.difficulty;
  diff.className = `problem-difficulty ${problem.difficulty}`;
  document.getElementById('problem-content').innerHTML = problem.content || '';
  document.title = `${problem.title} - Dev Harness`;

  // Test cases
  const examples = parseExamples(problem.exampleTestcases);
  const tags = document.getElementById('testcase-tags');
  const inputs = document.getElementById('testcase-inputs');
  tags.innerHTML = '';
  inputs.innerHTML = '';
  examples.forEach((lines, i) => {
    const btn = document.createElement('button');
    btn.setAttribute('data-e2e-locator', 'console-testcase-tag');
    btn.textContent = `Case ${i + 1}`;
    if (i === 0) btn.classList.add('bg-fill-3');
    btn.addEventListener('click', () => {
      tags.querySelectorAll('button').forEach((b) => b.classList.remove('bg-fill-3'));
      btn.classList.add('bg-fill-3');
      showCase(i, examples);
    });
    tags.appendChild(btn);
  });
  if (examples.length) showCase(0, examples);
  status(`Loaded ${problem.titleSlug}`);
}

function showCase(index, examples) {
  const inputs = document.getElementById('testcase-inputs');
  inputs.innerHTML = '';
  const lines = examples[index] || [];
  lines.forEach((line, i) => {
    const label = document.createElement('label');
    label.textContent = lines.length > 1 ? `param${i + 1} =` : 'input =';
    const ta = document.createElement('textarea');
    ta.setAttribute('data-e2e-locator', 'console-testcase-input');
    ta.value = line.trim();
    ta.rows = 1;
    inputs.appendChild(label);
    inputs.appendChild(ta);
  });
}

function initMonaco(code) {
  return new Promise((resolve) => {
    require.config({
      paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' },
    });
    require(['vs/editor/editor.main'], () => {
      if (editor) editor.dispose();
      editor = monaco.editor.create(document.getElementById('monaco-host'), {
        value: code,
        language: 'java',
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
      });
      resolve();
    });
  });
}

async function loadProblem(slug) {
  status(`Loading ${slug}…`);
  try {
    const problem = await fetchProblem(slug);
    if (!problem) throw new Error('Problem not found');
    renderProblem(problem);
    await initMonaco(javaSnippet(problem));
    status(`Ready — ${problem.title}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

/** Replace editor code with whatever is on the clipboard / prompt. */
function swapCode() {
  const code = prompt('Paste Java code to load into the editor:');
  if (code && editor) {
    editor.setValue(code);
    status('Code replaced in editor');
  }
}

document.getElementById('load-problem').addEventListener('click', () => {
  const slug = document.getElementById('problem-slug').value.trim();
  if (slug) loadProblem(slug);
});
document.getElementById('problem-slug').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const slug = e.target.value.trim();
    if (slug) loadProblem(slug);
  }
});
document.getElementById('swap-code').addEventListener('click', swapCode);

// Boot with the default problem.
loadProblem('two-sum');
