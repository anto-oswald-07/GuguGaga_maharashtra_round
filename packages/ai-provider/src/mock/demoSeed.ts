/**
 * Demo stability helpers (Phase 10 — Dev C).
 *
 * Mock AI must never call Math.random / Date.now for content.
 * Optional `AI_MOCK_SEED` only changes the deterministic hash lane —
 * identical seed + inputs always yield identical outputs.
 */

/** Default seed when `AI_MOCK_SEED` / constructor seed omitted. */
export const DEFAULT_AI_MOCK_SEED = 'creatorai-demo';

/**
 * Resolve mock seed: explicit opt → `AI_MOCK_SEED` env → default.
 * Empty string falls back to default (never silent free RNG).
 */
export function resolveMockSeed(explicit?: string | null): string {
  const fromOpt = explicit?.trim();
  if (fromOpt) return fromOpt;
  const fromEnv = process.env.AI_MOCK_SEED?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_AI_MOCK_SEED;
}

/** Stable FNV-ish hash → unsigned 32-bit int (deterministic). */
export function demoHash(key: string, seed: string = DEFAULT_AI_MOCK_SEED): number {
  const material = `${seed}\0${key}`;
  let h = 2166136261;
  for (let i = 0; i < material.length; i += 1) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
