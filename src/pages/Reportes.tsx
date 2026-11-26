import { EmptyState } from "@/components/ui/empty-state";
import { useEffect, useState } from "react";
import { BarChart3, PackageSearch, Receipt, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fechaHora, lempiras, pagoLabel } from "@/lib/format";
import type { Producto, ReporteVentas } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

type Tab = "ventas" | "stock";

export function ReportesPage({ sinHero = false, sinPage = false }: { sinHero?: boolean; sinPage?: boolean }) {
  const { puede } = useAuth();
  const [tab, setTab] = useState<Tab>("ventas");
  const [periodo, setPeriodo] = useState("dia");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [rep, setRep] = useState<ReporteVentas | null>(null);
  const [stock, setStock] = useState<Producto[]>([]);
  const [error, setError] = useState("");
  const [anularId, setAnularId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  async function loadVentas() {
    setRep(await api.reporteVentas(periodo, desde, hasta));
  }

  useEffect(() => {
    loadVentas().catch((e) => setError(String(e)));
    api.productosStockMinimo().then(setStock).catch((e) => setError(String(e)));
  }, []);

  async function anular() {
    if (!anularId) return;
    try {
      await api.anularVenta(anularId, motivo);
      setAnularId(null);
      setMotivo("");
      await loadVentas();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className={sinPage ? undefined : "page"}>
      {sinHero ? null : <PageHero
        title="Reportes"
        subtitle="Ventas, kardex y existencias bajo mínimo"
        description="Consulta ventas por periodo, métodos de pago, servicios más vendidos y productos por debajo del stock mínimo."
        icon={BarChart3}
        badge="Ventas y stock"
      />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="group" aria-label="Tipo de reporte">
          <button
            type="button"
            className={cn("seg-item", tab === "ventas" && "seg-item-active")}
            onClick={() => setTab("ventas")}
            aria-pressed={tab === "ventas"}
          >
            <BarChart3 className="h-4 w-4" />
            Ventas
          </button>
          <button
            type="button"
            className={cn("seg-item", tab === "stock" && "seg-item-active")}
            onClick={() => setTab("stock")}
            aria-pressed={tab === "stock"}
          >
            <PackageSearch className="h-4 w-4" />
            Stock mínimo
          </button>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      {tab === "ventas" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48">
              <Label>Periodo</Label>
              <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="dia">Hoy</option>
                <option value="semana">Últimos 7 días</option>
                <option value="mes">Este mes</option>
                <option value="rango">Rango</option>
              </Select>
            </div>
            {periodo === "rango" ? (
              <>
                <div className="w-40">
                  <Label>Desde</Label>
                  <DatePicker value={desde} onChange={setDesde} />
                </div>
                <div className="w-40">
                  <Label>Hasta</Label>
                  <DatePicker value={hasta} onChange={setHasta} />
                </div>
              </>
            ) : null}
            <Button variant="secondary" onClick={() => loadVentas().catch((e) => setError(String(e)))}>
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>

          {rep ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Total vendido" value={lempiras(rep.total)} icon={<Receipt className="h-5 w-5" />} />
                <Stat label="Facturas" value={rep.cantidad} icon={<Receipt className="h-5 w-5" />} />
                <Stat label="Promedio por factura" value={lempiras(rep.ticket_promedio)} icon={<BarChart3 className="h-5 w-5" />} />
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-3">
                <Card className="p-5">
                  <h3 className="card-title mb-3">Por método de pago</h3>
                  <ul className="space-y-2.5">
                    {rep.por_metodo.map((g) => (
                      <li key={g.nombre} className="text-sm">
                        <div className="flex justify-between gap-2">
                          <span>{pagoLabel(g.nombre)}</span>
                          <span className="font-semibold tabular-nums">{lempiras(g.total)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${rep.total > 0 ? Math.min(100, (g.total / rep.total) * 100) : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-5">
                  <h3 className="card-title mb-3">Por cajero</h3>
                  <ul className="space-y-1">
                    {rep.por_usuario.map((g) => (
                      <li key={g.nombre} className="flex justify-between gap-2 py-2 text-sm">
                        <span>{g.nombre}</span>
                        <span className="font-semibold tabular-nums">{lempiras(g.total)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-5">
                  <h3 className="card-title mb-3">Servicios más vendidos</h3>
                  {rep.servicios_top.length === 0 ? (
                    <p className="text-sm text-fg-muted">Sin datos en este periodo.</p>
                  ) : (
                    <ul className="space-y-1">
                      {rep.servicios_top.map((g) => (
                        <li key={g.nombre} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 truncate">{g.nombre}</span>
                          <span className="flex items-center gap-2">
                            <Badge>{g.cantidad}</Badge>
                            <span className="font-semibold tabular-nums">{lempiras(g.total)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <Card className="overflow-x-auto">
                <div className="bg-surface-2 px-5 py-4">
                  <h3 className="card-title">Detalle de ventas</h3>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>Fecha</th>
                      <th>Cajero</th>
                      <th>Pago</th>
                      <th className="num">Total</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rep.ventas.map((v) => (
                      <tr key={v.id}>
                        <td className="font-semibold">#{v.id}</td>
                        <td className="whitespace-nowrap text-fg-muted">{fechaHora(v.fecha)}</td>
                        <td>{v.usuario_nombre}</td>
                        <td>{pagoLabel(v.metodo_pago)}</td>
                        <td className="num font-semibold">{lempiras(v.total)}</td>
                        <td>
                          {v.estado === "anulada" ? (
                            <Badge tone="danger">Anulada</Badge>
                          ) : (
                            <Badge tone="ok">Completada</Badge>
                          )}
                        </td>
                        <td>
                          {v.estado === "completada" && puede("/facturacion", "eliminar") ? (
                            anularId === v.id ? (
                              <div className="flex justify-end gap-1.5">
                                <Input
                                  className="h-8 w-40 rounded-lg px-2 text-sm"
                                  placeholder="Motivo"
                                  value={motivo}
                                  onChange={(e) => setMotivo(e.target.value)}
                                />
                                <Button size="sm" variant="danger" onClick={anular}>OK</Button>
                                <Button size="sm" variant="ghost" onClick={() => setAnularId(null)}>
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <div className="flex justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setAnularId(v.id)}>
                                  Anular
                                </Button>
                              </div>
                            )
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rep.ventas.length === 0 ? (
                  <EmptyState>No hay ventas en el periodo seleccionado.</EmptyState>
                ) : null}
              </Card>
            </>
          ) : null}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Medida</th>
                <th className="num">Stock</th>
                <th className="num">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.nombre}</td>
                  <td>{p.medida}</td>
                  <td className="num">
                    <Badge tone="warn">{p.stock}</Badge>
                  </td>
                  <td className="num">{p.stock_minimo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stock.length === 0 ? (
            <EmptyState>Ningún producto está bajo el stock mínimo.</EmptyState>
          ) : null}
        </Card>
      )}
    </div>
  );
}
