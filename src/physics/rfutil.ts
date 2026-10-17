// Общие радиотехнические пересчёты: согласование, полоса, потери на рассогласовании.
// Всё здесь — точные определения, а не подгонки, поэтому применимо к любому типу антенны.

/**
 * Пригоден ли посчитанный импеданс к выводу.
 * У ПАССИВНОЙ антенны активная часть строго положительна. R ≤ 0 (или не-число)
 * означает не «плохое согласование», а развал численного решения — например,
 * вырожденную геометрию вроде вибратора длиной 0.002λ. Такой результат нельзя
 * показывать ни как импеданс, ни как КСВ: он не «плохой», он несуществующий.
 */
export function impedanceUsable(R: number, X: number): boolean {
  return Number.isFinite(R) && Number.isFinite(X) && R > 1e-9;
}

/** Модуль коэффициента отражения от линии с волновым сопротивлением Z0. NaN — если R непригоден. */
export function reflectionMag(R: number, X: number, Z0 = 50): number {
  if (!impedanceUsable(R, X)) return NaN;
  const num = Math.hypot(R - Z0, X);
  const den = Math.hypot(R + Z0, X);
  return den < 1e-12 ? 1 : num / den;
}

/** КСВ (VSWR) относительно Z0. NaN — если импеданс непригоден к выводу. */
export function vswr(R: number, X: number, Z0 = 50): number {
  const g = reflectionMag(R, X, Z0);
  if (!Number.isFinite(g)) return NaN;
  return g >= 1 ? Infinity : (1 + g) / (1 - g);
}

/** Потери на рассогласовании, дБ (всегда ≥ 0): сколько мощности не вошло в антенну. */
export function mismatchLossDb(R: number, X: number, Z0 = 50): number {
  const g = reflectionMag(R, X, Z0);
  if (!Number.isFinite(g)) return NaN;
  const t = 1 - g * g;
  return t <= 1e-12 ? Infinity : -10 * Math.log10(t);
}

/** Предельный модуль Γ, при котором КСВ не хуже заданного. */
export function gammaForVswr(s: number): number {
  return (s - 1) / (s + 1);
}

/**
 * Полоса резонансной антенны по заданному КСВ через добротность:
 *   Δf/f₀ = (S − 1) / (Q·√S)
 * Точное соотношение для одиночного резонансного контура, согласованного в резонансе.
 */
export function fractionalBandwidth(Q: number, targetVswr: number): number | null {
  if (!(Q > 0) || !(targetVswr > 1)) return null;
  return (targetVswr - 1) / (Q * Math.sqrt(targetVswr));
}

/**
 * Добротность по производной входного импеданса (определение Yaghjian–Best):
 *   Q ≈ (ω₀ / 2R₀) · |dZ/dω|
 * Нужна всего пара дополнительных расчётов импеданса вместо полного свипа по частоте.
 * dZ/dω берём конечной разностью по частотам f∓ и f±.
 */
export function qFromImpedanceSlope(
  f0: number, R0: number,
  fLo: number, zLo: { re: number; im: number },
  fHi: number, zHi: { re: number; im: number },
): number | null {
  if (!(R0 > 0) || !(fHi > fLo)) return null;
  const dR = (zHi.re - zLo.re) / (fHi - fLo);
  const dX = (zHi.im - zLo.im) / (fHi - fLo);
  const dZ = Math.hypot(dR, dX);           // |dZ/df|
  const Q = (f0 / (2 * R0)) * dZ;           // ω-множители сокращаются
  return Number.isFinite(Q) && Q > 0 ? Q : null;
}

/** Границы полосы по относительной ширине. */
export function bandEdges(f0: number, frac: number): { lo: number; hi: number } {
  return { lo: f0 * (1 - frac / 2), hi: f0 * (1 + frac / 2) };
}

/**
 * Функция Бесселя J₀ — нужна для взаимной проводимости щелей патча.
 * Степенной ряд J₀(x) = Σ (−1)ᵐ (x²/4)ᵐ / (m!)². У нас аргумент не превышает ≈ π
 * (k₀·L·sinθ у резонансного патча), поэтому ряд сходится за единицы членов и
 * даёт машинную точность — надёжнее, чем таблицы подгоночных коэффициентов.
 */
export function besselJ0(x: number): number {
  const t = (x * x) / 4;
  let term = 1, sum = 1;
  for (let m = 1; m <= 40; m++) {
    term *= -t / (m * m);
    sum += term;
    if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
  }
  return sum;
}

/** Осевое отношение осевой спирали (Краус): AR = (2N+1)/(2N). */
export function helixAxialRatio(turns: number): number | null {
  return turns > 0 ? (2 * turns + 1) / (2 * turns) : null;
}
