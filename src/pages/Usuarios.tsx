import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { rolLabel } from "@/lib/format";
import {
  ACCIONES,
  MODULOS_CONFIGURABLES,
  type PermisosModulo,
} from "@/lib/permisos";
import type { Usuario } from "@/lib/types";
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

export function UsuariosSection() {
  const toast = useToast();
  const { user, recargarPermisos, puede } = useAuth();
  const [rows, setRows] = useState<Usuario[]>([]);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [permisosTarget, setPermisosTarget] = useState<Usuario | null>(null);
  const [modulosSel, setModulosSel] = useState<PermisosModulo[]>([]);
  const [cargandoPermisos, setCargandoPermisos] = useState(false);

  async function load() {
    setRows(await api.listarUsuarios());
  }

  useEffect(() => {
    load().catch((e) => toast.error(String(e)));
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
      toast.ok(form.id ? "Usuario actualizado." : "Usuario creado.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function abrirPermisos(u: Usuario) {
    setPermisosTarget(u);
    setModulosSel([]);
    setCargandoPermisos(true);
    try {
      const actuales = await api.obtenerPermisos(u.id);
      const porRol = actuales === null;
      setModulosSel(
        MODULOS_CONFIGURABLES.map((m) => {
          const acceso = porRol
            ? m.roles.includes(u.rol)
            : !!actuales?.some(
                (k) => k === m.id || k === `m:${m.id}` || k.startsWith(`${m.id}:`),
              );
          const legacy = !!actuales?.includes(m.id);
          return {
            modulo: m.id,
            acceso,
            crear: acceso && (porRol || legacy || !!actuales?.includes(`${m.id}:crear`)),
            editar: acceso && (porRol || legacy || !!actuales?.includes(`${m.id}:editar`)),
            eliminar: acceso && (porRol || legacy || !!actuales?.includes(`${m.id}:eliminar`)),
          };
        }),
      );
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCargandoPermisos(false);
    }
  }

  async function guardarPermisos() {
    if (!permisosTarget) return;
    try {
      await api.guardarPermisos(
        permisosTarget.id,
        modulosSel.filter((m) => m.acceso),
      );
      if (permisosTarget.id === user?.id) await recargarPermisos();
      setPermisosTarget(null);
      toast.ok("Permisos actualizados.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="card-title flex items-center gap-2">
            <Users className="h-4 w-4 text-accent-fg" />
            Usuarios
          </h2>
          <Badge>{rows.length}</Badge>
        </div>
        {puede("/config", "crear") ? (
          <Button
            onClick={() => {
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        ) : null}
      </div>

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
                  <div className="flex justify-end gap-2">
                    {u.dev && !user?.dev ? (
                      <Badge>Solo dev</Badge>
                    ) : (
                      <>
                        {puede("/config", "editar") ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void abrirPermisos(u)}
                              title={`Permisos de ${u.nombre}`}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Permisos
                            </Button>
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
                          </>
                        ) : null}
                      </>
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

      <Modal
        open={permisosTarget !== null}
        title={`Permisos de ${permisosTarget?.nombre ?? ""}`}
        subtitle="Módulos y acciones permitidas para este usuario"
        onClose={() => setPermisosTarget(null)}
      >
        <p className="mb-4 text-xs text-fg-muted">
          Al guardar, esta lista reemplaza el acceso que le daba su rol. El resumen
          y Configuración siempre quedan disponibles para administradores.
        </p>
        {cargandoPermisos ? (
          <p className="py-6 text-center text-sm text-fg-muted">Cargando permisos…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {modulosSel.map((m, i) => (
              <div
                key={m.modulo}
                className="rounded-xl border border-border bg-surface-2 px-3 py-2.5"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={m.acceso}
                    onChange={(e) =>
                      setModulosSel((prev) =>
                        prev.map((p, idx) =>
                          idx === i
                            ? {
                                ...p,
                                acceso: e.target.checked,
                                crear: e.target.checked && p.crear,
                                editar: e.target.checked && p.editar,
                                eliminar: e.target.checked && p.eliminar,
                              }
                            : p,
                        )
                      )
                    }
                  />
                  {MODULOS_CONFIGURABLES[i].label}
                </label>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
                  {ACCIONES.map((a) => (
                    <label
                      key={a.id}
                      className={`flex items-center gap-1.5 text-xs ${
                        m.acceso ? "cursor-pointer text-fg-muted" : "text-fg-faint"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={m[a.id]}
                        disabled={!m.acceso}
                        onChange={(e) =>
                          setModulosSel((prev) =>
                            prev.map((p, idx) =>
                              idx === i ? { ...p, [a.id]: e.target.checked } : p,
                            )
                          )
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPermisosTarget(null)}>
            Cancelar
          </Button>
          <Button onClick={() => void guardarPermisos()} disabled={cargandoPermisos}>
            Guardar permisos
          </Button>
        </div>
      </Modal>
    </>
  );
}
