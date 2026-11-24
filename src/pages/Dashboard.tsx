import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Package,
  PackageCheck,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fechaHora, lempiras, pagoLabel } from "@/lib/format";
import type {
  DashboardData,
  DiaVenta,
  ResumenVentas,
  TotalesGrupo,
} from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PERIODOS = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "7 días" },
  { id: "mes", label: "Este mes" },
  { id: "30d", label: "30 días" },
  { id: "todo", label: "Todo" },
] as const;

const LIMITE_ALERTAS = 5;

type Periodo = (typeof PERIODOS)[number]["id"];

function fechaISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rango(p: Periodo) {
  const hoy = new Date();
  const hasta = fechaISO(hoy);
  switch (p) {
    case "ayer": {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 1);
      const ayer = fechaISO(d);
      return { desde: ayer, hasta: ayer };
    }
    case "semana": {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 6);
      return { desde: fechaISO(d), hasta };
    }
    case "mes": {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: fechaISO(d), hasta };
    }
    case "30d": {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 29);
      return { desde: fechaISO(d), hasta };
    }
    case "todo":
      return { desde: "2000-01-01", hasta };
    default:
      return { desde: hasta, hasta };
  }
}

function fechaCorta(f: string) {
  const [y, m, d] = f.split("-");
  if (!y || !m || !d) return f;
  return `${d}/${m}/${y}`;
}

function GraficoSerie({ serie }: { serie: DiaVenta[] }) {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const datos: DiaVenta[] =
    serie.length > 0
      ? serie
      : [
          { fecha: fechaISO(ayer), total: 0, cantidad: 0 },
          { fecha: fechaISO(hoy), total: 0, cantidad: 0 },
        ];
  const W = 600;
  const H = 190;
  const pad = 18;
  const max = Math.max(...datos.map((d) => d.total), 1);
  const unico = datos.length === 1;
  const step = datos.length > 1 ? (W - pad * 2) / (datos.length - 1) : 0;
  const puntos = datos.map(
    (d, i) =>
      [
        unico ? W / 2 : pad + i * step,
        H - pad - (d.total / max) * (H - pad * 2),
      ] as const,
  );
  const linea = puntos
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${linea} L${puntos[puntos.length - 1][0].toFixed(1)},${H - pad} L${puntos[0][0].toFixed(1)},${H - pad} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full"
        role="img"
        aria-label="Evolución de ventas"
      >
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={pad}
            x2={W - pad}
            y1={pad + p * (H - pad * 2)}
            y2={pad + p * (H - pad * 2)}
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}
        {unico ? (
          <>
            <rect
              x={W / 2 - 30}
              y={puntos[0][1]}
              width={60}
              height={H - pad - puntos[0][1]}
              rx={6}
              fill="var(--accent-soft)"
            />
            <circle cx={W / 2} cy={puntos[0][1]} r={5} fill="var(--accent)" />
          </>
        ) : (
          <>
            <path d={area} fill="var(--accent-soft)" />
            <path
              d={linea}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-fg-faint">
        <span>{fechaCorta(datos[0].fecha)}</span>
        <span>Máximo {lempiras(max)}</span>
        <span>{fechaCorta(datos[datos.length - 1].fecha)}</span>
      </div>
    </div>
  );
}

function MetodosPago({
  metodos,
  total,
}: {
  metodos: TotalesGrupo[];
  total: number;
}) {
  const base = ["efectivo", "tarjeta", "transferencia"];
  const mapa = new Map(metodos.map((m) => [m.nombre, m]));
  const lista = [
    ...base.map(
      (nombre) =>
        mapa.get(nombre) ?? { nombre, total: 0, cantidad: 0 },
    ),
    ...metodos.filter((m) => !base.includes(m.nombre)),
  ];
  return (
    <ul className="space-y-4">
      {lista.map((m) => (
        <li key={m.nombre}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{pagoLabel(m.nombre)}</span>
            <span className="font-semibold tabular-nums">{lempiras(m.total)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${total > 0 ? Math.max(2, (m.total / total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-fg-muted">{m.cantidad} facturas</p>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const isBodega = user?.rol === "bodega";
  const isCaja = user?.rol === "caja";
  const verVentas = !isBodega;

  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [data, setData] = useState<DashboardData | null>(null);
  const [resumen, setResumen] = useState<ResumenVentas | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [error, setError] = useState("");
  const [verTodasAlertas, setVerTodasAlertas] = useState(false);

  const rangoActual = useMemo(() => rango(periodo), [periodo]);
  const periodoLabel =
    PERIODOS.find((p) => p.id === periodo)?.label ?? "Hoy";
  const rangoTexto =
    periodo === "todo"
      ? "Todo el histórico"
      : rangoActual.desde === rangoActual.hasta
        ? fechaCorta(rangoActual.desde)
        : `${fechaCorta(rangoActual.desde)} – ${fechaCorta(rangoActual.hasta)}`;

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!verVentas) return;
    let vigente = true;
    setCargandoResumen(true);
    api
      .resumenVentas(rangoActual.desde, rangoActual.hasta)
      .then((r) => {
        if (vigente) setResumen(r);
      })
      .catch((e) => {
        if (vigente) setError(String(e));
      })
      .finally(() => {
        if (vigente) setCargandoResumen(false);
      });
    return () => {
      vigente = false;
    };
  }, [rangoActual.desde, rangoActual.hasta, verVentas]);

  const serie = useMemo(() => (resumen?.serie ?? []).slice(-30), [resumen]);
  const alertasVisibles = useMemo(
    () =>
      data
        ? verTodasAlertas
          ? data.productos_alerta
          : data.productos_alerta.slice(0, LIMITE_ALERTAS)
        : [],
    [data, verTodasAlertas],
  );

  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const fechaLarga = ahora
    .toLocaleDateString("es-HN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .replace(/^./, (c) => c.toUpperCase());
  const hora12 = ahora.toLocaleTimeString("es-HN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="page">
      {error ? <Alert>{error}</Alert> : null}

      <PageHero
        title="Resumen"
        subtitle={`Hola, ${user?.nombre.split(" ")[0]}. ${
          isBodega
            ? "Estado del inventario de tu operación."
            : "Rendimiento consolidado de tu operación."
        }`}
        description="Vista consolidada de ventas, actividad y alertas del negocio. Cambia el periodo para analizar otros rangos."
        icon={BarChart3}
        badge={`${periodoLabel} · ${rangoTexto}`}
      />

      {/* Filtros y accesos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {verVentas ? (
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                aria-pressed={periodo === p.id}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  periodo === p.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface-2 text-fg-muted hover:bg-hover hover:text-fg",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-fg-muted">
            Inventario y alertas de stock
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 hidden text-xs text-fg-muted sm:inline">
            {fechaLarga} · {hora12}
          </span>
          {cargandoResumen && verVentas ? (
            <span className="text-xs text-fg-muted">Actualizando…</span>
          ) : null}
          {!isBodega ? (
            <Link to="/pos">
              <Button size="sm">
                <ShoppingCart className="h-4 w-4" />
                Ir a caja
              </Button>
            </Link>
          ) : null}
          {!isCaja ? (
            <Link to="/inventario">
              <Button variant="secondary" size="sm">
                <Warehouse className="h-4 w-4" />
                Inventario
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Métricas */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {verVentas ? (
          <>
            <Stat
              label="Ventas totales"
              value={lempiras(resumen?.total ?? 0)}
              hint={periodoLabel}
              icon={<Receipt className="h-5 w-5" />}
            />
            <Stat
              label="Número de ventas"
              value={resumen?.cantidad ?? 0}
              hint="Ventas completadas"
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <Stat
              label="Promedio por factura"
              value={lempiras(resumen?.ticket_promedio ?? 0)}
              hint={periodoLabel}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </>
        ) : null}
        <Stat
          label="Bajo stock mínimo"
          value={data?.stock_bajo ?? 0}
          tone={(data?.stock_bajo ?? 0) > 0 ? "warn" : "ok"}
          hint={
            (data?.stock_bajo ?? 0) > 0
              ? "Requieren reposición"
              : "Inventario saludable"
          }
          icon={<PackageCheck className="h-5 w-5" />}
        />
      </div>

      {/* Gráficos */}
      {verVentas ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4">
              <h2 className="card-title">Evolución de ventas</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Ventas por día en el periodo seleccionado.
              </p>
            </div>
            <GraficoSerie serie={serie} />
          </Card>
          <Card className="p-5">
            <div className="mb-4">
              <h2 className="card-title">Métodos de pago</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Distribución del total vendido en el periodo.
              </p>
            </div>
            <MetodosPago
              metodos={resumen?.por_metodo ?? []}
              total={resumen?.total ?? 0}
            />
          </Card>
        </div>
      ) : null}

      {/* Últimas ventas y alertas */}
      <div
        className={cn(
          "mt-5 grid gap-5",
          verVentas && "lg:grid-cols-2",
        )}
      >
        {verVentas ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between bg-surface-2 px-5 py-4">
              <h2 className="card-title">Últimas ventas</h2>
              <Badge tone="accent">
                {data?.ultimas_ventas.length ?? 0} recientes
              </Badge>
            </div>
            {!data ? (
              <p className="empty-state">Cargando…</p>
            ) : data.ultimas_ventas.length === 0 ? (
              <p className="empty-state">Aún no hay ventas registradas.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Factura</th>
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

        <Card className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center justify-between bg-surface-2 px-5 py-4">
            <h2 className="card-title flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warn" />
              Alertas de stock
              {data && data.stock_bajo > 0 ? (
                <Badge tone="warn">{data.stock_bajo}</Badge>
              ) : null}
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
          {!data ? (
            <p className="empty-state">Cargando…</p>
          ) : data.productos_alerta.length === 0 ? (
            <p className="empty-state">No hay productos activos en el inventario.</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {alertasVisibles.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-fg-faint">
                      {p.imagen ? (
                        <img
                          src={p.imagen}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.nombre}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {p.marca} · {p.medida}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={p.stock <= p.stock_minimo ? "warn" : "default"}>
                        {p.stock} / {p.stock_minimo}
                      </Badge>
                      <p className="mt-1 text-[10px] text-fg-faint">
                        {p.stock <= p.stock_minimo ? "Reponer" : "Disponible"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {data.productos_alerta.length > LIMITE_ALERTAS ? (
                <div className="mt-auto flex justify-end border-t border-border px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVerTodasAlertas((v) => !v)}
                  >
                    {verTodasAlertas
                      ? "Ver menos"
                      : `Ver más (${data.productos_alerta.length - LIMITE_ALERTAS})`}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
