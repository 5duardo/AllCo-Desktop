import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Calculator, Download, RefreshCw, ReceiptText } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { fechaHora, lempiras, pagoLabel } from "@/lib/format";
import type { ConfigApp, VentaListado } from "@/lib/types";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { Label, Select, Input } from "@/components/ui/input";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const LIMITE = 20;

function dos(n: number) {
  return String(n).padStart(2, "0");
}

function rangoMes(anio: number, mes: number) {
  const desde = `${anio}-${dos(mes)}-01`;
  const ultimo = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${dos(mes)}-${dos(ultimo)}`;
  return { desde, hasta };
}

function campo(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function fila(...valores: (string | number)[]) {
  return valores.map(campo).join(";");
}

export function TalonariosPage() {
  const toast = useToast();
  const hoy = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [cfg, setCfg] = useState<ConfigApp | null>(null);
  const [ventas, setVentas] = useState<VentaListado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [usadoDesde, setUsadoDesde] = useState("");
  const [usadoHasta, setUsadoHasta] = useState("");

  async function cargar() {
    setCargando(true);
    try {
      const { desde, hasta } = rangoMes(anio, mes);
      const [lista, config] = await Promise.all([
        api.listarVentas(desde, hasta),
        api.obtenerConfig(),
      ]);
      setVentas(lista);
      setCfg(config);
      setVerTodas(false);
      if (lista.length > 0) {
        const ids = lista.map((v) => v.id);
        setUsadoDesde(String(Math.min(...ids)));
        setUsadoHasta(String(Math.max(...ids)));
      } else {
        setUsadoDesde("");
        setUsadoHasta("");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, [anio, mes]);

  const completadas = ventas.filter((v) => v.estado !== "anulada");
  const total = completadas.reduce((suma, v) => suma + v.total, 0);
  const tasa = Number(cfg?.fiscal_isv ?? 15) || 0;
  const preciosConIsv = cfg?.fiscal_precios_con_isv !== "0";
  const base = preciosConIsv ? total / (1 + tasa / 100) : total;
  const isv = preciosConIsv ? total - base : total * (tasa / 100);
  const visibles = verTodas ? ventas : ventas.slice(0, LIMITE);
  const anios = Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - 5 + i);

  async function exportar() {
    setExportando(true);
    try {
      const lineas: string[] = [];
      lineas.push(fila("REPORTE MENSUAL DE TALONARIOS"));
      lineas.push(fila("Negocio", cfg?.negocio_nombre ?? "—"));
      lineas.push(fila("RTN", cfg?.fiscal_rtn || "—"));
      lineas.push(fila("CAI", cfg?.fiscal_cai || "—"));
      lineas.push(
        fila(
          "Rango autorizado",
          `${cfg?.fiscal_rango_desde || "—"} al ${cfg?.fiscal_rango_hasta || "—"}`,
        ),
      );
      lineas.push(fila("Fecha límite de emisión", cfg?.fiscal_fecha_limite || "—"));
      lineas.push(
        fila("Correlativo utilizado", `${usadoDesde || "—"} al ${usadoHasta || "—"}`),
      );
      lineas.push(fila("Periodo", `${MESES[mes - 1]} ${anio}`));
      lineas.push(fila("ISV", `${tasa}%`));
      lineas.push(fila("Precios incluyen ISV", preciosConIsv ? "Sí" : "No"));
      lineas.push("");
      lineas.push(fila("RESUMEN"));
      lineas.push(fila("Facturas completadas", completadas.length));
      lineas.push(fila("Facturas anuladas", ventas.length - completadas.length));
      lineas.push(fila("Total facturado", total.toFixed(2)));
      lineas.push(fila("Base imponible", base.toFixed(2)));
      lineas.push(fila("ISV estimado", isv.toFixed(2)));
      lineas.push("");
      lineas.push(fila("DETALLE"));
      lineas.push(fila("Factura", "Fecha", "Cliente", "Método de pago", "Total", "Estado"));
      for (const v of ventas) {
        lineas.push(
          fila(
            `#${v.id}`,
            fechaHora(v.fecha),
            v.cliente_nombre ?? "Consumidor final",
            pagoLabel(v.metodo_pago),
            v.total.toFixed(2),
            v.estado === "anulada" ? "Anulada" : "Completada",
          ),
        );
      }
      const contenido = `\uFEFF${lineas.join("\r\n")}\r\n`;

      const ruta = await save({
        defaultPath: `talonarios-${anio}-${dos(mes)}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!ruta) return;

      await invoke("guardar_reporte_fiscal", { ruta, contenido });
      toast.ok("Reporte de talonarios exportado.");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setExportando(false);
    }
  }

  const campoFiscal = (etiqueta: string, valor: string) => (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
        {etiqueta}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-fg">{valor || "—"}</p>
    </div>
  );

  return (
    <div className="page">
      <PageHero
        title="Talonarios"
        subtitle="Reporte mensual para la declaración"
        description="Resume las facturas del mes, el rango autorizado y los impuestos estimados para preparar la declaración mensual."
        icon={ReceiptText}
      />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-40">
          <Label>Mes</Label>
          <Select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-28">
          <Label>Año</Label>
          <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={() => void cargar()} disabled={cargando}>
          <RefreshCw className={cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {cargando ? "Cargando…" : "Actualizar"}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            to="/config"
            className="text-xs font-semibold text-accent-fg hover:underline"
          >
            Editar datos fiscales
          </Link>
          <Button onClick={() => void exportar()} disabled={exportando || cargando}>
            <Download className="h-4 w-4" />
            {exportando ? "Exportando…" : "Exportar CSV"}
          </Button>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title flex items-center gap-2">
            <Calculator className="h-4 w-4 text-accent-fg" />
            Datos del talonario
          </h2>
          {!cfg?.fiscal_cai ? (
            <span className="text-xs font-medium text-warn-fg">
              Complete CAI, RTN y rango en Configuración
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {campoFiscal("RTN", cfg?.fiscal_rtn ?? "")}
          {campoFiscal("CAI", cfg?.fiscal_cai ?? "")}
          {campoFiscal(
            "Rango autorizado",
            cfg?.fiscal_rango_desde
              ? `${cfg.fiscal_rango_desde} al ${cfg.fiscal_rango_hasta}`
              : "",
          )}
          {campoFiscal("Fecha límite", cfg?.fiscal_fecha_limite ?? "")}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Correlativo utilizado · del</Label>
            <Input
              value={usadoDesde}
              onChange={(e) => setUsadoDesde(e.target.value)}
              placeholder="Ej. 00000001"
              className="font-mono"
            />
          </div>
          <div>
            <Label>Correlativo utilizado · al</Label>
            <Input
              value={usadoHasta}
              onChange={(e) => setUsadoHasta(e.target.value)}
              placeholder="Ej. 00000025"
              className="font-mono"
            />
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total facturado"
          value={lempiras(total)}
          hint={`${completadas.length} facturas completadas`}
        />
        <Stat
          label="Facturas del mes"
          value={ventas.length}
          hint={`${ventas.length - completadas.length} anuladas`}
        />
        <Stat
          label="Base imponible"
          value={lempiras(base)}
          hint={preciosConIsv ? "ISV incluido en el precio" : "ISV agregado al total"}
        />
        <Stat label={`ISV estimado (${tasa}%)`} value={lempiras(isv)} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 px-4 py-3">
          <h2 className="card-title flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-accent-fg" />
            Detalle del mes
            <Badge>{ventas.length}</Badge>
          </h2>
          <span className="text-xs text-fg-muted">
            {MESES[mes - 1]} {anio}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th className="num">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.id} className={v.estado === "anulada" ? "opacity-60" : undefined}>
                  <td className="font-mono font-semibold">#{v.id}</td>
                  <td className="whitespace-nowrap text-fg-muted">{fechaHora(v.fecha)}</td>
                  <td>{v.cliente_nombre ?? "Consumidor final"}</td>
                  <td className="text-fg-muted">{pagoLabel(v.metodo_pago)}</td>
                  <td className="num font-semibold">{lempiras(v.total)}</td>
                  <td>
                    {v.estado === "anulada" ? (
                      <Badge tone="danger">Anulada</Badge>
                    ) : (
                      <Badge tone="ok">Completada</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ventas.length === 0 ? (
            <p className="empty-state">No hay facturas registradas en este mes.</p>
          ) : null}
        </div>
        {ventas.length > LIMITE ? (
          <div className="flex justify-end border-t border-border px-4 py-2">
            <Button variant="ghost" size="sm" onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? "Ver menos" : `Ver más (${ventas.length - LIMITE})`}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
