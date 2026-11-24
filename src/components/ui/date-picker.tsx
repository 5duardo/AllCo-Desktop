import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./field-classes";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DIAS = ["LU", "MA", "MI", "JU", "VI", "SA", "DO"];

function dos(n: number) {
  return String(n).padStart(2, "0");
}

function isoDe(d: Date) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function parseISO(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
}: {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => {
    const d = parseISO(value) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  function abrir() {
    if (!abierto) {
      const d = parseISO(value) ?? new Date();
      setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setAbierto((a) => !a);
  }

  const celdas = useMemo(() => {
    const y = mes.getFullYear();
    const m = mes.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const diasMes = new Date(y, m + 1, 0).getDate();
    const diasPrevios = new Date(y, m, 0).getDate();
    const total = Math.ceil((offset + diasMes) / 7) * 7;

    return Array.from({ length: total }, (_, i) => {
      const dia = i - offset + 1;
      const fecha =
        dia < 1
          ? new Date(y, m - 1, diasPrevios + dia)
          : dia > diasMes
            ? new Date(y, m + 1, dia - diasMes)
            : new Date(y, m, dia);
      return {
        fecha,
        iso: isoDe(fecha),
        actual: dia >= 1 && dia <= diasMes,
      };
    });
  }, [mes]);

  const hoyISO = isoDe(new Date());
  const texto = value ? value.split("-").reverse().join("/") : placeholder;
  const flecha =
    "flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

  return (
    <div ref={contenedor} className={cn("relative", className)}>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className={cn(
          fieldClasses,
          "flex h-11 items-center justify-between gap-2 text-left",
          !value && "text-fg-faint",
        )}
      >
        <span className="truncate tabular-nums">{texto}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-fg-faint" />
      </button>

      {abierto ? (
        <div
          role="dialog"
          aria-label="Seleccionar fecha"
          className="absolute left-0 top-full z-50 mt-2 w-[292px] rounded-2xl border border-border bg-surface p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center">
              <button
                type="button"
                className={flecha}
                title="Año anterior"
                aria-label="Año anterior"
                onClick={() => setMes(new Date(mes.getFullYear() - 1, mes.getMonth(), 1))}
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={flecha}
                title="Mes anterior"
                aria-label="Mes anterior"
                onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm font-semibold capitalize text-fg">
              {MESES[mes.getMonth()]} de {mes.getFullYear()}
            </p>
            <div className="flex items-center">
              <button
                type="button"
                className={flecha}
                title="Mes siguiente"
                aria-label="Mes siguiente"
                onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={flecha}
                title="Año siguiente"
                aria-label="Año siguiente"
                onClick={() => setMes(new Date(mes.getFullYear() + 1, mes.getMonth(), 1))}
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            {DIAS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {celdas.map((c) => {
              const seleccionado = c.iso === value;
              const esHoy = c.iso === hoyISO;
              return (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => {
                    onChange(c.iso);
                    setAbierto(false);
                  }}
                  aria-pressed={seleccionado}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    c.actual ? "text-fg hover:bg-hover" : "text-fg-faint/60",
                    esHoy && !seleccionado && "font-semibold text-accent-fg ring-1 ring-inset ring-[var(--accent)]",
                    seleccionado &&
                      "bg-accent font-semibold text-on-accent hover:bg-accent-hover",
                  )}
                >
                  {c.fecha.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setAbierto(false);
              }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(hoyISO);
                setAbierto(false);
              }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-accent-fg transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Hoy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
