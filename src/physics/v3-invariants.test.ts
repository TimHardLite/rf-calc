import { describe, expect, it } from 'vitest';
import { ANTENNAS, defaultsOf } from '../registry';
import type { FieldValues } from '../fields';
import { directivityAxisymmetric, directivityFull } from './mathutil';
import { computeArray } from './array';
import { C0 } from './types';
import { sanitize } from '../guard';

describe('v3: physical invariants independent of UI settings', () => {
  it.each(ANTENNAS.map(a => [a.id, a] as const))('%s: display floor cannot change physical metrics', (_, a) => {
    const v = defaultsOf(a, 'analysis');
    const first = a.analysis.compute({ ...v, floorDb: -20 }).metrics;
    const second = a.analysis.compute({ ...v, floorDb: -80 }).metrics;
    for (const key of ['directivityDbi', 'gainDbi', 'frontToBackDb', 'rearSectorDb', 'hpbwDeg', 'hpbwEDeg', 'hpbwHDeg', 'sllDb'] as const) {
      expect(first[key], key).toEqual(second[key]);
    }
  }, 30000);
  it.each(ANTENNAS.filter(a => ['dipole','yagi','moxon','lpda','array','horn'].includes(a.id)).map(a => [a.id,a] as const))('%s: PEC electromagnetic scale invariance', (_, a) => {
    const v: FieldValues = { ...defaultsOf(a, 'analysis'), material: 'pec' };
    const scaled: FieldValues = { ...v };
    for (const f of a.analysis.fields) {
      if (f.unit === 'мм') scaled[f.key] = Number(v[f.key]) * 2;
      if (f.unit === 'МГц') scaled[f.key] = Number(v[f.key]) / 2;
      if (Array.isArray(v[f.key])) scaled[f.key] = (v[f.key] as any[]).map(e => ({ ...e, lengthMm:e.lengthMm*2, diameterMm:e.diameterMm*2, positionMm:e.positionMm*2 }));
    }
    const x = a.analysis.compute(v).metrics, y = a.analysis.compute(scaled).metrics;
    for (const key of ['directivityDbi','hpbwDeg','impedanceR','impedanceX'] as const) {
      if (x[key] != null) expect(y[key], key).toBeCloseTo(x[key]!, 6);
    }
  }, 30000);
});

describe('v3: closed form electromagnetic references', () => {
  it('integrates isotropic radiation to D=1 and Hertzian dipole to D=1.5', () => {
    expect(directivityAxisymmetric(() => 1)).toBeCloseTo(1, 5);
    expect(directivityFull(() => 1, 360, 360)).toBeCloseTo(1, 4);
    expect(directivityAxisymmetric(t => Math.sin(t)**2)).toBeCloseTo(1.5, 5);
  });
  it.each([1,2,4,8,16])('uniform isotropic half-wave array: exact D=N (%s)', count => {
    const r = computeArray({freqMHz:300, count, spacingMm:C0/300e6*1000/2,phaseDeg:0,floorDb:-80});
    expect(r.metrics.directivityDbi).toBeCloseTo(10*Math.log10(count), 3);
  });
});

it('malformed element entries produce validation errors instead of exceptions', () => {
  const a = ANTENNAS.find(a => a.id === 'yagi')!;
  for (const entry of [null, undefined, {}, 4, 'driven']) {
    const r = sanitize(a.analysis.fields, { ...defaultsOf(a, 'analysis'), elements: [entry] as any });
    expect(r.ok).toBe(false);
  }
});
