import type { PatternResult } from './types';

/** Metrics use untruncated patterns; only the returned drawing is clipped to its scale.
 * -300 dB represents numerical zeros, not a claim of measurable 300 dB rejection. */
export function withDisplayFloor<T extends { floorDb: number }>(input: T, compute: (input: T) => PatternResult): PatternResult {
  const result = compute({ ...input, floorDb: -300 });
  return { ...result, planes: result.planes.map(plane => ({
    ...plane, points: plane.points.map(p => ({ ...p, valueDb: Math.max(input.floorDb, p.valueDb) })),
  })) };
}
