import { expect, it } from 'vitest';
import { ANTENNAS, defaultsOf } from '../registry';
import { parseProject, serializeProject, reconcile } from './format';
import { restoredGeometry, geometryRows } from './state';

it.each(ANTENNAS.filter(a => a.synthesis).map(a => [a.id, a] as const))('%s restores selected geometry and preserves requirements and notes', (_, a) => {
  const analysis = defaultsOf(a, 'analysis');
  const synthesis = defaultsOf(a, 'synthesis');
  // Deliberately distinct from synthesis defaults, representing a saved chosen geometry.
  analysis.freqMHz = 1234;
  const p = parseProject(serializeProject({ name: 'test', type: a.id, mode: 'synthesis', analysis, synthesis, note: 'note # ;' },
    { analysis: a.analysis.fields, synthesis: a.synthesis!.fields }));
  const restored = restoredGeometry(p, reconcile(p.analysis, a.analysis.fields).values);
  expect(restored).toEqual(analysis);
  expect(p.synthesis).toEqual(synthesis);
  expect(p.note).toBe('note # ;');
  expect(geometryRows(a.analysis.fields, restored!).some(r => r.value === '1234')).toBe(true);
});

it('does not replace legacy synthesis with default analysis geometry', () => {
  const p = parseProject('IRTANT/1\ntype=patch\nmode=synthesis\n[params]\nfreqMHz=5800');
  expect(restoredGeometry(p, { freqMHz: 100 })).toBeNull();
});
it('keeps analysis projects in their normal path', () => {
  expect(restoredGeometry({ name: 'x', type: 'patch', mode: 'analysis', analysis: { freqMHz: 1234 } }, { freqMHz: 1234 })).toBeNull();
});
