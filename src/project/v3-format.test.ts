import { it, expect } from 'vitest';
import { parseProject } from './format';
it('rejects unsupported version zero', () => {
  expect(() => parseProject('IRTANT/0\ntype=yagi\n[params]\nfreqMHz=100')).toThrow();
});
it('does not invent zero coordinates for missing element numbers', () => {
  for(const row of ['driven,100,2,','driven,,2,0','driven,100,,0']) {
    expect(() => parseProject('IRTANT/2\ntype=yagi\n[params]\n[elements]\n'+row)).toThrow();
  }
});
