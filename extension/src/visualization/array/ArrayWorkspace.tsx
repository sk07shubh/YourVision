import { useEffect, useMemo } from "react";
import { useSession } from "../../state/session";
import { sessionStore } from "../../state/store";
import { highlightEditorLine, clearEditorExecutionMarker } from "../../leetcode/editor-overlay";
import { displayValue, isPlainObject } from "../../utils/value";
import { compileArrayStep } from "./compiler";
import { ArrayScene } from "./ArrayScene";
import { presentArrayScene } from "./presentation";
import { PlaybackControls } from "../core/PlaybackControls";
import "./array-workspace.css";
import { createStackScene } from "../stack/scene";
import { compileStackEvents } from "../stack/compiler";
import { presentStackScene } from "../stack/presentation";
import { StackScene } from "../stack/StackScene";
import { createQueueScene } from "../queue/scene";
import { compileQueueEvents } from "../queue/compiler";
import { presentQueueScene } from "../queue/presentation";
import { QueueScene } from "../queue/QueueScene";
import { createLinkedListScene } from "../linked-list/scene";
import { compileLinkedListEvents } from "../linked-list/compiler";
import { presentLinkedListScene } from "../linked-list/presentation";
import { LinkedListScene } from "../linked-list/LinkedListScene";
import { DequeScene } from "../deque/DequeScene";
import { createDequeScene } from "../deque/scene";
import { compileDequeEvents } from "../deque/compiler";
import { presentDequeScene } from "../deque/presentation";
import { createTreeScene } from "../tree/scene";
import { compileTreeEvents } from "../tree/compiler";
import { presentTreeScene } from "../tree/presentation";
import { TreeScene as TreeSceneView } from "../tree/TreeScene";

export function ArrayWorkspace() {
  const session = useSession();
  const current = session.states[session.index];
  const previous = session.index > 0 ? session.states[session.index - 1] : undefined;
  const sourceLines = useMemo(() => session.source.split(/\r?\n/), [session.source]);
  const statement = current?.line ? sourceLines[current.line - 1]?.trim() : "";
  const step = current ? compileArrayStep(current, session.source, previous) : undefined;
  const eventData = isPlainObject(current?.lastEvent?.data) ? current.lastEvent.data : undefined;
  const presentedScene = step ? presentArrayScene(step.scene, step.events) : undefined;
  const finished = current?.lastEvent?.type === "PROGRAM_END" || (session.states.length > 0 && session.index === session.states.length - 1);
  const stackScene = current ? createStackScene(current) : [];
  const stackEvents = current ? compileStackEvents(current, previous) : [];
  const presentedStackScene = presentStackScene(stackScene, stackEvents);
  const queueScene = current ? createQueueScene(current) : [];
  const queueEvents = current ? compileQueueEvents(current, previous) : [];
  const presentedQueueScene = presentQueueScene(queueScene, queueEvents);
  const linkedListScene = current ? createLinkedListScene(current) : [];
  const linkedListEvents = current ? compileLinkedListEvents(current, previous) : [];
  const presentedLinkedListScene = presentLinkedListScene(linkedListScene, linkedListEvents);
  const dequeScene = current ? createDequeScene(current) : [];
  const dequeEvents = current ? compileDequeEvents(current, previous) : [];
  const presentedDequeScene = presentDequeScene(dequeScene, dequeEvents);
  const treeScene = current ? createTreeScene(current) : [];
  const treeEvents = current ? compileTreeEvents(current, previous) : [];
  const presentedTreeScene = presentTreeScene(treeScene, treeEvents);

  useEffect(() => {
    highlightEditorLine(current?.line, session.source);
    return () => clearEditorExecutionMarker();
  }, [current?.line, session.source]);

  useEffect(() => {
    if (!session.playing) return;
    const id = window.setInterval(() => sessionStore.tick(), session.playbackDelay);
    return () => window.clearInterval(id);
  }, [session.playing, session.index, session.states.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!sessionStore.get().open) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,[contenteditable=true]")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); sessionStore.tick(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); sessionStore.prev(); }
      else if (event.code === "Space") { event.preventDefault(); event.stopPropagation(); sessionStore.togglePlay(); }
      else if (event.key.toLowerCase() === "r") { event.preventDefault(); event.stopPropagation(); sessionStore.restart(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (session.loading) return <div className="yv-root yv-workspace yv-workspace-loading">Tracing your code…</div>;
  if (session.error) return <div className="yv-root yv-workspace"><div className="yv-workspace-error">{session.error}</div></div>;
  if (!current || !step) return <div className="yv-root yv-workspace"><div className="yv-workspace-empty">Select a testcase and press Visualize.</div></div>;

  const testcase = session.testcase;

  return (
    <div className="yv-root yv-workspace">
      <header className="yv-workspace-header">
        <div>
          <div className="yv-workspace-kicker">YOURVISION · DATA STRUCTURE EXECUTION</div>
          <div className="yv-workspace-title yv-case">{testcase?.label ?? "Testcase"}</div>
          {testcase?.source === "custom" && <span className="yv-case-kind">Custom</span>}
          {testcase?.source === "failed" && <span className="yv-case-kind">Failed testcase</span>}
        </div>
        <div className="yv-workspace-step">Step {session.index + 1} / {session.states.length}</div>
      </header>

      <div className="yv-workspace-body">
        <section className="yv-visual-card">
          <div className="yv-visual-card-head">
            <div>
              <div className="yv-visual-label">Visualization</div>
              <div className="yv-event-title">{step.eventLabel}</div>
              <code className="yv-statement">{statement || "—"}</code>
            </div>
            <div className="yv-method">{step.method ?? "—"}</div>
          </div>
          <ArrayScene scene={presentedScene ?? step.scene} events={step.events}/>
          {presentedStackScene.length > 0 && <StackScene scene={presentedStackScene} events={stackEvents}/>}
          {presentedQueueScene.length > 0 && <QueueScene scene={presentedQueueScene} events={queueEvents}/>}\n          {presentedLinkedListScene.length > 0 && <LinkedListScene scene={presentedLinkedListScene} events={linkedListEvents}/>}
          {presentedDequeScene.length > 0 && <DequeScene scene={presentedDequeScene} events={dequeEvents}/>}
        </section>

        <aside className="yv-inspector">
          <section className="yv-inspector-section">
            <div className="yv-inspector-title">Current line</div>
            <div className="yv-line-number">{current.line ?? "—"}</div>
          </section>

          <section className="yv-inspector-section">
            <div className="yv-inspector-title">Variables</div>
            <div className="yv-inspector-vars">
              {step.scene.variables.length === 0 && <span className="yv-inspector-muted">No local variables</span>}
              {step.scene.variables.map(variable => (
                <div className={"yv-inspector-var yv-var " + (variable.changed ? "changed" : "")} key={variable.name}>
                  <span className="yv-var-name">{variable.name}</span><code className="yv-code">{displayValue(variable.value)}</code>
                </div>
              ))}
            </div>
          </section>

          {current.callStack.length > 0 && (
            <section className="yv-inspector-section">
              <div className="yv-inspector-title">Call stack</div>
              <div className="yv-call-stack yv-stack">
                {[...current.callStack].reverse().map((frame, index) => (
                  <div className={"yv-call-frame " + (index === 0 ? "active" : "")} key={frame + index}>{frame}</div>
                ))}
              </div>
            </section>
          )}

          {finished && eventData?.returnValue !== undefined && (
            <section className="yv-inspector-section">
              <div className="yv-inspector-title">Output</div>
              <code className="yv-output yv-output-value yv-code">{displayValue(eventData.returnValue)}</code>
            </section>
          )}
        </aside>
      </div>

      <PlaybackControls
        index={session.index}
        length={session.states.length}
        playing={session.playing}
        playbackDelay={session.playbackDelay}
        onRestart={() => sessionStore.restart()}
        onPrev={() => sessionStore.prev()}
        onTogglePlay={() => sessionStore.togglePlay()}
        onNext={() => sessionStore.next()}
        onPlaybackDelay={delay => sessionStore.setPlaybackDelay(delay)}
      />
    </div>
  );
}
