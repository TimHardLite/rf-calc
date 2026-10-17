import { withDisplayFloor } from "./display";
// Помехоустойчивая GNSS-антенна ИРТ (сборка GPS): N идентичных вертикальных спиралей
// (медный скотч по вспененному основанию либо круглый провод), запитанных синфазно,
// над токопроводящим экраном. Спирали работают в осевом режиме (окружность витка ≈ λ на
// GPS L1) — приём с верхней полусферы, круговая поляризация.
//
// Модель: обобщённый тонкопроволочный MoM (mom3d.ts), синфазное питание всех спиралей
// у основания. Экран — на выбор:
//   • «конечный» (по умолчанию) — плоский круглый диск заданного диаметра, смоделированный
//     проволочной сеткой прямо в методе моментов (как в NEC2). Поле считается по ВСЕЙ
//     сфере: видны и излучение вдоль горизонта, и задний лепесток из-за дифракции
//     на кромке экрана;
//   • «бесконечный» — идеальная плоскость z = 0 (метод зеркальных изображений);
//     под экраном поля нет по построению;
//   • «нет» — свободное пространство (спираль тогда работает в обратном режиме).
//
// ⚠ ОГРАНИЧЕНИЯ МОДЕЛИ (важно для паспорта):
//  1. Реальные экраны изделия (поз. 2 наружный, поз. 3 внутренний — вспененный ПВХ
//     с токопроводящим покрытием) имеют форму колец с бортиком; их точная геометрия
//     в модели не воспроизводится — берётся плоский диск заданного диаметра.
//  2. Число витков, шаг намотки и высота спиралей в чертежах не проставлены — заданы
//     как вводимые параметры. Их НЕОБХОДИМО заменить фактическими значениями намотки.

import { C_LIGHT, solve3D, type Wire } from "./mom3d";
import { thinWireWarnings } from "./wirevalid";
import { lossPerMeter, resistivityOf, lossNote } from "./conductor";
import { diskGrid, gridUnknowns } from "./wiregrid";
import type { PatternResult, PatternPoint } from "./types";
import { toDb, halfPowerBeamwidth, frontToBack, convergenceNote } from "./mathutil";
import { vswr, mismatchLossDb, helixAxialRatio } from "./rfutil";

export interface GnssInput {
  freqMHz: number;
  helixCount: number;     // число спиралей (обычно 3)
  helixDiaMm: number;     // диаметр спирали (по чертежу основания ≈ 60 мм)
  turns: number;          // число витков (⚠ нет в чертежах — введите фактическое)
  heightMm: number;       // высота намотки (⚠ нет в чертежах — введите фактическое)
  arrangeRadiusMm: number;// радиус расстановки центров спиралей по кругу (⚠ уточните)
  /** Проводник намотки: "tape" — медная лента (скотч) шириной tapeWidthMm, эквивалентный
   *  радиус w/4; "wire" — круглый провод диаметром wireDiaMm, радиус d/2. */
  conductor?: "tape" | "wire";
  tapeWidthMm: number;    // ширина медного скотча
  wireDiaMm?: number;     // диаметр провода намотки (при conductor = "wire")
  sense: string;          // "RH" | "LH" — направление намотки
  /** Экран под спиралями:
   *   "finite"   — плоский круглый диск диаметром screenDiaMm (проволочная сетка в MoM);
   *   "infinite" — бесконечная идеально проводящая плоскость (зеркальные изображения);
   *   "none"     — экрана нет, свободное пространство.
   *  Для совместимости принимается и boolean: true = "infinite", false = "none". */
  groundPlane?: boolean | "finite" | "infinite" | "none";
  /** Диаметр конечного экрана, мм. */
  screenDiaMm?: number;
  /** Только для верификации (в интерфейсе нет): ячейка сетки λ/gridCellDiv (по умолч. 8)
   *  и радиус проводов сетки, мм (по умолч. правило равной площади). */
  gridCellDiv?: number;
  gridWireRadiusMm?: number;
  /** Высота основания намотки над экраном, мм (стойка / питающий штырь). */
  standoffMm?: number;
  /** Материал намотки (conductor.ts): pec | cu | al | brass | steel | custom.
   *  Потери учитываются только в спиралях; экран считается идеальным. */
  material?: string;
  /** ρ, Ом·мм²/м — при material = custom. */
  rhoCustom?: number;
  floorDb: number;
}

/**
 * Винтовая ломаная: центр (cx,cy), диаметр D, высота H, число витков T, шагов на виток.
 * z0 — отступ основания над плоскостью экрана. При расчёте с экраном отступ обязателен:
 * горизонтальный проводник, лежащий ПРЯМО на идеально проводящей плоскости, полностью
 * гасится своим изображением, и решение вырождается. Физически это и есть высота
 * стойки/питающего штыря, на которой намотка стоит над экраном.
 */
export function helixWire(
  cx: number, cy: number, D: number, H: number, T: number,
  stepsPerTurn: number, sign: number, radius: number, seglen: number, z0 = 0,
): { wire: Wire; base: [number, number, number] } {
  const pts: [number, number, number][] = [];
  const nSteps = Math.max(6, Math.round(T * stepsPerTurn));
  // Питающий штырь от экрана до начала намотки — вертикальный отрезок.
  if (z0 > 0) pts.push([cx + (D / 2), cy, 0]);
  for (let i = 0; i <= nSteps; i++) {
    const frac = i / nSteps;
    const ang = sign * 2 * Math.PI * T * frac;
    const z = z0 + H * frac;
    pts.push([cx + (D / 2) * Math.cos(ang), cy + (D / 2) * Math.sin(ang), z]);
  }
  return { wire: { pts, radius, seglen }, base: pts[0] };
}

/** Предел размера задачи с сетчатым экраном (время расчёта — секунды). */
const MAX_UNKNOWNS = 1400;
/** Итог сверки сетчатого экрана (см. тесты и «Верификация расчётов»). */
const GRID_VERIFIED =
  "Сверено с NEC2 на той же сетке (3 спирали, экран Ø 285,3 мм): КНД 12,63 против 12,55 дБи, " +
  "главный лепесток до горизонта совпадает в пределах 0,3 дБ; при увеличении экрана КНД сходится " +
  "к расчёту с бесконечным экраном (±0,2 дБ).";

function computeGnssModel(inp: GnssInput): PatternResult {
  const f = inp.freqMHz;
  const lambdaMm = (C_LIGHT / (f * 1e6)) * 1000;
  const notes: string[] = [];

  const empty = (msg: string): PatternResult => ({
    antennaKind: "gnss",
    title: `Диаграмма направленности GNSS-спирали · ${f} МГц`,
    planes: [{ label: "Вертикальный срез (плоскость φ=0)", points: [] }],
    referencePlaneIndex: 0,
    metrics: { freqMHz: f, lambdaMm, directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null },
    notes: [msg],
  });

  const conductor = inp.conductor === "wire" ? "wire" : "tape";
  const condSize = conductor === "wire" ? (inp.wireDiaMm ?? NaN) : inp.tapeWidthMm;
  if (!(inp.helixCount >= 1 && inp.helixDiaMm > 0 && inp.turns > 0 && inp.heightMm > 0
        && inp.arrangeRadiusMm >= 0 && condSize > 0)) {
    return empty(
      `⚠ Все размеры (диаметр, витки, высота, ${conductor === "wire" ? "диаметр провода" : "ширина скотча"}) должны быть > 0.`,
    );
  }
  const gp = inp.groundPlane;
  const screen: "finite" | "infinite" | "none" =
    gp === false || gp === "none" ? "none" : gp === true || gp === "infinite" ? "infinite"
      : "finite"; // по умолчанию — конечный экран, как в изделии
  const screenDiaMm = inp.screenDiaMm ?? 285.3;
  if (screen === "finite" && !(screenDiaMm > 0)) return empty("⚠ Диаметр экрана должен быть > 0.");

  // Единицы: метры.
  const D = inp.helixDiaMm / 1000;
  const H = inp.heightMm / 1000;
  const Rarr = inp.arrangeRadiusMm / 1000;
  const T = inp.turns;
  // Радиус проводника в модели. Круглый провод Ø d: r = d/2. Плоская лента шириной w:
  // эквивалентный радиус r = w/4 (классический результат для тонкой полоски, Balanis).
  const rad = conductor === "wire"
    ? Math.max(condSize / 2000, 1e-5)
    : Math.max(condSize / 4000, 1e-4);
  const sign = inp.sense === "LH" ? -1 : 1;

  // Длина витка ≈ sqrt((πD)² + (H/T)²); сегмент ≈ λ/18 для устойчивости и скорости.
  const lam = lambdaMm / 1000;
  const seglen = lam / 18;
  const turnLen = Math.sqrt((Math.PI * D) ** 2 + (H / T) ** 2);
  const stepsPerTurn = Math.max(10, Math.round(turnLen / seglen));

  const useGround = screen !== "none";
  // Параметры сетки конечного экрана: ячейка λ/8 (не крупнее трети радиуса экрана —
  // чтобы и малый экран имел ≥3 кольца), радиус проводов сетки — по правилу равной
  // площади r = s/(2π): при нём сетка эквивалентна сплошной пластине (проверено:
  // при более тонких проводах сетка «просвечивает» и задний лепесток растёт на 10 дБ).
  const Rs = screenDiaMm / 2000;
  const cell = Math.min(lam / (inp.gridCellDiv ?? 8), Rs / 3);
  const wr = inp.gridWireRadiusMm != null ? inp.gridWireRadiusMm / 1000 : cell / (2 * Math.PI);
  const standoffUser = (inp.standoffMm ?? 0) / 1000;
  let standoff = useGround ? Math.max(standoffUser, seglen / 2) : 0;
  // Над СЕТКОЙ проводник спирали не может лежать ближе, чем позволяет тонкопроволочная
  // модель: зазор между поверхностями провода спирали и проводов сетки — не меньше
  // радиуса провода сетки, т.е. высота основания ≥ r_спир + 2·r_сетки. При меньшем
  // зазоре проволочная модель экрана недостоверна (сверено с NEC2 на той же сетке:
  // при 5 мм расхождение в заднем полупространстве до 4 дБ, при ≥ 8 мм — ≤ 1.5 дБ).
  let standoffRaised = false;
  if (screen === "finite") {
    const minSo = rad + 2 * wr;
    if (standoff < minSo) { standoff = minSo; standoffRaised = true; }
  }

  // Спирали не должны пересекаться: при расстановке по кругу соседние центры разнесены на
  // 2·R·sin(π/N). Иначе провода разных спиралей совпадают, матрица вырождается, и расчёт
  // дал бы NaN вместо ДН.
  if (inp.helixCount > 1) {
    const pitch = 2 * Rarr * Math.sin(Math.PI / inp.helixCount);
    if (pitch < D + 2 * rad) {
      return empty(
        `⚠ Спирали пересекаются: при радиусе расстановки ${inp.arrangeRadiusMm} мм центры соседних спиралей ` +
        `разнесены на ${(pitch * 1000).toFixed(1)} мм, а нужно больше диаметра спирали с проводником ` +
        `(${((D + 2 * rad) * 1000).toFixed(1)} мм). Увеличьте радиус расстановки или задайте одну спираль ` +
        `(радиус 0 допустим только для одной спирали на оси).`,
      );
    }
  }

  const rho = resistivityOf(inp.material, inp.rhoCustom);
  if (inp.material === "custom" && rho == null) {
    notes.push("⚠ Материал «своё значение», но ρ не задано (или ≤ 0) — потери не учтены.");
  }
  const lossM = lossPerMeter(rho, f * 1e6, rad);

  const wires: Wire[] = [];
  const feeds: [number, number, number][] = [];
  for (let n = 0; n < inp.helixCount; n++) {
    const a = inp.helixCount > 1 ? (2 * Math.PI * n) / inp.helixCount : 0;
    const cx = Rarr * Math.cos(a), cy = Rarr * Math.sin(a);
    const { wire, base } = helixWire(cx, cy, D, H, T, stepsPerTurn, sign, rad, seglen, standoff);
    wire.lossPerM = lossM;
    wires.push(wire);
    feeds.push(base);
  }

  // --- Конечный экран: проволочная сетка ---------------------------------------
  // Сетку перечисляем
  // ПОСЛЕ спиралей: в узле, где стоит основание спирали, «опорным» тогда становится
  // провод спирали, и генератор включается между питающим штырём и экраном.
  let gridInfo = "";
  if (screen === "finite") {
    // Основания спиралей обязаны стоять на экране.
    const footR = Math.max(...feeds.map((p) => Math.hypot(p[0], p[1])));
    if (footR > Rs - cell / 2) {
      return empty(
        `⚠ Основания спиралей (до ${(footR * 1000).toFixed(1)} мм от центра) выходят за край экрана ` +
        `Ø ${screenDiaMm} мм или стоят вплотную к нему. Увеличьте диаметр экрана или уменьшите радиус расстановки.`,
      );
    }
    const g = diskGrid(Rs, cell, wr, feeds);
    const est = inp.helixCount * (T * stepsPerTurn) + gridUnknowns(g);
    if (est > MAX_UNKNOWNS) {
      return empty(
        `⚠ Слишком крупная задача (~${Math.round(est)} неизвестных вместе с сеткой экрана) для расчёта ` +
        `в приложении. Уменьшите диаметр экрана, число витков или спиралей — либо посчитайте ` +
        `с бесконечным экраном.`,
      );
    }
    wires.push(...g.wires);
    gridInfo =
      `сетка ${g.edges.length} проводов, ячейка ${(cell * 1000).toFixed(1)} мм (λ/${(lam / cell).toFixed(1)}), ` +
      `радиус проводов сетки ${(wr * 1000).toFixed(2)} мм`;
  } else {
    const estBasis = inp.helixCount * (T * stepsPerTurn - 1);
    if (estBasis > 700) {
      return empty(
        `⚠ Слишком крупная задача (~${Math.round(estBasis)} базисных функций) для быстрого расчёта в браузере. ` +
        `Уменьшите число витков/спиралей.`,
      );
    }
  }

  // Применимость тонкопроволочной модели по фактической длине провода спирали.
  const helixSegs: number[] = [];
  for (const w of wires.slice(0, inp.helixCount)) {
    for (let k = 1; k < w.pts.length; k++) {
      const a = w.pts[k - 1], b = w.pts[k];
      helixSegs.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
  }
  notes.push(...thinWireWarnings(
    [{ radiusM: rad, maxSegM: Math.max(...helixSegs), label: "спираль" }],
    lam,
  ));

  const r = solve3D(wires, f, { points: feeds }, { groundPlane: screen === "infinite" });

  // Осевой режим: главный луч вдоль +Z (зенит). Два ПОЛНЫХ вертикальных среза: φ=0 и φ=90.
  // a — угол от зенита по полному кругу: 0° — зенит (вверх), 90° — горизонт, 180° — надир.
  const cut = (phiPlane: number): PatternPoint[] => {
    const pts: PatternPoint[] = [];
    for (let a = 0; a < 360; a += 1) {
      const theta = a <= 180 ? a : 360 - a;
      const phi = a <= 180 ? phiPlane : (phiPlane + 180) % 360;
      // БЕСКОНЕЧНЫЙ экран: ниже его плоскости поля нет. Метод зеркальных изображений даёт
      // верное поле ТОЛЬКО в верхней полусфере; при θ > 90° формула механически возвращает
      // зеркальную копию верхней диаграммы, и без этой отсечки под экраном рисовался бы
      // фантомный лепесток той же величины, что главный.
      // КОНЕЧНЫЙ экран (сетка в MoM) считается по всей сфере — отсечки нет, задний
      // лепесток и излучение вдоль горизонта настоящие.
      const belowScreen = screen === "infinite" && theta > 90;
      const valueDb = belowScreen
        ? inp.floorDb
        : toDb(r.powerAt(theta, phi) / r.Umax, inp.floorDb);
      pts.push({ angleDeg: a, valueDb });
    }
    return pts;
  };
  const elev0 = cut(0);
  const elev90 = cut(90);

  const circ = Math.PI * inp.helixDiaMm;
  const condNote = conductor === "wire"
    ? `Намотка — круглый провод Ø ${condSize} мм (радиус в модели ${(rad * 1000).toFixed(2)} мм).`
    : `Намотка — медная лента шириной ${condSize} мм; в модели — эквивалентный круглый провод ` +
      `радиусом w/4 = ${(rad * 1000).toFixed(2)} мм (Ø ${(rad * 2000).toFixed(2)} мм).`;
  notes.push(condNote);
  if (screen === "finite") {
    notes.push(
      `Экран — плоский круглый диск Ø ${screenDiaMm} мм, смоделированный проволочной сеткой прямо ` +
      `в методе моментов, как это делают в NEC2 (${gridInfo}). Поле считается по ВСЕЙ сфере: ` +
      `излучение вдоль горизонта и задний лепесток (дифракция на кромке экрана) — настоящие. ` +
      `Основания спиралей подняты над экраном на ${(standoff * 1000).toFixed(1)} мм, генератор ` +
      `включён между питающим штырём и экраном. ${GRID_VERIFIED}`,
    );
    if (standoffRaised) {
      notes.push(
        `⚠ Высота основания намотки над экраном увеличена с введённых ${(standoffUser * 1000).toFixed(1)} ` +
        `до ${(standoff * 1000).toFixed(1)} мм: при меньшем зазоре провод спирали оказывается ближе к проводам ` +
        `сетки экрана, чем допускает тонкопроволочная модель (нужно ≥ r_спирали + 2·r_сетки). ` +
        `Чтобы посчитать с малым зазором, выберите «бесконечный экран» — там ограничения нет.`,
      );
    }
    notes.push(
      "⚠ Экраны изделия (поз. 2 наружный, поз. 3 внутренний — вспененный ПВХ с токопроводящим " +
      "покрытием) имеют форму колец с бортиком; в модели они заменены ПЛОСКИМ диском указанного " +
      "диаметра (по умолчанию 285,3 мм — габарит изделия по пояснительной записке). Бортик " +
      "дополнительно ослабляет приём с горизонта и снизу — для паспортной ДН помехоустойчивости " +
      "реальных экранов нужен полноволновой расчёт или измерение.",
    );
  } else if (screen === "infinite") {
    notes.push(
      `Под спиралью задан ПЛОСКИЙ БЕСКОНЕЧНЫЙ идеально проводящий экран (метод зеркальных ` +
      `изображений), основание намотки поднято над ним на ${(standoff * 1000).toFixed(1)} мм. ` +
      `Сверено с NEC2 (идеальная земля, 1575 МГц, D = 60 мм): наш КНД 9.24/10.09/10.94 дБи ` +
      `против 9.28/10.14/11.00 у NEC2 для 4/6/8 витков.`,
    );
    notes.push(
      "⚠ Бесконечный экран — идеализация: под ним поля нет, поэтому нижняя половина диаграммы " +
      "принудительно опущена на нижний предел шкалы, а вдоль горизонта уровень занижен против " +
      "реального. Для диаграммы с горизонтом и задним лепестком выберите «конечный экран».",
    );
  } else {
    notes.push(
      "⚠ Экран ОТКЛЮЧЁН — расчёт в свободном пространстве. Спираль с питанием у основания " +
      "в свободном пространстве излучает НАЗАД (backfire), главный луч смотрит в надир. " +
      "Это корректная физика свободного пространства, но НЕ то, как работает реальная " +
      "антенна над экраном. Для реальной геометрии включите экран.",
    );
  }
  notes.push(
    "⚠ Число витков, высота намотки и радиус расстановки в чертежах не заданы — введены как " +
    "параметры. Замените фактическими значениями вашей намотки.",
  );
  notes.push(
    "ДН построена на полный круг 360° в вертикальной плоскости: 0° — зенит, 90° — горизонт, " +
    "180° — надир." + (screen === "infinite"
      ? " Ниже плоскости бесконечного экрана (θ > 90°) поля нет — нижняя полусфера опущена" +
        " на нижний предел шкалы."
      : screen === "finite"
        ? " Нижняя полусфера — настоящее излучение за экран (дифракция на его кромке)."
        : " Задний лепесток здесь настоящий (расчёт MoM в свободном пространстве)."),
  );
  notes.push(
    "ОТКУДА ВЗЯТ ИМПЕДАНС. Значение Z в таблице выше — НЕ результат нашего расчёта методом " +
    "моментов: у спирали он слишком чувствителен к дискретизации у точки питания и к модели " +
    "питающего штыря, поэтому расчётный Z намеренно отброшен. Вместо него показана классическая " +
    "эмпирика Крауса (см. отдельное примечание ниже). Для паспорта импеданс и КСВ уточняйте " +
    "измерением или полноволновым расчётом.",
  );
  const cnv = convergenceNote(r.avgGain);
  if (cnv) notes.push(cnv);
  const eff = Number.isFinite(r.efficiency) ? r.efficiency : 1;
  notes.push(lossNote(inp.material, rho, f * 1e6, rho != null ? eff : undefined) +
    (rho != null ? " Потери учтены в проводнике спиралей; экран в модели идеальный." : ""));
  const gainDbi = r.gainDbi + 10 * Math.log10(Math.max(eff, 1e-9));
  const cRatio = circ / lambdaMm;

  // --- Классические соотношения осевого режима (Краус) ---
  // Годятся только когда окружность витка действительно близка к λ.
  const axialOk = cRatio >= 0.75 && cRatio <= 1.33;
  const krausR = axialOk ? 140 * cRatio : null;
  const arLin = helixAxialRatio(inp.turns);
  const arDb = axialOk && arLin ? 20 * Math.log10(arLin) : null;

  // Полоса по КСВ<3 (та же зависимость, что в режиме проектирования).
  let bandLo: number | undefined, bandHi: number | undefined;
  const gDb = r.gainDbi;
  if (axialOk && Number.isFinite(gDb) && gDb > 3 && inp.turns > 0) {
    const X = Math.sqrt(1.07 * Math.pow((0.91 * gDb) / (gDb - 3), 1.33 / Math.sqrt(inp.turns)));
    bandLo = f / X;
    bandHi = f * X;
  }

  if (krausR != null) {
    notes.push(
      `Входное сопротивление ${krausR.toFixed(0)} Ом — это НЕ результат нашего расчёта, а классическая ` +
      `эмпирика Крауса для осевого режима над экраном: R ≈ 140·(C/λ), чисто активное. Именно под эти ` +
      `≈140 Ом в спиральных антеннах ставят четвертьволновый трансформатор на 50 Ом. ` +
      `Осевое отношение ${arDb?.toFixed(2)} дБ — по формуле (2N+1)/(2N), тоже Краус.`,
    );
  } else {
    notes.push(
      "Импеданс и осевое отношение не приводятся: они определены только для осевого режима, " +
      "а окружность витка сейчас вне диапазона 0.75…1.33·λ.",
    );
  }
  if (cRatio >= 0.75 && cRatio <= 1.33) {
    notes.push(`Окружность витка ${circ.toFixed(0)} мм ≈ ${cRatio.toFixed(2)}·λ — осевой режим (луч в зенит, круговая поляризация).`);
  } else {
    notes.push(`⚠ Окружность витка ${circ.toFixed(0)} мм = ${cRatio.toFixed(2)}·λ — вне осевого режима (0.75–1.33·λ). Проверьте диаметр/частоту.`);
  }

  return {
    antennaKind: "gnss",
    title: `Диаграмма направленности GNSS-спирали · ${f} МГц`,
    planes: [
      { label: "Вертикальный срез (плоскость φ=0)", points: elev0 },
      { label: "Вертикальный срез (плоскость φ=90°)", points: elev90 },
    ],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f,
      lambdaMm,
      directivityDbi: r.gainDbi,
      hpbwDeg: halfPowerBeamwidth(elev0),
      sllDb: null,
      // При бесконечном экране «назад» — это под экран, где поля нет по построению.
      // При конечном экране F/B настоящее: зенит против надира.
      // Показывать там разницу с полкой шкалы бессмысленно, поэтому величина не выводится.
      frontToBackDb: screen === "infinite" ? null : frontToBack(elev0),
      avgGain: r.avgGain,
      efficiency: rho != null ? eff : undefined,
      // Импеданс из проволочной модели для спирали недостоверен (проверено против NEC2),
      // поэтому даём классическую эмпирику Крауса для ОСЕВОГО режима над экраном:
      //   R ≈ 140·(C/λ) Ом, чисто активное. Это и есть то самое «140 Ом», под которое
      //   в спиральных антеннах ставят четвертьволновый трансформатор на 50 Ом.
      impedanceR: krausR ?? undefined,
      impedanceX: krausR != null ? 0 : undefined,
      swr50: krausR != null ? vswr(krausR, 0, 50) : undefined,
      mismatchDb: krausR != null ? mismatchLossDb(krausR, 0, 50) : undefined,
      bandLowMHz: bandLo,
      bandHighMHz: bandHi,
      swrCriterion: bandLo != null ? 3 : undefined,
      // Осевое отношение осевой спирали (Краус): AR = (2N+1)/(2N). Идеал 1 (0 дБ).
      axialRatioDb: arDb,
      polarization:
        inp.sense === "LH" ? "Круговая левая (LHCP)" : "Круговая правая (RHCP) — стандарт GNSS",
      gainDbi,
      hpbwEDeg: halfPowerBeamwidth(elev0),
      hpbwHDeg: halfPowerBeamwidth(elev90),
      hpbwELabel: "плоскость φ=0",
      hpbwHLabel: "плоскость φ=90°",
    },
    notes,
  };
}

export function computeGnss(inp: GnssInput): PatternResult {
  return withDisplayFloor(inp, computeGnssModel);
}
