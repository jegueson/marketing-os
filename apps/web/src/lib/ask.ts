/** Metric cards that already have a number. Empty cards are not starter questions. */
export function starterChips(
  cards: readonly { key: string; label: string; value: number | null }[],
): { key: string; label: string }[] {
  const seen = new Set<string>();
  const chips: { key: string; label: string }[] = [];
  for (const card of cards) {
    if (card.value == null || seen.has(card.key)) continue;
    seen.add(card.key);
    chips.push({ key: card.key, label: card.label });
  }
  return chips;
}

export function starterQuestion(label: string): string {
  return `How much is ${label}?`;
}
