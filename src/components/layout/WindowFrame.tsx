import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useFullscreen } from "@/context/FullscreenContext";
import { cn } from "@/lib/utils";

type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

function enTauri() {
  try {
    getCurrentWindow();
    return true;
  } catch {
    return false;
  }
}

function ResizeHandles({ maximizado }: { maximizado: boolean }) {
  if (maximizado) return null;
  const win = getCurrentWindow();
  const iniciar = (direccion: ResizeDirection) => (e: MouseEvent) => {
    e.preventDefault();
    void win.startResizeDragging(direccion).catch(() => {});
  };
  const borde = "fixed z-40";

  return (
    <>
      <div className={cn(borde, "bottom-2 left-0 top-2 w-[3px] cursor-w-resize")} onMouseDown={iniciar("West")} />
      <div className={cn(borde, "bottom-2 right-0 top-2 w-[3px] cursor-e-resize")} onMouseDown={iniciar("East")} />
      <div className={cn(borde, "left-2 right-2 top-0 h-[3px] cursor-n-resize")} onMouseDown={iniciar("North")} />
      <div className={cn(borde, "bottom-0 left-2 right-2 h-[3px] cursor-s-resize")} onMouseDown={iniciar("South")} />
      <div className={cn(borde, "left-0 top-0 h-2 w-2 cursor-nw-resize")} onMouseDown={iniciar("NorthWest")} />
      <div className={cn(borde, "right-0 top-0 h-2 w-2 cursor-ne-resize")} onMouseDown={iniciar("NorthEast")} />
      <div className={cn(borde, "bottom-0 left-0 h-2 w-2 cursor-sw-resize")} onMouseDown={iniciar("SouthWest")} />
      <div className={cn(borde, "bottom-0 right-0 h-2 w-2 cursor-se-resize")} onMouseDown={iniciar("SouthEast")} />
    </>
  );
}

/**
 * Marco de la ventana principal: barra de título propia y bordes para
 * redimensionar, ya que la ventana de Tauri se crea sin decoración nativa.
 */
export function WindowFrame({ children }: { children: ReactNode }) {
  const tauri = enTauri();
  const [maximizado, setMaximizado] = useState(false);
  const [version, setVersion] = useState("");
  const { pantallaCompleta } = useFullscreen();

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tauri) return;
    const win = getCurrentWindow();
    let cancelado = false;
    let unlisten: (() => void) | undefined;

    win.isMaximized().then((m) => {
      if (!cancelado) setMaximizado(m);
    }).catch(() => {});

    win
      .onResized(() => {
        win.isMaximized().then((m) => {
          if (!cancelado) setMaximizado(m);
        }).catch(() => {});
      })
      .then((f) => {
        if (cancelado) f();
        else unlisten = f;
      })
      .catch(() => {});

    return () => {
      cancelado = true;
      unlisten?.();
    };
  }, [tauri]);

  if (!tauri) return <>{children}</>;

  const win = getCurrentWindow();
  const accion = (fn: () => Promise<unknown>) => () => {
    void fn().catch(() => {});
  };

  const boton =
    "flex h-full w-11 items-center justify-center text-sidebar-muted outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:bg-sidebar-hover";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className={cn(
          "relative z-30 flex h-10 shrink-0 select-none items-center border-b border-sidebar-border bg-sidebar text-sidebar-fg",
          pantallaCompleta && "hidden",
        )}
      >
        <div
          data-tauri-drag-region
          className="pointer-events-none flex items-center gap-2.5 px-4"
        >
          <Logo framed={false} className="h-5 w-5" />
          <span className="text-[13px] font-semibold tracking-tight">AllCo</span>
          {version ? (
            <span className="text-[11px] text-sidebar-muted">v{version}</span>
          ) : null}
        </div>

        <div data-tauri-drag-region className="h-full flex-1" />

        <div className="flex h-full items-stretch">
          <button
            type="button"
            title="Minimizar"
            aria-label="Minimizar"
            className={boton}
            onClick={accion(() => win.minimize())}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={maximizado ? "Restaurar" : "Maximizar"}
            aria-label={maximizado ? "Restaurar" : "Maximizar"}
            className={boton}
            onClick={accion(() => win.toggleMaximize())}
          >
            {maximizado ? (
              <Copy className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            className={cn(
              boton,
              "hover:bg-[#c42b1c] hover:text-white focus-visible:bg-[#c42b1c] focus-visible:text-white",
            )}
            onClick={accion(() => win.close())}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      <ResizeHandles maximizado={maximizado || pantallaCompleta} />
    </div>
  );
}
