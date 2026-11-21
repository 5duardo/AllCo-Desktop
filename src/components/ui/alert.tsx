import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const icons = {
  danger: XCircle,
  ok: CheckCircle2,
  warn: AlertTriangle,
};

export function Alert({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "ok" | "warn";
  children: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <p className={cn(`alert alert-${tone}`, className)} role="alert">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
