// Интегралы Френеля C(x) и S(x) в НОРМИРОВАННОЙ форме (та, что используется в теории
// рупоров у Balanis и в справочнике Abramowitz & Stegun 7.3.1–7.3.2):
//   C(x) = ∫₀ˣ cos(π t²/2) dt ,  S(x) = ∫₀ˣ sin(π t²/2) dt
//
// Точность: |x| ≤ 1.6 — ряд Тейлора (сходится быстро, без катастрофической потери
// значащих цифр); дальше — накопление тем же рядом плюс составная формула Симпсона
// с шагом, привязанным к局部 периоду осцилляции 2/t. Проверено на табличных значениях
// A&S 7.3: C(0.5)=0.4923442, S(0.5)=0.0647205, C(1)=0.7798934, S(1)=0.4382591,
// C(2)=0.4882534, S(2)=0.3434157, C(3)=0.6057208, S(3)=0.4963129.

const X_SERIES = 1.6;

function seriesCS(x: number): { C: number; S: number } {
  const h = (Math.PI / 2) * x * x;
  let C = 0, S = 0;
  // C: Σ (−1)ⁿ (π/2)^{2n} x^{4n+1}/((2n)!(4n+1));  S: Σ (−1)ⁿ (π/2)^{2n+1} x^{4n+3}/((2n+1)!(4n+3))
  let termC = x;            // n = 0 член без делителя (4n+1)
  let termS = (h * x) / 3;  // n = 0: (π/2)x³/3 → удобнее вести через h
  C += termC / 1;
  S += termS;
  let tc = x, ts = (Math.PI / 2) * x * x * x;
  for (let n = 1; n < 60; n++) {
    // tc_n = (−1)ⁿ (π/2)^{2n} x^{4n+1}/(2n)!
    tc = (-tc * h * h) / ((2 * n) * (2 * n - 1));
    C += tc / (4 * n + 1);
    // ts_n = (−1)ⁿ (π/2)^{2n+1} x^{4n+3}/(2n+1)!
    ts = (-ts * h * h) / ((2 * n + 1) * (2 * n));
    S += ts / (4 * n + 3);
    if (Math.abs(tc) < 1e-18 && Math.abs(ts) < 1e-18) break;
  }
  return { C, S };
}

/** C(x) и S(x); нечётные функции, поэтому знак выносится. */
export function fresnelCS(x: number): { C: number; S: number } {
  const sgn = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax <= X_SERIES) {
    const r = seriesCS(ax);
    return { C: sgn * r.C, S: sgn * r.S };
  }
  const base = seriesCS(X_SERIES);
  // Число интервалов: не меньше 400 и не меньше ~24 на период осцилляции.
  const span = ax - X_SERIES;
  let n = Math.max(400, Math.ceil(12 * (ax * ax - X_SERIES * X_SERIES)));
  if (n % 2 === 1) n += 1;
  const dt = span / n;
  let sc = 0, ss = 0;
  for (let i = 0; i <= n; i++) {
    const t = X_SERIES + i * dt;
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    const u = (Math.PI / 2) * t * t;
    sc += w * Math.cos(u);
    ss += w * Math.sin(u);
  }
  const C = base.C + (sc * dt) / 3;
  const S = base.S + (ss * dt) / 3;
  return { C: sgn * C, S: sgn * S };
}
