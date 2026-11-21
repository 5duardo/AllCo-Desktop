import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { rolLabel } from "@/lib/format";
import type { Usuario } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const empty = {
  id: undefined as number | undefined,
  nombre: "",
  usuario: "",
  password: "",
  rol: "caja",
  activo: true,
};

export function UsuariosPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Usuario[]>([]);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setRows(await api.listarUsuarios());
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarUsuario({
        ...form,
        password: form.password || null,
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="page">
      <PageHero
        title="Usuarios"
        subtitle="Administrador, bodega y caja"
        description="Crea y administra las cuentas de acceso, sus roles y su estado dentro del sistema."
        icon={Users}
        badge={`${rows.length} usuarios`}
      />
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            setForm(empty);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <Card className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={!u.activo ? "opacity-55" : undefined}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-fg">
                      {u.nombre
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="font-medium">{u.nombre}</span>
                  </div>
                </td>
                <td className="font-mono text-xs text-fg-muted">{u.usuario}</td>
                <td>
                  <Badge tone={u.rol === "admin" ? "accent" : "default"}>
                    {u.dev ? "Desarrollador" : rolLabel(u.rol)}
                  </Badge>
                </td>
                <td>{u.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td>
                  <div className="flex justify-end">
                    {u.dev && !user?.dev ? (
                      <Badge>Solo dev</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setForm({ ...u, password: "" });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} title={form.id ? "Editar usuario" : "Nuevo usuario"} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          <div>
            <Label>Usuario</Label>
            <Input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} required />
          </div>
          <div>
            <Label>{form.id ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!form.id}
            />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
              <option value="admin">Administrador</option>
              <option value="bodega">Bodega</option>
              <option value="caja">Caja</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Usuario activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar usuario</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
