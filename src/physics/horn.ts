import { withDisplayFloor } from "./display";
// Пирамидальный рупор — модель Balanis («Antenna Theory», гл. 13) С УЧЁТОМ
// КВАДРАТИЧНОЙ ФАЗОВОЙ ОШИБКИ РАСКРЫВА.
//
// ПОЧЕМУ ЭТО ВАЖНО. У реального рупора поле в раскрыве не синфазно: путь от горловины
// до края раскрыва длиннее, чем до центра, что даёт набег фазы ≈ k·x'²/(2ρ). Именно
// фазовая ошибка ограничивает усиление — у оптимального рупора КИП падает до ≈ 0.51
// против 0.81 у синфазного раскрыва (потеря 2 дБ). Модель без фазовой ошибки завышает
// усиление и занижает ширину лепестков, поэтому длины раскрыва ρe и ρh здесь —
// полноценные входные данные, а не украшение.
//
// Поле в раскрыве:  E(x',y') = E₀·cos(πx'/a₁)·exp[−jk(x'²/(2ρh) + y'²/(2ρe))]
//
// Дальнее поле (13-27a, 13-12): |E| ∝ (1+cosθ)/2 · |I₁(kx)| · |I₂(ky)|
//   I₁ — интеграл по широкой стенке (косинусное распределение + фаза), два члена Френеля;
//   I₂ — по узкой стенке (равномерное распределение + фаза), один член Френеля.
//
// КНД (13-52, с сокращением размеров волновода):
//   D = 8π·ρe·ρh/(a₁·b₁) · [C²(x)+S²(x)] · {[C(u)−C(v)]²+[S(u)−S(v)]²}
//   x = b₁/√(2λρe),  u = (1/√2)[√(λρh)/a₁ + a₁/√(λρh)],  v = (1/√2)[√(λρh)/a₁ − a₁/√(λρh)]
//
// Если длины раскрыва не заданы, считается синфазный раскрыв — результат помечается
// как ВЕРХНЯЯ ОЦЕНКА, а не как расчёт реального рупора.

import { C0, type PatternResult, type PatternPoint } from "./types";
import { DEG, EPS, sinc, toDb, halfPowerBeamwidth } from "./mathutil";
import { fresnelCS } from "./fresnel";

export interface HornInput {
  freqMHz: number;
  /** Раскрыв в H-плоскости (широкая стенка) a₁, мм. */
  apertureA: number;
  /** Раскрыв в E-плоскости (узкая стенка) b₁, мм. */
  apertureB: number;
  /** Длина раскрыва (наклонная) в E-плоскости ρe, мм. 0 — не учитывать фазовую ошибку. */
  flareE?: number;
  /** Длина раскрыва (наклонная) в H-плоскости ρh, мм. 0 — не учитывать фазовую ошибку. */
  flareH?: number;
  floorDb: number;
}

type Cx = { re: number; im: number };
const cabs = (z: Cx) => Math.hypot(z.re, z.im);

/** Полный круг 0…359° от оси раскрыва (0° — главный луч). fn — амплитуда поля, рад. */
function sweep360(fn: (t: number) => number, floorDb: number): PatternPoint[] {
  const raw: number[] = [];
  for (let a = 0; a < 360; a++) raw.push(fn(a * DEG) ** 2);
  let m = 0;
  for (const v of raw) if (v > m) m = v;
  const pts: PatternPoint[] = [];
  for (let a = 0; a < 360; a++) pts.push({ angleDeg: a, valueDb: toDb(m > 0 ? raw[a] / m : 0, floorDb) });
  return pts;
}

/**
 * Модуль интеграла по равномерно освещённой стенке длиной D с фазовой ошибкой ρ:
 *   |∫ exp(j·kt·t − j·k·t²/(2ρ)) dt| ,  t ∈ [−D/2, D/2].
 * Через интегралы Френеля: √(πρ/k)·|[C(t2)−C(t1)] − j[S(t2)−S(t1)]|.
 */
function uniformFlare(kt: number, k: number, D: number, rho: number): number {
  const s = Math.sqrt(1 / (Math.PI * k * rho));
  const t1 = s * (-(k * D) / 2 - kt * rho);
  const t2 = s * ((k * D) / 2 - kt * rho);
  const f1 = fresnelCS(t1), f2 = fresnelCS(t2);
  return Math.sqrt(Math.PI * rho / k) * Math.hypot(f2.C - f1.C, f2.S - f1.S);
}

/**
 * Модуль интеграла по стенке с КОСИНУСНЫМ распределением cos(π·t/D) и фазовой ошибкой ρ.
 * Косинус раскладывается на два экспонента ⇒ два члена Френеля со сдвигами ±π/D.
 */
function cosineFlare(kt: number, k: number, D: number, rho: number): number {
  const s = Math.sqrt(1 / (Math.PI * k * rho));
  const term = (kshift: number): Cx => {
    const t1 = s * (-(k * D) / 2 - kshift * rho);
    const t2 = s * ((k * D) / 2 - kshift * rho);
    const f1 = fresnelCS(t1), f2 = fresnelCS(t2);
    const dC = f2.C - f1.C, dS = f2.S - f1.S;
    const ph = (kshift * kshift * rho) / (2 * k);   // e^{j·kshift²·ρ/(2k)}
    const cp = Math.cos(ph), sp = Math.sin(ph);
    // (dC − j·dS)·e^{jph}
    return { re: dC * cp + dS * sp, im: dC * sp - dS * cp };
  };
  const A = term(kt + Math.PI / D);
  const B = term(kt - Math.PI / D);
  const sum: Cx = { re: A.re + B.re, im: A.im + B.im };
  return 0.5 * Math.sqrt(Math.PI * rho / k) * cabs(sum);
}

function computeHornModel(inp: HornInput): PatternResult {
  const notes: string[] = [];
  const f = inp.freqMHz;
  const lambdaMm = (C0 / (f * 1e6)) * 1000;
  const k = (2 * Math.PI) / lambdaMm;
  const a = inp.apertureA, b = inp.apertureB;
  const rhoE = inp.flareE && inp.flareE > 0 ? inp.flareE : 0;
  const rhoH = inp.flareH && inp.flareH > 0 ? inp.flareH : 0;
  const withPhase = rhoE > 0 && rhoH > 0;

  if (!(a > EPS && b > EPS)) {
    return {
      antennaKind: "horn",
      title: `Диаграмма направленности рупора · ${f} МГц`,
      planes: [{ label: "E-плоскость (раскрыв b)", points: [] }],
      referencePlaneIndex: 0,
      metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null },
      notes: ["⚠ Размеры раскрыва a и b должны быть > 0."],
    };
  }

  // --- Сечения ДН ---
  // E-плоскость: φ = 90°, ky = k·sinθ, kx = 0 → множитель по широкой стенке постоянен.
  const eField = (th: number) => {
    const obl = (1 + Math.cos(th)) / 2;
    const ky = k * Math.sin(th);
    const iy = withPhase ? uniformFlare(ky, k, b, rhoE) : Math.abs(sinc((k * b / 2) * Math.sin(th))) * b;
    return Math.abs(obl * iy);
  };
  // H-плоскость: φ = 0°, kx = k·sinθ, ky = 0.
  const hField = (th: number) => {
    const obl = (1 + Math.cos(th)) / 2;
    const kx = k * Math.sin(th);
    let ix: number;
    if (withPhase) {
      ix = cosineFlare(kx, k, a, rhoH);
    } else {
      const u = (k * a / 2) * Math.sin(th);
      const denom = 1 - Math.pow((2 * u) / Math.PI, 2);
      ix = Math.abs(denom) < 1e-4 ? Math.PI / 4 : Math.abs(Math.cos(u) / denom);
    }
    return Math.abs(obl * ix);
  };

  const ePlane = sweep360(eField, inp.floorDb);
  const hPlane = sweep360(hField, inp.floorDb);
  const hE = halfPowerBeamwidth(ePlane), hH = halfPowerBeamwidth(hPlane);

  // --- КНД ---
  let directivityDbi: number | null = null;
  let apertureEff: number | undefined;
  if (a / lambdaMm < 0.5 || b / lambdaMm < 0.5) {
    notes.push("⚠ Раскрыв меньше 0.5λ — апертурная модель некорректна для такого рупора.");
  } else if (withPhase) {
    const x = b / Math.sqrt(2 * lambdaMm * rhoE);
    const fx = fresnelCS(x);
    const De = fx.C * fx.C + fx.S * fx.S;
    const sq = Math.sqrt(lambdaMm * rhoH);
    const u = (1 / Math.SQRT2) * (sq / a + a / sq);
    const v = (1 / Math.SQRT2) * (sq / a - a / sq);
    const fu = fresnelCS(u), fv = fresnelCS(v);
    const Dh = Math.pow(fu.C - fv.C, 2) + Math.pow(fu.S - fv.S, 2);
    const D = ((8 * Math.PI * rhoE * rhoH) / (a * b)) * De * Dh;
    if (D > 0) {
      directivityDbi = 10 * Math.log10(D);
      apertureEff = D / ((4 * Math.PI * a * b) / (lambdaMm * lambdaMm));
    }
    notes.push(
      `Учтена квадратичная фазовая ошибка раскрыва (ρe = ${rhoE.toFixed(1)} мм, ρh = ${rhoH.toFixed(1)} мм). ` +
      `КИП раскрыва ${apertureEff !== undefined ? apertureEff.toFixed(3) : "—"} ` +
      `(у синфазного раскрыва было бы 0.81; у оптимального пирамидального рупора ≈ 0.51).`,
    );
  } else if (hE && hH) {
    // Синфазный раскрыв: КИП = 0.81 (равномерное × косинусное распределение).
    const D = 0.81 * ((4 * Math.PI * a * b) / (lambdaMm * lambdaMm));
    directivityDbi = 10 * Math.log10(D);
    apertureEff = 0.81;
    notes.push(
      "⚠ Длины раскрыва ρe и ρh не заданы, поэтому фазовая ошибка НЕ учтена: приведённое " +
      "усиление — ВЕРХНЯЯ ОЦЕНКА для синфазного раскрыва (КИП 0.81). Реальный рупор с той же " +
      "апертурой даёт меньше: у оптимального пирамидального КИП ≈ 0.51, то есть примерно на 2 дБ " +
      "ниже. Задайте ρe и ρh, чтобы получить настоящее значение.",
    );
  }

  notes.push(
    "ДН построена на полный круг 360°. Спад к задней полусфере даёт множитель наклона (1+cosθ)/2 " +
    "модели Гюйгенса; реальное заднее излучение от дифракции на кромках раскрыва не моделируется.",
  );
  notes.push(
    "КСВ и входное сопротивление здесь НЕ приводятся — и это не упущение: у рупора они определяются " +
    "не раскрывом, а согласованием в горловине (переход волновод→рупор, его длина и профиль). " +
    "По одним размерам раскрыва их посчитать нельзя. В режиме «Проектирование» волновод подбирается по частоте.",
  );

  return {
    antennaKind: "horn",
    title: `Диаграмма направленности рупора · ${f} МГц`,
    planes: [
      { label: "E-плоскость (раскрыв b)", points: ePlane },
      { label: "H-плоскость (раскрыв a)", points: hPlane },
    ],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f, lambdaMm, directivityDbi,
      hpbwDeg: hE, sllDb: null, frontToBackDb: null,
      // Металлический рупор: омические потери пренебрежимо малы, поэтому КУ = КНД.
      // Рассогласование сюда НЕ входит — оно определяется горловиной, а её тут нет.
      gainDbi: directivityDbi,
      apertureEff,
      polarization: "Линейная (вектор E вдоль узкой стенки b)",
      hpbwEDeg: hE,
      hpbwHDeg: hH,
      hpbwELabel: "E (раскрыв b)",
      hpbwHLabel: "H (раскрыв a)",
    },
    notes,
  };
}

export function computeHorn(inp: HornInput): PatternResult {
  return withDisplayFloor(inp, computeHornModel);
}
