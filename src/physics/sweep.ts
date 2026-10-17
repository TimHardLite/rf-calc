// Свип по частоте: КСВ(f), R(f), X(f) — как таблица «F / КСВ / Ga / Z» в MMANA-GAL.
//
// ЗАЧЕМ. Раньше полоса оценивалась по добротности: два расчёта рядом с рабочей
// частотой, наклон импеданса → Q → полоса по формуле. Это верно только для
// одиночного резонанса и вблизи него; у яги, Moxon и ЛПА кривая КСВ несимметрична,
// а минимум КСВ часто смещён от заданной частоты. Прямой свип показывает настоящую
// кривую: где на самом деле минимум, какова полоса и не является ли настройка «иглой».
//
// СТОИМОСТЬ. Считается только импеданс (интегрирование по сфере пропускается):
// одна точка — десятки миллисекунд даже для 8-элементной яги. Сетка строится ОДИН раз
// на рабочей частоте и переиспользуется на всех частотах свипа — геометрия ведь не
// меняется, меняется только λ в ядре.

export interface SweepPoint {
  freqMHz: number;
  R: number;
  X: number;
  swr: number;
}

export interface SweepResult {
  points: SweepPoint[];
  /** Границы полосы по критерию limit (МГц). undefined — край не найден в пределах свипа. */
  lo?: number;
  hi?: number;
  limit: number;
  /** Минимум КСВ в пределах свипа и частота этого минимума. */
  minSwr: number;
  minFreqMHz: number;
  /** true — кривая не пересекает критерий внутри свипа (полоса шире окна расчёта). */
  wider: boolean;
}

export function swrOf(R: number, X: number, z0 = 50): number {
  if (!(R > 0) || !Number.isFinite(X)) return NaN;
  const g = Math.hypot(R - z0, X) / Math.hypot(R + z0, X);
  return g >= 1 ? Infinity : (1 + g) / (1 - g);
}

/** Линейная интерполяция частоты, на которой КСВ пересекает уровень lim. */
function cross(a: SweepPoint, b: SweepPoint, lim: number): number {
  const d = b.swr - a.swr;
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return b.freqMHz;
  return a.freqMHz + ((lim - a.swr) / d) * (b.freqMHz - a.freqMHz);
}

/**
 * Свип КСВ вокруг частоты f0.
 * zAt — импеданс на заданной частоте (сетка внутри должна быть фиксированной).
 * span — половина окна в долях f0 (0.08 = ±8 %), points — число точек (нечётное).
 * limit — критерий полосы (по умолчанию КСВ ≤ 1.6), refine — уточнение границ делением пополам.
 */
export function sweepBand(
  zAt: (fMHz: number) => { re: number; im: number },
  f0: number,
  opt: { z0?: number; span?: number; points?: number; limit?: number; refine?: number } = {},
): SweepResult {
  const z0 = opt.z0 ?? 50;
  const span = opt.span ?? 0.08;
  const n = Math.max(5, opt.points ?? 13);
  const limit = opt.limit ?? 1.6;
  const refine = opt.refine ?? 3;

  const at = (f: number): SweepPoint => {
    const z = zAt(f);
    return { freqMHz: f, R: z.re, X: z.im, swr: swrOf(z.re, z.im, z0) };
  };
  const points: SweepPoint[] = [];
  for (let i = 0; i < n; i++) points.push(at(f0 * (1 - span) + ((2 * span * f0) * i) / (n - 1)));

  let iMin = 0;
  for (let i = 1; i < points.length; i++) if (points[i].swr < points[iMin].swr) iMin = i;
  // Refinement points must never become neighbours in the opposite edge search.
  const grid = points.slice();

  // Границы: идём от минимума влево и вправо до первого пересечения критерия,
  // затем уточняем делением пополам (каждая итерация — один расчёт импеданса).
  const edge = (dir: -1 | 1): number | undefined => {
    for (let i = iMin; i + dir >= 0 && i + dir < grid.length; i += dir) {
      const a = grid[i], b = grid[i + dir];
      if (a.swr <= limit && b.swr > limit) {
        let lo = a, hi = b;
        for (let k = 0; k < refine; k++) {
          const p = at((lo.freqMHz + hi.freqMHz) / 2);
          points.push(p);
          if (p.swr <= limit) lo = p; else hi = p;
        }
        return cross(lo, hi, limit);
      }
    }
    return undefined;
  };
  const loF = points[iMin].swr <= limit ? edge(-1) : undefined;
  const hiF = points[iMin].swr <= limit ? edge(1) : undefined;
  points.sort((a, b) => a.freqMHz - b.freqMHz);

  let best = points[0];
  for (const p of points) if (p.swr < best.swr) best = p;

  return {
    points,
    lo: loF,
    hi: hiF,
    limit,
    minSwr: best.swr,
    minFreqMHz: best.freqMHz,
    wider: best.swr <= limit && (loF === undefined || hiF === undefined),
  };
}
