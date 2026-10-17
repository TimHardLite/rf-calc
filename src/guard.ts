// Единая проверка входных данных на границе «форма → расчёт».
//
// ЗАЧЕМ ОТДЕЛЬНЫМ МОДУЛЕМ. Физические модули должны заниматься физикой, а не разбором
// того, что пользователь ввёл в поле. Поэтому вся защита от мусора (пустая строка,
// текст, ноль, бесконечность, значение вне диапазона) собрана здесь и применяется
// ОДИНАКОВО ко всем типам антенн. Прямой стресс-тест показал, что без этого слоя
// ЛПА с count = ∞ падала с «Invalid array length», а Moxon с пустой частотой —
// с «Cannot read properties of undefined»: пользователь получал бы белый экран.
//
// Правило: некорректный ввод НИКОГДА не считается «как-нибудь». Либо расчёт идёт на
// заведомо валидных данных, либо возвращается понятное сообщение, что именно не так.

import type { FieldDef, FieldValues, FieldValue, ElementSpec } from "./fields";

export interface GuardResult {
  ok: boolean;
  values: FieldValues;
  errors: string[];
}

function isElementArray(v: FieldValue): v is ElementSpec[] {
  return Array.isArray(v);
}

/** Проверяет и нормализует значения формы по описаниям полей. */
export function sanitize(fields: FieldDef[], raw: FieldValues): GuardResult {
  const values: FieldValues = {};
  const errors: string[] = [];

  for (const fd of fields) {
    // Поле может быть скрыто условием showIf — тогда его значение не участвует.
    if (fd.showIf && !fd.showIf(raw)) {
      values[fd.key] = raw[fd.key] ?? fd.default;
      continue;
    }
    const v = raw[fd.key];

    if (fd.kind === "elements") {
      if (!isElementArray(v)) {
        errors.push(`«${fd.label}»: список элементов не задан.`);
        values[fd.key] = (fd.default as ElementSpec[]) ?? [];
        continue;
      }
      const bad: string[] = [];
      v.forEach((e, i) => {
        if (!e || typeof e !== "object") { bad.push(`№${i + 1}: неверная запись элемента`); return; }
        if (!["reflector", "driven", "director"].includes(e.type)) bad.push(`№${i + 1}: тип`);
        if (!Number.isFinite(e.lengthMm) || e.lengthMm <= 0) bad.push(`№${i + 1}: длина`);
        if (!Number.isFinite(e.diameterMm) || e.diameterMm <= 0) bad.push(`№${i + 1}: диаметр`);
        if (!Number.isFinite(e.positionMm)) bad.push(`№${i + 1}: позиция`);
      });
      if (v.length === 0) errors.push(`«${fd.label}»: не задано ни одного элемента.`);
      if (bad.length) errors.push(`«${fd.label}»: некорректные значения — ${bad.join(", ")}.`);
      values[fd.key] = v;
      continue;
    }

    if (fd.kind === "select") {
      const allowed = (fd.options ?? []).map((o) => String(o.value));
      const sv = v === undefined || v === null ? String(fd.default) : String(v);
      if (!allowed.includes(sv)) {
        errors.push(
          `«${fd.label}»: значение «${sv}» недопустимо. Возможные: ${allowed.join(", ")}.`,
        );
        values[fd.key] = fd.default;
      } else {
        values[fd.key] = sv;
      }
      continue;
    }

    // Числовое поле.
    // КЛЮЧА НЕТ ВОВСЕ — это файл, сохранённый до появления поля (или сгенерированный
    // без него). Такой файл обязан открываться: берём значение по умолчанию молча.
    if (v === undefined || v === null) {
      values[fd.key] = fd.default;
      continue;
    }
    // Ключ есть, но пустой — это уже ошибка ввода, её показываем.
    if (v === "" || (typeof v === "string" && v.trim() === "")) {
      errors.push(`«${fd.label}»: поле не заполнено.`);
      values[fd.key] = fd.default;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      errors.push(`«${fd.label}»: «${String(v)}» — это не число.`);
      values[fd.key] = fd.default;
      continue;
    }
    const unit = fd.unit ? ` ${fd.unit}` : "";
    if (fd.min !== undefined && n < fd.min) {
      errors.push(`«${fd.label}»: ${n}${unit} меньше допустимого минимума ${fd.min}${unit}.`);
      values[fd.key] = fd.default;
      continue;
    }
    if (fd.max !== undefined && n > fd.max) {
      errors.push(`«${fd.label}»: ${n}${unit} больше допустимого максимума ${fd.max}${unit}.`);
      values[fd.key] = fd.default;
      continue;
    }
    values[fd.key] = n;
  }

  return { ok: errors.length === 0, values, errors };
}
