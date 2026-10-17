import { describe, it, expect } from "vitest";
import {
  parseProject, serializeProject, projectFileName, reconcile, ProjectParseError,
  type AntennaProject, type ProjectSchema,
} from "./format";
import { describeFields } from "./schema";
import { buildIrtaSpec } from "./spec";
import specOnDisk from "../../docs/ФОРМАТ-IRTA.md?raw";
import { ANTENNAS, getAntenna, defaultsOf, type AntennaDef } from "../registry";
import type { ElementSpec, FieldDef, FieldValues } from "../fields";

const schemaOf = (a: AntennaDef): ProjectSchema => ({
  analysis: a.analysis.fields,
  synthesis: a.synthesis?.fields,
});

/**
 * Значения, ОТЛИЧНЫЕ от умолчаний, для каждого поля формы: число — внутри [min, max]
 * на шаге step, но не равное умолчанию; список — вариант номер `pick` (по кругу);
 * список элементов — изменённые длины/позиции. Так проверяется, что из файла
 * читается именно записанное значение, а не подставляется умолчание.
 */
function nonDefaults(fields: FieldDef[], pick: number): FieldValues {
  const o: FieldValues = {};
  for (const f of fields) {
    if (f.kind === "select") {
      const opts = f.options!;
      o[f.key] = opts[pick % opts.length].value;
    } else if (f.kind === "elements") {
      o[f.key] = (f.default as ElementSpec[]).map((e, i) => ({
        ...e, lengthMm: e.lengthMm + 1.5 + i, diameterMm: e.diameterMm + 0.25, positionMm: e.positionMm + (i ? 3 : 0),
      }));
    } else {
      const d = Number(f.default);
      const lo = f.min ?? -1e9, hi = f.max ?? 1e9;
      const step = f.step ?? 1;
      let v = d + step * (pick + 1);
      if (v > hi) v = d - step * (pick + 1);
      if (v < lo) v = lo;
      o[f.key] = Number(v.toPrecision(10));
    }
  }
  return o;
}

describe("формат .irta v2 — ВСЕ поля ОБОИХ режимов сохраняются и читаются", () => {
  for (const a of ANTENNAS) {
    // Максимальное число вариантов в выпадающих списках этого типа — перебираем все.
    const maxOpts = Math.max(1, ...[...a.analysis.fields, ...(a.synthesis?.fields ?? [])]
      .map((f) => f.options?.length ?? 1));
    it(`${a.id}: каждое поле каждого режима при каждом варианте выбора переживает запись и чтение`, () => {
      for (let pick = 0; pick < maxOpts; pick++) {
        const analysis = nonDefaults(a.analysis.fields, pick);
        const synthesis = a.synthesis ? nonDefaults(a.synthesis.fields, pick) : undefined;
        const text = serializeProject(
          { name: `Проект ${a.id} #${pick}; вариант`, type: a.id, mode: pick % 2 ? "synthesis" : "analysis", analysis, synthesis },
          schemaOf(a),
        );
        const back = parseProject(text);
        expect(back.formatVersion).toBe(2);
        expect(back.name).toBe(`Проект ${a.id} #${pick}; вариант`);
        expect(back.mode).toBe(pick % 2 ? "synthesis" : "analysis");

        const ra = reconcile(back.analysis, a.analysis.fields);
        expect(ra.missing, `${a.id}: пропали поля поверочного расчёта`).toEqual([]);
        expect(ra.unknown).toEqual([]);
        expect(ra.values).toEqual(analysis);

        if (a.synthesis) {
          const rs = reconcile(back.synthesis, a.synthesis.fields);
          expect(rs.missing, `${a.id}: пропали поля проектирования`).toEqual([]);
          expect(rs.unknown).toEqual([]);
          expect(rs.values).toEqual(synthesis);
        } else {
          expect(back.synthesis).toBeUndefined();
        }
      }
    });
  }

  it("значения скрытых полей (другой вариант списка) тоже сохраняются", () => {
    const a = getAntenna("gnss");
    const analysis = { ...defaultsOf(a, "analysis"), conductor: "tape", tapeWidthMm: 7.5, wireDiaMm: 2.7, groundPlane: "no", screenDiaMm: 310 };
    const back = parseProject(serializeProject({ name: "g", type: "gnss", mode: "analysis", analysis }, schemaOf(a)));
    expect(back.analysis.wireDiaMm).toBe(2.7);    // скрыт при ленте
    expect(back.analysis.screenDiaMm).toBe(310);  // скрыт без экрана
    expect(back.analysis.conductor).toBe("tape");
  });

  it("после записи и чтения расчёт даёт тот же результат (и в проектировании)", () => {
    for (const id of ["yagi", "moxon", "dipole"]) {
      const a = getAntenna(id);
      const analysis = defaultsOf(a, "analysis");
      if (id === "moxon") { analysis.elementType = "flat"; analysis.stripWmm = 3.3; }
      if (id === "yagi") analysis.feedGapMm = 20;
      const synthesis = defaultsOf(a, "synthesis");
      const back = parseProject(serializeProject({ name: id, type: id, mode: "analysis", analysis, synthesis }, schemaOf(a)));
      const r1 = a.analysis.compute(analysis), r2 = a.analysis.compute(back.analysis);
      expect(r2.metrics.directivityDbi).toBe(r1.metrics.directivityDbi);
      expect(r2.metrics.impedanceR).toBe(r1.metrics.impedanceR);
      const d1 = a.synthesis!.design(synthesis), d2 = a.synthesis!.design(back.synthesis!);
      expect(d2.rows.map((r) => r.value)).toEqual(d1.rows.map((r) => r.value));
    }
  });

  it("в файле перед каждым ключом — пояснение: название, единицы, варианты, условие использования", () => {
    const a = getAntenna("gnss");
    const text = serializeProject(
      { name: "g", type: "gnss", mode: "analysis", analysis: defaultsOf(a, "analysis"), synthesis: defaultsOf(a, "synthesis") },
      schemaOf(a),
    );
    expect(text.startsWith("IRTANT/2")).toBe(true);
    expect(text).toMatch(/# Проводник намотки · варианты: tape — Медная лента \(скотч\); wire — Круглый провод\nconductor = tape/);
    expect(text).toMatch(/# Диаметр провода намотки, мм · допустимо 0.05 … 100 · используется при conductor = wire\nwireDiaMm = 1.5/);
    expect(text).toMatch(/используется при groundPlane = yes\nscreenDiaMm = 285.3/);
    expect(text).toContain("[synthesis]");
  });

  it("условия зависимых полей выводятся из самой программы (яги: бум, патч: режим)", () => {
    const y = describeFields(getAntenna("yagi").analysis.fields);
    expect(y.find((f) => f.key === "boomDiaMm")!.condition).toBe("mounting ≠ none");
    expect(y.find((f) => f.key === "boomShape")!.condition).toBe("mounting = ontop-contact");
    const p = describeFields(getAntenna("patch").analysis.fields);
    expect(p.find((f) => f.key === "hpbwDeg")!.condition).toBe("mode = beam");
    expect(p.find((f) => f.key === "lengthMm")!.condition).toBe("mode = rect");
  });

  it("числа пишутся без хвостов двоичной арифметики", () => {
    const text = serializeProject({ name: "x", type: "dipole", mode: "analysis", analysis: { freqMHz: 0.1 + 0.2 } });
    expect(text).toContain("freqMHz = 0.3\n");
  });
});

describe("формат .irta — ручная правка", () => {
  it("файл читается человеком и правится вручную", () => {
    const text = `
# мой проект, поправил руками
IRTANT/2
name = Диполь 307
type = dipole
mode = analysis

[params]
freqMHz  =  307     ; частота
lengthMm = 455.5
elementType = flat
stripWmm = 6
diameterMm = 2
floorDb = -40
`;
    const p = parseProject(text);
    expect(p.type).toBe("dipole");
    expect(p.name).toBe("Диполь 307");
    expect(p.analysis.freqMHz).toBe(307);
    expect(p.analysis.lengthMm).toBe(455.5);
    expect(p.analysis.elementType).toBe("flat");
    const r = getAntenna("dipole").analysis.compute(p.analysis);
    expect(r.metrics.directivityDbi).not.toBeNull();
  });

  it("элементы яги читаются из [elements]; параметр после списка не теряется", () => {
    const text = `IRTANT/2
type = yagi
mode = analysis
[params]
freqMHz = 180
[elements]
# тип, длина, диаметр, позиция
reflector, 921, 8, 0
driven, 819, 6.31, 304
director, 734, 6, 445
feedGapMm = 20
[synthesis]
freqMHz = 181
elementCount = 9
`;
    const p = parseProject(text);
    const el = p.analysis.elements as ElementSpec[];
    expect(el.length).toBe(3);
    expect(el[0]).toEqual({ type: "reflector", lengthMm: 921, diameterMm: 8, positionMm: 0 });
    expect(p.analysis.feedGapMm).toBe(20);
    expect(p.synthesis!.freqMHz).toBe(181);
    expect(p.synthesis!.elementCount).toBe(9);
    expect(p.analysis.freqMHz).toBe(180);
  });

  it("неизвестные ключи и отсутствующие поля выявляются (их видит пользователь)", () => {
    const p = parseProject(`IRTANT/2
type = gnss
[params]
freqMHz = 1575
condutor = wire
`);
    const r = reconcile(p.analysis, getAntenna("gnss").analysis.fields);
    expect(r.unknown).toEqual(["condutor"]);
    expect(r.missing).toContain("conductor");
    expect(r.values.conductor).toBe("tape"); // умолчание
  });
});

describe("формат .irta — понятные ошибки", () => {
  it("чужой файл отвергается с внятным сообщением", () => {
    expect(() => parseProject("{\"json\": true}")).toThrow(ProjectParseError);
    expect(() => parseProject("просто текст")).toThrow(/не файл проекта антенны/);
  });

  it("указывается номер проблемной строки", () => {
    const bad = `IRTANT/2
type = yagi
[elements]
reflector, 921, 8, 0
driven, 799, 6.31
`;
    try {
      parseProject(bad);
      throw new Error("должно было упасть");
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectParseError);
      expect((e as Error).message).toContain("Строка 5");
      expect((e as Error).message).toContain("4 значения");
    }
  });

  it("неизвестный тип элемента и неизвестная секция отвергаются", () => {
    expect(() => parseProject("IRTANT/2\ntype = yagi\n[elements]\nparasite, 921, 8, 0\n")).toThrow(/неизвестный тип элемента/);
    expect(() => parseProject("IRTANT/2\ntype = yagi\n[prams]\nfreqMHz = 1\n")).toThrow(/неизвестная секция/);
  });

  it("отсутствие типа антенны — ошибка", () => {
    expect(() => parseProject("IRTANT/2\nname = без типа\n")).toThrow(/не указан тип/);
  });

  it("версия из будущего отвергается, а не читается криво", () => {
    expect(() => parseProject("IRTANT/99\ntype = dipole\n")).toThrow(/новее поддерживаемой/);
  });

  it("имя файла очищается от недопустимых символов", () => {
    expect(projectFileName('Яги 180 / "тест" *?')).toBe("Яги 180 _ _тест_ _.irta");
    expect(projectFileName("")).toBe("antenna.irta");
  });

  it("мусор в файле не считается молча, а даёт понятную ошибку расчёта", () => {
    const p = parseProject("IRTANT/2\ntype = dipole\n[params]\nfreqMHz = -5\n");
    const a = getAntenna("dipole");
    const r = a.analysis.compute(reconcile(p.analysis, a.analysis.fields).values);
    expect(r.notes.join(" ")).toMatch(/некорректные исходные данные/);
    expect(r.metrics.directivityDbi).toBeNull();
  });
});

describe("формат .irta — совместимость со старыми файлами IRTANT/1", () => {
  it("старый файл поверочного расчёта открывается; недостающее — умолчания", () => {
    const old = `IRTANT/1
type = yagi
mode = analysis
[params]
freqMHz = 180
floorDb = -40
[elements]
reflector, 921, 8, 0
driven, 799, 6.31, 304
director, 734, 6, 445
`;
    const p = parseProject(old);
    expect(p.formatVersion).toBe(1);
    expect(p.synthesis).toBeUndefined();
    const a = getAntenna("yagi");
    const r0 = reconcile(p.analysis, a.analysis.fields);
    expect(r0.missing).toEqual(["feedGapMm", "mounting", "boomDiaMm", "boomShape", "material", "rhoCustom"]);
    const r = a.analysis.compute(r0.values);
    expect(r.metrics.directivityDbi).not.toBeNull();
    expect(r.notes.some((n) => n.includes("не выполнен"))).toBe(false);
  });

  it("старый файл ПРОЕКТИРОВАНИЯ: [params] читаются как поля проектирования", () => {
    const p = parseProject(`IRTANT/1
type = horn
mode = synthesis
[params]
freqMHz = 12000
targetGainDbi = 20
floorDb = -40
`);
    expect(p.mode).toBe("synthesis");
    expect(p.synthesis!.targetGainDbi).toBe(20);
    expect(Object.keys(p.analysis)).toEqual([]);
  });

  it("старое значение groundPlane = yes у GNSS читается (теперь это конечный экран)", () => {
    const p = parseProject("IRTANT/1\ntype = gnss\nmode = analysis\n[params]\ngroundPlane = yes\nstandoffMm = 3.5\nturns = 4\n");
    const a = getAntenna("gnss");
    const v = reconcile(p.analysis, a.analysis.fields).values;
    expect(v.groundPlane).toBe("yes");
    expect(v.standoffMm).toBe(3.5);
  });
});

describe("сценарий программы: сохранить → открыть (как делает App)", () => {
  // App при сохранении пишет {умолчания + состояние формы} обоих режимов,
  // при открытии делает reconcile по полям каждого режима.
  const exportLike = (a: AntennaDef, analysis: FieldValues, synthesis: FieldValues, mode: "analysis" | "synthesis"): AntennaProject => ({
    name: "Проект", type: a.id, mode,
    analysis: { ...defaultsOf(a, "analysis"), ...analysis },
    synthesis: a.synthesis ? { ...defaultsOf(a, "synthesis"), ...synthesis } : undefined,
  });

  it("экспорт из Проектирования: цели и рассчитанные размеры возвращаются, открывается Проектирование", () => {
    for (const a of ANTENNAS) {
      if (!a.synthesis) continue;
      const synth = nonDefaults(a.synthesis.fields, 1);
      const d = a.synthesis.design(synth);
      if (!Object.keys(d.analysisValues).length) continue; // вне области годности — экспортировать нечего
      const back = parseProject(serializeProject(exportLike(a, d.analysisValues, synth, "synthesis"), schemaOf(a)));
      expect(back.mode).toBe("synthesis");
      expect(reconcile(back.synthesis, a.synthesis.fields).values).toEqual({ ...defaultsOf(a, "synthesis"), ...synth });
      expect(reconcile(back.analysis, a.analysis.fields).values).toEqual({ ...defaultsOf(a, "analysis"), ...d.analysisValues });
    }
  });
});

describe("спецификация формата docs/ФОРМАТ-IRTA.md совпадает с программой", () => {
  it("документ перевыпущен после последнего изменения полей (npm run irta-spec)", () => {
    expect(specOnDisk.replace(/\r\n/g, "\n")).toBe(buildIrtaSpec());
  });
});
