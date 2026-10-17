// ПРОЕКТИРОВАНИЕ логопериодической антенны (ЛПА) по методике Каррела.
//
// Разобранный онлайн-калькулятор считает шаг как L·(1+sin α) — это НЕ Каррел и не
// соответствует классической геометрии ЛПА; усиление там подогнано формулой 7+0.3(N−10).
// Здесь используется стандартная процедура:
//
//   σ_опт = 0.243·τ − 0.051                (линия оптимума Каррела)
//   α     = arctg[(1−τ)/(4σ)]              (半 угол раскрыва клина)
//   B     = f_в / f_н                      (рабочая полоса)
//   B_ар  = 1.1 + 7.7·(1−τ)²·ctg α         (полоса активной области)
//   B_s   = B · B_ар                       (расчётная полоса)
//   N     = 1 + ln(B_s)/ln(1/τ)            (число элементов, округляем вверх)
//   L_max = c/(2·f_н)                      (самый длинный элемент ≈ λ/2 на нижней частоте)
//   L_n   = L_max·τⁿ ,  d_n = 2σ·L_n       (шаг между элементами n и n+1)
//
// Усиление здесь НЕ оценивается эмпирикой: геометрия передаётся в поверочный расчёт,
// где усиление и ДН считает наш метод моментов с перекрёстным фидером (сверен с NEC2).

import { RHO_CUSTOM_DEFAULT } from "../physics/conductor";
import { type DesignResult, type DesignRow, fmt } from "../fields";

const C_MM = 299792.458; // мм·МГц

export interface LpdaDesignInput {
  freqLowMHz: number;
  freqHighMHz: number;
  tau: number;
  diameterMm: number;
  feederZ0: number;
  floorDb: number;
  /** Материал проводника (переносится в поверочный расчёт; см. physics/conductor.ts). */
  material?: string;
  rhoCustom?: number;
}

export function designLpda(inp: LpdaDesignInput): DesignResult {
  const fl = inp.freqLowMHz, fh = inp.freqHighMHz, tau = inp.tau;
  const notes: string[] = [];

  if (!(fl > 0 && fh > fl && tau > 0.5 && tau < 0.98)) {
    return {
      title: `ЛПА · ${fl}–${fh} МГц`, rows: [], analysisValues: {},
      notes: ["⚠ Нужны: нижняя частота > 0, верхняя > нижней, τ в диапазоне 0.5…0.98."],
    };
  }

  const sigma = 0.243 * tau - 0.051;               // оптимум Каррела
  const alphaRad = Math.atan((1 - tau) / (4 * sigma));
  const alphaDeg = (alphaRad * 180) / Math.PI;
  const B = fh / fl;
  const Bar = 1.1 + 7.7 * Math.pow(1 - tau, 2) / Math.tan(alphaRad);
  const Bs = B * Bar;
  const Nexact = 1 + Math.log(Bs) / Math.log(1 / tau);
  const N = Math.max(3, Math.ceil(Nexact));

  const Lmax = C_MM / (2 * fl);                    // самый длинный элемент, мм
  const lengths: number[] = [];
  for (let n = 0; n < N; n++) lengths.push(Lmax * Math.pow(tau, n));

  // Расстояния: d_n = 2σ·L_n между элементом n и n+1.
  const positions: number[] = [0];
  for (let n = 0; n < N - 1; n++) positions.push(positions[n] + 2 * sigma * lengths[n]);
  const boomMm = positions[N - 1];

  const rows: DesignRow[] = [
    { group: "Исходные", label: "Полоса", value: `${fmt(fl, 0)} … ${fmt(fh, 0)}`, unit: "МГц", hint: `перекрытие B = ${fmt(B, 2)}` },
    { group: "Параметры ЛПА", label: "Масштаб τ", value: fmt(tau, 3), unit: "", key: true },
    { group: "Параметры ЛПА", label: "Интервал σ (оптимум Каррела)", value: fmt(sigma, 4), unit: "", key: true, hint: "σ = 0.243·τ − 0.051" },
    { group: "Параметры ЛПА", label: "Полуугол раскрыва α", value: fmt(alphaDeg, 2), unit: "°", hint: "arctg[(1−τ)/(4σ)]" },
    { group: "Параметры ЛПА", label: "Полоса активной области B_ар", value: fmt(Bar, 3), unit: "" },
    { group: "Параметры ЛПА", label: "Расчётная полоса B_s", value: fmt(Bs, 3), unit: "", hint: "B · B_ар" },
    { group: "Параметры ЛПА", label: "Число элементов N", value: String(N), unit: "шт", key: true, hint: `точное значение ${fmt(Nexact, 2)}, округлено вверх` },
    { group: "Габариты", label: "Самый длинный элемент", value: fmt(Lmax, 1), unit: "мм", key: true, hint: "λ/2 на нижней частоте" },
    { group: "Габариты", label: "Самый короткий элемент", value: fmt(lengths[N - 1], 1), unit: "мм" },
    { group: "Габариты", label: "Длина бума", value: fmt(boomMm, 1), unit: "мм", key: true },
    { group: "Габариты", label: "Диаметр элементов", value: fmt(inp.diameterMm, 2), unit: "мм" },
    { group: "Питание", label: "Волновое сопротивление фидера Z₀", value: fmt(inp.feederZ0, 0), unit: "Ом", hint: "перекрёстная раздаточная линия" },
  ];
  for (let n = 0; n < N; n++) {
    rows.push({
      group: "Элементы (длина / позиция от самого длинного)",
      label: `Элемент ${n + 1}${n === 0 ? " (задний, длинный)" : n === N - 1 ? " (передний, питание)" : ""}`,
      value: `${fmt(lengths[n], 1)} / ${fmt(positions[n], 1)}`, unit: "мм",
    });
  }

  notes.push("Синтез по Каррелу: σ взят на линии оптимума σ = 0.243τ − 0.051 — это даёт наибольшее усиление при выбранном τ.");
  notes.push("Питание подаётся на САМЫЙ КОРОТКИЙ (передний) элемент, раздаточная линия между элементами перекрещивается — без перекрёста ЛПА работать не будет.");
  notes.push(
    `Полоса активной области B_ар = ${fmt(Bar, 2)} — запас, из-за которого элементов нужно больше, ` +
    `чем на голое перекрытие полосы: активной в каждый момент является лишь группа соседних элементов.`,
  );
  if (tau < 0.8) notes.push("⚠ τ < 0.8 — антенна получится короткой, но усиление низким. Типично 0.85…0.95.");
  if (N > 24) notes.push(`⚠ Получилось ${N} элементов — расчёт ДН методом моментов будет заметно дольше.`);
  notes.push("Усиление намеренно не оценивается эмпирической формулой — ниже его считает метод моментов с перекрёстным фидером по этой геометрии.");

  return {
    title: `ЛПА ${N} эл. · ${fmt(fl, 0)}–${fmt(fh, 0)} МГц`,
    rows,
    analysisValues: {
      // Поверочный расчёт ЛПА работает на одной частоте — берём середину полосы (геом. среднее).
      freqMHz: +Math.sqrt(fl * fh).toFixed(1),
      count: N,
      tau: +tau.toFixed(3),
      sigma: +sigma.toFixed(4),
      longestMm: +Lmax.toFixed(1),
      diameterMm: inp.diameterMm,
      feederZ0: inp.feederZ0,
      floorDb: inp.floorDb,
      ...(inp.material != null ? { material: inp.material, rhoCustom: inp.rhoCustom ?? RHO_CUSTOM_DEFAULT } : {}),
    },
    notes,
  };
}
