import { useEffect, useRef, useState, type FormEvent } from "react";
import { Banknote, Check, CheckCircle2, CreditCard, Landmark, Maximize2, Minimize2, Package, Printer, Search, ShoppingCart, Trash2, UserPlus, Wrench, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFullscreen } from "@/context/FullscreenContext";
import { useToast } from "@/context/ToastContext";
import { lempiras } from "@/lib/format";
import type { CartLine, Cliente, Producto, Servicio } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const METODOS = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { id: "transferencia", label: "Transferencia", icon: Landmark },
] as const;

export function PosPage() {
  const { user } = useAuth();
  const toast = useToast();
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
  const [descuentoPorc, setDescuentoPorc] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [factura, setFactura] = useState<string | null>(null);
  const [facturaId, setFacturaId] = useState<number | null>(null);
  const [impresion, setImpresion] = useState<{ ok: boolean; error: string | null } | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agregado, setAgregado] = useState<{
    nombre: string;
    cantidad: number;
    total: number;
    imagen: string | null;
  } | null>(null);
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = useFullscreen();

  const canDiscount = user?.rol === "admin";

  // El lector de código de barras es un teclado HID: escribe el código muy
  // rápido y termina con Enter. Se detecta esa ráfaga en toda la página, sin
  // barra de escaneo ni necesidad de tener un campo enfocado.
  const scanBuffer = useRef({
    keys: "",
    last: 0,
    maxGap: 0,
    target: null as Element | null,
    value: "",
  });
  const modalAbierto = useRef(false);
  modalAbierto.current = clienteModal || !!factura;
  const procesarRef = useRef<(code: string) => void>(() => {});
  procesarRef.current = (code) => {
    void procesarCodigo(code);
  };

  useEffect(() => {
    function reset(buffer: typeof scanBuffer.current) {
      buffer.keys = "";
      buffer.maxGap = 0;
      buffer.target = null;
    }
    function restaurarCampo(buffer: typeof scanBuffer.current) {
      const el = buffer.target;
      if (!el || !el.isConnected) return;
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement) &&
        !(el instanceof HTMLSelectElement)
      ) {
        return;
      }
      // Quita los caracteres que el escáner haya podido escribir en un campo.
      const proto =
        el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, buffer.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (modalAbierto.current) return;
      const b = scanBuffer.current;
      if (e.ctrlKey || e.altKey || e.metaKey) {
        reset(b);
        return;
      }
      const now = Date.now();
      if (e.key === "Enter") {
        const code = b.keys;
        const esEscaneo = code.length >= 5 && b.maxGap < 50 && now - b.last < 120;
        if (esEscaneo) {
          e.preventDefault();
          e.stopPropagation();
          restaurarCampo(b);
          procesarRef.current(code);
        }
        reset(b);
        return;
      }
      if (e.key.length !== 1) {
        reset(b);
        return;
      }
      const gap = now - b.last;
      if (gap > 120 || b.keys === "") {
        b.keys = e.key;
        b.maxGap = 0;
        b.target = e.target as Element | null;
        b.value =
          b.target instanceof HTMLInputElement ||
          b.target instanceof HTMLTextAreaElement ||
          b.target instanceof HTMLSelectElement
            ? b.target.value
            : "";
      } else {
        b.keys += e.key;
        b.maxGap = Math.max(b.maxGap, gap);
      }
      b.last = now;
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  async function cargarCatalogos() {
    const [s, p, c] = await Promise.all([
      api.listarServicios(true),
      api.listarProductos(),
      api.listarClientes(undefined, true),
    ]);
    setServicios(s);
    setProductos(p);
    setClientes(c);
  }

  useEffect(() => {
    cargarCatalogos().catch((e) => toast.error(String(e)));
  }, []);

  // Aviso temporal al agregar un ítem; se cierra solo y no quita el foco al escáner.
  useEffect(() => {
    if (!agregado) return;
    const t = window.setTimeout(() => setAgregado(null), 1400);
    return () => window.clearTimeout(t);
  }, [agregado]);

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
  const descuento = Math.min(subtotal, Math.round(subtotal * descuentoPorc) / 100);
  const total = Math.max(0, subtotal - descuento);
  const rec = Number(recibido) || 0;
  const cambio = metodo === "efectivo" ? rec - total : 0;

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
    const actual =
      cart.find((p) => p.tipo === line.tipo && p.referencia_id === line.referencia_id)
        ?.cantidad ?? 0;
    const nextQty = actual + line.cantidad;
    if (line.tipo === "producto" && line.stock != null && nextQty > line.stock) {
      toast.error(`Stock insuficiente. Disponible: ${line.stock}`);
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex(
        (p) => p.tipo === line.tipo && p.referencia_id === line.referencia_id,
      );
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], cantidad: copy[i].cantidad + line.cantidad };
        return copy;
      }
      return [...prev, line];
    });
    setAgregado({
      nombre: line.nombre,
      cantidad: nextQty,
      total: line.precio_unitario * nextQty,
      imagen:
        line.tipo === "producto"
          ? (productos.find((p) => p.id === line.referencia_id)?.imagen ?? null)
          : null,
    });
  }

  async function procesarCodigo(code: string) {
    try {
      await api.registrarEscaneo(code);
      const p = await api.buscarProductoCodigo(code);
      if (!p) {
        toast.error(`No hay producto con código ${code}`);
        return;
      }
      if (p.stock <= 0) {
        toast.error(`${p.nombre} no tiene stock.`);
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
      toast.error(String(err));
    }
  }

  function setQty(idx: number, qty: number) {
    if (qty < 1) return;
    const linea = cart[idx];
    if (linea?.stock != null && qty > linea.stock) {
      toast.error(`Stock insuficiente. Disponible: ${linea.stock}`);
      return;
    }
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad: qty } : l)));
  }

  async function cobrar(e: FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error("Agregue productos o servicios.");
      return;
    }
    if (metodo === "efectivo" && rec + 0.001 < total) {
      toast.error("El efectivo recibido es menor al total.");
      return;
    }
    setBusy(true);
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
      setFacturaId(res.id);
      setImpresion({ ok: res.impresion_ok, error: res.impresion_error ?? null });
      toast.ok(`Venta #${res.id} registrada.`);
      setCart([]);
      setDescuentoPorc(0);
      setRecibido("");
      setClienteId("");
      void cargarCatalogos().catch(() => {});
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reimprimir() {
    if (!facturaId) return;
    setReimprimiendo(true);
    try {
      await api.imprimirFactura(facturaId);
      setImpresion({ ok: true, error: null });
    } catch (err) {
      setImpresion({ ok: false, error: String(err) });
    } finally {
      setReimprimiendo(false);
    }
  }

  return (
    <div
      className="page flex h-full min-h-0 flex-col"
      style={pantallaCompleta ? { maxWidth: "none" } : undefined}
    >
      {pantallaCompleta ? null : (
        <PageHero
          title="Caja"
          subtitle="Cobra productos y servicios y genera la factura."
          description="Escanea el código de barras en cualquier parte de la pantalla, agrega servicios y registra el pago en efectivo, tarjeta o transferencia."
          icon={ShoppingCart}
          badge={cart.length > 0 ? `${cart.length} ítems` : "Punto de venta"}
        >
          <button
            type="button"
            onClick={alternarPantallaCompleta}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-on-accent/30 bg-on-accent/10 px-3 text-xs font-semibold text-on-accent outline-none transition-colors hover:bg-on-accent/20 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {pantallaCompleta ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
            {pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          </button>
        </PageHero>
      )}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="card-title">Catálogo</h2>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {catalogo === "productos"
                    ? `${productosFiltrados.length} productos`
                    : `${serviciosFiltrados.length} servicios`}
                </p>
              </div>
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
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar o escanear código de barras…"
                className="h-10 pl-10 text-sm"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {catalogo === "productos" ? (
                productosFiltrados.length === 0 ? (
                  <p className="empty-state">No hay productos para ese criterio.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                    {productosFiltrados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={p.stock <= 0}
                        onClick={() => agregarProducto(p)}
                        className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface-2 text-left outline-none transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-surface-2"
                      >
                        <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-surface">
                          {p.imagen ? (
                            <img
                              src={p.imagen}
                              alt={p.nombre}
                              loading="lazy"
                              className="h-full w-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <Package className="h-8 w-8 text-fg-faint" />
                          )}
                        </span>
                        <span className="flex flex-1 flex-col p-2.5">
                          <span className="line-clamp-2 text-sm font-semibold leading-snug">
                            {p.nombre}
                          </span>
                          <span className="mt-0.5 truncate text-[11px] text-fg-muted">
                            {p.medida || p.marca || "—"}
                          </span>
                          <span className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                            <span className="text-sm font-bold text-accent-fg">
                              {lempiras(p.precio_venta)}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-medium",
                                p.stock <= p.stock_minimo ? "text-warn-fg" : "text-fg-muted",
                              )}
                            >
                              {p.stock > 0 ? `${p.stock} disp.` : "Sin stock"}
                            </span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : serviciosFiltrados.length === 0 ? (
                <p className="empty-state">No hay servicios para ese criterio.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
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
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface-2 text-left outline-none transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:translate-y-0"
                    >
                      <span className="flex aspect-square w-full items-center justify-center bg-surface">
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
                          <Wrench className="h-6 w-6" />
                        </span>
                      </span>
                      <span className="flex flex-1 flex-col p-2.5">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug">
                          {s.nombre}
                        </span>
                        <span className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                          <span className="text-sm font-bold text-accent-fg">
                            {lempiras(s.precio)}
                          </span>
                          <span className="text-[10px] text-fg-muted">{s.duracion_min} min</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div
            className={cn(
              "flex shrink-0 items-center justify-between border-b border-border px-4 py-3",
              pantallaCompleta && "pr-14",
            )}
          >
            <h2 className="card-title flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-accent-fg" />
              Carrito
              {cart.length > 0 ? <Badge tone="accent">{cart.length}</Badge> : null}
            </h2>
            {cart.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                Vaciar
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <ShoppingCart className="h-10 w-10 text-fg-faint" />
                <p className="text-sm text-fg-muted">Agrega productos para comenzar</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {cart.map((l, i) => {
                  const imagen =
                    l.tipo === "producto"
                      ? (productos.find((p) => p.id === l.referencia_id)?.imagen ?? null)
                      : null;
                  return (
                    <div key={`${l.tipo}-${l.referencia_id}`} className="flex items-start gap-2.5 px-3.5 py-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-fg-faint">
                        {imagen ? (
                          <img src={imagen} alt="" className="h-full w-full object-cover" />
                        ) : l.tipo === "servicio" ? (
                          <Wrench className="h-4 w-4" />
                        ) : (
                          <Package className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{l.nombre}</p>
                        <p className="text-xs text-fg-muted">{lempiras(l.precio_unitario)}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={l.cantidad}
                            onChange={(e) => setQty(i, Number(e.target.value))}
                            className="h-8 w-16 rounded-lg px-2 text-center text-sm"
                            aria-label={`Cantidad de ${l.nombre}`}
                          />
                          <span className="text-xs font-semibold tabular-nums">
                            {lempiras(l.precio_unitario * l.cantidad - l.descuento)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="text-danger-fg hover:bg-danger-soft"
                        onClick={() => setCart((c) => c.filter((_, j) => j !== i))}
                        aria-label={`Quitar ${l.nombre}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={cobrar} className="shrink-0 space-y-3 border-t border-border p-4">
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
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Descuento (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    value={descuentoPorc}
                    onChange={(e) =>
                      setDescuentoPorc(
                        Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      )
                    }
                    className="h-9"
                  />
                </div>
                {descuentoPorc > 0 ? (
                  <span className="pb-2 text-xs text-fg-muted">
                    − {lempiras(descuento)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div>
              <Label>Método de pago</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {METODOS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodo(m.id)}
                    aria-pressed={metodo === m.id}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      metodo === m.id
                        ? "border-accent bg-accent-soft text-accent-fg"
                        : "border-border bg-surface-2 text-fg-muted hover:bg-hover hover:text-fg",
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {metodo === "efectivo" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Recibido (L)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div
                  className={cn(
                    "rounded-xl border px-3 py-2",
                    cambio < 0
                      ? "border-danger bg-danger-soft"
                      : "border-ok bg-[var(--ok-soft)]",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                    {cambio < 0 ? "Falta" : "Cambio"}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      cambio < 0 ? "text-danger-fg" : "text-ok-fg",
                    )}
                  >
                    {lempiras(Math.abs(cambio))}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-fg-muted">
                <span>Subtotal</span>
                <span className="tabular-nums">{lempiras(subtotal)}</span>
              </div>
              {descuento > 0 ? (
                <div className="flex justify-between text-fg-muted">
                  <span>Descuento</span>
                  <span className="tabular-nums">− {lempiras(descuento)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-1 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums text-accent-fg">{lempiras(total)}</span>
              </div>
            </div>

            <div className="pt-1">
              <Button type="submit" size="xl" className="w-full" disabled={busy}>
                <Banknote className="h-5 w-5" />
                {busy ? "Registrando…" : `Cobrar ${lempiras(total)}`}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Modal
        open={!!factura}
        title="Venta registrada"
        subtitle="La factura quedó guardada en la carpeta de datos."
        onClose={() => {
          setFactura(null);
        }}
      >
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ok-fg">
          <CheckCircle2 className="h-5 w-5" />
          Cobro completado correctamente
        </p>
        <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 font-mono text-xs text-fg">
          {factura}
        </pre>
        {impresion?.ok ? (
          <p className="mt-3 text-sm font-medium text-ok-fg">Factura enviada a la impresora.</p>
        ) : (
          <div className="mt-3">
            <Alert tone="warn">
              {impresion?.error
                ? `No se pudo imprimir: ${impresion.error}`
                : "La venta se registró, pero no hay impresora configurada. Seleccione una en la página Dispositivos."}
            </Alert>
            <Button
              className="mt-2 w-full"
              variant="secondary"
              onClick={reimprimir}
              disabled={reimprimiendo}
            >
              <Printer className="h-4 w-4" />
              {reimprimiendo ? "Enviando…" : "Imprimir factura"}
            </Button>
          </div>
        )}
        {impresion?.ok ? (
          <Button
            className="mt-2 w-full"
            variant="ghost"
            onClick={reimprimir}
            disabled={reimprimiendo}
          >
            <Printer className="h-4 w-4" />
            {reimprimiendo ? "Enviando…" : "Reimprimir factura"}
          </Button>
        ) : null}
        <Button
          className="mt-4 w-full"
          size="lg"
          onClick={() => {
            setFactura(null);
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

      {agregado ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div
            role="status"
            className="anim-pop pointer-events-auto relative w-full max-w-xs rounded-2xl border border-border bg-surface px-6 py-6 text-center shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setAgregado(null)}
              aria-label="Cerrar"
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-fg-faint outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="h-4 w-4" />
            </button>
            {agregado.imagen ? (
              <div className="relative mx-auto h-20 w-20">
                <img
                  src={agregado.imagen}
                  alt={agregado.nombre}
                  className="h-20 w-20 rounded-xl border border-border object-cover"
                />
                <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ok text-on-ok shadow-lg">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              </div>
            ) : (
              <CheckCircle2 className="mx-auto h-12 w-12 text-ok-fg" />
            )}
            <p className="mt-3 text-sm font-medium text-fg-muted">Agregado a la venta</p>
            <p className="mt-1 text-lg font-bold text-fg">{agregado.nombre}</p>
            <p className="mt-2 text-sm text-fg-muted">
              {agregado.cantidad} en el ticket ·{" "}
              <span className="font-semibold text-fg">{lempiras(agregado.total)}</span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
