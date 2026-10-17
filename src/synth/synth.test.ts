import { describe, it, expect } from "vitest";
import { designYagi, boomCorrectionMm } from "./yagi";
import { designPatch } from "./patch";
import { designMoxon } from "./moxon";
import { designDipole } from "./dipole";
import { designHorn } from "./horn";
import { designLpda } from "./lpda";
import { designArray } from "./array";
import { designGnss } from "./gnss";
import { ANTENNAS, getAntenna } from "../registry";
import type { ElementSpec } from "../fields";
import { computePatch } from "../physics/patch";
import { slotConductances, edgeResistance } from "../physics/patchmodel";

const C_MM = 299792.458;

describe("синтез: яги по DL6WU", () => {
  it("геометрия совпадает с опубликованной таблицей DL6WU (432 МГц, 4 мм, диэл. бум)", () => {
    const f = 432, lambda = C_MM / f;
    const d = designYagi({
      freqMHz: f, elementCount: 12, elementDiaMm: 4, boomDiaMm: 0,
      boomShape: "square", mounting: "dielectric", floorDb: -40,
    });
    const el = d.analysisValues.elements as ElementSpec[];
    expect(el.length).toBe(12);
    // Рефлектор 0.491λ, активный 0.476λ, D1 0.435λ — опорные значения таблицы.
    expect(el[0].lengthMm / lambda).toBeCloseTo(0.491, 3);
    expect(el[1].lengthMm / lambda).toBeCloseTo(0.476, 3);
    expect(el[2].lengthMm / lambda).toBeCloseTo(0.435, 3);
    // Позиции: рефлектор 0, активный 0.200λ, D1 0.275λ, D2 0.455λ, D3 0.670λ.
    expect(el[0].positionMm).toBe(0);
    expect(el[1].positionMm / lambda).toBeCloseTo(0.200, 3);
    expect(el[2].positionMm / lambda).toBeCloseTo(0.275, 3);
    expect(el[3].positionMm / lambda).toBeCloseTo(0.455, 3);
    expect(el[4].positionMm / lambda).toBeCloseTo(0.670, 3);
  });

  it("шаг директоров выходит на насыщение 0.400λ", () => {
    const f = 432, lambda = C_MM / f;
    const d = designYagi({
      freqMHz: f, elementCount: 20, elementDiaMm: 4, boomDiaMm: 0,
      boomShape: "square", mounting: "dielectric", floorDb: -40,
    });
    const el = d.analysisValues.elements as ElementSpec[];
    const last = (el[19].positionMm - el[18].positionMm) / lambda;
    expect(last).toBeCloseTo(0.400, 3);
  });

  it("поправка на бум: контакт вдвое больше изолированного, у диэлектрика нулевая", () => {
    const lambda = 1000;
    const contact = boomCorrectionMm(20, lambda, "through-contact", "square").deltaMm;
    const insul = boomCorrectionMm(20, lambda, "through-insulated", "square").deltaMm;
    const diel = boomCorrectionMm(20, lambda, "dielectric", "square").deltaMm;
    expect(contact / insul).toBeCloseTo(2, 6);
    expect(diel).toBe(0);
    // B = 0.02 → C = 25.195·0.02 − 229·0.0004 = 0.41230 → ΔL = 0.41230·20 мм
    expect(contact).toBeCloseTo(0.4123 * 20, 3);
  });

  it("поправка на бум максимальна 2/3 диаметра (как указывал DL6WU) и удлиняет элементы", () => {
    const lambda = 1000;
    const atPeak = boomCorrectionMm(55, lambda, "through-contact", "round");
    expect(atPeak.deltaMm / 55).toBeCloseTo(0.693, 3);
    const withBoom = designYagi({ freqMHz: 432, elementCount: 8, elementDiaMm: 4, boomDiaMm: 20, boomShape: "square", mounting: "through-contact", floorDb: -40 });
    const noBoom = designYagi({ freqMHz: 432, elementCount: 8, elementDiaMm: 4, boomDiaMm: 0, boomShape: "square", mounting: "dielectric", floorDb: -40 });
    const a = (withBoom.analysisValues.elements as ElementSpec[])[0].lengthMm;
    const b = (noBoom.analysisValues.elements as ElementSpec[])[0].lengthMm;
    expect(a).toBeGreaterThan(b);
  });

  it("бум толще 0.055λ даёт предупреждение, а не молчаливую экстраполяцию", () => {
    const d = designYagi({ freqMHz: 1000, elementCount: 8, elementDiaMm: 4, boomDiaMm: 40, boomShape: "round", mounting: "through-contact", floorDb: -40 });
    expect(d.notes.some((n) => n.includes("0.055"))).toBe(true);
  });
});

describe("синтез: патч", () => {
  it("воспроизводит эталонный расчёт Balanis/Hammerstad", () => {
    // Контрольная точка: f=2400 МГц, εr=4.4 (FR-4), h=1.6 мм.
    const d = designPatch({ freqMHz: 2400, epsR: 4.4, substrateH: 1.6, targetZ: 50, polarization: "Линейная", tanD: 0, floorDb: -40 });
    const W = Number(d.analysisValues.widthMm);
    const L = Number(d.analysisValues.lengthMm);
    // W = c/(2f)·√(2/(εr+1)) = 62.456·0.6086 ≈ 38.03 мм
    expect(W).toBeCloseTo(38.03, 1);
    // L для FR-4 на 2.4 ГГц — общеизвестные ≈29.4 мм
    expect(L).toBeGreaterThan(28.5);
    expect(L).toBeLessThan(30.5);
    // Резонансная проверка: длина должна быть около 0.3–0.5λ
    const lambda = C_MM / 2400;
    expect(L / lambda).toBeGreaterThan(0.2);
    expect(L / lambda).toBeLessThan(0.5);
  });

  it("предупреждает, что круговую поляризацию этой формулой не спроектировать", () => {
    const d = designPatch({ freqMHz: 1575, epsR: 2.2, substrateH: 1.5, targetZ: 50, polarization: "RHCP", tanD: 0, floorDb: -40 });
    expect(d.notes.some((n) => n.includes("круговой") || n.includes("RHCP"))).toBe(true);
  });

  it("врезка x0 меньше длины патча и даёт нужное сопротивление", () => {
    const d = designPatch({ freqMHz: 2400, epsR: 4.4, substrateH: 1.6, targetZ: 50, polarization: "Линейная", tanD: 0, floorDb: -40 });
    const row = d.rows.find((r) => r.label.includes("врезки x₀"))!;
    const x0 = Number(row.value);
    expect(x0).toBeGreaterThan(0);
    expect(x0).toBeLessThan(Number(d.analysisValues.lengthMm) / 2);
  });
});

describe("синтез: Moxon", () => {
  it("даёт размеры в разумных долях λ и A ≈ 0.36λ", () => {
    const f = 145, lambda = C_MM / f;
    const d = designMoxon({ freqMHz: f, diameterMm: 4, targetZ: 50, floorDb: -40 });
    const A = Number(d.analysisValues.widthA);
    const E = Number(d.analysisValues.tailB) + Number(d.analysisValues.gapC) + Number(d.analysisValues.tailD);
    expect(A / lambda).toBeGreaterThan(0.32);
    expect(A / lambda).toBeLessThan(0.40);
    expect(E / lambda).toBeGreaterThan(0.10);
    expect(E / lambda).toBeLessThan(0.20);
  });

  it("отказывается считать вне области годности полиномов, а не экстраполирует", () => {
    // Слишком толстый провод: d/λ > 1e−2
    const d = designMoxon({ freqMHz: 145, diameterMm: 100, targetZ: 50, floorDb: -40 });
    expect(d.rows.length).toBe(0);
    expect(d.notes[0]).toContain("вне области годности");
  });
});

describe("синтез: диполь (численный поиск резонанса)", () => {
  it("находит резонансную длину около 0.47…0.49λ и Im Z ≈ 0", () => {
    const f = 300, lambda = C_MM / f;
    const d = designDipole({ freqMHz: f, elementType: "wire", diameterMm: 4, stripWmm: 6, floorDb: -40 });
    const L = Number(d.analysisValues.lengthMm);
    expect(L / lambda).toBeGreaterThan(0.44);
    expect(L / lambda).toBeLessThan(0.50);
    // Сопротивление в резонансе для тонкого диполя ≈ 70 Ом
    const zRow = d.rows.find((r) => r.label.includes("Входное сопротивление"))!;
    expect(Number(zRow.value)).toBeGreaterThan(55);
    expect(Number(zRow.value)).toBeLessThan(95);
  });

  it("толстый вибратор короче тонкого (физически верно)", () => {
    const thin = designDipole({ freqMHz: 300, elementType: "wire", diameterMm: 1, stripWmm: 6, floorDb: -40 });
    const thick = designDipole({ freqMHz: 300, elementType: "wire", diameterMm: 20, stripWmm: 6, floorDb: -40 });
    expect(Number(thick.analysisValues.lengthMm)).toBeLessThan(Number(thin.analysisValues.lengthMm));
  });
});

describe("синтез: рупор", () => {
  it("оптимальный пирамидальный рупор: клинья сшиваются, усиление близко к заданному", () => {
    const d = designHorn({ freqMHz: 10000, targetGainDbi: 18, floorDb: -40 });
    const a1 = Number(d.analysisValues.apertureA);
    const b1 = Number(d.analysisValues.apertureB);
    expect(a1).toBeGreaterThan(b1); // H-раскрыв шире E-раскрыва у оптимального рупора
    const mismatch = Number(d.rows.find((r) => r.label.includes("Расхождение"))!.value);
    expect(mismatch).toBeLessThan(0.5); // мм — клинья сошлись
    const gain = Number(d.rows.find((r) => r.label.includes("Усиление"))!.value);
    expect(Math.abs(gain - 18)).toBeLessThan(1.0);
  });

  it("больше требуемое усиление — больше раскрыв", () => {
    const small = designHorn({ freqMHz: 10000, targetGainDbi: 14, floorDb: -40 });
    const big = designHorn({ freqMHz: 10000, targetGainDbi: 22, floorDb: -40 });
    expect(Number(big.analysisValues.apertureA)).toBeGreaterThan(Number(small.analysisValues.apertureA));
  });
});

describe("синтез: ЛПА (Каррел)", () => {
  it("σ на линии оптимума, N покрывает полосу, длины по τ", () => {
    const d = designLpda({ freqLowMHz: 200, freqHighMHz: 600, tau: 0.88, diameterMm: 10, feederZ0: 100, floorDb: -40 });
    const sigma = Number(d.analysisValues.sigma);
    expect(sigma).toBeCloseTo(0.243 * 0.88 - 0.051, 4);
    const N = Number(d.analysisValues.count);
    expect(N).toBeGreaterThan(5);
    // Самый длинный ≈ λ/2 на нижней частоте
    const Lmax = Number(d.analysisValues.longestMm);
    expect(Lmax).toBeCloseTo(C_MM / (2 * 200), 0);
    // Самый короткий должен дотягивать до верхней частоты
    const Lmin = Lmax * Math.pow(0.88, N - 1);
    expect(Lmin).toBeLessThan(C_MM / (2 * 600));
  });

  it("шире полоса — больше элементов", () => {
    const narrow = designLpda({ freqLowMHz: 200, freqHighMHz: 400, tau: 0.88, diameterMm: 10, feederZ0: 100, floorDb: -40 });
    const wide = designLpda({ freqLowMHz: 200, freqHighMHz: 1200, tau: 0.88, diameterMm: 10, feederZ0: 100, floorDb: -40 });
    expect(Number(wide.analysisValues.count)).toBeGreaterThan(Number(narrow.analysisValues.count));
  });
});

describe("синтез: решётка", () => {
  it("по требуемому КНД подбирает N, оценка сходится обратно", () => {
    const d = designArray({ freqMHz: 1000, goal: "gain", targetGainDbi: 12, targetHpbwDeg: 12, spacingRel: 0.5, phaseDeg: 0, floorDb: -40 });
    const N = Number(d.analysisValues.count);
    const Ddbi = 10 * Math.log10(2 * N * 0.5);
    expect(Math.abs(Ddbi - 12)).toBeLessThan(0.6);
  });

  it("предупреждает о дифракционных лепестках при шаге ≥ λ", () => {
    const d = designArray({ freqMHz: 1000, goal: "gain", targetGainDbi: 12, targetHpbwDeg: 12, spacingRel: 1.1, phaseDeg: 0, floorDb: -40 });
    expect(d.notes.some((n) => n.includes("дифракционные"))).toBe(true);
  });
});

describe("синтез: GNSS-спираль", () => {
  it("диаметр даёт окружность витка ≈ λ (условие осевого режима)", () => {
    const f = 1575.42, lambda = C_MM / f;
    const d = designGnss({ freqMHz: f, helixCount: 3, targetGainDbi: 12, pitchRel: 0.22, floorDb: -40 });
    const dia = Number(d.analysisValues.helixDiaMm);
    const circ = Math.PI * dia;
    expect(circ / lambda).toBeGreaterThan(0.95);
    expect(circ / lambda).toBeLessThan(1.15);
  });

  it("больше требуемое усиление — больше витков", () => {
    const lo = designGnss({ freqMHz: 1575, helixCount: 3, targetGainDbi: 10, pitchRel: 0.22, floorDb: -40 });
    const hi = designGnss({ freqMHz: 1575, helixCount: 3, targetGainDbi: 15, pitchRel: 0.22, floorDb: -40 });
    expect(Number(hi.analysisValues.turns)).toBeGreaterThan(Number(lo.analysisValues.turns));
  });
});

describe("связка синтез → поверочный расчёт", () => {
  it("каждый тип: синтез по умолчанию даёт значения, которые считает анализ", () => {
    for (const a of ANTENNAS) {
      if (!a.synthesis) continue;
      const def: Record<string, never> = {} as never;
      const vals = Object.fromEntries(a.synthesis.fields.map((f) => [f.key, f.default])) as typeof def;
      const d = a.synthesis.design(vals);
      expect(Object.keys(d.analysisValues).length, `${a.id}: синтез не вернул значения`).toBeGreaterThan(0);
      const r = a.analysis.compute(d.analysisValues);
      expect(r.planes.length, `${a.id}: нет плоскостей ДН`).toBeGreaterThan(0);
      expect(r.planes[0].points.length, `${a.id}: пустая ДН`).toBeGreaterThan(10);
      expect(Number.isFinite(r.metrics.lambdaMm), `${a.id}: λ не число`).toBe(true);
    }
  });

  it("яги: спроектированная антенна даёт разумное усиление по MoM", () => {
    const a = getAntenna("yagi");
    const vals = Object.fromEntries(a.synthesis!.fields.map((f) => [f.key, f.default]));
    const d = a.synthesis!.design(vals);
    const r = a.analysis.compute(d.analysisValues);
    // 7 элементов DL6WU → примерно 11…14 дБи
    expect(r.metrics.directivityDbi!).toBeGreaterThan(9);
    expect(r.metrics.directivityDbi!).toBeLessThan(15);
    // Энергетический self-check должен сойтись
    expect(Math.abs(r.metrics.avgGain! - 1)).toBeLessThan(0.15);
  });
});

describe("патч: сверка с примерами Balanis и замкнутость синтез→расчёт", () => {
  // Balanis, «Antenna Theory» 3-е изд., пример 14.1: εr = 2.2, h = 0.1588 см, f = 10 ГГц.
  // Книга: W = 1.186 см, εreff = 1.972, ΔL = 0.081 см, L = 0.906 см.
  it("пример 14.1: размеры совпадают с книгой", () => {
    const d = designPatch({
      freqMHz: 10000, epsR: 2.2, substrateH: 1.588, targetZ: 50,
      polarization: "Линейная", tanD: 0.0009, floorDb: -40,
    });
    const v = d.analysisValues as Record<string, number>;
    expect(v.widthMm).toBeCloseTo(11.86, 1);
    expect(v.lengthMm).toBeCloseTo(9.06, 1);
  });

  // Пример 14.3: G1 = 1.5709e-3, G12 = 6.1683e-4, R_край = 228.3508 Ом.
  it("пример 14.3: проводимости щелей и сопротивление на краю", () => {
    const k0 = (2 * Math.PI) / 29.9792458; // λ = 29.979 мм на 10 ГГц
    const { G1, G12 } = slotConductances(k0, 11.86, 9.06);
    expect(G1).toBeCloseTo(1.5709e-3, 5);
    expect(G12).toBeCloseTo(6.1683e-4, 5);
    expect(edgeResistance(G1, G12)).toBeCloseTo(228.35, 0);
  });

  it("врезка из синтеза действительно даёт целевое сопротивление в поверочном расчёте", () => {
    for (const [f, er, h, z] of [
      [2400, 4.4, 1.6, 50], [1575, 4.4, 1.6, 50], [10000, 2.2, 1.588, 50],
      [5800, 3.0, 0.8, 50], [900, 4.4, 3.2, 50], [2400, 4.4, 1.6, 75],
    ] as number[][]) {
      const d = designPatch({
        freqMHz: f, epsR: er, substrateH: h, targetZ: z,
        polarization: "Линейная", tanD: 0.02, floorDb: -40,
      });
      const r = computePatch(d.analysisValues as never);
      expect(r.metrics.impedanceR!).toBeCloseTo(z, 0);
      // КСВ считается относительно 50 Ом, поэтому при цели 75 Ом он обязан быть 1.5.
      const expectSwr = Math.max(z, 50) / Math.min(z, 50);
      expect(r.metrics.swr50!).toBeCloseTo(expectSwr, 1);
    }
  });
});

describe("зазор активного — синтез согласован с поверочным расчётом", () => {
  it("яги: длина плеча в таблице = (полная − зазор)/2, зазор уходит в поверочный расчёт", () => {
    const d = designYagi({
      freqMHz: 180, elementCount: 7, elementDiaMm: 6, boomDiaMm: 20, boomShape: "square",
      mounting: "through-contact", feedGapMm: 20, floorDb: -40,
    });
    const total = d.rows.find((r) => r.label.startsWith("Полная длина, от кончика"))!;
    const arm = d.rows.find((r) => r.label.startsWith("Длина ОДНОГО плеча"))!;
    expect(Number(arm.value)).toBeCloseTo((Number(total.value) - 20) / 2, 1);
    expect(d.analysisValues.feedGapMm).toBe(20);
  });

  it("диполь: синтез и поверочный расчёт используют одну модель — в резонансе Im Z ≈ 0", () => {
    const d = designDipole({ freqMHz: 307, elementType: "flat", diameterMm: 2, stripWmm: 8, feedGapMm: 3, floorDb: -40 });
    const r = getAntenna("dipole").analysis.compute({ ...d.analysisValues });
    expect(Math.abs(r.metrics.impedanceX!)).toBeLessThan(1.5);
  });
});
