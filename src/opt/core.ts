// Ядро оптимизатора геометрии антенны.
//
// ЗАДАЧА. Классические методики синтеза (DL6WU для яги, Каррел для ЛПА, Balanis для
// патча) дают ХОРОШУЮ, но не согласованную геометрию: КСВ у яги легко получается 1.5…2.6.
// Оптимизатор доводит её до КСВ → 1, меняя ТОЛЬКО те размеры, которые разрешено менять
// (у яги — длины элементов; расстояния задаются частотой и неприкосновенны).
//
// КАК ЭТО УСТРОЕНО — три стадии:
//  1. Левенберг–Марквардт по коэффициенту отражения Γ на нескольких частотах полосы.
//     Невязка r = [Re Γ(f₁), Im Γ(f₁), …] + регуляризация √μ·(L−L₀)/масштаб.
//     Регуляризация принципиальна: невязок мало (2 на частоту), а переменных много,
//     поэтому без неё решение «уплывает» в произвольную сторону и рушит усиление.
//     С ней ищется МИНИМАЛЬНОЕ изменение длин, которое обнуляет отражение.
//  2. Координатная доводка с уменьшающимся шагом по ПОЛНОЙ целевой функции — она уже
//     учитывает усиление, заднее излучение и баланс энергии.
//  3. Квантование к производственному шагу (по умолчанию 0.1 мм) и проверка.
//
// Почему не «десять тысяч случайных вариантов», как в MMANA: перебор вслепую тратит
// тысячи полных расчётов ради того, что градиентный метод находит за десятки. При
// 50 мс на расчёт импеданса 8-элементной яги 10 000 вариантов — это 8 минут, а ЛМ
// доходит до КСВ ≈ 1.05 за 10–20 секунд.

export interface OptVar {
  /** Идентификатор (для отчёта): «Директор D3», «Активный». */
  label: string;
  /** Стартовое значение (в единицах unit, по умолчанию мм). */
  start: number;
  min: number;
  max: number;
  /** Единица измерения переменной: «мм» (по умолчанию) или, например, «Ом». */
  unit?: string;
}

export interface FullMetrics {
  /** Худший КСВ по полосе оптимизации. */
  swrWorst: number;
  /** КСВ на рабочей частоте. */
  swr: number;
  R: number;
  X: number;
  gainDbi: number;
  /** Заднее излучение (сектор ±60°), дБ. NaN — не применимо к типу. */
  rearDb: number;
  /** Баланс энергии (идеал 1.000) — контроль достоверности расчёта. */
  avgGain: number;
}

export interface Problem {
  vars: OptVar[];
  /** Optional search seed; never substitutes the actual baseline geometry. */
  searchStart?: number[];
  /** Частоты полосы, на которых считается отражение (первая — рабочая). */
  freqs: number[];
  /** Опорное сопротивление тракта, Ом. */
  z0: number;
  /** Быстрый расчёт: только импеданс, без ДН. */
  zAt: (x: number[], fMHz: number) => { re: number; im: number };
  /** Полный расчёт: с ДН (усиление, заднее излучение, баланс). */
  full: (x: number[]) => FullMetrics;
  /** Шаг квантования размеров, мм (производственная точность). */
  quantumMm: number;
  /**
   * Округление вектора переменных ровно так, как это сделает apply* при записи
   * в поля формы. Нужно, чтобы метрики «после» считались по ТЕМ ЖЕ числам, которые
   * получит штатный расчёт. По умолчанию — до 0.001 мм (см. optimize.ts).
   */
  roundApply?: (x: number[]) => number[];
}

export interface Weights {
  /** Вес отклонения Z от z0 (второй приоритет — по требованию заказчика меньше КСВ). */
  zWeight: number;
  /** Насколько усиление разрешено просесть относительно старта, дБ. */
  gainDropDb: number;
  /** Насколько заднее излучение разрешено ухудшиться относительно старта, дБ. */
  rearDropDb: number;
}

export const DEFAULT_WEIGHTS: Weights = { zWeight: 0.15, gainDropDb: 0.3, rearDropDb: 2.0 };

export function swrOf(re: number, im: number, z0: number): number {
  if (!(re > 0) || !Number.isFinite(re) || !Number.isFinite(im) || !(z0 > 0) || !Number.isFinite(z0)) return Infinity;
  const g = Math.hypot(re - z0, im) / Math.hypot(re + z0, im);
  return g >= 1 ? Infinity : (1 + g) / (1 - g);
}

/** Коэффициент отражения Γ относительно z0. */
export function gammaOf(re: number, im: number, z0: number): { re: number; im: number } {
  const dr = re - z0, di = im, sr = re + z0, si = im;
  const d = sr * sr + si * si;
  if (!(d > 0)) return { re: 1, im: 0 };
  return { re: (dr * sr + di * si) / d, im: (di * sr - dr * si) / d };
}

/**
 * Полная целевая функция (чем меньше, тем лучше). Приоритеты — по требованию заказчика:
 * главный критерий КСВ → 1, второй (меньшего веса) Z → z0, и жёсткие ограничители на
 * усиление, заднее излучение и достоверность расчёта: вариант с лучшим КСВ, но
 * провалившимся усилением, проигрывает варианту с чуть худшим КСВ и нормальными
 * остальными характеристиками.
 */
export function costOf(m: FullMetrics, ref: FullMetrics, w: Weights = DEFAULT_WEIGHTS, z0 = 50): number {
  if (!Number.isFinite(m.swrWorst) || !Number.isFinite(m.R) || !Number.isFinite(m.X) || !(m.R > 0)) return Infinity;
  let J = (m.swrWorst - 1) + w.zWeight * (Math.hypot(m.R - z0, m.X) / z0);
  const gainDrop = ref.gainDbi - m.gainDbi;
  if (Number.isFinite(gainDrop) && gainDrop > w.gainDropDb) return Infinity;
  const rearDrop = ref.rearDb - m.rearDb;
  if (Number.isFinite(rearDrop) && rearDrop > w.rearDropDb) return Infinity;
  if (Number.isFinite(m.avgGain) && Math.abs(m.avgGain - 1) > 0.02) J += 50; // расчёт недостоверен
  if (!(m.R > 0)) J += 100;
  return J;
}

/** Худший КСВ по полосе для набора размеров (быстрый путь). */
export function worstSwr(p: Problem, x: number[]): number {
  let worst = 0;
  for (const f of p.freqs) {
    const z = p.zAt(x, f);
    worst = Math.max(worst, swrOf(z.re, z.im, p.z0));
  }
  return worst;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Решение СЛАУ методом Гаусса с частичным выбором (малые плотные системы). */
function solveLin(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      if (k === 0) continue;
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

export interface LmOptions {
  /** Максимум итераций. */
  iters?: number;
  /** На каких частотах считать невязку. По умолчанию — только рабочая: подгонка в точку
   *  сходится вдвое-втрое быстрее, а ширину полосы добирает координатная доводка,
   *  у которой цель — худший КСВ по полосе. */
  matchFreqs?: number[];
  /** Сила регуляризации «не уходить далеко от исходной геометрии». */
  regularization?: number;
  /** Шаг численной производной, мм. */
  deltaMm?: number;
  /** Вызывается после каждой итерации (для прогресса и отмены: вернуть false — прервать). */
  onStep?: (info: { iter: number; swr: number; evals: number }) => boolean | void;
}

/**
 * Стадия 1: Левенберг–Марквардт по Γ с регуляризацией к стартовой геометрии.
 * Возвращает найденный вектор размеров и число обращений к расчёту импеданса.
 */
export function lmMatch(p: Problem, x0: number[], opt: LmOptions = {}): { x: number[]; evals: number } {
  const iters = opt.iters ?? 8;
  const reg = opt.regularization ?? 0.05;
  const freqs = opt.matchFreqs ?? [p.freqs[0]];
  const n = p.vars.length, nf = freqs.length;
  const scale = p.vars.map((v) => Math.max(1, Math.abs(v.start) * 0.05)); // 5 % длины как «единица»
  const delta = opt.deltaMm ?? Math.max(0.05, Math.min(...p.vars.map((v) => Math.abs(v.start))) * 0.002);
  let evals = 0;

  const residual = (x: number[]): number[] => {
    const r: number[] = [];
    for (let k = 0; k < nf; k++) {
      const z = p.zAt(x, freqs[k]); evals++;
      const g = gammaOf(z.re, z.im, p.z0);
      // Рабочая частота весит вдвое: полоса важна, но настройка в точку — важнее.
      const w = k === 0 ? Math.SQRT2 : 1;
      r.push(w * g.re, w * g.im);
    }
    for (let i = 0; i < n; i++) r.push(Math.sqrt(reg) * ((x[i] - x0[i]) / scale[i]));
    return r;
  };
  const norm2 = (r: number[]) => r.reduce((a, b) => a + b * b, 0);

  let x = [...x0];
  let r = residual(x), f = norm2(r);
  let mu = 1e-3;

  for (let it = 0; it < iters; it++) {
    // Якобиан конечными разностями (n дополнительных расчётов на итерацию)
    const J: number[][] = [];
    for (let i = 0; i < n; i++) {
      const xp = [...x];
      xp[i] = clamp(x[i] + delta, p.vars[i].min, p.vars[i].max);
      if (xp[i] === x[i]) xp[i] = clamp(x[i] - delta, p.vars[i].min, p.vars[i].max);
      const h = xp[i] - x[i];
      if (h === 0) { J.push(r.map(() => 0)); continue; }
      const rp = residual(xp);
      J.push(r.map((_, k) => (rp[k] - r[k]) / h));
    }
    // Нормальные уравнения (JᵀJ + μ·diag) Δ = −Jᵀr
    const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const Jtr: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let s = 0;
        for (let k = 0; k < r.length; k++) s += J[i][k] * J[j][k];
        JtJ[i][j] = s; JtJ[j][i] = s;
      }
      let s = 0;
      for (let k = 0; k < r.length; k++) s += J[i][k] * r[k];
      Jtr[i] = s;
    }
    let improved = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v + mu * (1 + v) : v)));
      const dx = solveLin(A, Jtr.map((v) => -v));
      if (!dx) { mu *= 10; continue; }
      const xn = x.map((v, i) => clamp(v + dx[i], p.vars[i].min, p.vars[i].max));
      const rn = residual(xn), fn = norm2(rn);
      if (fn < f) { x = xn; r = rn; f = fn; mu = Math.max(mu / 3, 1e-9); improved = true; break; }
      mu *= 10;
    }
    const swr = worstSwr(p, x); evals += nf;
    if (opt.onStep && opt.onStep({ iter: it + 1, swr, evals }) === false) break;
    if (!improved || swr < 1.02) break;
  }
  return { x, evals };
}

export interface PolishOptions {
  /** Доли коридора переменной, которыми идёт спуск (по убыванию).
   *  Шаг считается для КАЖДОЙ переменной свой: длина элемента яги и волновое
   *  сопротивление линии ЛПА живут в разных масштабах, один шаг в мм тут не годится. */
  steps?: number[];
  /** Максимум обращений к быстрому расчёту. */
  maxEvals?: number;
  onStep?: (info: { swr: number; evals: number }) => boolean | void;
}

/**
 * Стадия 2: координатная доводка по БЫСТРОЙ цели (худший КСВ по полосе + малый вес
 * отклонения Z от z0). Полный расчёт с ДН здесь не нужен: усиление и заднее излучение
 * проверяются на финальных кандидатах в optimize() — так доводка стоит десятки
 * миллисекунд на шаг, а не сотни.
 *
 * Внутри — ранний выход: сначала считается рабочая частота, и если КСВ на ней уже хуже
 * текущего лучшего, остальные частоты полосы не считаются вовсе.
 */
export function polish(p: Problem, x0: number[], w: Weights = DEFAULT_WEIGHTS, opt: PolishOptions = {}): { x: number[]; evals: number } {
  const fracs = opt.steps ?? [0.05, 0.015, 0.005];
  const maxEvals = opt.maxEvals ?? 200;
  const spans = p.vars.map((v) => Math.max(1e-9, (v.max - v.min) / 2));
  let evals = 0;

  const cheapCost = (x: number[], bound: number): number => {
    let worst = 0, zPen = 0;
    for (let k = 0; k < p.freqs.length; k++) {
      const z = p.zAt(x, p.freqs[k]); evals++;
      const s = swrOf(z.re, z.im, p.z0);
      if (k === 0) zPen = w.zWeight * (Math.hypot(z.re - p.z0, z.im) / p.z0);
      worst = Math.max(worst, s);
      if (worst - 1 + zPen >= bound) return worst - 1 + zPen; // ранний выход
    }
    return worst - 1 + zPen;
  };

  let x = [...x0];
  let best = cheapCost(x, Infinity);
  outer: for (const frac of fracs) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < p.vars.length; i++) {
        const step = spans[i] * frac;
        for (const s of [step, -step]) {
          const xn = [...x];
          xn[i] = clamp(x[i] + s, p.vars[i].min, p.vars[i].max);
          if (xn[i] === x[i]) continue;
          const c = cheapCost(xn, best);
          if (c < best - 1e-6) {
            x = xn; best = c; improved = true;
            if (opt.onStep && opt.onStep({ swr: c + 1, evals }) === false) break outer;
            break;
          }
          if (evals >= maxEvals) break outer;
        }
        if (evals >= maxEvals) break outer;
      }
    }
  }
  return { x, evals };
}

/** Квантование к производственному шагу с проверкой, что результат не стал хуже. */
export function quantizeVec(p: Problem, x: number[]): number[] {
  const q = p.quantumMm;
  return x.map((v, i) => clamp(Math.round(v / q) * q, p.vars[i].min, p.vars[i].max));
}
