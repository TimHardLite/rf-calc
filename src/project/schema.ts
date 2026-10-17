// Описание полей для файла проекта и для спецификации формата.
// Источник истины — описания полей в реестре (registry.ts): отсюда в файл .irta попадают
// комментарии к каждому ключу (название, единицы, диапазон, варианты выбора, при каком
// выборе поле используется), и отсюда же генерируется документ со спецификацией формата.
// Поэтому новое поле, добавленное в реестр, автоматически сохраняется, читается и описывается.

import type { FieldDef, FieldValue, FieldValues } from "../fields";

export interface FieldInfo {
  key: string;
  label: string;
  unit: string;
  kind: "number" | "select" | "elements";
  default: FieldValue;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  /** Условие, при котором поле используется («conductor = wire»), null — всегда. */
  condition: string | null;
}

function defaultsOfFields(fields: FieldDef[]): FieldValues {
  const o: FieldValues = {};
  for (const f of fields) o[f.key] = f.default;
  return o;
}

/**
 * Условие видимости зависимого поля — выводится ПРОБОЙ: перебираются варианты каждого
 * выпадающего списка той же формы (остальные значения — по умолчанию) и смотрится, при
 * каких вариантах поле показывается. Так условие всегда совпадает с тем, что видит
 * пользователь в программе, и не может разойтись с кодом.
 */
export function visibilityCondition(fields: FieldDef[], f: FieldDef): string | null {
  if (!f.showIf) return null;
  const base = defaultsOfFields(fields);
  const parts: string[] = [];
  for (const s of fields) {
    if (s === f || s.kind !== "select" || !s.options?.length) continue;
    const vis: string[] = [], hid: string[] = [];
    for (const o of s.options) {
      const v = { ...base, [s.key]: o.value };
      let shown = false;
      try { shown = f.showIf(v); } catch { shown = false; }
      (shown ? vis : hid).push(String(o.value));
    }
    if (vis.length && hid.length) {
      parts.push(
        vis.length <= hid.length
          ? `${s.key} = ${vis.join(" | ")}`
          : `${s.key} ≠ ${hid.join(" | ")}`,
      );
    }
  }
  return parts.length ? parts.join(" и ") : "зависит от других полей";
}

export function describeFields(fields: FieldDef[]): FieldInfo[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    unit: f.unit,
    kind: f.kind ?? "number",
    default: f.default,
    min: f.min,
    max: f.max,
    options: f.options?.map((o) => ({ value: String(o.value), label: o.label })),
    condition: visibilityCondition(fields, f),
  }));
}

/** Короткое описание поля в одну строку — для комментария в файле. */
export function fieldComment(fi: FieldInfo): string {
  const bits: string[] = [fi.label + (fi.unit ? `, ${fi.unit}` : "")];
  if (fi.kind === "select" && fi.options) {
    bits.push("варианты: " + fi.options.map((o) => `${o.value} — ${o.label}`).join("; "));
  } else if (fi.kind === "number" && (fi.min != null || fi.max != null)) {
    bits.push(`допустимо ${fi.min ?? "…"} … ${fi.max ?? "…"}`);
  }
  if (fi.condition) bits.push(`используется при ${fi.condition}`);
  return bits.join(" · ");
}
