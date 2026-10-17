// Presentation only: use the solver's existing sweep samples, without resampling physics.
import { useRef, useState, type PointerEvent } from "react";
import type { SweepPoint } from "../physics/types";
import { exportPng } from "../export/exportImage";

interface Props {
  points: SweepPoint[];
  freqMHz: number;
  limit?: number;
  bandLowMHz?: number;
  bandHighMHz?: number;
}

const W = 800, PL = 72, PR = 24, PT = 44, B = 240;
const ORANGE = "#d65c00", GRID = "#e8ebef";
const number = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3, useGrouping: false });

export default function SwrChart({ points, freqMHz, limit = 1.6, bandLowMHz, bandHighMHz }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ source: SweepPoint[]; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pts = [...points].filter(p => Number.isFinite(p.swr) && Number.isFinite(p.freqMHz)).sort((a, b) => a.freqMHz - b.freqMHz);
  if (pts.length < 3) return null;
  const f0 = pts[0].freqMHz, f1 = pts[pts.length - 1].freqMHz;
  if (f1 <= f0) return null;
  const sMax = Math.min(5, Math.max(2, Math.ceil(Math.min(5, Math.max(...pts.map(p => p.swr))) * 2) / 2));
  const x = (f: number) => PL + (f - f0) / (f1 - f0) * (W - PL - PR);
  const y = (s: number) => PT + (1 - (Math.max(1, Math.min(s, sMax)) - 1) / (sMax - 1)) * (B - PT);
  const inside = (f: number | undefined): f is number => f != null && Number.isFinite(f) && f >= f0 && f <= f1;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.freqMHz)},${y(p.swr)}`).join(" ");
  const ticksY: number[] = [];
  for (let s = 1; s <= sMax + 1e-9; s += 0.5) ticksY.push(s);
  const ticksX = Array.from({ length: 9 }, (_, i) => f0 + (f1 - f0) * i / 8);
  const tickDigits = Math.max(0, Math.min(6, Math.ceil(-Math.log10((f1 - f0) / 8)) + 1));
  const labels = [
    ...(inside(bandLowMHz) ? [{ f: bandLowMHz, text: `Начало ${number(bandLowMHz)}` }] : []),
    ...(inside(freqMHz) ? [{ f: freqMHz, text: `f₀ ${number(freqMHz)}` }] : []),
    ...(inside(bandHighMHz) ? [{ f: bandHighMHz, text: `Конец ${number(bandHighMHz)}` }] : []),
  ].sort((a, b) => a.f - b.f);
  const laneEnds = [-Infinity, -Infinity, -Infinity];
  const markers = labels.map(m => {
    const width = m.text.length * 6.5 + 16;
    const left = Math.max(4, Math.min(W - width - 4, x(m.f) - width / 2));
    const lane = laneEnds.findIndex(end => end + 8 < left);
    const row = lane < 0 ? 2 : lane;
    laneEnds[row] = left + width;
    return { ...m, width, left, top: 270 + row * 23 };
  });
  const H = Math.max(290, ...markers.map(m => m.top + 42));
  const selected = hover?.source === points ? pts[hover.index] : undefined;
  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const pos = svg.createSVGPoint(); pos.x = event.clientX; pos.y = event.clientY;
    const local = pos.matrixTransform(matrix.inverse());
    // Include the marker radius: screen-pixel rounding must not hide edge samples.
    if (local.x < PL - 4 || local.x > W - PR + 4 || local.y < PT - 4 || local.y > B + 4) { setHover(null); return; }
    let index = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(pts[i].freqMHz) - local.x) < Math.abs(x(pts[index].freqMHz) - local.x)) index = i;
    setHover({ source: points, index });
  };
  const save = async () => {
    if (!svgRef.current) return;
    setSaving(true); setError("");
    try {
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll('[data-hover]').forEach(el => el.remove());
      await exportPng(clone, `КСВ_${number(freqMHz)}МГц`, 3);
    } catch (e) { setError(`Не удалось сохранить PNG: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  };
  const title = `КСВ в полосе частот (50 Ом)${pts.some(p => p.swr > sMax) ? ` · шкала обрезана на ${sMax}` : ""}`;
  return <div className="swr-chart">
    <div className="swr-chart-head">
      <div className="swr-chart-title">{title}</div>
      <button type="button" className="swr-download" onClick={save} disabled={saving} aria-label="Скачать график КСВ в PNG">↓ {saving ? "Сохранение…" : "PNG"}</button>
    </div>
    {error && <div className="swr-export-error" role="alert">{error}</div>}
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="swr-svg" role="img" aria-label="График КСВ по частоте. Наведите на график или используйте стрелки клавиатуры." tabIndex={0}
      onPointerMove={onPointer} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
      onKeyDown={e => {
        if (e.key === "Escape") setHover(null);
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const previous = hover?.source === points ? hover.index : -1;
        setHover({ source: points, index: Math.max(0, Math.min(pts.length - 1, previous < 0 ? 0 : previous + (e.key === "ArrowRight" ? 1 : -1))) });
      }} fontFamily="Arial, sans-serif" fontSize={11}>
      {/* Inline presentation attributes keep the exported SVG/PNG self-contained. */}
      <rect width={W} height={H} fill="#fff" />
      <text x={PL} y={16} fill="#526173" fontSize={10}>f₀ = {number(freqMHz)} МГц · критерий полосы: КСВ ≤ {number(limit)}{pts.some(p => p.swr > sMax) ? ` · шкала обрезана на ${sMax}` : ""}</text>
      {bandLowMHz != null && bandHighMHz != null && bandHighMHz > bandLowMHz && <rect x={x(Math.max(f0, Math.min(f1, bandLowMHz)))} y={PT}
        width={Math.max(0, x(Math.min(f1, bandHighMHz)) - x(Math.max(f0, bandLowMHz)))} height={B - PT} fill="#fff2e7" />}
      {ticksY.map(s => <g key={s}>
        <line x1={PL} x2={W - PR} y1={y(s)} y2={y(s)} stroke={GRID} />
        {Math.abs(s - limit) > 0.16 && <text x={PL - 9} y={y(s) + 4} fill="#64748b" textAnchor="end">{number(s)}</text>}
      </g>)}
      {ticksX.map((f, i) => <g key={i}>
        <line x1={x(f)} x2={x(f)} y1={PT} y2={B} stroke={GRID} />
        <text x={x(f)} y={B + 18} fill="#64748b" textAnchor="middle">{f.toLocaleString("ru-RU", { maximumFractionDigits: tickDigits, useGrouping: false })}</text>
      </g>)}
      {limit >= 1 && limit <= sMax && <g>
        <line x1={PL} x2={W - PR} y1={y(limit)} y2={y(limit)} stroke="#fa7000" strokeWidth={1.4} strokeDasharray="5 4" />
        <rect x={PL - 44} y={y(limit) - 10} width={38} height={20} rx={5} fill="#fff2e7" />
        <text x={PL - 10} y={y(limit) + 4} textAnchor="end" fill={ORANGE} fontWeight={700}>{number(limit)}</text>
      </g>}
      {inside(freqMHz) && <line x1={x(freqMHz)} x2={x(freqMHz)} y1={PT} y2={B} stroke={ORANGE} strokeWidth={1.2} strokeDasharray="3 4" />}
      <path d={path} fill="none" stroke="#171717" strokeWidth={2} />
      {pts.map((p, i) => <circle key={i} cx={x(p.freqMHz)} cy={y(p.swr)} r={2.4} fill="#171717" />)}
      <path d={`M${PL},${PT}V${B}H${W - PR}`} fill="none" stroke="#171717" strokeWidth={1.2} />
      {markers.map((m, i) => <g key={i}>
        <path d={`M${x(m.f)},${B}v6 M${x(m.f)},${B + 24}V${m.top - 4}H${m.left + m.width / 2}V${m.top}`} fill="none" stroke="#e7a574" strokeWidth={0.8} />
        <rect x={m.left} y={m.top} width={m.width} height={20} rx={5} fill="#fff2e7" stroke="#f6d3b7" />
        <text x={m.left + m.width / 2} y={m.top + 14} textAnchor="middle" fill={ORANGE} fontWeight={700}>{m.text}</text>
      </g>)}
      <text x={14} y={PT + 4} fill="#334155" fontWeight={700}>КСВ</text>
      <text x={W - PR} y={H - 6} fill="#64748b" textAnchor="end">МГц</text>
      {selected && (() => {
        const sx = x(selected.freqMHz), sy = y(selected.swr), boxW = 174;
        const bx = Math.max(PL + 4, Math.min(W - PR - boxW, sx - boxW / 2));
        const by = sy - 64 >= PT ? sy - 64 : sy + 12;
        return <g data-hover="true" pointerEvents="none">
          <path d={`M${PL},${sy}H${sx}V${B}`} fill="none" stroke={ORANGE} strokeWidth={1} strokeDasharray="4 4" />
          <circle cx={sx} cy={sy} r={4} fill="#fa7000" stroke="#fff" strokeWidth={1.5} />
          <rect x={bx} y={by} width={boxW} height={52} rx={7} fill="#172334" />
          <text x={bx + 12} y={by + 20} fill="#fff" fontWeight={700}>{number(selected.freqMHz)} МГц</text>
          <text x={bx + 12} y={by + 39} fill="#ffba80">КСВ {number(selected.swr)}{selected.swr > sMax ? " · выше шкалы" : ""}</text>
        </g>;
      })()}
    </svg>
    <div className="swr-chart-hint">{pts.length} расчётных точек · наведите на график для значений · ← → для выбора с клавиатуры</div>
  </div>;
}
