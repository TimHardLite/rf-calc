import { describe, expect, it } from 'vitest';
import { defaultsOf, getAntenna } from '../registry';
import { sweepBand, swrOf } from './sweep';
import { patchImpedance } from './patchmodel';
import { SUBSTRATES, substrateOf } from './substrate';
import { patchProblem, DEFAULT_PROBLEM_OPTIONS } from '../opt/problems';
import { canOptimize, optimizeAntenna } from '../opt/optimize';
import type { FieldValues } from '../fields';

describe('v3: independently defined bandwidth boundaries', () => {
  it.each([-1, 1])('does not invent the open edge (%s)', (side) => {
    const z = (f: number) => ({ re: 50 + 500 * Math.max(0, side * (f / 100 - 1)), im: 0 });
    const s = sweepBand(z, 100, { span: 0.08, limit: 1.6 });
    expect(side < 0 ? s.lo : s.hi).toBeCloseTo(side < 0 ? 94 : 106, 8);
    expect(side < 0 ? s.hi : s.lo).toBeUndefined();
    expect(s.wider).toBe(true);
  });
  it('finds both edges and keeps output ordered', () => {
    const s = sweepBand(f => ({ re: 50 + 5 * Math.abs(f - 100), im: 0 }), 100);
    expect(s.lo).toBeCloseTo(94, 8); expect(s.hi).toBeCloseTo(106, 8);
    expect(s.wider).toBe(false);
    expect(s.points.every((p, i) => i === 0 || p.freqMHz >= s.points[i - 1].freqMHz)).toBe(true);
  });
  it('does not bridge separate pass bands', () => {
    const s = sweepBand(f => ({ re: 50 + 10 * Math.min(Math.abs(f - 95), Math.abs(f - 105)), im: 0 }), 100, { points: 33 });
    expect(s.hi! - s.lo!).toBeCloseTo(6, 5);
  });
});

describe('v3: one physical patch model', () => {
  const a = getAntenna('patch');
  it.each(SUBSTRATES.map(s => s.id))('optimizer uses effective substrate %s', substrate => {
    const v: FieldValues = { ...defaultsOf(a, 'analysis'), substrate, epsR: 2.7, tanD: 0.009 };
    const p = patchProblem(v, DEFAULT_PROBLEM_OPTIONS);
    const x = p.vars.map(q => q.start);
    const z = p.zAt(x, Number(v.freqMHz));
    const m = a.analysis.compute(v).metrics;
    expect(z.re).toBeCloseTo(m.impedanceR!, 8);
    expect(z.im).toBeCloseTo(m.impedanceX!, 8);
  });
  it('every graph point and bandwidth edge agree with the model when detuned', () => {
    const sy = { ...defaultsOf(a, 'synthesis'), freqMHz: 5800 };
    const v: FieldValues = { ...defaultsOf(a, 'analysis'), ...a.synthesis!.design(sy).analysisValues, freqMHz: 6264 };
    const mat = substrateOf(String(v.substrate), Number(v.epsR), Number(v.tanD));
    const zAt = (fMHz: number) => patchImpedance({ L: Number(v.lengthMm), W: Number(v.widthMm), h: Number(v.substrateH), er: mat.epsR, tanD: mat.tanD, inset: Number(v.feedInsetMm), fMHz });
    const m = a.analysis.compute(v).metrics;
    expect(m.bandLowMHz).toBeDefined(); expect(m.bandHighMHz).toBeDefined();
    for (const f of [m.bandLowMHz!, m.bandHighMHz!]) {
      const z = zAt(f); expect(swrOf(z.re, z.im)).toBeCloseTo(1.6, 5);
    }
    for (const pt of m.sweep!) {
      const z = zAt(pt.freqMHz);
      expect(pt.R).toBeCloseTo(z.re, 8); expect(pt.X).toBeCloseTo(z.im, 8);
    }
  });
  it('beam reconstruction cannot optimize a hidden impedance model', () => {
    const v = { ...defaultsOf(a, 'analysis'), mode: 'beam' };
    expect(canOptimize('patch', v)).toBe(false);
    expect(() => optimizeAntenna('patch', v, { lmIters: 0, polishEvals: 0 })).toThrow();
  });
});
