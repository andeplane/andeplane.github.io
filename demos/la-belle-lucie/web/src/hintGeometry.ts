export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ArrowGeometry {
  path: string;
  start: [number, number];
  end: [number, number];
}

function edgePoint(
  rectangle: Rectangle,
  towardX: number,
  towardY: number,
): [number, number] {
  const centerX = rectangle.x + rectangle.width / 2;
  const centerY = rectangle.y + rectangle.height / 2;
  const deltaX = towardX - centerX,
    deltaY = towardY - centerY;
  const scale = Math.min(
    deltaX === 0 ? Infinity : rectangle.width / 2 / Math.abs(deltaX),
    deltaY === 0 ? Infinity : rectangle.height / 2 / Math.abs(deltaY),
  );
  return [centerX + deltaX * scale, centerY + deltaY * scale];
}

// Anchor at card edges rather than covering the rank or central artwork.
export function hintArrow(source: Rectangle, target: Rectangle): ArrowGeometry {
  const sourceX = source.x + source.width / 2,
    sourceY = source.y + source.height / 2;
  const targetX = target.x + target.width / 2,
    targetY = target.y + target.height / 2;
  if (sourceX === targetX && sourceY === targetY)
    throw new Error("An arrow requires distinct cards");
  const startEdge = edgePoint(source, targetX, targetY);
  const endEdge = edgePoint(target, sourceX, sourceY);
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
  const unitX = (targetX - sourceX) / distance,
    unitY = (targetY - sourceY) / distance;
  const start: [number, number] = [
    startEdge[0] + unitX * 4,
    startEdge[1] + unitY * 4,
  ];
  const end: [number, number] = [
    endEdge[0] - unitX * 7,
    endEdge[1] - unitY * 7,
  ];
  return {
    start,
    end,
    path: `M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`,
  };
}
