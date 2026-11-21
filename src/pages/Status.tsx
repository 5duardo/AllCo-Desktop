import { useEffect, useState } from "react";
import {
  DatabaseBackup,
  FolderOpen,
  HardDrive,
  Printer,
  ScanBarcode,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { bytes, fechaHora, rolLabel } from "@/lib/format";
import type { StatusSistema } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";

function estadoRespaldo(s: string) {
  if (s === "al_dia") return { label: "Al día", tone: "ok" as const };
  if (s === "fallido") return { label: "Fallido", tone: "danger" as const };
  return { label: "Atrasado", tone: "warn" as const };
}

function impresoraLabel(s: string) {
  if (s === "lista") return { label: "Lista (último ticket OK)", tone: "ok" as const };
  if (s === "error") return { label: "Error de impresión", tone: "danger" as const };
  return { label: "Sin uso aún", tone: "default" as const };
}

export function StatusPage() {
  const [data, setData] = useState<StatusSistema | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setData(await api.statusSistema());
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function backup() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const path = await api.respaldoLocal();
      setMsg(`Respaldo guardado: ${path}`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <div className="page">
        {error ? <Alert>{error}</Alert> : <p className="text-sm text-fg-muted">Cargando status…</p>}
      </div>
    );

  const backupTone = estadoRespaldo(data.estado_respaldo);
  const printTone = impresoraLabel(data.impresora);
  const scan = data.ultimo_escaneo?.split("|")[0];

  return (
    <div className="page">
      <PageHeader
        title="Status de uso del sistema"
        subtitle="Salud de la instalación, actividad y periféricos. Solo administrador."
      >
        <Button variant="outline" onClick={() => api.abrirCarpetaDatos().catch((e) => setError(String(e)))}>
          <FolderOpen className="h-4 w-4" />
          Carpeta de datos
        </Button>
        <Button variant="outline" onClick={() => api.abrirCarpetaRespaldos().catch((e) => setError(String(e)))}>
          <HardDrive className="h-4 w-4" />
          Respaldos
        </Button>
        <Button onClick={backup} disabled={busy}>
          <DatabaseBackup className="h-4 w-4" />
          {busy ? "Respaldando…" : "Respaldar ahora"}
        </Button>
      </PageHeader>

      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      {data.alertas.length > 0 ? (
        <div className="mb-5 space-y-2">
          {data.alertas.map((a, i) => (
            <Alert key={i} tone={a.nivel === "danger" ? "danger" : "warn"} className="mb-0">
              {a.mensaje}
            </Alert>
          ))}
        </div>
      ) : null}

      <h2 className="section-title mb-3">Salud de la instalación</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Versión" value={`v${data.version}`} hint="Actualizaciones: pendiente de hosting" />
        <Stat label="Base de datos" value={bytes(data.db_bytes)} hint={`Disco libre ${bytes(data.disco_libre_bytes)}`} />
        <Stat
          label="Respaldo local"
          value={<Badge tone={backupTone.tone}>{backupTone.label}</Badge>}
          hint={fechaHora(data.ultimo_respaldo_local)}
        />
        <Stat
          label="Sesión / arranque"
          value={<span className="text-lg">{fechaHora(data.sesion_inicio)}</span>}
          hint={`App desde ${fechaHora(data.started_at)}`}
        />
      </div>

      <h2 className="section-title mb-3 mt-7">Actividad de hoy</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ventas" value={data.ventas_hoy} />
        <Stat label="Ítems vendidos" value={data.items_hoy} />
        <Stat label="Movimientos de inventario" value={data.movimientos_hoy} />
        <Stat label="Tickets generados" value={data.tickets_hoy} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Productos activos" value={data.total_productos} />
        <Stat label="Servicios activos" value={data.total_servicios} />
        <Stat label="Usuarios activos" value={data.total_usuarios} />
        <Stat label="Ventas del mes" value={data.ventas_mes} />
      </div>

      <h2 className="section-title mb-3 mt-7">Periféricos</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex items-start gap-3 p-4">
          <div className="icon-chip">
            <Printer className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-fg-muted">Impresora térmica</p>
            <div className="mt-1">
              <Badge tone={printTone.tone}>{printTone.label}</Badge>
            </div>
            {data.ultimo_error_impresion ? (
              <p className="mt-1.5 text-xs text-danger-fg">{data.ultimo_error_impresion}</p>
            ) : null}
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-4">
          <div className="icon-chip">
            <ScanBarcode className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-fg-muted">Lector de código de barras</p>
            <p className="mt-1 font-semibold">{scan ? fechaHora(scan) : "Ninguno en esta sesión"}</p>
            <p className="text-xs text-fg-muted">Último escaneo registrado</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-4">
          <div className={`icon-chip ${data.online ? "" : "bg-surface-2 text-fg-faint"}`}>
            {data.online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs text-fg-muted">Internet (solo informativo)</p>
            <p className="mt-1 font-semibold">{data.online ? "Conectado" : "Sin conexión"}</p>
            <p className="text-xs text-fg-muted">
              {data.online ? "Se puede actualizar o respaldar en la nube." : "La caja sigue operando offline."}
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-7 grid items-start gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="card-title mb-3">Inicios de sesión de hoy</h3>
          {data.logins_hoy.length === 0 ? (
            <p className="text-sm text-fg-muted">Nadie más ha entrado hoy.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.logins_hoy.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-medium">{l.nombre}</span>
                    <span className="text-fg-muted"> · {rolLabel(l.rol)}</span>
                  </span>
                  <span className="whitespace-nowrap text-fg-muted">{fechaHora(l.inicio)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="card-title mb-3">Últimos errores</h3>
          {data.errores_recientes.length === 0 ? (
            <p className="text-sm text-fg-muted">Sin fallos registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.errores_recientes.map((e) => (
                <li key={e.id} className="py-2.5">
                  <Badge tone="danger" className="mr-2 font-mono">{e.tipo}</Badge>
                  {e.mensaje}
                  <span className="mt-1 block text-xs text-fg-muted">{fechaHora(e.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <div className="flex items-center gap-2 bg-surface-2 px-5 py-4">
          <HardDrive className="h-4 w-4 text-fg-muted" />
          <h3 className="card-title">Bitácora del sistema</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Usuario</th>
              <th>Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {data.bitacora.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-fg-muted">{fechaHora(e.fecha)}</td>
                <td>
                  <Badge className="font-mono">{e.tipo}</Badge>
                </td>
                <td>{e.usuario_nombre ?? "—"}</td>
                <td className="text-fg-muted">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
