import React from "react";
import type { StackScene as StackSceneModel, StackSemanticEvent } from "./types";
import "./stack-scene.css";

export function StackScene({ scene, events = [] }: { scene: StackSceneModel[]; events?: StackSemanticEvent[] }) {
  return <div className="yv-stack-scenes">
    {scene.map(stack => <section className="yv-stack-card" key={stack.id}>
      <header className="yv-stack-head"><strong>{stack.name}</strong><span>TOP · {stack.items.length} items</span></header>
      <div className="yv-stack-view">
        {[...stack.items].reverse().map(item => <div className={"yv-stack-cell " + (item.state !== "neutral" ? "yv-stack-" + item.state : "")} key={item.index}>
          <span className="yv-stack-position">{item.index === stack.items.length - 1 ? "TOP" : ""}</span>
          <code>{String(item.value)}</code>
        </div>)}
      </div>
      {events.some(event => event.stackId === stack.id) && <div className="yv-stack-event">{events.filter(event => event.stackId === stack.id).map(event => event.type.replace("STACK_","")).join(" · ")}</div>}
    </section>)}
  </div>;
}
