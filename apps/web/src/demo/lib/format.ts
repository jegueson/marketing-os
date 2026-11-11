/** Display formatting for the investor demo. All demo money is in EUR. */

export type ValueKind = "eur" | "number" | "ratio" | "percent" | "decimal";

const LOCALE = "en-IE";

const eurFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function formatEur(value: number): string {
  return eurFormatter.format(value);
}

/** €1.24M, €18.4K, €212. Two significant decimals at most, trailing zeros dropped. */
export function formatCompactEur(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}€${trim(abs / 1_000_000, 2)}M`;
  if (abs >= 10_000) return `${sign}€${trim(abs / 1_000, 1)}K`;
  return formatEur(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number, options: { signed?: boolean } = {}): string {
  const fixed = value.toFixed(1);
  const sign = options.signed && value > 0 ? "+" : "";
  return `${sign}${fixed}%`;
}

export function formatValue(value: number, kind: ValueKind): string {
  switch (kind) {
    case "eur":
      return formatCompactEur(value);
    case "number":
      return formatNumber(value);
    case "ratio":
      return `${value.toFixed(1)}x`;
    case "percent":
      return formatPercent(value);
    case "decimal":
      return value.toFixed(1);
  }
}

function trim(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toString();
}
