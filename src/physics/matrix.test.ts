// СКВОЗНАЯ ПРОВЕРКА ВСЕХ ТИПОВ И ОБОИХ РЕЖИМОВ (приёмочная матрица v2).
//
// Зачем отдельный файл. Остальные тесты проверяют физику по эталонам (NEC-2, MMANA,
// Balanis) — каждый в своей точке. Здесь проверяется другое: что ПО ВСЕМ типам антенн
// и ПО ОБОИМ режимам результат внутренне непротиворечив — диаграмма построена
// правильно (углы, нормировка, отсутствие дыр), а числа в таблице согласованы
// с самой диаграммой и друг с другом (КСВ с импедансом, КУ с КНД и КПД,
// ширина луча с точками ДН, F/B с уровнем в обратном направлении).
//
// Такая матрица ловит класс ошибок, который эталонные тесты пропускают:
// рассинхронизацию «показанного» и «посчитанного» при правках интерфейса и моделей.

import { describe, it, expect } from "vitest";
import { ANTENNAS, type AntennaDef } from "../registry";
import { sanitize } from "../guard";
import type { FieldDef, FieldValues } from "../fields";
import type { PatternPlane, PatternResult } from "./types";

function defaultsOf(fields: FieldDef[]): FieldValues {
  const v: FieldValues = {};
  for (const f of fields) v[f.key] = f.default;
  return v;
}

function run(a: AntennaDef, values: FieldValues): PatternResult {
  const g = sanitize(a.analysis.fields, values);
  expect(g.errors, `${a.id}: ввод не прошёл проверку`).toEqual([]);
  return a.analysis.compute(g.values);
}

/** Ширина по −3 дБ, посчитанная НЕЗАВИСИМО от кода метрик — прямо по точкам ДН. */
function widthFromPoints(p: PatternPlane): number | null {
  const n = p.points.length;
  if (n < 8) return null;
  let imax = 0;
  for (let i = 1; i < n; i++) if (p.points[i].valueDb > p.points[imax].valueDb) imax = i;
  const lvl = p.points[imax].valueDb - 3;
  const walk = (dir: number): number | null => {
    for (let k = 1; k < n; k++) {
      const i = (imax + dir * k + 2 * n) % n;
      const j = (imax + dir * (k - 1) + 2 * n) % n;
      if (p.points[i].valueDb <= lvl) {
        const v1 = p.points[j].valueDb, v2 = p.points[i].valueDb;
        const t = v1 === v2 ? 0 : (v1 - lvl) / (v1 - v2);
        return (k - 1 + t) * Math.abs(p.points[1].angleDeg - p.points[0].angleDeg);
      }
    }
    return null;
  };
  const up = walk(1), down = walk(-1);
  if (up === null || down === null) return null;
  return up + down;
}

function levelAt(p: PatternPlane, angleDeg: number): number {
  const a = ((angleDeg % 360) + 360) % 360;
  let best = p.points[0], bd = Infinity;
  for (const q of p.points) {
    const d = Math.abs(((q.angleDeg - a + 540) % 360) - 180);
    if (d < bd) { bd = d; best = q; }
  }
  return best.valueDb;
}

function swrOfRX(R: number, X: number, z0 = 50): number {
  const g = Math.sqrt(((R - z0) ** 2 + X * X) / ((R + z0) ** 2 + X * X));
  return (1 + g) / (1 - g);
}

/** Главный луч (индекс угла) в опорной плоскости. */
function peakAngle(p: PatternPlane): number {
  let imax = 0;
  for (let i = 1; i < p.points.length; i++) if (p.points[i].valueDb > p.points[imax].valueDb) imax = i;
  return p.points[imax].angleDeg;
}

/** Ожидаемое направление главного луча на диаграмме опорной плоскости, град. */
const EXPECTED_PEAK: Record<string, number> = {
  dipole: 90,  // 0° — вдоль оси вибратора (нуль), максимум поперёк
  patch: 0,    // 0° — нормаль к патчу
  horn: 0,     // 0° — ось рупора
  array: 90,   // 0° — вдоль оси решётки; при нулевой фазировке луч поперечный
  yagi: 0,     // 0° — вперёд по буму
  moxon: 0,    // 0° — в сторону активного
  lpda: 0,     // 0° — к короткому элементу
  gnss: 0,     // 0° — зенит
};

/** Физически допустимый диапазон КНД для заводских размеров, дБи. */
const D_RANGE: Record<string, [number, number]> = {
  dipole: [1.5, 3.5], patch: [5, 10], horn: [8, 25], array: [4, 14],
  yagi: [9, 14], moxon: [4.5, 7], lpda: [5, 9], gnss: [8, 16],
};

/** Проверки, общие для ЛЮБОГО результата расчёта. */
function checkResult(a: AntennaDef, r: PatternResult, floorDb: number, tag: string) {
  const m = r.metrics;
  const who = `${a.id} [${tag}]`;

  // --- 1. Диаграмма: структура, углы, нормировка -----------------------------
  expect(r.planes.length, `${who}: нет ни одной плоскости`).toBeGreaterThan(0);
  expect(r.referencePlaneIndex, who).toBeGreaterThanOrEqual(0);
  expect(r.referencePlaneIndex, who).toBeLessThan(r.planes.length);

  let globalMax = -Infinity;
  for (const p of r.planes) {
    expect(p.points.length, `${who}/${p.label}: мало точек`).toBeGreaterThanOrEqual(36);
    for (let i = 0; i < p.points.length; i++) {
      const q = p.points[i];
      expect(Number.isFinite(q.angleDeg), `${who}/${p.label}: угол не число (i=${i})`).toBe(true);
      expect(Number.isFinite(q.valueDb), `${who}/${p.label}: уровень не число (i=${i})`).toBe(true);
      if (i > 0) expect(q.angleDeg, `${who}/${p.label}: углы не возрастают`).toBeGreaterThan(p.points[i - 1].angleDeg);
      // Нормировка: уровень не может быть выше максимума (0 дБ) и ниже шкалы.
      expect(q.valueDb, `${who}/${p.label}: уровень выше 0 дБ`).toBeLessThanOrEqual(1e-9);
      expect(q.valueDb, `${who}/${p.label}: уровень ниже шкалы ${floorDb} дБ`).toBeGreaterThanOrEqual(floorDb - 1e-9);
    }
    // Полный круг: первая точка 0°, последняя < 360°, шаг постоянный.
    const step = p.points[1].angleDeg - p.points[0].angleDeg;
    expect(step, `${who}/${p.label}: нулевой шаг по углу`).toBeGreaterThan(0);
    const span = p.points[p.points.length - 1].angleDeg - p.points[0].angleDeg + step;
    expect(span, `${who}/${p.label}: сечение не замкнуто (охват ${span}°)`).toBeCloseTo(360, 6);
    globalMax = Math.max(globalMax, ...p.points.map((q) => q.valueDb));
  }
  // Хотя бы одна плоскость проходит через максимум сферы.
  expect(globalMax, `${who}: ни одно сечение не достаёт до максимума`).toBeGreaterThan(-0.05);

  // --- 2. Метрики: никаких NaN ----------------------------------------------
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "number") expect(Number.isFinite(v), `${who}: метрика ${k} = ${v}`).toBe(true);
  }

  const ref = r.planes[r.referencePlaneIndex];

  // --- 3. Ширина луча совпадает с самой диаграммой ---------------------------
  if (m.hpbwDeg != null) {
    const w = widthFromPoints(ref);
    expect(w, `${who}: ширина по точкам не определяется, а в метриках есть`).not.toBeNull();
    expect(m.hpbwDeg, `${who}: hpbwDeg ≠ ширине по точкам ДН`).toBeCloseTo(w!, 0);
  }
  if (m.hpbwEDeg != null) expect(m.hpbwEDeg, who).toBeCloseTo(widthFromPoints(r.planes[0])!, 0);
  if (m.hpbwHDeg != null && r.planes[1]) expect(m.hpbwHDeg, who).toBeCloseTo(widthFromPoints(r.planes[1])!, 0);

  // --- 4. F/B и задний сектор согласованы с диаграммой -----------------------
  const pk = peakAngle(ref);
  if (m.frontToBackDb != null) {
    const fb = levelAt(ref, pk) - levelAt(ref, pk + 180);
    // A drawing may truncate the rear null at floorDb; physical F/B must not be
    // truncated by a display preference. Compare exactly only above that floor.
    if (levelAt(ref, pk + 180) > floorDb + 1e-9) {
      expect(m.frontToBackDb, `${who}: F/B ≠ уровню на 180° от максимума`).toBeCloseTo(fb, 6);
    } else {
      expect(m.frontToBackDb, `${who}: физическое F/B ниже отсечённого рисунка`).toBeGreaterThanOrEqual(fb - 1e-9);
    }
  }
  if (m.rearSectorDb != null && m.frontToBackDb != null) {
    // Худший случай в секторе ±60° не может быть глубже точки строго на 180°.
    expect(m.rearSectorDb, `${who}: задний сектор глубже, чем точка 180°`).toBeLessThanOrEqual(m.frontToBackDb + 1e-9);
  }

  // --- 5. КСВ, рассогласование и импеданс ------------------------------------
  if (m.impedanceR != null && m.impedanceX != null) {
    expect(m.impedanceR, `${who}: у пассивной антенны R > 0`).toBeGreaterThan(0);
    if (m.swr50 != null) {
      expect(m.swr50, `${who}: КСВ ≠ пересчёту из Z`).toBeCloseTo(swrOfRX(m.impedanceR, m.impedanceX), 6);
      expect(m.swr50, `${who}: КСВ < 1`).toBeGreaterThanOrEqual(1);
    }
  }
  if (m.swr50 != null && m.mismatchDb != null) {
    const g = (m.swr50 - 1) / (m.swr50 + 1);
    expect(m.mismatchDb, `${who}: потери на рассогласовании ≠ −10lg(1−Γ²)`)
      .toBeCloseTo(-10 * Math.log10(1 - g * g), 6);
  }

  // --- 6. КУ = КНД + 10lg(КПД) ----------------------------------------------
  if (m.gainDbi != null && m.directivityDbi != null) {
    const eta = m.efficiency ?? 1;
    expect(m.gainDbi, `${who}: КУ ≠ КНД + 10lg(КПД)`).toBeCloseTo(m.directivityDbi + 10 * Math.log10(eta), 6);
    expect(m.gainDbi, `${who}: КУ больше КНД`).toBeLessThanOrEqual(m.directivityDbi + 1e-9);
  }
  if (m.efficiency != null) {
    expect(m.efficiency, who).toBeGreaterThan(0);
    expect(m.efficiency, who).toBeLessThanOrEqual(1 + 1e-12);
  }
  // КИП раскрыва — это НЕ КПД: он уже учтён в КНД и не должен вычитаться второй раз.
  if (m.apertureEff != null) {
    expect(m.apertureEff, who).toBeGreaterThan(0);
    expect(m.apertureEff, who).toBeLessThanOrEqual(1 + 1e-12);
    expect(m.efficiency, `${who}: КИП попал в поле КПД`).toBeUndefined();
  }

  // --- 7. Сходимость метода моментов ----------------------------------------
  if (m.avgGain != null) {
    expect(m.avgGain, `${who}: баланс энергии нарушен`).toBeGreaterThan(0.97);
    expect(m.avgGain, `${who}: баланс энергии нарушен`).toBeLessThan(1.03);
  }

  // --- 8. Свип по частоте и полоса ------------------------------------------
  if (m.sweep && m.sweep.length) {
    for (let i = 0; i < m.sweep.length; i++) {
      const s = m.sweep[i];
      expect(Number.isFinite(s.freqMHz) && s.freqMHz > 0, `${who}: частота свипа`).toBe(true);
      expect(Number.isFinite(s.swr) && s.swr >= 1, `${who}: КСВ свипа ${s.swr}`).toBe(true);
      if (i > 0) expect(s.freqMHz, `${who}: свип не упорядочен по частоте`).toBeGreaterThan(m.sweep[i - 1].freqMHz);
    }
    if (m.swrMin != null) {
      const mn = Math.min(...m.sweep.map((s) => s.swr));
      expect(m.swrMin, `${who}: swrMin ≠ минимуму свипа`).toBeLessThanOrEqual(mn + 1e-6);
    }
  }
  if (m.bandLowMHz != null && m.bandHighMHz != null) {
    expect(m.bandHighMHz, `${who}: границы полосы перепутаны`).toBeGreaterThan(m.bandLowMHz);
  }

  // --- 9. Примечания — строки без пустышек ----------------------------------
  for (const n of r.notes) expect(typeof n === "string" && n.trim().length > 0, `${who}: пустое примечание`).toBe(true);
}

describe("приёмочная матрица: поверочный расчёт всех типов на заводских значениях", () => {
  for (const a of ANTENNAS) {
    it(`${a.id} — ДН, метрики и их взаимная согласованность`, () => {
      const v = defaultsOf(a.analysis.fields);
      const r = run(a, v);
      checkResult(a, r, Number(v.floorDb ?? -40), "по умолчанию");

      // Направление главного луча — там, где ему положено быть по геометрии.
      const pk = peakAngle(r.planes[r.referencePlaneIndex]);
      const want = EXPECTED_PEAK[a.id];
      const dev = Math.abs(((pk - want + 540) % 360) - 180);
      expect(dev, `${a.id}: главный луч на ${pk}°, ожидался ${want}°`).toBeLessThanOrEqual(3);

      // КНД в физически осмысленных пределах для этого типа.
      const [lo, hi] = D_RANGE[a.id];
      expect(r.metrics.directivityDbi, `${a.id}: КНД вне разумных пределов`).not.toBeNull();
      expect(r.metrics.directivityDbi!, `${a.id}: КНД ${r.metrics.directivityDbi} вне [${lo};${hi}] дБи`).toBeGreaterThanOrEqual(lo);
      expect(r.metrics.directivityDbi!, `${a.id}: КНД ${r.metrics.directivityDbi} вне [${lo};${hi}] дБи`).toBeLessThanOrEqual(hi);
    });
  }
});

describe("приёмочная матрица: проектирование → поверочный расчёт на трёх частотах", () => {
  // Коэффициенты к заводской частоте: низ, номинал, верх рабочего диапазона типа.
  const SCALES = [0.6, 1, 1.7];
  for (const a of ANTENNAS) {
    if (!a.synthesis) continue;
    it(`${a.id} — синтез на трёх частотах даёт считаемую и согласованную антенну`, () => {
      const sBase = defaultsOf(a.synthesis!.fields);
      for (const k of SCALES) {
        // У ЛПА частота задаётся парой границ, у остальных — одним полем.
        const sv: FieldValues = { ...sBase };
        if ("freqMHz" in sv) sv.freqMHz = Math.round(Number(sBase.freqMHz) * k);
        if ("freqLowMHz" in sv) sv.freqLowMHz = Math.round(Number(sBase.freqLowMHz) * k);
        if ("freqHighMHz" in sv) sv.freqHighMHz = Math.round(Number(sBase.freqHighMHz) * k);

        const g = sanitize(a.synthesis!.fields, sv);
        expect(g.errors, `${a.id} ×${k}: синтез не принял ввод`).toEqual([]);
        const d = a.synthesis!.design(g.values);
        if (d.rows.length === 0) {
          // Обоснованный отказ (например, Moxon вне области годности полиномов Cebik):
          // это штатное поведение, но оно ОБЯЗАНО быть объяснено предупреждением
          // и не должно отдавать «полурассчитанную» геометрию в поверочный расчёт.
          expect(d.notes.some((n) => n.startsWith("⚠")), `${a.id} ×${k}: пустая таблица без объяснения`).toBe(true);
          expect(Object.keys(d.analysisValues).length, `${a.id} ×${k}: отказ, но геометрия всё же выдана`).toBe(0);
          continue;
        }
        for (const row of d.rows) expect(row.value, `${a.id} ×${k}: пустое значение «${row.label}»`).not.toBe("");
        // Ни одно число в таблице не должно оказаться NaN/Infinity.
        for (const row of d.rows) expect(row.value.includes("NaN"), `${a.id} ×${k}: NaN в «${row.label}»`).toBe(false);

        const r = run(a, d.analysisValues);
        checkResult(a, r, Number(d.analysisValues.floorDb ?? -40), `синтез ×${k}`);
      }
    });
  }
});

describe("приёмочная матрица: расчёт устойчив к отстройке по частоте", () => {
  // Геометрия фиксирована, частота уходит на ±30 % — антенна расстроена, но расчёт
  // обязан оставаться корректным: без NaN, с нормированной ДН и целым набором метрик.
  for (const a of ANTENNAS) {
    it(`${a.id} — ±30 % по частоте при неизменных размерах`, () => {
      const base = defaultsOf(a.analysis.fields);
      for (const k of [0.7, 1.3]) {
        const v: FieldValues = { ...base, freqMHz: Math.round(Number(base.freqMHz) * k) };
        const r = run(a, v);
        checkResult(a, r, Number(v.floorDb ?? -40), `f ×${k}`);
      }
    });
  }
});

describe("сечения ДН по углам: сверка обеих плоскостей яги с NEC-2", () => {
  // Эталон получен в NEC-2 (nec2c) на геометрии реальной 180-яги ИРТ: две карты RP —
  // плоскость через элементы (наша E, «азимут») и плоскость через бум поперёк элементов
  // (наша H, «угол места»). Уровни нормированы на максимум по обеим картам.
  //
  // Смысл теста — не усиление (оно проверено отдельно), а ДОГОВОРЁННОСТЬ ОБ УГЛАХ:
  // что точка нашей диаграммы с подписью «135°» показывает уровень именно в том
  // направлении, где NEC-2 видит этот же уровень. Ошибка в отображении угла
  // (зеркало, сдвиг, повтор полусферы) сразу ломает этот тест.
  const E: [number, number][] = [
    [0, 0.0], [15, -1.17], [30, -5.24], [45, -15.05], [60, -27.36], [75, -25.29],
    [105, -33.64], [120, -22.1], [135, -20.91], [150, -27.92], [165, -24.51], [180, -20.89],
    [195, -24.51], [210, -27.92], [225, -20.91], [240, -22.1], [255, -33.64], [285, -25.29],
    [300, -27.36], [315, -15.05], [330, -5.24], [345, -1.17],
  ];
  const H: [number, number][] = [
    [0, 0.0], [15, -0.76], [30, -3.61], [45, -11.49], [60, -18.87], [75, -11.47], [90, -16.33],
    [105, -19.29], [120, -14.51], [135, -16.9], [150, -26.0], [165, -24.07], [180, -20.89],
    [195, -24.07], [210, -26.0], [225, -16.9], [240, -14.51], [255, -19.29], [270, -16.33],
    [285, -11.47], [300, -18.87], [315, -11.49], [330, -3.61], [345, -0.76],
  ];

  it("яги 180 МГц: обе плоскости совпадают с NEC-2 в пределах 0.5 дБ по всем углам", () => {
    const a = ANTENNAS.find((x) => x.id === "yagi")!;
    const v = { ...defaultsOf(a.analysis.fields), floorDb: -80 };
    const r = run(a, v);
    for (const [plane, ref, label] of [[0, E, "E (азимут)"], [1, H, "H (угол места)"]] as const) {
      const pts = r.planes[plane].points;
      for (const [ang, want] of ref) {
        expect(pts[ang].angleDeg, `${label}: сбилась нумерация углов`).toBe(ang);
        // Допуск 0.5 дБ: на крутых склонах у нулей ДН сетка NEC (41 сегмент) и наша
        // (сгущение к кончикам) дают разную дискретизацию — это не расхождение физики.
        expect(Math.abs(pts[ang].valueDb - want), `${label}: угол ${ang}° — NEC ${want} дБ, у нас ${pts[ang].valueDb.toFixed(2)} дБ`)
          .toBeLessThanOrEqual(0.5);
      }
    }
  });
});
