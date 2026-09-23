import type { ExtensionRequest, ExtensionResponse } from '../types/messages';
import type { VisualizationResponse } from '../types/trace';

async function readMonaco(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: () => {
      const w = window as unknown as { monaco?: { editor?: { getModels?: () => Array<{ getValue(): string; getLanguageId?:()=>string }> } } };
      const models = w.monaco?.editor?.getModels?.() ?? [];
      const java = models.find(m => m.getLanguageId?.() === 'java');
      return (java ?? models.find(m => /class\s+Solution/.test(m.getValue())) ?? models[0])?.getValue?.() ?? '';
    }
  });
  return String(results[0]?.result ?? '');
}

async function revealLine(tabId: number, line: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', args: [line],
    func: (targetLine: number) => {
      const w = window as unknown as { monaco?: { editor?: { getEditors?:()=>Array<{revealLineInCenter:(n:number)=>void;setPosition?:(p:{lineNumber:number;column:number})=>void}> } } };
      const editor = w.monaco?.editor?.getEditors?.()?.[0];
      editor?.revealLineInCenter?.(targetLine);
    }
  }).catch(()=>undefined);
}

chrome.runtime.onMessage.addListener((msg: ExtensionRequest | {type:'REVEAL_LINE';line:number}, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown)=>void) => {
  void (async () => {
    try {
      if (msg.type === 'READ_SOURCE') {
        if (!sender.tab?.id) throw new Error('No active LeetCode tab.');
        const source = await readMonaco(sender.tab.id);
        sendResponse({ok:true,source} satisfies ExtensionResponse); return;
      }
      if (msg.type === 'REVEAL_LINE') {
        if (sender.tab?.id) await revealLine(sender.tab.id,msg.line);
        sendResponse({ok:true}); return;
      }
      if (msg.type === 'RUN_VISUALIZATION') {
        const res = await fetch('http://localhost:3000/visualize',{method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({
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
