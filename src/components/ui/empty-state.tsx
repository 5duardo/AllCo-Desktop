import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Estado vacío para tablas y listas: icono grande + mensaje. */
export function EmptyState({
  children,
  icon: Icon = Inbox,
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-fg-faint">
        <Icon className="h-8 w-8" strokeWidth={1.5} />
      </span>
      <p className="max-w-sm text-sm text-fg-muted">{children}</p>
    </div>
  );
}
