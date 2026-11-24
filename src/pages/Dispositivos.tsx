import { useEffect, useRef, useState, type FormEvent } from "react";
import { Printer, RefreshCw, ScanBarcode, Usb } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { fechaHora } from "@/lib/format";
import type { DispositivosData } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const LIMITE_USB = 8;

export function DispositivosPage() {
  const toast = useToast();
  const [data, setData] = useState<DispositivosData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [probando, setProbando] = useState("");
  const [scan, setScan] = useState("");
  const [scanResultado, setScanResultado] = useState("");
  const [verTodosUsb, setVerTodosUsb] = useState(false);
  const reintentos = useRef(0);

  async function cargar(silencioso = false) {
    if (!silencioso) setCargando(true);
    try {
      const d = await api.listarDispositivos();
      setData(d);
      // El backend detecta en segundo plano: recogemos el resultado cuando ya esté.
      if (d.detectando && reintentos.current < 4) {
        reintentos.current += 1;
        window.setTimeout(() => void cargar(true), 1200);
      } else {
        reintentos.current = 0;
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      if (!silencioso) setCargando(false);
    }
  }

  async function forzar() {
    setCargando(true);
    reintentos.current = 0;
    try {
      setData(await api.actualizarDispositivos());
      window.setTimeout(() => void cargar(true), 1200);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function elegirImpresora(
    nombre: string,
    modo: "usb" | "spooler",
    ruta = "",
  ) {
    try {
      await api.guardarImpresoraTicket(nombre, modo, ruta);
      toast.ok(
        `"${nombre}" quedó seleccionada para imprimir las facturas de caja${
          modo === "usb" ? " mediante conexión directa USB (sin driver)." : "."
        }`,
      );
      setData((d) => (d ? { ...d, impresora_ticket: nombre, modo } : d));
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function probar(nombre: string, modo: "usb" | "spooler", ruta = "") {
    setProbando(nombre);
    try {
      await api.imprimirPrueba(nombre, modo, ruta);
      toast.ok(`Página de prueba enviada a "${nombre}".`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setProbando("");
    }
  }

  async function probarLector(e: FormEvent) {
    e.preventDefault();
    const codigo = scan.trim();
    if (!codigo) return;
    setScan("");
    try {
      await api.registrarEscaneo(codigo);
      const p = await api.buscarProductoCodigo(codigo);
      setScanResultado(
        p ? `${codigo} → ${p.nombre} (stock ${p.stock})` : `${codigo} → sin producto registrado con ese código`,
      );
      setData((d) => (d ? { ...d, ultimo_escaneo: new Date().toISOString() } : d));
    } catch (err) {
      toast.error(String(err));
    }
  }

  const usbVisibles = data
    ? verTodosUsb
      ? data.usb
      : data.usb.slice(0, LIMITE_USB)
    : [];

  return (
    <div className="page">
      <PageHero
        title="Dispositivos"
        subtitle="Impresora de facturas y lector de código de barras"
        description="Vea los dispositivos conectados a esta PC, elija la impresora para las facturas de caja y pruebe el lector de código de barras."
        icon={Printer}
        badge={data ? `${data.impresoras.length} impresoras` : "Detectando…"}
      />
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {data?.detectando ? (
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Actualizando en segundo plano…
          </span>
        ) : null}
        <Button variant="outline" onClick={forzar} disabled={cargando}>
          <RefreshCw className={cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {cargando ? "Detectando…" : "Actualizar"}
        </Button>
      </div>
      {data?.errores.map((e) => (
        <Alert key={e} tone="warn">
          {e}
        </Alert>
      ))}

      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <Printer className="h-5 w-5 text-accent-fg" />
          Impresoras y dispositivos de impresión
        </h2>
        {!data || data.impresoras.length === 0 ? (
          <Card>
            <p className="empty-state">
              {data?.detectando
                ? "Detectando dispositivos en segundo plano…"
                : "No se detectaron impresoras ni dispositivos de impresión en esta PC."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.impresoras.map((imp) => {
              const seleccionada = data.impresora_ticket === imp.nombre;
              return (
                <Card key={imp.nombre} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{imp.nombre}</p>
                    {!imp.instalada ? (
                      <Badge tone="warn">Detectada por USB</Badge>
                    ) : imp.sin_conexion ? (
                      <Badge tone="warn">Sin conexión</Badge>
                    ) : (
                      <Badge tone="ok">Lista</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {imp.instalada
                      ? `${imp.driver || "Driver desconocido"} · Puerto ${imp.puerto || "—"}`
                      : `USB ${imp.puerto || "(sin datos de puerto)"}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {imp.predeterminada ? <Badge>Predeterminada de Windows</Badge> : null}
                    {seleccionada ? (
                      <Badge tone="accent">
                        {data.modo === "usb" ? "Facturas · USB directo" : "Para facturas de caja"}
                      </Badge>
                    ) : null}
                    {imp.puente ? <Badge tone="ok">Sin driver · USB directo</Badge> : null}
                  </div>
                  {imp.instalada || imp.puente ? (
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {!seleccionada ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            elegirImpresora(
                              imp.nombre,
                              imp.instalada ? "spooler" : "usb",
                              imp.ruta,
                            )
                          }
                        >
                          {imp.instalada ? "Usar para facturas" : "Usar sin driver (USB)"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          probar(
                            imp.nombre,
                            imp.instalada ? "spooler" : "usb",
                            imp.ruta,
                          )
                        }
                        disabled={probando !== ""}
                      >
                        {probando === imp.nombre
                          ? "Imprimiendo…"
                          : imp.instalada
                            ? "Imprimir prueba"
                            : "Imprimir prueba USB"}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-fg-muted">
                      Windows no tiene un driver instalado ni se pudo abrir el dispositivo por USB.
                      Instale el driver ESC/POS de SAT (o "Generic / Text Only") y vuelva a detectar.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-fg-muted">
          Las facturas se imprimen automáticamente al cobrar en la impresora marcada. La térmica
          SAT conectada por USB puede usar el puente directo, sin instalar ningún driver: enviamos
          el ticket ESC/POS al puerto USB del dispositivo. Si otra aplicación tiene abierta la
          impresora, cierre esa aplicación antes de imprimir.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <ScanBarcode className="h-5 w-5 text-accent-fg" />
          Lector de código de barras
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm text-fg-muted">
              El lector USB funciona como teclado (HID): Windows no lo distingue de un teclado
              normal, por eso se verifica con un escaneo real. Último escaneo registrado:{" "}
              <strong className="text-fg">
                {data?.ultimo_escaneo ? fechaHora(data.ultimo_escaneo) : "ninguno en esta sesión"}
              </strong>
            </p>
            <form onSubmit={probarLector} className="mt-4">
              <Label>Escanee aquí para probar el lector</Label>
              <Input
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="Escanee un código y pulse Enter"
                className="font-mono"
              />
            </form>
            {scanResultado ? (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{scanResultado}</p>
            ) : null}
          </Card>
          <Card className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Teclados / lectores HID detectados</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data?.lectores.map((l, i) => (
                  <tr key={`${l.nombre}-${i}`}>
                    <td>{l.nombre}</td>
                    <td>
                      <Badge tone={l.estado === "OK" ? "ok" : "warn"}>
                        {l.estado === "OK" ? "Conectado" : l.estado || "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.lectores.length === 0 ? (
              <p className="empty-state">No se detectaron teclados HID.</p>
            ) : null}
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <Usb className="h-5 w-5 text-accent-fg" />
          Dispositivos USB y HID conectados
        </h2>
        <Card className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>Tipo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usbVisibles.map((d, i) => (
                <tr key={`${d.nombre}-${i}`}>
                  <td className="font-medium">{d.nombre}</td>
                  <td className="text-fg-muted">{d.clase}</td>
                  <td>
                    <Badge tone={d.estado === "OK" ? "ok" : "warn"}>
                      {d.estado === "OK" ? "Conectado" : d.estado || "—"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.usb.length === 0 ? (
            <p className="empty-state">No se detectaron dispositivos USB o HID.</p>
          ) : null}
          {data && data.usb.length > LIMITE_USB ? (
            <div className="flex justify-end border-t border-border px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVerTodosUsb((v) => !v)}
              >
                {verTodosUsb
                  ? "Ver menos"
                  : `Ver más (${data.usb.length - LIMITE_USB})`}
              </Button>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
