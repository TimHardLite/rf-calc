// Сверки, добавленные по итогам разбора EZNEC 7.0 (NEC-2) и MININEC-3:
// точное ядро трубки, сетка со сгущением к концам, потери в металле (Wire Loss / LD 5).
// Эталоны NEC-2 получены прогоном nec2c; условия — в комментариях к каждому тесту.
import { describe, it, expect } from "vitest";
import { solve3D } from "./mom3d";
import { straightPolyline, taperedSegLens } from "./segment";
import { dipoleZ, computeDipole } from "./dipole";
import { computeMoxon } from "./moxon";
import { computeYagi } from "./yagi";
import { computeLPDA } from "./lpda";
import { computeGnss } from "./gnss";
import { resistivityOf, skinDepth } from "./conductor";
import { ANTENNAS, YAGI_180 } from "../registry";

const LAM300 = 299.792458 / 300;

describe("точное ядро трубки (как в MININEC-3)", () => {
  it("толстый вибратор a = 0.01λ: при дроблении сетки до Δ < a решение устойчиво (приведённое ядро разваливалось)", () => {
    // Зазор питания фиксирован (4 мм): у толстого провода реактивность источника «дельта-зазор»
    // физически зависит от ширины зазора, поэтому сравниваем сетки при одном и том же зазоре.
    const L = 0.5 * LAM300, a = 0.01 * LAM300, g = 0.004;
    const z = [40, 160].map((body) => {
      const half = taperedSegLens(L / 2 - g / 2, LAM300, false, true, LAM300 / body);
      const pl = straightPolyline([0, 0, -L / 2], [0, 0, L / 2], [...half.slice().reverse(), g / 2, g / 2, ...half]);
      return solve3D([{ pts: pl.pts, radius: a, seglen: 1e9, seglens: pl.seglens }], 300, { point: [0, 0, 0] }, { skipPattern: true }).Zin;
    });
    expect(z[1].re).toBeGreaterThan(0);
    expect(Math.abs(z[1].re - z[0].re) / z[0].re).toBeLessThan(0.04);
    expect(Math.abs(z[1].im - z[0].im)).toBeLessThan(2);
  });

  it("тонкий вибратор 0.5λ, a = 1 мм, 300 МГц: Z сходится к NEC-2 (81 сегм.: 86.4 + j49.1)", () => {
    const z = dipoleZ(0.5 * LAM300, 0.001, 300, 0, null);
    expect(Math.abs(z.re - 86.4)).toBeLessThan(1);
    expect(Math.abs(z.im - 49.1)).toBeLessThan(2);
  });
});

describe("потери в металле (EZNEC Wire Loss / NEC-2 LD 5)", () => {
  it("медь: скин-слой 3.8 мкм на 300 МГц", () => {
    expect(skinDepth(resistivityOf("cu")!, 300e6) * 1e6).toBeCloseTo(3.81, 1);
  });

  it("диполь 0.5λ, a = 1 мм, медь: прирост R = 0.233 Ом (NEC-2 LD 5: 0.233)", () => {
    const rho = resistivityOf("cu");
    const z0 = dipoleZ(0.5 * LAM300, 0.001, 300, 0, null);
    const z1 = dipoleZ(0.5 * LAM300, 0.001, 300, 0, rho);
    expect(z1.re - z0.re).toBeCloseTo(0.233, 2);
    expect(z1.im - z0.im).toBeGreaterThan(0.1); // внутренняя индуктивность ωL′ = R′
  });

  it("сильные потери (ρ = 10 мкОм·м, a = 0.2 мм): прирост R 26.3 Ом (NEC-2 LD 5: 26.18)", () => {
    const z0 = dipoleZ(0.5 * LAM300, 0.0002, 300, 0, null);
    const z1 = dipoleZ(0.5 * LAM300, 0.0002, 300, 0, 1e-5);
    expect(Math.abs(z1.re - z0.re - 26.18)).toBeLessThan(0.4);
  });

  it("яги 180 (алюминий): КПД ≈ 99.4 %, КУ = КНД + 10·lg η, баланс энергии сохраняется", () => {
    const r = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40, material: "al" });
    const m = r.metrics;
    expect(m.efficiency!).toBeGreaterThan(0.99);
    expect(m.efficiency!).toBeLessThan(0.997);
    expect(m.gainDbi!).toBeCloseTo(m.directivityDbi! + 10 * Math.log10(m.efficiency!), 6);
    expect(m.avgGain!).toBeGreaterThan(0.999);
    expect(r.notes.join(" ")).toMatch(/скин-эффект/);
  });

  it("идеальный проводник: КПД не выводится, КУ = КНД", () => {
    const m = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40 }).metrics;
    expect(m.efficiency).toBeUndefined();
    expect(m.gainDbi).toBe(m.directivityDbi);
  });

  it("нержавейка теряет заметно больше меди", () => {
    const base = { freqMHz: 300, lengthMm: 470, feedGapMm: 0, elementType: "wire" as const, diameterMm: 2, stripWmm: 6, floorDb: -40 };
    const cu = computeDipole({ ...base, material: "cu" }).metrics.efficiency!;
    const st = computeDipole({ ...base, material: "steel" }).metrics.efficiency!;
    expect(st).toBeLessThan(cu);
    expect(1 - st).toBeGreaterThan(5 * (1 - cu)); // √(ρст/ρCu) ≈ 6.5
  });
});

describe("Moxon: сетка со сгущением к концам — сверка с NEC-2 + EK", () => {
  it("300 МГц, A 359.2 / B 47.58 / C 16.75 / D 69.04 мм, Ø 2 мм: NEC-2+EK (λ/100) 51.8 − j3.2, 6.00 дБи, заднее 27.1 дБ", () => {
    const m = computeMoxon({ freqMHz: 300, widthA: 359.2, tailB: 47.58, gapC: 16.75, tailD: 69.04, diameterMm: 2, floorDb: -40 }).metrics;
    expect(Math.abs(m.impedanceR! - 51.8)).toBeLessThan(1.5);
    expect(Math.abs(m.impedanceX! + 3.2)).toBeLessThan(1.5);
    expect(Math.abs(m.directivityDbi! - 6.0)).toBeLessThan(0.05);
    expect(Math.abs(m.rearSectorDb! - 27.1)).toBeLessThan(1);
    expect(m.avgGain!).toBeGreaterThan(0.999);
  });
});

describe("ЛПА: общий решатель mom3d + схема перекрёстного фидера (многопортовый режим)", () => {
  it("6 элементов, τ 0.87, σ 0.055, 300 МГц: NEC-2 (фидер TL-картами) Ga 6.45 дБи, R 31.5 Ом, F/B 15.6 дБ", () => {
    const m = computeLPDA({ freqMHz: 300, count: 6, tau: 0.87, sigma: 0.055, longestMm: 600, diameterMm: 10, feederZ0: 100, floorDb: -40 }).metrics;
    expect(Math.abs(m.directivityDbi! - 6.45)).toBeLessThan(0.1);
    expect(Math.abs(m.impedanceR! - 31.5)).toBeLessThan(1.5);
    expect(Math.abs(m.frontToBackDb! - 15.6)).toBeLessThan(1);
    expect(Math.abs(m.avgGain! - 1)).toBeLessThan(0.003);
  });
});

describe("поле «материал проводника» в интерфейсе", () => {
  it("есть у всех проволочных антенн в обоих режимах; по умолчанию — идеальный, у GNSS — медь", () => {
    for (const id of ["dipole", "yagi", "moxon", "lpda", "gnss"]) {
      const a = ANTENNAS.find((x) => x.id === id)!;
      for (const mode of [a.analysis, a.synthesis!]) {
        const f = mode.fields.find((x) => x.key === "material");
        expect(f, id).toBeDefined();
        expect(f!.default).toBe(id === "gnss" ? "cu" : "pec");
        expect(mode.fields.some((x) => x.key === "rhoCustom")).toBe(true);
      }
    }
  });

  it("проектирование переносит материал в поверочный расчёт", () => {
    const a = ANTENNAS.find((x) => x.id === "dipole")!;
    const v: Record<string, unknown> = {};
    a.synthesis!.fields.forEach((f) => (v[f.key] = f.default));
    v.material = "al";
    const d = a.synthesis!.design(v as never);
    expect(d.analysisValues.material).toBe("al");
  });
});

describe("защита от вырожденных и неподъёмных задач", () => {
  it("яги на 40 ГГц с размерами 180-й: внятный отказ вместо минут счёта", () => {
    const t = Date.now();
    const r = computeYagi({ freqMHz: 40000, elements: YAGI_180, floorDb: -40 });
    expect(Date.now() - t).toBeLessThan(500);
    expect(r.metrics.directivityDbi).toBeNull();
    expect(r.notes.join(" ")).toMatch(/не сочетаются/);
  });

  it("ЛПА на 40 ГГц: внятный отказ", () => {
    const r = computeLPDA({ freqMHz: 40000, count: 6, tau: 0.87, sigma: 0.055, longestMm: 600, diameterMm: 10, feederZ0: 100, floorDb: -40 });
    expect(r.metrics.directivityDbi).toBeNull();
    expect(r.notes.join(" ")).toMatch(/не сочетаются/);
  });

  it("GNSS: 3 спирали на радиусе 0 пересекаются — отказ с объяснением, а не NaN", () => {
    const r = computeGnss({
      freqMHz: 1575, helixCount: 3, helixDiaMm: 60, turns: 2, heightMm: 40, arrangeRadiusMm: 0,
      conductor: "tape", tapeWidthMm: 8, sense: "RH", groundPlane: "infinite", standoffMm: 3, floorDb: -40,
    });
    expect(r.metrics.directivityDbi).toBeNull();
    expect(r.notes.join(" ")).toMatch(/пересекаются/);
  });
});
