import { EmptyState } from "@/components/ui/empty-state";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Printer, RefreshCw, ScanBarcode, Star, Usb } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { fechaHora } from "@/lib/format";
import type { DispositivosData, FavoritoDispositivo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const LIMITE_USB = 8;

type TipoFavorito = "impresora" | "dispositivo";

function BotonFavorito({
  activo,
  nombre,
  onClick,
}: {
  activo: boolean;
  nombre: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="iconSm"
      title={activo ? `Quitar "${nombre}" de favoritos` : `Agregar "${nombre}" a favoritos`}
      aria-label={activo ? `Quitar ${nombre} de favoritos` : `Agregar ${nombre} a favoritos`}
      aria-pressed={activo}
      onClick={onClick}
    >
      <Star className={cn("h-4 w-4", activo && "fill-current text-warn-fg")} />
    </Button>
  );
}

export function DispositivosPage() {
  const toast = useToast();
  const [data, setData] = useState<DispositivosData | null>(null);
  const [favoritos, setFavoritos] = useState<FavoritoDispositivo[]>([]);
  const [soloFavoritos, setSoloFavoritos] = useState(false);
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

  async function cargarFavoritos() {
    try {
      setFavoritos(await api.listarFavoritosDispositivo());
    } catch {
      // Los favoritos no son críticos para usar la página.
    }
  }

  async function alternarFavorito(
    tipo: TipoFavorito,
    nombre: string,
    clase = "",
  ) {
    try {
      const marcado = await api.alternarFavoritoDispositivo(tipo, nombre, clase);
      setFavoritos((f) =>
        marcado
          ? [...f, { tipo, nombre, clase }]
          : f.filter((x) => !(x.tipo === tipo && x.nombre === nombre)),
      );
      toast.ok(
        marcado
          ? `"${nombre}" agregado a favoritos.`
          : `"${nombre}" quitado de favoritos.`,
      );
    } catch (err) {
      toast.error(String(err));
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
    void cargarFavoritos();
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
        p
          ? `${codigo} → ${p.nombre} (stock ${p.stock})`
          : `${codigo} → sin producto registrado con ese código`,
      );
      setData((d) => (d ? { ...d, ultimo_escaneo: new Date().toISOString() } : d));
    } catch (err) {
      toast.error(String(err));
    }
  }

  const clavesFavoritas = new Set(
    favoritos.map((f) => `${f.tipo}:${f.nombre}`),
  );
  const esFavorito = (tipo: string, nombre: string) =>
    clavesFavoritas.has(`${tipo}:${nombre}`);

  function visibles<T extends { nombre: string }>(lista: T[], tipo: TipoFavorito): T[] {
    const filtrados = soloFavoritos
      ? lista.filter((x) => esFavorito(tipo, x.nombre))
      : lista;
    // Los favoritos se muestran primero dentro de cada sección.
    return [...filtrados].sort(
      (a, b) => Number(esFavorito(tipo, b.nombre)) - Number(esFavorito(tipo, a.nombre)),
    );
  }

  const impresoras = data ? visibles(data.impresoras, "impresora") : [];
  const lectores = data ? visibles(data.lectores, "dispositivo") : [];
  const usb = data ? visibles(data.usb, "dispositivo") : [];
  const usbVisibles = verTodosUsb ? usb : usb.slice(0, LIMITE_USB);

  return (
    <div className="page">
      <PageHero
        title="Dispositivos"
        subtitle="Impresora de facturas y lector de código de barras"
        description="Vea los dispositivos conectados a esta PC, marque sus favoritos, elija la impresora para las facturas de caja y pruebe el lector de código de barras."
        icon={Printer}
      />

      {favoritos.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <Star className="h-5 w-5 text-warn-fg" />
            Favoritos
          </h2>
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              {favoritos.map((f) => {
                const conectado =
                  f.tipo === "impresora"
                    ? data?.impresoras.some((i) => i.nombre === f.nombre)
                    : data?.lectores.some((l) => l.nombre === f.nombre) ||
                      data?.usb.some((u) => u.nombre === f.nombre);
                return (
                  <div
                    key={`${f.tipo}:${f.nombre}`}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2"
                  >
                    <Star className="h-4 w-4 shrink-0 fill-current text-warn-fg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">
                        {f.nombre}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {f.tipo === "impresora" ? "Impresora" : f.clase || "Dispositivo"}
                        {conectado === false ? " · no detectado ahora" : ""}
                      </p>
                    </div>
                    <BotonFavorito
                      activo
                      nombre={f.nombre}
                      onClick={() =>
                        void alternarFavorito(f.tipo as TipoFavorito, f.nombre, f.clase)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <Button
          variant={soloFavoritos ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setSoloFavoritos((v) => !v)}
          aria-pressed={soloFavoritos}
        >
          <Star
            className={cn("h-4 w-4", soloFavoritos && "fill-current text-warn-fg")}
          />
          Solo favoritos
        </Button>
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
        {!data || impresoras.length === 0 ? (
          <Card>
            <EmptyState>
              {data?.detectando
                ? "Detectando dispositivos en segundo plano…"
                : soloFavoritos && favoritos.length > 0
                  ? "Ninguna impresora favorita está conectada ahora."
                  : "No se detectaron impresoras ni dispositivos de impresión en esta PC."}
            </EmptyState>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {impresoras.map((imp) => {
              const seleccionada = data.impresora_ticket === imp.nombre;
              const favorita = esFavorito("impresora", imp.nombre);
              return (
                <Card key={imp.nombre} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{imp.nombre}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <BotonFavorito
                        activo={favorita}
                        nombre={imp.nombre}
                        onClick={() =>
                          void alternarFavorito("impresora", imp.nombre)
                        }
                      />
                      {!imp.instalada ? (
                        <Badge tone="warn">Detectada por USB</Badge>
                      ) : imp.sin_conexion ? (
                        <Badge tone="warn">Sin conexión</Badge>
                      ) : (
                        <Badge tone="ok">Lista</Badge>
                      )}
                    </div>
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
                        {data.modo === "usb"
                          ? "Facturas · USB directo"
                          : "Para facturas de caja"}
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
                      Windows no tiene un driver instalado ni se pudo abrir el dispositivo por
                      USB. Instale el driver ESC/POS de SAT (o "Generic / Text Only") y vuelva a
                      detectar.
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
                {data?.ultimo_escaneo
                  ? fechaHora(data.ultimo_escaneo)
                  : "ninguno en esta sesión"}
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
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">
                {scanResultado}
              </p>
            ) : null}
          </Card>
          <Card className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Teclados / lectores HID detectados</th>
                  <th>Estado</th>
                  <th aria-label="Favorito" />
                </tr>
              </thead>
              <tbody>
                {lectores.map((l, i) => (
                  <tr key={`${l.nombre}-${i}`}>
                    <td>{l.nombre}</td>
                    <td>
                      <Badge tone={l.estado === "OK" ? "ok" : "warn"}>
                        {l.estado === "OK" ? "Conectado" : l.estado || "—"}
                      </Badge>
                    </td>
                    <td>
                      <BotonFavorito
                        activo={esFavorito("dispositivo", l.nombre)}
                        nombre={l.nombre}
                        onClick={() =>
                          void alternarFavorito("dispositivo", l.nombre, l.clase)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && lectores.length === 0 ? (
              <EmptyState>No se detectaron teclados HID.</EmptyState>
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
                <th aria-label="Favorito" />
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
                  <td>
                    <BotonFavorito
                      activo={esFavorito("dispositivo", d.nombre)}
                      nombre={d.nombre}
                      onClick={() =>
                        void alternarFavorito("dispositivo", d.nombre, d.clase)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && usb.length === 0 ? (
            <EmptyState>No se detectaron dispositivos USB o HID.</EmptyState>
          ) : null}
          {usb.length > LIMITE_USB ? (
            <div className="flex justify-end border-t border-border px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => setVerTodosUsb((v) => !v)}>
                {verTodosUsb ? "Ver menos" : `Ver más (${usb.length - LIMITE_USB})`}
              </Button>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
