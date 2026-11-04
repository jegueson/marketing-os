import type { FormHTMLAttributes, ReactNode } from "react";

export type FormProps = FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
};

export function Form({ children, ...props }: FormProps) {
  return <form {...props}>{children}</form>;
}
