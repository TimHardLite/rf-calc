// Базовые типы форм и результатов проектирования.
// ВАЖНО: этот файл НЕ импортирует ничего — он лежит в основании графа зависимостей
// (registry, synth/*, project/* ссылаются на него), чтобы не было циклических импортов.

/** Элемент антенны со списком (яги/ЛПА): структурно совместим с YagiElement. */
export interface ElementSpec {
  type: string;
  lengthMm: number;
  diameterMm: number;
  positionMm: number;
}

export type FieldValue = number | string | ElementSpec[];
export type FieldValues = Record<string, FieldValue>;

export interface FieldOption {
  value: number | string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  unit: string;
  help: string;
  default: FieldValue;
  kind?: "number" | "select" | "elements";
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  /** Показывать поле только если условие истинно (зависимые поля). */
  showIf?: (v: FieldValues) => boolean;
  /** Живая подсказка под полем: производная величина из текущих значений формы
   *  (например, длина плеча активного элемента по длине и зазору). null — не показывать. */
  derive?: (v: FieldValues) => string | null;
}

// ---------- Результат режима «Проектирование» ----------

/** Одна рассчитанная величина в таблице результатов проектирования. */
export interface DesignRow {
  /** Раздел таблицы («Габариты», «Согласование», «Экран»…). */
  group: string;
  label: string;
  /** Готовая к показу строка значения. */
  value: string;
  unit?: string;
  /** Короткое пояснение — откуда взялось / на что влияет. */
  hint?: string;
  /** Выделить как ключевой размер. */
  key?: boolean;
}

export interface DesignResult {
  /** Имя, которое пойдёт в файл проекта и в шапку. */
  title: string;
  /** Рассчитанные размеры и параметры. */
  rows: DesignRow[];
  /** Готовые входные значения для режима «Поверочный расчёт» той же антенны.
   *  Именно они идут в кнопку «Добавить в калькулятор» и в экспорт файла. */
  analysisValues: FieldValues;
  /** Примечания и предупреждения (в т.ч. ⚠ о недостающих данных). */
  notes: string[];
}

/** Утилита форматирования числа для таблицы результатов. */
export function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}
