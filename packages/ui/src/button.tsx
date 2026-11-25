import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Visual variant. Default is the brand primary (yuzu). */
  variant?: "primary" | "ghost";
};

export function Button({
  children,
  type = "button",
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  const classes = ["mos-btn", variant === "ghost" ? "mos-btn-ghost" : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
