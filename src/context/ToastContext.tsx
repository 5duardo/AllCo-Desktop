import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "ok" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  mensaje: string;
  saliendo?: boolean;
};

type ToastApi = {
  ok: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

const DURACION_MS = 3200;
const SALIDA_MS = 200;
const MAX_VISIBLES = 4;

const ESTILOS: Record<ToastTone, { icono: typeof Info; chip: string; barra: string; borde: string }> = {
  ok: {
    icono: CheckCircle2,
    chip: "bg-ok-soft text-ok-fg",
    barra: "bg-ok",
    borde: "border-ok",
  },
  error: {
    icono: AlertCircle,
    chip: "bg-danger-soft text-danger-fg",
    barra: "bg-danger",
    borde: "border-danger",
  },
  info: {
    icono: Info,
    chip: "bg-accent-soft text-accent-fg",
    barra: "bg-accent",
    borde: "border-accent",
  },
};

/**
 * Notificaciones flotantes en la parte superior central de la ventana.
 * Se usan para confirmar guardados, eliminaciones y errores de acciones,
 * sin dejar mensajes sueltos dentro de las páginas.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, number>());
  const cerrando = useRef(new Set<number>());

  const remover = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    cerrando.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const cerrar = useCallback(
    (id: number) => {
      if (cerrando.current.has(id)) return;
      cerrando.current.add(id);
      const timer = timers.current.get(id);
      if (timer) {
        window.clearTimeout(timer);
        timers.current.delete(id);
      }
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, saliendo: true } : t)),
      );
      window.setTimeout(() => remover(id), SALIDA_MS);
    },
    [remover],
  );

  const push = useCallback(
    (tone: ToastTone, mensaje: string) => {
      const texto = mensaje.trim();
      if (!texto) return;
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLES - 1)), { id, tone, mensaje: texto }]);
      const timer = window.setTimeout(() => cerrar(id), DURACION_MS);
      timers.current.set(id, timer);
    },
    [cerrar],
  );

  useEffect(() => {
    const mapa = timers.current;
    return () => {
      mapa.forEach((t) => window.clearTimeout(t));
      mapa.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      ok: (mensaje) => push("ok", mensaje),
      error: (mensaje) => push("error", mensaje),
      info: (mensaje) => push("info", mensaje),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed left-1/2 top-12 z-[70] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col items-stretch gap-2"
      >
        {toasts.map((t) => {
          const { icono: Icono, chip, barra, borde } = ESTILOS[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "anim-toast pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-3xl border-2 bg-fg px-4 py-3.5 text-bg shadow-2xl",
                borde,
                t.saliendo && "anim-toast-out",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl",
                  chip,
                )}
              >
                <Icono className="h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1 pt-1 text-sm font-medium leading-snug text-bg">
                {t.mensaje}
              </p>
              <button
                type="button"
                onClick={() => cerrar(t.id)}
                aria-label="Cerrar notificación"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-bg/60 outline-none transition-colors hover:bg-bg/10 hover:text-bg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <X className="h-4 w-4" />
              </button>
              <span
                className={cn(
                  "anim-toast-progress absolute inset-x-0 bottom-0 h-1 origin-left",
                  barra,
                )}
                style={{ animationDuration: `${DURACION_MS}ms` }}
              />
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast fuera de ToastProvider");
  return ctx;
}
