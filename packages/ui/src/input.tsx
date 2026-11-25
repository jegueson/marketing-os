import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Optional hint or error id for aria-describedby. */
  describedBy?: string;
};

export function Input({ label, id, className, describedBy, required, ...props }: InputProps) {
  const inputId = id ?? (typeof props.name === "string" ? props.name : undefined);
  return (
    <label className={["mos-input", className].filter(Boolean).join(" ")} htmlFor={inputId}>
      <span>
        {label}
        {required ? (
          <abbr className="mos-required" title="required">
            *
          </abbr>
        ) : null}
      </span>
      <input id={inputId} aria-describedby={describedBy} required={required} {...props} />
    </label>
  );
}
