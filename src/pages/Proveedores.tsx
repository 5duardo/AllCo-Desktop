import { EmptyState } from "@/components/ui/empty-state";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import type { Proveedor, ProveedorIn } from "@/lib/types";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const vacio: ProveedorIn = {
  nombre: "",
  contacto: "",
  telefono: "",
  activo: true,
};

export function ProveedoresPage({ sinHero = false, sinPage = false }: { sinHero?: boolean; sinPage?: boolean }) {
  const toast = useToast();
  const { puede } = useAuth();
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [form, setForm] = useState<ProveedorIn>(vacio);
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState("");

  async function load() {
    setRows(await api.listarProveedoresDetalle());
  }

  useEffect(() => {
    load().catch((e) => toast.error(String(e)));
  }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      [p.nombre, p.contacto, p.telefono].some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, buscar]);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarProveedor(form);
      setOpen(false);
      await load();
      toast.ok(form.id ? "Proveedor actualizado." : "Proveedor creado.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <div className={sinPage ? undefined : "page"}>
      {sinHero ? null : <PageHero
        title="Proveedores"
        subtitle="Catálogo de proveedores de inventario"
        description="Registra a los proveedores de los productos y su información de contacto."
        icon={Truck}
      />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar proveedor…"
          className="w-full sm:max-w-xs"
          aria-label="Buscar proveedor"
        />
        {puede("/proveedores", "crear") ? (
          <Button
            onClick={() => {
              setForm(vacio);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        ) : null}
      </div>

      <Card className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className={!p.activo ? "opacity-55" : undefined}>
                <td className="font-medium">{p.nombre}</td>
                <td className="text-fg-muted">{p.contacto || "—"}</td>
                <td className="font-mono text-xs text-fg-muted">{p.telefono || "—"}</td>
                <td>
                  {p.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}
                </td>
                <td>
                  <div className="flex justify-end">
                    {puede("/proveedores", "editar") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setForm({ ...p });
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
                <td colSpan={5} ><EmptyState>
                  No hay proveedores para mostrar.
                </EmptyState></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        title={form.id ? "Editar proveedor" : "Nuevo proveedor"}
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
            <Label>Contacto</Label>
            <Input
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              placeholder="Nombre de la persona de contacto"
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
            Proveedor activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar proveedor</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
