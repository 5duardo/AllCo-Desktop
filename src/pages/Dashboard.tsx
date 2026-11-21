import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fechaHora, lempiras, pagoLabel } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <div className="page">
        <Alert>{error}</Alert>
      </div>
    );
  if (!data)
    return (
      <div className="page">
        <p className="text-sm text-fg-muted">Cargando…</p>
      </div>
    );

  const isBodega = user?.rol === "bodega";
  const isCaja = user?.rol === "caja";

  return (
    <div className="page">
      <PageHeader title={`Hola, ${user?.nombre.split(" ")[0]}`} subtitle="Resumen operativo del negocio">
        {!isBodega ? (
          <Link to="/pos">
            <Button size="lg">
              <ShoppingCart className="h-4 w-4" />
              Ir a caja
            </Button>
          </Link>
        ) : null}
        {!isCaja ? (
          <Link to="/inventario">
            <Button variant="secondary" size="lg">
              <Warehouse className="h-4 w-4" />
              Inventario
            </Button>
          </Link>
        ) : null}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!isBodega ? (
          <>
            <Stat
              label="Ventas de hoy"
              value={lempiras(data.ventas_hoy)}
              hint={`${data.tickets_hoy} tickets`}
              icon={<Receipt className="h-5 w-5" />}
            />
            <Stat
              label="Últimos 7 días"
              value={lempiras(data.ventas_semana)}
              icon={<CalendarDays className="h-5 w-5" />}
            />
            <Stat
              label="Ticket promedio"
              value={lempiras(data.ticket_promedio)}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
          </>
        ) : null}
        <Stat
          label="Bajo stock mínimo"
          value={data.stock_bajo}
          tone={data.stock_bajo > 0 ? "warn" : "ok"}
          hint={data.stock_bajo > 0 ? "Requieren reposición" : "Inventario saludable"}
          icon={<PackageCheck className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
        {!isBodega ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between bg-surface-2 px-5 py-4">
              <h2 className="card-title">Últimas ventas</h2>
              <Badge tone="accent">{data.ultimas_ventas.length} recientes</Badge>
            </div>
            {data.ultimas_ventas.length === 0 ? (
              <p className="empty-state">Aún no hay ventas registradas.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Hora</th>
                    <th>Pago</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ultimas_ventas.map((v) => (
                    <tr key={v.id}>
                      <td className="font-semibold">#{v.id}</td>
                      <td className="text-fg-muted">{fechaHora(v.fecha)}</td>
                      <td>{pagoLabel(v.metodo_pago)}</td>
                      <td className="num font-semibold">{lempiras(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between bg-surface-2 px-5 py-4">
            <h2 className="card-title flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warn" />
              Alertas de stock
            </h2>
            {!isCaja ? (
              <Link
                to="/inventario"
                className="flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline"
              >
                Ver inventario
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
          {data.productos_alerta.length === 0 ? (
            <p className="empty-state">Todo el inventario está por encima del mínimo.</p>
          ) : (
            <ul className="space-y-1 p-2">
              {data.productos_alerta.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 hover:bg-hover">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.nombre}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {p.marca} · {p.medida}
                    </p>
                  </div>
                  <Badge tone="warn">
                    {p.stock} / {p.stock_minimo}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
