// Панель оптимизации размеров: «подобрать длины так, чтобы КСВ стремился к 1».
//
// Что важно в интерфейсе: пользователь должен видеть, ЧЕМ он платит за согласование.
// Поэтому показывается сравнение «было / стало» по всем ключевым характеристикам,
// список изменённых размеров и честные примечания (включая случай, когда лучше не
// тянуть КСВ размерами, а поставить согласующее устройство).
import { useEffect, useRef, useState } from "react";
import type { FieldValues } from "../fields";
import type { OptimizeResult } from "../opt/optimize";
import type { OptRequest, OptResponse } from "../opt.worker";
import { Icon } from "./icons";

type Priority = "swr" | "balanced" | "gain";

interface Props {
  antennaId: string;
  /** Геометрия, которую оптимизируем (значения полей поверочного расчёта). */
  values: FieldValues;
  /** Применить найденные размеры. */
  onApply: (v: FieldValues) => void;
  /** Причина, по которой для этого типа оптимизация не делается (если не делается). */
  unavailableReason?: string;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  swr: "КСВ любой ценой",
  balanced: "Баланс (по умолчанию)",
  gain: "Беречь усиление",
};

export default function Optimizer({ antennaId, values, onApply, unavailableReason }: Props) {
  const [priority, setPriority] = useState<Priority>("balanced");
  const [bandPct, setBandPct] = useState(2);
  const [offsetPct, setOffsetPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; swr: number } | null>(null);
  const [res, setRes] = useState<OptimizeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);
  // Смена антенны или геометрии обнуляет прошлый результат — он больше не про эти размеры.
  useEffect(() => {
    ++idRef.current;
    workerRef.current?.terminate(); workerRef.current = null;
    setBusy(false); setProgress(null); setRes(null); setErr(null); setApplied(false);
  }, [antennaId, values, unavailableReason, priority, bandPct, offsetPct]);

  if (unavailableReason) {
    return (
      <div className="opt-box">
        <div className="opt-head"><span className="opt-title">Оптимизация размеров</span></div>
        <div className="note">{unavailableReason}</div>
      </div>
    );
  }

  const run = () => {
    setBusy(true); setErr(null); setRes(null); setProgress({ stage: "запуск", swr: NaN });
    workerRef.current?.terminate();
    let w: Worker;
    try { w = new Worker(new URL("../opt.worker.ts", import.meta.url), { type: "module" }); }
    catch (e) { setErr("Не удалось запустить оптимизацию: " + String(e)); setBusy(false); setProgress(null); return; }
    workerRef.current = w;
    const id = ++idRef.current;
    w.onmessage = (e: MessageEvent<OptResponse>) => {
      const m = e.data;
      if (m.id !== idRef.current) return;
      if (m.kind === "progress") setProgress({ stage: m.stage, swr: m.swr });
      else if (m.kind === "done") { setRes(m.result); setBusy(false); setProgress(null); w.terminate(); }
      else { setErr(m.error); setBusy(false); setProgress(null); w.terminate(); }
    };
    w.onerror = (ev) => { if (id !== idRef.current) return; w.terminate(); setErr(String(ev.message ?? "ошибка потока оптимизации")); setBusy(false); setProgress(null); };
    w.postMessage({
      id, antennaId, values: values as Record<string, unknown>,
      options: { priority, bandPct, tuneOffsetPct: offsetPct },
    } satisfies OptRequest);
  };

  const stop = () => { ++idRef.current; workerRef.current?.terminate(); workerRef.current = null; setBusy(false); setProgress(null); };

  const num = (v: number | undefined, d = 2) => (v != null && Number.isFinite(v) ? v.toFixed(d) : "—");

  return (
    <div className="opt-box">
      <div className="opt-head">
        <span className="opt-title">Оптимизация размеров</span>
        <span className="opt-sub">Подбор КСВ с контролем КНД и заднего излучения; позиции элементов фиксированы</span>
      </div>

      <div className="opt-controls">
        <label className="opt-ctl">
          <span>Приоритет</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} disabled={busy}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </label>
        <label className="opt-ctl">
          <span>Полоса оптимизации, %</span>
          <input type="number" step={0.5} min={0} max={20} value={bandPct} disabled={busy}
                 onChange={(e) => setBandPct(Math.max(0, Math.min(20, Number(e.target.value))))} />
        </label>
        <label className="opt-ctl">
          <span>Смещение настройки, %</span>
          <input type="number" step={0.5} min={-10} max={10} value={offsetPct} disabled={busy}
                 onChange={(e) => setOffsetPct(Math.max(-10, Math.min(10, Number(e.target.value))))} />
        </label>
        {busy ? (
          <button className="btn ghost" onClick={stop}>Прервать</button>
        ) : (
          <button className="btn primary" onClick={run}><Icon id="check" size={16} /> Оптимизировать</button>
        )}
      </div>

      <div className="opt-hint">
        Полоса — в каких пределах вокруг рабочей частоты КСВ должен оставаться низким (0 — настройка
        в одну точку: КСВ будет минимальным, но «иглой»). Смещение — если настраиваете антенну после
        сборки: укорочение элементов поднимает частоту, удлинение опускает.
      </div>

      {busy && (
        <div className="opt-progress">
          Идёт подбор: {progress?.stage ?? "…"}
          {progress && Number.isFinite(progress.swr) ? ` · лучший КСВ ${progress.swr.toFixed(2)}` : ""}
        </div>
      )}
      {err && <div className="note note-warn">⚠ {err}</div>}

      {res && (
        <div className="opt-result">
          <table className="opt-table">
            <thead>
              <tr><th>Параметр</th><th>Было</th><th>Стало</th></tr>
            </thead>
            <tbody>
              <tr><td>КСВ на {num(Number(values.freqMHz) * (1 + offsetPct / 100), 3)} МГц</td><td>{num(res.before.swr)}</td><td className="opt-new">{num(res.after.swr)}</td></tr>
              <tr><td>КСВ худший в трёх контрольных точках полосы</td><td>{num(res.before.swrWorst)}</td><td className="opt-new">{num(res.after.swrWorst)}</td></tr>
              <tr><td>Z, Ом</td>
                  <td>{num(res.before.R, 1)} {res.before.X >= 0 ? "+" : "−"} j{num(Math.abs(res.before.X), 1)}</td>
                  <td className="opt-new">{num(res.after.R, 1)} {res.after.X >= 0 ? "+" : "−"} j{num(Math.abs(res.after.X), 1)}</td></tr>
              <tr><td>КНД, дБи</td><td>{num(res.before.gainDbi)}</td><td className="opt-new">{num(res.after.gainDbi)}</td></tr>
              {Number.isFinite(res.before.rearDb) && (
                <tr><td>Заднее излучение, дБ</td><td>−{num(res.before.rearDb, 1)}</td><td className="opt-new">−{num(res.after.rearDb, 1)}</td></tr>
              )}
            </tbody>
          </table>

          {res.changes.length > 0 && (
            <div className="opt-changes">
              {res.changes.map((c, i) => (
                <div key={i} className="opt-change">
                  <span className="opt-change-l">{c.label}</span>
                  <span className="opt-change-v">{c.from.toFixed(2)} → <b>{c.to.toFixed(2)}</b> {c.unit ?? "мм"}</span>
                  <span className="opt-change-d">{c.to > c.from ? "+" : ""}{(c.to - c.from).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="opt-meta">
            Расчётов импеданса {res.fastEvals}, полных расчётов с ДН {res.fullEvals}, время {(res.ms / 1000).toFixed(1)} с.
          </div>

          {[...res.notes, ...res.advice].map((n, i) => (
            <div key={i} className={"note" + (n.trim().startsWith("⚠") ? " note-warn" : "")}>{n}</div>
          ))}

          {res.alternative && (
            <div className="opt-alt">
              <div className="opt-alt-h">Альтернатива: максимум усиления + согласующее устройство</div>
              <div className="opt-alt-b">
                КНД {num(res.alternative.metrics.gainDbi)} дБи, Z {num(res.alternative.metrics.R, 1)}
                {res.alternative.metrics.X >= 0 ? " + j" : " − j"}{num(Math.abs(res.alternative.metrics.X), 1)} Ом,
                КСВ без согласования {num(res.alternative.metrics.swr)}.
              </div>
              {res.alternative.advice.map((a, i) => <div key={i} className="note">{a}</div>)}
              <button className="btn ghost" onClick={() => { onApply(res.alternative!.values); setApplied(true); }}>
                Применить вариант с максимумом усиления
              </button>
            </div>
          )}

          <div className="opt-actions">
            <button className="btn primary" disabled={applied} onClick={() => { onApply(res.values); setApplied(true); }}>
              <Icon id="check" size={16} /> {applied ? "Применено" : "Применить размеры"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
