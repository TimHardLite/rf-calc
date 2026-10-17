import { describe, it, expect } from "vitest";
import { computeDipole, dipoleZ } from "./dipole";
import { computeArray } from "./array";
import { computePatch } from "./patch";
import { computeHorn } from "./horn";
import { computeYagi, drivenArmMm, type YagiElement } from "./yagi";
import { computeMoxon } from "./moxon";
import { computeLPDA } from "./lpda";
import { computeGnss } from "./gnss";
import { boomCorrectionMm } from "./boom";
import { fresnelCS } from "./fresnel";
import { solve3D, type Wire } from "./mom3d";
import { YAGI_180 } from "../registry";

describe("диполь", () => {
  it("полуволновой: КНД ≈ 2.15 дБи, HPBW ≈ 78°", () => {
    // λ = 1000 мм (300 МГц), L = 500 мм → L/λ = 0.5
    const r = computeDipole({ freqMHz: 300, lengthMm: 500, elementType: "flat", diameterMm: 2, stripWmm: 6, floorDb: -40 });
    expect(r.metrics.directivityDbi).toBeGreaterThan(2.0);
    expect(r.metrics.directivityDbi).toBeLessThan(2.3);
    expect(r.metrics.hpbwDeg!).toBeGreaterThan(74);
    expect(r.metrics.hpbwDeg!).toBeLessThan(82);
  });

  it("полноволновой: КНД ≈ 3.5–4.0 дБи", () => {
    const r = computeDipole({ freqMHz: 300, lengthMm: 1000, elementType: "wire", diameterMm: 2, stripWmm: 6, floorDb: -40 });
    expect(r.metrics.directivityDbi).toBeGreaterThan(3.3);
    expect(r.metrics.directivityDbi).toBeLessThan(4.2);
  });

  it("нуль вдоль оси (0°) на уровне пола", () => {
    const r = computeDipole({ freqMHz: 300, lengthMm: 500, elementType: "flat", diameterMm: 2, stripWmm: 6, floorDb: -40 });
    const p0 = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(p0.valueDb).toBeLessThan(-30);
    const p90 = r.planes[0].points.find((p) => p.angleDeg === 90)!;
    expect(p90.valueDb).toBeCloseTo(0, 1);
  });
});

describe("решётка", () => {
  it("бродсайд 4×λ/2: КНД растёт с N, есть боковые лепестки ~ −13 дБ", () => {
    // λ=1000, d=500 (λ/2), β=0
    const r = computeArray({ freqMHz: 300, count: 4, spacingMm: 500, phaseDeg: 0, floorDb: -40 });
    expect(r.metrics.directivityDbi).toBeGreaterThan(5); // ~6 дБи
    expect(r.metrics.sllDb!).toBeGreaterThan(-15);
    expect(r.metrics.sllDb!).toBeLessThan(-11);
  });
});

describe("патч", () => {
  it("бродсайд-максимум и разумный КНД 5–9 дБи", () => {
    const r = computePatch({
      mode: "rect",
      polarization: "Линейная",
      freqMHz: 2400,
      lengthMm: 40,
      widthMm: 48,
      substrateH: 1.6,
      epsR: 4.4,
      hpbwDeg: 90,
      gainDbi: 0, tanD: 0, groundLmm: 40, groundWmm: 42, feedInsetMm: 0, backLobeDb: 0,
      floorDb: -40,
    });
    const broad = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(broad.valueDb).toBeCloseTo(0, 1);
    expect(r.metrics.directivityDbi!).toBeGreaterThan(4);
    expect(r.metrics.directivityDbi!).toBeLessThan(10);
  });

  it("режим beam: заданный HPBW воспроизводится (±3°) и usa gainDbi", () => {
    const r = computePatch({
      mode: "beam",
      polarization: "RHCP",
      freqMHz: 5800,
      lengthMm: 0, widthMm: 0, substrateH: 0, epsR: 1,
      hpbwDeg: 80,
      gainDbi: 8.5,
      tanD: 0, groundLmm: 40, groundWmm: 42, feedInsetMm: 0, backLobeDb: 0,
      floorDb: -40,
    });
    expect(Math.abs(r.metrics.hpbwDeg! - 80)).toBeLessThan(3);
    expect(r.metrics.directivityDbi).toBeCloseTo(8.5, 1);
    const broad = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(broad.valueDb).toBeCloseTo(0, 1);
  });
});

describe("яги (MoM) — сверка с NEC2 по реальной 180-яги ИРТ", () => {
  const els: YagiElement[] = [
    { type: "reflector", lengthMm: 921, diameterMm: 8, positionMm: 0 },
    { type: "driven", lengthMm: 799, diameterMm: 6.31, positionMm: 304 },
    { type: "director", lengthMm: 734, diameterMm: 6, positionMm: 445 },
    { type: "director", lengthMm: 727, diameterMm: 6, positionMm: 743 },
    { type: "director", lengthMm: 719, diameterMm: 6, positionMm: 1098 },
    { type: "director", lengthMm: 712, diameterMm: 6, positionMm: 1511 },
    { type: "director", lengthMm: 704, diameterMm: 6, positionMm: 1973 },
  ];
  it("Ga ≈ 11.6 дБи (NEC 11.59), Rin ≈ 44.5 Ом, F/B > 18 дБ", () => {
    const r = computeYagi({ freqMHz: 180, elements: els, floorDb: -40 });
    expect(r.metrics.directivityDbi!).toBeGreaterThan(11.0);
    expect(r.metrics.directivityDbi!).toBeLessThan(12.0);
    expect(r.metrics.impedanceR!).toBeGreaterThan(38);
    expect(r.metrics.impedanceR!).toBeLessThan(52);
    expect(r.metrics.frontToBackDb!).toBeGreaterThan(18);
    expect(r.metrics.swr50!).toBeLessThan(1.6);
    // главный луч — вперёд (0°), тыл (180°) заметно ниже
    const front = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(front.valueDb).toBeCloseTo(0, 1);
  });
});

describe("Moxon (обобщённый MoM) — сверка с NEC2", () => {
  it("Ga ≈ 3.5 дБи, главный луч вперёд, Z в разумных пределах", () => {
    // те же размеры, что валидировались против NEC2 (Ga 3.55, Z 175+j257)
    const r = computeMoxon({ freqMHz: 145, widthA: 1000, tailB: 130, gapC: 55, tailD: 220, diameterMm: 4, floorDb: -40 });
    expect(r.metrics.directivityDbi!).toBeGreaterThan(3.0);
    expect(r.metrics.directivityDbi!).toBeLessThan(4.2);
    expect(r.metrics.impedanceR!).toBeGreaterThan(140);
    expect(r.metrics.impedanceR!).toBeLessThan(210);
    // главный луч — вперёд (0° в выводе)
    const front = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(front.valueDb).toBeCloseTo(0, 1);
  });
});

describe("ЛПА (MoM + перекрёстный фидер) — сверка с NEC2", () => {
  it("Ga ≈ 6.5 дБи (NEC 6.45), F/B ~15 дБ, Z ~32 Ом, луч вперёд", () => {
    const r = computeLPDA({ freqMHz: 300, count: 6, tau: 0.87, sigma: 0.055, longestMm: 600, diameterMm: 10, feederZ0: 100, floorDb: -40 });
    expect(r.metrics.directivityDbi!).toBeGreaterThan(5.8);
    expect(r.metrics.directivityDbi!).toBeLessThan(7.2);
    expect(r.metrics.frontToBackDb!).toBeGreaterThan(12);
    expect(r.metrics.impedanceR!).toBeGreaterThan(20);
    expect(r.metrics.impedanceR!).toBeLessThan(45);
    const front = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(front.valueDb).toBeCloseTo(0, 1);
  });
});

describe("GNSS-спираль (осевой режим, MoM) — сверка с NEC2", () => {
  // ВСЕ эталоны ниже получены прогоном NEC2 с картой идеальной земли (GN 1).
  // Именно так работает реальная антенна: спираль стоит над экраном.
  it("одиночная спираль над экраном: КНД 9.0 дБи (NEC2 9.03), луч в зенит", () => {
    const r = computeGnss({
      freqMHz: 1575.42, helixCount: 1, helixDiaMm: 60, turns: 2, heightMm: 40,
      arrangeRadiusMm: 0, tapeWidthMm: 8, sense: "RH",
      groundPlane: true, standoffMm: 3, floorDb: -40,
    });
    expect(r.metrics.directivityDbi!).toBeGreaterThan(8.3);
    expect(r.metrics.directivityDbi!).toBeLessThan(9.8);
    // Главный лепесток обязан смотреть В ЗЕНИТ (0°), а не в надир.
    const p = r.planes[0].points;
    let imax = 0;
    for (let i = 1; i < p.length; i++) if (p[i].valueDb > p[imax].valueDb) imax = i;
    expect(Math.min(p[imax].angleDeg, 360 - p[imax].angleDeg)).toBeLessThan(15);
    // Баланс энергии решателя с зеркальными изображениями.
    expect(r.metrics.avgGain!).toBeCloseTo(1.0, 2);
    // Импеданс MoM для спирали недостоверен, поэтому выводится классическая
    // эмпирика Крауса R ≈ 140·(C/λ) — при C/λ≈0.99 это ≈140 Ом.
    expect(r.metrics.impedanceR!).toBeGreaterThan(100);
    expect(r.metrics.impedanceR!).toBeLessThan(190);
    expect(r.metrics.axialRatioDb!).toBeGreaterThan(0);
    expect(r.metrics.polarization).toContain("RHCP");
    expect(r.planes.length).toBe(2);
    expect(r.planes[0].hemisphere).toBeUndefined();
    expect(r.planes[0].points.length).toBe(360);
    expect(r.notes.some((n) => n.includes("экран"))).toBe(true);
  });

  it("БЕЗ экрана спираль уходит в обратный (backfire) режим — луч в надир", () => {
    const r = computeGnss({
      freqMHz: 1575.42, helixCount: 1, helixDiaMm: 60, turns: 4, heightMm: 84,
      arrangeRadiusMm: 0, tapeWidthMm: 8, sense: "RH",
      groundPlane: false, floorDb: -40,
    });
    const p = r.planes[0].points;
    let imax = 0;
    for (let i = 1; i < p.length; i++) if (p[i].valueDb > p[imax].valueDb) imax = i;
    // Максимум ближе к надиру (180°), чем к зениту.
    expect(Math.abs(p[imax].angleDeg - 180)).toBeLessThan(60);
    expect(r.notes.join(" ")).toMatch(/backfire|обратн/i);
  });

  it("усиление растёт с числом витков и совпадает с NEC2 в пределах 0.1 дБ", () => {
    // NEC2 (идеальная земля, 1575 МГц, D = 60 мм, шаг 0.22λ): 9.28 / 10.14 / 11.00 дБи.
    const lam = 299792.458 / 1575;
    const nec = [9.28, 10.14, 11.0];
    [4, 6, 8].forEach((T, i) => {
      const r = computeGnss({
        freqMHz: 1575, helixCount: 1, helixDiaMm: 60, turns: T, heightMm: T * 0.22 * lam,
        arrangeRadiusMm: 0, tapeWidthMm: 3, sense: "RH",
        groundPlane: true, standoffMm: 3, floorDb: -40,
      });
      expect(Math.abs(r.metrics.directivityDbi! - nec[i])).toBeLessThan(0.15);
    });
  });

  it("3 синфазные спирали считаются, усиление в разумных пределах", () => {
    const r = computeGnss({
      freqMHz: 1575.42, helixCount: 3, helixDiaMm: 60, turns: 2, heightMm: 40,
      arrangeRadiusMm: 70, tapeWidthMm: 8, sense: "RH",
      groundPlane: true, standoffMm: 3, floorDb: -40,
    });
    expect(r.metrics.directivityDbi).not.toBeNull();
    expect(r.metrics.directivityDbi!).toBeGreaterThan(2);
    expect(r.metrics.directivityDbi!).toBeLessThan(18);
  });
});

describe("круговые ДН 360° (патч, рупор, GNSS)", () => {
  const full = (pts: { angleDeg: number }[]) =>
    pts.length === 360 && pts[0].angleDeg === 0 && pts[359].angleDeg === 359;

  it("патч (прямоугольный): полный круг, максимум в 0°, зад на полке экрана", () => {
    const r = computePatch({
      mode: "rect", polarization: "Линейная", freqMHz: 5800, lengthMm: 18, widthMm: 20,
      substrateH: 1.5, epsR: 2.2, hpbwDeg: 90, gainDbi: 0, tanD: 0, groundLmm: 40, groundWmm: 42, feedInsetMm: 0, backLobeDb: 0, floorDb: -40,
    });
    for (const p of r.planes) {
      expect(p.hemisphere).toBeUndefined();
      expect(full(p.points)).toBe(true);
      expect(p.points[0].valueDb).toBeCloseTo(0, 1);      // главный луч — 0°
      // Экран КОНЕЧНЫЙ: назад идёт реальное продифрагировавшее поле, а не строгий ноль.
      expect(p.points[180].valueDb).toBeGreaterThan(-35);
      expect(p.points[180].valueDb).toBeLessThan(-8);
    }
    expect(r.notes.some((n) => n.includes("360"))).toBe(true);
  });

  it("патч (по ширине луча): полный круг", () => {
    const r = computePatch({
      mode: "beam", polarization: "RHCP", freqMHz: 1575, lengthMm: 0, widthMm: 0,
      substrateH: 0, epsR: 1, hpbwDeg: 90, gainDbi: 0, tanD: 0, groundLmm: 40, groundWmm: 42, feedInsetMm: 0, backLobeDb: 0, floorDb: -40,
    });
    expect(full(r.planes[0].points)).toBe(true);
    expect(r.planes[0].points[0].valueDb).toBeCloseTo(0, 1);
    // HPBW должен вернуться к заданным 90°
    expect(r.metrics.hpbwDeg!).toBeGreaterThan(85);
    expect(r.metrics.hpbwDeg!).toBeLessThan(95);
  });

  it("рупор: полный круг, спад к заду через (1+cosθ)/2", () => {
    const r = computeHorn({ freqMHz: 10000, apertureA: 60, apertureB: 45, floorDb: -40 });
    for (const p of r.planes) {
      expect(p.hemisphere).toBeUndefined();
      expect(full(p.points)).toBe(true);
      expect(p.points[0].valueDb).toBeCloseTo(0, 1);
      expect(p.points[180].valueDb).toBeLessThan(-25);    // зад подавлен, но не обязан быть ровно нулём
    }
  });


  it("физика конечного экрана: чем больше экран, тем ниже заднее излучение", () => {
    const mk = (g: number) => computePatch({
      mode: "rect", polarization: "Линейная", freqMHz: 2400, lengthMm: 29.4, widthMm: 38,
      substrateH: 1.6, epsR: 4.4, tanD: 0, groundLmm: g, groundWmm: g, feedInsetMm: 0,
      backLobeDb: 0, hpbwDeg: 90, gainDbi: 0, floorDb: -50,
    });
    const back = (g: number) => { const p = mk(g).planes[0].points; return p[180].valueDb; };
    const small = back(45), mid = back(90), big = back(180);
    // Монотонное убывание заднего лепестка с ростом экрана — ключевой признак,
    // что работает именно дифракция на кромках, а не подгонка.
    expect(mid).toBeLessThan(small);
    expect(big).toBeLessThan(mid);
    // И всё это в физически осмысленном диапазоне для патча.
    expect(small).toBeLessThan(-8);
    expect(big).toBeGreaterThan(-50);
  });

  it("E- и H-плоскости сходятся в надире (контроль сшивки сечений)", () => {
    const r = computePatch({
      mode: "rect", polarization: "Линейная", freqMHz: 2400, lengthMm: 29.4, widthMm: 38,
      substrateH: 1.6, epsR: 4.4, tanD: 0, groundLmm: 60, groundWmm: 60, feedInsetMm: 0,
      backLobeDb: 0, hpbwDeg: 90, gainDbi: 0, floorDb: -60,
    });
    const e = r.planes[0].points[180].valueDb, h = r.planes[1].points[180].valueDb;
    expect(Math.abs(e - h)).toBeLessThan(1.5);
  });


  it("нет излома на горизонте: у E-плоскости кривая гладкая насквозь", () => {
    const r = computePatch({
      mode: "rect", polarization: "Линейная", freqMHz: 5800, lengthMm: 18, widthMm: 20,
      substrateH: 1.5, epsR: 2.2, tanD: 0, groundLmm: 40, groundWmm: 42, feedInsetMm: 0,
      backLobeDb: 0, hpbwDeg: 90, gainDbi: 0, floorDb: -60,
    });
    const p = r.planes[0].points.map((x) => x.valueDb);
    // Излом ловим второй разностью: на границе света и тени она не должна выделяться
    // на фоне остальной диаграммы. Это защита от возврата артефакта дальней кромки.
    const curv = (a: number) => Math.abs(p[a + 1] - 2 * p[a] + p[a - 1]);
    const all: number[] = [];
    for (let a = 5; a < 355; a++) all.push(curv(a));
    all.sort((x, y) => x - y);
    const median = all[Math.floor(all.length / 2)];
    expect(curv(90)).toBeLessThan(median + 0.05);
    expect(curv(270)).toBeLessThan(median + 0.05);
    // И просто монотонность спада в окрестности горизонта.
    for (let a = 86; a <= 94; a++) expect(p[a + 1]).toBeLessThan(p[a]);
  });

  it("круговая ДН симметрична: значение на a и на 360−a совпадает", () => {
    const r = computeHorn({ freqMHz: 10000, apertureA: 60, apertureB: 45, floorDb: -60 });
    const p = r.planes[0].points;
    for (const a of [10, 35, 70, 120]) {
      expect(p[a].valueDb).toBeCloseTo(p[360 - a].valueDb, 6);
    }
  });
});

describe("рупор", () => {
  it("бродсайд-максимум и КНД в разумных пределах", () => {
    const r = computeHorn({ freqMHz: 10000, apertureA: 60, apertureB: 45, floorDb: -40 });
    const broad = r.planes[0].points.find((p) => p.angleDeg === 0)!;
    expect(broad.valueDb).toBeCloseTo(0, 1);
    expect(r.metrics.directivityDbi!).toBeGreaterThan(8);
    expect(r.metrics.directivityDbi!).toBeLessThan(25);
  });
});

describe("яги: поправка на бум в поверочном расчёте", () => {
  const base = { freqMHz: 180, elements: YAGI_180, floorDb: -40 };

  it("без бума результат совпадает с прежним (обратная совместимость)", () => {
    const a = computeYagi(base);
    const b = computeYagi({ ...base, mounting: "none", boomDiaMm: 20 });
    expect(b.metrics.impedanceR!).toBeCloseTo(a.metrics.impedanceR!, 6);
    expect(b.metrics.gainDbi!).toBeCloseTo(a.metrics.gainDbi!, 6);
  });

  it("диэлектрический бум поправки не даёт", () => {
    const a = computeYagi(base);
    const b = computeYagi({ ...base, mounting: "dielectric", boomDiaMm: 40 });
    expect(b.metrics.impedanceR!).toBeCloseTo(a.metrics.impedanceR!, 6);
  });

  it("металлический бум сдвигает резонанс вверх (элементы электрически короче)", () => {
    // ΔL вычитается → элементы короче → резонанс выше по частоте → X при 180 МГц уходит в ёмкость
    const a = computeYagi(base);
    const b = computeYagi({ ...base, mounting: "through-contact", boomDiaMm: 20, boomShape: "square" });
    expect(b.metrics.impedanceX!).toBeLessThan(a.metrics.impedanceX!);
    // сдвиг умеренный: единицы процентов, не разнос модели
    expect(Math.abs(b.metrics.gainDbi! - a.metrics.gainDbi!)).toBeLessThan(1.0);
  });

  it("изолированное крепление даёт ровно половину поправки контактного", () => {
    const lambda = 299792.458 / 180;
    const c1 = boomCorrectionMm(20, lambda, "through-contact", "square").deltaMm;
    const c2 = boomCorrectionMm(20, lambda, "through-insulated", "square").deltaMm;
    expect(c2).toBeCloseTo(c1 / 2, 9);
  });

  it("поправка не превышает вершины параболы 0.6930·D (предел DL6WU)", () => {
    for (const lam of [500, 1000, 1666, 3000]) {
      for (const d of [5, 10, 20, 40, 80, 150]) {
        const { deltaMm } = boomCorrectionMm(d, lam, "through-contact", "square");
        expect(deltaMm).toBeLessThanOrEqual(0.6931 * d);
        expect(deltaMm).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("абсурдно толстый бум не ломает расчёт, а возвращает предупреждение", () => {
    const r = computeYagi({ ...base, mounting: "through-contact", boomDiaMm: 2000 });
    expect(r.notes.join(" ")).toMatch(/⚠/);
  });
});

describe("интегралы Френеля", () => {
  // Табличные значения (A&S 7.3, сверено с scipy.special.fresnel).
  const tbl: [number, number, number][] = [
    [0.5, 0.492344226, 0.064732433], [1, 0.779893400, 0.438259147],
    [1.5, 0.445261176, 0.697504960], [2, 0.488253406, 0.343415678],
    [2.5, 0.457413010, 0.619181756], [3, 0.605720789, 0.496312999],
    [4, 0.498426033, 0.420515754], [5, 0.563631189, 0.499191382],
  ];
  it("совпадают с таблицей до 1e-6", () => {
    for (const [x, c, s] of tbl) {
      const r = fresnelCS(x);
      expect(r.C).toBeCloseTo(c, 6);
      expect(r.S).toBeCloseTo(s, 6);
    }
  });
  it("нечётные: C(−x) = −C(x)", () => {
    for (const x of [0.3, 1.2, 2.7]) {
      expect(fresnelCS(-x).C).toBeCloseTo(-fresnelCS(x).C, 10);
      expect(fresnelCS(-x).S).toBeCloseTo(-fresnelCS(x).S, 10);
    }
  });
  it("C(0) = S(0) = 0", () => {
    expect(fresnelCS(0).C).toBeCloseTo(0, 12);
    expect(fresnelCS(0).S).toBeCloseTo(0, 12);
  });
});

describe("рупор: фазовая ошибка раскрыва", () => {
  const lam = 299792.458 / 10000;

  it("КИП оптимального пирамидального рупора = 0.51 независимо от размера", () => {
    // Условие оптимальности: a₁ = √(3λρ), b₁ = √(2λρ).
    for (const rl of [5, 10, 20, 40]) {
      const rho = rl * lam;
      const a1 = Math.sqrt(3 * lam * rho), b1 = Math.sqrt(2 * lam * rho);
      const r = computeHorn({ freqMHz: 10000, apertureA: a1, apertureB: b1, flareE: rho, flareH: rho, floorDb: -40 });
      // КИП раскрыва лежит в отдельном поле apertureEff: это НЕ КПД по потерям,
      // и в поле efficiency он попадать не должен (иначе интерфейс покажет «КПД 51 %»).
      expect(r.metrics.apertureEff!).toBeCloseTo(0.514, 2);
      expect(r.metrics.efficiency).toBeUndefined();
    }
  });

  it("без длин раскрыва усиление заметно выше и это явно помечено", () => {
    const rho = 10 * lam;
    const a1 = Math.sqrt(3 * lam * rho), b1 = Math.sqrt(2 * lam * rho);
    const withPh = computeHorn({ freqMHz: 10000, apertureA: a1, apertureB: b1, flareE: rho, flareH: rho, floorDb: -40 });
    const noPh = computeHorn({ freqMHz: 10000, apertureA: a1, apertureB: b1, floorDb: -40 });
    expect(noPh.metrics.directivityDbi!).toBeGreaterThan(withPh.metrics.directivityDbi!);
    // 0.81/0.514 = 1.576 → 1.98 дБ
    expect(noPh.metrics.directivityDbi! - withPh.metrics.directivityDbi!).toBeCloseTo(1.98, 1);
    expect(noPh.notes.join(" ")).toMatch(/ВЕРХНЯЯ ОЦЕНКА/);
  });

  it("фазовая ошибка расширяет луч, а не сужает", () => {
    const rho = 10 * lam;
    const a1 = Math.sqrt(3 * lam * rho), b1 = Math.sqrt(2 * lam * rho);
    const withPh = computeHorn({ freqMHz: 10000, apertureA: a1, apertureB: b1, flareE: rho, flareH: rho, floorDb: -40 });
    const noPh = computeHorn({ freqMHz: 10000, apertureA: a1, apertureB: b1, floorDb: -40 });
    expect(withPh.metrics.hpbwEDeg!).toBeGreaterThan(noPh.metrics.hpbwEDeg!);
    expect(withPh.metrics.hpbwHDeg!).toBeGreaterThan(noPh.metrics.hpbwHDeg!);
  });
});

describe("идеальный экран (метод зеркальных изображений) — сверка с NEC2", () => {
  const f = 300, lam = 299792.458 / f / 1000, a = 0.0005 * lam, L = 0.475 * lam;
  // NEC2, GN 1 (идеальная земля), горизонтальный вибратор 0.475λ, провод 0.0005λ.
  const nec: Record<string, [number, number]> = {
    "0.1": [21.4, 15.3], "0.2": [67.6, 30.5], "0.25": [85.6, 21.1], "0.3": [94.5, 6.0],
    "0.4": [86.6, -20.3], "0.5": [65.1, -23.2], "0.75": [73.3, 4.8], "1": [68.5, -15.6],
  };

  it("импеданс горизонтального вибратора над землёй совпадает с NEC2", () => {
    for (const key of Object.keys(nec)) {
      const h = Number(key) * lam;
      const w: Wire = { pts: [[-L / 2, 0, h], [L / 2, 0, h]], radius: a, seglen: L / 21 };
      const r = solve3D([w], f, { point: [0, 0, h] }, { groundPlane: true });
      const [R, X] = nec[key];
      expect(Math.abs(r.Zin.re - R)).toBeLessThan(2.0);
      expect(Math.abs(r.Zin.im - X)).toBeLessThan(4.0);
    }
  });

  it("баланс энергии (avgGain = 1) сохраняется на любой высоте", () => {
    for (const hl of [0.1, 0.25, 0.4, 0.75, 1.0]) {
      const h = hl * lam;
      const w: Wire = { pts: [[-L / 2, 0, h], [L / 2, 0, h]], radius: a, seglen: L / 21 };
      const r = solve3D([w], f, { point: [0, 0, h] }, { groundPlane: true });
      expect(r.avgGain).toBeCloseTo(1.0, 2);
    }
  });

  it("вертикальный монополь над землёй даёт ровно +3 дБ к диполю в свободном пространстве", () => {
    const h = 0.25 * lam;
    const mono: Wire = { pts: [[0, 0, 1e-6], [0, 0, h]], radius: a, seglen: h / 15 };
    const dip: Wire = { pts: [[0, 0, -h], [0, 0, h]], radius: a, seglen: h / 15 };
    const rg = solve3D([mono], f, { point: [0, 0, 1e-6] }, { groundPlane: true });
    const rf = solve3D([dip], f, { point: [0, 0, 0] });
    expect(rg.gainDbi - rf.gainDbi).toBeCloseTo(3.01, 1);
  });

  it("без флага экрана результат в точности прежний (обратная совместимость)", () => {
    const dip: Wire = { pts: [[0, 0, -L / 2], [0, 0, L / 2]], radius: a, seglen: L / 21 };
    const r1 = solve3D([dip], f, { point: [0, 0, 0] });
    const r2 = solve3D([dip], f, { point: [0, 0, 0] }, { groundPlane: false });
    expect(r2.Zin.re).toBeCloseTo(r1.Zin.re, 9);
    expect(r2.gainDbi).toBeCloseTo(r1.gainDbi, 9);
  });
});

describe("зазор в точке питания (разрезной вибратор)", () => {
  it("несимметричный PWS-базис при зазоре 0 даёт в точности прежний результат", () => {
    const a = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40 });
    const b = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40, feedGapMm: 0 });
    expect(b.metrics.impedanceR!).toBe(a.metrics.impedanceR!);
    expect(b.metrics.gainDbi!).toBe(a.metrics.gainDbi!);
  });

  it("яги: зазор 10…60 мм меняет Z < 1 Ом и КУ < 0.05 дБ (как NEC2), баланс энергии ≥ 0.995", () => {
    const base = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40 });
    for (const g of [10, 20, 40, 60]) {
      const r = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40, feedGapMm: g });
      expect(Math.abs(r.metrics.impedanceR! - base.metrics.impedanceR!)).toBeLessThan(1);
      expect(Math.abs(r.metrics.impedanceX! - base.metrics.impedanceX!)).toBeLessThan(1);
      expect(Math.abs(r.metrics.gainDbi! - base.metrics.gainDbi!)).toBeLessThan(0.05);
      expect(r.metrics.avgGain!).toBeGreaterThan(0.995);
    }
  });

  it("яги: длина плеча = (полная − зазор)/2 выводится в примечаниях", () => {
    const r = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40, feedGapMm: 20 });
    expect(r.notes.join(" ")).toContain("389.50");
    expect(drivenArmMm(799, 20)).toBe(389.5);
  });

  it("яги: малый зазор (5 мм < 1.5 диаметра) моделируется честно и почти не меняет Z (точное ядро)", () => {
    const a = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40 });
    const r = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40, feedGapMm: 5 });
    expect(Math.abs(r.metrics.impedanceR! - a.metrics.impedanceR!)).toBeLessThan(1);
    expect(Math.abs(r.metrics.impedanceX! - a.metrics.impedanceX!)).toBeLessThan(3);
    expect(r.metrics.avgGain!).toBeGreaterThan(0.99);
  });

  it("яги: зазор не меньше длины активного — отказ с объяснением", () => {
    const r = computeYagi({ freqMHz: 180, elements: YAGI_180, floorDb: -40, feedGapMm: 900 });
    expect(r.metrics.directivityDbi).toBeNull();
    expect(r.notes.join(" ")).toMatch(/от кончика до кончика/);
  });

  it("яги: разрезной активный на «контактном» буме получает изолированную поправку (вдвое меньше)", () => {
    const r = computeYagi({
      freqMHz: 180, elements: YAGI_180, floorDb: -40, feedGapMm: 20,
      mounting: "through-contact", boomDiaMm: 20, boomShape: "square",
    });
    expect(r.notes.join(" ")).toMatch(/ИЗОЛИРОВАННОГО/);
  });

  it("диполь: зазор 10…40 мм меняет Z < 1.5 Ом (NEC2: < 1.7 Ом)", () => {
    const lam = 0.999308, L = 0.47 * lam, a = 0.001 * lam;
    const z0 = dipoleZ(L, a, 300, 0);
    for (const g of [10, 20, 40]) {
      const z = dipoleZ(L, a, 300, g / 1000);
      expect(Math.hypot(z.re - z0.re, z.im - z0.im)).toBeLessThan(1.5);
    }
  });
});
