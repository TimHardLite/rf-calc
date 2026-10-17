import type { AntennaProject } from './format';
import type { DesignRow, FieldDef, FieldValues } from '../fields';

/** IRTANT/2 stores the selected geometry in params, including optimized synthesis.
 * IRTANT/1 synthesis only stores requirements: it must be synthesized again. */
export function restoredGeometry(project: AntennaProject, analysis: FieldValues): FieldValues | null {
  return project.mode === 'synthesis' && (project.formatVersion ?? 2) >= 2 && Object.keys(project.analysis).length > 0
    ? analysis : null;
}

/** Show the geometry that is actually being calculated/exported, not old synthesis rows. */
export function geometryRows(fields: FieldDef[], values: FieldValues): DesignRow[] {
  return fields.filter(f => f.key !== 'floorDb' && (!f.showIf || f.showIf(values))).flatMap((f): DesignRow[] => {
    const v = values[f.key];
    if (Array.isArray(v)) return v.map((e, i) => ({
      group: 'Элементы', label: `${i + 1}. ${e.type === 'driven' ? 'Активный' : e.type === 'reflector' ? 'Рефлектор' : 'Директор'}`,
      value: `L ${e.lengthMm}; Ø ${e.diameterMm}; позиция ${e.positionMm}`, unit: 'мм',
    }));
    return [{ group: 'Применённые параметры', label: f.label,
      value: f.options?.find(o => String(o.value) === String(v))?.label ?? String(v ?? '—'), unit: f.unit }];
  });
}
