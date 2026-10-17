// Полярная диаграмма направленности. Рендер в SVG: чёткие чёрные линии на белом.
// Стиль паспорта: кольца дБ, штриховые радиальные спицы, тонкие метки по кромке.

import { forwardRef } from "react";
import type { PatternPlane } from "../physics/types";

interface Props {
  plane: PatternPlane;
  floorDb: number;
  title: string;
  size?: number;
}

const DEG = Math.PI / 180;

/** Экранные координаты: 0° — вверх, угол растёт по часовой стрелке. */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = angleDeg * DEG;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

export const PolarPlot = forwardRef<SVGSVGElement, Props>(function PolarPlot(
  { plane, floorDb, title, size = 460 },
  ref,
) {
  const pad = 46;
  const topPad = 30; // место под заголовок
  const R = size / 2 - pad; // радиус одинаков в обоих режимах
  const cx = size / 2;
  const cy = plane.hemisphere ? topPad + R : size / 2;
  const svgH = plane.hemisphere ? cy + 46 : size; // место под подписи снизу

  const rings = Math.round(Math.abs(floorDb) / 10); // число колец по 10 дБ
  const valToR = (db: number) => {
    const fr = (db - floorDb) / (0 - floorDb);
    return Math.max(0, Math.min(1, fr)) * R;
  };

  const angMin = plane.hemisphere ? -90 : 0;
  const angMax = plane.hemisphere ? 90 : 360;

  // Кривая ДН.
  const curve = plane.points
    .filter((p) => p.angleDeg >= angMin && p.angleDeg <= angMax)
    .map((p, i) => {
      const { x, y } = polar(cx, cy, valToR(p.valueDb), p.angleDeg);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const curvePath = plane.hemisphere ? curve : curve + " Z";

  // Спицы.
  const spokeStep = 30;
  const spokes: JSX.Element[] = [];
  for (let a = angMin; a <= angMax - (plane.hemisphere ? 0 : 1); a += spokeStep) {
    const p = polar(cx, cy, R, a);
    spokes.push(
      <line
        key={`s${a}`}
        x1={cx}
        y1={cy}
        x2={p.x}
        y2={p.y}
        stroke="#000"
        strokeWidth={0.5}
        strokeDasharray="4 4"
        opacity={0.55}
      />,
    );
    const lp = polar(cx, cy, R + 20, a);
    const label = ((a % 360) + 360) % 360;
    spokes.push(
      <text
        key={`sl${a}`}
        x={lp.x}
        y={lp.y}
        fontSize={12}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#000"
      >
        {label}°
      </text>,
    );
  }

  // Кольца дБ + подписи.
  const ringEls: JSX.Element[] = [];
  for (let k = 1; k <= rings; k++) {
    const db = -10 * k;
    const r = valToR(db);
    if (plane.hemisphere) {
      const a0 = polar(cx, cy, r, -90);
      const a1 = polar(cx, cy, r, 90);
      ringEls.push(
        <path
          key={`r${k}`}
          d={`M${a0.x},${a0.y} A${r},${r} 0 0 1 ${a1.x},${a1.y}`}
          fill="none"
          stroke="#000"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          opacity={0.5}
        />,
      );
    } else {
      ringEls.push(
        <circle
          key={`r${k}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#000"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          opacity={0.5}
        />,
      );
    }
    ringEls.push(
      <text key={`rl${k}`} x={cx + 3} y={cy - r + 3} fontSize={10} fill="#000">
        {db}
      </text>,
    );
  }

  // Мелкие метки по кромке.
  const ticks: JSX.Element[] = [];
  for (let a = angMin; a <= angMax; a += 2) {
    const long = a % 10 === 0;
    const p0 = polar(cx, cy, R, a);
    const p1 = polar(cx, cy, R - (long ? 8 : 4), a);
    ticks.push(
      <line key={`t${a}`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#000" strokeWidth={long ? 0.8 : 0.4} />,
    );
  }

  return (
    <svg
      ref={ref}
      width={size}
      height={svgH}
      viewBox={`0 0 ${size} ${svgH}`}
      style={{ background: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x={cx} y={18} fontSize={title.length > 40 ? 11 : 13} fontWeight={600} textAnchor="middle" fill="#000">
        {title}
      </text>
      {/* внешняя граница */}
      {plane.hemisphere ? (
        <>
          <path
            d={`M${polar(cx, cy, R, -90).x},${polar(cx, cy, R, -90).y} A${R},${R} 0 0 1 ${polar(cx, cy, R, 90).x},${polar(cx, cy, R, 90).y}`}
            fill="none"
            stroke="#000"
            strokeWidth={1.2}
          />
          <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#000" strokeWidth={1.2} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#000" strokeWidth={1.2} />
      )}
      {ringEls}
      {spokes}
      {ticks}
      <path d={curvePath} fill="none" stroke="#000" strokeWidth={2} strokeLinejoin="round" />
      <text x={cx} y={svgH - 8} fontSize={11} textAnchor="middle" fill="#000">
        {plane.label}
      </text>
    </svg>
  );
});
