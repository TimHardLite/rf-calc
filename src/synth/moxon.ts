// ПРОЕКТИРОВАНИЕ антенны Moxon по полиномиальным аппроксимациям L.B. Cebik (W4RNL).
// Классический «Moxon rectangle calculator»; коэффициенты сверены с рабочим
// калькулятором (index.html разобранного сайта), две цели согласования — 50 и 93 Ом.
//
//   WD = log10(d/λ)   — диаметр провода в длинах волн, десятичный логарифм
//   ОБЛАСТЬ ГОДНОСТИ: −6 < WD < −2  (т.е. d/λ от 1e−6 до 1e−2). Вне неё калькулятор
//   отказывается считать — мы делаем так же, а не экстраполируем молча.
//
//   Цель 50 Ом:
//     A = (−0.0008571·WD² − 0.0095714·WD + 0.33985714)·λ
//     B = (−0.0021429·WD² − 0.0203571·WD + 0.00828571)·λ
//     C = ( 0.00180952·WD² + 0.01780952·WD + 0.05164286)·λ
//     D = ( 0.001·WD + 0.07178571)·λ
//   Цель 93 Ом:
//     A = (−0.0012·WD² − 0.011228571·WD + 0.284942857)·λ
//     B = (−0.001019048·WD² − 0.009890476·WD + 0.064342857)·λ
//     C = ( 0.00366667·WD² + 0.031352381·WD + 0.094207143)·λ
//     D = ( 0.000757143·WD + 0.100492857)·λ
//   E = B + C + D  (полная глубина рамки)

import { RHO_CUSTOM_DEFAULT } from "../physics/conductor";
import { type DesignResult, type DesignRow, fmt } from "../fields";

const C_MM = 299792.458; // мм·МГц

export interface MoxonDesignInput {
  freqMHz: number;
  diameterMm: number;
  /** "wire" — провод Ø diameterMm; "flat" — печатная плата, дорожка шириной stripWmm. */
  elementType?: "wire" | "flat";
  stripWmm?: number;
  targetZ: number; // 50 | 93
  floorDb: number;
  /** Материал проводника (переносится в поверочный расчёт; см. physics/conductor.ts). */
  material?: string;
  rhoCustom?: number;
}

export function designMoxon(inp: MoxonDesignInput): DesignResult {
  const flat = inp.elementType === "flat";
  const w = inp.stripWmm ?? NaN;
  // Полиномы Cebik выведены для круглого провода. Дорожка шириной w эквивалентна
  // круглому проводу Ø w/2 (радиус w/4) — его и подставляем в полиномы.
  const f = inp.freqMHz, d = flat ? w / 2 : inp.diameterMm;
  const notes: string[] = [];

  if (!(f > 0 && d > 0)) {
    return {
      title: `Moxon · ${f} МГц`, rows: [], analysisValues: {},
      notes: [`⚠ Частота и ${flat ? "ширина дорожки" : "диаметр провода"} должны быть > 0.`],
    };
  }

  const lambda = C_MM / f;
  const WD = Math.log10(d / lambda);

  if (WD < -6 || WD > -2) {
    return {
      title: `Moxon · ${f} МГц`,
      rows: [],
      analysisValues: {},
      notes: [
        `⚠ ${flat ? `Эквивалентный диаметр дорожки (w/2) ${fmt(d, 2)} мм` : `Диаметр провода ${fmt(d, 2)} мм`} = 10^${fmt(WD, 2)}·λ вне области годности модели Moxon ` +
        `(допустимо d/λ от 1e−6 до 1e−2, т.е. от ${fmt(lambda * 1e-6, 4)} до ${fmt(lambda * 1e-2, 2)} мм на этой частоте). ` +
        `Экстраполировать полиномы за их область нельзя — измените диаметр или частоту.`,
      ],
    };
  }

  const z93 = Math.abs(inp.targetZ - 93) < Math.abs(inp.targetZ - 50);
  let A: number, B: number, C: number, D: number;
  if (z93) {
    A = (-0.0012 * WD * WD - 0.011228571 * WD + 0.284942857) * lambda;
    B = (-0.001019048 * WD * WD - 0.009890476 * WD + 0.064342857) * lambda;
    C = (0.00366667 * WD * WD + 0.031352381 * WD + 0.094207143) * lambda;
    D = (0.000757143 * WD + 0.100492857) * lambda;
  } else {
    A = (-0.0008571 * WD * WD - 0.0095714 * WD + 0.33985714) * lambda;
    B = (-0.0021429 * WD * WD - 0.0203571 * WD + 0.00828571) * lambda;
    C = (0.00180952 * WD * WD + 0.01780952 * WD + 0.05164286) * lambda;
    D = (0.001 * WD + 0.07178571) * lambda;
  }
  const E = B + C + D;

  const rows: DesignRow[] = [
    { group: "Общее", label: "Длина волны λ", value: fmt(lambda, 1), unit: "мм" },
    flat
      ? { group: "Общее", label: "Ширина дорожки", value: fmt(w, 2), unit: "мм", hint: `эквивалентный круглый Ø ${fmt(d, 2)} мм, d/λ = 10^${fmt(WD, 2)}` }
      : { group: "Общее", label: "Диаметр провода", value: fmt(d, 2), unit: "мм", hint: `d/λ = 10^${fmt(WD, 2)}` },
    { group: "Общее", label: "Согласование на", value: String(z93 ? 93 : 50), unit: "Ом" },
    { group: "Размеры рамки", label: "A — полная ширина", value: fmt(A, 2), unit: "мм", key: true },
    { group: "Размеры рамки", label: "B — загиб активного", value: fmt(B, 2), unit: "мм", key: true },
    { group: "Размеры рамки", label: "C — зазор между концами", value: fmt(C, 2), unit: "мм", key: true },
    { group: "Размеры рамки", label: "D — загиб рефлектора", value: fmt(D, 2), unit: "мм", key: true },
    { group: "Размеры рамки", label: "E — полная глубина (B+C+D)", value: fmt(E, 2), unit: "мм" },
    { group: "Габарит", label: "Занимаемая площадь", value: `${fmt(A, 0)} × ${fmt(E, 0)}`, unit: "мм" },
  ];

  notes.push("Полиномы L.B. Cebik (W4RNL) — стандартный «Moxon rectangle». Прямое согласование без согласующих устройств.");
  notes.push("Moxon даёт усиление уровня 2-элементной яги, но заметно лучшее подавление назад (F/B) — это его главное достоинство.");
  if (flat) {
    notes.push(
      `Исполнение на печатной плате: дорожка шириной ${fmt(w, 2)} мм пересчитана в эквивалентный круглый ` +
      `провод Ø w/2 = ${fmt(d, 2)} мм (радиус w/4) — под него и посчитаны размеры. A, B, C, D — по осевым ` +
      `линиям дорожек; наружная ширина рисунка A + w = ${fmt(A + w, 1)} мм.`,
    );
    notes.push(
      "⚠ Полиномы и поверочный расчёт не учитывают диэлектрик платы: подложка смещает резонанс и " +
      "оптимум F/B вниз по частоте. Закладывайте подстройку по измерению КСВ после изготовления.",
    );
  }
  notes.push("Размеры A/B/C/D переданы в поверочный расчёт: усиление, F/B, импеданс и ДН ниже посчитаны нашим методом моментов по этой геометрии.");

  return {
    title: `Moxon ${fmt(A, 0)}×${fmt(E, 0)} мм${flat ? " (печатная)" : ""} · ${f} МГц`,
    rows,
    analysisValues: {
      freqMHz: f,
      widthA: +A.toFixed(2),
      tailB: +B.toFixed(2),
      gapC: +C.toFixed(2),
      tailD: +D.toFixed(2),
      elementType: flat ? "flat" : "wire",
      diameterMm: flat ? inp.diameterMm : d,
      stripWmm: flat ? w : (inp.stripWmm ?? 4),
      floorDb: inp.floorDb,
      ...(inp.material != null ? { material: inp.material, rhoCustom: inp.rhoCustom ?? RHO_CUSTOM_DEFAULT } : {}),
    },
    notes,
  };
}
