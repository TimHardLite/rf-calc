// Тесты оптимизатора размеров (пункт 3 второй версии).
import { describe, it, expect } from "vitest";
import { optimizeAntenna, canOptimize, NO_OPTIMIZER_REASON } from "./optimize";
import { yagiProblem, DEFAULT_PROBLEM_OPTIONS, bandFreqs } from "./problems";
import { lmMatch, swrOf } from "./core";
import { designYagi } from "../synth/yagi";
import { computeYagi, type YagiElement } from "../physics/yagi";
import { computePatch } from "../physics/patch";
import { getAntenna, defaultsOf } from "../registry";
import { lMatch } from "../physics/matching";

/** Яги 720 МГц, 5 элементов, Ø6 мм, диэлектрический бум — быстрый вариант случая заказчика. */
function yagi720(): Record<string, unknown> {
  const d = designYagi({
    freqMHz: 720, elementCount: 5, elementDiaMm: 6, boomDiaMm: 0,
    boomShape: "round", mounting: "dielectric", floorDb: -40,
  });
  return { ...d.analysisValues, freqMHz: 720 } as Record<string, unknown>;
}

describe("оптимизатор: яги", () => {
  it("КСВ падает к 1, а расстояния между элементами НЕ меняются", () => {
    const v = yagi720();
    const before = (v.elements as YagiElement[]).map((e) => e.positionMm);
    const r = optimizeAntenna("yagi", v as never);
    const after = (r.values.elements as YagiElement[]).map((e) => e.positionMm);
    expect(after).toEqual(before);                       // железное правило заказчика
    expect(r.before.swr).toBeGreaterThan(1.5);           // исходный синтез не согласован
    expect(r.after.swr).toBeLessThan(1.25);              // после подбора — почти 1
    expect(r.after.swrWorst).toBeLessThanOrEqual(r.before.swrWorst);
  }, 120_000);

  it("усиление не проваливается: ограничитель держит его в пределах профиля", () => {
    const r = optimizeAntenna("yagi", yagi720() as never, { priority: "balanced" });
    expect(r.after.gainDbi).toBeGreaterThan(r.before.gainDbi - 0.45);
    expect(Math.abs(r.after.avgGain - 1)).toBeLessThan(0.02);
  }, 120_000);

  it("найденная геометрия даёт тот же результат в штатном расчёте (никаких «своих» моделей)", () => {
    const r = optimizeAntenna("yagi", yagi720() as never);
    const m = computeYagi(r.values as never).metrics;
    expect(Math.abs(m.impedanceR! - r.after.R)).toBeLessThan(0.05);
    expect(Math.abs(m.impedanceX! - r.after.X)).toBeLessThan(0.05);
    expect(Math.abs(m.directivityDbi! - r.after.gainDbi)).toBeLessThan(0.01);
  }, 120_000);

  it("смещение настройки сдвигает минимум КСВ на заданный процент", () => {
    const v = yagi720();
    const o = { ...DEFAULT_PROBLEM_OPTIONS, tuneOffsetPct: 1.5 };
    const p = yagiProblem(v as never, o);
    const x0 = p.vars.map((x) => x.start);
    const lm = lmMatch(p, x0, { iters: 6 });
    const fTune = bandFreqs(720, o)[0];
    const zTune = p.zAt(lm.x, fTune), zBase = p.zAt(lm.x, 720);
    expect(fTune).toBeCloseTo(730.8, 1);
    // На смещённой частоте согласование лучше, чем на исходной — этого и добивались.
    expect(swrOf(zTune.re, zTune.im, 50)).toBeLessThan(swrOf(zBase.re, zBase.im, 50));
  }, 120_000);
});

describe("оптимизатор: патч", () => {
  it("расстроенный патч доводится до КСВ < 1.2, и штатный расчёт это подтверждает", () => {
    const a = getAntenna("patch");
    const v = defaultsOf(a, "analysis");
    const r = optimizeAntenna("patch", v);
    expect(r.before.swr).toBeGreaterThan(2);
    expect(r.after.swr).toBeLessThan(1.2);
    const m = computePatch(r.values as never).metrics;
    expect(Math.abs(m.swr50! - r.after.swr)).toBeLessThan(0.02);
  });
});

describe("оптимизатор: границы применимости", () => {
  it("типы без модели импеданса не оптимизируются, и на это есть внятная причина", () => {
    for (const id of ["gnss", "horn", "array"]) {
      expect(canOptimize(id)).toBe(false);
      expect(NO_OPTIMIZER_REASON[id].length).toBeGreaterThan(50);
    }
    for (const id of ["yagi", "dipole", "moxon", "lpda", "patch"]) expect(canOptimize(id)).toBe(true);
  });

  it("Г-звено действительно даёт 50 Ом (проверка формул согласования)", () => {
    for (const [R, X] of [[25, 0], [45, 28], [22, -15.6], [80, -30], [120, 60]] as [number, number][]) {
      for (const s of lMatch(R, X, 50, 868)) {
        let Zr: number, Zi: number;
        if (s.shuntAtLoad) {
          const d = R * R + X * X;
          const yr = R / d, yi = -X / d - 1 / s.shuntX;
          const dd = yr * yr + yi * yi;
          Zr = yr / dd; Zi = -yi / dd + s.seriesX;
        } else {
          const zr = R, zi = X + s.seriesX, d = zr * zr + zi * zi;
          const yr = zr / d, yi = -zi / d - 1 / s.shuntX;
          const dd = yr * yr + yi * yi;
          Zr = yr / dd; Zi = -yi / dd;
        }
        expect(Zr).toBeCloseTo(50, 6);
        expect(Zi).toBeCloseTo(0, 6);
      }
    }
  });
});

describe("оптимизатор: результат совпадает со штатным расчётом по ВСЕМ типам", () => {
  // Главный инвариант оптимизатора: числа, которые он показывает («стало»), обязаны
  // в точности совпасть с тем, что программа посчитает по применённым размерам.
  // Иначе пользователь оптимизирует по одной модели, а в паспорт попадёт другая.
  // Проверяются все типы, где оптимизация вообще возможна (яги — в тестах выше).
  for (const id of ["dipole", "patch", "moxon", "lpda"]) {
    it(`${id}: КСВ и усиление «после» = расчёту по применённым размерам`, () => {
      const a = getAntenna(id);
      const before = defaultsOf(a, "analysis");
      const r = optimizeAntenna(id, before, { priority: "balanced" });
      const check = a.analysis.compute(r.values);

      expect(check.metrics.swr50!, `${id}: КСВ разошёлся`).toBeCloseTo(r.after.swr, 9);
      expect(check.metrics.directivityDbi!, `${id}: КНД разошёлся`).toBeCloseTo(r.after.gainDbi, 9);
      if (Number.isFinite(r.after.rearDb)) {
        expect(check.metrics.rearSectorDb!, `${id}: заднее излучение разошлось`).toBeCloseTo(r.after.rearDb, 9);
      }
      // Оптимизация не имеет права ухудшить то, ради чего она делается.
      expect(r.after.swr, `${id}: КСВ стал хуже`).toBeLessThanOrEqual(r.before.swr + 1e-9);
    });
  }
});
