// Формат файла проекта антенны «.irta» (ИРТ-Антенна), версия 2.
//
// Это ОБЫЧНЫЙ ТЕКСТ: его можно открыть блокнотом, поправить руками и снова загрузить.
//
//   IRTANT/2                      ← подпись формата и версия (читаются и файлы IRTANT/1)
//   name = Яги 180 МГц            ← заголовок: имя, тип антенны, режим открытия, заметка
//   type = yagi
//   mode = analysis               ← analysis — «Поверочный расчёт», synthesis — «Проектирование»
//   note = …
//
//   [params]                      ← ВСЕ поля «Поверочного расчёта» (размеры → ДН)
//   freqMHz = 180
//   feedGapMm = 20
//   …
//   [elements]                    ← список элементов (яги): тип, длина, диаметр, позиция, мм
//   reflector, 921, 8, 0
//   driven, 819, 6.31, 304
//
//   [synthesis]                   ← ВСЕ поля «Проектирования» (цели → размеры)
//   freqMHz = 180
//   elementCount = 7
//   …
//
// Правила:
//   • «ключ = значение»; пробелы вокруг «=» не важны; пустые строки игнорируются;
//   • «#» и «;» начинают комментарий до конца строки (кроме строк name и note —
//     там весь текст после «=» считается значением, чтобы в названии можно было писать «№», «;»);
//   • сохраняются ВСЕ поля обоих режимов, в том числе поля, скрытые при текущем выборе
//     в выпадающем списке (например, диаметр провода при выбранной ленте), — поэтому при
//     переключении варианта после открытия файла возвращаются ваши значения, а не заводские;
//   • перед каждым ключом пишется комментарий: название, единицы, допустимый диапазон,
//     варианты выбора и при каком выборе поле используется.
//
// Совместимость с IRTANT/1: там был один набор полей в [params] — поля режима,
// указанного в «mode». Он и читается как поля этого режима; второго режима в файле нет.

import type { ElementSpec, FieldDef, FieldValue, FieldValues } from "../fields";
import { describeFields, fieldComment } from "./schema";

export const MAGIC = "IRTANT";
export const VERSION = 2;
export const FILE_EXT = ".irta";

export type ProjectMode = "analysis" | "synthesis";

export interface AntennaProject {
  /** Имя проекта (произвольное, попадает в шапку). */
  name: string;
  /** Идентификатор типа антенны из реестра: yagi, patch, moxon, … */
  type: string;
  /** Режим, в котором открыть проект. */
  mode: ProjectMode;
  /** Поля «Поверочного расчёта» (размеры антенны). */
  analysis: FieldValues;
  /** Поля «Проектирования» (цели). У типов без проектирования — нет. */
  synthesis?: FieldValues;
  /** Необязательное описание. */
  note?: string;
  /** Версия формата прочитанного файла (при записи всегда текущая). */
  formatVersion?: number;
}

/** Описания полей, по которым пишутся порядок ключей и комментарии. */
export interface ProjectSchema {
  analysis: FieldDef[];
  synthesis?: FieldDef[];
}

export class ProjectParseError extends Error {
  constructor(message: string, public line?: number) {
    super(line ? `Строка ${line}: ${message}` : message);
    this.name = "ProjectParseError";
  }
}

const ELEMENT_TYPES = new Set(["reflector", "driven", "director"]);

function numOrStr(raw: string): number | string {
  const t = raw.trim();
  if (t === "") return "";
  // Числом считаем только «чистое» число, чтобы не испортить значения вроде "RH".
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return t;
}

/** Убирает комментарий, не трогая содержимое (в этом формате кавычек нет). */
function stripComment(line: string): string {
  const i = line.search(/[#;]/);
  return (i >= 0 ? line.slice(0, i) : line).trim();
}

/** Число без «хвостов» двоичной арифметики (0.30000000000000004 → 0.3). */
function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(12)));
}

function fmtValue(v: FieldValue): string {
  return typeof v === "number" ? fmtNum(v) : String(v);
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

// ---------------------------------------------------------------- сериализация

function writeSection(
  out: string[],
  values: FieldValues,
  fields: FieldDef[] | undefined,
): { elements: [string, ElementSpec[]][] } {
  const infos = fields ? describeFields(fields) : [];
  const known = new Set(infos.map((i) => i.key));
  const elements: [string, ElementSpec[]][] = [];
  // Сначала — в порядке полей формы, с комментарием; затем — прочие ключи (если есть).
  const order = [...infos.map((i) => i.key), ...Object.keys(values).filter((k) => !known.has(k))];
  for (const k of order) {
    if (!(k in values)) continue;
    const v = values[k];
    if (Array.isArray(v)) { elements.push([k, v as ElementSpec[]]); continue; }
    const info = infos.find((i) => i.key === k);
    if (info) out.push(`# ${fieldComment(info)}`);
    out.push(`${k} = ${fmtValue(v)}`);
  }
  return { elements };
}

function writeElements(out: string[], list: [string, ElementSpec[]][]): void {
  for (const [key, els] of list) {
    out.push("");
    out.push(`[elements]${key === "elements" ? "" : ` ${key}`}`);
    out.push("# тип (reflector — рефлектор, driven — активный, director — директор), длина(мм), диаметр(мм), позиция от 1-го элемента(мм)");
    out.push("# длина активного — от кончика до кончика, ВКЛЮЧАЯ зазор feedGapMm");
    for (const e of els) {
      out.push(`${e.type}, ${fmtNum(e.lengthMm)}, ${fmtNum(e.diameterMm)}, ${fmtNum(e.positionMm)}`);
    }
  }
}

export function serializeProject(p: AntennaProject, schema?: ProjectSchema): string {
  const out: string[] = [];
  out.push(`${MAGIC}/${VERSION}`);
  out.push("# Проект антенны — RF CALC, калькулятор ДН, Антенны ИРТ");
  out.push("# Файл можно править вручную в любом текстовом редакторе (кодировка UTF-8).");
  out.push("# Комментарий — после # или ; до конца строки. Сохраняются ВСЕ поля обоих режимов,");
  out.push("# включая скрытые при текущем выборе в списках (они вернутся при переключении варианта).");
  out.push("");
  out.push(`name = ${oneLine(p.name)}`);
  out.push(`type = ${p.type}`);
  out.push(`# в каком режиме открыть: analysis — Поверочный расчёт, synthesis — Проектирование`);
  out.push(`mode = ${p.mode}`);
  out.push(`created = ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  if (p.note) out.push(`note = ${oneLine(p.note)}`);
  out.push("");

  out.push("[params]");
  out.push("# ===== Поверочный расчёт: размеры антенны → ДН =====");
  const a = writeSection(out, p.analysis, schema?.analysis);
  writeElements(out, a.elements);

  if (p.synthesis && Object.keys(p.synthesis).length) {
    out.push("");
    out.push("[synthesis]");
    out.push("# ===== Проектирование: частота и цели → размеры =====");
    const s = writeSection(out, p.synthesis, schema?.synthesis);
    // Списков элементов в проектировании нет; если когда-нибудь появятся — запишем.
    if (s.elements.length) writeElements(out, s.elements);
  }
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------- разбор

export function parseProject(text: string): AntennaProject {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  // 1) подпись формата
  let i = 0;
  while (i < lines.length && stripComment(lines[i]) === "") i++;
  if (i >= lines.length) throw new ProjectParseError("файл пустой");
  const head = stripComment(lines[i]);
  const m = /^([A-Za-z]+)\s*\/\s*(\d+)$/.exec(head);
  if (!m || m[1].toUpperCase() !== MAGIC) {
    throw new ProjectParseError(
      `это не файл проекта антенны — ожидалась первая строка «${MAGIC}/${VERSION}», получено «${head}»`,
      i + 1,
    );
  }
  const ver = Number(m[2]);
  if (ver < 1) throw new ProjectParseError(`неподдерживаемая версия формата ${ver}`, i + 1);
  if (ver > VERSION) {
    throw new ProjectParseError(
      `версия формата ${m[2]} новее поддерживаемой (${VERSION}) — обновите программу`,
      i + 1,
    );
  }
  i++;

  let name = "", type = "", mode: ProjectMode = "analysis", note: string | undefined;
  const params: FieldValues = {};
  const synth: FieldValues = {};
  let sawSynth = false;
  // Текущая секция: "" (заголовок), "params", "elements", "synthesis", "synthesis-elements".
  let section = "";
  let elementsKey = "elements";
  let elementsTarget: FieldValues = params;
  const elementLists = new Map<FieldValues, Map<string, ElementSpec[]>>();

  for (; i < lines.length; i++) {
    const original = lines[i];
    const raw = stripComment(original);
    if (raw === "") continue;
    const ln = i + 1;

    // секция
    const sec = /^\[([^\]]+)\]\s*(.*)$/.exec(raw);
    if (sec) {
      const s = sec[1].trim().toLowerCase();
      if (s === "elements") {
        // Список элементов относится к тому набору полей, после которого стоит.
        const inSynth = section === "synthesis" || section === "synthesis-elements";
        elementsTarget = inSynth ? synth : params;
        elementsKey = sec[2].trim() || "elements";
        const lists = elementLists.get(elementsTarget) ?? new Map<string, ElementSpec[]>();
        if (!lists.has(elementsKey)) lists.set(elementsKey, []);
        elementLists.set(elementsTarget, lists);
        section = inSynth ? "synthesis-elements" : "elements";
      } else if (s === "params" || s === "analysis") {
        section = "params";
      } else if (s === "synthesis") {
        section = "synthesis"; sawSynth = true;
      } else if (s === "header") {
        section = "";
      } else {
        throw new ProjectParseError(
          `неизвестная секция [${sec[1]}]. Допустимо: [params], [elements], [synthesis]`,
          ln,
        );
      }
      continue;
    }

    // Строка элемента — если в ней нет «=». Иначе это снова «ключ = значение»
    // того же набора полей (при ручной правке параметр мог оказаться после списка).
    if ((section === "elements" || section === "synthesis-elements") && !raw.includes("=")) {
      const parts = raw.split(",").map((s) => s.trim());
      if (parts.length !== 4) {
        throw new ProjectParseError(
          `в секции [elements] нужно 4 значения через запятую (тип, длина, диаметр, позиция), а тут ${parts.length}`,
          ln,
        );
      }
      const [t, L, D, P] = parts;
      const tl = t.toLowerCase();
      if (!ELEMENT_TYPES.has(tl)) {
        throw new ProjectParseError(
          `неизвестный тип элемента «${t}». Допустимо: ${[...ELEMENT_TYPES].join(", ")}`,
          ln,
        );
      }
      const nums = [L, D, P].map(Number);
      if ([L, D, P].some((s) => s === "") || nums.some((n) => !Number.isFinite(n))) {
        throw new ProjectParseError(`длина, диаметр и позиция должны быть числами: «${raw}»`, ln);
      }
      elementLists.get(elementsTarget)!.get(elementsKey)!.push(
        { type: tl, lengthMm: nums[0], diameterMm: nums[1], positionMm: nums[2] },
      );
      continue;
    }

    // ключ = значение
    const eq = raw.indexOf("=");
    if (eq < 0) throw new ProjectParseError(`не похоже на «ключ = значение»: «${raw}»`, ln);
    const key = raw.slice(0, eq).trim();
    const val = raw.slice(eq + 1).trim();
    if (!key) throw new ProjectParseError("пустое имя параметра", ln);

    if (section === "") {
      switch (key.toLowerCase()) {
        case "name":
          // Имя и заметка — целиком, без вырезания «комментария».
          name = original.slice(original.indexOf("=") + 1).trim();
          continue;
        case "note":
          note = original.slice(original.indexOf("=") + 1).trim();
          continue;
        case "type": type = val.toLowerCase(); continue;
        case "mode":
          if (val !== "analysis" && val !== "synthesis") {
            throw new ProjectParseError(`mode должен быть analysis или synthesis, получено «${val}»`, ln);
          }
          mode = val; continue;
        case "created": continue;
        default:
          // параметры до секции [params] — принимаем как параметры
          params[key] = numOrStr(val);
          continue;
      }
    }
    const target = section === "synthesis" || section === "synthesis-elements" ? synth : params;
    target[key] = numOrStr(val);
  }

  if (!type) throw new ProjectParseError("не указан тип антенны (строка «type = …»)");
  for (const [target, lists] of elementLists) {
    for (const [k, list] of lists) target[k] = list;
  }
  if (!name) name = `Проект ${type}`;

  // IRTANT/1: единственный набор [params] — это поля режима из заголовка.
  if (ver < 2) {
    if (mode === "synthesis") {
      return { name, type, mode, analysis: {}, synthesis: params, note, formatVersion: ver };
    }
    return { name, type, mode, analysis: params, note, formatVersion: ver };
  }
  return {
    name, type, mode, analysis: params, synthesis: sawSynth ? synth : undefined, note, formatVersion: ver,
  };
}

/**
 * Сверка значений из файла с полями формы: какие ключи в файле неизвестны программе
 * (опечатка или поле из другой версии) и каких полей в файле нет (для них берутся
 * значения по умолчанию). Нужна, чтобы пользователь ВИДЕЛ, что взято не из файла.
 */
export function reconcile(
  values: FieldValues | undefined,
  fields: FieldDef[],
): { values: FieldValues; unknown: string[]; missing: string[] } {
  const out: FieldValues = {};
  const unknown: string[] = [];
  const missing: string[] = [];
  const keys = new Set(fields.map((f) => f.key));
  for (const f of fields) {
    if (values && f.key in values) out[f.key] = values[f.key];
    else { out[f.key] = f.default; missing.push(f.key); }
  }
  if (values) for (const k of Object.keys(values)) if (!keys.has(k)) unknown.push(k);
  return { values: out, unknown, missing };
}

/** Безопасное имя файла из названия проекта. */
export function projectFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim() || "antenna";
  return base + FILE_EXT;
}
