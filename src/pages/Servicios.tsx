import { useEffect, useState, type FormEvent } from "react";
import { Clock, Pencil, Plus, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { lempiras } from "@/lib/format";
import type { Servicio } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const empty = {
  id: undefined as number | undefined,
  nombre: "",
  descripcion: "",
  precio: 0,
  duracion_min: 20,
  activo: true,
};

export function ServiciosPage() {
  const [rows, setRows] = useState<Servicio[]>([]);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setRows(await api.listarServicios(false));
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarServicio(form);
      setOpen(false);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="page">
      <PageHero
        title="Servicios"
        subtitle="Catálogo de servicios: precios y tiempos estimados"
        description="Administra los servicios que se venden en Caja, con su precio y duración estimada."
        icon={Wrench}
        badge={`${rows.length} servicios`}
      />
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            setForm(empty);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <Card key={s.id} className={`p-5 ${!s.activo ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="icon-chip">
                <Wrench className="h-5 w-5" />
              </div>
              {s.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}
            </div>
            <h2 className="mt-3 text-lg font-bold">{s.nombre}</h2>
            <p className="mt-0.5 min-h-5 text-sm text-fg-muted">{s.descripcion}</p>
            <div className="mt-4 flex items-end justify-between gap-2 pt-1">
              <div>
                <p className="text-2xl font-bold tabular-nums text-accent-fg">{lempiras(s.precio)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                  <Clock className="h-3.5 w-3.5" />
                  {s.duracion_min} min aprox.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setForm({ ...s });
                  setOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card>
          <p className="empty-state">Todavía no hay servicios en el catálogo.</p>
        </Card>
      ) : null}

      <Modal open={open} title={form.id ? "Editar servicio" : "Nuevo servicio"} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Precio (L)</Label>
              <Input type="number" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Duración (min)</Label>
              <Input type="number" value={form.duracion_min} onChange={(e) => setForm({ ...form, duracion_min: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Servicio activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar servicio</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
