import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Banknote, CheckCircle2, Package, ScanBarcode, Search, ShoppingCart, Trash2, UserPlus, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { lempiras } from "@/lib/format";
import type { CartLine, Cliente, Producto, Servicio } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function PosPage() {
  const { user } = useAuth();
  const scanRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [clienteModal, setClienteModal] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: "",
    telefono: "",
    correo: "",
    direccion: "",
  });
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState("");
  const [catalogo, setCatalogo] = useState<"productos" | "servicios">("productos");
  const [busqueda, setBusqueda] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [error, setError] = useState("");
  const [factura, setFactura] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canDiscount = user?.rol === "admin";

  async function cargarCatalogos() {
    const [s, p, c] = await Promise.all([
      api.listarServicios(true),
      api.listarProductos(undefined, true),
      api.listarClientes(undefined, true),
    ]);
    setServicios(s);
    setProductos(p);
    setClientes(c);
  }

  useEffect(() => {
    cargarCatalogos().catch((e) => setError(String(e)));
    scanRef.current?.focus();
  }, []);

  const filtro = busqueda.trim().toLowerCase();
  const productosFiltrados = productos.filter(
    (p) =>
      !filtro ||
      [p.nombre, p.marca, p.modelo, p.medida, p.sku, p.codigo_barras].some((v) =>
        v.toLowerCase().includes(filtro),
      ),
  );
  const serviciosFiltrados = servicios.filter(
    (s) =>
      !filtro ||
      s.nombre.toLowerCase().includes(filtro) ||
      s.descripcion.toLowerCase().includes(filtro),
  );

  const subtotal = cart.reduce(
    (s, l) => s + l.precio_unitario * l.cantidad - l.descuento,
    0,
  );
  const total = Math.max(0, subtotal - descuento);
  const rec = Number(recibido) || 0;
  const cambio = metodo === "efectivo" ? rec - total : 0;

  function focusScan() {
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  async function crearCliente(e: FormEvent) {
    e.preventDefault();
    if (!nuevoCliente.nombre.trim()) {
      setErrorCliente("El nombre del cliente es obligatorio.");
      return;
    }
    setGuardandoCliente(true);
    setErrorCliente("");
    try {
      const id = await api.guardarCliente({ ...nuevoCliente, activo: true });
      const lista = await api.listarClientes(undefined, true);
      setClientes(lista);
      setClienteId(String(id));
      setClienteModal(false);
      setNuevoCliente({ nombre: "", telefono: "", correo: "", direccion: "" });
    } catch (err) {
      setErrorCliente(String(err));
    } finally {
      setGuardandoCliente(false);
    }
  }

  function agregarProducto(p: Producto) {
    if (p.stock <= 0) return;
    addLine({
      tipo: "producto",
      referencia_id: p.id,
      cantidad: 1,
      precio_unitario: p.precio_venta,
      descuento: 0,
      nombre: `${p.nombre}${p.medida ? ` ${p.medida}` : ""}`.trim(),
      stock: p.stock,
    });
  }

  function addLine(line: CartLine) {
    setCart((prev) => {
      const i = prev.findIndex(
        (p) => p.tipo === line.tipo && p.referencia_id === line.referencia_id,
      );
      if (i >= 0) {
        const copy = [...prev];
        const nextQty = copy[i].cantidad + line.cantidad;
        if (line.tipo === "producto" && line.stock != null && nextQty > line.stock) {
          setError(`Stock insuficiente. Disponible: ${line.stock}`);
          return prev;
        }
        copy[i] = { ...copy[i], cantidad: nextQty };
        return copy;
      }
      return [...prev, line];
    });
    setError("");
    focusScan();
  }

  async function onScan(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = codigo.trim();
    if (!code) return;
    setCodigo("");
    try {
      await api.registrarEscaneo(code);
      const p = await api.buscarProductoCodigo(code);
      if (!p) {
        setError(`No hay producto con código ${code}`);
        focusScan();
        return;
      }
      if (p.stock <= 0) {
        setError(`${p.nombre} no tiene stock.`);
        focusScan();
        return;
      }
      addLine({
        tipo: "producto",
        referencia_id: p.id,
        cantidad: 1,
        precio_unitario: p.precio_venta,
        descuento: 0,
        nombre: `${p.nombre} ${p.medida}`.trim(),
        stock: p.stock,
      });
    } catch (err) {
      setError(String(err));
    }
  }

  function setQty(idx: number, qty: number) {
    if (qty < 1) return;
    setCart((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        if (l.stock != null && qty > l.stock) {
          setError(`Stock insuficiente. Disponible: ${l.stock}`);
          return l;
        }
        return { ...l, cantidad: qty };
      }),
    );
  }

  async function cobrar(e: FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      setError("Agregue productos o servicios.");
      return;
    }
    if (metodo === "efectivo" && rec + 0.001 < total) {
      setError("El efectivo recibido es menor al total.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.crearVenta({
        cliente_id: clienteId ? Number(clienteId) : null,
        items: cart.map((l) => ({
          tipo: l.tipo,
          referencia_id: l.referencia_id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          descuento: l.descuento,
        })),
        descuento,
        metodo_pago: metodo,
        recibido: rec,
      });
      setFactura(res.ticket);
      setCart([]);
      setDescuento(0);
      setRecibido("");
      setClienteId("");
      void cargarCatalogos().catch(() => {});
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      focusScan();
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1700px] flex-col p-5">
      <PageHero
        title="Caja"
        subtitle="Cobra productos y servicios y genera la factura."
        description="Escanea productos, agrega servicios, aplica descuentos permitidos y registra el pago en efectivo, tarjeta o transferencia."
        icon={ShoppingCart}
        badge="Punto de venta"
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <ScanBarcode className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-accent-fg" />
          <Input
            ref={scanRef}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={onScan}
            placeholder="Escanee o escriba el código de barras y pulse Enter"
            className="h-14 pl-13 text-lg"
            aria-label="Código de barras"
          />
        </div>
        <Badge tone="accent" className="hidden h-8 px-3 text-sm md:inline-flex">
          <ShoppingCart className="h-4 w-4" />
          {cart.length} ítems
        </Badge>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col gap-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="seg" role="group" aria-label="Catálogo">
                <button
                  type="button"
                  onClick={() => setCatalogo("productos")}
                  aria-pressed={catalogo === "productos"}
                  className={cn("seg-item", catalogo === "productos" && "seg-item-active")}
                >
                  <Package className="h-4 w-4" />
                  Productos
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogo("servicios")}
                  aria-pressed={catalogo === "servicios"}
                  className={cn("seg-item", catalogo === "servicios" && "seg-item-active")}
                >
                  <Wrench className="h-4 w-4" />
                  Servicios
                </button>
              </div>
              <div className="relative min-w-48 flex-1 sm:max-w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar en el catálogo"
                  className="h-9 pl-9 text-sm"
                />
              </div>
            </div>

            <div className="mt-3 max-h-52 overflow-y-auto pr-1">
              {catalogo === "productos" ? (
                productosFiltrados.length === 0 ? (
                  <p className="empty-state">No hay productos para ese criterio.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
                    {productosFiltrados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={p.stock <= 0}
                        onClick={() => agregarProducto(p)}
                        className="rounded-xl border border-border bg-surface-2 p-3 text-left outline-none transition-all hover:-translate-y-0.5 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-surface-2"
                      >
                        <p className="line-clamp-2 font-semibold leading-snug">{p.nombre}</p>
                        <p className="mt-0.5 truncate text-xs text-fg-muted">
                          {p.medida || p.marca || "—"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-accent-fg">
                          {lempiras(p.precio_venta)}
                        </p>
                        <p
                          className={cn(
                            "text-[11px]",
                            p.stock <= p.stock_minimo ? "font-semibold text-warn-fg" : "text-fg-muted",
                          )}
                        >
                          {p.stock > 0 ? `${p.stock} disponibles` : "Sin stock"}
                        </p>
                      </button>
                    ))}
                  </div>
                )
              ) : serviciosFiltrados.length === 0 ? (
                <p className="empty-state">No hay servicios para ese criterio.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
                  {serviciosFiltrados.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        addLine({
                          tipo: "servicio",
                          referencia_id: s.id,
                          cantidad: 1,
                          precio_unitario: s.precio,
                          descuento: 0,
                          nombre: s.nombre,
                        })
                      }
                      className="rounded-xl border border-border bg-surface-2 p-3 text-left outline-none transition-all hover:-translate-y-0.5 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:translate-y-0"
                    >
                      <p className="line-clamp-2 font-semibold leading-snug">{s.nombre}</p>
                      <p className="mt-1 text-sm font-bold text-accent-fg">{lempiras(s.precio)}</p>
                      <p className="text-xs text-fg-muted">{s.duracion_min} min</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between bg-surface-2 px-4 py-3">
              <h2 className="card-title">Factura actual</h2>
              {cart.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                  Vaciar
                </Button>
              ) : null}
            </div>
            {cart.length === 0 ? (
              <p className="empty-state">Escanee un producto o toque un servicio para comenzar.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th className="w-24">Cant.</th>
                    <th className="num">Importe</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((l, i) => (
                    <tr key={`${l.tipo}-${l.referencia_id}`}>
                      <td>
                        <p className="font-medium">{l.nombre}</p>
                        <p className="text-xs text-fg-muted">{lempiras(l.precio_unitario)}</p>
                      </td>
                      <td>
                        <Input
                          type="number"
                          min={1}
                          value={l.cantidad}
                          onChange={(e) => setQty(i, Number(e.target.value))}
                          className="h-9 w-20 rounded-lg px-2 text-sm"
                          aria-label={`Cantidad de ${l.nombre}`}
                        />
                      </td>
                      <td className="num font-semibold">
                        {lempiras(l.precio_unitario * l.cantidad - l.descuento)}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="text-danger-fg hover:bg-danger-soft"
                          onClick={() => setCart((c) => c.filter((_, j) => j !== i))}
                          aria-label={`Quitar ${l.nombre}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card className="h-fit p-5 lg:sticky lg:top-5">
          <form onSubmit={cobrar} className="space-y-4">
            <div className="rounded-2xl bg-accent-soft p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg">
                Total a cobrar
              </p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-fg">
                {lempiras(total)}
              </p>
              {descuento > 0 ? (
                <p className="mt-1 text-xs text-fg-muted">
                  Subtotal {lempiras(subtotal)} · descuento {lempiras(descuento)}
                </p>
              ) : null}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-fg-muted">Cliente</span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorCliente("");
                    setClienteModal(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Nuevo cliente
                </button>
              </div>
              <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Consumidor final</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </div>
            {canDiscount ? (
              <div>
                <Label>Descuento de la factura (L)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={descuento || ""}
                  onChange={(e) => setDescuento(Number(e.target.value) || 0)}
                />
              </div>
            ) : null}
            <div>
              <Label>Método de pago</Label>
              <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </Select>
            </div>
            {metodo === "efectivo" ? (
              <div>
                <Label>Recibido (L)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                />
                <p className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-fg-muted">Cambio</span>
                  <b className={cambio < 0 ? "text-danger-fg" : "text-ok-fg"}>
                    {lempiras(Math.max(0, cambio))}
                  </b>
                </p>
              </div>
            ) : null}
            <Button type="submit" size="xl" className="w-full" disabled={busy}>
              <Banknote className="h-5 w-5" />
              {busy ? "Registrando…" : "Cobrar e imprimir"}
            </Button>
          </form>
        </Card>
      </div>

      <Modal
        open={!!factura}
        title="Venta registrada"
        subtitle="La factura quedó guardada en la carpeta de datos."
        onClose={() => {
          setFactura(null);
          focusScan();
        }}
      >
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ok-fg">
          <CheckCircle2 className="h-5 w-5" />
          Cobro completado correctamente
        </p>
        <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 font-mono text-xs text-fg">
          {factura}
        </pre>
        <p className="mt-3 text-xs text-fg-muted">
          La impresora térmica ESC/POS se conectará en la siguiente iteración.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          onClick={() => {
            setFactura(null);
            focusScan();
          }}
        >
          Nueva venta
        </Button>
      </Modal>

      <Modal
        open={clienteModal}
        title="Nuevo cliente"
        subtitle="Se guardará y quedará seleccionado en la factura"
        onClose={() => setClienteModal(false)}
      >
        <form onSubmit={crearCliente} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={nuevoCliente.nombre}
              onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Teléfono</Label>
              <Input
                value={nuevoCliente.telefono}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
              />
            </div>
            <div>
              <Label>Correo</Label>
              <Input
                type="email"
                value={nuevoCliente.correo}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, correo: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Dirección</Label>
            <Input
              value={nuevoCliente.direccion}
              onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })}
            />
          </div>
          {errorCliente ? <Alert>{errorCliente}</Alert> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setClienteModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardandoCliente}>
              {guardandoCliente ? "Guardando…" : "Guardar cliente"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
