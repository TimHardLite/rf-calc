// Узлы соединения проводов в mom3d и конечный экран проволочной сеткой (GNSS).
// Эталоны NEC2 получены на ИДЕНТИЧНОЙ геометрии (та же сетка, те же провода).
// NEC2 на этих сетках сам показывает средний КУ по сфере 0.68…0.83 вместо 1 (известная
// слабость NEC-2 на соединениях проводов разной длины/толщины): его ФОРМА ДН верна,
// а абсолютный КУ занижен на 10·lg(avg). Поэтому сравниваем форму ДН и КНД
// (= КУ_NEC − 10·lg(avg_NEC)). Наш баланс энергии при этом 1.00.
import { describe, it, expect } from "vitest";
import { solve3D, type Wire } from "./mom3d";
import { diskGrid, gridUnknowns } from "./wiregrid";
import { computeGnss, type GnssInput } from "./gnss";
import { computeMoxon } from "./moxon";
import { designGnss } from "../synth/gnss";
import { ANTENNAS } from "../registry";

const LAM1575 = 299792458 / 1575e6;
const relDb = (r: ReturnType<typeof solve3D>, th: number, ph: number) =>
  10 * Math.log10(r.powerAt(th, ph) / r.Umax);

describe("mom3d: узлы соединения проводов", () => {
  const f = 300, lam = 299792458 / 300e6, s = lam / 30, a = 0.002;
  const P: [number, number, number][] = [[0, 0, 0.1], [0, 0, 0.1 + 10 * s], [6 * s, 0, 0.1 + 10 * s], [6 * s, 4 * s, 0.1 + 14 * s]];
  const one: Wire = { pts: P, radius: a, seglen: s };
  const split: Wire[] = [{ pts: [P[0], P[1]], radius: a, seglen: s }, { pts: [P[1], P[2], P[3]], radius: a, seglen: s }];

  for (const ground of [false, true]) {
    it(`ломаная из двух проводов со стыком = та же ломаная одним проводом (${ground ? "над землёй" : "свободное пр."})`, () => {
      const r1 = solve3D([one], f, { point: [0, 0, 0.1 + 5 * s] }, { groundPlane: ground });
      const r2 = solve3D(split, f, { point: [0, 0, 0.1 + 5 * s] }, { groundPlane: ground });
      expect(Math.abs(r2.Zin.re - r1.Zin.re)).toBeLessThan(0.05);
      expect(Math.abs(r2.Zin.im - r1.Zin.im)).toBeLessThan(0.5);
      expect(Math.abs(r2.gainDbi - r1.gainDbi)).toBeLessThan(0.005);
      expect(Math.abs(r2.avgGain - 1)).toBeLessThan(0.01);
    });
  }

  it("питание в узле соединения: монополь на сетчатом диске — баланс энергии и КНД как у NEC2", () => {
    const g = diskGrid(0.75 * LAM1575, LAM1575 / 8, LAM1575 / 8 / (2 * Math.PI));
    const h = LAM1575 / 4;
    const r = solve3D([{ pts: [[0, 0, 0], [0, 0, h]], radius: 0.001, seglen: h / 12 }, ...g.wires], 1575, { point: [0, 0, 0] });
    expect(Math.abs(r.avgGain - 1)).toBeLessThan(0.01);
    // NEC2 на той же сетке: КУ 1.79 дБи при avg 0.6814 → КНД 3.46 дБи.
    expect(Math.abs(r.gainDbi - 3.46)).toBeLessThan(0.15);
    // Форма ДН (NEC2, отн. своего максимума 1.79): 30° −0.13, 60° −0.97, 90° −3.93, 150° −6.02
    const nec: [number, number][] = [[30, 1.66 - 1.79], [60, 0.82 - 1.79], [90, -2.14 - 1.79], [150, -4.23 - 1.79]];
    for (const [th, v] of nec) expect(Math.abs(relDb(r, th, 0) - v)).toBeLessThan(0.3);
  });
});

describe("сетка экрана", () => {
  it("неизвестных столько, сколько даёт Σ(степень−1); основания спиралей попадают в узлы", () => {
    const pins: [number, number, number][] = [[0.1, 0.01, 0], [-0.05, 0.08, 0]];
    const g = diskGrid(0.14, 0.024, 0.0038, pins);
    const deg = new Array(g.nodes.length).fill(0);
    for (const [a, b] of g.edges) { deg[a]++; deg[b]++; }
    expect(gridUnknowns(g)).toBe(deg.reduce((s, d) => s + d - 1, 0));
    g.pinNodes.forEach((n, i) => {
      expect(g.nodes[n][0]).toBe(pins[i][0]);
      expect(g.nodes[n][1]).toBe(pins[i][1]);
    });
  });
});

describe("GNSS: конечный экран (сетка в MoM)", () => {
  const base: GnssInput = {
    freqMHz: 1575, helixCount: 3, helixDiaMm: 60, turns: 2, heightMm: 40, arrangeRadiusMm: 70,
    tapeWidthMm: 8, sense: "RH", standoffMm: 11, floorDb: -40,
  };

  it("сверка с NEC2 на той же сетке: КНД ±0.15 дБ, форма главного лепестка ±0.3 дБ", () => {
    const r = computeGnss({ ...base, groundPlane: "finite", screenDiaMm: 285.3 });
    // NEC2: КУ 11.49 дБи при avg 0.7836 → КНД 12.55 дБи.
    expect(Math.abs(r.metrics.directivityDbi! - 12.55)).toBeLessThan(0.15);
    expect(Math.abs(r.metrics.avgGain! - 1)).toBeLessThan(0.01);
    const p0 = r.planes[0].points, p90 = r.planes[1].points;
    const nec0: [number, number][] = [[15, -1.3], [30, -5.18], [45, -11.34], [60, -19.06], [75, -25.8], [90, -29.08]];
    const nec90: [number, number][] = [[15, -1.7], [30, -5.88], [45, -12.09], [60, -18.86], [75, -23.88], [90, -26.96]];
    for (const [a, v] of nec0) expect(Math.abs(p0[a].valueDb - v)).toBeLessThan(0.35);
    for (const [a, v] of nec90) expect(Math.abs(p90[a].valueDb - v)).toBeLessThan(0.35);
  });

  it("нижняя полусфера настоящая: нет обрыва на горизонте, задний лепесток выше полки, F/B конечен", () => {
    const r = computeGnss({ ...base, standoffMm: 3 });
    const p = r.planes[0].points;
    // Непрерывность через горизонт (прежде — обрыв до полки −40 дБ)
    for (const a of [88, 89, 90, 91, 92]) expect(Math.abs(p[a].valueDb - p[a + 1].valueDb)).toBeLessThan(3);
    for (let a = 100; a <= 260; a += 10) expect(p[a].valueDb).toBeGreaterThan(-39);
    expect(r.metrics.frontToBackDb).not.toBeNull();
    expect(r.metrics.frontToBackDb!).toBeGreaterThan(15);
    // Зазор 3 мм меньше допустимого над сеткой — поднят, и об этом сказано.
    expect(r.notes.some((n) => n.includes("увеличена"))).toBe(true);
  });

  it("большой экран сходится к бесконечному: КНД одиночной спирали ±0.2 дБ", () => {
    const one = { ...base, helixCount: 1, arrangeRadiusMm: 0, turns: 5, heightMm: 100, standoffMm: 10 };
    const inf = computeGnss({ ...one, groundPlane: "infinite" });
    const fin = computeGnss({ ...one, groundPlane: "finite", screenDiaMm: 400 });
    expect(Math.abs(fin.metrics.directivityDbi! - inf.metrics.directivityDbi!)).toBeLessThan(0.2);
    const pI = inf.planes[0].points, pF = fin.planes[0].points;
    for (const a of [15, 30, 45]) expect(Math.abs(pF[a].valueDb - pI[a].valueDb)).toBeLessThan(0.5);
  }, 20000);

  it("бесконечный экран и «нет экрана» работают как раньше (boolean — совместимость)", () => {
    const inf = computeGnss({ ...base, groundPlane: true, standoffMm: 3 });
    expect(inf.planes[0].points[150].valueDb).toBe(-40); // под бесконечным экраном поля нет
    const none = computeGnss({ ...base, groundPlane: "none" });
    expect(none.planes[0].points[180].valueDb).toBeGreaterThan(none.planes[0].points[0].valueDb); // backfire
  });

  it("лента шириной 2d и круглый провод Ø d дают один и тот же результат", () => {
    const tape = computeGnss({ ...base, conductor: "tape", tapeWidthMm: 3 });
    const wire = computeGnss({ ...base, conductor: "wire", wireDiaMm: 1.5, tapeWidthMm: 99 });
    expect(wire.metrics.directivityDbi).toBeCloseTo(tape.metrics.directivityDbi!, 9);
    expect(wire.notes.some((n) => n.includes("круглый провод Ø 1.5"))).toBe(true);
  });

  it("основания за краем экрана — понятный отказ, а не мусор", () => {
    const r = computeGnss({ ...base, screenDiaMm: 150 });
    expect(r.planes[0].points.length).toBe(0);
    expect(r.notes[0]).toContain("за край экрана");
  });

  it("реестр: прежний файл с groundPlane=yes считается с конечным экраном 285.3 мм", () => {
    const a = ANTENNAS.find((x) => x.id === "gnss")!;
    const r = a.analysis.compute({
      freqMHz: 1575, helixCount: 3, helixDiaMm: 60, turns: 2, heightMm: 40, arrangeRadiusMm: 70,
      tapeWidthMm: 8, sense: "RH", groundPlane: "yes", standoffMm: 3, floorDb: -40,
    });
    expect(r.notes.some((n) => n.includes("Ø 285.3 мм"))).toBe(true);
    expect(r.planes[0].points[150].valueDb).toBeGreaterThan(-39);
  });
});

describe("GNSS: проектирование — расстановка по апертурам и экран", () => {
  it("шаг = max(1.15·Ø; min(√Aэ; λ(1−1/N))), спирали не касаются, основания на экране, расчёт сборки выполняется", () => {
    const d = designGnss({ freqMHz: 1575, helixCount: 3, targetGainDbi: 9, pitchRel: 0.22, conductor: "tape", floorDb: -40 });
    const v = d.analysisValues as Record<string, number>;
    const lam = 299792.458 / 1575;
    const gRow = d.rows.find((r) => r.label.startsWith("Усиление одиночной"))!;
    const g = 10 ** (parseFloat(gRow.value.replace(",", ".")) / 10);
    const step = v.arrangeRadiusMm * 2 * Math.sin(Math.PI / 3);
    const expected = Math.max(v.helixDiaMm * 1.15, Math.min(lam * Math.sqrt(g / (4 * Math.PI)), lam * (1 - 1 / 3)));
    expect(Math.abs(step - expected)).toBeLessThan(0.5);
    expect(step).toBeGreaterThan(v.helixDiaMm * 1.15 - 0.5);
    expect(v.screenDiaMm / 2).toBeGreaterThan(v.arrangeRadiusMm + v.helixDiaMm / 2);
    const a = ANTENNAS.find((x) => x.id === "gnss")!;
    const r = a.analysis.compute(d.analysisValues);
    expect(r.planes[0].points.length).toBe(360);
    expect(Math.abs(r.metrics.avgGain! - 1)).toBeLessThan(0.02);
  }, 20000);

  it("исполнение «провод» передаёт в расчёт диаметр провода, «лента» — ширину 2d", () => {
    const w = designGnss({ freqMHz: 1575, helixCount: 1, targetGainDbi: 9, pitchRel: 0.22, conductor: "wire", floorDb: -40 });
    const t = designGnss({ freqMHz: 1575, helixCount: 1, targetGainDbi: 9, pitchRel: 0.22, conductor: "tape", floorDb: -40 });
    expect(w.analysisValues.conductor).toBe("wire");
    expect(t.analysisValues.conductor).toBe("tape");
    expect(Number(t.analysisValues.tapeWidthMm)).toBeCloseTo(2 * Number(w.analysisValues.wireDiaMm), 1);
  });
});

describe("Moxon: исполнение на печатной плате", () => {
  const g = { freqMHz: 915, widthA: 116.92, tailB: 14.04, gapC: 6.91, tailD: 22.79, floorDb: -40 };
  it("дорожка шириной w считается как провод Ø w/2 (бит-в-бит)", () => {
    const wire = computeMoxon({ ...g, diameterMm: 2 });
    const pcb = computeMoxon({ ...g, diameterMm: 123, elementType: "flat", stripWmm: 4 });
    expect(pcb.metrics.directivityDbi).toBe(wire.metrics.directivityDbi);
    expect(pcb.metrics.impedanceR).toBe(wire.metrics.impedanceR);
    expect(pcb.notes.some((n) => n.includes("Диэлектрик платы"))).toBe(true);
    expect(wire.notes.some((n) => n.includes("Диэлектрик платы"))).toBe(false);
  });
  it("синтез печатного Moxon подставляет в полиномы эквивалентный Ø w/2", () => {
    const a = ANTENNAS.find((x) => x.id === "moxon")!;
    const dw = a.synthesis!.design({ freqMHz: 915, diameterMm: 2, targetZ: 50, elementType: "wire", stripWmm: 4, floorDb: -40 });
    const dp = a.synthesis!.design({ freqMHz: 915, diameterMm: 9, targetZ: 50, elementType: "flat", stripWmm: 4, floorDb: -40 });
    for (const k of ["widthA", "tailB", "gapC", "tailD"]) expect(dp.analysisValues[k]).toBe(dw.analysisValues[k]);
    expect(dp.analysisValues.elementType).toBe("flat");
    const r = a.analysis.compute(dp.analysisValues);
    expect(r.metrics.impedanceR!).toBeGreaterThan(40);
    expect(r.metrics.impedanceR!).toBeLessThan(60);
  });
});
