import { withDisplayFloor } from "./display";
// Патч-антенна. Два режима:
//  1) "rect" — прямоугольный микрополосковый (двухщелевая cavity-модель Balanis)
//     + ДИФРАКЦИЯ НА КРОМКАХ ЭКРАНА КОНЕЧНОГО РАЗМЕРА (UTD), дающая реальное
//     заднее излучение вместо идеализированного нуля.
//  2) "beam" — CP/произвольный рисунок: каноническая ДН по ИЗМЕРЕННОЙ ширине луча.
//
// ПОЧЕМУ НУЖНА ДИФРАКЦИЯ. Классические формулы патча выводятся для БЕСКОНЕЧНОГО экрана:
// по теории изображений излучение тогда существует только в верхней полусфере, а сзади
// строго ноль — на круговой диаграмме это выглядит как «обрезанная» полуокружность.
// У реальной антенны экран конечный, и за него заходит поле, продифрагировавшее на
// кромках. Считаем его равномерной геометрической теорией дифракции (см. utd.ts):
// щели лежат прямо на экране, поэтому падение на кромку — скользящее.
//
// Что модель НЕ учитывает: поверхностные волны в подложке, излучение фидера,
// конечные размеры самой подложки. Точный уровень заднего лепестка — полноволновой
// расчёт или замер.

import { C0, type PatternResult, type PatternPoint } from "./types";
import { DEG, EPS, sinc, toDb, halfPowerBeamwidth , rearSectorDb } from "./mathutil";
import { grazingEdgeD, fresnelTransition, type Cx } from "./utd";
import { vswr, mismatchLossDb } from "./rfutil";
import { sweepBand, type SweepPoint } from "./sweep";
import { patchImpedance } from "./patchmodel";

export interface PatchInput {
  mode: "rect" | "beam";
  polarization: string; // "Линейная" | "RHCP" | "LHCP"
  freqMHz: number;
  // rect:
  lengthMm: number;
  widthMm: number;
  substrateH: number;
  epsR: number;
  tanD: number;        // тангенс угла потерь подложки (0 — потери не учитывать)
  groundLmm: number;   // размер экрана вдоль L (E-плоскость)
  groundWmm: number;   // размер экрана вдоль W (H-плоскость)
  feedInsetMm: number; // глубина врезки точки питания от края (0 — питание с края)
  // beam:
  hpbwDeg: number;
  gainDbi: number;     // 0 = не задано
  backLobeDb: number;  // измеренный уровень заднего излучения, дБ (0 — нет данных)
  floorDb: number;
}

const cadd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
const cmul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cscale = (a: Cx, s: number): Cx => ({ re: a.re * s, im: a.im * s });
const cexp = (p: number): Cx => ({ re: Math.cos(p), im: Math.sin(p) });
const cabs2 = (a: Cx): number => a.re * a.re + a.im * a.im;

function effectiveDeltaL(W: number, h: number, eeff: number): number {
  return 0.412 * h * (((eeff + 0.3) * (W / h + 0.264)) / ((eeff - 0.258) * (W / h + 0.8)));
}

function polarizationNote(p: string): string {
  return `Поляризация: ${p}. Осевое отношение (качество CP) в этой модели не рассчитывается.`;
}

/** Нормировка набора комплексных амплитуд в дБ по максимуму. */
function normalizeToDb(vals: number[], floorDb: number): PatternPoint[] {
  let m = 0;
  for (const v of vals) if (v > m) m = v;
  return vals.map((v, a) => ({ angleDeg: a, valueDb: toDb(m > 0 ? v / m : 0, floorDb) }));
}

// ---- Режим "beam": каноническая ДН по ширине луча ----
function computeBeam(inp: PatchInput): PatternResult {
  const notes: string[] = [];
  const f = inp.freqMHz;
  const lambdaMm = (C0 / (f * 1e6)) * 1000;
  const hpbw = inp.hpbwDeg;

  if (!(hpbw > 0 && hpbw < 180)) {
    return {
      antennaKind: "patch",
      title: `Диаграмма направленности патча · ${f} МГц`,
      planes: [{ label: "E/H (симметрично)", points: [] }],
      referencePlaneIndex: 0,
      metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null },
      notes: ["⚠ Введите ширину луча −3 дБ в диапазоне 0…180°."],
    };
  }
  const thHalf = (hpbw / 2) * DEG;
  const cosH = Math.cos(thHalf);
  const n = cosH > EPS && cosH < 1 ? Math.log(0.5) / (2 * Math.log(cosH)) : 1;

  // Заднее излучение: только если пользователь его ИЗМЕРИЛ. Выдумывать уровень нельзя.
  const backLin = inp.backLobeDb < 0 ? Math.pow(10, inp.backLobeDb / 10) : 0;
  const vals: number[] = [];
  for (let a = 0; a < 360; a++) {
    const c = Math.cos(a * DEG);
    const front = c > 0 ? Math.pow(c, 2 * n) : 0;
    // Задний лепесток — зеркальная копия главного, приведённая к заданному уровню.
    const back = c < 0 ? backLin * Math.pow(-c, 2 * n) : 0;
    vals.push(front + back);
  }
  const plane = normalizeToDb(vals, inp.floorDb);

  let directivityDbi: number | null;
  if (inp.gainDbi && inp.gainDbi !== 0) {
    directivityDbi = inp.gainDbi;
    notes.push("КНД задан вручную (ваши данные).");
  } else {
    directivityDbi = 10 * Math.log10(32400 / (hpbw * hpbw));
    notes.push("КНД — оценка Крауса по заданной ширине луча (симметрично). Точнее — измерение или openEMS.");
  }
  notes.push("Каноническая форма cosⁿθ по заданной ширине луча — для CP/произвольного рисунка металлизации.");
  if (backLin > 0) {
    notes.push(`Заднее излучение построено по ВАШЕМУ значению ${inp.backLobeDb} дБ (F/B), форма принята зеркальной.`);
  } else {
    notes.push(
      "Заднее излучение не показано: в этом режиме его неоткуда взять. Если знаете F/B по замеру — " +
      "введите его в поле «Заднее излучение», и диаграмма станет полной.",
    );
  }
  notes.push(polarizationNote(inp.polarization));

  return {
    antennaKind: "patch",
    title: `Диаграмма направленности патча (${inp.polarization}) · ${f} МГц`,
    planes: [{ label: `Главное сечение (HPBW ${hpbw}°)`, points: plane }],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f, lambdaMm, directivityDbi,
      hpbwDeg: halfPowerBeamwidth(plane), sllDb: null,
      frontToBackDb: backLin > 0 ? -inp.backLobeDb : null,
      polarization: inp.polarization,
      hpbwEDeg: halfPowerBeamwidth(plane), hpbwHDeg: halfPowerBeamwidth(plane),
      hpbwELabel: "главное сечение", hpbwHLabel: "главное сечение",
    },
    notes,
  };
}

// ---- Режим "rect": двухщелевая cavity-модель + дифракция на кромках экрана ----
function computeRect(inp: PatchInput): PatternResult {
  const notes: string[] = [];
  const f = inp.freqMHz;
  const lambdaMm = (C0 / (f * 1e6)) * 1000;
  const k0 = (2 * Math.PI) / lambdaMm;      // 1/мм
  const W = inp.widthMm, L = inp.lengthMm, h = inp.substrateH, er = inp.epsR;

  const eeff = (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + (12 * h) / W, -0.5);
  const dL = effectiveDeltaL(W, h, eeff);
  const Le = L + 2 * dL;                     // эффективная длина: разнос щелей в МНОЖИТЕЛЕ РЕШЁТКИ ДН (Balanis 14-42).
  // Для взаимной проводимости G12 ниже используется физическая L — см. пояснение там.

  const hh = (k0 * h) / 2;
  const ww = (k0 * W) / 2;
  const ll = (k0 * Le) / 2;

  // --- Геометрооптика (бесконечный экран) ---
  const inFront = (t: number) => Math.cos(t) > 1e-12;
  const goE = (t: number) => (inFront(t) ? sinc(hh * Math.sin(t)) * Math.cos(ll * Math.sin(t)) : 0);
  const goH = (t: number) =>
    inFront(t) ? sinc(hh * Math.sin(t)) * sinc(ww * Math.sin(t)) * Math.cos(t) : 0;

  // --- Дифракция на кромках экрана (UTD) ---
  const Lg = Math.max(inp.groundLmm, L + 2), Wg = Math.max(inp.groundWmm, W + 2);
  const slotX = [Le / 2, -Le / 2];           // положения щелей по оси L
  const edgeX = [Lg / 2, -Lg / 2];           // кромки экрана по оси L
  const slotAmp = 0.5 * sinc(hh);            // амплитуда одной щели в скользящем направлении

  /**
   * Дифрагированное поле. plane="E" — точное сечение (кромки лежат в плоскости среза).
   * plane="H" — приближение: фазы кромок не разносятся (проекция равна нулю), а конечная
   * длина кромки Wg даёт азимутальный спад sinc(k·Wg·sinθ/2). В надире оба среза сходятся.
   */
  function diffracted(aDeg: number, plane: "E" | "H"): Cx {
    const aRad = aDeg * DEG;
    const thetaPol = aDeg <= 180 ? aDeg : 360 - aDeg;   // полярный угол от зенита
    let acc: Cx = { re: 0, im: 0 };
    // Луч от ДАЛЬНЕЙ кромки к наблюдателю у самого горизонта идёт вдоль экрана и чиркает
    // по ближней кромке. Формула полуплоскости этого не знает: она считает экран
    // бесконечным и на горизонте формально «переходит» с верхней грани на нижнюю, давая
    // скачок. У экрана КОНЕЧНОГО размера такого перехода нет — там работает двойная
    // дифракция. Гасим вклад дальней кромки у горизонта той же переходной функцией
    // Френеля: её аргумент — раскрытие луча над экраном, k·Lg·cos²θ. Вдали от горизонта
    // (в т.ч. точно назад) множитель равен 1 и ничего не меняет.
    const grazeTaper = fresnelTransition(k0 * Lg * Math.pow(Math.cos(thetaPol * DEG), 2));

    for (let ei = 0; ei < 2; ei++) {
      const xe = edgeX[ei];
      // «Через экран» наблюдатель смотрит, если направление уводит вглубь экрана от кромки.
      const overPlate = plane === "E" && Math.sin(aRad) * xe < 0;
      // Угол наблюдения от освещённой грани экрана.
      // Правая кромка: экран уходит в −x, поэтому φ = a − 270°. Левая — зеркально.
      const aEff = plane === "E" ? aDeg : ei === 0 ? thetaPol : 360 - thetaPol;
      const phi = (((ei === 0 ? aEff - 270 : 90 - aEff) % 360) + 360) % 360;
      for (let si = 0; si < 2; si++) {
        const sPrime = Math.abs(xe - slotX[si]);
        if (sPrime < 1e-6) continue;
        const D = grazingEdgeD(phi * DEG, sPrime, k0);
        // ½ — правило скользящего падения; e^{−jk s'} — путь щель→кромка;
        // 1/√s' — расхождение; последний множитель — вынос фазы кромки в дальнюю зону.
        let term = cscale(cmul(D, cexp(-k0 * sPrime)), (0.5 * slotAmp) / Math.sqrt(sPrime));
        if (overPlate) term = cmul(term, grazeTaper);
        const ph = plane === "E" ? cexp(k0 * xe * Math.sin(aRad)) : { re: 1, im: 0 };
        acc = cadd(acc, cmul(term, ph));
      }
    }
    if (plane === "H") {
      const az = sinc((k0 * Wg * Math.sin(thetaPol * DEG)) / 2);
      acc = cscale(acc, az);
    }
    return acc;
  }

  const valsE: number[] = [], valsH: number[] = [];
  for (let a = 0; a < 360; a++) {
    const t = a * DEG;
    const dE = diffracted(a, "E"), dH = diffracted(a, "H");

    valsE.push(cabs2({ re: goE(t) + dE.re, im: dE.im }));
    valsH.push(cabs2({ re: goH(t) + dH.re, im: dH.im }));
  }
  const ePlane = normalizeToDb(valsE, inp.floorDb);
  const hPlane = normalizeToDb(valsH, inp.floorDb);

  const Lrel = Le / lambdaMm, Wrel = W / lambdaMm;
  const oversize = Lrel > 0.75 || Wrel > 0.75;
  const hpbwE = halfPowerBeamwidth(ePlane), hpbwH = halfPowerBeamwidth(hPlane);

  // --- Проводимости щелей, входное сопротивление ---
  // Модель вынесена в patchmodel.ts и используется И синтезом, И этим расчётом —
  // иначе программа проектировала бы патч под 50 Ом, а сама же показывала КСВ 1.6.
  const pz = patchImpedance({ L, W, h, er, tanD: inp.tanD, inset: Math.max(0, inp.feedInsetMm), fMHz: f });
  const { Redge, Rin, Qtot, efficiency, fResMHz } = pz;
  const inset = Math.max(0, Math.min(inp.feedInsetMm, L / 2));
  const Zre = pz.re, Zim = pz.im;
  const swr = Number.isFinite(Zre) ? vswr(Zre, Zim, 50) : NaN;
  const detune = Number.isFinite(fResMHz) && fResMHz > 0 ? f / fResMHz - 1 : 0;

  // Полоса и график используют ту же частотно-зависимую модель, что основной Z.
  const SWR_CRIT = 1.6;
  let bandLo: number | undefined, bandHi: number | undefined;
  let sweepPts: SweepPoint[] | undefined, swrMinF: number | undefined, swrMin: number | undefined;
  if (Number.isFinite(Qtot) && Qtot > 0 && Number.isFinite(Rin)) {
    const zAt = (fMHz: number) => patchImpedance({ L, W, h, er, tanD: inp.tanD, inset, fMHz });
    // Резонанс обязательно входит в сетку. Rin и Q нельзя замораживать на рабочей f:
    // проводимости щелей и потери меняются при каждом шаге по частоте.
    const spanQ = Math.min(0.2, Math.max(0.01, 4 / Qtot));
    const sw = sweepBand(zAt, fResMHz, { span: spanQ, points: 81, refine: 16, limit: SWR_CRIT });
    bandLo = sw.lo; bandHi = sw.hi;
    // Рабочая частота видна и при большой расстройке, без разрежения сетки у резонанса.
    if (!sw.points.some(p => Math.abs(p.freqMHz - f) < 1e-9)) {
      sw.points.push({ freqMHz: f, R: Zre, X: Zim, swr });
      sw.points.sort((a, b) => a.freqMHz - b.freqMHz);
    }
    sweepPts = sw.points; swrMinF = sw.minFreqMHz; swrMin = sw.minSwr;
  }

  const directivityDbi = !oversize && hpbwE && hpbwH ? 10 * Math.log10(32400 / (hpbwE * hpbwH)) : null;
  const gainDbi =
    directivityDbi != null && Number.isFinite(efficiency) ? directivityDbi + 10 * Math.log10(efficiency) : null;

  // --- Примечания ---
  if (er < 1) notes.push("⚠ εr < 1 недопустимо — введите корректное значение подложки.");
  if (oversize) {
    notes.push(
      `⚠ Размер металлизации велик: L/λ=${Lrel.toFixed(2)}, W/λ=${Wrel.toFixed(2)} (>0.75). ` +
        `Это размер платы/корпуса или сложный рисунок (вертушок и т.п.), а не сплошной прямоугольник. ` +
        `Для такого случая переключитесь в режим «CP / по ширине луча» или используйте openEMS. ` +
        `Резонансный прямоугольный патч на ${f} МГц ≈ ${(0.35 * lambdaMm).toFixed(1)}–${(0.49 * lambdaMm).toFixed(1)} мм.`,
    );
  } else {
    notes.push("КНД — оценка Крауса по ширине лепестков. Точное усиление — openEMS (Фаза 4).");
  }
  notes.push(
    `ДН построена на полный круг 360°: 0° — нормаль к патчу, 90° — вдоль экрана, 180° — назад.`,
  );
  notes.push(
    `Заднее излучение посчитано как дифракция на кромках экрана ${Lg.toFixed(0)}×${Wg.toFixed(0)} мм ` +
    `(равномерная геометрическая теория дифракции, скользящее падение). Чем больше экран, тем ниже зад. ` +
    `Не учтены: поверхностные волны в подложке, излучение фидера, конечный размер подложки — ` +
    `точный уровень заднего лепестка проверяйте замером или полноволновым расчётом.`,
  );
  notes.push(
    "В H-плоскости дифракция учтена приближённо: кромки, дающие заднее излучение, лежат в E-плоскости, " +
    "поэтому назад «светит» в основном она. В надире оба сечения сходятся — это контроль сшивки.",
  );
  if (Number.isFinite(fResMHz) && Math.abs(detune) > 0.005) {
    notes.push(
      `⚠ Патч с этими размерами резонирует на ${fResMHz.toFixed(0)} МГц, а не на заданных ${f} МГц ` +
      `(расстройка ${(detune * 100).toFixed(1)} %). Поэтому на рабочей частоте импеданс ` +
      `${Zre.toFixed(0)}${Zim >= 0 ? "+" : ""}${Zim.toFixed(0)}j Ом и КСВ ${swr.toFixed(2)}: реактивность — ` +
      `следствие расстройки. Резонанс сдвигается ДЛИНОЙ L (короче — выше частота): для ${f} МГц нужно ` +
      `L ≈ ${((C0 / 1e6) * 1000 / (2 * f * Math.sqrt(eeff)) - 2 * dL).toFixed(2)} мм.`,
    );
  }
  if (!Number.isFinite(Rin)) {
    notes.push("⚠ Входное сопротивление посчитать не удалось — проверьте размеры.");
  } else if (inset <= 0) {
    notes.push(
      `Питание принято С КРАЯ патча: ${Redge.toFixed(0)} Ом (КСВ ${swr.toFixed(1)} к 50 Ом). ` +
      `Чтобы согласовать, задайте глубину врезки — при ${((L / Math.PI) * Math.acos(Math.sqrt(50 / Redge))).toFixed(2)} мм получится 50 Ом.`,
    );
  }
  if (inp.tanD <= 0) {
    notes.push("Потери в диэлектрике не учтены (tanδ = 0) — КПД и усиление посчитаны только с учётом меди. Введите tanδ по паспорту материала для точного значения.");
  }
  if (h / lambdaMm > 0.05) {
    notes.push(`⚠ Подложка толстая (h = ${(h / lambdaMm).toFixed(3)}λ > 0.05λ) — растут поверхностные волны, модель занижает потери.`);
  }
  notes.push(polarizationNote(inp.polarization));

  return {
    antennaKind: "patch",
    title: `Диаграмма направленности патч-антенны (${inp.polarization}) · ${f} МГц`,
    planes: [
      { label: "E-плоскость (вдоль L)", points: ePlane },
      { label: "H-плоскость (вдоль W)", points: hPlane },
    ],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f,
      lambdaMm,
      directivityDbi,
      hpbwDeg: hpbwE,
      sllDb: null,
      frontToBackDb: ePlane.length ? ePlane[0].valueDb - ePlane[180].valueDb : null,
      rearSectorDb: rearSectorDb(ePlane),
      impedanceR: Number.isFinite(Zre) ? Zre : undefined,
      impedanceX: Number.isFinite(Zim) ? Zim : undefined,
      swr50: Number.isFinite(swr) ? swr : undefined,
      // Потери на рассогласовании считаются по ФАКТИЧЕСКОМУ импедансу на рабочей частоте
      // Z(f) = Zre + jZim, а не по резонансному Rin: у расстроенного патча реактивность
      // даёт основную часть рассогласования, и по Rin потери выходили заниженными
      // (пример: КСВ 7.42 → 3.78 дБ, а по Rin получалось 2.73 дБ).
      mismatchDb: Number.isFinite(Zre) && Number.isFinite(Zim) ? mismatchLossDb(Zre, Zim, 50) : undefined,
      gainDbi,
      efficiency: Number.isFinite(efficiency) ? efficiency : undefined,
      qFactor: Number.isFinite(Qtot) ? Qtot : undefined,
      sweep: sweepPts,
      swrMinFreqMHz: swrMinF,
      swrMin,
      bandLowMHz: bandLo,
      bandHighMHz: bandHi,
      swrCriterion: SWR_CRIT,
      polarization: inp.polarization,
      hpbwEDeg: hpbwE,
      hpbwHDeg: hpbwH,
      hpbwELabel: "E (вдоль L)",
      hpbwHLabel: "H (вдоль W)",
    },
    notes,
  };
}

function computePatchModel(inp: PatchInput): PatternResult {
  return inp.mode === "beam" ? computeBeam(inp) : computeRect(inp);
}

export function computePatch(inp: PatchInput): PatternResult {
  return withDisplayFloor(inp, computePatchModel);
}
