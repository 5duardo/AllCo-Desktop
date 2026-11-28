import { EmptyState } from "@/components/ui/empty-state";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  Eye,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { condicionLabel, fechaHora, lempiras, pagoLabel } from "@/lib/format";
import type { VentaListado } from "@/lib/types";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card, Stat } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";

const LIMITE = 15;

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const HOY = iso(new Date());
const INICIO_MES = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

export function FacturacionPage({ sinHero = false, sinPage = false }: { sinHero?: boolean; sinPage?: boolean }) {
  const toast = useToast();
  const { user, puede } = useAuth();
  const esAdmin = user?.rol === "admin";
  const esCaja = user?.rol === "caja";

  const [desde, setDesde] = useState(esCaja ? HOY : INICIO_MES);
  const [hasta, setHasta] = useState(HOY);
  const [estado, setEstado] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [ventas, setVentas] = useState<VentaListado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [logoNegocio, setLogoNegocio] = useState<string | null>(null);

  const [ticket, setTicket] = useState<VentaListado | null>(null);
  const [ticketTexto, setTicketTexto] = useState("");
  const [anularVenta, setAnularVenta] = useState<VentaListado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setVentas(await api.listarVentas(esCaja ? HOY : desde, hasta));
      setVerTodas(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    api
      .marcaNegocio()
      .then((m) => setLogoNegocio(m.mostrar_logo_factura ? m.logo : null))
      .catch(() => {});
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ventas.filter((v) => {
      if (estado === "completadas" && v.estado === "anulada") return false;
      if (estado === "anuladas" && v.estado !== "anulada") return false;
      if (!q) return true;
      return (
        String(v.id).includes(q) ||
        `#${v.id}`.includes(q) ||
        (v.cliente_nombre ?? "").toLowerCase().includes(q) ||
        v.usuario_nombre.toLowerCase().includes(q)
      );
    });
  }, [ventas, estado, busqueda]);

  const completadas = filtradas.filter((v) => v.estado !== "anulada");
  const totalFacturado = completadas.reduce((suma, v) => suma + v.total, 0);
  const ticketPromedio = completadas.length > 0 ? totalFacturado / completadas.length : 0;
  const anuladas = filtradas.length - completadas.length;
  const visibles = verTodas ? filtradas : filtradas.slice(0, LIMITE);

  async function verTicket(v: VentaListado) {
    try {
      const texto = await api.obtenerTicket(v.id);
      setTicketTexto(texto);
      setTicket(v);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function reimprimir(v: VentaListado) {
    try {
      await api.imprimirFactura(v.id);
      toast.ok(`Factura #${v.id} enviada a la impresora.`);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function confirmarAnulacion() {
    if (!anularVenta) return;
    if (motivo.trim().length < 3) {
      toast.error("Indique el motivo de la anulación.");
      return;
    }
    setAnulando(true);
    try {
      await api.anularVenta(anularVenta.id, motivo.trim());
      toast.ok(`Factura #${anularVenta.id} anulada y stock restaurado.`);
      setAnularVenta(null);
      setMotivo("");
      await cargar();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAnulando(false);
    }
  }

  return (
    <div className={sinPage ? undefined : "page"}>
      {sinHero ? null : <PageHero
        title="Facturación"
        subtitle="Facturas emitidas, reimpresión y anulación"
        description="Consulta las facturas por periodo, cliente o número, revisa el ticket, reimprímelo o anula una venta."
        icon={ReceiptText}
      />}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {esCaja ? (
          <div className="w-44">
            <Label>Fecha</Label>
            <div
              className="flex h-11 items-center rounded-xl border border-border bg-surface-2 px-3 text-sm font-medium tabular-nums text-fg-muted"
              title="Las cuentas de caja solo ven ventas del día actual"
            >
              Hoy · {HOY.split("-").reverse().join("/")}
            </div>
          </div>
        ) : (
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
        )}
        <div className="w-44">
          <Label>Estado</Label>
          <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="completadas">Completadas</option>
            <option value="anuladas">Anuladas</option>
          </Select>
        </div>
        <div className="min-w-56 flex-1">
          <Label>Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="N° de factura, cliente o cajero"
              className="pl-10"
            />
          </div>
        </div>
        <Button onClick={() => void cargar()} disabled={cargando}>
          <RefreshCw className={cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {cargando ? "Cargando…" : "Actualizar"}
        </Button>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total facturado"
          value={lempiras(totalFacturado)}
          hint={`${completadas.length} facturas completadas`}
        />
        <Stat
          label="Ticket promedio"
          value={lempiras(ticketPromedio)}
          hint="Facturas no anuladas"
        />
        <Stat label="Facturas en el periodo" value={filtradas.length} hint="Incluye anuladas" />
        <Stat label="Anuladas" value={anuladas} hint="Requieren motivo" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 px-4 py-3">
          <h2 className="card-title flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-accent-fg" />
            Facturas emitidas
            <Badge>{filtradas.length}</Badge>
          </h2>
          <Link to="/pos">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nueva factura
            </Button>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Cajero</th>
                <th>Pago</th>
                <th>Condición</th>
                <th>Ítems</th>
                <th className="num">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.id} className={v.estado === "anulada" ? "opacity-60" : undefined}>
                  <td className="font-mono font-semibold">#{v.id}</td>
                  <td className="whitespace-nowrap text-fg-muted">{fechaHora(v.fecha)}</td>
                  <td>{v.cliente_nombre ?? "Consumidor final"}</td>
                  <td className="text-fg-muted">{v.usuario_nombre}</td>
                  <td className="text-fg-muted">{pagoLabel(v.metodo_pago)}</td>
                  <td
                    className={
                      v.condicion === "credito"
                        ? "font-medium text-warn-fg"
                        : "text-fg-muted"
                    }
                  >
                    {condicionLabel(v.condicion)}
                  </td>
                  <td className="num text-fg-muted">{v.items}</td>
                  <td className="num font-semibold">{lempiras(v.total)}</td>
                  <td>
                    {v.estado === "anulada" ? (
                      <Badge tone="danger">Anulada</Badge>
                    ) : (
                      <Badge tone="ok">Completada</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void verTicket(v)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void reimprimir(v)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Reimprimir
                      </Button>
                      {esAdmin && puede("/facturacion", "eliminar") && v.estado !== "anulada" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger-fg hover:bg-danger-soft"
                          onClick={() => {
                            setMotivo("");
                            setAnularVenta(v);
                          }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Anular
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length === 0 ? (
            <EmptyState>No hay facturas con ese criterio.</EmptyState>
          ) : null}
        </div>

        {filtradas.length > LIMITE ? (
          <div className="flex justify-end border-t border-border px-4 py-2">
            <Button variant="ghost" size="sm" onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? "Ver menos" : `Ver más (${filtradas.length - LIMITE})`}
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!ticket}
        small
        title={ticket ? `Factura #${ticket.id}` : "Factura"}
        subtitle={
          ticket
            ? `${fechaHora(ticket.fecha)} · ${ticket.cliente_nombre ?? "Consumidor final"}`
            : undefined
        }
        onClose={() => setTicket(null)}
      >
        <div className="mx-auto w-fit max-w-full rounded-xl bg-surface-2 p-4">
          <div className="mx-auto w-fit max-w-full overflow-x-auto">
            {logoNegocio ? (
              <div className="mb-3 flex justify-center">
                <img src={logoNegocio} alt="" className="h-16 w-16 object-contain" />
              </div>
            ) : null}
            <pre className="whitespace-pre font-mono text-xs text-fg">{ticketTexto}</pre>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setTicket(null)}>
            Cerrar
          </Button>
          {ticket ? (
            <Button onClick={() => void reimprimir(ticket)}>
              <Printer className="h-4 w-4" />
              Reimprimir
            </Button>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!anularVenta}
        title="Anular factura"
        subtitle={anularVenta ? `Factura #${anularVenta.id}` : undefined}
        onClose={() => setAnularVenta(null)}
      >
        <p className="text-sm text-fg-muted">
          Se anulará la factura{" "}
          <b className="text-fg">#{anularVenta?.id}</b> por{" "}
          <b className="text-fg">{lempiras(anularVenta?.total ?? 0)}</b>. El stock de los
          productos vuelve al inventario y la venta quedará marcada como anulada.
        </p>
        <div className="mt-4">
          <Label>Motivo de la anulación</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Cobro equivocado, devolución del cliente…"
          />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setAnularVenta(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirmarAnulacion()} disabled={anulando}>
            <Ban className="h-4 w-4" />
            {anulando ? "Anulando…" : "Anular factura"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
