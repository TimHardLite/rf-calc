// ПРОЕКТИРОВАНИЕ пирамидального рупора ОПТИМАЛЬНОГО УСИЛЕНИЯ (методика Balanis).
//
// Разобранный онлайн-калькулятор делает рупор КВАДРАТНЫМ (один размер раскрыва на обе
// плоскости) и не оптимизирует фазовую ошибку — это заметно хуже. Здесь классическая
// задача синтеза: по требуемому усилению G0 и питающему волноводу a×b找 найти χ = ρe/λ из
// уравнения физической реализуемости (стыковка E- и H-клиньев), затем размеры раскрыва.
//
//   Уравнение (Balanis, «Antenna Theory», синтез оптимального пирамидального рупора):
//     (√(2χ) − b/λ)²·(2χ − 1) = (G0/(2π)·√(3/(2π))·(1/√χ) − a/λ)²·(G0²/(6π³)·(1/χ) − 1)
//   Стартовое приближение: χ₁ = G0/(2π√(2π)).
//   Затем:  ρe = χ·λ,  ρh = G0²/(8π³)·λ/χ,  a₁ = √(3λρh),  b₁ = √(2λρe)
//   Осевые длины: pe = (b₁−b)·√((ρe/b₁)² − ¼),  ph = (a₁−a)·√((ρh/a₁)² − ¼)  (должны совпасть)
//
// Стандартные волноводы WR — полный ряд (physics/waveguide.ts), рабочая полоса считается
// как 1.25…1.9 критической частоты TE10.

import { WAVEGUIDES, recommendWaveguide, recommendedBandMHz } from "../physics/waveguide";
import { type DesignResult, type DesignRow, fmt } from "../fields";

const C_MM = 299792.458; // мм·МГц

type WG = { name: string; a: number; b: number; fmin: number; fmax: number };

/**
 * Стандартный волновод под частоту рупора. Таблица размеров и правило выбора —
 * в physics/waveguide.ts (полный ряд WR до 140 ГГц; рабочая полоса считается как
 * 1.25…1.9 критической, а не берётся из усечённой таблицы, как было в v1 — там ряд
 * обрывался на WR-90, и для частот выше 12.4 ГГц выдавался заведомо неверный WR-90).
 */
function pickWaveguide(fMHz: number): WG {
  const asWG = (w: { name: string; aMm: number; bMm: number }): WG => {
    const band = recommendedBandMHz(w.aMm);
    return { name: w.name, a: w.aMm, b: w.bMm, fmin: band.lo / 1000, fmax: band.hi / 1000 };
  };
  const best = recommendWaveguide(fMHz);
  if (best) return asWG(best);
  // Частота вне рекомендованных полос всего ряда — берём ближайший по центру полосы.
  let pick = WAVEGUIDES[0], bd = Infinity;
  for (const w of WAVEGUIDES) {
    const band = recommendedBandMHz(w.aMm);
    const d = Math.abs(Math.log(fMHz / Math.sqrt(band.lo * band.hi)));
    if (d < bd) { bd = d; pick = w; }
  }
  return asWG(pick);
}

export interface HornDesignInput {
  freqMHz: number;
  targetGainDbi: number;
  floorDb: number;
}

export function designHorn(inp: HornDesignInput): DesignResult {
  const f = inp.freqMHz;
  const notes: string[] = [];
  if (!(f > 0 && inp.targetGainDbi > 0)) {
    return { title: `Рупор · ${f} МГц`, rows: [], analysisValues: {}, notes: ["⚠ Частота и требуемое усиление должны быть > 0."] };
  }

  const lambda = C_MM / f;
  const G0 = Math.pow(10, inp.targetGainDbi / 10);
  const wg = pickWaveguide(f);
  const aL = wg.a / lambda, bL = wg.b / lambda;

  // Функция невязки уравнения реализуемости.
  const resid = (chi: number): number => {
    if (chi <= 0.5) return NaN;
    const lhs = Math.pow(Math.sqrt(2 * chi) - bL, 2) * (2 * chi - 1);
    const t1 = (G0 / (2 * Math.PI)) * Math.sqrt(3 / (2 * Math.PI)) * (1 / Math.sqrt(chi)) - aL;
    const t2 = (G0 * G0) / (6 * Math.PI * Math.PI * Math.PI) * (1 / chi) - 1;
    return lhs - t1 * t1 * t2;
  };

  // Поиск корня: скан + бисекция (устойчивее, чем итерация Balanis).
  const chi0 = G0 / (2 * Math.PI * Math.sqrt(2 * Math.PI));
  let lo = Math.max(0.51, chi0 * 0.3), hi = chi0 * 3, found = false;
  let fLo = resid(lo);
  const steps = 400;
  for (let i = 1; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const fx = resid(x);
    if (Number.isFinite(fLo) && Number.isFinite(fx) && fLo * fx < 0) { hi = x; found = true; break; }
    lo = x; fLo = fx;
  }
  let chi = chi0;
  if (found) {
    let a = lo, b = hi;
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2;
      if (resid(a) * resid(m) <= 0) b = m; else a = m;
    }
    chi = (a + b) / 2;
  } else {
    notes.push("⚠ Точное решение уравнения оптимального рупора не найдено — использовано стартовое приближение χ₁. Проверьте требуемое усиление (обычно 10…25 дБи).");
  }

  const rhoE = chi * lambda;
  const rhoH = ((G0 * G0) / (8 * Math.PI * Math.PI * Math.PI)) * (lambda / chi);
  const a1 = Math.sqrt(3 * lambda * rhoH);
  const b1 = Math.sqrt(2 * lambda * rhoE);
  const pe = (b1 - wg.b) * Math.sqrt(Math.pow(rhoE / b1, 2) - 0.25);
  const ph = (a1 - wg.a) * Math.sqrt(Math.pow(rhoH / a1, 2) - 0.25);

  const hpbwE = 56 * (lambda / b1);
  const hpbwH = 67 * (lambda / a1);
  const apEff = 0.51; // КИП оптимального пирамидального рупора
  const gainCheck = 10 * Math.log10((4 * Math.PI * apEff * a1 * b1) / (lambda * lambda));

  const fGHz = inp.freqMHz / 1000;
  if (fGHz < wg.fmin || fGHz > wg.fmax) {
    notes.push(
      `⚠ ${inp.freqMHz} МГц вне рекомендованной полосы стандартного ряда WR: ближайший волновод ` +
      `${wg.name} работает в ${fmt(wg.fmin, 2)}…${fmt(wg.fmax, 2)} ГГц. Горловину придётся делать ` +
      `нестандартного размера (или питать рупор не волноводом). Размеры раскрыва ниже посчитаны ` +
      `для указанной горловины — проверьте, что на рабочей частоте она не в отсечке (fc = ${fmt(C_MM / (2 * wg.a) / 1000, 3)} ГГц).`,
    );
  }

  const rows: DesignRow[] = [
    { group: "Питающий волновод", label: "Тип", value: wg.name, unit: "", hint: `${fmt(wg.a, 2)} × ${fmt(wg.b, 2)} мм, рекомендованная полоса ${fmt(wg.fmin, 2)}–${fmt(wg.fmax, 2)} ГГц (1.25…1.9 fc)` },
    { group: "Питающий волновод", label: "Критическая частота TE10", value: fmt(C_MM / (2 * wg.a) / 1000, 3), unit: "ГГц", hint: "λc = 2a" },

    { group: "Раскрыв", label: "a₁ — ширина раскрыва (H-плоскость)", value: fmt(a1, 2), unit: "мм", key: true },
    { group: "Раскрыв", label: "b₁ — высота раскрыва (E-плоскость)", value: fmt(b1, 2), unit: "мм", key: true },
    { group: "Раскрыв", label: "Площадь раскрыва", value: fmt((a1 * b1) / 100, 1), unit: "см²" },

    { group: "Клинья", label: "ρe — образующая E-клина", value: fmt(rhoE, 2), unit: "мм" },
    { group: "Клинья", label: "ρh — образующая H-клина", value: fmt(rhoH, 2), unit: "мм" },
    { group: "Клинья", label: "pe — осевая длина E-клина", value: fmt(pe, 2), unit: "мм", key: true },
    { group: "Клинья", label: "ph — осевая длина H-клина", value: fmt(ph, 2), unit: "мм", key: true, hint: "должна совпадать с pe — условие сшивки пирамиды" },
    { group: "Клинья", label: "Расхождение pe и ph", value: fmt(Math.abs(pe - ph), 3), unit: "мм", hint: "чем ближе к нулю, тем точнее решение" },

    { group: "Ожидаемые характеристики", label: "Усиление (КИП 0.51)", value: fmt(gainCheck, 2), unit: "дБи", hint: `требовалось ${fmt(inp.targetGainDbi, 1)} дБи` },
    { group: "Ожидаемые характеристики", label: "Ширина луча E (56λ/b₁)", value: fmt(hpbwE, 1), unit: "°" },
    { group: "Ожидаемые характеристики", label: "Ширина луча H (67λ/a₁)", value: fmt(hpbwH, 1), unit: "°" },
    { group: "Ожидаемые характеристики", label: "Длина волны λ", value: fmt(lambda, 2), unit: "мм" },
  ];

  if (Math.abs(pe - ph) > 0.02 * Math.max(pe, ph)) {
    notes.push(`⚠ Осевые длины клиньев разошлись на ${fmt(Math.abs(pe - ph), 2)} мм — пирамида физически не сшивается точно. Скорректируйте требуемое усиление.`);
  }
  notes.push("Синтез оптимального (по усилению) пирамидального рупора: при заданном усилении получается минимально возможная длина при допустимой фазовой ошибке в раскрыве.");
  notes.push("КИП оптимального рупора принят 0.51 — это стандартное значение для такой геометрии, оно уже учитывает квадратичную фазовую ошибку раскрыва.");
  notes.push("Ниже ДН и КНД посчитаны по полученным a₁, b₁, ρe, ρh с учётом квадратичной фазовой ошибки раскрыва (интегралы Френеля). Ширины лепестков могут немного отличаться от инженерных оценок 56λ/b и 67λ/a — это разные приближения.");

  return {
    title: `Рупор ${fmt(a1, 0)}×${fmt(b1, 0)} мм · ${f} МГц · ${fmt(inp.targetGainDbi, 1)} дБи`,
    rows,
    analysisValues: {
      freqMHz: f,
      apertureA: +a1.toFixed(2),
      apertureB: +b1.toFixed(2),
      // Длины раскрыва обязательно передаются в поверочный расчёт: без них он не
      // сможет учесть фазовую ошибку и завысит усиление примерно на 2 дБ.
      flareE: +rhoE.toFixed(2),
      flareH: +rhoH.toFixed(2),
      floorDb: inp.floorDb,
    },
    notes,
  };
}
