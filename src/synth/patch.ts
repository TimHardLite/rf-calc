// ПРОЕКТИРОВАНИЕ прямоугольного микрополоскового патча.
// Классический синтез Balanis + краевое удлинение Hammerstad.
//
//   W      = c/(2f)·√(2/(εr+1))
//   εreff  = (εr+1)/2 + (εr−1)/2·(1+12h/W)^(−1/2)
//   ΔL     = 0.412·h·((εreff+0.3)(W/h+0.264))/((εreff−0.258)(W/h+0.8))
//   L      = c/(2f√εreff) − 2ΔL
//   G1,G12 — точные интегралы Balanis (14-12)/(14-18a), см. physics/patchmodel.ts
//   Zp     = 1/(2·(G1+G12))              — сопротивление на краю
//   x0     = (L/π)·acos(√(Z0/Zp))        — глубина врезки под нужные Z0
//   экран  ≥ (λg/2 + L) × (λg/2 + W)
//
// ПОЧЕМУ НЕ ПО ОНЛАЙН-КАЛЬКУЛЯТОРУ: в разобранном 3G-Aerial (js/patch.min.js) стоит
// асимптотика G1 = W·(1−(kh)²/24)/(120λ), справедливая только при W ≫ λ. На типовом
// патче W ≈ 0.4λ она завышает G1 примерно вдвое (для примера Balanis 14.3: 3.26e-3
// вместо 1.57e-3) и не учитывает взаимную проводимость щелей вовсе. Результат —
// неверная глубина врезки. Здесь используются точные интегралы.

import { type DesignResult, type DesignRow, fmt } from "../fields";
import {
  effectiveEps, edgeExtension, slotConductances, edgeResistance, insetForZ,
} from "../physics/patchmodel";
import { microstripSynth } from "../physics/microstrip";

const C_MM = 299792.458; // мм·МГц

export interface PatchDesignInput {
  freqMHz: number;
  epsR: number;
  substrateH: number;
  targetZ: number;
  polarization: string;
  tanD: number;
  floorDb: number;
}

export function designPatch(inp: PatchDesignInput): DesignResult {
  const f = inp.freqMHz, er = inp.epsR, h = inp.substrateH, Z0 = inp.targetZ;
  const notes: string[] = [];
  const rows: DesignRow[] = [];

  if (!(f > 0 && er >= 1 && h > 0 && Z0 > 0)) {
    return {
      title: `Патч · ${f} МГц`,
      rows: [],
      analysisValues: {},
      notes: ["⚠ Частота, εr (≥1), высота подложки и целевое сопротивление должны быть > 0."],
    };
  }

  const lambda = C_MM / f;
  const W = C_MM / (2 * f * Math.sqrt((er + 1) / 2));
  const eeff = effectiveEps(er, h, W);
  const Leff = C_MM / (2 * f * Math.sqrt(eeff));
  const dL = edgeExtension(eeff, h, W);
  const L = Leff - 2 * dL;
  const lambdaG = lambda / Math.sqrt(eeff);

  // Проводимости щелей — ТА ЖЕ модель, что в поверочном расчёте (patchmodel.ts).
  // Раньше здесь стояла асимптотика G1 = W/(120λ), годная лишь при W ≫ λ; на типовом
  // W ≈ 0.4λ она завышала G1 вдвое, врезка получалась неверной, и поверочный расчёт
  // спроектированного патча показывал КСВ 1.5…1.6 вместо 1.0.
  const k0 = (2 * Math.PI) / lambda;
  const { G1, G12 } = slotConductances(k0, W, L);
  const Zp = edgeResistance(G1, G12);

  // Глубина врезки для согласования на Z0 (Rin(y) = Rin(0)·cos²(πy/L)).
  const x0: number | null = insetForZ(Zp, Z0, L);
  if (x0 === null) notes.push(`⚠ Требуемые ${Z0} Ом больше сопротивления на краю патча (${Math.round(Zp)} Ом) — врезкой такое не получить. Нужен трансформатор λ/4 или другой способ питания.`);

  const gap = (0.046 * C_MM) / (2 * eeff * f); // ширина зазора врезки
  const groundL = lambdaG / 2 + L;
  const groundW = lambdaG / 2 + W;

  // Ширина микрополоскового фидера под Z0 — замкнутый синтез Уилера–Хаммерстада
  // (physics/microstrip.ts). В v1 здесь был перебор с формулой ТОЛЬКО для широкой
  // полоски (W/h > 1): на подложках с высокой εr, где линия получается узкой, он давал
  // заниженную ширину. Теперь ветвь выбирается по самому результату, и линия считается
  // со своей εeff (у линии она другая, чем у патча: ширина другая).
  const ms = microstripSynth(Z0, er, h, f);
  const Wt = ms.widthMm;
  // Четвертьволновый трансформатор как альтернатива врезке: Zт = √(Z0·Zp).
  const zTrans = Number.isFinite(Zp) && Zp > 0 ? Math.sqrt(Z0 * Zp) : NaN;
  const trans = Number.isFinite(zTrans) ? microstripSynth(zTrans, er, h, f) : null;
  const bandwidthPct = er <= 1.01 ? (h / W) * 120 : null;

  rows.push({ group: "Габариты излучателя", label: "Ширина W", value: fmt(W, 2), unit: "мм", key: true });
  rows.push({ group: "Габариты излучателя", label: "Длина L", value: fmt(L, 2), unit: "мм", key: true });
  rows.push({ group: "Габариты излучателя", label: "Высота подложки h", value: fmt(h, 2), unit: "мм" });
  rows.push({ group: "Габариты излучателя", label: "Краевое удлинение ΔL", value: fmt(dL, 3), unit: "мм", hint: "на каждую сторону, формула Hammerstad" });

  rows.push({ group: "Электрика", label: "Длина волны λ", value: fmt(lambda, 1), unit: "мм" });
  rows.push({ group: "Электрика", label: "Эффективная εreff", value: fmt(eeff, 3), unit: "" });
  rows.push({ group: "Электрика", label: "λ в подложке λg", value: fmt(lambdaG, 1), unit: "мм" });
  rows.push({ group: "Электрика", label: "Сопротивление на краю Zp", value: String(Math.round(Zp)), unit: "Ом" });

  rows.push({
    group: "Согласование", label: `Глубина врезки x₀ под ${Z0} Ом`,
    value: x0 === null ? "—" : fmt(x0, 2), unit: "мм", key: true,
    hint: x0 === null ? "врезкой недостижимо" : "от края патча внутрь, по центру",
  });
  rows.push({ group: "Согласование", label: "Ширина зазора врезки g", value: fmt(gap, 2), unit: "мм" });
  rows.push({
    group: "Согласование", label: `Ширина фидера под ${Z0} Ом`, value: fmt(Wt, 2), unit: "мм",
    hint: `микрополосок на той же подложке: W/h = ${fmt(ms.wOverH, 2)}, εeff линии ${fmt(ms.epsEff, 3)}, λ в линии ${fmt(ms.lambdaGmm, 1)} мм`,
  });
  if (trans) {
    rows.push({
      group: "Согласование", label: "Четвертьволновый трансформатор Zт", value: fmt(zTrans, 1), unit: "Ом",
      hint: `альтернатива врезке: питание с края через отрезок √(${Z0}·${Math.round(Zp)}) Ом`,
    });
    rows.push({
      group: "Согласование", label: "Трансформатор: ширина × длина", value: `${fmt(trans.widthMm, 2)} × ${fmt(trans.quarterMm, 2)}`, unit: "мм",
      hint: "длина = λ/4 в линии трансформатора",
    });
  }

  rows.push({ group: "Экран", label: "Минимальный экран (длина)", value: fmt(groundL, 1), unit: "мм", hint: "λg/2 + L" });
  rows.push({ group: "Экран", label: "Минимальный экран (ширина)", value: fmt(groundW, 1), unit: "мм", hint: "λg/2 + W" });
  if (bandwidthPct !== null) {
    rows.push({ group: "Экран", label: "Полоса (КСВ<3, воздух)", value: fmt(bandwidthPct, 1), unit: "%", hint: `≈ ${Math.round((f * bandwidthPct) / 100)} МГц` });
  }

  notes.push("Синтез по Balanis (двухщелевая модель) с краевым удлинением Hammerstad — стандартная инженерная методика.");
  if (h / lambda > 0.05) notes.push(`⚠ Подложка толстая (h = ${fmt(h / lambda, 3)}λ > 0.05λ) — растут поверхностные волны, модель занижает потери. Проверяйте полноволновым расчётом.`);
  if (inp.polarization !== "Линейная") {
    notes.push(
      `⚠ Выбрана ${inp.polarization}. Этот синтез даёт ЛИНЕЙНО поляризованный прямоугольный патч. ` +
      "Для круговой поляризации нужен либо квадратный патч со срезанными углами/возбуждением в двух " +
      "точках со сдвигом 90°, либо «вертушок» — их размеры этой формулой не считаются.",
    );
  }

  return {
    title: `Патч ${fmt(W, 1)}×${fmt(L, 1)} мм · ${f} МГц`,
    rows,
    analysisValues: {
      mode: "rect",
      polarization: inp.polarization,
      freqMHz: f,
      lengthMm: +L.toFixed(2),
      widthMm: +W.toFixed(2),
      substrateH: h,
      epsR: er,
      tanD: inp.tanD,
      // Экран берём минимально допустимый по расчёту — от него зависит заднее излучение.
      groundLmm: +groundL.toFixed(1),
      groundWmm: +groundW.toFixed(1),
      // Врезка, дающая нужное сопротивление (если она вообще достижима).
      feedInsetMm: x0 === null ? 0 : +x0.toFixed(2),
      hpbwDeg: 90,
      gainDbi: 0,
      backLobeDb: 0,
      floorDb: inp.floorDb,
    },
    notes,
  };
}
