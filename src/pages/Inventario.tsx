import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownUp, History, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fechaHora, lempiras } from "@/lib/format";
import type { CatalogoSimple, Movimiento, Producto } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const emptyForm = {
  id: undefined as number | undefined,
  sku: "",
  codigo_barras: "",
  nombre: "",
  marca: "",
  medida: "",
  modelo: "",
  dot: "",
  proveedor_id: 1 as number | null,
  costo: 0,
  precio_venta: 0,
  stock: 0,
  stock_minimo: 2,
  sucursal_id: 1 as number | null,
  activo: true,
};

export function InventarioPage() {
  const { user } = useAuth();
  const isAdmin = user?.rol === "admin";
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<CatalogoSimple[]>([]);
  const [sucursales, setSucursales] = useState<CatalogoSimple[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [mov, setMov] = useState<Producto | null>(null);
  const [movTipo, setMovTipo] = useState("entrada");
  const [movCant, setMovCant] = useState(1);
  const [movMotivo, setMovMotivo] = useState("");
  const [kardexOpen, setKardexOpen] = useState(false);
  const [kardexRows, setKardexRows] = useState<Movimiento[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [p, pr, su] = await Promise.all([
      api.listarProductos(q, false),
      api.listarProveedores(),
      api.listarSucursales(),
    ]);
    setRows(p);
    setProveedores(pr);
    setSucursales(su);
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    try {
      setRows(await api.listarProductos(q, false));
    } catch (err) {
      setError(String(err));
    }
  }

  function edit(p?: Producto) {
    if (!p) {
      setForm({ ...emptyForm, proveedor_id: proveedores[0]?.id ?? 1, sucursal_id: sucursales[0]?.id ?? 1 });
    } else {
      setForm({
        id: p.id,
        sku: p.sku,
        codigo_barras: p.codigo_barras,
        nombre: p.nombre,
        marca: p.marca,
        medida: p.medida,
        modelo: p.modelo,
        dot: p.dot,
        proveedor_id: p.proveedor_id,
        costo: p.costo ?? 0,
        precio_venta: p.precio_venta,
        stock: p.stock,
        stock_minimo: p.stock_minimo,
        sucursal_id: p.sucursal_id,
        activo: p.activo,
      });
    }
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarProducto(form);
      setOpen(false);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function applyMov(e: FormEvent) {
    e.preventDefault();
    if (!mov) return;
    try {
      await api.movimientoInventario(mov.id, movTipo, movCant, movMotivo);
      setMov(null);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function openKardex(p?: Producto) {
    try {
      setKardexRows(await api.kardex(p?.id ?? null));
      setKardexOpen(true);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="page">
      <PageHeader title="Inventario" subtitle="Llantas y productos · kardex y stock mínimo">
        <Button variant="outline" onClick={() => openKardex()}>
          <History className="h-4 w-4" />
          Kardex general
        </Button>
        <Button onClick={() => edit()}>
          <Plus className="h-4 w-4" />
          Nueva llanta
        </Button>
      </PageHeader>
      {error ? <Alert>{error}</Alert> : null}

      <Card className="mb-4 p-3">
        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, código, marca o medida"
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Código</th>
              <th>Medida</th>
              {isAdmin ? <th className="num">Costo</th> : null}
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={!p.activo ? "opacity-55" : undefined}>
                <td>
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-xs text-fg-muted">
                    {p.marca} {p.modelo}
                  </p>
                </td>
                <td className="font-mono text-xs text-fg-muted">{p.codigo_barras}</td>
                <td>{p.medida}</td>
                {isAdmin ? <td className="num">{lempiras(p.costo ?? 0)}</td> : null}
                <td className="num font-semibold">{lempiras(p.precio_venta)}</td>
                <td className="num">
                  {p.stock <= p.stock_minimo ? (
                    <Badge tone="warn">{p.stock}</Badge>
                  ) : (
                    <span className="font-semibold">{p.stock}</span>
                  )}
                </td>
                <td>{p.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => edit(p)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setMov(p);
                        setMovCant(1);
                        setMovMotivo("");
                      }}
                    >
                      <ArrowDownUp className="h-3.5 w-3.5" />
                      Mover
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openKardex(p)}>
                      Kardex
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="empty-state">No se encontraron productos con ese criterio.</p>
        ) : null}
      </Card>

      <Modal
        open={open}
        title={form.id ? "Editar producto" : "Nueva llanta"}
        subtitle={form.id ? `Ficha #${form.id}` : "Registre una llanta o producto nuevo"}
        onClose={() => setOpen(false)}
        wide
      >
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Nombre</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          <div>
            <Label>Código de barras</Label>
            <Input value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>Marca</Label>
            <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
          </div>
          <div>
            <Label>Medida</Label>
            <Input value={form.medida} onChange={(e) => setForm({ ...form, medida: e.target.value })} placeholder="205/55R16" />
          </div>
          <div>
            <Label>Modelo</Label>
            <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          </div>
          <div>
            <Label>DOT</Label>
            <Input value={form.dot} onChange={(e) => setForm({ ...form, dot: e.target.value })} />
          </div>
          <div>
            <Label>Proveedor</Label>
            <Select
              value={form.proveedor_id ?? ""}
              onChange={(e) => setForm({ ...form, proveedor_id: Number(e.target.value) })}
            >
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Sucursal</Label>
            <Select
              value={form.sucursal_id ?? ""}
              onChange={(e) => setForm({ ...form, sucursal_id: Number(e.target.value) })}
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </Select>
          </div>
          {isAdmin ? (
            <div>
              <Label>Costo (L)</Label>
              <Input type="number" step="0.01" value={form.costo} onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })} />
            </div>
          ) : null}
          <div>
            <Label>Precio de venta (L)</Label>
            <Input type="number" step="0.01" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: Number(e.target.value) })} />
          </div>
          {!form.id ? (
            <div>
              <Label>Stock inicial</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
            </div>
          ) : null}
          <div>
            <Label>Stock mínimo</Label>
            <Input type="number" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Producto activo
            </label>
          </div>
          <div className="col-span-2 mt-1 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar producto</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!mov}
        title={`Movimiento · ${mov?.nombre ?? ""}`}
        subtitle={`Stock actual: ${mov?.stock ?? 0} unidades`}
        onClose={() => setMov(null)}
      >
        <form onSubmit={applyMov} className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={movTipo} onChange={(e) => setMovTipo(e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste (dejar stock en…)</option>
            </Select>
          </div>
          <div>
            <Label>{movTipo === "ajuste" ? "Nuevo stock" : "Cantidad"}</Label>
            <Input type="number" min={0} value={movCant} onChange={(e) => setMovCant(Number(e.target.value))} />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" size="lg">Aplicar movimiento</Button>
        </form>
      </Modal>

      <Modal open={kardexOpen} title="Kardex" subtitle="Historial de movimientos de inventario" onClose={() => setKardexOpen(false)} wide>
        {kardexRows.length === 0 ? (
          <p className="empty-state">Sin movimientos registrados.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th className="num">Cant.</th>
                <th>Usuario</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {kardexRows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-fg-muted">{fechaHora(m.fecha)}</td>
                  <td className="font-medium">{m.producto_nombre}</td>
                  <td>
                    <Badge tone={m.tipo === "entrada" ? "ok" : m.tipo === "salida" ? "danger" : "accent"}>
                      {m.tipo}
                    </Badge>
                  </td>
                  <td className="num font-semibold">{m.cantidad}</td>
                  <td>{m.usuario_nombre}</td>
                  <td className="text-fg-muted">{m.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
