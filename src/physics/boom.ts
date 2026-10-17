// Поправка длины элемента волнового канала на металлический бум.
// Общий модуль: используется И синтезом (прибавить к длине при раскрое),
// И поверочным расчётом (вычесть из введённой длины, чтобы получить
// эквивалентную свободнопространственную длину для MoM).
//
// ИСТОЧНИК: DG7YBN https://dg7ybn.de/BC_numbers/BC.htm, DL2KQ http://dl2kq.de/ant/3-53.htm
//   C = 25.195·B − 229·B²,  B = D_бума/λ,  ΔL = C·D_бума  (элемент сквозь бум, контакт).
//   Формула годна при B ≤ 0.055λ. Вершина параболы: B* = 25.195/(2·229) = 0.05501,
//   C_max = 0.6929 — то есть поправка никогда не превышает 0.693 диаметра бума.
//   Это согласуется (с точностью 4 %) с указанием самого DL6WU «добавка никогда
//   не превышала 2/3 диаметра бума»; формулу не подгоняем под круглое число 2/3,
//   потому что коэффициенты взяты из публикации как есть.

export type Mounting =
  | "none"
  | "through-contact"
  | "through-insulated"
  | "ontop-contact"
  | "dielectric";

/** Множитель поправки по типу крепления и форме бума. */
export function mountingMultiplier(mounting: string, boomShape: string): number {
  switch (mounting) {
    case "through-contact": return 1.0;
    case "through-insulated": return 0.5;
    case "ontop-contact": return boomShape === "square" ? 0.7 : 0.55;
    default: return 0; // "dielectric", "none" и всё неизвестное
  }
}

/**
 * Поправка длины элемента на бум, мм (ПОЛНАЯ длина: по половине на каждое плечо).
 * Положительное число — насколько элемент на металлическом буме должен быть
 * ДЛИННЕЕ свободнопространственного, чтобы резонировать на той же частоте.
 */
export function boomCorrectionMm(
  boomDiaMm: number,
  lambdaMm: number,
  mounting: string,
  boomShape: string,
): { deltaMm: number; warn: string | null } {
  const mult = mountingMultiplier(mounting, boomShape);
  if (mult === 0 || !(boomDiaMm > 0) || !(lambdaMm > 0)) return { deltaMm: 0, warn: null };

  const B = boomDiaMm / lambdaMm;
  let warn: string | null = null;
  if (B > 0.055) {
    warn =
      `⚠ Бум ${B.toFixed(3)}λ толще границы применимости формулы поправки (0.055λ). ` +
      `Поправка посчитана по максимуму кривой (0.693 диаметра) — проверьте измерением.`;
  }
  const Bc = Math.min(B, 0.055);
  const Cfull = 25.195 * Bc - 229 * Bc * Bc; // доля от диаметра бума
  return { deltaMm: Cfull * boomDiaMm * mult, warn };
}
