import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent hover:bg-accent-hover",
        secondary: "border border-border bg-surface-2 text-fg hover:bg-hover",
        outline: "border border-border-strong bg-surface text-fg hover:bg-hover",
        ghost: "text-fg-muted hover:bg-hover hover:text-fg",
        danger: "bg-danger text-[var(--on-danger)] hover:bg-danger-soft hover:text-danger-fg",
        dangerSoft: "bg-danger-soft text-danger-fg hover:bg-hover",
        success: "bg-ok text-[var(--on-ok)] hover:bg-ok-soft hover:text-ok-fg",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-5 text-base",
        xl: "h-14 px-6 text-lg",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type, ...props }: Props) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
