import type { FormHTMLAttributes, ReactNode } from "react";

export type FormProps = FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
};

export function Form({ children, className, ...props }: FormProps) {
  return (
    <form className={["mos-form", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </form>
  );
}
