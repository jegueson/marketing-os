import type { Connector } from "@/demo/data/company";

/** Brand-neutral monogram tile. Real logos need each vendor's brand-usage approval. */
export function ConnectorMark({ connector, size = "md" }: { connector: Connector; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8 text-[11px]" : "size-11 text-sm";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl font-bold text-white shadow-inner ${box}`}
      style={{ background: `linear-gradient(135deg, ${connector.hue}, #1e293b)` }}
    >
      {connector.monogram}
    </span>
  );
}
