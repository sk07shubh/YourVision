import type { CSSProperties } from "react";
import React from "react";
import type { ArraySemanticEvent, ArrayScene as ArraySceneModel } from "./types";
import { arrayWidth, arrayX, DEFAULT_ARRAY_LAYOUT } from "./layout";
import { buildArrayAnimationTimeline } from "./timeline";
import "./array-scene.css";

function display(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return "[object]"; }
  }
  return String(value);
}

function eventClass(event: ArraySemanticEvent): string | undefined {
  switch (event.type) {
    case "ARRAY_SWAP": return "swap";
    case "ARRAY_SHIFT": return "shift";
    case "ARRAY_WRITE":
    case "ARRAY_INSERT": return "write";
    case "ARRAY_COMPARE": return "compare";
    case "ARRAY_READ": return "read";
    default: return undefined;
  }
}

export function ArrayScene({ scene, events = [] }: { scene: ArraySceneModel; events?: ArraySemanticEvent[] }) {
  const timeline = buildArrayAnimationTimeline(events);
  const pointerFrames = (pointerId: string) =>
    timeline.frames.filter(frame => frame.event.type === "POINTER_MOVE" && frame.event.pointerId === pointerId);

  const rangeFrames = (rangeId: string) =>
    timeline.frames.filter(frame =>
      (frame.event.type === "RANGE_MOVE" || frame.event.type === "RANGE_SHRINK" || frame.event.type === "RANGE_EXPAND") &&
      frame.event.rangeId === rangeId
    );

  const eventForCell = (arrayId: string, index: number): { className?: string; style?: CSSProperties } => {
    const matches = timeline.frames.filter(frame => {
      const event = frame.event;
      return (
        (event.type === "ARRAY_SWAP" && event.arrayId === arrayId && (event.first === index || event.second === index)) ||
        (event.type === "ARRAY_SHIFT" && event.arrayId === arrayId && (event.from === index || event.to === index)) ||
        ((event.type === "ARRAY_WRITE" || event.type === "ARRAY_INSERT") && event.arrayId === arrayId && event.index === index) ||
        (event.type === "ARRAY_COMPARE" && event.arrayId === arrayId && event.indices.includes(index)) ||
        (event.type === "ARRAY_READ" && event.arrayId === arrayId && event.index === index)
      );
    });

    if (!matches.length) return {};

    const classNames = matches.map(frame => eventClass(frame.event)).filter(Boolean);
    const animations = matches
      .filter(frame => frame.motion.durationMs > 0)
      .map(frame => ({
        name: eventClass(frame.event) ? "yv-cell-" + eventClass(frame.event) : undefined,
        duration: frame.motion.durationMs,
        delay: frame.startMs
      }))
      .filter(animation => animation.name);

    return {
      className: [...new Set(classNames)].join(" ") || undefined,
      style: animations.length ? {
        animationName: animations.map(animation => animation.name).join(", "),
        animationDuration: animations.map(animation => animation.duration + "ms").join(", "),
        animationDelay: animations.map(animation => animation.delay + "ms").join(", "),
        animationTimingFunction: animations.map(() => "ease").join(", "),
        animationIterationCount: animations.map(() => "1").join(", "),
        animationFillMode: animations.map(() => "both").join(", ")
      } : undefined
    };
  };

  return (
    <div
      className="yv-array-scene yv-array"
      data-testid="yv-array-scene"
      data-animation-duration={timeline.durationMs}
    >
      {scene.arrays.map(array => (
        <section className="yv-array-block" key={array.id}>
          <div className="yv-array-name">{array.name}</div>
          <div className="yv-array-canvas">
            <svg className="yv-array-svg" width={Math.max(120, arrayWidth(array.cells.length, DEFAULT_ARRAY_LAYOUT))} height={112} viewBox={"0 0 " + Math.max(120, arrayWidth(array.cells.length, DEFAULT_ARRAY_LAYOUT)) + " 112"} role="img" aria-label={"Array " + array.name}>
              {scene.ranges.filter(range => range.arrayId === array.id).map(range => (
                <rect
                  key={range.id}
                  className={"yv-array-range " + range.kind}
                  style={eventForRange(range.id)}
                  x={arrayX(range.start, DEFAULT_ARRAY_LAYOUT)}
                  y={12}
                  width={Math.max(0, range.end - range.start + 1) * (DEFAULT_ARRAY_LAYOUT.cellWidth + DEFAULT_ARRAY_LAYOUT.cellGap)}
                  height={50}
                  rx={8}
                />
              ))}
              {array.cells.map(cell => {
                const animation = eventForCell(array.id, cell.index);
                return (
                  <g key={cell.index} transform={"translate(" + arrayX(cell.index, DEFAULT_ARRAY_LAYOUT) + ",18)"}>
                    <rect
                      className={"yv-array-cell " + cell.state + " " + (animation.className ?? "")}
                      style={animation.style}
                      width={58}
                      height={42}
                      rx={7}
                    />
                    <text className="yv-array-value" x={29} y={26} textAnchor="middle">{display(cell.value)}</text>
                    <text className="yv-array-index" x={29} y={59} textAnchor="middle">{cell.index}</text>
                  </g>
                );
              })}
              {scene.pointers.filter(pointer => pointer.arrayId === array.id).map((pointer, pointerIndex) => {
                const lane = pointerIndex % 4;
                const top = lane < 2;
                const y = top ? 4 + lane * 13 : 84 - (lane - 2) * 13;
                const frames = pointerFrames(pointer.id);
                const finalX = arrayX(pointer.index, DEFAULT_ARRAY_LAYOUT) + DEFAULT_ARRAY_LAYOUT.cellWidth / 2;
                return (
                  <g key={pointer.id} className="yv-array-pointer" transform={"translate(0," + y + ")"}>
                    <g transform={"translate(" + finalX + ",0)"}>
                      {frames.map(frame => {
                        if (frame.event.type !== "POINTER_MOVE") return null;
                        return (
                          <animateTransform
                            key={frame.index}
                            attributeName="transform"
                            type="translate"
                            from={(arrayX(frame.event.from, DEFAULT_ARRAY_LAYOUT) + DEFAULT_ARRAY_LAYOUT.cellWidth / 2) + " 0"}
                            to={(arrayX(frame.event.to, DEFAULT_ARRAY_LAYOUT) + DEFAULT_ARRAY_LAYOUT.cellWidth / 2) + " 0"}
                            dur={frame.motion.durationMs + "ms"}
                            begin={frame.startMs + "ms"}
                            fill="freeze"
                          />
                        );
                      })}
                      <text textAnchor="middle">{pointer.label}</text>
                      <path d={top ? "M0,7 L-5,14 L5,14 Z" : "M0,-7 L-5,-14 L5,-14 Z"}/>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      ))}
      {scene.variables.length > 0 && (
        <div className="yv-array-variables">
          {scene.variables.map(variable => (
            <div className={"yv-array-variable " + (variable.changed ? "changed" : "")} key={variable.name}>
              <span>{variable.name}</span><code>{display(variable.value)}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
