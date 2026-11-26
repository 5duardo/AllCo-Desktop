import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { AppWindow, Download, Power, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { guardarMinimizarAlCerrar, leerMinimizarAlCerrar } from "@/lib/window";
import { useToast } from "@/context/ToastContext";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";

export function PreferenciasSection() {
  const toast = useToast();
  const [minimizarAlCerrar, setMinimizarAlCerrar] = useState(leerMinimizarAlCerrar);
  const [inicioAutomatico, setInicioAutomatico] = useState(true);

  useEffect(() => {
    api
      .obtenerInicioAutomatico()
      .then(setInicioAutomatico)
      .catch((e) => toast.error(`No se pudo consultar el inicio automático: ${e}`));
  }, []);

  async function cambiarInicioAutomatico(activo: boolean) {
    setInicioAutomatico(activo);
    try {
      await api.guardarInicioAutomatico(activo);
      toast.ok(
        activo
          ? "AllCo se iniciará al encender la computadora."
          : "Inicio automático desactivado.",
      );
    } catch (e) {
      setInicioAutomatico(!activo);
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="icon-chip">
            <Power className="h-5 w-5" />
          </span>
          <div>
            <h2 className="card-title">Inicio</h2>
            <p className="mt-1 text-sm text-fg-muted">
              AllCo puede abrirse automáticamente al encender la computadora.
            </p>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">
              Iniciar al encender la computadora
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              Activado por defecto. Se aplica la próxima vez que inicie Windows.
            </span>
          </span>
          <input
            type="checkbox"
            checked={inicioAutomatico}
            onChange={(e) => void cambiarInicioAutomatico(e.target.checked)}
          />
        </label>
        {import.meta.env.DEV ? (
          <p className="mt-3 text-xs text-fg-muted">
            En desarrollo este ajuste no se registra en Windows: la app necesita el servidor
            local. Se aplica en la app instalada.
          </p>
        ) : null}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="icon-chip">
              <AppWindow className="h-5 w-5" />
            </span>
            <div>
              <h2 className="card-title">Ventana</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Qué hace la app al pulsar el botón de cerrar.
              </p>
            </div>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">
              Minimizar al pulsar la X
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              La app se minimiza en la barra de tareas en vez de cerrarse.
            </span>
          </span>
          <input
            type="checkbox"
            checked={minimizarAlCerrar}
            onChange={(e) => {
              setMinimizarAlCerrar(e.target.checked);
              guardarMinimizarAlCerrar(e.target.checked);
            }}
          />
        </label>
      </Card>
    </div>
  );
}

export function ActualizacionesSection() {
  const esDev = import.meta.env.DEV;
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.0"));
  }, []);

  // Al entrar a la sección, instala la actualización automáticamente si hay
  // versión nueva y hay internet. El ref evita repetirlo en StrictMode.
  const autoInstalado = useRef(false);
  useEffect(() => {
    if (esDev || autoInstalado.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    autoInstalado.current = true;

    void (async () => {
      setChecking(true);
      setUpdateMsg("");
      setUpdateError("");
      setProgress("");
      try {
        const disponible = await check();
        if (!disponible) {
          setUpdateMsg(`Está al día con la última versión (v${version || "0.1.0"}).`);
          return;
        }
        setUpdate(disponible);
        setUpdateMsg(`Instalando automáticamente la versión v${disponible.version}…`);
        await instalarActualizacion(disponible);
      } catch {
        setUpdateError(
          "No se pudo buscar actualizaciones. Revise la conexión a internet e intente de nuevo.",
        );
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  async function buscarActualizacion() {
    if (esDev) {
      setUpdateMsg("Las actualizaciones solo se aplican en la app instalada (no en desarrollo).");
      return;
    }
    setChecking(true);
    setUpdate(null);
    setUpdateMsg("");
    setUpdateError("");
    setProgress("");
    try {
      const disponible = await check();
      if (disponible) {
        setUpdate(disponible);
        setUpdateMsg(`Nueva versión v${disponible.version} disponible.`);
      } else {
        setUpdateMsg(`Está al día con la última versión (v${version || "0.1.0"}).`);
      }
    } catch (e) {
      console.error(e);
      setUpdateError(
        "No se pudo buscar actualizaciones. Revise la conexión a internet e intente de nuevo.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function instalarActualizacion(disponible: Update | null = update) {
    if (!disponible) return;
    setInstalling(true);
    setUpdateError("");
    setProgress("Descargando…");
    try {
      let total = 0;
      let descargado = 0;
      await disponible.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          descargado += event.data.chunkLength;
          if (total > 0) {
            setProgress(`Descargando ${Math.round((descargado / total) * 100)}%…`);
          }
        } else if (event.event === "Finished") {
          setProgress("Instalando…");
        }
      });
      setProgress("Actualización instalada. Reiniciando…");
      await relaunch();
    } catch (e) {
      console.error(e);
      setUpdateError("No se pudo instalar la actualización. Intente de nuevo.");
      setProgress("");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-chip">
            <Download className="h-5 w-5" />
          </span>
          <div>
            <h2 className="card-title">Actualizaciones</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Busca, descarga e instala la última versión disponible.
            </p>
          </div>
        </div>
        <Badge tone="accent">Versión instalada v{version || "0.1.0"}</Badge>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={buscarActualizacion}
          disabled={checking || installing || esDev}
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Buscando…" : "Buscar actualización"}
        </Button>
        {update && !esDev ? (
          <Button onClick={() => void instalarActualizacion()} disabled={installing}>
            <Download className="h-4 w-4" />
            {installing ? progress || "Instalando…" : `Instalar v${update.version}`}
          </Button>
        ) : null}
      </div>

      {updateMsg ? (
        <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
          {updateMsg}
        </div>
      ) : null}
      {update?.body ? (
        <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
          <p className="mb-1 font-semibold text-fg">Novedades de v{update.version}</p>
          <p className="whitespace-pre-line">{update.body}</p>
        </div>
      ) : null}
      {update && installing ? (
        <p className="mt-3 text-sm font-medium text-accent-fg">{progress}</p>
      ) : null}
      {updateError ? <Alert className="mb-0 mt-4">{updateError}</Alert> : null}

      {esDev ? (
        <p className="mt-4 text-xs text-fg-muted">
          Modo desarrollo: las actualizaciones solo se buscan e instalan en la app compilada
          para producción.
        </p>
      ) : (
        <p className="mt-4 text-xs text-fg-faint">
          Requiere conexión a internet. Si no hay una versión nueva, la app sigue funcionando
          sin cambios.
        </p>
      )}
    </Card>
  );
}
