import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-[0_6px_20px_-6px_rgb(37_99_235/0.7)] hover:bg-primary-strong",
  secondary: "border border-border bg-surface-2/60 text-fg hover:border-accent/50",
  ghost: "text-muted hover:bg-muted/10 hover:text-fg",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode };

export function DemoButton({ variant = "secondary", icon, className = "", children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`focus-ring inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon ? <span aria-hidden="true" className="[&>svg]:size-4">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Pill-style segmented tabs with an animated active indicator. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-2/50 p-0.5">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`focus-ring relative cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary text-white shadow" : "text-muted hover:text-fg"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
