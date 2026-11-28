import { useEffect, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeControls";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { rolLabel } from "@/lib/format";
import type { Usuario } from "@/lib/types";

function esperaTexto(segundos: number) {
  if (segundos >= 3600) {
    const h = Math.floor(segundos / 3600);
    const m = Math.ceil((segundos % 3600) / 60);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  if (segundos >= 60) {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return s > 0 ? `${m} min ${s} s` : `${m} min`;
  }
  return `${segundos} s`;
}

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [master, setMaster] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [resetting, setResetting] = useState(false);
  const [bloqueo, setBloqueo] = useState(0);
  const bloqueado = bloqueo > 0;

  useEffect(() => {
    api
      .usuariosLogin()
      .then((list) => {
        // El acceso de soporte (dev) siempre va de último en la lista.
        const ordenados = [...list].sort((a, b) => Number(a.dev) - Number(b.dev));
        setUsuarios(ordenados);
        const def = ordenados.find((u) => u.usuario === "admin") ?? ordenados[0];
        if (def) setUsuario(def.usuario);
      })
      .catch((e) => toast.error(`No se pudo cargar la lista de usuarios: ${e}`));
  }, []);

  useEffect(() => {
    setBloqueo(0);
    if (!usuario) return;
    let vigente = true;
    api
      .estadoLogin(usuario)
      .then((segundos) => {
        if (vigente) setBloqueo(segundos);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [usuario]);

  useEffect(() => {
    if (!bloqueado) return;
    const timer = window.setInterval(() => {
      setBloqueo((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [bloqueado]);

  function abrirSitio() {
    openUrl("https://allco.online/").catch(() => {
      window.open("https://allco.online/", "_blank", "noopener");
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (bloqueado) return;
    if (!usuario) {
      toast.error("Seleccione un usuario.");
      return;
    }
    setLoading(true);
    try {
      await login(usuario, password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      try {
        const segundos = await api.estadoLogin(usuario);
        if (segundos > 0) setBloqueo(segundos);
      } catch {
        // Si no se puede consultar, el backend igual bloquea.
      }
    } finally {
      setLoading(false);
    }
  }

  const seleccionado = usuarios.find((u) => u.usuario === usuario);
  const etiquetaUsuario = seleccionado?.nombre ?? usuario;

  function abrirReset() {
    setMaster("");
    setNueva("");
    setConfirmar("");
    setResetOpen(true);
  }

  async function restablecer() {
    if (!usuario) {
      toast.error("Seleccione el usuario que necesita el cambio.");
      return;
    }
    if (!master.trim()) {
      toast.error("Ingrese la contraseña maestra de soporte.");
      return;
    }
    if (nueva.trim().length < 6) {
      toast.error("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (nueva !== confirmar) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setResetting(true);
    try {
      await api.restablecerPassword(usuario, master.trim(), nueva.trim());
      toast.ok(`Contraseña de ${etiquetaUsuario} restablecida.`);
      setResetOpen(false);
      setMaster("");
      setNueva("");
      setConfirmar("");
      setPassword("");
      setBloqueo(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-sidebar p-5 sm:p-8">
      <div className="absolute inset-0 overflow-hidden">
        <img
          src="/login-bg.webp"
          alt=""
          aria-hidden
          className="h-full w-full scale-105 object-cover blur-[3px] brightness-[0.5]"
        />
      </div>
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="border border-border bg-surface text-fg hover:bg-hover" />
      </div>

      <div className="relative grid w-full max-w-5xl md:min-h-[560px] md:grid-cols-[1.08fr_0.92fr]">
        {/* Panel de marca */}
        <div className="relative hidden flex-col overflow-hidden rounded-l-3xl bg-sidebar p-8 text-sidebar-fg md:flex">
          <div className="relative flex items-center gap-3">
            <Logo framed={false} className="h-11 w-11" />
            <p className="text-lg font-bold leading-tight">AllCo</p>
          </div>

          <div className="relative my-auto max-w-sm py-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              ALLCO
            </p>
            <h1 className="mt-4 text-[2.5rem] font-bold leading-[1.08] tracking-tight">
              Tu negocio,
              <br />
              bajo control.
            </h1>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-sidebar-muted">
              Inventario, ventas y caja en un solo sistema. Sin depender de internet.
            </p>
            <div className="mt-8 h-px w-12 bg-accent" />
          </div>

          <div className="relative flex items-center justify-between border-t border-sidebar-border pt-5 text-xs text-sidebar-muted">
            <span>Sistema de escritorio</span>
            <button
              type="button"
              onClick={abrirSitio}
              className="font-medium text-accent transition-opacity hover:underline hover:opacity-80"
            >
              allco.online
            </button>
          </div>
        </div>

        {/* Formulario */}
        <div className="flex flex-col justify-center rounded-3xl bg-surface p-7 sm:p-10 md:rounded-l-none md:rounded-r-3xl">
          <div className="mb-8 md:hidden">
            <p className="text-lg font-bold leading-tight">AllCo</p>
            <p className="mt-1 text-sm text-fg-muted">Tu negocio, bajo control.</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
              <LogIn className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-fg">Iniciar sesión</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Seleccione su usuario e ingrese la contraseña.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="login-usuario" className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" />
                Usuario
              </Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-fg-faint" />
                <Select
                  id="login-usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  disabled={usuarios.length === 0}
                  aria-label="Usuario"
                  className="pl-10"
                >
                  {usuarios.length === 0 ? (
                    <option value="">Cargando usuarios…</option>
                  ) : (
                    usuarios.map((u) => (
                      <option
                        key={u.id}
                        value={u.usuario}
                        className={u.dev ? "italic text-fg-faint" : undefined}
                      >
                        {u.dev ? "Soporte AllCo" : rolLabel(u.rol)}
                      </option>
                    ))
                  )}
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="login-password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
                <Input
                  id="login-password"
                  type={verPassword ? "text" : "password"}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-10 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-faint outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={abrirReset}
                  className="text-xs font-semibold text-accent-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  ¿Olvidaste la contraseña?
                </button>
              </div>
              {bloqueado ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-2 flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger-fg"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Demasiados intentos. Intenta de nuevo en {esperaTexto(bloqueo)}.
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || usuarios.length === 0 || bloqueado}
            >
              <LogIn className="h-4 w-4" />
              {bloqueado ? `Espera ${esperaTexto(bloqueo)}` : loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-fg-faint md:hidden">
            AllCo ·{" "}
            <button type="button" onClick={abrirSitio} className="font-medium text-accent-fg hover:underline">
              allco.online
            </button>
          </p>
        </div>
      </div>

      <Modal
        open={resetOpen}
        title="Restablecer contraseña"
        subtitle={usuario ? `Usuario: ${etiquetaUsuario}` : undefined}
        onClose={() => setResetOpen(false)}
        small
      >
        <p className="text-sm text-fg-muted">
          Solo el equipo de soporte de AllCo puede hacer este cambio. Ingrese la
          contraseña maestra y defina la nueva contraseña del usuario.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void restablecer();
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <Label>Contraseña maestra de soporte</Label>
            <Input
              type="password"
              autoComplete="off"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label>Nueva contraseña</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
          </div>
          <div>
            <Label>Confirmar nueva contraseña</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={resetting}>
              {resetting ? "Restableciendo…" : "Restablecer contraseña"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
