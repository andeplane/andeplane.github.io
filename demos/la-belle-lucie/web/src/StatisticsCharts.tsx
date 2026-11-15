import { useEffect, useRef, useState } from "react";
import {
  conditionalCurve,
  total,
  transitionMatrix,
  type Entry,
} from "./statistics";

export const formatCount = (n: number) =>
  new Intl.NumberFormat("en-US").format(n);
export const formatPercent = (n: number | null, digits = 2) =>
  n === null ? "No observations" : `${(n * 100).toFixed(digits)}%`;
const clamp = (n: number) => Math.max(0, Math.min(52, Math.round(n)));

function useChartText(viewWidth: number) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0)
        element.style.setProperty(
          "--chart-font",
          `${(12 * viewWidth) / width}px`,
        );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [viewWidth]);
  return ref;
}

export function Histogram({
  histogram,
  title,
  selected,
  onPick,
  maximum,
}: {
  histogram: number[];
  title: string;
  selected?: number;
  onPick?: (n: number) => void;
  maximum?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const count = total(histogram),
    active = hovered ?? selected ?? 0;
  const width = 640,
    height = 230,
    left = 46,
    top = 12,
    plotWidth = 580,
    plotHeight = 180;
  const max =
    maximum ?? Math.max(0.01, ...histogram.map((n) => (count ? n / count : 0)));
  const bar = plotWidth / 53;
  const svgRef = useChartText(width);
  const scoreAt = (event: {
    clientX: number;
    currentTarget: SVGSVGElement;
  }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp(
      Math.floor(
        (((event.clientX - rect.left) / rect.width) * width - left) / bar,
      ),
    );
  };
  return (
    <figure className="stats-figure">
      <figcaption>{title}</figcaption>
      <div
        className={`chart-interaction ${onPick ? "chart-clickable" : ""}`}
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use left and right arrow keys to inspect counts.${onPick ? " Press Enter to filter this score." : ""}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            setHovered(clamp(active + (event.key === "ArrowRight" ? 1 : -1)));
          }
          if (onPick && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onPick(active);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}: foundation card counts from 0 to 52`}
          ref={svgRef}
          onPointerMove={(event) => setHovered(scoreAt(event))}
          onPointerLeave={() => setHovered(null)}
          onClick={(event) => {
            const score = scoreAt(event);
            setHovered(score);
            onPick?.(score);
          }}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={top + plotHeight * (1 - t)}
                y2={top + plotHeight * (1 - t)}
                className="chart-grid"
              />
              <text
                x={left - 7}
                y={top + plotHeight * (1 - t) + 4}
                textAnchor="end"
              >
                {(max * t * 100).toFixed(max < 0.1 ? 1 : 0)}%
              </text>
            </g>
          ))}
          {histogram.map((n, score) => {
            const h = count ? (n / count / max) * plotHeight : 0;
            return (
              <rect
                key={score}
                data-bin={score}
                x={left + score * bar + 0.6}
                y={top + plotHeight - h}
                width={Math.max(1, bar - 1.2)}
                height={h}
                className={score === 52 ? "chart-win-bar" : "chart-bar"}
              />
            );
          })}
          <rect
            x={left + active * bar}
            y={top}
            width={bar}
            height={plotHeight}
            className="chart-cursor"
          />
          {[0, 13, 26, 39, 52].map((n) => (
            <text
              key={n}
              x={left + (n + 0.5) * bar}
              y={top + plotHeight + 20}
              textAnchor="middle"
            >
              {n}
            </text>
          ))}
        </svg>
      </div>
      <div className="chart-readout" aria-live="polite">
        <strong>{active} cards</strong>
        <span>
          {formatCount(histogram[active])} games ·{" "}
          {formatPercent(count ? histogram[active] / count : null)}
        </span>
      </div>
    </figure>
  );
}

export function WinCurve({
  entries,
  selectedRound,
  selected,
  onPick,
}: {
  entries: Entry[];
  selectedRound: 0 | 1;
  selected: number;
  onPick: (round: 0 | 1, score: number) => void;
}) {
  const curves = [conditionalCurve(entries, 0), conditionalCurve(entries, 1)];
  const width = 740,
    height = 300,
    left = 46,
    top = 16,
    pw = 675,
    ph = 240;
  const x = (score: number) => left + (score / 52) * pw;
  const y = (probability: number) => top + (1 - probability) * ph;
  const svgRef = useChartText(width);
  return (
    <figure className="stats-figure">
      <figcaption>Win probability after each round</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Conditional win probability for each foundation score after round one and round two. Vertical lines show 95% Wilson intervals."
        ref={svgRef}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line
              x1={left}
              x2={left + pw}
              y1={y(p)}
              y2={y(p)}
              className="chart-grid"
            />
            <text x={left - 7} y={y(p) + 4} textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        {curves.map((points, round) => {
          let drawing = false;
          const path = points
            .map((point) => {
              if (point.probability === null) {
                drawing = false;
                return "";
              }
              const d = `${drawing ? "L" : "M"}${x(point.score)},${y(point.probability)}`;
              drawing = true;
              return d;
            })
            .join(" ");
          return (
            <g key={round} className={round === 0 ? "curve-one" : "curve-two"}>
              {points
                .filter((p) => p.interval)
                .map((p) => (
                  <line
                    key={p.score}
                    x1={x(p.score)}
                    x2={x(p.score)}
                    y1={y(p.interval![0])}
                    y2={y(p.interval![1])}
                    className="curve-interval"
                  />
                ))}
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
              />
              {points
                .filter((p) => p.probability !== null)
                .map((p) => (
                  <circle
                    key={p.score}
                    cx={x(p.score)}
                    cy={y(p.probability!)}
                    r={2}
                    fill="currentColor"
                  />
                ))}
            </g>
          );
        })}
        <line
          x1={x(selected)}
          x2={x(selected)}
          y1={top}
          y2={top + ph}
          className="curve-selection"
        />
        {[0, 13, 26, 39, 52].map((n) => (
          <text key={n} x={x(n)} y={height - 22} textAnchor="middle">
            {n}
          </text>
        ))}
      </svg>
      <p className="chart-axis-label">
        Foundation cards at the end of the round
      </p>
      <div className="chart-legend">
        <span className="curve-one">Round 1</span>
        <span className="curve-two">Round 2</span>
        <span>Thin vertical lines: 95% confidence intervals</span>
      </div>
      <label className="score-slider">
        Inspect score <strong>{selected}</strong>
        <input
          aria-label="Inspect win probability at score"
          type="range"
          min={0}
          max={52}
          value={selected}
          onChange={(event) =>
            onPick(selectedRound, Number(event.target.value))
          }
        />
      </label>
      <div className="curve-values">
        {curves.map((points, round) => (
          <button key={round} onClick={() => onPick(round as 0 | 1, selected)}>
            <span>After round {round + 1}</span>
            <strong>{formatPercent(points[selected].probability)}</strong>
            <small>{formatCount(points[selected].games)} games</small>
          </button>
        ))}
      </div>
    </figure>
  );
}

export function TransitionHeatmap({
  entries,
  from,
  to,
  onPick,
}: {
  entries: Entry[];
  from: 0 | 1;
  to: 1 | 2;
  onPick: (n: number) => void;
}) {
  const { cells, samples } = transitionMatrix(entries, from, to);
  const [active, setActive] = useState<[number, number]>([10, 52]);
  const width = 640,
    height = 410,
    left = 48,
    top = 12,
    pw = 575,
    ph = 345;
  const cw = pw / 53,
    ch = ph / 53,
    [a, b] = active;
  const svgRef = useChartText(width);
  const pointAt = (event: {
    clientX: number;
    clientY: number;
    currentTarget: SVGSVGElement;
  }): [number, number] => {
    const r = event.currentTarget.getBoundingClientRect();
    return [
      clamp(
        Math.floor((((event.clientX - r.left) / r.width) * width - left) / cw),
      ),
      clamp(
        52 -
          Math.floor(
            (((event.clientY - r.top) / r.height) * height - top) / ch,
          ),
      ),
    ];
  };
  return (
    <figure className="stats-figure">
      <figcaption>
        Round {from + 1} → round {to + 1}
      </figcaption>
      <div
        className="chart-interaction chart-clickable"
        tabIndex={0}
        role="group"
        aria-label="Conditional transition heatmap. Use arrow keys to inspect score pairs. Press Enter to filter by the earlier score."
        onKeyDown={(event) => {
          const move: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, 1],
            ArrowDown: [0, -1],
          };
          if (move[event.key]) {
            event.preventDefault();
            setActive([
              clamp(a + move[event.key][0]),
              clamp(b + move[event.key][1]),
            ]);
          }
          if (event.key === "Enter") onPick(a);
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Each column shows the distribution of later scores conditional on its earlier score. Darker cells have higher conditional probability."
          ref={svgRef}
          onPointerMove={(event) => setActive(pointAt(event))}
          onClick={(event) => {
            const point = pointAt(event);
            setActive(point);
            onPick(point[0]);
          }}
        >
          <rect x={left} y={top} width={pw} height={ph} fill="#e5ebe6" />
          {cells.flatMap((column, x) =>
            column.flatMap((n, y) =>
              n
                ? [
                    <rect
                      key={x * 53 + y}
                      x={left + x * cw}
                      y={top + (52 - y) * ch}
                      width={cw + 0.1}
                      height={ch + 0.1}
                      fill="#164b3d"
                      opacity={Math.sqrt(n / samples[x])}
                    />,
                  ]
                : [],
            ),
          )}
          <rect
            x={left + a * cw}
            y={top + (52 - b) * ch}
            width={cw}
            height={ch}
            fill="none"
            stroke="#a12533"
            strokeWidth={1.5}
          />
          {[0, 13, 26, 39, 52].map((n) => (
            <g key={n}>
              <text
                x={left + (n + 0.5) * cw}
                y={top + ph + 20}
                textAnchor="middle"
              >
                {n}
              </text>
              <text
                x={left - 8}
                y={top + (52 - n + 0.5) * ch + 4}
                textAnchor="end"
              >
                {n}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="chart-axis-label">
        Horizontal: round {from + 1} cards · Vertical: round {to + 1} cards
      </p>
      <div className="chart-readout" aria-live="polite">
        <strong>
          {a} → {b} cards
        </strong>
        <span>
          {formatCount(cells[a][b])} / {formatCount(samples[a])} games ·{" "}
          {formatPercent(samples[a] ? cells[a][b] / samples[a] : null)}
        </span>
      </div>
      <p className="stats-note">
        Each column totals 100%. Color uses a square-root scale to reveal rare
        paths. Click a column to explore its cohort.
      </p>
    </figure>
  );
}
