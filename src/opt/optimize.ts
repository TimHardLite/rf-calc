// Оркестратор оптимизации: собирает задачу по типу антенны, прогоняет три стадии и
// возвращает «было / стало» с журналом.
//
// ПОРЯДОК ПРИОРИТЕТОВ (требование заказчика):
//   1) КСВ → 1 — главный критерий;
//   2) Z → 50 Ом — второй, с малым весом (при равном КСВ выигрывает тот, у кого Z ближе);
//   3) остальные характеристики (усиление, заднее излучение, баланс энергии) не должны
//      проваливаться — они стоят ограничителями в целевой функции.

import type { FieldValues } from "../fields";
import {
  lmMatch, polish, quantizeVec, costOf, DEFAULT_WEIGHTS,
  type FullMetrics, type Problem, type Weights,
} from "./core";
import {
  yagiProblem, applyYagi, dipoleProblem, applyDipole, moxonProblem, applyMoxon,
  lpdaProblem, applyLpda, patchProblem, applyPatch,
  DEFAULT_PROBLEM_OPTIONS, type ProblemOptions,
} from "./problems";
import { matchingAdvice } from "../physics/matching";
import { sanitize } from "../guard";
import { getAntenna } from "../registry";

/**
 * Профиль приоритетов. Требование заказчика — КСВ главный критерий, но остальные
 * характеристики не должны «сильно» проседать; насколько сильно — и задаёт профиль.
 *   swr      — тянем КСВ к 1 почти любой ценой (усиление разрешено потерять до 1 дБ);
 *   balanced — по умолчанию: КСВ важнее, но усиление бережём (до 0.4 дБ);
 *   gain     — усиление неприкосновенно (до 0.1 дБ), КСВ улучшаем чем можем.
 */
export type Priority = "swr" | "balanced" | "gain";

const PRIORITY_WEIGHTS: Record<Priority, Weights> = {
  swr: { zWeight: 0.15, gainDropDb: 1.0, rearDropDb: 4 },
  balanced: { zWeight: 0.15, gainDropDb: 0.4, rearDropDb: 2 },
  gain: { zWeight: 0.15, gainDropDb: 0.1, rearDropDb: 1 },
};

export interface OptimizeOptions extends Partial<ProblemOptions> {
  /** Профиль приоритетов (см. Priority). По умолчанию balanced. */
  priority?: Priority;
  weights?: Partial<Weights>;
  /** Максимум итераций Левенберга–Марквардта. */
  lmIters?: number;
  /** Ограничение на число быстрых расчётов в координатной доводке. */
  polishEvals?: number;
  /** Прогресс: stage — что идёт сейчас, swr — лучший на данный момент. */
  onProgress?: (p: { stage: string; swr: number; evals: number }) => boolean | void;
}

export interface OptimizeResult {
  /** Значения полей с применённой геометрией. */
  values: FieldValues;
  before: FullMetrics;
  after: FullMetrics;
  /** Изменения размеров: подпись, было, стало, единица. */
  changes: { label: string; from: number; to: number; unit?: string }[];
  /** Сколько раз считался импеданс и сколько раз — полная задача с ДН. */
  fastEvals: number;
  fullEvals: number;
  ms: number;
  /** Пояснения к результату (в т.ч. предупреждения). */
  notes: string[];
  /** Вариант «максимум усиления + согласующее устройство» (когда он имеет смысл). */
  alternative?: { values: FieldValues; metrics: FullMetrics; advice: string[] };
  /** Как согласовать то, что осталось (если КСВ всё ещё не 1). */
  advice: string[];
}

type Builder = {
  build: (v: FieldValues, o: ProblemOptions) => Problem;
  apply: (v: FieldValues, x: number[]) => FieldValues;
};

const BUILDERS: Record<string, Builder> = {
  yagi: { build: yagiProblem, apply: applyYagi },
  dipole: { build: dipoleProblem, apply: applyDipole },
  moxon: { build: moxonProblem, apply: applyMoxon },
  lpda: { build: lpdaProblem, apply: applyLpda },
  patch: { build: patchProblem, apply: applyPatch },
};

/**
 * Почему для остальных типов оптимизация по КСВ не делается — честный ответ
 * пользователю вместо выдуманного результата.
 */
export const NO_OPTIMIZER_REASON: Record<string, string> = {
  gnss: "У спирали входное сопротивление в проволочной модели недостоверно (оно слишком чувствительно к модели питающего штыря), поэтому в программе показывается эмпирика Крауса R ≈ 140·(C/λ). Оптимизировать по КСВ то, что не рассчитывается, нельзя: настройка спирали делается согласующим устройством у основания, а геометрия синтезируется по усилению.",
  horn: "В апертурной модели рупора импеданс горловины и перехода не рассчитывается, поэтому подбор по КСВ недоступен. Синтез даёт стартовые размеры по классическим соотношениям; проверка согласования требует модели волноводного перехода.",
  array: "Решётка считается множителем решётки для одинаковых излучателей: импеданса у неё в модели нет (его задаёт сам излучатель). Шаг и фаза подбираются по усилению и уровню боковых лепестков — это делает синтез.",
};

/** Умеет ли оптимизатор работать с этим типом антенны. */
export function canOptimize(antennaId: string, values?: FieldValues): boolean {
  return antennaId in BUILDERS && !(antennaId === "patch" && values?.mode === "beam");
}

export function optimizerUnavailableReason(antennaId: string, values: FieldValues): string | undefined {
  if (antennaId === "patch" && values.mode === "beam") {
    return "В режиме «по ширине луча» импеданс не рассчитывается. Для оптимизации по КСВ выберите прямоугольный патч и задайте его геометрию и подложку.";
  }
  if (!canOptimize(antennaId, values)) return NO_OPTIMIZER_REASON[antennaId];
  const checked = sanitize(getAntenna(antennaId).analysis.fields, values);
  return checked.ok ? undefined : `Исправьте исходные данные перед оптимизацией: ${checked.errors.join(" ")}`;
}

export function optimizeAntenna(
  antennaId: string, values: FieldValues, opts: OptimizeOptions = {},
): OptimizeResult {
  const b = BUILDERS[antennaId];
  const unavailable = optimizerUnavailableReason(antennaId, values);
  if (!b || unavailable) throw new Error(unavailable ?? `оптимизация для типа «${antennaId}» пока не реализована`);
  values = sanitize(getAntenna(antennaId).analysis.fields, values).values;
  const o: ProblemOptions = { ...DEFAULT_PROBLEM_OPTIONS, corridor: opts.priority ?? "balanced", ...opts };
  const w: Weights = { ...DEFAULT_WEIGHTS, ...PRIORITY_WEIGHTS[opts.priority ?? "balanced"], ...(opts.weights ?? {}) };
  const t0 = Date.now();
  const notes: string[] = [];

  const p = b.build(values, o);
  const x0 = p.vars.map((v) => v.start);
  let fastEvals = 0, fullEvals = 0;

  const before = p.full(x0); fullEvals++;

  // --- Стадия 1: Левенберг–Марквардт по отражению -------------------------------
  const lm = lmMatch(p, p.searchStart ?? x0, {
    iters: opts.lmIters ?? 8,
    onStep: (i) => opts.onProgress?.({ stage: "подбор по импедансу", swr: i.swr, evals: i.evals }),
  });
  fastEvals += lm.evals;

  // --- Стадия 2: координатная доводка -------------------------------------------
  const pol = polish(p, lm.x, w, {
    maxEvals: opts.polishEvals ?? 200,
    onStep: (i) => opts.onProgress?.({ stage: "доводка длин", swr: i.swr, evals: fastEvals + i.evals }),
  });
  fastEvals += pol.evals;

  // --- Стадия 3: кандидаты, полная проверка, квантование -------------------------
  // Помимо конечной точки берём ПРОМЕЖУТОЧНЫЕ на пути от исходной геометрии к найденной:
  // если полное согласование обошлось слишком дорого по усилению, компромисс почти всегда
  // лежит на этом отрезке (частично изменённые длины). Стоит это 3 полных расчёта.
  const blend = (t: number) => pol.x.map((v, i) => x0[i] + (v - x0[i]) * t);
  const cands: { x: number[]; tag: string }[] = [
    { x: lm.x, tag: "ЛМ" },
    { x: pol.x, tag: "доводка" },
    { x: quantizeVec(p, pol.x), tag: `округление до ${o.quantumMm} мм` },
    { x: blend(0.95), tag: "компромисс 95 %" },
    { x: blend(0.7), tag: "компромисс 70 %" },
    { x: blend(0.45), tag: "компромисс 45 %" },
    { x: blend(0.25), tag: "компромисс 25 %" },
  ];
  let best = { x: x0, m: before, tag: "исходная" };
  let bestCost = costOf(before, before, w, p.z0);
  const round = p.roundApply ?? ((v: number[]) => v.map((q) => Math.round(q * 1000) / 1000));
  for (const c of cands) {
    const x = round(c.x);
    if (x.some((v, i) => v < p.vars[i].min || v > p.vars[i].max)) continue;
    const m = p.full(x); fullEvals++;
    const cost = costOf(m, before, w, p.z0);
    if (cost < bestCost - 1e-9) { best = { x, m, tag: c.tag }; bestCost = cost; }
  }

  // Размеры в полях округляются до 0.001 мм — метрики должны считаться ИМЕННО по ним,
  // иначе показанный КСВ не совпадёт с тем, что даст штатный расчёт по применённым числам.
  // Every candidate above was checked after rounding, including its constraints.

  // --- Пояснения ------------------------------------------------------------------
  if (best.tag === "исходная") {
    notes.push("Оптимизатор не нашёл варианта лучше исходного: либо геометрия уже согласована, либо ограничители (усиление, заднее излучение) не дают улучшить КСВ.");
  }
  if (before.gainDbi - best.m.gainDbi > 0.05) {
    notes.push(`Усиление снизилось на ${(before.gainDbi - best.m.gainDbi).toFixed(2)} дБ — это плата за согласование; ограничитель не давал ему просесть больше чем на ${w.gainDropDb} дБ.`);
  }
  if (Number.isFinite(before.rearDb) && before.rearDb - best.m.rearDb > 1) {
    notes.push(`Заднее излучение ухудшилось на ${(before.rearDb - best.m.rearDb).toFixed(1)} дБ (было −${before.rearDb.toFixed(1)}, стало −${best.m.rearDb.toFixed(1)} дБ).`);
  }
  if (Math.abs(best.m.avgGain - 1) > 0.01) {
    notes.push(`⚠ Баланс энергии ${best.m.avgGain.toFixed(3)} вместо 1.000 — расчёт на этой геометрии менее достоверен, проверьте размеры.`);
  }
  if (o.tuneOffsetPct !== 0) {
    notes.push(
      `Настройка смещена на ${o.tuneOffsetPct > 0 ? "+" : ""}${o.tuneOffsetPct} % от рабочей частоты: ` +
      `оптимум по КСВ поставлен на ${(Number(values.freqMHz) * (1 + o.tuneOffsetPct / 100)).toFixed(1)} МГц. ` +
      `Укорочение элементов при настройке поднимает частоту, удлинение — опускает.`,
    );
  }

  // --- Альтернатива: сохранить усиление и согласовать устройством --------------
  // Если полное согласование длинами стоило заметного усиления, показываем второй путь:
  // оставить геометрию максимального усиления (подстроив только активный элемент в
  // резонанс) и поставить согласующее устройство. Это то, как делают длинные яги в жизни.
  let alternative: OptimizeResult["alternative"];
  const gainCost = before.gainDbi - best.m.gainDbi;
  if (gainCost > 0.15 || best.m.swrWorst > 1.3) {
    const drivenIdx = p.vars.findIndex((v) => v.label === "Активный");
    if (drivenIdx >= 0) {
      const only: Problem = {
        ...p,
        vars: p.vars.map((v, i) => (i === drivenIdx ? v : { ...v, min: v.start, max: v.start })),
      };
      const lm2 = lmMatch(only, x0, { iters: 5, regularization: 0.2 });
      lm2.x = round(lm2.x);
      fastEvals += lm2.evals;
      const m2 = only.full(lm2.x); fullEvals++;
      const advice = matchingAdvice(m2.R, m2.X, o.z0, p.freqs[0]);
      if (advice.length && m2.gainDbi > best.m.gainDbi + 0.05) {
        alternative = { values: b.apply(values, lm2.x), metrics: m2, advice };
        notes.push(
          `Альтернатива без потери усиления: оставить длины, близкие к исходным (КНД ` +
          `${m2.gainDbi.toFixed(2)} дБи против ${best.m.gainDbi.toFixed(2)} у согласованного варианта), ` +
          `подстроить только активный элемент (${m2.R.toFixed(0)}${m2.X >= 0 ? "+" : ""}${m2.X.toFixed(0)}j Ом) ` +
          `и поставить согласующее устройство — см. ниже.`,
        );
      }
    }
  }

  // Если после оптимизации КСВ всё ещё заметно больше 1 — это не недоработка
  // оптимизатора, а физика: у антенны просто другое собственное сопротивление.
  // Тогда показываем, ЧЕМ его согласовать.
  const advice = best.m.swrWorst > 1.2 ? matchingAdvice(best.m.R, best.m.X, o.z0, p.freqs[0]) : [];
  if (advice.length) {
    notes.push(
      `В выполненном поиске получен КСВ ${best.m.swrWorst.toFixed(2)}: собственное ` +
      `сопротивление антенны ${best.m.R.toFixed(0)}${best.m.X >= 0 ? "+" : ""}${best.m.X.toFixed(0)}j Ом, ` +
      `при заданных пределах размеров и приоритетах. Глобальный оптимум не доказан. Возможный следующий шаг — согласующее устройство.`,
    );
  }

  const changes = p.vars.map((v, i) => ({ label: v.label, from: v.start, to: best.x[i], unit: v.unit }))
    .filter((c) => Math.abs(c.to - c.from) > 1e-6);

  return {
    values: best.tag === "исходная" ? { ...values } : b.apply(values, best.x),
    before, after: best.m, changes, fastEvals, fullEvals, ms: Date.now() - t0, notes, advice, alternative,
  };
}
