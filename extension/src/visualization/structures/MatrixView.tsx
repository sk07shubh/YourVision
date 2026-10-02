interface MatrixViewProps {
  values: unknown[][];
  active?: { row: number; column: number };
}

export function MatrixView({ values, active }: MatrixViewProps) {
  return (
    <div className="yv-vis-matrix" role="grid">
      {values.map((row, rowIndex) => (
        <div className="yv-vis-matrix-row" role="row" key={rowIndex}>
          {row.map((value, columnIndex) => {
            const selected = active?.row === rowIndex && active?.column === columnIndex;
            return (
              <div
                className={'yv-vis-matrix-cell' + (selected ? ' is-active' : '')}
                role="gridcell"
                key={columnIndex}
              >
                <span>{String(value)}</span>
                <small>[{rowIndex},{columnIndex}]</small>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
