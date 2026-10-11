# YourVision Dev Harness

A local, LeetCode-faithful problem page for iterating on the extension
**without** navigating the real site for every check.

- **Real problem content**: problem descriptions, Java starter code, and
  example test cases are fetched live through the unofficial LeetCode
  GraphQL API (`leetcode.com/graphql` via the local proxy). Nothing is
  mocked — the *content* is real.
- **Faithful DOM**: the page reproduces exactly the DOM hooks the
  extension relies on (`#qd-content`, FlexLayout tab structure,
  `[data-e2e-locator="console-testcase-tag/input"]`, a real Monaco
  editor instance), per `extension/src/leetcode/selectors.ts`.
- **Problem-independent**: type any problem slug (e.g. `two-sum`,
  `binary-tree-inorder-traversal`) and hit Load — or paste arbitrary Java
  straight into the editor with *Replace Code in Editor*.

> **Scope note.** The page *shell* (layout/CSS) is a reconstruction —
> LeetCode's real page cannot be fetched from here. The harness is for
> fast iteration on visualization behavior with real problem content.
> It does **not** replace the real-site check: only the live site can
> catch DOM drift when LeetCode changes their markup. Keep the real-site
> check to 2–3 problems per feature.

## Setup

**1. Build the extension**

```bash
cd extension
npm run build   # outputs to extension/dist/
```

**2. Point the content script at the harness (dev only, do NOT commit)**

In `extension/public/manifest.json`, temporarily add the harness origin
to the content script matches:

```json
"content_scripts": [
  {
    "matches": [
      "https://leetcode.com/problems/*",
      "http://localhost:8080/*"
    ],
    "js": ["content.js"],
    "run_at": "document_idle"
  }
]
```

Rebuild after editing. Revert before committing.

**3. Load the extension in Chrome**

- Open `chrome://extensions`, enable *Developer mode*
- *Load unpacked* → select `extension/dist/`

**4. Start the backend** (the extension calls it for real traces)

```bash
cd backend
npm run dev   # listens on 127.0.0.1:3000
```

**5. Start the harness**

```bash
cd dev-harness
node server.js   # serves http://localhost:8080/
```

**6. Open http://localhost:8080/** in Chrome

The extension's content script injects exactly as on LeetCode.
Type a problem slug, load it, edit code, and use the extension's
Visualize flow. The backend executes the real Java and returns the
real trace — the visualization is never faked.

## Files

| File | Purpose |
|---|---|
| `harness.html` | LeetCode-faithful page (DOM hooks + styling) |
| `harness.js` | Monaco setup, problem loading via API, test-case rendering |
| `server.js` | Static server + `/api/leetcode` proxy to `leetcode.com/graphql` |

## Verifying selector coverage

The DOM hooks used here mirror `extension/src/leetcode/selectors.ts`.
If the extension's selectors change, update the harness markup to match —
otherwise the harness silently stops exercising the real injection path.
