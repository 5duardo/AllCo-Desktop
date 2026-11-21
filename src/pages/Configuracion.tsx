import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Download, Palette, Printer, RefreshCw, Save, Settings, Store, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { ConfigApp } from "@/lib/types";
import { BrandLogo } from "@/components/BrandLogo";
import { AccentPicker, ThemeModePicker } from "@/components/ThemeControls";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

export function ConfigPage() {
  const [cfg, setCfg] = useState<ConfigApp | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    api.obtenerConfig().then(setCfg).catch((e) => setError(String(e)));
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.0"));
  }, []);

  async function buscarActualizacion() {
    setChecking(true);
    setUpdate(null);
    setUpdateMsg("");
    setUpdateError("");
    setProgress("");
    try {
      const disponible = await check();
      if (disponible) {
        setUpdate(disponible);
        setUpdateMsg(`Nueva versión v${disponible.version} disponible.`);
      } else {
        setUpdateMsg(`Está al día con la última versión (v${version || "0.1.0"}).`);
      }
    } catch (e) {
      console.error(e);
      setUpdateError(
        "No se pudo buscar actualizaciones. Revise la conexión a internet e intente de nuevo.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function instalarActualizacion() {
    if (!update) return;
    setInstalling(true);
    setUpdateError("");
    setProgress("Descargando…");
    try {
      let total = 0;
      let descargado = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          descargado += event.data.chunkLength;
          if (total > 0) {
            setProgress(`Descargando ${Math.round((descargado / total) * 100)}%…`);
          }
        } else if (event.event === "Finished") {
          setProgress("Instalando…");
        }
      });
      setProgress("Actualización instalada. Reiniciando…");
      await relaunch();
    } catch (e) {
      console.error(e);
      setUpdateError("No se pudo instalar la actualización. Intente de nuevo.");
      setProgress("");
    } finally {
      setInstalling(false);
    }
  }

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
      setError("El logo debe ser una imagen PNG, JPG, WebP o SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("El logo no debe pesar más de 5 MB.");
      return;
    }
    try {
      const dataUrl = await leerLogo(file);
      setCfg((c) => (c ? { ...c, negocio_logo: dataUrl } : c));
      setError("");
    } catch {
      setError("No se pudo leer la imagen del logo.");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    try {
      await api.guardarConfig(cfg);
      window.dispatchEvent(new Event("allco-brand"));
      setMsg("Configuración guardada.");
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  const nombreMarca = cfg?.negocio_nombre.trim() || "AllCo";

  type TicketFlag =
    | "ticket_mostrar_direccion"
    | "ticket_mostrar_fecha"
    | "ticket_mostrar_cajero"
    | "ticket_mostrar_cliente"
    | "ticket_mostrar_pago"
    | "ticket_mostrar_recibido";

  const elementosTicket: { key: TicketFlag; label: string }[] = [
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
    const lineas = [cfg.negocio_nombre];
    if (ver(cfg.ticket_mostrar_direccion) && cfg.negocio_direccion.trim()) {
      lineas.push(cfg.negocio_direccion);
    }
    cfg.ticket_encabezado.split("\n").forEach((l) => {
      if (l.trim()) lineas.push(l);
    });
    lineas.push("--------------------------------", "Factura #12");
    if (ver(cfg.ticket_mostrar_fecha)) lineas.push("21/11/2026 10:30:00");
    if (ver(cfg.ticket_mostrar_cajero)) lineas.push("Cajero: Administrador");
    if (ver(cfg.ticket_mostrar_cliente)) lineas.push("Cliente: Cliente de ejemplo 1");
    lineas.push(
      "--------------------------------",
      "2 x Llanta 195/65R15   L 2,400.00",
      "1 x Lavado básico      L 250.00",
      "--------------------------------",
      "TOTAL                  L 2,650.00",
    );
    if (ver(cfg.ticket_mostrar_pago)) lineas.push("Pago: efectivo");
    if (ver(cfg.ticket_mostrar_recibido)) {
      lineas.push("Recibido               L 3,000.00", "Cambio                 L 350.00");
    }
    lineas.push("--------------------------------", cfg.ticket_pie);
    return lineas.join("\n");
  })();

  return (
    <div className="page">
      <PageHero
        title="Configuración"
        subtitle="Marca del negocio, apariencia y actualizaciones"
        description="Ajusta el logo y nombre del negocio, el tema visual de la app y la búsqueda de actualizaciones."
        icon={Settings}
        badge="Ajustes"
      />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        {cfg ? (
          <Card className="flex h-full flex-col p-6">
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
        )}

        <Card className="flex h-full flex-col p-6">
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

          <div className="mt-auto pt-6">
            <p className="section-title mb-2">Vista previa</p>
            <div className="rounded-xl bg-bg p-4">
              <div className="rounded-xl bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-fg">Total a cobrar</p>
                  <Badge tone="accent">Factura #12</Badge>
                </div>
                <p className="mt-1 text-3xl font-bold tabular-nums text-fg">L 1,250.00</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm">Cobrar</Button>
                  <Button size="sm" variant="secondary">Cancelar</Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-6">
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
                <Label>Encabezado adicional</Label>
                <Textarea
                  value={cfg.ticket_encabezado}
                  onChange={(e) => setCfg({ ...cfg, ticket_encabezado: e.target.value })}
                  placeholder="Ej. Llantera y Car Wash · Tel. 9256-1515"
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
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#111214] p-4 font-mono text-xs leading-relaxed text-[#d6d9de]">
                {vistaTicket}
              </pre>
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

      <Card className="mt-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="icon-chip">
              <Download className="h-5 w-5" />
            </span>
            <div>
              <h2 className="card-title">Actualizaciones</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Busca, descarga e instala la última versión disponible.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Versión instalada v{version || "0.1.0"}</Badge>
            <Button
              variant="secondary"
              onClick={buscarActualizacion}
              disabled={checking || installing}
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Buscando…" : "Buscar actualización"}
            </Button>
            {update ? (
              <Button onClick={instalarActualizacion} disabled={installing}>
                <Download className="h-4 w-4" />
                {installing ? progress || "Instalando…" : `Instalar v${update.version}`}
              </Button>
            ) : null}
          </div>
        </div>

        {updateMsg ? (
          <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
            {updateMsg}
          </div>
        ) : null}
        {update?.body ? (
          <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
            <p className="mb-1 font-semibold text-fg">Novedades de v{update.version}</p>
            <p className="whitespace-pre-line">{update.body}</p>
          </div>
        ) : null}
        {update && installing ? (
          <p className="mt-3 text-sm font-medium text-accent-fg">{progress}</p>
        ) : null}
        {updateError ? <Alert className="mb-0 mt-4">{updateError}</Alert> : null}

        <p className="mt-4 text-xs text-fg-faint">
          Requiere conexión a internet. Si no hay una versión nueva, la app sigue funcionando sin cambios.
        </p>
      </Card>

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
