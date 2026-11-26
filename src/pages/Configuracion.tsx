import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Calculator, Palette, Printer, Save, Settings, Store, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import type { ConfigApp } from "@/lib/types";
import { BrandLogo } from "@/components/BrandLogo";
import { AccentPicker, FontPicker, ThemeModePicker } from "@/components/ThemeControls";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";

const CONFIG_TABS = [
  { id: "marca", label: "Marca", icon: Store },
  { id: "apariencia", label: "Apariencia", icon: Palette },
  { id: "factura", label: "Factura", icon: Printer },
  { id: "fiscal", label: "Fiscal", icon: Calculator },
] as const;

type ConfigTab = (typeof CONFIG_TABS)[number]["id"];

export function ConfigPage() {
  const toast = useToast();
  const [cfg, setCfg] = useState<ConfigApp | null>(null);
  const [params, setParams] = useSearchParams();
  const tab: ConfigTab = CONFIG_TABS.find((t) => t.id === params.get("tab"))?.id ?? "marca";

  function selectTab(id: ConfigTab) {
    setParams(id === "marca" ? {} : { tab: id }, { replace: true });
  }

  useEffect(() => {
    api
      .obtenerConfig()
      .then(setCfg)
      .catch((e) => toast.error(`No se pudo cargar la configuración: ${e}`));
  }, []);

  function leerLogo(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = async () => {
        const raw = String(reader.result ?? "");
        if (file.type === "image/svg+xml" || raw.length < 250_000) {
          resolve(raw);
          return;
        }
        try {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const image = new Image();
            image.onload = () => res(image);
            image.onerror = rej;
            image.src = raw;
          });
          const max = 512;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(raw);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(raw);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function subirLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El logo debe ser una imagen PNG, JPG, WebP o SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El logo no debe pesar más de 5 MB.");
      return;
    }
    try {
      const dataUrl = await leerLogo(file);
      setCfg((c) => (c ? { ...c, negocio_logo: dataUrl } : c));
      toast.ok("Logo actualizado. Guarde los cambios para aplicarlo.");
    } catch {
      toast.error("No se pudo leer la imagen del logo.");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    try {
      await api.guardarConfig(cfg);
      window.dispatchEvent(new Event("allco-brand"));
      toast.ok("Configuración guardada.");
    } catch (err) {
      toast.error(String(err));
    }
  }

  const nombreMarca = cfg?.negocio_nombre.trim() || "AllCo";

  type TicketFlag =
    | "ticket_mostrar_logo"
    | "ticket_mostrar_direccion"
    | "ticket_mostrar_fecha"
    | "ticket_mostrar_cajero"
    | "ticket_mostrar_cliente"
    | "ticket_mostrar_pago"
    | "ticket_mostrar_recibido";

  const elementosTicket: { key: TicketFlag; label: string }[] = [
    { key: "ticket_mostrar_logo", label: "Logo en la factura" },
    { key: "ticket_mostrar_direccion", label: "Dirección del negocio" },
    { key: "ticket_mostrar_fecha", label: "Fecha y hora" },
    { key: "ticket_mostrar_cajero", label: "Nombre del cajero" },
    { key: "ticket_mostrar_cliente", label: "Nombre del cliente" },
    { key: "ticket_mostrar_pago", label: "Método de pago" },
    { key: "ticket_mostrar_recibido", label: "Recibido y cambio (efectivo)" },
  ];

  function toggleTicket(key: TicketFlag) {
    if (!cfg) return;
    setCfg({ ...cfg, [key]: cfg[key] === "1" ? "0" : "1" });
  }

  const vistaTicket = (() => {
    if (!cfg) return "";
    const ver = (v: string) => v === "1";
    const ancho = cfg.ticket_ancho === "80" ? 48 : 32;
    const totalW = ancho >= 48 ? 12 : 9;
    const descW = ancho - totalW - 1;
    const centrar = (texto: string) => {
      const t = texto.trim();
      return t.length >= ancho
        ? t.slice(0, ancho)
        : " ".repeat(Math.floor((ancho - t.length) / 2)) + t;
    };
    const envolver = (texto: string, max: number) => {
      const palabras = texto.split(/\s+/).filter(Boolean);
      const lineas: string[] = [];
      let actual = "";
      for (const palabra of palabras) {
        if (!actual) actual = palabra;
        else if (actual.length + 1 + palabra.length <= max) actual += ` ${palabra}`;
        else {
          lineas.push(actual);
          actual = palabra;
        }
      }
      if (actual) lineas.push(actual);
      const salida: string[] = [];
      for (const linea of lineas) {
        let resto = linea;
        while (resto.length > max) {
          salida.push(resto.slice(0, max));
          resto = resto.slice(max).trimStart();
        }
        salida.push(resto);
      }
      return salida.length ? salida : [""];
    };
    const monto = (n: number) =>
      n.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fila = (cant: number, desc: string, importe: number) => {
      const partes = envolver(`${cant} x ${desc}`, descW);
      const primera = partes.shift() ?? "";
      return [
        `${primera.padEnd(descW)} ${monto(importe).padStart(totalW)}`.trimEnd(),
        ...partes,
      ].join("\n");
    };
    const total = (etiqueta: string, valor: number) =>
      `${etiqueta.padEnd(ancho - totalW)}${monto(valor).padStart(totalW)}`;
    const sep = "-".repeat(ancho);
    const sepFuerte = "=".repeat(ancho);
    const lineas: string[] = [];

    lineas.push(centrar(cfg.negocio_nombre));
    if (ver(cfg.ticket_mostrar_direccion) && cfg.negocio_direccion.trim()) {
      cfg.negocio_direccion.split("\n").forEach((l) => lineas.push(centrar(l)));
    }
    cfg.ticket_encabezado.split("\n").forEach((l) => {
      if (l.trim()) lineas.push(centrar(l));
    });
    lineas.push(sep, "Factura #12");
    if (ver(cfg.ticket_mostrar_fecha)) lineas.push("21/11/2026 10:30:00");
    if (ver(cfg.ticket_mostrar_cajero)) lineas.push("Cajero: Administrador");
    if (ver(cfg.ticket_mostrar_cliente)) lineas.push("Cliente: Cliente de ejemplo 1");
    lineas.push(sep);
    lineas.push(
      `${"DESCRIPCION".padEnd(descW)} ${"TOTAL".padStart(totalW)}`.trimEnd(),
    );
    lineas.push(fila(2, "Producto de ejemplo", 2400), fila(1, "Servicio de ejemplo", 250));
    lineas.push(sep, total("SUBTOTAL", 2650), sepFuerte);
    lineas.push(total("TOTAL", 2650), sepFuerte);
    if (ver(cfg.ticket_mostrar_pago)) lineas.push("Pago: efectivo");
    if (ver(cfg.ticket_mostrar_recibido)) {
      lineas.push(total("Recibido", 3000), total("Cambio", 350));
    }
    lineas.push(sep);
    cfg.ticket_pie.split("\n").forEach((l) => {
      if (l.trim()) lineas.push(centrar(l));
    });
    return lineas.join("\n");
  })();

  return (
    <div className="page">
      <PageHero
        title="Configuración"
        subtitle="Marca, apariencia, factura y datos fiscales"
        description="Organiza la identidad del negocio, la apariencia de la app, el ticket de caja y los datos fiscales. Los usuarios y las opciones del sistema están en sus propios módulos."
        icon={Settings}
        badge="Ajustes"
      />

      <div
        className="seg mb-5 flex-wrap"
        role="group"
        aria-label="Secciones de configuración"
      >
        {CONFIG_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={`seg-item ${tab === t.id ? "seg-item-active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "marca" ? (
        cfg ? (
          <Card className="p-6">
            <h2 className="card-title flex items-center gap-2">
              <Store className="h-4 w-4 text-accent-fg" />
              Marca del negocio
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Logo y nombre que aparecen en el sidebar y en la factura.
            </p>

            <form onSubmit={save} className="mt-6 flex flex-1 flex-col">
              <div className="space-y-5">
                <div>
                  <Label>Logo</Label>
                  <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-2 p-3">
                    <BrandLogo
                      logo={cfg.negocio_logo}
                      name={nombreMarca}
                      className="h-16 w-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        {cfg.negocio_logo ? "Logo personalizado" : "Logo de AllCo"}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        PNG, JPG, WebP o SVG · máximo 5 MB.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="negocio-logo"
                          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-hover"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {cfg.negocio_logo ? "Cambiar logo" : "Subir logo"}
                        </label>
                        {cfg.negocio_logo ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setCfg({ ...cfg, negocio_logo: null })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Quitar
                          </Button>
                        ) : null}
                        <input
                          id="negocio-logo"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={subirLogo}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Nombre del negocio</Label>
                  <Input
                    value={cfg.negocio_nombre}
                    onChange={(e) => setCfg({ ...cfg, negocio_nombre: e.target.value })}
                  />
                  <p className="mt-1.5 text-xs text-fg-muted">
                    Se muestra en el sidebar y en la factura.
                  </p>
                </div>

                <div>
                  <Label>Dirección (factura)</Label>
                  <Input
                    value={cfg.negocio_direccion}
                    onChange={(e) => setCfg({ ...cfg, negocio_direccion: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-6">
                <p className="section-title mb-2">Vista previa del sidebar</p>
                <div className="rounded-2xl bg-sidebar p-4">
                  <div className="flex items-center gap-3">
                    <BrandLogo
                      logo={cfg.negocio_logo}
                      name={nombreMarca}
                      className="h-10 w-10"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sidebar-fg">
                        {nombreMarca}
                      </p>
                      <p className="truncate text-[11px] text-sidebar-muted">
                        Impulsado por{" "}
                        <span className="font-medium text-sidebar-fg">AllCo</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex justify-end pt-6">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Guardar cambios
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-sm text-fg-muted">Cargando configuración…</p>
          </Card>
        )
      ) : null}

      {tab === "apariencia" ? (
        <Card className="p-6">
          <h2 className="card-title flex items-center gap-2">
            <Palette className="h-4 w-4 text-accent-fg" />
            Apariencia
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Se guarda en esta PC y aplica a todos los usuarios de la app.
          </p>

          <div className="mt-6">
            <Label>Tema</Label>
            <ThemeModePicker />
            <p className="mt-2 text-xs text-fg-muted">
              «Sistema» sigue el modo claro u oscuro de Windows.
            </p>
          </div>

          <div className="mt-6">
            <Label>Color de acento</Label>
            <AccentPicker />
            <p className="mt-2 text-xs text-fg-muted">
              Cambia botones, enlaces, selecciones y elementos destacados.
            </p>
          </div>

          <div className="mt-6">
            <Label>Tipografía</Label>
            <FontPicker />
            <p className="mt-2 text-xs text-fg-muted">
              Cambia la fuente de toda la aplicación.
            </p>
          </div>
        </Card>
      ) : null}

      {tab === "factura" ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="icon-chip">
                <Printer className="h-5 w-5" />
              </span>
              <div>
                <h2 className="card-title">Elementos de la factura al imprimir</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Personalice el texto y elija qué datos aparecen en el ticket de caja.
              </p>
            </div>
          </div>
        </div>

        {cfg ? (
          <form onSubmit={save} className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label>Ancho de papel</Label>
                <Select
                  value={cfg.ticket_ancho}
                  onChange={(e) => setCfg({ ...cfg, ticket_ancho: e.target.value })}
                >
                  <option value="58">58 mm · 32 caracteres</option>
                  <option value="80">80 mm · 48 caracteres</option>
                </Select>
                <p className="mt-1 text-xs text-fg-muted">
                  Ajusta las columnas del ticket y el tamaño del logo para la impresora térmica.
                </p>
              </div>
              <div>
                <Label>Encabezado adicional</Label>
                <Textarea
                  value={cfg.ticket_encabezado}
                  onChange={(e) => setCfg({ ...cfg, ticket_encabezado: e.target.value })}
                  placeholder="Ej. Sucursal Norte · Tel. 0000-0000"
                  className="min-h-20 font-mono text-xs"
                />
                <p className="mt-1 text-xs text-fg-muted">
                  Va debajo del nombre del negocio, una línea por renglón.
                </p>
              </div>
              <div>
                <Label>Pie de factura</Label>
                <Textarea
                  value={cfg.ticket_pie}
                  onChange={(e) => setCfg({ ...cfg, ticket_pie: e.target.value })}
                  placeholder="¡Gracias por su preferencia!"
                  className="min-h-20 font-mono text-xs"
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-fg-muted">Datos incluidos</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {elementosTicket.map((el) => (
                    <label
                      key={el.key}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={cfg[el.key] === "1"}
                        onChange={() => toggleTicket(el.key)}
                      />
                      {el.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Guardar factura
                </Button>
              </div>
            </div>
            <div>
              <p className="section-title mb-2">Vista previa del ticket</p>
              <div className="mx-auto w-fit max-w-full rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                {cfg.negocio_logo && cfg.ticket_mostrar_logo === "1" ? (
                  <div className="mb-3 flex justify-center">
                    <img
                      src={cfg.negocio_logo}
                      alt=""
                      className="h-16 w-16 object-contain grayscale contrast-[2]"
                    />
                  </div>
                ) : null}
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#161719]">
                  {vistaTicket}
                </pre>
              </div>
              <p className="mt-2 text-xs text-fg-muted">
                Los cambios aplican a las facturas nuevas al cobrar. Las reimpresiones usan el ticket
                guardado original.
              </p>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">Cargando configuración…</p>
        )}
        </Card>
      ) : null}

      {tab === "fiscal" ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="icon-chip">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <h2 className="card-title">Datos fiscales (Talonarios)</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Se incluyen en el reporte mensual de talonarios para la declaración.
            </p>
          </div>
        </div>

        {cfg ? (
          <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>RTN del negocio</Label>
              <Input
                value={cfg.fiscal_rtn}
                onChange={(e) => setCfg({ ...cfg, fiscal_rtn: e.target.value })}
              />
            </div>
            <div>
              <Label>CAI</Label>
              <Input
                value={cfg.fiscal_cai}
                onChange={(e) => setCfg({ ...cfg, fiscal_cai: e.target.value })}
              />
            </div>
            <div>
              <Label>Rango autorizado · desde</Label>
              <Input
                value={cfg.fiscal_rango_desde}
                onChange={(e) => setCfg({ ...cfg, fiscal_rango_desde: e.target.value })}
                placeholder="000-001-01-00000001"
                className="font-mono"
              />
            </div>
            <div>
              <Label>Rango autorizado · hasta</Label>
              <Input
                value={cfg.fiscal_rango_hasta}
                onChange={(e) => setCfg({ ...cfg, fiscal_rango_hasta: e.target.value })}
                placeholder="000-001-01-00000500"
                className="font-mono"
              />
            </div>
            <div>
              <Label>Fecha límite de emisión</Label>
              <DatePicker
                value={cfg.fiscal_fecha_limite}
                onChange={(v) => setCfg({ ...cfg, fiscal_fecha_limite: v })}
              />
            </div>
            <div>
              <Label>ISV (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={cfg.fiscal_isv}
                onChange={(e) => setCfg({ ...cfg, fiscal_isv: e.target.value })}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={cfg.fiscal_precios_con_isv === "1"}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    fiscal_precios_con_isv: e.target.checked ? "1" : "0",
                  })
                }
              />
              Los precios de venta incluyen ISV (se desglosa en el reporte)
            </label>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit">
                <Save className="h-4 w-4" />
                Guardar datos fiscales
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">Cargando configuración…</p>
        )}
        </Card>
      ) : null}


      <p className="mt-6 text-center text-xs text-fg-faint">
        AllCo ·{" "}
        <button
          type="button"
          onClick={() =>
            openUrl("https://allco.online/").catch(() =>
              window.open("https://allco.online/", "_blank", "noopener"),
            )
          }
          className="font-medium text-accent-fg hover:underline"
        >
          allco.online
        </button>
      </p>
    </div>
  );
}