import { describe, it, expect } from 'vitest';
import { lmMatch, swrOf, costOf, type Problem, type FullMetrics } from './core';
import { optimizeAntenna } from './optimize';
import { defaultsOf, getAntenna } from '../registry';

describe('v3: numerical optimizer contracts', () => {
  it('rejects invalid inputs before starting numerical work', () => {
    const v=defaultsOf(getAntenna('patch'),'analysis');
    expect(()=>optimizeAntenna('patch',{...v,freqMHz:NaN})).toThrow(/Исправьте исходные данные/);
  });
  it('does not cap a physically large SWR at 99', () => {
    expect(swrOf(500000, 0, 50)).toBeCloseTo(10000, 5);
    expect(swrOf(-1, 0, 50)).toBe(Infinity);
  });
  it('can descend from the upper bound using a backward difference', () => {
    const p = {vars:[{label:'x',start:10,min:0,max:10}],freqs:[100],z0:50,
      quantumMm:0.1,zAt:([x]:number[])=>({re:50,im:(x-4)*20}),
      full:()=>{throw new Error('LM must only use impedance');}} satisfies Problem;
    const r=lmMatch(p,[10],{regularization:0,iters:15});
    expect(Math.abs(r.x[0]-4)).toBeLessThan(0.02);
  });
  it('uses the requested reference impedance in the cost', () => {
    const m:FullMetrics={swr:1,swrWorst:1,R:75,X:0,gainDbi:2,rearDb:NaN,avgGain:1};
    expect(costOf(m,m,undefined,75)).toBe(0);
  });
  it('rejects candidates outside declared gain and rear limits even with much better SWR', () => {
    const ref:FullMetrics={swr:10,swrWorst:10,R:500,X:0,gainDbi:10,rearDb:20,avgGain:1};
    expect(costOf({...ref,swr:1,swrWorst:1,R:50,gainDbi:9.5},ref)).toBe(Infinity);
    expect(costOf({...ref,swr:1,swrWorst:1,R:50,rearDb:17},ref)).toBe(Infinity);
  });
  it('reports actual edge-fed patch before optimization and improves it', () => {
    const v=defaultsOf(getAntenna('patch'),'analysis');
    const actual=getAntenna('patch').analysis.compute(v).metrics;
    const r=optimizeAntenna('patch',v);
    expect(r.before.R).toBeCloseTo(actual.impedanceR!,8);
    expect(r.before.X).toBeCloseTo(actual.impedanceX!,8);
    expect(r.after.swr).toBeLessThan(1.2);
  });
});
