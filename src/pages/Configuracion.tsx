import { useEffect, useState, type FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Github, Palette, RefreshCw, Save, Store } from "lucide-react";
import { api } from "@/lib/api";
import type { ConfigApp } from "@/lib/types";
import { AccentPicker, ThemeModePicker } from "@/components/ThemeControls";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const REPO_KEY = "allco-github-repo";

type UpdateState =
  | { kind: "available"; latest: string; url: string }
  | { kind: "current"; latest: string }
  | { kind: "error"; text: string }
  | null;

function normalizeRepo(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\/+$/, "");
}

function esMasNueva(candidata: string, actual: string) {
  const a = candidata.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const b = actual.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export function ConfigPage() {
  const [cfg, setCfg] = useState<ConfigApp | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const [repo, setRepo] = useState(() => localStorage.getItem(REPO_KEY) ?? "");
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateState>(null);

  useEffect(() => {
    api.obtenerConfig().then(setCfg).catch((e) => setError(String(e)));
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.0"));
  }, []);

  function cambiarRepo(value: string) {
    setRepo(value);
    localStorage.setItem(REPO_KEY, value);
    setUpdate(null);
  }

  async function buscarActualizacion() {
    const r = normalizeRepo(repo);
    if (!/^[^/\s]+\/[^/\s]+$/.test(r)) {
      setUpdate({
        kind: "error",
        text: "Escriba el repositorio como usuario/repositorio o pegue su URL de GitHub.",
      });
      return;
    }
    setChecking(true);
    setUpdate(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${r}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (res.status === 404) {
        setUpdate({
          kind: "error",
          text: "No se encontró el repositorio o todavía no tiene releases publicados.",
        });
        return;
      }
      if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (data.tag_name ?? "").replace(/^v/i, "").trim();
      if (!latest) {
        setUpdate({ kind: "error", text: "La última release no incluye un número de versión." });
        return;
      }
      if (esMasNueva(latest, version)) {
        setUpdate({
          kind: "available",
          latest,
          url: data.html_url ?? `https://github.com/${r}/releases`,
        });
      } else {
        setUpdate({ kind: "current", latest });
      }
    } catch (e) {
      setUpdate({ kind: "error", text: `No se pudo consultar GitHub: ${String(e)}` });
    } finally {
      setChecking(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    try {
      await api.guardarConfig(cfg);
      setMsg("Configuración guardada.");
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="page">
      <PageHeader title="Configuración" subtitle="Apariencia de la app y datos del negocio" />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_1fr]">
        <Card className="flex h-full flex-col p-5">
          <h2 className="card-title flex items-center gap-2">
            <Palette className="h-4 w-4 text-accent-fg" />
            Apariencia
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Se guarda en esta PC y aplica a todos los usuarios de la app.
          </p>

          <div className="mt-5">
            <Label>Tema</Label>
            <ThemeModePicker />
            <p className="mt-2 text-xs text-fg-muted">
              «Sistema» sigue el modo claro u oscuro de Windows.
            </p>
          </div>

          <div className="mt-5">
            <Label>Color de acento</Label>
            <AccentPicker />
            <p className="mt-2 text-xs text-fg-muted">
              Cambia botones, enlaces, selecciones y elementos destacados.
            </p>
          </div>

          <div className="mt-6 rounded-2xl bg-surface-2 p-4">
            <p className="section-title mb-3">Vista previa</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Botón principal</Button>
              <Button size="sm" variant="secondary">Secundario</Button>
              <Button size="sm" variant="outline">Contorno</Button>
            </div>
            <div className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent-fg">
              Así se ven los elementos destacados con este color.
            </div>
          </div>
        </Card>

        {cfg ? (
          <Card className="flex h-full flex-col p-5">
            <h2 className="card-title flex items-center gap-2">
              <Store className="h-4 w-4 text-accent-fg" />
              Negocio y operación
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Estos datos aparecen en el ticket y controlan las alertas del sistema.
            </p>
            <form onSubmit={save} className="mt-5 flex flex-1 flex-col">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nombre del negocio</Label>
                  <Input value={cfg.negocio_nombre} onChange={(e) => setCfg({ ...cfg, negocio_nombre: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Dirección (ticket)</Label>
                  <Input value={cfg.negocio_direccion} onChange={(e) => setCfg({ ...cfg, negocio_direccion: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Pie de ticket</Label>
                  <Input value={cfg.ticket_pie} onChange={(e) => setCfg({ ...cfg, ticket_pie: e.target.value })} />
                </div>
                <div>
                  <Label>Alerta de BD (MB)</Label>
                  <Input value={cfg.umbral_db_mb} onChange={(e) => setCfg({ ...cfg, umbral_db_mb: e.target.value })} />
                </div>
                <div>
                  <Label>Días máximos sin respaldo</Label>
                  <Input value={cfg.umbral_respaldo_dias} onChange={(e) => setCfg({ ...cfg, umbral_respaldo_dias: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={cfg.caja_puede_descuento === "1"}
                    onChange={(e) => setCfg({ ...cfg, caja_puede_descuento: e.target.checked ? "1" : "0" })}
                  />
                  Permitir descuentos al rol caja
                </label>
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
          <Card className="p-5">
            <p className="text-sm text-fg-muted">Cargando configuración…</p>
          </Card>
        )}
      </div>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <Github className="h-4 w-4 text-accent-fg" />
              Actualizaciones
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Consulta la última versión publicada en GitHub Releases.
            </p>
          </div>
          <Badge tone="accent">Versión instalada v{version || "0.1.0"}</Badge>
        </div>

        <div className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <Label>Repositorio de GitHub</Label>
            <Input
              value={repo}
              onChange={(e) => cambiarRepo(e.target.value)}
              placeholder="usuario/repositorio"
            />
            <p className="mt-1.5 text-xs text-fg-muted">
              Puede escribir <b className="text-fg">usuario/repositorio</b> o pegar la URL del repositorio.
            </p>
          </div>
          <Button onClick={buscarActualizacion} disabled={checking}>
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Buscando…" : "Buscar actualización"}
          </Button>
        </div>

        {update?.kind === "available" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ok-soft px-4 py-3">
            <p className="text-sm font-medium text-ok-fg">
              Hay una versión nueva disponible: <b>v{update.latest}</b>.
            </p>
            <Button size="sm" onClick={() => openUrl(update.url).catch(() => {})}>
              <Download className="h-4 w-4" />
              Abrir descarga
            </Button>
          </div>
        ) : null}
        {update?.kind === "current" ? (
          <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
            Está al día con la última versión publicada (<b className="text-fg">v{update.latest}</b>).
          </div>
        ) : null}
        {update?.kind === "error" ? (
          <Alert className="mb-0 mt-4" tone="danger">{update.text}</Alert>
        ) : null}
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
