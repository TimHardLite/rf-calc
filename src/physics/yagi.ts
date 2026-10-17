import { withDisplayFloor } from "./display";
// Яги / волновой канал — расчёт методом моментов (см. mom.ts).
// Вход: список элементов (тип, длина, диаметр, позиция по буму от 1-го = 0),
// частота. Выход: две плоскости (E/азимут и H/угол места) + Ga/F-B/Z/КСВ.

import { C_LIGHT, solve3D, type Wire } from "./mom3d";
import { centerFedElement, estimateElementSegments, MAX_ELEMENT_UNKNOWNS, tooManyUnknownsNote } from "./segment";
import { lossPerMeter, resistivityOf, lossNote } from "./conductor";
import type { PatternResult, PatternPoint } from "./types";
import { toDb, halfPowerBeamwidth, frontToBack, rearSectorDb, convergenceNote, elevationCutXZ } from "./mathutil";
import { mismatchLossDb, qFromImpedanceSlope, impedanceUsable } from "./rfutil";
import { sweepBand, type SweepPoint } from "./sweep";
import { boomCorrectionMm } from "./boom";
import { thinWireWarnings } from "./wirevalid";

export type YagiElemType = "reflector" | "driven" | "director";

export interface YagiElement {
  type: YagiElemType;
  /** Полная длина элемента, мм. */
  lengthMm: number;
  /** Диаметр проводника, мм. */
  diameterMm: number;
  /** Позиция центра по буму от 1-го элемента (=0), мм. */
  positionMm: number;
}

export interface YagiInput {
  freqMHz: number;
  elements: YagiElement[];
  floorDb: number;
  /** Диаметр (сторона) металлического бума, мм. 0 или крепление "none" — бум не учитывается. */
  boomDiaMm?: number;
  /** "round" | "square" — форма профиля бума. */
  boomShape?: string;
  /** Тип крепления элементов к буму; "none" — не учитывать бум. */
  mounting?: string;
  /** Зазор в точке питания активного элемента — расстояние между торцами двух его
   *  плеч, мм. Длина активного в списке элементов — полная, от кончика до кончика,
   *  ВКЛЮЧАЯ зазор. 0 — зазор не задан (сплошной или петлевой вибратор). */
  feedGapMm?: number;
  /** Металл элементов (conductor.ts): pec | cu | al | brass | steel | custom. */
  material?: string;
  /** ρ, Ом·мм²/м — при material = custom. */
  rhoCustom?: number;
}

/** Длина одного плеча активного элемента: (L_от_кончика_до_кончика − зазор) / 2. */
export function drivenArmMm(totalMm: number, gapMm: number): number {
  return (totalMm - Math.max(0, gapMm)) / 2;
}

function computeYagiModel(inp: YagiInput): PatternResult {
  const notes: string[] = [];
  const f = inp.freqMHz;
  const lambdaMm = (C_LIGHT / (f * 1e6)) * 1000;

  const drivenIdx = inp.elements.findIndex((e) => e.type === "driven");
  if (drivenIdx < 0) {
    return emptyYagi(f, lambdaMm, ["⚠ Не задан активный (driven) элемент — укажите ровно один."]);
  }
  if (inp.elements.filter((e) => e.type === "driven").length > 1) {
    notes.push("⚠ Активных элементов больше одного — питается первый из них.");
  }
  if (inp.elements.some((e) => !(e.lengthMm > 0) || !(e.diameterMm > 0))) {
    return emptyYagi(f, lambdaMm, ["⚠ У всех элементов длина и диаметр должны быть > 0."]);
  }

  // --- Учёт металлического бума ---------------------------------------------
  // Введённые длины — ФИЗИЧЕСКИЕ (как отрезано). MoM считает элементы в свободном
  // пространстве, бума в модели нет. Металлический бум электрически удлиняет
  // элемент на ΔL, поэтому для эквивалентности из физической длины ΔL вычитается.
  const bc = boomCorrectionMm(
    inp.boomDiaMm ?? 0, lambdaMm, inp.mounting ?? "none", inp.boomShape ?? "square",
  );
  const boomDelta = bc.deltaMm;
  if (bc.warn) notes.push(bc.warn);
  if (boomDelta > 0) {
    const shortest = Math.min(...inp.elements.map((e) => e.lengthMm));
    if (boomDelta >= shortest) {
      return emptyYagi(f, lambdaMm, [
        `⚠ Поправка на бум (${boomDelta.toFixed(1)} мм) не меньше самого короткого элемента ` +
        `(${shortest.toFixed(1)} мм). Проверьте диаметр бума и тип крепления.`,
      ]);
    }
    notes.push(
      `Бум ⌀${inp.boomDiaMm} мм, крепление «${mountingLabel(inp.mounting ?? "none")}»: из каждой ` +
      `физической длины вычтено ΔL = ${boomDelta.toFixed(2)} мм — это эквивалентная длина элемента ` +
      `в свободном пространстве, на которой и работает MoM. Резонанс без этой поправки был бы ` +
      `завышен примерно на ${(100 * boomDelta / shortest).toFixed(1)} % по частоте.`,
    );
  } else if ((inp.mounting ?? "none") === "none") {
    notes.push(
      "Бум не задан: расчёт соответствует элементам в свободном пространстве — " +
      "то есть диэлектрическому буму либо изолированному креплению без контакта. " +
      "Для металлического бума задайте его диаметр и тип крепления.",
    );
  }

  // сегментация: нечётное число, ~ длина/λ * 40, в пределах [11, 41]
  // --- Зазор в точке питания активного элемента ------------------------------
  // Активный элемент — разрезной вибратор: две трубки-плеча, между торцами зазор g,
  // на который подаётся питание. Длина в таблице — ОТ КОНЧИКА ДО КОНЧИКА (с зазором).
  // Физика (проверено NEC2): фидер перемыкает зазор, ток течёт по всей длине, поэтому
  // электрически решает полная длина, а сам зазор при g ≪ λ влияет на Z слабо.
  // Модель: узлы сетки ставятся так, что базисная функция питающего узла охватывает
  // РОВНО зазор (два полусегмента по g/2), плечи дробятся как обычно.
  const drv = inp.elements[drivenIdx];
  const gap = Math.max(0, inp.feedGapMm ?? 0);
  const mount = inp.mounting ?? "none";
  let drivenDelta = boomDelta;
  if (gap > 0 && boomDelta > 0 && (mount === "through-contact" || mount === "ontop-contact")) {
    // Разрезной вибратор НЕ МОЖЕТ иметь контакт с металлическим бумом: обе половины
    // замкнулись бы через бум накоротко, и питание пропало бы. Значит, активный в любом
    // случае изолирован от бума, и «контактная» поправка к нему неприменима.
    if (mount === "through-contact") {
      drivenDelta = boomCorrectionMm(
        inp.boomDiaMm ?? 0, lambdaMm, "through-insulated", inp.boomShape ?? "square",
      ).deltaMm;
      notes.push(
        `Активный элемент разрезной (зазор ${gap} мм), поэтому контакта с бумом у него быть не может — ` +
        `иначе обе половины замкнулись бы через бум. Для него взята поправка для ИЗОЛИРОВАННОГО ` +
        `крепления сквозь бум: ΔL = ${drivenDelta.toFixed(2)} мм (у пассивных элементов — ${boomDelta.toFixed(2)} мм).`,
      );
    } else {
      const upper = boomCorrectionMm(
        inp.boomDiaMm ?? 0, lambdaMm, "through-insulated", inp.boomShape ?? "square",
      ).deltaMm;
      drivenDelta = 0;
      notes.push(
        `⚠ Активный элемент разрезной (зазор ${gap} мм) и крепится сверху бума — контакта с бумом у него ` +
        `быть не может. Опубликованной поправки для изолированного крепления СВЕРХУ бума нет, поэтому ` +
        `для активного она не вводится (0 мм). Истинное значение лежит между 0 и ${upper.toFixed(2)} мм ` +
        `(изолированное крепление сквозь бум); сдвиг резонанса активного из-за этого — не более ` +
        `${(100 * upper / drv.lengthMm).toFixed(2)} %. Уточняйте по КСВ на стенде.`,
      );
    }
  }
  if (gap > 0) {
    if (gap >= drv.lengthMm) {
      return emptyYagi(f, lambdaMm, [
        `⚠ Зазор активного элемента (${gap} мм) не меньше его полной длины (${drv.lengthMm} мм). ` +
        `Длина активного вводится от кончика до кончика, включая зазор.`,
      ]);
    }
    const arm = drivenArmMm(drv.lengthMm, gap);
    notes.push(
      `Активный элемент: от кончика до кончика ${drv.lengthMm} мм, зазор ${gap} мм → ` +
      `ДВА ПЛЕЧА ПО ${arm.toFixed(2)} мм (суммарно ${(2 * arm).toFixed(2)} мм металла). ` +
      `Именно по длине плеча режутся трубки.`,
    );
    if (gap / lambdaMm > 0.05) {
      notes.push(
        `⚠ Зазор ${(gap / lambdaMm).toFixed(3)}λ — уже не мал по сравнению с длиной волны. Геометрия ` +
        `узла питания (выводы, пайка, симметрирующее устройство) начинает влиять на импеданс, а в ` +
        `модели зазор перемкнут идеальным источником. Импеданс — ориентировочный.`,
      );
    }
  }

  const lambdaM = lambdaMm / 1000;
  {
    const est = inp.elements.reduce((acc, e) => acc + estimateElementSegments(e.lengthMm / 1000, lambdaM), 0);
    if (est > MAX_ELEMENT_UNKNOWNS) {
      const maxL = Math.max(...inp.elements.map((e) => e.lengthMm)) / lambdaMm;
      return emptyYagi(f, lambdaMm, [tooManyUnknownsNote(est, maxL)]);
    }
  }
  // Металл элементов: потери скин-эффекта (как Wire Loss в EZNEC / LD 5 в NEC-2).
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  if (inp.material === "custom" && rho == null) notes.push("⚠ Материал «своё значение», но ρ не задано (или ≤ 0) — потери не учтены.");
  // Модель: каждый элемент — прямой провод вдоль Y в точке x = позиция; сетка сгущается к
  // кончикам (segment.ts), у активного узел питания ТОЧНО в центре, при зазоре — два
  // полусегмента g/2. Решатель — mom3d (точное ядро трубки, Галёркин PWS).
  const wiresFor = (): { wires: Wire[]; maxSeg: number[] } => {
    const wires: Wire[] = [], maxSeg: number[] = [];
    inp.elements.forEach((e, i) => {
      const isDrv = i === drivenIdx;
      const Leff = (e.lengthMm - (isDrv ? drivenDelta : boomDelta)) / 1000;
      const radiusM = e.diameterMm / 2000;
      const g = isDrv && gap > 0 && gap < e.lengthMm ? gap / 1000 : 0;
      const el = centerFedElement([e.positionMm / 1000, 0, 0], [0, 1, 0], Leff, lambdaM, g);
      wires.push({
        pts: el.pts, radius: radiusM, seglen: 1e9, seglens: el.seglens,
        lossPerM: lossPerMeter(rho, f * 1e6, radiusM),
      });
      maxSeg.push(el.maxSeg);
    });
    return { wires, maxSeg };
  };
  const { wires, maxSeg } = wiresFor();
  const feedIdx = inp.elements.filter((e) => e.type === "driven").length ? drivenIdx : 0;
  const feedPt: [number, number, number] = [inp.elements[feedIdx].positionMm / 1000, 0, 0];
  notes.push(...thinWireWarnings(
    inp.elements.map((e, i) => ({
      radiusM: e.diameterMm / 2000, maxSegM: maxSeg[i],
      label: elemLabel(e.type, inp.elements, i),
    })),
    lambdaM,
  ));

  // Потери считаются на рабочей частоте: R′ зависит от f как √f; для оценки полосы
  // (±2 %) это изменение пренебрежимо.
  const r = solve3D(wires, f, { point: feedPt });

  // Азимут (E-плоскость): theta=90, phi 0..360. Главный луч — вдоль бума (phi=0) → 0° сверху.
  const az: PatternPoint[] = [];
  for (let a = 0; a < 360; a += 1) {
    const U = r.powerAt(90, a) / r.Umax;
    az.push({ angleDeg: a, valueDb: toDb(U, inp.floorDb) });
  }
  // Угол места (H-плоскость): плоскость бум–вертикаль, 0° — вперёд по лучу,
  // 90° — зенит, 180° — назад, 270° — надир (единая договорённость, mathutil).
  const el = elevationCutXZ(r.powerAt, r.Umax, inp.floorDb);

  notes.push(
    "Отсчёт углов на диаграммах: азимут — 0° вперёд по буму (главный луч), 90° вбок, 180° назад; "
    + "угол места — 0° вперёд по лучу, 90° зенит, 180° назад, 270° надир.",
  );
  const R = r.Zin.re, X = r.Zin.im;
  const zOk = impedanceUsable(R, X);
  if (!zOk) {
    notes.push(
      `⚠ Расчёт импеданса развалился (R = ${R.toExponential(1)} Ом; у пассивной антенны R > 0). ` +
      `Импеданс, КСВ и полоса не приводятся — проверьте геометрию элементов. Форма ДН при этом ` +
      `остаётся осмысленной.`,
    );
  }
  const swr = zOk ? swr50(R, X) : NaN;
  const fb = frontToBack(az);

  // --- Полоса: ПРЯМОЙ СВИП по частоте (раньше — оценка по добротности) ----------
  // Сетка построена на рабочей частоте и переиспользуется: геометрия не меняется,
  // меняется только λ в ядре. Одна точка — расчёт импеданса без ДН (десятки мс).
  let qf: number | undefined, bandLo: number | undefined, bandHi: number | undefined;
  let sweepPts: SweepPoint[] | undefined, swrMinF: number | undefined, swrMin: number | undefined;
  try {
    if (!zOk) throw new Error("degenerate");
    const d = 0.02;
    const zLo = solve3D(wires, f * (1 - d), { point: feedPt }, { skipPattern: true }).Zin;
    const zHi = solve3D(wires, f * (1 + d), { point: feedPt }, { skipPattern: true }).Zin;
    const Q = qFromImpedanceSlope(f, R, f * (1 - d), zLo, f * (1 + d), zHi);
    if (Q) qf = Q;
    // Для крупных моделей свип короче: точка свипа — это полный расчёт импеданса.
    const nUnk = wires.reduce((a, w) => a + (w.seglens?.length ?? 0), 0);
    const sw = sweepBand((ff) => solve3D(wires, ff, { point: feedPt }, { skipPattern: true }).Zin, f,
      { points: nUnk > 300 ? 9 : 13, refine: nUnk > 300 ? 2 : 3 });
    sweepPts = sw.points; swrMinF = sw.minFreqMHz; swrMin = sw.minSwr;
    bandLo = sw.lo; bandHi = sw.hi;
    if (sw.wider) {
      notes.push(
        `Полоса по КСВ ≤ ${sw.limit} шире окна свипа (±8 % от ${f} МГц) — в таблице полосы ` +
        `показана только её часть внутри окна.`,
      );
    }
    if (Math.abs(swrMinF - f) / f > 0.005) {
      notes.push(
        `Минимум КСВ (${swrMin.toFixed(2)}) приходится на ${swrMinF.toFixed(1)} МГц, а не на ` +
        `заданные ${f} МГц — настройку можно сдвинуть, изменив длину активного элемента.`,
      );
    }
  } catch { /* полоса не критична — без неё расчёт остаётся валидным */ }

  if (zOk && swr > 1.6) {
    notes.push(
      `КСВ ${swr.toFixed(2)} к 50 Ом хуже 1.6, поэтому полоса по этому критерию не приводится — ` +
      `её нет. Импеданс яги у активного элемента обычно далёк от 50 Ом: это нормально, ` +
      `согласование делают петлевым вибратором (×≈4) или согласующим устройством.`,
    );
  }

  return {
    antennaKind: "yagi",
    title: `Диаграмма направленности яги · ${f} МГц`,
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
      frontToBackDb: fb,
      rearSectorDb: rearSectorDb(az),
      impedanceR: zOk ? R : undefined,
      impedanceX: zOk ? X : undefined,
      swr50: zOk ? swr : undefined,
      avgGain: r.avgGain,
      mismatchDb: zOk ? mismatchLossDb(R, X, 50) : undefined,
      qFactor: qf,
      bandLowMHz: bandLo,
      bandHighMHz: bandHi,
      swrCriterion: 1.6,
      sweep: sweepPts,
      swrMinFreqMHz: swrMinF,
      swrMin,
      efficiency: rho != null ? r.efficiency : undefined,
      gainDbi: r.gainDbi + (r.efficiency > 0 ? 10 * Math.log10(r.efficiency) : 0),
      polarization: "Линейная (вдоль элементов)",
      hpbwEDeg: halfPowerBeamwidth(az),
      hpbwHDeg: halfPowerBeamwidth(el),
      hpbwELabel: "E (азимут)",
      hpbwHLabel: "H (угол места)",
    },
    notes: [
      "Расчёт методом моментов (Галёркин, кусочно-синусоидальный базис, точное ядро трубки, " +
        "сетка со сгущением к кончикам элементов), свободное пространство.",
      lossNote(inp.material, rho, f * 1e6, r.efficiency),
      "Активный элемент моделируется прямым вибратором; для складчатого (folded) импеданс ×≈4, форма ДН та же.",
      ...(convergenceNote(r.avgGain) ? [convergenceNote(r.avgGain)!] : []),
      ...notes,
    ],
  };
}

function swr50(R: number, X: number): number {
  const z0 = 50;
  const num = Math.sqrt((R - z0) ** 2 + X ** 2);
  const den = Math.sqrt((R + z0) ** 2 + X ** 2);
  const g = num / den;
  return (1 + g) / (1 - g);
}

function emptyYagi(f: number, lambdaMm: number, notes: string[]): PatternResult {
  return {
    antennaKind: "yagi",
    title: `Диаграмма направленности яги · ${f} МГц`,
    planes: [{ label: "E-плоскость (азимут)", points: [] }],
    referencePlaneIndex: 0,
    metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null },
    notes,
  };
}

/** Человекочитаемое название типа крепления (для примечаний). */
function mountingLabel(m: string): string {
  switch (m) {
    case "through-contact": return "сквозь бум, контакт";
    case "through-insulated": return "сквозь бум, изолированно";
    case "ontop-contact": return "сверху бума, контакт";
    case "dielectric": return "диэлектрический бум";
    default: return "без бума";
  }
}

/** Подпись элемента для сообщений («рефлектор», «активный», «директор D3»). */
function elemLabel(type: string, all: YagiElement[], idx: number): string {
  if (type === "reflector") return "рефлектор";
  if (type === "driven") return "активный";
  const n = all.slice(0, idx + 1).filter((e) => e.type === "director").length;
  return `директор D${n}`;
}

// ---------------------------------------------------------------------------------
// БЫСТРЫЙ РАСЧЁТ ИМПЕДАНСА ЯГИ (для оптимизатора длин, src/opt).
// Та же физика, что в computeYagi: поправка на бум, зазор питания, потери в металле,
// сетка со сгущением к кончикам. Отличие одно — не считается ДН (в разы быстрее).
// Сетка строится по λ РАБОЧЕЙ частоты и переиспользуется на всех частотах свипа,
// чтобы кривая КСВ не «ступенилась» из-за смены дискретизации.
// ---------------------------------------------------------------------------------

/** Геометрия яги в виде проводов для mom3d. */
export function yagiWires(inp: YagiInput, meshFreqMHz = inp.freqMHz): { wires: Wire[]; feedPt: [number, number, number] } {
  const lambdaMm = (C_LIGHT / (inp.freqMHz * 1e6)) * 1000;
  const meshLambdaM = C_LIGHT / (meshFreqMHz * 1e6);
  const drivenIdx = Math.max(0, inp.elements.findIndex((e) => e.type === "driven"));
  const boom = boomCorrectionMm(inp.boomDiaMm ?? 0, lambdaMm, inp.mounting ?? "none", inp.boomShape ?? "square");
  const gap = Math.max(0, inp.feedGapMm ?? 0);
  const mount = inp.mounting ?? "none";
  let drivenDelta = boom.deltaMm;
  if (gap > 0 && boom.deltaMm > 0 && (mount === "through-contact" || mount === "ontop-contact")) {
    drivenDelta = mount === "through-contact"
      ? boomCorrectionMm(inp.boomDiaMm ?? 0, lambdaMm, "through-insulated", inp.boomShape ?? "square").deltaMm
      : 0;
  }
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  const wires: Wire[] = inp.elements.map((e, i) => {
    const isDrv = i === drivenIdx;
    const Leff = (e.lengthMm - (isDrv ? drivenDelta : boom.deltaMm)) / 1000;
    const radiusM = e.diameterMm / 2000;
    const g = isDrv && gap > 0 && gap < e.lengthMm ? gap / 1000 : 0;
    const el = centerFedElement([e.positionMm / 1000, 0, 0], [0, 1, 0], Math.max(Leff, 1e-4), meshLambdaM, g);
    return {
      pts: el.pts, radius: radiusM, seglen: 1e9, seglens: el.seglens,
      lossPerM: lossPerMeter(rho, inp.freqMHz * 1e6, radiusM),
    };
  });
  return { wires, feedPt: [inp.elements[drivenIdx].positionMm / 1000, 0, 0] };
}

/** Входной импеданс яги на частоте fMHz (без расчёта ДН). */
export function yagiImpedance(inp: YagiInput, fMHz = inp.freqMHz, meshFreqMHz = inp.freqMHz): { re: number; im: number } {
  const { wires, feedPt } = yagiWires(inp, meshFreqMHz);
  return solve3D(wires, fMHz, { point: feedPt }, { skipPattern: true }).Zin;
}

export function computeYagi(inp: YagiInput): PatternResult {
  return withDisplayFloor(inp, computeYagiModel);
}
