import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { Window, getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";

// El splash debe verse un instante aunque la consulta responda al instante;
// y nunca debe retener la apertura más de unos segundos.
const MIN_MS = 1200;
const MAX_MS = 6000;

// StrictMode ejecuta el efecto dos veces en desarrollo: solo arrancamos una vez.
let iniciado = false;

/**
 * Ventana pequeña de arranque: busca actualizaciones y después muestra la
 * ventana principal (maximizada) y se cierra.
 */
export function SplashWindow() {
  const [estado, setEstado] = useState("Buscando actualización…");

  useEffect(() => {
    if (iniciado) return;
    iniciado = true;

    let version: string | null = null;

    const consulta = check()
      .then((u) => {
        if (!u) return;
        version = u.version;
        setEstado("Actualización encontrada");
        // Queda disponible para la ventana principal, sin volver a consultar.
        void invoke("guardar_version_disponible", { version: u.version }).catch(
          () => {},
        );
      })
      .catch(() => {});

    const minimo = new Promise((resolve) => setTimeout(resolve, MIN_MS));
    const limite = new Promise((resolve) => setTimeout(resolve, MAX_MS));

    Promise.race([Promise.all([consulta, minimo]), limite])
      .then(async () => {
        const principal = await Window.getByLabel("main").catch(() => null);
        if (principal) {
          await principal.unminimize().catch(() => {});
          await principal.show().catch(() => {});
          await principal.setFocus().catch(() => {});
        }
        if (version) {
          await emitTo("main", "allco:update", version).catch(() => {});
        }
        await getCurrentWindow().close().catch(() => {});
      })
      .catch(() => {
        void getCurrentWindow().close();
      });
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-screen select-none flex-col items-center justify-center gap-5 bg-bg px-8 text-center"
    >
      <Logo framed={false} className="h-20 w-20" />
      <div>
        <p className="text-base font-bold text-fg">AllCo</p>
        <p className="mt-1 text-sm font-medium text-fg-muted">{estado}</p>
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-fg-faint" />
    </div>
  );
}
