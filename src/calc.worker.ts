// Фоновый поток расчёта ДН. Тяжёлые задачи (метод моментов со спиралями и сетчатым
// экраном — секунды) нельзя считать в основном потоке: интерфейс «замирает».
// Поток получает тип антенны и значения полей, сам берёт функцию расчёта из реестра
// (функции нельзя передать сообщением) и возвращает результат — это чистые данные.
import { ANTENNAS } from "./registry";
import type { PatternResult } from "./physics/types";

export interface CalcRequest { id: number; antennaId: string; values: Record<string, unknown> }
export interface CalcResponse { id: number; result: PatternResult | null; error?: string }

self.onmessage = (e: MessageEvent<CalcRequest>) => {
  const { id, antennaId, values } = e.data;
  try {
    const a = ANTENNAS.find((x) => x.id === antennaId);
    if (!a) throw new Error(`неизвестный тип антенны «${antennaId}»`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = a.analysis.compute(values as any);
    (self as unknown as Worker).postMessage({ id, result } satisfies CalcResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id, result: null, error: err instanceof Error ? err.message : String(err),
    } satisfies CalcResponse);
  }
};
