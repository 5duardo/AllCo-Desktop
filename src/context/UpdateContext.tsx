import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type UpdateCtx = {
  nuevaVersion: string | null;
};

const Ctx = createContext<UpdateCtx | null>(null);

/**
 * Recibe el resultado de la búsqueda de actualizaciones que hace la ventana
 * de arranque, para mostrar el aviso sin repetir la consulta.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [nuevaVersion, setNuevaVersion] = useState<string | null>(null);

  useEffect(() => {
    let desmontado = false;
    let unlisten: (() => void) | undefined;

    // El estado vive en Rust: consultarlo al montar y al recibir el foco
    // (justo después de que el splash muestre la ventana principal).
    const consultar = () => {
      invoke<string | null>("version_disponible")
        .then((v) => {
          if (!desmontado && v) setNuevaVersion(v);
        })
        .catch(() => {});
    };

    consultar();
    window.addEventListener("focus", consultar);

    listen<string>("allco:update", (e) => {
      if (!desmontado && e.payload) setNuevaVersion(e.payload);
    })
      .then((f) => {
        if (desmontado) f();
        else unlisten = f;
      })
      .catch(() => {});

    return () => {
      desmontado = true;
      unlisten?.();
      window.removeEventListener("focus", consultar);
    };
  }, []);

  return <Ctx.Provider value={{ nuevaVersion }}>{children}</Ctx.Provider>;
}

export function useUpdates() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUpdates fuera de UpdateProvider");
  return ctx;
}
