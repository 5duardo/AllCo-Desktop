import { useEffect, useState } from "react";
import {
  Database,
  DatabaseBackup,
  FolderOpen,
  HardDrive,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { bytes, fechaHora } from "@/lib/format";
import type { StatusSistema } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

function estadoRespaldo(s: string) {
  if (s === "al_dia") return { label: "Al día", tone: "ok" as const };
  if (s === "fallido") return { label: "Fallido", tone: "danger" as const };
  return { label: "Atrasado", tone: "warn" as const };
}

export function BaseDatosPage() {
  const toast = useToast();
  const { puede } = useAuth();
  const [data, setData] = useState<StatusSistema | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setData(await api.statusSistema());
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function backup() {
    setBusy(true);
    try {
      const path = await api.respaldoLocal();
      toast.ok(`Copia de seguridad guardada: ${path}`);
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function eliminar() {
    if (confirmText !== "ELIMINAR") return;
    setDeleting(true);
    try {
      const path = await api.eliminarDatos();
      toast.ok(`Datos eliminados. Copia de seguridad creada en: ${path}`);
      setConfirmOpen(false);
      setConfirmText("");
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (!data)
    return (
      <div className="page">
        {error ? <Alert>{error}</Alert> : <p className="text-sm text-fg-muted">Cargando…</p>}
      </div>
    );

  const backupTone = estadoRespaldo(data.estado_respaldo);

  return (
    <div className="page">
      <PageHero
        title="Base de datos"
        subtitle="Copias de seguridad y mantenimiento"
        description="Revisa el tamaño de la base, administra los respaldos locales y elimina datos operativos con una copia de seguridad previa."
        icon={Database}
        badge="Solo administrador"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Base de datos"
          value={bytes(data.db_bytes)}
          hint={`Disco libre ${bytes(data.disco_libre_bytes)}`}
          icon={<Database className="h-5 w-5" />}
        />
        <Stat
          label="Respaldo local"
          value={<Badge tone={backupTone.tone}>{backupTone.label}</Badge>}
          hint={fechaHora(data.ultimo_respaldo_local)}
          icon={<DatabaseBackup className="h-5 w-5" />}
        />
        <Stat
          label="Sesión actual"
          value={<span className="text-lg">{fechaHora(data.sesion_inicio)}</span>}
          hint={`App desde ${fechaHora(data.started_at)}`}
        />
      </div>

      <Card className="mt-5 p-6">
        <h2 className="card-title flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-accent-fg" />
          Copias de seguridad
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Los respaldos se guardan en la carpeta de la app. Antes de eliminar
          datos, se crea una copia automática y se conserva.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={backup} disabled={busy}>
            <DatabaseBackup className="h-4 w-4" />
            {busy ? "Respaldando…" : "Respaldar ahora"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => api.abrirCarpetaDatos().catch((e) => toast.error(String(e)))}
          >
            <FolderOpen className="h-4 w-4" />
            Carpeta de datos
          </Button>
          <Button
            variant="secondary"
            onClick={() => api.abrirCarpetaRespaldos().catch((e) => toast.error(String(e)))}
          >
            <HardDrive className="h-4 w-4" />
            Respaldos
          </Button>
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <h2 className="card-title flex items-center gap-2 text-danger-fg">
          <ShieldAlert className="h-4 w-4" />
          Zona de riesgo
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Elimina productos, servicios, clientes, ventas, movimientos de
          inventario y copias de facturas. Se conservan usuarios, configuración
          y todas las copias de seguridad.
        </p>
        <div className="mt-4 flex justify-end">
          {puede("/base-datos", "eliminar") ? (
            <Button
              variant="danger"
              onClick={() => {
                setConfirmText("");
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar datos operativos
            </Button>
          ) : null}
        </div>
      </Card>

      <Modal
        open={confirmOpen}
        title="Eliminar datos operativos"
        subtitle="Esta acción no se puede deshacer"
        onClose={() => setConfirmOpen(false)}
      >
        <Alert tone="warn">
          Se borrarán productos, servicios, clientes, ventas, movimientos y las
          copias de facturas. Antes de borrar se creará un respaldo automático.
        </Alert>
        <p className="mt-4 text-sm text-fg-muted">
          Para confirmar, escriba <b className="text-fg">ELIMINAR</b>:
        </p>
        <Label className="mt-3">Confirmación</Label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="ELIMINAR"
          autoFocus
        />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={eliminar}
            disabled={deleting || confirmText !== "ELIMINAR"}
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Eliminando…" : "Crear respaldo y eliminar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
