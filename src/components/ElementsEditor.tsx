// Редактор элементов яги: таблица тип/длина/диаметр/позиция + добавить/удалить.

import type { YagiElement, YagiElemType } from "../physics/yagi";
import { Icon } from "./icons";

const TYPE_LABEL: Record<YagiElemType, string> = {
  reflector: "Рефлектор",
  driven: "Активный",
  director: "Директор",
};

export function ElementsEditor({
  value,
  onChange,
}: {
  value: YagiElement[];
  onChange: (v: YagiElement[]) => void;
}) {
  const update = (i: number, patch: Partial<YagiElement>) => {
    const next = value.map((e, j) => (j === i ? { ...e, ...patch } : e));
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => {
    const last = value[value.length - 1];
    onChange([
      ...value,
      {
        type: "director",
        lengthMm: last ? Math.round(last.lengthMm - 8) : 700,
        diameterMm: last ? last.diameterMm : 6,
        positionMm: last ? last.positionMm + 460 : 0,
      },
    ]);
  };

  return (
    <div className="elems">
      <div className="elems-head">
        <span>№</span>
        <span>Тип</span>
        <span>Длина, мм</span>
        <span>Ø, мм</span>
        <span>Позиция, мм</span>
        <span></span>
      </div>
      {value.map((e, i) => (
        <div className="elems-row" key={i}>
          <span className="elems-num" aria-label={"Элемент № " + (i + 1)}>{i + 1}</span>
          <select aria-label={`Тип элемента ${i + 1}`} value={e.type} onChange={(ev) => update(i, { type: ev.target.value as YagiElemType })}>
            <option value="reflector">Рефлектор</option>
            <option value="driven">Активный</option>
            <option value="director">Директор</option>
          </select>
          <input aria-label={`Длина элемента ${i + 1}`} type="number" min="0" step="0.1" value={Number.isFinite(e.lengthMm) ? e.lengthMm : ""} onChange={(ev) => update(i, { lengthMm: parseFloat(ev.target.value) })} />
          <input aria-label={`Диаметр элемента ${i + 1}`} type="number" min="0" step="0.01" value={Number.isFinite(e.diameterMm) ? e.diameterMm : ""} onChange={(ev) => update(i, { diameterMm: parseFloat(ev.target.value) })} />
          <input aria-label={`Позиция элемента ${i + 1}`} type="number" step="0.1" value={Number.isFinite(e.positionMm) ? e.positionMm : ""} onChange={(ev) => update(i, { positionMm: parseFloat(ev.target.value) })} />
          <button className="elems-del" title={"Удалить " + TYPE_LABEL[e.type]} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button className="elems-add" onClick={add}>
        <Icon id="download" size={14} /> Добавить директор
      </button>
    </div>
  );
}
