interface StringViewProps {
  value: string;
  activeIndex?: number;
}

export function StringView({ value, activeIndex }: StringViewProps) {
  return (
    <div className="yv-vis-array" role="list">
      {[...value].map((character, index) => (
        <div className="yv-vis-array-cell" key={index}>
          <div className={'yv-vis-array-value' + (activeIndex === index ? ' is-active' : '')}>
            {character === ' ' ? '·' : character}
          </div>
          <div className="yv-vis-array-index">{index}</div>
        </div>
      ))}
    </div>
  );
}
