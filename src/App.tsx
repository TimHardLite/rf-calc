import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  ANTENNAS,
  getAntenna,
  defaultsOf,
  modeOf,
  type ModeId,
  type FieldDef,
  type FieldValue,
  type FieldValues,
} from "./registry";
import type { DesignResult, ElementSpec } from "./fields";
import { Icon } from "./components/icons";
import { PolarPlot } from "./components/PolarPlot";
import { ElementsEditor } from "./components/ElementsEditor";
import { AntennaDiagram, DIAGRAM_IDS } from "./components/AntennaDiagram";
import { DesignTable } from "./components/DesignTable";
import SwrChart from "./components/SwrChart";
import Optimizer from "./components/Optimizer";
import { optimizerUnavailableReason } from "./opt/optimize";
import type { YagiElement } from "./physics/yagi";
import type { PatternResult } from "./physics/types";
import { exportPng, exportSvg } from "./export/exportImage";
import { openProject, saveProject } from "./project/io";
import { ProjectParseError, reconcile } from "./project/format";
import { restoredGeometry, geometryRows } from "./project/state";
import type { CalcRequest, CalcResponse } from "./calc.worker";

/** Проект из файла, приведённый к полям программы (всё недостающее — по умолчанию). */
interface LoadedProject {
  typeId: string;
  name: string;
  mode: "analysis" | "synthesis";
  analysis: FieldValues;
  synthesis: FieldValues;
  geometry: FieldValues | null;
  note: string;
}

/**
 * Задержка применения значений. Тяжёлые расчёты (метод моментов для спиралей —
 * несколько секунд) нельзя запускать на каждое нажатие клавиши: ввод начинает
 * «залипать». Пересчитываем только после того, как пользователь остановился.
 */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="tip">
      <span className="tip-ic">
        <Icon id="info" size={15} />
      </span>
      <span className="tip-box">{text}</span>
    </span>
  );
}

function Field({
  def,
  value,
  all,
  onChange,
}: {
  def: FieldDef;
  value: FieldValue;
  /** Все значения формы — для живой подсказки def.derive. */
  all: FieldValues;
  onChange: (v: FieldValue) => void;
}) {
  let derived: string | null = null;
  try { derived = def.derive ? def.derive(all) : null; } catch { derived = null; }
  if (def.kind === "elements") {
    return (
      <div className="field field-wide">
        <span className="field-label">
          {def.label}
          <Tooltip text={def.help} />
        </span>
        <ElementsEditor
          value={(value as unknown as YagiElement[]) ?? []}
          onChange={(v) => onChange(v as unknown as FieldValue)}
        />
      </div>
    );
  }
  return (
    <label className="field">
      <span className="field-label">
        {def.label}
        <Tooltip text={def.help} />
      </span>
      {def.kind === "select" ? (
        <span className="field-input">
          <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {def.options?.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
      ) : (
        <span className="field-input">
          <input
            type="number"
            value={Number.isFinite(Number(value)) ? String(value) : ""}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
          {def.unit && <span className="unit">{def.unit}</span>}
        </span>
      )}
      {derived && <span className="field-derived">{derived}</span>}
    </label>
  );
}

function Metric({
  label, value, warn, wide,
}: { label: string; value: string; warn?: boolean; wide?: boolean }) {
  return (
    <div className={"metric" + (warn ? " metric-warn" : "") + (wide ? " metric-wide" : "")}>
      <div className={"metric-v" + (wide ? " metric-v-sm" : "")}>{value}</div>
      <div className="metric-l">{label}</div>
    </div>
  );
}

function PlaneCard({
  result,
  planeIndex,
  floorDb,
}: {
  result: PatternResult;
  planeIndex: number;
  floorDb: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const plane = result.planes[planeIndex];
  if (!plane.points.length) return null;
  const base = `${result.antennaKind}_${result.metrics.freqMHz}МГц_${plane.label.replace(/[^\wа-яА-Я]+/g, "_")}`;
  return (
    <div className="plane-card">
      <div className="plot-wrap">
        <PolarPlot ref={ref} plane={plane} floorDb={floorDb} title={result.title} />
      </div>
      <div className="plot-actions">
        <button
          className="btn ghost"
          onClick={() => ref.current && exportPng(ref.current, base, 3).catch((e) => alert("Ошибка экспорта PNG: " + e))}
        >
          <Icon id="download" size={16} /> PNG
        </button>
        <button
          className="btn ghost"
          onClick={() => ref.current && exportSvg(ref.current, base).catch((e) => alert("Ошибка экспорта SVG: " + e))}
        >
          <Icon id="download" size={16} /> SVG
        </button>
      </div>
    </div>
  );
}

/** Блок метрик + примечания + диаграммы — общий для обоих режимов. */
function ResultBlock({ result, floorDb }: { result: PatternResult; floorDb: number }) {
  const m = result.metrics;
  const conv = m.avgGain;
  const convBad = conv !== undefined && Number.isFinite(conv) && Math.abs(conv - 1) > 0.1;

  // Расчёт не состоялся (неверные исходные данные или отказ модели): ни одной точки ДН.
  // Показываем ТОЛЬКО объяснение — пустая таблица метрик с нулями сбивает с толку.
  const noPattern = result.planes.every((p) => !p.points.length);
  if (noPattern) {
    return (
      <div className="notes">
        {result.notes.map((n, i) => (
          <div key={i} className={"note" + (n.trim().startsWith("⚠") ? " note-warn" : "")}>
            {n}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="metrics">
        <Metric
          label="КНД (директивность)"
          value={m.directivityDbi != null ? `${m.directivityDbi.toFixed(2)} дБи · ${(m.directivityDbi - 2.15).toFixed(2)} дБд` : "—"}
        />
        {m.gainDbi != null && Number.isFinite(m.gainDbi) && (
          <Metric
            label={m.efficiency != null && m.efficiency < 0.995 ? `Коэф. усиления (КПД ${(m.efficiency * 100).toFixed(0)}%)` : "Коэф. усиления"}
            value={`${m.gainDbi.toFixed(2)} дБи · ${(m.gainDbi - 2.15).toFixed(2)} дБд`}
          />
        )}
        {m.efficiency != null && Number.isFinite(m.efficiency) && (
          <Metric
            label="КПД (учтённые потери модели)"
            value={`${(m.efficiency * 100).toFixed(m.efficiency > 0.995 ? 2 : 1)} % (${(10 * Math.log10(Math.max(m.efficiency, 1e-9))).toFixed(2)} дБ)`}
          />
        )}
        {m.apertureEff != null && Number.isFinite(m.apertureEff) && (
          <Metric
            label="КИП раскрыва"
            value={`${(m.apertureEff * 100).toFixed(0)} % (учтён в КНД)`}
          />
        )}
        <Metric label="Частота" value={`${m.freqMHz} МГц`} />
        <Metric label="Длина волны λ" value={`${m.lambdaMm.toFixed(1)} мм`} />

        {m.hpbwEDeg != null ? (
          <Metric label={`Ширина ДН −3 дБ · ${m.hpbwELabel ?? "E"}`} value={`${m.hpbwEDeg.toFixed(1)}°`} />
        ) : (
          <Metric label="Ширина луча −3 дБ" value={m.hpbwDeg ? `${m.hpbwDeg.toFixed(1)}°` : "—"} />
        )}
        {m.hpbwHDeg != null ? (
          <Metric label={`Ширина ДН −3 дБ · ${m.hpbwHLabel ?? "H"}`} value={`${m.hpbwHDeg.toFixed(1)}°`} />
        ) : m.hpbwHLabel ? (
          <Metric label="Ширина ДН −3 дБ" value={m.hpbwHLabel} wide />
        ) : null}

        <Metric label="F/B (строго 180°)" value={m.frontToBackDb != null ? `${m.frontToBackDb.toFixed(1)} дБ` : "—"} />
        {m.rearSectorDb != null && (
          <Metric label="Заднее излучение, сектор ±60°" value={`−${m.rearSectorDb.toFixed(1)} дБ`} />
        )}
        {m.sllDb != null && <Metric label="УБЛ" value={`${m.sllDb.toFixed(1)} дБ`} />}

        {m.impedanceR != null && (
          <Metric
            label="Входное сопротивление Z"
            value={`${m.impedanceR.toFixed(1)} ${m.impedanceX! >= 0 ? "+" : "−"} j${Math.abs(m.impedanceX!).toFixed(1)} Ом`}
          />
        )}
        {m.swr50 != null && Number.isFinite(m.swr50) && (
          <Metric
            label="КСВ (50 Ом)"
            // КСВ выше 100 — это уже «согласования нет»; печатать 4.3·10¹³ бессмысленно.
            value={m.swr50 > 100 ? "> 100 (согласования нет)" : m.swr50.toFixed(2)}
            warn={m.swr50 > 2}
          />
        )}
        {m.mismatchDb != null && Number.isFinite(m.mismatchDb) && m.mismatchDb > 0.05 && (
          <Metric label="Потери на рассогласовании" value={`${m.mismatchDb.toFixed(2)} дБ`} />
        )}
        {m.bandLowMHz != null && m.bandHighMHz != null && (
          <Metric
            label={`Полоса по КСВ ≤ ${m.swrCriterion ?? 1.6}`}
            value={`${m.bandLowMHz.toFixed(0)}…${m.bandHighMHz.toFixed(0)} МГц (${(m.bandHighMHz - m.bandLowMHz).toFixed(0)})`}
            wide
          />
        )}
        {m.qFactor != null && Number.isFinite(m.qFactor) && (
          <Metric label="Добротность Q" value={m.qFactor.toFixed(1)} />
        )}
        {m.axialRatioDb != null && (
          <Metric label="Осевое отношение" value={`${m.axialRatioDb.toFixed(2)} дБ`} />
        )}
        {m.polarization && <Metric label="Поляризация" value={m.polarization} wide />}
        {conv !== undefined && Number.isFinite(conv) && (
          <Metric label="Баланс энергии (идеал 1.000)" value={conv.toFixed(3)} warn={convBad} />
        )}
      </div>

      {m.sweep && m.sweep.length > 2 && (
        <SwrChart
          points={m.sweep}
          freqMHz={m.freqMHz}
          limit={m.swrCriterion ?? 1.6}
          bandLowMHz={m.bandLowMHz}
          bandHighMHz={m.bandHighMHz}
        />
      )}

      {result.notes.length > 0 && (
        <div className="notes">
          {result.notes.map((n, i) => (
            <div key={i} className={"note" + (n.trim().startsWith("⚠") ? " note-warn" : "")}>
              {n}
            </div>
          ))}
        </div>
      )}

      <div className="plots">
        {result.planes.map((_, i) => (
          <PlaneCard key={i} result={result} planeIndex={i} floorDb={floorDb} />
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [activeId, setActiveId] = useState("dipole");
  const [mode, setMode] = useState<ModeId>("analysis");
  const antenna = getAntenna(activeId);
  const hasSynthesis = !!antenna.synthesis;
  const effMode: ModeId = hasSynthesis ? mode : "analysis";

  const [designValues, setDesignValues] = useState<FieldValues>(() => defaultsOf(getAntenna("dipole"), "synthesis"));
  const [analysisValues, setAnalysisValues] = useState<FieldValues>(() => defaultsOf(getAntenna("dipole"), "analysis"));
  const [projectName, setProjectName] = useState<string>("");
  const [projectNote, setProjectNote] = useState("");
  // Размеры, подобранные оптимизатором в режиме «Проектирование»: они заменяют
  // результат синтеза для ДН, экспорта и кнопки «Добавить в калькулятор».
  const [override, setOverride] = useState<{ typeId: string; requirements: FieldValues; values: FieldValues } | null>(null);
  const optimized = override?.typeId === activeId && override.requirements === designValues ? override.values : null;
  const setOptimized = (v: FieldValues | null) => setOverride(v ? { typeId: activeId, requirements: designValues, values: v } : null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const flash = useCallback((text: string, bad?: boolean) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Проект, открытый из файла, ждёт смены типа антенны: его значения применяются
  // В ТОМ ЖЕ эффекте, который иначе сбросил бы поля на умолчания. Раньше значения
  // подставлялись таймером «следующим тиком» — и могли быть затёрты сбросом.
  const pendingLoadRef = useRef<LoadedProject | null>(null);

  // Смена типа антенны — сбрасываем значения обоих режимов (или берём из открытого файла).
  useEffect(() => {
    const a = getAntenna(activeId);
    const pl = pendingLoadRef.current;
    pendingLoadRef.current = null;
    if (pl && pl.typeId === a.id) {
      applyLoaded(pl);
      return;
    }
    setDesignValues(a.synthesis ? defaultsOf(a, "synthesis") : {});
    setAnalysisValues(defaultsOf(a, "analysis"));
    setProjectName("");
    setProjectNote("");
    setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const values = effMode === "synthesis" ? designValues : analysisValues;
  const setValues = effMode === "synthesis" ? setDesignValues : setAnalysisValues;
  // Расчёт идёт по «отложенным» значениям, ввод при этом остаётся отзывчивым.
  const calcDesignValues = useDebounced(designValues, 350);
  const calcAnalysisValues = useDebounced(analysisValues, 350);
  const pending = calcDesignValues !== designValues || calcAnalysisValues !== analysisValues;
  const current = modeOf(antenna, effMode);
  const visibleFields = current.fields.filter((f) => !f.showIf || f.showIf(values));

  const filled = (fields: FieldDef[], v: FieldValues) =>
    fields.every((f) => {
      if (f.showIf && !f.showIf(v)) return true;
      if (f.kind === "elements") return Array.isArray(v[f.key]) && (v[f.key] as unknown[]).length > 0;
      if (f.kind === "select") return v[f.key] != null;
      return Number.isFinite(Number(v[f.key]));
    });

  // Оптимизированные размеры относятся к КОНКРЕТНОМУ синтезу: меняются исходные
  // требования или тип антенны — прежний подбор больше не актуален.
  // Override is bound to the exact requirements object. Editing requirements invalidates
  // it immediately; a debounce effect must not erase geometry just loaded from a file.

  // --- Режим «Проектирование»: сперва синтез, затем поверочный расчёт по его результату ---
  const design: DesignResult | null = useMemo(() => {
    if (effMode !== "synthesis" || !antenna.synthesis) return null;
    if (!filled(antenna.synthesis.fields, calcDesignValues)) return null;
    try {
      return antenna.synthesis.design(calcDesignValues);
    } catch (e) {
      return {
        title: antenna.name,
        rows: [],
        analysisValues: {},
        notes: ["⚠ Ошибка расчёта: " + (e instanceof Error ? e.message : String(e))],
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antenna, calcDesignValues, effMode]);

  // --- ДН: в режиме анализа — по введённым значениям, в проектировании — по результату синтеза ---
  // Считается в ФОНОВОМ ПОТОКЕ (calc.worker.ts): метод моментов для крупных задач идёт
  // секундами, и интерфейс при этом не должен замирать. Устаревшие ответы (пользователь
  // успел изменить значения) отбрасываются по номеру запроса; если поток занят старой
  // задачей, он перезапускается — ждать ненужный результат незачем.
  const calcSrc = useMemo(() => {
    const src = effMode === "synthesis" ? (optimized ?? design?.analysisValues) : calcAnalysisValues;
    if (!src || !Object.keys(src).length) return null;
    if (effMode === "analysis" && !filled(antenna.analysis.fields, calcAnalysisValues)) return null;
    return src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antenna, calcAnalysisValues, design, effMode, optimized]);

  const [result, setResult] = useState<PatternResult | null>(null);
  const [resultSource, setResultSource] = useState<FieldValues | null>(null);
  const requestedSourceRef = useRef<FieldValues | null>(null);
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const busyRef = useRef(false);

  const makeWorker = useCallback((): Worker | null => {
    if (typeof Worker === "undefined") return null;
    try {
      const w = new Worker(new URL("./calc.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<CalcResponse>) => {
        if (e.data.id !== reqIdRef.current) return; // устаревший ответ
        busyRef.current = false;
        setBusy(false);
        setResult(e.data.result);
        setResultSource(requestedSourceRef.current);
      };
      w.onerror = () => {
        if (workerRef.current !== w) return;
        busyRef.current = false;
        setBusy(false);
        setResult(null);
        flash("Ошибка фонового расчёта. Измените параметры для повторного запуска.", true);
      };
      return w;
    } catch {
      return null;
    }
  }, [flash]);

  useEffect(() => {
    workerRef.current = makeWorker();
    return () => workerRef.current?.terminate();
  }, [makeWorker]);

  useEffect(() => {
    const id = ++reqIdRef.current;
    requestedSourceRef.current = calcSrc;
    if (!calcSrc) {
      if (busyRef.current) { workerRef.current?.terminate(); workerRef.current = makeWorker(); }
      busyRef.current = false;
      setResult(null);
      setBusy(false);
      return;
    }
    // Нет поддержки фоновых потоков — считаем по-старому, в основном потоке.
    if (!workerRef.current) {
      try { setResult(antenna.analysis.compute(calcSrc)); setResultSource(calcSrc); } catch { setResult(null); }
      setBusy(false);
      return;
    }
    if (busyRef.current) {
      workerRef.current.terminate();
      workerRef.current = makeWorker();
      if (!workerRef.current) { busyRef.current = false; setBusy(false); setResult(null); return; }
    }
    busyRef.current = true;
    setBusy(true);
    workerRef.current.postMessage({ id, antennaId: antenna.id, values: calcSrc } satisfies CalcRequest);
  }, [calcSrc, antenna, makeWorker]);

  const floorDb = Number(values.floorDb ?? -40);
  const currentResult = !pending && !busy && resultSource === calcSrc ? result : null;

  // --- Файл проекта ---
  function applyLoaded(pl: LoadedProject) {
    setAnalysisValues(pl.analysis);
    setDesignValues(pl.synthesis);
    setMode(pl.mode);
    setProjectName(pl.name);
    setProjectNote(pl.note);
    setOverride(pl.geometry ? { typeId: pl.typeId, requirements: pl.synthesis, values: pl.geometry } : null);
  }

  const handleOpen = async () => {
    try {
      const p = await openProject();
      if (!p) return;
      const def = ANTENNAS.find((a) => a.id === p.type);
      if (!def) {
        flash(`В файле указан неизвестный тип антенны «${p.type}».`, true);
        return;
      }
      const wanted: ModeId = p.mode === "synthesis" && def.synthesis ? "synthesis" : "analysis";
      // Сверяем файл с полями программы: всё известное — берём, недостающее — умолчание.
      const an = reconcile(p.analysis, def.analysis.fields);
      const sy = def.synthesis ? reconcile(p.synthesis, def.synthesis.fields) : null;
      const loaded: LoadedProject = {
        typeId: def.id,
        name: p.name,
        mode: wanted,
        analysis: an.values,
        synthesis: sy ? sy.values : {},
        geometry: restoredGeometry(p, an.values),
        note: p.note ?? "",
      };
      if (def.id === activeId) applyLoaded(loaded);
      else { pendingLoadRef.current = loaded; setActiveId(def.id); }

      // Честный отчёт: что взято не из файла и что в файле лишнее.
      const warn: string[] = [];
      const hasAnalysis = Object.keys(p.analysis).length > 0;
      const hasSynth = !!p.synthesis && Object.keys(p.synthesis).length > 0;
      if (hasAnalysis && an.missing.length) {
        warn.push(`в файле нет полей поверочного расчёта: ${an.missing.join(", ")} — взяты значения по умолчанию`);
      }
      if (sy && hasSynth && sy.missing.length) {
        warn.push(`в файле нет полей проектирования: ${sy.missing.join(", ")} — взяты значения по умолчанию`);
      }
      const unknown = [...an.unknown, ...(sy ? sy.unknown : [])];
      if (unknown.length) warn.push(`неизвестные параметры пропущены: ${unknown.join(", ")}`);
      flash(
        `Проект «${p.name}» загружен (${def.name}).` + (warn.length ? " ⚠ " + warn.join("; ") + "." : ""),
        warn.length > 0,
      );
    } catch (e) {
      const msg = e instanceof ProjectParseError ? e.message : e instanceof Error ? e.message : String(e);
      flash("Не удалось открыть файл. " + msg, true);
    }
  };

  const handleExport = async (fromDesign: boolean) => {
    if (fromDesign && pending) return;
    // Сохраняем ОБА режима целиком. Из «Проектирования» в поля поверочного расчёта идут
    // рассчитанные размеры, а файл откроется снова в «Проектировании».
    const analysisVals = fromDesign ? (optimized ?? design?.analysisValues) : analysisValues;
    if (!analysisVals || !Object.keys(analysisVals).length) return;
    const name = projectName || (fromDesign && design ? design.title : `${antenna.name} ${values.freqMHz ?? ""} МГц`);
    try {
      const ok = await saveProject(
        {
          name,
          type: antenna.id,
          mode: fromDesign ? "synthesis" : "analysis",
          note: projectNote,
          analysis: { ...defaultsOf(antenna, "analysis"), ...analysisVals },
          synthesis: antenna.synthesis ? { ...defaultsOf(antenna, "synthesis"), ...designValues } : undefined,
        },
        { analysis: antenna.analysis.fields, synthesis: antenna.synthesis?.fields },
      );
      if (ok) flash(`Проект «${name}» сохранён.`);
    } catch (e) {
      flash("Не удалось сохранить: " + (e instanceof Error ? e.message : String(e)), true);
    }
  };

  const handleToCalculator = () => {
    if (!design || pending) return;
    setAnalysisValues({ ...defaultsOf(antenna, "analysis"), ...(optimized ?? design.analysisValues) });
    setProjectName(design.title);
    setMode("analysis");
    flash("Размеры перенесены в поверочный расчёт — теперь их можно править.");
  };

  const elementsCount = (v: FieldValues) => {
    const e = v.elements as ElementSpec[] | undefined;
    return Array.isArray(e) ? e.length : 0;
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark-img" src="/logo-mark.png" alt="RF CALC" />
          <div>
            <div className="brand-title">RF CALC</div>
            <div className="brand-sub">Калькулятор ДН · ИРТ</div>
          </div>
        </div>

        <button className="open-btn" onClick={handleOpen}>
          <Icon id="folder" size={17} />
          <span>Открыть проект…</span>
        </button>
        {projectName && (
          <div className="proj-chip" title={projectName}>
            <Icon id="file" size={13} />
            <span>{projectName}</span>
          </div>
        )}

        <div className="nav-title">Тип антенны</div>
        <nav className="nav">
          {ANTENNAS.map((a) => (
            <button
              key={a.id}
              className={"nav-item" + (a.id === activeId ? " active" : "")}
              onClick={() => setActiveId(a.id)}
            >
              <span className="nav-ic">
                <Icon id={a.icon} />
              </span>
              <span className="nav-text">
                <span className="nav-name">{a.name}</span>
                <span className="nav-tag">{a.tagline}</span>
              </span>
              {a.status === "soon" && <span className="badge">скоро</span>}
            </button>
          ))}
        </nav>
        <div className="foot">v1.0.0-beta.1 · два режима · файлы .irta · расчётные модели и их ограничения — в примечаниях</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-ic">
              <Icon id={antenna.icon} size={24} />
            </span>
            <div>
              <h1>{antenna.name}</h1>
              <p>{antenna.tagline}</p>
            </div>
          </div>

          {hasSynthesis && (
            <div className="modes" role="tablist">
              <button
                role="tab"
                aria-selected={effMode === "synthesis"}
                className={"mode-tab" + (effMode === "synthesis" ? " active" : "")}
                onClick={() => setMode("synthesis")}
              >
                <Icon id="design" size={18} />
                <span className="mode-text">
                  <span className="mode-name">Проектирование</span>
                  <span className="mode-sub">задаю частоту — получаю размеры</span>
                </span>
              </button>
              <button
                role="tab"
                aria-selected={effMode === "analysis"}
                className={"mode-tab" + (effMode === "analysis" ? " active" : "")}
                onClick={() => setMode("analysis")}
              >
                <Icon id="check" size={18} />
                <span className="mode-text">
                  <span className="mode-name">Поверочный расчёт</span>
                  <span className="mode-sub">задаю размеры — получаю ДН</span>
                </span>
              </button>
            </div>
          )}
        </header>

        {antenna.status === "soon" ? (
          <div className="soon">
            <div className="soon-ic">
              <Icon id={antenna.icon} size={40} />
            </div>
            <h2>В разработке</h2>
            <p>{antenna.soonNote}</p>
          </div>
        ) : (
          <div className={"content" + (current.fields.some((f) => f.kind === "elements") ? " content-wide" : "")}>
            <section className="panel form-panel">
              {DIAGRAM_IDS.has(antenna.id) && (
                <div className="diagram">
                  <div className="diagram-h">Обозначения размеров</div>
                  <AntennaDiagram id={antenna.id} />
                </div>
              )}
              <div className="panel-h">
                {effMode === "synthesis" ? "Исходные требования" : "Параметры антенны"}
              </div>
              <div className="fields">
                {visibleFields.map((f) => (
                  <Field
                    key={f.key}
                    def={f}
                    value={values[f.key]}
                    all={values}
                    onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                  />
                ))}
              </div>
              {effMode === "analysis" && (
                <button
                  className="btn ghost wide"
                  onClick={() => handleExport(false)}
                  disabled={!filled(antenna.analysis.fields, analysisValues)}
                >
                  <Icon id="download" size={16} /> Экспортировать проект
                </button>
              )}
            </section>

            <section className={"panel result-panel" + (busy ? " is-busy" : "")}>
              {effMode === "synthesis" ? (
                design ? (
                  <>
                    <div className="design-head">
                      <div>
                        <div className="design-title">{design.title}</div>
                        <div className="design-sub">
                          Рассчитанные размеры
                          {elementsCount(design.analysisValues) > 0 &&
                            ` · ${elementsCount(design.analysisValues)} элементов`}
                        </div>
                      </div>
                      <div className="design-actions">
                        <button className="btn primary" disabled={pending || !calcSrc} onClick={() => handleExport(true)}>
                          <Icon id="download" size={16} /> Экспортировать
                        </button>
                        <button className="btn ghost" disabled={pending || !calcSrc} onClick={handleToCalculator}>
                          <Icon id="check" size={16} /> Добавить в калькулятор
                        </button>
                      </div>
                    </div>

                    <DesignTable rows={optimized ? geometryRows(antenna.analysis.fields, optimized) : design.rows} />

                    {!pending && Object.keys(design.analysisValues).length > 0 && (
                      <Optimizer
                        key={antenna.id + JSON.stringify(designValues)}
                        antennaId={antenna.id}
                        values={optimized ?? design.analysisValues}
                        unavailableReason={optimizerUnavailableReason(antenna.id, optimized ?? design.analysisValues)}
                        onApply={(v) => {
                          setOptimized(v);
                          flash("Оптимизированные размеры применены: ДН, экспорт и «Добавить в калькулятор» теперь берут их.");
                        }}
                      />
                    )}
                    {optimized && (
                      <div className="note">
                        Показаны применённые или загруженные размеры: таблица, ДН и экспорт используют одну геометрию.{" "}
                        <button className="linkbtn" onClick={() => setOptimized(null)}>вернуть исходные</button>
                      </div>
                    )}

                    {design.notes.length > 0 && (
                      <div className="notes">
                        {design.notes.map((n, i) => (
                          <div key={i} className={"note" + (n.trim().startsWith("⚠") ? " note-warn" : "")}>
                            {n}
                          </div>
                        ))}
                      </div>
                    )}

                    {currentResult && (
                      <>
                        <div className="panel-h section-gap">Проверка: что получилось</div>
                        <ResultBlock result={currentResult} floorDb={floorDb} />
                      </>
                    )}
                  </>
                ) : (
                  <div className="empty">⚠ Заполните все требования корректными числами.</div>
                )
              ) : currentResult ? (
                <>
                  <ResultBlock result={currentResult} floorDb={floorDb} />
                  <Optimizer
                    antennaId={antenna.id}
                    values={analysisValues}
                    unavailableReason={optimizerUnavailableReason(antenna.id, analysisValues)}
                    onApply={(v) => {
                      setAnalysisValues({ ...analysisValues, ...v });
                      flash("Оптимизированные размеры подставлены в поля — расчёт пересчитан.");
                    }}
                  />
                </>
              ) : (
                <div className="empty">{pending || busy ? "Идёт расчёт по текущим параметрам…" : "⚠ Заполните все параметры корректными числами."}</div>
              )}
            </section>
          </div>
        )}

        {(pending || busy) && <div className="calc-badge">{busy ? "Идёт расчёт…" : "Пересчёт…"}</div>}
        {toast && <div className={"toast" + (toast.bad ? " toast-bad" : "")}>{toast.text}</div>}
      </main>
    </div>
  );
}
