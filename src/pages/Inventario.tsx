import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  History,
  ImagePlus,
  LayoutGrid,
  List,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { archivoAImagen } from "@/lib/image";
import { fechaHora, lempiras } from "@/lib/format";
import type { CatalogoSimple, Movimiento, Producto } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

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
  imagen: null as string | null,
};

const VISTA_KEY = "allco-inventario-vista";
type Vista = "tabla" | "cajas" | "movimientos";
type Estado = "activos" | "archivados" | "todos";
type Confirmacion = { tipo: "archivar" | "restaurar" | "eliminar"; p: Producto };

const PARECE_CODIGO = /^[0-9A-Za-z-]{4,}$/;

function ImagenProducto({
  imagen,
  nombre,
  className,
}: {
  imagen: string | null;
  nombre: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-fg-faint",
        className,
      )}
    >
      {imagen ? (
        <img src={imagen} alt={nombre} className="h-full w-full object-cover" />
      ) : (
        <Package className="h-5 w-5" />
      )}
    </span>
  );
}

export function InventarioPage() {
  const { user } = useAuth();
  const isAdmin = user?.rol === "admin";
  const [vista, setVista] = useState<Vista>(() => {
    const v = localStorage.getItem(VISTA_KEY);
    return v === "cajas" || v === "movimientos" ? v : "tabla";
  });
  const [estado, setEstado] = useState<Estado>("activos");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<CatalogoSimple[]>([]);
  const [sucursales, setSucursales] = useState<CatalogoSimple[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mov, setMov] = useState<Producto | null>(null);
  const [movOpen, setMovOpen] = useState(false);
  const [movLibre, setMovLibre] = useState(false);
  const [movProductos, setMovProductos] = useState<Producto[]>([]);
  const [movTipo, setMovTipo] = useState("entrada");
  const [movCant, setMovCant] = useState(1);
  const [movMotivo, setMovMotivo] = useState("");
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [kardexOpen, setKardexOpen] = useState(false);
  const [kardexRows, setKardexRows] = useState<Movimiento[]>([]);
  const [confirm, setConfirm] = useState<Confirmacion | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const toast = useToast();
  const [codigoNoEncontrado, setCodigoNoEncontrado] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const guardarOtro = useRef(false);

  async function load() {
    const [p, pr, su] = await Promise.all([
      api.listarProductos(q.trim(), estado),
      api.listarProveedores(),
      api.listarSucursales(),
    ]);
    setRows(p);
    setProveedores(pr);
    setSucursales(su);
  }

  useEffect(() => {
    Promise.all([api.listarProveedores(), api.listarSucursales()])
      .then(([pr, su]) => {
        setProveedores(pr);
        setSucursales(su);
      })
      .catch((e) => toast.error(String(e)));
  }, []);

  // Filtra mientras se escribe; Enter (o el escáner) busca de inmediato.
  useEffect(() => {
    if (vista === "movimientos") return;
    const t = window.setTimeout(() => {
      void buscar(q.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, estado, vista]);

  // Carga el historial al entrar a la vista de movimientos o cambiar las fechas.
  useEffect(() => {
    if (vista !== "movimientos") return;
    cargarMovimientos().catch((e) => toast.error(String(e)));
  }, [vista, desde, hasta]);

  // Enfoca el campo correcto al abrir el modal para que el lector de
  // código de barras (teclado HID) escriba ahí sin necesidad de hacer clic.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const target = form.id ? nombreRef.current : barcodeRef.current;
      target?.focus();
      target?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [open]);

  async function buscar(query: string, escaneo = false) {
    try {
      if (escaneo && PARECE_CODIGO.test(query)) {
        void api.registrarEscaneo(query).catch(() => {});
      }
      const encontrados = await api.listarProductos(query, estado);
      setRows(encontrados);
      if (escaneo && encontrados.length === 1 && encontrados[0].codigo_barras === query) {
        toast.ok(`Código ${query} encontrado: ${encontrados[0].nombre}`);
      }
      setCodigoNoEncontrado(
        escaneo &&
          encontrados.length === 0 &&
          estado !== "archivados" &&
          PARECE_CODIGO.test(query)
          ? query
          : null,
      );
    } catch (err) {
      toast.error(String(err));
    }
  }

  function search(e: FormEvent) {
    e.preventDefault();
    if (vista === "movimientos") return;
    void buscar(q.trim(), true);
  }

  async function cargarMovimientos() {
    setMovimientos(await api.kardex(null, desde, hasta));
  }

  function sucursalDefault() {
    return (
      sucursales.find((s) => s.nombre.trim().toLowerCase() === "principal")?.id ??
      sucursales[0]?.id ??
      1
    );
  }

  function edit(p?: Producto, codigoInicial = "") {
    setFormError("");
    if (!p) {
      setForm({
        ...emptyForm,
        codigo_barras: codigoInicial,
        proveedor_id: proveedores[0]?.id ?? 1,
        sucursal_id: sucursalDefault(),
      });
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
        imagen: p.imagen ?? null,
      });
    }
    setOpen(true);
  }

  async function subirImagen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("La imagen debe ser un archivo PNG, JPG, WebP o GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe pesar más de 5 MB.");
      return;
    }
    try {
      const data = await archivoAImagen(file);
      setForm((f) => ({ ...f, imagen: data }));
      toast.ok("Imagen cargada. Guarde el producto para aplicarla.");
    } catch {
      toast.error("No se pudo procesar la imagen.");
    }
  }

  function onCodigoKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (form.codigo_barras.trim()) {
      void api.registrarEscaneo(form.codigo_barras.trim()).catch(() => {});
    }
    nombreRef.current?.focus();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const otro = guardarOtro.current;
    guardarOtro.current = false;
    setGuardando(true);
    setFormError("");
    try {
      await api.guardarProducto(form);
      setCodigoNoEncontrado(null);
      await load();
      toast.ok(`"${form.nombre}" guardado.`);
      if (otro) {
        setForm({
          ...emptyForm,
          marca: form.marca,
          proveedor_id: form.proveedor_id,
          sucursal_id: form.sucursal_id,
          stock_minimo: form.stock_minimo,
        });
        barcodeRef.current?.focus();
      } else {
        setOpen(false);
      }
    } catch (err) {
      setFormError(String(err));
    } finally {
      setGuardando(false);
    }
  }

  async function applyMov(e: FormEvent) {
    e.preventDefault();
    if (!mov) return;
    try {
      await api.movimientoInventario(mov.id, movTipo, movCant, movMotivo);
      toast.ok(
        `${movTipo === "ajuste" ? "Ajuste" : movTipo === "entrada" ? "Entrada" : "Salida"} de ${movCant} · ${mov.nombre}`,
      );
      setMovOpen(false);
      setMov(null);
      await load();
      if (vista === "movimientos") await cargarMovimientos();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function ejecutarConfirmacion() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      const { tipo, p } = confirm;
      if (tipo === "archivar") await api.archivarProducto(p.id);
      if (tipo === "restaurar") await api.restaurarProducto(p.id);
      if (tipo === "eliminar") await api.eliminarProducto(p.id);
      toast.ok(
        tipo === "archivar"
          ? `"${p.nombre}" archivado.`
          : tipo === "restaurar"
            ? `"${p.nombre}" restaurado.`
            : `"${p.nombre}" eliminado definitivamente.`,
      );
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(String(err));
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function openKardex(p?: Producto) {
    try {
      setKardexRows(await api.kardex(p?.id ?? null));
      setKardexOpen(true);
    } catch (err) {
      toast.error(String(err));
    }
  }

  function cambiarVista(v: Vista) {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }

  function abrirMovimiento(p: Producto) {
    setMov(p);
    setMovLibre(false);
    setMovOpen(true);
    setMovCant(1);
    setMovMotivo("");
  }

  async function abrirMovimientoLibre() {
    try {
      const ps = await api.listarProductos("", "activos");
      setMovProductos(ps);
      setMov(ps[0] ?? null);
      setMovLibre(true);
      setMovOpen(true);
      setMovTipo("entrada");
      setMovCant(1);
      setMovMotivo("");
    } catch (err) {
      toast.error(String(err));
    }
  }

  function acciones(p: Producto) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => edit(p)}>
          Editar
        </Button>
        {p.activo ? (
          <Button size="sm" variant="secondary" onClick={() => abrirMovimiento(p)}>
            <ArrowDownUp className="h-3.5 w-3.5" />
            Mover
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => openKardex(p)}>
          Kardex
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title={p.activo ? "Archivar producto" : "Restaurar producto"}
          onClick={() => setConfirm({ tipo: p.activo ? "archivar" : "restaurar", p })}
        >
          {p.activo ? (
            <>
              <Archive className="h-3.5 w-3.5" />
              Archivar
            </>
          ) : (
            <>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restaurar
            </>
          )}
        </Button>
        {isAdmin ? (
          <Button
            size="sm"
            variant="dangerSoft"
            title="Eliminar producto"
            onClick={() => setConfirm({ tipo: "eliminar", p })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </>
    );
  }

  const margen =
    isAdmin && form.costo > 0 && form.precio_venta > 0
      ? ((form.precio_venta - form.costo) / form.costo) * 100
      : null;

  const movimientosFiltrados = movimientos.filter((m) => {
    if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false;
    const texto = q.trim().toLowerCase();
    if (!texto) return true;
    return (
      m.producto_nombre.toLowerCase().includes(texto) ||
      m.motivo.toLowerCase().includes(texto) ||
      m.usuario_nombre.toLowerCase().includes(texto)
    );
  });

  function tablaMovimientos(lista: Movimiento[]) {
    if (lista.length === 0) {
      return <p className="empty-state">Sin movimientos registrados.</p>;
    }
    return (
      <div className="overflow-x-auto">
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
            {lista.map((m) => (
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
      </div>
    );
  }

  return (
    <div className="page">
      <PageHero
        title="Inventario"
        subtitle="Productos y existencias · kardex y stock mínimo"
        description="Registra productos, controla entradas y salidas, revisa el stock mínimo y consulta el kardex de cada artículo."
        icon={Package}
        badge={
          vista === "movimientos"
            ? `${movimientosFiltrados.length} movimientos`
            : `${rows.length} productos`
        }
      />
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => abrirMovimientoLibre()}>
          <ArrowDownUp className="h-4 w-4" />
          Nuevo movimiento
        </Button>
        <Button onClick={() => edit()}>
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      <Card className="mb-4 p-3">
        <form onSubmit={search} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                vista === "movimientos"
                  ? "Filtrar por producto, motivo o usuario"
                  : "Escanee el código de barras o busque por nombre, marca o medida"
              }
              className="pl-10"
              autoFocus
              aria-label="Buscar o escanear producto"
            />
          </div>
          {vista !== "movimientos" ? (
            <div className="seg" role="group" aria-label="Estado de los productos">
              {(["activos", "archivados", "todos"] as Estado[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEstado(e)}
                  aria-pressed={estado === e}
                  className={cn("seg-item", estado === e && "seg-item-active")}
                >
                  {e === "activos" ? "Activos" : e === "archivados" ? "Archivados" : "Todos"}
                </button>
              ))}
            </div>
          ) : null}
          <div className="seg" role="group" aria-label="Vista de inventario">
            <button
              type="button"
              onClick={() => cambiarVista("tabla")}
              aria-pressed={vista === "tabla"}
              className={cn("seg-item", vista === "tabla" && "seg-item-active")}
            >
              <List className="h-4 w-4" />
              Tabla
            </button>
            <button
              type="button"
              onClick={() => cambiarVista("cajas")}
              aria-pressed={vista === "cajas"}
              className={cn("seg-item", vista === "cajas" && "seg-item-active")}
            >
              <LayoutGrid className="h-4 w-4" />
              Cajas
            </button>
            <button
              type="button"
              onClick={() => cambiarVista("movimientos")}
              aria-pressed={vista === "movimientos"}
              className={cn("seg-item", vista === "movimientos" && "seg-item-active")}
            >
              <History className="h-4 w-4" />
              Movimientos
            </button>
          </div>
        </form>
      </Card>

      {vista !== "movimientos" && codigoNoEncontrado ? (
        <Alert tone="warn" className="mb-4">
          <span>
            No hay ningún producto con el código <strong>{codigoNoEncontrado}</strong>.{" "}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => edit(undefined, codigoNoEncontrado)}
            >
              Crear producto con este código
            </button>
          </span>
        </Alert>
      ) : null}

      {vista === "movimientos" ? (
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
            <div>
              <Label>Tipo</Label>
              <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="w-40">
                <option value="todos">Todos</option>
                <option value="entrada">Entradas</option>
                <option value="salida">Salidas</option>
                <option value="ajuste">Ajustes</option>
              </Select>
            </div>
            <div className="w-40">
              <Label>Desde</Label>
              <DatePicker value={desde} onChange={setDesde} />
            </div>
            <div className="w-40">
              <Label>Hasta</Label>
              <DatePicker value={hasta} onChange={setHasta} />
            </div>
            {desde || hasta ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDesde("");
                  setHasta("");
                }}
              >
                Limpiar fechas
              </Button>
            ) : null}
            <span className="ml-auto pb-2 text-sm text-fg-muted">
              {movimientosFiltrados.length} movimientos
            </span>
          </div>
          {tablaMovimientos(movimientosFiltrados)}
        </Card>
      ) : vista === "tabla" ? (
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
                <tr key={p.id} className={p.activo ? undefined : "opacity-60"}>
                  <td>
                    <div className="flex items-center gap-3">
                      <ImagenProducto
                        imagen={p.imagen}
                        nombre={p.nombre}
                        className="h-10 w-10"
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-xs text-fg-muted">
                          {p.marca} {p.modelo}
                        </p>
                      </div>
                    </div>
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
                  <td>
                    {p.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Archivado</Badge>}
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">{acciones(p)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="empty-state">No se encontraron productos con ese criterio.</p>
          ) : null}
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="empty-state">No se encontraron productos con ese criterio.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((p) => (
            <Card key={p.id} className={cn("flex h-full flex-col p-4", !p.activo && "opacity-70")}>
              <div className="flex items-start gap-3">
                <ImagenProducto
                  imagen={p.imagen}
                  nombre={p.nombre}
                  className="h-12 w-12 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.nombre}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {p.marca} {p.modelo}
                  </p>
                </div>
                {p.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Archivado</Badge>}
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold tabular-nums">
                    {lempiras(p.precio_venta)}
                  </p>
                  {isAdmin ? (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      Costo {lempiras(p.costo ?? 0)}
                    </p>
                  ) : null}
                </div>
                <Badge tone={p.stock <= p.stock_minimo ? "warn" : "default"}>
                  {p.stock} en stock
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                  <p className="text-fg-muted">Medida</p>
                  <p className="mt-0.5 truncate font-medium">{p.medida || "—"}</p>
                </div>
                <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                  <p className="text-fg-muted">Mínimo</p>
                  <p className="mt-0.5 font-medium">{p.stock_minimo}</p>
                </div>
                <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                  <p className="text-fg-muted">Lote</p>
                  <p className="mt-0.5 truncate font-medium">{p.dot || "—"}</p>
                </div>
              </div>

              <p className="mt-3 truncate font-mono text-xs text-fg-muted">
                {p.codigo_barras || "Sin código de barras"}
              </p>

              <div className="mt-auto flex flex-wrap gap-2 pt-4">{acciones(p)}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={form.id ? "Editar producto" : "Nuevo producto"}
        subtitle={
          form.id
            ? `Ficha #${form.id}`
            : "Escanee el código de barras y complete los datos. Enter pasa al nombre."
        }
        onClose={() => setOpen(false)}
        wide
      >
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          {formError ? (
            <div className="col-span-2">
              <Alert>{formError}</Alert>
            </div>
          ) : null}
          <div>
            <Label>Código de barras</Label>
            <Input
              ref={barcodeRef}
              value={form.codigo_barras}
              onChange={(e) => setForm({ ...form, codigo_barras: e.target.value.trim() })}
              onKeyDown={onCodigoKeyDown}
              placeholder="Escanee o escriba el código"
              autoFocus={!form.id}
              className="font-mono"
            />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Nombre</Label>
            <Input
              ref={nombreRef}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              autoFocus={!!form.id}
              required
            />
          </div>
          <div className="col-span-2">
            <Label>Imagen del producto</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
                {form.imagen ? (
                  <img
                    src={form.imagen}
                    alt={form.nombre || "Producto"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus className="h-7 w-7 text-fg-faint" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="producto-imagen"
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-hover"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {form.imagen ? "Cambiar imagen" : "Subir imagen"}
                  </label>
                  {form.imagen ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, imagen: null })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-fg-muted">
                  PNG, JPG, WebP o GIF · máximo 5 MB. Se optimiza automáticamente.
                </p>
              </div>
              <input
                id="producto-imagen"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={subirImagen}
              />
            </div>
          </div>
          <div>
            <Label>Marca</Label>
            <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
          </div>
          <div>
            <Label>Medida</Label>
            <Input value={form.medida} onChange={(e) => setForm({ ...form, medida: e.target.value })} placeholder="Ej. 500 ml, talla M" />
          </div>
          <div>
            <Label>Modelo</Label>
            <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          </div>
          <div>
            <Label>Lote / DOT</Label>
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
              <Input type="number" min={0} step="0.01" value={form.costo} onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })} />
            </div>
          ) : null}
          <div>
            <Label>Precio de venta (L)</Label>
            <Input type="number" min={0} step="0.01" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: Number(e.target.value) })} required />
            {margen != null ? (
              <p className="mt-1 text-xs text-fg-muted">
                Ganancia {lempiras(form.precio_venta - form.costo)} · margen {margen.toFixed(0)}%
              </p>
            ) : null}
          </div>
          {!form.id ? (
            <div>
              <Label>Stock inicial</Label>
              <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
            </div>
          ) : null}
          <div>
            <Label>Stock mínimo</Label>
            <Input type="number" min={0} value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Producto activo
            </label>
          </div>
          <div className="col-span-2 mt-1 flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            {!form.id ? (
              <Button
                type="submit"
                variant="secondary"
                disabled={guardando}
                onClick={() => {
                  guardarOtro.current = true;
                }}
              >
                Guardar y agregar otro
              </Button>
            ) : null}
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar producto"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirm}
        title={
          confirm?.tipo === "eliminar"
            ? "Eliminar producto"
            : confirm?.tipo === "archivar"
              ? "Archivar producto"
              : "Restaurar producto"
        }
        subtitle={confirm?.p.nombre}
        onClose={() => setConfirm(null)}
      >
        {confirm ? (
          <div className="space-y-4">
            {confirm.tipo === "eliminar" ? (
              <Alert tone="warn">
                Se eliminará definitivamente <strong>{confirm.p.nombre}</strong>. Solo es posible si
                no tiene ventas ni movimientos; si ya tiene historial, use <strong>Archivar</strong>.
                Esta acción no se puede deshacer.
              </Alert>
            ) : confirm.tipo === "archivar" ? (
              <p className="text-sm text-fg-muted">
                <strong>{confirm.p.nombre}</strong> dejará de aparecer en caja y en el inventario
                activo. Su stock ({confirm.p.stock}) y su historial se conservan, y puede
                restaurarlo cuando quiera desde el filtro <strong>Archivados</strong>.
              </p>
            ) : (
              <p className="text-sm text-fg-muted">
                <strong>{confirm.p.nombre}</strong> volverá a estar disponible en caja y en el
                inventario activo con su stock actual ({confirm.p.stock}).
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant={confirm.tipo === "eliminar" ? "default" : "ghost"}
                autoFocus={confirm.tipo === "eliminar"}
                onClick={() => setConfirm(null)}
                disabled={confirmBusy}
              >
                Cancelar
              </Button>
              <Button
                variant={confirm.tipo === "eliminar" ? "dangerSoft" : "default"}
                onClick={ejecutarConfirmacion}
                disabled={confirmBusy}
              >
                {confirmBusy
                  ? "Procesando…"
                  : confirm.tipo === "eliminar"
                    ? "Eliminar definitivamente"
                    : confirm.tipo === "archivar"
                      ? "Archivar"
                      : "Restaurar"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={movOpen}
        title={movLibre ? "Nuevo movimiento de stock" : `Movimiento · ${mov?.nombre ?? ""}`}
        subtitle={`Stock actual: ${mov?.stock ?? 0} unidades`}
        onClose={() => setMovOpen(false)}
      >
        <form onSubmit={applyMov} className="space-y-4">
          {movLibre ? (
            <div>
              <Label>Producto</Label>
              <Select
                value={mov?.id ?? ""}
                onChange={(e) => {
                  const p = movProductos.find((x) => x.id === Number(e.target.value));
                  setMov(p ?? null);
                }}
              >
                {movProductos.length === 0 ? <option value="">No hay productos activos</option> : null}
                {movProductos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.medida} · stock {p.stock}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
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
          <Button type="submit" className="w-full" size="lg" disabled={!mov}>
            Aplicar movimiento
          </Button>
        </form>
      </Modal>

      <Modal open={kardexOpen} title="Kardex" subtitle="Historial de movimientos de inventario" onClose={() => setKardexOpen(false)} wide>
        {tablaMovimientos(kardexRows)}
      </Modal>
    </div>
  );
}
