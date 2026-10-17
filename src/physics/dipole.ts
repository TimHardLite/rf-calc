import { withDisplayFloor } from "./display";
// Модель симметричного вибратора (диполя).
// ДН, КНД, импеданс и КПД — методом моментов (mom3d.ts: точное ядро трубки, сгущение
// сетки к кончикам) по фактической геометрии: длина, толщина, зазор, металл.
// Классическая формула синусоидального тока F(θ) = [cos(β·cosθ) − cos β]/sinθ,
// β = π·L/λ (Марков, Balanis), остаётся запасным вариантом, если геометрия вне
// области проволочной модели (L > 3λ).

import { C0, type PatternResult, type PatternPoint } from "./types";
import {
  DEG,
  EPS,
  toDb,
  directivityAxisymmetric,
  halfPowerBeamwidth,
  convergenceNote,
} from "./mathutil";
import { solve3D, type Wire } from "./mom3d";
import { vswr, mismatchLossDb, qFromImpedanceSlope, impedanceUsable } from "./rfutil";
import { sweepBand, type SweepPoint } from "./sweep";
import { thinWireWarnings } from "./wirevalid";
import { centerFedElement } from "./segment";
import { lossPerMeter, resistivityOf, lossNote } from "./conductor";

export interface DipoleInput {
  freqMHz: number;
  /** Полная физическая длина вибратора (оба плеча), мм. */
  lengthMm: number;
  /** Тип проводника: "wire" (круглый) | "flat" (плоская планка). */
  elementType: string;
  /** Диаметр круглого проводника, мм (влияет на импеданс и полосу). */
  diameterMm: number;
  /** Ширина плоской дорожки, мм. */
  stripWmm: number;
  /** Зазор (разрез) в точке питания, мм. Длина lengthMm — от кончика до кончика, с зазором. 0 — не задан. */
  feedGapMm?: number;
  /** Металл проводника (см. conductor.ts): pec | cu | al | brass | steel | custom. */
  material?: string;
  /** ρ, Ом·мм²/м — при material = custom. */
  rhoCustom?: number;
  /** Нижний предел шкалы дБ (обычно −40 или −60). */
  floorDb: number;
}

/**
 * Проволочная модель вибратора для метода моментов. ОДНА на поверочный расчёт и синтез.
 * Вибратор вдоль оси Z, центр в начале координат. lenM — полная длина от кончика до
 * кончика (включая зазор), gapM — зазор в точке питания: при зазоре сетка строится так,
 * что базис питающего узла охватывает ровно зазор (два полусегмента g/2). Точное ядро
 * трубки устойчиво при любом отношении g/a (проверено: баланс энергии 1.0000 от g = 0.25a
 * до 10a), поэтому зазор моделируется всегда. Узел питания — точно в центре; сетка
 * сгущается к кончикам (segment.ts).
 */
export function dipoleWire(
  lenM: number, radiusM: number, lambdaM: number, gapM = 0, lossPerM = 0,
): { wire: Wire; gapModelled: boolean; maxSeg: number } {
  const gapModelled = gapM > 0 && gapM < lenM;
  const e = centerFedElement([0, 0, 0], [0, 0, 1], lenM, lambdaM, gapModelled ? gapM : 0);
  return {
    wire: { pts: e.pts, radius: radiusM, seglen: 1e9, seglens: e.seglens, lossPerM },
    gapModelled,
    maxSeg: e.maxSeg,
  };
}

/** Входное сопротивление вибратора методом моментов (тот же решатель, что везде). */
export function dipoleZ(
  lenM: number, radiusM: number, fMHz: number, gapM = 0, rhoOhmM: number | null = null,
): { re: number; im: number } {
  const lambdaM = C0 / (fMHz * 1e6);
  const { wire } = dipoleWire(lenM, radiusM, lambdaM, gapM, lossPerMeter(rhoOhmM, fMHz * 1e6, radiusM));
  return solve3D([wire], fMHz, { point: [0, 0, 0] }, { skipPattern: true }).Zin;
}

/** Нормированное поле F(θ). θ — радианы от оси. */
function dipoleField(thetaRad: number, betaHalf: number): number {
  const s = Math.sin(thetaRad);
  if (Math.abs(s) < EPS) return 0; // нуль вдоль оси
  return (Math.cos(betaHalf * Math.cos(thetaRad)) - Math.cos(betaHalf)) / s;
}

function computeDipoleModel(inp: DipoleInput): PatternResult {
  const notes: string[] = [];
  const f = inp.freqMHz;
  const lambdaM = C0 / (f * 1e6);
  const lambdaMm = lambdaM * 1000;
  const Lrel = inp.lengthMm / lambdaMm; // L/λ
  const betaHalf = Math.PI * Lrel;

  const flat = inp.elementType === "flat";
  // Плоская полоска шириной w эквивалентна круглому проводу радиусом w/4.
  const radiusM = (flat ? inp.stripWmm / 4 : inp.diameterMm / 2) / 1000;
  const lenM = inp.lengthMm / 1000;
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  if (inp.material === "custom" && rho == null) {
    notes.push("⚠ Материал «своё значение», но ρ не задано (или ≤ 0) — потери не учтены.");
  }
  const lossM = lossPerMeter(rho, f * 1e6, radiusM);

  // --- Зазор (разрез) в точке питания ---
  const gapMm = Math.max(0, inp.feedGapMm ?? 0);
  let gapM = gapMm / 1000;
  if (gapMm > 0) {
    if (gapMm >= inp.lengthMm) {
      notes.push(`⚠ Зазор ${gapMm} мм не меньше полной длины вибратора ${inp.lengthMm} мм — зазор не учтён. Длина вводится от кончика до кончика, включая зазор.`);
      gapM = 0;
    } else {
      const arm = (inp.lengthMm - gapMm) / 2;
      notes.push(
        `Разрезной вибратор: от кончика до кончика ${inp.lengthMm} мм, зазор ${gapMm} мм → ` +
        `ДВА ПЛЕЧА ПО ${arm.toFixed(2)} мм. Зазор учтён в модели: базис питания охватывает ровно зазор.`,
      );
      if (gapMm / lambdaMm > 0.05) {
        notes.push(`⚠ Зазор ${(gapMm / lambdaMm).toFixed(3)}λ уже не мал — геометрия узла питания влияет на импеданс, результат ориентировочный.`);
      }
    }
  }

  // --- Метод моментов: ток, ДН, КНД, импеданс, КПД ---
  let Z: { re: number; im: number } | null = null;
  let swr: number | undefined, qf: number | undefined;
  let bandLo: number | undefined, bandHi: number | undefined, mism: number | undefined;
  let sweepPts: SweepPoint[] | undefined, swrMinF: number | undefined, swrMin: number | undefined;
  let ePlane: PatternPoint[] = [], hPlane: PatternPoint[] = [];
  let directivityDbi = 0, eff: number | undefined, avgGain: number | undefined;
  let momOk = false;

  if (radiusM > 0 && lenM > 0 && Lrel <= 3) {
    const { wire, maxSeg } = dipoleWire(lenM, radiusM, lambdaM, gapM, lossM);
    notes.push(...thinWireWarnings([{ radiusM, maxSegM: maxSeg, label: "вибратор" }], lambdaM));
    try {
      const r = solve3D([wire], f, { point: [0, 0, 0] });
      Z = r.Zin;
      if (!impedanceUsable(Z.re, Z.im)) {
        notes.push(
          `⚠ Расчёт импеданса развалился (получилось R = ${Z.re.toExponential(1)} Ом, а у пассивной ` +
          `антенны R > 0). Геометрия вырождена для проволочной модели — импеданс, КСВ и полоса ` +
          `не приводятся. Проверьте длину и толщину проводника.`,
        );
        Z = null;
      } else {
        momOk = true;
        // Вибратор вдоль Z. E-плоскость: 0° — вдоль оси, отсчёт по кругу; H-плоскость — θ = 90°.
        for (let deg = 0; deg < 360; deg++) {
          const th = deg <= 180 ? deg : 360 - deg, ph = deg <= 180 ? 0 : 180;
          ePlane.push({ angleDeg: deg, valueDb: toDb(r.powerAt(th, ph) / r.Umax, inp.floorDb) });
          hPlane.push({ angleDeg: deg, valueDb: toDb(r.powerAt(90, deg) / r.Umax, inp.floorDb) });
        }
        directivityDbi = r.gainDbi;
        eff = r.efficiency;
        avgGain = r.avgGain;
        swr = vswr(Z.re, Z.im, 50);
        mism = mismatchLossDb(Z.re, Z.im, 50);
        // Добротность — справочно (производная импеданса), полоса — прямым свипом.
        const d = 0.02;
        const zLo = dipoleZ(lenM, radiusM, f * (1 - d), gapM, rho);
        const zHi = dipoleZ(lenM, radiusM, f * (1 + d), gapM, rho);
        const Q = qFromImpedanceSlope(f, Z.re, f * (1 - d), zLo, f * (1 + d), zHi);
        if (Q) qf = Q;
        const sw = sweepBand((ff) => dipoleZ(lenM, radiusM, ff, gapM, rho), f);
        sweepPts = sw.points; swrMinF = sw.minFreqMHz; swrMin = sw.minSwr;
        bandLo = sw.lo; bandHi = sw.hi;
        if (Math.abs(sw.minFreqMHz - f) / f > 0.005) {
          notes.push(
            `Минимум КСВ (${sw.minSwr.toFixed(2)}) приходится на ${sw.minFreqMHz.toFixed(1)} МГц, ` +
            `а не на заданные ${f} МГц: на этой частоте вибратор не согласован с 50-омным трактом. ` +
            `Резонанс сдвигается длиной — в режиме «Проектирование» она подбирается автоматически.`,
          );
        }
      }
    } catch { Z = null; momOk = false; }
  }

  if (!momOk) {
    // Запасной вариант — классическая ДН синусоидального тока (без импеданса).
    let fmax = 0;
    for (let d = 1; d <= 179; d++) fmax = Math.max(fmax, Math.abs(dipoleField(d * DEG, betaHalf)));
    if (fmax < EPS) fmax = 1;
    ePlane = []; hPlane = [];
    for (let deg = 0; deg < 360; deg++) {
      const theta = deg <= 180 ? deg * DEG : (360 - deg) * DEG;
      const fld = Math.abs(dipoleField(theta, betaHalf)) / fmax;
      ePlane.push({ angleDeg: deg, valueDb: toDb(fld * fld, inp.floorDb) });
      hPlane.push({ angleDeg: deg, valueDb: 0 });
    }
    const D = directivityAxisymmetric((th) => {
      const v = Math.abs(dipoleField(th, betaHalf)) / fmax;
      return v * v;
    });
    directivityDbi = D > EPS ? 10 * Math.log10(D) : 0;
    notes.push("ДН построена по классической формуле синусоидального тока (проволочная модель к этой геометрии неприменима).");
  }

  if (Lrel > 1.4) {
    notes.push(`L/λ = ${Lrel.toFixed(2)} — длинный вибратор: ДН многолепестковая, проверьте геометрию.`);
  }
  notes.push(
    "Отсчёт углов: 0° — вдоль оси вибратора (там нуль излучения), 90° — поперёк оси (максимум). " +
    "H-плоскость — плоскость, перпендикулярная вибратору: там излучение одинаково во все стороны.",
  );
  const typeName = flat ? "плоская планка (PCB)" : "круглый провод";
  notes.push(`Тип проводника: ${typeName}. Толщина проводника почти не влияет на форму ДН — она определяет импеданс и полосу.`);

  if (Z) {
    notes.push(
      `ДН, КНД, импеданс, КСВ и полоса посчитаны методом моментов по фактической геометрии ` +
      `(${flat ? `дорожка ${inp.stripWmm} мм → эквивалентный Ø ${(inp.stripWmm / 2).toFixed(1)} мм` : `Ø ${inp.diameterMm} мм`}). ` +
      `Свободное пространство: рядом стоящий металл, корпус и кабель сдвинут эти значения.`,
    );
    notes.push(lossNote(inp.material, rho, f * 1e6, eff));
    if (flat) {
      notes.push(
        "⚠ Диэлектрик платы в расчёте НЕ учитывается — дорожка считается в воздухе. Подложка " +
        "(FR-4 и т.п.) увеличивает электрическую длину вибратора: резонанс смещается ВНИЗ по " +
        "частоте, тем сильнее, чем толще плата и выше её εr. Величину смещения эта модель не даёт — " +
        "после изготовления подстройте длину по измерению КСВ.",
      );
    }
    if (swr !== undefined && swr > 1.6) {
      notes.push(
        `КСВ ${swr.toFixed(2)} хуже 1.6 — полоса по этому критерию не приводится, её просто нет: ` +
        `вибратор не согласован с 50 Ом. Подберите длину (в режиме «Проектирование» она ищется по резонансу) ` +
        `или примените согласующее устройство.`,
      );
    }
  }
  const cnv = avgGain != null ? convergenceNote(avgGain) : null;
  if (cnv) notes.push(cnv);

  const gain = eff != null && Number.isFinite(eff) && eff > 0 ? directivityDbi + 10 * Math.log10(eff) : directivityDbi;
  return {
    antennaKind: "dipole",
    title: `Диаграмма направленности диполя · ${f} МГц`,
    planes: [
      { label: "E-плоскость (плоскость вибратора)", points: ePlane },
      { label: "H-плоскость (всенаправленная)", points: hPlane },
    ],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f,
      lambdaMm,
      directivityDbi,
      hpbwDeg: halfPowerBeamwidth(ePlane),
      sllDb: null,
      frontToBackDb: null,
      impedanceR: Z?.re,
      impedanceX: Z?.im,
      swr50: swr,
      mismatchDb: mism,
      qFactor: qf,
      sweep: sweepPts,
      swrMinFreqMHz: swrMinF,
      swrMin,
      bandLowMHz: bandLo,
      bandHighMHz: bandHi,
      swrCriterion: 1.6,
      avgGain,
      efficiency: rho != null ? eff : undefined,
      gainDbi: gain,
      polarization: "Линейная (вдоль оси вибратора)",
      hpbwEDeg: halfPowerBeamwidth(ePlane),
      hpbwHDeg: null,
      hpbwELabel: "E (плоскость вибратора)",
      hpbwHLabel: "H — всенаправленная",
    },
    notes,
  };
}

export function computeDipole(inp: DipoleInput): PatternResult {
  return withDisplayFloor(inp, computeDipoleModel);
}
