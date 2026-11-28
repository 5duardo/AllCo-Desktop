import { Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHero({
  title,
  subtitle,
  description,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  description: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div
      className="hero-text mb-5 rounded-2xl p-6 md:p-7"
      style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)", opacity: 1 }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="hero-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="hero-text truncate text-2xl font-bold tracking-tight">{title}</h1>
            <span className="group relative inline-flex shrink-0">
              <button
                type="button"
                aria-label={`Información de ${title}`}
                className="hero-text flex h-5 w-5 items-center justify-center rounded-full text-on-accent outline-none hover:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
          {subtitle ? (
            <p className="hero-text mt-0.5 text-sm font-medium text-on-accent">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
