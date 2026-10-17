// Сетчатая модель плоского круглого металлического экрана для метода моментов.
//
// Сплошной экран конечного размера заменяется полярной проволочной сеткой в плоскости
// z = 0 — это стандартный приём NEC2 («wire-grid model»). Ячейка ≤ λ/8 (проверено
// также при λ/10 — см. тесты), радиус проводов сетки по правилу равной площади
// r = s/(2π) (s — шаг ячейки) — сетка тогда эквивалентна сплошной пластине по
// поверхностному току; ограничивается сверху, чтобы провода сетки не «наезжали» на
// проводники антенны, стоящие близко над экраном.
//
// Строение: центральный узел, кольца на равном шаге по радиусу, спицы. Число узлов на
// кольце удваивается, как только дуга между ними превышает ячейку — поэтому ячейки
// остаются примерно квадратными от центра до края. Каждое ребро сетки — отдельный
// провод из одного сегмента; их концы сходятся в узлах, и решатель mom3d ставит там
// базисы соединений (закон Кирхгофа).
//
// «Закрепляемые» точки (pins): узлы сетки, к которым подключаются антенны (основания
// спиралей). Ближайший к такой точке узел сетки переносится точно в неё — сетка
// локально слегка искажается, но питающий штырь стоит ровно на экране.

import type { Wire } from "./mom3d";

type V3 = [number, number, number];

export interface DiskGrid {
  wires: Wire[];
  nodes: V3[];
  edges: [number, number][];
  cellM: number;
  wireRadiusM: number;
  /** Индексы узлов, перенесённых в точки pins (в том же порядке). */
  pinNodes: number[];
}

export function diskGrid(radiusM: number, cellM: number, wireRadiusM: number, pins: V3[] = []): DiskGrid {
  const nr = Math.max(1, Math.ceil(radiusM / cellM - 1e-9));
  const dr = radiusM / nr;
  const nodes: V3[] = [[0, 0, 0]];
  const edges: [number, number][] = [];
  // Допуск 15%: не удваивать узлы ради ячейки, превышающей шаг на несколько процентов.
  const TOL = 1.15;
  let prevStart = 0, prevM = 1;
  for (let i = 1; i <= nr; i++) {
    const r = i * dr;
    let M = i === 1 ? 6 : prevM;
    while ((2 * Math.PI * r) / M > TOL * cellM) M *= 2;
    const start = nodes.length;
    for (let j = 0; j < M; j++) {
      const a = (2 * Math.PI * j) / M;
      nodes.push([r * Math.cos(a), r * Math.sin(a), 0]);
    }
    // Кольцевые рёбра.
    for (let j = 0; j < M; j++) edges.push([start + j, start + ((j + 1) % M)]);
    // Спицы к предыдущему кольцу (или к центру).
    if (i === 1) {
      for (let j = 0; j < M; j++) edges.push([0, start + j]);
    } else {
      const ratio = M / prevM; // целое: M получено удвоением prevM
      for (let j = 0; j < M; j += ratio) edges.push([prevStart + j / ratio, start + j]);
    }
    prevStart = start; prevM = M;
  }

  // Закрепление узлов под точки подключения.
  const pinNodes: number[] = [];
  const taken = new Set<number>();
  for (const p of pins) {
    let best = -1, bd = Infinity;
    for (let n = 0; n < nodes.length; n++) {
      if (taken.has(n)) continue;
      const d = Math.hypot(nodes[n][0] - p[0], nodes[n][1] - p[1]);
      if (d < bd) { bd = d; best = n; }
    }
    taken.add(best);
    nodes[best] = [p[0], p[1], 0];
    pinNodes.push(best);
  }

  const wires: Wire[] = edges.map(([a, b]) => ({
    pts: [nodes[a], nodes[b]],
    radius: wireRadiusM,
    // Один сегмент на ребро: seglen заведомо больше длины ребра.
    seglen: 1e9,
  }));
  return { wires, nodes, edges, cellM, wireRadiusM, pinNodes };
}

/** Число неизвестных, которое сетка добавит в задачу MoM: Σ(степень узла − 1) = 2E − V. */
export function gridUnknowns(g: DiskGrid): number {
  return 2 * g.edges.length - g.nodes.length;
}
