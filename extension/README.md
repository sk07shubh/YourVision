# YourVision Extension

Chrome Manifest V3 extension that adds a native-looking **YourVision** tab to LeetCode.

## Core rule
YourVision never duplicates the user's code. The real LeetCode Monaco editor remains the code editor. YourVision highlights and follows the currently executed source line there while the left-side tab renders state.

## Architecture
LeetCode content script → MV3 service worker → `POST http://localhost:3000/visualize` → backend states → visualizer UI.

## Development
```bash
npm install
npm run typecheck
npm run test
npm run build
```
Then load `extension/dist` as an unpacked extension in Chrome.
