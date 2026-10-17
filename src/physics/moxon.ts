import { withDisplayFloor } from "./display";
// Антенна Moxon — 2 элемента (активный + рефлектор) с загнутыми концами, в одной
// плоскости. Расчёт обобщённым MoM (mom3d.ts, точное ядро трубки). Геометрия задаётся
// 4 размерами Moxon: A (полная ширина), B (загиб активного), C (зазор), D (загиб
// рефлектора). Главный луч — в сторону активного (вперёд).
//
// СЕТКА — со сгущением к свободным концам загибов (как «segment length tapering» в EZNEC):
// у концов λ/800, рост ×2, в теле λ/40; узел питания точно в середине активного.
// Направленность Moxon создаётся связью концов через зазор C, поэтому важна именно
// детализация концов, а не длинных сторон.
//
// СВЕРКА (Moxon 300 МГц, A=359.2 B=47.58 C=16.75 D=69.04 мм, провод Ø2 мм), свободное пр-во:
//                                       сегм.  R, Ом   X, Ом   КНД, дБи  заднее (±60°)
//   наш, сетка со сгущением               57    51.6    −3.5     6.00      27.2 дБ
//   наш, равномерная λ/800               762    51.1    −4.9     6.01      27.6 дБ
//   NEC-2 + EK, равномерная λ/100          98    51.8    −3.2     6.00      27.1 дБ
//   NEC-2 без EK, λ/100                    98    52.2    −2.9     5.99      26.8 дБ
//   MININEC-3, равномерная ~λ/100          96    47.5    −7.6     6.12      —
// Равномерная сетка λ/100 (так считала прежняя версия) давала 48.3−j6.3 и 30.7 дБ —
// не сошедшийся результат, при дроблении он монотонно идёт к значениям сетки со сгущением.
// NEC-2 на мелкой сетке (λ/300…λ/400, Δ < 4a) уходит из-за приближённого ядра.

import { C_LIGHT, solve3D, type Wire } from "./mom3d";
import { thinWireWarnings } from "./wirevalid";
import { taperedPolyline } from "./segment";
import { lossPerMeter, resistivityOf, lossNote } from "./conductor";
import type { PatternResult, PatternPoint } from "./types";
import { toDb, halfPowerBeamwidth, frontToBack, rearSectorDb, convergenceNote, elevationCutXZ } from "./mathutil";
import { mismatchLossDb, qFromImpedanceSlope, impedanceUsable } from "./rfutil";
import { sweepBand, type SweepPoint } from "./sweep";

export interface MoxonInput {
  freqMHz: number;
  widthA: number;     // A, мм — полная ширина (длина главной стороны)
  tailB: number;      // B, мм — загиб активного элемента
  gapC: number;       // C, мм — зазор между концами
  tailD: number;      // D, мм — загиб рефлектора
  diameterMm: number; // диаметр провода
  /** Исполнение: "wire" — круглый провод Ø diameterMm (по умолчанию);
   *  "flat" — печатная плата: медная дорожка шириной stripWmm в плоскости рамки. */
  elementType?: "wire" | "flat";
  stripWmm?: number;
  /** Материал проводника (conductor.ts): pec | cu | al | brass | steel | custom. */
  material?: string;
  /** ρ, Ом·мм²/м — при material = custom. */
  rhoCustom?: number;
  floorDb: number;
}

function swr50(R: number, X: number): number {
  const g = Math.sqrt((R - 50) ** 2 + X ** 2) / Math.sqrt((R + 50) ** 2 + X ** 2);
  return (1 + g) / (1 - g);
}

function computeMoxonModel(inp: MoxonInput): PatternResult {
  const f = inp.freqMHz;
  const lambdaMm = (C_LIGHT / (f * 1e6)) * 1000;
  const A = inp.widthA / 1000, B = inp.tailB / 1000, C = inp.gapC / 1000, D = inp.tailD / 1000;
  const E = B + C + D;
  const flat = inp.elementType === "flat";
  const condMm = flat ? (inp.stripWmm ?? NaN) : inp.diameterMm;
  // Радиус в модели: провод Ø d → d/2; плоская дорожка шириной w → эквивалентный
  // круглый провод радиусом w/4 (классический результат для тонкой полоски, Balanis) —
  // тот же приём, что у диполя в исполнении «плоская планка».
  const rad = flat ? condMm / 4000 : condMm / 2000;
  const notes: string[] = [];

  if (!(A > 0 && B > 0 && C > 0 && D > 0 && condMm > 0)) {
    return {
      antennaKind: "moxon",
      title: `Диаграмма направленности Moxon · ${f} МГц`,
      planes: [{ label: "E-плоскость (азимут)", points: [] }],
      referencePlaneIndex: 0,
      metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null },
      notes: [`⚠ Все размеры A, B, C, D и ${flat ? "ширина дорожки" : "диаметр провода"} должны быть > 0.`],
    };
  }

  const lambdaM = lambdaMm / 1000;
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  if (inp.material === "custom" && rho == null) {
    notes.push("⚠ Материал «своё значение», но ρ не задано (или ≤ 0) — потери не учтены.");
  }
  const lossM = lossPerMeter(rho, f * 1e6, rad);

  // --- Защита от неподъёмной задачи ------------------------------------------
  // Сетка привязана к λ, а размеры — к полям ввода. Если задать частоту, не
  // соответствующую габаритам (например 40 ГГц при рамке 359 мм), число неизвестных
  // взлетает до тысяч, и расчёт встаёт на десятки секунд. Считаем размер заранее.
  const estBasis = Math.ceil((2 * A + 2 * B + 2 * D) / (lambdaM / 40));
  if (estBasis > 600) {
    return {
      antennaKind: "moxon",
      title: `Диаграмма направленности Moxon · ${f} МГц`,
      planes: [{ label: "E-плоскость (азимут)", points: [] }],
      referencePlaneIndex: 0,
      metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null },
      notes: [
        `⚠ Размеры и частота не сочетаются: рамка получается ${(A / lambdaM).toFixed(1)}λ, ` +
        `для такой задачи нужно ~${estBasis} неизвестных — это десятки секунд счёта и заведомо ` +
        `не режим Moxon (рабочий размер A ≈ 0.36λ). Проверьте частоту и размеры.`,
      ],
    };
  }

  // Сетка со сгущением к свободным концам (см. заголовок). Активный (вперёд = −X): главная
  // сторона по X=0, загибы к +X; узел питания — в середине главной стороны.
  const dm = taperedPolyline([[B, A / 2, 0], [0, A / 2, 0], [0, -A / 2, 0], [B, -A / 2, 0]], lambdaM,
    { tipStart: true, tipEnd: true, splitMid: [1] });
  // Рефлектор: главная сторона по X=E, загибы к −X
  const rm = taperedPolyline([[E - D, A / 2, 0], [E, A / 2, 0], [E, -A / 2, 0], [E - D, -A / 2, 0]], lambdaM,
    { tipStart: true, tipEnd: true });
  const driven: Wire = { pts: dm.pts, radius: rad, seglen: 1e9, seglens: dm.seglens, lossPerM: lossM };
  const refl: Wire = { pts: rm.pts, radius: rad, seglen: 1e9, seglens: rm.seglens, lossPerM: lossM };

  notes.push(...thinWireWarnings([
    { radiusM: rad, maxSegM: dm.maxSeg, label: "активный" },
    { radiusM: rad, maxSegM: rm.maxSeg, label: "рефлектор" },
  ], lambdaM));

  const r = solve3D([driven, refl], f, { point: [0, 0, 0] });

  // Полоса: ПРЯМОЙ СВИП по частоте (сетка построена на рабочей частоте и переиспользуется).
  let qf: number | undefined, bandLo: number | undefined, bandHi: number | undefined;
  let sweepPts: SweepPoint[] | undefined, swrMinF: number | undefined, swrMin: number | undefined;
  try {
    const d = 0.02;
    const zLo = solve3D([driven, refl], f * (1 - d), { point: [0, 0, 0] }, { skipPattern: true }).Zin;
    const zHi = solve3D([driven, refl], f * (1 + d), { point: [0, 0, 0] }, { skipPattern: true }).Zin;
    const Q = qFromImpedanceSlope(f, r.Zin.re, f * (1 - d), zLo, f * (1 + d), zHi);
    if (Q) qf = Q;
    const nUnk = (driven.seglens?.length ?? 0) + (refl.seglens?.length ?? 0);
    const sw = sweepBand((ff) => solve3D([driven, refl], ff, { point: [0, 0, 0] }, { skipPattern: true }).Zin, f,
      { points: nUnk > 300 ? 9 : 13, refine: nUnk > 300 ? 2 : 3 });
    sweepPts = sw.points; swrMinF = sw.minFreqMHz; swrMin = sw.minSwr;
    bandLo = sw.lo; bandHi = sw.hi;
    if (Math.abs(sw.minFreqMHz - f) / f > 0.005) {
      notes.push(
        `Минимум КСВ (${sw.minSwr.toFixed(2)}) приходится на ${sw.minFreqMHz.toFixed(1)} МГц, а не на ` +
        `заданные ${f} МГц — сдвиньте настройку размерами A и C.`,
      );
    }
  } catch { /* без полосы расчёт остаётся валидным */ }

  // Азимут (E-плоскость, θ=90). Главный луч физически на φ=180 (−X) → выводим как 0° (вверх).
  const az: PatternPoint[] = [];
  for (let a = 0; a < 360; a += 1) {
    const phi = (a + 180) % 360;
    az.push({ angleDeg: a, valueDb: toDb(r.powerAt(90, phi) / r.Umax, inp.floorDb) });
  }
  // H-плоскость (вертикаль через луч): 0° — вперёд по лучу (у Moxon это −X),
  // 90° — зенит, 180° — назад, 270° — надир (единая договорённость, mathutil).
  const el = elevationCutXZ(r.powerAt, r.Umax, inp.floorDb, -1);

  notes.push(
    "Отсчёт углов на диаграммах: азимут — 0° вперёд, в сторону активного элемента (главный луч), "
    + "180° назад, в сторону рефлектора; угол места — 0° вперёд по лучу, 90° зенит, 270° надир.",
  );
  const R = r.Zin.re, X = r.Zin.im;
  const zOk = impedanceUsable(R, X);
  if (!zOk) {
    notes.push(
      `⚠ Расчёт импеданса развалился (R = ${R.toExponential(1)} Ом; у пассивной антенны R > 0). ` +
      `Импеданс, КСВ и полоса не приводятся — проверьте размеры рамок.`,
    );
  }
  notes.push("Расчёт обобщённым методом моментов (MoM), свободное пространство.");
  if (flat) {
    notes.push(
      `Исполнение — печатная плата: дорожка шириной ${condMm} мм в плоскости рамки пересчитана ` +
      `в эквивалентный круглый проводник радиусом w/4 = ${(rad * 1000).toFixed(2)} мм ` +
      `(Ø ${(rad * 2000).toFixed(2)} мм). Размеры A, B, C, D — по осевым линиям дорожек; ` +
      `наружная ширина рисунка = A + w = ${(inp.widthA + condMm).toFixed(1)} мм.`,
    );
    notes.push(
      "⚠ Диэлектрик платы в расчёте НЕ учитывается — медь считается в воздухе. Подложка " +
      "(FR-4 и т.п.) увеличивает электрическую длину дорожек и ёмкость зазора C: резонанс " +
      "и оптимум F/B смещаются ВНИЗ по частоте, тем сильнее, чем толще плата и выше её εr. " +
      "Величину смещения по этой модели указать нельзя — после изготовления подстройте " +
      "размеры по измерению КСВ (или посчитайте плату полноволновым расчётом).",
    );
  }
  notes.push(`Габарит: ширина A=${inp.widthA} мм, глубина E=B+C+D=${(E * 1000).toFixed(1)} мм. Главный луч — в сторону активного.`);
  if (E / (lambdaMm / 1000) > 0.25) notes.push("⚠ Глубина E > 0.25λ — необычно много для Moxon, проверьте размеры.");
  const cnv = convergenceNote(r.avgGain);
  if (cnv) notes.push(cnv);
  const eff = Number.isFinite(r.efficiency) ? r.efficiency : 1;
  notes.push(lossNote(inp.material, rho, f * 1e6, rho != null ? eff : undefined));
  const gain = r.gainDbi + 10 * Math.log10(Math.max(eff, 1e-9));

  return {
    antennaKind: "moxon",
    title: `Диаграмма направленности Moxon · ${f} МГц`,
    planes: [
      { label: "E-плоскость (азимут)", points: az },
      { label: "H-плоскость (угол места)", points: el },
    ],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f,
      lambdaMm,
      directivityDbi: r.gainDbi,
      hpbwDeg: halfPowerBeamwidth(az),
      sllDb: null,
      frontToBackDb: frontToBack(az),
      rearSectorDb: rearSectorDb(az),
      impedanceR: zOk ? R : undefined,
      impedanceX: zOk ? X : undefined,
      swr50: zOk ? swr50(R, X) : undefined,
      avgGain: r.avgGain,
      efficiency: rho != null ? eff : undefined,
      mismatchDb: zOk ? mismatchLossDb(R, X, 50) : undefined,
      qFactor: qf,
      bandLowMHz: bandLo,
      bandHighMHz: bandHi,
      swrCriterion: 1.6,
      sweep: sweepPts,
      swrMinFreqMHz: swrMinF,
      swrMin,
      gainDbi: gain,
      polarization: "Линейная (вдоль главных сторон рамки)",
      hpbwEDeg: halfPowerBeamwidth(az),
      hpbwHDeg: halfPowerBeamwidth(el),
      hpbwELabel: "E (азимут)",
      hpbwHLabel: "H (угол места)",
    },
    notes,
  };
}

// ---------------------------------------------------------------------------------
// БЫСТРАЯ ГЕОМЕТРИЯ И ИМПЕДАНС Moxon (для оптимизатора, src/opt). Та же сетка и те же
// потери, что в computeMoxon, но без расчёта ДН.
// ---------------------------------------------------------------------------------

/** Провода Moxon по размерам A, B, C, D (мм) для mom3d. Сетка — по λ частоты meshFreqMHz. */
export function moxonWires(inp: MoxonInput, meshFreqMHz = inp.freqMHz): Wire[] {
  const lambdaM = C_LIGHT / (meshFreqMHz * 1e6);
  const A = inp.widthA / 1000, B = inp.tailB / 1000, C = inp.gapC / 1000, D = inp.tailD / 1000;
  const E = B + C + D;
  const flat = inp.elementType === "flat";
  const condMm = flat ? (inp.stripWmm ?? NaN) : inp.diameterMm;
  const rad = flat ? condMm / 4000 : condMm / 2000;
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  const lossM = lossPerMeter(rho, inp.freqMHz * 1e6, rad);
  const dm = taperedPolyline([[B, A / 2, 0], [0, A / 2, 0], [0, -A / 2, 0], [B, -A / 2, 0]], lambdaM,
    { tipStart: true, tipEnd: true, splitMid: [1] });
  const rm = taperedPolyline([[E - D, A / 2, 0], [E, A / 2, 0], [E, -A / 2, 0], [E - D, -A / 2, 0]], lambdaM,
    { tipStart: true, tipEnd: true });
  return [
    { pts: dm.pts, radius: rad, seglen: 1e9, seglens: dm.seglens, lossPerM: lossM },
    { pts: rm.pts, radius: rad, seglen: 1e9, seglens: rm.seglens, lossPerM: lossM },
  ];
}

/** Входной импеданс Moxon на частоте fMHz (без ДН). */
export function moxonImpedance(inp: MoxonInput, fMHz = inp.freqMHz, meshFreqMHz = inp.freqMHz): { re: number; im: number } {
  return solve3D(moxonWires(inp, meshFreqMHz), fMHz, { point: [0, 0, 0] }, { skipPattern: true }).Zin;
}

export function computeMoxon(inp: MoxonInput): PatternResult {
  return withDisplayFloor(inp, computeMoxonModel);
}
