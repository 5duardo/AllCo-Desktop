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

  // La ventana nace oculta: se muestra recién cuando el splash ya pintó,
  // así no se ve el fondo blanco del WebView mientras carga.
  useEffect(() => {
    const win = getCurrentWindow();
    void win.setBackgroundColor("#08090a").catch(() => {});
    let raf = 0;
    raf = requestAnimationFrame(() => {
      void win.show().catch(() => {});
      void win.setFocus().catch(() => {});
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (iniciado) return;
    iniciado = true;

    let version: string | null = null;

    // En desarrollo no se consulta: la compilación local (v0.2.0) es más
    // antigua que la publicada y siempre aparecería un aviso de actualización
    // que además instalaría el exe de release sobre el entorno de desarrollo.
    const consulta = import.meta.env.DEV
      ? Promise.resolve()
      : check()
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
        let mostrada = false;
        if (principal) {
          // Traerla al frente aunque Windows haya arrancado la app en segundo
          // plano (inicio automático): mostrarla, enfocarla y subirla un instante.
          await principal.unminimize().catch(() => {});
          await principal.show().catch(() => {});
          await principal.setAlwaysOnTop(true).catch(() => {});
          await principal.setFocus().catch(() => {});
          await principal.setAlwaysOnTop(false).catch(() => {});
          mostrada = await principal.isVisible().catch(() => false);
        }
        if (!mostrada) {
          // El respaldo de Rust muestra la ventana principal y cierra el splash.
          setEstado("Abriendo AllCo…");
          return;
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
