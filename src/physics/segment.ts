// Сегментация проводников для метода моментов.
//
// ИСТОЧНИК ПРИЁМА: автоматическая сегментация MMANA-GAL / MININEC (параметры DM1, DM2,
// SC, EC: у концов λ/DM1, в середине λ/DM2, рост в SC раз на каждом шаге, EC сегментов
// минимальной длины у самого конца) и «segment length tapering» EZNEC. Смысл: ток у
// свободного конца провода и заряд там меняются быстро, и равномерная сетка сходится
// медленно. Сгущение к концам даёт сошедшийся результат при втрое-вчетверо меньшем
// числе сегментов.
//
// ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ (v2, сентябрь 2026). В файлах моделей MMANA стоит DM1 = 400,
// DM2 = 20…40, SC = 2, EC = 1. Исследование сходимости на её же эталонных моделях
// (сверка с NEC-2 + EK на равномерной сетке λ/80) показало, что точность определяет
// дробление У КОНЦОВ, а дробление в теле почти ни на что не влияет:
//
//   8 эл. 145 МГц (MMANA 8EL2MW), NEC-2: R = 29.8 Ом
//     λ/400 → λ/20  : 134 сегм., R = 30.87
//     λ/800 → λ/20  : 150 сегм., R = 30.30
//     λ/1600 → λ/20 : 166 сегм., R = 29.97   ← принято
//     λ/3200 → λ/20 : 182 сегм., R = 29.78
//     λ/800 → λ/40  : 208 сегм., R = 30.25   (было в v1)
//     λ/1600 → λ/160: 656 сегм., R = 29.46
//
// Поэтому в v2 взято λ/1600 у концов и λ/20 в теле: сегментов меньше, чем в v1, а
// импеданс ближе к NEC-2. Расчёт 7-элементной яги ускорился с 1.8 с до 0.8 с.
// Значения TIP_DIV/BODY_DIV/GROWTH можно переопределить на вызов (TaperOpts).

/** Сегмент у свободного конца: λ/TIP_DIV. */
export const TIP_DIV = 1600;
/** Сегмент в середине проводника: λ/BODY_DIV. */
export const BODY_DIV = 20;
/** Коэффициент роста длины сегмента от конца к середине. */
export const GROWTH = 2;

/**
 * Длины сегментов отрезка длиной L со сгущением к концам, помеченным как «кончик»
 * (свободный конец провода). tipStart/tipEnd — сгущать ли у начала/конца отрезка.
 * body — наибольшая длина сегмента (по умолчанию λ/BODY_DIV).
 */
export interface TaperOpts {
  /** Длина сегмента у свободного конца = λ/tipDiv (MMANA: DM1). */
  tipDiv?: number;
  /** Во сколько раз растёт сегмент на каждом шаге от конца к середине (MMANA: SC). */
  growth?: number;
  /** Сколько сегментов минимальной длины ставится подряд у самого конца (MMANA: EC). */
  endCount?: number;
}

export function taperedSegLens(
  L: number, lambda: number, tipStart: boolean, tipEnd: boolean, body = lambda / BODY_DIV,
  opt: TaperOpts = {},
): number[] {
  if (!(L > 0)) return [];
  const tipDiv = opt.tipDiv ?? TIP_DIV;
  const growth = opt.growth ?? GROWTH;
  const endCount = Math.max(1, Math.round(opt.endCount ?? 1));
  const smin = Math.min(lambda / tipDiv, body);
  const taper = (limit: number): number[] => {
    const out: number[] = [];
    let s = smin, acc = 0;
    // endCount сегментов минимальной длины подряд у самого конца (MMANA: EC), далее рост.
    for (let k = 0; k < endCount && acc + s <= limit; k++) { out.push(s); acc += s; }
    s *= growth;
    while (s < body && acc + s <= limit) { out.push(s); acc += s; s *= growth; }
    return out;
  };
  const nTips = (tipStart ? 1 : 0) + (tipEnd ? 1 : 0);
  // На каждое сгущение отводим не больше половины (при двух) или всей длины отрезка.
  const limit = nTips === 2 ? L / 2 : L;
  const a = tipStart ? taper(limit * 0.9) : [];
  const b = tipEnd ? taper(limit * 0.9) : [];
  const used = a.reduce((x, y) => x + y, 0) + b.reduce((x, y) => x + y, 0);
  const rest = L - used;
  const nMid = Math.max(1, Math.ceil(rest / body - 1e-9));
  const mid = new Array<number>(nMid).fill(rest / nMid);
  return [...a, ...mid, ...b.reverse()];
}

type V3 = [number, number, number];

/** Точки ломаной и длины звеньев прямого проводника p0 → p1 по заданным длинам сегментов. */
export function straightPolyline(p0: V3, p1: V3, segLens: number[]): { pts: V3[]; seglens: number[] } {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const d: V3 = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L, (p1[2] - p0[2]) / L];
  const total = segLens.reduce((x, y) => x + y, 0);
  const scale = L / total; // защита от накопленной погрешности
  const pts: V3[] = [p0];
  let u = 0;
  for (let i = 0; i < segLens.length; i++) {
    u += segLens[i] * scale;
    pts.push(i === segLens.length - 1 ? p1 : [p0[0] + d[0] * u, p0[1] + d[1] * u, p0[2] + d[2] * u]);
  }
  const seglens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    seglens.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]));
  }
  return { pts, seglens };
}

/**
 * Прямой симметричный вибратор, запитанный в центре: узел ТОЧНО в центре (базис PWS
 * питается в узле — при нечётном числе сегментов источник оказался бы смещён на
 * полсегмента), сгущение к обоим кончикам. gap > 0 — разрез в центре: два полусегмента
 * gap/2, чтобы базис питающего узла охватывал ровно зазор.
 * center — середина, dir — единичное направление, L — длина от кончика до кончика.
 */
export function centerFedElement(
  center: V3, dir: V3, L: number, lambda: number, gap = 0,
): { pts: V3[]; seglens: number[]; maxSeg: number; nseg: number } {
  const h = L / 2;
  const at = (u: number): V3 => [center[0] + dir[0] * u, center[1] + dir[1] * u, center[2] + dir[2] * u];
  let half: number[];
  let inner: number[] = [];
  if (gap > 0 && gap < L) {
    half = taperedSegLens(h - gap / 2, lambda, true, false);
    inner = [gap / 2];
  } else {
    half = taperedSegLens(h, lambda, true, false);
  }
  const left = [...half, ...inner];               // от −h к центру
  const segs = [...left, ...left.slice().reverse()];
  const pts: V3[] = [at(-h)];
  let u = -h;
  for (let i = 0; i < segs.length; i++) {
    u += segs[i];
    pts.push(i === left.length - 1 ? at(0) : i === segs.length - 1 ? at(h) : at(u));
  }
  const seglens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    seglens.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]));
  }
  return { pts, seglens, maxSeg: Math.max(...seglens), nseg: seglens.length };
}

/**
 * Ломаная из прямых звеньев со сгущением сетки: у свободных концов ломаной (tipStart,
 * tipEnd) и, при bends = true, по обе стороны каждого излома. splitMid — индексы звеньев,
 * которые надо разрезать пополам узлом (узел питания в середине звена).
 * body — наибольший сегмент на каждом звене (по умолчанию λ/BODY_DIV).
 */
export function taperedPolyline(
  corners: V3[], lambda: number,
  opt: { tipStart?: boolean; tipEnd?: boolean; bends?: boolean; splitMid?: number[]; body?: (link: number) => number } = {},
): { pts: V3[]; seglens: number[]; maxSeg: number } {
  const pts: V3[] = [corners[0]];
  const seglens: number[] = [];
  const nLinks = corners.length - 1;
  const len = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < nLinks; i++) {
    const p0 = corners[i], p1 = corners[i + 1];
    const t0 = (i === 0 && !!opt.tipStart) || (i > 0 && !!opt.bends);
    const t1 = (i === nLinks - 1 && !!opt.tipEnd) || (i < nLinks - 1 && !!opt.bends);
    const body = opt.body ? opt.body(i) : lambda / BODY_DIV;
    const pieces: [V3, V3, boolean, boolean][] = opt.splitMid?.includes(i)
      ? [[p0, lerp(p0, p1, 0.5), t0, false], [lerp(p0, p1, 0.5), p1, false, t1]]
      : [[p0, p1, t0, t1]];
    for (const [a, b, ta, tb] of pieces) {
      const segs = taperedSegLens(len(a, b), lambda, ta, tb, body);
      const pl = straightPolyline(a, b, segs);
      for (let k = 1; k < pl.pts.length; k++) pts.push(pl.pts[k]);
      seglens.push(...pl.seglens);
    }
  }
  return { pts, seglens, maxSeg: Math.max(...seglens) };
}

/** Предел числа неизвестных для антенн из прямых элементов (яги, ЛПА): ~7 с счёта. */
export const MAX_ELEMENT_UNKNOWNS = 1000;

/** Оценка числа сегментов элемента длиной L при сетке centerFedElement (тело λ/40 + сгущение). */
export function estimateElementSegments(L: number, lambda: number): number {
  return Math.ceil(L / (lambda / BODY_DIV)) + 12;
}

/** Текст отказа, когда задача слишком велика (частота не сочетается с размерами). */
export function tooManyUnknownsNote(n: number, maxElemLambda: number): string {
  return (
    `⚠ Размеры и частота не сочетаются: самый длинный элемент получается ${maxElemLambda.toFixed(1)}λ, ` +
    `задача требует ~${n} неизвестных (предел ${MAX_ELEMENT_UNKNOWNS}) — это десятки секунд счёта и ` +
    `заведомо не рабочий режим антенны (элементы ≈ 0.5λ). Проверьте частоту и размеры.`
  );
}
