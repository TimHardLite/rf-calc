import { describe, it, expect } from "vitest";
import { fresnelTransition, grazingEdgeD } from "./utd";

describe("UTD — проверка математики", () => {
  it("тождество cot[(π+φ)/4] + cot[(π−φ)/4] = 2/cos(φ/2)", () => {
    for (const deg of [10, 45, 90, 150, 200, 270, 330]) {
      const p = (deg * Math.PI) / 180;
      const lhs = 1 / Math.tan((Math.PI + p) / 4) + 1 / Math.tan((Math.PI - p) / 4);
      const rhs = 2 / Math.cos(p / 2);
      expect(lhs).toBeCloseTo(rhs, 9);
    }
  });

  it("F(X→0) = 0, F(X→∞) = 1", () => {
    const f0 = fresnelTransition(1e-9);
    expect(Math.hypot(f0.re, f0.im)).toBeLessThan(1e-4);
    for (const X of [200, 5000]) {
      const f = fresnelTransition(X);
      expect(f.re).toBeCloseTo(1, 3);
      expect(Math.abs(f.im)).toBeLessThan(0.02);
    }
  });

  it("малые X: F(X) ≈ √(πX)·e^{j(π/4+X)}", () => {
    for (const X of [0.001, 0.01, 0.05]) {
      const f = fresnelTransition(X);
      const mag = Math.sqrt(Math.PI * X), ph = Math.PI / 4 + X;
      // Ряд содержит поправку порядка 2X сверх ведущего члена — сверяем с этим допуском.
      expect(Math.abs(f.re - mag * Math.cos(ph))).toBeLessThan(3 * X + 1e-6);
      expect(Math.abs(f.im - mag * Math.sin(ph))).toBeLessThan(3 * X + 1e-6);
    }
  });

  it("непрерывность F в точке сшивки асимптотики (X=12)", () => {
    const a = fresnelTransition(11.999), b = fresnelTransition(12.001);
    expect(a.re).toBeCloseTo(b.re, 3);
    expect(a.im).toBeCloseTo(b.im, 3);
  });

  it("на границе тени φ=π коэффициент конечен и равен −√(s')", () => {
    const k = 2 * Math.PI / 0.05, s = 0.08;
    const D = grazingEdgeD(Math.PI, s, k);
    // D(π) = −e^{−jπ/4}/√(2πk) · √(2πk s')·e^{jπ/4} = −√(s')
    expect(D.re).toBeCloseTo(-Math.sqrt(s), 6);
    expect(Math.abs(D.im)).toBeLessThan(1e-6);
    // и предел подходит с обеих сторон непрерывно
    // За границей тени знак меняется: скачок дифрагированного поля ровно компенсирует
    // исчезающее геометрооптическое, поэтому СУММА остаётся непрерывной.
    const near1 = grazingEdgeD(Math.PI - 1e-4, s, k);
    const near2 = grazingEdgeD(Math.PI + 1e-4, s, k);
    expect(near1.re).toBeCloseTo(D.re, 3);
    expect(near2.re).toBeCloseTo(-D.re, 3);
    expect(Math.abs(near1.re + near2.re)).toBeLessThan(1e-6);
  });

  it("глубоко в тени поле убывает (|D| падает с удалением от границы тени)", () => {
    const k = 2 * Math.PI / 0.05, s = 0.08;
    const mag = (p: number) => { const d = grazingEdgeD(p, s, k); return Math.hypot(d.re, d.im); };
    // φ от π (граница) вглубь тени до 3π/2
    expect(mag(Math.PI)).toBeGreaterThan(mag(Math.PI * 1.2));
    expect(mag(Math.PI * 1.2)).toBeGreaterThan(mag(Math.PI * 1.45));
  });
});
