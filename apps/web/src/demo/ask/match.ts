export type Matchable = { id: string; keywords: readonly string[] };

/**
 * Picks the scripted answer whose keywords best overlap the question.
 * The demo has no model behind it; this keeps typed questions feeling live.
 */
export function matchScript<T extends Matchable>(question: string, scripts: readonly T[]): T | null {
  const words = new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
  if (words.size === 0) return null;

  let best: T | null = null;
  let bestScore = 0;
  for (const script of scripts) {
    const score = script.keywords.filter((keyword) => words.has(keyword.toLowerCase())).length;
    if (score > bestScore) {
      best = script;
      bestScore = score;
    }
  }
  return best;
}
