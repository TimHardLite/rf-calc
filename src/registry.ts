// Реестр типов антенн. У каждого типа ДВА режима:
//   • synthesis («Проектирование») — задаю частоту и цели, получаю размеры;
//   • analysis  («Поверочный расчёт») — задаю готовые размеры, получаю ДН.
// Синтез не дублирует физику: он возвращает готовые входные значения для анализа,
// а ДН и усиление всегда считает один и тот же проверенный расчётный движок.

import { computeDipole, computePatch, computeArray, type PatternResult } from "./physics";
import { computeHorn } from "./physics/horn";
import { computeYagi, drivenArmMm, type YagiElement } from "./physics/yagi";
import { computeMoxon } from "./physics/moxon";
import { computeLPDA } from "./physics/lpda";
import { computeGnss } from "./physics/gnss";

import { designYagi } from "./synth/yagi";
import { designPatch } from "./synth/patch";
import { designMoxon } from "./synth/moxon";
import { designDipole } from "./synth/dipole";
import { designHorn } from "./synth/horn";
import { designLpda } from "./synth/lpda";
import { designArray } from "./synth/array";
import { designGnss } from "./synth/gnss";

import type { FieldDef, FieldValue, FieldValues, FieldOption, DesignResult } from "./fields";
export type { FieldDef, FieldValue, FieldValues, FieldOption, DesignResult };
import { sanitize } from "./guard";
import { MATERIALS, RHO_CUSTOM_DEFAULT } from "./physics/conductor";
import { SUBSTRATES, substrateOf } from "./physics/substrate";
import { cleanMetrics } from "./physics/mathutil";

/** Геометрия реальной 180-яги ИРТ (ANT180.1), позиции от 1-го элемента (=0). */
export const YAGI_180: YagiElement[] = [
  { type: "reflector", lengthMm: 921, diameterMm: 8, positionMm: 0 },
  { type: "driven", lengthMm: 799, diameterMm: 6.31, positionMm: 304 },
  { type: "director", lengthMm: 734, diameterMm: 6, positionMm: 445 },
  { type: "director", lengthMm: 727, diameterMm: 6, positionMm: 743 },
  { type: "director", lengthMm: 719, diameterMm: 6, positionMm: 1098 },
  { type: "director", lengthMm: 712, diameterMm: 6, positionMm: 1511 },
  { type: "director", lengthMm: 704, diameterMm: 6, positionMm: 1973 },
];

export type ModeId = "synthesis" | "analysis";

export interface AnalysisMode {
  fields: FieldDef[];
  compute: (v: FieldValues) => PatternResult;
}
export interface SynthesisMode {
  fields: FieldDef[];
  design: (v: FieldValues) => DesignResult;
}

export interface AntennaDef {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  status: "ready" | "soon";
  soonNote?: string;
  analysis: AnalysisMode;
  synthesis?: SynthesisMode;
}

const num = (v: FieldValues, k: string) => Number(v[k]);
const str = (v: FieldValues, k: string) => String(v[k]);

const FLOOR: FieldDef = {
  key: "floorDb",
  label: "Нижний предел шкалы",
  unit: "дБ",
  help: "Минимум радиальной шкалы диаграммы (обычно −40 или −60 дБ).",
  default: -40,
  min: -80,
  max: -10,
  step: 5,
};

const FREQ = (def: number): FieldDef => ({
  key: "freqMHz",
  label: "Частота",
  unit: "МГц",
  help: "Рабочая частота антенны. Задаёт длину волны λ.",
  default: def,
  min: 1,
  max: 40000,
  step: 1,
});

/** Материал проводника: потери в металле (скин-эффект), как «Wire Loss» в EZNEC. */
const MATERIAL = (def: string): FieldDef[] => [
  {
    key: "material", label: "Материал проводника", unit: "", kind: "select",
    help:
      "Учитывает омические потери в металле (скин-эффект): КУ = КНД + 10·lg η. " +
      "«Идеальный проводник» — без потерь (КУ = КНД). Значения ρ — справочные при 20 °C.",
    default: def,
    options: MATERIALS.map((m) => ({
      value: m.id,
      label: m.rhoOhmMm2PerM != null ? `${m.label} (ρ = ${m.rhoOhmMm2PerM} Ом·мм²/м)` : m.label,
    })),
  },
  {
    key: "rhoCustom", label: "Удельное сопротивление ρ", unit: "Ом·мм²/м",
    help: "Удельное сопротивление металла при рабочей температуре (1 Ом·мм²/м = 1 мкОм·м). Для сплавов берите по марке.",
    default: RHO_CUSTOM_DEFAULT, min: 0.001, max: 10, step: 0.001,
    showIf: (v) => v.material === "custom",
  },
];
const matOf = (v: FieldValues) => ({ material: str(v, "material"), rhoCustom: num(v, "rhoCustom") });

export const ANTENNAS: AntennaDef[] = [
  // ================= ДИПОЛЬ =================
  {
    id: "dipole",
    name: "Диполь",
    icon: "dipole",
    tagline: "Симметричный вибратор (полётный, плоский PCB)",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(307),
        {
          key: "elementType", label: "Тип проводника", unit: "", kind: "select",
          help: "Круглый провод/трубка или плоская планка (стеклотекстолит с дорожкой). Толщина определяет укорочение.",
          default: "flat",
          options: [
            { value: "flat", label: "Плоская планка (PCB)" },
            { value: "wire", label: "Круглый провод/трубка" },
          ],
        },
        {
          key: "diameterMm", label: "Диаметр проводника", unit: "мм",
          help: "Диаметр круглого провода/трубки — влияет на резонансную длину.",
          default: 2, min: 0.1, max: 500, step: 0.1,
          showIf: (v) => v.elementType === "wire",
        },
        {
          key: "stripWmm", label: "Ширина дорожки", unit: "мм",
          help: "Ширина медной дорожки плоского вибратора — влияет на резонансную длину.",
          default: 6, min: 0.1, max: 500, step: 0.1,
          showIf: (v) => v.elementType === "flat",
        },
        {
          key: "feedGapMm", label: "Зазор (разрез) в точке питания", unit: "мм",
          help: "Расстояние между торцами двух плеч в центре, куда подключается кабель. Полная резонансная длина от кончика до кончика от зазора почти не зависит — его перемыкает питание; от зазора зависит длина каждого плеча = (полная − зазор)/2. 0 — не задан.",
          default: 0, min: 0, max: 500, step: 0.5,
        },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      design: (v) =>
        designDipole({
          freqMHz: num(v, "freqMHz"),
          elementType: str(v, "elementType"),
          diameterMm: num(v, "diameterMm"),
          stripWmm: num(v, "stripWmm"),
          feedGapMm: v.feedGapMm === undefined ? 0 : num(v, "feedGapMm"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
    analysis: {
      fields: [
        FREQ(307),
        {
          key: "lengthMm", label: "Полная длина вибратора", unit: "мм",
          help: "Полная физическая длина от кончика одного плеча до кончика другого, ВКЛЮЧАЯ зазор в центре. Для полуволнового ≈ 0.47…0.48λ.",
          default: 460, min: 1, max: 100000, step: 1,
        },
        {
          key: "feedGapMm", label: "Зазор (разрез) в точке питания", unit: "мм",
          help: "Расстояние между торцами плеч в центре. Длина одного плеча = (полная − зазор)/2. На форму ДН не влияет, на импеданс — слабо (проверено NEC2). 0 — не задан.",
          default: 0, min: 0, max: 500, step: 0.5,
          derive: (v) => {
            const L = Number(v.lengthMm), g = Number(v.feedGapMm);
            if (!(L > 0) || !(g > 0)) return null;
            if (g >= L) return "⚠ Зазор не может быть больше полной длины.";
            return `Плечо: (${L} − ${g}) / 2 = ${((L - g) / 2).toFixed(2)} мм × 2 шт.`;
          },
        },
        {
          key: "elementType", label: "Тип проводника", unit: "", kind: "select",
          help: "Круглый провод/трубка или плоская планка. На форму ДН НЕ влияет — только на импеданс/полосу; поле для паспорта.",
          default: "flat",
          options: [
            { value: "flat", label: "Плоская планка (PCB)" },
            { value: "wire", label: "Круглый провод/трубка" },
          ],
        },
        {
          key: "diameterMm", label: "Диаметр проводника", unit: "мм",
          help: "Диаметр круглого провода/трубки. Справочно (импеданс/полоса), на форму ДН не влияет.",
          default: 2, min: 0.1, max: 500, step: 0.1,
          showIf: (v) => v.elementType === "wire",
        },
        {
          key: "stripWmm", label: "Ширина дорожки", unit: "мм",
          help: "Ширина медной дорожки плоского вибратора. Справочно, на форму ДН не влияет.",
          default: 6, min: 0.1, max: 500, step: 0.1,
          showIf: (v) => v.elementType === "flat",
        },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      compute: (v) =>
        computeDipole({
          freqMHz: num(v, "freqMHz"),
          lengthMm: num(v, "lengthMm"),
          elementType: str(v, "elementType"),
          diameterMm: num(v, "diameterMm"),
          stripWmm: num(v, "stripWmm"),
          feedGapMm: v.feedGapMm === undefined ? 0 : num(v, "feedGapMm"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
  },

  // ================= ПАТЧ =================
  {
    id: "patch",
    name: "Патч",
    icon: "patch",
    tagline: "Микрополосковый / CP (по параметрам)",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(5800),
        {
          key: "substrate", label: "Материал подложки", unit: "", kind: "select",
          help:
            "Выбор из справочника: εr и tgδ подставляются автоматически (значения сверены с библиотекой " +
            "материалов HFSS и паспортами изготовителей). «Своё значение» — если платы нет в списке. " +
            "⚠ Для ответственных изделий берите εr и tgδ из паспорта конкретного материала на рабочей частоте.",
          default: "custom",
          options: SUBSTRATES.map((x) => ({
            value: x.id,
            label: x.id === "custom" ? x.label : `${x.label} (εr ${x.epsR}, tgδ ${x.tanD})`,
          })),
        },
        {
          key: "epsR", label: "εr подложки", unit: "",
          help: "Относительная диэлектрическая проницаемость. Воздух ≈ 1.0; FR-4 ≈ 4.4; полипропилен ≈ 2.2 — ⚠ УТОЧНИТЕ по паспорту материала.",
          default: 2.2, min: 1, max: 20, step: 0.1, showIf: (v) => v.substrate === "custom",
        },
        {
          key: "substrateH", label: "Толщина подложки h", unit: "мм",
          help: "Высота диэлектрика между патчем и экраном. Толще — шире полоса, но больше поверхностных волн.",
          default: 1.5, min: 0.05, max: 200, step: 0.05,
        },
        {
          key: "targetZ", label: "Согласовать на", unit: "Ом",
          help: "Целевое входное сопротивление. Для него считается глубина врезки x₀ и ширина микрополоскового фидера.",
          default: 50, min: 10, max: 300, step: 1,
        },
        {
          key: "polarization", label: "Поляризация", unit: "", kind: "select",
          help: "Синтез даёт ЛИНЕЙНО поляризованный прямоугольный патч. Круговая требует другой геометрии — будет предупреждение.",
          default: "Линейная",
          options: [
            { value: "Линейная", label: "Линейная" },
            { value: "RHCP", label: "Круговая правая (RHCP)" },
            { value: "LHCP", label: "Круговая левая (LHCP)" },
          ],
        },
        {
          key: "tanD", label: "tanδ подложки", unit: "",
          help: "Тангенс угла потерь диэлектрика — нужен, чтобы посчитать КПД и реальное усиление. 0 — потери не учитывать. Справочно: FR-4 ≈ 0.02, полипропилен ≈ 0.0005, Rogers ≈ 0.001. ⚠ Берите из паспорта вашего материала.",
          default: 0, min: 0, max: 0.2, step: 0.001, showIf: (v) => v.substrate === "custom",
        },
        FLOOR,
      ],
      design: (v) =>
        designPatch({
          freqMHz: num(v, "freqMHz"),
          ...substrateOf(str(v, "substrate"), num(v, "epsR"), num(v, "tanD")),
          substrateH: num(v, "substrateH"),
          targetZ: num(v, "targetZ"),
          polarization: str(v, "polarization"),
          floorDb: num(v, "floorDb"),
        }),
    },
    analysis: {
      fields: [
        {
          key: "mode", label: "Режим расчёта", unit: "", kind: "select",
          help: "«Прямоугольный» — для простых патчей со сплошной металлизацией. «CP / по ширине луча» — для сложного рисунка (вертушок и т.п.): строит каноническую ДН по вашей измеренной ширине луча.",
          default: "rect",
          options: [
            { value: "rect", label: "Прямоугольный (по размерам)" },
            { value: "beam", label: "CP / произвольный (по ширине луча)" },
          ],
        },
        {
          key: "polarization", label: "Поляризация", unit: "", kind: "select",
          help: "Тип поляризации для паспорта. Качество CP (осевое отношение) в этой модели не считается.",
          default: "Линейная",
          options: [
            { value: "Линейная", label: "Линейная" },
            { value: "RHCP", label: "Круговая правая (RHCP)" },
            { value: "LHCP", label: "Круговая левая (LHCP)" },
          ],
        },
        FREQ(5800),
        {
          key: "lengthMm", label: "Длина металлизации L", unit: "мм",
          help: "Размер МЕДНОЙ металлизации излучателя (не платы!). Резонансный патч ≈ 0.3–0.5λ.",
          default: 18, min: 1, max: 5000, step: 0.1, showIf: (v) => v.mode === "rect",
        },
        {
          key: "widthMm", label: "Ширина металлизации W", unit: "мм",
          help: "Вторая сторона медной металлизации (не платы).",
          default: 20, min: 1, max: 5000, step: 0.1, showIf: (v) => v.mode === "rect",
        },
        {
          key: "substrateH", label: "Толщина подложки h", unit: "мм",
          help: "Высота диэлектрика между патчем и экраном (у CP — зазор между пластинами).",
          default: 1.5, min: 0.1, max: 200, step: 0.1, showIf: (v) => v.mode === "rect",
        },
        {
          key: "substrate", label: "Материал подложки", unit: "", kind: "select",
          help:
            "Выбор из справочника: εr и tgδ подставляются автоматически (значения сверены с библиотекой " +
            "материалов HFSS и паспортами изготовителей). «Своё значение» — если платы нет в списке.",
          default: "custom",
          options: SUBSTRATES.map((x) => ({
            value: x.id,
            label: x.id === "custom" ? x.label : `${x.label} (εr ${x.epsR}, tgδ ${x.tanD})`,
          })),
          showIf: (v) => v.mode === "rect",
        },
        {
          key: "epsR", label: "εr подложки", unit: "",
          help: "Относительная диэлектрическая проницаемость. Воздух ≈ 1.0; полипропилен ≈ 2.2 — ⚠ УТОЧНИТЕ.",
          default: 2.2, min: 1, max: 20, step: 0.1, showIf: (v) => v.mode === "rect" && v.substrate === "custom",
        },
        {
          key: "tanD", label: "tanδ подложки", unit: "",
          help: "Тангенс угла потерь диэлектрика — нужен для КПД и реального усиления. 0 — потери не учитывать (тогда считается только медь). Справочно: FR-4 ≈ 0.02, полипропилен ≈ 0.0005, Rogers ≈ 0.001. ⚠ Возьмите значение из паспорта вашего материала.",
          default: 0, min: 0, max: 0.2, step: 0.001, showIf: (v) => v.mode === "rect" && v.substrate === "custom",
        },
        {
          key: "groundLmm", label: "Экран вдоль L", unit: "мм",
          help: "Размер экрана (земли) в E-плоскости. От него напрямую зависит заднее излучение: чем больше экран, тем ниже задний лепесток. Минимум ≈ λg/2 + L.",
          default: 40, min: 1, max: 20000, step: 0.5, showIf: (v) => v.mode === "rect",
        },
        {
          key: "groundWmm", label: "Экран вдоль W", unit: "мм",
          help: "Размер экрана в H-плоскости. Влияет на то, насколько узко заднее излучение сосредоточено у надира.",
          default: 42, min: 1, max: 20000, step: 0.5, showIf: (v) => v.mode === "rect",
        },
        {
          key: "feedInsetMm", label: "Глубина врезки питания x₀", unit: "мм",
          help: "Насколько точка питания углублена от края патча. 0 — питание прямо с края (там сопротивление максимальное, сотни Ом). Врезка снижает сопротивление по закону cos²(πx₀/L) — ею и согласуют на 50 Ом.",
          default: 0, min: 0, max: 5000, step: 0.1, showIf: (v) => v.mode === "rect",
        },
        {
          key: "hpbwDeg", label: "Ширина луча −3 дБ", unit: "град",
          help: "ИЗМЕРЕННАЯ/известная ширина главного лепестка. По ней строится каноническая ДН.",
          default: 90, min: 5, max: 175, step: 1, showIf: (v) => v.mode === "beam",
        },
        {
          key: "gainDbi", label: "Усиление (если известно)", unit: "дБи",
          help: "Ваше измеренное/паспортное усиление. 0 — не задано (тогда КНД оценивается по ширине луча).",
          default: 0, min: 0, max: 30, step: 0.1, showIf: (v) => v.mode === "beam",
        },
        {
          key: "backLobeDb", label: "Заднее излучение (если замерено)", unit: "дБ",
          help: "Измеренный уровень заднего лепестка относительно главного, например −18. 0 — нет данных, и тогда зад не рисуется: выдумывать его нельзя.",
          default: 0, min: -40, max: 0, step: 0.5, showIf: (v) => v.mode === "beam",
        },
        FLOOR,
      ],
      compute: (v) =>
        computePatch({
          mode: str(v, "mode") as "rect" | "beam",
          polarization: str(v, "polarization"),
          freqMHz: num(v, "freqMHz"),
          lengthMm: num(v, "lengthMm"),
          widthMm: num(v, "widthMm"),
          substrateH: num(v, "substrateH"),
          ...substrateOf(str(v, "substrate"), num(v, "epsR"), num(v, "tanD")),
          groundLmm: num(v, "groundLmm"),
          groundWmm: num(v, "groundWmm"),
          feedInsetMm: num(v, "feedInsetMm"),
          hpbwDeg: num(v, "hpbwDeg"),
          gainDbi: num(v, "gainDbi"),
          backLobeDb: num(v, "backLobeDb"),
          floorDb: num(v, "floorDb"),
        }),
    },
  },

  // ================= РУПОР =================
  {
    id: "horn",
    name: "Рупор",
    icon: "horn",
    tagline: "Пирамидальный рупор (Balanis, с фазовой ошибкой раскрыва)",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(10000),
        {
          key: "targetGainDbi", label: "Требуемое усиление", unit: "дБи",
          help: "Целевое усиление рупора. Из него по методике оптимального пирамидального рупора считаются раскрыв и длины клиньев. Практичный диапазон 10…25 дБи.",
          default: 18, min: 6, max: 30, step: 0.5,
        },
        FLOOR,
      ],
      design: (v) =>
        designHorn({
          freqMHz: num(v, "freqMHz"),
          targetGainDbi: num(v, "targetGainDbi"),
          floorDb: num(v, "floorDb"),
        }),
    },
    analysis: {
      fields: [
        FREQ(10000),
        {
          key: "apertureA", label: "Раскрыв a (H-плоскость)", unit: "мм",
          help: "Размер раскрыва по широкой стенке (H-плоскость). Обычно > 0.5λ.",
          default: 60, min: 1, max: 20000, step: 0.5,
        },
        {
          key: "apertureB", label: "Раскрыв b (E-плоскость)", unit: "мм",
          help: "Размер раскрыва по узкой стенке (E-плоскость).",
          default: 45, min: 1, max: 20000, step: 0.5,
        },
        {
          key: "flareE", label: "Образующая E-клина ρe", unit: "мм",
          help: "Наклонная длина от горловины до кромки раскрыва в E-плоскости. Задаёт квадратичную фазовую ошибку — главный фактор, ограничивающий усиление рупора. 0 — не учитывать (тогда усиление даётся как ВЕРХНЯЯ ОЦЕНКА синфазного раскрыва, примерно на 2 дБ выше реального).",
          default: 0, min: 0, max: 100000, step: 1,
        },
        {
          key: "flareH", label: "Образующая H-клина ρh", unit: "мм",
          help: "То же для H-плоскости. Учитывается только вместе с ρe.",
          default: 0, min: 0, max: 100000, step: 1,
        },
        FLOOR,
      ],
      compute: (v) =>
        computeHorn({
          freqMHz: num(v, "freqMHz"),
          apertureA: num(v, "apertureA"),
          apertureB: num(v, "apertureB"),
          flareE: v.flareE === undefined ? 0 : num(v, "flareE"),
          flareH: v.flareH === undefined ? 0 : num(v, "flareH"),
          floorDb: num(v, "floorDb"),
        }),
    },
  },

  // ================= РЕШЁТКА =================
  {
    id: "array",
    name: "Решётка",
    icon: "array",
    tagline: "Линейная решётка одинаковых излучателей",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(1000),
        {
          key: "goal", label: "Проектировать по", unit: "", kind: "select",
          help: "Что задаёте как требование: нужный КНД или нужную ширину луча. Из него подбирается число элементов.",
          default: "gain",
          options: [
            { value: "gain", label: "Требуемому КНД" },
            { value: "beam", label: "Требуемой ширине луча" },
          ],
        },
        {
          key: "targetGainDbi", label: "Требуемый КНД", unit: "дБи",
          help: "Целевой КНД решётки (для изотропных элементов). Реальные излучатели добавят своё усиление.",
          default: 12, min: 3, max: 30, step: 0.5, showIf: (v) => v.goal === "gain",
        },
        {
          key: "targetHpbwDeg", label: "Требуемая ширина луча", unit: "град",
          help: "Целевая ширина главного лепестка по уровню −3 дБ.",
          default: 12, min: 1, max: 90, step: 0.5, showIf: (v) => v.goal === "beam",
        },
        {
          key: "spacingRel", label: "Шаг решётки", unit: "λ",
          help: "Расстояние между элементами в долях длины волны. 0.5λ — классика: максимум КНД без дифракционных лепестков.",
          default: 0.5, min: 0.1, max: 1.5, step: 0.05,
        },
        {
          key: "phaseDeg", label: "Фазовый сдвиг β", unit: "град",
          help: "Прогрессивная фаза между элементами. 0 — бродсайд (луч поперёк оси).",
          default: 0, min: -360, max: 360, step: 1,
        },
        FLOOR,
      ],
      design: (v) =>
        designArray({
          freqMHz: num(v, "freqMHz"),
          goal: str(v, "goal"),
          targetGainDbi: num(v, "targetGainDbi"),
          targetHpbwDeg: num(v, "targetHpbwDeg"),
          spacingRel: num(v, "spacingRel"),
          phaseDeg: num(v, "phaseDeg"),
          floorDb: num(v, "floorDb"),
        }),
    },
    analysis: {
      fields: [
        FREQ(1000),
        {
          key: "count", label: "Число элементов N", unit: "шт",
          help: "Количество ОДИНАКОВЫХ излучателей, запитанных вместе (стек патчей, коллинеар диполей и т.п.). Это НЕ яги.",
          default: 4, min: 1, max: 64, step: 1,
        },
        {
          key: "spacingMm", label: "Шаг d", unit: "мм",
          help: "Расстояние между соседними элементами. Часто ≈ λ/2.",
          default: 150, min: 1, max: 100000, step: 0.1,
        },
        {
          key: "phaseDeg", label: "Фазовый сдвиг β", unit: "град",
          help: "Прогрессивная фаза между элементами (0 — бродсайд поперёк оси; −k·d — эндфайр вдоль оси).",
          default: 0, min: -360, max: 360, step: 1,
        },
        FLOOR,
      ],
      compute: (v) =>
        computeArray({
          freqMHz: num(v, "freqMHz"),
          count: num(v, "count"),
          spacingMm: num(v, "spacingMm"),
          phaseDeg: num(v, "phaseDeg"),
          floorDb: num(v, "floorDb"),
        }),
    },
  },

  // ================= ЯГИ =================
  {
    id: "yagi",
    name: "Яги / волновой канал",
    icon: "yagi",
    tagline: "Волновой канал — метод моментов (MoM)",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(180),
        {
          key: "elementCount", label: "Число элементов", unit: "шт",
          help: "Всего элементов: рефлектор + активный + директоры. DL6WU — методика длинных антенн, от 5 элементов и больше.",
          default: 7, min: 3, max: 32, step: 1,
        },
        {
          key: "elementDiaMm", label: "Диаметр элемента", unit: "мм",
          help: "Диаметр трубки/прутка элементов. Таблица DL6WU оцифрована при d/λ ≈ 0.0058.",
          default: 6, min: 0.5, max: 500, step: 0.1,
        },
        {
          key: "feedGapMm", label: "Зазор активного элемента", unit: "мм",
          help: "Расстояние между торцами двух плеч активного элемента в точке питания (определяется конструкцией держателя). Полная длина активного (от кончика до кончика) от зазора практически не зависит — зазор перемыкается фидером; от него зависит длина каждого плеча = (полная − зазор)/2. 0 — не задан.",
          default: 0, min: 0, max: 500, step: 0.5,
        },
        {
          key: "boomDiaMm", label: "Диаметр (сторона) бума", unit: "мм",
          help: "Диаметр круглого или сторона квадратного бума. Влияет на поправку длины элементов: металлический бум их электрически удлиняет.",
          default: 20, min: 0, max: 1000, step: 0.5,
        },
        {
          key: "boomShape", label: "Форма бума", unit: "", kind: "select",
          help: "Круглый или квадратный профиль бума — влияет на множитель поправки при креплении сверху.",
          default: "square",
          options: [
            { value: "square", label: "Квадратный профиль" },
            { value: "round", label: "Круглая труба" },
          ],
        },
        {
          key: "mounting", label: "Крепление элементов", unit: "", kind: "select",
          help: "Главный фактор поправки на бум. Сквозь металлический бум с контактом — максимальная поправка; диэлектрический бум — поправки нет.",
          default: "through-contact",
          options: [
            { value: "through-contact", label: "Сквозь металлический бум, контакт" },
            { value: "through-insulated", label: "Сквозь металлический бум, изолированно" },
            { value: "ontop-contact", label: "Сверху бума, с контактом" },
            { value: "dielectric", label: "Диэлектрический бум (поправки нет)" },
          ],
        },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      design: (v) =>
        designYagi({
          freqMHz: num(v, "freqMHz"),
          elementCount: num(v, "elementCount"),
          elementDiaMm: num(v, "elementDiaMm"),
          boomDiaMm: num(v, "boomDiaMm"),
          boomShape: str(v, "boomShape"),
          mounting: str(v, "mounting"),
          feedGapMm: v.feedGapMm === undefined ? 0 : num(v, "feedGapMm"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
    analysis: {
      fields: [
        FREQ(180),
        {
          key: "elements", label: "Элементы", unit: "", kind: "elements",
          help: "Рефлектор, активный (driven) и директоры. Длина — полная ФИЗИЧЕСКАЯ. Для активного — от кончика одного плеча до кончика другого, ВКЛЮЧАЯ зазор в точке питания (сам зазор задаётся полем ниже). Позиция — центр по буму от 1-го элемента (=0). Активный ровно один.",
          default: YAGI_180 as unknown as FieldValue,
        },
        {
          key: "feedGapMm", label: "Зазор активного элемента", unit: "мм",
          help: "Расстояние между торцами двух плеч активного элемента в точке питания. Длина активного в таблице — от кончика до кончика, включая этот зазор; длина одного плеча = (длина − зазор)/2. 0 — зазор не задан (сплошной или петлевой вибратор). Электрически решает полная длина: зазор ≪ λ меняет импеданс слабо (проверено NEC2), но он нужен для правильного раскроя трубок и для поправки на бум — разрезной вибратор не может иметь контакта с металлическим бумом.",
          default: 0, min: 0, max: 500, step: 0.5,
          derive: (v) => {
            const els = v.elements as unknown as YagiElement[] | undefined;
            const d = Array.isArray(els) ? els.find((e) => e.type === "driven") : undefined;
            const g = Number(v.feedGapMm);
            if (!d || !(d.lengthMm > 0)) return null;
            if (!(g > 0)) return `Активный: ${d.lengthMm} мм от кончика до кончика, зазор не задан.`;
            if (g >= d.lengthMm) return "⚠ Зазор не может быть больше длины активного.";
            const arm = drivenArmMm(d.lengthMm, g);
            return `Плечо активного: (${d.lengthMm} − ${g}) / 2 = ${arm.toFixed(2)} мм × 2 шт. (металла всего ${(2 * arm).toFixed(2)} мм)`;
          },
        },
        {
          key: "mounting", label: "Крепление к буму", unit: "", kind: "select",
          help: "Металлический бум электрически удлиняет элементы. Расчёт ведётся в свободном пространстве, поэтому из введённых физических длин вычитается поправка DL6WU. Если бума нет или он диэлектрический — оставьте «без бума».",
          default: "none",
          options: [
            { value: "none", label: "Без бума / диэлектрический" },
            { value: "through-contact", label: "Сквозь металлический бум, контакт" },
            { value: "through-insulated", label: "Сквозь металлический бум, изолированно" },
            { value: "ontop-contact", label: "Сверху бума, с контактом" },
          ],
        },
        {
          key: "boomDiaMm", label: "Диаметр (сторона) бума", unit: "мм",
          help: "Диаметр круглой трубы или сторона квадратного профиля бума.",
          default: 20, min: 0, max: 1000, step: 0.5,
          showIf: (v) => v.mounting !== "none" && v.mounting !== undefined,
        },
        {
          key: "boomShape", label: "Форма бума", unit: "", kind: "select",
          help: "Влияет на множитель поправки только при креплении сверху бума.",
          default: "square",
          options: [
            { value: "square", label: "Квадратный профиль" },
            { value: "round", label: "Круглая труба" },
          ],
          showIf: (v) => v.mounting === "ontop-contact",
        },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      compute: (v) =>
        computeYagi({
          freqMHz: num(v, "freqMHz"),
          elements: (v.elements as unknown as YagiElement[]) ?? [],
          floorDb: num(v, "floorDb"),
          ...matOf(v),
          boomDiaMm: v.boomDiaMm === undefined ? 0 : num(v, "boomDiaMm"),
          boomShape: v.boomShape === undefined ? "square" : str(v, "boomShape"),
          mounting: v.mounting === undefined ? "none" : str(v, "mounting"),
          feedGapMm: v.feedGapMm === undefined ? 0 : num(v, "feedGapMm"),
        }),
    },
  },

  // ================= MOXON =================
  {
    id: "moxon",
    name: "Моксон",
    icon: "moxon",
    tagline: "2-элементная антенна Moxon (MoM)",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(915),
        {
          key: "elementType", label: "Исполнение", unit: "", kind: "select",
          help: "Круглый провод — или печатная плата (медная дорожка на стеклотекстолите). Дорожка шириной w в расчёте заменяется эквивалентным круглым проводником радиусом w/4 — как у диполя в исполнении «плоская планка».",
          default: "wire",
          options: [
            { value: "wire", label: "Провод" },
            { value: "flat", label: "Печатная плата (дорожка)" },
          ],
        },
        {
          key: "diameterMm", label: "Диаметр провода", unit: "мм",
          help: "Диаметр проводника рамки. Полиномы Moxon годны при d/λ от 1e−6 до 1e−2 — вне этого расчёт откажет, а не соврёт.",
          default: 2, min: 0.05, max: 500, step: 0.05,
          showIf: (v) => v.elementType !== "flat",
        },
        {
          key: "stripWmm", label: "Ширина дорожки", unit: "мм",
          help: "Ширина медной дорожки рамки на плате. Эквивалентный круглый проводник — Ø w/2. Полиномы Moxon годны при (w/2)/λ от 1e−6 до 1e−2.",
          default: 4, min: 0.05, max: 500, step: 0.05,
          showIf: (v) => v.elementType === "flat",
        },
        {
          key: "targetZ", label: "Согласовать на", unit: "Ом", kind: "select",
          help: "Moxon имеет два опубликованных набора размеров: под 50 Ом (прямое питание кабелем) и под 93 Ом.",
          default: 50,
          options: [
            { value: 50, label: "50 Ом (прямое питание)" },
            { value: 93, label: "93 Ом" },
          ],
        },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      design: (v) =>
        designMoxon({
          freqMHz: num(v, "freqMHz"),
          diameterMm: num(v, "diameterMm"),
          elementType: v.elementType === "flat" ? "flat" : "wire",
          stripWmm: v.stripWmm === undefined ? undefined : num(v, "stripWmm"),
          targetZ: num(v, "targetZ"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
    analysis: {
      fields: [
        FREQ(915),
        // Заводские значения A/B/C/D — не «круглые числа с потолка», а результат режима
        // «Проектирование» этой же программы для 915 МГц и Ø2 мм, округлённый до 0.1 мм.
        // Проверено расчётом: КНД 5.88 дБи, F/B 29.7 дБ, Z 54.9+j1.6 Ом, КСВ 1.10.
        { key: "widthA", label: "Ширина A", unit: "мм", help: "Полная ширина рамки (длина главной стороны).", default: 116.9, min: 1, max: 20000, step: 0.1 },
        { key: "tailB", label: "Загиб активного B", unit: "мм", help: "Длина загнутого конца активного элемента (к рефлектору).", default: 14, min: 0.1, max: 5000, step: 0.1 },
        { key: "gapC", label: "Зазор C", unit: "мм", help: "Зазор между концами активного и рефлектора.", default: 6.9, min: 0.1, max: 5000, step: 0.1 },
        { key: "tailD", label: "Загиб рефлектора D", unit: "мм", help: "Длина загнутого конца рефлектора (к активному).", default: 22.8, min: 0.1, max: 5000, step: 0.1 },
        {
          key: "elementType", label: "Исполнение", unit: "", kind: "select",
          help: "Круглый провод — или печатная плата (медная дорожка на стеклотекстолите). Дорожка шириной w в расчёте заменяется эквивалентным круглым проводником радиусом w/4 — как у диполя в исполнении «плоская планка».",
          default: "wire",
          options: [
            { value: "wire", label: "Провод" },
            { value: "flat", label: "Печатная плата (дорожка)" },
          ],
        },
        { key: "diameterMm", label: "Диаметр провода", unit: "мм", help: "Диаметр проводника рамки.", default: 2, min: 0.1, max: 500, step: 0.1, showIf: (v) => v.elementType !== "flat" },
        { key: "stripWmm", label: "Ширина дорожки", unit: "мм", help: "Ширина медной дорожки рамки на плате. В расчёте — эквивалентный круглый проводник радиусом w/4. Размеры A, B, C, D — по осевым линиям дорожек.", default: 4, min: 0.05, max: 500, step: 0.05, showIf: (v) => v.elementType === "flat" },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      compute: (v) =>
        computeMoxon({
          freqMHz: num(v, "freqMHz"),
          widthA: num(v, "widthA"),
          tailB: num(v, "tailB"),
          gapC: num(v, "gapC"),
          tailD: num(v, "tailD"),
          diameterMm: num(v, "diameterMm"),
          elementType: v.elementType === "flat" ? "flat" : "wire",
          stripWmm: v.stripWmm === undefined ? undefined : num(v, "stripWmm"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
  },

  // ================= ЛПА =================
  {
    id: "lpda",
    name: "Логопериодическая",
    icon: "lpda",
    tagline: "ЛПА — метод моментов + перекрёстный фидер",
    status: "ready",
    synthesis: {
      fields: [
        {
          key: "freqLowMHz", label: "Нижняя частота", unit: "МГц",
          help: "Нижняя граница рабочей полосы. Определяет самый длинный (задний) элемент ≈ λ/2.",
          default: 200, min: 1, max: 40000, step: 1,
        },
        {
          key: "freqHighMHz", label: "Верхняя частота", unit: "МГц",
          help: "Верхняя граница рабочей полосы. Определяет самый короткий (передний) элемент.",
          default: 600, min: 1, max: 40000, step: 1,
        },
        {
          key: "tau", label: "Масштаб τ", unit: "",
          help: "Коэффициент масштаба (0<τ<1). Больше τ — больше усиление и больше элементов. Типично 0.85…0.95. σ подбирается автоматически по оптимуму Каррела.",
          default: 0.88, min: 0.6, max: 0.97, step: 0.005,
        },
        {
          key: "diameterMm", label: "Диаметр элементов", unit: "мм",
          help: "Диаметр проводника диполей.",
          default: 10, min: 0.1, max: 500, step: 0.1,
        },
        {
          key: "feederZ0", label: "Импеданс фидера Z₀", unit: "Ом",
          help: "Волновое сопротивление перекрёстной раздаточной линии. Часто 80–150 Ом.",
          default: 100, min: 10, max: 600, step: 1,
        },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      design: (v) =>
        designLpda({
          freqLowMHz: num(v, "freqLowMHz"),
          freqHighMHz: num(v, "freqHighMHz"),
          tau: num(v, "tau"),
          diameterMm: num(v, "diameterMm"),
          feederZ0: num(v, "feederZ0"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
    analysis: {
      fields: [
        FREQ(300),
        { key: "count", label: "Число элементов N", unit: "шт", help: "Количество диполей.", default: 6, min: 2, max: 30, step: 1 },
        { key: "tau", label: "Масштаб τ", unit: "", help: "Отношение длин соседних элементов L(n+1)/L(n). Обычно 0.8–0.95.", default: 0.87, min: 0.5, max: 0.98, step: 0.005 },
        { key: "sigma", label: "Интервал σ", unit: "", help: "Относительный интервал: расстояние между элементами d(n)=2σ·L(n). Обычно 0.03–0.08.", default: 0.055, min: 0.01, max: 0.25, step: 0.005 },
        { key: "longestMm", label: "Длина самого длинного", unit: "мм", help: "Полная длина заднего (самого длинного) элемента. Остальные = L·τⁿ.", default: 600, min: 1, max: 50000, step: 0.1 },
        { key: "diameterMm", label: "Диаметр элементов", unit: "мм", help: "Диаметр проводника диполей.", default: 10, min: 0.1, max: 500, step: 0.1 },
        { key: "feederZ0", label: "Импеданс фидера Z₀", unit: "Ом", help: "Волновое сопротивление раздаточной линии (перекрёстного фидера).", default: 100, min: 10, max: 600, step: 1 },
        ...MATERIAL("pec"),
        FLOOR,
      ],
      compute: (v) =>
        computeLPDA({
          freqMHz: num(v, "freqMHz"),
          count: num(v, "count"),
          tau: num(v, "tau"),
          sigma: num(v, "sigma"),
          longestMm: num(v, "longestMm"),
          diameterMm: num(v, "diameterMm"),
          feederZ0: num(v, "feederZ0"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
  },

  // ================= GNSS =================
  {
    id: "gnss",
    name: "GNSS-спираль",
    icon: "gnss",
    tagline: "Помехоустойчивая GPS-антенна — спирали (MoM)",
    status: "ready",
    synthesis: {
      fields: [
        FREQ(1575),
        {
          key: "helixCount", label: "Число спиралей", unit: "шт",
          help: "Количество идентичных спиральных элементов в сборке. По сборке GPS — 3.",
          default: 3, min: 1, max: 6, step: 1,
        },
        {
          key: "targetGainDbi", label: "Требуемое усиление спирали", unit: "дБи",
          help: "Целевое усиление ОДИНОЧНОЙ спирали над экраном; под него подбирается число витков (King–Wong). ВНИМАНИЕ: для GNSS высокое усиление вредно — луч сужается и низкие спутники теряются. Для полусферного приёма берут 8…11 дБи.",
          default: 9, min: 5, max: 20, step: 0.5,
        },
        {
          key: "pitchRel", label: "Шаг намотки", unit: "λ",
          help: "Шаг спирали в долях λ. Для осевого режима 0.20…0.25λ (угол подъёма 12…14°).",
          default: 0.22, min: 0.1, max: 0.4, step: 0.01,
        },
        {
          key: "conductor", label: "Проводник намотки", unit: "", kind: "select",
          help: "Медная лента (скотч) — как в сборке GPS — или круглый провод. Для ленты рассчитывается её ширина (лента шириной 2d эквивалентна проводу Ø d), для провода — его диаметр.",
          default: "tape",
          options: [
            { value: "tape", label: "Медная лента (скотч)" },
            { value: "wire", label: "Круглый провод" },
          ],
        },
        ...MATERIAL("cu"),
        FLOOR,
      ],
      design: (v) =>
        designGnss({
          freqMHz: num(v, "freqMHz"),
          helixCount: num(v, "helixCount"),
          targetGainDbi: num(v, "targetGainDbi"),
          pitchRel: num(v, "pitchRel"),
          conductor: v.conductor === undefined ? "tape" : (str(v, "conductor") === "wire" ? "wire" : "tape"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
    analysis: {
      fields: [
        FREQ(1575),
        { key: "helixCount", label: "Число спиралей", unit: "шт", help: "Количество идентичных спиральных элементов, запитанных синфазно. По сборке GPS — 3.", default: 3, min: 1, max: 6, step: 1 },
        { key: "helixDiaMm", label: "Диаметр спирали", unit: "мм", help: "Диаметр намотки. Окружность витка π·D должна быть ≈ λ для осевого режима.", default: 60, min: 1, max: 5000, step: 0.1 },
        { key: "turns", label: "Число витков", unit: "шт", help: "⚠ В чертежах не задано — введите фактическое число витков вашей намотки.", default: 2, min: 0.5, max: 40, step: 0.25 },
        { key: "heightMm", label: "Высота намотки", unit: "мм", help: "⚠ В чертежах не задано — введите фактическую высоту спирали.", default: 40, min: 1, max: 20000, step: 0.5 },
        { key: "arrangeRadiusMm", label: "Радиус расстановки", unit: "мм", help: "⚠ Радиус окружности, по которой расставлены центры спиралей (0 — одна спираль на оси; у нескольких спиралей центры должны отстоять дальше диаметра спирали).", default: 70, min: 0, max: 5000, step: 0.5 },
        {
          key: "conductor", label: "Проводник намотки", unit: "", kind: "select",
          help: "Из чего намотана спираль: медная лента (скотч) — как в сборке GPS, или круглый провод. Лента шириной w в расчёте заменяется эквивалентным круглым проводом радиусом w/4, провод Ø d — радиусом d/2.",
          default: "tape",
          options: [
            { value: "tape", label: "Медная лента (скотч)" },
            { value: "wire", label: "Круглый провод" },
          ],
        },
        { key: "tapeWidthMm", label: "Ширина медного скотча", unit: "мм", help: "Ширина медной ленты. Эквивалентный радиус провода = ширина/4.", default: 8, min: 0.5, max: 500, step: 0.5, showIf: (v) => v.conductor !== "wire" },
        { key: "wireDiaMm", label: "Диаметр провода намотки", unit: "мм", help: "Диаметр круглого провода, которым намотана спираль (по меди, без изоляции). В расчёте радиус = диаметр/2.", default: 1.5, min: 0.05, max: 100, step: 0.05, showIf: (v) => v.conductor === "wire" },
        {
          key: "sense", label: "Направление намотки", unit: "", kind: "select",
          help: "Правая (RH) — правая круговая поляризация RHCP (стандарт GPS). Левая (LH) — LHCP.",
          default: "RH",
          options: [
            { value: "RH", label: "Правая (RHCP)" },
            { value: "LH", label: "Левая (LHCP)" },
          ],
        },
        {
          key: "groundPlane", label: "Экран под спиралью", unit: "", kind: "select",
          help: "Металлический экран под намоткой. «Конечный» — плоский круглый диск заданного диаметра, считается вместе со спиралями методом моментов (проволочная сетка, как в NEC2): видны излучение вдоль горизонта и задний лепесток. «Бесконечный» — идеальная плоскость: под ней поля нет, нижняя половина ДН пустая. Без экрана спираль, питаемая снизу, работает в обратном режиме и луч смотрит в надир.",
          default: "yes",
          options: [
            { value: "yes", label: "Конечный диск (как в изделии)" },
            { value: "inf", label: "Бесконечный (идеализация)" },
            { value: "no", label: "Нет — свободное пространство" },
          ],
        },
        {
          key: "screenDiaMm", label: "Диаметр экрана", unit: "мм",
          help: "⚠ Диаметр плоского круглого экрана. По умолчанию 285,3 мм — внешний диаметр изделия по пояснительной записке GPS. Реальные экраны изделия — кольца с бортиком из вспененного ПВХ с токопроводящим покрытием; их точная форма в чертежах не образмерена и в модели не воспроизводится — берётся плоский диск.",
          default: 285.3, min: 20, max: 2000, step: 0.1,
          showIf: (v) => v.groundPlane !== "no" && v.groundPlane !== "inf",
        },
        {
          key: "standoffMm", label: "Высота основания над экраном", unit: "мм",
          help: "Высота стойки/питающего штыря, на которой основание намотки поднято над экраном. Слишком малое значение автоматически увеличивается (с пометкой под диаграммой): для бесконечного экрана — до половины длины сегмента (проводник вплотную к идеальному экрану гасится своим изображением), для конечного — до r_спирали + 2·r_провода сетки (граница применимости тонкопроволочной модели).",
          default: 3, min: 0, max: 1000, step: 0.5,
          showIf: (v) => v.groundPlane !== "no",
        },
        ...MATERIAL("cu"),
        FLOOR,
      ],
      compute: (v) =>
        computeGnss({
          freqMHz: num(v, "freqMHz"),
          helixCount: num(v, "helixCount"),
          helixDiaMm: num(v, "helixDiaMm"),
          turns: num(v, "turns"),
          heightMm: num(v, "heightMm"),
          arrangeRadiusMm: num(v, "arrangeRadiusMm"),
          conductor: v.conductor === undefined ? "tape" : (str(v, "conductor") === "wire" ? "wire" : "tape"),
          tapeWidthMm: num(v, "tapeWidthMm"),
          wireDiaMm: v.wireDiaMm === undefined ? undefined : num(v, "wireDiaMm"),
          sense: str(v, "sense"),
          // "yes" — конечный экран (так было помечено «как в изделии» и в прежних файлах),
          // "inf" — бесконечный, "no" — нет экрана.
          groundPlane: v.groundPlane === undefined ? "finite"
            : str(v, "groundPlane") === "no" ? "none"
            : str(v, "groundPlane") === "inf" ? "infinite" : "finite",
          screenDiaMm: v.screenDiaMm === undefined ? 285.3 : num(v, "screenDiaMm"),
          standoffMm: v.standoffMm === undefined ? 3 : num(v, "standoffMm"),
          floorDb: num(v, "floorDb"),
          ...matOf(v),
        }),
    },
  },
];

// --- Защитная обёртка -------------------------------------------------------
// Всё, что уходит в физику, обязано пройти sanitize(). Плюс страховочный try/catch:
// внутренняя ошибка обязана превратиться в понятное сообщение, а не в белый экран.

function errorResult(kind: string, title: string, errors: string[]): PatternResult {
  return {
    antennaKind: kind,
    title,
    planes: [{ label: "—", points: [] }],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: 0, lambdaMm: 0,
      directivityDbi: null, hpbwDeg: null, sllDb: null, frontToBackDb: null,
    },
    notes: errors,
  };
}

function guardAnalysis(id: string, name: string, m: AnalysisMode): AnalysisMode {
  return {
    fields: m.fields,
    compute: (raw) => {
      const g = sanitize(m.fields, raw);
      if (!g.ok) {
        return errorResult(id, `${name}: проверьте исходные данные`,
          ["⚠ Расчёт не выполнен — некорректные исходные данные:", ...g.errors.map((e) => "• " + e)]);
      }
      try {
        const r = m.compute(g.values);
        // Единая точка, где гарантируется: ни NaN, ни ±∞ не уйдут в интерфейс,
        // в паспорт и в файл проекта. Непосчитанная величина просто не показывается,
        // а причина остаётся в примечаниях (mathutil.cleanMetrics).
        return { ...r, metrics: cleanMetrics(r.metrics) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(id, `${name}: расчёт не выполнен`, [
          `⚠ Внутренняя ошибка расчёта: ${msg}`,
          "Это дефект программы либо сочетание размеров, которое модель не поддерживает. " +
          "Проверьте исходные данные; если они разумны — сообщите об ошибке с этими значениями.",
        ]);
      }
    },
  };
}

function guardSynthesis(name: string, m: SynthesisMode): SynthesisMode {
  return {
    fields: m.fields,
    design: (raw) => {
      const g = sanitize(m.fields, raw);
      if (!g.ok) {
        return {
          title: `${name}: проверьте исходные данные`,
          rows: [], analysisValues: {},
          notes: ["⚠ Проектирование не выполнено — некорректные исходные данные:",
                  ...g.errors.map((e) => "• " + e)],
        };
      }
      try {
        return m.design(g.values);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          title: `${name}: проектирование не выполнено`,
          rows: [], analysisValues: {},
          notes: [`⚠ Внутренняя ошибка: ${msg}`],
        };
      }
    },
  };
}

for (const a of ANTENNAS) {
  a.analysis = guardAnalysis(a.id, a.name, a.analysis);
  if (a.synthesis) a.synthesis = guardSynthesis(a.name, a.synthesis);
}

export function getAntenna(id: string): AntennaDef {
  return ANTENNAS.find((a) => a.id === id) ?? ANTENNAS[0];
}

export function modeOf(a: AntennaDef, mode: ModeId): AnalysisMode | SynthesisMode {
  return mode === "synthesis" && a.synthesis ? a.synthesis : a.analysis;
}

export function defaultsOf(a: AntennaDef, mode: ModeId): FieldValues {
  const m = modeOf(a, mode);
  const o: FieldValues = {};
  m.fields.forEach((f) => (o[f.key] = f.default));
  return o;
}
