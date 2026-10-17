// ПРОЕКТИРОВАНИЕ симметричного вибратора (диполя).
//
// Здесь мы НЕ пользуемся ходовым «L = 0.95·λ/2»: этот множитель не учитывает толщину
// проводника, а она и определяет укорочение (у толстого вибратора резонанс заметно ниже).
// Вместо эмпирики РЕШАЕМ ЗАДАЧУ ЧЕСТНО: методом моментов ищем длину, при которой реактивная
// составляющая входного сопротивления обращается в ноль (Im Z = 0) — это и есть резонанс.
// Тот же самый решатель проверен против NEC2, поэтому синтез и поверочный расчёт
// физически согласованы между собой.

import { RHO_CUSTOM_DEFAULT, resistivityOf } from "../physics/conductor";
import { type DesignResult, type DesignRow, fmt } from "../fields";
import { C_LIGHT } from "../physics/mom3d";
import { dipoleZ } from "../physics/dipole";

export interface DipoleDesignInput {
  freqMHz: number;
  elementType: string; // "flat" | "wire"
  diameterMm: number;
  stripWmm: number;
  /** Зазор (разрез) в точке питания, мм. 0 — не задан. */
  feedGapMm?: number;
  floorDb: number;
  /** Материал проводника (переносится в поверочный расчёт; см. physics/conductor.ts). */
  material?: string;
  rhoCustom?: number;
}

// Входное сопротивление считается ТОЙ ЖЕ функцией, что и в поверочном расчёте
// (physics/dipole.ts → dipoleZ), с той же сеткой и той же моделью зазора. Раньше здесь
// стояла своя функция с жёсткими 31 сегментами — синтез и проверка могли разойтись.

export function designDipole(inp: DipoleDesignInput): DesignResult {
  const f = inp.freqMHz;
  const notes: string[] = [];
  const flat = inp.elementType === "flat";
  // Плоская полоска шириной w эквивалентна круглому проводу диаметром ≈ w/2
  // (эквивалентный радиус полоски r_экв ≈ w/4).
  const diaMm = flat ? inp.stripWmm / 2 : inp.diameterMm;

  if (!(f > 0 && diaMm > 0)) {
    return { title: `Диполь · ${f} МГц`, rows: [], analysisValues: {}, notes: ["⚠ Частота и размер проводника должны быть > 0."] };
  }

  const lambdaMm = (C_LIGHT / (f * 1e6)) * 1000;
  const radiusM = diaMm / 2000;
  const gapMm = Math.max(0, inp.feedGapMm ?? 0);
  const gapM = gapMm / 1000;
  const rho = resistivityOf(inp.material, inp.rhoCustom);
  const zOfLength = (lenM: number, r: number, fr: number) => dipoleZ(lenM, r, fr, gapM, rho);

  // Поиск резонанса: Im Z(L) монотонно растёт с длиной вблизи λ/2.
  let lo = 0.36 * lambdaMm / 1000, hi = 0.56 * lambdaMm / 1000;
  let xLo = zOfLength(lo, radiusM, f).im, xHi = zOfLength(hi, radiusM, f).im;
  let resonantM = 0.475 * lambdaMm / 1000;
  let converged = false;

  if (xLo < 0 && xHi > 0) {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const xm = zOfLength(mid, radiusM, f).im;
      if (xm > 0) { hi = mid; xHi = xm; } else { lo = mid; xLo = xm; }
      if (hi - lo < 1e-6) break;
    }
    resonantM = (lo + hi) / 2;
    converged = true;
  } else {
    notes.push("⚠ Резонанс не удалось локализовать в диапазоне 0.36…0.56λ — показана типовая длина 0.475λ. Проверьте диаметр проводника.");
  }

  const Lmm = resonantM * 1000;
  const zRes = zOfLength(resonantM, radiusM, f);
  const shorten = Lmm / (lambdaMm / 2); // коэффициент укорочения к идеальной λ/2
  const ratio = Lmm / diaMm;

  const rows: DesignRow[] = [
    { group: "Общее", label: "Длина волны λ", value: fmt(lambdaMm, 1), unit: "мм" },
    { group: "Общее", label: "Идеальная λ/2", value: fmt(lambdaMm / 2, 1), unit: "мм", hint: "без учёта толщины — так не делают" },
    { group: "Размеры", label: "Полная длина вибратора (резонанс)", value: fmt(Lmm, 1), unit: "мм", key: true, hint: "найдена по условию Im Z = 0 методом моментов" },
    {
      group: "Размеры", label: "Зазор (разрез) в точке питания",
      value: gapMm > 0 ? fmt(gapMm, 1) : "не задан", unit: gapMm > 0 ? "мм" : "",
      hint: gapMm > 0 ? "полная длина указана с ним" : "задайте, чтобы получить точную длину плеча",
    },
    {
      group: "Размеры", label: "Длина одного плеча", value: fmt((Lmm - gapMm) / 2, 2), unit: "мм", key: true,
      hint: gapMm > 0 ? `(${fmt(Lmm, 1)} − ${fmt(gapMm, 1)}) / 2, 2 шт.` : "половина полной длины (зазор не задан)",
    },
    { group: "Размеры", label: "Коэффициент укорочения", value: fmt(shorten, 4), unit: "", hint: "отношение к идеальной λ/2" },
    {
      group: "Проводник",
      label: flat ? "Ширина дорожки" : "Диаметр проводника",
      value: fmt(flat ? inp.stripWmm : inp.diameterMm, 2), unit: "мм",
      hint: flat ? `эквивалентный круглый Ø ${fmt(diaMm, 2)} мм` : `L/d = ${fmt(ratio, 0)}`,
    },
    { group: "Электрика", label: "Входное сопротивление в резонансе", value: fmt(zRes.re, 1), unit: "Ом", key: true, hint: `реактивность ${fmt(zRes.im, 2)} Ом` },
  ];

  const swr = (() => {
    const g = Math.sqrt((zRes.re - 50) ** 2 + zRes.im ** 2) / Math.sqrt((zRes.re + 50) ** 2 + zRes.im ** 2);
    return (1 + g) / (1 - g);
  })();
  rows.push({ group: "Электрика", label: "КСВ в кабеле 50 Ом", value: fmt(swr, 2), unit: "" });

  if (converged) {
    notes.push(
      `Длина найдена численно: подобрана такая длина, при которой реактивность входного сопротивления = 0 ` +
      `(получилось ${fmt(zRes.re, 1)} ${zRes.im >= 0 ? "+" : "−"} j${fmt(Math.abs(zRes.im), 2)} Ом). ` +
      `Коэффициент укорочения ${fmt(shorten, 3)} получился сам, из толщины проводника, а не взят из таблицы.`,
    );
  }
  if (flat) {
    notes.push("Плоская планка пересчитана в эквивалентный круглый проводник (радиус ≈ ширина/4) — стандартный приём для тонкой полоски.");
  }
  if (swr > 1.6) {
    notes.push(`Сопротивление ${fmt(zRes.re, 0)} Ом заметно отличается от 50 Ом (КСВ ${fmt(swr, 2)}). Для питания 50-омным кабелем нужен согласующий узел, либо петлевой вибратор с трансформацией.`);
  }

  return {
    title: `Диполь ${fmt(Lmm, 0)} мм · ${f} МГц`,
    rows,
    analysisValues: {
      freqMHz: f,
      lengthMm: +Lmm.toFixed(1),
      elementType: inp.elementType,
      diameterMm: inp.diameterMm,
      stripWmm: inp.stripWmm,
      feedGapMm: gapMm,
      floorDb: inp.floorDb,
      ...(inp.material != null ? { material: inp.material, rhoCustom: inp.rhoCustom ?? RHO_CUSTOM_DEFAULT } : {}),
    },
    notes,
  };
}
