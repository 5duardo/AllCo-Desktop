import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-surface", className)}
      {...props}
    />
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warn" | "ok" | "danger";
}) {
  const tones = {
    default: "text-fg",
    warn: "text-warn-fg",
    ok: "text-ok-fg",
    danger: "text-danger-fg",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-fg-muted">
            {label}
          </p>
          <p className={cn("mt-1.5 truncate text-2xl font-bold tabular-nums", tones[tone])}>
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
        </div>
        {icon ? <div className="icon-chip">{icon}</div> : null}
      </div>
    </Card>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "accent";
  className?: string;
}) {
  const map = {
    default: "bg-surface-2 text-fg-muted",
    ok: "bg-ok-soft text-ok-fg",
    warn: "bg-warn-soft text-warn-fg",
    danger: "bg-danger-soft text-danger-fg",
    accent: "bg-accent-soft text-accent-fg",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        map[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
