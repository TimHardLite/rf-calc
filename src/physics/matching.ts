// Согласующие устройства: что поставить между антенной и 50-омным кабелем.
//
// ЗАЧЕМ ЭТО НУЖНО ИМЕННО ЗДЕСЬ. У длинной яги «родное» сопротивление активного
// элемента 20…30 Ом — это физика, а не дефект расчёта. Вытянуть его к 50 Ом ОДНИМИ
// ДЛИНАМИ можно, но за это платят усилением и задним излучением (проверено на
// 9-элементной 868 МГц: КСВ 2.70 → 1.11 ценой 0.95 дБ усиления). Поэтому, когда
// оптимизатор упирается в это ограничение, он показывает вторую дорогу: оставить
// геометрию максимального усиления и поставить согласующее устройство.
//
// Реализованы три классических варианта:
//   1. Г-звено (hairpin / шлейф): два реактивных элемента, точное согласование любой
//      нагрузки с R ≠ 0. В яги роль последовательной реактивности обычно играет сам
//      укороченный активный элемент, а параллельной — «шпилька» (hairpin).
//   2. Четвертьволновый трансформатор: отрезок линии Zт = √(Z0·R) — годится, когда
//      нагрузка активная (|X| мало); в UHF-яги это отрезок кабеля (приём DK7ZB).
//   3. Петлевой вибратор (folded dipole): поднимает сопротивление ровно в 4 раза.
//
// Все формулы — классическая теория цепей (Pozar, «Microwave Engineering», гл. 5).

export interface LMatchSolution {
  /** Последовательная реактивность со стороны антенны, Ом (+ индуктивность, − ёмкость). */
  seriesX: number;
  /** Параллельная реактивность со стороны кабеля, Ом. */
  shuntX: number;
  /** Номиналы на рабочей частоте: последовательный элемент. */
  seriesLnH?: number;
  seriesCpF?: number;
  /** Номиналы: параллельный элемент. */
  shuntLnH?: number;
  shuntCpF?: number;
  /** true — параллельный элемент стоит У АНТЕННЫ, последовательный ближе к кабелю
   *  (так согласуют нагрузку с R > z0); false/undefined — наоборот. */
  shuntAtLoad?: boolean;
}

const toL = (X: number, fHz: number) => (X > 0 ? (X / (2 * Math.PI * fHz)) * 1e9 : undefined);
const toC = (X: number, fHz: number) => (X < 0 ? (1 / (2 * Math.PI * fHz * -X)) * 1e12 : undefined);

/**
 * Г-звено для согласования нагрузки R + jX с трактом z0. Возвращает оба решения
 * (реактивности противоположных знаков) — годным считается то, что проще собрать.
 * Схема: последовательная реактивность у антенны, параллельная — у кабеля.
 */
export function lMatch(R: number, X: number, z0: number, fMHz: number): LMatchSolution[] {
  if (!(R > 0) || !(z0 > 0)) return [];
  const fHz = fMHz * 1e6;
  const out: LMatchSolution[] = [];
  if (R < z0) {
    // Последовательный элемент доводит вещественную часть, параллельный — компенсирует.
    const disc = R * (z0 - R);
    if (disc < 0) return [];
    for (const sign of [1, -1]) {
      const Xs = -X + sign * Math.sqrt(disc);
      // После последовательной реактивности получаем R + j·sign·√(R(z0−R));
      // параллельный элемент с реактивностью Xp обнуляет остаток.
      const Xp = -sign * (z0 * Math.sqrt(R / (z0 - R)));
      out.push({
        seriesX: Xs, shuntX: Xp,
        seriesLnH: toL(Xs, fHz), seriesCpF: toC(Xs, fHz),
        shuntLnH: toL(Xp, fHz), shuntCpF: toC(Xp, fHz),
      });
    }
  } else {
    // R > z0 (Pozar, «Microwave Engineering», 5.1, случай R_L > Z0): сначала
    // ПАРАЛЛЕЛЬНАЯ восприимчивость B у нагрузки, затем ПОСЛЕДОВАТЕЛЬНАЯ реактивность.
    const den = R * R + X * X;
    const rad = (R / z0) * (den - z0 * R);
    if (rad < 0) return [];
    for (const sign of [1, -1]) {
      const B = (X + sign * Math.sqrt(rad)) / den;
      if (!Number.isFinite(B) || B === 0) continue;
      const Xs = 1 / B + (X * z0) / R - z0 / (B * R);
      const Xp = -1 / B; // реактивность параллельного элемента (Y = 1/(jXp) = jB → Xp = −1/B)
      out.push({
        seriesX: Xs, shuntX: Xp,
        seriesLnH: toL(Xs, fHz), seriesCpF: toC(Xs, fHz),
        shuntLnH: toL(Xp, fHz), shuntCpF: toC(Xp, fHz),
        shuntAtLoad: true,
      });
    }
  }
  return out;
}

/** Четвертьволновый трансформатор: волновое сопротивление отрезка, Ом. */
export function quarterWaveZ(R: number, z0: number): number | null {
  return R > 0 && z0 > 0 ? Math.sqrt(R * z0) : null;
}

/**
 * Текстовая рекомендация по согласованию для антенны с импедансом R + jX.
 * Возвращает готовые строки для примечаний (уже с номиналами и размерами).
 */
export function matchingAdvice(R: number, X: number, z0: number, fMHz: number): string[] {
  const out: string[] = [];
  if (!(R > 0)) return out;
  const swr = (() => {
    const g = Math.hypot(R - z0, X) / Math.hypot(R + z0, X);
    return (1 + g) / (1 - g);
  })();
  if (swr <= 1.15) return out;

  const qz = quarterWaveZ(R, z0);
  if (qz && Math.abs(X) < 0.15 * R) {
    out.push(
      `Согласование без потери усиления: четвертьволновый трансформатор с волновым ` +
      `сопротивлением ${qz.toFixed(0)} Ом (при |X| мал это ровно √(${z0}·${R.toFixed(0)})). ` +
      `На УКВ его делают отрезком кабеля λ/4 с учётом коэффициента укорочения кабеля.`,
    );
  }
  const sols = lMatch(R, X, z0, fMHz).filter((s) => Number.isFinite(s.shuntX));
  if (sols.length) {
    const s = sols[0];
    const fmt = (Xv: number, L?: number, C?: number) =>
      L != null ? `индуктивность ${L.toFixed(1)} нГн (X = +${Xv.toFixed(1)} Ом)`
                : `ёмкость ${C?.toFixed(1)} пФ (X = ${Xv.toFixed(1)} Ом)`;
    out.push(
      `Г-звено: ${s.shuntAtLoad ? "последовательно в линию" : "последовательно с антенной"} — ${fmt(s.seriesX, s.seriesLnH, s.seriesCpF)}, ` +
      `${s.shuntAtLoad ? "параллельно антенне" : "параллельно кабелю"} — ${fmt(s.shuntX, s.shuntLnH, s.shuntCpF)}. ` +
      `В яги последовательную реактивность обычно получают, укоротив активный элемент, ` +
      `а параллельную делают «шпилькой» (hairpin) из того же прутка.`,
    );
  }
  if (R < 0.4 * z0) {
    out.push(
      `Ещё вариант — петлевой вибратор (folded dipole) вместо прямого: он поднимает ` +
      `сопротивление ровно вчетверо, ${R.toFixed(0)} → ${(4 * R).toFixed(0)} Ом, форма ДН при этом не меняется.`,
    );
  }
  return out;
}
