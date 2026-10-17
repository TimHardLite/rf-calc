// Тонкопроволочный метод моментов (MoM) для проволочных антенн: прямые
// параллельные вибраторы вдоль Y, разнесённые по X (яги/волновой канал).
// Базис — кусочно-синусоидальный (PWS), тестирование по Галёркину, поле
// синусоидального сегмента в замкнутой форме (3 сферические волны). Свободное
// пространство. Проверено против NEC2 (nec2c) на реальной 180-яги ИРТ:
// Ga 11.47 vs 11.59 дБи, Rin 44.6 vs 44.5 Ом — совпадение в пределах метода.

const ETA = 376.730313;
export const C_LIGHT = 299792458;

export interface Complex { re: number; im: number }
const cx = (re: number, im = 0): Complex => ({ re, im });
const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cmul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cscale = (a: Complex, s: number): Complex => ({ re: a.re * s, im: a.im * s });
const cabs2 = (a: Complex): number => a.re * a.re + a.im * a.im;

function csolve(A: Complex[][], b: Complex[], n: number): Complex[] {
  const M = A.map((row) => row.map((c) => ({ ...c })));
  const x = b.map((c) => ({ ...c }));
  for (let col = 0; col < n; col++) {
    let piv = col, best = cabs2(M[col][col]);
    for (let r = col + 1; r < n; r++) { const v = cabs2(M[r][col]); if (v > best) { best = v; piv = r; } }
    if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; [x[col], x[piv]] = [x[piv], x[col]]; }
    const d = M[col][col], dabs2 = cabs2(d);
    for (let r = col + 1; r < n; r++) {
      const num = M[r][col];
      const f = { re: (num.re * d.re + num.im * d.im) / dabs2, im: (num.im * d.re - num.re * d.im) / dabs2 };
      for (let c = col; c < n; c++) M[r][c] = csub(M[r][c], cmul(f, M[col][c]));
      x[r] = csub(x[r], cmul(f, x[col]));
    }
  }
  for (let row = n - 1; row >= 0; row--) {
    let s = { ...x[row] };
    for (let c = row + 1; c < n; c++) s = csub(s, cmul(M[row][c], x[c]));
    const d = M[row][row], dabs2 = cabs2(d);
    x[row] = { re: (s.re * d.re + s.im * d.im) / dabs2, im: (s.im * d.re - s.re * d.im) / dabs2 };
  }
  return x;
}

const GLx = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.18343464249564980,
  0.18343464249564980, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GLw = [0.10122853629037626, 0.22238103445337447, 0.313706645877887, 0.36268378337836198,
  0.36268378337836198, 0.313706645877887, 0.22238103445337447, 0.10122853629037626];

const Gfun = (R: number, k: number): Complex => { const kR = k * R; return { re: Math.cos(kR) / R, im: -Math.sin(kR) / R }; };
/**
 * Кусочно-синусоидальная базисная функция с РАЗНЫМИ плечами: D1 — в сторону −y,
 * D2 — в сторону +y. Равна 1 в узле, 0 на концах плеч. При D1 = D2 — обычная PWS.
 * Несимметричный базис нужен, чтобы точно представить зазор в точке питания:
 * базис питающего узла должен охватывать ровно зазор, а не шаг сетки плеча.
 */
const pws = (t: number, D1: number, D2: number, k: number): number => {
  if (t < 0) { const at = -t; return at > D1 ? 0 : Math.sin(k * (D1 - at)) / Math.sin(k * D1); }
  return t > D2 ? 0 : Math.sin(k * (D2 - t)) / Math.sin(k * D2);
};

/**
 * Поле E_y несимметричного PWS-базиса в замкнутой форме:
 *   E = −jη/(4π) · [ (G(R−) − cos(kD1)·G(R0)) / sin(kD1)  +  (G(R+) − cos(kD2)·G(R0)) / sin(kD2) ]
 * Вывод: (∂²/∂y² + k²)A для синусоидального тока интегрируется по частям дважды;
 * граничные члены вида I·∂G/∂y' в общем узле от двух плеч равны по модулю и
 * противоположны по знаку при ЛЮБЫХ D1, D2 (ток в узле непрерывен и равен 1),
 * поэтому сокращаются. При D1 = D2 = D формула в точности переходит в классическую
 * −jη/(4π·sin kD)·[G(R+) + G(R−) − 2cos(kD)·G(R0)], которой решатель пользовался раньше.
 */
function Efield(
  xf: number, yf: number, xn: number, D1: number, D2: number,
  ycn: number, an: number, same: boolean, k: number,
): Complex {
  const rho = same ? an : Math.abs(xf - xn);
  const R = (yo: number) => Math.sqrt(rho * rho + (yf - (ycn + yo)) * (yf - (ycn + yo)));
  const G0 = Gfun(R(0), k);
  if (D1 === D2) {
    // Классическая симметричная форма (численно тождественна прежней версии).
    const term = csub(cadd(Gfun(R(D2), k), Gfun(R(-D1), k)), cscale(G0, 2 * Math.cos(k * D1)));
    return cmul({ re: 0, im: -ETA / (4 * Math.PI * Math.sin(k * D1)) }, term);
  }
  const lo = cscale(csub(Gfun(R(-D1), k), cscale(G0, Math.cos(k * D1))), 1 / Math.sin(k * D1));
  const hi = cscale(csub(Gfun(R(D2), k), cscale(G0, Math.cos(k * D2))), 1 / Math.sin(k * D2));
  return cmul({ re: 0, im: -ETA / (4 * Math.PI) }, cadd(lo, hi));
}

export interface MomElement {
  x: number;
  lengthM: number;
  radiusM: number;
  /** Число равных сегментов (если узлы nodes не заданы). */
  nseg: number;
  /** Необязательно: явные координаты узлов вдоль элемента (м), от −L/2 до +L/2
   *  включительно, по возрастанию. Позволяет неравномерную сетку — например,
   *  узкие сегменты в зазоре точки питания активного элемента. */
  nodes?: number[];
}
export interface MomResult {
  Zin: Complex;
  gainDbi: number;
  Umax: number;
  lambda: number;
  powerAt: (thetaDeg: number, phiDeg: number) => number;
  /** Self-check NEC2: P_изл(дальнее поле)/P_вх(импеданс). Без потерь в свободном
   *  пространстве обязан быть ≈1.0; отклонение = мера численной ошибки. */
  avgGain: number;
}

export function solveWireAntenna(
  elements: MomElement[],
  freqMHz: number,
  feedIndex: number,
  /** skipPattern — считать только импеданс: пропускается интегрирование по сфере.
   *  Нужно для оценки полосы (пара расчётов на сдвинутых частотах) без потери скорости. */
  opts?: { skipPattern?: boolean },
): MomResult {
  const lambda = C_LIGHT / (freqMHz * 1e6);
  const k = (2 * Math.PI) / lambda;

  const basis: { ei: number; x: number; yc: number; D1: number; D2: number; a: number }[] = [];
  // Самый короткий сегмент каждого элемента — от него зависит частота выборок поля.
  const minSeg: number[] = [];
  for (let ei = 0; ei < elements.length; ei++) {
    const el = elements[ei];
    const h = el.lengthM / 2;
    if (el.nodes && el.nodes.length >= 3) {
      const nd = el.nodes;
      let ms = Infinity;
      for (let i = 1; i < nd.length; i++) ms = Math.min(ms, nd[i] - nd[i - 1]);
      minSeg.push(ms);
      for (let i = 1; i < nd.length - 1; i++) {
        basis.push({ ei, x: el.x, yc: nd[i], D1: nd[i] - nd[i - 1], D2: nd[i + 1] - nd[i], a: el.radiusM });
      }
    } else {
      const Ns = el.nseg, D = (2 * h) / Ns;
      minSeg.push(D);
      for (let node = 1; node < Ns; node++) basis.push({ ei, x: el.x, yc: -h + node * D, D1: D, D2: D, a: el.radiusM });
    }
  }
  const N = basis.length;

  const Z: Complex[][] = Array.from({ length: N }, () => new Array<Complex>(N));
  for (let m = 0; m < N; m++) {
    const bm = basis[m];
    for (let n = 0; n < N; n++) {
      const bn = basis[n], same = bm.ei === bn.ei;
      let acc = cx(0, 0);
      for (let half = 0; half < 2; half++) {
        const a0 = half === 0 ? bm.yc - bm.D1 : bm.yc;
        const a1 = half === 0 ? bm.yc : bm.yc + bm.D2;
        const mid = 0.5 * (a0 + a1), hl = 0.5 * (a1 - a0);
        for (let g = 0; g < GLx.length; g++) {
          const y = mid + hl * GLx[g];
          const fm = pws(y - bm.yc, bm.D1, bm.D2, k);
          acc = cadd(acc, cscale(Efield(bm.x, y, bn.x, bn.D1, bn.D2, bn.yc, bn.a, same, k), GLw[g] * hl * fm));
        }
      }
      Z[m][n] = cscale(acc, -1);
    }
  }

  let feedBasis = -1, bestd = Infinity;
  for (let i = 0; i < N; i++) if (basis[i].ei === feedIndex && Math.abs(basis[i].yc) < bestd) { bestd = Math.abs(basis[i].yc); feedBasis = i; }
  const V = new Array<Complex>(N).fill(cx(0, 0)).map(() => cx(0, 0));
  V[feedBasis] = cx(1, 0);

  const I = csolve(Z, V, N);
  const Ifeed = I[feedBasis], ia2 = cabs2(Ifeed);
  const Zin: Complex = { re: Ifeed.re / ia2, im: -Ifeed.im / ia2 };

  const samples: { y: number; cur: Complex }[][] = [];
  const ds: number[] = [];
  for (let ei = 0; ei < elements.length; ei++) {
    const h = elements[ei].lengthM / 2, arr: { y: number; cur: Complex }[] = [];
    // Для неравномерной сетки — не меньше ~3 точек на самый короткий сегмент (узкий
    // зазор питания иначе «проваливается» между выборками). Равномерная — ровно 61, как раньше.
    const M = elements[ei].nodes
      ? Math.min(2001, Math.max(61, Math.ceil((2 * h) / (minSeg[ei] / 3)) + 1))
      : 61;
    for (let s = 0; s < M; s++) {
      const y = -h + (2 * h * s) / (M - 1);
      let cur = cx(0, 0);
      for (let i = 0; i < N; i++) if (basis[i].ei === ei) cur = cadd(cur, cscale(I[i], pws(y - basis[i].yc, basis[i].D1, basis[i].D2, k)));
      arr.push({ y, cur });
    }
    samples.push(arr);
    ds.push(elements[ei].lengthM / (M - 1));
  }

  const powerAt = (thetaDeg: number, phiDeg: number): number => {
    const th = (thetaDeg * Math.PI) / 180, ph = (phiDeg * Math.PI) / 180;
    const ux = Math.sin(th) * Math.cos(ph), uy = Math.sin(th) * Math.sin(ph);
    let Ny = cx(0, 0);
    for (let ei = 0; ei < elements.length; ei++) {
      const x = elements[ei].x;
      for (const smp of samples[ei]) {
        const phase = k * (x * ux + smp.y * uy);
        Ny = cadd(Ny, cscale(cmul(smp.cur, { re: Math.cos(phase), im: Math.sin(phase) }), ds[ei]));
      }
    }
    const pol = Math.cos(th) ** 2 * Math.sin(ph) ** 2 + Math.cos(ph) ** 2;
    return cabs2(Ny) * pol;
  };

  if (opts?.skipPattern) {
    return { Zin, gainDbi: NaN, Umax: NaN, lambda, powerAt, avgGain: NaN };
  }

  let Prad = 0, Umax = 0;
  const nth = 90, nph = 180;
  for (let i = 0; i <= nth; i++) {
    const th = (180 * i) / nth, st = Math.sin((th * Math.PI) / 180), wth = i === 0 || i === nth ? 0.5 : 1;
    for (let j = 0; j < nph; j++) {
      const U = powerAt(th, (360 * j) / nph);
      if (U > Umax) Umax = U;
      Prad += U * st * wth * (Math.PI / nth) * ((2 * Math.PI) / nph);
    }
  }
  const gainDbi = 10 * Math.log10((4 * Math.PI * Umax) / Prad);
  // Self-check (NEC2 average-gain): U = η·k²/(32π²)·|N⊥|², Pвх = ½·Re(V·conj(I)) при V=1.
  const Prad_W = ((ETA * k * k) / (32 * Math.PI * Math.PI)) * Prad;
  const Pin = 0.5 * Ifeed.re;
  const avgGain = Pin > 0 ? Prad_W / Pin : NaN;
  return { Zin, gainDbi, Umax, lambda, powerAt, avgGain };
}
