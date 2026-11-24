import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, KeyRound, RefreshCw, Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { Licencia } from "@/lib/types";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const VACIA: Licencia = {
  titular: "",
  plan: "",
  inicio: "",
  expira: "",
  notas: "",
};

function fechaCorta(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function diasRestantes(expira: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expira)) return null;
  const fin = new Date(`${expira}T23:59:59`);
  return Math.ceil((fin.getTime() - Date.now()) / 86_400_000);
}

export function LicenciaPage() {
  const toast = useToast();
  const { user } = useAuth();
  const esSoporte = !!user?.dev;

  const [lic, setLic] = useState<Licencia>(VACIA);
  const [form, setForm] = useState<Licencia>(VACIA);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const actual = await api.obtenerLicencia();
      setLic(actual);
      setForm(actual);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  const dias = useMemo(() => diasRestantes(lic.expira), [lic.expira]);
  const estado = !lic.expira
    ? { etiqueta: "Sin configurar", tone: "default" as const, icono: ShieldAlert, color: "text-fg-muted" }
    : dias != null && dias < 0
      ? { etiqueta: "Vencida", tone: "danger" as const, icono: ShieldAlert, color: "text-danger-fg" }
      : dias != null && dias <= 30
        ? { etiqueta: "Por vencer", tone: "warn" as const, icono: CalendarClock, color: "text-warn-fg" }
        : { etiqueta: "Activa", tone: "ok" as const, icono: ShieldCheck, color: "text-ok-fg" };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!esSoporte) return;
    if (!form.expira) {
      toast.error("Indique la fecha de expiración.");
      return;
    }
    if (form.inicio && form.inicio > form.expira) {
      toast.error("La fecha de inicio no puede ser posterior a la de expiración.");
      return;
    }
    setGuardando(true);
    try {
      await api.guardarLicencia(form);
      setLic(form);
      toast.ok("Licencia guardada.");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setGuardando(false);
    }
  }

  const IconoEstado = estado.icono;

  return (
    <div className="page">
      <PageHero
        title="Licencia"
        subtitle="Vigencia de la licencia de AllCo"
        description="Consulta la fecha de vencimiento de la licencia. Solo el equipo de soporte de AllCo puede configurarla o renovarla."
        icon={KeyRound}
      />

      {cargando ? (
        <Card className="p-6">
          <p className="text-sm text-fg-muted">Cargando licencia…</p>
        </Card>
      ) : !lic.expira ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="card-title">Sin licencia configurada</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {esSoporte
                  ? "Registra la vigencia de la licencia en el formulario de abajo."
                  : "Contacta a soporte AllCo para activar o renovar la licencia."}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          className={cn(
            "p-6",
            estado.tone === "danger" && "border-danger/40",
            estado.tone === "warn" && "border-warn/40",
            estado.tone === "ok" && "border-ok/40",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2",
                  estado.color,
                )}
              >
                <IconoEstado className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <Badge tone={estado.tone}>{estado.etiqueta}</Badge>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-fg">
                  Vence el {fechaCorta(lic.expira)}
                </h2>
                {esSoporte ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    {lic.titular || "Sin titular"} · {lic.plan || "Sin plan"}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-fg-muted">
                    Contacta a soporte AllCo para renovar la licencia.
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "text-4xl font-bold tabular-nums leading-none",
                  estado.color,
                )}
              >
                {dias == null ? "—" : Math.abs(dias)}
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                {dias == null
                  ? "Sin fecha"
                  : dias < 0
                    ? "días vencida"
                    : dias === 0
                      ? "vence hoy"
                      : "días restantes"}
              </p>
            </div>
          </div>

          {esSoporte ? (
            <>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                    Inicio
                  </p>
                  <p className="mt-1 text-sm font-medium text-fg">
                    {fechaCorta(lic.inicio)}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                    Expiración
                  </p>
                  <p className="mt-1 text-sm font-medium text-fg">
                    {fechaCorta(lic.expira)}
                  </p>
                </div>
              </div>
              {lic.notas.trim() ? (
                <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">
                  {lic.notas}
                </p>
              ) : null}
            </>
          ) : null}
        </Card>
      )}

      {esSoporte ? (
        <Card className="mt-5 p-6">
          <h2 className="card-title flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-accent-fg" />
            Configurar licencia
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Solo el usuario de soporte AllCo puede modificar estos datos.
          </p>

          <form onSubmit={guardar} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Titular</Label>
              <Input
                value={form.titular}
                onChange={(e) => setForm({ ...form, titular: e.target.value })}
                placeholder="Nombre del negocio o cliente"
              />
            </div>
            <div>
              <Label>Plan</Label>
              <Input
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                placeholder="Ej. Básico, Pro, Anual"
              />
            </div>
            <div>
              <Label>Inicio</Label>
              <DatePicker
                value={form.inicio}
                onChange={(v) => setForm({ ...form, inicio: v })}
              />
            </div>
            <div>
              <Label>Expiración</Label>
              <DatePicker
                value={form.expira}
                onChange={(v) => setForm({ ...form, expira: v })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas internas</Label>
              <Textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Ej. Renovación anual, contacto, referencia de pago…"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void cargar()}
                disabled={cargando || guardando}
              >
                <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
                Recargar
              </Button>
              <Button type="submit" disabled={guardando}>
                <Save className="h-4 w-4" />
                {guardando ? "Guardando…" : "Guardar licencia"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
