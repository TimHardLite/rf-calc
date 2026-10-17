// Постановка задачи оптимизации для каждого типа антенны: ЧТО можно менять, что нельзя,
// как быстро посчитать импеданс и как посчитать полные характеристики.
//
// ЖЕЛЕЗНОЕ ПРАВИЛО (требование заказчика): расстояния между элементами задаются
// частотой и НЕ МЕНЯЮТСЯ. Оптимизатор трогает только длины (и у некоторых типов —
// размеры, которые не привязаны к частоте жёстко: глубину врезки патча, загибы Moxon).

import type { FieldValues } from "../fields";
import type { ElementSpec } from "../fields";
import { solve3D, C_LIGHT } from "../physics/mom3d";
import { yagiWires, type YagiInput, type YagiElement } from "../physics/yagi";
import { dipoleWire } from "../physics/dipole";
import { moxonWires, type MoxonInput } from "../physics/moxon";
import { solveLPDA, type LpdaElement } from "../physics/lpda";
import { patchImpedance } from "../physics/patchmodel";
import { substrateOf } from "../physics/substrate";
import { resistivityOf, lossPerMeter } from "../physics/conductor";
import { rearSectorDb } from "../physics/mathutil";
import type { PatternPoint } from "../physics/types";
import { swrOf, type OptVar, type Problem } from "./core";
import { getAntenna } from "../registry";

/** Профиль приоритетов влияет и на КОРИДОРЫ изменения длин (см. yagiProblem). */
export type Corridor = "swr" | "balanced" | "gain";

export interface ProblemOptions {
  /** Ширина полосы оптимизации в процентах от рабочей частоты (полная ширина). */
  bandPct: number;
  /** Смещение настройки: оптимизация ведётся на f·(1 + offset/100). */
  tuneOffsetPct: number;
  z0: number;
  quantumMm: number;
  /** Насколько широко разрешено двигать размеры (по профилю приоритетов). */
  corridor?: Corridor;
}

export const DEFAULT_PROBLEM_OPTIONS: ProblemOptions = {
  bandPct: 2, tuneOffsetPct: 0, z0: 50, quantumMm: 0.1,
};

/** Частоты, на которых меряется отражение: первая — целевая, далее края полосы. */
export function bandFreqs(fMHz: number, o: ProblemOptions): number[] {
  const f0 = fMHz * (1 + o.tuneOffsetPct / 100);
  const half = (o.bandPct / 100) / 2;
  return [f0, f0 * (1 - half), f0 * (1 + half)];
}

/** Азимутальный срез ДН (θ=90) для расчёта заднего излучения. */
function azimuthCut(powerAt: (t: number, p: number) => number, Umax: number, shiftDeg = 0): PatternPoint[] {
  const pts: PatternPoint[] = [];
  for (let a = 0; a < 360; a += 1) {
    const u = powerAt(90, (a + shiftDeg + 360) % 360) / Umax;
    pts.push({ angleDeg: a, valueDb: 10 * Math.log10(Math.max(u, 1e-9)) });
  }
  return pts;
}

// ------------------------------- ЯГИ ---------------------------------------------
/** Переменные — длины ВСЕХ элементов; позиции и диаметры зафиксированы. */
export function yagiProblem(values: FieldValues, o: ProblemOptions): Problem {
  const base = values as unknown as YagiInput & { elements: ElementSpec[] };
  const els = base.elements as YagiElement[];
  const f = Number(values.freqMHz);
  const freqs = bandFreqs(f, o);
  // ПРЕДЕЛЫ ИЗМЕНЕНИЯ — разные для разных элементов, и это физика, а не вкусовщина:
  //  • активный элемент почти не влияет на усиление и форму ДН, зато сильнее всех тянет
  //    реактивность — ему даём широкий коридор ±10 %;
  //  • рефлектор и первый директор заметно влияют на заднее излучение и импеданс — ±5 %;
  //  • остальные директоры формируют усиление: их трогаем осторожно, ±2.5 %.
  // Без этого разделения оптимизатор «покупает» КСВ ценой 1 дБ усиления — проверено на
  // 9-элементной 868 МГц: свободные ±12 % давали КСВ 1.11 при потере 0.97 дБ.
  const dirIndex = (i: number) => els.slice(0, i).filter((e) => e.type === "director").length;
  const k = o.corridor === "swr" ? 2 : o.corridor === "gain" ? 0.4 : 1;
  const spanOf = (e: YagiElement, i: number): number => {
    if (e.type === "driven") return Math.min(0.15, 0.10 * Math.max(1, k));
    if (e.type === "reflector") return 0.05 * k;
    return (dirIndex(i) === 0 ? 0.05 : 0.025) * k;
  };
  const vars: OptVar[] = els.map((e, i) => {
    const s = spanOf(e, i);
    return {
      label: e.type === "reflector" ? "Рефлектор" : e.type === "driven" ? "Активный" : `Директор D${dirIndex(i) + 1}`,
      start: e.lengthMm,
      min: Math.max(1, e.lengthMm * (1 - s)),
      max: e.lengthMm * (1 + s),
    };
  });
  const withLengths = (x: number[]): YagiInput => ({
    ...(values as unknown as YagiInput),
    elements: els.map((e, i) => ({ ...e, lengthMm: x[i] })),
  });
  return {
    vars, freqs, z0: o.z0, quantumMm: o.quantumMm,
    zAt: (x, fMHz) => {
      const { wires, feedPt } = yagiWires(withLengths(x), f);
      return solve3D(wires, fMHz, { point: feedPt }, { skipPattern: true }).Zin;
    },
    full: (x) => {
      const inp = withLengths(x);
      const { wires, feedPt } = yagiWires(inp, f);
      const r = solve3D(wires, freqs[0], { point: feedPt });
      const az = azimuthCut(r.powerAt, r.Umax);
      let worst = swrOf(r.Zin.re, r.Zin.im, o.z0);
      for (const ff of freqs.slice(1)) {
        const z = solve3D(wires, ff, { point: feedPt }, { skipPattern: true }).Zin;
        worst = Math.max(worst, swrOf(z.re, z.im, o.z0));
      }
      return {
        swrWorst: worst, swr: swrOf(r.Zin.re, r.Zin.im, o.z0), R: r.Zin.re, X: r.Zin.im,
        gainDbi: r.gainDbi, rearDb: rearSectorDb(az) ?? NaN, avgGain: r.avgGain,
      };
    },
  };
}

/** Применить найденные длины к значениям полей (для передачи в расчёт/файл проекта). */
export function applyYagi(values: FieldValues, x: number[]): FieldValues {
  const els = values.elements as ElementSpec[];
  return { ...values, elements: els.map((e, i) => ({ ...e, lengthMm: round3(x[i]) })) };
}

// ------------------------------ ДИПОЛЬ --------------------------------------------
export function dipoleProblem(values: FieldValues, o: ProblemOptions): Problem {
  const f = Number(values.freqMHz);
  const flat = String(values.elementType) === "flat";
  const radiusM = (flat ? Number(values.stripWmm) / 4 : Number(values.diameterMm) / 2) / 1000;
  const gapM = Math.max(0, Number(values.feedGapMm ?? 0)) / 1000;
  const rho = resistivityOf(String(values.material ?? "pec"), Number(values.rhoCustom ?? 0));
  const freqs = bandFreqs(f, o);
  const lamMesh = C_LIGHT / (freqs[0] * 1e6);
  const L0 = Number(values.lengthMm);
  const vars: OptVar[] = [{ label: "Длина вибратора", start: L0, min: L0 * 0.8, max: L0 * 1.2 }];
  const wireOf = (x: number[]) =>
    dipoleWire(x[0] / 1000, radiusM, lamMesh, gapM, lossPerMeter(rho, f * 1e6, radiusM)).wire;
  return {
    vars, freqs, z0: o.z0, quantumMm: o.quantumMm,
    zAt: (x, fMHz) => solve3D([wireOf(x)], fMHz, { point: [0, 0, 0] }, { skipPattern: true }).Zin,
    full: (x) => {
      const w = wireOf(x);
      const r = solve3D([w], freqs[0], { point: [0, 0, 0] });
      let worst = swrOf(r.Zin.re, r.Zin.im, o.z0);
      for (const ff of freqs.slice(1)) {
        const z = solve3D([w], ff, { point: [0, 0, 0] }, { skipPattern: true }).Zin;
        worst = Math.max(worst, swrOf(z.re, z.im, o.z0));
      }
      return {
        swrWorst: worst, swr: swrOf(r.Zin.re, r.Zin.im, o.z0), R: r.Zin.re, X: r.Zin.im,
        gainDbi: r.gainDbi, rearDb: NaN, avgGain: r.avgGain,
      };
    },
  };
}

export function applyDipole(values: FieldValues, x: number[]): FieldValues {
  return { ...values, lengthMm: round3(x[0]) };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ------------------------------- MOXON --------------------------------------------
/**
 * Переменные Moxon: загибы B и D, зазор C и (в небольшом коридоре) ширина A.
 * Зазор C — главный «орган настройки»: именно ёмкостная связь концов через него задаёт
 * и заднее излучение, и импеданс. Ширина A определяет резонанс, поэтому её коридор узкий.
 */
export function moxonProblem(values: FieldValues, o: ProblemOptions): Problem {
  const f = Number(values.freqMHz);
  const freqs = bandFreqs(f, o);
  const k = o.corridor === "swr" ? 1.6 : o.corridor === "gain" ? 0.5 : 1;
  const spec: [keyof MoxonInput, string, number][] = [
    ["widthA", "Ширина A", 0.03 * k],
    ["tailB", "Загиб активного B", 0.15 * k],
    ["gapC", "Зазор C", 0.25 * k],
    ["tailD", "Загиб рефлектора D", 0.15 * k],
  ];
  const vars: OptVar[] = spec.map(([key, label, span]) => {
    const start = Number(values[key as string]);
    return { label, start, min: Math.max(0.1, start * (1 - span)), max: start * (1 + span) };
  });
  const withVars = (x: number[]): MoxonInput => {
    const v: Record<string, unknown> = { ...(values as Record<string, unknown>) };
    spec.forEach(([key], i) => { v[key as string] = x[i]; });
    return v as unknown as MoxonInput;
  };
  return {
    vars, freqs, z0: o.z0, quantumMm: o.quantumMm,
    zAt: (x, fMHz) => solve3D(moxonWires(withVars(x), f), fMHz, { point: [0, 0, 0] }, { skipPattern: true }).Zin,
    full: (x) => {
      const wires = moxonWires(withVars(x), f);
      const r = solve3D(wires, freqs[0], { point: [0, 0, 0] });
      // Главный луч Moxon — в сторону активного (−X), поэтому срез сдвинут на 180°.
      const az = azimuthCut(r.powerAt, r.Umax, 180);
      let worst = swrOf(r.Zin.re, r.Zin.im, o.z0);
      for (const ff of freqs.slice(1)) {
        const z = solve3D(wires, ff, { point: [0, 0, 0] }, { skipPattern: true }).Zin;
        worst = Math.max(worst, swrOf(z.re, z.im, o.z0));
      }
      return {
        swrWorst: worst, swr: swrOf(r.Zin.re, r.Zin.im, o.z0), R: r.Zin.re, X: r.Zin.im,
        gainDbi: r.gainDbi, rearDb: rearSectorDb(az) ?? NaN, avgGain: r.avgGain,
      };
    },
  };
}

export function applyMoxon(values: FieldValues, x: number[]): FieldValues {
  return { ...values, widthA: round3(x[0]), tailB: round3(x[1]), gapC: round3(x[2]), tailD: round3(x[3]) };
}

// -------------------------------- ЛПА ---------------------------------------------
/**
 * У ЛПА оптимизируется НЕ геометрия, а ВОЛНОВОЕ СОПРОТИВЛЕНИЕ СОБИРАТЕЛЬНОЙ ЛИНИИ —
 * и это не упрощение, а правильный орган настройки:
 *   • длины и позиции элементов у ЛПА связаны жёстко (τ и σ), и менять длины по
 *     отдельности нельзя — рассыплется сам логопериодический принцип, а позиции
 *     менять запрещено правилом заказчика;
 *   • входное сопротивление ЛПА задаётся именно линией: Z0 фидера 100 Ом → 32 Ом на
 *     входе, 150 Ом → 41 Ом, 180 Ом → 51 Ом (проверено нашим же расчётом).
 * Поэтому подбираем Z0 линии — геометрия и ДН при этом не меняются вообще.
 */
export function lpdaProblem(values: FieldValues, o: ProblemOptions): Problem {
  const f = Number(values.freqMHz);
  const N = Math.max(2, Math.round(Number(values.count)));
  const tau = Number(values.tau), sigma = Number(values.sigma);
  const longest = Number(values.longestMm), diam = Number(values.diameterMm);
  const rho = resistivityOf(String(values.material ?? "pec"), Number(values.rhoCustom ?? 0));
  const lengths: number[] = Array.from({ length: N }, (_, i) => longest * tau ** i);
  const pos: number[] = [0];
  for (let i = 0; i < N - 1; i++) pos.push(pos[i] + 2 * sigma * lengths[i]);
  const freqs = bandFreqs(f, o);
  const meshLambda = C_LIGHT / (freqs[0] * 1e6);
  const z0feeder = Number(values.feederZ0);
  const vars: OptVar[] = [{
    label: "Z₀ собирательной линии", start: z0feeder, min: 40, max: 400, unit: "Ом",
  }];
  const els: LpdaElement[] = lengths.map((L, i) => ({ x: pos[i] / 1000, lengthM: L / 1000, radiusM: diam / 2000 }));
  const loss = (radiusM: number) => lossPerMeter(rho, f * 1e6, radiusM);
  return {
    vars, freqs, z0: o.z0, quantumMm: 1,
    // Применяется целое значение Z₀ (applyLpda), поэтому и метрики «после» должны
    // считаться по целому: иначе показанный КСВ отличался бы от расчёта по применённым
    // данным (замерено расхождение 8.6e-4 по КСВ).
    roundApply: (x) => [Math.round(x[0])],
    zAt: (x, fMHz) => solveLPDA(els, fMHz, x[0], 1.0, loss, { skipPattern: true, meshLambda }).Zin,
    full: (x) => {
      const r = solveLPDA(els, freqs[0], x[0], 1.0, loss, { meshLambda });
      const az = azimuthCut(r.powerAt, r.Umax);
      let worst = swrOf(r.Zin.re, r.Zin.im, o.z0);
      for (const ff of freqs.slice(1)) {
        const z = solveLPDA(els, ff, x[0], 1.0, loss, { skipPattern: true, meshLambda }).Zin;
        worst = Math.max(worst, swrOf(z.re, z.im, o.z0));
      }
      return {
        swrWorst: worst, swr: swrOf(r.Zin.re, r.Zin.im, o.z0), R: r.Zin.re, X: r.Zin.im,
        gainDbi: r.gainDbi, rearDb: rearSectorDb(az) ?? NaN, avgGain: r.avgGain,
      };
    },
  };
}

export function applyLpda(values: FieldValues, x: number[]): FieldValues {
  return { ...values, feederZ0: Math.round(x[0]) };
}

// ------------------------------- ПАТЧ ---------------------------------------------
/**
 * Переменные патча: длина L (резонанс), ширина W (сопротивление и полоса) и глубина
 * врезки (согласование). Импеданс считается аналитически (модель двух щелей), поэтому
 * оптимизация мгновенная.
 */
export function patchProblem(values: FieldValues, o: ProblemOptions): Problem {
  const f = Number(values.freqMHz);
  const material = substrateOf(String(values.substrate ?? "custom"), Number(values.epsR), Number(values.tanD ?? 0));
  const er = material.epsR, h = Number(values.substrateH);
  const L0 = Number(values.lengthMm), W0 = Number(values.widthMm);
  const inset0 = Number(values.feedInsetMm ?? 0);
  const freqs = bandFreqs(f, o);
  const k = o.corridor === "swr" ? 1.5 : o.corridor === "gain" ? 0.5 : 1;
  const vars: OptVar[] = [
    // Длина патча — главный орган настройки резонанса, а на усиление почти не влияет,
    // поэтому коридор широкий: стартовая геометрия может быть расстроена на 10 % и более.
    { label: "Длина L", start: L0, min: L0 * (1 - 0.18 * k), max: L0 * (1 + 0.18 * k) },
    { label: "Ширина W", start: W0, min: W0 * (1 - 0.2 * k), max: W0 * (1 + 0.2 * k) },
    { label: "Глубина врезки x₀", start: inset0, min: 0, max: L0 * 0.45 },
  ];
  // Импеданс считает ЕДИНАЯ модель patchmodel.patchImpedance — та же, что в поверочном
  // расчёте: иначе оптимизатор «улучшал» бы по своей модели, а программа показывала другое.
  const tanD = material.tanD;
  const zOf = (x: number[], fMHz: number) =>
    patchImpedance({ L: x[0], W: x[1], h, er, tanD, inset: x[2], fMHz });

  return {
    vars, freqs, z0: o.z0, quantumMm: 0.01,
    // At zero inset the cos² feed resistance has zero derivative. Use an interior
    // search seed, while vars.start and the reported baseline remain untouched.
    searchStart: inset0 === 0 ? [L0, W0, L0 * 0.25] : undefined,
    zAt: zOf,
    full: (x) => {
      const z = zOf(x, freqs[0]);
      let worst = swrOf(z.re, z.im, o.z0);
      for (const ff of freqs.slice(1)) {
        const zz = zOf(x, ff);
        worst = Math.max(worst, swrOf(zz.re, zz.im, o.z0));
      }
      // КНД и заднее излучение берёт ШТАТНЫЙ расчёт патча — та же функция, которая
      // покажет результат после применения размеров. Раньше здесь стояла грубая оценка
      // 6.5 + 10lg(W/0.5λ): она расходилась с таблицей программы на 2.4 дБ, то есть
      // оптимизатор отчитывался не теми числами, которые пользователь потом видит.
      const m = getAntenna("patch").analysis.compute({ ...applyPatch(values, x), freqMHz: freqs[0] }).metrics;
      return {
        swrWorst: worst, swr: swrOf(z.re, z.im, o.z0), R: z.re, X: z.im,
        gainDbi: m.directivityDbi ?? NaN, rearDb: m.rearSectorDb ?? NaN, avgGain: 1,
      };
    },
  };
}

export function applyPatch(values: FieldValues, x: number[]): FieldValues {
  return { ...values, lengthMm: round3(x[0]), widthMm: round3(x[1]), feedInsetMm: round3(x[2]) };
}
