// Омические потери в металле антенны (скин-эффект).
//
// Так же, как «Wire Loss» в EZNEC и «Skin effect load» в MININEC (pymininec): металл
// задаётся удельным сопротивлением ρ; на частоте f толщина скин-слоя δ = √(ρ/(π f μ0 μr)),
// поверхностное сопротивление Rs = √(π f μ0 μr ρ) (металл толще нескольких δ — для
// трубок, проволоки и фольги на УКВ это всегда так). Погонное сопротивление провода
// радиуса a: R′ = Rs/(2πa). Для плоской полоски шириной w берётся тот же
// эквивалентный радиус w/4, что и в электромагнитной модели (R′ = 2Rs/(πw)): он
// учитывает вытеснение тока к кромкам лишь приближённо — оценка скорее снизу.
// Внутренняя индуктивность хорошего проводника даёт ωL′ = R′ (Zs = Rs·(1 + j)).
// Потери уменьшают КУ относительно КНД: КУ = КНД · η, η = 1 − P_потерь/P_вх.

export const MU0 = 4e-7 * Math.PI;

export interface Material {
  id: string;
  label: string;
  /** Удельное сопротивление при 20 °C, Ом·мм²/м (= мкОм·м). null — идеальный проводник. */
  rhoOhmMm2PerM: number | null;
  note?: string;
}

/** Справочные значения при 20 °C. Для сплавов значение зависит от марки — см. note. */
export const MATERIALS: Material[] = [
  { id: "pec", label: "Идеальный проводник (потери не учитываются)", rhoOhmMm2PerM: null },
  { id: "cu", label: "Медь", rhoOhmMm2PerM: 0.01724, note: "отожжённая медь, МЭК 60028" },
  { id: "al", label: "Алюминий", rhoOhmMm2PerM: 0.02826, note: "чистый алюминий, МЭК 60889; у сплавов (АД31, Д16) выше — 0.033…0.05, задайте своё значение" },
  { id: "brass", label: "Латунь", rhoOhmMm2PerM: 0.065, note: "латунь Л63 (справочно); у других марок 0.04…0.08 — задайте своё значение" },
  { id: "steel", label: "Нержавеющая сталь", rhoOhmMm2PerM: 0.72, note: "аустенитная 12Х18Н10Т / AISI 321 (немагнитная, справочно)" },
  { id: "custom", label: "Своё значение ρ", rhoOhmMm2PerM: null },
];

/** Начальное значение поля «своё ρ», Ом·мм²/м (стартовое значение поля, не данные изделия). */
export const RHO_CUSTOM_DEFAULT = 0.05;

/** ρ в Ом·м по выбору материала; null — потерь нет. */
export function resistivityOf(materialId: string | undefined, customOhmMm2PerM?: number): number | null {
  if (!materialId || materialId === "pec") return null;
  if (materialId === "custom") return customOhmMm2PerM != null && customOhmMm2PerM > 0 ? customOhmMm2PerM * 1e-6 : null;
  const m = MATERIALS.find((x) => x.id === materialId);
  return m && m.rhoOhmMm2PerM != null ? m.rhoOhmMm2PerM * 1e-6 : null;
}

/** Поверхностное сопротивление Rs, Ом. */
export function surfaceResistance(rhoOhmM: number, freqHz: number, muR = 1): number {
  return Math.sqrt(Math.PI * freqHz * MU0 * muR * rhoOhmM);
}

/** Толщина скин-слоя δ, м. */
export function skinDepth(rhoOhmM: number, freqHz: number, muR = 1): number {
  return Math.sqrt(rhoOhmM / (Math.PI * freqHz * MU0 * muR));
}

/** Погонное сопротивление потерь R′, Ом/м, проводника с (эквивалентным) радиусом a. */
export function lossPerMeter(rhoOhmM: number | null, freqHz: number, radiusM: number): number {
  if (rhoOhmM == null || !(radiusM > 0)) return 0;
  return surfaceResistance(rhoOhmM, freqHz) / (2 * Math.PI * radiusM);
}

/** Текст о потерях для примечаний под ДН. */
export function lossNote(materialId: string | undefined, rhoOhmM: number | null, freqHz: number, eff: number | undefined): string {
  if (rhoOhmM == null) {
    return "Потери в металле не учитываются (идеальный проводник): КУ = КНД. Чтобы учесть скин-эффект, выберите материал проводника.";
  }
  const m = MATERIALS.find((x) => x.id === materialId);
  const name = m && materialId !== "custom" ? m.label.toLowerCase() : "заданный металл";
  const d = skinDepth(rhoOhmM, freqHz) * 1e6;
  const effTxt = eff != null && Number.isFinite(eff)
    ? ` КПД по потерям в металле η = ${(eff * 100).toFixed(eff > 0.995 ? 2 : 1)} % (${(10 * Math.log10(Math.max(eff, 1e-9))).toFixed(2)} дБ), КУ = КНД + 10·lg η.`
    : "";
  return (
    `Учтены потери в металле (скин-эффект): ${name}, ρ = ${(rhoOhmM * 1e6).toFixed(4)} Ом·мм²/м, ` +
    `толщина скин-слоя ${d < 10 ? d.toFixed(2) : d.toFixed(1)} мкм.${effTxt}` +
    (m?.note && materialId !== "custom" ? ` Значение ρ — ${m.note}.` : "")
  );
}
