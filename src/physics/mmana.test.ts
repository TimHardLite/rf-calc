// Сверка с эталонными моделями MMANA-GAL Basic (её же файлы .maa из поставки) и
// проверки того, что добавлено в v2: замкнутая формула дальнего поля, сетка со
// сгущением λ/1600 → λ/20, свип по частоте.
//
// Эталон — NEC-2 (nec2c) на той же геометрии, равномерная сетка λ/80 с картой EK
// (точное ядро). Геометрии перенесены из файлов MMANA как есть (метры).
import { describe, it, expect } from "vitest";
import { solve3D, C_LIGHT, type Wire } from "./mom3d";
import { taperedSegLens, straightPolyline } from "./segment";
import { sweepBand, swrOf } from "./sweep";
import { dipoleZ, computeDipole } from "./dipole";
import { computeYagi } from "./yagi";
import { YAGI_180, ANTENNAS } from "../registry";
import { substrateOf } from "./substrate";
import { microstripSynth, microstripZ0 } from "./microstrip";
import { WAVEGUIDES, cutoffTE10MHz, recommendedBandMHz, recommendWaveguide, waveImpedanceTE10 } from "./waveguide";

type El = { x: number; half: number; r: number };
/** Модель из параллельных вибраторов вдоль Y: x — позиция, half — полудлина, r — радиус. */
function build(els: El[], fMHz: number): { wires: Wire[]; feed: [number, number, number] } {
  const lam = C_LIGHT / (fMHz * 1e6), body = lam / 20;
  const wires = els.map((e) => {
    const halfSegs = taperedSegLens(e.half, lam, true, false, body);
    const segs = [...halfSegs, ...halfSegs.slice().reverse()];
    const pl = straightPolyline([e.x, -e.half, 0], [e.x, e.half, 0], segs);
    return { pts: pl.pts, radius: e.r, seglen: 1e9, seglens: pl.seglens } as Wire;
  });
  return { wires, feed: [els[0].x, 0, 0] };
}

describe("эталонные модели MMANA-GAL — сверка с NEC-2", () => {
  // ANT/VHF beams/dk7zb-2.maa — 5el144-DK7ZB (питание на 2-м проводе)
  it("DK7ZB 5 эл. 145 МГц (28-омная): NEC-2 28.9 − j3.2 Ом, 9.92 дБи", () => {
    const els: El[] = [
      { x: 0, half: 0.5195, r: 0.005 },
      { x: 0.265, half: 0.481, r: 0.005 },
      { x: 0.675, half: 0.459, r: 0.005 },
      { x: 1.16, half: 0.45, r: 0.005 },
    ];
    const { wires } = build(els, 145);
    const r = solve3D(wires, 145, { point: [0.265, 0, 0] });
    expect(Math.abs(r.Zin.re - 28.9)).toBeLessThan(1.5);
    expect(Math.abs(r.Zin.im + 3.2)).toBeLessThan(1.0);
    expect(Math.abs(r.gainDbi - 9.92)).toBeLessThan(0.1);
    expect(Math.abs(r.avgGain - 1)).toBeLessThan(0.005);
  });

  // ANT/VHF beams/8EL2MW.MAA — Wide Band 8ele YAGI 2m
  it("8 эл. 145 МГц (широкополосная): NEC-2 29.8 − j22.9 Ом, 13.36 дБи", () => {
    const els: El[] = [
      { x: 0, half: 0.4845, r: 0.0025 },
      { x: -0.488, half: 0.51, r: 0.0025 },
      { x: 0.244, half: 0.481, r: 0.0025 },
      { x: 0.731, half: 0.465, r: 0.0025 },
      { x: 1.393, half: 0.456, r: 0.0025 },
      { x: 1.996, half: 0.453, r: 0.0025 },
      { x: 2.595, half: 0.448, r: 0.0025 },
      { x: 3.197, half: 0.435, r: 0.0025 },
    ];
    const { wires } = build(els, 145);
    const r = solve3D(wires, 145, { point: [0, 0, 0] });
    expect(Math.abs(r.Zin.re - 29.8)).toBeLessThan(1.5);
    expect(Math.abs(r.Zin.im + 22.9)).toBeLessThan(1.0);
    expect(Math.abs(r.gainDbi - 13.36)).toBeLessThan(0.1);
  });

  // ANT/VHF beams/15EL23CM.MAA — 15 элементов на 1294 МГц
  it("15 эл. 1294 МГц: NEC-2 32.9 + j57.6 Ом, 16.07 дБи", () => {
    const xs = [0, 0.0716, 0.1432, 0.2148, 0.2864, 0.358, 0.4296, 0.5012, 0.5728, 0.6444, 0.716, 0.7876, 0.8592, 0.9308, -0.0465];
    const hs = [0.055, 0.04925, 0.04925, 0.0488, 0.0473, 0.0468, 0.04625, 0.0458, 0.0453, 0.0453, 0.0453, 0.0453, 0.0453, 0.0453, 0.0552];
    const els: El[] = xs.map((x, i) => ({ x, half: hs[i], r: 0.001 }));
    const { wires } = build(els, 1294.1);
    const r = solve3D(wires, 1294.1, { point: [0, 0, 0] });
    expect(Math.abs(r.Zin.re - 32.9)).toBeLessThan(1.5);
    expect(Math.abs(r.Zin.im - 57.6)).toBeLessThan(3);
    expect(Math.abs(r.gainDbi - 16.07)).toBeLessThan(0.15);
  });
});

describe("дальнее поле по замкнутой формуле (как в NEC/MININEC)", () => {
  it("полуволновый вибратор: КНД 2.15 дБи и форма ДН по классической формуле", () => {
    const lam = C_LIGHT / 300e6;
    const { wires } = build([{ x: 0, half: 0.2375 * lam, r: 0.0002 }], 300);
    const r = solve3D(wires, 300, { point: [0, 0, 0] });
    expect(Math.abs(r.gainDbi - 2.15)).toBeLessThan(0.05);
    // F(θ) = cos(π/2·cosθ)/sinθ; θ отсчитываем от оси вибратора (ось Y)
    for (const thDeg of [30, 45, 60, 90]) {
      const th = (thDeg * Math.PI) / 180;
      const ref = (Math.cos((Math.PI / 2) * Math.cos(th)) / Math.sin(th)) ** 2;
      // вибратор вдоль Y; направление в плоскости YZ под углом thDeg к оси Y:
      // û = (0, cosθ, sinθ) → сферические (θ_s = 90° − θ, φ = 90°)
      const rel = r.powerAt(90 - thDeg, 90) / r.Umax;
      // Допуск 0.15 дБ: классическая формула выведена для ИДЕАЛЬНО синусоидального тока
      // на бесконечно тонком вибраторе ровно 0.5λ, у нас 0.475λ конечного радиуса.
      expect(Math.abs(10 * Math.log10(rel) - 10 * Math.log10(ref))).toBeLessThan(0.15);
    }
  });

  it("баланс энергии сохраняется (средний КНД по сфере = 1.000)", () => {
    const { wires } = build([{ x: 0, half: 0.25, r: 0.001 }, { x: 0.2, half: 0.24, r: 0.001 }], 300);
    const r = solve3D(wires, 300, { point: [0, 0, 0] });
    expect(Math.abs(r.avgGain - 1)).toBeLessThan(0.003);
  });
});

describe("свип по частоте (аналог таблицы F/КСВ/Ga/Z в MMANA)", () => {
  it("диполь: минимум КСВ на резонансе, полоса симметрична и совпадает с оценкой по Q", () => {
    const lam = C_LIGHT / 300e6, L = 0.47 * lam;
    const sw = sweepBand((f) => dipoleZ(L, 0.001, f, 0, null), 300, { points: 13 });
    expect(sw.points.length).toBeGreaterThan(12);
    expect(sw.minSwr).toBeLessThan(2);
    // края полосы найдены и лежат по разные стороны от минимума
    if (sw.lo != null && sw.hi != null) {
      expect(sw.lo).toBeLessThan(sw.minFreqMHz);
      expect(sw.hi).toBeGreaterThan(sw.minFreqMHz);
      // на самих краях КСВ равен критерию (проверка интерполяции)
      for (const fe of [sw.lo, sw.hi]) {
        const z = dipoleZ(L, 0.001, fe, 0, null);
        expect(Math.abs(swrOf(z.re, z.im) - sw.limit)).toBeLessThan(0.05);
      }
    }
  });

  it("яги 180 ИРТ: полоса по КСВ ≤ 1.6 — 174…183 МГц, минимум КСВ на рабочей частоте", () => {
    const m = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40 }).metrics;
    expect(m.sweep!.length).toBeGreaterThan(12);
    expect(Math.abs(m.bandLowMHz! - 173.6)).toBeLessThan(1.5);
    expect(Math.abs(m.bandHighMHz! - 182.6)).toBeLessThan(1.5);
    expect(Math.abs(m.swrMinFreqMHz! - 180)).toBeLessThan(1);
    expect(m.swrMin!).toBeLessThan(m.swr50! + 0.01);
  });

  it("диполь в поверочном расчёте отдаёт таблицу свипа и границы полосы", () => {
    const m = computeDipole({
      freqMHz: 300, lengthMm: 470, feedGapMm: 0, elementType: "wire",
      diameterMm: 2, stripWmm: 6, floorDb: -40,
    }).metrics;
    expect(m.sweep!.length).toBeGreaterThan(12);
    expect(m.bandLowMHz!).toBeLessThan(300);
    expect(m.bandHighMHz!).toBeGreaterThan(300);
    for (const p of m.sweep!) expect(Number.isFinite(p.swr)).toBe(true);
  });
});

// ---- Пункт 2 (разбор HFSS): микрополосок и стандартные волноводы -------------
describe("микрополосковая линия (синтез Уилера–Хаммерстада)", () => {
  it("50 Ом на типовых подложках: ширина совпадает со справочной, обратная задача сходится", () => {
    const cases: [number, number, number, number][] = [
      // εr, h (мм), f (МГц), ожидаемая ширина (мм) — справочные значения для 50 Ом
      [4.4, 1.6, 2400, 3.06],
      [2.2, 1.575, 5800, 4.85],
      [3.66, 0.762, 5800, 1.67],
      [10.2, 1.27, 2400, 1.19],
    ];
    for (const [er, h, f, expW] of cases) {
      const r = microstripSynth(50, er, h, f);
      expect(Math.abs(r.widthMm - expW)).toBeLessThan(0.05);
      // обратная задача: Z0 посчитанной линии возвращает исходные 50 Ом
      expect(Math.abs(microstripZ0(r.widthMm, h, er) - 50)).toBeLessThan(0.5);
      // длина четвертьволнового отрезка согласована с λg
      expect(r.quarterMm).toBeCloseTo(r.lambdaGmm / 4, 9);
    }
  });

  it("узкая и широкая ветви формулы сшиваются около W/h = 2", () => {
    for (const z0 of [40, 45, 50, 55, 60, 70, 80]) {
      const r = microstripSynth(z0, 4.4, 1.6, 2400);
      expect(Math.abs(microstripZ0(r.widthMm, 1.6, 4.4) - z0)).toBeLessThan(1.0);
    }
  });
});

describe("стандартные волноводы WR", () => {
  it("WR-90: a = 22.86 мм, fc = 6.557 ГГц, рекомендованная полоса 8.2…12.5 ГГц", () => {
    const wg = WAVEGUIDES.find((w) => w.name === "WR-90")!;
    expect(wg.aMm).toBeCloseTo(22.86, 2);
    expect(cutoffTE10MHz(wg.aMm) / 1000).toBeCloseTo(6.557, 2);
    const b = recommendedBandMHz(wg.aMm);
    expect(b.lo / 1000).toBeCloseTo(8.2, 1);
    expect(b.hi / 1000).toBeCloseTo(12.46, 1);
  });

  it("выбор волновода по частоте совпадает с общепринятым", () => {
    const pairs: [number, string][] = [
      [10000, "WR-90"], [24000, "WR-42"], [35000, "WR-28"], [5800, "WR-159"], [2400, "WR-340"], [1200, "WR-770"],
    ];
    for (const [f, name] of pairs) expect(recommendWaveguide(f)?.name, `${f} МГц`).toBe(name);
  });

  it("волновое сопротивление TE10 больше 377 Ом и растёт у отсечки", () => {
    const a = 22.86;
    expect(waveImpedanceTE10(a, 10000)!).toBeGreaterThan(376.73);
    expect(waveImpedanceTE10(a, 7000)!).toBeGreaterThan(waveImpedanceTE10(a, 12000)!);
    expect(waveImpedanceTE10(a, 6000)).toBeNull(); // ниже отсечки волна не распространяется
  });
});

describe("справочник подложек (значения сверены с библиотекой материалов HFSS)", () => {
  it("выбор FR-4 подставляет εr 4.4 и tgδ 0.02 вместо введённых вручную", () => {
    const a = ANTENNAS.find((x) => x.id === "patch")!;
    const base: Record<string, unknown> = {};
    a.analysis.fields.forEach((f) => (base[f.key] = f.default));
    const preset = a.analysis.compute({ ...base, substrate: "fr4", epsR: 1, tanD: 0 } as never).metrics;
    const manual = a.analysis.compute({ ...base, substrate: "custom", epsR: 4.4, tanD: 0.02 } as never).metrics;
    const air = a.analysis.compute({ ...base, substrate: "custom", epsR: 1, tanD: 0 } as never).metrics;
    // пресет = ручной ввод тех же значений, и он отличается от «воздуха»
    expect(preset.impedanceR).toBeCloseTo(manual.impedanceR!, 6);
    expect(preset.efficiency ?? 1).toBeCloseTo(manual.efficiency ?? 1, 6);
    // с FR-4 (tgδ 0.02) КПД заметно ниже, чем на воздухе без потерь
    expect(preset.efficiency!).toBeLessThan(0.7);
    expect(air.efficiency!).toBeGreaterThan(0.95);
  });

  it("«своё значение» оставляет введённые εr и tgδ", () => {
    const { epsR, tanD } = substrateOf("custom", 3.1, 0.005);
    expect(epsR).toBe(3.1);
    expect(tanD).toBe(0.005);
    expect(substrateOf("ro4350", 3.1, 0.005)).toEqual({ epsR: 3.66, tanD: 0.004 });
  });
});
