import { withDisplayFloor } from "./display";
// Логопериодическая антенна (ЛПА / LPDA): N параллельных диполей, питаемых через
// ПЕРЕКРЁСТНЫЙ фидер (метод Каррела). MoM для диполей + сетевой расчёт фидера.
// Проверено против NEC2 (TL-карты с перекрёстом): Ga 6.50 vs 6.45, F/B 15.6, Z 32 vs 31.5.

import { C_LIGHT, solve3D, type Wire } from "./mom3d";
import { centerFedElement, estimateElementSegments, MAX_ELEMENT_UNKNOWNS, tooManyUnknownsNote } from "./segment";
import { lossPerMeter, resistivityOf, lossNote } from "./conductor";
import { thinWireWarnings } from "./wirevalid";
import { sweepBand, type SweepPoint } from "./sweep";
import type { PatternResult, PatternPoint } from "./types";
import { toDb, halfPowerBeamwidth, frontToBack, rearSectorDb, convergenceNote, elevationCutXZ } from "./mathutil";
import { mismatchLossDb, impedanceUsable } from "./rfutil";

type C = { re: number; im: number };
const cx = (re: number, im = 0): C => ({ re, im });
const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cabs2 = (a: C): number => a.re * a.re + a.im * a.im;
const cdiv = (a: C, d: C): C => { const da = cabs2(d); return { re: (a.re * d.re + a.im * d.im) / da, im: (a.im * d.re - a.re * d.im) / da }; };

/** Решение малой комплексной СЛАУ A·x = b (сеть фидера, n = число элементов). */
function csolveSmall(A: C[][], b: C[]): C[] {
  const n = b.length;
  const M = A.map((r) => r.map((c) => ({ ...c }))), x = b.map((c) => ({ ...c }));
  for (let col = 0; col < n; col++) {
    let p = col, best = cabs2(M[col][col]);
    for (let r = col + 1; r < n; r++) { const v = cabs2(M[r][col]); if (v > best) { best = v; p = r; } }
    if (p !== col) { [M[col], M[p]] = [M[p], M[col]]; [x[col], x[p]] = [x[p], x[col]]; }
    for (let r = col + 1; r < n; r++) {
      const f = cdiv(M[r][col], M[col][col]);
      for (let c = col; c < n; c++) M[r][c] = csub(M[r][c], cmul(f, M[col][c]));
      x[r] = csub(x[r], cmul(f, x[col]));
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = { ...x[r] };
    for (let c = r + 1; c < n; c++) s = csub(s, cmul(M[r][c], x[c]));
    x[r] = cdiv(s, M[r][r]);
  }
  return x;
}

export interface LpdaElement { x: number; lengthM: number; radiusM: number }
export interface LpdaResult {
  Zin: C; gainDbi: number; Umax: number; lambda: number;
  powerAt: (t: number, p: number) => number; avgGain: number; efficiency: number; maxSeg: number[];
}

/**
 * ЛПА: диполи вдоль Y в точках x (по возрастанию: длинный/зад → короткий/перед), каждый
 * запитан в центре. Решатель — mom3d (точное ядро трубки, сетка со сгущением к кончикам);
 * к портам диполей подключается перекрёстный фидер Z0 (сеть), источник — у короткого
 * (переднего) элемента. Матрица проводимостей портов считается одним LU-разложением.
 */
export function solveLPDA(
  elements: LpdaElement[], freqMHz: number, Z0: number, vf = 1.0, lossPerM: (radiusM: number) => number = () => 0,
  opts: { skipPattern?: boolean; meshLambda?: number } = {},
): LpdaResult {
  const lambda = C_LIGHT / (freqMHz * 1e6);
  // Сетку можно построить по λ другой частоты — так свип по частоте идёт на ОДНОЙ сетке
  // (иначе дискретизация меняется от точки к точке и кривая КСВ получается ступенчатой).
  const meshLam = opts.meshLambda ?? lambda;
  const wires: Wire[] = [], maxSeg: number[] = [], feeds: [number, number, number][] = [];
  for (const el of elements) {
    const e = centerFedElement([el.x, 0, 0], [0, 1, 0], el.lengthM, meshLam);
    wires.push({ pts: e.pts, radius: el.radiusM, seglen: 1e9, seglens: e.seglens, lossPerM: lossPerM(el.radiusM) });
    maxSeg.push(e.maxSeg);
    feeds.push([el.x, 0, 0]);
  }
  const ne = elements.length;
  const Yc = 1 / Z0, betaf = (2 * Math.PI * (freqMHz * 1e6)) / (C_LIGHT * vf);
  const network = (Ya: C[][]): { V: C[]; Zin: C } => {
    // Отрезки фидера между соседними элементами — четырёхполюсники (Y-параметры линии),
    // перекрёст (транспозиция) меняет знак взаимной проводимости.
    const Ytot: C[][] = Ya.map((row) => row.map((c) => ({ ...c })));
    for (let i = 0; i < ne - 1; i++) {
      const d = Math.abs(elements[i + 1].x - elements[i].x), bl = betaf * d;
      const y11 = cx(0, -Yc / Math.tan(bl)), y12 = cx(0, -Yc / Math.sin(bl)); // −(+jYc/sin) из-за перекрёста
      Ytot[i][i] = cadd(Ytot[i][i], y11); Ytot[i + 1][i + 1] = cadd(Ytot[i + 1][i + 1], y11);
      Ytot[i][i + 1] = cadd(Ytot[i][i + 1], y12); Ytot[i + 1][i] = cadd(Ytot[i + 1][i], y12);
    }
    const Is: C[] = new Array(ne).fill(0).map(() => cx(0, 0));
    Is[ne - 1] = cx(1, 0); // источник тока 1 А на переднем элементе
    const V = csolveSmall(Ytot, Is);
    return { V, Zin: V[ne - 1] };
  };
  const r = solve3D(wires, freqMHz, { points: feeds }, { network, skipPattern: opts.skipPattern });
  return {
    Zin: r.Zin, gainDbi: r.gainDbi, Umax: r.Umax, lambda, powerAt: r.powerAt,
    avgGain: r.avgGain, efficiency: r.efficiency, maxSeg,
  };
}

export interface LpdaInput {
  freqMHz: number;
  count: number;      // число элементов N
  tau: number;        // масштаб (<1)
  sigma: number;      // относительный интервал
  longestMm: number;  // полная длина самого длинного (заднего) элемента
  diameterMm: number;
  feederZ0: number;
  /** Металл элементов (conductor.ts): pec | cu | al | brass | steel | custom. */
  material?: string;
  /** ρ, Ом·мм²/м — при material = custom. */
  rhoCustom?: number;
  floorDb: number;
}

function computeLPDAModel(inp: LpdaInput): PatternResult {
  const f = inp.freqMHz, lambdaMm = (C_LIGHT / (f * 1e6)) * 1000, notes: string[] = [];
  const N = Math.max(2, Math.round(inp.count));
  if (!(inp.tau > 0 && inp.tau < 1) || !(inp.sigma > 0) || !(inp.longestMm > 0) || !(inp.diameterMm > 0)) {
    return { antennaKind: "lpda", title: `Диаграмма направленности ЛПА · ${f} МГц`, planes: [{ label: "E-плоскость (азимут)", points: [] }], referencePlaneIndex: 0, metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null }, notes: ["⚠ Проверьте параметры: 0<τ<1, σ>0, длина>0, диаметр>0."] };
  }
  const lengths = Array.from({ length: N }, (_, i) => inp.longestMm * inp.tau ** i);
  const pos = [0]; for (let i = 0; i < N - 1; i++) pos.push(pos[i] + 2 * inp.sigma * lengths[i]);
  const lambdaM = lambdaMm / 1000;
  const elements: LpdaElement[] = lengths.map((L, i) => {
    const lengthM = L / 1000, radiusM = inp.diameterMm / 2000;
    return { x: pos[i] / 1000, lengthM, radiusM };
  });
  const est = elements.reduce((acc, e) => acc + estimateElementSegments(e.lengthM, lambdaM), 0);
  if (est > MAX_ELEMENT_UNKNOWNS) {
    return { antennaKind: "lpda", title: `Диаграмма направленности ЛПА · ${f} МГц`, planes: [{ label: "E-плоскость (азимут)", points: [] }], referencePlaneIndex: 0, metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null }, notes: [tooManyUnknownsNote(est, inp.longestMm / lambdaMm)] };
  }
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  if (inp.material === "custom" && rho == null) notes.push("⚠ Материал «своё значение», но ρ не задано (или ≤ 0) — потери не учтены.");
  const r = solveLPDA(elements, f, inp.feederZ0, 1.0, (rad) => lossPerMeter(rho, f * 1e6, rad));
  notes.push(...thinWireWarnings(
    elements.map((e, i) => ({ radiusM: e.radiusM, maxSegM: r.maxSeg[i], label: `элемент №${i + 1}` })), lambdaM,
  ));

  // Луч — к короткому концу (+X, φ=0) → выводим как 0° (вверх).
  const az: PatternPoint[] = [], el: PatternPoint[] = [];
  for (let a = 0; a < 360; a += 1) az.push({ angleDeg: a, valueDb: toDb(r.powerAt(90, a) / r.Umax, inp.floorDb) });
  // Угол места: 0° — вперёд по лучу, 90° — зенит, 180° — назад, 270° — надир.
  el.push(...elevationCutXZ(r.powerAt, r.Umax, inp.floorDb));

  notes.push(
    "Отсчёт углов на диаграммах: азимут — 0° вперёд, к короткому элементу (главный луч), 180° назад; "
    + "угол места — 0° вперёд по лучу, 90° зенит, 180° назад, 270° надир.",
  );
  const R = r.Zin.re, X = r.Zin.im;
  const zOk = impedanceUsable(R, X);
  if (!zOk) {
    notes.push(
      `⚠ Расчёт импеданса развалился (R = ${R.toExponential(1)} Ом; у пассивной антенны R > 0). ` +
      `Импеданс и КСВ не приводятся — проверьте τ, σ и длину самого длинного элемента.`,
    );
  }
  const g = Math.sqrt((R - 50) ** 2 + X ** 2) / Math.sqrt((R + 50) ** 2 + X ** 2);
  notes.push(
    "Расчёт: метод моментов (точное ядро трубки, сетка со сгущением к кончикам) для всех диполей " +
    "вместе + перекрёстный фидер как линия передачи между портами (метод Каррела), свободное пространство.",
  );
  notes.push(lossNote(inp.material, rho, f * 1e6, r.efficiency));
  { const cnv = convergenceNote(r.avgGain); if (cnv) notes.push(cnv); }
  notes.push(`Элементы (длина, мм): ${lengths.map((l) => l.toFixed(0)).join(", ")}. Питание — короткий (передний) элемент.`);
  const longestRel = inp.longestMm / lambdaMm;
  if (longestRel < 0.4) notes.push(`⚠ На ${f} МГц самый длинный элемент = ${longestRel.toFixed(2)}λ (<0.4λ) — активная зона может выйти за пределы решётки; проверьте частоту/размеры.`);
  // Свип по частоте: у ЛПА он показывает не «полосу резонанса», а РАБОЧИЙ ДИАПАЗОН —
  // ровный ли КСВ по всему перекрытию. Сетка берётся с рабочей частоты (одна на весь свип).
  let sweepPts: SweepPoint[] | undefined, swrMinF: number | undefined, swrMin: number | undefined;
  try {
    const meshLambda = lambdaM;
    const sw = sweepBand(
      (ff) => solveLPDA(elements, ff, inp.feederZ0, 1.0, (rad) => lossPerMeter(rho, ff * 1e6, rad),
        { skipPattern: true, meshLambda }).Zin,
      f, { span: 0.25, points: r.maxSeg.length > 12 ? 9 : 13, refine: 2 },
    );
    sweepPts = sw.points; swrMinF = sw.minFreqMHz; swrMin = sw.minSwr;
    // У ЛПА «границы полосы» по резонансному критерию не имеют смысла: рабочий диапазон
    // задан длинами крайних элементов, а КСВ внутри него имеет естественную рябь.
    // Поэтому выводим не границы, а размах КСВ по окну и участки, где он хуже критерия.
    const worst = sw.points.reduce((a, b) => (b.swr > a.swr ? b : a));
    const inBand = sw.points.filter((p) => p.freqMHz >= f * 0.8 && p.freqMHz <= f * 1.2);
    const wIn = inBand.length ? inBand.reduce((a, b) => (b.swr > a.swr ? b : a)) : worst;
    notes.push(
      `Свип по частоте (±25 % от ${f} МГц, сетка одна на весь свип): КСВ от ${sw.minSwr.toFixed(2)} ` +
      `(на ${sw.minFreqMHz.toFixed(0)} МГц) до ${worst.swr.toFixed(2)} (на ${worst.freqMHz.toFixed(0)} МГц); ` +
      `в пределах ±20 % худший КСВ ${wIn.swr.toFixed(2)} на ${wIn.freqMHz.toFixed(0)} МГц. ` +
      `Рябь КСВ по диапазону — нормальное свойство ЛПА.`,
    );
  } catch { /* свип не критичен */ }

  {
    // Полоса ЛПА определяется не добротностью, а геометрией: крайние элементы задают
    // границы, поэтому оценивать её через Q (как у резонансных антенн) физически неверно.
    const fHi = 299792.458 / (2 * lengths[lengths.length - 1]);
    const fLo = 299792.458 / (2 * lengths[0]);
    notes.push(
      `Полоса у ЛПА задаётся ДЛИНАМИ КРАЙНИХ ЭЛЕМЕНТОВ, а не добротностью — поэтому здесь её не ` +
      `оценивают по КСВ на одной частоте. По полуволновому условию элементы перекрывают примерно ` +
      `${fLo.toFixed(0)}…${fHi.toFixed(0)} МГц (реально рабочий диапазон уже на величину активной зоны). ` +
      `Показанные усиление, КСВ и ДН относятся к текущей частоте ${f} МГц.`,
    );
  }

  return {
    antennaKind: "lpda",
    title: `Диаграмма направленности ЛПА · ${f} МГц`,
    planes: [
      { label: "E-плоскость (азимут)", points: az },
      { label: "H-плоскость (угол места)", points: el },
    ],
    referencePlaneIndex: 0,
    // Баланс энергии считается по мощности, подведённой к портам диполей из фидера
    // (фидер без потерь): P_изл / (P_портов − P_потерь в металле).
    metrics: { freqMHz: f, lambdaMm, directivityDbi: r.gainDbi, hpbwDeg: halfPowerBeamwidth(az), sllDb: null, frontToBackDb: frontToBack(az), rearSectorDb: rearSectorDb(az), impedanceR: zOk ? R : undefined, impedanceX: zOk ? X : undefined, swr50: zOk ? (1 + g) / (1 - g) : undefined,
      mismatchDb: mismatchLossDb(R, X, 50),
      avgGain: r.avgGain,
      efficiency: rho != null ? r.efficiency : undefined,
      sweep: sweepPts,
      swrMinFreqMHz: swrMinF,
      swrMin,
      gainDbi: r.gainDbi + (r.efficiency > 0 ? 10 * Math.log10(r.efficiency) : 0),
      polarization: "Линейная (вдоль элементов)",
      hpbwEDeg: halfPowerBeamwidth(az),
      hpbwHDeg: halfPowerBeamwidth(el),
      hpbwELabel: "E (азимут)",
      hpbwHLabel: "H (угол места)",
      // Полоса ЛПА задаётся НЕ добротностью, а длинами крайних элементов — см. примечание.
    },
    notes,
  };
}

export function computeLPDA(inp: LpdaInput): PatternResult {
  return withDisplayFloor(inp, computeLPDAModel);
}
