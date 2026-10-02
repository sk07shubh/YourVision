interface ArrayViewProps {
  values: unknown[];
  structureId: string;
  pointers?: Record<number, string[]>;
  changedIndices?: Set<number>;
}

function valueText(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return '[object]';
  return String(value);
}

export function ArrayView({ values, pointers = {}, changedIndices = new Set<number>() }: ArrayViewProps) {
  return (
    <div className="yv-vis-array" role="list">
      {values.map((value, index) => (
        <div className="yv-vis-array-cell" key={index}>
          {pointers[index]?.map(label => <div className="yv-vis-pointer" key={label}>{label}</div>)}
          <div className={'yv-vis-array-value' + (changedIndices.has(index) ? ' is-changed' : '')}>
            {valueText(value)}
          </div>
          <div className="yv-vis-array-index">{index}</div>
        </div>
      ))}
    </div>
  );
}
