import { Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHero({
  title,
  subtitle,
  description,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  description: string;
  icon: LucideIcon;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 rounded-2xl bg-accent p-6 text-on-accent md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-on-accent text-accent">
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
              <span className="group relative inline-flex shrink-0">
                <button
                  type="button"
                  aria-label={`Información de ${title}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-on-accent outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <span
                  role="tooltip"
                  className="absolute left-0 top-full z-30 mt-2 hidden w-64 rounded-lg bg-surface p-3 text-xs font-normal leading-relaxed text-fg shadow-xl group-hover:block group-focus-within:block"
                >
                  {description}
                </span>
              </span>
            </div>
            {subtitle ? <p className="mt-0.5 text-sm text-on-accent">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {badge ? (
            <span className="rounded-full bg-on-accent px-3.5 py-1.5 text-xs font-semibold text-accent">
              {badge}
            </span>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
