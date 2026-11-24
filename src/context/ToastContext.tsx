import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { sileo, Toaster } from "sileo";
import { useTheme } from "@/context/ThemeContext";

type ToastApi = {
  ok: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

/**
 * Notificaciones flotantes con Sileo. Mantiene la API useToast() que ya
 * usan las páginas, pero delega el renderizado y la física a la librería.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { resolvedMode } = useTheme();
  const oscuro = resolvedMode === "dark";

  const opciones = useMemo(
    () => ({
      duration: 3200,
      fill: oscuro ? "#e9eaec" : "#08090a",
      roundness: 16,
      styles: {
        description: oscuro ? "text-[#08090a]!" : "text-white!",
        badge: oscuro ? "bg-[#08090a]/10!" : "bg-white/15!",
        button: oscuro ? "bg-[#08090a]/10!" : "bg-white/10!",
      },
    }),
    [oscuro],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (mensaje) => {
        const texto = mensaje.trim();
        if (texto) sileo.success({ title: "Éxito", description: texto });
      },
      error: (mensaje) => {
        const texto = mensaje.trim();
        if (texto) sileo.error({ title: "Error", description: texto });
      },
      info: (mensaje) => {
        const texto = mensaje.trim();
        if (texto) sileo.info({ title: "Información", description: texto });
      },
    }),
    [],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <Toaster position="top-center" options={opciones} />
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast fuera de ToastProvider");
  return ctx;
}
