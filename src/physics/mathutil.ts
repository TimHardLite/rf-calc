// Численные утилиты: нормировка, метрики ДН, интеграл директивности.

import type { PatternPoint } from "./types";

export const DEG = Math.PI / 180;
export const EPS = 1e-9;

/** sinc без деления на ноль: sin(x)/x, =1 при x→0. */
export function sinc(x: number): number {
  if (Math.abs(x) < EPS) return 1;
  return Math.sin(x) / x;
}

/**
 * Уровень в дБ относительно максимума, с обрезкой по нижнему пределу шкалы.
 *
 * Про «чуть больше нуля». Нормировка ведётся на максимум по сфере Umax, а его
 * решатель ищет по своей угловой сетке. Точка сечения может попасть чуть точнее
 * в максимум, чем узел сетки, и тогда отношение выходит 1.000x — то есть +0.005 дБ.
 * Это шум дискретизации, а не излучение сверх максимума, поэтому такие значения
 * прижимаются к 0 дБ. Превышение больше NORM_TOL не прячется: это уже признак
 * настоящей ошибки нормировки, и его должно быть видно.
 */
export const NORM_TOL_DB = 0.05;

export function toDb(power: number, floorDb: number): number {
  if (!(power > 0)) return floorDb;
  const db = 10 * Math.log10(power);
  if (db > 0) return db <= NORM_TOL_DB ? 0 : db;
  return db < floorDb ? floorDb : db;
}

/**
 * Директивность осесимметричной ДН (не зависящей от φ), заданной
 * функцией нормированной МОЩНОСТИ U(θ), θ в радианах [0..π].
 * D = 4π·Umax / ∫∫ U dΩ = 2·Umax / ∫ U(θ)·sinθ dθ.
 * Интеграл — методом трапеций.
 */
export function directivityAxisymmetric(
  powerOfTheta: (thetaRad: number) => number,
  steps = 1800,
): number {
  let integral = 0;
  let umax = 0;
  let prev = 0;
  const dTheta = Math.PI / steps;
  for (let i = 0; i <= steps; i++) {
    const theta = i * dTheta;
    const u = Math.max(0, powerOfTheta(theta));
    if (u > umax) umax = u;
    const f = u * Math.sin(theta);
    if (i > 0) integral += ((prev + f) / 2) * dTheta;
    prev = f;
  }
  if (integral < EPS || umax < EPS) return 0;
  return (2 * umax) / integral;
}

/**
 * Директивность для ДН, зависящей от θ и φ: U(θ,φ), θ∈[0..π], φ∈[0..2π].
 * D = 4π·Umax / ∫∫ U sinθ dθ dφ. Двойная трапеция.
 */
export function directivityFull(
  power: (thetaRad: number, phiRad: number) => number,
  thetaSteps = 180,
  phiSteps = 360,
): number {
  let integral = 0;
  let umax = 0;
  const dTheta = Math.PI / thetaSteps;
  const dPhi = (2 * Math.PI) / phiSteps;
  for (let i = 0; i <= thetaSteps; i++) {
    const theta = i * dTheta;
    const st = Math.sin(theta);
    const wTheta = i === 0 || i === thetaSteps ? 0.5 : 1;
    for (let j = 0; j <= phiSteps; j++) {
      const phi = j * dPhi;
      const wPhi = j === 0 || j === phiSteps ? 0.5 : 1;
      const u = Math.max(0, power(theta, phi));
      if (u > umax) umax = u;
      integral += u * st * wTheta * wPhi * dTheta * dPhi;
    }
  }
  if (integral < EPS || umax < EPS) return 0;
  return (4 * Math.PI * umax) / integral;
}

/**
 * Ширина главного лепестка по уровню −3 дБ, град.
 *
 * Меряется как СУММА угловых расстояний от максимума до первого пересечения
 * уровня −3 дБ влево и вправо. Именно так определена ширина ДН в ГОСТ и в
 * измерительной практике: два ближайших к максимуму направления половинной
 * мощности, дуга между ними через максимум.
 *
 * ВНИМАНИЕ (исправлено в v2). Раньше ширина считалась как |aUp − aDown| по
 * абсолютным углам с «нормировкой» width > 180 → 360 − width. Для узких лепестков
 * это давало тот же ответ, но для широких (расстроенная антенна, сечение угла места
 * с широким лепестком) — зеркально неверный: например, при пересечениях на +132.5°
 * и −132.5° истинная ширина 265°, а формула возвращала 95°. Теперь складываются
 * расстояния, поэтому результат верен при любой ширине лепестка.
 *
 * null — уровень −3 дБ не пересекается вовсе (всенаправленное сечение).
 */
export function halfPowerBeamwidth(points: PatternPoint[]): number | null {
  const n = points.length;
  if (n < 3) return null;
  let imax = 0;
  for (let i = 1; i < n; i++) if (points[i].valueDb > points[imax].valueDb) imax = i;
  const target = points[imax].valueDb - 3;

  /** Угловое расстояние от максимума до пересечения уровня −3 дБ в заданную сторону. */
  const dist = (dir: 1 | -1): number | null => {
    let acc = 0;
    for (let s = 1; s < n; s++) {
      const i0 = (imax + dir * (s - 1) + n * 4) % n;
      const i1 = (imax + dir * s + n * 4) % n;
      let da = points[i1].angleDeg - points[i0].angleDeg;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      const step = Math.abs(da);
      const v0 = points[i0].valueDb, v1 = points[i1].valueDb;
      if ((v0 - target) * (v1 - target) <= 0 && v0 !== v1) {
        return acc + ((target - v0) / (v1 - v0)) * step;
      }
      acc += step;
    }
    return null;
  };

  const up = dist(1), down = dist(-1);
  if (up === null || down === null) return null;
  return Math.min(up + down, 360);
}

/**
 * Предупреждение по self-check сходимости (методика NEC2 «average gain»).
 * Средний КНД по полной сфере для антенны без потерь в свободном пространстве = 1.000.
 * Возвращает текст примечания, только если отклонение существенно (>10%).
 */
export function convergenceNote(avgGain: number | undefined): string | null {
  if (avgGain === undefined) return null;
  if (!Number.isFinite(avgGain)) {
    return (
      "⚠ Баланс энергии (self-check сходимости) посчитать не удалось — решение на этой " +
      "геометрии вырождено. Численные результаты недостоверны, проверьте размеры и диаметры."
    );
  }
  const devPct = Math.abs(avgGain - 1) * 100;
  if (devPct <= 10) return null;
  return (
    `⚠ Сходимость модели ${avgGain.toFixed(3)} при идеале 1.000 (отклонение ${devPct.toFixed(0)}%). ` +
    `Это признак недостаточной сегментации или геометрии на пределе применимости тонкопроволочной ` +
    `модели — результат считать ориентировочным.`
  );
}

/** Уровень первого бокового лепестка относительно главного, дБ (обычно <0). */
export function sideLobeLevel(points: PatternPoint[]): number | null {
  const n = points.length;
  if (n < 5) return null;
  let imax = 0;
  for (let i = 1; i < n; i++) if (points[i].valueDb > points[imax].valueDb) imax = i;
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i].valueDb;
    const a = points[(i - 1 + n) % n].valueDb;
    const b = points[(i + 1) % n].valueDb;
    if (p >= a && p >= b && i !== imax) peaks.push(p);
  }
  const mainMax = points[imax].valueDb;
  // Исключаем со-главные лепестки (двунаправленные ДН): пики в пределах 0.5 дБ от главного.
  const trueSide = peaks.filter((p) => p < mainMax - 0.5);
  if (!trueSide.length) return null;
  const maxSide = Math.max(...trueSide);
  return maxSide - mainMax;
}

/** F/B: максимум минус уровень в направлении, противоположном максимуму. */
export function frontToBack(points: PatternPoint[]): number | null {
  const n = points.length;
  if (n < 3) return null;
  let imax = 0;
  for (let i = 1; i < n; i++) if (points[i].valueDb > points[imax].valueDb) imax = i;
  const backAngle = (points[imax].angleDeg + 180) % 360;
  // ближайшая точка к обратному направлению
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < n; i++) {
    let d = Math.abs(((points[i].angleDeg - backAngle + 540) % 360) - 180);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return points[imax].valueDb - points[best].valueDb;
}

/**
 * Заднее излучение по СЕКТОРУ: максимум минус наибольший уровень в секторе
 * ±halfSectorDeg вокруг направления, противоположного главному лепестку.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ frontToBack: уровень строго на 180° часто попадает в провал между
 * задними лепестками и потому численно неустойчив — прямое сравнение с NEC2 на яги ИРТ
 * дало расхождение 3 дБ на 180.0° при совпадении 0.4 дБ по максимуму заднего сектора.
 * Для паспорта нормируют именно худший случай в заднем секторе, а не глубину случайного нуля.
 */
export function rearSectorDb(points: PatternPoint[], halfSectorDeg = 60): number | null {
  const n = points.length;
  if (n < 3) return null;
  let imax = 0;
  for (let i = 1; i < n; i++) if (points[i].valueDb > points[imax].valueDb) imax = i;
  const backAngle = (points[imax].angleDeg + 180) % 360;
  let worst = -Infinity;
  for (const p of points) {
    const d = Math.abs(((p.angleDeg - backAngle + 540) % 360) - 180);
    if (d <= halfSectorDeg && p.valueDb > worst) worst = p.valueDb;
  }
  if (!Number.isFinite(worst)) return null;
  return points[imax].valueDb - worst;
}

/**
 * Сечение в вертикальной плоскости (H-плоскость «угол места») для антенн,
 * у которых главный луч направлен вдоль +X: яги, ЛПА, Moxon.
 *
 * ЕДИНАЯ ДОГОВОРЁННОСТЬ ОБ УГЛАХ (важно для паспорта — на круговой диаграмме
 * оба сечения должны читаться одинаково):
 *   0°   — вперёд, по главному лучу (вверх на диаграмме);
 *   90°  — зенит (+Z);
 *   180° — назад;
 *   270° — надир (−Z).
 * Раньше яги и ЛПА выводили сюда сферический угол θ (0° = зенит), из-за чего
 * главный луч на диаграмме угла места оказывался сбоку, а на диаграмме азимута —
 * сверху: два сечения одной антенны выглядели несогласованно.
 *
 * @param powerAt функция мощности излучения U(θ°, φ°) из решателя
 * @param Umax    нормировка (максимум по сфере)
 * @param floorDb нижний предел шкалы
 * @param beamAxisX +1 — главный луч вдоль +X (яги, ЛПА); −1 — вдоль −X (Moxon)
 */
export function elevationCutXZ(
  powerAt: (thetaDeg: number, phiDeg: number) => number,
  Umax: number,
  floorDb: number,
  beamAxisX: 1 | -1 = 1,
  stepDeg = 1,
): PatternPoint[] {
  const pts: PatternPoint[] = [];
  for (let a = 0; a < 360; a += stepDeg) {
    const ar = a * DEG;
    const dx = beamAxisX * Math.cos(ar), dz = Math.sin(ar);
    const theta = (Math.acos(Math.max(-1, Math.min(1, dz))) * 180) / Math.PI;
    const phi = dx < 0 ? 180 : 0;
    pts.push({ angleDeg: a, valueDb: toDb(powerAt(theta, phi) / Umax, floorDb) });
  }
  return pts;
}

/**
 * Финальная чистка таблицы метрик: ни одно число, уходящее в интерфейс, паспорт
 * и файл проекта, не может быть NaN или ±∞.
 *
 * ЗАЧЕМ. На вырожденной геометрии (диаметр больше антенны, частота 1 МГц при
 * размерах на 900 МГц) модель может дать NaN или бесконечность в отдельной
 * величине — например, потери на рассогласовании при R → 0. Показать такое
 * пользователю нельзя: «NaN дБ» в паспорте выглядит как поломка программы, а
 * бесконечность не является измеримой величиной. Правило: величина, которую не
 * удалось посчитать, НЕ ПОКАЗЫВАЕТСЯ (поля с типом number|null получают null,
 * необязательные — исчезают), а причина остаётся в примечаниях ⚠.
 *
 * Функция применяется в конце каждого расчёта — это единственная точка, где
 * гарантируется отсутствие NaN в выдаче.
 */
export function cleanMetrics<T extends object>(m: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Поля, у которых по типу разрешён null — там «не посчитано» выражается им.
  const NULLABLE = new Set(["directivityDbi", "hpbwDeg", "sllDb", "frontToBackDb", "rearSectorDb", "axialRatioDb", "hpbwEDeg", "hpbwHDeg", "gainDbi"]);
  const out: Record<string, unknown> = { ...(m as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "number" && !Number.isFinite(v)) out[k] = NULLABLE.has(k) ? null : undefined;
  }
  return out as T;
}
