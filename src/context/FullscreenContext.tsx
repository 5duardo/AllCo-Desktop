import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type FullscreenCtx = {
  pantallaCompleta: boolean;
  alternar: () => void;
  salir: () => void;
};

const Ctx = createContext<FullscreenCtx | null>(null);

/**
 * Estado compartido de pantalla completa. La página de Caja lo activa y el
 * marco de la ventana y el sidebar lo usan para ocultar sus barras.
 */
export function FullscreenProvider({ children }: { children: ReactNode }) {
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  useEffect(() => {
    let vivo = true;
    let unlisten: (() => void) | undefined;
    let win: ReturnType<typeof getCurrentWindow> | null = null;

    try {
      win = getCurrentWindow();
    } catch {
      // En el navegador no existe la ventana de Tauri.
    }

    if (win) {
      win
        .isFullscreen()
        .then((f) => {
          if (vivo) setPantallaCompleta(f);
        })
        .catch(() => {});
      win
        .onResized(() => {
          win
            ?.isFullscreen()
            .then((f) => {
              if (vivo) setPantallaCompleta(f);
            })
            .catch(() => {});
        })
        .then((f) => {
          if (vivo) unlisten = f;
          else f();
        })
        .catch(() => {});
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !win) return;
      win
        .isFullscreen()
        .then((f) => {
          if (f) return win?.setFullscreen(false);
        })
        .catch(() => {});
    };
    window.addEventListener("keydown", onKey);

    return () => {
      vivo = false;
      unlisten?.();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function alternar() {
    try {
      const win = getCurrentWindow();
      const destino = !pantallaCompleta;
      setPantallaCompleta(destino);
      void win
        .setFullscreen(destino)
        .catch(() => setPantallaCompleta(!destino));
    } catch {
      // En el navegador no existe la ventana de Tauri.
    }
  }

  function salir() {
    try {
      const win = getCurrentWindow();
      setPantallaCompleta(false);
      void win.setFullscreen(false).catch(() => {});
    } catch {
      // En el navegador no existe la ventana de Tauri.
    }
  }

  return (
    <Ctx.Provider value={{ pantallaCompleta, alternar, salir }}>{children}</Ctx.Provider>
  );
}

export function useFullscreen() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFullscreen fuera de FullscreenProvider");
  return ctx;
}
