// Синтез микрополосковой линии: ширина дорожки по заданному волновому сопротивлению,
// эффективная диэлектрическая проницаемость, длина четвертьволнового трансформатора.
//
// ЗАЧЕМ ЭТО В КАЛЬКУЛЯТОРЕ. Патч проектируется с питанием микрополоском: нужно знать
// ШИРИНУ 50-омной дорожки на выбранной подложке и, при питании с края, размеры
// четвертьволнового трансформатора. Раньше программа выдавала только размеры патча и
// глубину врезки — ширину линии приходилось считать отдельным калькулятором.
//
// ФОРМУЛЫ — классический синтез Уилера–Хаммерстада (Wheeler 1965, Hammerstad 1975),
// в том виде, как они приведены у Balanis «Antenna Theory» (8-26, 8-27) и Pozar
// «Microwave Engineering» (3.197). Те же формулы стоят в мастере антенн HFSS
// (syslib/ACT/ATKDesign/Lib/atkHelperCalcs.py, функция MicrostipCalc) — проверено
// сравнением результатов, расхождение < 0.5 %.
//
// Область применимости: 0.05 ≤ W/h ≤ 20, εr ≤ 16, толщина металлизации не учитывается
// (для 35 мкм меди на 1.5 мм подложке поправка к ширине < 2 %), дисперсия не учитывается
// (на СВЧ до ~10 ГГц на тонких подложках ошибка εeff < 1 %).

export interface MicrostripResult {
  /** Ширина дорожки, мм. */
  widthMm: number;
  /** Эффективная диэлектрическая проницаемость. */
  epsEff: number;
  /** Длина волны в линии, мм. */
  lambdaGmm: number;
  /** Длина четвертьволнового отрезка, мм. */
  quarterMm: number;
  /** W/h — отношение, по которому выбрана ветвь формулы (для примечаний). */
  wOverH: number;
}

/** Эффективная проницаемость микрополоска шириной W на подложке h (Hammerstad). */
export function microstripEpsEff(widthMm: number, hMm: number, er: number): number {
  const u = widthMm / hMm;
  const base = (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 12 / u, -0.5);
  // Для узких дорожек (W/h < 1) добавляется поправка Hammerstad.
  return u < 1 ? base + ((er - 1) / 2) * 0.04 * Math.pow(1 - u, 2) : base;
}

/** Волновое сопротивление микрополоска шириной W (обратная задача, Hammerstad). */
export function microstripZ0(widthMm: number, hMm: number, er: number): number {
  const u = widthMm / hMm, ee = microstripEpsEff(widthMm, hMm, er);
  return u <= 1
    ? (60 / Math.sqrt(ee)) * Math.log(8 / u + u / 4)
    : (120 * Math.PI) / (Math.sqrt(ee) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
}

/**
 * Синтез: ширина дорожки под заданное Z0 и длина четвертьволнового отрезка.
 * hMm — толщина подложки, er — её проницаемость, fMHz — частота.
 */
export function microstripSynth(z0: number, er: number, hMm: number, fMHz: number): MicrostripResult {
  const A = (z0 / 60) * Math.sqrt((er + 1) / 2) + ((er - 1) / (er + 1)) * (0.23 + 0.11 / er);
  const B = (377 * Math.PI) / (2 * z0 * Math.sqrt(er));
  const uThin = (8 * Math.exp(A)) / (Math.exp(2 * A) - 2);
  const uWide = (2 / Math.PI) * (B - 1 - Math.log(2 * B - 1) + ((er - 1) / (2 * er)) * (Math.log(B - 1) + 0.39 - 0.61 / er));
  // Ветвь выбирается по самому результату: узкая формула годна при W/h < 2, широкая — при W/h > 2.
  const u = uThin < 2 ? uThin : uWide;
  const widthMm = u * hMm;
  const epsEff = microstripEpsEff(widthMm, hMm, er);
  const lambda0mm = 299792.458 / fMHz;
  const lambdaGmm = lambda0mm / Math.sqrt(epsEff);
  return { widthMm, epsEff, lambdaGmm, quarterMm: lambdaGmm / 4, wOverH: u };
}
