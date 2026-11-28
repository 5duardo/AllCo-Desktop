import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { fechaHora, lempiras, pagoLabel } from "@/lib/format";
import {
  CATEGORIAS_GASTO,
  type CatalogoSimple,
  type Gasto,
  type GastoIn,
  type HoraExtra,
  type HoraExtraIn,
  type ResumenFinanzas,
} from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Tab = "resumen" | "gastos" | "compras" | "extras";

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function nombreDia(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-HN", { weekday: "long" });
}

function diasAtras(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function rango(periodo: string, desde: string, hasta: string): [string, string] {
  const t = hoy();
  if (periodo === "dia") return [t, t];
  if (periodo === "semana") return [diasAtras(6), t];
  if (periodo === "mes") return [`${t.slice(0, 7)}-01`, t];
  return [desde || diasAtras(29), hasta || t];
}

const formVacio: GastoIn = {
  id: null,
  fecha: hoy(),
  categoria: "Otros",
  descripcion: "",
  monto: 0,
  metodo_pago: "efectivo",
  proveedor_id: null,
};

const extraVacia: HoraExtraIn = {
  empleado_id: 0,
  fecha: hoy(),
  horas: 1,
  monto: 0,
  nota: "",
};

export function FinanzasPage({ sinHero = false, sinPage = false }: { sinHero?: boolean; sinPage?: boolean }) {
  const { user, puede } = useAuth();
  const esAdmin = user?.rol === "admin";
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("resumen");
  const [periodo, setPeriodo] = useState("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [resumen, setResumen] = useState<ResumenFinanzas | null>(null);
  const [proveedores, setProveedores] = useState<CatalogoSimple[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<GastoIn>(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Gasto | null>(null);

  const [extras, setExtras] = useState<HoraExtra[]>([]);
  const [empleados, setEmpleados] = useState<CatalogoSimple[]>([]);
  const [filtroEmpleado, setFiltroEmpleado] = useState("");
  const [extraDesde, setExtraDesde] = useState(`${hoy().slice(0, 7)}-01`);
  const [extraHasta, setExtraHasta] = useState(hoy);
  const [extraForm, setExtraForm] = useState<HoraExtraIn>(extraVacia);
  const [extraOpen, setExtraOpen] = useState(false);
  const [borrarExtra, setBorrarExtra] = useState<HoraExtra | null>(null);
  const [guardandoExtra, setGuardandoExtra] = useState(false);

  async function cargar() {
    const [d, h] = rango(periodo, desde, hasta);
    setCargando(true);
    setError("");
    try {
      setResumen(await api.resumenFinanzas(d, h));
    } catch (e) {
      setError(String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    api.listarProveedores().then(setProveedores).catch(() => {});
    if (esAdmin) api.listarEmpleados(true).then(setEmpleados).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, desde, hasta, esAdmin]);

  useEffect(() => {
    if (tab !== "extras" || !esAdmin) return;
    void (async () => {
      try {
        setExtras(
          await api.listarHorasExtras(
            filtroEmpleado ? Number(filtroEmpleado) : null,
            extraDesde,
            extraHasta,
          ),
        );
      } catch (e) {
        toast.error(String(e));
      }
    })();
  }, [tab, filtroEmpleado, extraDesde, extraHasta, esAdmin]);

  function abrirNuevo() {
    setForm({ ...formVacio, fecha: hoy() });
    setFormOpen(true);
  }

  function abrirEditar(g: Gasto) {
    setForm({
      id: g.id,
      fecha: g.fecha.slice(0, 10),
      categoria: g.categoria,
      descripcion: g.descripcion,
      monto: g.monto,
      metodo_pago: g.metodo_pago,
      proveedor_id: g.proveedor_id,
    });
    setFormOpen(true);
  }

  async function guardar() {
    if (!form.descripcion.trim()) {
      toast.error("Escriba una descripción del gasto.");
      return;
    }
    if (!(form.monto > 0)) {
      toast.error("El monto debe ser mayor a cero.");
      return;
    }
    setGuardando(true);
    try {
      await api.guardarGasto(form);
      toast.ok(form.id ? "Gasto actualizado." : "Gasto registrado.");
      setFormOpen(false);
      await cargar();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    try {
      await api.eliminarGasto(borrar.id);
      toast.ok("Gasto eliminado.");
      setBorrar(null);
      await cargar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  function abrirNuevaExtra() {
    setExtraForm({ ...extraVacia, fecha: hoy(), empleado_id: empleados[0]?.id ?? 0 });
    setExtraOpen(true);
  }

  function abrirEditarExtra(h: HoraExtra) {
    setExtraForm({
      id: h.id,
      empleado_id: h.empleado_id,
      fecha: h.fecha.slice(0, 10),
      horas: h.horas,
      monto: h.monto,
      nota: h.nota,
    });
    setExtraOpen(true);
  }

  async function guardarExtra(e: FormEvent) {
    e.preventDefault();
    if (!extraForm.empleado_id) {
      toast.error("Seleccione un empleado.");
      return;
    }
    setGuardandoExtra(true);
    try {
      await api.guardarHoraExtra({ ...extraForm, nota: extraForm.nota.trim() });
      setExtraOpen(false);
      const [d, h] = rango(periodo, desde, hasta);
      setResumen(await api.resumenFinanzas(d, h));
      setExtras(
        await api.listarHorasExtras(
          filtroEmpleado ? Number(filtroEmpleado) : null,
          extraDesde,
          extraHasta,
        ),
      );
      toast.ok(extraForm.id ? "Pago de horas extras actualizado." : "Pago de horas extras registrado.");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setGuardandoExtra(false);
    }
  }

  async function confirmarBorrarExtra() {
    if (!borrarExtra) return;
    try {
      await api.eliminarHoraExtra(borrarExtra.id);
      setBorrarExtra(null);
      const [d, h] = rango(periodo, desde, hasta);
      setResumen(await api.resumenFinanzas(d, h));
      setExtras(
        await api.listarHorasExtras(
          filtroEmpleado ? Number(filtroEmpleado) : null,
          extraDesde,
          extraHasta,
        ),
      );
      toast.ok("Registro de horas extras eliminado.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  const gastos = (resumen?.gastos ?? []).filter(
    (g) => !filtroCategoria || g.categoria === filtroCategoria,
  );
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const extraHoras = extras.reduce((s, h) => s + h.horas, 0);
  const extraMonto = extras.reduce((s, h) => s + h.monto, 0);
  const compras = resumen?.compras ?? [];
  const serie = resumen?.serie ?? [];
  const maxSerie = Math.max(
    1,
    ...serie.flatMap((d) => [d.ingresos, d.gastos]),
  );
  const maxCat = Math.max(1, ...(resumen?.por_categoria ?? []).map((c) => c.total));

  return (
    <div className={sinPage ? undefined : "page"}>
      {sinHero ? null : <PageHero
        title="Finanzas"
        subtitle="Gastos, compras, horas extras y utilidad neta"
        description="Registre sus gastos y las horas extras pagadas al personal. Las compras de inventario se derivan automáticamente de las entradas de stock por su costo."
        icon={Wallet}
      />}

      <div className="mb-4 border-b border-border pb-4">
        <div className="seg" role="group" aria-label="Secciones de finanzas">
          {(
            [
              ["resumen", "Resumen", BarChart3],
              ["gastos", "Gastos", Receipt],
              ["compras", "Compras de inventario", ShoppingCart],
              ["extras", "Horas extras", Clock],
            ] as const
          )
            .filter(([id]) => id !== "extras" || esAdmin)
            .map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={cn("seg-item", tab === id && "seg-item-active")}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label>Periodo</Label>
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="dia">Hoy</option>
              <option value="semana">Últimos 7 días</option>
              <option value="mes">Este mes</option>
              <option value="rango">Rango</option>
            </Select>
          </div>
          {tab === "gastos" && puede("/finanzas", "crear") ? (
            <Button onClick={abrirNuevo} className="shrink-0">
              <Plus className="h-4 w-4" />
              Nuevo gasto
            </Button>
          ) : null}
          {periodo === "rango" ? (
            <>
              <div className="w-36">
                <Label>Desde</Label>
                <DatePicker value={desde} onChange={setDesde} />
              </div>
              <div className="w-36">
                <Label>Hasta</Label>
                <DatePicker value={hasta} onChange={setHasta} />
              </div>
            </>
          ) : null}
          {cargando ? (
            <span className="flex items-center gap-1.5 pb-1 text-xs text-fg-muted">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Cargando…
            </span>
          ) : null}
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {tab === "resumen" ? (
        resumen ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Ingresos (ventas)"
                value={lempiras(resumen.ingresos)}
                hint="Facturas completadas"
                tone="ok"
                icon={<ArrowUpRight className="h-5 w-5" />}
              />
              <Stat
                label="Gastos registrados"
                value={lempiras(resumen.gastos_manuales)}
                hint={`${resumen.gastos.length} movimientos`}
                tone="warn"
                icon={<Receipt className="h-5 w-5" />}
              />
              <Stat
                label="Compras de inventario"
                value={lempiras(resumen.compras_inventario)}
                hint={`${compras.length} entradas de stock`}
                tone="warn"
                icon={<ShoppingCart className="h-5 w-5" />}
              />
              <Stat
                label="Gastos totales"
                value={lempiras(resumen.gastos_totales)}
                hint="Registrados + inventario"
                icon={<ArrowDownRight className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Card className="flex h-full flex-col p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="card-title">Ingresos y gastos por día</h2>
                <div className="flex gap-3 text-[11px] text-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ok-fg" /> Ingresos
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-danger-fg" /> Gastos
                  </span>
                </div>
              </div>
              {serie.length ? (
                <div className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
                  {serie.map((d) => (
                    <div
                      key={d.fecha}
                      className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-fg">
                          {nombreDia(d.fecha)}
                        </span>
                        <span className="block text-[10px] text-fg-muted">
                          {d.fecha.slice(5).replace("-", "/")}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-ok-fg"
                            style={{ width: `${(d.ingresos / maxSerie) * 100}%` }}
                            title={`Ingresos ${lempiras(d.ingresos)}`}
                          />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-danger-fg"
                            style={{ width: `${(d.gastos / maxSerie) * 100}%` }}
                            title={`Gastos ${lempiras(d.gastos)}`}
                          />
                        </div>
                      </div>
                      <Badge tone={d.utilidad >= 0 ? "ok" : "danger"}>
                        {lempiras(d.utilidad)}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-fg-muted">
                  No hay movimientos en el periodo seleccionado.
                </p>
              )}
              </Card>

            <Card className="flex h-full flex-col p-5">
              <h2 className="card-title">Gastos por categoría</h2>
              {resumen.por_categoria.length ? (
                <div className="mt-4 space-y-3">
                  {resumen.por_categoria.map((c) => (
                    <div key={c.nombre} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-sm text-fg">
                        {c.nombre}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${(c.total / maxCat) * 100}%` }}
                        />
                      </div>
                      <span className="w-28 text-right text-sm font-semibold tabular-nums text-fg">
                        {lempiras(c.total)}
                      </span>
                      <span className="w-16 text-right text-xs text-fg-muted">
                        {c.cantidad}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-fg-muted">
                  No hay gastos registrados en este periodo.
                </p>
              )}
            </Card>
            </div>
          </div>
        ) : (
          <Card className="p-6">
            <p className="text-sm text-fg-muted">Cargando resumen…</p>
          </Card>
        )
      ) : null}

      {tab === "gastos" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Total del periodo"
              value={lempiras(totalGastos)}
              hint="Según el filtro aplicado"
              icon={<Receipt className="h-5 w-5" />}
            />
            <Stat
              label="Movimientos"
              value={gastos.length}
              hint="Gastos registrados"
            />
            <Stat
              label="Gasto promedio"
              value={lempiras(gastos.length ? totalGastos / gastos.length : 0)}
              hint="Por movimiento"
            />
          </div>
          <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="card-title">Gastos registrados</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {gastos.length} movimientos en el periodo.
              </p>
            </div>
            <div className="w-40">
              <Label>Categoría</Label>
              <Select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
              >
                <option value="">Todas</option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Método</th>
                  <th>Proveedor</th>
                  <th>Registrado por</th>
                  <th className="text-right">Monto</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="whitespace-nowrap text-fg-muted">{fechaHora(g.fecha)}</td>
                    <td>
                      <Badge>{g.categoria}</Badge>
                    </td>
                    <td className="text-fg">{g.descripcion || "—"}</td>
                    <td className="text-fg-muted">{pagoLabel(g.metodo_pago)}</td>
                    <td className="text-fg-muted">{g.proveedor_nombre ?? "—"}</td>
                    <td className="text-fg-muted">{g.usuario_nombre}</td>
                    <td className="num whitespace-nowrap font-semibold text-fg">
                      {lempiras(g.monto)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {puede("/finanzas", "editar") ? (
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="Editar gasto"
                            aria-label={`Editar gasto ${g.id}`}
                            onClick={() => abrirEditar(g)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {puede("/finanzas", "eliminar") ? (
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="Eliminar gasto"
                            aria-label={`Eliminar gasto ${g.id}`}
                            onClick={() => setBorrar(g)}
                          >
                            <Trash2 className="h-4 w-4 text-danger-fg" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {gastos.length > 0 ? (
                <tfoot className="border-t border-border bg-surface-2">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-fg" colSpan={6}>
                      Total del periodo
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 font-bold text-fg">
                      {lempiras(totalGastos)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {gastos.length === 0 ? (
              <EmptyState>No hay gastos registrados en este periodo.</EmptyState>
            ) : null}
          </div>
        </Card>
        </div>
      ) : null}

      {tab === "compras" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Total del periodo"
              value={lempiras(resumen?.compras_inventario ?? 0)}
              hint="Costo de las entradas"
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <Stat label="Entradas" value={compras.length} hint="Movimientos de stock" />
            <Stat
              label="Productos distintos"
              value={new Set(compras.map((c) => c.producto_id)).size}
              hint="En este periodo"
            />
          </div>
          <Card className="overflow-hidden">
            <div className="p-4">
              <h2 className="card-title">Compras de inventario derivadas</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Se calculan automáticamente de las entradas de stock × el costo actual del producto.
                No se pueden editar aquí: cambian al registrar entradas en Inventario.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Motivo</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Costo unit.</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="whitespace-nowrap text-fg-muted">{fechaHora(c.fecha)}</td>
                      <td className="text-fg">{c.producto_nombre}</td>
                      <td className="text-fg-muted">{c.motivo || "—"}</td>
                      <td className="num">{c.cantidad}</td>
                      <td className="num text-fg-muted">{lempiras(c.costo_unitario)}</td>
                      <td className="num font-semibold text-fg">{lempiras(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-surface-2">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-fg" colSpan={5}>
                      Total del periodo
                    </td>
                    <td className="num px-4 py-3 font-bold text-fg">
                      {lempiras(resumen?.compras_inventario ?? 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {compras.length === 0 ? (
                <EmptyState>No hay entradas de inventario en este periodo.</EmptyState>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "extras" && esAdmin ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Registros"
              value={extras.length}
              hint="En el periodo seleccionado"
              icon={<Clock className="h-5 w-5" />}
            />
            <Stat
              label="Horas extras"
              value={`${extraHoras.toFixed(2)} h`}
              icon={<Clock className="h-5 w-5" />}
            />
            <Stat
              label="Total pagado"
              value={lempiras(extraMonto)}
              icon={<Wallet className="h-5 w-5" />}
              tone="ok"
            />
          </div>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h2 className="card-title">Horas extras pagadas</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Cada pago se registra también como gasto de Sueldos en esta misma página.
                </p>
              </div>
              <Button onClick={abrirNuevaExtra}>
                <Plus className="h-4 w-4" />
                Registrar pago
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
              <div className="w-48">
                <Label>Empleado</Label>
                <Select value={filtroEmpleado} onChange={(e) => setFiltroEmpleado(e.target.value)}>
                  <option value="">Todos los empleados</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-40">
                <Label>Desde</Label>
                <DatePicker value={extraDesde} onChange={setExtraDesde} />
              </div>
              <div className="w-40">
                <Label>Hasta</Label>
                <DatePicker value={extraHasta} onChange={setExtraHasta} />
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th className="text-right">Horas</th>
                    <th className="text-right">Pagado</th>
                    <th>Nota</th>
                    <th>Gasto</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {extras.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="whitespace-nowrap text-fg-muted">{fechaHora(h.fecha)}</td>
                      <td className="font-medium">{h.empleado_nombre}</td>
                      <td className="num font-medium">{h.horas.toFixed(2)} h</td>
                      <td className="num font-semibold text-fg">{lempiras(h.monto)}</td>
                      <td className="text-fg-muted">{h.nota || "—"}</td>
                      <td className="text-xs text-fg-muted">
                        {h.gasto_id ? `#${h.gasto_id}` : "—"}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="Editar pago"
                            aria-label={`Editar pago ${h.id}`}
                            onClick={() => abrirEditarExtra(h)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="Eliminar pago"
                            aria-label={`Eliminar pago ${h.id}`}
                            onClick={() => setBorrarExtra(h)}
                          >
                            <Trash2 className="h-4 w-4 text-danger-fg" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {extras.length === 0 ? (
                <EmptyState>No hay pagos de horas extras en el periodo seleccionado.</EmptyState>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={formOpen}
        title={form.id ? "Editar gasto" : "Nuevo gasto"}
        subtitle="Registre un egreso del negocio"
        onClose={() => setFormOpen(false)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Fecha</Label>
            <DatePicker value={form.fecha} onChange={(fecha) => setForm({ ...form, fecha })} />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            >
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Descripción</Label>
            <Input
              value={form.descripcion}
              placeholder="Ej. Pago de luz de la sucursal"
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </div>
          <div>
            <Label>Monto (L)</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={form.monto || ""}
              onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Método de pago</Label>
            <Select
              value={form.metodo_pago}
              onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Proveedor (opcional)</Label>
            <Select
              value={form.proveedor_id ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  proveedor_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Ninguno</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setFormOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar gasto"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!borrar}
        title="Eliminar gasto"
        subtitle="Esta acción no se puede deshacer"
        small
        onClose={() => setBorrar(null)}
      >
        <p className="text-sm text-fg-muted">
          ¿Eliminar el gasto <b className="text-fg">{borrar?.descripcion || `#${borrar?.id}`}</b> por{" "}
          <b className="text-fg">{lempiras(borrar?.monto ?? 0)}</b>?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBorrar(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirmarBorrar()}>
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </Modal>

      <Modal
        open={extraOpen}
        title={extraForm.id ? "Editar pago de horas extras" : "Registrar horas extras"}
        subtitle="También se guarda como gasto de Sueldos en Finanzas"
        onClose={() => setExtraOpen(false)}
      >
        <form onSubmit={guardarExtra} className="space-y-4">
          <div>
            <Label>Empleado</Label>
            <Select
              value={String(extraForm.empleado_id)}
              onChange={(e) =>
                setExtraForm({ ...extraForm, empleado_id: Number(e.target.value) })
              }
            >
              <option value="0">Seleccione un empleado</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Fecha</Label>
              <DatePicker
                value={extraForm.fecha}
                onChange={(v) => setExtraForm({ ...extraForm, fecha: v })}
              />
            </div>
            <div>
              <Label>Horas</Label>
              <Input
                type="number"
                min="0.25"
                step="0.25"
                value={extraForm.horas || ""}
                onChange={(e) => setExtraForm({ ...extraForm, horas: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label>Monto pagado</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={extraForm.monto || ""}
                onChange={(e) => setExtraForm({ ...extraForm, monto: Number(e.target.value) })}
                required
              />
            </div>
          </div>
          <div>
            <Label>Nota (opcional)</Label>
            <Textarea
              value={extraForm.nota}
              onChange={(e) => setExtraForm({ ...extraForm, nota: e.target.value })}
              placeholder="Ej. Jornada del sábado"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setExtraOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardandoExtra}>
              {guardandoExtra ? "Guardando…" : "Guardar pago"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!borrarExtra}
        title="Eliminar pago de horas extras"
        subtitle="También se eliminará el gasto de Sueldos asociado"
        small
        onClose={() => setBorrarExtra(null)}
      >
        <p className="text-sm text-fg-muted">
          ¿Eliminar el pago de <b className="text-fg">{borrarExtra?.empleado_nombre}</b> por{" "}
          <b className="text-fg">{lempiras(borrarExtra?.monto ?? 0)}</b>?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBorrarExtra(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirmarBorrarExtra()}>
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
