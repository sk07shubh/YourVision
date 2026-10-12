import type { ExtensionRequest, ExtensionResponse } from '../types/messages';
import type { VisualizationResponse } from '../types/trace';

async function readLeetCodeJavaStarter(pageUrl: string): Promise<string> {
  const url = new URL(pageUrl);
  const match = url.pathname.match(/\/problems\/([^/]+)/);
  const titleSlug = match?.[1];
  if (!titleSlug) throw new Error('Could not identify the LeetCode problem from the page URL.');

  const query = `
    query getQuestion($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        codeSnippets { langSlug code }
      }
    }`;
  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { titleSlug } })
  });
  if (!response.ok) throw new Error(`Could not load the original LeetCode starter signature (HTTP ${response.status}).`);
  const payload = await response.json() as {
    errors?: Array<{ message?: string }>;
    data?: { question?: { codeSnippets?: Array<{ langSlug: string; code: string }> } | null };
  };
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message ?? 'LeetCode GraphQL request failed.');
  const java = payload.data?.question?.codeSnippets?.find(snippet => snippet.langSlug === 'java');
  if (!java?.code?.trim()) throw new Error('LeetCode did not provide a Java starter method for this problem.');
  return java.code;
}

async function readMonaco(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: () => {
      const w = window as unknown as { monaco?: { editor?: { getModels?: () => Array<{ getValue(): string; getLanguageId?:()=>string }>; getEditors?:()=>Array<{getModel?:()=>{getValue():string;getLanguageId?:()=>string}|null;getDomNode?:()=>HTMLElement|null}> } } };
      const editors = w.monaco?.editor?.getEditors?.() ?? [];
      const focusedJava = editors.find(editor =>
        editor.getDomNode?.()?.classList.contains('monaco-editor-focused') &&
        editor.getModel?.()?.getLanguageId?.() === 'java'
      )?.getModel?.();
      const models = w.monaco?.editor?.getModels?.() ?? [];
      const java = focusedJava ?? models.find(m => m.getLanguageId?.() === 'java');
      return (java ?? models.find(m => /class\s+Solution/.test(m.getValue())) ?? models[0])?.getValue?.() ?? '';
    }
  });
  return String(results[0]?.result ?? '');
}

async function revealLine(tabId: number, line: number, source: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', args: [line, source],
    func: (targetLine: number, targetSource: string) => {
      const w = window as unknown as { monaco?: { editor?: { getEditors?:()=>Array<{revealLineInCenter:(n:number)=>void;setPosition?:(p:{lineNumber:number;column:number})=>void;getModel?:()=>{getValue?:()=>string}|null;getDomNode?:()=>HTMLElement|null}> } } };
      const editors = w.monaco?.editor?.getEditors?.() ?? [];
      const editor = editors.find(candidate => candidate.getModel?.()?.getValue?.() === targetSource) ??
        editors.find(candidate => candidate.getDomNode?.()?.classList.contains('monaco-editor-focused')) ?? editors[0];
      editor?.revealLineInCenter?.(targetLine);
    }
  }).catch(()=>undefined);
}

chrome.runtime.onMessage.addListener((msg: ExtensionRequest | {type:'REVEAL_LINE';line:number;source?:string}, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown)=>void) => {
  void (async () => {
    try {
      if (msg.type === 'READ_ENTRY_METHOD') {
        if (!sender.tab?.url) throw new Error('Could not identify the current LeetCode problem URL.');
        const source = await readLeetCodeJavaStarter(sender.tab.url);
        sendResponse({ok:true,source} satisfies ExtensionResponse); return;
      }
      if (msg.type === 'READ_SOURCE') {
        if (!sender.tab?.id) throw new Error('No active LeetCode tab.');
        const source = await readMonaco(sender.tab.id);
        sendResponse({ok:true,source} satisfies ExtensionResponse); return;
      }
      if (msg.type === 'REVEAL_LINE') {
        if (sender.tab?.id) await revealLine(sender.tab.id,msg.line,msg.source ?? '');
        sendResponse({ok:true}); return;
      }
      if (msg.type === 'RUN_DESIGN_VISUALIZATION') {\n        const res = await fetch('http://127.0.0.1:3000/visualize',{method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({\n          language: 'java', source: msg.source, testcase: { mode: 'design', className: msg.className, constructorArguments: msg.constructorArguments, operations: msg.operations }\n        })});\n        const text = await res.text();\n        let data: unknown; try { data=JSON.parse(text); } catch { throw new Error(\`Backend returned \${res.status}: \${text.slice(0,300)}\`); }\n        if (!res.ok) throw new Error((data as {message?:string})?.message ?? \`Backend returned \${res.status}\`);\n        const responseData = data as { execution?: VisualizationResponse };\n        sendResponse({ok:true,data:responseData.execution ?? (data as VisualizationResponse)} satisfies ExtensionResponse); return;\n      }\n      if (msg.type === 'RUN_VISUALIZATION') {
        const res = await fetch('http://127.0.0.1:3000/visualize',{method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({
    language: 'java',
    source: msg.source,
    testcase: {
        method: msg.method,
        arguments: msg.arguments
    }
})});
        const text = await res.text();
        let data: unknown; try { data=JSON.parse(text); } catch { throw new Error(`Backend returned ${res.status}: ${text.slice(0,300)}`); }
        if (!res.ok) throw new Error((data as {message?:string})?.message ?? `Backend returned ${res.status}`);
        const responseData =
    data as {
        execution?: VisualizationResponse;
    };

sendResponse({
    ok: true,
    data:
        responseData.execution ??
        (data as VisualizationResponse)
} satisfies ExtensionResponse); return;
      }
    } catch(e) { sendResponse({ok:false,error:e instanceof Error?e.message:String(e)} satisfies ExtensionResponse); }
  })();
  return true;
});
