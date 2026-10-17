import { withDisplayFloor } from "./display";
// Линейная эквидистантная решётка изотропных элементов вдоль оси.
// Множитель решётки:  AF(ψ) = sin(Nψ/2) / (N·sin(ψ/2)),  ψ = k·d·cosθ + β.
// θ — угол от оси решётки. Даёт корректные HPBW/УБЛ/F-B для демонстрации метрик.

import { C0, type PatternResult, type PatternPoint } from "./types";
import {
  DEG,
  EPS,
  toDb,
  directivityAxisymmetric,
  halfPowerBeamwidth,
  sideLobeLevel,
  frontToBack,
  rearSectorDb,
} from "./mathutil";

export interface ArrayInput {
  freqMHz: number;
  /** Число элементов N. */
  count: number;
  /** Шаг решётки d, мм. */
  spacingMm: number;
  /** Прогрессивный фазовый сдвиг β между элементами, град. */
  phaseDeg: number;
  floorDb: number;
}

function arrayFactor(thetaRad: number, N: number, kd: number, betaRad: number): number {
  const psi = kd * Math.cos(thetaRad) + betaRad;
  const denom = Math.sin(psi / 2);
  if (Math.abs(denom) < EPS) return 1; // предел = 1 (главный максимум)
  return Math.abs(Math.sin((N * psi) / 2) / (N * denom));
}

function computeArrayModel(inp: ArrayInput): PatternResult {
  const notes: string[] = [];
  const N = Math.max(1, Math.round(inp.count));
  const f = inp.freqMHz;
  const lambdaMm = (C0 / (f * 1e6)) * 1000;
  const kd = ((2 * Math.PI) / lambdaMm) * inp.spacingMm;
  const betaRad = inp.phaseDeg * DEG;

  let fmax = 0;
  for (let d = 0; d <= 360; d++) {
    const v = arrayFactor(d * DEG, N, kd, betaRad);
    if (v > fmax) fmax = v;
  }
  if (fmax < EPS) fmax = 1;

  const plane: PatternPoint[] = [];
  for (let a = 0; a < 360; a += 1) {
    const v = arrayFactor(a * DEG, N, kd, betaRad) / fmax;
    plane.push({ angleDeg: a, valueDb: toDb(v * v, inp.floorDb) });
  }

  const D = directivityAxisymmetric((th) => {
    const v = arrayFactor(th, N, kd, betaRad) / fmax;
    return v * v;
  });
  const directivityDbi = D > EPS ? 10 * Math.log10(D) : 0;

  if (inp.spacingMm / lambdaMm >= 1)
    notes.push(
      `d/λ = ${(inp.spacingMm / lambdaMm).toFixed(2)} ≥ 1 — возможны дифракционные (grating) лепестки.`,
    );

  notes.push(
    "Отсчёт углов: 0° — вдоль оси решётки (торец), 90° — по нормали к ней (поперёк). При нулевом " +
    "фазовом сдвиге главный луч поперечный и приходится на 90°; фазировка уводит его к 0°/180° " +
    "(осевой режим) — на диаграмме это видно сразу.",
  );
  notes.push(
    "Это ЧИСТЫЙ множитель решётки: элементы приняты изотропными. КНД, ширина луча и УБЛ " +
    "относятся именно к нему — реальные излучатели добавят свою направленность, и полное " +
    "усиление будет выше примерно на КНД одного элемента.",
  );
  notes.push(
    "Импеданс, КСВ и поляризация здесь НЕ приводятся принципиально: они задаются типом " +
    "излучателя и схемой его питания, а не геометрией решётки. Взаимная связь между соседними " +
    "элементами вдобавок меняет импеданс каждого. Чтобы получить эти величины, считайте " +
    "конкретный элемент (например, вкладка «Диполь») и учитывайте делитель мощности.",
  );

  return {
    antennaKind: "array",
    title: `Диаграмма направленности решётки ${N}× · ${f} МГц`,
    planes: [{ label: "Плоскость оси решётки", points: plane }],
    referencePlaneIndex: 0,
    metrics: {
      freqMHz: f,
      lambdaMm,
      directivityDbi,
      hpbwDeg: halfPowerBeamwidth(plane),
      sllDb: sideLobeLevel(plane),
      frontToBackDb: frontToBack(plane),
      rearSectorDb: rearSectorDb(plane),
      // Множитель решётки сам по себе не имеет потерь, поэтому КУ = КНД (без учёта элемента).
      gainDbi: directivityDbi,
      polarization: "Определяется типом излучателя (решётка её не задаёт)",
      hpbwEDeg: halfPowerBeamwidth(plane),
      hpbwHDeg: null,
      hpbwELabel: "в плоскости оси решётки",
      hpbwHLabel: "поперёк — зависит от элемента",
    },
    notes,
  };
}

export function computeArray(inp: ArrayInput): PatternResult {
  return withDisplayFloor(inp, computeArrayModel);
}
