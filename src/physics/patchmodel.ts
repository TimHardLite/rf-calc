// Общая модель прямоугольного патча (Balanis, «Antenna Theory», гл. 14).
// ОДИН источник истины для проектирования и поверочного расчёта: иначе программа
// проектирует антенну под 50 Ом, а её же поверочный расчёт показывает КСВ 1.6.

import { besselJ0 } from "./rfutil";

/** Эффективная диэлектрическая проницаемость микрополосковой линии шириной W. */
export function effectiveEps(er: number, h: number, W: number): number {
  return (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + (12 * h) / W, -0.5);
}

/** Краевое удлинение ΔL (Hammerstad), те же единицы длины, что h и W. */
export function edgeExtension(eeff: number, h: number, W: number): number {
  return 0.412 * h * (((eeff + 0.3) * (W / h + 0.264)) / ((eeff - 0.258) * (W / h + 0.8)));
}

/**
 * Проводимости излучающих щелей, См.
 *   G1  = (1/120π²)·∫₀^π [sin(k₀W·cosθ/2)/cosθ]²·sin³θ dθ            (14-12)
 *   G12 = то же с множителем J₀(k₀·L·sinθ)                           (14-18a)
 * В аргументе J₀ — ФИЗИЧЕСКАЯ длина патча L (реальный разнос щелей), не L+2ΔL.
 *
 * Сверено с примером 14.3 Balanis (εr = 2.2, h = 0.1588 см, f = 10 ГГц,
 * W = 1.186 см, L = 0.906 см): G1 = 1.5728e-3 (книга 1.5709e-3),
 * G12 = 6.1683e-4 (книга 6.1683e-4), R_край = 228.35 Ом (книга 228.3508 Ом).
 *
 * k0 и размеры — в согласованных единицах (у нас 1/мм и мм).
 */
export function slotConductances(k0: number, W: number, L: number): { G1: number; G12: number } {
  const integral = (withMutual: boolean): number => {
    const N = 400;
    let s = 0;
    for (let i = 0; i <= N; i++) {
      const th = (Math.PI * i) / N;
      const wt = i === 0 || i === N ? 0.5 : 1;
      const c = Math.cos(th), sn = Math.sin(th);
      const core = Math.abs(c) < 1e-9 ? (k0 * W) / 2 : Math.sin((k0 * W * c) / 2) / c;
      const j0 = withMutual ? besselJ0(k0 * L * sn) : 1;
      s += wt * core * core * sn * sn * sn * j0 * (Math.PI / N);
    }
    return s / (120 * Math.PI * Math.PI);
  };
  return { G1: integral(false), G12: integral(true) };
}

/** Сопротивление на краю патча для основного вида: R = 1/(2·(G1 + G12)). */
export function edgeResistance(G1: number, G12: number): number {
  return G1 + G12 > 1e-15 ? 1 / (2 * (G1 + G12)) : NaN;
}

/** Глубина врезки под заданное Z0: R(y) = R_край·cos²(π·y/L)  ⇒  y = (L/π)·acos√(Z0/R_край). */
export function insetForZ(Redge: number, targetZ: number, L: number): number | null {
  if (!Number.isFinite(Redge) || targetZ <= 0 || targetZ > Redge) return null;
  return (L / Math.PI) * Math.acos(Math.sqrt(targetZ / Redge));
}

/**
 * ИМПЕДАНС ПАТЧА на произвольной частоте — единая модель для поверочного расчёта,
 * синтеза и оптимизатора (иначе они разойдутся, как это уже было в v1 с проводимостями
 * щелей). Патч у резонанса — параллельный контур:
 *   f_рез = c/(2·L_эф·√εreff),  L_эф = L + 2ΔL
 *   R_вх  = R_край·cos²(π·x₀/L)                     (врезка)
 *   Z(f)  = R_вх / (1 + j·2Q·(f/f_рез − 1))
 * Добротность: Q = 1/(1/Q_изл + 1/Q_медь + 1/Q_диэл), Q_изл = ω·R_край·C,
 * C = ε₀·εreff·L·W/(2h), Q_медь = h·√(π f μ₀ σ), Q_диэл = 1/tgδ.
 */
export interface PatchZInput {
  /** Размеры патча, мм. */
  L: number; W: number; h: number;
  er: number; tanD: number;
  /** Глубина врезки, мм (0 — питание с края). */
  inset: number;
  /** Частота, на которой считается импеданс, МГц. */
  fMHz: number;
}

export interface PatchZ {
  re: number; im: number;
  /** Резонансная частота геометрии, МГц. */
  fResMHz: number;
  /** Сопротивление на краю (в резонансе), Ом. */
  Redge: number;
  /** Сопротивление в точке врезки (в резонансе), Ом. */
  Rin: number;
  Qtot: number;
  /** КПД по потерям (излучение против меди и диэлектрика). */
  efficiency: number;
  eeff: number;
  dL: number;
}

export function patchImpedance(p: PatchZInput): PatchZ {
  const C_MM = 299792.458; // мм·МГц
  const eeff = effectiveEps(p.er, p.h, p.W);
  const dL = edgeExtension(eeff, p.h, p.W);
  const Le = p.L + 2 * dL;
  const fResMHz = C_MM / (2 * Le * Math.sqrt(eeff));
  const lambdaMm = C_MM / p.fMHz;
  const k0 = (2 * Math.PI) / lambdaMm;
  const { G1, G12 } = slotConductances(k0, p.W, p.L);
  const Redge = edgeResistance(G1, G12);
  const inset = Math.max(0, Math.min(p.inset, p.L / 2));
  const Rin = Number.isFinite(Redge) ? Redge * Math.cos((Math.PI * inset) / p.L) ** 2 : NaN;

  const eps0 = 8.8541878128e-12, mu0 = 4e-7 * Math.PI, sigmaCu = 5.8e7;
  const Cpatch = (eps0 * eeff * (p.L / 1000) * (p.W / 1000)) / (2 * (p.h / 1000));
  const omega = 2 * Math.PI * p.fMHz * 1e6;
  const Qrad = Number.isFinite(Redge) ? omega * Redge * Cpatch : NaN;
  const Qc = (p.h / 1000) * Math.sqrt(Math.PI * p.fMHz * 1e6 * mu0 * sigmaCu);
  const Qd = p.tanD > 0 ? 1 / p.tanD : Infinity;
  const Qtot = 1 / (1 / Qrad + 1 / Qc + 1 / Qd);
  const efficiency = Number.isFinite(Qrad) ? Qtot / Qrad : NaN;

  const detune = Number.isFinite(fResMHz) && fResMHz > 0 ? p.fMHz / fResMHz - 1 : 0;
  const den = 1 + 4 * Qtot * Qtot * detune * detune;
  return {
    re: Number.isFinite(Rin) ? Rin / den : NaN,
    im: Number.isFinite(Rin) ? (-Rin * 2 * Qtot * detune) / den : NaN,
    fResMHz, Redge, Rin, Qtot, efficiency, eeff, dL,
  };
}
