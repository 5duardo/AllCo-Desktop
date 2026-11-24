import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import type { Empleado, EmpleadoIn } from "@/lib/types";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const vacio: EmpleadoIn = {
  nombre: "",
  puesto: "",
  telefono: "",
  activo: true,
};

export function EmpleadosPage() {
  const toast = useToast();
  const { puede } = useAuth();
  const [rows, setRows] = useState<Empleado[]>([]);
  const [form, setForm] = useState<EmpleadoIn>(vacio);
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState("");

  async function load() {
    setRows(await api.listarEmpleados());
  }

  useEffect(() => {
    load().catch((e) => toast.error(String(e)));
  }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) =>
      [e.nombre, e.puesto, e.telefono].some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, buscar]);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarEmpleado(form);
      setOpen(false);
      await load();
      toast.ok(form.id ? "Empleado actualizado." : "Empleado creado.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <div className="page">
      <PageHero
        title="Empleados"
        subtitle="Personal del negocio"
        description="Registra al personal, su puesto y su información de contacto."
        icon={Users}
        badge={`${rows.length} empleados`}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar empleado…"
          className="w-full sm:max-w-xs"
          aria-label="Buscar empleado"
        />
        {puede("/empleados", "crear") ? (
          <Button
            onClick={() => {
              setForm(vacio);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        ) : null}
      </div>

      <Card className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.id} className={!e.activo ? "opacity-55" : undefined}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-fg">
                      {e.nombre
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="font-medium">{e.nombre}</span>
                  </div>
                </td>
                <td className="text-fg-muted">{e.puesto || "—"}</td>
                <td className="font-mono text-xs text-fg-muted">{e.telefono || "—"}</td>
                <td>
                  {e.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}
                </td>
                <td>
                  <div className="flex justify-end">
                    {puede("/empleados", "editar") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setForm({
                            id: e.id,
                            nombre: e.nombre,
                            puesto: e.puesto,
                            telefono: e.telefono,
                            activo: e.activo,
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No hay empleados para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        title={form.id ? "Editar empleado" : "Nuevo empleado"}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Puesto</Label>
            <Input
              value={form.puesto}
              onChange={(e) => setForm({ ...form, puesto: e.target.value })}
              placeholder="Ej. Operario, administrativo…"
            />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Empleado activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar empleado</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
