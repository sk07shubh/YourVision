import React from "react";
import type { StackScene as StackSceneModel, StackSemanticEvent } from "./types";
import "./stack-scene.css";

export function StackScene({ scene, events = [] }: { scene: StackSceneModel[]; events?: StackSemanticEvent[] }) {
  return <div className="yv-stack-scenes">
    {scene.map(stack => {
      const popped = events.filter((event): event is Extract<StackSemanticEvent,{type:"STACK_POP"}> => event.stackId === stack.id && event.type === "STACK_POP" && !stack.items.some(item => item.index === event.index));
      return <section className="yv-stack-card" key={stack.id}>
        <header className="yv-stack-head"><strong>{stack.name}</strong><span>TOP · {stack.items.length} items</span></header>
        <div className="yv-stack-view">
          {[...stack.items,...popped.map(event => ({index:event.index,value:event.value,state:"pop" as const}))].reverse().map(item => <div className={"yv-stack-cell "+(item.state !== "neutral" ? "yv-stack-"+item.state : "")} key={item.index}>
            <span className="yv-stack-position">{item.index === stack.items.length - 1 ? "TOP" : ""}</span>
            <code>{String(item.value)}</code>
          </div>)}
        </div>
        {events.some(event => event.stackId === stack.id) && <div className="yv-stack-event">{events.filter(event => event.stackId === stack.id).map(event => event.type.replace("STACK_","")).join(" · ")}</div>}
      </section>;
    })}
  </div>;
}