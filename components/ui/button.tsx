import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Cibles tactiles : 48 px par défaut (§48 — « préférer 48×48 »).
   `sm` descend à 40 px et n'est autorisé que pour des actions
   secondaires jamais critiques (fermer une info, changer de filtre). */
const SIZES = {
  sm: "h-10 px-3.5 text-[0.9375rem] gap-1.5 rounded-casa-sm",
  md: "h-12 px-4 text-base gap-2 rounded-casa",
  lg: "h-14 px-5 text-[1.0625rem] gap-2.5 rounded-casa-md",
} as const;

const VARIANTS = {
  primary:
    "bg-accent text-white shadow-casa-accent hover:bg-accent-hover active:scale-[0.985]",
  secondary:
    "bg-surface text-ink border border-line shadow-casa-sm hover:border-line-strong active:scale-[0.985]",
  soft: "bg-accent-soft text-accent-ink hover:brightness-[0.97] active:scale-[0.985]",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger-soft text-danger hover:brightness-[0.97] active:scale-[0.985]",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  block?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-semibold",
        "transition-[background-color,border-color,transform,filter] duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        SIZES[size],
        VARIANTS[variant],
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
}
