export interface ArrayLayout {
  cellWidth: number;
  cellGap: number;
  cellHeight: number;
  horizontalPadding: number;
  indexOffset: number;
  pointerOffset: number;
}

export const DEFAULT_ARRAY_LAYOUT: ArrayLayout = {
  cellWidth: 58,
  cellGap: 6,
  cellHeight: 42,
  horizontalPadding: 12,
  indexOffset: 62,
  pointerOffset: 12
};

export function arrayX(index: number, layout: ArrayLayout = DEFAULT_ARRAY_LAYOUT): number {
  return layout.horizontalPadding + index * (layout.cellWidth + layout.cellGap);
}

export function arrayWidth(length: number, layout: ArrayLayout = DEFAULT_ARRAY_LAYOUT): number {
  if (length <= 0) return layout.horizontalPadding * 2;
  return arrayX(length - 1, layout) + layout.cellWidth + layout.horizontalPadding;
}
