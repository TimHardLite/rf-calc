// ПРОЕКТИРОВАНИЕ осевой спиральной антенны (GNSS).
//
// Классика осевого режима (Kraus) с уточнённой формулой усиления King–Wong,
// сверено с рабочим калькулятором 3G-Aerial (js/helix.min.js):
//
//   d  = λ/π + d_пров        — диаметр намотки: окружность витка ≈ λ (условие осевого режима)
//   d_пров = 0.02λ (f ≥ 1 ГГц) | 0.005λ (f < 1 ГГц)
//   S  = s·λ                  — шаг (s задаётся в долях λ, обычно 0.20…0.25)
//   G  = 8.3·(C/λ)^(√(N+2)−1)·(N·s)^0.8·(0.222/s)^(√N/2)     [раз], C/λ ≈ 1
//   HPBW = 52/√(N·s)          [град]
//   Полоса по КСВ<3: X = √(1.07·(0.91·G_дБ/(G_дБ−3))^(1.33/√N)), f_min = f/X, f_max = f·X
//   Рефлектор: круглый Ø ≥ 0.8λ либо квадрат со стороной ≥ 1.1λ
//
// Усиление по этой формуле — ОЦЕНКА для ОДИНОЧНОЙ спирали НАД ЭКРАНОМ. Итоговая ДН сборки
// (все спирали вместе над конечным экраном) считается ниже методом моментов.
//
// Расстановка спиралей в сборке (N спиралей по окружности, синфазно):
//   шаг d = max( 1.15·Dспир ;  min( √Aэ ;  λ·(1 − 1/N) ) )
//   • √Aэ = λ·√(G/4π) — критерий Крауса: эффективные апертуры соседних спиралей лишь
//     касаются; ближе — апертуры перекрываются, выигрыш решётки падает;
//   • λ·(1 − 1/N) — граница дифракционного (побочного) максимума синфазной решётки:
//     при d ≤ λ(1 − 1/N) побочный максимум вместе с его первым нулём остаётся за
//     пределами видимой области (Балланис, Мэйлу). Дальше на горизонте поднимаются
//     боковые лепестки — для помехоустойчивой GNSS-антенны это недопустимо;
//   • 1.15·Dспир — спирали не касаются.
// Проверено методом моментов со сборкой над конечным экраном (3 спирали, 5 витков,
// 1575 МГц): шаг 0.4/0.5/0.6/0.7/0.85λ → КНД 13.6/14.2/14.7/14.9/14.3 дБи, худший
// уровень при θ ≥ 50°: −14/−16/−17/−18/−13 дБ. Критерий даёт 0.667λ — у оптимума;
// чистый критерий Крауса (0.85λ) хуже и по КНД, и по боковым лепесткам.

import { RHO_CUSTOM_DEFAULT } from "../physics/conductor";
import { type DesignResult, type DesignRow, fmt } from "../fields";

const C_MM = 299792.458; // мм·МГц

export interface GnssDesignInput {
  freqMHz: number;
  helixCount: number;
  targetGainDbi: number;
  pitchRel: number;   // шаг в долях λ
  /** Проводник: "tape" — медная лента (как в сборке GPS), "wire" — круглый провод. */
  conductor?: "tape" | "wire";
  floorDb: number;
  /** Материал проводника (переносится в поверочный расчёт; см. physics/conductor.ts). */
  material?: string;
  rhoCustom?: number;
}

/** Усиление осевой спирали (King–Wong), раз. C/λ принято 1 (осевой режим). */
function helixGain(turns: number, s: number): number {
  const CoverL = 1;
  return (
    8.3 *
    Math.pow(CoverL, Math.sqrt(turns + 2) - 1) *
    Math.pow(turns * s, 0.8) *
    Math.pow(0.222 / s, Math.sqrt(turns) / 2)
  );
}

export function designGnss(inp: GnssDesignInput): DesignResult {
  const f = inp.freqMHz, s = inp.pitchRel;
  const notes: string[] = [];

  if (!(f > 0 && s > 0.05 && s < 0.5)) {
    return {
      title: `GNSS-спираль · ${f} МГц`, rows: [], analysisValues: {},
      notes: ["⚠ Частота > 0 и шаг намотки в долях λ в диапазоне 0.05…0.5 (обычно 0.20…0.25)."],
    };
  }

  const lambda = C_MM / f;
  const wireDia = (f >= 1000 ? 0.02 : 0.005) * lambda;
  const helixDia = lambda / Math.PI + wireDia;
  const circumference = Math.PI * helixDia;

  // Подбор числа витков под требуемое усиление одиночной спирали.
  let turns = 3;
  let gDb = 10 * Math.log10(helixGain(turns, s));
  for (let n = 3; n <= 40; n++) {
    const g = 10 * Math.log10(helixGain(n, s));
    turns = n; gDb = g;
    if (g >= inp.targetGainDbi) break;
  }
  if (gDb < inp.targetGainDbi) {
    notes.push(`⚠ Даже 40 витков дают ${fmt(gDb, 1)} дБи — меньше требуемых ${fmt(inp.targetGainDbi, 1)} дБи. Для большего усиления нужна решётка спиралей, а не более длинная одиночная.`);
  }
  if (turns > 20) {
    notes.push(
      `⚠ ${turns} витков — за границей применимости формулы King–Wong (она выведена и проверена ` +
      `до ~20 витков). Прямой расчёт методом моментов показывает, что дальше усиление выходит ` +
      `на насыщение и даже начинает падать: осевой режим у очень длинной спирали разрушается. ` +
      `Ориентируйтесь на поверочный расчёт ниже, а не на эту оценку.`,
    );
  }
  notes.push(
    "Оценка усиления здесь — эмпирика King–Wong по измерениям реальных ОДИНОЧНЫХ спиралей над " +
    "экраном. Поверочный расчёт ниже считает методом моментов ВСЮ сборку (все спирали вместе, " +
    "синфазно) над конечным экраном — его КНД выше на величину выигрыша решётки и зависит от " +
    "расстановки. Это не расхождение, а разные постановки.",
  );

  const S = s * lambda;
  const height = turns * S;
  const wireLen = Math.sqrt(Math.pow(turns * Math.PI * helixDia, 2) + height * height);
  const hpbw = 52 / Math.sqrt(turns * s);
  const pitchAngle = (Math.atan(S / (Math.PI * helixDia)) * 180) / Math.PI;

  // Полоса по КСВ < 3.
  let fmin = NaN, fmax = NaN;
  if (gDb > 3) {
    const X = Math.sqrt(1.07 * Math.pow((0.91 * gDb) / (gDb - 3), 1.33 / Math.sqrt(turns)));
    fmin = f / X; fmax = f * X;
  }

  const rows: DesignRow[] = [
    { group: "Общее", label: "Длина волны λ", value: fmt(lambda, 1), unit: "мм" },
    { group: "Общее", label: "Число спиралей в сборке", value: String(inp.helixCount), unit: "шт" },
    { group: "Спираль", label: "Диаметр намотки", value: fmt(helixDia, 2), unit: "мм", key: true, hint: "λ/π + Ø провода" },
    { group: "Спираль", label: "Окружность витка", value: fmt(circumference, 1), unit: "мм", key: true, hint: `${fmt(circumference / lambda, 3)}·λ — условие осевого режима` },
    { group: "Спираль", label: "Число витков N", value: String(turns), unit: "шт", key: true },
    { group: "Спираль", label: "Шаг намотки S", value: fmt(S, 2), unit: "мм", key: true, hint: `${fmt(s, 3)}·λ` },
    { group: "Спираль", label: "Угол подъёма витка", value: fmt(pitchAngle, 1), unit: "°", hint: "для осевого режима 12…14° — оптимум" },
    { group: "Спираль", label: "Высота намотки", value: fmt(height, 1), unit: "мм", key: true },
    inp.conductor === "wire"
      ? { group: "Спираль", label: "Диаметр провода намотки", value: fmt(wireDia, 2), unit: "мм", key: true, hint: f >= 1000 ? "0.02λ" : "0.005λ" }
      : { group: "Спираль", label: "Ширина медной ленты", value: fmt(2 * wireDia, 2), unit: "мм", key: true, hint: `эквивалент провода Ø ${fmt(wireDia, 2)} мм (${f >= 1000 ? "0.02λ" : "0.005λ"}): лента шириной 2d = провод Ø d` },
    { group: "Спираль", label: "Длина провода на спираль", value: fmt(wireLen, 0), unit: "мм" },
    { group: "Экран", label: "Круглый рефлектор Ø не менее", value: fmt(0.8 * lambda, 1), unit: "мм" },
    { group: "Экран", label: "Квадратный рефлектор, сторона не менее", value: fmt(1.1 * lambda, 1), unit: "мм" },
    { group: "Ожидаемые характеристики", label: "Усиление одиночной спирали (King–Wong)", value: fmt(gDb, 2), unit: "дБи", key: true },
    { group: "Ожидаемые характеристики", label: "Ширина луча (52/√(N·s))", value: fmt(hpbw, 1), unit: "°" },
  ];
  if (Number.isFinite(fmin)) {
    rows.push({ group: "Ожидаемые характеристики", label: "Полоса по КСВ<3", value: `${fmt(fmin, 0)} … ${fmt(fmax, 0)}`, unit: "МГц", hint: `ширина ≈ ${fmt(fmax - fmin, 0)} МГц` });
  }

  // Ключевое для GNSS: высокое усиление = узкий луч = потеря низких спутников.
  if (hpbw < 60) {
    notes.push(
      `⚠ ВАЖНО для GNSS: при ${fmt(gDb, 1)} дБи ширина луча всего ${fmt(hpbw, 0)}°, то есть антенна ` +
      `«видит» лишь ${fmt(hpbw / 2, 0)}° вокруг зенита. Навигационный приёмник должен принимать спутники ` +
      `и на низких углах места, поэтому для GNSS обычно берут НИЗКОЕ усиление и широкий луч ` +
      `(полусферное покрытие), а не максимальное усиление. Высокое усиление оправдано, только если ` +
      `антенна следит за конкретным направлением.`,
    );
  }
  if (height > 100) {
    notes.push(
      `⚠ Высота намотки ${fmt(height, 0)} мм — конструктивно это высокая антенна. Для справки: сборка GPS ` +
      `ИРТ имеет общую высоту около 65 мм, то есть столько витков в неё не поместится. Снизьте требуемое ` +
      `усиление, если проектируете под существующий корпус.`,
    );
  }
  if (pitchAngle < 12 || pitchAngle > 14) {
    notes.push(`Угол подъёма ${fmt(pitchAngle, 1)}° вне классического оптимума 12…14°. Для осевого режима рабочий диапазон шире (шаг 0.2…0.3λ), но на краях усиление падает.`);
  }
  notes.push("Диаметр подобран так, чтобы окружность витка равнялась λ — это и есть условие осевого режима: луч вдоль оси, круговая поляризация.");
  notes.push("Формула King–Wong точнее классической Kraus, но это ОЦЕНКА для одиночной спирали НАД ЭКРАНОМ. Ниже ДН всей сборки считает метод моментов над конечным экраном — цифры будут отличаться, и это нормально.");

  // --- Расстановка спиралей: критерий касания эффективных апертур (Краус) ---
  const gLin = Math.pow(10, gDb / 10);
  const apertureStep = lambda * Math.sqrt(gLin / (4 * Math.PI)); // √Aэ, мм
  const gratingStep = inp.helixCount > 1 ? lambda * (1 - 1 / inp.helixCount) : Infinity;
  const touchStep = helixDia * 1.15;                               // спирали не касаются (зазор 15% Ø)
  const step = Math.max(touchStep, Math.min(apertureStep, gratingStep));
  const arrangeRadius = inp.helixCount > 1 ? step / (2 * Math.sin(Math.PI / inp.helixCount)) : 0;
  // Экран: основания спиралей + запас λ/4 до кромки с каждой стороны, но не меньше 0.8λ.
  const screenDia = Math.max(2 * (arrangeRadius + helixDia / 2) + lambda / 2, 0.8 * lambda);
  if (inp.helixCount > 1) {
    rows.push({
      group: "Сборка", label: "Шаг между спиралями",
      value: fmt(step, 1), unit: "мм", key: true,
      hint: step === touchStep
        ? `1.15·Ø — ограничено касанием спиралей`
        : step === gratingStep
          ? `λ·(1−1/N) = ${fmt(step / lambda, 3)}·λ — без побочных максимумов решётки`
          : `√Aэ = λ·√(G/4π) — эффективные апертуры касаются (Краус)`,
    });
    rows.push({
      group: "Сборка", label: "Радиус расстановки центров",
      value: fmt(arrangeRadius, 1), unit: "мм", key: true,
      hint: `шаг/(2·sin(180°/${inp.helixCount}))`,
    });
  }
  rows.push({
    group: "Экран", label: "Диаметр экрана сборки",
    value: fmt(screenDia, 1), unit: "мм", key: true,
    hint: "основания спиралей + λ/4 до кромки; не менее 0.8λ",
  });
  if (inp.helixCount > 1) {
    notes.push(
      `Шаг между спиралями ${fmt(step, 0)} мм (${fmt(step / lambda, 2)}·λ) = max(1.15·Ø; min(√Aэ; λ(1−1/N))). ` +
      `√Aэ = ${fmt(apertureStep, 0)} мм — критерий Крауса (эффективные апертуры касаются): теснее — спирали ` +
      `сильно связаны, выигрыш сборки падает, ДН распадается на лепестки. λ(1−1/N) = ${fmt(gratingStep, 0)} мм — ` +
      `граница побочного максимума синфазной решётки: шире — на горизонте поднимаются боковые лепестки, ` +
      `что для помехоустойчивой антенны недопустимо. Если корпус не позволяет такой шаг — задайте ` +
      `фактическую расстановку в поверочном расчёте.`,
    );
  }
  const conductor = inp.conductor === "wire" ? "wire" : "tape";

  return {
    title: `GNSS-спираль ${turns} вит. × ${inp.helixCount} · ${f} МГц`,
    rows,
    analysisValues: {
      freqMHz: f,
      helixCount: inp.helixCount,
      helixDiaMm: +helixDia.toFixed(2),
      turns,
      heightMm: +height.toFixed(1),
      arrangeRadiusMm: +arrangeRadius.toFixed(1),
      conductor,
      // Лента шириной 2d эквивалентна круглому проводу Ø d (r_экв = w/4 = d/2).
      tapeWidthMm: +(2 * wireDia).toFixed(2),
      wireDiaMm: +wireDia.toFixed(2),
      sense: "RH",
      // Формулы Крауса, по которым идёт синтез, выведены ДЛЯ СПИРАЛИ НАД ЭКРАНОМ.
      // Поэтому поверочный расчёт считает сборку над конечным экраном рассчитанного
      // диаметра (иначе был бы обратный режим и другая диаграмма).
      groundPlane: "yes",
      screenDiaMm: +screenDia.toFixed(1),
      standoffMm: 3,
      floorDb: inp.floorDb,
      ...(inp.material != null ? { material: inp.material, rhoCustom: inp.rhoCustom ?? RHO_CUSTOM_DEFAULT } : {}),
    },
    notes,
  };
}
