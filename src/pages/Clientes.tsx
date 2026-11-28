import { EmptyState } from "@/components/ui/empty-state";
import { useEffect, useState, type FormEvent } from "react";
import { Contact, CreditCard, Pencil, Plus, Receipt, Search, UserCheck, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { condicionLabel, fechaHora, lempiras, pagoLabel } from "@/lib/format";
import type { Cliente, ClienteIn, VentaListado } from "@/lib/types";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const empty: ClienteIn = {
  id: undefined,
  nombre: "",
  telefono: "",
  correo: "",
  direccion: "",
  activo: true,
};

export function ClientesPage() {
  const toast = useToast();
  const { user, puede } = useAuth();
  const esCaja = user?.rol === "caja";
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cliente[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ClienteIn>(empty);

  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [facturas, setFacturas] = useState<VentaListado[]>([]);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);

  async function load() {
    setRows(await api.listarClientes(q, false));
  }

  useEffect(() => {
    load().catch((e) => toast.error(String(e)));
  }, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    try {
      setRows(await api.listarClientes(q, false));
    } catch (err) {
      toast.error(String(err));
    }
  }

  function edit(c?: Cliente) {
    setForm(
      c
        ? {
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
            correo: c.correo,
            direccion: c.direccion,
            activo: c.activo,
          }
        : empty,
    );
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarCliente(form);
      setOpen(false);
      await load();
      toast.ok(form.id ? "Cliente actualizado." : "Cliente guardado.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function verFacturas(c: Cliente) {
    setClienteSel(c);
    setFacturas([]);
    setCargandoFacturas(true);
    try {
      setFacturas(await api.facturasCliente(c.id));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCargandoFacturas(false);
    }
  }

  const activos = rows.filter((c) => c.activo).length;
  const conCredito = rows.filter((c) => c.ventas_credito > 0).length;
  const totalComprado = rows.reduce((s, c) => s + c.total_comprado, 0);

  return (
    <div className="page">
      <PageHero
        title="Clientes"
        subtitle="Directorio y facturas asociadas"
        description="Registra clientes, consulta cuánto han comprado y revisa el historial de facturas de cada uno."
        icon={Contact}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Clientes"
          value={rows.length}
          hint="En el filtro actual"
          icon={<Contact className="h-5 w-5" />}
        />
        <Stat
          label="Activos"
          value={activos}
          hint="En el directorio"
          tone="ok"
          icon={<UserCheck className="h-5 w-5" />}
        />
        <Stat
          label="Con crédito"
          value={conCredito}
          hint="Compraron al crédito"
          tone="warn"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <Stat
          label="Total comprado"
          value={lempiras(totalComprado)}
          hint="Facturas completadas"
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>
      {puede("/clientes", "crear") ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button onClick={() => edit()}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      ) : null}

      <div className="mb-4">
        <form onSubmit={search} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, teléfono o correo"
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      <Card className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Correo</th>
              <th>Dirección</th>
              <th className="num">Facturas</th>
              <th className="num">Total comprado</th>
              <th>Condición</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <p className="font-medium">{c.nombre}</p>
                  <p className="text-xs text-fg-muted">{c.telefono || "Sin teléfono"}</p>
                </td>
                <td className="text-fg-muted">{c.correo || "—"}</td>
                <td className="text-fg-muted">{c.direccion || "—"}</td>
                <td className="num">{c.facturas}</td>
                <td className="num font-semibold">{lempiras(c.total_comprado)}</td>
                <td>
                  <Badge
                    tone={
                      c.condicion === "credito"
                        ? "warn"
                        : c.condicion === "mixto"
                          ? "accent"
                          : c.condicion === "contado"
                            ? "ok"
                            : "default"
                    }
                  >
                    {condicionLabel(c.condicion)}
                  </Badge>
                  {c.ventas_credito > 0 ? (
                    <p className="mt-1 text-xs text-fg-muted">
                      {c.ventas_credito} al crédito · {lempiras(c.total_credito)}
                    </p>
                  ) : null}
                </td>
                <td>{c.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => verFacturas(c)}>
                      <Receipt className="h-3.5 w-3.5" />
                      Facturas
                    </Button>
                    {puede("/clientes", "editar") ? (
                      <Button size="sm" variant="outline" onClick={() => edit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState>No hay clientes con ese criterio.</EmptyState>
        ) : null}
      </Card>

      <Modal
        open={open}
        title={form.id ? "Editar cliente" : "Nuevo cliente"}
        subtitle={form.id ? `Cliente #${form.id}` : "Registre los datos del cliente"}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <div>
              <Label>Correo</Label>
              <Input
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Dirección</Label>
            <Input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Cliente activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar cliente</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!clienteSel}
        title={`${esCaja ? "Facturas de hoy" : "Facturas"} · ${clienteSel?.nombre ?? ""}`}
        subtitle={
          !clienteSel
            ? undefined
            : esCaja
              ? "Solo ventas del día actual"
              : `${clienteSel.facturas} facturas · ${lempiras(clienteSel.total_comprado)}${clienteSel.ventas_credito > 0 ? ` · ${clienteSel.ventas_credito} al crédito` : ""}`
        }
        onClose={() => setClienteSel(null)}
        wide
      >
        {cargandoFacturas ? (
          <p className="text-sm text-fg-muted">Cargando facturas…</p>
        ) : facturas.length === 0 ? (
          <EmptyState>
            {esCaja
              ? "Este cliente no tiene facturas hoy."
              : "Este cliente todavía no tiene facturas."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Fecha</th>
                  <th>Cajero</th>
                  <th>Pago</th>
                  <th>Condición</th>
                  <th>Estado</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((v) => (
                  <tr key={v.id}>
                    <td className="font-semibold">#{v.id}</td>
                    <td className="whitespace-nowrap text-fg-muted">{fechaHora(v.fecha)}</td>
                    <td>{v.usuario_nombre}</td>
                    <td>{pagoLabel(v.metodo_pago)}</td>
                    <td
                      className={
                        v.condicion === "credito"
                          ? "font-medium text-warn-fg"
                          : "text-fg-muted"
                      }
                    >
                      {condicionLabel(v.condicion)}
                    </td>
                    <td>
                      {v.estado === "anulada" ? (
                        <Badge tone="danger">Anulada</Badge>
                      ) : (
                        <Badge tone="ok">Completada</Badge>
                      )}
                    </td>
                    <td className="num font-semibold">{lempiras(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
