import type { ArraySemanticEvent, ArrayScene as ArraySceneModel } from "./types";
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

export function ArrayScene({ scene, events = [] }: { scene: ArraySceneModel; events?: ArraySemanticEvent[] }) {
  const eventForCell = (arrayId: string, index: number): string | undefined => {
    for (const event of events) {
      if (event.type === "ARRAY_SWAP" && event.arrayId === arrayId && (event.first === index || event.second === index)) return "swap";
      if (event.type === "ARRAY_SHIFT" && event.arrayId === arrayId && (event.from === index || event.to === index)) return "shift";
      if (event.type === "ARRAY_WRITE" && event.arrayId === arrayId && event.index === index) return "write";
      if (event.type === "ARRAY_INSERT" && event.arrayId === arrayId && event.index === index) return "write";
      if (event.type === "ARRAY_COMPARE" && event.arrayId === arrayId && event.indices.includes(index)) return "compare";
      if (event.type === "ARRAY_READ" && event.arrayId === arrayId && event.index === index) return "read";
    }
    return undefined;
  };
  return (
    <div className="yv-array-scene yv-array" data-testid="yv-array-scene">
      {scene.arrays.map(array => (
        <section className="yv-array-block" key={array.id}>
          <div className="yv-array-name">{array.name}</div>
          <div className="yv-array-canvas">
            <svg className="yv-array-svg" width={Math.max(120, array.cells.length * 64 + 24)} height={96} viewBox={"0 0 " + Math.max(120, array.cells.length * 64 + 24) + " 96"} role="img" aria-label={"Array " + array.name}>
              {scene.ranges.filter(range => range.arrayId === array.id).map(range => (
                <rect key={range.id} className={"yv-array-range " + range.kind} x={12 + range.start * 64} y={12} width={Math.max(0, range.end - range.start + 1) * 64} height={50} rx={8}/>
              ))}
              {array.cells.map(cell => (
                <g key={cell.index} transform={"translate(" + (12 + cell.index * 64) + ",18)"}>
                  <rect className={"yv-array-cell " + cell.state + " " + (eventForCell(array.id, cell.index) ?? "")} width={58} height={42} rx={7}/>
                  <text className="yv-array-value" x={29} y={26} textAnchor="middle">{display(cell.value)}</text>
                  <text className="yv-array-index" x={29} y={59} textAnchor="middle">{cell.index}</text>
                </g>
              ))}
              {scene.pointers.filter(pointer => pointer.arrayId === array.id).map((pointer, pointerIndex) => (
                <g key={pointer.id} className="yv-array-pointer" transform={"translate(" + (12 + pointer.index * 64 + 29) + "," + (pointerIndex % 2 === 0 ? 4 : 82) + ")"}>
                  <text textAnchor="middle">{pointer.label}</text>
                  <path d={pointerIndex % 2 === 0 ? "M0,7 L-5,14 L5,14 Z" : "M0,-7 L-5,-14 L5,-14 Z"}/>
                </g>
              ))}
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
