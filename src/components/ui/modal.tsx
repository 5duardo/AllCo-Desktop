import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide,
  small,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  small?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`anim-pop flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface ${
          wide ? "max-w-3xl" : small ? "max-w-sm" : "max-w-lg"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface-2 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-fg">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
