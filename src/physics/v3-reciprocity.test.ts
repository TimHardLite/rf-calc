import { it, expect } from 'vitest';
import { solve3D, type Wire, type C } from './mom3d';
import { centerFedElement } from './segment';
const lam=299792458/300e6;
function wire(x:number):Wire {
  const p=centerFedElement([x,0,0],[0,0,1],.47*lam,lam);
  return {pts:p.pts,seglens:p.seglens,seglen:lam/20,radius:.001};
}
it('reciprocity: the independently excited port admittances Y12 and Y21 agree',()=>{
  let ports:C[][]=[];
  solve3D([wire(0),wire(.3)],300,{points:[[0,0,0],[.3,0,0]]},{skipPattern:true,
    network:Y=>{ports=Y;return {V:[{re:1,im:0},{re:0,im:0}],Zin:{re:50,im:0}};}});
  expect(ports).toHaveLength(2);
  expect(ports[0][1].re).toBeCloseTo(ports[1][0].re,10);
  expect(ports[0][1].im).toBeCloseTo(ports[1][0].im,10);
});
it('a rigid translation preserves impedance and far-field power',()=>{
  const w=wire(0), offset:[number,number,number]=[.23,-.41,.57];
  const shifted:Wire={...w,pts:w.pts.map(p=>p.map((v,i)=>v+offset[i]) as [number,number,number])};
  const a=solve3D([w],300,{point:[0,0,0]}),b=solve3D([shifted],300,{point:offset});
  // Singular-integral subtraction amplifies coordinate roundoff slightly: observed
  // 3.44e-5 ohm on this case. Use a 1e-3 ohm numerical tolerance, not exact equality.
  expect(Math.abs(a.Zin.re-b.Zin.re)).toBeLessThan(.001);
  expect(Math.abs(a.Zin.im-b.Zin.im)).toBeLessThan(.001);
  for(const t of [15,35,65,90,125,165]) for(const p of [0,70,180,270])
    expect(Math.abs(a.powerAt(t,p)-b.powerAt(t,p))/a.Umax).toBeLessThan(1e-5);
});
