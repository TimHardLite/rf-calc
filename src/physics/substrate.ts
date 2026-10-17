// Справочник СВЧ-подложек: εr и tgδ типовых материалов печатных плат.
//
// ЗАЧЕМ. Патч считается по εr и tgδ подложки, и раньше их надо было вводить руками —
// пользователь либо искал даташит, либо оставлял tgδ = 0 и получал КПД без потерь в
// диэлектрике. Теперь материал выбирается из списка, а «Своё значение» остаётся для
// нестандартных плат.
//
// ЗНАЧЕНИЯ сверены с библиотекой материалов профессионального пакета HFSS
// (AnsysEM\syslib\Materials.amat) и совпадают с паспортными данными изготовителей.
// Важно: εr и tgδ зависят от частоты и партии; для ответственных изделий берите
// значения из паспорта конкретного материала на рабочей частоте.

export interface Substrate {
  id: string;
  label: string;
  /** Относительная диэлектрическая проницаемость. */
  epsR: number;
  /** Тангенс угла диэлектрических потерь. */
  tanD: number;
}

export const SUBSTRATES: Substrate[] = [
  { id: "custom", label: "Своё значение (εr и tgδ вводятся ниже)", epsR: NaN, tanD: NaN },
  { id: "fr4", label: "FR-4 (стеклотекстолит)", epsR: 4.4, tanD: 0.02 },
  { id: "rt5880", label: "Rogers RT/duroid 5880", epsR: 2.2, tanD: 0.0009 },
  { id: "rt5870", label: "Rogers RT/duroid 5870", epsR: 2.33, tanD: 0.0012 },
  { id: "ro3003", label: "Rogers RO3003", epsR: 3.0, tanD: 0.0013 },
  { id: "ro4003", label: "Rogers RO4003C", epsR: 3.55, tanD: 0.0027 },
  { id: "ro4350", label: "Rogers RO4350B", epsR: 3.66, tanD: 0.004 },
  { id: "ptfe", label: "Фторопласт (PTFE)", epsR: 2.08, tanD: 0.001 },
  { id: "polyimide", label: "Полиимид", epsR: 3.5, tanD: 0.008 },
  { id: "al2o3", label: "Керамика Al₂O₃ 96 %", epsR: 9.4, tanD: 0.006 },
];

/** εr и tgδ по выбору материала; для «своего» возвращаются введённые значения. */
export function substrateOf(id: string | undefined, epsR: number, tanD: number): { epsR: number; tanD: number } {
  const s = SUBSTRATES.find((x) => x.id === id);
  return s && s.id !== "custom" ? { epsR: s.epsR, tanD: s.tanD } : { epsR, tanD };
}
