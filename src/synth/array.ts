// ПРОЕКТИРОВАНИЕ линейной решётки одинаковых излучателей.
// Классика равномерной линейной решётки (бродсайд):
//   D ≈ 2·N·d/λ            (КНД при d ≈ λ/2, изотропные элементы)
//   HPBW ≈ 0.886·λ/(N·d)   рад  →  ≈ 50.8·λ/(N·d) градусов
//   УБЛ равномерного возбуждения ≈ −13.2 дБ (первый боковой), от N почти не зависит.
// Задача синтеза: по требуемому КНД (или ширине луча) подобрать N при выбранном шаге.

import { type DesignResult, type DesignRow, fmt } from "../fields";

const C_MM = 299792.458; // мм·МГц

export interface ArrayDesignInput {
  freqMHz: number;
  goal: string;            // "gain" | "beam"
  targetGainDbi: number;
  targetHpbwDeg: number;
  spacingRel: number;      // шаг в долях λ
  phaseDeg: number;
  floorDb: number;
}

export function designArray(inp: ArrayDesignInput): DesignResult {
  const f = inp.freqMHz, dRel = inp.spacingRel;
  const notes: string[] = [];

  if (!(f > 0 && dRel > 0)) {
    return { title: `Решётка · ${f} МГц`, rows: [], analysisValues: {}, notes: ["⚠ Частота и шаг должны быть > 0."] };
  }

  const lambda = C_MM / f;
  const d = dRel * lambda;

  let N: number;
  if (inp.goal === "beam") {
    // HPBW ≈ 50.8·λ/(N·d) → N = 50.8/(HPBW·d/λ)
    const hp = Math.max(0.5, inp.targetHpbwDeg);
    N = Math.max(2, Math.round(50.8 / (hp * dRel)));
  } else {
    // D ≈ 2·N·d/λ → N = D/(2·d/λ)
    const Dlin = Math.pow(10, inp.targetGainDbi / 10);
    N = Math.max(2, Math.round(Dlin / (2 * dRel)));
  }
  if (N > 64) { N = 64; notes.push("⚠ Требуется больше 64 элементов — ограничено 64. Возьмите больший шаг или смягчите требование."); }

  const Dlin = 2 * N * dRel;
  const Ddbi = 10 * Math.log10(Dlin);
  const hpbw = 50.8 / (N * dRel);
  const apertureMm = (N - 1) * d;

  if (dRel >= 1.0) notes.push("⚠ Шаг ≥ λ — появятся дифракционные (побочные главные) лепестки. Для бродсайда держите шаг < λ.");
  else if (dRel > 0.9) notes.push("⚠ Шаг близок к λ — дифракционные лепестки на подходе, проверьте ДН ниже.");

  const rows: DesignRow[] = [
    { group: "Общее", label: "Длина волны λ", value: fmt(lambda, 1), unit: "мм" },
    { group: "Решётка", label: "Число элементов N", value: String(N), unit: "шт", key: true },
    { group: "Решётка", label: "Шаг d", value: fmt(d, 1), unit: "мм", key: true, hint: `${fmt(dRel, 3)}λ` },
    { group: "Решётка", label: "Длина апертуры (N−1)·d", value: fmt(apertureMm, 1), unit: "мм" },
    { group: "Решётка", label: "Фазовый сдвиг β", value: fmt(inp.phaseDeg, 0), unit: "°", hint: inp.phaseDeg === 0 ? "бродсайд — луч поперёк оси" : "сканирование" },
    { group: "Ожидаемые характеристики", label: "КНД (оценка 2·N·d/λ)", value: fmt(Ddbi, 2), unit: "дБи", key: true },
    { group: "Ожидаемые характеристики", label: "Ширина луча (50.8λ/(N·d))", value: fmt(hpbw, 2), unit: "°" },
    { group: "Ожидаемые характеристики", label: "УБЛ равномерного возбуждения", value: "−13.2", unit: "дБ", hint: "первый боковой; от N практически не зависит" },
  ];

  if (inp.phaseDeg !== 0) {
    const arg = -inp.phaseDeg / 360 / dRel; // cosθ = −β/(k·d), β в градусах
    if (Math.abs(arg) <= 1) {
      rows.push({
        group: "Ожидаемые характеристики", label: "Направление главного луча",
        value: fmt((Math.acos(arg) * 180) / Math.PI, 1), unit: "°", hint: "от оси решётки; θ = arccos(−β/kd)",
      });
    } else {
      notes.push("⚠ Заданный фазовый сдвиг выводит луч за пределы видимой области (|−β/kd| > 1) — луч не формируется.");
    }
  }

  notes.push("Оценки КНД и ширины луча даны для ИЗОТРОПНЫХ элементов (чистый множитель решётки). Реальные излучатели добавят свою направленность — итоговое усиление будет выше.");
  notes.push("Возбуждение равномерное (все элементы с одинаковой амплитудой): максимум КНД, но УБЛ фиксирован около −13 дБ. Для низкого УБЛ нужно амплитудное распределение (Чебышёв, Тейлор) — в этой версии не реализовано.");

  return {
    title: `Решётка ${N} эл. · ${f} МГц`,
    rows,
    analysisValues: {
      freqMHz: f,
      count: N,
      spacingMm: +d.toFixed(2),
      phaseDeg: inp.phaseDeg,
      floorDb: inp.floorDb,
    },
    notes,
  };
}
