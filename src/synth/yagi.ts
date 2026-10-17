// ПРОЕКТИРОВАНИЕ яги/волнового канала по методике DL6WU (Günter Hoch, UKW-Berichte 1/1982).
// Широкополосный длинный волновой канал: фиксированный график шагов, убывающие длины
// директоров, поправка длины на металлический бум.
//
// ИСТОЧНИКИ ЧИСЕЛ (не выдумано, сверено по нескольким независимым публикациям):
//  • Шаги и длины директоров — вывод программы G3SEK «dl6wu-gg», опубликованный
//    W4RNL/Cebik: https://antenna2.github.io/cebik/content/vhf/wu.html
//    (таблица нормирована на d/λ = 0.005764 — 4 мм на 432 МГц).
//  • Поправка на бум — DG7YBN https://dg7ybn.de/BC_numbers/BC.htm и DL2KQ
//    http://dl2kq.de/ant/3-53.htm : C = 25.195·B − 229·B² (элемент сквозь бум, контакт),
//    половина от этого — изолированный. ΔL = C·D_бума. Годна при B ≤ 0.055λ.
//    Вершина параболы B* = 0.05501, C_max = 0.6930 — т.е. поправка никогда не превышает
//    0.693 диаметра бума (DL6WU указывал «не более 2/3», расхождение 4 %).
//  • Оценка усиления — G[dBd] = 3.39·ln(L_бума/λ) + 9.15 (Rothammel, табл. 23.5).
//    Проверена: даёт 2.35 дБ/октаву — ровно то, что измерил DL6WU.
//
// ЧЕСТНОЕ ОГРАНИЧЕНИЕ: зависимость длин директоров от диаметра элемента DL6WU опубликовал
// ТОЛЬКО графиком (Bild 2), закрытой формулы нет, а известные оцифровки расходятся ~1.4%.
// Поэтому таблица применяется как есть (её опорный диаметр d/λ≈0.0058), а при сильном
// отличии диаметра выдаётся предупреждение. Итоговые усиление и ДН в любом случае считает
// наш MoM по полученной геометрии — он и есть источник истины.

import { RHO_CUSTOM_DEFAULT } from "../physics/conductor";
import { type DesignResult, type DesignRow, type ElementSpec, fmt } from "../fields";
import { boomCorrectionMm } from "../physics/boom";
export { boomCorrectionMm };

const C_MM = 299792458_000 / 1e6; // мм·МГц → λ[мм] = C_MM / f[МГц]

/** Длины директоров D1…D30 в долях λ (таблица DL6WU/G3SEK, опорный d/λ = 0.005764). */
const DIR_LEN: number[] = [
  0.435, 0.431, 0.426, 0.421, 0.417, 0.413, 0.410, 0.407, 0.404, 0.402,
  0.400, 0.398, 0.396, 0.395, 0.393, 0.392, 0.390, 0.389, 0.388, 0.387,
  0.386, 0.385, 0.384, 0.383, 0.382, 0.381, 0.380, 0.379, 0.379, 0.378,
];
const REFL_LEN = 0.491;   // рефлектор, λ
const DRIVEN_LEN = 0.476; // активный, λ
const REFL_SPACING = 0.200; // рефлектор → активный, λ

/** Приращения шага, начиная с «активный → D1»; далее насыщение 0.400λ. */
const DIR_STEP: number[] = [
  0.075, 0.180, 0.215, 0.250, 0.280, 0.300, 0.315, 0.330, 0.345, 0.360, 0.375, 0.390,
];
const DIR_STEP_SAT = 0.400;

export type { Mounting } from "../physics/boom";

export interface YagiDesignInput {
  freqMHz: number;
  elementCount: number;   // всего элементов (рефлектор + активный + директоры)
  elementDiaMm: number;
  boomDiaMm: number;
  boomShape: string;      // "round" | "square"
  mounting: string;       // Mounting
  /** Зазор в точке питания активного элемента, мм (0 — не задан). */
  feedGapMm?: number;
  floorDb: number;
  /** Материал проводника (переносится в поверочный расчёт; см. physics/conductor.ts). */
  material?: string;
  rhoCustom?: number;
}

export function designYagi(inp: YagiDesignInput): DesignResult {
  const f = inp.freqMHz;
  const lambdaMm = C_MM / f;
  const notes: string[] = [];
  const rows: DesignRow[] = [];

  const nTotal = Math.max(2, Math.round(inp.elementCount));
  const nDir = nTotal - 2;

  if (nTotal < 5) {
    notes.push("⚠ DL6WU — методика ДЛИННОГО волнового канала; менее 5 элементов ею не проектируют. Результат ориентировочный.");
  }
  if (nDir > DIR_LEN.length) {
    notes.push(
      `⚠ Опубликованная таблица DL6WU покрывает ${DIR_LEN.length} директоров. ` +
      `Для директоров с №${DIR_LEN.length + 1} взята длина последнего табличного (${DIR_LEN[DIR_LEN.length - 1]}λ) — ` +
      `экстраполяция, проверьте поверочным расчётом.`,
    );
  }

  const dRel = inp.elementDiaMm / lambdaMm;
  if (dRel < 0.002 || dRel > 0.010) {
    notes.push(
      `⚠ Диаметр элемента ${fmt(dRel, 4)}λ вне диапазона оцифровки DL6WU (0.002…0.010λ).`,
    );
  }
  if (Math.abs(dRel - 0.005764) / 0.005764 > 0.5) {
    notes.push(
      `⚠ Таблица длин DL6WU оцифрована при d/λ ≈ 0.0058, у вас ${fmt(dRel, 4)}λ. Сам DL6WU опубликовал ` +
      `зависимость длин от диаметра только графиком, закрытой формулы нет — поэтому длины НЕ масштабированы ` +
      `по диаметру. Итоговые усиление и ДН ниже посчитаны методом моментов по фактической геометрии.`,
    );
  }

  const bc = boomCorrectionMm(inp.boomDiaMm, lambdaMm, inp.mounting, inp.boomShape);
  if (bc.warn) notes.push(bc.warn);
  if (inp.mounting !== "dielectric" && inp.boomDiaMm > 0 && inp.boomDiaMm < 2 * inp.elementDiaMm) {
    notes.push("⚠ Поправка на бум выведена для бума толще элемента минимум вдвое — у вас это не так.");
  }
  if (inp.mounting === "dielectric") {
    notes.push(
      "Диэлектрический бум: металлической поправки нет. Учтите, что сам диэлектрик слегка " +
      "укорачивает резонанс (для сухого дерева/стеклотекстолита — доли процента); точная величина " +
      "требует полноволнового расчёта.",
    );
  }

  // --- Зазор активного и поправка на бум для него ---
  // Разрезной активный (зазор > 0) не может иметь контакта с металлическим бумом —
  // половины замкнулись бы через бум. Поэтому при «контактном» креплении для него
  // берётся поправка изолированного крепления (так же поступает поверочный расчёт —
  // иначе спроектированная антенна не сошлась бы сама с собой).
  const gap = Math.max(0, inp.feedGapMm ?? 0);
  let drivenDelta = bc.deltaMm;
  if (gap > 0 && bc.deltaMm > 0) {
    if (inp.mounting === "through-contact") {
      drivenDelta = boomCorrectionMm(inp.boomDiaMm, lambdaMm, "through-insulated", inp.boomShape).deltaMm;
      notes.push(
        `Активный разрезной (зазор ${fmt(gap, 1)} мм) — контакта с бумом у него быть не может, поэтому ` +
        `к нему применена поправка изолированного крепления: ${fmt(drivenDelta, 2)} мм вместо ${fmt(bc.deltaMm, 2)} мм.`,
      );
    } else if (inp.mounting === "ontop-contact") {
      drivenDelta = 0;
      notes.push(
        "⚠ Активный разрезной и крепится сверху бума — контакта с бумом быть не может, а опубликованной " +
        "поправки для изолированного крепления сверху нет. Для активного поправка не введена (0 мм); " +
        "проверьте резонанс по КСВ на стенде.",
      );
    }
  }

  // --- Геометрия ---
  const elements: ElementSpec[] = [];
  const add = (type: string, lenRel: number, posRel: number) =>
    elements.push({
      type,
      lengthMm: +(lenRel * lambdaMm + (type === "driven" ? drivenDelta : bc.deltaMm)).toFixed(2),
      diameterMm: inp.elementDiaMm,
      positionMm: +(posRel * lambdaMm).toFixed(2),
    });

  add("reflector", REFL_LEN, 0);
  let pos = REFL_SPACING;
  if (nTotal >= 2) add("driven", DRIVEN_LEN, pos);
  for (let i = 0; i < nDir; i++) {
    pos += i < DIR_STEP.length ? DIR_STEP[i] : DIR_STEP_SAT;
    const lenRel = i < DIR_LEN.length ? DIR_LEN[i] : DIR_LEN[DIR_LEN.length - 1];
    add("director", lenRel, pos);
  }

  const boomRel = pos; // от рефлектора до последнего директора, λ
  const boomMm = boomRel * lambdaMm;
  const gainDbd = 3.39 * Math.log(Math.max(boomRel, 1e-6)) + 9.15;
  const gainDbi = gainDbd + 2.15;

  // --- Таблица ---
  rows.push({ group: "Общее", label: "Длина волны λ", value: fmt(lambdaMm, 1), unit: "мм" });
  rows.push({ group: "Общее", label: "Число элементов", value: String(nTotal), unit: "шт" });
  rows.push({ group: "Общее", label: "Длина бума (рефл.→последний дир.)", value: fmt(boomMm, 1), unit: "мм", hint: `${fmt(boomRel, 2)}λ`, key: true });
  rows.push({
    group: "Общее", label: "Усиление по DL6WU (оценка)", value: fmt(gainDbi, 2), unit: "дБи",
    hint: `${fmt(gainDbd, 2)} дБд по формуле 3.39·ln(L/λ)+9.15`,
  });
  rows.push({
    group: "Поправка на бум", label: "Добавка к длине каждого элемента",
    value: fmt(bc.deltaMm, 2), unit: "мм",
    hint: bc.deltaMm > 0 ? "C = 25.195·B − 229·B², B = D_бума/λ, с множителем крепления" : "для этого крепления поправка не нужна",
  });
  const drv = elements.find((e) => e.type === "driven");
  if (drv) {
    rows.push({
      group: "Активный элемент (разрезной вибратор)", label: "Полная длина, от кончика до кончика",
      value: fmt(drv.lengthMm, 1), unit: "мм", key: true, hint: "включая зазор в точке питания",
    });
    rows.push({
      group: "Активный элемент (разрезной вибратор)", label: "Зазор в точке питания",
      value: gap > 0 ? fmt(gap, 1) : "не задан", unit: gap > 0 ? "мм" : "",
      hint: gap > 0 ? "между торцами плеч" : "задайте по конструкции держателя, чтобы получить длину плеча",
    });
    if (gap > 0) {
      if (gap >= drv.lengthMm) {
        notes.push(`⚠ Зазор ${fmt(gap, 1)} мм не меньше полной длины активного ${fmt(drv.lengthMm, 1)} мм.`);
      } else {
        rows.push({
          group: "Активный элемент (разрезной вибратор)", label: "Длина ОДНОГО плеча (трубки)",
          value: fmt((drv.lengthMm - gap) / 2, 2), unit: "мм", key: true,
          hint: `(${fmt(drv.lengthMm, 1)} − ${fmt(gap, 1)}) / 2, нужно 2 шт.`,
        });
      }
    }
  }
  for (const e of elements) {
    const label =
      e.type === "reflector" ? "Рефлектор" : e.type === "driven" ? "Активный (вибратор)" :
      `Директор D${elements.filter((x) => x.type === "director").indexOf(e) + 1}`;
    rows.push({
      group: "Элементы (длина / позиция от рефлектора)",
      label, value: `${fmt(e.lengthMm, 1)} / ${fmt(e.positionMm, 1)}`, unit: "мм",
      key: e.type !== "director",
    });
  }

  notes.push(
    "Геометрия по DL6WU: шаги 0.075λ (активный→D1), далее 0.180…0.375λ с насыщением на 0.400λ; " +
    "рефлектор 0.491λ на 0.200λ позади активного. Шаг активный→D1 = 0.075λ трогать нельзя — " +
    "он задаёт входное сопротивление и полосу.",
  );
  notes.push(
    "DL6WU намеренно не задаёт активный элемент — это задача согласования. Для петлевого (folded) " +
    "вибратора длина примерно на 2% больше, импеданс ≈×4. Здесь заложен прямой вибратор 0.476λ.",
  );

  return {
    title: `Яги ${nTotal} эл. · ${f} МГц (DL6WU)`,
    rows,
    analysisValues: {
      freqMHz: f,
      elements,
      // Физические длины выше уже содержат поправку на бум — передаём параметры бума
      // в поверочный расчёт, чтобы он вычел ту же ΔL и не было двойного учёта.
      mounting: inp.mounting === "dielectric" ? "none" : inp.mounting,
      boomDiaMm: inp.boomDiaMm,
      boomShape: inp.boomShape,
      feedGapMm: gap,
      floorDb: inp.floorDb,
      ...(inp.material != null ? { material: inp.material, rhoCustom: inp.rhoCustom ?? RHO_CUSTOM_DEFAULT } : {}),
    },
    notes,
  };
}
