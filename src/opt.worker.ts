// Фоновый поток оптимизации размеров. Подбор длин — это сотни расчётов импеданса
// (секунды-десятки секунд), в основном потоке интерфейс бы замёрз.
import { optimizeAntenna, type OptimizeOptions, type OptimizeResult } from "./opt/optimize";

export interface OptRequest {
  id: number;
  antennaId: string;
  values: Record<string, unknown>;
  options: Omit<OptimizeOptions, "onProgress">;
}
export type OptResponse =
  | { id: number; kind: "progress"; stage: string; swr: number; evals: number }
  | { id: number; kind: "done"; result: OptimizeResult }
  | { id: number; kind: "error"; error: string };

self.onmessage = (e: MessageEvent<OptRequest>) => {
  const { id, antennaId, values, options } = e.data;
  const post = (m: OptResponse) => (self as unknown as Worker).postMessage(m);
  try {
    const result = optimizeAntenna(antennaId, values as never, {
      ...options,
      onProgress: (p) => { post({ id, kind: "progress", ...p }); },
    });
    post({ id, kind: "done", result });
  } catch (err) {
    post({ id, kind: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
