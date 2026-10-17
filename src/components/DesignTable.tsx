// Таблица результатов режима «Проектирование»: рассчитанные размеры по разделам.

import type { DesignRow } from "../fields";

export function DesignTable({ rows }: { rows: DesignRow[] }) {
  if (!rows.length) return null;

  // Сохраняем порядок появления разделов.
  const groups: { name: string; rows: DesignRow[] }[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) { g = { name: r.group, rows: [] }; groups.push(g); }
    g.rows.push(r);
  }

  return (
    <div className="dgroups">
      {groups.map((g) => (
        <div className="dgroup" key={g.name}>
          <div className="dgroup-h">{g.name}</div>
          <table className="dtable">
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i} className={r.key ? "dkey" : undefined}>
                  <td className="dlabel">
                    {r.label}
                    {r.hint && <span className="dhint">{r.hint}</span>}
                  </td>
                  <td className="dvalue">
                    <span className="dnum">{r.value}</span>
                    {r.unit && <span className="dunit">{r.unit}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
