import { useId, useLayoutEffect, useState, type RefObject } from "react";
import { hintArrow } from "./hintGeometry";
import type { Move } from "./engine";

interface Arrow extends Move {
  path: string;
  start: [number, number];
  end: [number, number];
}

export function HintArrows({
  table,
  moves,
  visible,
}: {
  table: RefObject<HTMLElement | null>;
  moves: Move[];
  visible: boolean;
}) {
  const markerId = `hint-arrow-${useId().replace(/:/g, "")}`;
  const [geometry, setGeometry] = useState({
    width: 0,
    height: 0,
    arrows: [] as Arrow[],
  });
  useLayoutEffect(() => {
    const element = table.current;
    if (!element || !visible) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const arrows = moves.flatMap((move) => {
        const source = element.querySelector<HTMLElement>(
          `[data-card="${move.card}"]`,
        );
        const destination = element.querySelector<HTMLElement>(
          move.destination < 0
            ? `[data-foundation="${Math.floor(move.card / 13)}"]`
            : `[data-card="${move.destination}"]`,
        );
        if (!source || !destination) return [];
        const local = (node: HTMLElement) => {
          const rectangle = node.getBoundingClientRect();
          return {
            x: rectangle.x - bounds.x,
            y: rectangle.y - bounds.y,
            width: rectangle.width,
            height: rectangle.height,
          };
        };
        return [{ ...move, ...hintArrow(local(source), local(destination)) }];
      });
      setGeometry({ width: bounds.width, height: bounds.height, arrows });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [table, moves, visible]);
  if (!visible || !geometry.width) return null;
  return (
    <svg
      className="hint-arrows"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 9 4.5 L 0 9 Z" fill="currentColor" />
        </marker>
      </defs>
      {geometry.arrows.map((arrow) => (
        <path
          key={`${arrow.card}-${arrow.destination}`}
          className="hint-arrow"
          data-source-card={arrow.card}
          data-destination={arrow.destination}
          data-start={arrow.start.join(",")}
          data-end={arrow.end.join(",")}
          d={arrow.path}
          markerEnd={`url(#${markerId})`}
        />
      ))}
    </svg>
  );
}
