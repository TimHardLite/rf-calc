// Обобщённый тонкопроволочный MoM (EFIE, PWS-базис, Галёркин), произвольные 3D-сегменты.
// Z_mn = (jη/4πk) ∫∫ [k²(ĉm·ĉn)fm fn − fm' fn'] exp(-jkR)/R ds ds. Свободное пространство.
// Проверено против NEC2: прямая 180-яги (Ga 11.45 vs 11.59, Z 44.7 vs 44.5) и Moxon
// (Ga 3.56 vs 3.55, Z 187+j259 vs 175+j257) — совпадение в пределах метода.

const ETA = 376.730313;
export const C_LIGHT = 299792458;
export type C = { re: number; im: number };
type V3 = [number, number, number];
const cabs2 = (a: C): number => a.re * a.re + a.im * a.im;

/**
 * Решение комплексной СЛАУ методом Гаусса с выбором ведущего элемента — на плоских
 * типизированных массивах (матрица хранится построчно, re и im раздельно).
 * Математика та же, что в csolve ниже, но без аллокации объекта на каждую операцию:
 * для задач в сотни неизвестных (спирали GNSS) это решающая разница по скорости.
 */
function csolveFlat(
  Are: Float64Array, Aim: Float64Array,
  bre: Float64Array, bim: Float64Array, n: number,
): { re: Float64Array; im: Float64Array } {
  const Mre = Are.slice(), Mim = Aim.slice();
  const xre = bre.slice(), xim = bim.slice();

  for (let col = 0; col < n; col++) {
    let p = col;
    let best = Mre[col * n + col] ** 2 + Mim[col * n + col] ** 2;
    for (let r = col + 1; r < n; r++) {
      const v = Mre[r * n + col] ** 2 + Mim[r * n + col] ** 2;
      if (v > best) { best = v; p = r; }
    }
    if (p !== col) {
      for (let c = col; c < n; c++) {
        const i1 = col * n + c, i2 = p * n + c;
        let t = Mre[i1]; Mre[i1] = Mre[i2]; Mre[i2] = t;
        t = Mim[i1]; Mim[i1] = Mim[i2]; Mim[i2] = t;
      }
      let t = xre[col]; xre[col] = xre[p]; xre[p] = t;
      t = xim[col]; xim[col] = xim[p]; xim[p] = t;
    }
    const dre = Mre[col * n + col], dim = Mim[col * n + col];
    const da = dre * dre + dim * dim;
    for (let r = col + 1; r < n; r++) {
      const nre = Mre[r * n + col], nim = Mim[r * n + col];
      if (nre === 0 && nim === 0) continue;
      const fre = (nre * dre + nim * dim) / da;
      const fim = (nim * dre - nre * dim) / da;
      const rowR = r * n, rowC = col * n;
      for (let c = col; c < n; c++) {
        const mre = Mre[rowC + c], mim = Mim[rowC + c];
        Mre[rowR + c] -= fre * mre - fim * mim;
        Mim[rowR + c] -= fre * mim + fim * mre;
      }
      const bx = xre[col], by = xim[col];
      xre[r] -= fre * bx - fim * by;
      xim[r] -= fre * by + fim * bx;
    }
  }

  for (let r = n - 1; r >= 0; r--) {
    let sre = xre[r], sim = xim[r];
    const row = r * n;
    for (let c = r + 1; c < n; c++) {
      const mre = Mre[row + c], mim = Mim[row + c];
      sre -= mre * xre[c] - mim * xim[c];
      sim -= mre * xim[c] + mim * xre[c];
    }
    const dre = Mre[row + r], dim = Mim[row + r], da = dre * dre + dim * dim;
    xre[r] = (sre * dre + sim * dim) / da;
    xim[r] = (sim * dre - sre * dim) / da;
  }
  return { re: xre, im: xim };
}

/** То же для нескольких правых частей сразу (B — n×m построчно): одно LU-разложение. */
function csolveFlatMany(
  Are: Float64Array, Aim: Float64Array,
  Bre: Float64Array, Bim: Float64Array, n: number, m: number,
): { re: Float64Array; im: Float64Array } {
  const Mre = Are.slice(), Mim = Aim.slice();
  const Xre = Bre.slice(), Xim = Bim.slice();
  for (let col = 0; col < n; col++) {
    let p = col;
    let best = Mre[col * n + col] ** 2 + Mim[col * n + col] ** 2;
    for (let r = col + 1; r < n; r++) {
      const v = Mre[r * n + col] ** 2 + Mim[r * n + col] ** 2;
      if (v > best) { best = v; p = r; }
    }
    if (p !== col) {
      for (let c = col; c < n; c++) {
        const i1 = col * n + c, i2 = p * n + c;
        let t = Mre[i1]; Mre[i1] = Mre[i2]; Mre[i2] = t;
        t = Mim[i1]; Mim[i1] = Mim[i2]; Mim[i2] = t;
      }
      for (let c = 0; c < m; c++) {
        const i1 = col * m + c, i2 = p * m + c;
        let t = Xre[i1]; Xre[i1] = Xre[i2]; Xre[i2] = t;
        t = Xim[i1]; Xim[i1] = Xim[i2]; Xim[i2] = t;
      }
    }
    const dre = Mre[col * n + col], dim = Mim[col * n + col];
    const da = dre * dre + dim * dim;
    for (let r = col + 1; r < n; r++) {
      const nre = Mre[r * n + col], nim = Mim[r * n + col];
      if (nre === 0 && nim === 0) continue;
      const fre = (nre * dre + nim * dim) / da;
      const fim = (nim * dre - nre * dim) / da;
      const rowR = r * n, rowC = col * n;
      for (let c = col; c < n; c++) {
        const mre = Mre[rowC + c], mim = Mim[rowC + c];
        Mre[rowR + c] -= fre * mre - fim * mim;
        Mim[rowR + c] -= fre * mim + fim * mre;
      }
      for (let c = 0; c < m; c++) {
        const bx = Xre[col * m + c], by = Xim[col * m + c];
        Xre[r * m + c] -= fre * bx - fim * by;
        Xim[r * m + c] -= fre * by + fim * bx;
      }
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    const row = r * n;
    const dre = Mre[row + r], dim = Mim[row + r], da = dre * dre + dim * dim;
    for (let c = 0; c < m; c++) {
      let sre = Xre[r * m + c], sim = Xim[r * m + c];
      for (let cc = r + 1; cc < n; cc++) {
        const mre = Mre[row + cc], mim = Mim[row + cc];
        sre -= mre * Xre[cc * m + c] - mim * Xim[cc * m + c];
        sim -= mre * Xim[cc * m + c] + mim * Xre[cc * m + c];
      }
      Xre[r * m + c] = (sre * dre + sim * dim) / da;
      Xim[r * m + c] = (sim * dre - sre * dim) / da;
    }
  }
  return { re: Xre, im: Xim };
}

const GLx = [-0.9324695142031521, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969, 0.6612093864662645, 0.9324695142031521];
/** Критерий «близких» плеч при соединениях: расстояние между их серединами < NEAR_K·max(длин). */
const NEAR_K = 2.0;
/** Далёкие плечи (для 2-точечной квадратуры): расстояние между серединами > FAR_K·max(длин). */
const FAR_K = 6.0;
const GLw = [0.1713244923791704, 0.3607615730481386, 0.4679139345726910, 0.4679139345726910, 0.3607615730481386, 0.1713244923791704];

interface SQ {
  x: Float64Array; y: Float64Array; z: Float64Array; u: Float64Array;
  f0: Float64Array; f1: Float64Array; g0: Float64Array; g1: Float64Array; w: Float64Array;
}

/**
 * Статическая часть точного ядра трубки радиуса a на расстоянии d вдоль оси:
 *   S(d) = (1/2π)∫₀^{2π} dφ / √(d² + 4a²·sin²(φ/2)) = 2K(m)/(π√(d²+4a²)),  m = 4a²/(d²+4a²),
 * через среднее арифметико-геометрическое: S(d) = 1 / AGM(√(d²+4a²), d).
 * При d ≫ a → 1/d; при d → 0 → ln(8a/d)/(πa) (логарифмическая особенность).
 */
export function staticRing(d: number, a: number): number {
  let x = Math.sqrt(d * d + 4 * a * a), y = d;
  if (y <= 0) return Infinity;
  for (let it = 0; it < 40 && Math.abs(x - y) > 1e-15 * x; it++) {
    const nx = 0.5 * (x + y); y = Math.sqrt(x * y); x = nx;
  }
  return 1 / x;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): number => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 => { const n = norm(a); return n < 1e-15 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n]; };

export interface Wire {
  pts: V3[];
  radius: number;
  /** Длина сегмента по умолчанию, м. */
  seglen: number;
  /** Необязательно: своя длина сегмента для каждого звена ломаной (pts.length−1 штук).
   *  Позволяет сгущать сетку только там, где это нужно (напр. загибы Moxon),
   *  не раздувая размер матрицы на длинных прямых участках.
   *  Базис PWS корректно работает при неравномерных сегментах: длины плеч
   *  вычисляются по фактическим узлам. */
  seglens?: number[];
  /** Погонное сопротивление потерь проводника R′, Ом/м (скин-эффект), 0 — идеальный
   *  проводник. Считается снаружи: R′ = Rs / периметр, Rs = √(π·f·μ0·μr·ρ). */
  lossPerM?: number;
}
export interface Solve3DResult {
  Zin: C;
  gainDbi: number;
  Umax: number;
  lambda: number;
  powerAt: (thetaDeg: number, phiDeg: number) => number;
  /** Self-check NEC2: средний КНД по полной сфере = P_изл(дальнее поле)/P_вх(импеданс).
   *  Для антенны без потерь в свободном пространстве обязан быть ≈1.0.
   *  Отклонение — мера численной ошибки (сегментация, согласованность Z и дальнего поля). */
  avgGain: number;
  /** Комплексные поперечные компоненты вектора излучения N в направлении (θ, φ):
   *  Nθ = N·θ̂, Nφ = N·φ̂. Дальнее поле E = C·N·e^{−jkr}/r, C = −jωμ/(4π) — общий множитель
   *  опущен. При экране (groundPlane) включает вклад зеркальных изображений. */
  farFieldAt: (thetaDeg: number, phiDeg: number) => { th: C; ph: C };
  /** Полное (ближнее) электрическое поле токов в точке (x, y, z), м, в тех же единицах
   *  (без множителя C): точное поле элементарных диполей со всеми членами 1/R, 1/R², 1/R³.
   *  При экране — вместе с изображениями. Нужно для дифракции на кромке конечного экрана,
   *  которая лежит в ближней зоне антенны. */
  nearFieldAt: (x: number, y: number, z: number) => { x: C; y: C; z: C };
  /** КПД по омическим потерям в проводниках = 1 − P_потерь/P_вх (1 — идеальный проводник). */
  efficiency: number;
}

interface Half { posDir: V3; curDir: V3; len: number; sg: number; rad: number;
  /** Номер сегмента, на котором лежит плечо, и с какого его конца (0 — p0, 1 — p1) растёт базис. */
  seg: number; end: 0 | 1 }
interface Basis { wi: number; center: V3; plus: Half; minus: Half; radius: number; arc: number;
  /** Номер узла соединения (для базисов соединений), иначе −1. */ junction: number }

export function solve3D(
  wires: Wire[],
  freqMHz: number,
  feed: { point?: V3; points?: V3[] },
  /** skipPattern — считать только импеданс (для поиска резонанса): в разы быстрее,
   *  так как пропускается интегрирование дальнего поля по сфере. */
  opts?: {
    skipPattern?: boolean;
    /** Идеально проводящая бесконечная земля в плоскости z = 0 (метод зеркальных изображений).
     *  Вся геометрия обязана лежать при z > 0. Интегрирование поля — по ВЕРХНЕЙ полусфере. */
    groundPlane?: boolean;
    /** Ядро для близких пар сегментов: "exact" (по умолчанию) — точное ядро трубки
     *  (как в MININEC-3), годно и для толстых проводников; "reduced" — приведённое
     *  ядро тонкого провода (как в NEC-2 без EK), оставлено для сравнения. */
    kernel?: "exact" | "reduced";
    /** Внешняя цепь, подключённая к портам (напр. перекрёстный фидер ЛПА): получает
     *  матрицу проводимостей портов антенны Y (I = Y·V) и возвращает напряжения портов V
     *  и входное сопротивление всей системы. Порты — точки feed.points по порядку. */
    network?: (Y: C[][]) => { V: C[]; Zin: C };
  },
): Solve3DResult {
  const ground = opts?.groundPlane === true;
  const kernelExact = opts?.kernel !== "reduced";
  const lambda = C_LIGHT / (freqMHz * 1e6), k = (2 * Math.PI) / lambda;
  const wireNodes: { nodes: { p: V3; arc: number }[]; radius: number; lossPerM: number }[] = [];
  for (const w of wires) {
    const nodes: { p: V3; arc: number }[] = []; let arc = 0;
    nodes.push({ p: w.pts[0], arc: 0 });
    for (let i = 0; i < w.pts.length - 1; i++) {
      const a = w.pts[i], b = w.pts[i + 1], L = norm(sub(b, a));
      const sl = w.seglens?.[i] ?? w.seglen;
      const ns = Math.max(1, Math.round(L / sl));
      const dir = unit(sub(b, a));
      for (let s = 1; s <= ns; s++) { arc += L / ns; nodes.push({ p: add(a, mul(dir, (L * s) / ns)), arc }); }
    }
    wireNodes.push({ nodes, radius: w.radius, lossPerM: w.lossPerM ?? 0 });
  }
  // Список сегментов: segStart[wi] — номер первого сегмента провода wi.
  const segStart: number[] = [];
  const segP0: V3[] = [], segP1: V3[] = [], segRad: number[] = [], segLoss: number[] = [];
  for (const wn of wireNodes) {
    segStart.push(segP0.length);
    for (let i = 0; i < wn.nodes.length - 1; i++) {
      segP0.push(wn.nodes[i].p); segP1.push(wn.nodes[i + 1].p); segRad.push(wn.radius);
      segLoss.push(wn.lossPerM);
    }
  }
  const basis: Basis[] = [];
  for (let wi = 0; wi < wireNodes.length; wi++) {
    const nd = wireNodes[wi].nodes;
    const rw = wireNodes[wi].radius;
    for (let ni = 1; ni < nd.length - 1; ni++) {
      const c = nd[ni].p, pPrev = nd[ni - 1].p, pNext = nd[ni + 1].p;
      const dPlus = unit(sub(pNext, c)), dMinus = unit(sub(pPrev, c));
      const lPlus = norm(sub(pNext, c)), lMinus = norm(sub(pPrev, c));
      basis.push({
        wi, center: c,
        plus: { posDir: dPlus, curDir: dPlus, len: lPlus, sg: 1, rad: rw, seg: segStart[wi] + ni, end: 0 },
        minus: { posDir: dMinus, curDir: mul(dMinus, -1), len: lMinus, sg: -1, rad: rw, seg: segStart[wi] + ni - 1, end: 1 },
        radius: rw, arc: nd[ni].arc, junction: -1,
      });
    }
  }

  // --- Соединения проводов (узлы, где сходятся концы нескольких проводов) ---------
  // Нужны для сетчатых экранов и для подключения питающего штыря к экрану.
  // В узле, где сходятся M концов, ставится M−1 базисных функций: каждая переводит
  // ток из «опорного» конца в один из остальных. Этого ровно достаточно, чтобы
  // выполнялся закон Кирхгофа (сумма токов в узле = 0) и при этом каждый ток
  // в узле был свободен (так же поступает NEC2). Свободный конец провода (M = 1)
  // базиса не получает — ток на нём равен нулю, как и раньше.
  // Если соединений нет, этот блок ничего не добавляет, и все прежние антенны
  // считаются бит-в-бит как до его появления.
  const JTOL = 1e-6; // м — допуск совпадения концов
  const ends: { p: V3; adj: V3; rad: number; seg: number; end: 0 | 1 }[] = [];
  for (let wi = 0; wi < wireNodes.length; wi++) {
    const wn = wireNodes[wi], nd = wn.nodes;
    if (nd.length < 2) continue;
    ends.push({ p: nd[0].p, adj: nd[1].p, rad: wn.radius, seg: segStart[wi], end: 0 });
    ends.push({ p: nd[nd.length - 1].p, adj: nd[nd.length - 2].p, rad: wn.radius, seg: segStart[wi] + nd.length - 2, end: 1 });
  }
  const used = new Uint8Array(ends.length);
  let hasJunctions = false;
  let jCount = 0;
  for (let i = 0; i < ends.length; i++) {
    if (used[i]) continue;
    const grp = [i];
    for (let j = i + 1; j < ends.length; j++) {
      if (!used[j] && norm(sub(ends[i].p, ends[j].p)) < JTOL) { grp.push(j); used[j] = 1; }
    }
    used[i] = 1;
    if (grp.length < 2) continue;
    hasJunctions = true;
    const jId = jCount++;
    const ref = ends[grp[0]], P = ref.p;
    const dRef = unit(sub(ref.adj, P)), lRef = norm(sub(ref.adj, P));
    for (let g = 1; g < grp.length; g++) {
      const e = ends[grp[g]];
      const dE = unit(sub(e.adj, P)), lE = norm(sub(e.adj, P));
      basis.push({
        wi: -1 - basis.length, center: P,
        plus: { posDir: dE, curDir: dE, len: lE, sg: 1, rad: e.rad, seg: e.seg, end: e.end },
        minus: { posDir: dRef, curDir: mul(dRef, -1), len: lRef, sg: -1, rad: ref.rad, seg: ref.seg, end: ref.end },
        radius: Math.max(e.rad, ref.rad), arc: 0, junction: jId,
      });
    }
  }
  const N = basis.length;
  const half = (b: Basis, w: "p" | "m"): Half => (w === "p" ? b.plus : b.minus);

  const PREFACTOR = ETA / (4 * Math.PI * k); // множитель j·η/(4πk)

  // Метод зеркальных изображений для идеальной земли при z = 0: ток J = (Jx, Jy, Jz)
  // при z > 0 имеет изображение (−Jx, −Jy, +Jz) при −z, заряд изображения −q.
  const mirrorPos = (v: V3): V3 => [v[0], v[1], -v[2]];

  // --- Заполнение матрицы ПО ПАРАМ СЕГМЕНТОВ (задачи с соединениями) ------------
  // Любое плечо базиса лежит на одном сегменте и растёт от одного из его концов.
  // На сегменте длины D с параметром u от p0 функция плеча от конца 0:
  //   f0(u) = sin k(D−u)/sin kD,  df/dt = −k·cos k(D−u)/sin kD   (t = u),
  // от конца 1: f1(u) = sin ku/sin kD,  df/dt = −k·cos ku/sin kD   (t = D−u).
  // Направление тока плеча: ĉ = s·σ·d̂, где s = +1 для плюс-плеча и −1 для минус-плеча,
  // σ = +1 для конца 0 и −1 для конца 1, d̂ — направление сегмента p0→p1.
  // Тогда вклад пары плеч в Z:  k²·(s σ)_m (s σ)_n (d̂_S·d̂_T)·A[e_m][e_n] − s_m s_n·B[e_m][e_n],
  //   A[e1][e2] = ∫∫ f_e1 f_e2 G,   B[e1][e2] = ∫∫ f'_e1 f'_e2 G,   G = e^{−jkR}/R.
  // A и B зависят только от пары СЕГМЕНТОВ, поэтому для каждой пары сегментов ядро G
  // считается один раз и сразу даёт все 8 интегралов — а плеч на сегменте бывает
  // до четырёх (в узлах сетки). Это в разы быстрее перебора пар базисов.
  // Квадратура адаптивная по расстоянию между серединами сегментов: близкие —
  // 4 подынтервала × 6 точек Гаусса, средние — 6 точек, далёкие (> FAR_K·длины) — 2 точки.
  // Изображение в идеальной земле: зеркальная геометрия сегмента T и общий множитель −1
  // (ĉ' = −mirror(ĉ) даёт −1 токовому члену, заряд изображения −q — зарядовому).
  function fillBySegments(Zre: Float64Array, Zim: Float64Array): {
    lossSeg: number[]; qLoss: SQ[]; onSeg: { b: number; s: number; e: 0 | 1 }[][];
  } {
    const NS = segP0.length;
    // Какие плечи (базис, s) лежат на каждом сегменте и с какого конца.
    const onSeg: { b: number; s: number; e: 0 | 1 }[][] = Array.from({ length: NS }, () => []);
    for (let b = 0; b < N; b++) {
      onSeg[basis[b].plus.seg].push({ b, s: 1, e: basis[b].plus.end });
      onSeg[basis[b].minus.seg].push({ b, s: -1, e: basis[b].minus.end });
    }
    const GL2x = [-0.5773502691896258, 0.5773502691896258], GL2w = [1, 1];
    const segLen: number[] = [], segDir: V3[] = [], segMid: V3[] = [];
    const mkQ = (si: number, nSub: number, gx: number[], gw: number[]): SQ => {
      const p0 = segP0[si], D = segLen[si], d = segDir[si], cnt = nSub * gx.length;
      const q: SQ = {
        x: new Float64Array(cnt), y: new Float64Array(cnt), z: new Float64Array(cnt), u: new Float64Array(cnt),
        f0: new Float64Array(cnt), f1: new Float64Array(cnt),
        g0: new Float64Array(cnt), g1: new Float64Array(cnt), w: new Float64Array(cnt),
      };
      const skD = Math.sin(k * D);
      let c = 0;
      for (let p = 0; p < nSub; p++) {
        const cm = (D * (p + 0.5)) / nSub, hl = D / (2 * nSub);
        for (let i = 0; i < gx.length; i++) {
          const u = cm + hl * gx[i];
          q.u[c] = u;
          q.x[c] = p0[0] + d[0] * u; q.y[c] = p0[1] + d[1] * u; q.z[c] = p0[2] + d[2] * u;
          q.f0[c] = Math.sin(k * (D - u)) / skD; q.f1[c] = Math.sin(k * u) / skD;
          q.g0[c] = (-k * Math.cos(k * (D - u))) / skD; q.g1[c] = (-k * Math.cos(k * u)) / skD;
          q.w[c] = gw[i] * hl;
          c++;
        }
      }
      return q;
    };
    for (let si = 0; si < NS; si++) {
      segLen.push(norm(sub(segP1[si], segP0[si])));
      segDir.push(unit(sub(segP1[si], segP0[si])));
      segMid.push(mul(add(segP0[si], segP1[si]), 0.5));
    }
    // QN — близкие пары (4×6 точек), QI — внутренний интеграл собственной пары
    // сегмента (8×6: узлы не совпадают с QN, логарифм берётся аналитически),
    // QM — средние (6), QF — далёкие (2 точки).
    const QN: SQ[] = [], QM: SQ[] = [], QF: SQ[] = [], QI: SQ[] = [];
    for (let si = 0; si < NS; si++) {
      QN.push(mkQ(si, 4, GLx, GLw)); QM.push(mkQ(si, 1, GLx, GLw)); QF.push(mkQ(si, 1, GL2x, GL2w));
      QI.push(mkQ(si, 8, GLx, GLw));
    }
    const A = new Float64Array(8), B = new Float64Array(8); // [e1*2+e2]*2 + (re|im)
    const nSrc = ground ? 2 : 1;
    for (let S = 0; S < NS; S++) {
      const hs = onSeg[S];
      if (!hs.length) continue;
      for (let T = S; T < NS; T++) {
        const ht = onSeg[T];
        if (!ht.length) continue;
        for (let src = 0; src < nSrc; src++) {
          const img = src === 1;
          const zs = img ? -1 : 1;
          const mS = segMid[S], mT = segMid[T];
          const dmx = mS[0] - mT[0], dmy = mS[1] - mT[1], dmz = mS[2] - zs * mT[2];
          const dMid = Math.sqrt(dmx * dmx + dmy * dmy + dmz * dmz);
          const Lmax = Math.max(segLen[S], segLen[T]);
          const near = dMid < NEAR_K * Lmax;
          const self = !img && S === T;
          let qs: SQ, qt: SQ;
          if (self) { qs = QN[S]; qt = QI[T]; }
          else if (near) { qs = QN[S]; qt = QN[T]; }
          else if (dMid > FAR_K * Lmax) { qs = QF[S]; qt = QF[T]; }
          else { qs = QM[S]; qt = QM[T]; }
          const a = Math.max(segRad[S], segRad[T]), a2 = a * a;
          // ТОЧНОЕ ЯДРО ТРУБКИ для близких пар (как в MININEC-3): ток — по поверхности
          // трубки радиуса a, наблюдение — на поверхности. Статическая часть кольцевого
          // интеграла берётся точно (эллиптический интеграл через AGM), динамическая —
          // по приведённому ядру:  G = e^{−jkR}/R + [S(d) − 1/R],  R = √(d² + a²).
          // Для собственной пары сегмента логарифмическая особенность S(d) ~ −ln d/(πa)
          // вычитается и интегрируется аналитически.
          const exact = kernelExact && near && !img;
          A.fill(0); B.fill(0);
          for (let i = 0; i < qs.x.length; i++) {
            const xm = qs.x[i], ym = qs.y[i], zm = qs.z[i], wm = qs.w[i];
            const f0m = qs.f0[i], f1m = qs.f1[i], g0m = qs.g0[i], g1m = qs.g1[i];
            for (let j = 0; j < qt.x.length; j++) {
              const dx = xm - qt.x[j], dy = ym - qt.y[j], dz = zm - zs * qt.z[j];
              const d2 = dx * dx + dy * dy + dz * dz;
              const R = Math.sqrt(d2 + a2);
              const kR = k * R, ww = wm * qt.w[j];
              let gr = (Math.cos(kR) / R) * ww, gi = (-Math.sin(kR) / R) * ww;
              if (exact) {
                const d = Math.sqrt(d2);
                let corr = staticRing(d, a) - 1 / R;
                // собственная пара: вычитаем −ln d/(πa); он проинтегрирован ниже аналитически
                if (self) corr += Math.log(Math.max(d, 1e-12 * segLen[S])) / (Math.PI * a);
                gr += corr * ww;
              }
              const f0n = qt.f0[j], f1n = qt.f1[j], g0n = qt.g0[j], g1n = qt.g1[j];
              let p;
              p = f0m * f0n; A[0] += p * gr; A[1] += p * gi;
              p = f0m * f1n; A[2] += p * gr; A[3] += p * gi;
              p = f1m * f0n; A[4] += p * gr; A[5] += p * gi;
              p = f1m * f1n; A[6] += p * gr; A[7] += p * gi;
              p = g0m * g0n; B[0] += p * gr; B[1] += p * gi;
              p = g0m * g1n; B[2] += p * gr; B[3] += p * gi;
              p = g1m * g0n; B[4] += p * gr; B[5] += p * gi;
              p = g1m * g1n; B[6] += p * gr; B[7] += p * gi;
            }
          }
          if (exact && self) {
            // ∫∫ q_m(t) q_n(s) · (−ln|t−s|/(πa)) ds dt, внутренний интеграл:
            //   ∫ q(s) ln|t−s| ds = q(t)·Λ(t) + ∫ (q(s) − q(t)) ln|t−s| ds,
            //   Λ(t) = ∫₀ᴰ ln|t−s| ds = t·ln t + (D−t)·ln(D−t) − D.
            const D = segLen[S], skD = Math.sin(k * D), inv = -1 / (Math.PI * a);
            for (let i = 0; i < qs.x.length; i++) {
              const t = qs.u[i], wm = qs.w[i];
              const lam = (t > 0 ? t * Math.log(t) : 0) + (D - t > 0 ? (D - t) * Math.log(D - t) : 0) - D;
              const qt0 = Math.sin(k * (D - t)) / skD, qt1 = Math.sin(k * t) / skD;
              const pt0 = (-k * Math.cos(k * (D - t))) / skD, pt1 = (-k * Math.cos(k * t)) / skD;
              let I0 = qt0 * lam, I1 = qt1 * lam, J0 = pt0 * lam, J1 = pt1 * lam;
              for (let j = 0; j < qt.x.length; j++) {
                const L = Math.log(Math.max(Math.abs(t - qt.u[j]), 1e-12 * D)) * qt.w[j];
                I0 += (qt.f0[j] - qt0) * L; I1 += (qt.f1[j] - qt1) * L;
                J0 += (qt.g0[j] - pt0) * L; J1 += (qt.g1[j] - pt1) * L;
              }
              I0 *= inv * wm; I1 *= inv * wm; J0 *= inv * wm; J1 *= inv * wm;
              const f0m = qs.f0[i], f1m = qs.f1[i], g0m = qs.g0[i], g1m = qs.g1[i];
              A[0] += f0m * I0; A[2] += f0m * I1; A[4] += f1m * I0; A[6] += f1m * I1;
              B[0] += g0m * J0; B[2] += g0m * J1; B[4] += g1m * J0; B[6] += g1m * J1;
            }
          }
          const dS = segDir[S], dT0 = segDir[T];
          const dT: V3 = img ? [dT0[0], dT0[1], -dT0[2]] : dT0;
          const dd = k * k * dot(dS, dT);
          const imgSign = img ? -1 : 1;
          for (const hm of hs) {
            const sm = hm.s, sgm = hm.e === 0 ? 1 : -1;
            for (const hn of ht) {
              const sn = hn.s, sgn = hn.e === 0 ? 1 : -1;
              const idx = (hm.e * 2 + hn.e) * 2;
              const cv = dd * sm * sgm * sn * sgn, cs = sm * sn;
              const accRe = imgSign * (cv * A[idx] - cs * B[idx]);
              const accIm = imgSign * (cv * A[idx + 1] - cs * B[idx + 1]);
              // j·PREFACTOR·acc
              const zr = -PREFACTOR * accIm, zi = PREFACTOR * accRe;
              const m = hm.b, n = hn.b;
              Zre[m * N + n] += zr; Zim[m * N + n] += zi;
              if (S !== T) { Zre[n * N + m] += zr; Zim[n * N + m] += zi; }
            }
          }
        }
      }
    }

    // --- Омические потери в проводнике (скин-эффект) ------------------------------
    // Поверхностный импеданс проводника Zs ≈ Rs(1+j) (толщина металла ≫ глубины
    // скин-слоя), погонное R′ = Rs/(периметр). В методе моментов это нагрузка,
    // распределённая по сегменту: Z_mn += ∫ R′·(ĉm·ĉn)·f_m·f_n dl (для плеч на одном
    // сегменте); реактивная часть внутренней индуктивности ωL′ = R′ тоже учитывается.
    const lossSeg: number[] = new Array(NS).fill(0);
    for (let S = 0; S < NS; S++) lossSeg[S] = segLoss[S];
    for (let S = 0; S < NS; S++) {
      const Rp = lossSeg[S];
      if (!(Rp > 0)) continue;
      const q = QN[S], hs = onSeg[S];
      let i00 = 0, i01 = 0, i11 = 0;
      for (let i = 0; i < q.x.length; i++) {
        i00 += q.f0[i] * q.f0[i] * q.w[i];
        i01 += q.f0[i] * q.f1[i] * q.w[i];
        i11 += q.f1[i] * q.f1[i] * q.w[i];
      }
      const II = [[i00, i01], [i01, i11]];
      for (const hm of hs) {
        const sgm = hm.s * (hm.e === 0 ? 1 : -1);
        for (const hn of hs) {
          const sgn = hn.s * (hn.e === 0 ? 1 : -1);
          const v = Rp * sgm * sgn * II[hm.e][hn.e];
          Zre[hm.b * N + hn.b] += v;
          // Хороший проводник: Zs = Rs·(1 + j) — внутренняя индуктивность ωL′ = R′.
          Zim[hm.b * N + hn.b] += v;
        }
      }
    }
    return { lossSeg, qLoss: QN, onSeg };
  }

  const Zre = new Float64Array(N * N), Zim = new Float64Array(N * N);
  const lossInfo = fillBySegments(Zre, Zim);

  const feedPts: V3[] = feed.points ?? [feed.point!];
  // Каждый порт — набор возбуждаемых базисов. Обычный порт — один базис (ближайший
  // к точке питания). Порт в УЗЛЕ СОЕДИНЕНИЯ (точка питания совпадает с узлом) —
  // дельта-зазор на конце «опорного» провода этого узла, то есть провода, который
  // перечислен ПЕРВЫМ среди сходящихся в узле. Зазор пересекают все M−1 базисов узла
  // (у каждого опорный конец — минус-плечо, f = 1 в узле), поэтому V = 1 подаётся на
  // все, а ток порта — их сумма. Так питается, например, штырь, стоящий на сетчатом
  // экране: генератор включён между штырём и экраном.
  const ports: number[][] = [];
  const Vre = new Float64Array(N), Vim = new Float64Array(N);
  for (const fp of feedPts) {
    let fb = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = norm(sub(basis[i].center, fp)); if (d < bd) { bd = d; fb = i; } }
    let port = [fb];
    if (basis[fb].junction >= 0 && bd < JTOL) {
      const j = basis[fb].junction;
      port = [];
      for (let i = 0; i < N; i++) if (basis[i].junction === j) port.push(i);
    }
    for (const b of port) Vre[b] = 1;
    ports.push(port);
  }
  // Напряжения портов: по умолчанию 1 В на каждом (синфазное питание). В режиме
  // «сети» (opts.network, напр. фидер ЛПА) сначала находится матрица проводимостей
  // портов Y (по одному решению на порт), а напряжения портов задаёт внешняя цепь.
  const P = ports.length;
  let I: C[];
  let portV: C[] = ports.map(() => ({ re: 1, im: 0 }));
  let netZin: C | null = null;
  if (opts?.network) {
    const Bre = new Float64Array(N * P), Bim = new Float64Array(N * P);
    ports.forEach((port, j) => { for (const b of port) Bre[b * P + j] = 1; });
    const X = csolveFlatMany(Zre, Zim, Bre, Bim, N, P);
    const Y: C[][] = ports.map((port) => ports.map((_, j) => {
      let re = 0, im = 0;
      for (const b of port) { re += X.re[b * P + j]; im += X.im[b * P + j]; }
      return { re, im };
    }));
    const net = opts.network(Y);
    portV = net.V; netZin = net.Zin;
    I = new Array<C>(N);
    for (let i = 0; i < N; i++) {
      let re = 0, im = 0;
      for (let j = 0; j < P; j++) {
        const xr = X.re[i * P + j], xi = X.im[i * P + j], v = portV[j];
        re += xr * v.re - xi * v.im; im += xr * v.im + xi * v.re;
      }
      I[i] = { re, im };
    }
  } else {
    const sol = csolveFlat(Zre, Zim, Vre, Vim, N);
    I = new Array<C>(N);
    for (let i = 0; i < N; i++) I[i] = { re: sol.re[i], im: sol.im[i] };
  }
  // Мощность, подведённая к портам антенны: ½·Σ Re(V·I*).
  const portPower = (): number => {
    let p = 0;
    ports.forEach((port, j) => {
      let re = 0, im = 0;
      for (const b of port) { re += I[b].re; im += I[b].im; }
      const v = portV[j];
      p += 0.5 * (v.re * re + v.im * im);
    });
    return p;
  };
  // Мощность омических потерь: P = ½·Σ R′·∫|I(u)|² du по сегментам с потерями.
  let Ploss = 0;
  for (let S = 0; S < lossInfo.lossSeg.length; S++) {
    const Rp = lossInfo.lossSeg[S];
    if (!(Rp > 0)) continue;
    const q = lossInfo.qLoss[S];
    for (let i = 0; i < q.x.length; i++) {
      let cr = 0, ci = 0;
      for (const h of lossInfo.onSeg[S]) {
        const sg = h.s * (h.e === 0 ? 1 : -1) * (h.e === 0 ? q.f0[i] : q.f1[i]);
        cr += I[h.b].re * sg; ci += I[h.b].im * sg;
      }
      Ploss += 0.5 * Rp * (cr * cr + ci * ci) * q.w[i];
    }
  }
  const Pin = portPower();
  const effOf = (): number => (Pin > 0 ? Math.max(0, 1 - Ploss / Pin) : NaN);
  // Zin по первому порту (при синфазном питании порты идентичны — берём входное первого).
  // В режиме сети входное сопротивление даёт сама сеть.
  let Zin: C;
  if (netZin) Zin = netZin;
  else {
    let Ifr = 0, Ifi = 0;
    for (const b of ports[0]) { Ifr += I[b].re; Ifi += I[b].im; }
    const If: C = { re: Ifr, im: Ifi }, ia = cabs2(If);
    Zin = { re: If.re / ia, im: -If.im / ia };
  }

  // --- Выборки тока по узлам квадратуры (только для БЛИЖНЕГО поля) --------------
  // Дальнее поле с v2 считается по замкнутой формуле (см. ниже), поэтому эти массивы
  // нужны лишь ближнему полю и строятся лениво — на обычном расчёте они не создаются.
  // При идеальной земле в выборки добавляются зеркальные источники: поле в верхней
  // полусфере = поле реальных токов + поле изображений.
  let nS = 0;
  let sx!: Float64Array, sy!: Float64Array, sz!: Float64Array;
  let axr!: Float64Array, axi!: Float64Array, ayr!: Float64Array, ayi!: Float64Array, azr!: Float64Array, azi!: Float64Array;
  let samplesReady = false;
  /** Выборки тока по узлам квадратуры — нужны ТОЛЬКО ближнему полю, поэтому строятся
   *  лениво: дальнее поле считается по замкнутой формуле (ниже) и в них не нуждается. */
  const buildSamples = (): void => {
    if (samplesReady) return;
    samplesReady = true;
      nS = N * 2 * GLx.length * (ground ? 2 : 1);
      sx = new Float64Array(nS); sy = new Float64Array(nS); sz = new Float64Array(nS);
      axr = new Float64Array(nS); axi = new Float64Array(nS);
      ayr = new Float64Array(nS); ayi = new Float64Array(nS);
      azr = new Float64Array(nS); azi = new Float64Array(nS);
    {
      let s = 0;
      const nSrc = ground ? 2 : 1;
      for (let src = 0; src < nSrc; src++) {
        const img = src === 1;
        for (let b = 0; b < N; b++) for (const h of ["p", "m"] as const) {
          const H = half(basis[b], h), D = H.len;
          const sinkD = Math.sin(k * D);
          const Ib = I[b];
          // Изображение: положение зеркалится по z, вектор тока умножается на (−1,−1,+1).
          const dx = img ? -H.curDir[0] : H.curDir[0];
          const dy = img ? -H.curDir[1] : H.curDir[1];
          const dz = H.curDir[2];
          const c0 = img ? mirrorPos(basis[b].center) : basis[b].center;
          const pd = img ? mirrorPos(H.posDir) : H.posDir;
          for (let i = 0; i < GLx.length; i++) {
            const t = D * 0.5 * (GLx[i] + 1), w = GLw[i] * D * 0.5;
            const r = add(c0, mul(pd, t));
            const amp = (Math.sin(k * (D - t)) / sinkD) * w;
            sx[s] = r[0]; sy[s] = r[1]; sz[s] = r[2];
            axr[s] = Ib.re * amp * dx; axi[s] = Ib.im * amp * dx;
            ayr[s] = Ib.re * amp * dy; ayi[s] = Ib.im * amp * dy;
            azr[s] = Ib.re * amp * dz; azi[s] = Ib.im * amp * dz;
            s++;
          }
        }
      }
    }
    // При соединениях (сетчатый экран) одно и то же плечо-отрезок входит в несколько
    // базисов узла, а два плеча с разных концов одного ребра дают совпадающие точки
    // Гаусса (узлы симметричны). Складываем амплитуды в совпадающих точках — поле то же,
    // а точек втрое меньше, и интегрирование по сфере идёт втрое быстрее.
    if (hasJunctions) {
      const key = (i: number) =>
        `${Math.round(sx[i] * 1e8)},${Math.round(sy[i] * 1e8)},${Math.round(sz[i] * 1e8)}`;
      const idx = new Map<string, number>();
      const mx: number[] = [], my: number[] = [], mz: number[] = [];
      const mxr: number[] = [], mxi: number[] = [], myr: number[] = [], myi: number[] = [], mzr: number[] = [], mzi: number[] = [];
      for (let i = 0; i < nS; i++) {
        const kk = key(i);
        let j = idx.get(kk);
        if (j === undefined) {
          j = mx.length; idx.set(kk, j);
          mx.push(sx[i]); my.push(sy[i]); mz.push(sz[i]);
          mxr.push(0); mxi.push(0); myr.push(0); myi.push(0); mzr.push(0); mzi.push(0);
        }
        mxr[j] += axr[i]; mxi[j] += axi[i]; myr[j] += ayr[i]; myi[j] += ayi[i]; mzr[j] += azr[i]; mzi[j] += azi[i];
      }
      nS = mx.length;
      sx = Float64Array.from(mx); sy = Float64Array.from(my); sz = Float64Array.from(mz);
      axr = Float64Array.from(mxr); axi = Float64Array.from(mxi);
      ayr = Float64Array.from(myr); ayi = Float64Array.from(myi);
      azr = Float64Array.from(mzr); azi = Float64Array.from(mzi);
    }
  };

  // --- Дальнее поле: ЗАМКНУТАЯ ФОРМУЛА для плеча (как в NEC-2 и MININEC-3) ------
  // Для кусочно-синусоидального плеча длиной D интеграл по его длине берётся точно:
  //   ∫₀^D [sin k(D−t)/sin kD]·e^{jkβt} dt = [k·e^{jaD} − k·cos kD − j·a·sin kD] / [(k²−a²)·sin kD],
  //   где a = kβ, β = û·p̂ — проекция направления наблюдения на ось плеча.
  // При |β| → 1 (наблюдение вдоль плеча) берётся предел по правилу Лопиталя.
  // Было: та же величина считалась квадратурой Гаусса по 6 узлам на плечо. Замкнутая
  // формула точна и требует одного члена вместо шести — интегрирование по сфере
  // (десятки тысяч направлений) ускоряется примерно втрое.
  const nH = N * 2 * (ground ? 2 : 1);
  const hcx = new Float64Array(nH), hcy = new Float64Array(nH), hcz = new Float64Array(nH);
  const hpx = new Float64Array(nH), hpy = new Float64Array(nH), hpz = new Float64Array(nH);
  const hD = new Float64Array(nH), hSin = new Float64Array(nH), hCos = new Float64Array(nH);
  const hvxr = new Float64Array(nH), hvxi = new Float64Array(nH);
  const hvyr = new Float64Array(nH), hvyi = new Float64Array(nH);
  const hvzr = new Float64Array(nH), hvzi = new Float64Array(nH);
  {
    let h = 0;
    const nSrc = ground ? 2 : 1;
    for (let src = 0; src < nSrc; src++) {
      const img = src === 1;
      for (let b = 0; b < N; b++) for (const e of ["p", "m"] as const) {
        const H = half(basis[b], e), D = H.len;
        const Ib = I[b];
        const dx = img ? -H.curDir[0] : H.curDir[0];
        const dy = img ? -H.curDir[1] : H.curDir[1];
        const dz = H.curDir[2];
        const c0 = img ? mirrorPos(basis[b].center) : basis[b].center;
        const pd = img ? mirrorPos(H.posDir) : H.posDir;
        hcx[h] = c0[0]; hcy[h] = c0[1]; hcz[h] = c0[2];
        hpx[h] = pd[0]; hpy[h] = pd[1]; hpz[h] = pd[2];
        hD[h] = D; hSin[h] = Math.sin(k * D); hCos[h] = Math.cos(k * D);
        hvxr[h] = Ib.re * dx; hvxi[h] = Ib.im * dx;
        hvyr[h] = Ib.re * dy; hvyi[h] = Ib.im * dy;
        hvzr[h] = Ib.re * dz; hvzi[h] = Ib.im * dz;
        h++;
      }
    }
  }

  /** Вектор N(û) = Σ плеч ∫ I(t)·ĉ·e^{jkû·r} dt. Возвращает [Nxr,Nxi,Nyr,Nyi,Nzr,Nzi]. */
  const farVector = (ux: number, uy: number, uz: number, out: Float64Array): void => {
    let nxr = 0, nxi = 0, nyr = 0, nyi = 0, nzr = 0, nzi = 0;
    const k2 = k * k;
    for (let h = 0; h < nH; h++) {
      const D = hD[h], kD = k * D, skD = hSin[h], ckD = hCos[h];
      const beta = ux * hpx[h] + uy * hpy[h] + uz * hpz[h];
      const a = k * beta, aD = a * D;
      const diff = k2 - a * a;
      let gr: number, gi: number;
      if (Math.abs(diff) > 1e-7 * k2) {
        const den = diff * skD;
        gr = (k * Math.cos(aD) - k * ckD) / den;
        gi = (k * Math.sin(aD) - a * skD) / den;
      } else {
        const sgn = a >= 0 ? 1 : -1;
        const er = Math.cos(sgn * kD), ei = Math.sin(sgn * kD);
        const den = -2 * sgn * k * skD;
        gr = (-kD * ei) / den;
        gi = (kD * er - skD) / den;
      }
      const ph = k * (ux * hcx[h] + uy * hcy[h] + uz * hcz[h]);
      const cp = Math.cos(ph), sp = Math.sin(ph);
      const fr = cp * gr - sp * gi, fi = cp * gi + sp * gr;
      nxr += hvxr[h] * fr - hvxi[h] * fi; nxi += hvxr[h] * fi + hvxi[h] * fr;
      nyr += hvyr[h] * fr - hvyi[h] * fi; nyi += hvyr[h] * fi + hvyi[h] * fr;
      nzr += hvzr[h] * fr - hvzi[h] * fi; nzi += hvzr[h] * fi + hvzi[h] * fr;
    }
    out[0] = nxr; out[1] = nxi; out[2] = nyr; out[3] = nyi; out[4] = nzr; out[5] = nzi;
  };
  const farBuf = new Float64Array(6);

  const powerAt = (thetaDeg: number, phiDeg: number): number => {
    const th = (thetaDeg * Math.PI) / 180, ph = (phiDeg * Math.PI) / 180;
    const st = Math.sin(th);
    const ux = st * Math.cos(ph), uy = st * Math.sin(ph), uz = Math.cos(th);
    farVector(ux, uy, uz, farBuf);
    const nxr = farBuf[0], nxi = farBuf[1], nyr = farBuf[2], nyi = farBuf[3], nzr = farBuf[4], nzi = farBuf[5];
    // Излучает только поперечная часть — убираем радиальную составляющую.
    const uNr = ux * nxr + uy * nyr + uz * nzr;
    const uNi = ux * nxi + uy * nyi + uz * nzi;
    return nxr * nxr + nxi * nxi + nyr * nyr + nyi * nyi + nzr * nzr + nzi * nzi - (uNr * uNr + uNi * uNi);
  };
  const farFieldAt = (thetaDeg: number, phiDeg: number): { th: C; ph: C } => {
    const th = (thetaDeg * Math.PI) / 180, ph = (phiDeg * Math.PI) / 180;
    const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph);
    const ux = st * cp, uy = st * sp, uz = ct;
    farVector(ux, uy, uz, farBuf);
    const nxr = farBuf[0], nxi = farBuf[1], nyr = farBuf[2], nyi = farBuf[3], nzr = farBuf[4], nzi = farBuf[5];
    // θ̂ = (cosθcosφ, cosθsinφ, −sinθ),  φ̂ = (−sinφ, cosφ, 0)
    const tx = ct * cp, ty = ct * sp, tz = -st;
    return {
      th: { re: nxr * tx + nyr * ty + nzr * tz, im: nxi * tx + nyi * ty + nzi * tz },
      ph: { re: -nxr * sp + nyr * cp, im: -nxi * sp + nyi * cp },
    };
  };

  const nearFieldAt = (x: number, y: number, z: number): { x: C; y: C; z: C } => {
    buildSamples();
    // E = [A·a − B·(a·R̂)R̂]·e^{−jkR}/R,  A = 1 − j/(kR) − 1/(kR)²,  B = 1 − 3j/(kR) − 3/(kR)²
    let exr = 0, exi = 0, eyr = 0, eyi = 0, ezr = 0, ezi = 0;
    for (let s = 0; s < nS; s++) {
      const dx = x - sx[s], dy = y - sy[s], dz = z - sz[s];
      const R = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (R < 1e-9) continue;
      const kR = k * R, ikR = 1 / kR, ikR2 = ikR * ikR;
      const Ar = 1 - ikR2, Ai = -ikR;
      const Br = 1 - 3 * ikR2, Bi = -3 * ikR;
      const rx = dx / R, ry = dy / R, rz = dz / R;
      // a·R̂ (комплексное)
      const dr = axr[s] * rx + ayr[s] * ry + azr[s] * rz;
      const di = axi[s] * rx + ayi[s] * ry + azi[s] * rz;
      // B·(a·R̂)
      const bdr = Br * dr - Bi * di, bdi = Br * di + Bi * dr;
      // e^{−jkR}/R
      const gr = Math.cos(kR) / R, gi = -Math.sin(kR) / R;
      const comp = (ar: number, ai: number, rc: number): [number, number] => {
        // A·a − B(a·R̂)·r_c
        const vr = Ar * ar - Ai * ai - bdr * rc;
        const vi = Ar * ai + Ai * ar - bdi * rc;
        return [vr * gr - vi * gi, vr * gi + vi * gr];
      };
      const [xr, xi] = comp(axr[s], axi[s], rx);
      const [yr, yi] = comp(ayr[s], ayi[s], ry);
      const [zr, zi] = comp(azr[s], azi[s], rz);
      exr += xr; exi += xi; eyr += yr; eyi += yi; ezr += zr; ezi += zi;
    }
    return { x: { re: exr, im: exi }, y: { re: eyr, im: eyi }, z: { re: ezr, im: ezi } };
  };

  if (opts?.skipPattern) {
    return { Zin, gainDbi: NaN, Umax: NaN, lambda, powerAt, avgGain: NaN, farFieldAt, nearFieldAt, efficiency: effOf() };
  }

  // Сетка интегрирования по сфере: для крупных задач разрежаем, иначе расчёт
  // перестаёт быть интерактивным. Контроль точности — по avgGain (должен остаться ≈1).
  // Для задач с сетчатым экраном грубая сетка берётся раньше (там точек меньше после
  // слияния, но их всё равно много): шаг 3° по сфере достаточен, avgGain это подтверждает.
  const coarse = nS > 4000 || (hasJunctions && nS > 1000);
  const nth = coarse ? 60 : 90;
  const nph = coarse ? 120 : 180;
  // При идеальной земле излучение есть только в верхней полусфере (θ ≤ 90°):
  // под землю поле не проходит, и интегрировать туда нельзя — иначе КНД занизится вдвое.
  const thMax = ground ? 90 : 180;
  let Prad = 0, Umax = 0;
  for (let i = 0; i <= nth; i++) {
    const th = (thMax * i) / nth, st = Math.sin((th * Math.PI) / 180), wt = i === 0 || i === nth ? 0.5 : 1;
    for (let j = 0; j < nph; j++) {
      const U = powerAt(th, (360 * j) / nph);
      if (U > Umax) Umax = U;
      Prad += U * st * wt * (((thMax * Math.PI) / 180) / nth) * ((2 * Math.PI) / nph);
    }
  }
  // --- Self-check NEC2: средний КНД по сфере (для свободного пространства без потерь = 1.0) ---
  // Дальнее поле: U = η·k²/(32π²)·|N⊥|², наш powerAt возвращает именно |N⊥|².
  // Вход: Pвх = ½·Σ Re(V·conj(I)) = ½·Σ Re(I) при V = 1 В на каждом порту.
  const Prad_W = ((ETA * k * k) / (32 * Math.PI * Math.PI)) * Prad;
  // Баланс энергии — чисто численная проверка: излучённое против подведённого за
  // вычетом омических потерь (при идеальном проводнике Ploss = 0).
  const avgGain = Pin - Ploss > 0 ? Prad_W / (Pin - Ploss) : NaN;

  return {
    Zin, gainDbi: 10 * Math.log10((4 * Math.PI * Umax) / Prad), Umax, lambda, powerAt, avgGain,
    farFieldAt, nearFieldAt, efficiency: effOf(),
  };
}
