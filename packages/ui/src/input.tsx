import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ label, id, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <label>
      <span>{label}</span>
      <input id={inputId} {...props} />
    </label>
  );
}
